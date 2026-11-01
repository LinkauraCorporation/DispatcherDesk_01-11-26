-- ====================================================================
-- DispatcherDesk Verification Tests: Multi-Tenant Isolation & Security (S5.5)
-- File: supabase/tests/s5_5_tenant_isolation.sql
-- Description:
-- Unit and Integration tests for verifying tenant boundaries, RLS policies,
-- immutable tenant linkage, composite foreign keys, and SECURITY DEFINER RPCs.
-- ====================================================================

-- Begin test transaction (Rollback at end so database state remains clean)
BEGIN;

-- ====================================================================
-- 1. Setup Test Tenants & Users
-- ====================================================================

-- Create Test Organization A (Alpha Logistics)
INSERT INTO public.organizations (id, name, slug, primary_timezone)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Alpha Logistics Test Org',
  'alpha-test-org',
  'America/Chicago'
) ON CONFLICT (id) DO NOTHING;

-- Create Test Organization B (Beta Freight)
INSERT INTO public.organizations (id, name, slug, primary_timezone)
VALUES (
  '00000000-0000-0000-0000-000000000002',
  'Beta Freight Test Org',
  'beta-test-org',
  'America/New_York'
) ON CONFLICT (id) DO NOTHING;

-- Create Test Client in Org A
INSERT INTO public.clients (id, organization_id, company_name, client_type, status)
VALUES (
  '00000000-0000-0000-0001-000000000001',
  '00000000-0000-0000-0000-000000000001',
  'Alpha Test Carrier Client',
  'fleet',
  'active'
) ON CONFLICT (id) DO NOTHING;

-- Create Test Client in Org B
INSERT INTO public.clients (id, organization_id, company_name, client_type, status)
VALUES (
  '00000000-0000-0000-0002-000000000001',
  '00000000-0000-0000-0000-000000000002',
  'Beta Test Carrier Client',
  'owner_operator',
  'active'
) ON CONFLICT (id) DO NOTHING;

-- ====================================================================
-- TEST 1: Cross-Tenant Foreign Key Linkage Prevention
-- A load in Org A MUST NOT be permitted to reference a client in Org B.
-- ====================================================================
DO $$
BEGIN
  BEGIN
    INSERT INTO public.loads (
      organization_id,
      load_number,
      client_id,
      origin_city,
      origin_state,
      dest_city,
      dest_state
    ) VALUES (
      '00000000-0000-0000-0000-000000000001', -- Org A
      'TEST-LD-CROSS-01',
      '00000000-0000-0000-0002-000000000001', -- Org B Client (Foreign!)
      'Chicago', 'IL',
      'Dallas', 'TX'
    );
    RAISE EXCEPTION 'TEST 1 FAILED: Cross-tenant composite FK violation was not prevented!';
  EXCEPTION
    WHEN foreign_key_violation THEN
      RAISE NOTICE 'TEST 1 PASSED: Cross-tenant FK insertion successfully rejected by composite constraint.';
  END;
END;
$$;

-- ====================================================================
-- TEST 2: Immutable organization_id Reassignment Prevention
-- Updating organization_id on an existing client in Org A to Org B MUST fail.
-- ====================================================================
DO $$
BEGIN
  BEGIN
    UPDATE public.clients
    SET organization_id = '00000000-0000-0000-0000-000000000002' -- Change Org A to Org B
    WHERE id = '00000000-0000-0001-0000-000000000001';
    
    RAISE EXCEPTION 'TEST 2 FAILED: organization_id reassignment was not blocked by trigger!';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM LIKE '%organization_id is immutable%' THEN
        RAISE NOTICE 'TEST 2 PASSED: organization_id reassignment successfully blocked by immutability trigger.';
      ELSE
        RAISE;
      END IF;
  END;
END;
$$;

-- ====================================================================
-- TEST 3: RPC Authorization & Tenant Scope in create_team_invitation
-- An unauthenticated or unauthorized user calling create_team_invitation MUST fail.
-- ====================================================================
DO $$
BEGIN
  BEGIN
    PERFORM public.create_team_invitation(
      '00000000-0000-0000-0000-000000000001',
      'intruder@example.com',
      'dispatcher',
      'mock_token_hash_00000000000000000000000000000000000000000000000000'
    );
    RAISE EXCEPTION 'TEST 3 FAILED: RPC allowed unauthenticated invocation!';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM LIKE '%Authentication required%' OR SQLERRM LIKE '%Unauthorized%' THEN
        RAISE NOTICE 'TEST 3 PASSED: create_team_invitation strictly enforced caller authentication and owner_admin authorization.';
      ELSE
        RAISE;
      END IF;
  END;
END;
$$;

-- Rollback test data and side effects
ROLLBACK;
