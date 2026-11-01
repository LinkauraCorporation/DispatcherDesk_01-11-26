-- ====================================================================
-- DispatcherDesk Migration: Driver Identity Foundation
-- Version: 1.0.12
-- File: supabase/migrations/20260905000006_driver_identity_foundation.sql
-- Description:
-- 1. Creates authoritative driver identity resolution helper:
--    public.get_current_driver_id(p_organization_id UUID)
-- 2. Adds driver ↔ organization-member tenant and role coherence trigger:
--    public.validate_driver_user_coherence() on public.drivers
-- 3. Hardens public.drivers SELECT RLS:
--    - Office roles (owner_admin, dispatcher, staff) can view all drivers
--    - Driver role can view only their own driver profile (firewalling other drivers & pay data)
-- 4. Hardens public.organization_members SELECT RLS:
--    - Office roles (owner_admin, dispatcher, staff) can view fellow members
--    - Driver role can view only their own membership record (preventing member enumeration)
-- ====================================================================

-- --------------------------------------------------------------------
-- 1. Authoritative Driver Identity Resolution Helper
-- --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_current_driver_id(p_organization_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
DECLARE
  v_caller_id UUID;
  v_driver_id UUID;
BEGIN
  -- Reject unauthenticated callers
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Authentication required.';
  END IF;

  -- Validate caller has active driver membership in the target organization
  IF NOT EXISTS (
    SELECT 1
    FROM public.organization_members om
    WHERE om.organization_id = p_organization_id
      AND om.user_id = v_caller_id
      AND om.role = 'driver'
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Caller is not a driver member of the specified organization.';
  END IF;

  -- Authoritatively resolve the driver profile belonging to caller in this organization
  SELECT d.id INTO v_driver_id
  FROM public.drivers d
  WHERE d.organization_id = p_organization_id
    AND d.user_id = v_caller_id;

  IF v_driver_id IS NULL THEN
    RAISE EXCEPTION 'Driver profile not found for authenticated user in this organization.';
  END IF;

  RETURN v_driver_id;
END;
$$;

-- Secure function privileges
REVOKE ALL ON FUNCTION public.get_current_driver_id(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_current_driver_id(UUID) TO authenticated;

-- --------------------------------------------------------------------
-- 2. Driver ↔ Organization-Member Coherence Trigger
-- --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_driver_user_coherence()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- When user_id IS NULL, allow unlinked / offline driver behavior
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- When user_id IS NOT NULL:
  -- Require an existing organization_members record for (NEW.organization_id, NEW.user_id) with role = 'driver'
  IF NOT EXISTS (
    SELECT 1
    FROM public.organization_members om
    WHERE om.organization_id = NEW.organization_id
      AND om.user_id = NEW.user_id
      AND om.role = 'driver'
  ) THEN
    RAISE EXCEPTION 'Driver user coherence violation: Linked user % must be a member of organization % with role ''driver''.',
      NEW.user_id, NEW.organization_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_driver_user_coherence ON public.drivers;
CREATE TRIGGER trg_validate_driver_user_coherence
  BEFORE INSERT OR UPDATE ON public.drivers
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_driver_user_coherence();

-- --------------------------------------------------------------------
-- 3. Driver Table RLS Firewall
-- --------------------------------------------------------------------
DROP POLICY IF EXISTS "Members can view drivers in their orgs" ON public.drivers;
DROP POLICY IF EXISTS "Office members can view all drivers in their orgs" ON public.drivers;
DROP POLICY IF EXISTS "Drivers can view only own driver profile" ON public.drivers;

-- Office roles can view all driver records in their organizations
CREATE POLICY "Office members can view all drivers in their orgs"
  ON public.drivers FOR SELECT
  USING (
    organization_id IN (SELECT public.get_user_organizations())
    AND public.get_user_org_role(organization_id) IN ('owner_admin', 'dispatcher', 'staff')
  );

-- Drivers can view only their own driver profile in their organizations
CREATE POLICY "Drivers can view only own driver profile"
  ON public.drivers FOR SELECT
  USING (
    organization_id IN (SELECT public.get_user_organizations())
    AND public.get_user_org_role(organization_id) = 'driver'
    AND user_id = (SELECT auth.uid())
  );

-- --------------------------------------------------------------------
-- 4. Organization Members RLS Hardening (Anti-Enumeration)
-- --------------------------------------------------------------------
DROP POLICY IF EXISTS "Members can view fellow members in their orgs" ON public.organization_members;
DROP POLICY IF EXISTS "Office members can view fellow members in their orgs" ON public.organization_members;
DROP POLICY IF EXISTS "Drivers can view only own membership" ON public.organization_members;

-- Office roles can view all members in their organizations
CREATE POLICY "Office members can view fellow members in their orgs"
  ON public.organization_members FOR SELECT
  USING (
    organization_id IN (SELECT public.get_user_organizations())
    AND public.get_user_org_role(organization_id) IN ('owner_admin', 'dispatcher', 'staff')
  );

-- Drivers can view only their own organization membership record
CREATE POLICY "Drivers can view only own membership"
  ON public.organization_members FOR SELECT
  USING (
    organization_id IN (SELECT public.get_user_organizations())
    AND user_id = (SELECT auth.uid())
  );
