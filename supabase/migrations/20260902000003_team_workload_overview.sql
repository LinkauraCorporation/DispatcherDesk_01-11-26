-- ====================================================================
-- DispatcherDesk Migration: Team Workload & Assignment Aggregation RPC
-- Version: 1.0.18
-- File: supabase/migrations/20260902000003_team_workload_overview.sql
-- Description:
-- 1. Provides public.get_team_workload_overview RPC for high-performance,
--    tenant-isolated member workload statistics and organization load summaries.
-- 2. Strictly enforces Row-Level Security and Organization access boundaries.
-- 3. Accurately distinguishes between unique active loads and total assignment relationships.
-- ====================================================================

CREATE OR REPLACE FUNCTION public.get_team_workload_overview(
  p_organization_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_role TEXT;
  v_result JSONB;
  v_total_eligible_members INT := 0;
  v_assigned_active_loads_count INT := 0;
  v_unassigned_active_loads_count INT := 0;
  v_total_active_assignments_count INT := 0;
  v_total_unique_active_loads INT := 0;
  v_members_json JSONB;
BEGIN
  -- 1. Verify caller has membership and owner_admin permission in target organization
  SELECT om.role INTO v_caller_role
  FROM public.organization_members om
  WHERE om.organization_id = p_organization_id
    AND om.user_id = auth.uid();

  IF v_caller_role IS NULL OR v_caller_role <> 'owner_admin' THEN
    RAISE EXCEPTION 'Access Denied: Only organization owner/admins can view the team workload overview.';
  END IF;

  -- 2. Count eligible organization members
  SELECT COUNT(*)
  INTO v_total_eligible_members
  FROM public.organization_members
  WHERE organization_id = p_organization_id;

  -- 3. Compute organization-level load metrics
  -- Active statuses: 'sourced', 'negotiating', 'booked', 'in_transit'
  WITH active_org_loads AS (
    SELECT
      l.id,
      l.load_number,
      l.pipeline_status,
      l.rate,
      l.origin_city,
      l.origin_state,
      l.dest_city,
      l.dest_state,
      l.pickup_datetime,
      l.delivery_datetime,
      COUNT(lta.id) AS assignment_count
    FROM public.loads l
    LEFT JOIN public.load_team_assignments lta
      ON l.id = lta.load_id AND lta.organization_id = p_organization_id
    WHERE l.organization_id = p_organization_id
      AND l.pipeline_status IN ('sourced', 'negotiating', 'booked', 'in_transit')
    GROUP BY l.id
  )
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE assignment_count > 0),
    COUNT(*) FILTER (WHERE assignment_count = 0),
    COALESCE(SUM(assignment_count), 0)
  INTO
    v_total_unique_active_loads,
    v_assigned_active_loads_count,
    v_unassigned_active_loads_count,
    v_total_active_assignments_count
  FROM active_org_loads;

  -- 4. Aggregate workload stats per team member
  WITH member_loads AS (
    SELECT
      om.id AS member_id,
      om.user_id,
      om.role,
      om.created_at AS member_joined_at,
      p.full_name,
      p.phone,
      p.preferred_timezone,
      u.email,
      -- Unique active loads assigned to this member
      COUNT(DISTINCT l.id) FILTER (WHERE l.pipeline_status IN ('sourced', 'negotiating', 'booked', 'in_transit')) AS active_loads_count,
      COUNT(DISTINCT l.id) FILTER (WHERE l.pipeline_status IN ('sourced', 'negotiating', 'booked')) AS pending_loads_count,
      COUNT(DISTINCT l.id) FILTER (WHERE l.pipeline_status = 'in_transit') AS in_progress_loads_count,
      COUNT(DISTINCT l.id) FILTER (WHERE l.pipeline_status = 'delivered') AS delivered_loads_count,
      COUNT(DISTINCT l.id) FILTER (WHERE l.pipeline_status = 'invoiced') AS invoiced_loads_count,
      COUNT(DISTINCT l.id) FILTER (WHERE l.pipeline_status = 'paid') AS paid_loads_count,
      COUNT(DISTINCT l.id) AS total_assigned_loads_count,
      MAX(COALESCE(lta.created_at, l.updated_at, l.created_at)) AS last_activity_at
    FROM public.organization_members om
    LEFT JOIN public.profiles p ON om.user_id = p.id
    LEFT JOIN auth.users u ON om.user_id = u.id
    LEFT JOIN public.load_team_assignments lta
      ON om.user_id = lta.user_id AND lta.organization_id = p_organization_id
    LEFT JOIN public.loads l
      ON lta.load_id = l.id AND l.organization_id = p_organization_id
    WHERE om.organization_id = p_organization_id
    GROUP BY om.id, om.user_id, om.role, om.created_at, p.full_name, p.phone, p.preferred_timezone, u.email
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'member_id', member_id,
      'user_id', user_id,
      'role', role,
      'full_name', full_name,
      'phone', phone,
      'email', email,
      'preferred_timezone', preferred_timezone,
      'active_loads_count', active_loads_count,
      'pending_loads_count', pending_loads_count,
      'in_progress_loads_count', in_progress_loads_count,
      'delivered_loads_count', delivered_loads_count,
      'invoiced_loads_count', invoiced_loads_count,
      'paid_loads_count', paid_loads_count,
      'total_assigned_loads_count', total_assigned_loads_count,
      'last_activity_at', last_activity_at
    )
    ORDER BY active_loads_count DESC, full_name ASC
  )
  INTO v_members_json
  FROM member_loads;

  -- 5. Construct final JSON result
  v_result := jsonb_build_object(
    'organization_id', p_organization_id,
    'total_eligible_members', v_total_eligible_members,
    'total_unique_active_loads', v_total_unique_active_loads,
    'assigned_active_loads_count', v_assigned_active_loads_count,
    'unassigned_active_loads_count', v_unassigned_active_loads_count,
    'total_active_assignments_count', v_total_active_assignments_count,
    'members', COALESCE(v_members_json, '[]'::jsonb)
  );

  RETURN v_result;
END;
$$;

-- Grant execution permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_team_workload_overview(UUID) TO authenticated;
