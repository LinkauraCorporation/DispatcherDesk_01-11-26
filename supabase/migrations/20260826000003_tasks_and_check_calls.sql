-- ====================================================================
-- DispatcherDesk — Migration: Tasks & Check Calls
-- File: supabase/migrations/20260826000003_tasks_and_check_calls.sql
-- Description: Creates dedicated multi-tenant persistence tables for 
--              operational tasks and check-call tracking with RLS.
-- ====================================================================

-- ====================================================================
-- Table: tasks (Operational Tasks, Reminders & Milestone Actions)
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  load_id UUID,
  load_number TEXT,
  category TEXT NOT NULL CHECK (category IN (
    'check_call',
    'detention_warning',
    'document_collection',
    'broker_update',
    'driver_instruction',
    'appointment_scheduling',
    'billing_prep',
    'general_operational'
  )),
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('urgent', 'high', 'normal', 'low')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'snoozed', 'cancelled')),
  
  -- Timing & Scheduling
  due_at TIMESTAMPTZ NOT NULL,
  timezone_context TEXT DEFAULT 'America/Chicago',
  reminder_offset_minutes INT DEFAULT 15,
  snoozed_until TIMESTAMPTZ,
  
  -- Assignment & Authorship
  assigned_to_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_to_name TEXT,
  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_name TEXT,
  
  -- Contextual Trigger & Deduplication
  trigger_source TEXT CHECK (trigger_source IN (
    'manual',
    'system_rule',
    'ai_extracted',
    'check_call_exception',
    'detention_clock',
    'document_alert'
  )),
  reference_entity_id TEXT,
  deduplication_key TEXT,
  
  -- Completion Metadata
  completed_at TIMESTAMPTZ,
  completed_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  completed_by_name TEXT,
  completion_notes TEXT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT uq_tasks_org_id UNIQUE (organization_id, id),
  CONSTRAINT fk_tasks_load FOREIGN KEY (organization_id, load_id) REFERENCES public.loads(organization_id, id) ON DELETE CASCADE
);

-- Tasks Indexes
CREATE INDEX IF NOT EXISTS idx_tasks_org_id ON public.tasks(organization_id);
CREATE INDEX IF NOT EXISTS idx_tasks_load_id ON public.tasks(load_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON public.tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON public.tasks(priority);
CREATE INDEX IF NOT EXISTS idx_tasks_due_at ON public.tasks(due_at);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON public.tasks(assigned_to_user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_dedup_key ON public.tasks(organization_id, deduplication_key) WHERE deduplication_key IS NOT NULL;

-- Tasks Updated At Trigger
CREATE TRIGGER set_tasks_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ====================================================================
-- Table: check_calls (Freight Check-Ins, Driver Status & Milestone ETAs)
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.check_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  load_id UUID NOT NULL,
  
  call_type TEXT NOT NULL CHECK (call_type IN (
    'dispatch',
    'en_route_pickup',
    'arrived_pickup',
    'loaded',
    'en_route_delivery',
    'arrived_delivery',
    'delivered',
    'delay',
    'breakdown',
    'other'
  )),
  status TEXT NOT NULL DEFAULT 'on_time' CHECK (status IN (
    'on_time',
    'delayed',
    'at_risk',
    'completed'
  )),
  
  location_city TEXT,
  location_state TEXT,
  latitude NUMERIC(9, 6),
  longitude NUMERIC(9, 6),
  
  eta_pickup TIMESTAMPTZ,
  eta_delivery TIMESTAMPTZ,
  notes TEXT,
  
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT uq_check_calls_org_id UNIQUE (organization_id, id),
  CONSTRAINT fk_check_calls_load FOREIGN KEY (organization_id, load_id) REFERENCES public.loads(organization_id, id) ON DELETE CASCADE
);

-- Check Calls Indexes
CREATE INDEX IF NOT EXISTS idx_check_calls_org_id ON public.check_calls(organization_id);
CREATE INDEX IF NOT EXISTS idx_check_calls_load_id ON public.check_calls(load_id);
CREATE INDEX IF NOT EXISTS idx_check_calls_created_at ON public.check_calls(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_check_calls_status ON public.check_calls(status);

-- Check Calls Updated At Trigger
CREATE TRIGGER set_check_calls_updated_at
  BEFORE UPDATE ON public.check_calls
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ====================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ====================================================================

-- 1. tasks RLS
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view tasks in their orgs"
  ON public.tasks FOR SELECT
  USING (organization_id IN (SELECT public.get_user_organizations()));

CREATE POLICY "Dispatchers and admins can insert tasks"
  ON public.tasks FOR INSERT
  WITH CHECK (
    organization_id IN (SELECT public.get_user_organizations())
    AND public.has_operational_write_access(organization_id)
  );

CREATE POLICY "Dispatchers and admins can update tasks"
  ON public.tasks FOR UPDATE
  USING (
    organization_id IN (SELECT public.get_user_organizations())
    AND public.has_operational_write_access(organization_id)
  )
  WITH CHECK (
    organization_id IN (SELECT public.get_user_organizations())
    AND public.has_operational_write_access(organization_id)
  );

CREATE POLICY "Dispatchers and admins can delete tasks"
  ON public.tasks FOR DELETE
  USING (
    organization_id IN (SELECT public.get_user_organizations())
    AND public.has_operational_write_access(organization_id)
  );

-- 2. check_calls RLS
ALTER TABLE public.check_calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view check calls in their orgs"
  ON public.check_calls FOR SELECT
  USING (organization_id IN (SELECT public.get_user_organizations()));

CREATE POLICY "Dispatchers and admins can insert check calls"
  ON public.check_calls FOR INSERT
  WITH CHECK (
    organization_id IN (SELECT public.get_user_organizations())
    AND public.has_operational_write_access(organization_id)
  );

CREATE POLICY "Dispatchers and admins can update check calls"
  ON public.check_calls FOR UPDATE
  USING (
    organization_id IN (SELECT public.get_user_organizations())
    AND public.has_operational_write_access(organization_id)
  )
  WITH CHECK (
    organization_id IN (SELECT public.get_user_organizations())
    AND public.has_operational_write_access(organization_id)
  );

CREATE POLICY "Dispatchers and admins can delete check calls"
  ON public.check_calls FOR DELETE
  USING (
    organization_id IN (SELECT public.get_user_organizations())
    AND public.has_operational_write_access(organization_id)
  );
