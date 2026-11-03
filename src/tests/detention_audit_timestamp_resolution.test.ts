/**
 * Focused Unit & Integration Tests: Detention Audit Check-Call Timestamp Selection
 * File: src/tests/detention_audit_timestamp_resolution.test.ts
 *
 * Verifies the fix for real load AFL-2026-1090:
 * 1. arrived_pickup with conflicting event_at and created_at (resolves to genuine created_at, avoiding 9536m false late penalty).
 * 2. arrived_pickup with valid event_at (preserves explicit retroactive or concurrent event_at).
 * 3. Fallback to created_at when event_at is missing/null/empty.
 * 4. Delivery arrival logic preservation (valid event_at preserved, anomalous future event_at resolved to created_at).
 * 5. Full deterministic detention calculation using real load AFL-2026-1090 parameters.
 */

// Polyfill localStorage and sessionStorage for Node test environment
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
  resolveCheckCallEffectiveTime,
  auditDetentionEligibility,
  normalizeToIso,
  getTimeMs,
} from '../modules/accessorials/detentionAuditService.ts';
import { DetentionAuditInput } from '../modules/accessorials/detentionAuditTypes.ts';

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✓ PASS: ${testName}`);
    passCount++;
  } else {
    console.error(`  ✗ FAIL: ${testName}${detail ? ` - ${detail}` : ''}`);
    failCount++;
  }
}

async function runTimestampResolutionTests() {
  console.log('================================================================');
  console.log('RUNNING FOCUSED DETENTION AUDIT TIMESTAMP RESOLUTION TESTS');
  console.log('================================================================');

  // -------------------------------------------------------------
  // Test Suite 1: arrived_pickup with conflicting event_at and created_at (AFL-2026-1090)
  // -------------------------------------------------------------
  console.log('\n--- Test Suite 1: arrived_pickup with Conflicting event_at and created_at ---');
  {
    // Real load AFL-2026-1090 confirmed data
    const aflCheckCall = {
      id: '362a6c1a-b38a-445f-b635-0dfd695e3fe4',
      call_type: 'arrived_pickup',
      created_at: '2026-10-24T20:41:28.578224Z',
      event_at: '2026-11-01T09:26:25.588752Z', // Erroneously bumped to Nov 1 (8 days later)
    };

    const resolvedIso = resolveCheckCallEffectiveTime(aflCheckCall);
    const expectedIso = normalizeToIso('2026-10-24T20:41:28.578224Z');

    assert(
      resolvedIso === expectedIso,
      'AFL-2026-1090 conflicting check call resolves to created_at (Oct 24, 2026, 03:41 PM CDT)',
      `Expected ${expectedIso}, got ${resolvedIso}`
    );

    // Another conflicting check call where event_at is 2 hours in the future
    const futureCheckCall = {
      id: 'cc-future-conflict',
      call_type: 'arrived_pickup',
      created_at: '2026-10-24T12:00:00.000Z',
      event_at: '2026-10-24T14:00:00.000Z',
    };
    const resolvedFutureIso = resolveCheckCallEffectiveTime(futureCheckCall);
    assert(
      resolvedFutureIso === '2026-10-24T12:00:00.000Z',
      'Future event_at relative to created_at is rejected in favor of authoritative created_at'
    );
  }

  // -------------------------------------------------------------
  // Test Suite 2: arrived_pickup with valid event_at
  // -------------------------------------------------------------
  console.log('\n--- Test Suite 2: arrived_pickup with Valid event_at ---');
  {
    // Retroactive check call: driver arrived at 14:00, dispatcher logged check call at 14:30
    const retroactiveCheckCall = {
      id: 'cc-retroactive-valid',
      call_type: 'arrived_pickup',
      created_at: '2026-10-24T14:30:00.000Z',
      event_at: '2026-10-24T14:00:00.000Z',
    };

    const resolvedIso = resolveCheckCallEffectiveTime(retroactiveCheckCall);
    assert(
      resolvedIso === '2026-10-24T14:00:00.000Z',
      'Valid retroactive event_at (event_at <= created_at) is preserved',
      `Expected 2026-10-24T14:00:00.000Z, got ${resolvedIso}`
    );

    // Concurrent check call: event_at identical to created_at
    const concurrentCheckCall = {
      id: 'cc-concurrent-valid',
      call_type: 'arrived_pickup',
      created_at: '2026-10-24T15:41:28.000Z',
      event_at: '2026-10-24T15:41:28.000Z',
    };
    const resolvedConcurrent = resolveCheckCallEffectiveTime(concurrentCheckCall);
    assert(
      resolvedConcurrent === '2026-10-24T15:41:28.000Z',
      'Concurrent event_at (event_at == created_at) is preserved'
    );
  }

  // -------------------------------------------------------------
  // Test Suite 3: Fallback to created_at when appropriate
  // -------------------------------------------------------------
  console.log('\n--- Test Suite 3: Fallback to created_at when appropriate ---');
  {
    // Null event_at
    const nullEventCheckCall = {
      id: 'cc-null-event',
      call_type: 'arrived_pickup',
      created_at: '2026-10-24T20:41:28.578Z',
      event_at: null,
    };
    assert(
      resolveCheckCallEffectiveTime(nullEventCheckCall) === '2026-10-24T20:41:28.578Z',
      'Falls back to created_at when event_at is null'
    );

    // Undefined event_at
    const undefinedEventCheckCall = {
      id: 'cc-undefined-event',
      call_type: 'arrived_pickup',
      created_at: '2026-10-24T20:41:28.578Z',
    };
    assert(
      resolveCheckCallEffectiveTime(undefinedEventCheckCall) === '2026-10-24T20:41:28.578Z',
      'Falls back to created_at when event_at is undefined'
    );

    // Empty string event_at
    const emptyEventCheckCall = {
      id: 'cc-empty-event',
      call_type: 'arrived_pickup',
      created_at: '2026-10-24T20:41:28.578Z',
      event_at: '',
    };
    assert(
      resolveCheckCallEffectiveTime(emptyEventCheckCall) === '2026-10-24T20:41:28.578Z',
      'Falls back to created_at when event_at is empty string'
    );

    // Fallback to event_at when created_at is missing
    const missingCreatedCheckCall = {
      id: 'cc-missing-created',
      call_type: 'arrived_pickup',
      created_at: null,
      event_at: '2026-10-24T20:15:00.000Z',
    };
    assert(
      resolveCheckCallEffectiveTime(missingCreatedCheckCall) === '2026-10-24T20:15:00.000Z',
      'Falls back to event_at when created_at is missing/null'
    );
  }

  // -------------------------------------------------------------
  // Test Suite 4: Preservation of Delivery Arrival Logic
  // -------------------------------------------------------------
  console.log('\n--- Test Suite 4: Delivery Arrival Logic Preservation ---');
  {
    // Delivery check call with valid retroactive event_at
    const deliveryValidCall = {
      id: 'cc-del-valid',
      call_type: 'arrived_delivery',
      created_at: '2026-10-26T14:30:00.000Z',
      event_at: '2026-10-26T14:00:00.000Z',
    };
    assert(
      resolveCheckCallEffectiveTime(deliveryValidCall) === '2026-10-26T14:00:00.000Z',
      'Delivery arrival preserves valid explicit retroactive event_at'
    );

    // Delivery check call with conflicting future event_at
    const deliveryConflictCall = {
      id: 'cc-del-conflict',
      call_type: 'arrived_delivery',
      created_at: '2026-10-26T14:30:00.000Z',
      event_at: '2026-11-02T10:00:00.000Z',
    };
    assert(
      resolveCheckCallEffectiveTime(deliveryConflictCall) === '2026-10-26T14:30:00.000Z',
      'Delivery arrival safely rejects anomalous future event_at and uses created_at'
    );
  }

  // -------------------------------------------------------------
  // Test Suite 5: End-to-End Audit Calculation for Load AFL-2026-1090
  // -------------------------------------------------------------
  console.log('\n--- Test Suite 5: Full Detention Audit Calculation for Load AFL-2026-1090 ---');
  {
    // Real load AFL-2026-1090 configuration:
    // Scheduled appointment: 2026-10-25T18:30:00.000Z
    // Check call: created_at = 2026-10-24T20:41:28.578Z, event_at = 2026-11-01T09:26:25.588Z
    const aflInput: DetentionAuditInput = {
      loadId: '27a07989-16e0-4921-b60d-25c2681578e2',
      facilityScope: 'pickup',
      loadContext: {
        loadNumber: 'AFL-2026-1090',
        pickupDatetime: '2026-10-25T18:30:00.000Z',
        pickupTimezone: 'America/Chicago',
        deliveryDatetime: null,
        deliveryTimezone: 'America/Chicago',
        operationalTimezone: 'America/Chicago',
        pipelineStatus: 'delivered',
        pickupArrival: null, // Null on load record, so check-call is the authoritative arrival evidence
        pickupLoadingStart: null,
        pickupLoadingComplete: null,
        pickupDeparture: '2026-10-25T21:00:00.000Z',
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
          id: '362a6c1a-b38a-445f-b635-0dfd695e3fe4',
          callType: 'arrived_pickup',
          status: 'arrived',
          eventAt: resolveCheckCallEffectiveTime({
            call_type: 'arrived_pickup',
            created_at: '2026-10-24T20:41:28.578224Z',
            event_at: '2026-11-01T09:26:25.588752Z',
          })!,
          created_at: '2026-10-24T20:41:28.578224Z',
          event_at: '2026-11-01T09:26:25.588752Z',
          notes: 'Driver in-gate at shipper',
          locationCity: 'Dallas',
          locationState: 'TX',
        },
      ],
      documentEvidence: [],
      activityNotes: [],
      driverMessages: [],
    };

    const auditResult = auditDetentionEligibility(aflInput);

    // Verify arrival time used
    assert(
      auditResult.pickupAudit.arrivalTime === '2026-10-24T20:41:28.578Z',
      'Audit uses Oct 24, 2026 03:41 PM CDT arrival (2026-10-24T20:41:28.578Z)'
    );

    // Verify punctuality assessment: driver arrived early (day before), NOT late!
    assert(
      auditResult.pickupAudit.punctualityAssessment === 'early',
      `Punctuality correctly assessed as 'early' instead of 'late'. Got: ${auditResult.pickupAudit.punctualityAssessment}`
    );

    // Verify no false 9536-minute late appointment discrepancy
    const hasLateDiscrepancy = auditResult.discrepancies.some((d) => d.code === 'APPOINTMENT_MISMATCH');
    assert(
      !hasLateDiscrepancy,
      'No false APPOINTMENT_MISMATCH discrepancy (9536-minute late penalty eliminated)'
    );

    // Verify early dwell buffer deduction
    assert(
      (auditResult.pickupAudit.earlyArrivalBufferDeductedMinutes || 0) > 0,
      `Early arrival dwell prior to appointment is deducted (${auditResult.pickupAudit.earlyArrivalBufferDeductedMinutes}m deducted)`
    );
  }

  console.log('\n================================================================');
  if (failCount === 0) {
    console.log(`✅ ALL TIMESTAMP RESOLUTION TESTS PASSED (${passCount}/${passCount})`);
  } else {
    console.error(`❌ SOME TESTS FAILED: ${passCount} passed, ${failCount} failed`);
  }
  console.log('================================================================');

  if (failCount > 0) {
    process.exit(1);
  }
}

runTimestampResolutionTests().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
