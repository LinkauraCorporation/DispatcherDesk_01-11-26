-- ====================================================================
-- DispatcherDesk Database Migration: Phase 3A Remediation - Controlled Resubscription
-- File: supabase/migrations/20260907000005_billing_controlled_resubscription.sql
-- Description:
-- Updates public.apply_subscription_payment_transition to implement
-- Controlled Resubscription.
-- 
-- INVARIANT:
-- Provider subscription ID replacement is STRICTLY PROHIBITED if the internal
-- subscription is active, past_due, suspended, or subscription_pending.
-- Replacement is ONLY allowed when the internal subscription has reached an
-- explicitly terminal lifecycle state ('canceled', 'trial_expired').
-- Cross-tenant injection remains completely blocked.
-- Historical payment transactions and webhook audit rows are fully preserved.
-- ====================================================================

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

  -- 2. Validate tenant and provider subscription correlation with CONTROLLED RESUBSCRIPTION
  -- Prevent cross-tenant subscription overwrites if an existing provider ID is bound.
  -- Replacement is ONLY allowed when the subscription is in an explicitly terminal state ('canceled', 'trial_expired').
  IF v_sub.razorpay_subscription_id IS NOT NULL 
     AND p_razorpay_subscription_id IS NOT NULL 
     AND v_sub.razorpay_subscription_id <> p_razorpay_subscription_id THEN
    IF v_sub.billing_state NOT IN ('canceled', 'trial_expired') THEN
      RAISE EXCEPTION 'Billing Transition Error: Provider subscription ID mismatch (existing: %, supplied: %). Current state "%" does not permit resubscription replacement.', 
        v_sub.razorpay_subscription_id, p_razorpay_subscription_id, v_sub.billing_state;
    END IF;
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
