-- ====================================================================
-- DispatcherDesk Migration: Team Membership Integrity & RBAC Hardening (S5.4)
-- Version: 1.0.9
-- File: supabase/migrations/20260830000009_team_membership_hardening.sql
-- Description:
-- 1. Introduces authoritative SECURITY DEFINER RPC public.update_team_member_role
--    with strict caller authorization (owner_admin only), role validation,
--    transactional advisory lock on organization ID to prevent concurrent demotion
--    races of the final owner_admin, and member profile hydration.
-- 2. Introduces authoritative SECURITY DEFINER RPC public.remove_team_member
--    with strict caller authorization (owner_admin only), target org validation,
--    row-level FOR UPDATE locking, transactional advisory lock, and prevention
--    of removing the last owner_admin.
-- 3. Hardens public.protect_last_owner_admin trigger with transactional advisory
--    locking for direct database mutations.
-- 4. Grants EXECUTE to authenticated users with explicit search_path sandboxing.
-- ====================================================================

-- 1. Hardened Trigger Function for Last Owner/Admin Protection with Advisory Locking
CREATE OR REPLACE FUNCTION public.protect_last_owner_admin()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  remaining_admins INTEGER;
  target_org_id UUID;
BEGIN
  target_org_id := COALESCE(OLD.organization_id, NEW.organization_id);
  IF target_org_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('org_admin_lock_' || target_org_id::text));
  END IF;

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

-- 2. RPC: update_team_member_role
-- Authoritative server-side role modification with concurrency protection
CREATE OR REPLACE FUNCTION public.update_team_member_role(
  p_organization_id UUID,
  p_member_id UUID,
  p_new_role TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID;
  v_member RECORD;
  v_admin_count INTEGER;
  v_full_name TEXT;
  v_phone TEXT;
  v_pref_tz TEXT;
BEGIN
  -- 1. Require authenticated caller
  v_caller_id := (SELECT auth.uid());
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required. Please sign in to update member roles.';
  END IF;

  -- 2. Verify caller is owner_admin in the target organization
  IF NOT public.is_org_owner_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Unauthorized: Only organization Owner/Admins can modify team member roles.';
  END IF;

  -- 3. Validate role enum
  IF p_new_role NOT IN ('owner_admin', 'dispatcher', 'staff') THEN
    RAISE EXCEPTION 'Invalid role (%). Allowed roles: owner_admin, dispatcher, staff.', p_new_role;
  END IF;

  -- 4. Acquire transactional advisory lock to prevent concurrent admin demotion/removal races
  PERFORM pg_advisory_xact_lock(hashtext('org_admin_lock_' || p_organization_id::text));

  -- 5. Retrieve target membership row with row-level lock
  SELECT *
  INTO v_member
  FROM public.organization_members
  WHERE id = p_member_id
    AND organization_id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Team member with ID % was not found in this organization.', p_member_id;
  END IF;

  -- 6. Check if demoting the last owner_admin
  IF v_member.role = 'owner_admin' AND p_new_role <> 'owner_admin' THEN
    SELECT COUNT(*)
    INTO v_admin_count
    FROM public.organization_members
    WHERE organization_id = p_organization_id
      AND role = 'owner_admin'
      AND id <> p_member_id;

    IF v_admin_count < 1 THEN
      RAISE EXCEPTION 'Cannot demote the last Owner/Admin. Every organization must maintain at least one Owner/Admin.';
    END IF;
  END IF;

  -- 7. Apply role update
  UPDATE public.organization_members
  SET role = p_new_role,
      updated_at = NOW()
  WHERE id = p_member_id
    AND organization_id = p_organization_id;

  -- 8. Retrieve profile details
  SELECT full_name, phone, preferred_timezone
  INTO v_full_name, v_phone, v_pref_tz
  FROM public.profiles
  WHERE id = v_member.user_id;

  RETURN json_build_object(
    'id', v_member.id,
    'user_id', v_member.user_id,
    'organization_id', p_organization_id,
    'role', p_new_role,
    'created_at', v_member.created_at,
    'updated_at', NOW(),
    'full_name', COALESCE(v_full_name, 'Team Member'),
    'phone', v_phone,
    'preferred_timezone', COALESCE(v_pref_tz, 'America/Chicago'),
    'email', NULL
  );
END;
$$;

-- 3. RPC: remove_team_member
-- Authoritative server-side member removal with concurrency protection
CREATE OR REPLACE FUNCTION public.remove_team_member(
  p_organization_id UUID,
  p_member_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID;
  v_member RECORD;
  v_admin_count INTEGER;
BEGIN
  -- 1. Require authenticated caller
  v_caller_id := (SELECT auth.uid());
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required. Please sign in to remove team members.';
  END IF;

  -- 2. Verify caller is owner_admin in the target organization
  IF NOT public.is_org_owner_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Unauthorized: Only organization Owner/Admins can remove team members.';
  END IF;

  -- 3. Acquire transactional advisory lock to prevent concurrent admin demotion/removal races
  PERFORM pg_advisory_xact_lock(hashtext('org_admin_lock_' || p_organization_id::text));

  -- 4. Retrieve target membership row with row-level lock
  SELECT *
  INTO v_member
  FROM public.organization_members
  WHERE id = p_member_id
    AND organization_id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Team member with ID % was not found in this organization.', p_member_id;
  END IF;

  -- 5. Prevent removing the last owner_admin
  IF v_member.role = 'owner_admin' THEN
    SELECT COUNT(*)
    INTO v_admin_count
    FROM public.organization_members
    WHERE organization_id = p_organization_id
      AND role = 'owner_admin'
      AND id <> p_member_id;

    IF v_admin_count < 1 THEN
      RAISE EXCEPTION 'Cannot remove the last Owner/Admin. Every organization must maintain at least one Owner/Admin.';
    END IF;
  END IF;

  -- 6. Perform authoritative deletion
  DELETE FROM public.organization_members
  WHERE id = p_member_id
    AND organization_id = p_organization_id;

  RETURN json_build_object(
    'success', true,
    'organization_id', p_organization_id,
    'member_id', p_member_id,
    'user_id', v_member.user_id,
    'removed_at', NOW()
  );
END;
$$;

-- 4. Explicit permission grants for RPC execution
GRANT EXECUTE ON FUNCTION public.update_team_member_role(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_team_member(UUID, UUID) TO authenticated;
