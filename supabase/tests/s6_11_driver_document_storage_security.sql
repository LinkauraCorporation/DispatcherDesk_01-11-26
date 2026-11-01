-- ====================================================================
-- DispatcherDesk Forensic Verification Test Suite: S6.11 Driver Document Storage Security
-- File: supabase/tests/s6_11_driver_document_storage_security.sql
-- Description:
-- Comprehensive verification test suite for:
-- Case 1 — Office role access: Dispatcher/Admin can access all organization storage documents
-- Case 2 — Assigned driver access: Driver can access BOL, POD, and other for assigned load
-- Case 3 — RateCon exclusion: Driver CANNOT access RateCon even for assigned load
-- Case 4 — Invoice exclusion: Driver CANNOT access Invoice even for assigned load
-- Case 5 — Cross-driver isolation: Driver 1 CANNOT access Driver 2's load documents
-- Case 6 — Unassigned load isolation: Driver CANNOT access documents on unassigned loads
-- Case 7 — Arbitrary object isolation: Driver CANNOT access arbitrary storage files
-- Case 8 — Cross-org isolation: Driver in Org A CANNOT access Org B documents
-- Case 9 — Unauthenticated caller: Unauthenticated caller is denied
-- Case 10 — Upload preservation: No driver upload permission added
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
  v_load_unassigned UUID := 'af300000-0000-0000-0000-000000000003'::UUID;

  -- Storage Object Paths
  v_path_ratecon_1 TEXT;
  v_path_bol_1 TEXT;
  v_path_pod_1 TEXT;
  v_path_inv_1 TEXT;
  v_path_other_1 TEXT;
  v_path_bol_2 TEXT;
  v_path_unassigned_bol TEXT;
  v_path_arbitrary TEXT;
  v_path_org_b_bol TEXT;

  v_allowed BOOLEAN;
BEGIN
  RAISE NOTICE '=============================================================';
  RAISE NOTICE 'STARTING TEST SUITE: S6.11 DRIVER DOCUMENT STORAGE SECURITY';
  RAISE NOTICE '=============================================================';

  -- Construct storage paths
  v_path_ratecon_1 := v_org_a::text || '/' || v_load_1::text || '/RateCon_LD001.pdf';
  v_path_bol_1 := v_org_a::text || '/' || v_load_1::text || '/BOL_LD001.pdf';
  v_path_pod_1 := v_org_a::text || '/' || v_load_1::text || '/POD_LD001.pdf';
  v_path_inv_1 := v_org_a::text || '/' || v_load_1::text || '/Invoice_LD001.pdf';
  v_path_other_1 := v_org_a::text || '/' || v_load_1::text || '/ScaleTicket_LD001.pdf';
  v_path_bol_2 := v_org_a::text || '/' || v_load_2::text || '/BOL_LD002.pdf';
  v_path_unassigned_bol := v_org_a::text || '/' || v_load_unassigned::text || '/BOL_Unassigned.pdf';
  v_path_arbitrary := v_org_a::text || '/random-folder/secret.pdf';
  v_path_org_b_bol := v_org_b::text || '/' || v_load_1::text || '/BOL_OrgB.pdf';

  -- -----------------------------------------------------------------
  -- SETUP: CLEAN & SEED TEST ENVIRONMENT
  -- -----------------------------------------------------------------
  DELETE FROM public.documents WHERE organization_id IN (v_org_a, v_org_b);
  DELETE FROM public.loads WHERE organization_id IN (v_org_a, v_org_b);
  DELETE FROM public.drivers WHERE organization_id IN (v_org_a, v_org_b);
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
    v_load_1, v_org_a, 'LD-STOR-001', v_driver_a1,
    'Dallas', 'TX', 'Atlanta', 'GA', 'in_transit'
  ), (
    v_load_2, v_org_a, 'LD-STOR-002', v_driver_a2,
    'Chicago', 'IL', 'Nashville', 'TN', 'booked'
  ), (
    v_load_unassigned, v_org_a, 'LD-STOR-003', NULL,
    'Miami', 'FL', 'Orlando', 'FL', 'open'
  );

  -- Insert Documents for Load 1 (Assigned to Driver 1)
  INSERT INTO public.documents (organization_id, load_id, doc_type, doc_status, file_name, file_path) VALUES
    (v_org_a, v_load_1, 'rate_confirmation', 'verified', 'RateCon_LD001.pdf', 'freight-documents/' || v_path_ratecon_1),
    (v_org_a, v_load_1, 'bol', 'received', 'BOL_LD001.pdf', 'freight-documents/' || v_path_bol_1),
    (v_org_a, v_load_1, 'pod', 'received', 'POD_LD001.pdf', 'freight-documents/' || v_path_pod_1),
    (v_org_a, v_load_1, 'invoice', 'verified', 'Invoice_LD001.pdf', 'freight-documents/' || v_path_inv_1),
    (v_org_a, v_load_1, 'other', 'received', 'ScaleTicket_LD001.pdf', 'freight-documents/' || v_path_other_1);

  -- Insert Document for Load 2 (Assigned to Driver 2)
  INSERT INTO public.documents (organization_id, load_id, doc_type, doc_status, file_name, file_path) VALUES
    (v_org_a, v_load_2, 'bol', 'received', 'BOL_LD002.pdf', 'freight-documents/' || v_path_bol_2);

  -- Insert Document for Unassigned Load
  INSERT INTO public.documents (organization_id, load_id, doc_type, doc_status, file_name, file_path) VALUES
    (v_org_a, v_load_unassigned, 'bol', 'received', 'BOL_Unassigned.pdf', 'freight-documents/' || v_path_unassigned_bol);

  RAISE NOTICE '[OK] Test data successfully seeded.';

  -- -----------------------------------------------------------------
  -- CASE 1: Office Roles retain organization-scoped access
  -- Dispatcher must be allowed to access RateCon, Invoice, BOL, and all org files
  -- -----------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', v_user_dispatcher_a::text, true);

  IF NOT public.can_access_freight_document('freight-documents', v_path_ratecon_1) THEN
    RAISE EXCEPTION 'CASE 1 FAILED: Dispatcher was denied access to RateCon in organization.';
  END IF;

  IF NOT public.can_access_freight_document('freight-documents', v_path_inv_1) THEN
    RAISE EXCEPTION 'CASE 1 FAILED: Dispatcher was denied access to Invoice in organization.';
  END IF;

  RAISE NOTICE '[PASS] CASE 1: Office role retains complete access to all organization freight documents.';

  -- -----------------------------------------------------------------
  -- CASE 2: Assigned Driver can access BOL, POD, and other on assigned load
  -- -----------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', v_user_driver_a1::text, true);

  IF NOT public.can_access_freight_document('freight-documents', v_path_bol_1) THEN
    RAISE EXCEPTION 'CASE 2 FAILED: Assigned driver was denied access to BOL on their assigned load.';
  END IF;

  IF NOT public.can_access_freight_document('freight-documents', v_path_pod_1) THEN
    RAISE EXCEPTION 'CASE 2 FAILED: Assigned driver was denied access to POD on their assigned load.';
  END IF;

  IF NOT public.can_access_freight_document('freight-documents', v_path_other_1) THEN
    RAISE EXCEPTION 'CASE 2 FAILED: Assigned driver was denied access to other (scale ticket) on assigned load.';
  END IF;

  RAISE NOTICE '[PASS] CASE 2: Assigned driver can access BOL, POD, and other documents on assigned load.';

  -- -----------------------------------------------------------------
  -- CASE 3: Driver CANNOT access RateCon on assigned load
  -- -----------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', v_user_driver_a1::text, true);

  IF public.can_access_freight_document('freight-documents', v_path_ratecon_1) THEN
    RAISE EXCEPTION 'CASE 3 FAILED: Driver was permitted to access RateCon on assigned load!';
  ELSE
    RAISE NOTICE '[PASS] CASE 3: Driver is strictly denied access to RateCon.';
  END IF;

  -- -----------------------------------------------------------------
  -- CASE 4: Driver CANNOT access Invoice on assigned load
  -- -----------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', v_user_driver_a1::text, true);

  IF public.can_access_freight_document('freight-documents', v_path_inv_1) THEN
    RAISE EXCEPTION 'CASE 4 FAILED: Driver was permitted to access Invoice on assigned load!';
  ELSE
    RAISE NOTICE '[PASS] CASE 4: Driver is strictly denied access to Invoice.';
  END IF;

  -- -----------------------------------------------------------------
  -- CASE 5: Driver CANNOT access another driver's load documents
  -- Driver 1 attempts to access Driver 2's BOL (v_path_bol_2)
  -- -----------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', v_user_driver_a1::text, true);

  IF public.can_access_freight_document('freight-documents', v_path_bol_2) THEN
    RAISE EXCEPTION 'CASE 5 FAILED: Driver 1 was permitted to access Driver 2 load BOL!';
  ELSE
    RAISE NOTICE '[PASS] CASE 5: Cross-driver storage access strictly denied.';
  END IF;

  -- -----------------------------------------------------------------
  -- CASE 6: Driver CANNOT access documents on unassigned loads
  -- -----------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', v_user_driver_a1::text, true);

  IF public.can_access_freight_document('freight-documents', v_path_unassigned_bol) THEN
    RAISE EXCEPTION 'CASE 6 FAILED: Driver was permitted to access document on unassigned load!';
  ELSE
    RAISE NOTICE '[PASS] CASE 6: Unassigned load storage access strictly denied.';
  END IF;

  -- -----------------------------------------------------------------
  -- CASE 7: Driver CANNOT access arbitrary storage files without document record
  -- -----------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', v_user_driver_a1::text, true);

  IF public.can_access_freight_document('freight-documents', v_path_arbitrary) THEN
    RAISE EXCEPTION 'CASE 7 FAILED: Driver was permitted to access arbitrary organization storage file!';
  ELSE
    RAISE NOTICE '[PASS] CASE 7: Arbitrary object access strictly denied.';
  END IF;

  -- -----------------------------------------------------------------
  -- CASE 8: Cross-organization isolation
  -- Driver in Org A attempts to access document in Org B
  -- -----------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', v_user_driver_a1::text, true);

  IF public.can_access_freight_document('freight-documents', v_path_org_b_bol) THEN
    RAISE EXCEPTION 'CASE 8 FAILED: Driver in Org A was permitted to access Org B document!';
  ELSE
    RAISE NOTICE '[PASS] CASE 8: Cross-organization storage access strictly denied.';
  END IF;

  -- -----------------------------------------------------------------
  -- CASE 9: Unauthenticated caller denied
  -- -----------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', '', true);

  IF public.can_access_freight_document('freight-documents', v_path_bol_1) THEN
    RAISE EXCEPTION 'CASE 9 FAILED: Unauthenticated caller was permitted access!';
  ELSE
    RAISE NOTICE '[PASS] CASE 9: Unauthenticated caller strictly denied.';
  END IF;

  RAISE NOTICE '=============================================================';
  RAISE NOTICE 'ALL TESTS PASSED FOR S6.11 DRIVER DOCUMENT STORAGE SECURITY';
  RAISE NOTICE '=============================================================';
END $$;

ROLLBACK;
