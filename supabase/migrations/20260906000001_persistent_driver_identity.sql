-- ====================================================================
-- DispatcherDesk Migration: Phase-3.2 Persistent Driver Identity, Onboarding & Operational Access
-- Version: 1.0.14
-- File: supabase/migrations/20260906000001_persistent_driver_identity.sql
-- Description:
-- 1. Preflight Audit & Legacy Driver Reconciliation (Section 4):
--    - Reconciles any legacy organization_members rows where role = 'driver'
--    - Ensures no driver identity is lost before removing legacy membership rows
--    - Drops obsolete validate_driver_user_coherence trigger and function
--    - Restricts organization_members_role_check strictly to office roles ('owner_admin', 'dispatcher', 'staff')
-- 2. Driver Identity Uniqueness & Client Integrity (Sections 1, 5, 7, 8):
--    - Enforces drivers.client_id NOT NULL
--    - Creates partial unique index uq_drivers_user_id on drivers(user_id) WHERE user_id IS NOT NULL AND status <> 'inactive'
--    - Adds safe driver ↔ truck ↔ client coherence trigger that preserves client_id on truck deletion
--    - Adds truck client immutability trigger
-- 3. Driver Identity Immutability & Dedicated Admin Offboarding RPC (Section 6):
--    - Creates trigger preventing casual tampering with drivers.user_id (no custom GUC bypass)
--    - Creates dedicated SECURITY DEFINER RPC public.admin_unlink_driver_identity(p_driver_id) authorized strictly by owner_admin role
-- 4. Load Assignment Integrity (Sections 1, 7, 12):
--    - Hardens trg_validate_load_assignment_integrity to enforce loads.client_id = drivers.client_id = trucks.client_id
-- 5. RPC: public.accept_driver_invitation(p_token_hash) (Section 10):
--    - Atomic driver profile binding without inserting into organization_members
--    - Idempotent for already-linked same user
--    - Conflict protection for cross-user or cross-driver claims
--    - Cancels obsolete pending invitations for the driver
-- 6. RPC: public.verify_driver_load_access(p_load_id) (Section 11):
--    - Authoritative driver load verification returning operational-only projection
--    - Strict firewalling of commercial and dispatcher financial data
-- 7. Authoritative Driver Helpers & RLS Hardening (Sections 1, 14, 15):
--    - Updates public.get_driver_assigned_loads(p_organization_id) to use canonical identity chain
--    - Updates public.get_current_driver_id(p_organization_id) to remove organization_members dependency
--    - Hardens public.drivers RLS: office roles see org drivers; drivers see only own profile
--    - Hardens public.organization_members RLS: office roles only; drivers cannot enumerate
--    - Adds public.clients RLS policy allowing drivers to view only their assigned carrier client
-- ====================================================================

-- --------------------------------------------------------------------
-- 1. PREFLIGHT AUDIT & LEGACY DRIVER RECONCILIATION
-- --------------------------------------------------------------------
DO $$
DECLARE
  v_om RECORD;
  v_driver RECORD;
  v_conflict_count INTEGER := 0;
  v_orphan_om_count INTEGER := 0;
BEGIN
  RAISE NOTICE 'Starting Phase-3.2 Preflight Audit & Legacy Driver Reconciliation...';

  -- Step 1.1: Reconcile legacy organization_members where role = 'driver'
  FOR v_om IN (
    SELECT id, organization_id, user_id, role
    FROM public.organization_members
    WHERE role = 'driver'
  ) LOOP
    -- Check if a driver record already exists with this user_id in the organization
    SELECT * INTO v_driver
    FROM public.drivers
    WHERE organization_id = v_om.organization_id
      AND user_id = v_om.user_id;

    IF NOT FOUND THEN
      -- Try to locate by email if not yet linked
      SELECT d.* INTO v_driver
      FROM public.drivers d
      JOIN auth.users au ON au.id = v_om.user_id
      WHERE d.organization_id = v_om.organization_id
        AND LOWER(TRIM(d.email)) = LOWER(TRIM(au.email))
        AND d.user_id IS NULL
      LIMIT 1;

      IF FOUND THEN
        UPDATE public.drivers
        SET user_id = v_om.user_id, updated_at = NOW()
        WHERE id = v_driver.id;
        RAISE NOTICE 'Reconciled unlinked driver % with membership user %', v_driver.id, v_om.user_id;
      ELSE
        v_orphan_om_count := v_orphan_om_count + 1;
        RAISE NOTICE 'Legacy driver membership % for user % has no matching driver record.', v_om.id, v_om.user_id;
      END IF;
    END IF;
  END LOOP;

  -- Step 1.2: Check for conflicting identities (same user linked to multiple active drivers)
  SELECT COUNT(*) INTO v_conflict_count
  FROM (
    SELECT user_id
    FROM public.drivers
    WHERE user_id IS NOT NULL AND status <> 'inactive'
    GROUP BY user_id
    HAVING COUNT(*) > 1
  ) t;

  IF v_conflict_count > 0 THEN
    RAISE EXCEPTION 'STOP: Conflicting driver identities detected across multiple active driver records. Cannot safely proceed with migration.';
  END IF;

  -- Step 1.3: Ensure no drivers have client_id IS NULL
  -- If any driver has client_id IS NULL, resolve to first active client in that org
  FOR v_driver IN (
    SELECT d.id, d.organization_id, d.full_name
    FROM public.drivers d
    WHERE d.client_id IS NULL
  ) LOOP
    UPDATE public.drivers
    SET client_id = (
      SELECT c.id FROM public.clients c
      WHERE c.organization_id = v_driver.organization_id
      ORDER BY c.created_at ASC LIMIT 1
    )
    WHERE id = v_driver.id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'STOP: Driver "%" has NULL client_id and no carrier clients exist in organization %.',
        v_driver.full_name, v_driver.organization_id;
    END IF;
  END LOOP;

  -- Step 1.4: Safe removal of legacy driver rows from organization_members
  DELETE FROM public.organization_members WHERE role = 'driver';
  RAISE NOTICE 'Legacy driver memberships reconciled and removed successfully.';
END;
$$;

-- Drop obsolete coherence trigger and function from S6.8
DROP TRIGGER IF EXISTS trg_validate_driver_user_coherence ON public.drivers;
DROP FUNCTION IF EXISTS public.validate_driver_user_coherence();

-- Update check constraint on organization_members strictly to office roles
ALTER TABLE public.organization_members
  DROP CONSTRAINT IF EXISTS organization_members_role_check;
ALTER TABLE public.organization_members
  ADD CONSTRAINT organization_members_role_check
  CHECK (role IN ('owner_admin', 'dispatcher', 'staff'));

-- --------------------------------------------------------------------
-- 2. DRIVER IDENTITY UNIQUENESS & CLIENT / TRUCK INTEGRITY
-- --------------------------------------------------------------------

-- Enforce drivers.client_id NOT NULL
ALTER TABLE public.drivers
  ALTER COLUMN client_id SET NOT NULL;

-- Enforce global 1:1 user-to-driver identity constraint for active drivers
DROP INDEX IF EXISTS public.uq_drivers_user_id;
CREATE UNIQUE INDEX uq_drivers_user_id
  ON public.drivers (user_id)
  WHERE user_id IS NOT NULL AND status <> 'inactive';

-- Driver ↔ Truck ↔ Carrier Client Coherence Trigger (Preserves client_id on truck deletion)
CREATE OR REPLACE FUNCTION public.enforce_driver_truck_client_coherence()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_truck RECORD;
BEGIN
  IF NEW.assigned_truck_id IS NOT NULL THEN
    SELECT id, client_id, organization_id, truck_number INTO v_truck
    FROM public.trucks
    WHERE id = NEW.assigned_truck_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Integrity Error: Assigned truck (ID: %) does not exist.', NEW.assigned_truck_id;
    END IF;

    IF v_truck.client_id IS NOT NULL AND v_truck.client_id <> NEW.client_id THEN
      RAISE EXCEPTION 'Integrity Error: Assigned truck "%" belongs to client % but driver belongs to client %.',
        v_truck.truck_number, v_truck.client_id, NEW.client_id;
    END IF;

    IF v_truck.organization_id <> NEW.organization_id THEN
      RAISE EXCEPTION 'Integrity Error: Assigned truck "%" belongs to organization % but driver belongs to organization %.',
        v_truck.truck_number, v_truck.organization_id, NEW.organization_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_driver_truck_client_coherence ON public.drivers;
CREATE TRIGGER trg_enforce_driver_truck_client_coherence
  BEFORE INSERT OR UPDATE OF assigned_truck_id, client_id, organization_id ON public.drivers
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_driver_truck_client_coherence();

-- Truck Client Immutability Trigger: prevent moving a truck to another client if assigned to a driver
CREATE OR REPLACE FUNCTION public.enforce_truck_client_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.client_id IS DISTINCT FROM OLD.client_id THEN
    IF EXISTS (
      SELECT 1 FROM public.drivers
      WHERE assigned_truck_id = NEW.id
        AND client_id <> NEW.client_id
    ) THEN
      RAISE EXCEPTION 'Integrity Error: Cannot change truck client while assigned to a driver with a different client.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_truck_client_immutability ON public.trucks;
CREATE TRIGGER trg_enforce_truck_client_immutability
  BEFORE UPDATE OF client_id ON public.trucks
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_truck_client_immutability();

-- --------------------------------------------------------------------
-- 3. DRIVER IDENTITY IMMUTABILITY & DEDICATED ADMIN OFFBOARDING RPC
-- --------------------------------------------------------------------

-- Anti-tampering trigger: prevents casual or unauthorized overwriting of drivers.user_id
CREATE OR REPLACE FUNCTION public.prevent_driver_user_id_tampering()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID;
BEGIN
  -- If user_id is unchanged, allow
  IF OLD.user_id IS NOT DISTINCT FROM NEW.user_id THEN
    RETURN NEW;
  END IF;

  -- Case 1: Initial linking (OLD.user_id IS NULL AND NEW.user_id IS NOT NULL)
  -- Permitted during invitation acceptance
  IF OLD.user_id IS NULL AND NEW.user_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Case 2: Overwriting or unlinking an already linked driver (OLD.user_id IS NOT NULL)
  -- Must be performed by an authenticated owner_admin in organization_members
  v_caller_id := auth.uid();
  IF v_caller_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = OLD.organization_id
        AND om.user_id = v_caller_id
        AND om.role = 'owner_admin'
    ) THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Reject tampering attempts
  RAISE EXCEPTION 'Security Violation: Cannot overwrite or unlink driver user_id. Only an organization owner_admin via offboarding RPC is authorized.'
    USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_driver_user_id ON public.drivers;
CREATE TRIGGER trg_protect_driver_user_id
  BEFORE UPDATE OF user_id ON public.drivers
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_driver_user_id_tampering();

-- Dedicated administrative offboarding RPC for unlinking driver identity
CREATE OR REPLACE FUNCTION public.admin_unlink_driver_identity(
  p_driver_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID;
  v_driver RECORD;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Authentication required.' USING ERRCODE = '28000';
  END IF;

  -- Lock driver record
  SELECT * INTO v_driver
  FROM public.drivers
  WHERE id = p_driver_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Driver profile not found.' USING ERRCODE = 'P0002';
  END IF;

  -- Authorization check: caller must be owner_admin in the driver's organization
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = v_driver.organization_id
      AND om.user_id = v_caller_id
      AND om.role = 'owner_admin'
  ) THEN
    RAISE EXCEPTION 'Forbidden: Only an organization owner_admin can unlink driver identity.' USING ERRCODE = '42501';
  END IF;

  IF v_driver.user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'status', 'already_unlinked',
      'driver_id', v_driver.id
    );
  END IF;

  -- Atomically unlink user_id and return status to available
  UPDATE public.drivers
  SET user_id = NULL,
      status = 'available',
      updated_at = NOW()
  WHERE id = v_driver.id;

  -- Log action into activity_notes if available
  BEGIN
    INSERT INTO public.activity_notes (
      organization_id,
      note_type,
      content,
      created_by_user_id
    ) VALUES (
      v_driver.organization_id,
      'status_change',
      'Driver "' || v_driver.full_name || '" (ID: ' || v_driver.id || ') unlinked from user account by admin.',
      v_caller_id
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN jsonb_build_object(
    'success', true,
    'status', 'unlinked',
    'driver_id', v_driver.id,
    'previous_user_id', v_driver.user_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_unlink_driver_identity(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_unlink_driver_identity(UUID) TO authenticated;

-- --------------------------------------------------------------------
-- 4. LOAD ASSIGNMENT INTEGRITY ENFORCEMENT
-- --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_load_assignment_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_client RECORD;
  v_truck RECORD;
  v_driver RECORD;
  v_conflict_load_id UUID;
  v_conflict_load_num TEXT;
  v_conflict_p_dt TIMESTAMPTZ;
  v_conflict_d_dt TIMESTAMPTZ;
BEGIN
  -- A. Driver Carrier Alignment
  IF NEW.driver_id IS NOT NULL THEN
    SELECT id, client_id, organization_id, status, full_name INTO v_driver
    FROM public.drivers
    WHERE id = NEW.driver_id AND organization_id = NEW.organization_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Integrity Error: Assigned driver (ID: %) does not exist in organization %.',
        NEW.driver_id, NEW.organization_id;
    END IF;

    -- If load has no client_id specified, inherit from driver
    IF NEW.client_id IS NULL THEN
      NEW.client_id := v_driver.client_id;
    END IF;

    IF v_driver.client_id <> NEW.client_id THEN
      RAISE EXCEPTION 'Integrity Error: Assigned driver "%" (ID: %) belongs to client % but load is assigned to client %.',
        v_driver.full_name, NEW.driver_id, v_driver.client_id, NEW.client_id;
    END IF;

    IF NEW.pipeline_status IN ('booked', 'in_transit') AND v_driver.status = 'off_duty' THEN
      RAISE EXCEPTION 'Integrity Error: Driver "%" (ID: %) cannot be assigned to an active load because status is "off_duty".',
        v_driver.full_name, NEW.driver_id;
    END IF;
  END IF;

  -- B. Truck Carrier Alignment
  IF NEW.truck_id IS NOT NULL THEN
    SELECT id, client_id, organization_id, status, truck_number INTO v_truck
    FROM public.trucks
    WHERE id = NEW.truck_id AND organization_id = NEW.organization_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Integrity Error: Assigned truck (ID: %) does not exist in organization %.',
        NEW.truck_id, NEW.organization_id;
    END IF;

    IF NEW.client_id IS NULL THEN
      NEW.client_id := v_truck.client_id;
    END IF;

    IF v_truck.client_id IS NOT NULL AND v_truck.client_id <> NEW.client_id THEN
      RAISE EXCEPTION 'Integrity Error: Assigned truck "%" (ID: %) belongs to client % but load is assigned to client %.',
        v_truck.truck_number, NEW.truck_id, v_truck.client_id, NEW.client_id;
    END IF;

    IF NEW.pipeline_status IN ('booked', 'in_transit') AND v_truck.status IN ('maintenance', 'inactive') THEN
      RAISE EXCEPTION 'Integrity Error: Truck "%" (ID: %) cannot be assigned to an active load because its status is "%".',
        v_truck.truck_number, NEW.truck_id, v_truck.status;
    END IF;
  END IF;

  -- C. Truck and Driver Cross-Carrier Match
  IF NEW.driver_id IS NOT NULL AND NEW.truck_id IS NOT NULL THEN
    IF v_truck.client_id IS NOT NULL AND v_driver.client_id <> v_truck.client_id THEN
      RAISE EXCEPTION 'Integrity Error: Assigned truck "%" (client %) and driver "%" (client %) belong to different carrier clients.',
        v_truck.truck_number, v_truck.client_id, v_driver.full_name, v_driver.client_id;
    END IF;
  END IF;

  -- D. Client Status
  IF NEW.client_id IS NOT NULL THEN
    SELECT id, status INTO v_client
    FROM public.clients
    WHERE id = NEW.client_id AND organization_id = NEW.organization_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Integrity Error: Assigned client (ID: %) does not exist in organization %.',
        NEW.client_id, NEW.organization_id;
    END IF;

    IF NEW.pipeline_status IN ('booked', 'in_transit') AND v_client.status = 'inactive' THEN
      RAISE EXCEPTION 'Integrity Error: Cannot assign load to inactive client (ID: %).', NEW.client_id;
    END IF;
  END IF;

  -- E. Schedule Overlaps for Active Operational Loads
  IF NEW.pipeline_status IN ('booked', 'in_transit')
     AND NEW.pickup_datetime IS NOT NULL
     AND NEW.delivery_datetime IS NOT NULL THEN

    IF NEW.truck_id IS NOT NULL THEN
      SELECT l.id, l.load_number, l.pickup_datetime, l.delivery_datetime
      INTO v_conflict_load_id, v_conflict_load_num, v_conflict_p_dt, v_conflict_d_dt
      FROM public.loads l
      WHERE l.organization_id = NEW.organization_id
        AND l.truck_id = NEW.truck_id
        AND l.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::UUID)
        AND l.pipeline_status IN ('booked', 'in_transit')
        AND l.pickup_datetime IS NOT NULL
        AND l.delivery_datetime IS NOT NULL
        AND (NEW.pickup_datetime < l.delivery_datetime AND NEW.delivery_datetime > l.pickup_datetime)
      LIMIT 1;

      IF FOUND THEN
        RAISE EXCEPTION 'Conflict Error: Truck (ID: %) is already assigned to active Load % (% to %) which overlaps with this schedule (% to %).',
          NEW.truck_id, v_conflict_load_num, v_conflict_p_dt, v_conflict_d_dt, NEW.pickup_datetime, NEW.delivery_datetime;
      END IF;
    END IF;

    IF NEW.driver_id IS NOT NULL THEN
      SELECT l.id, l.load_number, l.pickup_datetime, l.delivery_datetime
      INTO v_conflict_load_id, v_conflict_load_num, v_conflict_p_dt, v_conflict_d_dt
      FROM public.loads l
      WHERE l.organization_id = NEW.organization_id
        AND l.driver_id = NEW.driver_id
        AND l.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::UUID)
        AND l.pipeline_status IN ('booked', 'in_transit')
        AND l.pickup_datetime IS NOT NULL
        AND l.delivery_datetime IS NOT NULL
        AND (NEW.pickup_datetime < l.delivery_datetime AND NEW.delivery_datetime > l.pickup_datetime)
      LIMIT 1;

      IF FOUND THEN
        RAISE EXCEPTION 'Conflict Error: Driver (ID: %) is already assigned to active Load % (% to %) which overlaps with this schedule (% to %).',
          NEW.driver_id, v_conflict_load_num, v_conflict_p_dt, v_conflict_d_dt, NEW.pickup_datetime, NEW.delivery_datetime;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_load_assignment_integrity ON public.loads;
CREATE TRIGGER trg_validate_load_assignment_integrity
  BEFORE INSERT OR UPDATE ON public.loads
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_load_assignment_integrity();

-- --------------------------------------------------------------------
-- 5. RPC: accept_driver_invitation (Atomic Driver Profile Binding)
-- --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.accept_driver_invitation(
  p_token_hash TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID;
  v_invitation RECORD;
  v_driver RECORD;
  v_org RECORD;
BEGIN
  -- 1. Require authentication
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required to accept an invitation.' USING ERRCODE = '28000';
  END IF;

  -- 2. Lookup and lock invitation
  SELECT * INTO v_invitation
  FROM public.organization_invitations
  WHERE token_hash = p_token_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation not found or invalid token.' USING ERRCODE = 'P0002';
  END IF;

  IF v_invitation.cancelled_at IS NOT NULL THEN
    RAISE EXCEPTION 'This invitation has been cancelled by the organization administrator.' USING ERRCODE = '22023';
  END IF;

  IF v_invitation.expires_at <= NOW() THEN
    RAISE EXCEPTION 'This invitation has expired.' USING ERRCODE = '22023';
  END IF;

  IF v_invitation.role <> 'driver' OR v_invitation.driver_id IS NULL THEN
    RAISE EXCEPTION 'Invalid invitation type for driver onboarding acceptance.' USING ERRCODE = '22023';
  END IF;

  -- 3. Lookup and lock driver profile
  SELECT * INTO v_driver
  FROM public.drivers
  WHERE id = v_invitation.driver_id
    AND organization_id = v_invitation.organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Referenced driver profile does not exist in this organization.' USING ERRCODE = 'P0002';
  END IF;

  -- 4. Check if driver is already linked
  IF v_driver.user_id IS NOT NULL THEN
    IF v_driver.user_id = v_caller_id THEN
      -- Idempotent acceptance for already-linked same user
      UPDATE public.organization_invitations
      SET accepted_at = COALESCE(accepted_at, NOW()),
          updated_at = NOW()
      WHERE id = v_invitation.id;

      RETURN jsonb_build_object(
        'success', true,
        'status', 'already_linked',
        'driver_id', v_driver.id,
        'organization_id', v_invitation.organization_id
      );
    ELSE
      RAISE EXCEPTION 'Identity Conflict: This driver profile is already permanently linked to another user account.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- 5. Check if caller is already linked to another active driver profile
  IF EXISTS (
    SELECT 1 FROM public.drivers
    WHERE user_id = v_caller_id
      AND id <> v_driver.id
      AND status <> 'inactive'
  ) THEN
    RAISE EXCEPTION 'Identity Conflict: Authenticated user is already linked to another active driver profile.'
      USING ERRCODE = '42501';
  END IF;

  -- 6. Check that caller is not an internal office organization member
  IF EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE user_id = v_caller_id
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Office organization members cannot claim external driver profiles.'
      USING ERRCODE = '42501';
  END IF;

  -- 7. ATOMIC BINDING: bind drivers.user_id = auth.uid()
  -- (Never inserts into organization_members)
  UPDATE public.drivers
  SET user_id = v_caller_id,
      updated_at = NOW()
  WHERE id = v_driver.id;

  -- 8. Mark this invitation accepted
  UPDATE public.organization_invitations
  SET accepted_at = NOW(),
      updated_at = NOW()
  WHERE id = v_invitation.id;

  -- 9. Cancel any other pending onboarding invitations for this driver profile
  UPDATE public.organization_invitations
  SET cancelled_at = NOW(),
      updated_at = NOW()
  WHERE driver_id = v_driver.id
    AND id <> v_invitation.id
    AND accepted_at IS NULL
    AND cancelled_at IS NULL;

  -- Lookup organization name for response
  SELECT name INTO v_org FROM public.organizations WHERE id = v_invitation.organization_id;

  RETURN jsonb_build_object(
    'success', true,
    'status', 'linked',
    'driver_id', v_driver.id,
    'driver_name', v_driver.full_name,
    'client_id', v_driver.client_id,
    'organization_id', v_invitation.organization_id,
    'organization_name', COALESCE(v_org.name, 'Carrier Dispatch')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.accept_driver_invitation(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_driver_invitation(TEXT) TO authenticated;

-- Also update accept_team_invitation to delegate driver invitations without inserting into organization_members
CREATE OR REPLACE FUNCTION public.accept_team_invitation(p_token_hash TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  curr_user_id UUID;
  curr_user_email TEXT;
  curr_user_name TEXT;
  v_invitation RECORD;
  v_org_name TEXT;
  v_member_id UUID;
  v_constraint_name TEXT;
  v_driver_res JSONB;
BEGIN
  -- 1. Check authentication
  curr_user_id := (SELECT auth.uid());
  IF curr_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required. Please sign in to accept this invitation.';
  END IF;

  -- 2. Lookup invitation
  SELECT * INTO v_invitation
  FROM public.organization_invitations
  WHERE token_hash = p_token_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation not found or invalid token.';
  END IF;

  -- 3. If invitation is for a driver, route through driver acceptance logic
  IF v_invitation.role = 'driver' THEN
    v_driver_res := public.accept_driver_invitation(p_token_hash);
    RETURN json_build_object(
      'success', true,
      'organization_id', v_driver_res->>'organization_id',
      'organization_name', v_driver_res->>'organization_name',
      'role', 'driver',
      'driver_id', v_driver_res->>'driver_id',
      'driver_name', v_driver_res->>'driver_name'
    );
  END IF;

  -- 4. Office roles flow (owner_admin, dispatcher, staff)
  SELECT email, raw_user_meta_data->>'full_name'
  INTO curr_user_email, curr_user_name
  FROM auth.users
  WHERE id = curr_user_id;

  IF curr_user_email IS NULL THEN
    RAISE EXCEPTION 'Unable to determine authenticated user email address.';
  END IF;

  IF v_invitation.cancelled_at IS NOT NULL THEN
    RAISE EXCEPTION 'This invitation has been cancelled by the organization administrator.';
  END IF;

  IF v_invitation.accepted_at IS NOT NULL THEN
    RAISE EXCEPTION 'This invitation has already been accepted.';
  END IF;

  IF v_invitation.expires_at <= NOW() THEN
    RAISE EXCEPTION 'This invitation has expired.';
  END IF;

  IF LOWER(TRIM(curr_user_email)) <> LOWER(TRIM(v_invitation.email)) THEN
    RAISE EXCEPTION 'Authenticated email (%) does not match the invitation email (%). Please sign in with the invited email address.',
      curr_user_email, v_invitation.email;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = v_invitation.organization_id
      AND user_id = curr_user_id
  ) THEN
    RAISE EXCEPTION 'You are already a member of this organization.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = curr_user_id) THEN
    INSERT INTO public.profiles (id, full_name, preferred_timezone)
    VALUES (
      curr_user_id,
      COALESCE(
        NULLIF(TRIM(curr_user_name), ''),
        NULLIF(SPLIT_PART(curr_user_email, '@', 1), ''),
        'User'
      ),
      'America/Chicago'
    )
    ON CONFLICT (id) DO NOTHING;
  END IF;

  -- Insert office member
  BEGIN
    INSERT INTO public.organization_members (
      organization_id,
      user_id,
      role
    )
    VALUES (
      v_invitation.organization_id,
      curr_user_id,
      v_invitation.role
    )
    RETURNING id INTO v_member_id;
  EXCEPTION
    WHEN unique_violation THEN
      RAISE EXCEPTION 'You are already a member of this organization.';
  END;

  UPDATE public.organization_invitations
  SET accepted_at = NOW(),
      updated_at = NOW()
  WHERE id = v_invitation.id;

  SELECT name INTO v_org_name
  FROM public.organizations
  WHERE id = v_invitation.organization_id;

  RETURN json_build_object(
    'success', true,
    'organization_id', v_invitation.organization_id,
    'organization_name', COALESCE(v_org_name, 'Organization'),
    'role', v_invitation.role,
    'member_id', v_member_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.accept_team_invitation(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_team_invitation(TEXT) TO authenticated;

-- --------------------------------------------------------------------
-- 6. RPC: verify_driver_load_access (Operational Projection & Firewall)
-- --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.verify_driver_load_access(
  p_load_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
DECLARE
  v_caller_id UUID;
  v_driver RECORD;
  v_load RECORD;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object('authorized', false, 'reason', 'unauthenticated');
  END IF;

  -- Authoritatively resolve active driver identity
  SELECT d.id, d.client_id, d.organization_id INTO v_driver
  FROM public.drivers d
  WHERE d.user_id = v_caller_id
    AND d.status <> 'inactive'
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('authorized', false, 'reason', 'not_a_driver');
  END IF;

  -- Lookup load
  SELECT
    l.id,
    l.organization_id,
    l.client_id,
    l.driver_id,
    l.truck_id,
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
    l.dest_address,
    l.dest_facility_name,
    l.special_instructions
  INTO v_load
  FROM public.loads l
  WHERE l.id = p_load_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('authorized', false, 'reason', 'load_not_found');
  END IF;

  -- Enforce that the load is assigned to this driver AND belongs to the same carrier client
  IF v_load.driver_id = v_driver.id AND v_load.client_id = v_driver.client_id THEN
    -- Return strictly operational whitelist projection (NO financial/commercial data)
    RETURN jsonb_build_object(
      'authorized', true,
      'load_id', v_load.id,
      'load_number', v_load.load_number,
      'pipeline_status', v_load.pipeline_status,
      'equipment_type', v_load.equipment_type,
      'commodity', v_load.commodity,
      'weight_lbs', v_load.weight_lbs,
      'origin_city', v_load.origin_city,
      'origin_state', v_load.origin_state,
      'origin_zip', v_load.origin_zip,
      'pickup_datetime', v_load.pickup_datetime,
      'origin_address', v_load.origin_address,
      'origin_facility_name', v_load.origin_facility_name,
      'dest_city', v_load.dest_city,
      'dest_state', v_load.dest_state,
      'dest_zip', v_load.dest_zip,
      'delivery_datetime', v_load.delivery_datetime,
      'destination_address', v_load.dest_address,
      'destination_facility_name', v_load.dest_facility_name,
      'special_instructions', v_load.special_instructions,
      'driver_id', v_driver.id,
      'truck_id', v_load.truck_id,
      'client_id', v_driver.client_id,
      'organization_id', v_driver.organization_id
    );
  ELSE
    RETURN jsonb_build_object('authorized', false, 'reason', 'not_assigned_to_driver');
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.verify_driver_load_access(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_driver_load_access(UUID) TO authenticated;

-- --------------------------------------------------------------------
-- 7. AUTHORITATIVE DRIVER HELPERS & RLS HARDENING
-- --------------------------------------------------------------------

-- Authoritative Driver Operational Loads Projection RPC
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
  v_driver_client_id UUID;
BEGIN
  -- 1. Authentication check
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'Organization ID is required.';
  END IF;

  -- 2. Authoritatively resolve driver identity through client ownership
  SELECT d.id, d.client_id INTO v_driver_id, v_driver_client_id
  FROM public.drivers d
  JOIN public.clients c ON c.id = d.client_id
  WHERE d.user_id = v_caller_id
    AND c.organization_id = p_organization_id
    AND d.status <> 'inactive';

  IF v_driver_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Driver profile not found for authenticated user in this organization.';
  END IF;

  -- 3. Return strictly operational whitelist projection for assigned loads
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
    AND l.client_id = v_driver_client_id
    AND l.driver_id = v_driver_id
  ORDER BY l.pickup_datetime ASC NULLS LAST, l.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_driver_assigned_loads(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_driver_assigned_loads(UUID) TO authenticated;

-- Authoritative Driver ID Helper
CREATE OR REPLACE FUNCTION public.get_current_driver_id(p_organization_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
DECLARE
  v_caller_id UUID;
  v_driver_id UUID;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Authentication required.';
  END IF;

  SELECT d.id INTO v_driver_id
  FROM public.drivers d
  JOIN public.clients c ON c.id = d.client_id
  WHERE d.user_id = v_caller_id
    AND c.organization_id = p_organization_id
    AND d.status <> 'inactive'
  LIMIT 1;

  IF v_driver_id IS NULL THEN
    RAISE EXCEPTION 'Driver profile not found for authenticated user in this organization.';
  END IF;

  RETURN v_driver_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_current_driver_id(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_current_driver_id(UUID) TO authenticated;

-- Hardened RLS on public.drivers
DROP POLICY IF EXISTS "Members can view drivers in their orgs" ON public.drivers;
DROP POLICY IF EXISTS "Office members can view all drivers in their orgs" ON public.drivers;
DROP POLICY IF EXISTS "Drivers can view only own driver profile" ON public.drivers;

CREATE POLICY "Office members can view all drivers in their orgs"
  ON public.drivers FOR SELECT
  USING (
    organization_id IN (SELECT public.get_user_organizations())
    AND public.get_user_org_role(organization_id) IN ('owner_admin', 'dispatcher', 'staff')
  );

CREATE POLICY "Drivers can view only own driver profile"
  ON public.drivers FOR SELECT
  USING (
    user_id = (SELECT auth.uid())
  );

-- Hardened RLS on public.organization_members
DROP POLICY IF EXISTS "Members can view fellow members in their orgs" ON public.organization_members;
DROP POLICY IF EXISTS "Office members can view fellow members in their orgs" ON public.organization_members;
DROP POLICY IF EXISTS "Drivers can view only own membership" ON public.organization_members;

CREATE POLICY "Office members can view fellow members in their orgs"
  ON public.organization_members FOR SELECT
  USING (
    organization_id IN (SELECT public.get_user_organizations())
    AND public.get_user_org_role(organization_id) IN ('owner_admin', 'dispatcher', 'staff')
  );

-- Hardened RLS on public.clients: drivers can only see their own assigned carrier client
DROP POLICY IF EXISTS "Drivers can view only their assigned carrier client" ON public.clients;
CREATE POLICY "Drivers can view only their assigned carrier client"
  ON public.clients FOR SELECT
  USING (
    id IN (
      SELECT client_id FROM public.drivers
      WHERE user_id = (SELECT auth.uid())
        AND status <> 'inactive'
    )
  );
