-- ====================================================================
-- DISPATCHERDESK MIGRATION: 20260913000003_driver_phone_e164_normalization_fix.sql
-- Module: Driver Phone E.164 Normalization & Auth Alignment Fix
--
-- EXECUTION ORDER:
-- 1. Preserve legacy test driver records but remove duplicate placeholder phone '66464656'.
-- 2. Replace public.normalize_e164_phone(p_phone TEXT) with updated ITU-T E.164 parser:
--    - Accepts both '+'-prefixed and digits-only international phone formats.
--    - Strictly validates 7-15 digits starting with non-zero country code (^[1-9][0-9]{6,14}$).
--    - Returns canonical '+<digits>' format or NULL.
--    - Remains IMMUTABLE and preserves signature.
-- 3. Retain existing unique functional index uq_drivers_active_normalized_phone.
-- ====================================================================

-- --------------------------------------------------------------------
-- 1. REMOVE DUPLICATE TEST PLACEHOLDER PHONES
-- --------------------------------------------------------------------
-- Preserves driver records and statuses (e.g. loads, on_load) while nullifying
-- the duplicate placeholder phone '66464656' so the active normalized phone
-- unique constraint is not violated.
UPDATE public.drivers
SET phone = NULL
WHERE phone = '66464656';

-- --------------------------------------------------------------------
-- 2. REPLACE normalize_e164_phone FUNCTION
-- --------------------------------------------------------------------
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

  -- If input starts with '+', strip '+' and all non-digit characters
  -- Otherwise, strip all non-digit characters
  IF v_trimmed LIKE '+%' THEN
    v_digits := REGEXP_REPLACE(SUBSTRING(v_trimmed FROM 2), '[^0-9]', '', 'g');
  ELSE
    v_digits := REGEXP_REPLACE(v_trimmed, '[^0-9]', '', 'g');
  END IF;

  -- Accept only exactly 7-15 digits matching ^[1-9][0-9]{6,14}$
  -- (ITU-T E.164 standard: non-zero leading country code digit, 7-15 total digits)
  IF v_digits ~ '^[1-9][0-9]{6,14}$' THEN
    RETURN '+' || v_digits;
  END IF;

  RETURN NULL;
END;
$$;
