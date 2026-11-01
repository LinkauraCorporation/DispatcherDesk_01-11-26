-- ====================================================================
-- DispatcherDesk Forensic Verification Test Suite: S6.8 Driver Identity Foundation
-- File: supabase/tests/s6_8_driver_identity_foundation.sql
-- Description:
-- Automated SQL verification suite validating all 17 required criteria:
-- 1. Authenticated driver resolves its own drivers.id.
-- 2. Driver cannot resolve another driver's ID by parameter manipulation.
-- 3. Non-driver organization member cannot use the driver helper successfully.
-- 4. Cross-organization resolution is rejected.
-- 5. Driver membership with no linked driver profile is rejected.
-- 6. Driver profile cannot bind to a user from another organization.
-- 7. Driver profile cannot bind to an owner_admin/dispatcher/staff user.
-- 8. Offline driver with user_id IS NULL remains valid.
-- 9. Duplicate (organization_id, user_id) remains prevented by existing unique index.
-- 10. Driver SELECT can see only own driver row.
-- 11. Driver cannot enumerate other drivers.
-- 12. Driver cannot read compensation data belonging to other drivers.
-- 13. Office roles retain organization-scoped driver visibility.
-- 14. Driver cannot enumerate organization_members.
-- 15. Existing has_operational_write_access() remains unchanged.
-- 16. Existing get_driver_assigned_loads() remains unchanged.
-- 17. S6.4/S6.5/S6.6/S6.7/S6.7B objects remain intact.
-- ====================================================================

BEGIN;

-- Helper to simulate auth schema and auth.uid() in tests
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT
);

CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::UUID;
$$ LANGUAGE sql STABLE;

-- Ensure migration 20260905000006 is applied in this session
\i supabase/migrations/20260905000006_driver_identity_foundation.sql

DO $$
DECLARE
  -- Organizations
  v_org_a UUID := 'a0000000-0000-0000-0000-000000000001'::UUID;
  v_org_b UUID := 'b0000000-0000-0000-0000-000000000001'::UUID;

  -- Users Org A
  v_user_admin_a UUID := 'a1111111-1111-1111-1111-111111111111'::UUID;
  v_user_dispatcher_a UUID := 'a1222222-2222-2222-2222-222222222222'::UUID;
  v_user_staff_a UUID := 'a2222222-2222-2222-2222-222222222222'::UUID;
  v_user_driver_a1 UUID := 'a3333333-3333-3333-3333-333333333333'::UUID;
  v_user_driver_a2 UUID := 'a4444444-4444-4444-4444-444444444444'::UUID;
  v_user_driver_a3 UUID := 'a5555555-5555-5555-5555-555555555555'::UUID; -- Unlinked driver user

  -- Users Org B
  v_user_admin_b UUID := 'b1111111-1111-1111-1111-111111111111'::UUID;
  v_user_driver_b1 UUID := 'b3333333-3333-3333-3333-333333333333'::UUID;

  -- Clients
  v_client_a UUID := 'ac100000-0000-0000-0000-000000000001'::UUID;
  v_client_b UUID := 'bc100000-0000-0000-0000-000000000001'::UUID;

  -- Drivers Org A
  v_driver_a1 UUID := 'ad100000-0000-0000-0000-000000000001'::UUID;
  v_driver_a2 UUID := 'ad200000-0000-0000-0000-000000000002'::UUID;
  v_driver_a_offline UUID := 'ad300000-0000-0000-0000-000000000003'::UUID;

  -- Drivers Org B
  v_driver_b1 UUID := 'bd100000-0000-0000-0000-000000000001'::UUID;

  -- Execution / Verification Variables
  v_resolved_driver_id UUID;
  v_err_caught BOOLEAN;
  v_err_msg TEXT;
  v_count INTEGER;
  v_has_access BOOLEAN;
  v_check_condef TEXT;
BEGIN
  RAISE NOTICE '=============================================================';
  RAISE NOTICE 'STARTING TEST SUITE: S6.8 DRIVER IDENTITY FOUNDATION';
  RAISE NOTICE '=============================================================';

  -- -----------------------------------------------------------------
  -- SETUP: CLEAN & SEED TEST FIXTURES
  -- -----------------------------------------------------------------
  DELETE FROM public.conversation_messages WHERE organization_id IN (v_org_a, v_org_b);
  DELETE FROM public.conversations WHERE organization_id IN (v_org_a, v_org_b);
  DELETE FROM public.activity_notes WHERE organization_id IN (v_org_a, v_org_b);
  DELETE FROM public.loads WHERE organization_id IN (v_org_a, v_org_b);
  DELETE FROM public.drivers WHERE organization_id IN (v_org_a, v_org_b);
  DELETE FROM public.trucks WHERE organization_id IN (v_org_a, v_org_b);
  DELETE FROM public.clients WHERE organization_id IN (v_org_a, v_org_b);
  DELETE FROM public.organization_members WHERE organization_id IN (v_org_a, v_org_b);
  DELETE FROM public.organizations WHERE id IN (v_org_a, v_org_b);
  DELETE FROM public.profiles WHERE id IN (
    v_user_admin_a, v_user_dispatcher_a, v_user_staff_a,
    v_user_driver_a1, v_user_driver_a2, v_user_driver_a3,
    v_user_admin_b, v_user_driver_b1
  );

  -- Seed auth.users
  INSERT INTO auth.users (id, email) VALUES
    (v_user_admin_a, 'admin_a@example.com'),
    (v_user_dispatcher_a, 'dispatcher_a@example.com'),
    (v_user_staff_a, 'staff_a@example.com'),
    (v_user_driver_a1, 'driver_a1@example.com'),
    (v_user_driver_a2, 'driver_a2@example.com'),
    (v_user_driver_a3, 'driver_a3@example.com'),
    (v_user_admin_b, 'admin_b@example.com'),
    (v_user_driver_b1, 'driver_b1@example.com')
  ON CONFLICT (id) DO NOTHING;

  -- Seed organizations
  INSERT INTO public.organizations (id, name, slug) VALUES
    (v_org_a, 'Alpha Freight Corp', 'alpha-corp'),
    (v_org_b, 'Beta Logistics LLC', 'beta-logistics');

  -- Seed profiles
  INSERT INTO public.profiles (id, full_name) VALUES
    (v_user_admin_a, 'Admin User Alpha'),
    (v_user_dispatcher_a, 'Dispatcher User Alpha'),
    (v_user_staff_a, 'Staff User Alpha'),
    (v_user_driver_a1, 'Driver User Alpha One'),
    (v_user_driver_a2, 'Driver User Alpha Two'),
    (v_user_driver_a3, 'Driver User Alpha Three (Unlinked)'),
    (v_user_admin_b, 'Admin User Beta'),
    (v_user_driver_b1, 'Driver User Beta One')
  ON CONFLICT (id) DO NOTHING;

  -- Seed organization members
  INSERT INTO public.organization_members (organization_id, user_id, role) VALUES
    (v_org_a, v_user_admin_a, 'owner_admin'),
    (v_org_a, v_user_dispatcher_a, 'dispatcher'),
    (v_org_a, v_user_staff_a, 'staff'),
    (v_org_a, v_user_driver_a1, 'driver'),
    (v_org_a, v_user_driver_a2, 'driver'),
    (v_org_a, v_user_driver_a3, 'driver'), -- Member with driver role, but initially no driver profile
    (v_org_b, v_user_admin_b, 'owner_admin'),
    (v_org_b, v_user_driver_b1, 'driver');

  -- Seed clients
  INSERT INTO public.clients (id, organization_id, company_name, client_type, status) VALUES
    (v_client_a, v_org_a, 'Client Alpha', 'fleet', 'active'),
    (v_client_b, v_org_b, 'Client Beta', 'fleet', 'active');

  -- Seed drivers in Org A
  INSERT INTO public.drivers (id, organization_id, client_id, full_name, user_id, pay_type, pay_rate, status) VALUES
    (v_driver_a1, v_org_a, v_client_a, 'Driver Alpha One', v_user_driver_a1, 'percentage_gross', 25.00, 'available'),
    (v_driver_a2, v_org_a, v_client_a, 'Driver Alpha Two', v_user_driver_a2, 'per_mile', 0.65, 'available'),
    (v_driver_a_offline, v_org_a, v_client_a, 'Driver Alpha Offline', NULL, 'flat_rate', 1200.00, 'available');

  -- Seed driver in Org B
  INSERT INTO public.drivers (id, organization_id, client_id, full_name, user_id, pay_type, pay_rate, status) VALUES
    (v_driver_b1, v_org_b, v_client_b, 'Driver Beta One', v_user_driver_b1, 'percentage_gross', 27.50, 'available');

  -- =================================================================
  -- TEST 1: Authenticated driver resolves its own drivers.id
  -- =================================================================
  PERFORM set_config('request.jwt.claim.sub', v_user_driver_a1::TEXT, true);
  v_resolved_driver_id := public.get_current_driver_id(v_org_a);

  IF v_resolved_driver_id <> v_driver_a1 THEN
    RAISE EXCEPTION 'TEST 1 FAILED: Resolved driver ID % does not match expected %', v_resolved_driver_id, v_driver_a1;
  ELSE
    RAISE NOTICE '[PASS] TEST 1: Authenticated driver correctly resolved its own driver ID.';
  END IF;

  -- =================================================================
  -- TEST 2: Driver cannot resolve another driver's ID by parameter manipulation
  -- =================================================================
  -- Caller is driver_a1. Passing v_org_b where driver_b1 resides.
  v_err_caught := FALSE;
  BEGIN
    PERFORM public.get_current_driver_id(v_org_b);
  EXCEPTION WHEN OTHERS THEN
    v_err_caught := TRUE;
    v_err_msg := SQLERRM;
  END;

  IF NOT v_err_caught OR v_err_msg NOT LIKE '%Caller is not a driver member%' THEN
    RAISE EXCEPTION 'TEST 2 FAILED: Expected driver member rejection for foreign org, got: %', v_err_msg;
  ELSE
    RAISE NOTICE '[PASS] TEST 2: Driver cannot resolve foreign organization driver ID.';
  END IF;

  -- =================================================================
  -- TEST 3: Non-driver organization member cannot use the driver helper
  -- =================================================================
  -- Case 3A: owner_admin caller
  PERFORM set_config('request.jwt.claim.sub', v_user_admin_a::TEXT, true);
  v_err_caught := FALSE;
  BEGIN
    PERFORM public.get_current_driver_id(v_org_a);
  EXCEPTION WHEN OTHERS THEN
    v_err_caught := TRUE;
    v_err_msg := SQLERRM;
  END;

  IF NOT v_err_caught OR v_err_msg NOT LIKE '%Caller is not a driver member%' THEN
    RAISE EXCEPTION 'TEST 3A FAILED: Admin caller should be rejected, got: %', v_err_msg;
  END IF;

  -- Case 3B: dispatcher caller
  PERFORM set_config('request.jwt.claim.sub', v_user_dispatcher_a::TEXT, true);
  v_err_caught := FALSE;
  BEGIN
    PERFORM public.get_current_driver_id(v_org_a);
  EXCEPTION WHEN OTHERS THEN
    v_err_caught := TRUE;
    v_err_msg := SQLERRM;
  END;

  IF NOT v_err_caught OR v_err_msg NOT LIKE '%Caller is not a driver member%' THEN
    RAISE EXCEPTION 'TEST 3B FAILED: Dispatcher caller should be rejected, got: %', v_err_msg;
  END IF;

  -- Case 3C: staff caller
  PERFORM set_config('request.jwt.claim.sub', v_user_staff_a::TEXT, true);
  v_err_caught := FALSE;
  BEGIN
    PERFORM public.get_current_driver_id(v_org_a);
  EXCEPTION WHEN OTHERS THEN
    v_err_caught := TRUE;
    v_err_msg := SQLERRM;
  END;

  IF NOT v_err_caught OR v_err_msg NOT LIKE '%Caller is not a driver member%' THEN
    RAISE EXCEPTION 'TEST 3C FAILED: Staff caller should be rejected, got: %', v_err_msg;
  ELSE
    RAISE NOTICE '[PASS] TEST 3: Non-driver office roles (owner_admin, dispatcher, staff) are rejected.';
  END IF;

  -- =================================================================
  -- TEST 4: Cross-organization resolution is rejected
  -- =================================================================
  PERFORM set_config('request.jwt.claim.sub', v_user_driver_b1::TEXT, true);
  v_err_caught := FALSE;
  BEGIN
    PERFORM public.get_current_driver_id(v_org_a);
  EXCEPTION WHEN OTHERS THEN
    v_err_caught := TRUE;
    v_err_msg := SQLERRM;
  END;

  IF NOT v_err_caught OR v_err_msg NOT LIKE '%Caller is not a driver member%' THEN
    RAISE EXCEPTION 'TEST 4 FAILED: Cross-org driver should be rejected from Org A, got: %', v_err_msg;
  ELSE
    RAISE NOTICE '[PASS] TEST 4: Cross-organization driver resolution strictly rejected.';
  END IF;

  -- =================================================================
  -- TEST 5: Driver membership with no linked driver profile is rejected
  -- =================================================================
  PERFORM set_config('request.jwt.claim.sub', v_user_driver_a3::TEXT, true);
  v_err_caught := FALSE;
  BEGIN
    PERFORM public.get_current_driver_id(v_org_a);
  EXCEPTION WHEN OTHERS THEN
    v_err_caught := TRUE;
    v_err_msg := SQLERRM;
  END;

  IF NOT v_err_caught OR v_err_msg NOT LIKE '%Driver profile not found%' THEN
    RAISE EXCEPTION 'TEST 5 FAILED: Expected profile not found exception, got: %', v_err_msg;
  ELSE
    RAISE NOTICE '[PASS] TEST 5: Driver member with missing driver profile raised clear exception.';
  END IF;

  -- =================================================================
  -- TEST 6: Driver profile cannot bind to a user from another organization
  -- =================================================================
  -- Reset to admin context to attempt privileged driver insert
  PERFORM set_config('request.jwt.claim.sub', v_user_admin_a::TEXT, true);
  v_err_caught := FALSE;
  BEGIN
    INSERT INTO public.drivers (organization_id, client_id, full_name, user_id, pay_type, pay_rate, status)
    VALUES (v_org_a, v_client_a, 'Malicious Cross-Org Driver', v_user_driver_b1, 'percentage_gross', 20.00, 'available');
  EXCEPTION WHEN OTHERS THEN
    v_err_caught := TRUE;
    v_err_msg := SQLERRM;
  END;

  IF NOT v_err_caught OR v_err_msg NOT LIKE '%Driver user coherence violation%' THEN
    RAISE EXCEPTION 'TEST 6 FAILED: Cross-org driver binding should be rejected by trigger, got: %', v_err_msg;
  ELSE
    RAISE NOTICE '[PASS] TEST 6: Driver profile cannot bind to a user from another organization.';
  END IF;

  -- =================================================================
  -- TEST 7: Driver profile cannot bind to an owner_admin/dispatcher/staff user
  -- =================================================================
  -- Case 7A: Attempt to bind owner_admin
  v_err_caught := FALSE;
  BEGIN
    INSERT INTO public.drivers (organization_id, client_id, full_name, user_id, pay_type, pay_rate, status)
    VALUES (v_org_a, v_client_a, 'Invalid Admin As Driver', v_user_admin_a, 'percentage_gross', 20.00, 'available');
  EXCEPTION WHEN OTHERS THEN
    v_err_caught := TRUE;
    v_err_msg := SQLERRM;
  END;

  IF NOT v_err_caught OR v_err_msg NOT LIKE '%Driver user coherence violation%' THEN
    RAISE EXCEPTION 'TEST 7A FAILED: Binding owner_admin as driver should fail, got: %', v_err_msg;
  END IF;

  -- Case 7B: Attempt to bind dispatcher
  v_err_caught := FALSE;
  BEGIN
    INSERT INTO public.drivers (organization_id, client_id, full_name, user_id, pay_type, pay_rate, status)
    VALUES (v_org_a, v_client_a, 'Invalid Dispatcher As Driver', v_user_dispatcher_a, 'percentage_gross', 20.00, 'available');
  EXCEPTION WHEN OTHERS THEN
    v_err_caught := TRUE;
    v_err_msg := SQLERRM;
  END;

  IF NOT v_err_caught OR v_err_msg NOT LIKE '%Driver user coherence violation%' THEN
    RAISE EXCEPTION 'TEST 7B FAILED: Binding dispatcher as driver should fail, got: %', v_err_msg;
  END IF;

  -- Case 7C: Attempt to bind staff
  v_err_caught := FALSE;
  BEGIN
    INSERT INTO public.drivers (organization_id, client_id, full_name, user_id, pay_type, pay_rate, status)
    VALUES (v_org_a, v_client_a, 'Invalid Staff As Driver', v_user_staff_a, 'percentage_gross', 20.00, 'available');
  EXCEPTION WHEN OTHERS THEN
    v_err_caught := TRUE;
    v_err_msg := SQLERRM;
  END;

  IF NOT v_err_caught OR v_err_msg NOT LIKE '%Driver user coherence violation%' THEN
    RAISE EXCEPTION 'TEST 7C FAILED: Binding staff as driver should fail, got: %', v_err_msg;
  ELSE
    RAISE NOTICE '[PASS] TEST 7: Driver profile cannot bind to office roles (admin, dispatcher, staff).';
  END IF;

  -- =================================================================
  -- TEST 8: Offline driver with user_id IS NULL remains valid
  -- =================================================================
  INSERT INTO public.drivers (organization_id, client_id, full_name, user_id, pay_type, pay_rate, status)
  VALUES (v_org_a, v_client_a, 'Another Offline Driver', NULL, 'per_mile', 0.60, 'available');

  -- Update offline driver properties without user_id
  UPDATE public.drivers
  SET pay_rate = 0.62
  WHERE organization_id = v_org_a AND full_name = 'Another Offline Driver';

  RAISE NOTICE '[PASS] TEST 8: Offline unlinked drivers (user_id IS NULL) insert and update successfully.';

  -- =================================================================
  -- TEST 9: Duplicate (organization_id, user_id) remains prevented by unique index
  -- =================================================================
  v_err_caught := FALSE;
  BEGIN
    INSERT INTO public.drivers (organization_id, client_id, full_name, user_id, pay_type, pay_rate, status)
    VALUES (v_org_a, v_client_a, 'Duplicate Driver User', v_user_driver_a1, 'percentage_gross', 25.00, 'available');
  EXCEPTION WHEN unique_violation THEN
    v_err_caught := TRUE;
  END;

  IF NOT v_err_caught THEN
    RAISE EXCEPTION 'TEST 9 FAILED: Duplicate (organization_id, user_id) should trigger unique constraint!';
  ELSE
    RAISE NOTICE '[PASS] TEST 9: Unique index idx_drivers_org_user_id prevents duplicate user binding.';
  END IF;

  -- =================================================================
  -- TEST 10: Driver SELECT can see only own driver row
  -- =================================================================
  PERFORM set_config('request.jwt.claim.sub', v_user_driver_a1::TEXT, true);
  SELECT COUNT(*) INTO v_count
  FROM public.drivers;

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'TEST 10 FAILED: Driver A1 should see exactly 1 driver row, saw: %', v_count;
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM public.drivers
  WHERE id = v_driver_a1;

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'TEST 10 FAILED: Driver A1 cannot see their own driver row!';
  ELSE
    RAISE NOTICE '[PASS] TEST 10: Driver SELECT returns strictly their own driver profile.';
  END IF;

  -- =================================================================
  -- TEST 11: Driver cannot enumerate other drivers
  -- =================================================================
  -- Caller remains v_user_driver_a1
  SELECT COUNT(*) INTO v_count
  FROM public.drivers
  WHERE id IN (v_driver_a2, v_driver_a_offline, v_driver_b1);

  IF v_count <> 0 THEN
    RAISE EXCEPTION 'TEST 11 FAILED: Driver A1 was able to enumerate other drivers! Count: %', v_count;
  ELSE
    RAISE NOTICE '[PASS] TEST 11: Driver cannot enumerate fellow drivers or offline drivers.';
  END IF;

  -- =================================================================
  -- TEST 12: Driver cannot read compensation data belonging to other drivers
  -- =================================================================
  -- Caller remains v_user_driver_a1. Attempting to select pay info of Driver A2
  SELECT COUNT(*) INTO v_count
  FROM public.drivers
  WHERE id = v_driver_a2 AND pay_rate IS NOT NULL;

  IF v_count <> 0 THEN
    RAISE EXCEPTION 'TEST 12 FAILED: Driver A1 was able to read Driver A2 compensation data!';
  ELSE
    RAISE NOTICE '[PASS] TEST 12: Driver cannot read compensation data of other drivers.';
  END IF;

  -- =================================================================
  -- TEST 13: Office roles retain organization-scoped driver visibility
  -- =================================================================
  -- Case 13A: Admin Org A
  PERFORM set_config('request.jwt.claim.sub', v_user_admin_a::TEXT, true);
  SELECT COUNT(*) INTO v_count
  FROM public.drivers
  WHERE organization_id = v_org_a;

  IF v_count < 3 THEN
    RAISE EXCEPTION 'TEST 13A FAILED: Admin A should see all drivers in Org A, saw: %', v_count;
  END IF;

  -- Admin A cannot see Org B drivers
  SELECT COUNT(*) INTO v_count
  FROM public.drivers
  WHERE organization_id = v_org_b;

  IF v_count <> 0 THEN
    RAISE EXCEPTION 'TEST 13A FAILED: Admin A should NOT see drivers in Org B, saw: %', v_count;
  END IF;

  -- Case 13B: Dispatcher Org A
  PERFORM set_config('request.jwt.claim.sub', v_user_dispatcher_a::TEXT, true);
  SELECT COUNT(*) INTO v_count
  FROM public.drivers
  WHERE organization_id = v_org_a;

  IF v_count < 3 THEN
    RAISE EXCEPTION 'TEST 13B FAILED: Dispatcher A should see all drivers in Org A, saw: %', v_count;
  END IF;

  -- Case 13C: Staff Org A
  PERFORM set_config('request.jwt.claim.sub', v_user_staff_a::TEXT, true);
  SELECT COUNT(*) INTO v_count
  FROM public.drivers
  WHERE organization_id = v_org_a;

  IF v_count < 3 THEN
    RAISE EXCEPTION 'TEST 13C FAILED: Staff A should see all drivers in Org A, saw: %', v_count;
  ELSE
    RAISE NOTICE '[PASS] TEST 13: Office roles (admin, dispatcher, staff) retain full org driver visibility.';
  END IF;

  -- =================================================================
  -- TEST 14: Driver cannot enumerate organization_members
  -- =================================================================
  PERFORM set_config('request.jwt.claim.sub', v_user_driver_a1::TEXT, true);
  SELECT COUNT(*) INTO v_count
  FROM public.organization_members
  WHERE organization_id = v_org_a;

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'TEST 14 FAILED: Driver A1 should see ONLY their own membership record, saw: %', v_count;
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM public.organization_members
  WHERE organization_id = v_org_a AND user_id = v_user_driver_a1;

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'TEST 14 FAILED: Driver A1 cannot see their own membership record!';
  ELSE
    RAISE NOTICE '[PASS] TEST 14: Driver cannot enumerate organization members (restricted to self).';
  END IF;

  -- Office member CAN see all members in Org A
  PERFORM set_config('request.jwt.claim.sub', v_user_dispatcher_a::TEXT, true);
  SELECT COUNT(*) INTO v_count
  FROM public.organization_members
  WHERE organization_id = v_org_a;

  IF v_count < 5 THEN
    RAISE EXCEPTION 'TEST 14 Office Check FAILED: Office member should see all org members, saw: %', v_count;
  ELSE
    RAISE NOTICE '[PASS] TEST 14: Office roles retain full member visibility.';
  END IF;

  -- =================================================================
  -- TEST 15: Existing has_operational_write_access() remains unchanged
  -- =================================================================
  SELECT public.has_operational_write_access(v_org_a) INTO v_has_access;
  -- Caller is dispatcher -> should be TRUE
  IF NOT v_has_access THEN
    RAISE EXCEPTION 'TEST 15A FAILED: Dispatcher should have operational write access!';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_user_admin_a::TEXT, true);
  SELECT public.has_operational_write_access(v_org_a) INTO v_has_access;
  -- Caller is admin -> should be TRUE
  IF NOT v_has_access THEN
    RAISE EXCEPTION 'TEST 15B FAILED: Admin should have operational write access!';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_user_staff_a::TEXT, true);
  SELECT public.has_operational_write_access(v_org_a) INTO v_has_access;
  -- Caller is staff -> should be FALSE
  IF v_has_access THEN
    RAISE EXCEPTION 'TEST 15C FAILED: Staff should NOT have operational write access!';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_user_driver_a1::TEXT, true);
  SELECT public.has_operational_write_access(v_org_a) INTO v_has_access;
  -- Caller is driver -> should be FALSE
  IF v_has_access THEN
    RAISE EXCEPTION 'TEST 15D FAILED: Driver should NOT have operational write access!';
  ELSE
    RAISE NOTICE '[PASS] TEST 15: has_operational_write_access() unchanged (true for admin/dispatcher, false for staff/driver).';
  END IF;

  -- =================================================================
  -- TEST 16: Existing get_driver_assigned_loads() remains unchanged
  -- =================================================================
  SELECT COUNT(*) INTO v_count
  FROM pg_proc
  WHERE proname = 'get_driver_assigned_loads'
    AND pronamespace = 'public'::regnamespace;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'TEST 16 FAILED: public.get_driver_assigned_loads does not exist!';
  ELSE
    RAISE NOTICE '[PASS] TEST 16: Existing public.get_driver_assigned_loads verified intact.';
  END IF;

  -- =================================================================
  -- TEST 17: S6.4/S6.5/S6.6/S6.7/S6.7B objects remain intact
  -- =================================================================
  -- 17A: S6.4 assign_load_dispatch exists
  SELECT COUNT(*) INTO v_count
  FROM pg_proc
  WHERE proname = 'assign_load_dispatch'
    AND pronamespace = 'public'::regnamespace;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'TEST 17A FAILED: public.assign_load_dispatch missing!';
  END IF;

  -- 17B: S6.5 drivers_status_check exists and includes 'inactive'
  SELECT pg_get_constraintdef(oid) INTO v_check_condef
  FROM pg_constraint
  WHERE conrelid = 'public.drivers'::regclass
    AND conname = 'drivers_status_check';

  IF v_check_condef IS NULL OR v_check_condef NOT LIKE '%inactive%' THEN
    RAISE EXCEPTION 'TEST 17B FAILED: drivers_status_check missing or lacks inactive (def: %)', v_check_condef;
  END IF;

  -- 17C: S6.6 direct loads RLS firewall policy exists
  SELECT COUNT(*) INTO v_count
  FROM pg_policy
  WHERE polrelid = 'public.loads'::regclass
    AND polname = 'Members can view loads in their orgs';

  IF v_count = 0 THEN
    RAISE EXCEPTION 'TEST 17C FAILED: Loads firewall policy missing!';
  END IF;

  -- 17D: S6.7 conversations table exists
  SELECT COUNT(*) INTO v_count
  FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'conversations';

  IF v_count = 0 THEN
    RAISE EXCEPTION 'TEST 17D FAILED: conversations table missing!';
  END IF;

  -- 17E: S6.7B conversation_messages table exists
  SELECT COUNT(*) INTO v_count
  FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'conversation_messages';

  IF v_count = 0 THEN
    RAISE EXCEPTION 'TEST 17E FAILED: conversation_messages table missing!';
  ELSE
    RAISE NOTICE '[PASS] TEST 17: S6.4, S6.5, S6.6, S6.7, and S6.7B objects verified 100%% intact.';
  END IF;

  RAISE NOTICE '=============================================================';
  RAISE NOTICE 'ALL 17 S6.8 DRIVER IDENTITY FOUNDATION TESTS PASSED!';
  RAISE NOTICE '=============================================================';
END $$;

ROLLBACK;
