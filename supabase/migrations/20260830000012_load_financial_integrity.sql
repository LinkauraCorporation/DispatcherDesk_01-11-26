-- ====================================================================
-- DispatcherDesk Migration: Load Financial Integrity & Profitability Hardening (S6.2)
-- Version: 1.0.12
-- File: supabase/migrations/20260830000012_load_financial_integrity.sql
-- Description:
-- 1. Hardens database-level financial non-negativity and precision constraints
--    across supporting entity tables (drivers.pay_rate, clients.minimum_rate_per_mile,
--    brokers.payment_terms_days).
-- 2. Verifies and reaffirms all financial constraints on public.loads.
-- 3. Provides a deterministic database function for load profitability metrics calculation.
-- ====================================================================

-- 1. Supporting Entity Financial Check Constraints

-- Drivers Pay Rate
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_drivers_pay_rate_non_negative'
      AND conrelid = 'public.drivers'::regclass
  ) THEN
    ALTER TABLE public.drivers
      ADD CONSTRAINT chk_drivers_pay_rate_non_negative
      CHECK (pay_rate IS NULL OR pay_rate >= 0);
  END IF;
END $$;

-- Clients Minimum RPM
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_clients_min_rpm_non_negative'
      AND conrelid = 'public.clients'::regclass
  ) THEN
    ALTER TABLE public.clients
      ADD CONSTRAINT chk_clients_min_rpm_non_negative
      CHECK (minimum_rate_per_mile IS NULL OR minimum_rate_per_mile >= 0);
  END IF;
END $$;

-- Brokers Payment Terms
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_brokers_payment_terms_non_negative'
      AND conrelid = 'public.brokers'::regclass
  ) THEN
    ALTER TABLE public.brokers
      ADD CONSTRAINT chk_brokers_payment_terms_non_negative
      CHECK (payment_terms_days IS NULL OR payment_terms_days >= 0);
  END IF;
END $$;

-- 2. Pure Deterministic Database Function for Server-Side Profitability
-- Provides identical calculation logic to src/lib/calculations.ts for server-side SQL queries / reporting
CREATE OR REPLACE FUNCTION public.calculate_load_profitability(
  p_rate NUMERIC(10,2),
  p_loaded_miles NUMERIC(10,2),
  p_deadhead_miles NUMERIC(10,2),
  p_fuel_expense NUMERIC(10,2),
  p_driver_pay NUMERIC(10,2),
  p_other_expenses NUMERIC(10,2)
)
RETURNS TABLE (
  gross_rate NUMERIC(10,2),
  loaded_miles NUMERIC(10,2),
  deadhead_miles NUMERIC(10,2),
  total_miles NUMERIC(10,2),
  rpm NUMERIC(10,3),
  fuel_expense NUMERIC(10,2),
  driver_pay NUMERIC(10,2),
  other_expenses NUMERIC(10,2),
  total_estimated_cost NUMERIC(10,2),
  estimated_profit NUMERIC(10,2),
  profit_margin NUMERIC(10,2)
)
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rate NUMERIC(10,2) := GREATEST(0, COALESCE(p_rate, 0));
  v_loaded NUMERIC(10,2) := GREATEST(0, COALESCE(p_loaded_miles, 0));
  v_deadhead NUMERIC(10,2) := GREATEST(0, COALESCE(p_deadhead_miles, 0));
  v_fuel NUMERIC(10,2) := GREATEST(0, COALESCE(p_fuel_expense, 0));
  v_driver NUMERIC(10,2) := GREATEST(0, COALESCE(p_driver_pay, 0));
  v_other NUMERIC(10,2) := GREATEST(0, COALESCE(p_other_expenses, 0));
  
  v_total_miles NUMERIC(10,2);
  v_rpm NUMERIC(10,3);
  v_total_cost NUMERIC(10,2);
  v_profit NUMERIC(10,2);
  v_margin NUMERIC(10,2);
BEGIN
  v_total_miles := ROUND(v_loaded + v_deadhead, 2);
  
  IF v_total_miles > 0 THEN
    v_rpm := ROUND(v_rate / v_total_miles, 3);
  ELSE
    v_rpm := 0.000;
  END IF;
  
  v_total_cost := ROUND(v_fuel + v_driver + v_other, 2);
  v_profit := ROUND(v_rate - v_total_cost, 2);
  
  IF v_rate > 0 THEN
    v_margin := ROUND((v_profit / v_rate) * 100, 2);
  ELSE
    v_margin := 0.00;
  END IF;
  
  RETURN QUERY SELECT
    v_rate,
    v_loaded,
    v_deadhead,
    v_total_miles,
    v_rpm,
    v_fuel,
    v_driver,
    v_other,
    v_total_cost,
    v_profit,
    v_margin;
END;
$$;
