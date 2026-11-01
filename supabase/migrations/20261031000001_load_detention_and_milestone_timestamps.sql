-- ====================================================================
-- DispatcherDesk Migration: Load Detention Records & Stop Milestone Timestamps
-- Version: 1.0.22
-- File: supabase/migrations/20261031000001_load_detention_and_milestone_timestamps.sql
-- Description:
-- 1. Adds dedicated stop milestone timestamps to public.loads:
--    Pickup:
--      - pickup_arrival_time
--      - pickup_loading_start_time
--      - pickup_loading_complete_time
--      - pickup_departure_time
--    Delivery:
--      - delivery_arrival_time
--      - delivery_unloading_start_time
--      - delivery_unloading_complete_time
--      - delivery_departure_time
-- 2. Adds actual event timestamp 'event_at' to public.check_calls
--    (preserves 'created_at' as system record insertion time)
-- 3. Creates multi-tenant, RLS-protected table public.load_detention_records
--    with foreign keys, indexes, updated_at trigger, and employee load-access isolation
-- ====================================================================

-- --------------------------------------------------------------------
-- 1. Stop Milestone Timestamps on public.loads
-- --------------------------------------------------------------------
ALTER TABLE public.loads
  ADD COLUMN IF NOT EXISTS pickup_arrival_time TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pickup_loading_start_time TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pickup_loading_complete_time TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pickup_departure_time TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivery_arrival_time TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivery_unloading_start_time TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivery_unloading_complete_time TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivery_departure_time TIMESTAMPTZ;

COMMENT ON COLUMN public.loads.pickup_arrival_time IS 'Actual gate check-in / arrival timestamp at pickup facility';
COMMENT ON COLUMN public.loads.pickup_loading_start_time IS 'Timestamp when dock workers began loading freight';
COMMENT ON COLUMN public.loads.pickup_loading_complete_time IS 'Timestamp when loading was completed and signed bills obtained';
COMMENT ON COLUMN public.loads.pickup_departure_time IS 'Actual out-gate / departure timestamp from pickup facility';

COMMENT ON COLUMN public.loads.delivery_arrival_time IS 'Actual gate check-in / arrival timestamp at delivery facility';
COMMENT ON COLUMN public.loads.delivery_unloading_start_time IS 'Timestamp when dock workers began unloading freight';
COMMENT ON COLUMN public.loads.delivery_unloading_complete_time IS 'Timestamp when unloading was completed and signed POD obtained';
COMMENT ON COLUMN public.loads.delivery_departure_time IS 'Actual out-gate / departure timestamp from delivery facility';

-- --------------------------------------------------------------------
-- 2. Actual Event Timestamp on public.check_calls
-- --------------------------------------------------------------------
ALTER TABLE public.check_calls
  ADD COLUMN IF NOT EXISTS event_at TIMESTAMPTZ DEFAULT NOW();

-- Backfill event_at from created_at for historical fidelity
UPDATE public.check_calls
  SET event_at = created_at
  WHERE event_at IS NULL;

COMMENT ON COLUMN public.check_calls.event_at IS 'Timestamp when the check-call event actually occurred in the field';

CREATE INDEX IF NOT EXISTS idx_check_calls_event_at ON public.check_calls(event_at DESC);

-- --------------------------------------------------------------------
-- 3. Dedicated Table: public.load_detention_records
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.load_detention_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  load_id UUID NOT NULL,

  facility_type TEXT NOT NULL CHECK (facility_type IN ('pickup', 'delivery', 'intermediate_stop')),
  facility_name TEXT,
  facility_address TEXT,
  facility_timezone TEXT NOT NULL DEFAULT 'America/Chicago',

  appointment_time TIMESTAMPTZ,
  arrival_time TIMESTAMPTZ NOT NULL,
  loading_start_time TIMESTAMPTZ,
  loading_complete_time TIMESTAMPTZ,
  unloading_start_time TIMESTAMPTZ,
  unloading_complete_time TIMESTAMPTZ,
  departure_time TIMESTAMPTZ,

  free_time_hours NUMERIC(5,2) NOT NULL DEFAULT 2.00,
  hourly_rate NUMERIC(10,2) NOT NULL DEFAULT 75.00,
  detention_start_time TIMESTAMPTZ,
  billable_hours NUMERIC(6,2) NOT NULL DEFAULT 0.00,
  detention_amount NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  is_active_detention BOOLEAN NOT NULL DEFAULT false,

  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft',
    'submitted_to_broker',
    'approved_on_rate_con',
    'rejected',
    'invoiced'
  )),

  check_call_id UUID REFERENCES public.check_calls(id) ON DELETE SET NULL,
  notes TEXT,

  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_load_detention_records_org_id UNIQUE (organization_id, id),
  CONSTRAINT fk_load_detention_records_load FOREIGN KEY (organization_id, load_id)
    REFERENCES public.loads(organization_id, id) ON DELETE CASCADE
);

-- Indexes for performance and multi-tenant scoping
CREATE INDEX IF NOT EXISTS idx_load_detention_records_org_id ON public.load_detention_records(organization_id);
CREATE INDEX IF NOT EXISTS idx_load_detention_records_load_id ON public.load_detention_records(load_id);
CREATE INDEX IF NOT EXISTS idx_load_detention_records_status ON public.load_detention_records(status);
CREATE INDEX IF NOT EXISTS idx_load_detention_records_arrival ON public.load_detention_records(arrival_time DESC);
CREATE INDEX IF NOT EXISTS idx_load_detention_records_active ON public.load_detention_records(is_active_detention)
  WHERE is_active_detention = true;

-- Auto-update updated_at trigger
DROP TRIGGER IF EXISTS set_load_detention_records_updated_at ON public.load_detention_records;
CREATE TRIGGER set_load_detention_records_updated_at
  BEFORE UPDATE ON public.load_detention_records
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- --------------------------------------------------------------------
-- 4. Row Level Security (RLS) for public.load_detention_records
-- --------------------------------------------------------------------
ALTER TABLE public.load_detention_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Office members can view authorized load detention records" ON public.load_detention_records;
CREATE POLICY "Office members can view authorized load detention records"
  ON public.load_detention_records FOR SELECT
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

DROP POLICY IF EXISTS "Authorized dispatchers and admins can insert load detention records" ON public.load_detention_records;
CREATE POLICY "Authorized dispatchers and admins can insert load detention records"
  ON public.load_detention_records FOR INSERT
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

DROP POLICY IF EXISTS "Authorized dispatchers and admins can update load detention records" ON public.load_detention_records;
CREATE POLICY "Authorized dispatchers and admins can update load detention records"
  ON public.load_detention_records FOR UPDATE
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

DROP POLICY IF EXISTS "Admins can delete load detention records" ON public.load_detention_records;
CREATE POLICY "Admins can delete load detention records"
  ON public.load_detention_records FOR DELETE
  USING (
    organization_id IN (SELECT public.get_user_organizations())
    AND public.get_user_org_role(organization_id) = 'owner_admin'
  );
