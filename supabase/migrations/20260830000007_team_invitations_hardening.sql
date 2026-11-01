-- ====================================================================
-- DispatcherDesk Migration: Team Invitations Hardening (S5.2)
-- Version: 1.0.7
-- File: supabase/migrations/20260830000007_team_invitations_hardening.sql
-- Description:
-- 1. Introduces secure SECURITY DEFINER RPC public.create_team_invitation
--    to authoritatively validate owner_admin callers, normalize email,
--    prevent duplicate active invitations, reject invitations to existing members,
--    and record the invitation transactionally without exposing raw tokens in SQL.
-- 2. Hardens public.accept_team_invitation to lock the invitation row FOR UPDATE,
--    enforce strict invited-email matching, and prevent privilege escalation by
--    strictly rejecting acceptance if the user is already an active member.
-- 3. Introduces public.cancel_team_invitation to enforce strict lifecycle transitions
--    (pending -> cancelled only) by authenticated owner_admins.
-- 4. Refines public.get_invitation_details to strictly return a 13-attribute metadata
--    contract with is_valid boolean while never leaking token_hash.
-- ====================================================================

-- 1. RPC: create_team_invitation
-- Authoritative server-side creation of a team invitation
CREATE OR REPLACE FUNCTION public.create_team_invitation(
  p_organization_id UUID,
  p_email TEXT,
  p_role TEXT,
  p_token_hash TEXT,
  p_expires_at TIMESTAMPTZ DEFAULT NULL
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
  v_org_name TEXT;
  v_inviter_name TEXT;
BEGIN
  -- 1. Require authenticated caller
  v_caller_id := (SELECT auth.uid());
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required. Please sign in to create team invitations.';
  END IF;

  -- 2. Verify caller is owner_admin of target organization
  IF NOT public.is_org_owner_admin(p_organization_id) THEN
    RAISE EXCEPTION 'Unauthorized: Only organization Owner/Admins can invite team members.';
  END IF;

  -- 3. Validate and normalize email
  v_normalized_email := LOWER(TRIM(p_email));
  IF v_normalized_email IS NULL OR v_normalized_email = '' OR v_normalized_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' THEN
    RAISE EXCEPTION 'Please provide a valid email address.';
  END IF;

  -- 4. Validate role
  IF p_role NOT IN ('owner_admin', 'dispatcher', 'staff') THEN
    RAISE EXCEPTION 'Invalid role (%). Allowed roles: owner_admin, dispatcher, staff.', p_role;
  END IF;

  -- 5. Validate token hash
  IF p_token_hash IS NULL OR TRIM(p_token_hash) = '' THEN
    RAISE EXCEPTION 'Security token hash is required.';
  END IF;

  -- 6. Validate / calculate expiration
  v_expires_at := COALESCE(p_expires_at, NOW() + INTERVAL '7 days');
  IF v_expires_at <= NOW() THEN
    RAISE EXCEPTION 'Invitation expiration timestamp must be in the future.';
  END IF;

  -- 7. Reject if normalized email already belongs to an active member of this organization
  IF EXISTS (
    SELECT 1
    FROM public.organization_members om
    JOIN auth.users au ON om.user_id = au.id
    WHERE om.organization_id = p_organization_id
      AND LOWER(TRIM(au.email)) = v_normalized_email
  ) THEN
    RAISE EXCEPTION 'User with email "%" is already an active member of this organization.', v_normalized_email;
  END IF;

  -- 8. Auto-cancel any existing expired invitations for this organization + email
  -- so that expired invitations do not conflict with the partial unique index
  UPDATE public.organization_invitations
  SET cancelled_at = NOW(),
      updated_at = NOW()
  WHERE organization_id = p_organization_id
    AND LOWER(TRIM(email)) = v_normalized_email
    AND accepted_at IS NULL
    AND cancelled_at IS NULL
    AND expires_at <= NOW();

  -- 9. Reject if an active pending invitation already exists for this email
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

  -- 10. Insert the new invitation record
  INSERT INTO public.organization_invitations (
    organization_id,
    email,
    role,
    invited_by_user_id,
    token_hash,
    expires_at,
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
    NULL,
    NULL,
    NOW(),
    NOW()
  )
  RETURNING * INTO v_new_invitation;

  -- 11. Retrieve org name and inviter name
  SELECT name INTO v_org_name FROM public.organizations WHERE id = p_organization_id;
  SELECT full_name INTO v_inviter_name FROM public.profiles WHERE id = v_caller_id;

  RETURN json_build_object(
    'id', v_new_invitation.id,
    'organization_id', v_new_invitation.organization_id,
    'organization_name', COALESCE(v_org_name, 'Organization'),
    'email', v_new_invitation.email,
    'role', v_new_invitation.role,
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

-- 2. RPC: cancel_team_invitation
-- Authoritative server-side cancellation of an active pending invitation
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

  -- 3. Verify caller is owner_admin in the invitation's organization
  IF NOT public.is_org_owner_admin(v_invitation.organization_id) THEN
    RAISE EXCEPTION 'Unauthorized: Only organization Owner/Admins can cancel invitations.';
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

-- 3. RPC: get_invitation_details (Hardened)
-- Retrieves public metadata for an invitation given a SHA-256 token hash.
-- Never exposes token_hash and returns a consistent 13-attribute JSON payload.
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

-- 4. RPC: accept_team_invitation (Hardened)
-- Atomically validates authenticated email, checks active membership to prevent privilege escalation,
-- provisions profile if missing, creates organization_members row, and marks invitation accepted.
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

  -- 5. Strict invited-email matching check
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

  -- 8. Insert new organization membership record (No ON CONFLICT UPDATE)
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

  -- 9. Mark invitation accepted atomically
  UPDATE public.organization_invitations
  SET
    accepted_at = NOW(),
    updated_at = NOW()
  WHERE id = v_invitation.id;

  -- 10. Fetch organization name for response
  SELECT name INTO v_org_name
  FROM public.organizations
  WHERE id = v_invitation.organization_id;

  RETURN json_build_object(
    'success', true,
    'membership_id', v_member_id,
    'organization_id', v_invitation.organization_id,
    'organization_name', COALESCE(v_org_name, 'Organization'),
    'role', v_invitation.role,
    'email', v_invitation.email,
    'accepted_at', NOW()
  );
END;
$$;

-- 5. Explicit permission grants for RPC execution
GRANT EXECUTE ON FUNCTION public.create_team_invitation(UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_team_invitation(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_invitation_details(TEXT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.accept_team_invitation(TEXT) TO authenticated;
