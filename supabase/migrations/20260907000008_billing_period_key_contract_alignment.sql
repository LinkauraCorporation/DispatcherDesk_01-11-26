-- ==============================================================================
-- Migration: 20260907000008_billing_period_key_contract_alignment.sql
-- Description: Unifies billing_period_key derivation across trigger and RPC functions:
--   - billing_state IN ('trialing', 'trial_expired') => 'trial'
--   - Any other billing_state with valid current_period_start AND current_period_end
--     => YYYYMMDD_YYYYMMDD
--   - Otherwise => 'trial'
-- Ensures canceled, past_due, and suspended subscriptions retain their paid
-- period ledger identity without reverting to 'trial'.
-- ==============================================================================

-- 1. Update public.enforce_truck_billing_entitlement()
CREATE OR REPLACE FUNCTION public.enforce_truck_billing_entitlement()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_sub_state TEXT;
  v_period_start TIMESTAMPTZ;
  v_period_end TIMESTAMPTZ;
  v_billing_period_key TEXT := 'trial';
  v_sub RECORD;
  v_capacity INTEGER := 3;
  v_current_usage INTEGER := 0;
BEGIN
  -- A. Qualifying Mutation Gate:
  -- Only evaluate when truck_id is assigned and pipeline_status is in qualifying operational states:
  -- 'booked', 'in_transit', 'delivered', 'invoiced', 'paid'
  IF NEW.truck_id IS NULL OR NEW.pipeline_status NOT IN ('booked', 'in_transit', 'delivered', 'invoiced', 'paid') THEN
    RETURN NEW;
  END IF;

  -- B. Determine target billing period key
  SELECT 
    s.billing_state,
    s.current_period_start,
    s.current_period_end
  INTO 
    v_sub_state,
    v_period_start,
    v_period_end
  FROM public.subscriptions s
  WHERE s.organization_id = NEW.organization_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Billing Entitlement Error: No subscription found for organization %.', NEW.organization_id;
  END IF;

  -- Authoritative Invariant:
  -- billing_state IN ('trialing', 'trial_expired') => 'trial'
  -- Any other billing_state + valid period_start & period_end => YYYYMMDD_YYYYMMDD
  -- Otherwise => 'trial'
  IF v_sub_state NOT IN ('trialing', 'trial_expired') AND v_period_start IS NOT NULL AND v_period_end IS NOT NULL THEN
    v_billing_period_key := TO_CHAR(v_period_start AT TIME ZONE 'UTC', 'YYYYMMDD') 
      || '_' 
      || TO_CHAR(v_period_end AT TIME ZONE 'UTC', 'YYYYMMDD');
  ELSE
    v_billing_period_key := 'trial';
  END IF;

  -- C. FAST PATH: Check if this exact truck already consumes an AMT slot in this billing period
  -- If (organization_id, billing_period_key, truck_id) already exists in truck_activation_history,
  -- this mutation does NOT consume a new AMT slot. Allow immediately without locking subscriptions.
  IF EXISTS (
    SELECT 1
    FROM public.truck_activation_history
    WHERE organization_id = NEW.organization_id
      AND billing_period_key = v_billing_period_key
      AND truck_id = NEW.truck_id
  ) THEN
    RETURN NEW;
  END IF;

  -- D. SLOW PATH: New AMT Activation.
  -- Acquire exclusive row lock on this organization's subscription to serialize concurrent activations
  -- and prevent races on the final remaining capacity slot.
  SELECT 
    s.id,
    s.plan,
    s.billing_state,
    s.trial_starts_at,
    s.trial_ends_at,
    s.current_period_start,
    s.current_period_end,
    s.custom_amt_capacity
  INTO v_sub
  FROM public.subscriptions s
  WHERE s.organization_id = NEW.organization_id
  FOR UPDATE;

  -- Re-derive billing period key after acquiring the subscription lock
  IF v_sub.billing_state NOT IN ('trialing', 'trial_expired') AND v_sub.current_period_start IS NOT NULL AND v_sub.current_period_end IS NOT NULL THEN
    v_billing_period_key := TO_CHAR(v_sub.current_period_start AT TIME ZONE 'UTC', 'YYYYMMDD') 
      || '_' 
      || TO_CHAR(v_sub.current_period_end AT TIME ZONE 'UTC', 'YYYYMMDD');
  ELSE
    v_billing_period_key := 'trial';
  END IF;

  -- Re-check if this truck was activated by a concurrent transaction that committed while we waited for the lock
  IF EXISTS (
    SELECT 1
    FROM public.truck_activation_history
    WHERE organization_id = NEW.organization_id
      AND billing_period_key = v_billing_period_key
      AND truck_id = NEW.truck_id
  ) THEN
    RETURN NEW;
  END IF;

  -- E. Validate Subscription Entitlement State:
  -- Only 'trialing' and 'active' states permit new truck activations.
  -- Non-active states (trial_expired, subscription_pending, past_due, suspended, canceled) MUST NOT create activations.
  IF v_sub.billing_state = 'trialing' THEN
    -- Check trial expiration
    IF NOW() > v_sub.trial_ends_at THEN
      RAISE EXCEPTION 'Billing Entitlement Error: 14-day trial expired on % for organization %. Upgrade to a paid plan to activate additional trucks.',
        v_sub.trial_ends_at, NEW.organization_id;
    END IF;
    v_capacity := 3;
  ELSIF v_sub.billing_state = 'active' THEN
    v_capacity := public.get_plan_amt_capacity(v_sub.plan, v_sub.custom_amt_capacity);
  ELSIF v_sub.billing_state = 'trial_expired' THEN
    RAISE EXCEPTION 'Billing Entitlement Error: Trial has expired for organization %. A paid subscription is required to activate trucks.',
      NEW.organization_id;
  ELSIF v_sub.billing_state IN ('past_due', 'suspended', 'canceled', 'subscription_pending') THEN
    RAISE EXCEPTION 'Billing Entitlement Error: Subscription state "%" does not permit new truck activations. Active subscription required.',
      v_sub.billing_state;
  ELSE
    RAISE EXCEPTION 'Billing Entitlement Error: Unrecognized subscription state "%".', v_sub.billing_state;
  END IF;

  -- F. Calculate Current Period AMT Usage from Authoritative Ledger
  SELECT COUNT(DISTINCT truck_id)
  INTO v_current_usage
  FROM public.truck_activation_history
  WHERE organization_id = NEW.organization_id
    AND billing_period_key = v_billing_period_key;

  -- G. Enforce Hard Capacity Ceiling
  IF v_current_usage >= v_capacity THEN
    RAISE EXCEPTION 'Billing Entitlement Error: Active Managed Truck (AMT) capacity exhausted for plan "%" (%/% trucks activated in period "%"). Upgrade subscription to add more trucks.',
      CASE WHEN v_sub.billing_state = 'trialing' THEN 'trial' ELSE v_sub.plan END,
      v_current_usage,
      v_capacity,
      v_billing_period_key;
  END IF;

  -- H. Entitlement Passed: Record Activation in Authoritative Immutable Ledger
  INSERT INTO public.truck_activation_history (
    organization_id,
    billing_period_key,
    truck_id,
    first_load_id,
    activated_at
  ) VALUES (
    NEW.organization_id,
    v_billing_period_key,
    NEW.truck_id,
    NEW.id,
    NOW()
  );

  RETURN NEW;
END;
$$;


-- 2. Update public.get_organization_subscription_usage()
CREATE OR REPLACE FUNCTION public.get_organization_subscription_usage(
  p_organization_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id UUID;
  v_is_member BOOLEAN;
  v_sub RECORD;
  v_billing_period_key TEXT := 'trial';
  v_amt_capacity INTEGER := 3;
  v_amt_usage INTEGER := 0;
  v_remaining_slots INTEGER := 0;
  v_is_trial BOOLEAN := FALSE;
  v_is_trial_expired BOOLEAN := FALSE;
BEGIN
  -- 1. Authentication check
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  -- 2. Tenant isolation authorization: Caller must be a member of the requested organization
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members
    WHERE organization_id = p_organization_id
      AND user_id = v_caller_id
  ) INTO v_is_member;

  IF NOT v_is_member THEN
    RAISE EXCEPTION 'Unauthorized: User does not have access to organization %.', p_organization_id;
  END IF;

  -- 3. Retrieve organization subscription
  SELECT 
    s.id,
    s.organization_id,
    s.plan,
    s.billing_state,
    s.trial_starts_at,
    s.trial_ends_at,
    s.current_period_start,
    s.current_period_end,
    s.custom_amt_capacity
  INTO v_sub
  FROM public.subscriptions s
  WHERE s.organization_id = p_organization_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Subscription record not found for organization %.', p_organization_id;
  END IF;

  v_is_trial := (v_sub.billing_state = 'trialing');
  v_is_trial_expired := (v_sub.billing_state = 'trial_expired') OR (v_sub.billing_state = 'trialing' AND NOW() > v_sub.trial_ends_at);

  -- 4. Derive billing period key & capacity according to the unified invariant:
  -- - billing_state IN ('trialing', 'trial_expired') => 'trial'
  -- - Any other billing_state + valid current_period_start & current_period_end => YYYYMMDD_YYYYMMDD
  -- - Otherwise => 'trial'
  IF v_sub.billing_state NOT IN ('trialing', 'trial_expired') 
     AND v_sub.current_period_start IS NOT NULL 
     AND v_sub.current_period_end IS NOT NULL THEN
    v_billing_period_key := TO_CHAR(v_sub.current_period_start AT TIME ZONE 'UTC', 'YYYYMMDD') 
      || '_' 
      || TO_CHAR(v_sub.current_period_end AT TIME ZONE 'UTC', 'YYYYMMDD');
    v_amt_capacity := public.get_plan_amt_capacity(v_sub.plan, v_sub.custom_amt_capacity);
  ELSE
    v_billing_period_key := 'trial';
    IF v_sub.billing_state = 'trialing' THEN
      v_amt_capacity := 3;
    ELSE
      v_amt_capacity := public.get_plan_amt_capacity(v_sub.plan, v_sub.custom_amt_capacity);
    END IF;
  END IF;

  -- 5. Calculate current period AMT usage from authoritative ledger
  SELECT COUNT(DISTINCT truck_id)
  INTO v_amt_usage
  FROM public.truck_activation_history
  WHERE organization_id = p_organization_id
    AND billing_period_key = v_billing_period_key;

  v_remaining_slots := GREATEST(0, v_amt_capacity - v_amt_usage);

  -- 6. Return structured telemetry object
  RETURN jsonb_build_object(
    'organization_id', p_organization_id,
    'plan', v_sub.plan,
    'billing_state', v_sub.billing_state,
    'billing_period_key', v_billing_period_key,
    'current_period_start', v_sub.current_period_start,
    'current_period_end', v_sub.current_period_end,
    'trial_starts_at', v_sub.trial_starts_at,
    'trial_ends_at', v_sub.trial_ends_at,
    'is_trial', v_is_trial,
    'is_trial_expired', v_is_trial_expired,
    'amt_usage', v_amt_usage,
    'amt_capacity', v_amt_capacity,
    'remaining_amt_slots', v_remaining_slots
  );
END;
$$;

-- Grant permissions explicitly
REVOKE ALL ON FUNCTION public.enforce_truck_billing_entitlement() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_organization_subscription_usage(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_organization_subscription_usage(UUID) TO authenticated;
