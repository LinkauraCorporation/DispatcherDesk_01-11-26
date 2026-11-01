-- ====================================================================
-- DispatcherDesk Migration: AI Detention Audits Table & RLS Isolation
-- Version: 1.0.23
-- File: supabase/migrations/20261101000001_load_detention_audits.sql
-- Description:
-- 1. Creates public.load_detention_audits table to store immutable,
--    traceable detention audit records with evidence grounding.
-- 2. Enforces foreign key relationships with organizations, loads,
--    load_detention_records, and auth.users.
-- 3. Implements Row-Level Security (RLS) ensuring strict employee
--    load-access isolation via public.user_has_load_access(load_id).
-- ====================================================================

CREATE TABLE IF NOT EXISTS public.load_detention_audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  load_id UUID NOT NULL,
  detention_record_id UUID REFERENCES public.load_detention_records(id) ON DELETE SET NULL,

  audit_version INT NOT NULL DEFAULT 1,
  audit_status TEXT NOT NULL CHECK (audit_status IN ('eligible', 'not_eligible', 'needs_review')),
  overall_confidence NUMERIC(3,2) NOT NULL DEFAULT 0.00 CHECK (overall_confidence >= 0.00 AND overall_confidence <= 1.00),
  requires_human_review BOOLEAN NOT NULL DEFAULT false,

  -- Pickup Audit Sub-ledger
  pickup_status TEXT NOT NULL CHECK (pickup_status IN ('eligible', 'not_eligible', 'needs_review', 'not_applicable')),
  pickup_appointment_time TIMESTAMPTZ,
  pickup_arrival_time TIMESTAMPTZ,
  pickup_departure_time TIMESTAMPTZ,
  pickup_detention_start TIMESTAMPTZ,
  pickup_detention_end TIMESTAMPTZ,
  pickup_free_time_hours NUMERIC(5,2) DEFAULT 2.00,
  pickup_billable_hours NUMERIC(6,2) DEFAULT 0.00,
  pickup_hourly_rate NUMERIC(10,2) DEFAULT 75.00,
  pickup_verified_amount NUMERIC(10,2) DEFAULT 0.00,

  -- Delivery Audit Sub-ledger
  delivery_status TEXT NOT NULL CHECK (delivery_status IN ('eligible', 'not_eligible', 'needs_review', 'not_applicable')),
  delivery_appointment_time TIMESTAMPTZ,
  delivery_arrival_time TIMESTAMPTZ,
  delivery_departure_time TIMESTAMPTZ,
  delivery_detention_start TIMESTAMPTZ,
  delivery_detention_end TIMESTAMPTZ,
  delivery_free_time_hours NUMERIC(5,2) DEFAULT 2.00,
  delivery_billable_hours NUMERIC(6,2) DEFAULT 0.00,
  delivery_hourly_rate NUMERIC(10,2) DEFAULT 75.00,
  delivery_verified_amount NUMERIC(10,2) DEFAULT 0.00,

  -- Totals
  total_verified_hours NUMERIC(6,2) NOT NULL DEFAULT 0.00,
  total_verified_amount NUMERIC(10,2) NOT NULL DEFAULT 0.00,

  -- Evidence & Discrepancy Artifacts (Structured JSONB)
  evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  discrepancies JSONB NOT NULL DEFAULT '[]'::jsonb,
  missing_evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  reasoning_summary TEXT NOT NULL DEFAULT '',

  -- Human Review & Sign-Off Workflow
  human_review_status TEXT NOT NULL DEFAULT 'pending' CHECK (human_review_status IN ('pending', 'accepted', 'overridden', 'rejected')),
  human_reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  human_reviewed_by_name TEXT,
  human_reviewed_at TIMESTAMPTZ,
  human_override_notes TEXT,

  -- Audit Metadata
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_load_detention_audits_org_id UNIQUE (organization_id, id),
  CONSTRAINT fk_load_detention_audits_load FOREIGN KEY (organization_id, load_id)
    REFERENCES public.loads(organization_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_load_detention_audits_record FOREIGN KEY (detention_record_id)
    REFERENCES public.load_detention_records(id) ON DELETE SET NULL
);

-- Performance and Query Optimization Indexes
CREATE INDEX IF NOT EXISTS idx_load_detention_audits_org_load ON public.load_detention_audits(organization_id, load_id);
CREATE INDEX IF NOT EXISTS idx_load_detention_audits_status ON public.load_detention_audits(audit_status);
CREATE INDEX IF NOT EXISTS idx_load_detention_audits_review ON public.load_detention_audits(requires_human_review)
  WHERE requires_human_review = true;
CREATE INDEX IF NOT EXISTS idx_load_detention_audits_record ON public.load_detention_audits(detention_record_id);

-- Auto-update updated_at trigger
DROP TRIGGER IF EXISTS set_load_detention_audits_updated_at ON public.load_detention_audits;
CREATE TRIGGER set_load_detention_audits_updated_at
  BEFORE UPDATE ON public.load_detention_audits
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- --------------------------------------------------------------------
-- Row Level Security (RLS) for public.load_detention_audits
-- --------------------------------------------------------------------
ALTER TABLE public.load_detention_audits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Office members can view authorized load detention audits" ON public.load_detention_audits;
CREATE POLICY "Office members can view authorized load detention audits"
  ON public.load_detention_audits FOR SELECT
  USING (
    organization_id IN (SELECT public.get_user_organizations())
    AND (
      public.get_user_org_role(organization_id) = 'owner_admin'
      OR (
        public.get_user_org_role(organization_id) IN ('dispatcher', 'staff')
        AND public.user_has_load_access(load_id)
      )
    )
  );

DROP POLICY IF EXISTS "Authorized dispatchers and admins can insert load detention audits" ON public.load_detention_audits;
CREATE POLICY "Authorized dispatchers and admins can insert load detention audits"
  ON public.load_detention_audits FOR INSERT
  WITH CHECK (
    organization_id IN (SELECT public.get_user_organizations())
    AND (
      public.get_user_org_role(organization_id) = 'owner_admin'
      OR (
        public.get_user_org_role(organization_id) IN ('dispatcher', 'staff')
        AND public.user_has_load_access(load_id)
      )
    )
  );

DROP POLICY IF EXISTS "Authorized dispatchers and admins can update load detention audits" ON public.load_detention_audits;
CREATE POLICY "Authorized dispatchers and admins can update load detention audits"
  ON public.load_detention_audits FOR UPDATE
  USING (
    organization_id IN (SELECT public.get_user_organizations())
    AND (
      public.get_user_org_role(organization_id) = 'owner_admin'
      OR (
        public.get_user_org_role(organization_id) IN ('dispatcher', 'staff')
        AND public.user_has_load_access(load_id)
      )
    )
  )
  WITH CHECK (
    organization_id IN (SELECT public.get_user_organizations())
    AND (
      public.get_user_org_role(organization_id) = 'owner_admin'
      OR (
        public.get_user_org_role(organization_id) IN ('dispatcher', 'staff')
        AND public.user_has_load_access(load_id)
      )
    )
  );

DROP POLICY IF EXISTS "Admins can delete load detention audits" ON public.load_detention_audits;
CREATE POLICY "Admins can delete load detention audits"
  ON public.load_detention_audits FOR DELETE
  USING (
    organization_id IN (SELECT public.get_user_organizations())
    AND public.get_user_org_role(organization_id) = 'owner_admin'
  );
