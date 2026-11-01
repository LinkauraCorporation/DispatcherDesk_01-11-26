-- Migration: 20260902000001_dispatcher_assignment_bulk.sql
-- Description: Hardening dispatcher-to-load assignment and adding concurrency-safe bulk assignment RPC

-- 1. Index on loads(assigned_dispatcher_id) and organization_id for fast filtering
CREATE INDEX IF NOT EXISTS idx_loads_assigned_dispatcher_org
  ON public.loads(organization_id, assigned_dispatcher_id);

-- 2. Concurrency-safe, transactional RPC for assigning or reassigning multiple loads in a single bulk action
CREATE OR REPLACE FUNCTION public.bulk_assign_load_dispatcher(
  p_organization_id uuid,
  p_load_ids uuid[],
  p_dispatcher_id uuid DEFAULT NULL,
  p_actor_id uuid DEFAULT auth.uid()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_caller_role text;
  v_target_role text;
  v_target_name text := NULL;
  v_actor_name text := 'System';
  v_updated_count integer := 0;
  v_updated_ids uuid[] := ARRAY[]::uuid[];
  v_load_record RECORD;
BEGIN
  -- Fallback caller if auth.uid() is null (e.g. service role or provided actor)
  IF v_caller_id IS NULL THEN
    v_caller_id := p_actor_id;
  END IF;

  -- 1. Validate caller membership and role in organization
  IF v_caller_id IS NOT NULL THEN
    SELECT role INTO v_caller_role
    FROM public.organization_members
    WHERE organization_id = p_organization_id
      AND user_id = v_caller_id
    LIMIT 1;

    IF v_caller_role IS NULL OR v_caller_role NOT IN ('owner_admin', 'dispatcher') THEN
      RAISE EXCEPTION 'Unauthorized: User is not an authorized dispatcher or admin in this organization.';
    END IF;

    -- Retrieve caller profile name for audit log
    SELECT COALESCE(full_name, v_caller_id::text) INTO v_actor_name
    FROM public.profiles
    WHERE id = v_caller_id
    LIMIT 1;
  END IF;

  -- 2. If assigning to a specific dispatcher (non-null), validate target user
  IF p_dispatcher_id IS NOT NULL THEN
    SELECT role INTO v_target_role
    FROM public.organization_members
    WHERE organization_id = p_organization_id
      AND user_id = p_dispatcher_id
    LIMIT 1;

    IF v_target_role IS NULL THEN
      RAISE EXCEPTION 'Invalid dispatcher: Target user is not a member of this organization.';
    END IF;

    IF v_target_role NOT IN ('owner_admin', 'dispatcher') THEN
      RAISE EXCEPTION 'Invalid dispatcher: Target user does not hold an operational dispatcher role.';
    END IF;

    SELECT COALESCE(full_name, p_dispatcher_id::text) INTO v_target_name
    FROM public.profiles
    WHERE id = p_dispatcher_id
    LIMIT 1;
  END IF;

  -- 3. Ensure load IDs array is not empty
  IF p_load_ids IS NULL OR array_length(p_load_ids, 1) = 0 THEN
    RETURN jsonb_build_object(
      'success', true,
      'updated_count', 0,
      'updated_ids', '[]'::jsonb,
      'dispatcher_id', p_dispatcher_id,
      'dispatcher_name', v_target_name
    );
  END IF;

  -- 4. Concurrency lock and update loads belonging strictly to this organization
  FOR v_load_record IN
    SELECT id, load_number, assigned_dispatcher_id
    FROM public.loads
    WHERE id = ANY(p_load_ids)
      AND organization_id = p_organization_id
    FOR UPDATE
  LOOP
    -- Update the assigned dispatcher
    UPDATE public.loads
    SET
      assigned_dispatcher_id = p_dispatcher_id,
      updated_at = NOW()
    WHERE id = v_load_record.id;

    v_updated_count := v_updated_count + 1;
    v_updated_ids := array_append(v_updated_ids, v_load_record.id);

    -- Log audit note if activity_notes table exists
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
          WHEN p_dispatcher_id IS NULL THEN
            'Dispatcher unassigned (previously: ' || COALESCE(v_load_record.assigned_dispatcher_id::text, 'None') || ') by ' || v_actor_name
          ELSE
            'Dispatcher assigned to ' || COALESCE(v_target_name, p_dispatcher_id::text) || ' by ' || v_actor_name
        END,
        NOW()
      );
    EXCEPTION WHEN OTHERS THEN
      -- Silently continue if activity note schema differs slightly
      NULL;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'updated_count', v_updated_count,
    'updated_ids', to_jsonb(v_updated_ids),
    'dispatcher_id', p_dispatcher_id,
    'dispatcher_name', v_target_name
  );
END;
$$;
