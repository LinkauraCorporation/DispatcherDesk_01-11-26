-- ====================================================================
-- DispatcherDesk Migration: Driver Chat RLS Production Patch
-- Version: 1.0.21
-- File: supabase/migrations/20260921135500_driver_chat_rls.sql
-- Description:
-- Additive RLS policies and tamper-protection triggers for Driver Portal communication.
-- 
-- 1. public.conversations RLS:
--    - SELECT: Authenticated active driver can view own conversations (deleted_at IS NULL)
--    - INSERT: Authenticated active driver can create general or assigned-load conversations
--    - UPDATE: Authenticated active driver can update own conversations (e.g. reopen resolved conversation)
--
-- 2. public.conversations Tamper Protection Trigger:
--    - When updated by non-office callers (drivers), prevents altering immutable fields:
--      id, organization_id, driver_id, type, load_id, created_at, deleted_at
--
-- 3. public.conversation_messages RLS:
--    - SELECT: Authenticated active driver can view messages in own conversations (deleted_at IS NULL)
--    - INSERT: Authenticated active driver can send in-app messages to own conversations (sender_id = auth.uid())
--    - UPDATE: Authenticated active driver can update own conversation messages (read_at, acknowledged_at)
--
-- 4. public.conversation_messages Tamper Protection Trigger:
--    - When updated by non-office callers (drivers), prevents altering protected fields:
--      id, organization_id, conversation_id, sender_id, message_type, channel, content,
--      attachment_id, context, client_message_id, created_at, deleted_at
--
-- Preserves all existing office dispatcher/admin/staff policies and triggers without modification.
-- ====================================================================

-- --------------------------------------------------------------------
-- 1. Immutability Triggers for Driver Updates
-- --------------------------------------------------------------------

-- A. Conversations Driver Tamper Protection Trigger
CREATE OR REPLACE FUNCTION public.protect_driver_conversation_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- If caller does NOT have office operational write access, enforce driver immutability
  IF NOT public.has_operational_write_access(OLD.organization_id) THEN
    IF NEW.id IS DISTINCT FROM OLD.id THEN
      RAISE EXCEPTION 'Driver Security Violation: id is immutable.';
    END IF;

    IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
      RAISE EXCEPTION 'Driver Security Violation: organization_id is immutable.';
    END IF;

    IF NEW.driver_id IS DISTINCT FROM OLD.driver_id THEN
      RAISE EXCEPTION 'Driver Security Violation: driver_id is immutable.';
    END IF;

    IF NEW.type IS DISTINCT FROM OLD.type THEN
      RAISE EXCEPTION 'Driver Security Violation: type is immutable.';
    END IF;

    IF NEW.load_id IS DISTINCT FROM OLD.load_id THEN
      RAISE EXCEPTION 'Driver Security Violation: load_id is immutable.';
    END IF;

    IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'Driver Security Violation: created_at is immutable.';
    END IF;

    IF NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
      RAISE EXCEPTION 'Driver Security Violation: deleted_at cannot be modified by driver.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_driver_conversation_update ON public.conversations;
CREATE TRIGGER trg_protect_driver_conversation_update
  BEFORE UPDATE ON public.conversations
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_driver_conversation_update();

-- B. Conversation Messages Driver Tamper Protection Trigger
CREATE OR REPLACE FUNCTION public.protect_driver_conversation_message_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- If caller does NOT have office operational write access, enforce driver immutability
  IF NOT public.has_operational_write_access(OLD.organization_id) THEN
    IF NEW.id IS DISTINCT FROM OLD.id THEN
      RAISE EXCEPTION 'Driver Security Violation: id is immutable.';
    END IF;

    IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
      RAISE EXCEPTION 'Driver Security Violation: organization_id is immutable.';
    END IF;

    IF NEW.conversation_id IS DISTINCT FROM OLD.conversation_id THEN
      RAISE EXCEPTION 'Driver Security Violation: conversation_id is immutable.';
    END IF;

    IF NEW.sender_id IS DISTINCT FROM OLD.sender_id THEN
      RAISE EXCEPTION 'Driver Security Violation: sender_id is immutable.';
    END IF;

    IF NEW.message_type IS DISTINCT FROM OLD.message_type THEN
      RAISE EXCEPTION 'Driver Security Violation: message_type is immutable for driver.';
    END IF;

    IF NEW.channel IS DISTINCT FROM OLD.channel THEN
      RAISE EXCEPTION 'Driver Security Violation: channel is immutable for driver.';
    END IF;

    IF NEW.content IS DISTINCT FROM OLD.content THEN
      RAISE EXCEPTION 'Driver Security Violation: content is immutable for driver.';
    END IF;

    IF NEW.attachment_id IS DISTINCT FROM OLD.attachment_id THEN
      RAISE EXCEPTION 'Driver Security Violation: attachment_id is immutable for driver.';
    END IF;

    IF NEW.context IS DISTINCT FROM OLD.context THEN
      RAISE EXCEPTION 'Driver Security Violation: context is immutable for driver.';
    END IF;

    IF NEW.client_message_id IS DISTINCT FROM OLD.client_message_id THEN
      RAISE EXCEPTION 'Driver Security Violation: client_message_id is immutable.';
    END IF;

    IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'Driver Security Violation: created_at is immutable.';
    END IF;

    IF NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
      RAISE EXCEPTION 'Driver Security Violation: deleted_at cannot be modified by driver.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_driver_conversation_message_update ON public.conversation_messages;
CREATE TRIGGER trg_protect_driver_conversation_message_update
  BEFORE UPDATE ON public.conversation_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_driver_conversation_message_update();

-- --------------------------------------------------------------------
-- 2. Additive Driver RLS Policies on public.conversations
-- --------------------------------------------------------------------

-- A. Driver SELECT Policy
DROP POLICY IF EXISTS "Drivers can view own conversations" ON public.conversations;
CREATE POLICY "Drivers can view own conversations"
  ON public.conversations FOR SELECT
  USING (
    deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.drivers d
      WHERE d.id = conversations.driver_id
        AND d.organization_id = conversations.organization_id
        AND d.user_id = (SELECT auth.uid())
        AND d.status <> 'inactive'
    )
  );

-- B. Driver INSERT Policy
DROP POLICY IF EXISTS "Drivers can insert own conversations" ON public.conversations;
CREATE POLICY "Drivers can insert own conversations"
  ON public.conversations FOR INSERT
  WITH CHECK (
    deleted_at IS NULL
    AND status IN ('active', 'escalated')
    AND EXISTS (
      SELECT 1 FROM public.drivers d
      WHERE d.id = conversations.driver_id
        AND d.organization_id = conversations.organization_id
        AND d.user_id = (SELECT auth.uid())
        AND d.status <> 'inactive'
    )
    AND (
      -- General conversation: load_id must be NULL
      (type = 'general' AND load_id IS NULL)
      OR
      -- Load conversation: load_id must belong to same org and be assigned to driver
      (
        type = 'load'
        AND load_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.loads l
          WHERE l.id = conversations.load_id
            AND l.organization_id = conversations.organization_id
            AND l.driver_id = conversations.driver_id
        )
      )
    )
  );

-- C. Driver UPDATE Policy (Reopening conversation)
DROP POLICY IF EXISTS "Drivers can update own conversations" ON public.conversations;
CREATE POLICY "Drivers can update own conversations"
  ON public.conversations FOR UPDATE
  USING (
    deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.drivers d
      WHERE d.id = conversations.driver_id
        AND d.organization_id = conversations.organization_id
        AND d.user_id = (SELECT auth.uid())
        AND d.status <> 'inactive'
    )
  )
  WITH CHECK (
    deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.drivers d
      WHERE d.id = conversations.driver_id
        AND d.organization_id = conversations.organization_id
        AND d.user_id = (SELECT auth.uid())
        AND d.status <> 'inactive'
    )
  );

-- --------------------------------------------------------------------
-- 3. Additive Driver RLS Policies on public.conversation_messages
-- --------------------------------------------------------------------

-- A. Driver SELECT Policy
DROP POLICY IF EXISTS "Drivers can view messages in own conversations" ON public.conversation_messages;
CREATE POLICY "Drivers can view messages in own conversations"
  ON public.conversation_messages FOR SELECT
  USING (
    deleted_at IS NULL
    AND EXISTS (
      SELECT 1
      FROM public.conversations c
      JOIN public.drivers d
        ON d.id = c.driver_id
       AND d.organization_id = c.organization_id
      WHERE c.id = conversation_messages.conversation_id
        AND c.organization_id = conversation_messages.organization_id
        AND c.deleted_at IS NULL
        AND d.user_id = (SELECT auth.uid())
        AND d.status <> 'inactive'
    )
  );

-- B. Driver INSERT Policy
DROP POLICY IF EXISTS "Drivers can insert messages into own conversations" ON public.conversation_messages;
CREATE POLICY "Drivers can insert messages into own conversations"
  ON public.conversation_messages FOR INSERT
  WITH CHECK (
    sender_id = (SELECT auth.uid())
    AND channel = 'in_app'
    AND deleted_at IS NULL
    AND EXISTS (
      SELECT 1
      FROM public.conversations c
      JOIN public.drivers d
        ON d.id = c.driver_id
       AND d.organization_id = c.organization_id
      WHERE c.id = conversation_messages.conversation_id
        AND c.organization_id = conversation_messages.organization_id
        AND c.deleted_at IS NULL
        AND d.user_id = (SELECT auth.uid())
        AND d.status <> 'inactive'
    )
  );

-- C. Driver UPDATE Policy (Mark read and acknowledge)
DROP POLICY IF EXISTS "Drivers can update messages in own conversations" ON public.conversation_messages;
CREATE POLICY "Drivers can update messages in own conversations"
  ON public.conversation_messages FOR UPDATE
  USING (
    deleted_at IS NULL
    AND EXISTS (
      SELECT 1
      FROM public.conversations c
      JOIN public.drivers d
        ON d.id = c.driver_id
       AND d.organization_id = c.organization_id
      WHERE c.id = conversation_messages.conversation_id
        AND c.organization_id = conversation_messages.organization_id
        AND c.deleted_at IS NULL
        AND d.user_id = (SELECT auth.uid())
        AND d.status <> 'inactive'
    )
  )
  WITH CHECK (
    deleted_at IS NULL
    AND EXISTS (
      SELECT 1
      FROM public.conversations c
      JOIN public.drivers d
        ON d.id = c.driver_id
       AND d.organization_id = c.organization_id
      WHERE c.id = conversation_messages.conversation_id
        AND c.organization_id = conversation_messages.organization_id
        AND c.deleted_at IS NULL
        AND d.user_id = (SELECT auth.uid())
        AND d.status <> 'inactive'
    )
  );
