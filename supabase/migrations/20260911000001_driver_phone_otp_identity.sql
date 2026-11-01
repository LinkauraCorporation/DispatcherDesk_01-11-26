-- ====================================================================
-- DISPATCHERDESK MIGRATION: 20260911000001_driver_phone_otp_identity.sql
-- Module: Driver Portal Authentication (Passwordless Phone OTP)
--
-- STRICT CONTRACT:
-- 1. Strict E.164 normalization for driver phone values (no country code guessing).
-- 2. Enforce global 1:1 active driver identity per normalized phone.
-- 3. Atomic SECURITY DEFINER RPC claim_driver_portal_by_phone()
-- 4. Inactive drivers strictly blocked from portal claiming.
-- 5. Office team members strictly blocked from driver claiming.
-- ====================================================================

-- --------------------------------------------------------------------
-- 1. STRICT E.164 PHONE NORMALIZATION FUNCTION
-- --------------------------------------------------------------------
-- Normalizes international phone strings to canonical E.164 format:
-- Must start with '+', followed by country code ([1-9]) and subscriber digits.
-- Total digits between 7 and 15 (ITU-T E.164 recommendation).
-- Returns canonical '+<digits>' or NULL if invalid/missing.
-- NEVER guesses or assumes country codes.
CREATE OR REPLACE FUNCTION public.normalize_e164_phone(p_phone TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_trimmed TEXT;
  v_digits TEXT;
BEGIN
  IF p_phone IS NULL THEN
    RETURN NULL;
  END IF;

  v_trimmed := TRIM(p_phone);
  IF v_trimmed = '' THEN
    RETURN NULL;
  END IF;

  -- Strictly require leading '+' to ensure we never guess country codes
  IF NOT v_trimmed LIKE '+%' THEN
    RETURN NULL;
  END IF;

  -- Strip all non-digit characters after the leading '+'
  v_digits := REGEXP_REPLACE(SUBSTRING(v_trimmed FROM 2), '[^0-9]', '', 'g');

  -- E.164 specifications: + followed by 7 to 15 digits total; country code cannot start with 0
  IF v_digits ~ '^[1-9][0-9]{6,14}$' THEN
    RETURN '+' || v_digits;
  END IF;

  RETURN NULL;
END;
$$;

-- --------------------------------------------------------------------
-- 2. GLOBAL 1:1 ACTIVE DRIVER PHONE UNIQUENESS CONSTRAINT
-- --------------------------------------------------------------------
-- Prevents duplicate active driver accounts with the same normalized phone
-- across all carrier clients and organizations globally.
DROP INDEX IF EXISTS public.uq_drivers_active_normalized_phone;
CREATE UNIQUE INDEX uq_drivers_active_normalized_phone
  ON public.drivers (public.normalize_e164_phone(phone))
  WHERE phone IS NOT NULL
    AND status <> 'inactive'
    AND public.normalize_e164_phone(phone) IS NOT NULL;

-- --------------------------------------------------------------------
-- 3. AUTOMATIC CANONICAL NORMALIZATION TRIGGER FOR DRIVERS
-- --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.normalize_driver_phone_on_save()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.phone IS NOT NULL AND TRIM(NEW.phone) <> '' THEN
    -- If provided with leading '+', persist in canonical format
    IF TRIM(NEW.phone) LIKE '+%' THEN
      NEW.phone := COALESCE(public.normalize_e164_phone(NEW.phone), TRIM(NEW.phone));
    END IF;
  ELSE
    NEW.phone := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_driver_phone ON public.drivers;
CREATE TRIGGER trg_normalize_driver_phone
  BEFORE INSERT OR UPDATE OF phone ON public.drivers
  FOR EACH ROW
  EXECUTE FUNCTION public.normalize_driver_phone_on_save();

-- --------------------------------------------------------------------
-- 4. ATOMIC SECURITY DEFINER RPC: claim_driver_portal_by_phone()
-- --------------------------------------------------------------------
-- Invoked immediately after a driver completes Supabase Phone OTP verification.
-- Derives identity solely from auth.uid() and the verified JWT phone claim.
-- Rejects office members, inactive drivers, already claimed drivers,
-- and unverified/unmatched phone numbers.
CREATE OR REPLACE FUNCTION public.claim_driver_portal_by_phone()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID;
  v_raw_phone TEXT;
  v_normalized_phone TEXT;
  v_driver RECORD;
  v_active_count INT;
BEGIN
  -- Step 1: Caller must be authenticated
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Authentication required.' USING ERRCODE = '28000';
  END IF;

  -- Step 2: Reject if caller is already an office team member (strict tenant firewall)
  IF EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE user_id = v_caller_id
  ) THEN
    RAISE EXCEPTION 'Access Denied: Office team members cannot claim a driver portal identity.'
      USING ERRCODE = '42501';
  END IF;

  -- Step 3: Read verified phone from auth.jwt() (fallback to auth.users if needed)
  v_raw_phone := NULLIF(TRIM(auth.jwt() ->> 'phone'), '');
  IF v_raw_phone IS NULL THEN
    SELECT phone INTO v_raw_phone
    FROM auth.users
    WHERE id = v_caller_id;
  END IF;

  IF v_raw_phone IS NULL OR TRIM(v_raw_phone) = '' THEN
    RAISE EXCEPTION 'No verified phone number found on authenticated account.'
      USING ERRCODE = '28000';
  END IF;

  -- Step 4: Normalize the authenticated phone
  v_normalized_phone := public.normalize_e164_phone(v_raw_phone);
  IF v_normalized_phone IS NULL THEN
    RAISE EXCEPTION 'Verified phone number is not valid E.164 format.'
      USING ERRCODE = '22023';
  END IF;

  -- Step 5: Locate active matching driver profile by normalized phone
  SELECT COUNT(*) INTO v_active_count
  FROM public.drivers
  WHERE public.normalize_e164_phone(phone) = v_normalized_phone
    AND status <> 'inactive';

  IF v_active_count = 0 THEN
    -- Check if an inactive record exists to give a clear operational rejection
    IF EXISTS (
      SELECT 1 FROM public.drivers
      WHERE public.normalize_e164_phone(phone) = v_normalized_phone
        AND status = 'inactive'
    ) THEN
      RAISE EXCEPTION 'Driver account is inactive. Please contact your carrier or dispatch office.'
        USING ERRCODE = '42501';
    END IF;

    RAISE EXCEPTION 'No active driver profile found matching verified phone number.'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_active_count > 1 THEN
    RAISE EXCEPTION 'Multiple active driver profiles detected for this phone number. Please contact dispatch support.'
      USING ERRCODE = '21000';
  END IF;

  -- Lock the single active driver record to prevent race conditions
  SELECT * INTO v_driver
  FROM public.drivers
  WHERE public.normalize_e164_phone(phone) = v_normalized_phone
    AND status <> 'inactive'
  FOR UPDATE;

  -- Step 6: Inactive check (safety guard)
  IF v_driver.status = 'inactive' THEN
    RAISE EXCEPTION 'Driver account is inactive.' USING ERRCODE = '42501';
  END IF;

  -- Step 7: Identity assignment logic
  IF v_driver.user_id IS NULL THEN
    -- Ensure caller is not already bound to another active driver profile
    IF EXISTS (
      SELECT 1 FROM public.drivers
      WHERE user_id = v_caller_id
        AND id <> v_driver.id
        AND status <> 'inactive'
    ) THEN
      RAISE EXCEPTION 'Caller account is already bound to another active driver profile.'
        USING ERRCODE = '42501';
    END IF;

    -- Atomically claim driver profile
    UPDATE public.drivers
    SET user_id = v_caller_id,
        updated_at = NOW()
    WHERE id = v_driver.id;

    v_driver.user_id := v_caller_id;

  ELSIF v_driver.user_id = v_caller_id THEN
    -- Already linked to this user: idempotent return
    NULL;
  ELSE
    -- Driver belongs to another user: strict rejection
    RAISE EXCEPTION 'Driver profile is already linked to another user account.'
      USING ERRCODE = '42501';
  END IF;

  -- Step 8: Return minimum driver and organization metadata required by AuthContext
  RETURN jsonb_build_object(
    'success', true,
    'driver_id', v_driver.id,
    'organization_id', v_driver.organization_id,
    'client_id', v_driver.client_id,
    'full_name', v_driver.full_name,
    'status', v_driver.status
  );
END;
$$;

-- Grant execution permission to authenticated users
GRANT EXECUTE ON FUNCTION public.claim_driver_portal_by_phone() TO authenticated;
