-- ====================================================================
-- DispatcherDesk SQL Test Suite: S6.3 Operational Event, Document & Check-Call Integrity
-- Version: 1.0.0
-- File: supabase/tests/s6_3_operational_integrity.sql
-- Description:
-- Tests and verifies:
-- 1. Cross-tenant document SELECT isolation
-- 2. Cross-tenant document INSERT isolation
-- 3. Cross-tenant document UPDATE isolation
-- 4. Cross-tenant document DELETE isolation
-- 5. Cross-tenant check_call SELECT isolation
-- 6. Cross-tenant check_call INSERT isolation
-- 7. Cross-tenant check_call UPDATE isolation
-- 8. Cross-tenant check_call DELETE isolation
-- 9. Cross-tenant activity_notes SELECT isolation
-- 10. Cross-tenant activity_notes INSERT isolation
-- 11. Activity notes audit immutability (UPDATE denied) & owner_admin DELETE policy
-- 12. Cross-tenant tasks SELECT isolation
-- 13. Cross-tenant tasks INSERT/UPDATE/DELETE isolation
-- 14. Staff role operational write restriction (tasks & check_calls mutation denied)
-- 15. Cross-tenant composite foreign key integrity (documents, check_calls, tasks, activity_notes)
-- 16. Immutable organization_id triggers on all operational tables
-- ====================================================================

BEGIN;

-- Setup test helper schema
CREATE SCHEMA IF NOT EXISTS test_helpers;

CREATE OR REPLACE FUNCTION test_helpers.assert(condition boolean, message text)
RETURNS void AS $$
BEGIN
  IF NOT condition THEN
    RAISE EXCEPTION 'TEST ASSERTION FAILED: %', message;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- --------------------------------------------------------------------
-- Setup Test Fixtures: Two Distinct Organizations and Users
-- --------------------------------------------------------------------

DO $$
DECLARE
  v_user_alpha UUID := 'aaaaaaaa-1111-4000-8000-000000000001'::UUID;
  v_user_beta  UUID := 'bbbbbbbb-2222-4000-8000-000000000002'::UUID;
  v_user_staff UUID := 'ssssssss-3333-4000-8000-000000000003'::UUID;

  v_org_alpha UUID := 'a0000000-0000-4000-8000-000000000001'::UUID;
  v_org_beta  UUID := 'b0000000-0000-4000-8000-000000000002'::UUID;

  v_load_alpha UUID := '1a000000-0000-4000-8000-000000000001'::UUID;
  v_load_beta  UUID := '1b000000-0000-4000-8000-000000000002'::UUID;

  v_doc_alpha UUID := 'da000000-0000-4000-8000-000000000001'::UUID;
  v_call_alpha UUID := 'ca000000-0000-4000-8000-000000000001'::UUID;
  v_task_alpha UUID := 'ta000000-0000-4000-8000-000000000001'::UUID;
  v_note_alpha UUID := 'na000000-0000-4000-8000-000000000001'::UUID;

  v_caught_exception BOOLEAN;
  v_row_count INTEGER;
BEGIN
  -- Insert mock auth users into auth.users if not present
  INSERT INTO auth.users (id, email)
  VALUES 
    (v_user_alpha, 'alpha_admin@example.com'),
    (v_user_beta, 'beta_admin@example.com'),
    (v_user_staff, 'alpha_staff@example.com')
  ON CONFLICT (id) DO NOTHING;

  -- Insert profiles
  INSERT INTO public.profiles (id, full_name, email)
  VALUES 
    (v_user_alpha, 'Alpha Admin', 'alpha_admin@example.com'),
    (v_user_beta, 'Beta Admin', 'beta_admin@example.com'),
    (v_user_staff, 'Alpha Staff', 'alpha_staff@example.com')
  ON CONFLICT (id) DO NOTHING;

  -- Insert Organizations
  INSERT INTO public.organizations (id, name, slug)
  VALUES 
    (v_org_alpha, 'Alpha Freight Org', 'alpha-freight-s63'),
    (v_org_beta, 'Beta Freight Org', 'beta-freight-s63')
  ON CONFLICT (id) DO NOTHING;

  -- Insert Memberships
  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES 
    (v_org_alpha, v_user_alpha, 'owner_admin'),
    (v_org_beta, v_user_beta, 'owner_admin'),
    (v_org_alpha, v_user_staff, 'staff')
  ON CONFLICT (organization_id, user_id) DO UPDATE SET role = EXCLUDED.role;

  -- Insert Baseline Valid Loads
  INSERT INTO public.loads (
    id, organization_id, load_number, pipeline_status,
    origin_city, origin_state, dest_city, dest_state,
    rate, loaded_miles, deadhead_miles, fuel_expense, driver_pay, other_expenses
  ) VALUES (
    v_load_alpha, v_org_alpha, 'LD-S63-ALPHA-01', 'booked',
    'Dallas', 'TX', 'Atlanta', 'GA',
    2500.00, 780.00, 45.00, 600.00, 950.00, 100.00
  ), (
    v_load_beta, v_org_beta, 'LD-S63-BETA-01', 'booked',
    'Chicago', 'IL', 'Denver', 'CO',
    3200.00, 1000.00, 50.00, 800.00, 1200.00, 150.00
  ) ON CONFLICT (organization_id, id) DO NOTHING;

  -- Insert Baseline Alpha Operational Records (as System / Seed)
  INSERT INTO public.documents (
    id, organization_id, load_id, doc_type, doc_status, file_name, file_path
  ) VALUES (
    v_doc_alpha, v_org_alpha, v_load_alpha, 'rate_confirmation', 'verified', 'ratecon_alpha.pdf', 'freight-documents/a000/ratecon_alpha.pdf'
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.check_calls (
    id, organization_id, load_id, call_type, status, location_city, location_state, created_by
  ) VALUES (
    v_call_alpha, v_org_alpha, v_load_alpha, 'dispatch', 'on_time', 'Dallas', 'TX', 'Alpha Admin'
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.tasks (
    id, organization_id, load_id, category, title, due_at, status, priority
  ) VALUES (
    v_task_alpha, v_org_alpha, v_load_alpha, 'check_call', 'Confirm check-in with driver', NOW() + INTERVAL '2 hours', 'pending', 'normal'
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.activity_notes (
    id, organization_id, load_id, author_id, note_type, content
  ) VALUES (
    v_note_alpha, v_org_alpha, v_load_alpha, v_user_alpha, 'general', 'Initial dispatch check completed.'
  ) ON CONFLICT (id) DO NOTHING;

  -- ==================================================================
  -- Test 1: Cross-Tenant Document SELECT Isolation
  -- ==================================================================
  EXECUTE format('SET LOCAL "request.jwt.claim.sub" = %L', v_user_beta::text);
  EXECUTE format('SET LOCAL "request.jwt.claim.role" = %L', 'authenticated');

  SELECT COUNT(*) INTO v_row_count
  FROM public.documents
  WHERE id = v_doc_alpha;

  PERFORM test_helpers.assert(v_row_count = 0, 'Test 1 Failed: User Beta was able to SELECT Org Alpha document under RLS.');

  -- ==================================================================
  -- Test 2: Cross-Tenant Document INSERT Isolation
  -- ==================================================================
  v_caught_exception := FALSE;
  BEGIN
    INSERT INTO public.documents (
      id, organization_id, load_id, doc_type, doc_status, file_name
    ) VALUES (
      gen_random_uuid(), v_org_alpha, v_load_alpha, 'bol', 'received', 'bol_rogue.pdf'
    );
  EXCEPTION WHEN OTHERS THEN
    v_caught_exception := TRUE;
  END;

  PERFORM test_helpers.assert(v_caught_exception, 'Test 2 Failed: User Beta was able to INSERT document into Org Alpha.');

  -- ==================================================================
  -- Test 3: Cross-Tenant Document UPDATE Isolation
  -- ==================================================================
  UPDATE public.documents
  SET notes = 'Tampered by Beta'
  WHERE id = v_doc_alpha;

  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  PERFORM test_helpers.assert(v_row_count = 0, 'Test 3 Failed: User Beta was able to UPDATE Org Alpha document.');

  -- ==================================================================
  -- Test 4: Cross-Tenant Document DELETE Isolation
  -- ==================================================================
  DELETE FROM public.documents
  WHERE id = v_doc_alpha;

  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  PERFORM test_helpers.assert(v_row_count = 0, 'Test 4 Failed: User Beta was able to DELETE Org Alpha document.');

  -- ==================================================================
  -- Test 5: Cross-Tenant Check Call SELECT Isolation
  -- ==================================================================
  SELECT COUNT(*) INTO v_row_count
  FROM public.check_calls
  WHERE id = v_call_alpha;

  PERFORM test_helpers.assert(v_row_count = 0, 'Test 5 Failed: User Beta was able to SELECT Org Alpha check call under RLS.');

  -- ==================================================================
  -- Test 6: Cross-Tenant Check Call INSERT Isolation
  -- ==================================================================
  v_caught_exception := FALSE;
  BEGIN
    INSERT INTO public.check_calls (
      id, organization_id, load_id, call_type, status, created_by
    ) VALUES (
      gen_random_uuid(), v_org_alpha, v_load_alpha, 'delay', 'delayed', 'Beta Rogue'
    );
  EXCEPTION WHEN OTHERS THEN
    v_caught_exception := TRUE;
  END;

  PERFORM test_helpers.assert(v_caught_exception, 'Test 6 Failed: User Beta was able to INSERT check call into Org Alpha.');

  -- ==================================================================
  -- Test 7: Cross-Tenant Check Call UPDATE Isolation
  -- ==================================================================
  UPDATE public.check_calls
  SET notes = 'Tampered by Beta'
  WHERE id = v_call_alpha;

  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  PERFORM test_helpers.assert(v_row_count = 0, 'Test 7 Failed: User Beta was able to UPDATE Org Alpha check call.');

  -- ==================================================================
  -- Test 8: Cross-Tenant Check Call DELETE Isolation
  -- ==================================================================
  DELETE FROM public.check_calls
  WHERE id = v_call_alpha;

  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  PERFORM test_helpers.assert(v_row_count = 0, 'Test 8 Failed: User Beta was able to DELETE Org Alpha check call.');

  -- ==================================================================
  -- Test 9: Cross-Tenant Activity Notes SELECT Isolation
  -- ==================================================================
  SELECT COUNT(*) INTO v_row_count
  FROM public.activity_notes
  WHERE id = v_note_alpha;

  PERFORM test_helpers.assert(v_row_count = 0, 'Test 9 Failed: User Beta was able to SELECT Org Alpha activity note under RLS.');

  -- ==================================================================
  -- Test 10: Cross-Tenant Activity Notes INSERT Isolation
  -- ==================================================================
  v_caught_exception := FALSE;
  BEGIN
    INSERT INTO public.activity_notes (
      id, organization_id, load_id, author_id, note_type, content
    ) VALUES (
      gen_random_uuid(), v_org_alpha, v_load_alpha, v_user_beta, 'general', 'Rogue note from Beta.'
    );
  EXCEPTION WHEN OTHERS THEN
    v_caught_exception := TRUE;
  END;

  PERFORM test_helpers.assert(v_caught_exception, 'Test 10 Failed: User Beta was able to INSERT activity note into Org Alpha.');

  -- ==================================================================
  -- Test 11: Activity Notes Audit Immutability & Admin Delete
  -- ==================================================================
  -- Switch to Alpha Admin
  EXECUTE format('SET LOCAL "request.jwt.claim.sub" = %L', v_user_alpha::text);
  EXECUTE format('SET LOCAL "request.jwt.claim.role" = %L', 'authenticated');

  -- Attempt to UPDATE note (must be denied because no UPDATE policy exists on activity_notes)
  UPDATE public.activity_notes
  SET content = 'Modified audit trail note.'
  WHERE id = v_note_alpha;

  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  PERFORM test_helpers.assert(v_row_count = 0, 'Test 11.A Failed: Activity note UPDATE must be denied by RLS.');

  -- Switch to Alpha Staff
  EXECUTE format('SET LOCAL "request.jwt.claim.sub" = %L', v_user_staff::text);
  EXECUTE format('SET LOCAL "request.jwt.claim.role" = %L', 'authenticated');

  -- Attempt to DELETE note as Staff (must be denied)
  DELETE FROM public.activity_notes
  WHERE id = v_note_alpha;

  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  PERFORM test_helpers.assert(v_row_count = 0, 'Test 11.B Failed: Staff member cannot DELETE activity note.');

  -- ==================================================================
  -- Test 12: Cross-Tenant Tasks SELECT Isolation
  -- ==================================================================
  EXECUTE format('SET LOCAL "request.jwt.claim.sub" = %L', v_user_beta::text);
  EXECUTE format('SET LOCAL "request.jwt.claim.role" = %L', 'authenticated');

  SELECT COUNT(*) INTO v_row_count
  FROM public.tasks
  WHERE id = v_task_alpha;

  PERFORM test_helpers.assert(v_row_count = 0, 'Test 12 Failed: User Beta was able to SELECT Org Alpha task under RLS.');

  -- ==================================================================
  -- Test 13: Cross-Tenant Tasks INSERT / UPDATE / DELETE Isolation
  -- ==================================================================
  v_caught_exception := FALSE;
  BEGIN
    INSERT INTO public.tasks (
      id, organization_id, load_id, category, title, due_at
    ) VALUES (
      gen_random_uuid(), v_org_alpha, v_load_alpha, 'billing_prep', 'Beta Rogue Task', NOW() + INTERVAL '1 hour'
    );
  EXCEPTION WHEN OTHERS THEN
    v_caught_exception := TRUE;
  END;

  PERFORM test_helpers.assert(v_caught_exception, 'Test 13.A Failed: User Beta was able to INSERT task into Org Alpha.');

  UPDATE public.tasks
  SET status = 'cancelled'
  WHERE id = v_task_alpha;

  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  PERFORM test_helpers.assert(v_row_count = 0, 'Test 13.B Failed: User Beta was able to UPDATE Org Alpha task.');

  DELETE FROM public.tasks
  WHERE id = v_task_alpha;

  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  PERFORM test_helpers.assert(v_row_count = 0, 'Test 13.C Failed: User Beta was able to DELETE Org Alpha task.');

  -- ==================================================================
  -- Test 14: Staff Role Mutation Denial (Tasks & Check Calls)
  -- ==================================================================
  EXECUTE format('SET LOCAL "request.jwt.claim.sub" = %L', v_user_staff::text);
  EXECUTE format('SET LOCAL "request.jwt.claim.role" = %L', 'authenticated');

  -- Staff cannot insert task
  v_caught_exception := FALSE;
  BEGIN
    INSERT INTO public.tasks (
      id, organization_id, load_id, category, title, due_at
    ) VALUES (
      gen_random_uuid(), v_org_alpha, v_load_alpha, 'driver_instruction', 'Staff Created Task', NOW() + INTERVAL '1 hour'
    );
  EXCEPTION WHEN OTHERS THEN
    v_caught_exception := TRUE;
  END;

  PERFORM test_helpers.assert(v_caught_exception, 'Test 14.A Failed: Staff role must not be allowed to INSERT tasks.');

  -- Staff cannot insert check call
  v_caught_exception := FALSE;
  BEGIN
    INSERT INTO public.check_calls (
      id, organization_id, load_id, call_type, status, created_by
    ) VALUES (
      gen_random_uuid(), v_org_alpha, v_load_alpha, 'dispatch', 'on_time', 'Staff User'
    );
  EXCEPTION WHEN OTHERS THEN
    v_caught_exception := TRUE;
  END;

  PERFORM test_helpers.assert(v_caught_exception, 'Test 14.B Failed: Staff role must not be allowed to INSERT check calls.');

  -- Staff cannot update task
  UPDATE public.tasks
  SET status = 'in_progress'
  WHERE id = v_task_alpha;

  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  PERFORM test_helpers.assert(v_row_count = 0, 'Test 14.C Failed: Staff role must not be allowed to UPDATE tasks.');

  -- Staff cannot delete check call
  DELETE FROM public.check_calls
  WHERE id = v_call_alpha;

  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  PERFORM test_helpers.assert(v_row_count = 0, 'Test 14.D Failed: Staff role must not be allowed to DELETE check calls.');

  -- ==================================================================
  -- Test 15: Cross-Tenant Composite Foreign Key Integrity
  -- ==================================================================
  -- Reset to service/admin role to test database constraints directly
  RESET "request.jwt.claim.sub";
  RESET "request.jwt.claim.role";

  -- Document with Org Alpha referencing Org Beta's load
  v_caught_exception := FALSE;
  BEGIN
    INSERT INTO public.documents (
      id, organization_id, load_id, doc_type, doc_status, file_name
    ) VALUES (
      gen_random_uuid(), v_org_alpha, v_load_beta, 'bol', 'received', 'cross_org_bol.pdf'
    );
  EXCEPTION WHEN foreign_key_violation THEN
    v_caught_exception := TRUE;
  END;

  PERFORM test_helpers.assert(v_caught_exception, 'Test 15.A Failed: Document with cross-tenant load_id did not trigger foreign key violation.');

  -- Check Call with Org Alpha referencing Org Beta's load
  v_caught_exception := FALSE;
  BEGIN
    INSERT INTO public.check_calls (
      id, organization_id, load_id, call_type, status, created_by
    ) VALUES (
      gen_random_uuid(), v_org_alpha, v_load_beta, 'dispatch', 'on_time', 'System'
    );
  EXCEPTION WHEN foreign_key_violation THEN
    v_caught_exception := TRUE;
  END;

  PERFORM test_helpers.assert(v_caught_exception, 'Test 15.B Failed: Check call with cross-tenant load_id did not trigger foreign key violation.');

  -- Task with Org Alpha referencing Org Beta's load
  v_caught_exception := FALSE;
  BEGIN
    INSERT INTO public.tasks (
      id, organization_id, load_id, category, title, due_at
    ) VALUES (
      gen_random_uuid(), v_org_alpha, v_load_beta, 'check_call', 'Cross Org Task', NOW() + INTERVAL '1 hour'
    );
  EXCEPTION WHEN foreign_key_violation THEN
    v_caught_exception := TRUE;
  END;

  PERFORM test_helpers.assert(v_caught_exception, 'Test 15.C Failed: Task with cross-tenant load_id did not trigger foreign key violation.');

  -- Activity Note with Org Alpha referencing Org Beta's load
  v_caught_exception := FALSE;
  BEGIN
    INSERT INTO public.activity_notes (
      id, organization_id, load_id, author_id, note_type, content
    ) VALUES (
      gen_random_uuid(), v_org_alpha, v_load_beta, v_user_alpha, 'general', 'Cross org note.'
    );
  EXCEPTION WHEN foreign_key_violation THEN
    v_caught_exception := TRUE;
  END;

  PERFORM test_helpers.assert(v_caught_exception, 'Test 15.D Failed: Activity note with cross-tenant load_id did not trigger foreign key violation.');

  -- ==================================================================
  -- Test 16: Immutable organization_id Trigger Verification
  -- ==================================================================
  -- Documents organization_id immutability
  v_caught_exception := FALSE;
  BEGIN
    UPDATE public.documents
    SET organization_id = v_org_beta
    WHERE id = v_doc_alpha;
  EXCEPTION WHEN OTHERS THEN
    v_caught_exception := TRUE;
  END;
  PERFORM test_helpers.assert(v_caught_exception, 'Test 16.A Failed: Document organization_id reassignment did not trigger prevent_organization_id_change.');

  -- Check Calls organization_id immutability
  v_caught_exception := FALSE;
  BEGIN
    UPDATE public.check_calls
    SET organization_id = v_org_beta
    WHERE id = v_call_alpha;
  EXCEPTION WHEN OTHERS THEN
    v_caught_exception := TRUE;
  END;
  PERFORM test_helpers.assert(v_caught_exception, 'Test 16.B Failed: Check call organization_id reassignment did not trigger prevent_organization_id_change.');

  -- Tasks organization_id immutability
  v_caught_exception := FALSE;
  BEGIN
    UPDATE public.tasks
    SET organization_id = v_org_beta
    WHERE id = v_task_alpha;
  EXCEPTION WHEN OTHERS THEN
    v_caught_exception := TRUE;
  END;
  PERFORM test_helpers.assert(v_caught_exception, 'Test 16.C Failed: Task organization_id reassignment did not trigger prevent_organization_id_change.');

  -- Activity Notes organization_id immutability
  v_caught_exception := FALSE;
  BEGIN
    UPDATE public.activity_notes
    SET organization_id = v_org_beta
    WHERE id = v_note_alpha;
  EXCEPTION WHEN OTHERS THEN
    v_caught_exception := TRUE;
  END;
  PERFORM test_helpers.assert(v_caught_exception, 'Test 16.D Failed: Activity note organization_id reassignment did not trigger prevent_organization_id_change.');

  RAISE NOTICE 'SUCCESS: All 16 S6.3 Operational Event, Document & Check-Call Integrity test cases passed.';
END $$;

ROLLBACK;
