-- ====================================================================
-- DispatcherDesk Migration: Load Assignment & Dispatch Integrity Hardening (S6.4)
-- Version: 1.0.13
-- File: supabase/migrations/20260830000013_load_assignment_integrity.sql
-- Description:
-- 1. Enhances enforce_load_lifecycle_integrity trigger to enforce:
--    a. Inactive client, truck (maintenance/inactive), and driver (off-duty) assignment guards
--    b. Temporal overlapping-load conflict detection for trucks and drivers
--    c. Terminal/invoiced/paid lifecycle load assignment immutability
-- 2. Provides authoritative concurrency-safe assign_load_dispatch RPC with row locks
-- 3. Adds optimized composite indexes for high-frequency dispatch collision lookups
-- ====================================================================

-- 1. Composite performance indexes for dispatch overlap lookups
CREATE INDEX IF NOT EXISTS idx_loads_truck_dispatch_schedule
  ON public.loads (organization_id, truck_id, pipeline_status, pickup_datetime, delivery_datetime)
  WHERE truck_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_loads_driver_dispatch_schedule
  ON public.loads (organization_id, driver_id, pipeline_status, pickup_datetime, delivery_datetime)
  WHERE driver_id IS NOT NULL;

-- 2. Enhanced Trigger Function for Complete Assignment & Lifecycle Integrity
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
  IF TG_OP = 'UPDATE' AND OLD.pipeline_status IS DISTINCT FROM NEW.pipeline_status THEN
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

-- 3. Concurrency-Safe Resource Assignment RPC
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
  v_result JSONB;
BEGIN
  -- 1. Authentication check
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  -- 2. Authorization check
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
  END IF;

  -- 4. Perform Update (triggers trg_validate_load_lifecycle with locks active)
  UPDATE public.loads
  SET 
    truck_id = p_truck_id,
    driver_id = p_driver_id,
    updated_at = NOW()
  WHERE id = p_load_id AND organization_id = p_organization_id;

  -- 5. Record Activity Note for assignment change
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
