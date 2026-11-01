-- ====================================================================
-- DispatcherDesk Migration: Load Pipeline Canonical Transitions (P0-1)
-- Version: 1.0.37
-- File: supabase/migrations/20261007000001_load_pipeline_canonical_transitions.sql
-- Description:
-- Surgically updates public.enforce_load_lifecycle_integrity() to align
-- with the canonical DispatcherDesk operational workflow:
-- 1. sourced -> negotiating, sourced -> booked (direct rate con booking allowed)
-- 2. negotiating -> sourced, negotiating -> booked
-- 3. booked -> sourced, booked -> negotiating, booked -> in_transit
-- 4. in_transit -> booked, in_transit -> delivered
-- 5. delivered -> in_transit, delivered -> invoiced
-- 6. invoiced -> delivered, invoiced -> paid
-- 7. paid -> TERMINAL (no transitions allowed from paid)
-- Invalid transitions (e.g. booked -> invoiced, booked -> paid) strictly rejected.
-- ====================================================================

CREATE OR REPLACE FUNCTION public.enforce_load_lifecycle_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_truck RECORD;
  v_driver RECORD;
  v_client RECORD;
  v_conflict_load_id UUID;
  v_conflict_load_num TEXT;
  v_conflict_p_dt TIMESTAMPTZ;
  v_conflict_d_dt TIMESTAMPTZ;
BEGIN
  -- A. Ensure Load Number is non-empty
  IF NEW.load_number IS NULL OR TRIM(NEW.load_number) = '' THEN
    RAISE EXCEPTION 'Validation Error: load_number cannot be empty.';
  END IF;

  -- B. Client Active Status & Tenant Verification
  IF NEW.client_id IS NOT NULL THEN
    SELECT id, status INTO v_client
    FROM public.clients
    WHERE id = NEW.client_id AND organization_id = NEW.organization_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Integrity Error: Assigned client (ID: %) does not exist in organization %.',
        NEW.client_id, NEW.organization_id;
    END IF;

    IF NEW.pipeline_status IN ('booked', 'in_transit') AND v_client.status = 'inactive' THEN
      RAISE EXCEPTION 'Integrity Error: Cannot assign load to inactive client (ID: %).', NEW.client_id;
    END IF;
  END IF;

  -- C. Carrier-Equipment Alignment & Status Verification (Truck)
  IF NEW.truck_id IS NOT NULL THEN
    SELECT id, client_id, status, truck_number INTO v_truck
    FROM public.trucks
    WHERE id = NEW.truck_id AND organization_id = NEW.organization_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Integrity Error: Assigned truck (ID: %) does not exist in organization %.',
        NEW.truck_id, NEW.organization_id;
    END IF;

    IF NEW.client_id IS NOT NULL AND v_truck.client_id IS NOT NULL AND v_truck.client_id <> NEW.client_id THEN
      RAISE EXCEPTION 'Integrity Error: Assigned truck "%" (ID: %) belongs to client % but load is assigned to client %.',
        v_truck.truck_number, NEW.truck_id, v_truck.client_id, NEW.client_id;
    END IF;

    IF NEW.pipeline_status IN ('booked', 'in_transit') AND v_truck.status IN ('maintenance', 'inactive') THEN
      RAISE EXCEPTION 'Integrity Error: Truck "%" (ID: %) cannot be assigned to an active load because its status is "%".',
        v_truck.truck_number, NEW.truck_id, v_truck.status;
    END IF;
  END IF;

  -- D. Carrier-Equipment Alignment & Status Verification (Driver)
  IF NEW.driver_id IS NOT NULL THEN
    SELECT id, client_id, status, full_name INTO v_driver
    FROM public.drivers
    WHERE id = NEW.driver_id AND organization_id = NEW.organization_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Integrity Error: Assigned driver (ID: %) does not exist in organization %.',
        NEW.driver_id, NEW.organization_id;
    END IF;

    IF NEW.client_id IS NOT NULL AND v_driver.client_id IS NOT NULL AND v_driver.client_id <> NEW.client_id THEN
      RAISE EXCEPTION 'Integrity Error: Assigned driver "%" (ID: %) belongs to client % but load is assigned to client %.',
        v_driver.full_name, NEW.driver_id, v_driver.client_id, NEW.client_id;
    END IF;

    IF NEW.pipeline_status IN ('booked', 'in_transit') AND v_driver.status = 'off_duty' THEN
      RAISE EXCEPTION 'Integrity Error: Driver "%" (ID: %) cannot be assigned to an active load because status is "off_duty".',
        v_driver.full_name, NEW.driver_id;
    END IF;
  END IF;

  -- E. Broker Tenant Verification (if assigned)
  IF NEW.broker_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.brokers
      WHERE id = NEW.broker_id AND organization_id = NEW.organization_id
    ) THEN
      RAISE EXCEPTION 'Integrity Error: Assigned broker (ID: %) does not exist in organization %.',
        NEW.broker_id, NEW.organization_id;
    END IF;
  END IF;

  -- F. Temporal Overlapping Load Conflict Detection (Trucks & Drivers)
  -- Active operational statuses: 'booked', 'in_transit'
  IF NEW.pipeline_status IN ('booked', 'in_transit') 
     AND NEW.pickup_datetime IS NOT NULL 
     AND NEW.delivery_datetime IS NOT NULL THEN

    -- 1. Truck Schedule Collision
    IF NEW.truck_id IS NOT NULL THEN
      SELECT l.id, l.load_number, l.pickup_datetime, l.delivery_datetime
      INTO v_conflict_load_id, v_conflict_load_num, v_conflict_p_dt, v_conflict_d_dt
      FROM public.loads l
      WHERE l.organization_id = NEW.organization_id
        AND l.truck_id = NEW.truck_id
        AND l.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::UUID)
        AND l.pipeline_status IN ('booked', 'in_transit')
        AND l.pickup_datetime IS NOT NULL
        AND l.delivery_datetime IS NOT NULL
        AND (NEW.pickup_datetime < l.delivery_datetime AND NEW.delivery_datetime > l.pickup_datetime)
      LIMIT 1;

      IF FOUND THEN
        RAISE EXCEPTION 'Conflict Error: Truck (ID: %) is already assigned to active Load % (% to %) which overlaps with this schedule (% to %).',
          NEW.truck_id, v_conflict_load_num, v_conflict_p_dt, v_conflict_d_dt, NEW.pickup_datetime, NEW.delivery_datetime;
      END IF;
    END IF;

    -- 2. Driver Schedule Collision
    IF NEW.driver_id IS NOT NULL THEN
      SELECT l.id, l.load_number, l.pickup_datetime, l.delivery_datetime
      INTO v_conflict_load_id, v_conflict_load_num, v_conflict_p_dt, v_conflict_d_dt
      FROM public.loads l
      WHERE l.organization_id = NEW.organization_id
        AND l.driver_id = NEW.driver_id
        AND l.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::UUID)
        AND l.pipeline_status IN ('booked', 'in_transit')
        AND l.pickup_datetime IS NOT NULL
        AND l.delivery_datetime IS NOT NULL
        AND (NEW.pickup_datetime < l.delivery_datetime AND NEW.delivery_datetime > l.pickup_datetime)
      LIMIT 1;

      IF FOUND THEN
        RAISE EXCEPTION 'Conflict Error: Driver (ID: %) is already assigned to active Load % (% to %) which overlaps with this schedule (% to %).',
          NEW.driver_id, v_conflict_load_num, v_conflict_p_dt, v_conflict_d_dt, NEW.pickup_datetime, NEW.delivery_datetime;
      END IF;
    END IF;
  END IF;

  -- G. Terminal State Assignment Immutability on UPDATE
  IF TG_OP = 'UPDATE' AND OLD.pipeline_status IN ('invoiced', 'paid') THEN
    IF (OLD.truck_id IS DISTINCT FROM NEW.truck_id) OR
       (OLD.driver_id IS DISTINCT FROM NEW.driver_id) OR
       (OLD.client_id IS DISTINCT FROM NEW.client_id) OR
       (OLD.broker_id IS DISTINCT FROM NEW.broker_id) THEN
      RAISE EXCEPTION 'Integrity Error: Cannot modify assignment (carrier, broker, truck, or driver) on an % load (ID: %). Load must be reopened first.',
        UPPER(OLD.pipeline_status), OLD.id;
    END IF;
  END IF;

  -- H. State Transition Lifecycle Validation on UPDATE
  -- Canonical transitions matrix:
  -- sourced -> negotiating, booked
  -- negotiating -> sourced, booked
  -- booked -> sourced, negotiating, in_transit
  -- in_transit -> booked, delivered
  -- delivered -> in_transit, invoiced
  -- invoiced -> delivered, paid
  -- paid -> TERMINAL (no transitions permitted)
  IF TG_OP = 'UPDATE' AND OLD.pipeline_status IS DISTINCT FROM NEW.pipeline_status THEN
    IF NOT (
      (OLD.pipeline_status = 'sourced' AND NEW.pipeline_status IN ('negotiating', 'booked')) OR
      (OLD.pipeline_status = 'negotiating' AND NEW.pipeline_status IN ('sourced', 'booked')) OR
      (OLD.pipeline_status = 'booked' AND NEW.pipeline_status IN ('sourced', 'negotiating', 'in_transit')) OR
      (OLD.pipeline_status = 'in_transit' AND NEW.pipeline_status IN ('booked', 'delivered')) OR
      (OLD.pipeline_status = 'delivered' AND NEW.pipeline_status IN ('in_transit', 'invoiced')) OR
      (OLD.pipeline_status = 'invoiced' AND NEW.pipeline_status IN ('delivered', 'paid'))
    ) THEN
      RAISE EXCEPTION 'State Machine Violation: Cannot transition load from "%" to "%".',
        OLD.pipeline_status, NEW.pipeline_status;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Re-attach trigger to loads table
DROP TRIGGER IF EXISTS trg_validate_load_lifecycle ON public.loads;
CREATE TRIGGER trg_validate_load_lifecycle
  BEFORE INSERT OR UPDATE ON public.loads
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_load_lifecycle_integrity();
