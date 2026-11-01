-- ====================================================================
-- DispatcherDesk Migration: Driver Status Hardening & Assignment Integrity
-- Migration Object 1 (Approved Forensic Audit)
-- Version: 1.0.18
-- File: supabase/migrations/20260905000001_driver_status_assignment_hardening.sql
-- Description:
-- 1. Updates drivers.status CHECK constraint to include ('available', 'on_load', 'off_duty', 'inactive')
-- 2. Hardens assign_load_dispatch RPC:
--    a. Validates new driver status is NOT 'inactive' before assignment
--    b. When unassigning or replacing an old driver, preserves 'inactive' status without auto-reactivation
-- 3. Preserves all existing S6.4 load lifecycle, operational write access, and tenant protections
-- ====================================================================

-- --------------------------------------------------------------------
-- A. Driver status constraint hardening
-- --------------------------------------------------------------------
DO $$
DECLARE
  v_con RECORD;
BEGIN
  FOR v_con IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.drivers'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.drivers DROP CONSTRAINT IF EXISTS %I', v_con.conname);
  END LOOP;
END $$;

ALTER TABLE public.drivers
  ADD CONSTRAINT drivers_status_check
  CHECK (status IN ('available', 'on_load', 'off_duty', 'inactive'));

-- --------------------------------------------------------------------
-- B. Harden public.assign_load_dispatch
-- --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assign_load_dispatch(
  p_organization_id UUID,
  p_load_id UUID,
  p_truck_id UUID DEFAULT NULL,
  p_driver_id UUID DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID;
  v_load RECORD;
  v_truck RECORD;
  v_driver RECORD;
  v_old_driver_id UUID;
  v_result JSONB;
BEGIN
  -- 1. Authentication check
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  -- 2. Authorization check (preserves existing operational write access helper)
  IF NOT public.has_operational_write_access(p_organization_id) THEN
    RAISE EXCEPTION 'Unauthorized: Operational write access required to assign dispatch resources.';
  END IF;

  -- 3. Row lock on Load to prevent concurrent race conditions
  SELECT * INTO v_load
  FROM public.loads
  WHERE id = p_load_id AND organization_id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Load not found in specified organization.';
  END IF;

  v_old_driver_id := v_load.driver_id;

  -- Row lock on Truck (if provided)
  IF p_truck_id IS NOT NULL THEN
    SELECT * INTO v_truck
    FROM public.trucks
    WHERE id = p_truck_id AND organization_id = p_organization_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Truck not found in specified organization.';
    END IF;
  END IF;

  -- Row lock on Driver (if provided)
  IF p_driver_id IS NOT NULL THEN
    SELECT * INTO v_driver
    FROM public.drivers
    WHERE id = p_driver_id AND organization_id = p_organization_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Driver not found in specified organization.';
    END IF;

    -- Inactive Driver Check: validation before assignment is committed
    IF v_driver.status = 'inactive' THEN
      RAISE EXCEPTION 'Cannot assign load to an inactive driver profile';
    END IF;
  END IF;

  -- When an old driver is being unassigned/replaced, preserve inactive status:
  IF v_old_driver_id IS NOT NULL AND (p_driver_id IS NULL OR p_driver_id <> v_old_driver_id) THEN
    UPDATE public.drivers
    SET status = CASE
      WHEN status = 'inactive' THEN 'inactive'
      ELSE 'available'
    END,
    updated_at = NOW()
    WHERE id = v_old_driver_id
      AND organization_id = p_organization_id;
  END IF;

  -- 4. Perform Update (triggers trg_validate_load_lifecycle with locks active)
  UPDATE public.loads
  SET 
    truck_id = p_truck_id,
    driver_id = p_driver_id,
    updated_at = NOW()
  WHERE id = p_load_id AND organization_id = p_organization_id;

  -- 5. Record Activity Note for assignment change (note_type = 'assignment_change')
  IF (v_load.truck_id IS DISTINCT FROM p_truck_id) OR (v_load.driver_id IS DISTINCT FROM p_driver_id) THEN
    INSERT INTO public.activity_notes (
      organization_id,
      load_id,
      author_id,
      author_name,
      note_type,
      content,
      metadata
    ) VALUES (
      p_organization_id,
      p_load_id,
      v_caller_id,
      'System Dispatcher',
      'assignment_change',
      format('Dispatch assignment updated. Truck: %s -> %s. Driver: %s -> %s.%s',
        COALESCE(v_load.truck_id::text, 'None'), COALESCE(p_truck_id::text, 'None'),
        COALESCE(v_load.driver_id::text, 'None'), COALESCE(p_driver_id::text, 'None'),
        CASE WHEN p_notes IS NOT NULL AND TRIM(p_notes) <> '' THEN ' ' || p_notes ELSE '' END
      ),
      jsonb_build_object(
        'previous_truck_id', v_load.truck_id,
        'new_truck_id', p_truck_id,
        'previous_driver_id', v_load.driver_id,
        'new_driver_id', p_driver_id
      )
    );
  END IF;

  -- 6. Return updated record
  SELECT to_jsonb(l) INTO v_result
  FROM public.loads l
  WHERE l.id = p_load_id;

  RETURN v_result;
END;
$$;

-- Grant execution to authenticated users
GRANT EXECUTE ON FUNCTION public.assign_load_dispatch(UUID, UUID, UUID, UUID, TEXT) TO authenticated;
