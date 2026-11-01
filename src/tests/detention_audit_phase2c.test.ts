/**
 * DispatcherDesk - AI Detention Audit Engine: Phase 2C Verification Tests
 * File: src/tests/detention_audit_phase2c.test.ts
 *
 * Verifies all 16 Phase 2C Gemini Reconciliation & Grounding Invariants:
 * 1. Authorized employee can request audit.
 * 2. Unauthorized employee is rejected (403 Forbidden).
 * 3. Cross-organization load is rejected (403 Forbidden).
 * 4. Gemini receives normalized UTC evidence.
 * 5. Gemini cannot introduce unsupported timestamps.
 * 6. Gemini cannot introduce unsupported rates.
 * 7. Gemini cannot introduce unsupported evidence IDs.
 * 8. Invalid AI JSON is rejected.
 * 9. Invalid confidence is rejected.
 * 10. Invalid discrepancy code is rejected.
 * 11. Deterministic billable hours cannot be overridden.
 * 12. Deterministic verified amount cannot be overridden.
 * 13. RateCon terms take precedence over defaults.
 * 14. Conflicting evidence produces NEEDS_REVIEW.
 * 15. AI reasoning summary is persisted.
 * 16. Previous audit versions are preserved.
 */

process.env.NODE_ENV = 'test';

// Polyfill localStorage and sessionStorage for Node environment
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (key: string) => store.get(key) || null,
    setItem: (key: string, value: string) => { store.set(key, String(value)); },
    removeItem: (key: string) => { store.delete(key); },
    clear: () => { store.clear(); },
    key: (index: number) => Array.from(store.keys())[index] || null,
    get length() { return store.size; },
  } as unknown as Storage;
}

if (typeof globalThis.sessionStorage === 'undefined') {
  const sStore = new Map<string, string>();
  globalThis.sessionStorage = {
    getItem: (key: string) => sStore.get(key) || null,
    setItem: (key: string, value: string) => { sStore.set(key, String(value)); },
    removeItem: (key: string) => { sStore.delete(key); },
    clear: () => { sStore.clear(); },
    key: (index: number) => Array.from(sStore.keys())[index] || null,
    get length() { return sStore.size; },
  } as unknown as Storage;
}

import http from 'node:http';
import { AddressInfo } from 'node:net';
import { app, authenticateAIUser, setGeminiClientForTesting, resetGeminiClientForTesting } from '../../server.ts';
import { setSupabaseAdminForTesting, resetSupabaseAdminForTesting } from '../server/supabaseAdmin.ts';
import { detentionAuditService, auditDetentionEligibility } from '../modules/accessorials/detentionAuditService.ts';
import {
  prepareNormalizedAuditContext,
  collectGroundTruth,
  validateGrounding,
  protectAndReconcileResult,
  buildGroundingFallbackResult,
  checkUserLoadAccess,
  VALID_DISCREPANCY_CODES,
} from '../modules/accessorials/detentionAuditReconciliation.ts';
import { loadService } from '../modules/loads/loadService.ts';
import { clientService } from '../modules/clients/clientService.ts';
import type { DetentionAuditInput, DetentionAuditResult } from '../modules/accessorials/detentionAuditTypes.ts';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`  ✓ PASS: ${message}`);
}

async function runTests() {
  console.log('================================================================');
  console.log('RUNNING PHASE 2C AI DETENTION AUDIT RECONCILIATION TESTS');
  console.log('================================================================\n');

  // Start in-process Express server for HTTP endpoint tests
  const server = http.createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const port = (server.address() as AddressInfo).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  const orgA = 'test-org-a-' + Date.now();
  const orgB = 'test-org-b-' + Date.now();
  const employee1 = 'user-emp-1-' + Date.now();
  const employee2 = 'user-emp-2-' + Date.now();
  const ownerAdmin = 'user-owner-admin-' + Date.now();

  try {
    // Set up test clients & loads in loadService
    const clientA = await clientService.createClient(orgA, {
      company_name: 'Carrier A Logistics',
      contact_name: 'Alice Dispatch',
      client_type: 'fleet',
    });

    const clientB = await clientService.createClient(orgB, {
      company_name: 'Carrier B Logistics',
      contact_name: 'Bob Dispatch',
      client_type: 'fleet',
    });

    // Load 101: In Org A, assigned to employee1
    const load101 = await loadService.createLoad(orgA, {
      load_number: 'LD-2C-101',
      client_id: clientA.id,
      origin_city: 'Chicago',
      origin_state: 'IL',
      dest_city: 'Atlanta',
      dest_state: 'GA',
      rate: 1800,
      loaded_miles: 710,
      equipment_type: 'dry_van',
      pipeline_status: 'delivered',
      assigned_dispatcher_id: employee1,
      pickup_datetime: '2026-10-24T08:00:00Z',
      pickup_arrival_time: '2026-10-24T08:00:00Z',
      pickup_departure_time: '2026-10-24T11:45:00Z',
    });

    // Load 202: In Org B (cross-organization)
    const load202 = await loadService.createLoad(orgB, {
      load_number: 'LD-2C-202',
      client_id: clientB.id,
      origin_city: 'Dallas',
      origin_state: 'TX',
      dest_city: 'Houston',
      dest_state: 'TX',
      rate: 900,
      loaded_miles: 240,
      equipment_type: 'dry_van',
      pipeline_status: 'delivered',
      assigned_dispatcher_id: employee2,
      pickup_datetime: '2026-10-25T09:00:00Z',
      pickup_arrival_time: '2026-10-25T09:00:00Z',
      pickup_departure_time: '2026-10-25T13:00:00Z',
    });

    const validTokenEmp1 = 'valid-jwt-token-emp1';
    const validTokenEmp2 = 'valid-jwt-token-emp2';
    const invalidToken = 'invalid-forged-token-xyz';
    const expiredToken = 'expired-token-jwt-123';

    // Mock Supabase Admin auth.getUser and isolation lookups for realistic JWT validation & isolation
    const mockAdmin = {
      auth: {
        getUser: async (token: string) => {
          if (token === validTokenEmp1) {
            return { data: { user: { id: employee1, email: 'emp1@dispatcherdesk.com' } }, error: null };
          }
          if (token === validTokenEmp2) {
            return { data: { user: { id: employee2, email: 'emp2@dispatcherdesk.com' } }, error: null };
          }
          if (token === 'valid-token-owner') {
            return { data: { user: { id: ownerAdmin, email: 'owner@dispatcherdesk.com' } }, error: null };
          }
          return { data: { user: null }, error: new Error('Invalid or expired token') };
        },
      },
      from: (table: string) => {
        if (table === 'organization_members') {
          return {
            select: () => ({
              eq: (col1: string, val1: string) => ({
                eq: (col2: string, val2: string) => ({
                  maybeSingle: async () => {
                    if (val1 === orgA && (val2 === employee1 || val2 === employee2)) {
                      return { data: { role: 'dispatcher' }, error: null };
                    }
                    if (val1 === orgA && val2 === ownerAdmin) {
                      return { data: { role: 'owner_admin' }, error: null };
                    }
                    if (val1 === orgB && val2 === employee2) {
                      return { data: { role: 'dispatcher' }, error: null };
                    }
                    return { data: null, error: null };
                  },
                }),
              }),
            }),
          };
        }
        if (table === 'loads') {
          return {
            select: () => ({
              eq: (col: string, idVal: string) => ({
                maybeSingle: async () => {
                  if (idVal === load101.id) {
                    return {
                      data: {
                        id: load101.id,
                        organization_id: orgA,
                        assigned_dispatcher_id: employee1,
                      },
                      error: null,
                    };
                  }
                  if (idVal === load202.id) {
                    return {
                      data: {
                        id: load202.id,
                        organization_id: orgB,
                        assigned_dispatcher_id: employee2,
                      },
                      error: null,
                    };
                  }
                  return { data: null, error: null };
                },
              }),
            }),
          };
        }
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: null, error: null }),
                }),
                maybeSingle: async () => ({ data: null, error: null }),
              }),
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
        };
      },
    };
    setSupabaseAdminForTesting(mockAdmin);

    console.log('--- Test Suite 1: Access Control & Authorization (Tests 1, 2, 3 + Phase 2C Auth Invariants) ---');

    // 1. Authorized employee can request audit
    const authorized = await checkUserLoadAccess(employee1, 'dispatcher', orgA, load101.id);
    assert(authorized === true, 'Authorized employee assigned to load is granted access');

    // 2. Unauthorized employee is rejected
    const unauthorized = await checkUserLoadAccess(employee2, 'dispatcher', orgA, load101.id);
    assert(unauthorized === false, 'Unauthorized employee (not assigned) is denied access');

    // 3. Cross-organization load is rejected
    const crossOrgAccess = await checkUserLoadAccess(employee1, 'dispatcher', orgA, load202.id);
    assert(crossOrgAccess === false, 'Cross-organization load is rejected');

    // Auth Invariant 1: Valid JWT succeeds
    const authHttpRes = await fetch(`${baseUrl}/api/ai/detention/audit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${validTokenEmp1}`,
        'x-test-user-id': employee1,
        'x-test-user-role': 'dispatcher',
      },
      body: JSON.stringify({
        organizationId: orgA,
        loadId: load101.id,
      }),
    });
    assert(authHttpRes.status === 200, `Valid JWT succeeds with 200 OK (got ${authHttpRes.status})`);

    // Auth Invariant 2: Missing auth in production fails with 401
    const prevEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const prodAnonRes = await fetch(`${baseUrl}/api/ai/detention/audit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId: orgA,
          loadId: load101.id,
        }),
      });
      assert(prodAnonRes.status === 401, `Missing auth in production fails with 401 Unauthorized (got ${prodAnonRes.status})`);
    } finally {
      process.env.NODE_ENV = prevEnv;
    }

    // Anonymous request (no Bearer token) when ALLOW_DEMO_AUTH is unset returns 401 Unauthorized
    const anonRes = await fetch(`${baseUrl}/api/ai/detention/audit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        organizationId: orgA,
        loadId: load101.id,
      }),
    });
    assert(anonRes.status === 401, `Anonymous request rejected with 401 Unauthorized (got ${anonRes.status})`);

    // Auth Invariant 3: Invalid Bearer token fails with 401
    const invalidBearerRes = await fetch(`${baseUrl}/api/ai/detention/audit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${invalidToken}`,
      },
      body: JSON.stringify({
        organizationId: orgA,
        loadId: load101.id,
      }),
    });
    assert(invalidBearerRes.status === 401, `Invalid Bearer token fails with 401 Unauthorized (got ${invalidBearerRes.status})`);

    // Auth Invariant 4: Expired/invalid token NEVER falls through to demo-user-1 even when ALLOW_DEMO_AUTH=true
    process.env.ALLOW_DEMO_AUTH = 'true';
    try {
      const expiredHttpRes = await fetch(`${baseUrl}/api/ai/detention/audit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${expiredToken}`,
        },
        body: JSON.stringify({
          organizationId: orgA,
          loadId: load101.id,
        }),
      });
      assert(expiredHttpRes.status === 401, `Expired Bearer token fails with 401 even when ALLOW_DEMO_AUTH=true (got ${expiredHttpRes.status})`);

      const expiredDirectAuth = await authenticateAIUser({ headers: { authorization: `Bearer ${expiredToken}` } } as any);
      assert(expiredDirectAuth === null, 'Expired/invalid token returns null from authenticateAIUser and never becomes demo-user-1');
    } finally {
      delete process.env.ALLOW_DEMO_AUTH;
    }

    // Auth Invariant 5: Demo auth works ONLY when NODE_ENV !== 'production' && ALLOW_DEMO_AUTH === 'true'
    process.env.ALLOW_DEMO_AUTH = 'true';
    const demoAllowed = await authenticateAIUser({ headers: {} } as any);
    assert(
      demoAllowed !== null && demoAllowed.userId === 'demo-user-1' && demoAllowed.isDemo === true,
      'Demo auth returns demo-user-1 when NODE_ENV !== "production" and ALLOW_DEMO_AUTH === "true"'
    );

    delete process.env.ALLOW_DEMO_AUTH;
    const demoDeniedUnset = await authenticateAIUser({ headers: {} } as any);
    assert(demoDeniedUnset === null, 'Demo auth returns null when ALLOW_DEMO_AUTH is unset');

    process.env.NODE_ENV = 'production';
    process.env.ALLOW_DEMO_AUTH = 'true';
    const demoDeniedProd = await authenticateAIUser({ headers: {} } as any);
    assert(demoDeniedProd === null, 'Demo auth returns null in production even when ALLOW_DEMO_AUTH === "true"');
    process.env.NODE_ENV = 'test';
    delete process.env.ALLOW_DEMO_AUTH;

    // Auth Invariant 6: Employee load isolation & cross-organization checks preserved with authenticated session
    // Unauthorized employee (not assigned to load101) rejected with 403 Forbidden
    const unauthHttpRes = await fetch(`${baseUrl}/api/ai/detention/audit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${validTokenEmp2}`,
        'x-test-user-id': employee2,
        'x-test-user-role': 'dispatcher',
      },
      body: JSON.stringify({
        organizationId: orgA,
        loadId: load101.id,
      }),
    });
    assert(unauthHttpRes.status === 403, `Unauthorized employee rejected with 403 Forbidden (got ${unauthHttpRes.status})`);

    // Cross-organization load rejected with 403 Forbidden
    const crossOrgHttpRes = await fetch(`${baseUrl}/api/ai/detention/audit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${validTokenEmp1}`,
        'x-test-user-id': employee1,
        'x-test-user-role': 'dispatcher',
      },
      body: JSON.stringify({
        organizationId: orgA,
        loadId: load202.id, // belongs to orgB
      }),
    });
    assert(crossOrgHttpRes.status === 403, `Cross-organization load rejected with 403 Forbidden (got ${crossOrgHttpRes.status})`);

    console.log('\n--- Test Suite 2: Context Normalization to UTC (Test 4) ---');

    const sampleInput: DetentionAuditInput = {
      loadId: load101.id,
      facilityScope: 'all',
      loadContext: {
        loadNumber: 'LD-2C-101',
        pickupDatetime: '2026-10-24 08:00:00-05',
        pickupTimezone: 'America/Chicago',
        deliveryDatetime: '2026-10-25 10:00:00-04',
        deliveryTimezone: 'America/New_York',
        operationalTimezone: 'America/Chicago',
        pipelineStatus: 'delivered',
        pickupArrival: '2026-10-24 08:00:00-05',
        pickupLoadingStart: '2026-10-24 08:30:00-05',
        pickupLoadingComplete: '2026-10-24 11:30:00-05',
        pickupDeparture: '2026-10-24 11:45:00-05',
        deliveryArrival: '2026-10-25 09:45:00-04',
        deliveryUnloadingStart: '2026-10-25 10:00:00-04',
        deliveryUnloadingComplete: '2026-10-25 11:30:00-04',
        deliveryDeparture: '2026-10-25 11:45:00-04',
      },
      rateConTerms: {
        hasRateCon: true,
        freeTimeHours: 2.0,
        hourlyRate: 75.0,
        detentionNoticeTerms: 'Notify broker 30 mins prior to detention',
        specialInstructions: 'Requires signed in and out times on bill of lading',
      },
      checkCalls: [
        {
          id: 'cc-1',
          callType: 'arrived_pickup',
          status: 'completed',
          eventAt: '2026-10-24 08:00:00-05',
          notes: 'Driver at shipper gate',
          locationCity: 'Chicago',
          locationState: 'IL',
        },
      ],
      documentEvidence: [
        {
          id: 'doc-pod-1',
          docType: 'pod',
          status: 'verified',
          fileName: 'signed_pod.pdf',
          notes: 'Signed in 09:45, signed out 11:45',
          uploadedAt: '2026-10-25 12:00:00-04',
        },
      ],
      activityNotes: [
        {
          id: 'act-1',
          type: 'note',
          content: 'Broker notified 30 mins prior to detention start at shipper.',
          timestamp: '2026-10-24 09:30:00-05',
          authorName: 'Dispatcher Alice',
        },
      ],
      driverMessages: [
        {
          id: 'msg-1',
          sender: 'driver',
          text: 'Arrived at receiver gate',
          timestamp: '2026-10-25 09:45:00-04',
        },
      ],
    };

    const deterministicBaseline = auditDetentionEligibility(sampleInput);
    const normalizedContext = prepareNormalizedAuditContext(sampleInput, deterministicBaseline);

    assert(
      typeof normalizedContext.pickupFacility.appointmentUtc === 'string' &&
      normalizedContext.pickupFacility.appointmentUtc.endsWith('Z'),
      'Pickup appointment normalized to UTC ISO ending with Z'
    );
    assert(
      typeof normalizedContext.deliveryFacility.appointmentUtc === 'string' &&
      normalizedContext.deliveryFacility.appointmentUtc.endsWith('Z'),
      'Delivery appointment normalized to UTC ISO ending with Z'
    );
    assert(
      typeof normalizedContext.pickupFacility.milestonesUtc.arrival === 'string' &&
      normalizedContext.pickupFacility.milestonesUtc.arrival.endsWith('Z'),
      'Pickup arrival milestone normalized to UTC ISO ending with Z'
    );
    assert(
      typeof normalizedContext.checkCalls[0].eventAtUtc === 'string' &&
      normalizedContext.checkCalls[0].eventAtUtc.endsWith('Z'),
      'Check call eventAt normalized to UTC ISO'
    );
    assert(
      typeof normalizedContext.documents[0].uploadedAtUtc === 'string' &&
      normalizedContext.documents[0].uploadedAtUtc.endsWith('Z'),
      'Document uploadedAt normalized to UTC ISO'
    );
    assert(
      normalizedContext.pickupFacility !== undefined && normalizedContext.deliveryFacility !== undefined,
      'Pickup and delivery contexts remain strictly separate'
    );

    console.log('\n--- Test Suite 3: Grounding Validation & Hallucination Prevention (Tests 5, 6, 7) ---');

    const groundTruth = collectGroundTruth(sampleInput, deterministicBaseline);

    // 5. Gemini cannot introduce unsupported timestamps
    const aiWithFakeTimestamp = {
      status: 'eligible',
      overallConfidence: 0.90,
      requiresHumanReview: false,
      pickupAudit: {
        status: 'eligible',
        arrivalTime: '2026-10-24T13:00:00.000Z',
        departureTime: '2026-10-31T23:59:00.000Z', // INVENTED TIMESTAMP
        findings: ['Fabricated milestone timing'],
      },
      deliveryAudit: {
        status: 'not_eligible',
        findings: [],
      },
      evidence: [
        {
          id: 'ev-fake-time',
          sourceType: 'load_milestone',
          sourceReference: 'loads.pickup_departure_time',
          timestamp: '2026-10-31T23:59:00.000Z', // INVENTED TIMESTAMP
          extractedFact: 'Invented late departure timestamp',
          confidence: 0.95,
          supportsClaim: true,
        },
      ],
      discrepancies: [],
      missingEvidence: [],
      reasoningSummary: 'Test with invented timestamp',
    };

    const fakeTimeValidation = validateGrounding(aiWithFakeTimestamp, groundTruth, deterministicBaseline);
    assert(fakeTimeValidation.valid === false, 'Gemini unsupported timestamp is detected and rejected');
    assert(
      fakeTimeValidation.errors.some((e) => e.includes('unsupported timestamp') || e.includes('AI cannot invent')),
      'Validation error explicitly flags unsupported timestamp'
    );

    // 6. Gemini cannot introduce unsupported rates
    const aiWithFakeRate = {
      status: 'eligible',
      overallConfidence: 0.85,
      requiresHumanReview: false,
      pickupAudit: {
        status: 'eligible',
        hourlyRate: 150.0, // INVENTED RATE (input was $75)
        findings: ['Invented $150/hr rate'],
      },
      deliveryAudit: {
        status: 'not_eligible',
        findings: [],
      },
      evidence: [],
      discrepancies: [],
      missingEvidence: [],
      reasoningSummary: 'Test with invented rate',
    };

    const fakeRateValidation = validateGrounding(aiWithFakeRate, groundTruth, deterministicBaseline);
    assert(fakeRateValidation.valid === false, 'Gemini unsupported hourly rate is detected and rejected');
    assert(
      fakeRateValidation.errors.some((e) => e.includes('Unsupported hourly rate')),
      'Validation error explicitly flags unsupported hourly rate'
    );

    // 7. Gemini cannot introduce unsupported evidence IDs
    const aiWithFakeDoc = {
      status: 'eligible',
      overallConfidence: 0.85,
      requiresHumanReview: false,
      pickupAudit: { status: 'eligible', findings: [] },
      deliveryAudit: { status: 'not_eligible', findings: [] },
      evidence: [
        {
          id: 'ev-hallucinated',
          sourceType: 'bol_pod',
          sourceReference: 'documents.fake-pod-doc-99999', // INVENTED DOCUMENT ID
          timestamp: null,
          extractedFact: 'Signed gate slip from non-existent document',
          confidence: 0.9,
          supportsClaim: true,
        },
      ],
      discrepancies: [],
      missingEvidence: [],
      reasoningSummary: 'Test with invented document ID',
    };

    const fakeDocValidation = validateGrounding(aiWithFakeDoc, groundTruth, deterministicBaseline);
    assert(fakeDocValidation.valid === false, 'Gemini unsupported evidence ID is detected and rejected');
    assert(
      fakeDocValidation.errors.some((e) => e.includes('unsupported document ID') || e.includes('unsupported sourceReference')),
      'Validation error explicitly flags invented document ID'
    );

    console.log('\n--- Test Suite 4: Structural & Schema Validation (Tests 8, 9, 10) ---');

    // 8. Invalid AI JSON is rejected
    const malformedValidation = validateGrounding('this is not json' as any, groundTruth, deterministicBaseline);
    assert(malformedValidation.valid === false, 'Non-object AI response is rejected');

    const fallbackForMalformed = buildGroundingFallbackResult(deterministicBaseline, ['Invalid JSON from AI']);
    assert(fallbackForMalformed.status === 'needs_review', 'Malformed AI output falls back safely to needs_review');
    assert(fallbackForMalformed.requiresHumanReview === true, 'Malformed AI output enforces requiresHumanReview = true');

    // 9. Invalid confidence is rejected
    const aiWithInvalidConfidence = {
      status: 'eligible',
      overallConfidence: 1.50, // INVALID (> 1.0)
      requiresHumanReview: false,
      pickupAudit: { status: 'eligible', findings: [] },
      deliveryAudit: { status: 'not_eligible', findings: [] },
      evidence: [],
      discrepancies: [],
      missingEvidence: [],
      reasoningSummary: 'Test with out-of-bounds confidence',
    };
    const invalidConfValidation = validateGrounding(aiWithInvalidConfidence, groundTruth, deterministicBaseline);
    assert(invalidConfValidation.valid === false, 'Confidence score > 1.0 is rejected');
    assert(
      invalidConfValidation.errors.some((e) => e.includes('overallConfidence')),
      'Validation error explicitly flags invalid confidence'
    );

    // 10. Invalid discrepancy code is rejected
    const aiWithBadDiscrepancy = {
      status: 'needs_review',
      overallConfidence: 0.75,
      requiresHumanReview: true,
      pickupAudit: { status: 'needs_review', findings: [] },
      deliveryAudit: { status: 'not_eligible', findings: [] },
      evidence: [],
      discrepancies: [
        {
          code: 'DRIVER_WENT_TO_LUNCH', // INVALID DISCREPANCY CODE
          severity: 'warning',
          description: 'Driver took an unauthorized lunch break',
          conflictingSources: ['deterministic_audit'],
          recommendedAction: 'Check with dispatcher',
        },
      ],
      missingEvidence: [],
      reasoningSummary: 'Test with invalid discrepancy code',
    };
    const badDiscValidation = validateGrounding(aiWithBadDiscrepancy, groundTruth, deterministicBaseline);
    assert(badDiscValidation.valid === false, 'Invalid discrepancy code is rejected');
    assert(
      badDiscValidation.errors.some((e) => e.includes('invalid discrepancy code')),
      'Validation error explicitly flags invalid discrepancy code'
    );

    console.log('\n--- Test Suite 5: Deterministic Financial Protection (Tests 11, 12) ---');

    // Deterministic calculation: pickup arrival 08:00Z, departure 11:45Z (3.75h dwell - 2.0h free = 1.75h billable = $131.25)
    assert(deterministicBaseline.pickupAudit.billableHours === 1.75, 'Deterministic billable hours is 1.75');
    assert(deterministicBaseline.pickupAudit.verifiedAmount === 131.25, 'Deterministic verified amount is $131.25');

    // Mock AI attempts to override billable hours to 5.0h and amount to $500.00
    const aiAttemptingFinancialOverride = {
      status: 'eligible',
      overallConfidence: 0.95,
      requiresHumanReview: false,
      pickupAudit: {
        status: 'eligible',
        billableHours: 5.0, // OVERRIDE ATTEMPT
        verifiedAmount: 500.0, // OVERRIDE ATTEMPT
        findings: ['AI attempting to grant 5 hours'],
      },
      deliveryAudit: {
        status: 'not_eligible',
        billableHours: 2.0,
        verifiedAmount: 150.0,
        findings: [],
      },
      totalVerifiedHours: 7.0, // OVERRIDE ATTEMPT
      totalVerifiedAmount: 650.0, // OVERRIDE ATTEMPT
      evidence: [],
      discrepancies: [],
      missingEvidence: [],
      reasoningSummary: 'Reconciliation preserving deterministic math.',
    };

    const reconciledResult = protectAndReconcileResult(deterministicBaseline, aiAttemptingFinancialOverride, sampleInput);

    // 11. Deterministic billable hours cannot be overridden
    assert(
      reconciledResult.pickupAudit.billableHours === 1.75,
      `Deterministic pickup billable hours preserved: expected 1.75, got ${reconciledResult.pickupAudit.billableHours}`
    );
    assert(
      reconciledResult.totalVerifiedHours === 1.75,
      `Deterministic total verified hours preserved: expected 1.75, got ${reconciledResult.totalVerifiedHours}`
    );

    // 12. Deterministic verified amount cannot be overridden
    assert(
      reconciledResult.pickupAudit.verifiedAmount === 131.25,
      `Deterministic pickup verified amount preserved: expected 131.25, got ${reconciledResult.pickupAudit.verifiedAmount}`
    );
    assert(
      reconciledResult.totalVerifiedAmount === 131.25,
      `Deterministic total verified amount preserved: expected 131.25, got ${reconciledResult.totalVerifiedAmount}`
    );

    console.log('\n--- Test Suite 6: RateCon Interpretation & Precedence (Test 13) ---');

    // 13. RateCon terms take precedence over defaults
    // Default is $75/hr & 2h free. RateCon provides $50/hr and 1.0h free.
    const customRateConInput: DetentionAuditInput = {
      ...sampleInput,
      rateConTerms: {
        hasRateCon: true,
        freeTimeHours: 1.0, // 1h free instead of 2h default
        hourlyRate: 50.0, // $50/hr instead of $75/hr default
        detentionNoticeTerms: null,
        specialInstructions: 'Standard terms',
      },
    };

    const rateConBaseline = auditDetentionEligibility(customRateConInput);
    // Dwell is 3.75 hours. 3.75 - 1.0 = 2.75h billable @ $50/hr = $137.50
    assert(
      rateConBaseline.pickupAudit.freeTimeHours === 1.0,
      `RateCon free time (1.0h) takes precedence over default (2.0h). Got ${rateConBaseline.pickupAudit.freeTimeHours}`
    );
    assert(
      rateConBaseline.pickupAudit.hourlyRate === 50.0,
      `RateCon hourly rate ($50.00) takes precedence over default ($75.00). Got ${rateConBaseline.pickupAudit.hourlyRate}`
    );
    assert(
      rateConBaseline.pickupAudit.billableHours === 2.75,
      `Billable hours calculated with RateCon free time: 2.75h. Got ${rateConBaseline.pickupAudit.billableHours}`
    );
    assert(
      rateConBaseline.pickupAudit.verifiedAmount === 137.50,
      `Verified amount calculated with RateCon rate: $137.50. Got ${rateConBaseline.pickupAudit.verifiedAmount}`
    );

    console.log('\n--- Test Suite 7: Conflict Reconciliation produces NEEDS_REVIEW (Test 14) ---');

    // 14. Conflicting evidence produces NEEDS_REVIEW
    // Example: Check-call says arrival 09:15, milestone says arrival 11:45 (150 min mismatch)
    const conflictingInput: DetentionAuditInput = {
      ...sampleInput,
      loadContext: {
        ...sampleInput.loadContext,
        pickupArrival: '2026-10-24T11:45:00Z',
      },
      checkCalls: [
        {
          id: 'cc-mismatch',
          callType: 'arrived_pickup',
          status: 'completed',
          eventAt: '2026-10-24T09:15:00Z', // 150m divergence from milestone
          notes: 'Driver reported arrival at 09:15',
          locationCity: 'Chicago',
          locationState: 'IL',
        },
      ],
    };

    const conflictBaseline = auditDetentionEligibility(conflictingInput);
    assert(
      conflictBaseline.discrepancies.some((d) => d.code === 'CHECK_CALL_TIME_MISMATCH'),
      'CHECK_CALL_TIME_MISMATCH discrepancy generated for >30m variance'
    );
    assert(
      conflictBaseline.requiresHumanReview === true,
      'Conflicting check-call forces requiresHumanReview = true'
    );

    // AI reconciliation preserves the conflict and cannot override needs_review to eligible
    const aiAttemptingEligibleOnConflict = {
      status: 'eligible',
      overallConfidence: 0.90,
      requiresHumanReview: false,
      pickupAudit: { status: 'eligible', findings: [] },
      deliveryAudit: { status: 'not_eligible', findings: [] },
      evidence: [],
      discrepancies: [],
      missingEvidence: [],
      reasoningSummary: 'AI erroneously claiming eligible despite discrepancy',
    };

    const reconciledConflict = protectAndReconcileResult(conflictBaseline, aiAttemptingEligibleOnConflict, conflictingInput);
    assert(
      reconciledConflict.status === 'needs_review',
      `Reconciled status remains needs_review despite AI recommendation: ${reconciledConflict.status}`
    );
    assert(
      reconciledConflict.requiresHumanReview === true,
      'requiresHumanReview remains true'
    );

    console.log('\n--- Test Suite 8: Persistence & Audit Versioning (Tests 15, 16) ---');

    const loadForVersioning = await loadService.createLoad(orgA, {
      load_number: 'LD-2C-VER',
      client_id: clientA.id,
      origin_city: 'Indianapolis',
      origin_state: 'IN',
      dest_city: 'Louisville',
      dest_state: 'KY',
      rate: 1200,
      loaded_miles: 115,
      equipment_type: 'dry_van',
      pipeline_status: 'delivered',
      assigned_dispatcher_id: employee1,
    });

    const mockAiSummary = 'Carrier Marcus Vance arrived on-time at shipper facility (08:00 UTC). Total dwell of 3h 45m exceeded contractual 2.0h free time by 1.75 billable hours. RateCon detention rate of $75/hr applied per agreement. Signed POD on delivery confirmed gate times.';

    const auditResultToPersist: DetentionAuditResult = {
      ...deterministicBaseline,
      loadId: loadForVersioning.id,
      reasoningSummary: mockAiSummary,
    };

    // 15. AI reasoning summary is persisted
    const savedAuditV1 = await detentionAuditService.saveAuditResult(orgA, auditResultToPersist);
    assert(savedAuditV1.id !== undefined && savedAuditV1.id.length > 0, 'Audit record persisted with unique ID');
    assert(
      savedAuditV1.reasoning_summary === mockAiSummary,
      'AI reasoning summary is persisted into database record'
    );
    assert(savedAuditV1.audit_version === 1, `First audit has audit_version = 1. Got ${savedAuditV1.audit_version}`);

    // 16. Previous audit versions are preserved
    const updatedSummaryV2 = 'Second audit run: Reconciled with updated receiver gate logs. Authoritative 1.75h maintained.';
    const auditResultV2: DetentionAuditResult = {
      ...auditResultToPersist,
      reasoningSummary: updatedSummaryV2,
    };

    const savedAuditV2 = await detentionAuditService.saveAuditResult(orgA, auditResultV2);
    assert(savedAuditV2.id !== savedAuditV1.id, 'Second audit run generated a distinct record ID');
    assert(
      savedAuditV2.audit_version === 2,
      `Second audit run has audit_version = 2 (previous version preserved). Got ${savedAuditV2.audit_version}`
    );

    // Verify both versions exist in database
    const allLoadAudits = await detentionAuditService.getAuditsByLoad(orgA, loadForVersioning.id);
    assert(allLoadAudits.length >= 2, `Both audit versions retrieved: found ${allLoadAudits.length} records`);
    const versions = allLoadAudits.map((a) => a.audit_version);
    assert(versions.includes(1) && versions.includes(2), 'Both version 1 and version 2 exist in audit history');

    console.log('\n--- Test Suite 9: End-to-End Server Endpoint Mock Test ---');

    // Test POST /api/ai/detention/audit via in-memory mock Gemini client
    const tracker = { geminiCalled: false };
    setGeminiClientForTesting({
      models: {
        generateContent: async (params: any) => {
          tracker.geminiCalled = true;
          return {
            text: JSON.stringify({
              status: 'eligible',
              overallConfidence: 0.94,
              requiresHumanReview: false,
              pickupAudit: {
                status: 'eligible',
                findings: ['On-time arrival, valid dwell exceeding free time.'],
              },
              deliveryAudit: {
                status: 'not_applicable',
                findings: [],
              },
              evidence: [
                {
                  id: 'ev-reconciled',
                  sourceType: 'load_milestone',
                  sourceReference: 'loads.pickup_arrival_time',
                  timestamp: '2026-10-24T08:00:00.000Z',
                  extractedFact: 'Authoritative pickup gate arrival confirmed',
                  confidence: 0.98,
                  supportsClaim: true,
                },
              ],
              discrepancies: [],
              missingEvidence: [],
              reasoningSummary: 'End-to-end endpoint reconciliation verified successfully.',
            }),
          };
        },
      },
    });

    const endpointRes = await fetch(`${baseUrl}/api/ai/detention/audit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${validTokenEmp1}`,
        'x-test-user-id': employee1,
        'x-test-user-role': 'dispatcher',
      },
      body: JSON.stringify({
        organizationId: orgA,
        loadId: load101.id,
        deterministicInput: sampleInput,
      }),
    });

    assert(endpointRes.status === 200, `POST /api/ai/detention/audit returns 200 OK (got ${endpointRes.status})`);
    const endpointJson = await endpointRes.json();
    assert(endpointJson.success === true, 'Response payload contains success: true');
    assert(endpointJson.audit !== undefined, 'Response payload contains persisted audit record');
    assert(endpointJson.result !== undefined, 'Response payload contains reconciled result');
    assert(
      endpointJson.result.totalVerifiedHours === 1.75,
      `Deterministic billable hours preserved in endpoint response (1.75h). Got: ${endpointJson.result.totalVerifiedHours}`
    );
    assert(
      endpointJson.result.totalVerifiedAmount === 131.25,
      `Deterministic verified amount preserved in endpoint response ($131.25). Got: ${endpointJson.result.totalVerifiedAmount}`
    );
    assert(tracker.geminiCalled === true, 'Mock Gemini client was invoked by server endpoint');

    console.log('\n--- Test Suite 10: Atomic Concurrency & Unique Versioning Verification ---');

    const loadForConcurrency = await loadService.createLoad(orgA, {
      load_number: 'LD-2C-CONC-1',
      client_id: clientA.id,
      origin_city: 'Memphis',
      origin_state: 'TN',
      dest_city: 'Nashville',
      dest_state: 'TN',
      rate: 1500,
      loaded_miles: 210,
      equipment_type: 'dry_van',
      pipeline_status: 'delivered',
      assigned_dispatcher_id: employee1,
    });

    const concAuditResult1: DetentionAuditResult = {
      ...deterministicBaseline,
      loadId: loadForConcurrency.id,
      reasoningSummary: 'Concurrent audit execution 1',
    };

    const concAuditResult2: DetentionAuditResult = {
      ...deterministicBaseline,
      loadId: loadForConcurrency.id,
      reasoningSummary: 'Concurrent audit execution 2',
    };

    // 17. Execute simultaneous saveAuditResult calls for the same load
    const [auditResA, auditResB] = await Promise.all([
      detentionAuditService.saveAuditResult(orgA, concAuditResult1),
      detentionAuditService.saveAuditResult(orgA, concAuditResult2),
    ]);

    assert(auditResA !== null && auditResB !== null, 'Both concurrent saveAuditResult calls completed successfully');
    assert(auditResA.id !== auditResB.id, 'Both concurrent audit records have distinct record IDs');
    assert(
      auditResA.audit_version !== auditResB.audit_version,
      `Concurrent audit versions are unique: v${auditResA.audit_version} vs v${auditResB.audit_version}`
    );

    const concVersions = [auditResA.audit_version, auditResB.audit_version].sort((a, b) => a - b);
    assert(
      concVersions[0] === 1 && concVersions[1] === 2,
      `Concurrent audit versions are strictly sequential [1, 2]. Got: [${concVersions.join(', ')}]`
    );

    // Verify all records retrieved by load and no duplicates exist
    const loadAuditsAfterConc = await detentionAuditService.getAuditsByLoad(orgA, loadForConcurrency.id);
    assert(loadAuditsAfterConc.length === 2, `Both audit records remain available in load audit history (found ${loadAuditsAfterConc.length})`);

    const versionSet = new Set(loadAuditsAfterConc.map((a) => a.audit_version));
    assert(
      versionSet.size === loadAuditsAfterConc.length,
      `No duplicate (load_id, audit_version) records exist for load ${loadForConcurrency.id}`
    );

    // Verify deterministic values remain completely unchanged
    assert(
      auditResA.total_verified_hours === 1.75 && auditResB.total_verified_hours === 1.75,
      'Deterministic verified hours preserved across all concurrent audits (1.75h)'
    );
    assert(
      auditResA.total_verified_amount === 131.25 && auditResB.total_verified_amount === 131.25,
      'Deterministic verified amount preserved across all concurrent audits ($131.25)'
    );

    // High contention test: 3 simultaneous writes for a fresh load
    const loadForHighContention = await loadService.createLoad(orgA, {
      load_number: 'LD-2C-CONC-2',
      client_id: clientA.id,
      origin_city: 'Indianapolis',
      origin_state: 'IN',
      dest_city: 'Columbus',
      dest_state: 'OH',
      rate: 1800,
      loaded_miles: 175,
      equipment_type: 'reefer',
      pipeline_status: 'delivered',
      assigned_dispatcher_id: employee1,
    });

    const concBatch = await Promise.all([
      detentionAuditService.saveAuditResult(orgA, { ...deterministicBaseline, loadId: loadForHighContention.id, reasoningSummary: 'Batch 1' }),
      detentionAuditService.saveAuditResult(orgA, { ...deterministicBaseline, loadId: loadForHighContention.id, reasoningSummary: 'Batch 2' }),
      detentionAuditService.saveAuditResult(orgA, { ...deterministicBaseline, loadId: loadForHighContention.id, reasoningSummary: 'Batch 3' }),
    ]);

    assert(concBatch.length === 3, 'All 3 high-contention simultaneous audit saves succeeded');
    const batchVersions = concBatch.map((a) => a.audit_version).sort((a, b) => a - b);
    assert(
      batchVersions[0] === 1 && batchVersions[1] === 2 && batchVersions[2] === 3,
      `High-contention batch produced sequential unique versions [1, 2, 3]. Got: [${batchVersions.join(', ')}]`
    );
    const uniqueBatchIds = new Set(concBatch.map((a) => a.id));
    assert(uniqueBatchIds.size === 3, 'All 3 high-contention records have unique IDs');

    const highContentionAudits = await detentionAuditService.getAuditsByLoad(orgA, loadForHighContention.id);
    assert(highContentionAudits.length === 3, `All 3 audits retrieved from storage/db history for load ${loadForHighContention.id}`);

    console.log('\n================================================================');
    console.log('✅ ALL PHASE 2C AI DETENTION RECONCILIATION & CONCURRENCY TESTS PASSED');
    console.log('================================================================');
  } finally {
    resetGeminiClientForTesting();
    resetSupabaseAdminForTesting();
    server.close();
  }
}

runTests().catch((err) => {
  console.error('\n❌ Phase 2C Test Suite Failure:', err);
  process.exit(1);
});
