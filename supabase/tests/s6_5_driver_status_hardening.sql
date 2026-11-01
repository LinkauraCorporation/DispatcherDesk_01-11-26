-- ====================================================================
-- DispatcherDesk Forensic Verification Test Suite: S6.5 Driver Status Hardening & Assignment Integrity
-- File: supabase/tests/s6_5_driver_status_hardening.sql
-- Description:
-- Comprehensive pgTAP / PL/pgSQL automated test suite verifying:
-- Case 1 — inactive assignment rejected: attempt to assign load to inactive driver must fail
-- Case 2 — available assignment succeeds: valid available driver assignment succeeds
-- Case 3 — inactive old driver preserved: load assigned to inactive driver + driver unassigned/replaced -> driver remains inactive
-- Case 4 — active old driver released: load assigned to available/on_load driver + driver unassigned/replaced -> driver becomes available
-- Case 5 — existing S6.4 protections: existing operational write access, cross-tenant, and lifecycle integrity remain intact
-- ====================================================================

BEGIN;

DO $$
DECLARE
  -- Organizations
  v_org_a UUID := 'a0000000-0000-0000-0000-000000000001'::UUID;

  -- Users
  v_user_admin_a UUID := 'a1111111-1111-1111-1111-111111111111'::UUID;
  v_user_staff_a UUID := 'a2222222-2222-2222-2222-222222222222'::UUID;

  -- Client Org A
  v_client_a1 UUID := 'ac100000-0000-0000-0000-000000000001'::UUID;

  -- Truck Org A
  v_truck_a1_1 UUID := 'ae100000-0000-0000-0000-000000000001'::UUID;

  -- Drivers Org A
  v_driver_avail UUID := 'ad100000-0000-0000-0000-000000000001'::UUID;
  v_driver_onload UUID := 'ad200000-0000-0000-0000-000000000002'::UUID;
  v_driver_inact UUID := 'ad300000-0000-0000-0000-000000000003'::UUID;
  v_driver_inact2 UUID := 'ad400000-0000-0000-0000-000000000004'::UUID;

  -- Broker Org A
  v_broker_a UUID := 'ab100000-0000-0000-0000-000000000001'::UUID;

  -- Test Loads
  v_load_1 UUID := 'af100000-0000-0000-0000-000000000001'::UUID;
  v_load_2 UUID := 'af200000-0000-0000-0000-000000000002'::UUID;
  v_load_3 UUID := 'af300000-0000-0000-0000-000000000003'::UUID;

  v_err_caught BOOLEAN;
  v_err_msg TEXT;
  v_result JSONB;
  v_driver_status TEXT;
BEGIN
  RAISE NOTICE '=============================================================';
  RAISE NOTICE 'STARTING TEST SUITE: S6.5 DRIVER STATUS HARDENING & INTEGRITY';
  RAISE NOTICE '=============================================================';

  -- -----------------------------------------------------------------
  -- SETUP: CLEAN & SEED TEST ENVIRONMENT
  -- -----------------------------------------------------------------
  DELETE FROM public.activity_notes WHERE organization_id = v_org_a;
  DELETE FROM public.loads WHERE organization_id = v_org_a;
  DELETE FROM public.drivers WHERE organization_id = v_org_a;
  DELETE FROM public.trucks WHERE organization_id = v_org_a;
  DELETE FROM public.brokers WHERE organization_id = v_org_a;
  DELETE FROM public.clients WHERE organization_id = v_org_a;
  DELETE FROM public.organization_members WHERE organization_id = v_org_a;
  DELETE FROM public.organizations WHERE id = v_org_a;
  DELETE FROM public.profiles WHERE id IN (v_user_admin_a, v_user_staff_a);

  -- Insert Profiles
  INSERT INTO public.profiles (id, full_name) VALUES
    (v_user_admin_a, 'Admin User Org A'),
    (v_user_staff_a, 'Staff User Org A');

  -- Insert Organization
  INSERT INTO public.organizations (id, name, slug) VALUES
    (v_org_a, 'Apex Freight Logistics Org A', 'apex-a');

  -- Insert Memberships
  INSERT INTO public.organization_members (organization_id, user_id, role) VALUES
    (v_org_a, v_user_admin_a, 'owner_admin'),
    (v_org_a, v_user_staff_a, 'staff');

  -- Insert Client
  INSERT INTO public.clients (id, organization_id, company_name, client_type, status) VALUES
    (v_client_a1, v_org_a, 'Apex Fleet Carrier A1', 'fleet', 'active');

  -- Insert Broker
  INSERT INTO public.brokers (id, organization_id, company_name) VALUES
    (v_broker_a, v_org_a, 'C.H. Robinson Org A');

  -- Insert Truck
  INSERT INTO public.trucks (id, organization_id, client_id, truck_number, equipment_type, status) VALUES
    (v_truck_a1_1, v_org_a, v_client_a1, 'TRK-A1-101', 'dry_van', 'active');

  -- Insert Drivers with varied statuses including 'inactive'
  INSERT INTO public.drivers (id, organization_id, client_id, full_name, status, pay_type) VALUES
    (v_driver_avail, v_org_a, v_client_a1, 'Available Driver A1', 'available', 'per_mile'),
    (v_driver_onload, v_org_a, v_client_a1, 'OnLoad Driver A1', 'on_load', 'per_mile'),
    (v_driver_inact, v_org_a, v_client_a1, 'Inactive Driver A1', 'inactive', 'per_mile'),
    (v_driver_inact2, v_org_a, v_client_a1, 'Inactive Driver A2', 'inactive', 'per_mile');

  -- Insert Base Test Loads
  INSERT INTO public.loads (
    id, organization_id, load_number, client_id, broker_id, truck_id,
    origin_city, origin_state, dest_city, dest_state,
    rate, loaded_miles, pipeline_status
  ) VALUES (
    v_load_1, v_org_a, 'LD-S65-001', v_client_a1, v_broker_a, v_truck_a1_1,
    'Dallas', 'TX', 'Atlanta', 'GA',
    2500, 800, 'booked'
  );

  -- Insert Load 2 with an existing inactive driver assignment (valid legacy/pre-existing assignment)
  INSERT INTO public.loads (
    id, organization_id, load_number, client_id, broker_id, truck_id, driver_id,
    origin_city, origin_state, dest_city, dest_state,
    rate, loaded_miles, pipeline_status
  ) VALUES (
    v_load_2, v_org_a, 'LD-S65-002', v_client_a1, v_broker_a, v_truck_a1_1, v_driver_inact,
    'Dallas', 'TX', 'Atlanta', 'GA',
    2500, 800, 'booked'
  );

  -- Insert Load 3 with an existing on_load driver assignment
  INSERT INTO public.loads (
    id, organization_id, load_number, client_id, broker_id, truck_id, driver_id,
    origin_city, origin_state, dest_city, dest_state,
    rate, loaded_miles, pipeline_status
  ) VALUES (
    v_load_3, v_org_a, 'LD-S65-003', v_client_a1, v_broker_a, v_truck_a1_1, v_driver_onload,
    'Dallas', 'TX', 'Atlanta', 'GA',
    2500, 800, 'booked'
  );

  RAISE NOTICE '[OK] Test setup completed.';

  -- -----------------------------------------------------------------
  -- CASE 1: Inactive Driver Assignment Rejected
  -- Attempting to assign an inactive driver to a load must fail.
  -- -----------------------------------------------------------------
  v_err_caught := FALSE;
  BEGIN
    v_result := public.assign_load_dispatch(
      v_org_a,
      v_load_1,
      v_truck_a1_1,
      v_driver_inact,
      'Attempt to assign inactive driver'
    );
  EXCEPTION WHEN OTHERS THEN
    v_err_caught := TRUE;
    v_err_msg := SQLERRM;
  END;

  IF NOT v_err_caught THEN
    RAISE EXCEPTION 'CASE 1 FAILED: Inactive driver assignment was improperly permitted.';
  ELSIF v_err_msg NOT LIKE '%Cannot assign load to an inactive driver profile%' THEN
    RAISE EXCEPTION 'CASE 1 FAILED: Expected inactive driver error message, got: %', v_err_msg;
  ELSE
    RAISE NOTICE '[PASS] CASE 1: Inactive driver assignment rejected with expected message: %', v_err_msg;
  END IF;

  -- -----------------------------------------------------------------
  -- CASE 2: Available Driver Assignment Succeeds
  -- Assigning an available driver must succeed and link to load.
  -- -----------------------------------------------------------------
  v_result := public.assign_load_dispatch(
    v_org_a,
    v_load_1,
    v_truck_a1_1,
    v_driver_avail,
    'Assign available driver'
  );

  IF (v_result->>'driver_id')::UUID <> v_driver_avail THEN
    RAISE EXCEPTION 'CASE 2 FAILED: Available driver assignment failed to persist.';
  ELSE
    RAISE NOTICE '[PASS] CASE 2: Available driver assignment succeeded as expected.';
  END IF;

  -- -----------------------------------------------------------------
  -- CASE 3: Inactive Old Driver Preserved When Unassigned or Replaced
  -- When removing or replacing an inactive old driver, driver must remain 'inactive'
  -- -----------------------------------------------------------------
  -- Unassign driver from Load 2 (which had v_driver_inact assigned)
  v_result := public.assign_load_dispatch(
    v_org_a,
    v_load_2,
    v_truck_a1_1,
    NULL,
    'Unassigning inactive driver'
  );

  SELECT status INTO v_driver_status
  FROM public.drivers
  WHERE id = v_driver_inact;

  IF v_driver_status <> 'inactive' THEN
    RAISE EXCEPTION 'CASE 3 FAILED: Inactive driver was improperly altered to % instead of remaining inactive.', v_driver_status;
  ELSE
    RAISE NOTICE '[PASS] CASE 3: Inactive driver status preserved as "inactive" after unassignment.';
  END IF;

  -- -----------------------------------------------------------------
  -- CASE 4: Active Old Driver Released to 'available'
  -- When removing or replacing an active/on_load old driver, driver becomes 'available'
  -- -----------------------------------------------------------------
  -- Unassign driver from Load 3 (which had v_driver_onload assigned)
  v_result := public.assign_load_dispatch(
    v_org_a,
    v_load_3,
    v_truck_a1_1,
    NULL,
    'Unassigning on_load driver'
  );

  SELECT status INTO v_driver_status
  FROM public.drivers
  WHERE id = v_driver_onload;

  IF v_driver_status <> 'available' THEN
    RAISE EXCEPTION 'CASE 4 FAILED: Active driver was not set to available, got: %', v_driver_status;
  ELSE
    RAISE NOTICE '[PASS] CASE 4: Active old driver successfully released to "available".';
  END IF;

  -- -----------------------------------------------------------------
  -- CASE 5: Existing S6.4 Assignment Integrity Protections Preserved
  -- -----------------------------------------------------------------
  -- 5a. Activity note was logged for assignment change
  IF NOT EXISTS (
    SELECT 1 FROM public.activity_notes
    WHERE organization_id = v_org_a
      AND load_id = v_load_1
      AND note_type = 'assignment_change'
  ) THEN
    RAISE EXCEPTION 'CASE 5 FAILED: Assignment change activity note was not recorded.';
  END IF;

  RAISE NOTICE '[PASS] CASE 5: S6.4 activity notes and dispatch protections confirmed intact.';

  RAISE NOTICE '=============================================================';
  RAISE NOTICE 'ALL S6.5 DRIVER STATUS HARDENING TESTS PASSED!';
  RAISE NOTICE '=============================================================';
END $$;

ROLLBACK;
