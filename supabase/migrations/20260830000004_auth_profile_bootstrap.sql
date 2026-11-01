-- ====================================================================
-- Migration: 20260830000004_auth_profile_bootstrap.sql
-- Description:
-- 1. Adds SECURITY DEFINER trigger public.handle_new_user() on auth.users
--    to automatically and idempotently provision public.profiles.
-- 2. Backfills any existing auth.users that currently lack a public.profiles row.
-- 3. Updates create_organization_with_admin() RPC to ensure the calling
--    authenticated user has a public.profiles record prior to org creation.
-- ====================================================================

-- 1. Function to handle new user registration from auth.users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    full_name,
    phone,
    preferred_timezone
  )
  VALUES (
    NEW.id,
    COALESCE(
      NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), ''),
      NULLIF(TRIM(NEW.raw_user_meta_data->>'name'), ''),
      NULLIF(SPLIT_PART(NEW.email, '@', 1), ''),
      'User'
    ),
    NULLIF(TRIM(NEW.raw_user_meta_data->>'phone'), ''),
    COALESCE(
      NULLIF(TRIM(NEW.raw_user_meta_data->>'preferred_timezone'), ''),
      'Asia/Kolkata'
    )
  )
  ON CONFLICT (id) DO UPDATE
  SET
    full_name = CASE
      WHEN public.profiles.full_name IS NULL OR TRIM(public.profiles.full_name) = ''
        THEN EXCLUDED.full_name
      ELSE public.profiles.full_name
    END,
    phone = COALESCE(public.profiles.phone, EXCLUDED.phone),
    updated_at = NOW();

  RETURN NEW;
END;
$$;

-- 2. Trigger on auth.users for signup/creation (safely drop if already exists)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- 3. Backfill any existing auth users who do not have a corresponding profile
INSERT INTO public.profiles (id, full_name, phone, preferred_timezone)
SELECT
  u.id,
  COALESCE(
    NULLIF(TRIM(u.raw_user_meta_data->>'full_name'), ''),
    NULLIF(TRIM(u.raw_user_meta_data->>'name'), ''),
    NULLIF(SPLIT_PART(u.email, '@', 1), ''),
    'User'
  ),
  NULLIF(TRIM(u.raw_user_meta_data->>'phone'), ''),
  COALESCE(
    NULLIF(TRIM(u.raw_user_meta_data->>'preferred_timezone'), ''),
    'Asia/Kolkata'
  )
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM public.profiles p WHERE p.id = u.id
)
ON CONFLICT (id) DO NOTHING;

-- 4. Update create_organization_with_admin to defensively ensure profile exists
CREATE OR REPLACE FUNCTION public.create_organization_with_admin(
  org_name TEXT,
  org_slug TEXT,
  org_primary_timezone TEXT DEFAULT 'America/Chicago'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  new_org_id UUID;
  curr_user_id UUID;
  clean_slug TEXT;
  user_email TEXT;
  user_full_name TEXT;
BEGIN
  curr_user_id := (SELECT auth.uid());
  IF curr_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF org_name IS NULL OR TRIM(org_name) = '' THEN
    RAISE EXCEPTION 'Organization name cannot be empty';
  END IF;

  -- Ensure profile exists for the current user
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = curr_user_id) THEN
    SELECT email, raw_user_meta_data->>'full_name'
    INTO user_email, user_full_name
    FROM auth.users
    WHERE id = curr_user_id;

    INSERT INTO public.profiles (id, full_name, preferred_timezone)
    VALUES (
      curr_user_id,
      COALESCE(
        NULLIF(TRIM(user_full_name), ''),
        NULLIF(SPLIT_PART(user_email, '@', 1), ''),
        'User'
      ),
      'Asia/Kolkata'
    )
    ON CONFLICT (id) DO NOTHING;
  END IF;

  clean_slug := NULLIF(LOWER(TRIM(org_slug)), '');

  INSERT INTO public.organizations (name, slug, primary_timezone)
  VALUES (TRIM(org_name), clean_slug, COALESCE(org_primary_timezone, 'America/Chicago'))
  RETURNING id INTO new_org_id;

  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES (new_org_id, curr_user_id, 'owner_admin');

  RETURN new_org_id;
END;
$$;
