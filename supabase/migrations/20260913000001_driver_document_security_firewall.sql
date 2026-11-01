-- ====================================================================
-- DispatcherDesk Migration: Driver Document Security Firewall (Pass 1)
-- Version: 1.0.20
-- File: supabase/migrations/20260913000001_driver_document_security_firewall.sql
-- Description:
-- 1. Hardens public.documents direct RLS policies:
--    - Restricts direct SELECT to office roles: ('owner_admin', 'dispatcher', 'staff').
--      Drivers receive 0 rows from direct SELECT * FROM public.documents.
--    - Restricts direct INSERT to office roles: ('owner_admin', 'dispatcher', 'staff').
--      Drivers cannot directly insert document metadata rows.
--    - Retains existing UPDATE and DELETE policies (already restricted to office/admin roles).
-- 2. Creates authoritative SECURITY DEFINER RPC public.get_driver_load_documents:
--    - Rejects unauthenticated callers (auth.uid() IS NULL).
--    - Verifies caller is a member of the target organization with role = 'driver'.
--    - Authoritatively resolves the driver profile server-side via auth.uid().
--    - Verifies the requested load belongs to that organization AND is assigned to that driver.
--    - Returns documents strictly for that load.
--    - Whitelists operational document types ('bol', 'pod', 'other').
--    - Strictly blocks sensitive commercial/financial documents ('rate_confirmation', 'invoice').
-- ====================================================================

-- --------------------------------------------------------------------
-- 1. Harden public.documents Direct RLS Policies
-- --------------------------------------------------------------------

-- A. SELECT Policy: Restrict direct SELECT to office roles only
DROP POLICY IF EXISTS "Members can view documents in their orgs" ON public.documents;
DROP POLICY IF EXISTS "Office members can view documents in their orgs" ON public.documents;

CREATE POLICY "Office members can view documents in their orgs"
  ON public.documents FOR SELECT
  USING (
    organization_id IN (SELECT public.get_user_organizations())
    AND public.get_user_org_role(organization_id) IN ('owner_admin', 'dispatcher', 'staff')
  );

-- B. INSERT Policy: Restrict direct INSERT to office roles only
DROP POLICY IF EXISTS "All active members can upload documents" ON public.documents;
DROP POLICY IF EXISTS "Office members can upload documents" ON public.documents;

CREATE POLICY "Office members can upload documents"
  ON public.documents FOR INSERT
  WITH CHECK (
    organization_id IN (SELECT public.get_user_organizations())
    AND public.get_user_org_role(organization_id) IN ('owner_admin', 'dispatcher', 'staff')
  );

-- --------------------------------------------------------------------
-- 2. Authoritative Driver Load Documents RPC
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

  -- 3. Verify caller belongs to the requested organization with role = 'driver'
  IF NOT EXISTS (
    SELECT 1
    FROM public.organization_members om
    WHERE om.organization_id = p_organization_id
      AND om.user_id = v_caller_id
      AND om.role = 'driver'
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Caller is not a driver member of the specified organization.';
  END IF;

  -- 4. Authoritatively resolve driver using auth.uid()
  SELECT d.id INTO v_driver_id
  FROM public.drivers d
  WHERE d.organization_id = p_organization_id
    AND d.user_id = v_caller_id;

  IF v_driver_id IS NULL THEN
    RAISE EXCEPTION 'Driver profile not found for authenticated user in this organization.';
  END IF;

  -- 5. Verify the requested load belongs to that organization AND is assigned to that authenticated driver
  IF NOT EXISTS (
    SELECT 1
    FROM public.loads l
    WHERE l.id = p_load_id
      AND l.organization_id = p_organization_id
      AND l.driver_id = v_driver_id
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Load not found or not assigned to this driver.';
  END IF;

  -- 6. Return documents strictly for that load
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
