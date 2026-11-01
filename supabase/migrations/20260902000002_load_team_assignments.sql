-- ====================================================================
-- DispatcherDesk Migration: Multi-Team Member Load Assignments (Many-to-Many)
-- Version: 1.0.17
-- File: supabase/migrations/20260902000002_load_team_assignments.sql
-- Description:
-- 1. Creates public.load_team_assignments relational junction table (Load <-> Team Member)
-- 2. Adds unique constraint (load_id, user_id) to prevent duplicate assignments
-- 3. Enables RLS and establishes server-side validation trigger
-- 4. Provides transactional bulk_assign_load_team_members RPC (Add, Replace, Remove)
-- 5. Backfills existing assigned_dispatcher_id values into load_team_assignments
-- ====================================================================

-- 1. Create junction table for many-to-many load assignments
CREATE TABLE IF NOT EXISTS public.load_team_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  load_id UUID NOT NULL REFERENCES public.loads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT uq_load_team_assignment UNIQUE (load_id, user_id)
);

-- 2. Performance indexes for assignment lookups and tenant filtering
CREATE INDEX IF NOT EXISTS idx_load_team_assignments_load_id
  ON public.load_team_assignments(load_id);

CREATE INDEX IF NOT EXISTS idx_load_team_assignments_user_org
  ON public.load_team_assignments(organization_id, user_id);

CREATE INDEX IF NOT EXISTS idx_load_team_assignments_org_load
  ON public.load_team_assignments(organization_id, load_id);

-- 3. Enable Row Level Security
ALTER TABLE public.load_team_assignments ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies
DROP POLICY IF EXISTS "Members can view load team assignments in their organizations" ON public.load_team_assignments;
CREATE POLICY "Members can view load team assignments in their organizations"
  ON public.load_team_assignments FOR SELECT
  USING (
    organization_id IN (
      SELECT public.get_user_organizations()
    )
  );

DROP POLICY IF EXISTS "Authorized members can manage load team assignments" ON public.load_team_assignments;
CREATE POLICY "Authorized members can manage load team assignments"
  ON public.load_team_assignments FOR ALL
  USING (
    organization_id IN (
      SELECT om.organization_id
      FROM public.organization_members om
      WHERE om.user_id = auth.uid()
        AND om.role = 'owner_admin'
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT om.organization_id
      FROM public.organization_members om
      WHERE om.user_id = auth.uid()
        AND om.role = 'owner_admin'
    )
  );

-- 5. Server-Side Validation Trigger: Ensure Tenant Isolation & Valid Member Role
CREATE OR REPLACE FUNCTION public.validate_load_team_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_load_org_id UUID;
  v_member RECORD;
BEGIN
  -- Ensure organization_id is immutable on update
  IF TG_OP = 'UPDATE' AND NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'Security Violation: organization_id is immutable and cannot be reassigned across organizations (Target ID: %, New ID: %).',
      OLD.organization_id, NEW.organization_id;
  END IF;

  -- Verify the load belongs to the same organization
  SELECT organization_id INTO v_load_org_id
  FROM public.loads
  WHERE id = NEW.load_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Integrity Error: Target load % does not exist.', NEW.load_id;
  END IF;

  IF v_load_org_id <> NEW.organization_id THEN
    RAISE EXCEPTION 'Security Violation: Load organization (%) does not match assignment organization (%).',
      v_load_org_id, NEW.organization_id;
  END IF;

  -- Verify the assigned user is an active operational member of the organization
  SELECT role, user_id INTO v_member
  FROM public.organization_members
  WHERE organization_id = NEW.organization_id
    AND user_id = NEW.user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Security Violation: User % is not a member of organization %.',
      NEW.user_id, NEW.organization_id;
  END IF;

  IF v_member.role NOT IN ('owner_admin', 'dispatcher', 'staff') THEN
    RAISE EXCEPTION 'Security Violation: User % has role "%" which is not eligible for load assignment.',
      NEW.user_id, v_member.role;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_load_team_assignment ON public.load_team_assignments;
CREATE TRIGGER trg_validate_load_team_assignment
  BEFORE INSERT OR UPDATE ON public.load_team_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_load_team_assignment();

-- 5B. Attach organization_id immutability trigger
DROP TRIGGER IF EXISTS trg_protect_load_team_assignment_org_id ON public.load_team_assignments;
CREATE TRIGGER trg_protect_load_team_assignment_org_id
  BEFORE UPDATE ON public.load_team_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_organization_id_change();

-- 6. Backfill existing assigned_dispatcher_id from loads into load_team_assignments
INSERT INTO public.load_team_assignments (organization_id, load_id, user_id, created_at)
SELECT
  l.organization_id,
  l.id AS load_id,
  l.assigned_dispatcher_id AS user_id,
  NOW()
FROM public.loads l
JOIN public.organization_members om
  ON om.organization_id = l.organization_id
  AND om.user_id = l.assigned_dispatcher_id
WHERE l.assigned_dispatcher_id IS NOT NULL
ON CONFLICT (load_id, user_id) DO NOTHING;

-- 7. Transactional & Concurrency-Safe RPC for Multi-Member Assignment
CREATE OR REPLACE FUNCTION public.bulk_assign_load_team_members(
  p_organization_id UUID,
  p_load_ids UUID[],
  p_user_ids UUID[],
  p_mode TEXT DEFAULT 'add', -- 'add' | 'replace' | 'remove'
  p_actor_id UUID DEFAULT auth.uid()
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_caller_role TEXT;
  v_actor_name TEXT := 'System';
  v_target_user RECORD;
  v_valid_user_ids UUID[] := ARRAY[]::UUID[];
  v_target_names TEXT[] := ARRAY[]::TEXT[];
  v_updated_loads_count INTEGER := 0;
  v_total_assignments_count INTEGER := 0;
  v_load_record RECORD;
  v_uid UUID;
  v_first_assigned UUID := NULL;
  v_mode TEXT := LOWER(COALESCE(p_mode, 'add'));
BEGIN
  IF v_caller_id IS NULL THEN
    v_caller_id := p_actor_id;
  END IF;

  -- 1. Authorize caller
  IF v_caller_id IS NOT NULL THEN
    SELECT role INTO v_caller_role
    FROM public.organization_members
    WHERE organization_id = p_organization_id
      AND user_id = v_caller_id
    LIMIT 1;

    IF v_caller_role IS NULL OR v_caller_role <> 'owner_admin' THEN
      RAISE EXCEPTION 'Unauthorized: Only organization owner/admins can manage load team assignments.';
    END IF;

    SELECT COALESCE(full_name, v_caller_id::text) INTO v_actor_name
    FROM public.profiles
    WHERE id = v_caller_id
    LIMIT 1;
  END IF;

  -- 2. Validate target users belong to organization and have valid roles
  IF p_user_ids IS NOT NULL AND array_length(p_user_ids, 1) > 0 THEN
    FOR v_target_user IN
      SELECT om.user_id, om.role, COALESCE(p.full_name, om.user_id::text) AS full_name
      FROM public.organization_members om
      LEFT JOIN public.profiles p ON p.id = om.user_id
      WHERE om.organization_id = p_organization_id
        AND om.user_id = ANY(p_user_ids)
        AND om.role IN ('owner_admin', 'dispatcher', 'staff')
    LOOP
      v_valid_user_ids := array_append(v_valid_user_ids, v_target_user.user_id);
      v_target_names := array_append(v_target_names, v_target_user.full_name || ' (' || v_target_user.role || ')');
    END LOOP;

    -- If specific users were passed for add or replace but none are valid
    IF (v_mode IN ('add', 'replace')) AND array_length(v_valid_user_ids, 1) IS NULL THEN
      RAISE EXCEPTION 'Invalid team members: No active operational members found matching provided IDs.';
    END IF;
  END IF;

  IF p_load_ids IS NULL OR array_length(p_load_ids, 1) = 0 THEN
    RETURN jsonb_build_object(
      'success', true,
      'updated_loads_count', 0,
      'total_assignments_count', 0,
      'load_ids', '[]'::jsonb,
      'mode', v_mode
    );
  END IF;

  -- 3. Process each target load with row lock
  FOR v_load_record IN
    SELECT id, load_number, assigned_dispatcher_id, pipeline_status
    FROM public.loads
    WHERE id = ANY(p_load_ids)
      AND organization_id = p_organization_id
    FOR UPDATE
  LOOP
    -- Enforce terminal state lifecycle immutability (S6.4 alignment)
    IF v_load_record.pipeline_status IN ('invoiced', 'paid') THEN
      RAISE EXCEPTION 'Integrity Error: Cannot modify team assignments on an % load (ID: %, Load Number: %). Load must be reopened first.',
        UPPER(v_load_record.pipeline_status), v_load_record.id, COALESCE(v_load_record.load_number, 'N/A');
    END IF;

    v_updated_loads_count := v_updated_loads_count + 1;

    IF v_mode = 'replace' THEN
      -- Remove all existing team assignments for this load
      DELETE FROM public.load_team_assignments
      WHERE load_id = v_load_record.id
        AND organization_id = p_organization_id;

      -- Insert all new valid assignments
      IF array_length(v_valid_user_ids, 1) > 0 THEN
        FOREACH v_uid IN ARRAY v_valid_user_ids
        LOOP
          INSERT INTO public.load_team_assignments (
            organization_id,
            load_id,
            user_id,
            created_by
          ) VALUES (
            p_organization_id,
            v_load_record.id,
            v_uid,
            v_caller_id
          ) ON CONFLICT (load_id, user_id) DO NOTHING;
          v_total_assignments_count := v_total_assignments_count + 1;
        END LOOP;
      END IF;

    ELSIF v_mode = 'add' THEN
      -- Add new assignments preserving existing ones
      IF array_length(v_valid_user_ids, 1) > 0 THEN
        FOREACH v_uid IN ARRAY v_valid_user_ids
        LOOP
          INSERT INTO public.load_team_assignments (
            organization_id,
            load_id,
            user_id,
            created_by
          ) VALUES (
            p_organization_id,
            v_load_record.id,
            v_uid,
            v_caller_id
          ) ON CONFLICT (load_id, user_id) DO NOTHING;
          v_total_assignments_count := v_total_assignments_count + 1;
        END LOOP;
      END IF;

    ELSIF v_mode = 'remove' THEN
      -- Remove specific users or all if no user IDs specified
      IF array_length(p_user_ids, 1) > 0 THEN
        DELETE FROM public.load_team_assignments
        WHERE load_id = v_load_record.id
          AND organization_id = p_organization_id
          AND user_id = ANY(p_user_ids);
      ELSE
        DELETE FROM public.load_team_assignments
        WHERE load_id = v_load_record.id
          AND organization_id = p_organization_id;
      END IF;
    END IF;

    -- Sync primary assignee for backward compatibility (assigned_dispatcher_id on loads)
    SELECT user_id INTO v_first_assigned
    FROM public.load_team_assignments
    WHERE load_id = v_load_record.id
    ORDER BY created_at ASC
    LIMIT 1;

    UPDATE public.loads
    SET
      assigned_dispatcher_id = v_first_assigned,
      updated_at = NOW()
    WHERE id = v_load_record.id;

    -- Log audit activity
    BEGIN
      INSERT INTO public.activity_notes (
        id,
        organization_id,
        load_id,
        actor_id,
        note_type,
        content,
        created_at
      ) VALUES (
        gen_random_uuid(),
        p_organization_id,
        v_load_record.id,
        v_caller_id,
        'assignment_change',
        CASE
          WHEN v_mode = 'replace' THEN
            'Load team assignments replaced with: ' || COALESCE(array_to_string(v_target_names, ', '), 'None') || ' by ' || v_actor_name
          WHEN v_mode = 'add' THEN
            'Team members added to load: ' || COALESCE(array_to_string(v_target_names, ', '), 'None') || ' by ' || v_actor_name
          WHEN v_mode = 'remove' THEN
            'Team members removed from load by ' || v_actor_name
          ELSE 'Team assignment updated by ' || v_actor_name
        END,
        NOW()
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'updated_loads_count', v_updated_loads_count,
    'total_assignments_count', v_total_assignments_count,
    'load_ids', to_jsonb(p_load_ids),
    'mode', v_mode,
    'user_ids', to_jsonb(v_valid_user_ids)
  );
END;
$$;

-- 8. Grant execution permission on bulk assignment RPC to authenticated users
GRANT EXECUTE ON FUNCTION public.bulk_assign_load_team_members(UUID, UUID[], UUID[], TEXT, UUID) TO authenticated;

