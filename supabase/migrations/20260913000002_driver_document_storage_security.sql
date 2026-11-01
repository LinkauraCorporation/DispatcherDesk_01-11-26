-- ====================================================================
-- DispatcherDesk Migration: Driver Document Storage Security (Pass 2)
-- Version: 1.0.21
-- File: supabase/migrations/20260913000002_driver_document_storage_security.sql
-- Description:
-- 1. Hardens storage.objects SELECT RLS policy for 'freight-documents' bucket:
--    - Office roles (owner_admin, dispatcher, staff) retain full organization-scoped access.
--    - Authenticated drivers may access an object ONLY when:
--      * Driver identity is resolved server-side from auth.uid().
--      * Object belongs to the 'freight-documents' bucket within driver's organization.
--      * Object belongs to a load assigned to that authenticated driver.
--      * Document is a driver-safe operational type: ('bol', 'pod', 'other').
--      * Sensitive commercial/financial documents ('rate_confirmation', 'invoice') are strictly blocked.
--      * Arbitrary, unassigned, cross-load, or cross-driver objects are strictly blocked.
-- 2. Preserves all existing INSERT, UPDATE, and DELETE policies (no driver upload added).
-- ====================================================================

-- --------------------------------------------------------------------
-- 1. Authoritative Storage Access Evaluator
-- --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_access_freight_document(
  p_bucket_id TEXT,
  p_object_name TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
DECLARE
  v_caller_id UUID;
  v_org_id UUID;
  v_role TEXT;
  v_driver_id UUID;
  v_clean_name TEXT;
  v_load_segment TEXT;
BEGIN
  -- 1. Verify bucket and object name presence
  IF p_bucket_id <> 'freight-documents' OR p_object_name IS NULL THEN
    RETURN FALSE;
  END IF;

  -- 2. Require authenticated caller
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- 3. Extract organization ID from object path
  v_org_id := public.get_storage_path_org_id(p_object_name);
  IF v_org_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- 4. Check caller's role in this organization
  SELECT om.role INTO v_role
  FROM public.organization_members om
  WHERE om.organization_id = v_org_id
    AND om.user_id = v_caller_id;

  IF v_role IS NULL THEN
    RETURN FALSE;
  END IF;

  -- 5. Office roles retain organization-scoped access
  IF v_role IN ('owner_admin', 'dispatcher', 'staff') THEN
    RETURN TRUE;
  END IF;

  -- 6. For driver role: enforce strict load assignment and operational document type boundaries
  IF v_role = 'driver' THEN
    -- Authoritatively resolve driver profile
    SELECT d.id INTO v_driver_id
    FROM public.drivers d
    WHERE d.organization_id = v_org_id
      AND d.user_id = v_caller_id;

    IF v_driver_id IS NULL THEN
      RETURN FALSE;
    END IF;

    v_clean_name := regexp_replace(p_object_name, '^/?freight-documents/', '');
    v_load_segment := split_part(v_clean_name, '/', 2);

    -- Check if object corresponds to an allowed operational document on an assigned load
    RETURN EXISTS (
      SELECT 1
      FROM public.documents doc
      JOIN public.loads l ON l.id = doc.load_id AND l.organization_id = v_org_id
      WHERE doc.organization_id = v_org_id
        AND l.driver_id = v_driver_id
        AND doc.doc_type IN ('bol', 'pod', 'other')
        AND doc.doc_type NOT IN ('rate_confirmation', 'invoice')
        AND (
          v_load_segment !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          OR doc.load_id = v_load_segment::uuid
        )
        AND (
          doc.file_path = p_object_name
          OR doc.file_path = 'freight-documents/' || v_clean_name
          OR regexp_replace(doc.file_path, '^/?freight-documents/', '') = v_clean_name
        )
    );
  END IF;

  -- Any other role is denied
  RETURN FALSE;
END;
$$;

-- Secure function execution privileges
REVOKE ALL ON FUNCTION public.can_access_freight_document(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_freight_document(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_freight_document(TEXT, TEXT) TO service_role;

-- --------------------------------------------------------------------
-- 2. Update storage.objects SELECT Policy
-- --------------------------------------------------------------------
DROP POLICY IF EXISTS "freight_documents_select_policy" ON storage.objects;

CREATE POLICY "freight_documents_select_policy"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'freight-documents'
    AND public.can_access_freight_document(bucket_id, name)
  );
