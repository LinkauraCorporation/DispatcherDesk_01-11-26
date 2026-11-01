-- ====================================================================
-- DispatcherDesk Migration: Financial Projection RPC + Driver Load Data Firewall
-- Migration Object 2 (Approved Forensic Audit)
-- Version: 1.0.19
-- File: supabase/migrations/20260905000002_driver_load_data_firewall.sql
-- Description:
-- 1. Hardens public.loads direct SELECT RLS policy:
--    Restricts direct table SELECT to office roles: ('owner_admin', 'dispatcher', 'staff').
--    Drivers receive 0 rows from direct SELECT * FROM public.loads.
-- 2. Expands public.organization_members.role CHECK constraint to include ('driver').
-- 3. Adds user_id UUID REFERENCES auth.users(id) to public.drivers for server-side
--    identity resolution.
-- 4. Creates authoritative SECURITY DEFINER RPC public.get_driver_assigned_loads(p_organization_id UUID):
--    - Rejects unauthenticated callers (auth.uid() IS NULL)
--    - Verifies caller is an active driver member of the specified organization
--    - Resolves driver profile server-side (drivers.user_id = auth.uid() AND drivers.organization_id = p_organization_id)
--    - Returns strictly whitelisted operational projection (24 columns)
--    - Completely omits sensitive commercial/financial fields (rate, driver_pay, fuel_expense,
--      other_expenses, loaded_miles, deadhead_miles, client_id, broker_id, assigned_dispatcher_id)
-- ====================================================================

-- --------------------------------------------------------------------
-- 1. Expand organization_members.role constraint to support 'driver'
-- --------------------------------------------------------------------
DO $$
DECLARE
  v_con RECORD;
BEGIN
  FOR v_con IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.organization_members'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%role%'
  LOOP
    EXECUTE format('ALTER TABLE public.organization_members DROP CONSTRAINT IF EXISTS %I', v_con.conname);
  END LOOP;
END $$;

ALTER TABLE public.organization_members
  ADD CONSTRAINT organization_members_role_check
  CHECK (role IN ('owner_admin', 'dispatcher', 'staff', 'driver'));

-- --------------------------------------------------------------------
-- 2. Add user_id column to public.drivers for identity link
-- --------------------------------------------------------------------
ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_drivers_user_id ON public.drivers(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_drivers_org_user_id ON public.drivers(organization_id, user_id) WHERE user_id IS NOT NULL;

-- --------------------------------------------------------------------
-- 3. Harden direct SELECT RLS on public.loads (Office roles only)
-- --------------------------------------------------------------------
DROP POLICY IF EXISTS "Members can view loads in their orgs" ON public.loads;

CREATE POLICY "Members can view loads in their orgs"
  ON public.loads FOR SELECT
  USING (
    organization_id IN (SELECT public.get_user_organizations())
    AND public.get_user_org_role(organization_id) IN ('owner_admin', 'dispatcher', 'staff')
  );

-- --------------------------------------------------------------------
-- 4. Authoritative Driver Operational Projection RPC
-- --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_driver_assigned_loads(p_organization_id UUID)
RETURNS TABLE (
  id UUID,
  organization_id UUID,
  load_number TEXT,
  pipeline_status TEXT,
  equipment_type TEXT,
  commodity TEXT,
  weight_lbs NUMERIC,
  origin_city TEXT,
  origin_state TEXT,
  origin_zip TEXT,
  pickup_datetime TIMESTAMPTZ,
  origin_address TEXT,
  origin_facility_name TEXT,
  dest_city TEXT,
  dest_state TEXT,
  dest_zip TEXT,
  delivery_datetime TIMESTAMPTZ,
  destination_address TEXT,
  destination_facility_name TEXT,
  special_instructions TEXT,
  driver_id UUID,
  truck_id UUID,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID;
  v_driver_id UUID;
BEGIN
  -- 1. Reject unauthenticated callers
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  -- 2. Validate input parameter
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'Organization ID is required.';
  END IF;

  -- 3. Verify caller is a member of the target organization with role = 'driver'
  IF NOT EXISTS (
    SELECT 1
    FROM public.organization_members om
    WHERE om.organization_id = p_organization_id
      AND om.user_id = v_caller_id
      AND om.role = 'driver'
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Caller is not a driver member of the specified organization.';
  END IF;

  -- 4. Server-side driver resolution: drivers.user_id = auth.uid() AND drivers.organization_id = p_organization_id
  SELECT d.id INTO v_driver_id
  FROM public.drivers d
  WHERE d.user_id = v_caller_id
    AND d.organization_id = p_organization_id;

  IF v_driver_id IS NULL THEN
    RAISE EXCEPTION 'Driver profile not found for authenticated user in this organization.';
  END IF;

  -- 5. Return strictly approved operational whitelist projection for assigned loads
  RETURN QUERY
  SELECT
    l.id,
    l.organization_id,
    l.load_number,
    l.pipeline_status,
    l.equipment_type,
    l.commodity,
    l.weight_lbs,
    l.origin_city,
    l.origin_state,
    l.origin_zip,
    l.pickup_datetime,
    l.origin_address,
    l.origin_facility_name,
    l.dest_city,
    l.dest_state,
    l.dest_zip,
    l.delivery_datetime,
    l.dest_address AS destination_address,
    l.dest_facility_name AS destination_facility_name,
    l.special_instructions,
    l.driver_id,
    l.truck_id,
    l.created_at,
    l.updated_at
  FROM public.loads l
  WHERE l.organization_id = p_organization_id
    AND l.driver_id = v_driver_id
  ORDER BY l.pickup_datetime ASC NULLS LAST, l.created_at DESC;
END;
$$;

-- Grant execution privilege to authenticated users only
REVOKE ALL ON FUNCTION public.get_driver_assigned_loads(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_driver_assigned_loads(UUID) TO authenticated;
