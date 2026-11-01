-- ====================================================================
-- DispatcherDesk Migration: Secure Team Invitations & Onboarding
-- Version: 1.0.6
-- File: supabase/migrations/20260830000006_team_invitations.sql
-- Description:
-- 1. Creates public.organization_invitations table with secure token hash,
--    role constraints, expiration, acceptance, and cancellation timestamps.
-- 2. Enforces partial unique index on stable invitation state (accepted_at IS NULL AND cancelled_at IS NULL)
--    with a BEFORE INSERT trigger that auto-cancels expired invitations to prevent blocking new invites.
-- 3. Enables RLS on organization_invitations restricted to owner_admins.
-- 4. Creates secure SECURITY DEFINER RPCs for verifying invitation details
--    and accepting invitations by authenticated users with email verification.
-- ====================================================================

-- 1. Table: organization_invitations
CREATE TABLE IF NOT EXISTS public.organization_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner_admin', 'dispatcher', 'staff')),
  invited_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Indexes for fast lookup and strict uniqueness
CREATE INDEX IF NOT EXISTS idx_org_invitations_org_id 
  ON public.organization_invitations(organization_id);

CREATE INDEX IF NOT EXISTS idx_org_invitations_email 
  ON public.organization_invitations(LOWER(TRIM(email)));

CREATE UNIQUE INDEX IF NOT EXISTS idx_org_invitations_token_hash 
  ON public.organization_invitations(token_hash);

-- Prevent duplicate active invitations for the same organization + normalized email.
-- Note: Index predicate uses only immutable conditions (accepted_at IS NULL AND cancelled_at IS NULL).
-- Expiration lifecycle is handled deterministically via the BEFORE INSERT trigger and RPC logic.
CREATE UNIQUE INDEX IF NOT EXISTS idx_org_invitations_active_org_email 
  ON public.organization_invitations (organization_id, LOWER(TRIM(email)))
  WHERE accepted_at IS NULL AND cancelled_at IS NULL;

-- 3. Trigger & Function: Auto-normalize email and auto-cancel expired invitations before insert
CREATE OR REPLACE FUNCTION public.handle_new_invitation_dedup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Normalize email on the new record
  NEW.email := LOWER(TRIM(NEW.email));

  -- Auto-cancel any existing expired invitations for the same organization + email
  -- so that expired invitations do not conflict with the active unique index.
  UPDATE public.organization_invitations
  SET cancelled_at = NOW(),
      updated_at = NOW()
  WHERE organization_id = NEW.organization_id
    AND LOWER(TRIM(email)) = NEW.email
    AND accepted_at IS NULL
    AND cancelled_at IS NULL
    AND expires_at <= NOW();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_org_invitations_dedup ON public.organization_invitations;
CREATE TRIGGER trg_org_invitations_dedup
  BEFORE INSERT ON public.organization_invitations
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_invitation_dedup();

-- 4. Trigger for updated_at
DROP TRIGGER IF EXISTS set_org_invitations_updated_at ON public.organization_invitations;
CREATE TRIGGER set_org_invitations_updated_at
  BEFORE UPDATE ON public.organization_invitations
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- 5. Row Level Security (RLS)
ALTER TABLE public.organization_invitations ENABLE ROW LEVEL SECURITY;

-- Owner admins can view invitations for their organizations
DROP POLICY IF EXISTS "Owner admins can view org invitations" ON public.organization_invitations;
CREATE POLICY "Owner admins can view org invitations"
  ON public.organization_invitations FOR SELECT
  USING (public.is_org_owner_admin(organization_id));

-- Owner admins can create invitations for their organizations
DROP POLICY IF EXISTS "Owner admins can insert org invitations" ON public.organization_invitations;
CREATE POLICY "Owner admins can insert org invitations"
  ON public.organization_invitations FOR INSERT
  WITH CHECK (public.is_org_owner_admin(organization_id));

-- Owner admins can update/cancel invitations for their organizations
DROP POLICY IF EXISTS "Owner admins can update org invitations" ON public.organization_invitations;
CREATE POLICY "Owner admins can update org invitations"
  ON public.organization_invitations FOR UPDATE
  USING (public.is_org_owner_admin(organization_id))
  WITH CHECK (public.is_org_owner_admin(organization_id));

-- Owner admins can delete invitations for their organizations
DROP POLICY IF EXISTS "Owner admins can delete org invitations" ON public.organization_invitations;
CREATE POLICY "Owner admins can delete org invitations"
  ON public.organization_invitations FOR DELETE
  USING (public.is_org_owner_admin(organization_id));

-- 6. RPC: get_invitation_details
-- Securely retrieves invitation metadata given a SHA-256 token hash
-- without exposing direct table access to unauthenticated or arbitrary users.
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
      'is_valid', false,
      'invalid_reason', 'Token hash is missing or invalid.'
    );
  END IF;

  SELECT *
  INTO v_invitation
  FROM public.organization_invitations
  WHERE token_hash = p_token_hash;

  IF NOT FOUND THEN
    RETURN json_build_object(
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

  -- Determine status and validity
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

-- 7. RPC: accept_team_invitation
-- Validates caller authentication, verifies that caller email matches the invited email,
-- provisions profile if missing, creates organization_members record, and marks invitation accepted.
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

  -- 3. Lookup invitation by token hash
  SELECT *
  INTO v_invitation
  FROM public.organization_invitations
  WHERE token_hash = p_token_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation not found or invalid token.';
  END IF;

  -- 4. Check status & expiration
  IF v_invitation.cancelled_at IS NOT NULL THEN
    RAISE EXCEPTION 'This invitation has been cancelled by the organization administrator.';
  END IF;

  IF v_invitation.accepted_at IS NOT NULL THEN
    RAISE EXCEPTION 'This invitation has already been accepted.';
  END IF;

  IF v_invitation.expires_at <= NOW() THEN
    RAISE EXCEPTION 'This invitation has expired.';
  END IF;

  -- 5. Email matching check (strict case-insensitive comparison)
  IF LOWER(TRIM(curr_user_email)) <> LOWER(TRIM(v_invitation.email)) THEN
    RAISE EXCEPTION 'Authenticated email (%) does not match the invitation email (%). Please sign in with the invited email address.',
      curr_user_email, v_invitation.email;
  END IF;

  -- 6. Ensure profile exists for accepting user
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

  -- 7. Add user to organization_members with the assigned role
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
  ON CONFLICT (organization_id, user_id) DO UPDATE
  SET
    role = EXCLUDED.role,
    updated_at = NOW()
  RETURNING id INTO v_member_id;

  -- 8. Mark invitation as accepted
  UPDATE public.organization_invitations
  SET
    accepted_at = NOW(),
    updated_at = NOW()
  WHERE id = v_invitation.id;

  -- 9. Fetch org name
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

-- 8. Explicit permission grants for RPC execution
GRANT EXECUTE ON FUNCTION public.get_invitation_details(TEXT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.accept_team_invitation(TEXT) TO authenticated;
