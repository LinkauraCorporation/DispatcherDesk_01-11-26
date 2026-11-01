-- Migration: 20260830000015_activity_notes_assignment_change_type.sql
-- Description: Updates activity_notes_note_type_check to allow 'assignment_change' (and preserves existing types)
--              and updates assign_load_dispatch() RPC to insert note_type = 'assignment_change'.

-- 1. Update activity_notes_note_type_check constraint on public.activity_notes
ALTER TABLE public.activity_notes DROP CONSTRAINT IF EXISTS activity_notes_note_type_check;

ALTER TABLE public.activity_notes ADD CONSTRAINT activity_notes_note_type_check
  CHECK (note_type IN (
    'broker_call',
    'driver_check',
    'handover',
    'general',
    'rate_negotiation',
    'assignment_change',
    'status_change'
  ));

-- 2. Update assign_load_dispatch RPC to authoritatively insert note_type = 'assignment_change'
CREATE OR REPLACE FUNCTION public.assign_load_dispatch(
  p_organization_id UUID,
  p_load_id UUID,
  p_truck_id UUID DEFAULT NULL,
  p_driver_id UUID DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID;
  v_load RECORD;
  v_truck RECORD;
  v_driver RECORD;
  v_result JSONB;
BEGIN
  -- 1. Authentication check
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  -- 2. Authorization check
  IF NOT public.has_operational_write_access(p_organization_id) THEN
    RAISE EXCEPTION 'Unauthorized: Operational write access required to assign dispatch resources.';
  END IF;

  -- 3. Row lock on Load to prevent concurrent race conditions
  SELECT * INTO v_load
  FROM public.loads
  WHERE id = p_load_id AND organization_id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Load not found in specified organization.';
  END IF;

  -- Row lock on Truck (if provided)
  IF p_truck_id IS NOT NULL THEN
    SELECT * INTO v_truck
    FROM public.trucks
    WHERE id = p_truck_id AND organization_id = p_organization_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Truck not found in specified organization.';
    END IF;
  END IF;

  -- Row lock on Driver (if provided)
  IF p_driver_id IS NOT NULL THEN
    SELECT * INTO v_driver
    FROM public.drivers
    WHERE id = p_driver_id AND organization_id = p_organization_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Driver not found in specified organization.';
    END IF;
  END IF;

  -- 4. Perform Update (triggers trg_validate_load_lifecycle with locks active)
  UPDATE public.loads
  SET 
    truck_id = p_truck_id,
    driver_id = p_driver_id,
    updated_at = NOW()
  WHERE id = p_load_id AND organization_id = p_organization_id;

  -- 5. Record Activity Note for assignment change (note_type = 'assignment_change')
  IF (v_load.truck_id IS DISTINCT FROM p_truck_id) OR (v_load.driver_id IS DISTINCT FROM p_driver_id) THEN
    INSERT INTO public.activity_notes (
      organization_id,
      load_id,
      author_id,
      author_name,
      note_type,
      content,
      metadata
    ) VALUES (
      p_organization_id,
      p_load_id,
      v_caller_id,
      'System Dispatcher',
      'assignment_change',
      format('Dispatch assignment updated. Truck: %s -> %s. Driver: %s -> %s.%s',
        COALESCE(v_load.truck_id::text, 'None'), COALESCE(p_truck_id::text, 'None'),
        COALESCE(v_load.driver_id::text, 'None'), COALESCE(p_driver_id::text, 'None'),
        CASE WHEN p_notes IS NOT NULL AND TRIM(p_notes) <> '' THEN ' ' || p_notes ELSE '' END
      ),
      jsonb_build_object(
        'previous_truck_id', v_load.truck_id,
        'new_truck_id', p_truck_id,
        'previous_driver_id', v_load.driver_id,
        'new_driver_id', p_driver_id
      )
    );
  END IF;

  -- 6. Return updated record
  SELECT to_jsonb(l) INTO v_result
  FROM public.loads l
  WHERE l.id = p_load_id;

  RETURN v_result;
END;
$$;

-- Grant execution to authenticated users
GRANT EXECUTE ON FUNCTION public.assign_load_dispatch(UUID, UUID, UUID, UUID, TEXT) TO authenticated;
