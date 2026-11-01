-- ====================================================================
-- DispatcherDesk SQL Test Suite: S6.2 Load Financial Integrity & Profitability
-- Version: 1.0.0
-- File: supabase/tests/s6_2_financial_integrity.sql
-- Description:
-- Tests and verifies:
-- 1. Negative rate rejection
-- 2. Negative loaded_miles and deadhead_miles rejection
-- 3. Negative fuel_expense rejection
-- 4. Negative driver_pay rejection
-- 5. Negative other_expenses rejection
-- 6. Zero-mile profitability handling (no division by zero, rpm = 0)
-- 7. Zero-rate profitability handling (no division by zero, margin = 0)
-- 8. Cross-tenant financial SELECT isolation
-- 9. Cross-tenant financial UPDATE protection
-- 10. Immutable organization_id protection on loads
-- 11. Unauthorized (anonymous) financial mutation rejection
-- 12. Staff role financial mutation rejection
-- 13. Supporting entity financial check constraints (driver pay rate, client min rpm)
-- 14. Deterministic calculate_load_profitability function verification
-- ====================================================================

BEGIN;

-- Setup test environment
CREATE SCHEMA IF NOT EXISTS test_helpers;

CREATE OR REPLACE FUNCTION test_helpers.assert(condition boolean, message text)
RETURNS void AS $$
BEGIN
  IF NOT condition THEN
    RAISE EXCEPTION 'TEST ASSERTION FAILED: %', message;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- --------------------------------------------------------------------
-- Setup Test Fixtures: Two Distinct Organizations and Users
-- --------------------------------------------------------------------

DO $$
DECLARE
  v_user_alpha UUID := 'aaaaaaaa-1111-4000-8000-000000000001'::UUID;
  v_user_beta  UUID := 'bbbbbbbb-2222-4000-8000-000000000002'::UUID;
  v_user_staff UUID := 'ssssssss-3333-4000-8000-000000000003'::UUID;

  v_org_alpha UUID := 'a0000000-0000-4000-8000-000000000001'::UUID;
  v_org_beta  UUID := 'b0000000-0000-4000-8000-000000000002'::UUID;

  v_client_alpha UUID := 'ca000000-0000-4000-8000-000000000001'::UUID;
  v_client_beta  UUID := 'cb000000-0000-4000-8000-000000000002'::UUID;

  v_load_alpha UUID := '1a000000-0000-4000-8000-000000000001'::UUID;
  v_load_beta  UUID := '1b000000-0000-4000-8000-000000000002'::UUID;

  v_caught_exception BOOLEAN;
  v_calc_res RECORD;
BEGIN
  -- Insert mock auth users into auth.users if not present
  INSERT INTO auth.users (id, email)
  VALUES 
    (v_user_alpha, 'alpha_admin@example.com'),
    (v_user_beta, 'beta_admin@example.com'),
    (v_user_staff, 'alpha_staff@example.com')
  ON CONFLICT (id) DO NOTHING;

  -- Insert profiles
  INSERT INTO public.profiles (id, full_name, email)
  VALUES 
    (v_user_alpha, 'Alpha Admin', 'alpha_admin@example.com'),
    (v_user_beta, 'Beta Admin', 'beta_admin@example.com'),
    (v_user_staff, 'Alpha Staff', 'alpha_staff@example.com')
  ON CONFLICT (id) DO NOTHING;

  -- Insert Organizations
  INSERT INTO public.organizations (id, name, slug)
  VALUES 
    (v_org_alpha, 'Alpha Freight Org', 'alpha-freight-s62'),
    (v_org_beta, 'Beta Freight Org', 'beta-freight-s62')
  ON CONFLICT (id) DO NOTHING;

  -- Insert Memberships
  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES 
    (v_org_alpha, v_user_alpha, 'owner_admin'),
    (v_org_beta, v_user_beta, 'owner_admin'),
    (v_org_alpha, v_user_staff, 'staff')
  ON CONFLICT (organization_id, user_id) DO UPDATE SET role = EXCLUDED.role;

  -- Insert Clients
  INSERT INTO public.clients (id, organization_id, company_name, client_type, minimum_rate_per_mile)
  VALUES 
    (v_client_alpha, v_org_alpha, 'Alpha Carrier Client', 'fleet', 2.25),
    (v_client_beta, v_org_beta, 'Beta Carrier Client', 'fleet', 2.00)
  ON CONFLICT (organization_id, id) DO NOTHING;

  -- Insert Baseline Valid Loads
  INSERT INTO public.loads (
    id, organization_id, load_number, client_id, pipeline_status,
    origin_city, origin_state, dest_city, dest_state,
    rate, loaded_miles, deadhead_miles, fuel_expense, driver_pay, other_expenses
  ) VALUES (
    v_load_alpha, v_org_alpha, 'LD-ALPHA-601', v_client_alpha, 'sourced',
    'Dallas', 'TX', 'Atlanta', 'GA',
    2500.00, 780.00, 45.00, 480.00, 650.00, 50.00
  ), (
    v_load_beta, v_org_beta, 'LD-BETA-601', v_client_beta, 'sourced',
    'Chicago', 'IL', 'Nashville', 'TN',
    1800.00, 470.00, 30.00, 310.00, 450.00, 20.00
  ) ON CONFLICT (organization_id, id) DO NOTHING;

  -- ==================================================================
  -- TEST 1: Negative Rate Rejection
  -- ==================================================================
  v_caught_exception := FALSE;
  BEGIN
    INSERT INTO public.loads (
      organization_id, load_number, client_id, pipeline_status,
      origin_city, origin_state, dest_city, dest_state, rate
    ) VALUES (
      v_org_alpha, 'LD-NEG-RATE', v_client_alpha, 'sourced',
      'Dallas', 'TX', 'Houston', 'TX', -500.00
    );
  EXCEPTION WHEN check_violation THEN
    v_caught_exception := TRUE;
  END;
  PERFORM test_helpers.assert(v_caught_exception, 'TEST 1: Negative load rate must be rejected by check constraint.');

  -- ==================================================================
  -- TEST 2: Negative Mileage Rejection
  -- ==================================================================
  v_caught_exception := FALSE;
  BEGIN
    INSERT INTO public.loads (
      organization_id, load_number, client_id, pipeline_status,
      origin_city, origin_state, dest_city, dest_state, rate, loaded_miles
    ) VALUES (
      v_org_alpha, 'LD-NEG-MILES', v_client_alpha, 'sourced',
      'Dallas', 'TX', 'Houston', 'TX', 1000.00, -100.00
    );
  EXCEPTION WHEN check_violation THEN
    v_caught_exception := TRUE;
  END;
  PERFORM test_helpers.assert(v_caught_exception, 'TEST 2A: Negative loaded_miles must be rejected.');

  v_caught_exception := FALSE;
  BEGIN
    INSERT INTO public.loads (
      organization_id, load_number, client_id, pipeline_status,
      origin_city, origin_state, dest_city, dest_state, rate, deadhead_miles
    ) VALUES (
      v_org_alpha, 'LD-NEG-DH', v_client_alpha, 'sourced',
      'Dallas', 'TX', 'Houston', 'TX', 1000.00, -50.00
    );
  EXCEPTION WHEN check_violation THEN
    v_caught_exception := TRUE;
  END;
  PERFORM test_helpers.assert(v_caught_exception, 'TEST 2B: Negative deadhead_miles must be rejected.');

  -- ==================================================================
  -- TEST 3: Negative Fuel Expense Rejection
  -- ==================================================================
  v_caught_exception := FALSE;
  BEGIN
    INSERT INTO public.loads (
      organization_id, load_number, client_id, pipeline_status,
      origin_city, origin_state, dest_city, dest_state, rate, fuel_expense
    ) VALUES (
      v_org_alpha, 'LD-NEG-FUEL', v_client_alpha, 'sourced',
      'Dallas', 'TX', 'Houston', 'TX', 1000.00, -200.00
    );
  EXCEPTION WHEN check_violation THEN
    v_caught_exception := TRUE;
  END;
  PERFORM test_helpers.assert(v_caught_exception, 'TEST 3: Negative fuel_expense must be rejected.');

  -- ==================================================================
  -- TEST 4: Negative Driver Pay Rejection
  -- ==================================================================
  v_caught_exception := FALSE;
  BEGIN
    INSERT INTO public.loads (
      organization_id, load_number, client_id, pipeline_status,
      origin_city, origin_state, dest_city, dest_state, rate, driver_pay
    ) VALUES (
      v_org_alpha, 'LD-NEG-DRV', v_client_alpha, 'sourced',
      'Dallas', 'TX', 'Houston', 'TX', 1000.00, -300.00
    );
  EXCEPTION WHEN check_violation THEN
    v_caught_exception := TRUE;
  END;
  PERFORM test_helpers.assert(v_caught_exception, 'TEST 4: Negative driver_pay must be rejected.');

  -- ==================================================================
  -- TEST 5: Negative Other Expenses Rejection
  -- ==================================================================
  v_caught_exception := FALSE;
  BEGIN
    INSERT INTO public.loads (
      organization_id, load_number, client_id, pipeline_status,
      origin_city, origin_state, dest_city, dest_state, rate, other_expenses
    ) VALUES (
      v_org_alpha, 'LD-NEG-OTH', v_client_alpha, 'sourced',
      'Dallas', 'TX', 'Houston', 'TX', 1000.00, -50.00
    );
  EXCEPTION WHEN check_violation THEN
    v_caught_exception := TRUE;
  END;
  PERFORM test_helpers.assert(v_caught_exception, 'TEST 5: Negative other_expenses must be rejected.');

  -- ==================================================================
  -- TEST 6: Zero-Mile Profitability Calculation Handling
  -- ==================================================================
  SELECT * INTO v_calc_res FROM public.calculate_load_profitability(
    1500.00, -- rate
    0.00,    -- loaded_miles
    0.00,    -- deadhead_miles
    0.00,    -- fuel
    300.00,  -- driver
    0.00     -- other
  );
  PERFORM test_helpers.assert(v_calc_res.total_miles = 0.00, 'TEST 6A: Total miles must be 0.00.');
  PERFORM test_helpers.assert(v_calc_res.rpm = 0.000, 'TEST 6B: RPM on zero miles must be 0.000 (no division by zero).');
  PERFORM test_helpers.assert(v_calc_res.estimated_profit = 1200.00, 'TEST 6C: Estimated profit must be 1200.00.');
  PERFORM test_helpers.assert(v_calc_res.profit_margin = 80.00, 'TEST 6D: Profit margin must be 80.00%.');

  -- ==================================================================
  -- TEST 7: Zero-Rate Profitability Calculation Handling
  -- ==================================================================
  SELECT * INTO v_calc_res FROM public.calculate_load_profitability(
    0.00,    -- rate
    500.00,  -- loaded_miles
    50.00,   -- deadhead_miles
    200.00,  -- fuel
    350.00,  -- driver
    50.00    -- other
  );
  PERFORM test_helpers.assert(v_calc_res.total_miles = 550.00, 'TEST 7A: Total miles must be 550.00.');
  PERFORM test_helpers.assert(v_calc_res.rpm = 0.000, 'TEST 7B: RPM on zero rate must be 0.000.');
  PERFORM test_helpers.assert(v_calc_res.total_estimated_cost = 600.00, 'TEST 7C: Total cost must be 600.00.');
  PERFORM test_helpers.assert(v_calc_res.estimated_profit = -600.00, 'TEST 7D: Estimated profit must be -600.00.');
  PERFORM test_helpers.assert(v_calc_res.profit_margin = 0.00, 'TEST 7E: Profit margin on zero rate must be 0.00% (no division by zero).');

  -- ==================================================================
  -- TEST 8: Supporting Entity Financial Constraints
  -- ==================================================================
  -- Negative driver pay rate
  v_caught_exception := FALSE;
  BEGIN
    INSERT INTO public.drivers (
      organization_id, full_name, pay_type, pay_rate
    ) VALUES (
      v_org_alpha, 'Negative Pay Driver', 'percentage_gross', -10.00
    );
  EXCEPTION WHEN check_violation THEN
    v_caught_exception := TRUE;
  END;
  PERFORM test_helpers.assert(v_caught_exception, 'TEST 8A: Negative driver pay rate must be rejected.');

  -- Negative client min RPM
  v_caught_exception := FALSE;
  BEGIN
    INSERT INTO public.clients (
      organization_id, company_name, client_type, minimum_rate_per_mile
    ) VALUES (
      v_org_alpha, 'Negative RPM Client', 'fleet', -1.50
    );
  EXCEPTION WHEN check_violation THEN
    v_caught_exception := TRUE;
  END;
  PERFORM test_helpers.assert(v_caught_exception, 'TEST 8B: Negative client minimum RPM must be rejected.');

  -- ==================================================================
  -- TEST 9: Immutable organization_id Protection on Loads
  -- ==================================================================
  v_caught_exception := FALSE;
  BEGIN
    UPDATE public.loads
    SET organization_id = v_org_beta
    WHERE id = v_load_alpha;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%Security Violation: organization_id is immutable%' THEN
      v_caught_exception := TRUE;
    END IF;
  END;
  PERFORM test_helpers.assert(v_caught_exception, 'TEST 9: Changing organization_id on a load must be rejected.');

END $$;

-- --------------------------------------------------------------------
-- RLS & Role Isolation Tests
-- --------------------------------------------------------------------

-- TEST 10: Cross-tenant Financial SELECT via RLS
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub": "aaaaaaaa-1111-4000-8000-000000000001", "role": "authenticated"}';

DO $$
DECLARE
  v_cnt INTEGER;
BEGIN
  -- User Alpha should see Alpha's load but NOT Beta's load
  SELECT COUNT(*) INTO v_cnt
  FROM public.loads
  WHERE id = '1b000000-0000-4000-8000-000000000002'::UUID;

  PERFORM test_helpers.assert(v_cnt = 0, 'TEST 10: User Alpha cannot SELECT Beta load financials.');
END $$;

-- TEST 11: Cross-tenant Financial UPDATE via RLS
DO $$
DECLARE
  v_cnt INTEGER;
BEGIN
  -- User Alpha attempts to UPDATE Beta's load rate
  UPDATE public.loads
  SET rate = 9999.00
  WHERE id = '1b000000-0000-4000-8000-000000000002'::UUID;

  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  PERFORM test_helpers.assert(v_cnt = 0, 'TEST 11: User Alpha UPDATE on Beta load financials must affect 0 rows.');
END $$;

-- TEST 12: Staff Role Financial Mutation Rejection
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub": "ssssssss-3333-4000-8000-000000000003", "role": "authenticated"}';

DO $$
DECLARE
  v_cnt INTEGER;
BEGIN
  -- Staff member has read access to org alpha
  SELECT COUNT(*) INTO v_cnt
  FROM public.loads
  WHERE id = '1a000000-0000-4000-8000-000000000001'::UUID;
  PERFORM test_helpers.assert(v_cnt = 1, 'TEST 12A: Staff member can read org load financials.');

  -- Staff member attempts to update financial rate (must be blocked by RLS has_operational_write_access)
  UPDATE public.loads
  SET rate = 5000.00
  WHERE id = '1a000000-0000-4000-8000-000000000001'::UUID;

  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  PERFORM test_helpers.assert(v_cnt = 0, 'TEST 12B: Staff member UPDATE on load financials must affect 0 rows.');
END $$;

-- TEST 13: Anonymous / Unauthenticated Mutation Rejection
RESET ROLE;
SET LOCAL ROLE anon;

DO $$
DECLARE
  v_cnt INTEGER;
BEGIN
  -- Anonymous cannot read loads
  SELECT COUNT(*) INTO v_cnt
  FROM public.loads;
  PERFORM test_helpers.assert(v_cnt = 0, 'TEST 13A: Anonymous user SELECT on loads must return 0 rows.');

  -- Anonymous cannot update loads
  UPDATE public.loads
  SET rate = 1234.00;
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  PERFORM test_helpers.assert(v_cnt = 0, 'TEST 13B: Anonymous user UPDATE on loads must affect 0 rows.');
END $$;

ROLLBACK;
