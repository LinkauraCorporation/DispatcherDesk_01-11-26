-- ====================================================================
-- DispatcherDesk Migration: Billing Period-Scoped Truck Activation (Phase 1 Correction)
-- Version: 1.0.28
-- File: supabase/migrations/20260907000002_billing_period_scoped_activation.sql
-- Description:
-- 1. Drops lifetime constraint uq_truck_activation_org_truck on public.truck_activation_history
-- 2. Establishes period-scoped unique constraint uq_truck_activation_org_period_truck:
--    UNIQUE (organization_id, billing_period_key, truck_id)
-- 3. Updates record_truck_operational_activation() trigger function:
--    - For trial: preserves billing_period_key = 'trial' (permanent trial allocation)
--    - For active paid subscriptions: derives deterministic billing period key from
--      subscriptions.current_period_start and subscriptions.current_period_end (YYYYMMDD_YYYYMMDD)
--    - Checks existence using (organization_id, billing_period_key, truck_id)
--    - Upserts using ON CONFLICT (organization_id, billing_period_key, truck_id) DO NOTHING
-- 4. Preserves all existing Phase 1 trial rows and security invariants.
-- ====================================================================

-- 1. Update unique constraint on public.truck_activation_history
ALTER TABLE public.truck_activation_history
  DROP CONSTRAINT IF EXISTS uq_truck_activation_org_truck;

ALTER TABLE public.truck_activation_history
  DROP CONSTRAINT IF EXISTS uq_truck_activation_org_period_truck;

ALTER TABLE public.truck_activation_history
  ADD CONSTRAINT uq_truck_activation_org_period_truck
  UNIQUE (organization_id, billing_period_key, truck_id);

-- Performance index for period-scoped truck lookup
CREATE INDEX IF NOT EXISTS idx_truck_activation_org_period_truck
  ON public.truck_activation_history(organization_id, billing_period_key, truck_id);

-- 2. Update record_truck_operational_activation() trigger function
CREATE OR REPLACE FUNCTION public.record_truck_operational_activation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_sub RECORD;
  v_billing_period_key TEXT := 'trial';
BEGIN
  -- Only evaluate when truck_id is assigned and pipeline_status is in qualifying operational states:
  -- 'booked', 'in_transit', 'delivered', 'invoiced', 'paid'
  IF NEW.truck_id IS NOT NULL AND NEW.pipeline_status IN ('booked', 'in_transit', 'delivered', 'invoiced', 'paid') THEN
    -- Retrieve current subscription state for the organization
    SELECT 
      s.plan,
      s.billing_state,
      s.current_period_start,
      s.current_period_end
    INTO v_sub
    FROM public.subscriptions s
    WHERE s.organization_id = NEW.organization_id;

    -- Determine deterministic period identity
    IF v_sub.billing_state = 'active' AND v_sub.current_period_start IS NOT NULL AND v_sub.current_period_end IS NOT NULL THEN
      -- Deterministic subscription billing period key (UTC boundaries)
      v_billing_period_key := TO_CHAR(v_sub.current_period_start AT TIME ZONE 'UTC', 'YYYYMMDD') 
        || '_' 
        || TO_CHAR(v_sub.current_period_end AT TIME ZONE 'UTC', 'YYYYMMDD');
    ELSE
      -- Trialing, trial_expired, or default unconfigured state
      v_billing_period_key := 'trial';
    END IF;

    -- Check if already activated in this specific billing period
    IF NOT EXISTS (
      SELECT 1
      FROM public.truck_activation_history
      WHERE organization_id = NEW.organization_id
        AND billing_period_key = v_billing_period_key
        AND truck_id = NEW.truck_id
    ) THEN
      -- Insert authoritative activation record for this period
      INSERT INTO public.truck_activation_history (
        organization_id,
        truck_id,
        first_qualifying_load_id,
        activated_at,
        billing_period_key,
        created_at
      ) VALUES (
        NEW.organization_id,
        NEW.truck_id,
        NEW.id,
        NOW(),
        v_billing_period_key,
        NOW()
      )
      ON CONFLICT (organization_id, billing_period_key, truck_id) DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Ensure execution permissions remain strictly revoked from unprivileged roles
REVOKE ALL ON FUNCTION public.record_truck_operational_activation() FROM PUBLIC, anon, authenticated;
