-- ====================================================================
-- DispatcherDesk Migration: Driver Invitation + Onboarding (S6.9)
-- Version: 1.0.13
-- File: supabase/migrations/20260905000007_driver_invitations_onboarding.sql
-- Description:
-- 1. Alters public.organization_invitations:
--    - Adds driver_id (UUID, nullable)
--    - Adds tenant-safe composite FK (organization_id, driver_id) REFERENCES public.drivers(organization_id, id) ON DELETE RESTRICT
--    - Updates role check constraint to include 'driver'
--    - Adds check constraint: role = 'driver' <=> driver_id IS NOT NULL
--    - Adds partial unique index for active pending driver invitations
-- 2. Updates public.create_team_invitation to support driver invitations:
--    - Role 'driver' invitable by operational write access (owner_admin or dispatcher)
--    - Office roles remain strictly owner_admin only
--    - Enforces target driver profile existence, organization match, and unlinked state
--    - Prevents duplicate active invitations for the same driver
--    - Auto-cancels expired invitations
-- 3. Updates public.cancel_team_invitation:
--    - Driver invitations can be cancelled with operational write access or owner_admin
-- 4. Updates public.get_invitation_details:
--    - Returns driver_id and driver_name when available
-- 5. Updates public.accept_team_invitation with ATOMIC BINDING:
--    - Checks driver profile state with FOR UPDATE lock
--    - Creates organization_members record with role = 'driver'
--    - Atomically updates public.drivers.user_id to auth.uid()
--    - Strict transactional rollback if driver binding fails (no partial onboarding state)
--    - Validates driver-user coherence trigger compatibility
-- 6. Updates public.remove_team_member:
--    - Automatically unlinks drivers.user_id when driver member is removed
-- ====================================================================

-- --------------------------------------------------------------------
-- 1. Table Schema & Constraints Hardening
-- --------------------------------------------------------------------

-- Add driver_id column (nullable for office roles, populated for driver role)
ALTER TABLE public.organization_invitations
  ADD COLUMN IF NOT EXISTS driver_id UUID;

-- Drop legacy single-column FK if present to prevent conflicting or redundant constraints
ALTER TABLE public.organization_invitations
  DROP CONSTRAINT IF EXISTS organization_invitations_driver_id_fkey;

ALTER TABLE public.organization_invitations
  DROP CONSTRAINT IF EXISTS fk_org_invitations_driver;

-- Authoritative tenant-safe composite foreign key:
-- (organization_id, driver_id) -> drivers(organization_id, id)
-- Uses existing unique constraint on public.drivers (organization_id, id).
-- ON DELETE RESTRICT prevents deleting a driver that has an existing invitation.
ALTER TABLE public.organization_invitations
  ADD CONSTRAINT fk_org_invitations_driver
  FOREIGN KEY (organization_id, driver_id)
  REFERENCES public.drivers(organization_id, id)
  ON DELETE RESTRICT;

-- Update role check constraint on organization_invitations
ALTER TABLE public.organization_invitations
  DROP CONSTRAINT IF EXISTS organization_invitations_role_check;

ALTER TABLE public.organization_invitations
  ADD CONSTRAINT organization_invitations_role_check
  CHECK (role IN ('owner_admin', 'dispatcher', 'staff', 'driver'));

-- Role and driver_id coherence check:
-- Driver invitations MUST specify a driver_id.
-- Office role invitations MUST have driver_id IS NULL.
ALTER TABLE public.organization_invitations
  DROP CONSTRAINT IF EXISTS chk_org_invitations_driver_role;

ALTER TABLE public.organization_invitations
  ADD CONSTRAINT chk_org_invitations_driver_role
  CHECK (
    (role = 'driver' AND driver_id IS NOT NULL) OR
    (role IN ('owner_admin', 'dispatcher', 'staff') AND driver_id IS NULL)
  );

-- Index on driver_id for fast lookup
CREATE INDEX IF NOT EXISTS idx_org_invitations_driver_id
  ON public.organization_invitations(driver_id);

-- Partial unique index: at most one active pending invitation per driver in an organization
CREATE UNIQUE INDEX IF NOT EXISTS idx_org_invitations_active_org_driver
  ON public.organization_invitations (organization_id, driver_id)
  WHERE accepted_at IS NULL AND cancelled_at IS NULL AND driver_id IS NOT NULL;

-- --------------------------------------------------------------------
-- 2. RPC: create_team_invitation (Driver Onboarding Support)
-- --------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.create_team_invitation(UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ);

CREATE OR REPLACE FUNCTION public.create_team_invitation(
  p_organization_id UUID,
  p_email TEXT,
  p_role TEXT,
  p_token_hash TEXT,
  p_expires_at TIMESTAMPTZ DEFAULT NULL,
  p_driver_id UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID;
  v_normalized_email TEXT;
  v_expires_at TIMESTAMPTZ;
  v_new_invitation RECORD;
  v_driver RECORD;
  v_org_name TEXT;
  v_inviter_name TEXT;
  v_driver_name TEXT;
  v_constraint_name TEXT;
BEGIN
  -- 1. Require authenticated caller
  v_caller_id := (SELECT auth.uid());
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required. Please sign in to create team invitations.';
  END IF;

  -- 2. Validate role
  IF p_role NOT IN ('owner_admin', 'dispatcher', 'staff', 'driver') THEN
    RAISE EXCEPTION 'Invalid role (%). Allowed roles: owner_admin, dispatcher, staff, driver.', p_role;
  END IF;

  -- 3. Authorization check
  -- If inviting a driver: operational write access required (owner_admin or dispatcher)
  -- If inviting office roles: owner_admin required
  IF p_role = 'driver' THEN
    IF NOT public.has_operational_write_access(p_organization_id) THEN
      RAISE EXCEPTION 'Unauthorized: Operational write access required to invite drivers.';
    END IF;
  ELSE
    IF NOT public.is_org_owner_admin(p_organization_id) THEN
      RAISE EXCEPTION 'Unauthorized: Only organization Owner/Admins can invite team members.';
    END IF;
  END IF;

  -- 4. Validate and normalize email
  v_normalized_email := LOWER(TRIM(p_email));
  IF v_normalized_email IS NULL OR v_normalized_email = '' OR v_normalized_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' THEN
    RAISE EXCEPTION 'Please provide a valid email address.';
  END IF;

  -- 5. Driver-specific validations
  IF p_role = 'driver' THEN
    IF p_driver_id IS NULL THEN
      RAISE EXCEPTION 'Driver ID is required when inviting a driver.';
    END IF;

    -- Verify driver profile exists in target organization
    SELECT * INTO v_driver
    FROM public.drivers
    WHERE id = p_driver_id
      AND organization_id = p_organization_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Driver profile with ID "%" was not found in this organization.', p_driver_id;
    END IF;

    -- Verify driver profile is not already linked to a user account
    IF v_driver.user_id IS NOT NULL THEN
      RAISE EXCEPTION 'Driver profile "%" is already linked to a user account.', v_driver.full_name;
    END IF;

    v_driver_name := v_driver.full_name;

    -- Auto-cancel any expired invitations for this driver profile
    UPDATE public.organization_invitations
    SET cancelled_at = NOW(),
        updated_at = NOW()
    WHERE organization_id = p_organization_id
      AND driver_id = p_driver_id
      AND accepted_at IS NULL
      AND cancelled_at IS NULL
      AND expires_at <= NOW();

    -- Pre-insert check: active pending invitation already exists for this driver profile
    IF EXISTS (
      SELECT 1
      FROM public.organization_invitations
      WHERE organization_id = p_organization_id
        AND driver_id = p_driver_id
        AND accepted_at IS NULL
        AND cancelled_at IS NULL
        AND expires_at > NOW()
    ) THEN
      RAISE EXCEPTION 'An active pending invitation already exists for driver "%".', v_driver.full_name;
    END IF;
  ELSE
    IF p_driver_id IS NOT NULL THEN
      RAISE EXCEPTION 'Driver ID cannot be specified for office role invitations.';
    END IF;
  END IF;

  -- 6. Validate token hash
  IF p_token_hash IS NULL OR TRIM(p_token_hash) = '' THEN
    RAISE EXCEPTION 'Security token hash is required.';
  END IF;

  -- 7. Validate / calculate expiration
  v_expires_at := COALESCE(p_expires_at, NOW() + INTERVAL '7 days');
  IF v_expires_at <= NOW() THEN
    RAISE EXCEPTION 'Invitation expiration timestamp must be in the future.';
  END IF;

  -- 8. Reject if normalized email already belongs to an active member of this organization
  IF EXISTS (
    SELECT 1
    FROM public.organization_members om
    JOIN auth.users au ON om.user_id = au.id
    WHERE om.organization_id = p_organization_id
      AND LOWER(TRIM(au.email)) = v_normalized_email
  ) THEN
    RAISE EXCEPTION 'User with email "%" is already an active member of this organization.', v_normalized_email;
  END IF;

  -- 9. Auto-cancel any existing expired invitations for this organization + email
  UPDATE public.organization_invitations
  SET cancelled_at = NOW(),
      updated_at = NOW()
  WHERE organization_id = p_organization_id
    AND LOWER(TRIM(email)) = v_normalized_email
    AND accepted_at IS NULL
    AND cancelled_at IS NULL
    AND expires_at <= NOW();

  -- 10. Pre-insert rejection if an active pending invitation already exists for this email
  IF EXISTS (
    SELECT 1
    FROM public.organization_invitations
    WHERE organization_id = p_organization_id
      AND LOWER(TRIM(email)) = v_normalized_email
      AND accepted_at IS NULL
      AND cancelled_at IS NULL
      AND expires_at > NOW()
  ) THEN
    RAISE EXCEPTION 'An active pending invitation already exists for "%".', v_normalized_email;
  END IF;

  -- 11. Insert the new invitation record with safe unique_violation exception block for concurrency
  BEGIN
    INSERT INTO public.organization_invitations (
      organization_id,
      email,
      role,
      invited_by_user_id,
      token_hash,
      expires_at,
      driver_id,
      accepted_at,
      cancelled_at,
      created_at,
      updated_at
    )
    VALUES (
      p_organization_id,
      v_normalized_email,
      p_role,
      v_caller_id,
      p_token_hash,
      v_expires_at,
      p_driver_id,
      NULL,
      NULL,
      NOW(),
      NOW()
    )
    RETURNING * INTO v_new_invitation;
  EXCEPTION
    WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_constraint_name = CONSTRAINT_NAME;
      IF v_constraint_name = 'idx_org_invitations_active_org_driver'
         OR v_constraint_name LIKE '%active_org_driver%' THEN
        RAISE EXCEPTION 'An active pending invitation already exists for this driver.';
      ELSIF v_constraint_name = 'idx_org_invitations_active_org_email' 
         OR v_constraint_name LIKE '%active_org_email%' 
         OR v_constraint_name LIKE '%organization_invitations%'
         OR v_constraint_name IS NULL 
         OR v_constraint_name = '' THEN
        RAISE EXCEPTION 'An active pending invitation already exists for this email.';
      ELSIF v_constraint_name = 'idx_org_invitations_token_hash' THEN
        RAISE EXCEPTION 'A security token collision occurred. Please retry with a newly generated token.';
      ELSE
        RAISE;
      END IF;
  END;

  -- 12. Retrieve org name and inviter name
  SELECT name INTO v_org_name FROM public.organizations WHERE id = p_organization_id;
  SELECT full_name INTO v_inviter_name FROM public.profiles WHERE id = v_caller_id;

  RETURN json_build_object(
    'id', v_new_invitation.id,
    'organization_id', v_new_invitation.organization_id,
    'organization_name', COALESCE(v_org_name, 'Organization'),
    'email', v_new_invitation.email,
    'role', v_new_invitation.role,
    'driver_id', v_new_invitation.driver_id,
    'driver_name', v_driver_name,
    'invited_by_user_id', v_new_invitation.invited_by_user_id,
    'invited_by_name', v_inviter_name,
    'expires_at', v_new_invitation.expires_at,
    'accepted_at', v_new_invitation.accepted_at,
    'cancelled_at', v_new_invitation.cancelled_at,
    'created_at', v_new_invitation.created_at,
    'updated_at', v_new_invitation.updated_at,
    'status', 'pending',
    'is_valid', true,
    'invalid_reason', NULL
  );
END;
$$;

-- --------------------------------------------------------------------
-- 3. RPC: cancel_team_invitation (Support Driver Cancellations)
-- --------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.cancel_team_invitation(p_invitation_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID;
  v_invitation RECORD;
BEGIN
  -- 1. Require authenticated caller
  v_caller_id := (SELECT auth.uid());
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required. Please sign in to cancel invitations.';
  END IF;

  -- 2. Lock and retrieve invitation row
  SELECT *
  INTO v_invitation
  FROM public.organization_invitations
  WHERE id = p_invitation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation with ID % not found.', p_invitation_id;
  END IF;

  -- 3. Authorization check:
  -- If cancelling a driver invitation: operational write access or owner_admin
  -- If cancelling an office invitation: owner_admin only
  IF v_invitation.role = 'driver' THEN
    IF NOT public.has_operational_write_access(v_invitation.organization_id) THEN
      RAISE EXCEPTION 'Unauthorized: Operational write access required to cancel driver invitations.';
    END IF;
  ELSE
    IF NOT public.is_org_owner_admin(v_invitation.organization_id) THEN
      RAISE EXCEPTION 'Unauthorized: Only organization Owner/Admins can cancel invitations.';
    END IF;
  END IF;

  -- 4. Lifecycle transition guards
  IF v_invitation.accepted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot cancel an invitation that has already been accepted.';
  END IF;

  IF v_invitation.cancelled_at IS NOT NULL THEN
    RAISE EXCEPTION 'Invitation is already cancelled.';
  END IF;

  IF v_invitation.expires_at <= NOW() THEN
    RAISE EXCEPTION 'Invitation has already expired.';
  END IF;

  -- 5. Mark cancelled
  UPDATE public.organization_invitations
  SET cancelled_at = NOW(),
      updated_at = NOW()
  WHERE id = p_invitation_id;

  RETURN json_build_object(
    'success', true,
    'id', p_invitation_id,
    'organization_id', v_invitation.organization_id,
    'status', 'cancelled',
    'cancelled_at', NOW()
  );
END;
$$;

-- --------------------------------------------------------------------
-- 4. RPC: get_invitation_details (Hydrate Driver Details)
-- --------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_invitation_details(p_token_hash TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_invitation RECORD;
  v_org_name TEXT;
  v_inviter_name TEXT;
  v_driver_name TEXT;
  v_status TEXT;
  v_is_valid BOOLEAN := false;
  v_invalid_reason TEXT := NULL;
BEGIN
  IF p_token_hash IS NULL OR TRIM(p_token_hash) = '' THEN
    RETURN json_build_object(
      'id', NULL,
      'organization_id', NULL,
      'organization_name', NULL,
      'email', NULL,
      'role', NULL,
      'driver_id', NULL,
      'driver_name', NULL,
      'invited_by_user_id', NULL,
      'invited_by_name', NULL,
      'expires_at', NULL,
      'accepted_at', NULL,
      'cancelled_at', NULL,
      'created_at', NULL,
      'status', NULL,
      'is_valid', false,
      'invalid_reason', 'Invitation token hash is missing or invalid.'
    );
  END IF;

  SELECT *
  INTO v_invitation
  FROM public.organization_invitations
  WHERE token_hash = p_token_hash;

  IF NOT FOUND THEN
    RETURN json_build_object(
      'id', NULL,
      'organization_id', NULL,
      'organization_name', NULL,
      'email', NULL,
      'role', NULL,
      'driver_id', NULL,
      'driver_name', NULL,
      'invited_by_user_id', NULL,
      'invited_by_name', NULL,
      'expires_at', NULL,
      'accepted_at', NULL,
      'cancelled_at', NULL,
      'created_at', NULL,
      'status', NULL,
      'is_valid', false,
      'invalid_reason', 'Invitation not found or link has expired.'
    );
  END IF;

  -- Determine organization name
  SELECT name INTO v_org_name
  FROM public.organizations
  WHERE id = v_invitation.organization_id;

  -- Determine inviter full name
  IF v_invitation.invited_by_user_id IS NOT NULL THEN
    SELECT full_name INTO v_inviter_name
    FROM public.profiles
    WHERE id = v_invitation.invited_by_user_id;
  END IF;

  -- Determine driver full name if linked to a driver profile
  IF v_invitation.driver_id IS NOT NULL THEN
    SELECT full_name INTO v_driver_name
    FROM public.drivers
    WHERE id = v_invitation.driver_id;
  END IF;

  -- Determine lifecycle status and validity
  IF v_invitation.cancelled_at IS NOT NULL THEN
    v_status := 'cancelled';
    v_invalid_reason := 'This invitation was cancelled by an organization administrator.';
  ELSIF v_invitation.accepted_at IS NOT NULL THEN
    v_status := 'accepted';
    v_invalid_reason := 'This invitation has already been accepted.';
  ELSIF v_invitation.expires_at <= NOW() THEN
    v_status := 'expired';
    v_invalid_reason := 'This invitation has expired.';
  ELSE
    v_status := 'pending';
    v_is_valid := true;
  END IF;

  RETURN json_build_object(
    'id', v_invitation.id,
    'organization_id', v_invitation.organization_id,
    'organization_name', COALESCE(v_org_name, 'Organization'),
    'email', v_invitation.email,
    'role', v_invitation.role,
    'driver_id', v_invitation.driver_id,
    'driver_name', v_driver_name,
    'invited_by_user_id', v_invitation.invited_by_user_id,
    'invited_by_name', v_inviter_name,
    'expires_at', v_invitation.expires_at,
    'accepted_at', v_invitation.accepted_at,
    'cancelled_at', v_invitation.cancelled_at,
    'created_at', v_invitation.created_at,
    'status', v_status,
    'is_valid', v_is_valid,
    'invalid_reason', v_invalid_reason
  );
END;
$$;

-- --------------------------------------------------------------------
-- 5. RPC: accept_team_invitation (Atomic Driver Profile Binding)
-- --------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.accept_team_invitation(p_token_hash TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  curr_user_id UUID;
  curr_user_email TEXT;
  curr_user_name TEXT;
  v_invitation RECORD;
  v_org_name TEXT;
  v_member_id UUID;
  v_constraint_name TEXT;
  v_driver RECORD;
  v_driver_name TEXT;
  v_rows_updated INTEGER;
BEGIN
  -- 1. Check authentication
  curr_user_id := (SELECT auth.uid());
  IF curr_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required. Please sign in to accept this invitation.';
  END IF;

  -- 2. Lookup user email from auth.users
  SELECT email, raw_user_meta_data->>'full_name'
  INTO curr_user_email, curr_user_name
  FROM auth.users
  WHERE id = curr_user_id;

  IF curr_user_email IS NULL THEN
    RAISE EXCEPTION 'Unable to determine authenticated user email address.';
  END IF;

  -- 3. Lookup invitation with row lock
  SELECT *
  INTO v_invitation
  FROM public.organization_invitations
  WHERE token_hash = p_token_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation not found or invalid token.';
  END IF;

  -- 4. Lifecycle state and expiration checks
  IF v_invitation.cancelled_at IS NOT NULL THEN
    RAISE EXCEPTION 'This invitation has been cancelled by the organization administrator.';
  END IF;

  IF v_invitation.accepted_at IS NOT NULL THEN
    RAISE EXCEPTION 'This invitation has already been accepted.';
  END IF;

  IF v_invitation.expires_at <= NOW() THEN
    RAISE EXCEPTION 'This invitation has expired.';
  END IF;

  -- 5. Strict invited-email matching check (case-insensitive)
  IF LOWER(TRIM(curr_user_email)) <> LOWER(TRIM(v_invitation.email)) THEN
    RAISE EXCEPTION 'Authenticated email (%) does not match the invitation email (%). Please sign in with the invited email address.',
      curr_user_email, v_invitation.email;
  END IF;

  -- 6. Privilege escalation guard: check if already a member of this organization
  IF EXISTS (
    SELECT 1
    FROM public.organization_members
    WHERE organization_id = v_invitation.organization_id
      AND user_id = curr_user_id
  ) THEN
    RAISE EXCEPTION 'You are already a member of this organization.';
  END IF;

  -- 7. Ensure user profile exists
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = curr_user_id) THEN
    INSERT INTO public.profiles (id, full_name, preferred_timezone)
    VALUES (
      curr_user_id,
      COALESCE(
        NULLIF(TRIM(curr_user_name), ''),
        NULLIF(SPLIT_PART(curr_user_email, '@', 1), ''),
        'User'
      ),
      'America/Chicago'
    )
    ON CONFLICT (id) DO NOTHING;
  END IF;

  -- 8. Driver onboarding specific validation and row locking
  IF v_invitation.role = 'driver' THEN
    IF v_invitation.driver_id IS NULL THEN
      RAISE EXCEPTION 'Driver invitation is missing linked driver profile.';
    END IF;

    -- Ensure authenticated user is not already linked to ANY driver profile in this organization
    IF EXISTS (
      SELECT 1
      FROM public.drivers
      WHERE organization_id = v_invitation.organization_id
        AND user_id = curr_user_id
    ) THEN
      RAISE EXCEPTION 'User is already linked to a driver profile in this organization.';
    END IF;

    -- Lock target driver profile FOR UPDATE
    SELECT * INTO v_driver
    FROM public.drivers
    WHERE id = v_invitation.driver_id
      AND organization_id = v_invitation.organization_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Target driver profile was not found in this organization.';
    END IF;

    IF v_driver.user_id IS NOT NULL THEN
      RAISE EXCEPTION 'Target driver profile "%" is already linked to a user account.', v_driver.full_name;
    END IF;

    v_driver_name := v_driver.full_name;
  END IF;

  -- 9. Insert new organization membership record with safe exception block for concurrency
  BEGIN
    INSERT INTO public.organization_members (
      organization_id,
      user_id,
      role
    )
    VALUES (
      v_invitation.organization_id,
      curr_user_id,
      v_invitation.role
    )
    RETURNING id INTO v_member_id;
  EXCEPTION
    WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_constraint_name = CONSTRAINT_NAME;
      IF v_constraint_name = 'unique_org_user' 
         OR v_constraint_name LIKE '%org%user%' 
         OR v_constraint_name LIKE '%organization_members%'
         OR v_constraint_name IS NULL 
         OR v_constraint_name = '' THEN
        RAISE EXCEPTION 'You are already a member of this organization.';
      ELSE
        RAISE;
      END IF;
  END;

  -- 10. For driver role: ATOMIC BINDING of driver profile to user
  -- The organization_members record with role = 'driver' is now inserted, so the
  -- trg_validate_driver_user_coherence trigger will validate the linkage successfully.
  IF v_invitation.role = 'driver' THEN
    UPDATE public.drivers
    SET
      user_id = curr_user_id,
      email = COALESCE(email, curr_user_email),
      updated_at = NOW()
    WHERE id = v_invitation.driver_id
      AND organization_id = v_invitation.organization_id
      AND user_id IS NULL;

    GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
    IF v_rows_updated <> 1 THEN
      -- If driver binding fails, raise exception to roll back the membership insertion
      RAISE EXCEPTION 'Failed to atomically bind driver profile "%" to authenticated user.', v_driver_name;
    END IF;
  END IF;

  -- 11. Mark invitation accepted atomically (only reached if membership and driver binding succeeded)
  UPDATE public.organization_invitations
  SET
    accepted_at = NOW(),
    updated_at = NOW()
  WHERE id = v_invitation.id;

  -- 12. Fetch organization name for response
  SELECT name INTO v_org_name
  FROM public.organizations
  WHERE id = v_invitation.organization_id;

  RETURN json_build_object(
    'success', true,
    'membership_id', v_member_id,
    'organization_id', v_invitation.organization_id,
    'organization_name', COALESCE(v_org_name, 'Organization'),
    'role', v_invitation.role,
    'driver_id', v_invitation.driver_id,
    'driver_name', v_driver_name,
    'email', v_invitation.email,
    'accepted_at', NOW()
  );
END;
$$;

-- --------------------------------------------------------------------
-- 6. RPC: remove_team_member (Unlink Driver Profile on Removal)
-- --------------------------------------------------------------------

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

  -- 6. If the member being removed has an associated driver profile, unlink it atomically
  UPDATE public.drivers
  SET user_id = NULL,
      updated_at = NOW()
  WHERE organization_id = p_organization_id
    AND user_id = v_member.user_id;

  -- 7. Perform authoritative deletion
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

-- --------------------------------------------------------------------
-- 7. Explicit Permission Grants
-- --------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.create_team_invitation(UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_team_invitation(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_invitation_details(TEXT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.accept_team_invitation(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_team_member(UUID, UUID) TO authenticated;
