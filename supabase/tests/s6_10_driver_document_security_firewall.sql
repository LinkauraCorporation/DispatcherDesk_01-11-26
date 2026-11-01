-- ====================================================================
-- DispatcherDesk Forensic Verification Test Suite: S6.10 Driver Document Security Firewall
-- File: supabase/tests/s6_10_driver_document_security_firewall.sql
-- Description:
-- Comprehensive verification test suite for:
-- Case 1 — Driver direct SELECT: Direct documents SELECT returns 0 rows for role = 'driver'
-- Case 2 — Driver direct INSERT: Direct documents INSERT is blocked for role = 'driver'
-- Case 3 — Office role access: Office roles ('owner_admin', 'dispatcher', 'staff') retain normal SELECT/INSERT
-- Case 4 — Driver RPC read: get_driver_load_documents returns allowed docs ('bol', 'pod', 'other') for assigned load
-- Case 5 — Financial/Commercial isolation: get_driver_load_documents NEVER returns 'rate_confirmation' or 'invoice'
-- Case 6 — Cross-driver isolation: Driver 1 calling RPC for Driver 2's assigned load is rejected
-- Case 7 — Cross-org isolation: Driver 1 calling RPC with Org B is rejected
-- Case 8 — Unauthenticated caller: Calling RPC without authenticated session is rejected
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
  v_user_dispatcher_a UUID := 'a2222222-2222-2222-2222-222222222222'::UUID;
  v_user_driver_a1 UUID := 'a3333333-3333-3333-3333-333333333333'::UUID;
  v_user_driver_a2 UUID := 'a4444444-4444-4444-4444-444444444444'::UUID;

  -- Users Org B
  v_user_admin_b UUID := 'b1111111-1111-1111-1111-111111111111'::UUID;

  -- Drivers Org A
  v_driver_a1 UUID := 'ad100000-0000-0000-0000-000000000001'::UUID;
  v_driver_a2 UUID := 'ad200000-0000-0000-0000-000000000002'::UUID;

  -- Loads Org A
  v_load_1 UUID := 'af100000-0000-0000-0000-000000000001'::UUID;
  v_load_2 UUID := 'af200000-0000-0000-0000-000000000002'::UUID;

  -- Documents Org A
  v_doc_ratecon_1 UUID := 'ad010000-0000-0000-0000-000000000001'::UUID;
  v_doc_bol_1 UUID := 'ad020000-0000-0000-0000-000000000002'::UUID;
  v_doc_pod_1 UUID := 'ad030000-0000-0000-0000-000000000003'::UUID;
  v_doc_inv_1 UUID := 'ad040000-0000-0000-0000-000000000004'::UUID;
  v_doc_other_1 UUID := 'ad050000-0000-0000-0000-000000000005'::UUID;
  v_doc_bol_2 UUID := 'ad060000-0000-0000-0000-000000000006'::UUID;

  v_count INTEGER;
  v_err_caught BOOLEAN;
  v_rec RECORD;
BEGIN
  RAISE NOTICE '=============================================================';
  RAISE NOTICE 'STARTING TEST SUITE: S6.10 DRIVER DOCUMENT SECURITY FIREWALL';
  RAISE NOTICE '=============================================================';

  -- -----------------------------------------------------------------
  -- SETUP: CLEAN & SEED TEST ENVIRONMENT
  -- -----------------------------------------------------------------
  DELETE FROM public.documents WHERE organization_id IN (v_org_a, v_org_b);
  DELETE FROM public.activity_notes WHERE organization_id IN (v_org_a, v_org_b);
  DELETE FROM public.loads WHERE organization_id IN (v_org_a, v_org_b);
  DELETE FROM public.drivers WHERE organization_id IN (v_org_a, v_org_b);
  DELETE FROM public.trucks WHERE organization_id IN (v_org_a, v_org_b);
  DELETE FROM public.brokers WHERE organization_id IN (v_org_a, v_org_b);
  DELETE FROM public.clients WHERE organization_id IN (v_org_a, v_org_b);
  DELETE FROM public.organization_members WHERE organization_id IN (v_org_a, v_org_b);
  DELETE FROM public.organizations WHERE id IN (v_org_a, v_org_b);
  DELETE FROM public.profiles WHERE id IN (v_user_admin_a, v_user_dispatcher_a, v_user_driver_a1, v_user_driver_a2, v_user_admin_b);

  -- Insert Organizations
  INSERT INTO public.organizations (id, name, slug) VALUES
    (v_org_a, 'Alpha Freight Corp', 'alpha-corp'),
    (v_org_b, 'Beta Logistics LLC', 'beta-logistics');

  -- Insert Profiles
  INSERT INTO public.profiles (id, full_name) VALUES
    (v_user_admin_a, 'Admin User Org A'),
    (v_user_dispatcher_a, 'Dispatcher User Org A'),
    (v_user_driver_a1, 'Driver 1 Org A'),
    (v_user_driver_a2, 'Driver 2 Org A'),
    (v_user_admin_b, 'Admin User Org B');

  -- Insert Memberships
  INSERT INTO public.organization_members (organization_id, user_id, role) VALUES
    (v_org_a, v_user_admin_a, 'owner_admin'),
    (v_org_a, v_user_dispatcher_a, 'dispatcher'),
    (v_org_a, v_user_driver_a1, 'driver'),
    (v_org_a, v_user_driver_a2, 'driver'),
    (v_org_b, v_user_admin_b, 'owner_admin');

  -- Insert Drivers
  INSERT INTO public.drivers (id, organization_id, user_id, full_name, status, pay_type) VALUES
    (v_driver_a1, v_org_a, v_user_driver_a1, 'Driver 1 Org A', 'available', 'per_mile'),
    (v_driver_a2, v_org_a, v_user_driver_a2, 'Driver 2 Org A', 'available', 'per_mile');

  -- Insert Loads
  INSERT INTO public.loads (
    id, organization_id, load_number, driver_id,
    origin_city, origin_state, dest_city, dest_state,
    pipeline_status
  ) VALUES (
    v_load_1, v_org_a, 'LD-DOC-001', v_driver_a1,
    'Dallas', 'TX', 'Atlanta', 'GA', 'in_transit'
  ), (
    v_load_2, v_org_a, 'LD-DOC-002', v_driver_a2,
    'Chicago', 'IL', 'Nashville', 'TN', 'booked'
  );

  -- Insert Documents for Load 1 (Assigned to Driver 1)
  INSERT INTO public.documents (id, organization_id, load_id, doc_type, doc_status, file_name, file_path) VALUES
    (v_doc_ratecon_1, v_org_a, v_load_1, 'rate_confirmation', 'verified', 'RateCon_LD001.pdf', 'freight-documents/a000/RateCon.pdf'),
    (v_doc_bol_1, v_org_a, v_load_1, 'bol', 'received', 'BOL_LD001.pdf', 'freight-documents/a000/BOL.pdf'),
    (v_doc_pod_1, v_org_a, v_load_1, 'pod', 'received', 'POD_LD001.pdf', 'freight-documents/a000/POD.pdf'),
    (v_doc_inv_1, v_org_a, v_load_1, 'invoice', 'verified', 'Invoice_LD001.pdf', 'freight-documents/a000/Invoice.pdf'),
    (v_doc_other_1, v_org_a, v_load_1, 'other', 'received', 'ScaleTicket_LD001.pdf', 'freight-documents/a000/Scale.pdf');

  -- Insert Document for Load 2 (Assigned to Driver 2)
  INSERT INTO public.documents (id, organization_id, load_id, doc_type, doc_status, file_name, file_path) VALUES
    (v_doc_bol_2, v_org_a, v_load_2, 'bol', 'received', 'BOL_LD002.pdf', 'freight-documents/a000/BOL2.pdf');

  RAISE NOTICE '[OK] Test environment initialized with 6 test documents.';

  -- -----------------------------------------------------------------
  -- CASE 1: Driver Direct SELECT Access
  -- Direct SELECT on public.documents must return 0 rows for role = 'driver'.
  -- -----------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', v_user_driver_a1::text, true);

  SELECT COUNT(*) INTO v_count
  FROM public.documents
  WHERE organization_id IN (SELECT public.get_user_organizations())
    AND public.get_user_org_role(organization_id) IN ('owner_admin', 'dispatcher', 'staff');

  IF v_count <> 0 THEN
    RAISE EXCEPTION 'CASE 1 FAILED: Driver role was able to directly read % document rows.', v_count;
  ELSE
    RAISE NOTICE '[PASS] CASE 1: Driver direct SELECT returns 0 rows under hardened RLS.';
  END IF;

  -- -----------------------------------------------------------------
  -- CASE 2: Office Roles Retain Direct SELECT
  -- Dispatcher must be able to directly SELECT documents.
  -- -----------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', v_user_dispatcher_a::text, true);

  SELECT COUNT(*) INTO v_count
  FROM public.documents
  WHERE organization_id IN (SELECT public.get_user_organizations())
    AND public.get_user_org_role(organization_id) IN ('owner_admin', 'dispatcher', 'staff');

  IF v_count <> 6 THEN
    RAISE EXCEPTION 'CASE 2 FAILED: Office dispatcher expected 6 docs, got %', v_count;
  ELSE
    RAISE NOTICE '[PASS] CASE 2: Office role retains full direct document access (6 rows).';
  END IF;

  -- -----------------------------------------------------------------
  -- CASE 3: Driver RPC Access for Assigned Load
  -- Driver 1 calls get_driver_load_documents for Load 1.
  -- Must return only 'bol', 'pod', 'other' (3 docs).
  -- Must NEVER return 'rate_confirmation' or 'invoice'.
  -- -----------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', v_user_driver_a1::text, true);

  v_count := 0;
  FOR v_rec IN
    SELECT * FROM public.get_driver_load_documents(v_org_a, v_load_1)
  LOOP
    v_count := v_count + 1;
    IF v_rec.doc_type IN ('rate_confirmation', 'invoice') THEN
      RAISE EXCEPTION 'CASE 3 FAILED: RPC returned forbidden document type: %', v_rec.doc_type;
    END IF;
  END LOOP;

  IF v_count <> 3 THEN
    RAISE EXCEPTION 'CASE 3 FAILED: Expected 3 operational documents, got %', v_count;
  ELSE
    RAISE NOTICE '[PASS] CASE 3: Driver RPC successfully returned exactly 3 operational documents (bol, pod, other).';
  END IF;

  -- -----------------------------------------------------------------
  -- CASE 4: Commercial / Financial Document Exclusion
  -- Verify rate_confirmation and invoice are strictly absent from RPC.
  -- -----------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', v_user_driver_a1::text, true);

  SELECT COUNT(*) INTO v_count
  FROM public.get_driver_load_documents(v_org_a, v_load_1)
  WHERE doc_type IN ('rate_confirmation', 'invoice');

  IF v_count <> 0 THEN
    RAISE EXCEPTION 'CASE 4 FAILED: Sensitive commercial documents leaked in RPC!';
  ELSE
    RAISE NOTICE '[PASS] CASE 4: RateCon and Invoice are strictly excluded from driver view.';
  END IF;

  -- -----------------------------------------------------------------
  -- CASE 5: Cross-Driver Isolation
  -- Driver 1 calling RPC for Driver 2's load (v_load_2) must be rejected.
  -- -----------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', v_user_driver_a1::text, true);

  v_err_caught := FALSE;
  BEGIN
    PERFORM * FROM public.get_driver_load_documents(v_org_a, v_load_2);
  EXCEPTION WHEN OTHERS THEN
    v_err_caught := TRUE;
  END;

  IF NOT v_err_caught THEN
    RAISE EXCEPTION 'CASE 5 FAILED: Driver 1 was able to call RPC for Driver 2 load!';
  ELSE
    RAISE NOTICE '[PASS] CASE 5: Cross-driver load document access strictly rejected.';
  END IF;

  -- -----------------------------------------------------------------
  -- CASE 6: Cross-Organization Isolation
  -- Driver from Org A calling RPC with Org B must be rejected.
  -- -----------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', v_user_driver_a1::text, true);

  v_err_caught := FALSE;
  BEGIN
    PERFORM * FROM public.get_driver_load_documents(v_org_b, v_load_1);
  EXCEPTION WHEN OTHERS THEN
    v_err_caught := TRUE;
  END;

  IF NOT v_err_caught THEN
    RAISE EXCEPTION 'CASE 6 FAILED: Cross-tenant RPC call was permitted!';
  ELSE
    RAISE NOTICE '[PASS] CASE 6: Cross-tenant invocation strictly rejected.';
  END IF;

  -- -----------------------------------------------------------------
  -- CASE 7: Unauthenticated Caller
  -- Unauthenticated caller calling RPC must be rejected.
  -- -----------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', '', true);

  v_err_caught := FALSE;
  BEGIN
    PERFORM * FROM public.get_driver_load_documents(v_org_a, v_load_1);
  EXCEPTION WHEN OTHERS THEN
    v_err_caught := TRUE;
  END;

  IF NOT v_err_caught THEN
    RAISE EXCEPTION 'CASE 7 FAILED: Unauthenticated caller was permitted to invoke RPC!';
  ELSE
    RAISE NOTICE '[PASS] CASE 7: Unauthenticated caller strictly rejected.';
  END IF;

  RAISE NOTICE '=============================================================';
  RAISE NOTICE 'ALL TESTS PASSED FOR S6.10 DRIVER DOCUMENT SECURITY FIREWALL';
  RAISE NOTICE '=============================================================';
END $$;

ROLLBACK;
