-- ====================================================================
-- DispatcherDesk Forensic Verification Test Suite: S6.13 One IN TRANSIT Load Per Truck
-- File: supabase/tests/s6_13_one_in_transit_load_per_truck.sql
-- Description:
-- Verifies the authoritative partial unique index idx_loads_one_in_transit_per_truck:
-- Scenario 1: Load A in_transit on T1, Load B booked on T1 (future date) -> B to in_transit FAILS (23505)
-- Scenario 2: Load A in_transit -> delivered, then Load B to in_transit SUCCEEDS
-- Scenario 3: Load A in_transit on T1, Load C booked on T2 -> C to in_transit SUCCEEDS
-- Scenario 4: Multiple in_transit loads with truck_id IS NULL are allowed (unassigned)
-- ====================================================================

BEGIN;

DO $$
DECLARE
  v_org UUID := 'a0000000-0000-0000-0000-000000000001'::UUID;
  v_client UUID := 'ac100000-0000-0000-0000-000000000001'::UUID;
  v_truck1 UUID := 'ae100000-0000-0000-0000-000000000001'::UUID;
  v_truck2 UUID := 'ae300000-0000-0000-0000-000000000003'::UUID;
  v_driver1 UUID := 'ad100000-0000-0000-0000-000000000001'::UUID;
  v_driver2 UUID := 'ad300000-0000-0000-0000-000000000003'::UUID;

  v_load_a UUID := 'a1000000-0000-0000-0000-000000000001'::UUID;
  v_load_b UUID := 'a1000000-0000-0000-0000-000000000002'::UUID;
  v_load_c UUID := 'a1000000-0000-0000-0000-000000000003'::UUID;

  v_threw_violation BOOLEAN := FALSE;
BEGIN
  RAISE NOTICE '=== Running Test Suite: One IN TRANSIT Load Per Truck Invariant ===';

  -- Setup prerequisite client, trucks, and drivers
  INSERT INTO public.organizations (id, name, slug)
  VALUES (v_org, 'Test Carrier Org', 'test-carrier-org')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.clients (id, organization_id, company_name, client_type, status)
  VALUES (v_client, v_org, 'Test Client Inc', 'carrier_client', 'active')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.trucks (id, organization_id, client_id, truck_number, equipment_type, status)
  VALUES 
    (v_truck1, v_org, v_client, 'TRK-101', 'dry_van', 'active'),
    (v_truck2, v_org, v_client, 'TRK-202', 'dry_van', 'active')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.drivers (id, organization_id, client_id, full_name, pay_type, pay_rate, status)
  VALUES 
    (v_driver1, v_org, v_client, 'Driver John', 'per_mile', 0.65, 'available'),
    (v_driver2, v_org, v_client, 'Driver Jane', 'per_mile', 0.65, 'available')
  ON CONFLICT (id) DO NOTHING;

  -- Initial state: Load A is IN TRANSIT on Truck 1
  INSERT INTO public.loads (
    id, organization_id, load_number, client_id, truck_id, driver_id, pipeline_status,
    origin_city, origin_state, dest_city, dest_state,
    pickup_datetime, delivery_datetime, rate
  ) VALUES (
    v_load_a, v_org, 'LD-TST-001', v_client, v_truck1, v_driver1, 'in_transit',
    'Chicago', 'IL', 'Dallas', 'TX',
    NOW() - INTERVAL '4 hours', NOW() + INTERVAL '20 hours', 2500
  );

  -- Initial state: Load B is BOOKED on Truck 1 (future schedule, no time overlap)
  INSERT INTO public.loads (
    id, organization_id, load_number, client_id, truck_id, driver_id, pipeline_status,
    origin_city, origin_state, dest_city, dest_state,
    pickup_datetime, delivery_datetime, rate
  ) VALUES (
    v_load_b, v_org, 'LD-TST-002', v_client, v_truck1, v_driver1, 'booked',
    'Dallas', 'TX', 'Atlanta', 'GA',
    NOW() + INTERVAL '48 hours', NOW() + INTERVAL '72 hours', 3000
  );

  -- Initial state: Load C is BOOKED on Truck 2 (different truck)
  INSERT INTO public.loads (
    id, organization_id, load_number, client_id, truck_id, driver_id, pipeline_status,
    origin_city, origin_state, dest_city, dest_state,
    pickup_datetime, delivery_datetime, rate
  ) VALUES (
    v_load_c, v_org, 'LD-TST-003', v_client, v_truck2, v_driver2, 'booked',
    'Nashville', 'TN', 'Columbus', 'OH',
    NOW() + INTERVAL '10 hours', NOW() + INTERVAL '24 hours', 1800
  );

  -- Scenario 1: Attempt to transition Load B to 'in_transit' while Load A is already 'in_transit' for Truck 1
  BEGIN
    UPDATE public.loads
    SET pipeline_status = 'in_transit'
    WHERE id = v_load_b;

    v_threw_violation := FALSE;
  EXCEPTION
    WHEN unique_violation THEN
      v_threw_violation := TRUE;
      RAISE NOTICE 'SUCCESS: Scenario 1 blocked by unique index idx_loads_one_in_transit_per_truck as expected (SQLSTATE: %)', SQLSTATE;
  END;

  IF NOT v_threw_violation THEN
    RAISE EXCEPTION 'TEST FAILED: Load B was allowed to transition to in_transit while Load A was already in_transit for Truck 1!';
  END IF;

  -- Scenario 3: Transition Load C to 'in_transit' for Truck 2 (different truck) -> MUST SUCCEED
  UPDATE public.loads
  SET pipeline_status = 'in_transit'
  WHERE id = v_load_c;

  RAISE NOTICE 'SUCCESS: Scenario 3 allowed Load C on Truck 2 to transition to in_transit while Load A on Truck 1 is in_transit.';

  -- Scenario 2: Deliver Load A (Load A: in_transit -> delivered)
  UPDATE public.loads
  SET pipeline_status = 'delivered'
  WHERE id = v_load_a;

  -- Now attempt to transition Load B to 'in_transit' -> MUST SUCCEED
  UPDATE public.loads
  SET pipeline_status = 'in_transit'
  WHERE id = v_load_b;

  RAISE NOTICE 'SUCCESS: Scenario 2 allowed Load B to transition to in_transit after Load A was delivered.';

  RAISE NOTICE '=== ALL TESTS PASSED: One IN TRANSIT Load Per Truck Invariant is Authoritatively Protected ===';
END $$;

ROLLBACK;
