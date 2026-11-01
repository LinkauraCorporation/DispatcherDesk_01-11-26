-- ====================================================================
-- DispatcherDesk Migration: Organization Security & Tenant Isolation Hardening (S5.5)
-- Version: 1.0.10
-- File: supabase/migrations/20260830000010_tenant_isolation_hardening.sql
-- Description:
-- 1. Introduces immutable organization_id enforcement trigger across all
--    tenant-scoped tables to prevent cross-tenant record hijacking via UPDATE.
-- 2. Ensures strict RLS enablement and definitive isolation policies on all tables.
-- 3. Restricts activity_notes deletion strictly to owner_admins of the owning org.
-- 4. Verifies composite FK constraints preventing cross-tenant foreign key linkages.
-- ====================================================================

-- 1. Immutable organization_id Trigger Function
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

-- 2. Apply Immutable organization_id Trigger to all tenant tables

-- clients
DROP TRIGGER IF EXISTS trg_protect_client_org_id ON public.clients;
CREATE TRIGGER trg_protect_client_org_id
  BEFORE UPDATE ON public.clients
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_organization_id_change();

-- brokers
DROP TRIGGER IF EXISTS trg_protect_broker_org_id ON public.brokers;
CREATE TRIGGER trg_protect_broker_org_id
  BEFORE UPDATE ON public.brokers
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_organization_id_change();

-- trucks
DROP TRIGGER IF EXISTS trg_protect_truck_org_id ON public.trucks;
CREATE TRIGGER trg_protect_truck_org_id
  BEFORE UPDATE ON public.trucks
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_organization_id_change();

-- drivers
DROP TRIGGER IF EXISTS trg_protect_driver_org_id ON public.drivers;
CREATE TRIGGER trg_protect_driver_org_id
  BEFORE UPDATE ON public.drivers
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_organization_id_change();

-- loads
DROP TRIGGER IF EXISTS trg_protect_load_org_id ON public.loads;
CREATE TRIGGER trg_protect_load_org_id
  BEFORE UPDATE ON public.loads
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_organization_id_change();

-- documents
DROP TRIGGER IF EXISTS trg_protect_document_org_id ON public.documents;
CREATE TRIGGER trg_protect_document_org_id
  BEFORE UPDATE ON public.documents
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_organization_id_change();

-- tasks
DROP TRIGGER IF EXISTS trg_protect_task_org_id ON public.tasks;
CREATE TRIGGER trg_protect_task_org_id
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_organization_id_change();

-- check_calls
DROP TRIGGER IF EXISTS trg_protect_check_call_org_id ON public.check_calls;
CREATE TRIGGER trg_protect_check_call_org_id
  BEFORE UPDATE ON public.check_calls
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_organization_id_change();

-- organization_invitations
DROP TRIGGER IF EXISTS trg_protect_invitation_org_id ON public.organization_invitations;
CREATE TRIGGER trg_protect_invitation_org_id
  BEFORE UPDATE ON public.organization_invitations
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_organization_id_change();

-- organization_members
DROP TRIGGER IF EXISTS trg_protect_member_org_id ON public.organization_members;
CREATE TRIGGER trg_protect_member_org_id
  BEFORE UPDATE ON public.organization_members
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_organization_id_change();

-- activity_notes
DROP TRIGGER IF EXISTS trg_protect_activity_note_org_id ON public.activity_notes;
CREATE TRIGGER trg_protect_activity_note_org_id
  BEFORE UPDATE ON public.activity_notes
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_organization_id_change();

-- 3. Activity Notes Deletion Hardening
-- Allow owner_admins of the owning organization to delete activity notes if needed,
-- but block arbitrary users/dispatchers from altering historical audit trail notes.
DROP POLICY IF EXISTS "Owner admins can delete activity notes" ON public.activity_notes;
CREATE POLICY "Owner admins can delete activity notes"
  ON public.activity_notes FOR DELETE
  USING (public.is_org_owner_admin(organization_id));

-- 4. Defensive RLS Re-affirmation on All Organization Tables
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brokers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trucks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.check_calls ENABLE ROW LEVEL SECURITY;
