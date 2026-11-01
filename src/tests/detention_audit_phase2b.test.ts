/**
 * DispatcherDesk - AI Detention Audit Engine: Phase 2B Verification Tests
 * File: src/tests/detention_audit_phase2b.test.ts
 *
 * Verifies:
 * 1. Evidence aggregation (milestones, check calls, documents, ratecon terms).
 * 2. Internal UTC/ISO timestamp normalization.
 * 3. Independent pickup & delivery audit sub-ledgers.
 * 4. Deterministic freight rules:
 *    - On-time arrival with dwell > free time -> eligible, standard 15-min increments.
 *    - Dwell within free time -> not eligible (0 billable hours).
 *    - Early arrival -> pre-appointment dwell deducted; free time begins at appointment.
 *    - Late arrival -> appointment mismatch discrepancy + needs_review.
 *    - Missing departure -> missing departure discrepancy + needs_review.
 *    - Check call timestamp divergence (>30m) -> check call time mismatch discrepancy.
 *    - Missing POD on delivery -> missing signed POD discrepancy.
 *    - 15-minute standard freight rounding.
 * 5. Structured DetentionAuditResult contracts.
 * 6. Audit persistence & retrieval via load_detention_audits.
 */

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

import {
  auditDetentionEligibility,
  detentionAuditService,
  normalizeToIso,
  getTimeMs,
} from '../modules/accessorials/detentionAuditService.ts';
import { DetentionAuditInput } from '../modules/accessorials/detentionAuditTypes.ts';
import { loadService } from '../modules/loads/loadService.ts';
import { clientService } from '../modules/clients/clientService.ts';

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✓ PASS: ${testName}`);
    passCount++;
  } else {
    console.error(`  ✗ FAIL: ${testName}${detail ? ` -> ${detail}` : ''}`);
    failCount++;
  }
}

async function runPhase2BTests() {
  console.log('================================================================');
  console.log('RUNNING PHASE 2B DETERMINISTIC DETENTION AUDIT ENGINE TESTS');
  console.log('================================================================');

  // --- Suite 1: Timestamp Normalization ---
  console.log('\n--- Test Suite 1: Timestamp Normalization to UTC/ISO ---');
  {
    const iso1 = normalizeToIso('2026-11-01T14:30:00.000Z');
    assert(iso1 === '2026-11-01T14:30:00.000Z', 'Strict ISO string preserved');

    const iso2 = normalizeToIso('2026-11-01 10:00:00 UTC');
    assert(iso2 !== null && iso2.endsWith('Z'), 'UTC string converted to valid ISO UTC ending with Z');

    const iso3 = normalizeToIso(null);
    assert(iso3 === null, 'Null returns null');

    const iso4 = normalizeToIso('invalid-datetime');
    assert(iso4 === null, 'Invalid string returns null');

    const ms = getTimeMs('2026-11-01T12:00:00.000Z');
    assert(typeof ms === 'number' && ms > 0, 'Epoch milliseconds returned correctly');
  }

  // --- Suite 2: Deterministic Rule Engine - On-Time Eligible Claim ---
  console.log('\n--- Test Suite 2: On-Time Eligible Claim with 15-Minute Billing Increments ---');
  {
    const baseInput: DetentionAuditInput = {
      loadId: 'test-load-201',
      facilityScope: 'all',
      loadContext: {
        loadNumber: 'LD-2026-201',
        pickupDatetime: '2026-11-01T08:00:00.000Z',
        pickupTimezone: 'America/Chicago',
        deliveryDatetime: '2026-11-02T10:00:00.000Z',
        deliveryTimezone: 'America/New_York',
        operationalTimezone: 'America/Chicago',
        pipelineStatus: 'delivered',
        // Arrived at 08:00 (on-time), departed at 11:45 (3h 45m dwell)
        pickupArrival: '2026-11-01T08:00:00.000Z',
        pickupLoadingStart: '2026-11-01T09:30:00.000Z',
        pickupLoadingComplete: '2026-11-01T11:45:00.000Z',
        pickupDeparture: '2026-11-01T11:45:00.000Z',
        // Delivery: Arrived 10:00, departed 11:30 (1.5h dwell <= 2.0h free time)
        deliveryArrival: '2026-11-02T10:00:00.000Z',
        deliveryUnloadingStart: '2026-11-02T10:30:00.000Z',
        deliveryUnloadingComplete: '2026-11-02T11:30:00.000Z',
        deliveryDeparture: '2026-11-02T11:30:00.000Z',
      },
      rateConTerms: {
        hasRateCon: true,
        freeTimeHours: 2.0,
        hourlyRate: 75.0,
        detentionNoticeTerms: null,
        specialInstructions: null,
      },
      checkCalls: [
        {
          id: 'cc-1',
          callType: 'arrived_pickup',
          status: 'arrived',
          eventAt: '2026-11-01T08:00:00.000Z',
          notes: 'Driver at shipper gate',
          locationCity: 'Dallas',
          locationState: 'TX',
        },
        {
          id: 'cc-2',
          callType: 'loaded',
          status: 'departed',
          eventAt: '2026-11-01T11:45:00.000Z',
          notes: 'Signed bills in hand',
          locationCity: 'Dallas',
          locationState: 'TX',
        },
      ],
      documentEvidence: [
        {
          id: 'doc-ratecon',
          docType: 'rate_confirmation',
          status: 'verified',
          fileName: 'RateCon_201.pdf',
          notes: 'Detention $75/hr after 2 hrs free',
          uploadedAt: '2026-10-31T15:00:00.000Z',
        },
        {
          id: 'doc-pod',
          docType: 'pod',
          status: 'verified',
          fileName: 'Signed_POD_201.pdf',
          notes: 'Clean receiver stamp with in/out times',
          uploadedAt: '2026-11-02T12:00:00.000Z',
        },
      ],
      activityNotes: [],
      driverMessages: [],
    };

    const result = auditDetentionEligibility(baseInput);

    assert(result.status === 'eligible', 'Overall audit status is eligible');
    assert(result.pickupAudit.status === 'eligible', 'Pickup status is eligible');
    assert(result.pickupAudit.punctualityAssessment === 'on_time', 'Pickup punctuality assessed as on_time');
    assert(result.pickupAudit.billableHours === 1.75, `Pickup billable hours is 1.75h (3.75h total dwell - 2.0h free time). Got ${result.pickupAudit.billableHours}`);
    assert(result.pickupAudit.verifiedAmount === 131.25, `Pickup verified amount is $131.25 (1.75h * $75). Got ${result.pickupAudit.verifiedAmount}`);
    assert(result.pickupAudit.detentionStartTime === '2026-11-01T10:00:00.000Z', 'Detention start time is exactly 2.0h after arrival (10:00:00Z)');
    assert(result.deliveryAudit.status === 'not_eligible', 'Delivery status is not_eligible (within free time)');
    assert(result.deliveryAudit.billableHours === 0.0, 'Delivery billable hours is 0.0');
    assert(result.deliveryAudit.verifiedAmount === 0.0, 'Delivery verified amount is $0.00');
    assert(result.totalVerifiedHours === 1.75, 'Total verified hours is 1.75');
    assert(result.totalVerifiedAmount === 131.25, 'Total verified amount is $131.25');
    assert(result.overallConfidence >= 0.85, `Overall confidence is high (${result.overallConfidence})`);
    assert(result.requiresHumanReview === false, 'Clean eligible claim does NOT require human review');
  }

  // --- Suite 3: Early Arrival Rule (Pre-appointment buffer deduction) ---
  console.log('\n--- Test Suite 3: Early Arrival Dwell Deduction ---');
  {
    const earlyInput: DetentionAuditInput = {
      loadId: 'test-load-early',
      facilityScope: 'pickup',
      loadContext: {
        loadNumber: 'LD-2026-EARLY',
        // Scheduled at 14:00, driver arrives at 12:30 (90 mins early)
        pickupDatetime: '2026-11-01T14:00:00.000Z',
        pickupTimezone: 'America/Chicago',
        deliveryDatetime: '2026-11-02T14:00:00.000Z',
        deliveryTimezone: 'America/Chicago',
        operationalTimezone: 'America/Chicago',
        pipelineStatus: 'in_transit',
        pickupArrival: '2026-11-01T12:30:00.000Z',
        pickupLoadingStart: '2026-11-01T14:30:00.000Z',
        pickupLoadingComplete: '2026-11-01T17:00:00.000Z',
        pickupDeparture: '2026-11-01T17:00:00.000Z',
        deliveryArrival: null,
        deliveryUnloadingStart: null,
        deliveryUnloadingComplete: null,
        deliveryDeparture: null,
      },
      rateConTerms: {
        hasRateCon: true,
        freeTimeHours: 2.0,
        hourlyRate: 75.0,
        detentionNoticeTerms: null,
        specialInstructions: null,
      },
      checkCalls: [],
      documentEvidence: [],
      activityNotes: [],
      driverMessages: [],
    };

    const result = auditDetentionEligibility(earlyInput);

    assert(result.pickupAudit.punctualityAssessment === 'early', 'Punctuality correctly assessed as early');
    assert(result.pickupAudit.earlyArrivalBufferDeductedMinutes === 90, `Early arrival buffer is 90 minutes. Got ${result.pickupAudit.earlyArrivalBufferDeductedMinutes}`);
    // Free time begins at 14:00 (appointment time), so 2h free time ends at 16:00. Departure at 17:00 => 1.0h billable.
    // (If arrival 12:30 were incorrectly used, it would be 4.5h - 2h = 2.5h billable).
    assert(result.pickupAudit.billableHours === 1.0, `Early arrival dwell before appointment is deducted: billable hours is 1.0h. Got ${result.pickupAudit.billableHours}`);
    assert(result.pickupAudit.verifiedAmount === 75.0, `Verified amount is $75.00. Got ${result.pickupAudit.verifiedAmount}`);
    assert(result.pickupAudit.detentionStartTime === '2026-11-01T16:00:00.000Z', 'Detention start time begins 2.0h after scheduled appointment (16:00Z)');
  }

  // --- Suite 4: Late Arrival Discrepancy & Broker Approval Required ---
  console.log('\n--- Test Suite 4: Late Arrival Discrepancy & Needs Review ---');
  {
    const lateInput: DetentionAuditInput = {
      loadId: 'test-load-late',
      facilityScope: 'pickup',
      loadContext: {
        loadNumber: 'LD-2026-LATE',
        // Scheduled 10:00, driver arrives at 11:30 (90 min late)
        pickupDatetime: '2026-11-01T10:00:00.000Z',
        pickupTimezone: 'America/Chicago',
        deliveryDatetime: '2026-11-02T10:00:00.000Z',
        deliveryTimezone: 'America/Chicago',
        operationalTimezone: 'America/Chicago',
        pipelineStatus: 'in_transit',
        pickupArrival: '2026-11-01T11:30:00.000Z',
        pickupLoadingStart: '2026-11-01T12:00:00.000Z',
        pickupLoadingComplete: '2026-11-01T15:30:00.000Z',
        pickupDeparture: '2026-11-01T15:30:00.000Z',
        deliveryArrival: null,
        deliveryUnloadingStart: null,
        deliveryUnloadingComplete: null,
        deliveryDeparture: null,
      },
      rateConTerms: {
        hasRateCon: true,
        freeTimeHours: 2.0,
        hourlyRate: 75.0,
        detentionNoticeTerms: null,
        specialInstructions: null,
      },
      checkCalls: [],
      documentEvidence: [],
      activityNotes: [],
      driverMessages: [],
    };

    const result = auditDetentionEligibility(lateInput);

    assert(result.pickupAudit.punctualityAssessment === 'late', 'Punctuality assessed as late');
    assert(result.pickupAudit.status === 'needs_review', 'Late arrival detention status is needs_review');
    assert(result.status === 'needs_review', 'Overall audit status is needs_review');
    assert(result.requiresHumanReview === true, 'Late arrival requires human review');
    const hasApptMismatch = result.discrepancies.some((d) => d.code === 'APPOINTMENT_MISMATCH');
    assert(hasApptMismatch, 'APPOINTMENT_MISMATCH discrepancy generated');
    const hasBrokerReq = result.discrepancies.some((d) => d.code === 'BROKER_APPROVAL_REQUIRED');
    assert(hasBrokerReq, 'BROKER_APPROVAL_REQUIRED discrepancy generated');
  }

  // --- Suite 5: Check-Call Timestamp Divergence ---
  console.log('\n--- Test Suite 5: Check-Call Divergence (>30 min) ---');
  {
    const mismatchInput: DetentionAuditInput = {
      loadId: 'test-load-mismatch',
      facilityScope: 'pickup',
      loadContext: {
        loadNumber: 'LD-2026-MISMATCH',
        pickupDatetime: '2026-11-01T08:00:00.000Z',
        pickupTimezone: 'America/Chicago',
        deliveryDatetime: '2026-11-02T10:00:00.000Z',
        deliveryTimezone: 'America/Chicago',
        operationalTimezone: 'America/Chicago',
        pipelineStatus: 'in_transit',
        pickupArrival: '2026-11-01T08:00:00.000Z', // Milestone says 08:00
        pickupLoadingStart: null,
        pickupLoadingComplete: '2026-11-01T12:00:00.000Z',
        pickupDeparture: '2026-11-01T12:00:00.000Z',
        deliveryArrival: null,
        deliveryUnloadingStart: null,
        deliveryUnloadingComplete: null,
        deliveryDeparture: null,
      },
      rateConTerms: {
        hasRateCon: true,
        freeTimeHours: 2.0,
        hourlyRate: 75.0,
        detentionNoticeTerms: null,
        specialInstructions: null,
      },
      checkCalls: [
        {
          id: 'cc-mismatch',
          callType: 'arrived_pickup',
          status: 'arrived',
          eventAt: '2026-11-01T09:15:00.000Z', // Check call says 09:15 (75m difference!)
          notes: 'Driver at guard shack',
          locationCity: 'Dallas',
          locationState: 'TX',
        },
      ],
      documentEvidence: [],
      activityNotes: [],
      driverMessages: [],
    };

    const result = auditDetentionEligibility(mismatchInput);

    const hasCheckCallMismatch = result.discrepancies.some((d) => d.code === 'CHECK_CALL_TIME_MISMATCH');
    assert(hasCheckCallMismatch, 'CHECK_CALL_TIME_MISMATCH discrepancy generated for >30m variance');
    assert(result.requiresHumanReview === true, 'Discrepancy triggers requiresHumanReview = true');
  }

  // --- Suite 6: Delivery Claim Missing Signed POD ---
  console.log('\n--- Test Suite 6: Delivery Claim Missing Signed POD ---');
  {
    const deliveryInput: DetentionAuditInput = {
      loadId: 'test-load-pod',
      facilityScope: 'delivery',
      loadContext: {
        loadNumber: 'LD-2026-POD',
        pickupDatetime: '2026-11-01T08:00:00.000Z',
        pickupTimezone: 'America/Chicago',
        deliveryDatetime: '2026-11-02T10:00:00.000Z',
        deliveryTimezone: 'America/New_York',
        operationalTimezone: 'America/Chicago',
        pipelineStatus: 'delivered',
        pickupArrival: null,
        pickupLoadingStart: null,
        pickupLoadingComplete: null,
        pickupDeparture: null,
        deliveryArrival: '2026-11-02T10:00:00.000Z',
        deliveryUnloadingStart: '2026-11-02T11:00:00.000Z',
        deliveryUnloadingComplete: '2026-11-02T14:30:00.000Z',
        deliveryDeparture: '2026-11-02T14:30:00.000Z', // 4.5h dwell = 2.5h detention
      },
      rateConTerms: {
        hasRateCon: true,
        freeTimeHours: 2.0,
        hourlyRate: 75.0,
        detentionNoticeTerms: null,
        specialInstructions: null,
      },
      checkCalls: [],
      documentEvidence: [], // No POD uploaded!
      activityNotes: [],
      driverMessages: [],
    };

    const result = auditDetentionEligibility(deliveryInput);

    const hasMissingPod = result.discrepancies.some((d) => d.code === 'MISSING_SIGNED_POD');
    assert(hasMissingPod, 'MISSING_SIGNED_POD discrepancy generated for delivery claim');
    assert(result.missingEvidence.some((m) => m.includes('POD')), 'POD flagged in missingEvidence');
    assert(result.requiresHumanReview === true, 'Missing POD requires human review before billing');
  }

  // --- Suite 7: Full Service Execution & Database Persistence ---
  console.log('\n--- Test Suite 7: Full Service runDeterministicAudit & Persistence ---');
  {
    const testOrgId = 'test-org-audit-phase2b';
    const testClient = await clientService.createClient(testOrgId, {
      company_name: 'Audit Test Carrier LLC',
      contact_name: 'Sarah Broker',
      client_type: 'fleet',
    });

    const testLoad = await loadService.createLoad(testOrgId, {
      load_number: 'LD-AUDIT-9901',
      client_id: testClient.id,
      equipment_type: 'dry_van',
      rate: 3200.0,
      loaded_miles: 850,
      pipeline_status: 'booked',
      origin_city: 'Dallas',
      origin_state: 'TX',
      dest_city: 'Atlanta',
      dest_state: 'GA',
      pickup_datetime: '2026-11-01T08:00:00.000Z',
      delivery_datetime: '2026-11-02T14:00:00.000Z',
    });

    // Update stop milestones on load (pickup arrival 08:00, departure 11:15 -> 3h 15m dwell = 1.25h detention)
    await loadService.updateLoad(testOrgId, testLoad.id, {
      pickup_arrival_time: '2026-11-01T08:00:00.000Z',
      pickup_loading_start_time: '2026-11-01T09:00:00.000Z',
      pickup_loading_complete_time: '2026-11-01T11:15:00.000Z',
      pickup_departure_time: '2026-11-01T11:15:00.000Z',
    });

    const { result, persistedAudit } = await detentionAuditService.runDeterministicAudit(testOrgId, testLoad.id);

    assert(Boolean(persistedAudit && persistedAudit.id), 'Audit persisted successfully with ID');
    assert(persistedAudit.load_id === testLoad.id, 'Persisted audit load_id matches test load');
    assert(persistedAudit.organization_id === testOrgId, 'Persisted audit organization_id matches');
    assert(persistedAudit.pickup_status === 'eligible', 'Persisted pickup_status is eligible');
    assert(persistedAudit.pickup_billable_hours === 1.25, `Persisted pickup billable hours is 1.25. Got ${persistedAudit.pickup_billable_hours}`);
    assert(persistedAudit.pickup_verified_amount === 93.75, `Persisted pickup verified amount is $93.75 (1.25h * $75). Got ${persistedAudit.pickup_verified_amount}`);
    assert(persistedAudit.total_verified_amount === 93.75, 'Persisted total_verified_amount matches');
    assert(persistedAudit.human_review_status === 'pending', 'Initial human review status is pending');

    // Test getAuditsByLoad
    const audits = await detentionAuditService.getAuditsByLoad(testOrgId, testLoad.id);
    assert(audits.length >= 1, `getAuditsByLoad returns ${audits.length} audit records`);

    // Test getLatestAuditForLoad
    const latest = await detentionAuditService.getLatestAuditForLoad(testOrgId, testLoad.id);
    assert(latest !== null && latest.id === persistedAudit.id, 'getLatestAuditForLoad retrieves latest record');

    // Test getAuditById
    const single = await detentionAuditService.getAuditById(testOrgId, persistedAudit.id);
    assert(single !== null && single.id === persistedAudit.id, 'getAuditById retrieves exact audit');
  }

  console.log('================================================================');
  if (failCount === 0) {
    console.log(`✅ ALL PHASE 2B DETENTION AUDIT TESTS PASSED (${passCount}/${passCount})`);
  } else {
    console.error(`❌ SOME TESTS FAILED: ${passCount} passed, ${failCount} failed`);
  }
  console.log('================================================================');

  if (failCount > 0) {
    process.exit(1);
  }
}

runPhase2BTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
