-- ====================================================================
-- DispatcherDesk Migration: Driver Client FK Restrict (P0-3)
-- Version: 1.0.36
-- File: supabase/migrations/20261007000003_driver_client_fk_restrict.sql
-- Description:
-- 1. Drops the historical foreign key constraint fk_drivers_client from public.drivers
--    which previously specified ON DELETE SET NULL.
-- 2. Recreates fk_drivers_client on (organization_id, client_id) referencing
--    public.clients(organization_id, id) with ON DELETE RESTRICT.
-- 3. Strictly prevents client deletion while associated drivers exist.
-- 4. Preserves drivers.client_id NOT NULL constraint, column types, and indexes.
-- ====================================================================

-- 1. Drop existing FK constraint from drivers to clients
ALTER TABLE public.drivers
  DROP CONSTRAINT IF EXISTS fk_drivers_client;

ALTER TABLE public.drivers
  DROP CONSTRAINT IF EXISTS drivers_client_id_fkey;

-- 2. Preserve & reinforce NOT NULL constraint on client_id
ALTER TABLE public.drivers
  ALTER COLUMN client_id SET NOT NULL;

-- 3. Recreate foreign key constraint with ON DELETE RESTRICT
-- Tenant-scoped compound foreign key matching uq_clients_org_id(organization_id, id)
ALTER TABLE public.drivers
  ADD CONSTRAINT fk_drivers_client
  FOREIGN KEY (organization_id, client_id)
  REFERENCES public.clients(organization_id, id)
  ON DELETE RESTRICT;

-- 4. Ensure index on client_id is preserved
CREATE INDEX IF NOT EXISTS idx_drivers_client_id
  ON public.drivers(client_id);
