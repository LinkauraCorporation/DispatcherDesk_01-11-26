-- ====================================================================
-- DispatcherDesk Migration: Load-Level Timezones Architecture (Phase 1)
-- Version: 1.0.38
-- File: supabase/migrations/20261024000001_load_level_timezones.sql
-- Description:
-- Adds canonical timezone metadata columns to public.loads:
-- 1. origin_timezone: Canonical timezone for pickup / origin appointment
-- 2. dest_timezone: Canonical timezone for delivery / destination appointment
-- 3. operational_timezone: Canonical timezone for dispatch operations, check calls, and tracking
-- Backfills all existing loads deterministically using origin_state, dest_state,
-- and organization primary_timezone without altering pickup_datetime or delivery_datetime.
-- ====================================================================

-- 1. Add timezone columns to public.loads with safe default
ALTER TABLE public.loads
  ADD COLUMN IF NOT EXISTS origin_timezone TEXT NOT NULL DEFAULT 'America/Chicago',
  ADD COLUMN IF NOT EXISTS dest_timezone TEXT NOT NULL DEFAULT 'America/Chicago',
  ADD COLUMN IF NOT EXISTS operational_timezone TEXT NOT NULL DEFAULT 'America/Chicago';

COMMENT ON COLUMN public.loads.origin_timezone IS 'Canonical IANA timezone for pickup/origin facility appointment.';
COMMENT ON COLUMN public.loads.dest_timezone IS 'Canonical IANA timezone for delivery/destination facility appointment.';
COMMENT ON COLUMN public.loads.operational_timezone IS 'Canonical IANA timezone for dispatch operations, check calls, tracking, shift handover, and load management.';

-- 2. Deterministic backfill of existing loads based on state mapping and organization primary timezone
UPDATE public.loads l
SET
  origin_timezone = CASE UPPER(TRIM(COALESCE(l.origin_state, '')))
    -- US Eastern
    WHEN 'CT' THEN 'America/New_York'
    WHEN 'DE' THEN 'America/New_York'
    WHEN 'DC' THEN 'America/New_York'
    WHEN 'FL' THEN 'America/New_York'
    WHEN 'GA' THEN 'America/New_York'
    WHEN 'IN' THEN 'America/New_York'
    WHEN 'KY' THEN 'America/New_York'
    WHEN 'ME' THEN 'America/New_York'
    WHEN 'MD' THEN 'America/New_York'
    WHEN 'MA' THEN 'America/New_York'
    WHEN 'MI' THEN 'America/New_York'
    WHEN 'NH' THEN 'America/New_York'
    WHEN 'NJ' THEN 'America/New_York'
    WHEN 'NY' THEN 'America/New_York'
    WHEN 'NC' THEN 'America/New_York'
    WHEN 'OH' THEN 'America/New_York'
    WHEN 'PA' THEN 'America/New_York'
    WHEN 'RI' THEN 'America/New_York'
    WHEN 'SC' THEN 'America/New_York'
    WHEN 'VA' THEN 'America/New_York'
    WHEN 'VT' THEN 'America/New_York'
    WHEN 'WV' THEN 'America/New_York'
    WHEN 'PR' THEN 'America/New_York'
    -- US Mountain
    WHEN 'AZ' THEN 'America/Denver'
    WHEN 'CO' THEN 'America/Denver'
    WHEN 'ID' THEN 'America/Denver'
    WHEN 'MT' THEN 'America/Denver'
    WHEN 'NM' THEN 'America/Denver'
    WHEN 'UT' THEN 'America/Denver'
    WHEN 'WY' THEN 'America/Denver'
    -- US Pacific / Alaska / Hawaii
    WHEN 'CA' THEN 'America/Los_Angeles'
    WHEN 'NV' THEN 'America/Los_Angeles'
    WHEN 'OR' THEN 'America/Los_Angeles'
    WHEN 'WA' THEN 'America/Los_Angeles'
    WHEN 'AK' THEN 'America/Los_Angeles'
    WHEN 'HI' THEN 'America/Los_Angeles'
    -- Canadian Provinces
    WHEN 'ON' THEN 'America/Toronto'
    WHEN 'QC' THEN 'America/Toronto'
    WHEN 'NB' THEN 'America/Toronto'
    WHEN 'NS' THEN 'America/Toronto'
    WHEN 'NL' THEN 'America/Toronto'
    WHEN 'PE' THEN 'America/Toronto'
    WHEN 'AB' THEN 'America/Denver'
    WHEN 'BC' THEN 'America/Los_Angeles'
    WHEN 'MB' THEN 'America/Chicago'
    WHEN 'SK' THEN 'America/Chicago'
    -- US Central (Default)
    WHEN 'AL' THEN 'America/Chicago'
    WHEN 'AR' THEN 'America/Chicago'
    WHEN 'IL' THEN 'America/Chicago'
    WHEN 'IA' THEN 'America/Chicago'
    WHEN 'KS' THEN 'America/Chicago'
    WHEN 'LA' THEN 'America/Chicago'
    WHEN 'MN' THEN 'America/Chicago'
    WHEN 'MS' THEN 'America/Chicago'
    WHEN 'MO' THEN 'America/Chicago'
    WHEN 'NE' THEN 'America/Chicago'
    WHEN 'ND' THEN 'America/Chicago'
    WHEN 'OK' THEN 'America/Chicago'
    WHEN 'SD' THEN 'America/Chicago'
    WHEN 'TN' THEN 'America/Chicago'
    WHEN 'TX' THEN 'America/Chicago'
    WHEN 'WI' THEN 'America/Chicago'
    ELSE 'America/Chicago'
  END,
  dest_timezone = CASE UPPER(TRIM(COALESCE(l.dest_state, '')))
    -- US Eastern
    WHEN 'CT' THEN 'America/New_York'
    WHEN 'DE' THEN 'America/New_York'
    WHEN 'DC' THEN 'America/New_York'
    WHEN 'FL' THEN 'America/New_York'
    WHEN 'GA' THEN 'America/New_York'
    WHEN 'IN' THEN 'America/New_York'
    WHEN 'KY' THEN 'America/New_York'
    WHEN 'ME' THEN 'America/New_York'
    WHEN 'MD' THEN 'America/New_York'
    WHEN 'MA' THEN 'America/New_York'
    WHEN 'MI' THEN 'America/New_York'
    WHEN 'NH' THEN 'America/New_York'
    WHEN 'NJ' THEN 'America/New_York'
    WHEN 'NY' THEN 'America/New_York'
    WHEN 'NC' THEN 'America/New_York'
    WHEN 'OH' THEN 'America/New_York'
    WHEN 'PA' THEN 'America/New_York'
    WHEN 'RI' THEN 'America/New_York'
    WHEN 'SC' THEN 'America/New_York'
    WHEN 'VA' THEN 'America/New_York'
    WHEN 'VT' THEN 'America/New_York'
    WHEN 'WV' THEN 'America/New_York'
    WHEN 'PR' THEN 'America/New_York'
    -- US Mountain
    WHEN 'AZ' THEN 'America/Denver'
    WHEN 'CO' THEN 'America/Denver'
    WHEN 'ID' THEN 'America/Denver'
    WHEN 'MT' THEN 'America/Denver'
    WHEN 'NM' THEN 'America/Denver'
    WHEN 'UT' THEN 'America/Denver'
    WHEN 'WY' THEN 'America/Denver'
    -- US Pacific / Alaska / Hawaii
    WHEN 'CA' THEN 'America/Los_Angeles'
    WHEN 'NV' THEN 'America/Los_Angeles'
    WHEN 'OR' THEN 'America/Los_Angeles'
    WHEN 'WA' THEN 'America/Los_Angeles'
    WHEN 'AK' THEN 'America/Los_Angeles'
    WHEN 'HI' THEN 'America/Los_Angeles'
    -- Canadian Provinces
    WHEN 'ON' THEN 'America/Toronto'
    WHEN 'QC' THEN 'America/Toronto'
    WHEN 'NB' THEN 'America/Toronto'
    WHEN 'NS' THEN 'America/Toronto'
    WHEN 'NL' THEN 'America/Toronto'
    WHEN 'PE' THEN 'America/Toronto'
    WHEN 'AB' THEN 'America/Denver'
    WHEN 'BC' THEN 'America/Los_Angeles'
    WHEN 'MB' THEN 'America/Chicago'
    WHEN 'SK' THEN 'America/Chicago'
    -- US Central (Default)
    WHEN 'AL' THEN 'America/Chicago'
    WHEN 'AR' THEN 'America/Chicago'
    WHEN 'IL' THEN 'America/Chicago'
    WHEN 'IA' THEN 'America/Chicago'
    WHEN 'KS' THEN 'America/Chicago'
    WHEN 'LA' THEN 'America/Chicago'
    WHEN 'MN' THEN 'America/Chicago'
    WHEN 'MS' THEN 'America/Chicago'
    WHEN 'MO' THEN 'America/Chicago'
    WHEN 'NE' THEN 'America/Chicago'
    WHEN 'ND' THEN 'America/Chicago'
    WHEN 'OK' THEN 'America/Chicago'
    WHEN 'SD' THEN 'America/Chicago'
    WHEN 'TN' THEN 'America/Chicago'
    WHEN 'TX' THEN 'America/Chicago'
    WHEN 'WI' THEN 'America/Chicago'
    ELSE 'America/Chicago'
  END,
  operational_timezone = COALESCE(
    (SELECT o.primary_timezone FROM public.organizations o WHERE o.id = l.organization_id),
    'America/Chicago'
  );
