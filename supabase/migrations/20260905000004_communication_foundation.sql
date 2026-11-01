-- ====================================================================
-- DispatcherDesk Migration: Communication Foundation
-- Migration Object 3A (Approved Forensic Contract)
-- Version: 1.0.20
-- File: supabase/migrations/20260905000004_communication_foundation.sql
-- Description:
-- 1. Creates public.conversations table with approved contract fields,
--    system defaults, and domain integrity rules.
-- 2. Enforces tenant-safe composite FK on (organization_id, driver_id)
--    referencing public.drivers(organization_id, id) ON DELETE RESTRICT.
-- 3. Enforces load FK on load_id referencing public.loads(id) ON DELETE SET NULL.
-- 4. Enforces business integrity CHECK constraint:
--    - type = 'general' -> load_id IS NULL
--    - type = 'load' -> load_id IS NOT NULL
-- 5. Creates partial unique index enforcing one active general conversation
--    per driver per organization:
--    (organization_id, driver_id) WHERE type = 'general' AND status = 'active' AND deleted_at IS NULL.
-- 6. Enforces tenant-safe immutability of organization_id via established
--    prevent_organization_id_change() trigger.
-- 7. Reuses established handle_updated_at() trigger function for updated_at maintenance.
-- 8. Enables Row Level Security (RLS) on public.conversations and applies
--    established tenant and office role policies.
-- ====================================================================

-- --------------------------------------------------------------------
-- 1. Create public.conversations table
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('load', 'general')),
  load_id UUID NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'resolved', 'escalated')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ NULL,
  deleted_at TIMESTAMPTZ NULL,

  -- Tenant-safe composite FK to drivers (ON DELETE RESTRICT)
  CONSTRAINT fk_conversations_driver
    FOREIGN KEY (organization_id, driver_id)
    REFERENCES public.drivers(organization_id, id)
    ON DELETE RESTRICT,

  -- Load FK with ON DELETE SET NULL
  CONSTRAINT fk_conversations_load
    FOREIGN KEY (load_id)
    REFERENCES public.loads(id)
    ON DELETE SET NULL,

  -- Business Integrity CHECK constraint:
  -- type = 'general' -> load_id IS NULL
  -- type = 'load' -> load_id IS NOT NULL
  CONSTRAINT chk_conversations_type_load_consistency CHECK (
    (type = 'general' AND load_id IS NULL) OR
    (type = 'load' AND load_id IS NOT NULL)
  )
);

-- --------------------------------------------------------------------
-- 2. Indexes
-- --------------------------------------------------------------------
-- Partial unique index: exactly one active general conversation per driver per organization
CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_active_general_driver
  ON public.conversations (organization_id, driver_id)
  WHERE type = 'general' AND status = 'active' AND deleted_at IS NULL;

-- Standard query performance indexes
CREATE INDEX IF NOT EXISTS idx_conversations_org_id ON public.conversations(organization_id);
CREATE INDEX IF NOT EXISTS idx_conversations_driver_id ON public.conversations(driver_id);
CREATE INDEX IF NOT EXISTS idx_conversations_load_id ON public.conversations(load_id) WHERE load_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_conversations_status ON public.conversations(status);
CREATE INDEX IF NOT EXISTS idx_conversations_type ON public.conversations(type);

-- --------------------------------------------------------------------
-- 3. Triggers
-- --------------------------------------------------------------------
-- Established updated_at pattern
DROP TRIGGER IF EXISTS set_conversations_updated_at ON public.conversations;
CREATE TRIGGER set_conversations_updated_at
  BEFORE UPDATE ON public.conversations
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Established tenant isolation pattern: immutable organization_id
DROP TRIGGER IF EXISTS trg_protect_conversation_org_id ON public.conversations;
CREATE TRIGGER trg_protect_conversation_org_id
  BEFORE UPDATE ON public.conversations
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_organization_id_change();

-- --------------------------------------------------------------------
-- 4. Row Level Security (RLS)
-- Secure by default: RLS enabled. Policies derived strictly from
-- established tenant and role architecture without guessing future driver identity behavior.
-- --------------------------------------------------------------------
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

-- SELECT: Office members can view conversations in their organizations
DROP POLICY IF EXISTS "Members can view conversations in their orgs" ON public.conversations;
CREATE POLICY "Members can view conversations in their orgs"
  ON public.conversations FOR SELECT
  USING (
    organization_id IN (SELECT public.get_user_organizations())
    AND public.get_user_org_role(organization_id) IN ('owner_admin', 'dispatcher', 'staff')
  );

-- INSERT: Operational write access (dispatcher, owner_admin) can create conversations
DROP POLICY IF EXISTS "Dispatchers and admins can insert conversations" ON public.conversations;
CREATE POLICY "Dispatchers and admins can insert conversations"
  ON public.conversations FOR INSERT
  WITH CHECK (
    organization_id IN (SELECT public.get_user_organizations())
    AND public.has_operational_write_access(organization_id)
  );

-- UPDATE: Operational write access (dispatcher, owner_admin) can update conversations
DROP POLICY IF EXISTS "Dispatchers and admins can update conversations" ON public.conversations;
CREATE POLICY "Dispatchers and admins can update conversations"
  ON public.conversations FOR UPDATE
  USING (
    organization_id IN (SELECT public.get_user_organizations())
    AND public.has_operational_write_access(organization_id)
  )
  WITH CHECK (
    organization_id IN (SELECT public.get_user_organizations())
    AND public.has_operational_write_access(organization_id)
  );

-- DELETE: Owner admins can delete conversations
DROP POLICY IF EXISTS "Owner admins can delete conversations" ON public.conversations;
CREATE POLICY "Owner admins can delete conversations"
  ON public.conversations FOR DELETE
  USING (
    organization_id IN (SELECT public.get_user_organizations())
    AND public.is_org_owner_admin(organization_id)
  );
