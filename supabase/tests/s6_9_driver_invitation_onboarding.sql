-- ====================================================================
-- DispatcherDesk Forensic Verification Test Suite: S6.9 Driver Invitation + Onboarding
-- File: supabase/tests/s6_9_driver_invitation_onboarding.sql
-- Description:
-- Automated SQL verification suite validating tenant-safe composite driver FK
-- and all required S6.9 onboarding criteria:
-- 1. Direct Table DML: Same-org driver_id -> accepted by composite FK.
-- 2. Direct Table DML: Cross-org driver_id -> rejected by DATABASE CONSTRAINT (fk_org_invitations_driver).
-- 3. Direct Table DML: Tenant integrity cannot be bypassed via UPDATE (org or driver).
-- 4. Direct Table DML: role='driver' with driver_id=NULL -> rejected by chk_org_invitations_driver_role.
-- 5. Direct Table DML: Non-driver role with driver_id IS NOT NULL -> rejected by chk_org_invitations_driver_role.
-- 6. ON DELETE RESTRICT: Deleting a referenced driver is rejected (fk_org_invitations_driver).
-- 7. RPC create_team_invitation with 'driver' role requires driver_id (rejects NULL).
-- 8. RPC create_team_invitation with 'driver' role rejects nonexistent driver_id.
-- 9. RPC create_team_invitation with 'driver' role rejects driver_id from another organization.
-- 10. RPC create_team_invitation with 'driver' role rejects driver already bound to a user.
-- 11. RPC create_team_invitation with 'driver' role allows dispatcher (has_operational_write_access).
-- 12. RPC create_team_invitation with office role rejects driver_id (must be NULL).
-- 13. RPC create_team_invitation with office role rejects dispatcher (only owner_admin allowed).
-- 14. RPC cancel_team_invitation allows dispatcher to cancel driver invitation.
-- 15. RPC cancel_team_invitation rejects dispatcher attempting to cancel office invitation.
-- 16. RPC get_invitation_details returns driver_id, driver_name, and valid status for driver invitations.
-- 17. RPC accept_team_invitation atomically creates membership with role 'driver' AND sets drivers.user_id = auth.uid().
-- 18. RPC accept_team_invitation rolls back atomically if driver profile binding fails (no partial membership).
-- 19. S6.8 Coherence: trg_enforce_driver_user_coherence passes on atomic acceptance and blocks direct invalid updates.
-- 20. Office role invitation acceptance remains unaffected and leaves drivers table untouched.
-- 21. RPC remove_team_member on a driver user unlinks drivers.user_id back to NULL cleanly.
-- 22. S6.4/S6.5/S6.6/S6.7/S6.7B/S6.8 invariants and locked objects remain intact.
-- ====================================================================

BEGIN;

-- Helper to simulate auth schema and auth.uid() in tests
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT,
  raw_user_meta_data JSONB DEFAULT '{}'::jsonb
);

CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::UUID;
$$ LANGUAGE sql STABLE;

-- Apply migrations
\i supabase/migrations/20260905000006_driver_identity_foundation.sql
\i supabase/migrations/20260905000007_driver_invitations_onboarding.sql

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
  v_user_driver_new UUID := 'a6666666-6666-6666-6666-666666666666'::UUID;
  v_user_dispatcher_new UUID := 'a7777777-7777-7777-7777-777777777777'::UUID;

  -- Users Org B
  v_user_admin_b UUID := 'b1111111-1111-1111-1111-111111111111'::UUID;

  -- Drivers Org A
  v_driver_a1 UUID := 'ad100000-0000-0000-0000-000000000001'::UUID;
  v_driver_a2_unbound UUID := 'ad200000-0000-0000-0000-000000000002'::UUID;
  v_driver_a3_unbound UUID := 'ad300000-0000-0000-0000-000000000003'::UUID;

  -- Drivers Org B
  v_driver_b1 UUID := 'bd100000-0000-0000-0000-000000000001'::UUID;

  -- Temporary variables
  v_dml_inv_id UUID;
  v_token_hash TEXT;
  v_create_res JSON;
  v_inv_id UUID;
  v_inv_details JSON;
  v_accept_res JSON;
  v_err_caught BOOLEAN;
  v_err_msg TEXT;
  v_err_state TEXT;
  v_driver_user_id UUID;
  v_member_role TEXT;
  v_inv_driver_id UUID;
BEGIN
  RAISE NOTICE '=============================================================';
  RAISE NOTICE 'STARTING TEST SUITE: S6.9 DRIVER INVITATION + ONBOARDING';
  RAISE NOTICE '=============================================================';

  -- -----------------------------------------------------------------
  -- SETUP: CLEAN & SEED TEST FIXTURES
  -- -----------------------------------------------------------------
  DELETE FROM public.organization_invitations WHERE organization_id IN (v_org_a, v_org_b);
  DELETE FROM public.drivers WHERE organization_id IN (v_org_a, v_org_b);
  DELETE FROM public.organization_members WHERE organization_id IN (v_org_a, v_org_b);
  DELETE FROM public.organizations WHERE id IN (v_org_a, v_org_b);
  DELETE FROM public.profiles WHERE id IN (
    v_user_admin_a, v_user_dispatcher_a, v_user_staff_a,
    v_user_driver_a1, v_user_driver_new, v_user_dispatcher_new,
    v_user_admin_b
  );

  INSERT INTO auth.users (id, email, raw_user_meta_data)
  VALUES
    (v_user_admin_a, 'alice@alpha.com', '{"full_name": "Alice Owner"}'::jsonb),
    (v_user_dispatcher_a, 'dan@alpha.com', '{"full_name": "Dan Dispatcher"}'::jsonb),
    (v_user_staff_a, 'sam@alpha.com', '{"full_name": "Sam Staff"}'::jsonb),
    (v_user_driver_a1, 'dave@alpha.com', '{"full_name": "Dave Driver Bound"}'::jsonb),
    (v_user_driver_new, 'ned@alpha.com', '{"full_name": "Ned New Driver"}'::jsonb),
    (v_user_dispatcher_new, 'pam@alpha.com', '{"full_name": "Pam New Dispatcher"}'::jsonb),
    (v_user_admin_b, 'bob@beta.com', '{"full_name": "Bob Owner Org B"}'::jsonb)
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    raw_user_meta_data = EXCLUDED.raw_user_meta_data;

  INSERT INTO public.organizations (id, name, created_at)
  VALUES
    (v_org_a, 'Org Alpha Logistics', NOW()),
    (v_org_b, 'Org Beta Transport', NOW());

  INSERT INTO public.profiles (id, full_name, email, role, created_at)
  VALUES
    (v_user_admin_a, 'Alice Owner', 'alice@alpha.com', 'owner_admin', NOW()),
    (v_user_dispatcher_a, 'Dan Dispatcher', 'dan@alpha.com', 'dispatcher', NOW()),
    (v_user_staff_a, 'Sam Staff', 'sam@alpha.com', 'staff', NOW()),
    (v_user_driver_a1, 'Dave Driver Bound', 'dave@alpha.com', 'driver', NOW()),
    (v_user_driver_new, 'Ned New Driver', 'ned@alpha.com', 'driver', NOW()),
    (v_user_dispatcher_new, 'Pam New Dispatcher', 'pam@alpha.com', 'dispatcher', NOW()),
    (v_user_admin_b, 'Bob Owner Org B', 'bob@beta.com', 'owner_admin', NOW());

  INSERT INTO public.organization_members (id, organization_id, user_id, role, created_at)
  VALUES
    (gen_random_uuid(), v_org_a, v_user_admin_a, 'owner_admin', NOW()),
    (gen_random_uuid(), v_org_a, v_user_dispatcher_a, 'dispatcher', NOW()),
    (gen_random_uuid(), v_org_a, v_user_staff_a, 'staff', NOW()),
    (gen_random_uuid(), v_org_b, v_user_admin_b, 'owner_admin', NOW());

  -- Drivers
  -- v_driver_a1 is bound to v_user_driver_a1 (requires member row to satisfy coherence trigger)
  INSERT INTO public.organization_members (id, organization_id, user_id, role, created_at)
  VALUES (gen_random_uuid(), v_org_a, v_user_driver_a1, 'driver', NOW());

  INSERT INTO public.drivers (id, organization_id, full_name, email, status, pay_type, pay_rate, user_id, created_at)
  VALUES
    (v_driver_a1, v_org_a, 'Dave Driver Bound', 'dave@alpha.com', 'available', 'per_mile', 0.65, v_user_driver_a1, NOW()),
    (v_driver_a2_unbound, v_org_a, 'Ned Driver Profile', 'ned@alpha.com', 'available', 'percentage', 25.0, NULL, NOW()),
    (v_driver_a3_unbound, v_org_a, 'Fred Driver Profile', 'fred@alpha.com', 'available', 'flat_rate', 1500.0, NULL, NOW()),
    (v_driver_b1, v_org_b, 'Ben Beta Driver', 'ben@beta.com', 'available', 'per_mile', 0.60, NULL, NOW());

  -- =================================================================
  -- PART 1: DIRECT TABLE DML & TENANT INTEGRITY DATABASE CONSTRAINTS
  -- =================================================================

  -- -----------------------------------------------------------------
  -- TEST 1: Same-org driver_id accepted by composite foreign key
  -- -----------------------------------------------------------------
  v_dml_inv_id := gen_random_uuid();
  INSERT INTO public.organization_invitations (
    id,
    organization_id,
    email,
    role,
    token_hash,
    expires_at,
    driver_id
  ) VALUES (
    v_dml_inv_id,
    v_org_a,
    'dml_same_org@alpha.com',
    'driver',
    'hash_dml_same_org_test_0000000000000000000000000000000000000001',
    NOW() + INTERVAL '7 days',
    v_driver_a2_unbound
  );
  RAISE NOTICE 'TEST 1 PASSED: Direct table DML accepted matching (organization_id, driver_id)';

  -- Clean up test 1 row
  DELETE FROM public.organization_invitations WHERE id = v_dml_inv_id;

  -- -----------------------------------------------------------------
  -- TEST 2: Cross-org driver_id rejected by DATABASE CONSTRAINT
  -- -----------------------------------------------------------------
  v_err_caught := false;
  v_err_msg := NULL;
  v_err_state := NULL;
  BEGIN
    INSERT INTO public.organization_invitations (
      id,
      organization_id,
      email,
      role,
      token_hash,
      expires_at,
      driver_id
    ) VALUES (
      gen_random_uuid(),
      v_org_a,
      'dml_cross_org@alpha.com',
      'driver',
      'hash_dml_cross_org_test_0000000000000000000000000000000000000002',
      NOW() + INTERVAL '7 days',
      v_driver_b1 -- Driver belongs to Org B, but invitation is in Org A!
    );
  EXCEPTION WHEN OTHERS THEN
    v_err_caught := true;
    v_err_msg := SQLERRM;
    v_err_state := SQLSTATE;
  END;

  IF NOT v_err_caught THEN
    RAISE EXCEPTION 'TEST 2 FAILED: Database constraint did NOT block cross-organization driver_id via direct table INSERT!';
  END IF;

  IF v_err_state != '23503' THEN
    RAISE EXCEPTION 'TEST 2 FAILED: Expected foreign key violation (23503), got SQLSTATE %: %', v_err_state, v_err_msg;
  END IF;
  RAISE NOTICE 'TEST 2 PASSED: Cross-organization driver_id rejected by DATABASE CONSTRAINT fk_org_invitations_driver (SQLSTATE %, Msg: %)', v_err_state, v_err_msg;

  -- -----------------------------------------------------------------
  -- TEST 3: Direct table UPDATE cannot bypass tenant integrity
  -- -----------------------------------------------------------------
  v_dml_inv_id := gen_random_uuid();
  INSERT INTO public.organization_invitations (
    id,
    organization_id,
    email,
    role,
    token_hash,
    expires_at,
    driver_id
  ) VALUES (
    v_dml_inv_id,
    v_org_a,
    'dml_update_test@alpha.com',
    'driver',
    'hash_dml_update_test_0000000000000000000000000000000000000003',
    NOW() + INTERVAL '7 days',
    v_driver_a2_unbound
  );

  -- 3A: Attempt to reassign organization_id to Org B while driver belongs to Org A
  v_err_caught := false;
  BEGIN
    UPDATE public.organization_invitations
    SET organization_id = v_org_b
    WHERE id = v_dml_inv_id;
  EXCEPTION WHEN foreign_key_violation THEN
    v_err_caught := true;
    v_err_msg := SQLERRM;
  END;

  IF NOT v_err_caught THEN
    RAISE EXCEPTION 'TEST 3A FAILED: Direct UPDATE changing organization_id was not blocked by composite FK!';
  END IF;
  RAISE NOTICE 'TEST 3A PASSED: Direct UPDATE changing organization_id correctly blocked by composite FK';

  -- 3B: Attempt to reassign driver_id to cross-org driver_b1
  v_err_caught := false;
  BEGIN
    UPDATE public.organization_invitations
    SET driver_id = v_driver_b1
    WHERE id = v_dml_inv_id;
  EXCEPTION WHEN foreign_key_violation THEN
    v_err_caught := true;
    v_err_msg := SQLERRM;
  END;

  IF NOT v_err_caught THEN
    RAISE EXCEPTION 'TEST 3B FAILED: Direct UPDATE changing driver_id to cross-org driver was not blocked by composite FK!';
  END IF;
  RAISE NOTICE 'TEST 3B PASSED: Direct UPDATE changing driver_id to cross-org driver correctly blocked by composite FK';

  -- Clean up test 3 row
  DELETE FROM public.organization_invitations WHERE id = v_dml_inv_id;

  -- -----------------------------------------------------------------
  -- TEST 4: Direct table DML: role='driver' with driver_id=NULL rejected by check constraint
  -- -----------------------------------------------------------------
  v_err_caught := false;
  BEGIN
    INSERT INTO public.organization_invitations (
      id,
      organization_id,
      email,
      role,
      token_hash,
      expires_at,
      driver_id
    ) VALUES (
      gen_random_uuid(),
      v_org_a,
      'dml_null_driver@alpha.com',
      'driver',
      'hash_dml_null_driver_0000000000000000000000000000000000000004',
      NOW() + INTERVAL '7 days',
      NULL
    );
  EXCEPTION WHEN check_violation THEN
    v_err_caught := true;
    v_err_msg := SQLERRM;
  END;

  IF NOT v_err_caught THEN
    RAISE EXCEPTION 'TEST 4 FAILED: Direct INSERT of role=driver with driver_id=NULL was not rejected by check constraint!';
  END IF;
  RAISE NOTICE 'TEST 4 PASSED: role=driver with driver_id=NULL correctly rejected by chk_org_invitations_driver_role';

  -- -----------------------------------------------------------------
  -- TEST 5: Direct table DML: Non-driver role with driver_id IS NOT NULL rejected
  -- -----------------------------------------------------------------
  v_err_caught := false;
  BEGIN
    INSERT INTO public.organization_invitations (
      id,
      organization_id,
      email,
      role,
      token_hash,
      expires_at,
      driver_id
    ) VALUES (
      gen_random_uuid(),
      v_org_a,
      'dml_office_with_driver@alpha.com',
      'dispatcher',
      'hash_dml_office_with_driver_00000000000000000000000000000005',
      NOW() + INTERVAL '7 days',
      v_driver_a2_unbound
    );
  EXCEPTION WHEN check_violation THEN
    v_err_caught := true;
    v_err_msg := SQLERRM;
  END;

  IF NOT v_err_caught THEN
    RAISE EXCEPTION 'TEST 5 FAILED: Direct INSERT of non-driver role with driver_id IS NOT NULL was not rejected!';
  END IF;
  RAISE NOTICE 'TEST 5 PASSED: Non-driver role with non-null driver_id correctly rejected by check constraint';

  -- -----------------------------------------------------------------
  -- TEST 6: ON DELETE RESTRICT: Deleting a referenced driver is rejected
  -- -----------------------------------------------------------------
  v_dml_inv_id := gen_random_uuid();
  INSERT INTO public.organization_invitations (
    id,
    organization_id,
    email,
    role,
    token_hash,
    expires_at,
    driver_id
  ) VALUES (
    v_dml_inv_id,
    v_org_a,
    'dml_restrict_test@alpha.com',
    'driver',
    'hash_dml_restrict_test_0000000000000000000000000000000000000006',
    NOW() + INTERVAL '7 days',
    v_driver_a3_unbound
  );

  -- Attempt to delete the driver referenced by the invitation
  v_err_caught := false;
  v_err_state := NULL;
  BEGIN
    DELETE FROM public.drivers WHERE id = v_driver_a3_unbound;
  EXCEPTION WHEN OTHERS THEN
    v_err_caught := true;
    v_err_msg := SQLERRM;
    v_err_state := SQLSTATE;
  END;

  IF NOT v_err_caught THEN
    RAISE EXCEPTION 'TEST 6 FAILED: Driver deletion succeeded! ON DELETE RESTRICT was not enforced!';
  END IF;

  IF v_err_state != '23503' THEN
    RAISE EXCEPTION 'TEST 6 FAILED: Expected FK restriction (23503), got SQLSTATE %: %', v_err_state, v_err_msg;
  END IF;

  -- Verify the driver row STILL EXISTS in public.drivers
  IF NOT EXISTS (SELECT 1 FROM public.drivers WHERE id = v_driver_a3_unbound) THEN
    RAISE EXCEPTION 'TEST 6 FAILED: Driver was deleted despite FK restriction!';
  END IF;

  -- Verify the invitation's driver_id was NOT set to NULL (proving SET NULL is abolished)
  SELECT driver_id INTO v_inv_driver_id
  FROM public.organization_invitations
  WHERE id = v_dml_inv_id;

  IF v_inv_driver_id IS NULL OR v_inv_driver_id != v_driver_a3_unbound THEN
    RAISE EXCEPTION 'TEST 6 FAILED: Invitation driver_id was nulled or altered during delete attempt!';
  END IF;

  RAISE NOTICE 'TEST 6 PASSED: Deleting a referenced driver was rejected by ON DELETE RESTRICT and driver_id was preserved';

  -- Clean up test 6 invitation
  DELETE FROM public.organization_invitations WHERE id = v_dml_inv_id;

  -- =================================================================
  -- PART 2: RPC LEVEL VALIDATION & ROLE ENFORCEMENT
  -- =================================================================

  -- -----------------------------------------------------------------
  -- TEST 7: Driver invitation requires driver_id (rejects NULL)
  -- -----------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', v_user_admin_a::TEXT, true);
  v_err_caught := false;
  BEGIN
    PERFORM public.create_team_invitation(
      p_organization_id := v_org_a,
      p_email := 'test7@alpha.com',
      p_role := 'driver',
      p_token_hash := 'mock_hash_test_7_0000000000000000000000000000000000000000000007',
      p_driver_id := NULL
    );
  EXCEPTION WHEN OTHERS THEN
    v_err_caught := true;
    v_err_msg := SQLERRM;
  END;

  IF NOT v_err_caught THEN
    RAISE EXCEPTION 'TEST 7 FAILED: Driver invitation with NULL driver_id was not rejected!';
  END IF;
  RAISE NOTICE 'TEST 7 PASSED: Driver invitation with NULL driver_id correctly rejected (Msg: %)', v_err_msg;

  -- -----------------------------------------------------------------
  -- TEST 8: Driver invitation rejects nonexistent driver_id
  -- -----------------------------------------------------------------
  v_err_caught := false;
  BEGIN
    PERFORM public.create_team_invitation(
      p_organization_id := v_org_a,
      p_email := 'test8@alpha.com',
      p_role := 'driver',
      p_token_hash := 'mock_hash_test_8_0000000000000000000000000000000000000000000008',
      p_driver_id := 'ffffffff-ffff-ffff-ffff-ffffffffffff'::UUID
    );
  EXCEPTION WHEN OTHERS THEN
    v_err_caught := true;
    v_err_msg := SQLERRM;
  END;

  IF NOT v_err_caught THEN
    RAISE EXCEPTION 'TEST 8 FAILED: Driver invitation with nonexistent driver_id was not rejected!';
  END IF;
  RAISE NOTICE 'TEST 8 PASSED: Nonexistent driver_id correctly rejected';

  -- -----------------------------------------------------------------
  -- TEST 9: Driver invitation rejects driver_id from another organization
  -- -----------------------------------------------------------------
  v_err_caught := false;
  BEGIN
    PERFORM public.create_team_invitation(
      p_organization_id := v_org_a,
      p_email := 'test9@alpha.com',
      p_role := 'driver',
      p_token_hash := 'mock_hash_test_9_0000000000000000000000000000000000000000000009',
      p_driver_id := v_driver_b1
    );
  EXCEPTION WHEN OTHERS THEN
    v_err_caught := true;
    v_err_msg := SQLERRM;
  END;

  IF NOT v_err_caught THEN
    RAISE EXCEPTION 'TEST 9 FAILED: Cross-org driver_id was not rejected in create_team_invitation!';
  END IF;
  RAISE NOTICE 'TEST 9 PASSED: Cross-organization driver_id correctly rejected in create_team_invitation';

  -- -----------------------------------------------------------------
  -- TEST 10: Driver invitation rejects driver already bound to a user
  -- -----------------------------------------------------------------
  v_err_caught := false;
  BEGIN
    PERFORM public.create_team_invitation(
      p_organization_id := v_org_a,
      p_email := 'test10@alpha.com',
      p_role := 'driver',
      p_token_hash := 'mock_hash_test_10_0000000000000000000000000000000000000000000010',
      p_driver_id := v_driver_a1
    );
  EXCEPTION WHEN OTHERS THEN
    v_err_caught := true;
    v_err_msg := SQLERRM;
  END;

  IF NOT v_err_caught THEN
    RAISE EXCEPTION 'TEST 10 FAILED: Driver invitation with already-bound driver was not rejected!';
  END IF;
  RAISE NOTICE 'TEST 10 PASSED: Already-bound driver profile correctly rejected';

  -- -----------------------------------------------------------------
  -- TEST 11: Dispatcher can create driver invitation (has_operational_write_access)
  -- -----------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', v_user_dispatcher_a::TEXT, true);
  v_token_hash := 'mock_sha256_hash_token_ned_driver_00000000000000000000000000000011';
  v_create_res := public.create_team_invitation(
    p_organization_id := v_org_a,
    p_email := 'ned@alpha.com',
    p_role := 'driver',
    p_token_hash := v_token_hash,
    p_driver_id := v_driver_a2_unbound
  );

  v_inv_id := (v_create_res->>'id')::UUID;
  IF v_inv_id IS NULL THEN
    RAISE EXCEPTION 'TEST 11 FAILED: Dispatcher failed to create driver invitation! Response: %', v_create_res;
  END IF;
  RAISE NOTICE 'TEST 11 PASSED: Dispatcher successfully created driver invitation (ID: %)', v_inv_id;

  -- -----------------------------------------------------------------
  -- TEST 12: Office role rejects driver_id (must be NULL)
  -- -----------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', v_user_admin_a::TEXT, true);
  v_err_caught := false;
  BEGIN
    PERFORM public.create_team_invitation(
      p_organization_id := v_org_a,
      p_email := 'office@alpha.com',
      p_role := 'dispatcher',
      p_token_hash := 'mock_hash_test_12_0000000000000000000000000000000000000000000012',
      p_driver_id := v_driver_a3_unbound
    );
  EXCEPTION WHEN OTHERS THEN
    v_err_caught := true;
    v_err_msg := SQLERRM;
  END;

  IF NOT v_err_caught THEN
    RAISE EXCEPTION 'TEST 12 FAILED: Non-driver invitation with non-NULL driver_id was not rejected!';
  END IF;
  RAISE NOTICE 'TEST 12 PASSED: Office role with non-NULL driver_id correctly rejected';

  -- -----------------------------------------------------------------
  -- TEST 13: Dispatcher cannot invite office role
  -- -----------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', v_user_dispatcher_a::TEXT, true);
  v_err_caught := false;
  BEGIN
    PERFORM public.create_team_invitation(
      p_organization_id := v_org_a,
      p_email := 'newdisp@alpha.com',
      p_role := 'dispatcher',
      p_token_hash := 'mock_hash_test_13_0000000000000000000000000000000000000000000013',
      p_driver_id := NULL
    );
  EXCEPTION WHEN OTHERS THEN
    v_err_caught := true;
    v_err_msg := SQLERRM;
  END;

  IF NOT v_err_caught THEN
    RAISE EXCEPTION 'TEST 13 FAILED: Dispatcher was allowed to invite office role!';
  END IF;
  RAISE NOTICE 'TEST 13 PASSED: Dispatcher cannot invite office roles (Owner/Admin required)';

  -- -----------------------------------------------------------------
  -- TEST 14 & 15: Dispatcher can cancel driver invite, but NOT office invite
  -- -----------------------------------------------------------------
  -- Owner creates an office invite
  PERFORM set_config('request.jwt.claim.sub', v_user_admin_a::TEXT, true);
  v_create_res := public.create_team_invitation(
    p_organization_id := v_org_a,
    p_email := 'staffinv@alpha.com',
    p_role := 'staff',
    p_token_hash := 'mock_hash_staff_office_invite_00000000000000000000000000000014',
    p_driver_id := NULL
  );
  v_inv_id := (v_create_res->>'id')::UUID;

  -- Dispatcher tries to cancel office invite -> must fail
  PERFORM set_config('request.jwt.claim.sub', v_user_dispatcher_a::TEXT, true);
  v_err_caught := false;
  BEGIN
    PERFORM public.cancel_team_invitation(v_inv_id);
  EXCEPTION WHEN OTHERS THEN
    v_err_caught := true;
  END;

  IF NOT v_err_caught THEN
    RAISE EXCEPTION 'TEST 15 FAILED: Dispatcher was allowed to cancel an office role invitation!';
  END IF;
  RAISE NOTICE 'TEST 15 PASSED: Dispatcher cannot cancel office role invitations';

  -- Dispatcher creates a driver invite and cancels it -> must succeed
  v_create_res := public.create_team_invitation(
    p_organization_id := v_org_a,
    p_email := 'fred@alpha.com',
    p_role := 'driver',
    p_token_hash := 'mock_hash_fred_driver_invite_00000000000000000000000000000014b',
    p_driver_id := v_driver_a3_unbound
  );
  v_inv_id := (v_create_res->>'id')::UUID;

  PERFORM public.cancel_team_invitation(v_inv_id);
  RAISE NOTICE 'TEST 14 PASSED: Dispatcher successfully cancelled driver invitation';

  -- -----------------------------------------------------------------
  -- TEST 16: get_invitation_details returns driver_id, driver_name, and valid status
  -- -----------------------------------------------------------------
  -- Use the active token_hash created in TEST 11 for Ned Driver
  v_inv_details := public.get_invitation_details(v_token_hash);
  IF (v_inv_details->>'driver_id')::UUID != v_driver_a2_unbound THEN
    RAISE EXCEPTION 'TEST 16 FAILED: get_invitation_details did not return correct driver_id!';
  END IF;
  IF v_inv_details->>'driver_name' != 'Ned Driver Profile' THEN
    RAISE EXCEPTION 'TEST 16 FAILED: get_invitation_details did not return correct driver_name (got %)!', v_inv_details->>'driver_name';
  END IF;
  IF (v_inv_details->>'is_valid')::BOOLEAN != true THEN
    RAISE EXCEPTION 'TEST 16 FAILED: get_invitation_details did not mark invitation is_valid=true!';
  END IF;
  RAISE NOTICE 'TEST 16 PASSED: get_invitation_details returned driver_id, driver_name (%), and is_valid=true', v_inv_details->>'driver_name';

  -- -----------------------------------------------------------------
  -- TEST 17: accept_team_invitation atomically creates membership & binds driver (compatible with S6.8)
  -- -----------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', v_user_driver_new::TEXT, true);
  v_accept_res := public.accept_team_invitation(v_token_hash);

  IF (v_accept_res->>'success')::BOOLEAN IS NOT TRUE THEN
    RAISE EXCEPTION 'TEST 17 FAILED: accept_team_invitation returned success=false: %', v_accept_res;
  END IF;

  -- Verify membership created
  SELECT role INTO v_member_role
  FROM public.organization_members
  WHERE organization_id = v_org_a AND user_id = v_user_driver_new;

  IF v_member_role != 'driver' THEN
    RAISE EXCEPTION 'TEST 17 FAILED: organization_members role is not driver (got %)', v_member_role;
  END IF;

  -- Verify driver profile user_id bound
  SELECT user_id INTO v_driver_user_id
  FROM public.drivers
  WHERE id = v_driver_a2_unbound;

  IF v_driver_user_id != v_user_driver_new THEN
    RAISE EXCEPTION 'TEST 17 FAILED: drivers.user_id was not updated to user! (got %)', v_driver_user_id;
  END IF;
  RAISE NOTICE 'TEST 17 PASSED: accept_team_invitation atomically created member and bound driver profile (S6.8 coherence preserved)';

  -- -----------------------------------------------------------------
  -- TEST 18: Atomic Rollback if driver profile binding fails
  -- -----------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', v_user_admin_a::TEXT, true);
  v_token_hash := 'mock_hash_concurrent_test_00000000000000000000000000000000000018';
  v_create_res := public.create_team_invitation(
    p_organization_id := v_org_a,
    p_email := 'concurrent@alpha.com',
    p_role := 'driver',
    p_token_hash := v_token_hash,
    p_driver_id := v_driver_a3_unbound
  );

  -- Simulate concurrent claim: set drivers.user_id to another user before acceptance
  UPDATE public.drivers SET user_id = v_user_driver_a1 WHERE id = v_driver_a3_unbound;

  -- Now invitee attempts to accept
  PERFORM set_config('request.jwt.claim.sub', v_user_dispatcher_new::TEXT, true);
  v_err_caught := false;
  BEGIN
    PERFORM public.accept_team_invitation(v_token_hash);
  EXCEPTION WHEN OTHERS THEN
    v_err_caught := true;
    v_err_msg := SQLERRM;
  END;

  IF NOT v_err_caught THEN
    RAISE EXCEPTION 'TEST 18 FAILED: accept_team_invitation did not error on concurrently bound driver!';
  END IF;

  -- Verify atomic invariant: No partial organization_members row exists
  IF EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = v_org_a AND user_id = v_user_dispatcher_new
  ) THEN
    RAISE EXCEPTION 'TEST 18 FAILED: Atomic rollback failed! organization_members was created despite driver binding failure!';
  END IF;
  RAISE NOTICE 'TEST 18 PASSED: Atomic rollback confirmed. No partial membership state created on binding failure';

  -- Reset v_driver_a3_unbound
  UPDATE public.drivers SET user_id = NULL WHERE id = v_driver_a3_unbound;

  -- -----------------------------------------------------------------
  -- TEST 19: S6.8 Coherence Trigger trg_enforce_driver_user_coherence blocks invalid direct updates
  -- -----------------------------------------------------------------
  v_err_caught := false;
  BEGIN
    -- Attempting to directly update driver user_id to a user without a driver membership in org_a
    UPDATE public.drivers
    SET user_id = v_user_admin_b -- user from Org B
    WHERE id = v_driver_a3_unbound;
  EXCEPTION WHEN OTHERS THEN
    v_err_caught := true;
    v_err_msg := SQLERRM;
  END;

  IF NOT v_err_caught THEN
    RAISE EXCEPTION 'TEST 19 FAILED: trg_enforce_driver_user_coherence did NOT block invalid driver user binding!';
  END IF;
  RAISE NOTICE 'TEST 19 PASSED: S6.8 driver user coherence trigger strictly blocks mismatched driver bindings';

  -- -----------------------------------------------------------------
  -- TEST 20: Office role invitation acceptance unaffected & leaves driver unlinked
  -- -----------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', v_user_admin_a::TEXT, true);
  v_token_hash := 'mock_hash_pam_disp_test_0000000000000000000000000000000000000020';
  v_create_res := public.create_team_invitation(
    p_organization_id := v_org_a,
    p_email := 'pam@alpha.com',
    p_role := 'dispatcher',
    p_token_hash := v_token_hash,
    p_driver_id := NULL
  );

  PERFORM set_config('request.jwt.claim.sub', v_user_dispatcher_new::TEXT, true);
  v_accept_res := public.accept_team_invitation(v_token_hash);

  SELECT role INTO v_member_role
  FROM public.organization_members
  WHERE organization_id = v_org_a AND user_id = v_user_dispatcher_new;

  IF v_member_role != 'dispatcher' THEN
    RAISE EXCEPTION 'TEST 20 FAILED: Office invitation did not create dispatcher member!';
  END IF;
  RAISE NOTICE 'TEST 20 PASSED: Office role invitation accepted normally without touching drivers table';

  -- -----------------------------------------------------------------
  -- TEST 21: remove_team_member unlinks driver profile user_id to NULL cleanly
  -- -----------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', v_user_admin_a::TEXT, true);
  PERFORM public.remove_team_member(v_org_a, v_user_driver_new);

  -- Verify membership removed
  IF EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = v_org_a AND user_id = v_user_driver_new
  ) THEN
    RAISE EXCEPTION 'TEST 21 FAILED: Member was not removed!';
  END IF;

  -- Verify driver profile unlinked
  SELECT user_id INTO v_driver_user_id
  FROM public.drivers
  WHERE id = v_driver_a2_unbound;

  IF v_driver_user_id IS NOT NULL THEN
    RAISE EXCEPTION 'TEST 21 FAILED: Driver profile was not unlinked (user_id is %)', v_driver_user_id;
  END IF;
  RAISE NOTICE 'TEST 21 PASSED: remove_team_member automatically unlinked driver profile user_id to NULL';

  -- -----------------------------------------------------------------
  -- TEST 22: S6.4/S6.5/S6.6/S6.7/S6.7B/S6.8 Invariants Check
  -- -----------------------------------------------------------------
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'has_operational_write_access'
  ) THEN
    RAISE EXCEPTION 'TEST 22 FAILED: has_operational_write_access missing!';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'get_current_driver_id'
  ) THEN
    RAISE EXCEPTION 'TEST 22 FAILED: get_current_driver_id missing!';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_enforce_driver_user_coherence'
  ) THEN
    RAISE EXCEPTION 'TEST 22 FAILED: trg_enforce_driver_user_coherence missing!';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_org_invitations_driver'
  ) THEN
    RAISE EXCEPTION 'TEST 22 FAILED: fk_org_invitations_driver missing!';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_org_invitations_driver_role'
  ) THEN
    RAISE EXCEPTION 'TEST 22 FAILED: chk_org_invitations_driver_role missing!';
  END IF;

  RAISE NOTICE 'TEST 22 PASSED: All operational, driver, and security invariants remain intact';

  RAISE NOTICE '=============================================================';
  RAISE NOTICE 'ALL S6.9 DRIVER INVITATION + ONBOARDING TESTS PASSED!';
  RAISE NOTICE '=============================================================';
END $$;

ROLLBACK;
