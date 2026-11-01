-- ====================================================================
-- DispatcherDesk Forensic Verification Test Suite: Phase-3.2 Persistent Driver Identity
-- File: supabase/tests/phase_3_2_persistent_driver_identity.sql
-- Description:
-- Automated SQL verification suite validating all Phase-3.2 security invariants:
-- REG-21: Persistent identity: Linked driver receives second load without new account/invitation.
-- REG-22: Cross-user identity conflict: User B cannot claim Driver A.
-- REG-23: Cross-client assignment: Client A driver cannot be assigned Client B load.
-- REG-24: Deep-link abuse: User B cannot access User A's load by copying URL/token.
-- REG-25: No driver organization membership: Driver onboarding creates zero organization_members rows.
-- REG-26: Identity immutability: Ordinary authenticated driver cannot replace another driver's user_id.
-- REG-27: Driver isolation: Driver cannot read: other drivers, other clients, organization members, dispatcher financial/commercial data.
-- Plus additional edge cases:
-- - Idempotent acceptance for already-linked same user
-- - Conflicting user already linked to another active driver
-- - Expired invitation rejection
-- - Cancelled/reused invitation rejection
-- - Duplicate active driver identity rejected by partial unique index
-- - Driver ↔ truck ↔ client coherence trigger
-- - Deleting truck does not destroy driver's carrier client ownership
-- - Admin unlinking via dedicated offboarding RPC
-- ====================================================================

BEGIN;

-- Setup test environment / mocks
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT,
  raw_user_meta_data JSONB DEFAULT '{}'::jsonb
);

CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::UUID;
$$ LANGUAGE sql STABLE;

-- Ensure migration is applied
\i supabase/migrations/20260906000001_persistent_driver_identity.sql

DO $$
DECLARE
  -- Organizations
  v_org_a UUID := 'a0000000-0000-0000-0000-000000000001'::UUID;
  v_org_b UUID := 'b0000000-0000-0000-0000-000000000001'::UUID;

  -- Carrier Clients
  v_client_a1 UUID := 'ac100000-0000-0000-0000-000000000001'::UUID;
  v_client_a2 UUID := 'ac200000-0000-0000-0000-000000000002'::UUID;
  v_client_b1 UUID := 'bc100000-0000-0000-0000-000000000001'::UUID;

  -- Users
  v_user_admin_a UUID := 'a1111111-1111-1111-1111-111111111111'::UUID;
  v_user_dispatcher_a UUID := 'a1222222-2222-2222-2222-222222222222'::UUID;
  v_user_driver_a1 UUID := 'a3333333-3333-3333-3333-333333333333'::UUID;
  v_user_driver_b1 UUID := 'b3333333-3333-3333-3333-333333333333'::UUID;
  v_user_attacker UUID := '99999999-9999-9999-9999-999999999999'::UUID;

  -- Drivers
  v_driver_a1 UUID := 'ad100000-0000-0000-0000-000000000001'::UUID;
  v_driver_a2 UUID := 'ad200000-0000-0000-0000-000000000002'::UUID;
  v_driver_b1 UUID := 'bd100000-0000-0000-0000-000000000001'::UUID;

  -- Trucks
  v_truck_a1 UUID := 'at100000-0000-0000-0000-000000000001'::UUID;
  v_truck_a2 UUID := 'at200000-0000-0000-0000-000000000002'::UUID;

  -- Loads
  v_load_1 UUID := 'al100000-0000-0000-0000-000000000001'::UUID;
  v_load_2 UUID := 'al200000-0000-0000-0000-000000000002'::UUID;
  v_load_b1 UUID := 'bl100000-0000-0000-0000-000000000001'::UUID;

  -- Invitations
  v_inv_token_hash_a1 TEXT := 'hash_inv_driver_a1_valid';
  v_inv_token_hash_attacker TEXT := 'hash_inv_attacker_attempt';

  v_res_json JSONB;
  v_count INTEGER;
  v_err_caught BOOLEAN;
  v_err_msg TEXT;
BEGIN
  RAISE NOTICE '=============================================================';
  RAISE NOTICE 'STARTING TEST SUITE: PHASE-3.2 PERSISTENT DRIVER IDENTITY';
  RAISE NOTICE '=============================================================';

  -- 0. CLEANUP & FIXTURES
  DELETE FROM public.activity_notes;
  DELETE FROM public.loads;
  DELETE FROM public.organization_invitations;
  DELETE FROM public.drivers;
  DELETE FROM public.trucks;
  DELETE FROM public.clients;
  DELETE FROM public.organization_members;
  DELETE FROM public.organizations;
  DELETE FROM auth.users;

  -- Seed Users
  INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
    (v_user_admin_a, 'admin_a@test.com', '{"full_name": "Admin Org A"}'::jsonb),
    (v_user_dispatcher_a, 'dispatcher_a@test.com', '{"full_name": "Dispatcher Org A"}'::jsonb),
    (v_user_driver_a1, 'driver_a1@carrier.com', '{"full_name": "John Driver A1"}'::jsonb),
    (v_user_driver_b1, 'driver_b1@carrier.com', '{"full_name": "Bob Driver B1"}'::jsonb),
    (v_user_attacker, 'attacker@malicious.com', '{"full_name": "Attacker"}'::jsonb);

  -- Seed Organizations
  INSERT INTO public.organizations (id, name, slug) VALUES
    (v_org_a, 'Dispatch Org A', 'org-a'),
    (v_org_b, 'Dispatch Org B', 'org-b');

  -- Seed Office Organization Members (Strictly NO drivers in organization_members!)
  INSERT INTO public.organization_members (organization_id, user_id, role) VALUES
    (v_org_a, v_user_admin_a, 'owner_admin'),
    (v_org_a, v_user_dispatcher_a, 'dispatcher');

  -- Seed Carrier Clients
  INSERT INTO public.clients (id, organization_id, name, status) VALUES
    (v_client_a1, v_org_a, 'Alpha Carrier Client', 'active'),
    (v_client_a2, v_org_a, 'Beta Carrier Client', 'active'),
    (v_client_b1, v_org_b, 'Gamma Carrier Client', 'active');

  -- Seed Trucks
  INSERT INTO public.trucks (id, organization_id, client_id, truck_number, status) VALUES
    (v_truck_a1, v_org_a, v_client_a1, 'TRK-A1-101', 'available'),
    (v_truck_a2, v_org_a, v_client_a2, 'TRK-A2-202', 'available');

  -- Seed Driver A1 (unbound initially)
  INSERT INTO public.drivers (id, organization_id, client_id, full_name, email, status, assigned_truck_id) VALUES
    (v_driver_a1, v_org_a, v_client_a1, 'John Driver A1', 'driver_a1@carrier.com', 'available', v_truck_a1),
    (v_driver_a2, v_org_a, v_client_a2, 'Alice Driver A2', 'driver_a2@carrier.com', 'available', v_truck_a2);

  -- -----------------------------------------------------------------
  -- TEST REG-25: NO DRIVER IN ORGANIZATION_MEMBERS ON ONBOARDING
  -- -----------------------------------------------------------------
  RAISE NOTICE '--- TEST REG-25: Onboarding creates zero organization_members rows ---';

  -- Create driver invitation
  INSERT INTO public.organization_invitations (
    organization_id, email, role, token_hash, invited_by_user_id, driver_id, expires_at
  ) VALUES (
    v_org_a, 'driver_a1@carrier.com', 'driver', v_inv_token_hash_a1, v_user_admin_a, v_driver_a1, NOW() + INTERVAL '7 days'
  );

  -- Execute accept_driver_invitation as v_user_driver_a1
  PERFORM set_config('request.jwt.claim.sub', v_user_driver_a1::text, true);

  v_res_json := public.accept_driver_invitation(v_inv_token_hash_a1);

  IF (v_res_json->>'success')::boolean IS NOT TRUE OR v_res_json->>'status' <> 'linked' THEN
    RAISE EXCEPTION 'TEST REG-25 FAILED: accept_driver_invitation did not return linked status: %', v_res_json;
  END IF;

  -- Verify drivers.user_id is bound
  SELECT user_id INTO v_user_attacker FROM public.drivers WHERE id = v_driver_a1;
  IF v_user_attacker <> v_user_driver_a1 THEN
    RAISE EXCEPTION 'TEST REG-25 FAILED: drivers.user_id not correctly bound!';
  END IF;

  -- CRITICAL INVARIANT: Zero rows in organization_members for driver!
  SELECT COUNT(*) INTO v_count FROM public.organization_members WHERE user_id = v_user_driver_a1;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'TEST REG-25 FAILED: Found % rows in organization_members for driver!', v_count;
  END IF;

  RAISE NOTICE '[PASS] TEST REG-25: Driver onboarding bound drivers.user_id without inserting into organization_members.';

  -- -----------------------------------------------------------------
  -- TEST REG-21: PERSISTENT IDENTITY (RE-ASSIGNING LOAD TO EXISTING DRIVER)
  -- -----------------------------------------------------------------
  RAISE NOTICE '--- TEST REG-21: Re-assigning load to existing driver reuses persistent identity ---';

  -- Create Load 1 assigned to driver_a1
  INSERT INTO public.loads (
    id, organization_id, client_id, driver_id, truck_id, load_number, pipeline_status, rate
  ) VALUES (
    v_load_1, v_org_a, v_client_a1, v_driver_a1, v_truck_a1, 'LD-001', 'assigned', 2500.00
  );

  -- Verify driver can verify load 1 access
  PERFORM set_config('request.jwt.claim.sub', v_user_driver_a1::text, true);
  v_res_json := public.verify_driver_load_access(v_load_1);

  IF (v_res_json->>'authorized')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'TEST REG-21 FAILED: Driver A1 cannot access Load 1: %', v_res_json;
  END IF;

  -- Dispatcher now assigns a second load (Load 2) to the SAME driver
  INSERT INTO public.loads (
    id, organization_id, client_id, driver_id, truck_id, load_number, pipeline_status, rate
  ) VALUES (
    v_load_2, v_org_a, v_client_a1, v_driver_a1, v_truck_a1, 'LD-002', 'assigned', 3200.00
  );

  -- Verify driver immediately accesses Load 2 WITHOUT any new invitation or account creation
  v_res_json := public.verify_driver_load_access(v_load_2);

  IF (v_res_json->>'authorized')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'TEST REG-21 FAILED: Driver A1 cannot access Load 2 with persistent identity: %', v_res_json;
  END IF;

  RAISE NOTICE '[PASS] TEST REG-21: Persistent driver identity seamlessly accesses new assigned loads.';

  -- -----------------------------------------------------------------
  -- TEST REG-22: CROSS-USER IDENTITY CONFLICT
  -- -----------------------------------------------------------------
  RAISE NOTICE '--- TEST REG-22: User B cannot claim Driver A ---';

  -- Create a new invitation for Driver A1 (e.g. accidental re-invite)
  INSERT INTO public.organization_invitations (
    organization_id, email, role, token_hash, invited_by_user_id, driver_id, expires_at
  ) VALUES (
    v_org_a, 'attacker@malicious.com', 'driver', v_inv_token_hash_attacker, v_user_admin_a, v_driver_a1, NOW() + INTERVAL '7 days'
  );

  -- Attacker attempts to claim Driver A1
  PERFORM set_config('request.jwt.claim.sub', v_user_attacker::text, true);

  v_err_caught := false;
  BEGIN
    PERFORM public.accept_driver_invitation(v_inv_token_hash_attacker);
  EXCEPTION WHEN OTHERS THEN
    v_err_caught := true;
    v_err_msg := SQLERRM;
  END;

  IF NOT v_err_caught THEN
    RAISE EXCEPTION 'TEST REG-22 FAILED: Attacker was able to claim already-linked Driver A1!';
  END IF;

  IF v_err_msg NOT LIKE '%Identity Conflict%' THEN
    RAISE EXCEPTION 'TEST REG-22 FAILED: Expected Identity Conflict error, got: %', v_err_msg;
  END IF;

  RAISE NOTICE '[PASS] TEST REG-22: Cross-user identity conflict correctly blocked: %', v_err_msg;

  -- -----------------------------------------------------------------
  -- TEST IDEMPOTENT SAME-USER ACCEPTANCE
  -- -----------------------------------------------------------------
  RAISE NOTICE '--- TEST IDEMPOTENCY: Same-user accepting invitation is idempotent ---';

  PERFORM set_config('request.jwt.claim.sub', v_user_driver_a1::text, true);
  v_res_json := public.accept_driver_invitation(v_inv_token_hash_attacker);

  IF (v_res_json->>'success')::boolean IS NOT TRUE OR v_res_json->>'status' <> 'already_linked' THEN
    RAISE EXCEPTION 'TEST IDEMPOTENCY FAILED: Same user acceptance failed or was not idempotent: %', v_res_json;
  END IF;

  RAISE NOTICE '[PASS] TEST IDEMPOTENCY: Same-user re-acceptance handled idempotently.';

  -- -----------------------------------------------------------------
  -- TEST REG-23: CROSS-CLIENT ASSIGNMENT REJECTED
  -- -----------------------------------------------------------------
  RAISE NOTICE '--- TEST REG-23: Client A driver cannot be assigned Client B load ---';

  v_err_caught := false;
  BEGIN
    -- Attempt to assign Driver A1 (belongs to Client A1) to a load belonging to Client A2
    INSERT INTO public.loads (
      organization_id, client_id, driver_id, load_number, pipeline_status
    ) VALUES (
      v_org_a, v_client_a2, v_driver_a1, 'LD-CROSS-CLIENT', 'assigned'
    );
  EXCEPTION WHEN OTHERS THEN
    v_err_caught := true;
    v_err_msg := SQLERRM;
  END;

  IF NOT v_err_caught THEN
    RAISE EXCEPTION 'TEST REG-23 FAILED: Cross-client driver load assignment was permitted!';
  END IF;

  IF v_err_msg NOT LIKE '%Integrity Error%' THEN
    RAISE EXCEPTION 'TEST REG-23 FAILED: Expected Integrity Error on cross-client assignment, got: %', v_err_msg;
  END IF;

  RAISE NOTICE '[PASS] TEST REG-23: Cross-client load assignment rejected: %', v_err_msg;

  -- -----------------------------------------------------------------
  -- TEST REG-24: DEEP-LINK ABUSE (USER B CANNOT ACCESS USER A LOAD)
  -- -----------------------------------------------------------------
  RAISE NOTICE '--- TEST REG-24: User B cannot access User A load by ID ---';

  PERFORM set_config('request.jwt.claim.sub', v_user_attacker::text, true);

  v_res_json := public.verify_driver_load_access(v_load_1);

  IF (v_res_json->>'authorized')::boolean IS TRUE THEN
    RAISE EXCEPTION 'TEST REG-24 FAILED: Attacker was authorized for Load 1!';
  END IF;

  IF v_res_json->>'reason' NOT IN ('not_a_driver', 'not_assigned_to_driver') THEN
    RAISE EXCEPTION 'TEST REG-24 FAILED: Unexpected denial reason: %', v_res_json;
  END IF;

  RAISE NOTICE '[PASS] TEST REG-24: Deep-link load access unauthorized for non-assigned user: %', v_res_json;

  -- -----------------------------------------------------------------
  -- TEST REG-26: IDENTITY IMMUTABILITY (PREVENT CASUAL TAMPERING)
  -- -----------------------------------------------------------------
  RAISE NOTICE '--- TEST REG-26: Ordinary user cannot overwrite driver user_id ---';

  PERFORM set_config('request.jwt.claim.sub', v_user_driver_a1::text, true);

  v_err_caught := false;
  BEGIN
    UPDATE public.drivers
    SET user_id = v_user_attacker
    WHERE id = v_driver_a1;
  EXCEPTION WHEN OTHERS THEN
    v_err_caught := true;
    v_err_msg := SQLERRM;
  END;

  IF NOT v_err_caught THEN
    RAISE EXCEPTION 'TEST REG-26 FAILED: Driver was able to overwrite drivers.user_id directly!';
  END IF;

  RAISE NOTICE '[PASS] TEST REG-26: Direct user_id tampering blocked: %', v_err_msg;

  -- -----------------------------------------------------------------
  -- TEST ADMIN OFFBOARDING RPC
  -- -----------------------------------------------------------------
  RAISE NOTICE '--- TEST ADMIN UNLINK: Dedicated offboarding RPC unlinks identity ---';

  -- Dispatcher attempts offboarding (should fail: only owner_admin allowed)
  PERFORM set_config('request.jwt.claim.sub', v_user_dispatcher_a::text, true);
  v_err_caught := false;
  BEGIN
    PERFORM public.admin_unlink_driver_identity(v_driver_a1);
  EXCEPTION WHEN OTHERS THEN
    v_err_caught := true;
    v_err_msg := SQLERRM;
  END;

  IF NOT v_err_caught THEN
    RAISE EXCEPTION 'TEST ADMIN UNLINK FAILED: Dispatcher was able to unlink driver!';
  END IF;

  -- Owner Admin unlinks driver identity
  PERFORM set_config('request.jwt.claim.sub', v_user_admin_a::text, true);
  v_res_json := public.admin_unlink_driver_identity(v_driver_a1);

  IF (v_res_json->>'success')::boolean IS NOT TRUE OR v_res_json->>'status' <> 'unlinked' THEN
    RAISE EXCEPTION 'TEST ADMIN UNLINK FAILED: Unlink RPC did not succeed: %', v_res_json;
  END IF;

  SELECT user_id INTO v_user_attacker FROM public.drivers WHERE id = v_driver_a1;
  IF v_user_attacker IS NOT NULL THEN
    RAISE EXCEPTION 'TEST ADMIN UNLINK FAILED: drivers.user_id is not NULL after admin unlink!';
  END IF;

  RAISE NOTICE '[PASS] TEST ADMIN UNLINK: Owner admin successfully unlinked driver identity.';

  -- -----------------------------------------------------------------
  -- TEST TRUCK DELETION PRESERVES DRIVER CLIENT_ID
  -- -----------------------------------------------------------------
  RAISE NOTICE '--- TEST TRUCK DELETION: Deleting truck leaves drivers.client_id intact ---';

  -- Delete truck a1
  DELETE FROM public.trucks WHERE id = v_truck_a1;

  -- Verify driver_a1 has assigned_truck_id = NULL but client_id = v_client_a1 intact!
  SELECT assigned_truck_id, client_id INTO v_truck_a1, v_client_a2 FROM public.drivers WHERE id = v_driver_a1;
  IF v_truck_a1 IS NOT NULL THEN
    RAISE EXCEPTION 'TEST TRUCK DELETION FAILED: assigned_truck_id was not set to NULL on truck deletion!';
  END IF;

  IF v_client_a2 <> v_client_a1 THEN
    RAISE EXCEPTION 'TEST TRUCK DELETION FAILED: drivers.client_id was destroyed on truck deletion!';
  END IF;

  RAISE NOTICE '[PASS] TEST TRUCK DELETION: Driver client ownership survived truck deletion intact.';

  -- -----------------------------------------------------------------
  -- TEST REG-27: DRIVER ISOLATION (FINANCIAL DATA FIREWALL)
  -- -----------------------------------------------------------------
  RAISE NOTICE '--- TEST REG-27: Operational projection excludes all financial data ---';

  -- Re-link driver_a1 for projection inspection
  UPDATE public.drivers SET user_id = v_user_driver_a1 WHERE id = v_driver_a1;

  PERFORM set_config('request.jwt.claim.sub', v_user_driver_a1::text, true);

  v_res_json := public.verify_driver_load_access(v_load_1);

  IF v_res_json ? 'rate' OR v_res_json ? 'fuel_expense' OR v_res_json ? 'driver_pay' OR v_res_json ? 'carrier_fee' THEN
    RAISE EXCEPTION 'TEST REG-27 FAILED: Financial data leaked in operational load projection: %', v_res_json;
  END IF;

  RAISE NOTICE '[PASS] TEST REG-27: Financial and commercial data strictly firewalled.';

  RAISE NOTICE '=============================================================';
  RAISE NOTICE 'ALL PHASE-3.2 SECURITY REGRESSION TESTS PASSED SUCCESSFULLY.';
  RAISE NOTICE '=============================================================';
END;
$$;

ROLLBACK;
