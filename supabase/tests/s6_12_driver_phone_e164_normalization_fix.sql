-- ====================================================================
-- DispatcherDesk Verification Test Suite: S6.12 Driver Phone E.164 Normalization Fix
-- File: supabase/tests/s6_12_driver_phone_e164_normalization_fix.sql
-- Description:
-- Comprehensive verification test suite for:
-- 1. Normalization function behavior for international '+' and digits-only inputs.
-- 2. Strict rejection of invalid, short, overly long, zero-prefix, and blank inputs.
-- 3. Validation of public.drivers data integrity (nullified 66464656, preserved real driver).
-- 4. Validation of functional unique index uq_drivers_active_normalized_phone.
-- ====================================================================

BEGIN;

DO $$
DECLARE
  v_res TEXT;
  v_cnt INTEGER;
  v_driver RECORD;
BEGIN
  RAISE NOTICE '=============================================================';
  RAISE NOTICE 'STARTING TEST SUITE: S6.12 DRIVER PHONE E.164 NORMALIZATION FIX';
  RAISE NOTICE '=============================================================';

  -- ------------------------------------------------------------------
  -- TEST 1: Normalization Function Test Cases
  -- ------------------------------------------------------------------
  RAISE NOTICE 'Test 1.1: Verify +919988107781 -> +919988107781';
  SELECT public.normalize_e164_phone('+919988107781') INTO v_res;
  IF v_res <> '+919988107781' THEN
    RAISE EXCEPTION 'Test 1.1 FAILED: expected +919988107781, got %', v_res;
  END IF;

  RAISE NOTICE 'Test 1.2: Verify 919988107781 -> +919988107781';
  SELECT public.normalize_e164_phone('919988107781') INTO v_res;
  IF v_res <> '+919988107781' THEN
    RAISE EXCEPTION 'Test 1.2 FAILED: expected +919988107781, got %', v_res;
  END IF;

  RAISE NOTICE 'Test 1.3: Verify +1 (555) 555-0199 -> +15555550199';
  SELECT public.normalize_e164_phone('+1 (555) 555-0199') INTO v_res;
  IF v_res <> '+15555550199' THEN
    RAISE EXCEPTION 'Test 1.3 FAILED: expected +15555550199, got %', v_res;
  END IF;

  RAISE NOTICE 'Test 1.4: Verify 15555550199 -> +15555550199';
  SELECT public.normalize_e164_phone('15555550199') INTO v_res;
  IF v_res <> '+15555550199' THEN
    RAISE EXCEPTION 'Test 1.4 FAILED: expected +15555550199, got %', v_res;
  END IF;

  RAISE NOTICE 'Test 1.5: Verify 66464656 -> +66464656';
  SELECT public.normalize_e164_phone('66464656') INTO v_res;
  IF v_res <> '+66464656' THEN
    RAISE EXCEPTION 'Test 1.5 FAILED: expected +66464656, got %', v_res;
  END IF;

  -- Invalid test cases
  RAISE NOTICE 'Test 1.6: Verify invalid leading zero: +0123456789 -> NULL';
  SELECT public.normalize_e164_phone('+0123456789') INTO v_res;
  IF v_res IS NOT NULL THEN
    RAISE EXCEPTION 'Test 1.6 FAILED: expected NULL, got %', v_res;
  END IF;

  RAISE NOTICE 'Test 1.7: Verify invalid leading zero: 0123456789 -> NULL';
  SELECT public.normalize_e164_phone('0123456789') INTO v_res;
  IF v_res IS NOT NULL THEN
    RAISE EXCEPTION 'Test 1.7 FAILED: expected NULL, got %', v_res;
  END IF;

  RAISE NOTICE 'Test 1.8: Verify invalid short length: 12345 -> NULL';
  SELECT public.normalize_e164_phone('12345') INTO v_res;
  IF v_res IS NOT NULL THEN
    RAISE EXCEPTION 'Test 1.8 FAILED: expected NULL, got %', v_res;
  END IF;

  RAISE NOTICE 'Test 1.9: Verify invalid long length: 1234567890123456 -> NULL';
  SELECT public.normalize_e164_phone('1234567890123456') INTO v_res;
  IF v_res IS NOT NULL THEN
    RAISE EXCEPTION 'Test 1.9 FAILED: expected NULL, got %', v_res;
  END IF;

  RAISE NOTICE 'Test 1.10: Verify empty string: "" -> NULL';
  SELECT public.normalize_e164_phone('') INTO v_res;
  IF v_res IS NOT NULL THEN
    RAISE EXCEPTION 'Test 1.10 FAILED: expected NULL, got %', v_res;
  END IF;

  RAISE NOTICE 'Test 1.11: Verify NULL -> NULL';
  SELECT public.normalize_e164_phone(NULL) INTO v_res;
  IF v_res IS NOT NULL THEN
    RAISE EXCEPTION 'Test 1.11 FAILED: expected NULL, got %', v_res;
  END IF;

  RAISE NOTICE 'Test 1.12: Verify non-numeric: "abc" -> NULL';
  SELECT public.normalize_e164_phone('abc') INTO v_res;
  IF v_res IS NOT NULL THEN
    RAISE EXCEPTION 'Test 1.12 FAILED: expected NULL, got %', v_res;
  END IF;

  -- ------------------------------------------------------------------
  -- TEST 2: Verify Legacy Driver Records & Real Driver Portal Driver
  -- ------------------------------------------------------------------
  RAISE NOTICE 'Test 2.1: Verify all seven 66464656 records now have phone = NULL';
  SELECT count(*) INTO v_cnt FROM public.drivers WHERE phone = '66464656';
  IF v_cnt > 0 THEN
    RAISE EXCEPTION 'Test 2.1 FAILED: found % drivers with phone = 66464656', v_cnt;
  END IF;

  RAISE NOTICE 'Test 2.2: Verify 135146464 remains unchanged';
  SELECT count(*) INTO v_cnt FROM public.drivers WHERE phone = '135146464';
  IF v_cnt <> 1 THEN
    RAISE EXCEPTION 'Test 2.2 FAILED: expected 1 driver with phone = 135146464, found %', v_cnt;
  END IF;

  RAISE NOTICE 'Test 2.3: Verify real Driver Portal test driver (+919988107781) is intact';
  SELECT * INTO v_driver FROM public.drivers WHERE phone = '+919988107781';
  IF v_driver.id IS NULL THEN
    RAISE EXCEPTION 'Test 2.3 FAILED: driver with phone = +919988107781 not found';
  END IF;
  IF v_driver.status <> 'available' THEN
    RAISE EXCEPTION 'Test 2.3 FAILED: driver status is %, expected available', v_driver.status;
  END IF;
  IF v_driver.user_id IS NOT NULL THEN
    RAISE EXCEPTION 'Test 2.3 FAILED: driver user_id is %, expected NULL', v_driver.user_id;
  END IF;

  -- ------------------------------------------------------------------
  -- TEST 3: Verify Unique Functional Index Integrity
  -- ------------------------------------------------------------------
  RAISE NOTICE 'Test 3.1: Verify no duplicate normalized active driver phones exist';
  SELECT count(*) INTO v_cnt
  FROM (
    SELECT public.normalize_e164_phone(phone) AS norm_phone
    FROM public.drivers
    WHERE status <> 'inactive' AND public.normalize_e164_phone(phone) IS NOT NULL
    GROUP BY public.normalize_e164_phone(phone)
    HAVING count(*) > 1
  ) dups;

  IF v_cnt > 0 THEN
    RAISE EXCEPTION 'Test 3.1 FAILED: found % duplicate normalized active phones', v_cnt;
  END IF;

  RAISE NOTICE '=============================================================';
  RAISE NOTICE 'ALL S6.12 TESTS PASSED PERFECTLY';
  RAISE NOTICE '=============================================================';
END $$;

COMMIT;
