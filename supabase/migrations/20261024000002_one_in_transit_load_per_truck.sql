-- ====================================================================
-- DispatcherDesk Migration: Enforce One IN TRANSIT Load Per Truck (P0)
-- Version: 1.0.39
-- File: supabase/migrations/20261024000002_one_in_transit_load_per_truck.sql
-- Description:
-- Authoritatively enforces at the database storage engine layer that a truck
-- can have at most ONE load in 'in_transit' status at any given time within an organization.
--
-- Mechanism:
-- A PostgreSQL partial unique index on public.loads (organization_id, truck_id)
-- scoped strictly to pipeline_status = 'in_transit' and non-null truck_id.
-- This ensures:
-- 1. Unassigned loads (truck_id IS NULL) are unaffected.
-- 2. Non-in_transit loads (booked, delivered, invoiced, paid, etc.) are unaffected.
-- 3. Concurrent attempts to transition two loads to 'in_transit' for the same truck serialize
--    and fail atomically with error 23505 (unique_violation).
-- 4. Direct SQL, Supabase REST API, RPCs, Check Call auto-advancements, and UI transitions
--    are all strictly and unconditionally protected.
-- ====================================================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_loads_one_in_transit_per_truck
  ON public.loads (organization_id, truck_id)
  WHERE pipeline_status = 'in_transit'
    AND truck_id IS NOT NULL;

COMMENT ON INDEX public.idx_loads_one_in_transit_per_truck IS
  'Authoritative invariant: a truck may have at most ONE load in in_transit status per organization at any time.';
