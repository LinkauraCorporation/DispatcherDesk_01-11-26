-- ====================================================================
-- Migration Object 3B: Communication Messages Foundation
-- File: supabase/migrations/20260905000005_communication_messages_foundation.sql
-- Description:
-- 1. Creates public.conversation_messages table with:
--    - Primary key, organization_id, conversation_id (ON DELETE RESTRICT),
--      and sender_id (REFERENCES auth.users(id) ON DELETE RESTRICT).
--    - Strict message_type and channel CHECK constraints.
--    - Independent read_at, acknowledged_at, attachment_id, context, and deleted_at fields.
--    - Idempotency via UNIQUE (organization_id, client_message_id).
-- 2. Enforces database-level tenant integrity:
--    - conversation_messages.organization_id = conversations.organization_id via
--      database trigger without altering public.conversations.
--    - Immutable audit fields: organization_id, conversation_id, sender_id, client_message_id, created_at.
-- 3. Row Level Security (RLS):
--    - Enabled on public.conversation_messages.
--    - Office roles (owner_admin, dispatcher, staff) granted appropriate access.
--    - Preserves secure default-deny behavior for drivers (no driver policies yet).
-- ====================================================================

-- --------------------------------------------------------------------
-- 1. Create public.conversation_messages table
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.conversation_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE RESTRICT,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  message_type TEXT NOT NULL,
  channel TEXT NOT NULL,
  content TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at TIMESTAMPTZ NULL,
  acknowledged_at TIMESTAMPTZ NULL,
  attachment_id UUID NULL,
  context JSONB NULL,
  client_message_id UUID NOT NULL,
  deleted_at TIMESTAMPTZ NULL,

  -- Message types allowed
  CONSTRAINT chk_conversation_messages_type CHECK (
    message_type IN (
      'text',
      'quick_action',
      'instruction',
      'question',
      'confirmation',
      'status_update',
      'exception_update',
      'document_message',
      'system_notice'
    )
  ),

  -- Channels allowed
  CONSTRAINT chk_conversation_messages_channel CHECK (
    channel IN (
      'in_app',
      'phone',
      'sms',
      'email',
      'whatsapp',
      'in_person',
      'other'
    )
  ),

  -- Idempotency per organization and client message ID
  CONSTRAINT uq_conversation_messages_idempotency UNIQUE (organization_id, client_message_id)
);

-- --------------------------------------------------------------------
-- 2. Indexes for efficient communication retrieval
-- --------------------------------------------------------------------
-- Minimal retrieval index: (organization_id, conversation_id, created_at)
CREATE INDEX IF NOT EXISTS idx_conversation_messages_org_conv_created
  ON public.conversation_messages (organization_id, conversation_id, created_at);

-- --------------------------------------------------------------------
-- 3. Tenant Integrity & Immutability Trigger
-- --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_conversation_message_tenant()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_conv_org_id UUID;
BEGIN
  -- 1. Validate parent conversation exists and belongs to the same organization
  SELECT organization_id INTO v_conv_org_id
  FROM public.conversations
  WHERE id = NEW.conversation_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Referenced conversation % does not exist.', NEW.conversation_id;
  END IF;

  IF v_conv_org_id <> NEW.organization_id THEN
    RAISE EXCEPTION 'Tenant integrity violation: message organization (%) does not match conversation organization (%).',
      NEW.organization_id, v_conv_org_id;
  END IF;

  -- 2. Immutability checks on UPDATE
  IF TG_OP = 'UPDATE' THEN
    IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
      RAISE EXCEPTION 'Security Violation: organization_id is immutable and cannot be modified (Original: %, New: %).',
        OLD.organization_id, NEW.organization_id;
    END IF;

    IF NEW.conversation_id IS DISTINCT FROM OLD.conversation_id THEN
      RAISE EXCEPTION 'Security Violation: conversation_id is immutable and cannot be modified (Original: %, New: %).',
        OLD.conversation_id, NEW.conversation_id;
    END IF;

    IF NEW.sender_id IS DISTINCT FROM OLD.sender_id THEN
      RAISE EXCEPTION 'Security Violation: sender_id is immutable and cannot be modified (Original: %, New: %).',
        OLD.sender_id, NEW.sender_id;
    END IF;

    IF NEW.client_message_id IS DISTINCT FROM OLD.client_message_id THEN
      RAISE EXCEPTION 'Security Violation: client_message_id is immutable and cannot be modified (Original: %, New: %).',
        OLD.client_message_id, NEW.client_message_id;
    END IF;

    IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'Security Violation: created_at is immutable and cannot be modified (Original: %, New: %).',
        OLD.created_at, NEW.created_at;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_conversation_message_tenant ON public.conversation_messages;
CREATE TRIGGER trg_validate_conversation_message_tenant
  BEFORE INSERT OR UPDATE ON public.conversation_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_conversation_message_tenant();

-- Established updated_at pattern
DROP TRIGGER IF EXISTS set_conversation_messages_updated_at ON public.conversation_messages;
CREATE TRIGGER set_conversation_messages_updated_at
  BEFORE UPDATE ON public.conversation_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Established tenant isolation pattern: immutable organization_id trigger
DROP TRIGGER IF EXISTS trg_protect_conversation_message_org_id ON public.conversation_messages;
CREATE TRIGGER trg_protect_conversation_message_org_id
  BEFORE UPDATE ON public.conversation_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_organization_id_change();

-- --------------------------------------------------------------------
-- 4. Row Level Security (RLS)
-- Secure by default: RLS enabled.
-- Office roles (owner_admin, dispatcher, staff) granted tenant-safe access.
-- Default-deny preserved for drivers (no driver policies).
-- --------------------------------------------------------------------
ALTER TABLE public.conversation_messages ENABLE ROW LEVEL SECURITY;

-- SELECT: Office members can view conversation messages in their organizations
DROP POLICY IF EXISTS "Office members can view conversation messages in their orgs" ON public.conversation_messages;
CREATE POLICY "Office members can view conversation messages in their orgs"
  ON public.conversation_messages FOR SELECT
  USING (
    organization_id IN (SELECT public.get_user_organizations())
    AND public.get_user_org_role(organization_id) IN ('owner_admin', 'dispatcher', 'staff')
  );

-- INSERT: Dispatchers and admins can insert conversation messages in their organizations
DROP POLICY IF EXISTS "Dispatchers and admins can insert conversation messages" ON public.conversation_messages;
CREATE POLICY "Dispatchers and admins can insert conversation messages"
  ON public.conversation_messages FOR INSERT
  WITH CHECK (
    organization_id IN (SELECT public.get_user_organizations())
    AND public.has_operational_write_access(organization_id)
  );

-- UPDATE: Dispatchers and admins can update conversation messages (read_at, acknowledged_at, deleted_at)
DROP POLICY IF EXISTS "Dispatchers and admins can update conversation messages" ON public.conversation_messages;
CREATE POLICY "Dispatchers and admins can update conversation messages"
  ON public.conversation_messages FOR UPDATE
  USING (
    organization_id IN (SELECT public.get_user_organizations())
    AND public.has_operational_write_access(organization_id)
  )
  WITH CHECK (
    organization_id IN (SELECT public.get_user_organizations())
    AND public.has_operational_write_access(organization_id)
  );

-- DELETE: Owner admins can delete conversation messages
DROP POLICY IF EXISTS "Owner admins can delete conversation messages" ON public.conversation_messages;
CREATE POLICY "Owner admins can delete conversation messages"
  ON public.conversation_messages FOR DELETE
  USING (
    organization_id IN (SELECT public.get_user_organizations())
    AND public.is_org_owner_admin(organization_id)
  );
