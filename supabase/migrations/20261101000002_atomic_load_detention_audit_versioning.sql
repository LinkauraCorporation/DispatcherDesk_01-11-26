-- ====================================================================
-- DispatcherDesk Migration: Atomic Load Detention Audit Versioning
-- Version: 1.0.24
-- File: supabase/migrations/20261101000002_atomic_load_detention_audit_versioning.sql
-- Description:
-- 1. Verifies that no duplicate (load_id, audit_version) rows exist before
--    applying constraints, preventing accidental data corruption or loss.
-- 2. Enforces a UNIQUE constraint on (load_id, audit_version) in
--    public.load_detention_audits to guarantee audit version uniqueness.
-- 3. Implements public.save_load_detention_audit_atomic RPC function:
--    - Acquires transaction-scoped advisory lock on hashtext(load_id)
--    - Atomically computes COALESCE(MAX(audit_version), 0) + 1
--    - Inserts the new audit record within the locked transaction
--    - Preserves employee load-access isolation and organization security
-- ====================================================================

-- --------------------------------------------------------------------
-- 1. Pre-validation: Verify no duplicate (load_id, audit_version) exist
-- --------------------------------------------------------------------
DO $$
DECLARE
  v_dup_count INT := 0;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'load_detention_audits'
  ) THEN
    SELECT COUNT(*) INTO v_dup_count
    FROM (
      SELECT load_id, audit_version, COUNT(*)
      FROM public.load_detention_audits
      GROUP BY load_id, audit_version
      HAVING COUNT(*) > 1
    ) dups;

    IF v_dup_count > 0 THEN
      RAISE EXCEPTION 'Cannot add UNIQUE constraint: % duplicate (load_id, audit_version) groups found in public.load_detention_audits. Manual review required.', v_dup_count;
    END IF;
  END IF;
END $$;

-- --------------------------------------------------------------------
-- 2. Enforce UNIQUE constraint on (load_id, audit_version)
-- --------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'load_detention_audits'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint 
      WHERE conname = 'uq_load_detention_audits_load_version'
    ) THEN
      ALTER TABLE public.load_detention_audits
        ADD CONSTRAINT uq_load_detention_audits_load_version UNIQUE (load_id, audit_version);
    END IF;
  END IF;
END $$;

-- --------------------------------------------------------------------
-- 3. Atomic RPC Function: save_load_detention_audit_atomic
-- --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_load_detention_audit_atomic(
  p_audit_data JSONB
)
RETURNS public.load_detention_audits
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID;
  v_org_id UUID;
  v_load_id UUID;
  v_next_version INT;
  v_explicit_version INT;
  v_inserted_audit public.load_detention_audits;
  v_is_service_role BOOLEAN;
BEGIN
  v_caller_id := auth.uid();
  v_is_service_role := (current_setting('request.jwt.claim.role', true) = 'service_role')
                       OR (current_user = 'service_role')
                       OR (current_user = 'postgres');

  -- Fail closed: Anonymous callers are strictly prohibited
  IF v_caller_id IS NULL AND NOT v_is_service_role THEN
    RAISE EXCEPTION 'Authentication required to save load detention audits.';
  END IF;

  v_org_id := (p_audit_data->>'organization_id')::UUID;
  v_load_id := (p_audit_data->>'load_id')::UUID;

  IF v_org_id IS NULL OR v_load_id IS NULL THEN
    RAISE EXCEPTION 'organization_id and load_id are required in audit payload';
  END IF;

  -- Verify access if caller is an authenticated user (service_role bypasses)
  IF NOT v_is_service_role THEN
    IF NOT (
      v_org_id IN (SELECT public.get_user_organizations())
      AND (
        public.get_user_org_role(v_org_id) = 'owner_admin'
        OR (
          public.get_user_org_role(v_org_id) IN ('dispatcher', 'staff')
          AND public.user_has_load_access(v_load_id, v_caller_id)
        )
      )
    ) THEN
      RAISE EXCEPTION 'Unauthorized: User does not have permission to insert audits for this load';
    END IF;
  END IF;

  -- 1. Acquire transaction-level advisory lock on the specific load_id
  -- This strictly serializes concurrent audit inserts for the same load across all connections
  PERFORM pg_advisory_xact_lock(hashtext(v_load_id::text));

  -- 2. Determine version: either explicitly provided (> 0) or atomically incremented
  v_explicit_version := (p_audit_data->>'audit_version')::INT;
  IF v_explicit_version IS NOT NULL AND v_explicit_version > 0 THEN
    v_next_version := v_explicit_version;
  ELSE
    SELECT COALESCE(MAX(audit_version), 0) + 1
    INTO v_next_version
    FROM public.load_detention_audits
    WHERE load_id = v_load_id;
  END IF;

  -- 3. Insert the new audit record with the atomic version
  INSERT INTO public.load_detention_audits (
    organization_id,
    load_id,
    detention_record_id,
    audit_version,
    audit_status,
    overall_confidence,
    requires_human_review,
    pickup_status,
    pickup_appointment_time,
    pickup_arrival_time,
    pickup_departure_time,
    pickup_detention_start,
    pickup_detention_end,
    pickup_free_time_hours,
    pickup_billable_hours,
    pickup_hourly_rate,
    pickup_verified_amount,
    delivery_status,
    delivery_appointment_time,
    delivery_arrival_time,
    delivery_departure_time,
    delivery_detention_start,
    delivery_detention_end,
    delivery_free_time_hours,
    delivery_billable_hours,
    delivery_hourly_rate,
    delivery_verified_amount,
    total_verified_hours,
    total_verified_amount,
    evidence,
    discrepancies,
    missing_evidence,
    reasoning_summary,
    human_review_status,
    human_reviewed_by,
    human_reviewed_by_name,
    human_reviewed_at,
    human_override_notes,
    created_by
  ) VALUES (
    v_org_id,
    v_load_id,
    (p_audit_data->>'detention_record_id')::UUID,
    v_next_version,
    p_audit_data->>'audit_status',
    COALESCE((p_audit_data->>'overall_confidence')::NUMERIC, 0.00),
    COALESCE((p_audit_data->>'requires_human_review')::BOOLEAN, false),
    p_audit_data->>'pickup_status',
    (p_audit_data->>'pickup_appointment_time')::TIMESTAMPTZ,
    (p_audit_data->>'pickup_arrival_time')::TIMESTAMPTZ,
    (p_audit_data->>'pickup_departure_time')::TIMESTAMPTZ,
    (p_audit_data->>'pickup_detention_start')::TIMESTAMPTZ,
    (p_audit_data->>'pickup_detention_end')::TIMESTAMPTZ,
    COALESCE((p_audit_data->>'pickup_free_time_hours')::NUMERIC, 2.00),
    COALESCE((p_audit_data->>'pickup_billable_hours')::NUMERIC, 0.00),
    COALESCE((p_audit_data->>'pickup_hourly_rate')::NUMERIC, 75.00),
    COALESCE((p_audit_data->>'pickup_verified_amount')::NUMERIC, 0.00),
    p_audit_data->>'delivery_status',
    (p_audit_data->>'delivery_appointment_time')::TIMESTAMPTZ,
    (p_audit_data->>'delivery_arrival_time')::TIMESTAMPTZ,
    (p_audit_data->>'delivery_departure_time')::TIMESTAMPTZ,
    (p_audit_data->>'delivery_detention_start')::TIMESTAMPTZ,
    (p_audit_data->>'delivery_detention_end')::TIMESTAMPTZ,
    COALESCE((p_audit_data->>'delivery_free_time_hours')::NUMERIC, 2.00),
    COALESCE((p_audit_data->>'delivery_billable_hours')::NUMERIC, 0.00),
    COALESCE((p_audit_data->>'delivery_hourly_rate')::NUMERIC, 75.00),
    COALESCE((p_audit_data->>'delivery_verified_amount')::NUMERIC, 0.00),
    COALESCE((p_audit_data->>'total_verified_hours')::NUMERIC, 0.00),
    COALESCE((p_audit_data->>'total_verified_amount')::NUMERIC, 0.00),
    COALESCE((p_audit_data->'evidence'), '[]'::jsonb),
    COALESCE((p_audit_data->'discrepancies'), '[]'::jsonb),
    COALESCE((p_audit_data->'missing_evidence'), '[]'::jsonb),
    COALESCE(p_audit_data->>'reasoning_summary', ''),
    COALESCE(p_audit_data->>'human_review_status', 'pending'),
    (p_audit_data->>'human_reviewed_by')::UUID,
    p_audit_data->>'human_reviewed_by_name',
    (p_audit_data->>'human_reviewed_at')::TIMESTAMPTZ,
    p_audit_data->>'human_override_notes',
    COALESCE((p_audit_data->>'created_by')::UUID, v_caller_id)
  )
  RETURNING * INTO v_inserted_audit;

  RETURN v_inserted_audit;
END;
$$;

-- Grant execution permissions
GRANT EXECUTE ON FUNCTION public.save_load_detention_audit_atomic(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_load_detention_audit_atomic(JSONB) TO service_role;
