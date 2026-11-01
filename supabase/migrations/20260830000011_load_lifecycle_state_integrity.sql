-- ====================================================================
-- DispatcherDesk Migration: Load Lifecycle & State Integrity Hardening (S6.1)
-- Version: 1.0.11
-- File: supabase/migrations/20260830000011_load_lifecycle_state_integrity.sql
-- Description:
-- 1. Enforces tenant-scoped case-insensitive uniqueness on load numbers.
-- 2. Adds check constraints for non-negative financial rates, expenses, and mileage.
-- 3. Enforces route temporal integrity (delivery_datetime >= pickup_datetime).
-- 4. Establishes state machine transition and carrier-equipment consistency trigger.
-- 5. Implements concurrency-safe transition_load_status RPC with row-level locking.
-- ====================================================================

-- 1. Unique Load Number Index per Tenant (Case-Insensitive & Trimmed)
CREATE UNIQUE INDEX IF NOT EXISTS idx_loads_org_load_number_upper 
  ON public.loads (organization_id, UPPER(TRIM(load_number)));

-- 2. Financial, Mileage and Route Temporal Integrity Check Constraints
DO $$
BEGIN
  -- chk_loads_rate_non_negative
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_loads_rate_non_negative'
  ) THEN
    ALTER TABLE public.loads
      ADD CONSTRAINT chk_loads_rate_non_negative CHECK (rate >= 0);
  END IF;

  -- chk_loads_loaded_miles_non_negative
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_loads_loaded_miles_non_negative'
  ) THEN
    ALTER TABLE public.loads
      ADD CONSTRAINT chk_loads_loaded_miles_non_negative CHECK (loaded_miles >= 0);
  END IF;

  -- chk_loads_deadhead_miles_non_negative
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_loads_deadhead_miles_non_negative'
  ) THEN
    ALTER TABLE public.loads
      ADD CONSTRAINT chk_loads_deadhead_miles_non_negative CHECK (deadhead_miles >= 0);
  END IF;

  -- chk_loads_fuel_expense_non_negative
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_loads_fuel_expense_non_negative'
  ) THEN
    ALTER TABLE public.loads
      ADD CONSTRAINT chk_loads_fuel_expense_non_negative CHECK (fuel_expense >= 0);
  END IF;

  -- chk_loads_driver_pay_non_negative
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_loads_driver_pay_non_negative'
  ) THEN
    ALTER TABLE public.loads
      ADD CONSTRAINT chk_loads_driver_pay_non_negative CHECK (driver_pay >= 0);
  END IF;

  -- chk_loads_other_expenses_non_negative
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_loads_other_expenses_non_negative'
  ) THEN
    ALTER TABLE public.loads
      ADD CONSTRAINT chk_loads_other_expenses_non_negative CHECK (other_expenses >= 0);
  END IF;

  -- chk_loads_weight_lbs_non_negative
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_loads_weight_lbs_non_negative'
  ) THEN
    ALTER TABLE public.loads
      ADD CONSTRAINT chk_loads_weight_lbs_non_negative CHECK (weight_lbs IS NULL OR weight_lbs >= 0);
  END IF;

  -- chk_loads_delivery_after_pickup
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_loads_delivery_after_pickup'
  ) THEN
    ALTER TABLE public.loads
      ADD CONSTRAINT chk_loads_delivery_after_pickup CHECK (
        delivery_datetime IS NULL OR pickup_datetime IS NULL OR delivery_datetime >= pickup_datetime
      );
  END IF;
END;
$$;

-- 3. Load Lifecycle & Entity Integrity Trigger Function
CREATE OR REPLACE FUNCTION public.enforce_load_lifecycle_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_truck_client_id UUID;
  v_driver_client_id UUID;
BEGIN
  -- A. Ensure Load Number is non-empty
  IF NEW.load_number IS NULL OR TRIM(NEW.load_number) = '' THEN
    RAISE EXCEPTION 'Validation Error: load_number cannot be empty.';
  END IF;

  -- B. Carrier-Equipment Alignment Verification (Truck)
  IF NEW.truck_id IS NOT NULL AND NEW.client_id IS NOT NULL THEN
    SELECT client_id INTO v_truck_client_id
    FROM public.trucks
    WHERE id = NEW.truck_id AND organization_id = NEW.organization_id;

    IF v_truck_client_id IS NOT NULL AND v_truck_client_id <> NEW.client_id THEN
      RAISE EXCEPTION 'Integrity Error: Assigned truck (ID: %) belongs to client % but load is assigned to client %.',
        NEW.truck_id, v_truck_client_id, NEW.client_id;
    END IF;
  END IF;

  -- C. Carrier-Equipment Alignment Verification (Driver)
  IF NEW.driver_id IS NOT NULL AND NEW.client_id IS NOT NULL THEN
    SELECT client_id INTO v_driver_client_id
    FROM public.drivers
    WHERE id = NEW.driver_id AND organization_id = NEW.organization_id;

    IF v_driver_client_id IS NOT NULL AND v_driver_client_id <> NEW.client_id THEN
      RAISE EXCEPTION 'Integrity Error: Assigned driver (ID: %) belongs to client % but load is assigned to client %.',
        NEW.driver_id, v_driver_client_id, NEW.client_id;
    END IF;
  END IF;

  -- D. State Transition Lifecycle Validation on UPDATE
  IF TG_OP = 'UPDATE' AND OLD.pipeline_status IS DISTINCT FROM NEW.pipeline_status THEN
    -- Allowed forward & backward transitions:
    -- sourced -> negotiating
    -- negotiating -> booked, sourced
    -- booked -> in_transit, negotiating
    -- in_transit -> delivered, booked
    -- delivered -> invoiced, in_transit
    -- invoiced -> paid, delivered
    -- paid -> invoiced (reopen)
    IF NOT (
      (OLD.pipeline_status = 'sourced' AND NEW.pipeline_status IN ('negotiating')) OR
      (OLD.pipeline_status = 'negotiating' AND NEW.pipeline_status IN ('booked', 'sourced')) OR
      (OLD.pipeline_status = 'booked' AND NEW.pipeline_status IN ('in_transit', 'negotiating')) OR
      (OLD.pipeline_status = 'in_transit' AND NEW.pipeline_status IN ('delivered', 'booked')) OR
      (OLD.pipeline_status = 'delivered' AND NEW.pipeline_status IN ('invoiced', 'in_transit')) OR
      (OLD.pipeline_status = 'invoiced' AND NEW.pipeline_status IN ('paid', 'delivered')) OR
      (OLD.pipeline_status = 'paid' AND NEW.pipeline_status IN ('invoiced'))
    ) THEN
      RAISE EXCEPTION 'State Machine Violation: Cannot transition load from "%" to "%".',
        OLD.pipeline_status, NEW.pipeline_status;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Apply Trigger to loads table
DROP TRIGGER IF EXISTS trg_validate_load_lifecycle ON public.loads;
CREATE TRIGGER trg_validate_load_lifecycle
  BEFORE INSERT OR UPDATE ON public.loads
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_load_lifecycle_integrity();

-- 4. Atomic Concurrency-Safe Status Transition RPC
CREATE OR REPLACE FUNCTION public.transition_load_status(
  p_organization_id UUID,
  p_load_id UUID,
  p_target_status TEXT,
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
  v_old_status TEXT;
  v_result JSONB;
BEGIN
  -- 1. Authentication check
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  -- 2. Authorization check
  IF NOT public.has_operational_write_access(p_organization_id) THEN
    RAISE EXCEPTION 'Unauthorized: Operational write access required to transition load status.';
  END IF;

  -- 3. Row lock to prevent concurrent TOCTOU race conditions
  SELECT * INTO v_load
  FROM public.loads
  WHERE id = p_load_id AND organization_id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Load not found in specified organization.';
  END IF;

  v_old_status := v_load.pipeline_status;

  -- If status is already target, return immediately
  IF v_old_status = p_target_status THEN
    SELECT to_jsonb(l) INTO v_result
    FROM public.loads l
    WHERE l.id = p_load_id;
    RETURN v_result;
  END IF;

  -- 4. Perform update (will trigger trg_validate_load_lifecycle)
  UPDATE public.loads
  SET 
    pipeline_status = p_target_status,
    updated_at = NOW()
  WHERE id = p_load_id AND organization_id = p_organization_id;

  -- 5. Record activity note
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
    'status_change',
    format('Status transitioned from %s to %s.%s', UPPER(v_old_status), UPPER(p_target_status), 
      CASE WHEN p_notes IS NOT NULL AND TRIM(p_notes) <> '' THEN ' ' || p_notes ELSE '' END),
    jsonb_build_object(
      'previous_status', v_old_status,
      'new_status', p_target_status
    )
  );

  -- 6. Return updated record
  SELECT to_jsonb(l) INTO v_result
  FROM public.loads l
  WHERE l.id = p_load_id;

  RETURN v_result;
END;
$$;
