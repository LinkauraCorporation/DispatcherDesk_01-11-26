-- ====================================================================
-- DispatcherDesk Migration: Employee Load Access Control & Tenant Hardening
-- Version: 1.0.21
-- File: supabase/migrations/20261030000001_employee_load_access_control.sql
-- Description:
-- 1. Enforces strict role-based load visibility at the database RLS level:
--    - Owner Admin: can view and update all loads in the organization.
--    - Dispatcher / Staff (Employees): can view and update ONLY loads assigned
--      to them (via assigned_dispatcher_id or load_team_assignments).
--    - Non-assigned employees (ZERO assignments) receive 0 rows from direct
--      queries, API calls, and relational joins.
-- 2. Hardens related entity RLS policies:
--    - load_team_assignments: viewable only for authorized loads.
--    - documents: load-linked documents viewable only if load is assigned.
--    - check_calls: check calls viewable only if load is assigned.
--    - tasks: load-linked tasks viewable only if load is assigned.
--    - activity_notes: load-linked activity notes viewable only if load is assigned.
-- 3. Implements SECURITY DEFINER function public.user_has_load_access(p_load_id UUID, p_user_id UUID)
-- ====================================================================

-- --------------------------------------------------------------------
-- 1. Helper function: Determine if a user has access to a specific load
-- --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.user_has_load_access(
  p_load_id UUID,
  p_user_id UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.loads l
    JOIN public.organization_members om
      ON om.organization_id = l.organization_id
      AND om.user_id = COALESCE(p_user_id, auth.uid())
    WHERE l.id = p_load_id
      AND (
        om.role = 'owner_admin'
        OR (
          om.role IN ('dispatcher', 'staff')
          AND (
            l.assigned_dispatcher_id = COALESCE(p_user_id, auth.uid())
            OR EXISTS (
              SELECT 1
              FROM public.load_team_assignments lta
              WHERE lta.load_id = l.id
                AND lta.user_id = COALESCE(p_user_id, auth.uid())
            )
          )
        )
      )
  );
$$;

-- --------------------------------------------------------------------
-- 2. Harden direct SELECT RLS on public.loads
-- --------------------------------------------------------------------
DROP POLICY IF EXISTS "Members can view loads in their orgs" ON public.loads;
DROP POLICY IF EXISTS "Office members can view loads in their orgs" ON public.loads;
DROP POLICY IF EXISTS "Employee load access control select policy" ON public.loads;

CREATE POLICY "Employee load access control select policy"
  ON public.loads FOR SELECT
  USING (
    organization_id IN (SELECT public.get_user_organizations())
    AND (
      -- Owner admin: view all loads in their organization
      public.get_user_org_role(organization_id) = 'owner_admin'
      OR (
        -- Dispatcher / Staff: view ONLY loads assigned to them
        public.get_user_org_role(organization_id) IN ('dispatcher', 'staff')
        AND (
          assigned_dispatcher_id = auth.uid()
          OR EXISTS (
            SELECT 1
            FROM public.load_team_assignments lta
            WHERE lta.load_id = loads.id
              AND lta.user_id = auth.uid()
          )
        )
      )
    )
  );

-- --------------------------------------------------------------------
-- 3. Harden direct UPDATE RLS on public.loads
-- --------------------------------------------------------------------
DROP POLICY IF EXISTS "Dispatchers and admins can update loads" ON public.loads;
DROP POLICY IF EXISTS "Authorized members can update assigned loads" ON public.loads;

CREATE POLICY "Authorized members can update assigned loads"
  ON public.loads FOR UPDATE
  USING (
    organization_id IN (SELECT public.get_user_organizations())
    AND (
      public.get_user_org_role(organization_id) = 'owner_admin'
      OR (
        public.get_user_org_role(organization_id) IN ('dispatcher', 'staff')
        AND (
          assigned_dispatcher_id = auth.uid()
          OR EXISTS (
            SELECT 1
            FROM public.load_team_assignments lta
            WHERE lta.load_id = loads.id
              AND lta.user_id = auth.uid()
          )
        )
      )
    )
  )
  WITH CHECK (
    organization_id IN (SELECT public.get_user_organizations())
    AND (
      public.get_user_org_role(organization_id) = 'owner_admin'
      OR (
        public.get_user_org_role(organization_id) IN ('dispatcher', 'staff')
        AND (
          assigned_dispatcher_id = auth.uid()
          OR EXISTS (
            SELECT 1
            FROM public.load_team_assignments lta
            WHERE lta.load_id = loads.id
              AND lta.user_id = auth.uid()
          )
        )
      )
    )
  );

-- --------------------------------------------------------------------
-- 4. Harden load_team_assignments SELECT policy
-- --------------------------------------------------------------------
DROP POLICY IF EXISTS "Members can view load team assignments in their organizations" ON public.load_team_assignments;
DROP POLICY IF EXISTS "Members can view load team assignments with access" ON public.load_team_assignments;

CREATE POLICY "Members can view load team assignments with access"
  ON public.load_team_assignments FOR SELECT
  USING (
    organization_id IN (SELECT public.get_user_organizations())
    AND (
      public.get_user_org_role(organization_id) = 'owner_admin'
      OR (
        public.get_user_org_role(organization_id) IN ('dispatcher', 'staff')
        AND public.user_has_load_access(load_id)
      )
    )
  );

-- --------------------------------------------------------------------
-- 5. Harden documents SELECT policy for load-linked documents
-- --------------------------------------------------------------------
DROP POLICY IF EXISTS "Office members can view documents in their orgs" ON public.documents;
DROP POLICY IF EXISTS "Office members can view authorized documents" ON public.documents;

CREATE POLICY "Office members can view authorized documents"
  ON public.documents FOR SELECT
  USING (
    organization_id IN (SELECT public.get_user_organizations())
    AND (
      public.get_user_org_role(organization_id) = 'owner_admin'
      OR (
        public.get_user_org_role(organization_id) IN ('dispatcher', 'staff')
        AND (
          load_id IS NULL
          OR public.user_has_load_access(load_id)
        )
      )
    )
  );

-- --------------------------------------------------------------------
-- 6. Harden check_calls SELECT policy
-- --------------------------------------------------------------------
DROP POLICY IF EXISTS "Members can view check calls in their orgs" ON public.check_calls;
DROP POLICY IF EXISTS "Office members can view authorized check calls" ON public.check_calls;

CREATE POLICY "Office members can view authorized check calls"
  ON public.check_calls FOR SELECT
  USING (
    organization_id IN (SELECT public.get_user_organizations())
    AND (
      public.get_user_org_role(organization_id) = 'owner_admin'
      OR (
        public.get_user_org_role(organization_id) IN ('dispatcher', 'staff')
        AND public.user_has_load_access(load_id)
      )
    )
  );

-- --------------------------------------------------------------------
-- 7. Harden tasks SELECT policy
-- --------------------------------------------------------------------
DROP POLICY IF EXISTS "Members can view tasks in their orgs" ON public.tasks;
DROP POLICY IF EXISTS "Office members can view authorized tasks" ON public.tasks;

CREATE POLICY "Office members can view authorized tasks"
  ON public.tasks FOR SELECT
  USING (
    organization_id IN (SELECT public.get_user_organizations())
    AND (
      public.get_user_org_role(organization_id) = 'owner_admin'
      OR (
        public.get_user_org_role(organization_id) IN ('dispatcher', 'staff')
        AND (
          assigned_to_user_id = auth.uid()
          OR (load_id IS NOT NULL AND public.user_has_load_access(load_id))
          OR (load_id IS NULL AND assigned_to_user_id IS NULL)
        )
      )
    )
  );

-- --------------------------------------------------------------------
-- 8. Harden activity_notes SELECT policy
-- --------------------------------------------------------------------
DROP POLICY IF EXISTS "Members can view activity notes in their orgs" ON public.activity_notes;
DROP POLICY IF EXISTS "Office members can view authorized activity notes" ON public.activity_notes;

CREATE POLICY "Office members can view authorized activity notes"
  ON public.activity_notes FOR SELECT
  USING (
    organization_id IN (SELECT public.get_user_organizations())
    AND (
      public.get_user_org_role(organization_id) = 'owner_admin'
      OR (
        public.get_user_org_role(organization_id) IN ('dispatcher', 'staff')
        AND (
          load_id IS NULL
          OR public.user_has_load_access(load_id)
        )
      )
    )
  );
