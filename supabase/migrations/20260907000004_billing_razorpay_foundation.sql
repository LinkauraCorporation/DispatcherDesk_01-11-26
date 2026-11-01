-- ====================================================================
-- DispatcherDesk Migration: Secure Payment Foundation (Phase 3A)
-- Version: 1.0.30
-- File: supabase/migrations/20260907000004_billing_razorpay_foundation.sql
-- Description:
-- 1. Creates public.billing_webhook_events for verified, immutable, idempotent provider webhook ingestion.
-- 2. Creates public.billing_payment_transactions for authoritative payment history & idempotency.
-- 3. Adds last_provider_event_at to public.subscriptions for strict out-of-order/stale event protection.
-- 4. Locks down public.subscriptions by revoking direct client-side UPDATE and INSERT permissions.
-- 5. Introduces transactional, SECURITY DEFINER atomic state transition RPC:
--    public.apply_subscription_payment_transition() with search_path = '', row locking,
--    provider ID correlation, stale event ordering protection, and atomic transaction recording.
-- ====================================================================

-- 1. Append-only Webhook Events Ingestion Ledger
CREATE TABLE IF NOT EXISTS public.billing_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL DEFAULT 'razorpay',
  provider_event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'processed', 'failed', 'ignored')),
  error_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  subscription_id UUID REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  provider_event_created_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  CONSTRAINT uq_billing_webhook_provider_event UNIQUE (provider, provider_event_id)
);

CREATE INDEX IF NOT EXISTS idx_billing_webhook_status ON public.billing_webhook_events(status);
CREATE INDEX IF NOT EXISTS idx_billing_webhook_org ON public.billing_webhook_events(organization_id);
CREATE INDEX IF NOT EXISTS idx_billing_webhook_received_at ON public.billing_webhook_events(received_at DESC);

-- Enable RLS on billing_webhook_events
ALTER TABLE public.billing_webhook_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.billing_webhook_events FROM anon, public;
GRANT SELECT ON public.billing_webhook_events TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.billing_webhook_events FROM authenticated;

DROP POLICY IF EXISTS "Members can view their organization webhook events" ON public.billing_webhook_events;
CREATE POLICY "Members can view their organization webhook events"
  ON public.billing_webhook_events FOR SELECT
  TO authenticated
  USING (
    organization_id IS NOT NULL
    AND organization_id IN (SELECT public.get_user_organizations())
  );


-- 2. Authoritative Payment Transactions Ledger
CREATE TABLE IF NOT EXISTS public.billing_payment_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  subscription_id UUID NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'razorpay',
  provider_payment_id TEXT,
  provider_order_id TEXT,
  provider_invoice_id TEXT,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL CHECK (status IN ('created', 'authorized', 'captured', 'failed', 'refunded')),
  billing_period_start TIMESTAMPTZ,
  billing_period_end TIMESTAMPTZ,
  error_code TEXT,
  error_description TEXT,
  raw_response JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_billing_tx_org ON public.billing_payment_transactions(organization_id);
CREATE INDEX IF NOT EXISTS idx_billing_tx_sub ON public.billing_payment_transactions(subscription_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_billing_tx_provider_payment 
  ON public.billing_payment_transactions(provider, provider_payment_id) 
  WHERE provider_payment_id IS NOT NULL;

-- Enable RLS on billing_payment_transactions
ALTER TABLE public.billing_payment_transactions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.billing_payment_transactions FROM anon, public;
GRANT SELECT ON public.billing_payment_transactions TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.billing_payment_transactions FROM authenticated;

DROP POLICY IF EXISTS "Members can view their organization payment transactions" ON public.billing_payment_transactions;
CREATE POLICY "Members can view their organization payment transactions"
  ON public.billing_payment_transactions FOR SELECT
  TO authenticated
  USING (organization_id IN (SELECT public.get_user_organizations()));


-- 3. Hardening Subscriptions Table
-- Add provider event ordering column
ALTER TABLE public.subscriptions 
  ADD COLUMN IF NOT EXISTS last_provider_event_at TIMESTAMPTZ;

-- Revoke direct mutation capabilities from authenticated users
DROP POLICY IF EXISTS "Owner admins can update organization subscription" ON public.subscriptions;
DROP POLICY IF EXISTS "Owner admins can insert organization subscription" ON public.subscriptions;
REVOKE INSERT, UPDATE, DELETE ON public.subscriptions FROM authenticated, anon, public;
GRANT SELECT ON public.subscriptions TO authenticated;


-- 4. Transactional, Atomic Subscription Payment Transition Function
CREATE OR REPLACE FUNCTION public.apply_subscription_payment_transition(
  p_organization_id UUID,
  p_provider TEXT DEFAULT 'razorpay',
  p_provider_event_id TEXT DEFAULT NULL,
  p_provider_event_timestamp TIMESTAMPTZ DEFAULT NULL,
  p_new_billing_state TEXT DEFAULT NULL,
  p_plan TEXT DEFAULT NULL,
  p_current_period_start TIMESTAMPTZ DEFAULT NULL,
  p_current_period_end TIMESTAMPTZ DEFAULT NULL,
  p_razorpay_customer_id TEXT DEFAULT NULL,
  p_razorpay_subscription_id TEXT DEFAULT NULL,
  p_payment_id TEXT DEFAULT NULL,
  p_invoice_id TEXT DEFAULT NULL,
  p_order_id TEXT DEFAULT NULL,
  p_amount_cents INTEGER DEFAULT NULL,
  p_currency TEXT DEFAULT 'USD',
  p_payment_status TEXT DEFAULT NULL,
  p_error_code TEXT DEFAULT NULL,
  p_error_description TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_sub public.subscriptions%ROWTYPE;
  v_tx_id UUID := NULL;
  v_stale BOOLEAN := FALSE;
  v_updated_state TEXT;
BEGIN
  -- 1. Row lock target subscription
  SELECT * INTO v_sub
  FROM public.subscriptions
  WHERE organization_id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Billing Transition Error: Subscription record not found for organization %', p_organization_id;
  END IF;

  -- 2. Validate tenant and provider subscription correlation
  -- Prevent cross-tenant subscription overwrites if an existing provider ID is bound
  IF v_sub.razorpay_subscription_id IS NOT NULL 
     AND p_razorpay_subscription_id IS NOT NULL 
     AND v_sub.razorpay_subscription_id <> p_razorpay_subscription_id THEN
    RAISE EXCEPTION 'Billing Transition Error: Provider subscription ID mismatch (existing: %, supplied: %)', 
      v_sub.razorpay_subscription_id, p_razorpay_subscription_id;
  END IF;

  -- 3. Stale / Out-of-order Event Protection
  -- If event timestamp is older than last_provider_event_at, do not overwrite subscription state
  IF p_provider_event_timestamp IS NOT NULL AND v_sub.last_provider_event_at IS NOT NULL THEN
    IF p_provider_event_timestamp < v_sub.last_provider_event_at THEN
      v_stale := TRUE;
    END IF;
  END IF;

  -- Canceled state protection: Never resurrect a canceled subscription using a stale or equal event
  IF v_sub.billing_state = 'canceled' AND p_new_billing_state = 'active' AND v_stale THEN
    v_stale := TRUE;
  END IF;

  -- 4. Record Payment Transaction (idempotent via uq_billing_tx_provider_payment)
  IF p_payment_id IS NOT NULL AND p_payment_status IS NOT NULL THEN
    INSERT INTO public.billing_payment_transactions (
      organization_id,
      subscription_id,
      provider,
      provider_payment_id,
      provider_order_id,
      provider_invoice_id,
      amount_cents,
      currency,
      status,
      billing_period_start,
      billing_period_end,
      error_code,
      error_description,
      created_at,
      updated_at
    ) VALUES (
      p_organization_id,
      v_sub.id,
      p_provider,
      p_payment_id,
      p_order_id,
      p_invoice_id,
      COALESCE(p_amount_cents, 0),
      COALESCE(p_currency, 'USD'),
      p_payment_status,
      COALESCE(p_current_period_start, v_sub.current_period_start),
      COALESCE(p_current_period_end, v_sub.current_period_end),
      p_error_code,
      p_error_description,
      NOW(),
      NOW()
    )
    ON CONFLICT (provider, provider_payment_id) WHERE provider_payment_id IS NOT NULL
    DO NOTHING
    RETURNING id INTO v_tx_id;
  END IF;

  -- 5. Stale event exit path
  IF v_stale THEN
    RETURN jsonb_build_object(
      'success', true,
      'status', 'stale_event_ignored',
      'organization_id', p_organization_id,
      'subscription_id', v_sub.id,
      'current_billing_state', v_sub.billing_state,
      'transaction_id', v_tx_id
    );
  END IF;

  -- 6. Apply atomic subscription updates
  v_updated_state := COALESCE(p_new_billing_state, v_sub.billing_state);

  UPDATE public.subscriptions
  SET
    billing_state = v_updated_state,
    plan = COALESCE(p_plan, v_sub.plan),
    current_period_start = COALESCE(p_current_period_start, v_sub.current_period_start),
    current_period_end = COALESCE(p_current_period_end, v_sub.current_period_end),
    razorpay_customer_id = COALESCE(p_razorpay_customer_id, v_sub.razorpay_customer_id),
    razorpay_subscription_id = COALESCE(p_razorpay_subscription_id, v_sub.razorpay_subscription_id),
    last_provider_event_at = GREATEST(COALESCE(p_provider_event_timestamp, NOW()), COALESCE(v_sub.last_provider_event_at, '1970-01-01'::timestamptz)),
    updated_at = NOW()
  WHERE organization_id = p_organization_id;

  RETURN jsonb_build_object(
    'success', true,
    'status', 'applied',
    'organization_id', p_organization_id,
    'subscription_id', v_sub.id,
    'previous_billing_state', v_sub.billing_state,
    'new_billing_state', v_updated_state,
    'transaction_id', v_tx_id
  );
END;
$$;

-- Secure function permissions: Only server-side service role can execute
REVOKE ALL ON FUNCTION public.apply_subscription_payment_transition FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_subscription_payment_transition TO service_role;
