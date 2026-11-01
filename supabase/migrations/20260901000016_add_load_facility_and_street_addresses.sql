-- Migration: 20260901000016_add_load_facility_and_street_addresses.sql
-- Description: Adds nullable facility names and street addresses to the public.loads table.
-- Compatible with all existing rows without breaking RLS, tenant isolation, or load lifecycle constraints.

ALTER TABLE public.loads
  ADD COLUMN IF NOT EXISTS origin_facility_name TEXT,
  ADD COLUMN IF NOT EXISTS origin_address TEXT,
  ADD COLUMN IF NOT EXISTS dest_facility_name TEXT,
  ADD COLUMN IF NOT EXISTS dest_address TEXT;

COMMENT ON COLUMN public.loads.origin_facility_name IS 'Shipper / pickup facility or dock name extracted from Rate Confirmation';
COMMENT ON COLUMN public.loads.origin_address IS 'Shipper / pickup street address extracted from Rate Confirmation';
COMMENT ON COLUMN public.loads.dest_facility_name IS 'Receiver / delivery facility or consignee dock name extracted from Rate Confirmation';
COMMENT ON COLUMN public.loads.dest_address IS 'Receiver / delivery street address extracted from Rate Confirmation';
