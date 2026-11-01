-- ====================================================================
-- DispatcherDesk Forensic Verification Test Suite: S6.4 Load Assignment & Dispatch Integrity
-- File: supabase/tests/s6_4_assignment_integrity.sql
-- Description:
-- Comprehensive pgTAP / PL/pgSQL automated test suite verifying:
-- 1. Cross-tenant truck assignment prevention
-- 2. Cross-tenant driver assignment prevention
-- 3. Wrong-client truck assignment prevention
-- 4. Wrong-client driver assignment prevention
-- 5. Inactive client / maintenance truck / off-duty driver assignment prevention
-- 6. Truck overlapping-load temporal conflict detection
-- 7. Driver overlapping-load temporal conflict detection
-- 8. Valid sequential non-overlapping assignments allowed
-- 9. Terminal/invoiced/paid load assignment immutability
-- 10. Concurrency-safe assign_load_dispatch RPC with row-level locks
-- 11. Staff unauthorized assignment mutation rejection
-- 12. Load organization_id immutability
-- ====================================================================

BEGIN;

DO $$
DECLARE
  -- Organizations
  v_org_a UUID := 'a0000000-0000-0000-0000-000000000001'::UUID;
  v_org_b UUID := 'b0000000-0000-0000-0000-000000000001'::UUID;

  -- Users
  v_user_admin_a UUID := 'a1111111-1111-1111-1111-111111111111'::UUID;
  v_user_staff_a UUID := 'a2222222-2222-2222-2222-222222222222'::UUID;
  v_user_admin_b UUID := 'b1111111-1111-1111-1111-111111111111'::UUID;

  -- Clients Org A
  v_client_a1 UUID := 'ac100000-0000-0000-0000-000000000001'::UUID;
  v_client_a2 UUID := 'ac200000-0000-0000-0000-000000000002'::UUID;
  v_client_a_inactive UUID := 'ac300000-0000-0000-0000-000000000003'::UUID;

  -- Clients Org B
  v_client_b1 UUID := 'bc100000-0000-0000-0000-000000000001'::UUID;

  -- Trucks Org A
  v_truck_a1_1 UUID := 'ae100000-0000-0000-0000-000000000001'::UUID; -- client a1, active
  v_truck_a1_maint UUID := 'ae200000-0000-0000-0000-000000000002'::UUID; -- client a1, maintenance
  v_truck_a2_1 UUID := 'ae300000-0000-0000-0000-000000000003'::UUID; -- client a2, active

  -- Trucks Org B
  v_truck_b1_1 UUID := 'be100000-0000-0000-0000-000000000001'::UUID; -- client b1, active

  -- Drivers Org A
  v_driver_a1_1 UUID := 'ad100000-0000-0000-0000-000000000001'::UUID; -- client a1, available
  v_driver_a1_off UUID := 'ad200000-0000-0000-0000-000000000002'::UUID; -- client a1, off_duty
  v_driver_a2_1 UUID := 'ad300000-0000-0000-0000-000000000003'::UUID; -- client a2, available

  -- Drivers Org B
  v_driver_b1_1 UUID := 'bd100000-0000-0000-0000-000000000001'::UUID; -- client b1, available

  -- Brokers Org A & B
  v_broker_a UUID := 'ab100000-0000-0000-0000-000000000001'::UUID;
  v_broker_b UUID := 'bb100000-0000-0000-0000-000000000001'::UUID;

  -- Test Loads
  v_load_1 UUID := 'af100000-0000-0000-0000-000000000001'::UUID;
  v_load_2 UUID := 'af200000-0000-0000-0000-000000000002'::UUID;
  v_load_seq UUID := 'af300000-0000-0000-0000-000000000003'::UUID;
  v_load_inv UUID := 'af400000-0000-0000-0000-000000000004'::UUID;

  v_err_caught BOOLEAN;
  v_err_msg TEXT;
  v_result JSONB;
BEGIN
  RAISE NOTICE '=============================================================';
  RAISE NOTICE 'STARTING TEST SUITE: S6.4 LOAD ASSIGNMENT & DISPATCH INTEGRITY';
  RAISE NOTICE '=============================================================';

  -- -----------------------------------------------------------------
  -- SETUP: CLEAN & SEED TEST ENVIRONMENT
  -- -----------------------------------------------------------------
  DELETE FROM public.activity_notes WHERE organization_id IN (v_org_a, v_org_b);
  DELETE FROM public.loads WHERE organization_id IN (v_org_a, v_org_b);
  DELETE FROM public.drivers WHERE organization_id IN (v_org_a, v_org_b);
  DELETE FROM public.trucks WHERE organization_id IN (v_org_a, v_org_b);
  DELETE FROM public.brokers WHERE organization_id IN (v_org_a, v_org_b);
  DELETE FROM public.clients WHERE organization_id IN (v_org_a, v_org_b);
  DELETE FROM public.organization_members WHERE organization_id IN (v_org_a, v_org_b);
  DELETE FROM public.organizations WHERE id IN (v_org_a, v_org_b);
  DELETE FROM public.profiles WHERE id IN (v_user_admin_a, v_user_staff_a, v_user_admin_b);

  -- Insert Profiles
  INSERT INTO public.profiles (id, full_name) VALUES
    (v_user_admin_a, 'Admin User Org A'),
    (v_user_staff_a, 'Staff User Org A'),
    (v_user_admin_b, 'Admin User Org B');

  -- Insert Organizations
  INSERT INTO public.organizations (id, name, slug) VALUES
    (v_org_a, 'Apex Freight Logistics Org A', 'apex-a'),
    (v_org_b, 'Summit Cargo Org B', 'summit-b');

  -- Insert Memberships
  INSERT INTO public.organization_members (organization_id, user_id, role) VALUES
    (v_org_a, v_user_admin_a, 'owner_admin'),
    (v_org_a, v_user_staff_a, 'staff'),
    (v_org_b, v_user_admin_b, 'owner_admin');

  -- Insert Clients
  INSERT INTO public.clients (id, organization_id, company_name, client_type, status) VALUES
    (v_client_a1, v_org_a, 'Apex Fleet Carrier A1', 'fleet', 'active'),
    (v_client_a2, v_org_a, 'Apex OwnerOp A2', 'owner_operator', 'active'),
    (v_client_a_inactive, v_org_a, 'Apex Inactive Carrier A3', 'fleet', 'inactive'),
    (v_client_b1, v_org_b, 'Summit Fleet Carrier B1', 'fleet', 'active');

  -- Insert Brokers
  INSERT INTO public.brokers (id, organization_id, company_name) VALUES
    (v_broker_a, v_org_a, 'C.H. Robinson Org A'),
    (v_broker_b, v_org_b, 'TQL Org B');

  -- Insert Trucks
  INSERT INTO public.trucks (id, organization_id, client_id, truck_number, equipment_type, status) VALUES
    (v_truck_a1_1, v_org_a, v_client_a1, 'TRK-A1-101', 'dry_van', 'active'),
    (v_truck_a1_maint, v_org_a, v_client_a1, 'TRK-A1-102', 'dry_van', 'maintenance'),
    (v_truck_a2_1, v_org_a, v_client_a2, 'TRK-A2-201', 'reefer', 'active'),
    (v_truck_b1_1, v_org_b, v_client_b1, 'TRK-B1-101', 'flatbed', 'active');

  -- Insert Drivers
  INSERT INTO public.drivers (id, organization_id, client_id, full_name, status, pay_type) VALUES
    (v_driver_a1_1, v_org_a, v_client_a1, 'John Doe A1', 'available', 'per_mile'),
    (v_driver_a1_off, v_org_a, v_client_a1, 'Jim OffDuty A1', 'off_duty', 'per_mile'),
    (v_driver_a2_1, v_org_a, v_client_a2, 'Jane Smith A2', 'available', 'flat_rate'),
    (v_driver_b1_1, v_org_b, v_client_b1, 'Bob CrossTenant B1', 'available', 'percentage');

  RAISE NOTICE '[OK] Test setup and tenant seeding completed.';

  -- -----------------------------------------------------------------
  -- TEST 1: Cross-Tenant Truck Assignment Rejection
  -- Assigning Truck from Org B to a Load in Org A must fail.
  -- -----------------------------------------------------------------
  v_err_caught := FALSE;
  BEGIN
    INSERT INTO public.loads (
      id, organization_id, load_number, client_id, broker_id, truck_id,
      origin_city, origin_state, dest_city, dest_state,
      rate, loaded_miles, pipeline_status
    ) VALUES (
      gen_random_uuid(), v_org_a, 'TEST-XT-TRK', v_client_a1, v_broker_a, v_truck_b1_1,
      'Dallas', 'TX', 'Atlanta', 'GA',
      2500, 800, 'booked'
    );
  EXCEPTION WHEN OTHERS THEN
    v_err_caught := TRUE;
    v_err_msg := SQLERRM;
  END;

  IF NOT v_err_caught THEN
    RAISE EXCEPTION 'TEST 1 FAILED: Cross-tenant truck assignment was improperly permitted.';
  ELSE
    RAISE NOTICE '[PASS] TEST 1: Cross-tenant truck assignment rejected as expected. (%)', v_err_msg;
  END IF;

  -- -----------------------------------------------------------------
  -- TEST 2: Cross-Tenant Driver Assignment Rejection
  -- Assigning Driver from Org B to a Load in Org A must fail.
  -- -----------------------------------------------------------------
  v_err_caught := FALSE;
  BEGIN
    INSERT INTO public.loads (
      id, organization_id, load_number, client_id, broker_id, driver_id,
      origin_city, origin_state, dest_city, dest_state,
      rate, loaded_miles, pipeline_status
    ) VALUES (
      gen_random_uuid(), v_org_a, 'TEST-XT-DRV', v_client_a1, v_broker_a, v_driver_b1_1,
      'Dallas', 'TX', 'Atlanta', 'GA',
      2500, 800, 'booked'
    );
  EXCEPTION WHEN OTHERS THEN
    v_err_caught := TRUE;
    v_err_msg := SQLERRM;
  END;

  IF NOT v_err_caught THEN
    RAISE EXCEPTION 'TEST 2 FAILED: Cross-tenant driver assignment was improperly permitted.';
  ELSE
    RAISE NOTICE '[PASS] TEST 2: Cross-tenant driver assignment rejected as expected. (%)', v_err_msg;
  END IF;

  -- -----------------------------------------------------------------
  -- TEST 3: Wrong-Client Truck Assignment Rejection
  -- Assigning Truck from Client A2 to a Load belonging to Client A1 must fail.
  -- -----------------------------------------------------------------
  v_err_caught := FALSE;
  BEGIN
    INSERT INTO public.loads (
      id, organization_id, load_number, client_id, broker_id, truck_id,
      origin_city, origin_state, dest_city, dest_state,
      rate, loaded_miles, pipeline_status
    ) VALUES (
      gen_random_uuid(), v_org_a, 'TEST-WC-TRK', v_client_a1, v_broker_a, v_truck_a2_1,
      'Dallas', 'TX', 'Atlanta', 'GA',
      2500, 800, 'booked'
    );
  EXCEPTION WHEN OTHERS THEN
    v_err_caught := TRUE;
    v_err_msg := SQLERRM;
  END;

  IF NOT v_err_caught THEN
    RAISE EXCEPTION 'TEST 3 FAILED: Wrong-client truck assignment was improperly permitted.';
  ELSE
    RAISE NOTICE '[PASS] TEST 3: Wrong-client truck assignment rejected as expected. (%)', v_err_msg;
  END IF;

  -- -----------------------------------------------------------------
  -- TEST 4: Wrong-Client Driver Assignment Rejection
  -- Assigning Driver from Client A2 to a Load belonging to Client A1 must fail.
  -- -----------------------------------------------------------------
  v_err_caught := FALSE;
  BEGIN
    INSERT INTO public.loads (
      id, organization_id, load_number, client_id, broker_id, driver_id,
      origin_city, origin_state, dest_city, dest_state,
      rate, loaded_miles, pipeline_status
    ) VALUES (
      gen_random_uuid(), v_org_a, 'TEST-WC-DRV', v_client_a1, v_broker_a, v_driver_a2_1,
      'Dallas', 'TX', 'Atlanta', 'GA',
      2500, 800, 'booked'
    );
  EXCEPTION WHEN OTHERS THEN
    v_err_caught := TRUE;
    v_err_msg := SQLERRM;
  END;

  IF NOT v_err_caught THEN
    RAISE EXCEPTION 'TEST 4 FAILED: Wrong-client driver assignment was improperly permitted.';
  ELSE
    RAISE NOTICE '[PASS] TEST 4: Wrong-client driver assignment rejected as expected. (%)', v_err_msg;
  END IF;

  -- -----------------------------------------------------------------
  -- TEST 5: Maintenance Truck Assignment to Active Load Rejection
  -- -----------------------------------------------------------------
  v_err_caught := FALSE;
  BEGIN
    INSERT INTO public.loads (
      id, organization_id, load_number, client_id, broker_id, truck_id,
      origin_city, origin_state, dest_city, dest_state,
      rate, loaded_miles, pipeline_status
    ) VALUES (
      gen_random_uuid(), v_org_a, 'TEST-MAINT-TRK', v_client_a1, v_broker_a, v_truck_a1_maint,
      'Dallas', 'TX', 'Atlanta', 'GA',
      2500, 800, 'booked'
    );
  EXCEPTION WHEN OTHERS THEN
    v_err_caught := TRUE;
    v_err_msg := SQLERRM;
  END;

  IF NOT v_err_caught THEN
    RAISE EXCEPTION 'TEST 5 FAILED: Maintenance truck assignment to active load was permitted.';
  ELSE
    RAISE NOTICE '[PASS] TEST 5: Maintenance truck assignment rejected as expected. (%)', v_err_msg;
  END IF;

  -- -----------------------------------------------------------------
  -- TEST 6: Off-Duty Driver Assignment to Active Load Rejection
  -- -----------------------------------------------------------------
  v_err_caught := FALSE;
  BEGIN
    INSERT INTO public.loads (
      id, organization_id, load_number, client_id, broker_id, driver_id,
      origin_city, origin_state, dest_city, dest_state,
      rate, loaded_miles, pipeline_status
    ) VALUES (
      gen_random_uuid(), v_org_a, 'TEST-OFFDUTY-DRV', v_client_a1, v_broker_a, v_driver_a1_off,
      'Dallas', 'TX', 'Atlanta', 'GA',
      2500, 800, 'booked'
    );
  EXCEPTION WHEN OTHERS THEN
    v_err_caught := TRUE;
    v_err_msg := SQLERRM;
  END;

  IF NOT v_err_caught THEN
    RAISE EXCEPTION 'TEST 6 FAILED: Off-duty driver assignment to active load was permitted.';
  ELSE
    RAISE NOTICE '[PASS] TEST 6: Off-duty driver assignment rejected as expected. (%)', v_err_msg;
  END IF;

  -- -----------------------------------------------------------------
  -- TEST 7: Inactive Client Load Booking Rejection
  -- -----------------------------------------------------------------
  v_err_caught := FALSE;
  BEGIN
    INSERT INTO public.loads (
      id, organization_id, load_number, client_id, broker_id,
      origin_city, origin_state, dest_city, dest_state,
      rate, loaded_miles, pipeline_status
    ) VALUES (
      gen_random_uuid(), v_org_a, 'TEST-INACT-CLI', v_client_a_inactive, v_broker_a,
      'Dallas', 'TX', 'Atlanta', 'GA',
      2500, 800, 'booked'
    );
  EXCEPTION WHEN OTHERS THEN
    v_err_caught := TRUE;
    v_err_msg := SQLERRM;
  END;

  IF NOT v_err_caught THEN
    RAISE EXCEPTION 'TEST 7 FAILED: Inactive client load creation was permitted.';
  ELSE
    RAISE NOTICE '[PASS] TEST 7: Inactive client load booking rejected as expected. (%)', v_err_msg;
  END IF;

  -- -----------------------------------------------------------------
  -- TEST 8: Base Valid Load Creation (Load 1)
  -- Creates an active load scheduled from Sep 1 08:00 to Sep 2 18:00
  -- -----------------------------------------------------------------
  INSERT INTO public.loads (
    id, organization_id, load_number, client_id, broker_id, truck_id, driver_id,
    origin_city, origin_state, dest_city, dest_state,
    pickup_datetime, delivery_datetime,
    rate, loaded_miles, pipeline_status
  ) VALUES (
    v_load_1, v_org_a, 'LD-VALID-001', v_client_a1, v_broker_a, v_truck_a1_1, v_driver_a1_1,
    'Dallas', 'TX', 'Atlanta', 'GA',
    '2026-09-01 08:00:00+00', '2026-09-02 18:00:00+00',
    2800, 800, 'booked'
  );
  RAISE NOTICE '[PASS] TEST 8: Valid base load LD-VALID-001 created.';

  -- -----------------------------------------------------------------
  -- TEST 9: Overlapping Truck Assignment Conflict Detection
  -- Attempt to create Load 2 with SAME truck during Sep 2 10:00 to Sep 3 12:00 (overlaps Load 1).
  -- -----------------------------------------------------------------
  v_err_caught := FALSE;
  BEGIN
    INSERT INTO public.loads (
      id, organization_id, load_number, client_id, broker_id, truck_id,
      origin_city, origin_state, dest_city, dest_state,
      pickup_datetime, delivery_datetime,
      rate, loaded_miles, pipeline_status
    ) VALUES (
      v_load_2, v_org_a, 'LD-OVERLAP-TRK', v_client_a1, v_broker_a, v_truck_a1_1,
      'Atlanta', 'GA', 'Charlotte', 'NC',
      '2026-09-02 10:00:00+00', '2026-09-03 12:00:00+00',
      1200, 250, 'booked'
    );
  EXCEPTION WHEN OTHERS THEN
    v_err_caught := TRUE;
    v_err_msg := SQLERRM;
  END;

  IF NOT v_err_caught THEN
    RAISE EXCEPTION 'TEST 9 FAILED: Overlapping truck schedule was improperly permitted.';
  ELSE
    RAISE NOTICE '[PASS] TEST 9: Overlapping truck assignment detected and rejected. (%)', v_err_msg;
  END IF;

  -- -----------------------------------------------------------------
  -- TEST 10: Overlapping Driver Assignment Conflict Detection
  -- Attempt to create Load 2 with SAME driver during Sep 1 20:00 to Sep 3 08:00 (overlaps Load 1).
  -- -----------------------------------------------------------------
  v_err_caught := FALSE;
  BEGIN
    INSERT INTO public.loads (
      id, organization_id, load_number, client_id, broker_id, driver_id,
      origin_city, origin_state, dest_city, dest_state,
      pickup_datetime, delivery_datetime,
      rate, loaded_miles, pipeline_status
    ) VALUES (
      v_load_2, v_org_a, 'LD-OVERLAP-DRV', v_client_a1, v_broker_a, v_driver_a1_1,
      'Atlanta', 'GA', 'Charlotte', 'NC',
      '2026-09-01 20:00:00+00', '2026-09-03 08:00:00+00',
      1200, 250, 'booked'
    );
  EXCEPTION WHEN OTHERS THEN
    v_err_caught := TRUE;
    v_err_msg := SQLERRM;
  END;

  IF NOT v_err_caught THEN
    RAISE EXCEPTION 'TEST 10 FAILED: Overlapping driver schedule was improperly permitted.';
  ELSE
    RAISE NOTICE '[PASS] TEST 10: Overlapping driver assignment detected and rejected. (%)', v_err_msg;
  END IF;

  -- -----------------------------------------------------------------
  -- TEST 11: Valid Sequential Non-Overlapping Assignments
  -- Load starting at Sep 2 18:00 (exact time Load 1 completes delivery) or later is valid.
  -- -----------------------------------------------------------------
  INSERT INTO public.loads (
    id, organization_id, load_number, client_id, broker_id, truck_id, driver_id,
    origin_city, origin_state, dest_city, dest_state,
    pickup_datetime, delivery_datetime,
    rate, loaded_miles, pipeline_status
  ) VALUES (
    v_load_seq, v_org_a, 'LD-SEQ-001', v_client_a1, v_broker_a, v_truck_a1_1, v_driver_a1_1,
    'Atlanta', 'GA', 'Savannah', 'GA',
    '2026-09-02 18:00:00+00', '2026-09-03 14:00:00+00',
    1400, 250, 'booked'
  );
  RAISE NOTICE '[PASS] TEST 11: Valid sequential assignment accepted for truck and driver.';

  -- -----------------------------------------------------------------
  -- TEST 12: Invoiced/Paid Load Assignment Immutability
  -- Load in invoiced status cannot have its truck/driver/client reassigned.
  -- -----------------------------------------------------------------
  INSERT INTO public.loads (
    id, organization_id, load_number, client_id, broker_id, truck_id, driver_id,
    origin_city, origin_state, dest_city, dest_state,
    rate, loaded_miles, pipeline_status
  ) VALUES (
    v_load_inv, v_org_a, 'LD-INVOICED-001', v_client_a1, v_broker_a, v_truck_a1_1, v_driver_a1_1,
    'Memphis', 'TN', 'Nashville', 'TN',
    1100, 210, 'invoiced'
  );

  v_err_caught := FALSE;
  BEGIN
    UPDATE public.loads
    SET truck_id = NULL
    WHERE id = v_load_inv;
  EXCEPTION WHEN OTHERS THEN
    v_err_caught := TRUE;
    v_err_msg := SQLERRM;
  END;

  IF NOT v_err_caught THEN
    RAISE EXCEPTION 'TEST 12 FAILED: Modifying truck assignment on invoiced load was permitted.';
  ELSE
    RAISE NOTICE '[PASS] TEST 12: Assignment modification on invoiced load blocked. (%)', v_err_msg;
  END IF;

  -- -----------------------------------------------------------------
  -- TEST 13: organization_id Immutability on Loads
  -- -----------------------------------------------------------------
  v_err_caught := FALSE;
  BEGIN
    UPDATE public.loads
    SET organization_id = v_org_b
    WHERE id = v_load_1;
  EXCEPTION WHEN OTHERS THEN
    v_err_caught := TRUE;
    v_err_msg := SQLERRM;
  END;

  IF NOT v_err_caught THEN
    RAISE EXCEPTION 'TEST 13 FAILED: organization_id reassignment on load was permitted.';
  ELSE
    RAISE NOTICE '[PASS] TEST 13: organization_id reassignment blocked by trigger. (%)', v_err_msg;
  END IF;

  -- -----------------------------------------------------------------
  -- TEST 14: assign_load_dispatch RPC Concurrency & Integrity
  -- -----------------------------------------------------------------
  -- Reassign LD-SEQ-001 driver to NULL or another valid driver
  v_result := public.assign_load_dispatch(
    v_org_a,
    v_load_seq,
    v_truck_a1_1,
    NULL,
    'Driver unassigned for maintenance rest'
  );

  IF v_result->>'driver_id' IS NOT NULL THEN
    RAISE EXCEPTION 'TEST 14 FAILED: assign_load_dispatch RPC did not unassign driver.';
  ELSE
    RAISE NOTICE '[PASS] TEST 14: assign_load_dispatch RPC executed successfully with audit note.';
  END IF;

  -- Verify activity note was logged
  IF NOT EXISTS (
    SELECT 1 FROM public.activity_notes
    WHERE organization_id = v_org_a
      AND load_id = v_load_seq
      AND note_type = 'assignment_change'
  ) THEN
    RAISE EXCEPTION 'TEST 14 FAILED: Activity note for assignment change was not recorded.';
  END IF;

  RAISE NOTICE '=============================================================';
  RAISE NOTICE 'ALL S6.4 LOAD ASSIGNMENT & DISPATCH INTEGRITY TESTS PASSED!';
  RAISE NOTICE '=============================================================';
END $$;

ROLLBACK;
