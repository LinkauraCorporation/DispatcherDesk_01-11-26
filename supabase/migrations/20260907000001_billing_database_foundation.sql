-- ====================================================================
-- DispatcherDesk Migration: Billing Database Foundation (Phase 1)
-- Version: 1.0.27
-- File: supabase/migrations/20260907000001_billing_database_foundation.sql
-- Description:
-- 1. Table public.subscriptions (1:1 with public.organizations)
-- 2. Table public.truck_activation_history (authoritative immutable AMT ledger)
-- 3. Composite tenant-safe FKs and unique constraints
-- 4. Immutable organization_id triggers
-- 5. Row-level security (RLS) policies and explicit permission grants
-- 6. Engine-level immutability enforcement on truck_activation_history
-- 7. Operational load assignment activation trigger
-- 8. New organization subscription creation trigger
-- 9. Deterministic idempotent backfill for existing organizations and AMT history
-- ====================================================================

-- ====================================================================
-- 1. Table: public.subscriptions
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  plan TEXT NOT NULL DEFAULT 'starter_fleet' CHECK (plan IN ('starter_fleet', 'growth_agency', 'enterprise', 'trial')),
  billing_state TEXT NOT NULL DEFAULT 'trialing' CHECK (billing_state IN ('trialing', 'active', 'past_due', 'canceled', 'trial_expired')),
  trial_starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  trial_ends_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '14 days'),
  current_period_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  current_period_end TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '14 days'),
  razorpay_customer_id TEXT,
  razorpay_subscription_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_subscriptions_org_id UNIQUE (organization_id),
  CONSTRAINT chk_subscriptions_trial_period CHECK (trial_ends_at >= trial_starts_at),
  CONSTRAINT chk_subscriptions_current_period CHECK (current_period_end >= current_period_start)
);

-- Performance and lookup indexes for subscriptions
CREATE INDEX IF NOT EXISTS idx_subscriptions_org_id ON public.subscriptions(organization_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_state ON public.subscriptions(billing_state);

-- Updated_at trigger for subscriptions
CREATE TRIGGER set_subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Immutable organization_id trigger for subscriptions
DROP TRIGGER IF EXISTS trg_protect_subscription_org_id ON public.subscriptions;
CREATE TRIGGER trg_protect_subscription_org_id
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_organization_id_change();


-- ====================================================================
-- 2. Table: public.truck_activation_history
-- Authoritative, immutable Active Managed Truck (AMT) historical ledger.
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.truck_activation_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  truck_id UUID NOT NULL,
  first_qualifying_load_id UUID NOT NULL,
  activated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  billing_period_key TEXT NOT NULL DEFAULT 'trial',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_truck_activation_org_truck UNIQUE (organization_id, truck_id),
  CONSTRAINT fk_truck_activation_org FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE,
  CONSTRAINT fk_truck_activation_truck FOREIGN KEY (organization_id, truck_id) REFERENCES public.trucks(organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT fk_truck_activation_load FOREIGN KEY (organization_id, first_qualifying_load_id) REFERENCES public.loads(organization_id, id) ON DELETE RESTRICT
);

-- Indexes for fast lookup and reporting
CREATE INDEX IF NOT EXISTS idx_truck_activation_org_id ON public.truck_activation_history(organization_id);
CREATE INDEX IF NOT EXISTS idx_truck_activation_truck_id ON public.truck_activation_history(truck_id);
CREATE INDEX IF NOT EXISTS idx_truck_activation_load_id ON public.truck_activation_history(first_qualifying_load_id);
CREATE INDEX IF NOT EXISTS idx_truck_activation_org_period ON public.truck_activation_history(organization_id, billing_period_key);

-- Immutable organization_id trigger for truck_activation_history
DROP TRIGGER IF EXISTS trg_protect_truck_activation_org_id ON public.truck_activation_history;
CREATE TRIGGER trg_protect_truck_activation_org_id
  BEFORE UPDATE ON public.truck_activation_history
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_organization_id_change();

-- Engine-level ledger immutability enforcement: Prevent any UPDATE or DELETE
CREATE OR REPLACE FUNCTION public.prevent_truck_activation_ledger_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'Security Violation: truck_activation_history is an authoritative immutable ledger. Updates and deletions are strictly forbidden.';
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_truck_activation_immutable ON public.truck_activation_history;
CREATE TRIGGER trg_protect_truck_activation_immutable
  BEFORE UPDATE OR DELETE ON public.truck_activation_history
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_truck_activation_ledger_mutation();


-- ====================================================================
-- 3. Row-Level Security (RLS) & Table Grants
-- ====================================================================

-- 3A. Subscriptions RLS & Grants
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.subscriptions FROM anon, public;
GRANT SELECT ON public.subscriptions TO authenticated;
GRANT INSERT, UPDATE ON public.subscriptions TO authenticated;
REVOKE DELETE ON public.subscriptions FROM authenticated;

DROP POLICY IF EXISTS "Members can view their organization subscription" ON public.subscriptions;
CREATE POLICY "Members can view their organization subscription"
  ON public.subscriptions FOR SELECT
  TO authenticated
  USING (organization_id IN (SELECT public.get_user_organizations()));

DROP POLICY IF EXISTS "Owner admins can insert organization subscription" ON public.subscriptions;
CREATE POLICY "Owner admins can insert organization subscription"
  ON public.subscriptions FOR INSERT
  TO authenticated
  WITH CHECK (
    organization_id IN (SELECT public.get_user_organizations())
    AND public.is_org_owner_admin(organization_id)
  );

DROP POLICY IF EXISTS "Owner admins can update organization subscription" ON public.subscriptions;
CREATE POLICY "Owner admins can update organization subscription"
  ON public.subscriptions FOR UPDATE
  TO authenticated
  USING (
    organization_id IN (SELECT public.get_user_organizations())
    AND public.is_org_owner_admin(organization_id)
  )
  WITH CHECK (
    organization_id IN (SELECT public.get_user_organizations())
    AND public.is_org_owner_admin(organization_id)
  );

-- 3B. Truck Activation History RLS & Grants
ALTER TABLE public.truck_activation_history ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.truck_activation_history FROM anon, public;
GRANT SELECT ON public.truck_activation_history TO authenticated;
-- Authenticated users CANNOT directly insert, update, or delete activation records
REVOKE INSERT, UPDATE, DELETE ON public.truck_activation_history FROM authenticated;

DROP POLICY IF EXISTS "Members can view their organization truck activation history" ON public.truck_activation_history;
CREATE POLICY "Members can view their organization truck activation history"
  ON public.truck_activation_history FOR SELECT
  TO authenticated
  USING (organization_id IN (SELECT public.get_user_organizations()));


-- ====================================================================
-- 4. Authoritative Truck Activation Recording Trigger
-- Fires when a load is created or updated with a truck in a qualifying operational state.
-- Qualifying states: 'booked', 'in_transit', 'delivered', 'invoiced', 'paid'.
-- ====================================================================
CREATE OR REPLACE FUNCTION public.record_truck_operational_activation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_billing_period_key TEXT := 'trial';
BEGIN
  -- Only evaluate when truck_id is assigned and pipeline_status is in qualifying states
  IF NEW.truck_id IS NOT NULL AND NEW.pipeline_status IN ('booked', 'in_transit', 'delivered', 'invoiced', 'paid') THEN
    -- Check if already activated in historical ledger for this organization
    IF NOT EXISTS (
      SELECT 1
      FROM public.truck_activation_history
      WHERE organization_id = NEW.organization_id
        AND truck_id = NEW.truck_id
    ) THEN
      -- Determine billing period key from organization subscription
      SELECT 
        CASE 
          WHEN s.billing_state = 'trialing' THEN 'trial'
          WHEN s.current_period_start IS NOT NULL 
            THEN TO_CHAR(s.current_period_start, 'YYYY-MM')
          ELSE 'trial'
        END INTO v_billing_period_key
      FROM public.subscriptions s
      WHERE s.organization_id = NEW.organization_id;

      IF v_billing_period_key IS NULL THEN
        v_billing_period_key := 'trial';
      END IF;

      -- Insert authoritative first activation record
      INSERT INTO public.truck_activation_history (
        organization_id,
        truck_id,
        first_qualifying_load_id,
        activated_at,
        billing_period_key,
        created_at
      ) VALUES (
        NEW.organization_id,
        NEW.truck_id,
        NEW.id,
        NOW(),
        v_billing_period_key,
        NOW()
      )
      ON CONFLICT (organization_id, truck_id) DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_record_truck_activation ON public.loads;
CREATE TRIGGER trg_record_truck_activation
  AFTER INSERT OR UPDATE OF truck_id, pipeline_status ON public.loads
  FOR EACH ROW
  EXECUTE FUNCTION public.record_truck_operational_activation();

REVOKE ALL ON FUNCTION public.record_truck_operational_activation() FROM PUBLIC, anon, authenticated;


-- ====================================================================
-- 5. New Organization Auto-Subscription Initialization Trigger
-- ====================================================================
CREATE OR REPLACE FUNCTION public.handle_new_organization_subscription()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.subscriptions (
    organization_id,
    plan,
    billing_state,
    trial_starts_at,
    trial_ends_at,
    current_period_start,
    current_period_end,
    created_at,
    updated_at
  ) VALUES (
    NEW.id,
    'starter_fleet',
    'trialing',
    NOW(),
    NOW() + INTERVAL '14 days',
    NOW(),
    NOW() + INTERVAL '14 days',
    NOW(),
    NOW()
  )
  ON CONFLICT (organization_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_new_org_create_subscription ON public.organizations;
CREATE TRIGGER trg_new_org_create_subscription
  AFTER INSERT ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_organization_subscription();

REVOKE ALL ON FUNCTION public.handle_new_organization_subscription() FROM PUBLIC, anon, authenticated;


-- ====================================================================
-- 6. Deterministic Idempotent Data Backfill
-- ====================================================================

-- 6A. Subscriptions Backfill for Existing Organizations
INSERT INTO public.subscriptions (
  organization_id,
  plan,
  billing_state,
  trial_starts_at,
  trial_ends_at,
  current_period_start,
  current_period_end,
  created_at,
  updated_at
)
SELECT
  o.id AS organization_id,
  'starter_fleet' AS plan,
  CASE 
    WHEN (COALESCE(o.created_at, NOW()) + INTERVAL '14 days') < NOW() THEN 'trial_expired'
    ELSE 'trialing'
  END AS billing_state,
  COALESCE(o.created_at, NOW()) AS trial_starts_at,
  COALESCE(o.created_at, NOW()) + INTERVAL '14 days' AS trial_ends_at,
  COALESCE(o.created_at, NOW()) AS current_period_start,
  COALESCE(o.created_at, NOW()) + INTERVAL '14 days' AS current_period_end,
  COALESCE(o.created_at, NOW()) AS created_at,
  NOW() AS updated_at
FROM public.organizations o
WHERE NOT EXISTS (
  SELECT 1 FROM public.subscriptions s WHERE s.organization_id = o.id
)
ON CONFLICT (organization_id) DO NOTHING;

-- 6B. AMT History Backfill from Qualifying Load History
-- Selects the earliest qualifying load for each (organization_id, truck_id)
INSERT INTO public.truck_activation_history (
  organization_id,
  truck_id,
  first_qualifying_load_id,
  activated_at,
  billing_period_key,
  created_at
)
SELECT DISTINCT ON (l.organization_id, l.truck_id)
  l.organization_id,
  l.truck_id,
  l.id AS first_qualifying_load_id,
  COALESCE(l.pickup_datetime, l.created_at, NOW()) AS activated_at,
  'trial' AS billing_period_key,
  COALESCE(l.created_at, NOW()) AS created_at
FROM public.loads l
JOIN public.trucks t 
  ON t.id = l.truck_id AND t.organization_id = l.organization_id
WHERE l.truck_id IS NOT NULL
  AND l.pipeline_status IN ('booked', 'in_transit', 'delivered', 'invoiced', 'paid')
ORDER BY l.organization_id, l.truck_id, l.created_at ASC, l.id ASC
ON CONFLICT (organization_id, truck_id) DO NOTHING;
