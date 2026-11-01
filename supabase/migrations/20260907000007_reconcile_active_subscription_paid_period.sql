-- ====================================================================
-- DispatcherDesk Database Migration: Reconcile Active Subscription Paid Period
-- File: supabase/migrations/20260907000007_reconcile_active_subscription_paid_period.sql
-- Description:
-- Reconciles the single known active subscription that was activated under
-- early migration logic before the paid period invariant was established,
-- retaining its 14-day trial window instead of its authoritative monthly period.
--
-- Target subscription:
-- subscription_id = '53be0985-36c4-48e2-abd2-5d162a43875b'
-- organization_id = '98a47364-c156-4911-b386-9658466af75b'
-- razorpay_subscription_id = 'sub_Ta1A3AFzpaJVd2'
--
-- Authoritative Razorpay values:
-- current_period_start = '2026-09-09T17:18:19.000Z'
-- current_period_end   = '2026-10-08T18:30:00.000Z'
-- razorpay_customer_id = 'cust_TZzW35yIdJFju6'
--
-- STRICT QUALIFICATION GATES:
-- 1. billing_state = 'active'
-- 2. id = '53be0985-36c4-48e2-abd2-5d162a43875b'
-- 3. organization_id = '98a47364-c156-4911-b386-9658466af75b'
-- 4. razorpay_subscription_id = 'sub_Ta1A3AFzpaJVd2'
-- 5. trial_ends_at IS NOT NULL
-- 6. current_period_end = trial_ends_at
-- 7. (current_period_end - current_period_start) <= INTERVAL '15 days'
--
-- The migration is strictly idempotent: once current_period_end is updated to
-- 2026-10-08T18:30:00.000Z, conditions 6 and 7 fail and 0 rows are affected.
-- ====================================================================

-- 1. Reconcile subscriptions table
UPDATE public.subscriptions
SET
  current_period_start = '2026-09-09T17:18:19.000Z'::timestamptz,
  current_period_end = '2026-10-08T18:30:00.000Z'::timestamptz,
  razorpay_customer_id = 'cust_TZzW35yIdJFju6',
  updated_at = NOW()
WHERE
  id = '53be0985-36c4-48e2-abd2-5d162a43875b'::uuid
  AND organization_id = '98a47364-c156-4911-b386-9658466af75b'::uuid
  AND billing_state = 'active'
  AND razorpay_subscription_id = 'sub_Ta1A3AFzpaJVd2'
  AND trial_ends_at IS NOT NULL
  AND current_period_end = trial_ends_at
  AND (current_period_end - current_period_start) <= INTERVAL '15 days';

-- 2. Reconcile billing_payment_transactions table for payment pay_Ta1AyNLOVQ6dOl
UPDATE public.billing_payment_transactions
SET
  billing_period_start = '2026-09-09T17:18:19.000Z'::timestamptz,
  billing_period_end = '2026-10-08T18:30:00.000Z'::timestamptz,
  updated_at = NOW()
WHERE
  provider_payment_id = 'pay_Ta1AyNLOVQ6dOl'
  AND subscription_id = '53be0985-36c4-48e2-abd2-5d162a43875b'::uuid
  AND organization_id = '98a47364-c156-4911-b386-9658466af75b'::uuid
  AND (billing_period_end - billing_period_start) <= INTERVAL '15 days';
