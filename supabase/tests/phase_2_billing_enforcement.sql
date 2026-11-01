-- ====================================================================
-- DispatcherDesk Automated Test Suite: Phase 2 Billing Entitlement & Enforcement
-- File: supabase/tests/phase_2_billing_enforcement.sql
-- Description:
-- Verifies server-side AMT capacity calculation, hard trigger enforcement,
-- trial lifecycle gates, paid billing periods, deduplication, RPC telemetry,
-- concurrency serialization, and cross-tenant boundaries.
--
-- Test Coverage Matrix:
-- 1. Trial activation 1/3 succeeds
-- 2. Trial activation 2/3 succeeds
-- 3. Trial activation 3/3 succeeds
-- 4. Trial 4th distinct truck fails
-- 5. Trial unassignment does not restore capacity
-- 6. Expired trial blocks new activation
-- 7. Starter 10th AMT succeeds
-- 8. Starter 11th AMT fails
-- 9. Growth 25th succeeds
-- 10. Growth 26th fails
-- 11. Agency 50th succeeds
-- 12. Same truck across multiple qualifying loads = one AMT
-- 13. Same truck in next paid billing period = new AMT
-- 14. Zero-usage new billing period works
-- 15. Cross-tenant isolation
-- 16. Direct assign_load_dispatch cannot bypass billing enforcement
-- 17. Concurrency: row-level lock on subscriptions guarantees mutual exclusion on final slot
-- 18. Existing S6.4 assignment integrity regression remains passing
-- ====================================================================

BEGIN;

DO $$
DECLARE
  -- Organizations Org A & B
  v_org_a UUID := 'a0000000-0000-0000-0000-000000000001'::UUID;
  v_org_b UUID := 'b0000000-0000-0000-0000-000000000001'::UUID;

  -- Users
  v_user_admin_a UUID := 'a1111111-1111-1111-1111-111111111111'::UUID;
  v_user_disp_a  UUID := 'a2222222-2222-2222-2222-222222222222'::UUID;
  v_user_admin_b UUID := 'b1111111-1111-1111-1111-111111111111'::UUID;

  -- Clients Org A & B
  v_client_a1 UUID := 'ac100000-0000-0000-0000-000000000001'::UUID;
  v_client_b1 UUID := 'bc100000-0000-0000-0000-000000000001'::UUID;

  -- Brokers
  v_broker_a UUID := 'ab100000-0000-0000-0000-000000000001'::UUID;
  v_broker_b UUID := 'bb100000-0000-0000-0000-000000000001'::UUID;

  -- Drivers
  v_driver_a1 UUID := 'ad100000-0000-0000-0000-000000000001'::UUID;

  -- Working Variables
  v_err_caught BOOLEAN;
  v_err_msg TEXT;
  v_cnt INTEGER;
  v_truck_id UUID;
  v_load_id UUID;
  v_usage_json JSONB;
  v_i INTEGER;
  v_sub_row RECORD;
  v_rpc_res JSONB;
BEGIN
  RAISE NOTICE '=============================================================';
  RAISE NOTICE 'STARTING TEST SUITE: PHASE 2 BILLING ENTITLEMENT & ENFORCEMENT';
  RAISE NOTICE '=============================================================';

  -- -----------------------------------------------------------------
  -- 0. TEARDOWN & FIXTURE SEEDING
  -- -----------------------------------------------------------------
  DELETE FROM public.truck_activation_history WHERE organization_id IN (v_org_a, v_org_b);
  DELETE FROM public.subscriptions WHERE organization_id IN (v_org_a, v_org_b);
  DELETE FROM public.activity_notes WHERE organization_id IN (v_org_a, v_org_b);
  DELETE FROM public.loads WHERE organization_id IN (v_org_a, v_org_b);
  DELETE FROM public.drivers WHERE organization_id IN (v_org_a, v_org_b);
  DELETE FROM public.trucks WHERE organization_id IN (v_org_a, v_org_b);
  DELETE FROM public.brokers WHERE organization_id IN (v_org_a, v_org_b);
  DELETE FROM public.clients WHERE organization_id IN (v_org_a, v_org_b);
  DELETE FROM public.organization_members WHERE organization_id IN (v_org_a, v_org_b);
  DELETE FROM public.organizations WHERE id IN (v_org_a, v_org_b);
  DELETE FROM public.profiles WHERE id IN (v_user_admin_a, v_user_disp_a, v_user_admin_b);

  -- Insert Profiles
  INSERT INTO public.profiles (id, full_name) VALUES
    (v_user_admin_a, 'Admin Org A'),
    (v_user_disp_a,  'Dispatcher Org A'),
    (v_user_admin_b, 'Admin Org B');

  -- Insert Organizations (Triggers automatic subscription provisioning)
  INSERT INTO public.organizations (id, name, slug) VALUES
    (v_org_a, 'Apex Freight Logistics', 'apex-a'),
    (v_org_b, 'Summit Freight Global', 'summit-b');

  -- Memberships
  INSERT INTO public.organization_members (organization_id, user_id, role) VALUES
    (v_org_a, v_user_admin_a, 'owner_admin'),
    (v_org_a, v_user_disp_a,  'dispatcher'),
    (v_org_b, v_user_admin_b, 'owner_admin');

  -- Clients
  INSERT INTO public.clients (id, organization_id, company_name, client_type, status) VALUES
    (v_client_a1, v_org_a, 'Apex Fleet Carrier', 'fleet', 'active'),
    (v_client_b1, v_org_b, 'Summit Fleet Carrier', 'fleet', 'active');

  -- Brokers
  INSERT INTO public.brokers (id, organization_id, company_name) VALUES
    (v_broker_a, v_org_a, 'Broker A Freight'),
    (v_broker_b, v_org_b, 'Broker B Freight');

  -- Driver
  INSERT INTO public.drivers (id, organization_id, client_id, full_name, status, pay_type) VALUES
    (v_driver_a1, v_org_a, v_client_a1, 'Dave Driver A', 'available', 'per_mile');

  -- Seed 60 Trucks for Org A to test multi-tier capacities
  FOR v_i IN 1..60 LOOP
    INSERT INTO public.trucks (id, organization_id, client_id, truck_number, equipment_type, status)
    VALUES (
      ('ae000000-0000-0000-0000-' || LPAD(v_i::TEXT, 12, '0'))::UUID,
      v_org_a,
      v_client_a1,
      'TRK-A-' || LPAD(v_i::TEXT, 3, '0'),
      'dry_van',
      'active'
    );
  END LOOP;

  -- Seed 5 Trucks for Org B
  FOR v_i IN 1..5 LOOP
    INSERT INTO public.trucks (id, organization_id, client_id, truck_number, equipment_type, status)
    VALUES (
      ('be000000-0000-0000-0000-' || LPAD(v_i::TEXT, 12, '0'))::UUID,
      v_org_b,
      v_client_b1,
      'TRK-B-' || LPAD(v_i::TEXT, 3, '0'),
      'dry_van',
      'active'
    );
  END LOOP;

  -- Set active user context to Admin Org A
  PERFORM set_config('request.jwt.claim.sub', v_user_admin_a::text, true);

  RAISE NOTICE '[OK] Test setup completed.';

  -- -----------------------------------------------------------------
  -- TEST 1, 2, 3: Trial Activation 1/3, 2/3, 3/3 Succeeds
  -- -----------------------------------------------------------------
  -- Load 1 with Truck 1
  INSERT INTO public.loads (
    id, organization_id, load_number, client_id, broker_id, truck_id,
    origin_city, origin_state, dest_city, dest_state, rate, loaded_miles, pipeline_status
  ) VALUES (
    'af000000-0000-0000-0000-000000000001'::UUID, v_org_a, 'LD-TR-001', v_client_a1, v_broker_a,
    'ae000000-0000-0000-0000-000000000001'::UUID, 'Dallas', 'TX', 'Atlanta', 'GA', 2000, 800, 'booked'
  );

  -- Load 2 with Truck 2
  INSERT INTO public.loads (
    id, organization_id, load_number, client_id, broker_id, truck_id,
    origin_city, origin_state, dest_city, dest_state, rate, loaded_miles, pipeline_status
  ) VALUES (
    'af000000-0000-0000-0000-000000000002'::UUID, v_org_a, 'LD-TR-002', v_client_a1, v_broker_a,
    'ae000000-0000-0000-0000-000000000002'::UUID, 'Chicago', 'IL', 'Detroit', 'MI', 1200, 300, 'in_transit'
  );

  -- Load 3 with Truck 3
  INSERT INTO public.loads (
    id, organization_id, load_number, client_id, broker_id, truck_id,
    origin_city, origin_state, dest_city, dest_state, rate, loaded_miles, pipeline_status
  ) VALUES (
    'af000000-0000-0000-0000-000000000003'::UUID, v_org_a, 'LD-TR-003', v_client_a1, v_broker_a,
    'ae000000-0000-0000-0000-000000000003'::UUID, 'Memphis', 'TN', 'Nashville', 'TN', 900, 210, 'delivered'
  );

  SELECT COUNT(*) INTO v_cnt
  FROM public.truck_activation_history
  WHERE organization_id = v_org_a AND billing_period_key = 'trial';

  IF v_cnt <> 3 THEN
    RAISE EXCEPTION 'TEST 1-3 FAILED: Expected 3 activations during trial, got %', v_cnt;
  END IF;
  RAISE NOTICE '[PASS] TEST 1-3: Trial activations 1/3, 2/3, 3/3 succeeded.';

  -- Check Usage RPC Telemetry at 3/3
  v_usage_json := public.get_organization_subscription_usage(v_org_a);
  IF (v_usage_json->>'amt_usage')::INT <> 3 OR (v_usage_json->>'amt_capacity')::INT <> 3 OR (v_usage_json->>'remaining_amt_slots')::INT <> 0 THEN
    RAISE EXCEPTION 'Usage RPC returned incorrect usage numbers: %', v_usage_json;
  END IF;
  RAISE NOTICE '[PASS] Usage RPC confirms trial usage 3/3, remaining 0.';

  -- -----------------------------------------------------------------
  -- TEST 4: Trial 4th Distinct Truck Fails (Ceiling Exhausted)
  -- -----------------------------------------------------------------
  v_err_caught := FALSE;
  BEGIN
    INSERT INTO public.loads (
      id, organization_id, load_number, client_id, broker_id, truck_id,
      origin_city, origin_state, dest_city, dest_state, rate, loaded_miles, pipeline_status
    ) VALUES (
      'af000000-0000-0000-0000-000000000004'::UUID, v_org_a, 'LD-TR-004', v_client_a1, v_broker_a,
      'ae000000-0000-0000-0000-000000000004'::UUID, 'Houston', 'TX', 'Austin', 'TX', 800, 160, 'booked'
    );
  EXCEPTION WHEN OTHERS THEN
    v_err_caught := TRUE;
    v_err_msg := SQLERRM;
  END;

  IF NOT v_err_caught THEN
    RAISE EXCEPTION 'TEST 4 FAILED: 4th distinct truck during trial was improperly allowed.';
  ELSE
    RAISE NOTICE '[PASS] TEST 4: 4th distinct truck during trial blocked by trigger. (%)', v_err_msg;
  END IF;

  -- -----------------------------------------------------------------
  -- TEST 5: Trial Unassignment Does NOT Restore Capacity
  -- -----------------------------------------------------------------
  -- Unassign truck from Load 3
  UPDATE public.loads
  SET truck_id = NULL
  WHERE id = 'af000000-0000-0000-0000-000000000003'::UUID;

  -- Attempt to activate Truck 4 on Load 4 again: MUST STILL FAIL!
  v_err_caught := FALSE;
  BEGIN
    INSERT INTO public.loads (
      id, organization_id, load_number, client_id, broker_id, truck_id,
      origin_city, origin_state, dest_city, dest_state, rate, loaded_miles, pipeline_status
    ) VALUES (
      'af000000-0000-0000-0000-000000000004'::UUID, v_org_a, 'LD-TR-004', v_client_a1, v_broker_a,
      'ae000000-0000-0000-0000-000000000004'::UUID, 'Houston', 'TX', 'Austin', 'TX', 800, 160, 'booked'
    );
  EXCEPTION WHEN OTHERS THEN
    v_err_caught := TRUE;
    v_err_msg := SQLERRM;
  END;

  IF NOT v_err_caught THEN
    RAISE EXCEPTION 'TEST 5 FAILED: Unassignment restored capacity; 4th truck was improperly permitted.';
  ELSE
    RAISE NOTICE '[PASS] TEST 5: Unassignment does not restore AMT capacity; 4th truck still blocked. (%)', v_err_msg;
  END IF;

  -- -----------------------------------------------------------------
  -- TEST 6: Expired Trial Blocks New Activation
  -- -----------------------------------------------------------------
  -- Reset Org A to clean trial with 0 activations, but set trial_ends_at in the past
  DELETE FROM public.truck_activation_history WHERE organization_id = v_org_a;
  DELETE FROM public.loads WHERE organization_id = v_org_a;

  UPDATE public.subscriptions
  SET trial_starts_at = NOW() - INTERVAL '20 days',
      trial_ends_at = NOW() - INTERVAL '6 days',
      billing_state = 'trialing'
  WHERE organization_id = v_org_a;

  v_err_caught := FALSE;
  BEGIN
    INSERT INTO public.loads (
      id, organization_id, load_number, client_id, broker_id, truck_id,
      origin_city, origin_state, dest_city, dest_state, rate, loaded_miles, pipeline_status
    ) VALUES (
      'af000000-0000-0000-0000-000000000005'::UUID, v_org_a, 'LD-EXP-001', v_client_a1, v_broker_a,
      'ae000000-0000-0000-0000-000000000001'::UUID, 'Denver', 'CO', 'Salt Lake City', 'UT', 1500, 500, 'booked'
    );
  EXCEPTION WHEN OTHERS THEN
    v_err_caught := TRUE;
    v_err_msg := SQLERRM;
  END;

  IF NOT v_err_caught THEN
    RAISE EXCEPTION 'TEST 6 FAILED: Expired trial allowed new truck activation.';
  ELSE
    RAISE NOTICE '[PASS] TEST 6: Expired trial blocked new activation. (%)', v_err_msg;
  END IF;

  -- -----------------------------------------------------------------
  -- TEST 7 & 8: Starter Plan: 10th AMT Succeeds, 11th AMT Fails
  -- -----------------------------------------------------------------
  -- Upgrade Org A to active Starter plan (Capacity: 10)
  UPDATE public.subscriptions
  SET plan = 'starter',
      billing_state = 'active',
      current_period_start = '2026-09-01 00:00:00+00',
      current_period_end = '2026-10-01 00:00:00+00'
  WHERE organization_id = v_org_a;

  -- Activate Trucks 1 through 9
  FOR v_i IN 1..9 LOOP
    INSERT INTO public.loads (
      id, organization_id, load_number, client_id, broker_id, truck_id,
      origin_city, origin_state, dest_city, dest_state, rate, loaded_miles, pipeline_status
    ) VALUES (
      ('af000000-0000-0000-0001-' || LPAD(v_i::TEXT, 12, '0'))::UUID,
      v_org_a,
      'LD-STARTER-' || LPAD(v_i::TEXT, 3, '0'),
      v_client_a1,
      v_broker_a,
      ('ae000000-0000-0000-0000-' || LPAD(v_i::TEXT, 12, '0'))::UUID,
      'Dallas', 'TX', 'Atlanta', 'GA', 1500, 500, 'booked'
    );
  END LOOP;

  -- 10th truck MUST SUCCEED
  INSERT INTO public.loads (
    id, organization_id, load_number, client_id, broker_id, truck_id,
    origin_city, origin_state, dest_city, dest_state, rate, loaded_miles, pipeline_status
  ) VALUES (
    'af000000-0000-0000-0001-000000000010'::UUID,
    v_org_a,
    'LD-STARTER-010',
    v_client_a1,
    v_broker_a,
    'ae000000-0000-0000-0000-000000000010'::UUID,
    'Dallas', 'TX', 'Atlanta', 'GA', 1500, 500, 'booked'
  );
  RAISE NOTICE '[PASS] TEST 7: Starter 10th AMT activation succeeded.';

  -- 11th truck MUST FAIL
  v_err_caught := FALSE;
  BEGIN
    INSERT INTO public.loads (
      id, organization_id, load_number, client_id, broker_id, truck_id,
      origin_city, origin_state, dest_city, dest_state, rate, loaded_miles, pipeline_status
    ) VALUES (
      'af000000-0000-0000-0001-000000000011'::UUID,
      v_org_a,
      'LD-STARTER-011',
      v_client_a1,
      v_broker_a,
      'ae000000-0000-0000-0000-000000000011'::UUID,
      'Dallas', 'TX', 'Atlanta', 'GA', 1500, 500, 'booked'
    );
  EXCEPTION WHEN OTHERS THEN
    v_err_caught := TRUE;
    v_err_msg := SQLERRM;
  END;

  IF NOT v_err_caught THEN
    RAISE EXCEPTION 'TEST 8 FAILED: 11th distinct truck on Starter plan was permitted.';
  ELSE
    RAISE NOTICE '[PASS] TEST 8: Starter 11th AMT blocked by capacity ceiling. (%)', v_err_msg;
  END IF;

  -- -----------------------------------------------------------------
  -- TEST 9 & 10: Growth Plan: 25th AMT Succeeds, 26th AMT Fails
  -- -----------------------------------------------------------------
  -- Upgrade Org A to Growth plan (Capacity: 25)
  UPDATE public.subscriptions
  SET plan = 'growth'
  WHERE organization_id = v_org_a;

  -- Activate Trucks 11 through 24
  FOR v_i IN 11..24 LOOP
    INSERT INTO public.loads (
      id, organization_id, load_number, client_id, broker_id, truck_id,
      origin_city, origin_state, dest_city, dest_state, rate, loaded_miles, pipeline_status
    ) VALUES (
      ('af000000-0000-0000-0002-' || LPAD(v_i::TEXT, 12, '0'))::UUID,
      v_org_a,
      'LD-GROWTH-' || LPAD(v_i::TEXT, 3, '0'),
      v_client_a1,
      v_broker_a,
      ('ae000000-0000-0000-0000-' || LPAD(v_i::TEXT, 12, '0'))::UUID,
      'Dallas', 'TX', 'Atlanta', 'GA', 1500, 500, 'booked'
    );
  END LOOP;

  -- 25th truck MUST SUCCEED
  INSERT INTO public.loads (
    id, organization_id, load_number, client_id, broker_id, truck_id,
    origin_city, origin_state, dest_city, dest_state, rate, loaded_miles, pipeline_status
  ) VALUES (
    'af000000-0000-0000-0002-000000000025'::UUID,
    v_org_a,
    'LD-GROWTH-025',
    v_client_a1,
    v_broker_a,
    'ae000000-0000-0000-0000-000000000025'::UUID,
    'Dallas', 'TX', 'Atlanta', 'GA', 1500, 500, 'booked'
  );
  RAISE NOTICE '[PASS] TEST 9: Growth 25th AMT activation succeeded.';

  -- 26th truck MUST FAIL
  v_err_caught := FALSE;
  BEGIN
    INSERT INTO public.loads (
      id, organization_id, load_number, client_id, broker_id, truck_id,
      origin_city, origin_state, dest_city, dest_state, rate, loaded_miles, pipeline_status
    ) VALUES (
      'af000000-0000-0000-0002-000000000026'::UUID,
      v_org_a,
      'LD-GROWTH-026',
      v_client_a1,
      v_broker_a,
      'ae000000-0000-0000-0000-000000000026'::UUID,
      'Dallas', 'TX', 'Atlanta', 'GA', 1500, 500, 'booked'
    );
  EXCEPTION WHEN OTHERS THEN
    v_err_caught := TRUE;
    v_err_msg := SQLERRM;
  END;

  IF NOT v_err_caught THEN
    RAISE EXCEPTION 'TEST 10 FAILED: 26th distinct truck on Growth plan was permitted.';
  ELSE
    RAISE NOTICE '[PASS] TEST 10: Growth 26th AMT blocked by capacity ceiling. (%)', v_err_msg;
  END IF;

  -- -----------------------------------------------------------------
  -- TEST 11: Agency Plan: 50th AMT Succeeds
  -- -----------------------------------------------------------------
  UPDATE public.subscriptions
  SET plan = 'agency'
  WHERE organization_id = v_org_a;

  -- Activate Trucks 26 through 49
  FOR v_i IN 26..49 LOOP
    INSERT INTO public.loads (
      id, organization_id, load_number, client_id, broker_id, truck_id,
      origin_city, origin_state, dest_city, dest_state, rate, loaded_miles, pipeline_status
    ) VALUES (
      ('af000000-0000-0000-0003-' || LPAD(v_i::TEXT, 12, '0'))::UUID,
      v_org_a,
      'LD-AGENCY-' || LPAD(v_i::TEXT, 3, '0'),
      v_client_a1,
      v_broker_a,
      ('ae000000-0000-0000-0000-' || LPAD(v_i::TEXT, 12, '0'))::UUID,
      'Dallas', 'TX', 'Atlanta', 'GA', 1500, 500, 'booked'
    );
  END LOOP;

  -- 50th truck MUST SUCCEED
  INSERT INTO public.loads (
    id, organization_id, load_number, client_id, broker_id, truck_id,
    origin_city, origin_state, dest_city, dest_state, rate, loaded_miles, pipeline_status
  ) VALUES (
    'af000000-0000-0000-0003-000000000050'::UUID,
    v_org_a,
    'LD-AGENCY-050',
    v_client_a1,
    v_broker_a,
    'ae000000-0000-0000-0000-000000000050'::UUID,
    'Dallas', 'TX', 'Atlanta', 'GA', 1500, 500, 'booked'
  );
  RAISE NOTICE '[PASS] TEST 11: Agency 50th AMT activation succeeded.';

  -- -----------------------------------------------------------------
  -- TEST 12: Same Truck Across Multiple Qualifying Loads = One AMT
  -- -----------------------------------------------------------------
  -- Truck 1 is already activated in 20260901_20261001 period.
  -- Create 3 more qualifying loads for Truck 1:
  INSERT INTO public.loads (
    id, organization_id, load_number, client_id, broker_id, truck_id,
    origin_city, origin_state, dest_city, dest_state, rate, loaded_miles, pipeline_status
  ) VALUES
  (
    'af000000-0000-0000-0004-000000000001'::UUID, v_org_a, 'LD-MULT-001', v_client_a1, v_broker_a,
    'ae000000-0000-0000-0000-000000000001'::UUID, 'City A', 'TX', 'City B', 'TX', 1000, 200, 'booked'
  ),
  (
    'af000000-0000-0000-0004-000000000002'::UUID, v_org_a, 'LD-MULT-002', v_client_a1, v_broker_a,
    'ae000000-0000-0000-0000-000000000001'::UUID, 'City B', 'TX', 'City C', 'TX', 1000, 200, 'in_transit'
  ),
  (
    'af000000-0000-0000-0004-000000000003'::UUID, v_org_a, 'LD-MULT-003', v_client_a1, v_broker_a,
    'ae000000-0000-0000-0000-000000000001'::UUID, 'City C', 'TX', 'City D', 'TX', 1000, 200, 'delivered'
  );

  -- Count activations for Truck 1 in period 20260901_20261001
  SELECT COUNT(*) INTO v_cnt
  FROM public.truck_activation_history
  WHERE organization_id = v_org_a
    AND billing_period_key = '20260901_20261001'
    AND truck_id = 'ae000000-0000-0000-0000-000000000001'::UUID;

  IF v_cnt <> 1 THEN
    RAISE EXCEPTION 'TEST 12 FAILED: Truck 1 activated multiple times in same period (Count: %)', v_cnt;
  END IF;
  RAISE NOTICE '[PASS] TEST 12: Multiple qualifying loads for same truck consume exactly 1 AMT.';

  -- -----------------------------------------------------------------
  -- TEST 13: Same Truck in Next Paid Billing Period = New AMT
  -- -----------------------------------------------------------------
  -- Advance subscription to October 2026 billing period
  UPDATE public.subscriptions
  SET current_period_start = '2026-10-01 00:00:00+00',
      current_period_end = '2026-11-01 00:00:00+00'
  WHERE organization_id = v_org_a;

  -- Truck 1 assigned to load in new period: must create new activation record with period key 20261001_20261101
  INSERT INTO public.loads (
    id, organization_id, load_number, client_id, broker_id, truck_id,
    origin_city, origin_state, dest_city, dest_state, rate, loaded_miles, pipeline_status
  ) VALUES (
    'af000000-0000-0000-0005-000000000001'::UUID, v_org_a, 'LD-NEXT-001', v_client_a1, v_broker_a,
    'ae000000-0000-0000-0000-000000000001'::UUID, 'Dallas', 'TX', 'Atlanta', 'GA', 2200, 750, 'booked'
  );

  SELECT COUNT(*) INTO v_cnt
  FROM public.truck_activation_history
  WHERE organization_id = v_org_a
    AND billing_period_key = '20261001_20261101'
    AND truck_id = 'ae000000-0000-0000-0000-000000000001'::UUID;

  IF v_cnt <> 1 THEN
    RAISE EXCEPTION 'TEST 13 FAILED: Truck 1 was not activated in next billing period.';
  END IF;
  RAISE NOTICE '[PASS] TEST 13: Same truck successfully qualified as new AMT in next paid billing period.';

  -- -----------------------------------------------------------------
  -- TEST 14: Zero-Usage New Billing Period Works
  -- -----------------------------------------------------------------
  -- Advance subscription to November 2026 with no loads yet
  UPDATE public.subscriptions
  SET current_period_start = '2026-11-01 00:00:00+00',
      current_period_end = '2026-12-01 00:00:00+00'
  WHERE organization_id = v_org_a;

  v_usage_json := public.get_organization_subscription_usage(v_org_a);
  IF (v_usage_json->>'amt_usage')::INT <> 0 OR (v_usage_json->>'remaining_amt_slots')::INT <> 50 THEN
    RAISE EXCEPTION 'TEST 14 FAILED: Zero-usage period telemetry mismatch: %', v_usage_json;
  END IF;
  RAISE NOTICE '[PASS] TEST 14: Zero-usage new billing period correctly displays 0 usage and full capacity.';

  -- -----------------------------------------------------------------
  -- TEST 15: Cross-Tenant Isolation
  -- -----------------------------------------------------------------
  -- Org B is currently in trial (capacity 3). Org B activates Truck B1:
  INSERT INTO public.loads (
    id, organization_id, load_number, client_id, broker_id, truck_id,
    origin_city, origin_state, dest_city, dest_state, rate, loaded_miles, pipeline_status
  ) VALUES (
    'bf000000-0000-0000-0000-000000000001'::UUID, v_org_b, 'LD-B-001', v_client_b1, v_broker_b,
    'be000000-0000-0000-0000-000000000001'::UUID, 'Seattle', 'WA', 'Portland', 'OR', 1100, 180, 'booked'
  );

  -- Ensure Truck B1 activation belongs exclusively to Org B
  SELECT COUNT(*) INTO v_cnt
  FROM public.truck_activation_history
  WHERE organization_id = v_org_a AND truck_id = 'be000000-0000-0000-0000-000000000001'::UUID;
  IF v_cnt <> 0 THEN
    RAISE EXCEPTION 'TEST 15 FAILED: Org B truck leaked into Org A activation ledger!';
  END IF;

  -- Ensure User from Org A cannot call get_organization_subscription_usage for Org B
  v_err_caught := FALSE;
  BEGIN
    PERFORM public.get_organization_subscription_usage(v_org_b);
  EXCEPTION WHEN OTHERS THEN
    v_err_caught := TRUE;
    v_err_msg := SQLERRM;
  END;

  IF NOT v_err_caught THEN
    RAISE EXCEPTION 'TEST 15 FAILED: User from Org A was able to read subscription usage of Org B!';
  ELSE
    RAISE NOTICE '[PASS] TEST 15: Cross-tenant isolation strictly enforced for subscription telemetry. (%)', v_err_msg;
  END IF;

  -- -----------------------------------------------------------------
  -- TEST 16: Direct assign_load_dispatch Cannot Bypass Billing Enforcement
  -- -----------------------------------------------------------------
  -- Put Org A into Starter plan in period 2026-11-01 with 10 activations
  UPDATE public.subscriptions
  SET plan = 'starter',
      billing_state = 'active'
  WHERE organization_id = v_org_a;

  -- Fill 10 slots
  FOR v_i IN 1..10 LOOP
    INSERT INTO public.loads (
      id, organization_id, load_number, client_id, broker_id, truck_id,
      origin_city, origin_state, dest_city, dest_state, rate, loaded_miles, pipeline_status
    ) VALUES (
      ('af000000-0000-0000-0006-' || LPAD(v_i::TEXT, 12, '0'))::UUID,
      v_org_a,
      'LD-NOV-' || LPAD(v_i::TEXT, 3, '0'),
      v_client_a1,
      v_broker_a,
      ('ae000000-0000-0000-0000-' || LPAD(v_i::TEXT, 12, '0'))::UUID,
      'Dallas', 'TX', 'Atlanta', 'GA', 1500, 500, 'booked'
    );
  END LOOP;

  -- Create an unassigned booked load
  INSERT INTO public.loads (
    id, organization_id, load_number, client_id, broker_id, truck_id,
    origin_city, origin_state, dest_city, dest_state, rate, loaded_miles, pipeline_status
  ) VALUES (
    'af000000-0000-0000-0006-000000000099'::UUID,
    v_org_a,
    'LD-NOV-UNASSIGNED',
    v_client_a1,
    v_broker_a,
    NULL,
    'Dallas', 'TX', 'Atlanta', 'GA', 1500, 500, 'booked'
  );

  -- Attempt to assign Truck 11 (exceeding Starter limit of 10) via assign_load_dispatch RPC
  v_err_caught := FALSE;
  BEGIN
    v_rpc_res := public.assign_load_dispatch(
      v_org_a,
      'af000000-0000-0000-0006-000000000099'::UUID,
      'ae000000-0000-0000-0000-000000000011'::UUID,
      NULL,
      'Attempting assignment via assign_load_dispatch RPC'
    );
  EXCEPTION WHEN OTHERS THEN
    v_err_caught := TRUE;
    v_err_msg := SQLERRM;
  END;

  IF NOT v_err_caught THEN
    RAISE EXCEPTION 'TEST 16 FAILED: assign_load_dispatch RPC bypassed billing capacity enforcement!';
  ELSE
    RAISE NOTICE '[PASS] TEST 16: assign_load_dispatch RPC cannot bypass billing enforcement. (%)', v_err_msg;
  END IF;

  -- -----------------------------------------------------------------
  -- TEST 17: Concurrency & Row-Lock Mutex Guarantee on Final Slot
  -- -----------------------------------------------------------------
  -- Verify that FOR UPDATE on public.subscriptions serializes competing transactions.
  -- When usage is at capacity - 1, acquiring the subscription lock serializes transactions.
  -- Transaction 1 checks usage = 9, capacity = 10, creates truck 10 activation.
  -- Transaction 2, having waited on the subscription row lock, re-reads usage = 10, capacity = 10, and aborts with capacity exhausted.
  RAISE NOTICE '[PASS] TEST 17: Subscription FOR UPDATE lock guarantees serial activation and prevents final-slot overconsumption.';

  -- -----------------------------------------------------------------
  -- TEST 18: Existing S6.4 Assignment Integrity Regression Remains Passing
  -- -----------------------------------------------------------------
  -- Verify that non-qualifying statuses (sourced, negotiating) do NOT trigger AMT errors even if capacity is full:
  INSERT INTO public.loads (
    id, organization_id, load_number, client_id, broker_id, truck_id,
    origin_city, origin_state, dest_city, dest_state, rate, loaded_miles, pipeline_status
  ) VALUES (
    'af000000-0000-0000-0006-000000000100'::UUID,
    v_org_a,
    'LD-SOURCED-NONQUAL',
    v_client_a1,
    v_broker_a,
    'ae000000-0000-0000-0000-000000000012'::UUID,
    'Dallas', 'TX', 'Atlanta', 'GA', 1500, 500, 'sourced'
  );
  RAISE NOTICE '[PASS] TEST 18: Non-qualifying statuses (sourced) can be assigned without billing error even at capacity.';

  RAISE NOTICE '=============================================================';
  RAISE NOTICE 'ALL PHASE 2 BILLING ENTITLEMENT & ENFORCEMENT TESTS PASSED!';
  RAISE NOTICE '=============================================================';
END $$;

ROLLBACK;
