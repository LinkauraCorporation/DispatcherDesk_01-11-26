-- ====================================================================
-- DispatcherDesk Forensic Verification Test Suite: S6.7B Communication Messages Foundation (Object 3B)
-- File: supabase/tests/s6_7b_communication_messages_foundation.sql
-- Description:
-- Automated SQL verification suite verifying:
-- 1. Valid message for an existing conversation succeeds.
-- 2. Invalid message_type is rejected.
-- 3. Invalid channel is rejected.
-- 4. Duplicate (organization_id, client_message_id) is rejected.
-- 5. Same client_message_id in a different organization remains independently valid.
-- 6. Message organization cannot differ from conversation organization.
-- 7. Invalid/nonexistent conversation is rejected.
-- 8. sender_id must reference an existing auth user.
-- 9. read_at and acknowledged_at remain independent.
-- 10. Soft-deleted message remains historically represented.
-- 11. Conversation deletion behavior respects the existing conversation_id ON DELETE RESTRICT.
-- 12. S6.7 conversations definition remains unchanged.
-- 13. S6.4/S6.5/S6.6 objects remain intact.
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

  -- Conversations
  v_conv_a UUID;
  v_conv_b UUID;

  -- Messages & Client Message IDs
  v_msg_id1 UUID;
  v_msg_id2 UUID;
  v_msg_id3 UUID;
  v_msg_id4 UUID;
  v_client_msg_id1 UUID := 'c1111111-0000-0000-0000-000000000001'::UUID;
  v_client_msg_id2 UUID := 'c2222222-0000-0000-0000-000000000002'::UUID;
  v_client_msg_id3 UUID := 'c3333333-0000-0000-0000-000000000003'::UUID;

  -- Test helpers & tracking
  v_err_caught BOOLEAN;
  v_err_msg TEXT;
  v_count INTEGER;
  v_check_condef TEXT;
  v_confdeltype "char";
  v_has_rls BOOLEAN;
  v_msg_record RECORD;
BEGIN
  RAISE NOTICE '=============================================================';
  RAISE NOTICE 'STARTING TEST SUITE: S6.7B COMMUNICATION MESSAGES FOUNDATION (3B)';
  RAISE NOTICE '=============================================================';

  -- -----------------------------------------------------------------
  -- SETUP: CLEAN & SEED TEST ENVIRONMENT
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
  DELETE FROM public.profiles WHERE id IN (v_user_admin_a, v_user_staff_a, v_user_driver_a1, v_user_admin_b);

  -- Seed auth.users if needed
  INSERT INTO auth.users (id, email) VALUES
    (v_user_admin_a, 'admin_a@example.com'),
    (v_user_staff_a, 'staff_a@example.com'),
    (v_user_driver_a1, 'driver_a1@example.com'),
    (v_user_admin_b, 'admin_b@example.com')
  ON CONFLICT (id) DO NOTHING;

  -- Insert Organizations
  INSERT INTO public.organizations (id, name, slug) VALUES
    (v_org_a, 'Alpha Freight Corp', 'alpha-corp'),
    (v_org_b, 'Beta Logistics LLC', 'beta-logistics');

  -- Insert Profiles
  INSERT INTO public.profiles (id, full_name) VALUES
    (v_user_admin_a, 'Admin User Org A'),
    (v_user_staff_a, 'Staff User Org A'),
    (v_user_driver_a1, 'Driver 1 Org A'),
    (v_user_admin_b, 'Admin User Org B')
  ON CONFLICT (id) DO NOTHING;

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

  -- Insert Conversations in Org A and Org B
  INSERT INTO public.conversations (
    organization_id, driver_id, type, load_id, status
  ) VALUES (
    v_org_a, v_driver_a1, 'general', NULL, 'active'
  ) RETURNING id INTO v_conv_a;

  INSERT INTO public.conversations (
    organization_id, driver_id, type, load_id, status
  ) VALUES (
    v_org_b, v_driver_b1, 'general', NULL, 'active'
  ) RETURNING id INTO v_conv_b;

  -- -----------------------------------------------------------------
  -- CASE 1: Valid message for an existing conversation succeeds
  -- -----------------------------------------------------------------
  INSERT INTO public.conversation_messages (
    organization_id,
    conversation_id,
    sender_id,
    message_type,
    channel,
    content,
    client_message_id
  ) VALUES (
    v_org_a,
    v_conv_a,
    v_user_admin_a,
    'text',
    'in_app',
    'Morning check-in: ready for dispatch.',
    v_client_msg_id1
  ) RETURNING id INTO v_msg_id1;

  IF v_msg_id1 IS NULL THEN
    RAISE EXCEPTION 'CASE 1 FAILED: Valid message insertion failed to return an ID.';
  ELSE
    RAISE NOTICE '[PASS] CASE 1: Valid message successfully inserted (ID: %).', v_msg_id1;
  END IF;

  -- -----------------------------------------------------------------
  -- CASE 2: Invalid message_type is rejected
  -- -----------------------------------------------------------------
  v_err_caught := FALSE;
  v_err_msg := NULL;
  BEGIN
    INSERT INTO public.conversation_messages (
      organization_id,
      conversation_id,
      sender_id,
      message_type,
      channel,
      content,
      client_message_id
    ) VALUES (
      v_org_a,
      v_conv_a,
      v_user_admin_a,
      'invalid_message_type',
      'in_app',
      'This should fail.',
      gen_random_uuid()
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
    RAISE EXCEPTION 'CASE 2 FAILED: Invalid message_type was not rejected!';
  ELSE
    RAISE NOTICE '[PASS] CASE 2: Invalid message_type successfully rejected by CHECK constraint: %', v_err_msg;
  END IF;

  -- -----------------------------------------------------------------
  -- CASE 3: Invalid channel is rejected
  -- -----------------------------------------------------------------
  v_err_caught := FALSE;
  v_err_msg := NULL;
  BEGIN
    INSERT INTO public.conversation_messages (
      organization_id,
      conversation_id,
      sender_id,
      message_type,
      channel,
      content,
      client_message_id
    ) VALUES (
      v_org_a,
      v_conv_a,
      v_user_admin_a,
      'text',
      'smoke_signals',
      'This should fail.',
      gen_random_uuid()
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
    RAISE EXCEPTION 'CASE 3 FAILED: Invalid channel was not rejected!';
  ELSE
    RAISE NOTICE '[PASS] CASE 3: Invalid channel successfully rejected by CHECK constraint: %', v_err_msg;
  END IF;

  -- -----------------------------------------------------------------
  -- CASE 4: Duplicate (organization_id, client_message_id) is rejected
  -- -----------------------------------------------------------------
  v_err_caught := FALSE;
  v_err_msg := NULL;
  BEGIN
    INSERT INTO public.conversation_messages (
      organization_id,
      conversation_id,
      sender_id,
      message_type,
      channel,
      content,
      client_message_id
    ) VALUES (
      v_org_a,
      v_conv_a,
      v_user_admin_a,
      'instruction',
      'sms',
      'Duplicate client message ID attempt in same org.',
      v_client_msg_id1
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
    RAISE EXCEPTION 'CASE 4 FAILED: Duplicate (organization_id, client_message_id) was not rejected!';
  ELSE
    RAISE NOTICE '[PASS] CASE 4: Duplicate (organization_id, client_message_id) successfully rejected: %', v_err_msg;
  END IF;

  -- -----------------------------------------------------------------
  -- CASE 5: Same client_message_id in a different organization remains independently valid
  -- -----------------------------------------------------------------
  INSERT INTO public.conversation_messages (
    organization_id,
    conversation_id,
    sender_id,
    message_type,
    channel,
    content,
    client_message_id
  ) VALUES (
    v_org_b,
    v_conv_b,
    v_user_admin_b,
    'quick_action',
    'in_app',
    'Independent message in Org B using same client_message_id.',
    v_client_msg_id1
  ) RETURNING id INTO v_msg_id2;

  IF v_msg_id2 IS NULL THEN
    RAISE EXCEPTION 'CASE 5 FAILED: Same client_message_id was incorrectly blocked in a different organization.';
  ELSE
    RAISE NOTICE '[PASS] CASE 5: Same client_message_id successfully accepted in different organization (Org B Msg ID: %).', v_msg_id2;
  END IF;

  -- -----------------------------------------------------------------
  -- CASE 6: Message organization cannot differ from conversation organization
  -- -----------------------------------------------------------------
  v_err_caught := FALSE;
  v_err_msg := NULL;
  BEGIN
    -- Message claims to be in Org A, but conversation belongs to Org B
    INSERT INTO public.conversation_messages (
      organization_id,
      conversation_id,
      sender_id,
      message_type,
      channel,
      content,
      client_message_id
    ) VALUES (
      v_org_a,
      v_conv_b,
      v_user_admin_a,
      'question',
      'in_app',
      'Attempting cross-tenant conversation reference.',
      v_client_msg_id2
    );
  EXCEPTION
    WHEN OTHERS THEN
      v_err_caught := TRUE;
      v_err_msg := SQLERRM;
  END;

  IF NOT v_err_caught OR v_err_msg NOT LIKE '%Tenant integrity violation%' THEN
    RAISE EXCEPTION 'CASE 6 FAILED: Cross-tenant message/conversation insertion was not rejected! (Caught: %, Msg: %)',
      v_err_caught, v_err_msg;
  ELSE
    RAISE NOTICE '[PASS] CASE 6: Cross-tenant message/conversation successfully rejected by tenant integrity trigger: %', v_err_msg;
  END IF;

  -- -----------------------------------------------------------------
  -- CASE 7: Invalid/nonexistent conversation is rejected
  -- -----------------------------------------------------------------
  v_err_caught := FALSE;
  v_err_msg := NULL;
  BEGIN
    INSERT INTO public.conversation_messages (
      organization_id,
      conversation_id,
      sender_id,
      message_type,
      channel,
      content,
      client_message_id
    ) VALUES (
      v_org_a,
      'ffffffff-ffff-ffff-ffff-ffffffffffff'::UUID,
      v_user_admin_a,
      'text',
      'in_app',
      'Referencing non-existent conversation.',
      gen_random_uuid()
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
    RAISE EXCEPTION 'CASE 7 FAILED: Non-existent conversation_id was not rejected!';
  ELSE
    RAISE NOTICE '[PASS] CASE 7: Non-existent conversation successfully rejected: %', v_err_msg;
  END IF;

  -- -----------------------------------------------------------------
  -- CASE 8: sender_id must reference an existing auth user
  -- -----------------------------------------------------------------
  v_err_caught := FALSE;
  v_err_msg := NULL;
  BEGIN
    INSERT INTO public.conversation_messages (
      organization_id,
      conversation_id,
      sender_id,
      message_type,
      channel,
      content,
      client_message_id
    ) VALUES (
      v_org_a,
      v_conv_a,
      '99999999-9999-9999-9999-999999999999'::UUID,
      'text',
      'in_app',
      'Referencing non-existent sender_id.',
      gen_random_uuid()
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
    RAISE EXCEPTION 'CASE 8 FAILED: Non-existent sender_id was not rejected by foreign key constraint!';
  ELSE
    RAISE NOTICE '[PASS] CASE 8: Non-existent sender_id successfully rejected by foreign key: %', v_err_msg;
  END IF;

  -- -----------------------------------------------------------------
  -- CASE 9: read_at and acknowledged_at remain independent
  -- -----------------------------------------------------------------
  -- 9A: Insert message with read_at set, acknowledged_at NULL
  INSERT INTO public.conversation_messages (
    organization_id,
    conversation_id,
    sender_id,
    message_type,
    channel,
    content,
    read_at,
    acknowledged_at,
    client_message_id
  ) VALUES (
    v_org_a,
    v_conv_a,
    v_user_admin_a,
    'instruction',
    'in_app',
    'Read-only status message.',
    NOW(),
    NULL,
    gen_random_uuid()
  ) RETURNING id INTO v_msg_id3;

  SELECT read_at, acknowledged_at INTO v_msg_record
  FROM public.conversation_messages
  WHERE id = v_msg_id3;

  IF v_msg_record.read_at IS NULL OR v_msg_record.acknowledged_at IS NOT NULL THEN
    RAISE EXCEPTION 'CASE 9A FAILED: read_at and acknowledged_at coupled unexpectedly (read_at: %, ack_at: %)',
      v_msg_record.read_at, v_msg_record.acknowledged_at;
  END IF;

  -- 9B: Insert message with acknowledged_at set, read_at NULL
  INSERT INTO public.conversation_messages (
    organization_id,
    conversation_id,
    sender_id,
    message_type,
    channel,
    content,
    read_at,
    acknowledged_at,
    client_message_id
  ) VALUES (
    v_org_a,
    v_conv_a,
    v_user_admin_a,
    'confirmation',
    'in_app',
    'Acknowledged-only status message.',
    NULL,
    NOW(),
    gen_random_uuid()
  ) RETURNING id INTO v_msg_id4;

  SELECT read_at, acknowledged_at INTO v_msg_record
  FROM public.conversation_messages
  WHERE id = v_msg_id4;

  IF v_msg_record.read_at IS NOT NULL OR v_msg_record.acknowledged_at IS NULL THEN
    RAISE EXCEPTION 'CASE 9B FAILED: acknowledged_at without read_at coupled unexpectedly (read_at: %, ack_at: %)',
      v_msg_record.read_at, v_msg_record.acknowledged_at;
  ELSE
    RAISE NOTICE '[PASS] CASE 9: read_at and acknowledged_at are verified strictly independent.';
  END IF;

  -- -----------------------------------------------------------------
  -- CASE 10: Soft-deleted message remains historically represented
  -- -----------------------------------------------------------------
  UPDATE public.conversation_messages
  SET deleted_at = NOW()
  WHERE id = v_msg_id3;

  SELECT COUNT(*) INTO v_count
  FROM public.conversation_messages
  WHERE id = v_msg_id3 AND deleted_at IS NOT NULL;

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'CASE 10 FAILED: Soft-deleted message row missing or deleted_at not updated.';
  ELSE
    RAISE NOTICE '[PASS] CASE 10: Soft-deleted message remains historically represented with deleted_at timestamp.';
  END IF;

  -- -----------------------------------------------------------------
  -- CASE 11: Conversation deletion behavior respects conversation_id ON DELETE RESTRICT
  -- -----------------------------------------------------------------
  v_err_caught := FALSE;
  v_err_msg := NULL;
  BEGIN
    DELETE FROM public.conversations WHERE id = v_conv_a;
  EXCEPTION
    WHEN foreign_key_violation THEN
      v_err_caught := TRUE;
      v_err_msg := SQLERRM;
    WHEN OTHERS THEN
      v_err_caught := TRUE;
      v_err_msg := SQLERRM;
  END;

  IF NOT v_err_caught THEN
    RAISE EXCEPTION 'CASE 11 FAILED: Deleting conversation with existing messages was not rejected by ON DELETE RESTRICT!';
  ELSE
    RAISE NOTICE '[PASS] CASE 11: Conversation deletion correctly rejected by ON DELETE RESTRICT: %', v_err_msg;
  END IF;

  -- -----------------------------------------------------------------
  -- CASE 12: S6.7 conversations definition remains unchanged
  -- -----------------------------------------------------------------
  -- 12A: Check expected column count and column existence in public.conversations
  SELECT COUNT(*) INTO v_count
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'conversations'
    AND column_name IN (
      'id', 'organization_id', 'driver_id', 'type', 'load_id',
      'status', 'created_at', 'updated_at', 'resolved_at', 'deleted_at'
    );

  IF v_count <> 10 THEN
    RAISE EXCEPTION 'CASE 12A FAILED: Expected 10 core columns on public.conversations, found %', v_count;
  END IF;

  -- 12B: Verify total column count on public.conversations has not grown/shrunk
  SELECT COUNT(*) INTO v_count
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'conversations';

  IF v_count <> 10 THEN
    RAISE EXCEPTION 'CASE 12B FAILED: public.conversations column structure was modified (found % columns, expected 10)', v_count;
  END IF;

  -- 12C: Verify fk_conversations_driver FK constraint exists
  SELECT COUNT(*) INTO v_count
  FROM pg_constraint
  WHERE conrelid = 'public.conversations'::regclass
    AND conname = 'fk_conversations_driver'
    AND contype = 'f';

  IF v_count = 0 THEN
    RAISE EXCEPTION 'CASE 12C FAILED: fk_conversations_driver constraint missing from public.conversations.';
  END IF;

  -- 12D: Verify fk_conversations_load FK constraint exists
  SELECT COUNT(*) INTO v_count
  FROM pg_constraint
  WHERE conrelid = 'public.conversations'::regclass
    AND conname = 'fk_conversations_load'
    AND contype = 'f';

  IF v_count = 0 THEN
    RAISE EXCEPTION 'CASE 12D FAILED: fk_conversations_load constraint missing from public.conversations.';
  END IF;

  -- 12E: Verify chk_conversations_type_load_consistency CHECK constraint exists
  SELECT COUNT(*) INTO v_count
  FROM pg_constraint
  WHERE conrelid = 'public.conversations'::regclass
    AND conname = 'chk_conversations_type_load_consistency'
    AND contype = 'c';

  IF v_count = 0 THEN
    RAISE EXCEPTION 'CASE 12E FAILED: chk_conversations_type_load_consistency missing from public.conversations.';
  ELSE
    RAISE NOTICE '[PASS] CASE 12: S6.7 public.conversations contract verified completely unchanged.';
  END IF;

  -- -----------------------------------------------------------------
  -- CASE 13: S6.4/S6.5/S6.6 objects remain intact
  -- -----------------------------------------------------------------
  -- 13A: S6.4 assign_load_dispatch RPC exists
  SELECT COUNT(*) INTO v_count
  FROM pg_proc
  WHERE proname = 'assign_load_dispatch'
    AND pronamespace = 'public'::regnamespace;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'CASE 13A FAILED: public.assign_load_dispatch does not exist!';
  END IF;

  -- 13B: S6.5 drivers_status_check constraint still contains 'inactive'
  SELECT pg_get_constraintdef(oid) INTO v_check_condef
  FROM pg_constraint
  WHERE conrelid = 'public.drivers'::regclass
    AND conname = 'drivers_status_check';

  IF v_check_condef IS NULL OR v_check_condef NOT LIKE '%inactive%' THEN
    RAISE EXCEPTION 'CASE 13B FAILED: drivers_status_check does not contain ''inactive'' (def: %)', v_check_condef;
  END IF;

  -- 13C: S6.6 get_driver_assigned_loads RPC exists
  SELECT COUNT(*) INTO v_count
  FROM pg_proc
  WHERE proname = 'get_driver_assigned_loads'
    AND pronamespace = 'public'::regnamespace;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'CASE 13C FAILED: public.get_driver_assigned_loads does not exist!';
  END IF;

  -- 13D: S6.6 drivers.user_id column exists
  SELECT COUNT(*) INTO v_count
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'drivers'
    AND column_name = 'user_id';

  IF v_count = 0 THEN
    RAISE EXCEPTION 'CASE 13D FAILED: public.drivers.user_id column is missing!';
  END IF;

  -- 13E: S6.6 organization_members role check includes 'driver'
  SELECT pg_get_constraintdef(oid) INTO v_check_condef
  FROM pg_constraint
  WHERE conrelid = 'public.organization_members'::regclass
    AND conname = 'organization_members_role_check';

  IF v_check_condef IS NULL OR v_check_condef NOT LIKE '%driver%' THEN
    RAISE EXCEPTION 'CASE 13E FAILED: organization_members_role_check does not contain ''driver'' (def: %)', v_check_condef;
  ELSE
    RAISE NOTICE '[PASS] CASE 13: S6.4, S6.5, and S6.6 objects verified intact and untouched.';
  END IF;

  RAISE NOTICE '=============================================================';
  RAISE NOTICE 'ALL S6.7B COMMUNICATION MESSAGES FOUNDATION TESTS PASSED!';
  RAISE NOTICE '=============================================================';
END $$;

ROLLBACK;
