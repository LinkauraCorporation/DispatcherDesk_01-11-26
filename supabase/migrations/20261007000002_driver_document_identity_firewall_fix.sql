-- ====================================================================
-- DispatcherDesk Migration: Driver Document Identity Firewall Fix (P0-2 & P0-7)
-- Version: 1.0.35
-- File: supabase/migrations/20261007000002_driver_document_identity_firewall_fix.sql
-- Description:
-- 1. Fixes public.get_driver_load_documents(p_organization_id, p_load_id) [P0-2]:
--    - Removes erroneous dependency on organization_members.role = 'driver'.
--    - Resolves caller authoritatively through public.drivers:
--      drivers.organization_id = p_organization_id
--      AND drivers.user_id = auth.uid()
--      AND drivers.status <> 'inactive'.
--    - Preserves load assignment check: loads.driver_id = resolved driver.
--    - Preserves document whitelist: ('bol', 'pod', 'other').
--    - Defensively excludes commercial documents: ('rate_confirmation', 'invoice').
--
-- 2. Fixes public.can_access_freight_document(p_bucket_id, p_object_name) [P0-7]:
--    - Preserves office-member access: ('owner_admin', 'dispatcher', 'staff').
--    - If not an office member, resolves caller through public.drivers:
--      drivers.organization_id = v_org_id
--      AND drivers.user_id = auth.uid()
--      AND drivers.status <> 'inactive'.
--    - Strictly verifies object belongs to an assigned load with matching driver_id.
--    - Enforces operational whitelist: ('bol', 'pod', 'other').
--    - Defensively blocks sensitive commercial types: ('rate_confirmation', 'invoice').
-- ====================================================================

-- --------------------------------------------------------------------
-- 1. RPC: get_driver_load_documents (Driver Document Security Firewall)
-- --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_driver_load_documents(
  p_organization_id UUID,
  p_load_id UUID
)
RETURNS TABLE (
  id UUID,
  organization_id UUID,
  load_id UUID,
  doc_type TEXT,
  doc_status TEXT,
  file_path TEXT,
  file_name TEXT,
  file_size_bytes BIGINT,
  mime_type TEXT,
  uploaded_by UUID,
  notes TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID;
  v_driver_id UUID;
BEGIN
  -- 1. Require authenticated caller
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  -- 2. Validate input parameters
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'Organization ID is required.';
  END IF;

  IF p_load_id IS NULL THEN
    RAISE EXCEPTION 'Load ID is required.';
  END IF;

  -- 3. Authoritatively resolve active driver in the specified organization via auth.uid()
  -- (Decoupled from organization_members per persistent driver identity architecture)
  SELECT d.id INTO v_driver_id
  FROM public.drivers d
  WHERE d.organization_id = p_organization_id
    AND d.user_id = v_caller_id
    AND d.status <> 'inactive';

  IF v_driver_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Caller is not an active driver in the specified organization.';
  END IF;

  -- 4. Verify the requested load belongs to that organization AND is assigned to that authenticated driver
  IF NOT EXISTS (
    SELECT 1
    FROM public.loads l
    WHERE l.id = p_load_id
      AND l.organization_id = p_organization_id
      AND l.driver_id = v_driver_id
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Load not found or not assigned to this driver.';
  END IF;

  -- 5. Return documents strictly for that load
  -- Whitelist operational types: 'bol', 'pod', 'other'
  -- Strictly and defensively exclude sensitive commercial types: 'rate_confirmation', 'invoice'
  RETURN QUERY
  SELECT
    d.id,
    d.organization_id,
    d.load_id,
    d.doc_type,
    d.doc_status,
    d.file_path,
    d.file_name,
    d.file_size_bytes,
    d.mime_type,
    d.uploaded_by,
    d.notes,
    d.created_at,
    d.updated_at
  FROM public.documents d
  WHERE d.organization_id = p_organization_id
    AND d.load_id = p_load_id
    AND d.doc_type IN ('bol', 'pod', 'other')
    AND d.doc_type NOT IN ('rate_confirmation', 'invoice')
  ORDER BY d.created_at DESC;
END;
$$;

-- Grant execution privilege to authenticated users only
REVOKE ALL ON FUNCTION public.get_driver_load_documents(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_driver_load_documents(UUID, UUID) TO authenticated;

-- --------------------------------------------------------------------
-- 2. Storage Evaluator: can_access_freight_document
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

  -- 4. Check caller's role in this organization if an office member
  SELECT om.role INTO v_role
  FROM public.organization_members om
  WHERE om.organization_id = v_org_id
    AND om.user_id = v_caller_id;

  -- 5. Office roles retain organization-scoped access
  IF v_role IN ('owner_admin', 'dispatcher', 'staff') THEN
    RETURN TRUE;
  END IF;

  -- 6. For drivers: authoritatively resolve active driver identity via auth.uid()
  SELECT d.id INTO v_driver_id
  FROM public.drivers d
  WHERE d.organization_id = v_org_id
    AND d.user_id = v_caller_id
    AND d.status <> 'inactive';

  IF v_driver_id IS NOT NULL THEN
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

  -- Any other caller is denied
  RETURN FALSE;
END;
$$;

-- Secure function execution privileges
REVOKE ALL ON FUNCTION public.can_access_freight_document(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_freight_document(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_freight_document(TEXT, TEXT) TO service_role;
