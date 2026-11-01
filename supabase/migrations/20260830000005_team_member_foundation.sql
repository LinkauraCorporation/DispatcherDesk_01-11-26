-- ====================================================================
-- DispatcherDesk Migration: Team Member Foundation & Profile Visibility
-- Version: 1.0.5
-- File: supabase/migrations/20260830000005_team_member_foundation.sql
-- Description:
-- 1. Adds RLS policy on public.profiles enabling authenticated users to 
--    read profiles of fellow members in their shared organizations.
-- 2. Enforces database-level protection against deleting or demoting the 
--    last owner_admin of an organization via a SECURITY DEFINER trigger.
-- ====================================================================

-- 1. Row Level Security (RLS) for Organization Co-Member Profiles
-- Allows users to read profiles of users who share at least one organization
-- with the requesting authenticated user.
CREATE POLICY "Members can view profiles in shared organizations"
  ON public.profiles FOR SELECT
  USING (
    id IN (
      SELECT om.user_id
      FROM public.organization_members om
      WHERE om.organization_id IN (
        SELECT public.get_user_organizations()
      )
    )
  );

-- 2. Helper function to count owner_admins in an organization
CREATE OR REPLACE FUNCTION public.count_org_owner_admins(target_org_id UUID)
RETURNS INTEGER
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  SELECT COUNT(*)::INTEGER
  FROM public.organization_members
  WHERE organization_id = target_org_id
    AND role = 'owner_admin';
$$;

-- 3. Database-level trigger to protect against leaving an org without an owner_admin
CREATE OR REPLACE FUNCTION public.protect_last_owner_admin()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  remaining_admins INTEGER;
BEGIN
  -- Handle deletion of an organization member
  IF TG_OP = 'DELETE' THEN
    IF OLD.role = 'owner_admin' THEN
      SELECT COUNT(*)
      INTO remaining_admins
      FROM public.organization_members
      WHERE organization_id = OLD.organization_id
        AND role = 'owner_admin'
        AND id <> OLD.id;

      IF remaining_admins < 1 THEN
        RAISE EXCEPTION 'Cannot remove the last owner_admin of an organization. Each organization must have at least one owner_admin.';
      END IF;
    END IF;
    RETURN OLD;

  -- Handle updates (demotion of owner_admin to dispatcher/staff or org reassignment)
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.role = 'owner_admin' AND (NEW.role <> 'owner_admin' OR NEW.organization_id <> OLD.organization_id) THEN
      SELECT COUNT(*)
      INTO remaining_admins
      FROM public.organization_members
      WHERE organization_id = OLD.organization_id
        AND role = 'owner_admin'
        AND id <> OLD.id;

      IF remaining_admins < 1 THEN
        RAISE EXCEPTION 'Cannot demote or transfer the last owner_admin of an organization. Each organization must have at least one owner_admin.';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_last_owner_admin ON public.organization_members;

CREATE TRIGGER trg_protect_last_owner_admin
  BEFORE UPDATE OR DELETE ON public.organization_members
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_last_owner_admin();
