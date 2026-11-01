-- ====================================================================
-- DispatchDesk Multi-Tenant Database Schema & Row-Level Security (RLS)
-- Version: 1.0.0
-- ====================================================================

-- 1. Enable Required Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Custom Types / Enums (or check constraints)
-- Role enum: 'owner_admin', 'dispatcher', 'staff'
-- Client type: 'owner_operator', 'fleet'
-- Pipeline status: 'sourced', 'negotiating', 'booked', 'in_transit', 'delivered', 'invoiced', 'paid'
-- Document type: 'rate_confirmation', 'bol', 'pod', 'invoice', 'other'
-- Document status: 'missing', 'pending', 'received', 'verified'

-- 3. Trigger for updating updated_at timestamp
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ====================================================================
-- Table: organizations
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT,
  dot_number TEXT,
  mc_number TEXT,
  primary_timezone TEXT NOT NULL DEFAULT 'America/Chicago',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Case-insensitive unique index on organization slug
CREATE UNIQUE INDEX IF NOT EXISTS idx_organizations_lower_slug
  ON public.organizations (LOWER(TRIM(slug)))
  WHERE slug IS NOT NULL AND TRIM(slug) <> '';

CREATE TRIGGER set_organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ====================================================================
-- Table: profiles (1:1 with auth.users)
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  phone TEXT,
  preferred_timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ====================================================================
-- Table: organization_members
-- Maps auth.users to organizations with strict roles
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner_admin', 'dispatcher', 'staff')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_org_user UNIQUE (organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_org_members_user_id ON public.organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_org_id ON public.organization_members(organization_id);

CREATE TRIGGER set_org_members_updated_at
  BEFORE UPDATE ON public.organization_members
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ====================================================================
-- Table: clients (Carrier clients / Owner-Operators / Small Fleets)
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  client_type TEXT NOT NULL CHECK (client_type IN ('owner_operator', 'fleet')),
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  billing_email TEXT,
  preferred_equipment TEXT,
  preferred_lanes TEXT,
  minimum_rate_per_mile NUMERIC(10,2) DEFAULT 0.00,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_clients_org_id UNIQUE (organization_id, id)
);

CREATE INDEX IF NOT EXISTS idx_clients_org_id ON public.clients(organization_id);

CREATE TRIGGER set_clients_updated_at
  BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ====================================================================
-- Table: brokers (Brokers / Shippers / Freight Forwarders)
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.brokers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  mc_number TEXT,
  dot_number TEXT,
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  payment_terms_days INTEGER DEFAULT 30,
  credit_status TEXT NOT NULL DEFAULT 'approved' CHECK (credit_status IN ('approved', 'caution', 'blocked', 'factoring_only')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_brokers_org_id UNIQUE (organization_id, id)
);

CREATE INDEX IF NOT EXISTS idx_brokers_org_id ON public.brokers(organization_id);

CREATE TRIGGER set_brokers_updated_at
  BEFORE UPDATE ON public.brokers
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ====================================================================
-- Table: trucks
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.trucks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID,
  truck_number TEXT NOT NULL,
  vin TEXT,
  equipment_type TEXT NOT NULL DEFAULT 'dry_van' CHECK (equipment_type IN ('dry_van', 'reefer', 'flatbed', 'step_deck', 'power_only', 'box_truck', 'hotshot')),
  max_weight_lbs INTEGER,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'maintenance', 'inactive')),
  current_location_city TEXT,
  current_location_state TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_trucks_org_id UNIQUE (organization_id, id),
  CONSTRAINT fk_trucks_client FOREIGN KEY (organization_id, client_id) REFERENCES public.clients(organization_id, id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_trucks_org_id ON public.trucks(organization_id);
CREATE INDEX IF NOT EXISTS idx_trucks_client_id ON public.trucks(client_id);

CREATE TRIGGER set_trucks_updated_at
  BEFORE UPDATE ON public.trucks
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ====================================================================
-- Table: drivers
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.drivers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID,
  assigned_truck_id UUID,
  full_name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  pay_type TEXT NOT NULL DEFAULT 'percentage_gross' CHECK (pay_type IN ('percentage_gross', 'per_mile', 'flat_rate')),
  pay_rate NUMERIC(10,2) DEFAULT 0.00,
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'on_load', 'off_duty')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_drivers_org_id UNIQUE (organization_id, id),
  CONSTRAINT fk_drivers_client FOREIGN KEY (organization_id, client_id) REFERENCES public.clients(organization_id, id) ON DELETE SET NULL,
  CONSTRAINT fk_drivers_truck FOREIGN KEY (organization_id, assigned_truck_id) REFERENCES public.trucks(organization_id, id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_drivers_org_id ON public.drivers(organization_id);
CREATE INDEX IF NOT EXISTS idx_drivers_client_id ON public.drivers(client_id);
CREATE INDEX IF NOT EXISTS idx_drivers_truck_id ON public.drivers(assigned_truck_id);

CREATE TRIGGER set_drivers_updated_at
  BEFORE UPDATE ON public.drivers
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ====================================================================
-- Table: loads
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.loads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  load_number TEXT NOT NULL,
  client_id UUID,
  broker_id UUID,
  truck_id UUID,
  driver_id UUID,
  assigned_dispatcher_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- Pipeline Stage
  pipeline_status TEXT NOT NULL DEFAULT 'sourced' CHECK (
    pipeline_status IN ('sourced', 'negotiating', 'booked', 'in_transit', 'delivered', 'invoiced', 'paid')
  ),
  
  -- Cargo / Equipment
  equipment_type TEXT NOT NULL DEFAULT 'dry_van',
  commodity TEXT,
  weight_lbs NUMERIC(10,2),
  
  -- Route & Stops
  origin_city TEXT NOT NULL,
  origin_state TEXT NOT NULL,
  origin_zip TEXT,
  pickup_datetime TIMESTAMPTZ,
  
  dest_city TEXT NOT NULL,
  dest_state TEXT NOT NULL,
  dest_zip TEXT,
  delivery_datetime TIMESTAMPTZ,
  
  -- Financials & Mileage (Deterministic)
  rate NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  loaded_miles NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  deadhead_miles NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  fuel_expense NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  driver_pay NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  other_expenses NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  
  special_instructions TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_loads_org_id UNIQUE (organization_id, id),
  CONSTRAINT fk_loads_client FOREIGN KEY (organization_id, client_id) REFERENCES public.clients(organization_id, id) ON DELETE SET NULL,
  CONSTRAINT fk_loads_broker FOREIGN KEY (organization_id, broker_id) REFERENCES public.brokers(organization_id, id) ON DELETE SET NULL,
  CONSTRAINT fk_loads_truck FOREIGN KEY (organization_id, truck_id) REFERENCES public.trucks(organization_id, id) ON DELETE SET NULL,
  CONSTRAINT fk_loads_driver FOREIGN KEY (organization_id, driver_id) REFERENCES public.drivers(organization_id, id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_loads_org_id ON public.loads(organization_id);
CREATE INDEX IF NOT EXISTS idx_loads_client_id ON public.loads(client_id);
CREATE INDEX IF NOT EXISTS idx_loads_broker_id ON public.loads(broker_id);
CREATE INDEX IF NOT EXISTS idx_loads_truck_id ON public.loads(truck_id);
CREATE INDEX IF NOT EXISTS idx_loads_driver_id ON public.loads(driver_id);
CREATE INDEX IF NOT EXISTS idx_loads_pipeline_status ON public.loads(pipeline_status);
CREATE INDEX IF NOT EXISTS idx_loads_dispatcher_id ON public.loads(assigned_dispatcher_id);

CREATE TRIGGER set_loads_updated_at
  BEFORE UPDATE ON public.loads
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ====================================================================
-- Table: documents
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  load_id UUID,
  doc_type TEXT NOT NULL CHECK (doc_type IN ('rate_confirmation', 'bol', 'pod', 'invoice', 'other')),
  doc_status TEXT NOT NULL DEFAULT 'missing' CHECK (doc_status IN ('missing', 'pending', 'received', 'verified')),
  file_path TEXT,
  file_name TEXT,
  file_size_bytes BIGINT,
  mime_type TEXT,
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_documents_load FOREIGN KEY (organization_id, load_id) REFERENCES public.loads(organization_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_documents_org_id ON public.documents(organization_id);
CREATE INDEX IF NOT EXISTS idx_documents_load_id ON public.documents(load_id);

CREATE TRIGGER set_documents_updated_at
  BEFORE UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ====================================================================
-- Table: activity_notes
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.activity_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  load_id UUID,
  truck_id UUID,
  author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  note_type TEXT NOT NULL DEFAULT 'general' CHECK (note_type IN ('broker_call', 'driver_check', 'handover', 'general', 'rate_negotiation')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_activity_notes_load FOREIGN KEY (organization_id, load_id) REFERENCES public.loads(organization_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_activity_notes_truck FOREIGN KEY (organization_id, truck_id) REFERENCES public.trucks(organization_id, id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_activity_notes_org_id ON public.activity_notes(organization_id);
CREATE INDEX IF NOT EXISTS idx_activity_notes_load_id ON public.activity_notes(load_id);

-- ====================================================================
-- SECURITY DEFINER Helper Functions
-- Uses safe fixed search_path = public, pg_temp
-- Exposes ONLY organizations for the current authenticated user (auth.uid())
-- ====================================================================

-- 1. Get list of org IDs the user belongs to
CREATE OR REPLACE FUNCTION public.get_user_organizations()
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  SELECT organization_id
  FROM public.organization_members
  WHERE user_id = (SELECT auth.uid());
$$;

-- 2. Get role of user inside a specific organization
CREATE OR REPLACE FUNCTION public.get_user_org_role(target_org_id UUID)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  SELECT role
  FROM public.organization_members
  WHERE organization_id = target_org_id
    AND user_id = (SELECT auth.uid())
  LIMIT 1;
$$;

-- 3. Check if user is owner_admin in a specific organization
CREATE OR REPLACE FUNCTION public.is_org_owner_admin(target_org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members
    WHERE organization_id = target_org_id
      AND user_id = (SELECT auth.uid())
      AND role = 'owner_admin'
  );
$$;

-- 4. Check if user is dispatcher or owner_admin (operational write privilege)
CREATE OR REPLACE FUNCTION public.has_operational_write_access(target_org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members
    WHERE organization_id = target_org_id
      AND user_id = (SELECT auth.uid())
      AND role IN ('owner_admin', 'dispatcher')
  );
$$;

-- 5. Safe bootstrap function for organization creation
-- Allows any authenticated user to create an organization AND become its owner_admin in one transaction
CREATE OR REPLACE FUNCTION public.create_organization_with_admin(
  org_name TEXT,
  org_slug TEXT,
  org_primary_timezone TEXT DEFAULT 'America/Chicago'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  new_org_id UUID;
  curr_user_id UUID;
  clean_slug TEXT;
BEGIN
  curr_user_id := (SELECT auth.uid());
  IF curr_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF org_name IS NULL OR TRIM(org_name) = '' THEN
    RAISE EXCEPTION 'Organization name cannot be empty';
  END IF;

  clean_slug := NULLIF(LOWER(TRIM(org_slug)), '');

  INSERT INTO public.organizations (name, slug, primary_timezone)
  VALUES (TRIM(org_name), clean_slug, COALESCE(org_primary_timezone, 'America/Chicago'))
  RETURNING id INTO new_org_id;

  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES (new_org_id, curr_user_id, 'owner_admin');

  RETURN new_org_id;
END;
$$;

-- ====================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ====================================================================

-- 1. profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own profile"
  ON public.profiles FOR SELECT
  USING (id = (SELECT auth.uid()));

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (id = (SELECT auth.uid()))
  WITH CHECK (id = (SELECT auth.uid()));

CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (id = (SELECT auth.uid()));

-- 2. organizations
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view their organizations"
  ON public.organizations FOR SELECT
  USING (id IN (SELECT public.get_user_organizations()));

CREATE POLICY "Owner admins can update organization settings"
  ON public.organizations FOR UPDATE
  USING (public.is_org_owner_admin(id))
  WITH CHECK (public.is_org_owner_admin(id));

-- 3. organization_members
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view fellow members in their orgs"
  ON public.organization_members FOR SELECT
  USING (organization_id IN (SELECT public.get_user_organizations()));

CREATE POLICY "Owner admins can manage members"
  ON public.organization_members FOR ALL
  USING (public.is_org_owner_admin(organization_id))
  WITH CHECK (public.is_org_owner_admin(organization_id));

-- 4. clients
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view clients in their orgs"
  ON public.clients FOR SELECT
  USING (organization_id IN (SELECT public.get_user_organizations()));

CREATE POLICY "Dispatchers and admins can insert clients"
  ON public.clients FOR INSERT
  WITH CHECK (
    organization_id IN (SELECT public.get_user_organizations())
    AND public.has_operational_write_access(organization_id)
  );

CREATE POLICY "Dispatchers and admins can update clients"
  ON public.clients FOR UPDATE
  USING (
    organization_id IN (SELECT public.get_user_organizations())
    AND public.has_operational_write_access(organization_id)
  )
  WITH CHECK (
    organization_id IN (SELECT public.get_user_organizations())
    AND public.has_operational_write_access(organization_id)
  );

CREATE POLICY "Owner admins can delete clients"
  ON public.clients FOR DELETE
  USING (public.is_org_owner_admin(organization_id));

-- 5. brokers
ALTER TABLE public.brokers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view brokers in their orgs"
  ON public.brokers FOR SELECT
  USING (organization_id IN (SELECT public.get_user_organizations()));

CREATE POLICY "Dispatchers and admins can insert brokers"
  ON public.brokers FOR INSERT
  WITH CHECK (
    organization_id IN (SELECT public.get_user_organizations())
    AND public.has_operational_write_access(organization_id)
  );

CREATE POLICY "Dispatchers and admins can update brokers"
  ON public.brokers FOR UPDATE
  USING (
    organization_id IN (SELECT public.get_user_organizations())
    AND public.has_operational_write_access(organization_id)
  )
  WITH CHECK (
    organization_id IN (SELECT public.get_user_organizations())
    AND public.has_operational_write_access(organization_id)
  );

CREATE POLICY "Owner admins can delete brokers"
  ON public.brokers FOR DELETE
  USING (public.is_org_owner_admin(organization_id));

-- 6. trucks
ALTER TABLE public.trucks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view trucks in their orgs"
  ON public.trucks FOR SELECT
  USING (organization_id IN (SELECT public.get_user_organizations()));

CREATE POLICY "Dispatchers and admins can insert trucks"
  ON public.trucks FOR INSERT
  WITH CHECK (
    organization_id IN (SELECT public.get_user_organizations())
    AND public.has_operational_write_access(organization_id)
  );

CREATE POLICY "Dispatchers and admins can update trucks"
  ON public.trucks FOR UPDATE
  USING (
    organization_id IN (SELECT public.get_user_organizations())
    AND public.has_operational_write_access(organization_id)
  )
  WITH CHECK (
    organization_id IN (SELECT public.get_user_organizations())
    AND public.has_operational_write_access(organization_id)
  );

CREATE POLICY "Owner admins can delete trucks"
  ON public.trucks FOR DELETE
  USING (public.is_org_owner_admin(organization_id));

-- 7. drivers
ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view drivers in their orgs"
  ON public.drivers FOR SELECT
  USING (organization_id IN (SELECT public.get_user_organizations()));

CREATE POLICY "Dispatchers and admins can insert drivers"
  ON public.drivers FOR INSERT
  WITH CHECK (
    organization_id IN (SELECT public.get_user_organizations())
    AND public.has_operational_write_access(organization_id)
  );

CREATE POLICY "Dispatchers and admins can update drivers"
  ON public.drivers FOR UPDATE
  USING (
    organization_id IN (SELECT public.get_user_organizations())
    AND public.has_operational_write_access(organization_id)
  )
  WITH CHECK (
    organization_id IN (SELECT public.get_user_organizations())
    AND public.has_operational_write_access(organization_id)
  );

CREATE POLICY "Owner admins can delete drivers"
  ON public.drivers FOR DELETE
  USING (public.is_org_owner_admin(organization_id));

-- 8. loads
ALTER TABLE public.loads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view loads in their orgs"
  ON public.loads FOR SELECT
  USING (organization_id IN (SELECT public.get_user_organizations()));

CREATE POLICY "Dispatchers and admins can insert loads"
  ON public.loads FOR INSERT
  WITH CHECK (
    organization_id IN (SELECT public.get_user_organizations())
    AND public.has_operational_write_access(organization_id)
  );

CREATE POLICY "Dispatchers and admins can update loads"
  ON public.loads FOR UPDATE
  USING (
    organization_id IN (SELECT public.get_user_organizations())
    AND public.has_operational_write_access(organization_id)
  )
  WITH CHECK (
    organization_id IN (SELECT public.get_user_organizations())
    AND public.has_operational_write_access(organization_id)
  );

CREATE POLICY "Owner admins can delete loads"
  ON public.loads FOR DELETE
  USING (public.is_org_owner_admin(organization_id));

-- 9. documents
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view documents in their orgs"
  ON public.documents FOR SELECT
  USING (organization_id IN (SELECT public.get_user_organizations()));

CREATE POLICY "All active members can upload documents"
  ON public.documents FOR INSERT
  WITH CHECK (organization_id IN (SELECT public.get_user_organizations()));

CREATE POLICY "Dispatchers and admins can update documents"
  ON public.documents FOR UPDATE
  USING (
    organization_id IN (SELECT public.get_user_organizations())
    AND public.has_operational_write_access(organization_id)
  )
  WITH CHECK (
    organization_id IN (SELECT public.get_user_organizations())
    AND public.has_operational_write_access(organization_id)
  );

CREATE POLICY "Owner admins can delete documents"
  ON public.documents FOR DELETE
  USING (public.is_org_owner_admin(organization_id));

-- 10. activity_notes
ALTER TABLE public.activity_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view notes in their orgs"
  ON public.activity_notes FOR SELECT
  USING (organization_id IN (SELECT public.get_user_organizations()));

CREATE POLICY "All active members can create activity notes"
  ON public.activity_notes FOR INSERT
  WITH CHECK (
    organization_id IN (SELECT public.get_user_organizations())
    AND (author_id IS NULL OR author_id = (SELECT auth.uid()))
  );
