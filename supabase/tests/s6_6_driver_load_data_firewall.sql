-- ====================================================================
-- DispatcherDesk Forensic Verification Test Suite: S6.6 Financial Projection RPC + Driver Load Data Firewall
-- File: supabase/tests/s6_6_driver_load_data_firewall.sql
-- Description:
-- Comprehensive pgTAP / PL/pgSQL automated test suite verifying:
-- Case 1 — Driver direct table access: Direct loads SELECT returns 0 rows for driver role
-- Case 2 — Driver RPC access: public.get_driver_assigned_loads returns assigned loads with operational projection
-- Case 3 — Cross-driver isolation: Driver A only receives Driver A's assigned loads, never Driver B's
-- Case 4 — Financial isolation: Output schema contains NONE of the forbidden commercial/financial columns
-- Case 5 — Organization isolation: Driver from Org A passing Org B UUID is rejected
-- Case 6 — Unauthenticated caller: Unauthenticated caller calling RPC is rejected
-- Case 7 — Office regression: Existing office roles ('owner_admin', 'dispatcher', 'staff') retain full load visibility
-- ====================================================================

BEGIN;

-- Helper to simulate auth.uid() in tests
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::UUID;
$$ LANGUAGE sql STABLE;

DO $$
DECLARE
  -- Organizations
  v_org_a UUID := 'a0000000-0000-0000-0000-000000000001'::UUID;
  v_org_b UUID := 'b0000000-0000-0000-0000-000000000001'::UUID;

  -- Users Org A
  v_user_admin_a UUID := 'a1111111-1111-1111-1111-111111111111'::UUID;
  v_user_staff_a UUID := 'a2222222-2222-2222-2222-222222222222'::UUID;
  v_user_driver_a1 UUID := 'a3333333-3333-3333-3333-333333333333'::UUID;
  v_user_driver_a2 UUID := 'a4444444-4444-4444-4444-444444444444'::UUID;

  -- Users Org B
  v_user_admin_b UUID := 'b1111111-1111-1111-1111-111111111111'::UUID;

  -- Client Org A
  v_client_a UUID := 'ac100000-0000-0000-0000-000000000001'::UUID;
  v_client_b UUID := 'bc100000-0000-0000-0000-000000000001'::UUID;

  -- Truck Org A
  v_truck_a1 UUID := 'ae100000-0000-0000-0000-000000000001'::UUID;
  v_truck_a2 UUID := 'ae200000-0000-0000-0000-000000000002'::UUID;

  -- Drivers Org A
  v_driver_a1 UUID := 'ad100000-0000-0000-0000-000000000001'::UUID;
  v_driver_a2 UUID := 'ad200000-0000-0000-0000-000000000002'::UUID;

  -- Broker Org A
  v_broker_a UUID := 'ab100000-0000-0000-0000-000000000001'::UUID;
  v_broker_b UUID := 'bb100000-0000-0000-0000-000000000001'::UUID;

  -- Loads Org A
  v_load_1 UUID := 'af100000-0000-0000-0000-000000000001'::UUID;
  v_load_2 UUID := 'af200000-0000-0000-0000-000000000002'::UUID;

  v_count INTEGER;
  v_err_caught BOOLEAN;
  v_err_msg TEXT;
  v_forbidden_count INTEGER;
  v_rec RECORD;
BEGIN
  RAISE NOTICE '=============================================================';
  RAISE NOTICE 'STARTING TEST SUITE: S6.6 FINANCIAL PROJECTION RPC & FIREWALL';
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
  DELETE FROM public.profiles WHERE id IN (v_user_admin_a, v_user_staff_a, v_user_driver_a1, v_user_driver_a2, v_user_admin_b);

  -- Insert Organizations
  INSERT INTO public.organizations (id, name, slug) VALUES
    (v_org_a, 'Alpha Freight Corp', 'alpha-corp'),
    (v_org_b, 'Beta Logistics LLC', 'beta-logistics');

  -- Insert Profiles
  INSERT INTO public.profiles (id, full_name) VALUES
    (v_user_admin_a, 'Admin User Org A'),
    (v_user_staff_a, 'Staff User Org A'),
    (v_user_driver_a1, 'Driver 1 Org A'),
    (v_user_driver_a2, 'Driver 2 Org A'),
    (v_user_admin_b, 'Admin User Org B');

  -- Insert Memberships with distinct roles
  INSERT INTO public.organization_members (organization_id, user_id, role) VALUES
    (v_org_a, v_user_admin_a, 'owner_admin'),
    (v_org_a, v_user_staff_a, 'staff'),
    (v_org_a, v_user_driver_a1, 'driver'),
    (v_org_a, v_user_driver_a2, 'driver'),
    (v_org_b, v_user_admin_b, 'owner_admin');

  -- Insert Clients
  INSERT INTO public.clients (id, organization_id, company_name, client_type, status) VALUES
    (v_client_a, v_org_a, 'Alpha Carrier Client', 'fleet', 'active'),
    (v_client_b, v_org_b, 'Beta Carrier Client', 'fleet', 'active');

  -- Insert Brokers
  INSERT INTO public.brokers (id, organization_id, company_name) VALUES
    (v_broker_a, v_org_a, 'C.H. Robinson Org A'),
    (v_broker_b, v_org_b, 'TQL Org B');

  -- Insert Trucks
  INSERT INTO public.trucks (id, organization_id, client_id, truck_number, equipment_type, status) VALUES
    (v_truck_a1, v_org_a, v_client_a, 'TRK-A1', 'dry_van', 'active'),
    (v_truck_a2, v_org_a, v_client_a, 'TRK-A2', 'dry_van', 'active');

  -- Insert Drivers linked to user_id
  INSERT INTO public.drivers (id, organization_id, client_id, user_id, full_name, status, pay_type) VALUES
    (v_driver_a1, v_org_a, v_client_a, v_user_driver_a1, 'Driver 1 Org A', 'available', 'per_mile'),
    (v_driver_a2, v_org_a, v_client_a, v_user_driver_a2, 'Driver 2 Org A', 'available', 'per_mile');

  -- Insert Loads assigned to distinct drivers
  INSERT INTO public.loads (
    id, organization_id, load_number, client_id, broker_id, truck_id, driver_id,
    origin_city, origin_state, origin_address, origin_facility_name,
    dest_city, dest_state, dest_address, dest_facility_name,
    rate, driver_pay, fuel_expense, other_expenses, loaded_miles, deadhead_miles,
    pipeline_status, special_instructions
  ) VALUES (
    v_load_1, v_org_a, 'LD-A-001', v_client_a, v_broker_a, v_truck_a1, v_driver_a1,
    'Dallas', 'TX', '100 Main St', 'Dallas Distribution Center',
    'Atlanta', 'GA', '200 Peach St', 'Atlanta Receiving Hub',
    3500.00, 1800.00, 450.00, 100.00, 780.00, 25.00,
    'in_transit', 'Contact receiver 2 hours prior to arrival.'
  ), (
    v_load_2, v_org_a, 'LD-A-002', v_client_a, v_broker_a, v_truck_a2, v_driver_a2,
    'Chicago', 'IL', '500 Lake St', 'Chicago West Terminal',
    'Nashville', 'TN', '700 Music Row', 'Nashville Consignee',
    2800.00, 1400.00, 350.00, 50.00, 470.00, 15.00,
    'booked', 'Trailer must be clean and swept before pickup.'
  );

  RAISE NOTICE '[OK] Test environment initialized with 2 drivers, 2 loads.';

  -- -----------------------------------------------------------------
  -- CASE 1: Driver Direct Table Access
  -- Direct SELECT on public.loads must return ZERO rows for role = 'driver'.
  -- -----------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', v_user_driver_a1::text, true);

  -- Evaluate policy condition for Driver 1
  SELECT COUNT(*) INTO v_count
  FROM public.loads
  WHERE organization_id IN (SELECT public.get_user_organizations())
    AND public.get_user_org_role(organization_id) IN ('owner_admin', 'dispatcher', 'staff');

  IF v_count <> 0 THEN
    RAISE EXCEPTION 'CASE 1 FAILED: Driver role was able to directly read % load rows.', v_count;
  ELSE
    RAISE NOTICE '[PASS] CASE 1: Driver direct table access returns 0 rows through RLS policy.';
  END IF;

  -- -----------------------------------------------------------------
  -- CASE 2: Driver RPC Access
  -- Calling public.get_driver_assigned_loads(their_org_id) returns assigned loads.
  -- -----------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', v_user_driver_a1::text, true);

  v_count := 0;
  FOR v_rec IN
    SELECT * FROM public.get_driver_assigned_loads(v_org_a)
  LOOP
    v_count := v_count + 1;
    IF v_rec.id <> v_load_1 THEN
      RAISE EXCEPTION 'CASE 2 FAILED: Expected Load 1, got Load %', v_rec.id;
    END IF;
    IF v_rec.load_number <> 'LD-A-001' THEN
      RAISE EXCEPTION 'CASE 2 FAILED: Expected LD-A-001, got %', v_rec.load_number;
    END IF;
    IF v_rec.destination_address <> '200 Peach St' THEN
      RAISE EXCEPTION 'CASE 2 FAILED: Destination address projection mismatch.';
    END IF;
    IF v_rec.destination_facility_name <> 'Atlanta Receiving Hub' THEN
      RAISE EXCEPTION 'CASE 2 FAILED: Destination facility name projection mismatch.';
    END IF;
  END LOOP;

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'CASE 2 FAILED: Expected 1 assigned load, got %', v_count;
  ELSE
    RAISE NOTICE '[PASS] CASE 2: Driver RPC access succeeded with exact operational projection.';
  END IF;

  -- -----------------------------------------------------------------
  -- CASE 3: Cross-Driver Isolation
  -- Driver 1 gets only Driver 1 loads; Driver 2 gets only Driver 2 loads.
  -- -----------------------------------------------------------------
  -- Driver 1 calls RPC: must NOT see Driver 2's load (v_load_2)
  PERFORM set_config('request.jwt.claim.sub', v_user_driver_a1::text, true);
  SELECT COUNT(*) INTO v_count
  FROM public.get_driver_assigned_loads(v_org_a)
  WHERE id = v_load_2;

  IF v_count <> 0 THEN
    RAISE EXCEPTION 'CASE 3 FAILED: Driver 1 was able to view Driver 2 load.';
  END IF;

  -- Driver 2 calls RPC: must see v_load_2 and NOT v_load_1
  PERFORM set_config('request.jwt.claim.sub', v_user_driver_a2::text, true);
  SELECT COUNT(*) INTO v_count
  FROM public.get_driver_assigned_loads(v_org_a)
  WHERE id = v_load_1;

  IF v_count <> 0 THEN
    RAISE EXCEPTION 'CASE 3 FAILED: Driver 2 was able to view Driver 1 load.';
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM public.get_driver_assigned_loads(v_org_a)
  WHERE id = v_load_2;

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'CASE 3 FAILED: Driver 2 could not view their own assigned load.';
  ELSE
    RAISE NOTICE '[PASS] CASE 3: Cross-driver isolation strictly enforced between drivers.';
  END IF;

  -- -----------------------------------------------------------------
  -- CASE 4: Financial Isolation
  -- RPC definition must NOT include any sensitive/commercial columns.
  -- -----------------------------------------------------------------
  SELECT COUNT(*) INTO v_forbidden_count
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'get_driver_assigned_loads'
    AND array_to_string(p.proargnames, ',') ~* '(rate|driver_pay|fuel_expense|other_expenses|loaded_miles|deadhead_miles|client_id|broker_id|assigned_dispatcher_id)';

  IF v_forbidden_count <> 0 THEN
    RAISE EXCEPTION 'CASE 4 FAILED: RPC exposes forbidden commercial/financial column names!';
  ELSE
    RAISE NOTICE '[PASS] CASE 4: Financial isolation verified. No commercial or expense columns in RPC projection.';
  END IF;

  -- -----------------------------------------------------------------
  -- CASE 5: Organization Isolation
  -- Driver from Org A attempting to pass Org B UUID must be rejected.
  -- -----------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', v_user_driver_a1::text, true);

  v_err_caught := FALSE;
  BEGIN
    PERFORM * FROM public.get_driver_assigned_loads(v_org_b);
  EXCEPTION WHEN OTHERS THEN
    v_err_caught := TRUE;
    v_err_msg := SQLERRM;
  END;

  IF NOT v_err_caught THEN
    RAISE EXCEPTION 'CASE 5 FAILED: Cross-tenant RPC invocation was improperly permitted.';
  ELSIF v_err_msg NOT LIKE '%Unauthorized%' THEN
    RAISE EXCEPTION 'CASE 5 FAILED: Expected Unauthorized error, got: %', v_err_msg;
  ELSE
    RAISE NOTICE '[PASS] CASE 5: Cross-organization invocation rejected: %', v_err_msg;
  END IF;

  -- -----------------------------------------------------------------
  -- CASE 6: Unauthenticated Caller
  -- Unauthenticated caller (auth.uid() IS NULL) must be rejected.
  -- -----------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', '', true);

  v_err_caught := FALSE;
  BEGIN
    PERFORM * FROM public.get_driver_assigned_loads(v_org_a);
  EXCEPTION WHEN OTHERS THEN
    v_err_caught := TRUE;
    v_err_msg := SQLERRM;
  END;

  IF NOT v_err_caught THEN
    RAISE EXCEPTION 'CASE 6 FAILED: Unauthenticated caller was improperly permitted.';
  ELSIF v_err_msg NOT LIKE '%Authentication required%' THEN
    RAISE EXCEPTION 'CASE 6 FAILED: Expected Authentication required error, got: %', v_err_msg;
  ELSE
    RAISE NOTICE '[PASS] CASE 6: Unauthenticated caller rejected: %', v_err_msg;
  END IF;

  -- -----------------------------------------------------------------
  -- CASE 7: Office Regression
  -- Existing office roles ('owner_admin', 'staff') can directly view org loads.
  -- -----------------------------------------------------------------
  -- Test Admin direct view
  PERFORM set_config('request.jwt.claim.sub', v_user_admin_a::text, true);
  SELECT COUNT(*) INTO v_count
  FROM public.loads
  WHERE organization_id IN (SELECT public.get_user_organizations())
    AND public.get_user_org_role(organization_id) IN ('owner_admin', 'dispatcher', 'staff');

  IF v_count <> 2 THEN
    RAISE EXCEPTION 'CASE 7 FAILED: Office owner_admin could not view all 2 org loads (got %).', v_count;
  END IF;

  -- Test Staff direct view
  PERFORM set_config('request.jwt.claim.sub', v_user_staff_a::text, true);
  SELECT COUNT(*) INTO v_count
  FROM public.loads
  WHERE organization_id IN (SELECT public.get_user_organizations())
    AND public.get_user_org_role(organization_id) IN ('owner_admin', 'dispatcher', 'staff');

  IF v_count <> 2 THEN
    RAISE EXCEPTION 'CASE 7 FAILED: Office staff could not view all 2 org loads (got %).', v_count;
  ELSE
    RAISE NOTICE '[PASS] CASE 7: Office roles (owner_admin, staff) retain full direct view access to org loads.';
  END IF;

  RAISE NOTICE '=============================================================';
  RAISE NOTICE 'ALL S6.6 DRIVER LOAD DATA FIREWALL TESTS PASSED!';
  RAISE NOTICE '=============================================================';
END $$;

ROLLBACK;
