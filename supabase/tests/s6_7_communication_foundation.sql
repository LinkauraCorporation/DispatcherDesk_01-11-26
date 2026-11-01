-- ====================================================================
-- DispatcherDesk Forensic Verification Test Suite: S6.7 Communication Foundation (Object 3A)
-- File: supabase/tests/s6_7_communication_foundation.sql
-- Description:
-- Automated pgTAP / PL/pgSQL verification test suite verifying:
-- Case 1  — Same-org driver can be referenced by a conversation.
-- Case 2  — Cross-org (organization_id, driver_id) mismatch is rejected.
-- Case 3  — Deleting a referenced driver is rejected (ON DELETE RESTRICT).
-- Case 4  — General conversation with load_id is rejected.
-- Case 5  — Load conversation without load_id is rejected.
-- Case 6  — Multiple active general conversations for same driver/org rejected.
-- Case 7  — Resolved/deleted general conversation does not block new active general conversation.
-- Case 8  — Load FK uses ON DELETE SET NULL.
-- Case 9  — Tenant isolation remains structurally enforced.
-- Case 10 — S6.4/S6.5/S6.6 objects remain untouched.
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

  -- Users
  v_user_admin_a UUID := 'a1111111-1111-1111-1111-111111111111'::UUID;
  v_user_staff_a UUID := 'a2222222-2222-2222-2222-222222222222'::UUID;
  v_user_driver_a1 UUID := 'a3333333-3333-3333-3333-333333333333'::UUID;
  v_user_admin_b UUID := 'b1111111-1111-1111-1111-111111111111'::UUID;

  -- Clients
  v_client_a UUID := 'ac100000-0000-0000-0000-000000000001'::UUID;
  v_client_b UUID := 'bc100000-0000-0000-0000-000000000001'::UUID;

  -- Trucks
  v_truck_a1 UUID := 'ae100000-0000-0000-0000-000000000001'::UUID;
  v_truck_b1 UUID := 'be100000-0000-0000-0000-000000000001'::UUID;

  -- Drivers
  v_driver_a1 UUID := 'ad100000-0000-0000-0000-000000000001'::UUID;
  v_driver_b1 UUID := 'bd100000-0000-0000-0000-000000000001'::UUID;

  -- Brokers
  v_broker_a UUID := 'ab100000-0000-0000-0000-000000000001'::UUID;
  v_broker_b UUID := 'bb100000-0000-0000-0000-000000000001'::UUID;

  -- Loads
  v_load_a1 UUID := 'af100000-0000-0000-0000-000000000001'::UUID;
  v_load_b1 UUID := 'bf100000-0000-0000-0000-000000000001'::UUID;

  -- Tracking & test helpers
  v_conv_id UUID;
  v_conv_id2 UUID;
  v_conv_id3 UUID;
  v_load_conv_id UUID;
  v_err_caught BOOLEAN;
  v_err_msg TEXT;
  v_count INTEGER;
  v_confdeltype "char";
  v_has_rls BOOLEAN;
  v_check_condef TEXT;
BEGIN
  RAISE NOTICE '=============================================================';
  RAISE NOTICE 'STARTING TEST SUITE: S6.7 COMMUNICATION FOUNDATION (3A)';
  RAISE NOTICE '=============================================================';

  -- -----------------------------------------------------------------
  -- SETUP: CLEAN & SEED TEST ENVIRONMENT
  -- -----------------------------------------------------------------
  DELETE FROM public.conversations WHERE organization_id IN (v_org_a, v_org_b);
  DELETE FROM public.activity_notes WHERE organization_id IN (v_org_a, v_org_b);
  DELETE FROM public.loads WHERE organization_id IN (v_org_a, v_org_b);
  DELETE FROM public.drivers WHERE organization_id IN (v_org_a, v_org_b);
  DELETE FROM public.trucks WHERE organization_id IN (v_org_a, v_org_b);
  DELETE FROM public.brokers WHERE organization_id IN (v_org_a, v_org_b);
  DELETE FROM public.clients WHERE organization_id IN (v_org_a, v_org_b);
  DELETE FROM public.organization_members WHERE organization_id IN (v_org_a, v_org_b);
  DELETE FROM public.organizations WHERE id IN (v_org_a, v_org_b);
  DELETE FROM public.profiles WHERE id IN (v_user_admin_a, v_user_staff_a, v_user_driver_a1, v_user_admin_b);

  -- Insert Organizations
  INSERT INTO public.organizations (id, name, slug) VALUES
    (v_org_a, 'Alpha Freight Corp', 'alpha-corp'),
    (v_org_b, 'Beta Logistics LLC', 'beta-logistics');

  -- Insert Profiles
  INSERT INTO public.profiles (id, full_name) VALUES
    (v_user_admin_a, 'Admin User Org A'),
    (v_user_staff_a, 'Staff User Org A'),
    (v_user_driver_a1, 'Driver 1 Org A'),
    (v_user_admin_b, 'Admin User Org B');

  -- Insert Memberships
  INSERT INTO public.organization_members (organization_id, user_id, role) VALUES
    (v_org_a, v_user_admin_a, 'owner_admin'),
    (v_org_a, v_user_staff_a, 'staff'),
    (v_org_a, v_user_driver_a1, 'driver'),
    (v_org_b, v_user_admin_b, 'owner_admin');

  -- Insert Clients
  INSERT INTO public.clients (id, organization_id, company_name, client_type, status) VALUES
    (v_client_a, v_org_a, 'Alpha Client A', 'fleet', 'active'),
    (v_client_b, v_org_b, 'Beta Client B', 'fleet', 'active');

  -- Insert Trucks
  INSERT INTO public.trucks (id, organization_id, client_id, unit_number, status) VALUES
    (v_truck_a1, v_org_a, v_client_a, 'TRK-A1', 'active'),
    (v_truck_b1, v_org_b, v_client_b, 'TRK-B1', 'active');

  -- Insert Drivers
  INSERT INTO public.drivers (id, organization_id, client_id, assigned_truck_id, full_name, user_id, status) VALUES
    (v_driver_a1, v_org_a, v_client_a, v_truck_a1, 'Driver Alpha One', v_user_driver_a1, 'available'),
    (v_driver_b1, v_org_b, v_client_b, v_truck_b1, 'Driver Beta One', NULL, 'available');

  -- Insert Brokers
  INSERT INTO public.brokers (id, organization_id, name) VALUES
    (v_broker_a, v_org_a, 'Alpha Brokerage'),
    (v_broker_b, v_org_b, 'Beta Brokerage');

  -- Insert Loads
  INSERT INTO public.loads (
    id, organization_id, load_number, client_id, broker_id,
    origin_city, origin_state, dest_city, dest_state,
    pipeline_status, rate
  ) VALUES
    (v_load_a1, v_org_a, 'LD-A101', v_client_a, v_broker_a, 'Chicago', 'IL', 'Dallas', 'TX', 'booked', 2500.00),
    (v_load_b1, v_org_b, 'LD-B101', v_client_b, v_broker_b, 'Atlanta', 'GA', 'Miami', 'FL', 'booked', 3100.00);

  -- -----------------------------------------------------------------
  -- CASE 1: Same-org driver can be referenced by a conversation
  -- -----------------------------------------------------------------
  INSERT INTO public.conversations (
    organization_id, driver_id, type, load_id, status
  ) VALUES (
    v_org_a, v_driver_a1, 'general', NULL, 'active'
  ) RETURNING id INTO v_conv_id;

  IF v_conv_id IS NULL THEN
    RAISE EXCEPTION 'CASE 1 FAILED: Could not insert conversation referencing same-org driver.';
  ELSE
    RAISE NOTICE '[PASS] CASE 1: Same-org driver successfully referenced by conversation (ID: %).', v_conv_id;
  END IF;

  -- -----------------------------------------------------------------
  -- CASE 2: Cross-org (organization_id, driver_id) mismatch is rejected
  -- -----------------------------------------------------------------
  v_err_caught := FALSE;
  v_err_msg := NULL;
  BEGIN
    INSERT INTO public.conversations (
      organization_id, driver_id, type, load_id, status
    ) VALUES (
      v_org_a, v_driver_b1, 'general', NULL, 'active'
    );
  EXCEPTION
    WHEN foreign_key_violation THEN
      v_err_caught := TRUE;
      v_err_msg := SQLERRM;
    WHEN OTHERS THEN
      v_err_caught := TRUE;
      v_err_msg := SQLERRM;
  END;

  IF NOT v_err_caught THEN
    RAISE EXCEPTION 'CASE 2 FAILED: Cross-org (organization_id, driver_id) mismatch was not rejected!';
  ELSE
    RAISE NOTICE '[PASS] CASE 2: Cross-org (organization_id, driver_id) mismatch successfully rejected: %', v_err_msg;
  END IF;

  -- -----------------------------------------------------------------
  -- CASE 3: Deleting a referenced driver is rejected (ON DELETE RESTRICT)
  -- -----------------------------------------------------------------
  v_err_caught := FALSE;
  v_err_msg := NULL;
  BEGIN
    DELETE FROM public.drivers WHERE id = v_driver_a1;
  EXCEPTION
    WHEN foreign_key_violation THEN
      v_err_caught := TRUE;
      v_err_msg := SQLERRM;
    WHEN OTHERS THEN
      v_err_caught := TRUE;
      v_err_msg := SQLERRM;
  END;

  IF NOT v_err_caught THEN
    RAISE EXCEPTION 'CASE 3 FAILED: Deleting referenced driver was not rejected by RESTRICT FK!';
  ELSE
    RAISE NOTICE '[PASS] CASE 3: Deleting referenced driver successfully rejected by ON DELETE RESTRICT: %', v_err_msg;
  END IF;

  -- -----------------------------------------------------------------
  -- CASE 4: General conversation with load_id is rejected
  -- -----------------------------------------------------------------
  v_err_caught := FALSE;
  v_err_msg := NULL;
  BEGIN
    INSERT INTO public.conversations (
      organization_id, driver_id, type, load_id, status
    ) VALUES (
      v_org_a, v_driver_a1, 'general', v_load_a1, 'active'
    );
  EXCEPTION
    WHEN check_violation THEN
      v_err_caught := TRUE;
      v_err_msg := SQLERRM;
    WHEN OTHERS THEN
      v_err_caught := TRUE;
      v_err_msg := SQLERRM;
  END;

  IF NOT v_err_caught THEN
    RAISE EXCEPTION 'CASE 4 FAILED: General conversation with load_id was not rejected!';
  ELSE
    RAISE NOTICE '[PASS] CASE 4: General conversation with load_id successfully rejected: %', v_err_msg;
  END IF;

  -- -----------------------------------------------------------------
  -- CASE 5: Load conversation without load_id is rejected
  -- -----------------------------------------------------------------
  v_err_caught := FALSE;
  v_err_msg := NULL;
  BEGIN
    INSERT INTO public.conversations (
      organization_id, driver_id, type, load_id, status
    ) VALUES (
      v_org_a, v_driver_a1, 'load', NULL, 'active'
    );
  EXCEPTION
    WHEN check_violation THEN
      v_err_caught := TRUE;
      v_err_msg := SQLERRM;
    WHEN OTHERS THEN
      v_err_caught := TRUE;
      v_err_msg := SQLERRM;
  END;

  IF NOT v_err_caught THEN
    RAISE EXCEPTION 'CASE 5 FAILED: Load conversation without load_id was not rejected!';
  ELSE
    RAISE NOTICE '[PASS] CASE 5: Load conversation without load_id successfully rejected: %', v_err_msg;
  END IF;

  -- -----------------------------------------------------------------
  -- CASE 6: Multiple active general conversations for the same org/driver are rejected
  -- -----------------------------------------------------------------
  v_err_caught := FALSE;
  v_err_msg := NULL;
  BEGIN
    -- v_conv_id from Case 1 is already an active general conversation for (v_org_a, v_driver_a1)
    INSERT INTO public.conversations (
      organization_id, driver_id, type, load_id, status
    ) VALUES (
      v_org_a, v_driver_a1, 'general', NULL, 'active'
    );
  EXCEPTION
    WHEN unique_violation THEN
      v_err_caught := TRUE;
      v_err_msg := SQLERRM;
    WHEN OTHERS THEN
      v_err_caught := TRUE;
      v_err_msg := SQLERRM;
  END;

  IF NOT v_err_caught THEN
    RAISE EXCEPTION 'CASE 6 FAILED: Duplicate active general conversation for same org/driver was not rejected!';
  ELSE
    RAISE NOTICE '[PASS] CASE 6: Duplicate active general conversation successfully rejected by partial unique index: %', v_err_msg;
  END IF;

  -- -----------------------------------------------------------------
  -- CASE 7: Resolved/deleted general conversation does not block a new active general conversation
  -- -----------------------------------------------------------------
  -- 7A: Resolve existing conversation
  UPDATE public.conversations
  SET status = 'resolved', resolved_at = NOW()
  WHERE id = v_conv_id;

  -- 7B: New active general conversation should now succeed
  INSERT INTO public.conversations (
    organization_id, driver_id, type, load_id, status
  ) VALUES (
    v_org_a, v_driver_a1, 'general', NULL, 'active'
  ) RETURNING id INTO v_conv_id2;

  IF v_conv_id2 IS NULL THEN
    RAISE EXCEPTION 'CASE 7A FAILED: Resolved general conversation blocked new active general conversation.';
  END IF;

  -- 7C: Soft-delete that second conversation
  UPDATE public.conversations
  SET deleted_at = NOW()
  WHERE id = v_conv_id2;

  -- 7D: Third active general conversation should also succeed
  INSERT INTO public.conversations (
    organization_id, driver_id, type, load_id, status
  ) VALUES (
    v_org_a, v_driver_a1, 'general', NULL, 'active'
  ) RETURNING id INTO v_conv_id3;

  IF v_conv_id3 IS NULL THEN
    RAISE EXCEPTION 'CASE 7B FAILED: Deleted general conversation blocked new active general conversation.';
  ELSE
    RAISE NOTICE '[PASS] CASE 7: Resolved and deleted general conversations correctly allow new active general conversation.';
  END IF;

  -- -----------------------------------------------------------------
  -- CASE 8: Load FK uses ON DELETE SET NULL
  -- -----------------------------------------------------------------
  -- 8A: Verify foreign key definition in pg_constraint catalog
  SELECT confdeltype INTO v_confdeltype
  FROM pg_constraint
  WHERE conrelid = 'public.conversations'::regclass
    AND contype = 'f'
    AND conname = 'fk_conversations_load';

  IF v_confdeltype IS NULL THEN
    RAISE EXCEPTION 'CASE 8 FAILED: Foreign key constraint fk_conversations_load not found on public.conversations.';
  ELSIF v_confdeltype <> 'n' THEN
    RAISE EXCEPTION 'CASE 8 FAILED: fk_conversations_load confdeltype is ''%'', expected ''n'' (SET NULL).', v_confdeltype;
  ELSE
    RAISE NOTICE '[PASS] CASE 8: Load FK is confirmed configured with ON DELETE SET NULL (confdeltype=''n'').';
  END IF;

  -- -----------------------------------------------------------------
  -- CASE 9: Tenant isolation remains structurally enforced
  -- -----------------------------------------------------------------
  -- 9A: Immutability of organization_id
  v_err_caught := FALSE;
  v_err_msg := NULL;
  BEGIN
    UPDATE public.conversations
    SET organization_id = v_org_b
    WHERE id = v_conv_id3;
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM LIKE '%organization_id is immutable%' THEN
        v_err_caught := TRUE;
        v_err_msg := SQLERRM;
      ELSE
        v_err_msg := SQLERRM;
      END IF;
  END;

  IF NOT v_err_caught THEN
    RAISE EXCEPTION 'CASE 9A FAILED: organization_id reassignment was not blocked by prevent_organization_id_change trigger (Got: %).', v_err_msg;
  END IF;

  -- 9B: Row Level Security is enabled
  SELECT relrowsecurity INTO v_has_rls
  FROM pg_class
  WHERE oid = 'public.conversations'::regclass;

  IF NOT v_has_rls THEN
    RAISE EXCEPTION 'CASE 9B FAILED: Row Level Security is NOT enabled on public.conversations.';
  END IF;

  -- 9C: Cross-tenant RLS isolation
  -- Simulate User Admin B from Beta Logistics attempting to view Alpha Corp conversations
  PERFORM set_config('request.jwt.claim.sub', v_user_admin_b::text, true);
  SELECT COUNT(*) INTO v_count
  FROM public.conversations
  WHERE organization_id = v_org_a;

  IF v_count <> 0 THEN
    RAISE EXCEPTION 'CASE 9C FAILED: User Admin B can see Org A conversations via RLS (Count: %).', v_count;
  END IF;

  -- 9D: Office member view in own org
  -- Simulate User Admin A from Alpha Freight Corp viewing conversations in Org A
  PERFORM set_config('request.jwt.claim.sub', v_user_admin_a::text, true);
  SELECT COUNT(*) INTO v_count
  FROM public.conversations
  WHERE organization_id = v_org_a;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'CASE 9D FAILED: User Admin A cannot view own Org A conversations via RLS.';
  ELSE
    RAISE NOTICE '[PASS] CASE 9: Tenant isolation structurally enforced (immutable org_id, RLS enabled, cross-tenant isolation).';
  END IF;

  -- -----------------------------------------------------------------
  -- CASE 10: S6.4/S6.5/S6.6 objects remain untouched
  -- -----------------------------------------------------------------
  -- 10A: S6.4 assign_load_dispatch RPC exists
  SELECT COUNT(*) INTO v_count
  FROM pg_proc
  WHERE proname = 'assign_load_dispatch'
    AND pronamespace = 'public'::regnamespace;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'CASE 10A FAILED: public.assign_load_dispatch does not exist!';
  END IF;

  -- 10B: S6.5 drivers_status_check constraint still contains 'inactive'
  SELECT pg_get_constraintdef(oid) INTO v_check_condef
  FROM pg_constraint
  WHERE conrelid = 'public.drivers'::regclass
    AND conname = 'drivers_status_check';

  IF v_check_condef IS NULL OR v_check_condef NOT LIKE '%inactive%' THEN
    RAISE EXCEPTION 'CASE 10B FAILED: drivers_status_check does not contain ''inactive'' (def: %)', v_check_condef;
  END IF;

  -- 10C: S6.6 get_driver_assigned_loads RPC exists
  SELECT COUNT(*) INTO v_count
  FROM pg_proc
  WHERE proname = 'get_driver_assigned_loads'
    AND pronamespace = 'public'::regnamespace;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'CASE 10C FAILED: public.get_driver_assigned_loads does not exist!';
  END IF;

  -- 10D: S6.6 drivers.user_id column exists
  SELECT COUNT(*) INTO v_count
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'drivers'
    AND column_name = 'user_id';

  IF v_count = 0 THEN
    RAISE EXCEPTION 'CASE 10D FAILED: public.drivers.user_id column is missing!';
  END IF;

  -- 10E: S6.6 organization_members role check includes 'driver'
  SELECT pg_get_constraintdef(oid) INTO v_check_condef
  FROM pg_constraint
  WHERE conrelid = 'public.organization_members'::regclass
    AND conname = 'organization_members_role_check';

  IF v_check_condef IS NULL OR v_check_condef NOT LIKE '%driver%' THEN
    RAISE EXCEPTION 'CASE 10E FAILED: organization_members_role_check does not contain ''driver'' (def: %)', v_check_condef;
  ELSE
    RAISE NOTICE '[PASS] CASE 10: S6.4, S6.5, and S6.6 objects verified intact and untouched.';
  END IF;

  RAISE NOTICE '=============================================================';
  RAISE NOTICE 'ALL S6.7 COMMUNICATION FOUNDATION TESTS PASSED!';
  RAISE NOTICE '=============================================================';
END $$;

ROLLBACK;
