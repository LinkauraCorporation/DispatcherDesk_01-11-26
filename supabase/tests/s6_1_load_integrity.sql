-- ====================================================================
-- DispatcherDesk S6.1 Verification Tests: Load Lifecycle & State Integrity
-- File: supabase/tests/s6_1_load_integrity.sql
-- Description:
-- Integration and unit test suite verifying load state machine invariants,
-- multi-tenant isolation, carrier-equipment consistency, composite FK boundaries,
-- and financial/temporal validation rules.
-- ====================================================================

BEGIN;

-- ====================================================================
-- Setup Test Tenants, Clients, Brokers, Trucks, Drivers
-- ====================================================================

-- Tenant A (Alpha Freight)
INSERT INTO public.organizations (id, name, slug, primary_timezone)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Alpha Freight Corp',
  'alpha-freight-test',
  'America/Chicago'
) ON CONFLICT (id) DO NOTHING;

-- Tenant B (Beta Logistics)
INSERT INTO public.organizations (id, name, slug, primary_timezone)
VALUES (
  '00000000-0000-0000-0000-000000000002',
  'Beta Logistics Corp',
  'beta-logistics-test',
  'America/New_York'
) ON CONFLICT (id) DO NOTHING;

-- Client 1 in Org A (Alpha Carrier 1)
INSERT INTO public.clients (id, organization_id, company_name, client_type, status)
VALUES (
  '00000000-0000-0000-0001-000000000001',
  '00000000-0000-0000-0000-000000000001',
  'Alpha Carrier 1',
  'fleet',
  'active'
) ON CONFLICT (id) DO NOTHING;

-- Client 2 in Org A (Alpha Carrier 2)
INSERT INTO public.clients (id, organization_id, company_name, client_type, status)
VALUES (
  '00000000-0000-0000-0001-000000000002',
  '00000000-0000-0000-0000-000000000001',
  'Alpha Carrier 2',
  'owner_operator',
  'active'
) ON CONFLICT (id) DO NOTHING;

-- Client in Org B (Beta Carrier 1)
INSERT INTO public.clients (id, organization_id, company_name, client_type, status)
VALUES (
  '00000000-0000-0000-0002-000000000001',
  '00000000-0000-0000-0000-000000000002',
  'Beta Carrier 1',
  'fleet',
  'active'
) ON CONFLICT (id) DO NOTHING;

-- Broker in Org A
INSERT INTO public.brokers (id, organization_id, company_name, mc_number, credit_status)
VALUES (
  '00000000-0000-0000-0001-000000000010',
  '00000000-0000-0000-0000-000000000001',
  'Alpha Test Broker',
  'MC-123456',
  'approved'
) ON CONFLICT (id) DO NOTHING;

-- Broker in Org B
INSERT INTO public.brokers (id, organization_id, company_name, mc_number, credit_status)
VALUES (
  '00000000-0000-0000-0002-000000000010',
  '00000000-0000-0000-0000-000000000002',
  'Beta Test Broker',
  'MC-654321',
  'approved'
) ON CONFLICT (id) DO NOTHING;

-- Truck in Org A belonging to Client 1
INSERT INTO public.trucks (id, organization_id, client_id, truck_number, equipment_type, status)
VALUES (
  '00000000-0000-0000-0001-000000000101',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0001-000000000001',
  'TRK-A101',
  'dry_van',
  'active'
) ON CONFLICT (id) DO NOTHING;

-- Driver in Org A belonging to Client 1
INSERT INTO public.drivers (id, organization_id, client_id, full_name, pay_type, pay_rate, status)
VALUES (
  '00000000-0000-0000-0001-000000000201',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0001-000000000001',
  'Alpha John Doe',
  'per_mile',
  0.65,
  'active'
) ON CONFLICT (id) DO NOTHING;

-- Truck in Org B belonging to Client Beta 1
INSERT INTO public.trucks (id, organization_id, client_id, truck_number, equipment_type, status)
VALUES (
  '00000000-0000-0000-0002-000000000101',
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0002-000000000001',
  'TRK-B101',
  'reefer',
  'active'
) ON CONFLICT (id) DO NOTHING;

-- ====================================================================
-- TEST 1: Valid Forward Lifecycle State Machine Transitions
-- sourced -> negotiating -> booked -> in_transit -> delivered -> invoiced -> paid
-- ====================================================================
DO $$
DECLARE
  v_load_id UUID := '00000000-0000-0000-0001-000000000999';
BEGIN
  -- 1. Create in sourced
  INSERT INTO public.loads (
    id,
    organization_id,
    load_number,
    client_id,
    broker_id,
    origin_city,
    origin_state,
    dest_city,
    dest_state,
    pipeline_status,
    rate,
    loaded_miles
  ) VALUES (
    v_load_id,
    '00000000-0000-0000-0000-000000000001',
    'TEST-LD-LIFECYCLE-01',
    '00000000-0000-0000-0001-000000000001',
    '00000000-0000-0000-0001-000000000010',
    'Chicago', 'IL',
    'Atlanta', 'GA',
    'sourced',
    2500.00,
    715.00
  );

  -- 2. Transition: sourced -> negotiating
  UPDATE public.loads SET pipeline_status = 'negotiating' WHERE id = v_load_id;

  -- 3. Transition: negotiating -> booked (attach truck & driver)
  UPDATE public.loads
  SET 
    pipeline_status = 'booked',
    truck_id = '00000000-0000-0000-0001-000000000101',
    driver_id = '00000000-0000-0000-0001-000000000201'
  WHERE id = v_load_id;

  -- 4. Transition: booked -> in_transit
  UPDATE public.loads SET pipeline_status = 'in_transit' WHERE id = v_load_id;

  -- 5. Transition: in_transit -> delivered
  UPDATE public.loads SET pipeline_status = 'delivered' WHERE id = v_load_id;

  -- 6. Transition: delivered -> invoiced
  UPDATE public.loads SET pipeline_status = 'invoiced' WHERE id = v_load_id;

  -- 7. Transition: invoiced -> paid
  UPDATE public.loads SET pipeline_status = 'paid' WHERE id = v_load_id;

  RAISE NOTICE 'TEST 1 PASSED: Full forward lifecycle state transitions executed successfully.';
END;
$$;

-- ====================================================================
-- TEST 2: Reopen Settled / Paid Load back to Invoiced
-- ====================================================================
DO $$
DECLARE
  v_load_id UUID := '00000000-0000-0000-0001-000000000999';
BEGIN
  UPDATE public.loads SET pipeline_status = 'invoiced' WHERE id = v_load_id;
  RAISE NOTICE 'TEST 2 PASSED: Reopening paid load back to invoiced status succeeded.';
END;
$$;

-- ====================================================================
-- TEST 3: Invalid Forward Transition Skip Prevention (e.g. sourced -> delivered)
-- ====================================================================
DO $$
DECLARE
  v_test_id UUID := '00000000-0000-0000-0001-000000000998';
BEGIN
  INSERT INTO public.loads (
    id, organization_id, load_number, client_id, origin_city, origin_state, dest_city, dest_state, pipeline_status
  ) VALUES (
    v_test_id, '00000000-0000-0000-0000-000000000001', 'TEST-LD-SKIP-01',
    '00000000-0000-0000-0001-000000000001', 'Dallas', 'TX', 'Houston', 'TX', 'sourced'
  );

  BEGIN
    -- Attempt invalid skip from sourced directly to delivered
    UPDATE public.loads SET pipeline_status = 'delivered' WHERE id = v_test_id;
    RAISE EXCEPTION 'TEST 3 FAILED: Invalid forward skip (sourced -> delivered) was not rejected!';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM LIKE '%State Machine Violation%' THEN
        RAISE NOTICE 'TEST 3 PASSED: Invalid forward jump rejected by lifecycle trigger.';
      ELSE
        RAISE;
      END IF;
  END;
END;
$$;

-- ====================================================================
-- TEST 4: Invalid Backward Transition Skip Prevention (e.g. in_transit -> sourced)
-- ====================================================================
DO $$
DECLARE
  v_test_id UUID := '00000000-0000-0000-0001-000000000998';
BEGIN
  UPDATE public.loads SET pipeline_status = 'negotiating' WHERE id = v_test_id;
  UPDATE public.loads SET pipeline_status = 'booked' WHERE id = v_test_id;
  UPDATE public.loads SET pipeline_status = 'in_transit' WHERE id = v_test_id;

  BEGIN
    -- Attempt invalid jump backward from in_transit directly to sourced
    UPDATE public.loads SET pipeline_status = 'sourced' WHERE id = v_test_id;
    RAISE EXCEPTION 'TEST 4 FAILED: Invalid backward jump (in_transit -> sourced) was not rejected!';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM LIKE '%State Machine Violation%' THEN
        RAISE NOTICE 'TEST 4 PASSED: Invalid backward jump rejected by lifecycle trigger.';
      ELSE
        RAISE;
      END IF;
  END;
END;
$$;

-- ====================================================================
-- TEST 5: Cross-Tenant organization_id Mutation Prevention
-- ====================================================================
DO $$
BEGIN
  BEGIN
    UPDATE public.loads
    SET organization_id = '00000000-0000-0000-0000-000000000002' -- Org B
    WHERE id = '00000000-0000-0000-0001-000000000999';
    RAISE EXCEPTION 'TEST 5 FAILED: Reassigning load organization_id was not blocked!';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM LIKE '%organization_id is immutable%' THEN
        RAISE NOTICE 'TEST 5 PASSED: Reassigning load organization_id blocked by immutability trigger.';
      ELSE
        RAISE;
      END IF;
  END;
END;
$$;

-- ====================================================================
-- TEST 6: Cross-Tenant Composite Foreign Key Rejection (Client)
-- ====================================================================
DO $$
BEGIN
  BEGIN
    INSERT INTO public.loads (
      organization_id, load_number, client_id, origin_city, origin_state, dest_city, dest_state
    ) VALUES (
      '00000000-0000-0000-0000-000000000001', -- Org A
      'TEST-CROSS-CLIENT',
      '00000000-0000-0000-0002-000000000001', -- Org B Client!
      'Chicago', 'IL', 'Dallas', 'TX'
    );
    RAISE EXCEPTION 'TEST 6 FAILED: Cross-tenant client_id was not rejected!';
  EXCEPTION
    WHEN foreign_key_violation THEN
      RAISE NOTICE 'TEST 6 PASSED: Cross-tenant client_id rejected by composite FK constraint.';
  END;
END;
$$;

-- ====================================================================
-- TEST 7: Cross-Tenant Composite Foreign Key Rejection (Truck)
-- ====================================================================
DO $$
BEGIN
  BEGIN
    INSERT INTO public.loads (
      organization_id, load_number, client_id, truck_id, origin_city, origin_state, dest_city, dest_state
    ) VALUES (
      '00000000-0000-0000-0000-000000000001', -- Org A
      'TEST-CROSS-TRUCK',
      '00000000-0000-0000-0001-000000000001', -- Org A Client
      '00000000-0000-0000-0002-000000000101', -- Org B Truck!
      'Chicago', 'IL', 'Dallas', 'TX'
    );
    RAISE EXCEPTION 'TEST 7 FAILED: Cross-tenant truck_id was not rejected!';
  EXCEPTION
    WHEN foreign_key_violation THEN
      RAISE NOTICE 'TEST 7 PASSED: Cross-tenant truck_id rejected by composite FK constraint.';
  END;
END;
$$;

-- ====================================================================
-- TEST 8: Carrier-Equipment Alignment Trigger (Truck belongs to Client 1, Load assigned to Client 2)
-- ====================================================================
DO $$
BEGIN
  BEGIN
    INSERT INTO public.loads (
      organization_id, load_number, client_id, truck_id, origin_city, origin_state, dest_city, dest_state
    ) VALUES (
      '00000000-0000-0000-0000-000000000001', -- Org A
      'TEST-CLIENT-MISMATCH',
      '00000000-0000-0000-0001-000000000002', -- Org A Client 2
      '00000000-0000-0000-0001-000000000101', -- Org A Truck 1 (belongs to Client 1!)
      'Chicago', 'IL', 'Dallas', 'TX'
    );
    RAISE EXCEPTION 'TEST 8 FAILED: Truck-Client carrier mismatch was not rejected!';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM LIKE '%Integrity Error: Assigned truck%' THEN
        RAISE NOTICE 'TEST 8 PASSED: Truck-Client carrier mismatch rejected by integrity trigger.';
      ELSE
        RAISE;
      END IF;
  END;
END;
$$;

-- ====================================================================
-- TEST 9: Duplicate Load Number Rejection within Same Tenant (Case-Insensitive)
-- ====================================================================
DO $$
BEGIN
  BEGIN
    INSERT INTO public.loads (
      organization_id, load_number, client_id, origin_city, origin_state, dest_city, dest_state
    ) VALUES (
      '00000000-0000-0000-0000-000000000001',
      'test-ld-lifecycle-01', -- Duplicate of TEST-LD-LIFECYCLE-01 in lower case!
      '00000000-0000-0000-0001-000000000001',
      'Chicago', 'IL', 'Dallas', 'TX'
    );
    RAISE EXCEPTION 'TEST 9 FAILED: Case-insensitive duplicate load_number in same org was not rejected!';
  EXCEPTION
    WHEN unique_violation THEN
      RAISE NOTICE 'TEST 9 PASSED: Duplicate load number within same tenant rejected by unique index.';
  END;
END;
$$;

-- ====================================================================
-- TEST 10: Same Load Number Permitted Across Distinct Tenants
-- ====================================================================
DO $$
BEGIN
  INSERT INTO public.loads (
    organization_id, load_number, client_id, origin_city, origin_state, dest_city, dest_state
  ) VALUES (
    '00000000-0000-0000-0000-000000000002', -- Org B
    'TEST-LD-LIFECYCLE-01', -- Same load number as Org A!
    '00000000-0000-0000-0002-000000000001',
    'Miami', 'FL', 'Atlanta', 'GA'
  );
  RAISE NOTICE 'TEST 10 PASSED: Identical load number permitted across separate organizations.';
END;
$$;

-- ====================================================================
-- TEST 11: Negative Financial Amount Rejection
-- ====================================================================
DO $$
BEGIN
  BEGIN
    INSERT INTO public.loads (
      organization_id, load_number, client_id, origin_city, origin_state, dest_city, dest_state, rate
    ) VALUES (
      '00000000-0000-0000-0000-000000000001',
      'TEST-NEG-RATE',
      '00000000-0000-0000-0001-000000000001',
      'Chicago', 'IL', 'Dallas', 'TX',
      -500.00 -- Negative rate!
    );
    RAISE EXCEPTION 'TEST 11 FAILED: Negative rate was not rejected!';
  EXCEPTION
    WHEN check_violation THEN
      RAISE NOTICE 'TEST 11 PASSED: Negative financial amount rejected by check constraint.';
  END;
END;
$$;

-- ====================================================================
-- TEST 12: Route Temporal Order Rejection (Delivery before Pickup)
-- ====================================================================
DO $$
BEGIN
  BEGIN
    INSERT INTO public.loads (
      organization_id, load_number, client_id, origin_city, origin_state, dest_city, dest_state,
      pickup_datetime, delivery_datetime
    ) VALUES (
      '00000000-0000-0000-0000-000000000001',
      'TEST-TIME-INVERSION',
      '00000000-0000-0000-0001-000000000001',
      'Chicago', 'IL', 'Dallas', 'TX',
      '2026-09-10 12:00:00+00',
      '2026-09-08 12:00:00+00' -- 2 days earlier than pickup!
    );
    RAISE EXCEPTION 'TEST 12 FAILED: Delivery before pickup was not rejected!';
  EXCEPTION
    WHEN check_violation THEN
      RAISE NOTICE 'TEST 12 PASSED: Inverted route timestamps rejected by temporal check constraint.';
  END;
END;
$$;

-- ====================================================================
-- TEST 13: Child Entity Composite Foreign Key Linkage (Documents)
-- ====================================================================
DO $$
BEGIN
  BEGIN
    INSERT INTO public.documents (
      organization_id, load_id, document_type, file_name, file_url, status
    ) VALUES (
      '00000000-0000-0000-0000-000000000002', -- Org B
      '00000000-0000-0000-0001-000000000999', -- Org A Load!
      'rate_confirmation', 'rate_con.pdf', 'https://mock.storage/doc.pdf', 'verified'
    );
    RAISE EXCEPTION 'TEST 13 FAILED: Cross-tenant child document linkage was not rejected!';
  EXCEPTION
    WHEN foreign_key_violation THEN
      RAISE NOTICE 'TEST 13 PASSED: Cross-tenant child document linkage rejected by composite FK.';
  END;
END;
$$;

-- ====================================================================
-- TEST 14: transition_load_status RPC Unauthenticated Rejection
-- ====================================================================
DO $$
BEGIN
  BEGIN
    PERFORM public.transition_load_status(
      '00000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0001-000000000999',
      'paid',
      'Test notes'
    );
    RAISE EXCEPTION 'TEST 14 FAILED: transition_load_status allowed unauthenticated execution!';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM LIKE '%Authentication required%' OR SQLERRM LIKE '%Unauthorized%' THEN
        RAISE NOTICE 'TEST 14 PASSED: transition_load_status enforced authentication and tenant authorization.';
      ELSE
        RAISE;
      END IF;
  END;
END;
$$;

ROLLBACK;
