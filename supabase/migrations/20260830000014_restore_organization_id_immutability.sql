-- ====================================================================
-- DispatcherDesk Migration: Restore Authoritative Organization ID Immutability (S5.5/S6.4 Corrective)
-- Version: 1.0.14
-- File: supabase/migrations/20260830000014_restore_organization_id_immutability.sql
-- Description:
-- 1. Restores the authoritative public.prevent_organization_id_change() trigger function.
-- 2. Enforces strict immutability on organization_id across all tenant-scoped operational
--    and system tables to prevent cross-tenant record hijacking and tenant detachment.
-- 3. Attaches BEFORE UPDATE triggers idempotently across all 11 tenant-scoped tables:
--    - loads
--    - clients
--    - brokers
--    - trucks
--    - drivers
--    - documents
--    - check_calls
--    - tasks
--    - activity_notes
--    - organization_members
--    - organization_invitations
-- ====================================================================

-- 1. Create or Replace Immutable organization_id Trigger Function
CREATE OR REPLACE FUNCTION public.prevent_organization_id_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'Security Violation: organization_id is immutable and cannot be reassigned across organizations (Target ID: %, New ID: %).',
      OLD.organization_id, NEW.organization_id;
  END IF;
  RETURN NEW;
END;
$$;

-- 2. Attach BEFORE UPDATE Immutability Triggers to All Tenant Tables

-- A. loads
DROP TRIGGER IF EXISTS trg_protect_load_org_id ON public.loads;
CREATE TRIGGER trg_protect_load_org_id
  BEFORE UPDATE ON public.loads
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_organization_id_change();

-- B. clients
DROP TRIGGER IF EXISTS trg_protect_client_org_id ON public.clients;
CREATE TRIGGER trg_protect_client_org_id
  BEFORE UPDATE ON public.clients
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_organization_id_change();

-- C. brokers
DROP TRIGGER IF EXISTS trg_protect_broker_org_id ON public.brokers;
CREATE TRIGGER trg_protect_broker_org_id
  BEFORE UPDATE ON public.brokers
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_organization_id_change();

-- D. trucks
DROP TRIGGER IF EXISTS trg_protect_truck_org_id ON public.trucks;
CREATE TRIGGER trg_protect_truck_org_id
  BEFORE UPDATE ON public.trucks
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_organization_id_change();

-- E. drivers
DROP TRIGGER IF EXISTS trg_protect_driver_org_id ON public.drivers;
CREATE TRIGGER trg_protect_driver_org_id
  BEFORE UPDATE ON public.drivers
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_organization_id_change();

-- F. documents
DROP TRIGGER IF EXISTS trg_protect_document_org_id ON public.documents;
CREATE TRIGGER trg_protect_document_org_id
  BEFORE UPDATE ON public.documents
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_organization_id_change();

-- G. check_calls
DROP TRIGGER IF EXISTS trg_protect_check_call_org_id ON public.check_calls;
CREATE TRIGGER trg_protect_check_call_org_id
  BEFORE UPDATE ON public.check_calls
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_organization_id_change();

-- H. tasks
DROP TRIGGER IF EXISTS trg_protect_task_org_id ON public.tasks;
CREATE TRIGGER trg_protect_task_org_id
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_organization_id_change();

-- I. activity_notes
DROP TRIGGER IF EXISTS trg_protect_activity_note_org_id ON public.activity_notes;
CREATE TRIGGER trg_protect_activity_note_org_id
  BEFORE UPDATE ON public.activity_notes
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_organization_id_change();

-- J. organization_members
DROP TRIGGER IF EXISTS trg_protect_member_org_id ON public.organization_members;
CREATE TRIGGER trg_protect_member_org_id
  BEFORE UPDATE ON public.organization_members
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_organization_id_change();

-- K. organization_invitations
DROP TRIGGER IF EXISTS trg_protect_invitation_org_id ON public.organization_invitations;
CREATE TRIGGER trg_protect_invitation_org_id
  BEFORE UPDATE ON public.organization_invitations
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_organization_id_change();
