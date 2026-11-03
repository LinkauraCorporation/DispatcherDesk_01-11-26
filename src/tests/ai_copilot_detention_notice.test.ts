import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  formatSafeTimestamp,
  validateDetentionNoticeData,
  generateBrokerDetentionEmail,
} from '../modules/accessorials/accessorialComms.ts';
import { calculateDetention } from '../modules/accessorials/accessorialService.ts';
import { AccessorialWithLoad } from '../modules/accessorials/accessorialTypes.ts';
import { LoadDetentionAudit } from '../types/domain.types.ts';

describe('AI Copilot Detention Notice - Authoritative Audit Grounding and Object Serialization Fix', () => {

  it('1. formatSafeTimestamp unwraps objects, ISO strings, Date objects, and NEVER outputs [object Object]', () => {
    const opsTz = 'America/Chicago';
    const localTz = 'America/Chicago';

    // String ISO
    const isoRes = formatSafeTimestamp('2026-10-24T20:41:28.578Z', opsTz, localTz);
    assert.strictEqual(typeof isoRes, 'string');
    assert.ok(isoRes.includes('Oct 24, 2026, 03:41 PM CDT'));
    assert.ok(!isoRes.includes('[object Object]'));

    // DualTime object wrapper { primary, secondary, combined }
    const objWrapper = {
      primary: 'Oct 24, 2026, 03:41 PM CDT',
      secondary: 'Oct 24, 2026, 03:41 PM CDT',
      combined: 'Oct 24, 2026, 03:41 PM CDT',
    };
    const objRes = formatSafeTimestamp(objWrapper, opsTz, localTz);
    assert.strictEqual(typeof objRes, 'string');
    assert.ok(objRes.includes('Oct 24, 2026, 03:41 PM CDT'));
    assert.ok(!objRes.includes('[object Object]'));

    // Date instance
    const dateRes = formatSafeTimestamp(new Date('2026-11-01T17:41:00.000Z'), opsTz, localTz);
    assert.strictEqual(typeof dateRes, 'string');
    assert.ok(dateRes.includes('Nov 01, 2026, 11:41 AM CST'));
    assert.ok(!dateRes.includes('[object Object]'));

    // Invalid or null
    const nullRes = formatSafeTimestamp(null, opsTz, localTz);
    assert.strictEqual(nullRes, 'N/A');
    assert.ok(!nullRes.includes('[object Object]'));
  });

  it('2. Real load AFL-2026-1090 with Accepted Audit v11 produces exact required lines and values', () => {
    const opsTz = 'America/Chicago';
    const localTz = 'America/Chicago';

    const mockAcceptedAuditV11: any = {
      id: 'audit-v11-afl-1090',
      load_id: 'afl-2026-1090',
      audit_version: 11,
      audit_status: 'eligible',
      human_review_status: 'accepted',
      facility_type: 'pickup',
      facility_name: 'Buckeye Logistics Terminal',
      billable_hours: 165.25,
      calculated_amount: 12393.75,
      contract_terms: {
        free_time_hours: 2,
        detention_rate_per_hour: 75,
      },
      evidence_summary: {
        arrival_time: '2026-10-24T20:41:28.578Z',
        detention_start_time: '2026-10-24T22:41:28.578Z',
        departure_time: '2026-11-01T17:41:00.000Z',
        total_dwell_hours: 167.25,
      },
      created_at: '2026-11-01T18:00:00.000Z',
    };

    const mockClaim: any = {
      id: 'claim-1090-v11',
      organization_id: 'org-test',
      load_id: 'afl-2026-1090',
      type: 'detention',
      amount: 12393.75,
      status: 'draft',
      location: 'Buckeye Logistics Terminal',
      notes: 'Detention from Accepted Audit v11',
      created_at: '2026-11-01T18:05:00.000Z',
      detention_details: {
        facility_type: 'pickup',
        facility_name: 'Buckeye Logistics Terminal',
        arrival_time: '2026-10-24T20:41:28.578Z',
        departure_time: '2026-11-01T17:41:00.000Z',
        free_time_hours: 2,
        billable_hours: 165.25,
        hourly_rate: 75,
        is_active_detention: false,
        total_time_at_dock_hours: 167.25,
      },
      load: {
        id: 'afl-2026-1090',
        load_number: 'AFL-2026-1090',
        broker_name: 'Freight Connect Logistics',
        client: {
          company_name: 'Apex Fleet Logistics',
        },
      } as any,
    };

    const detCalc = calculateDetention({
      arrivalTime: '2026-10-24T20:41:28.578Z',
      departureTime: '2026-11-01T17:41:00.000Z',
      freeTimeHours: 2,
      hourlyRate: 75,
    });

    const email = generateBrokerDetentionEmail(mockClaim, detCalc, {
      operationalTimezone: opsTz,
      dispatcherTimezone: localTz,
      companyName: 'Apex Fleet Logistics',
      acceptedAudit: mockAcceptedAuditV11,
    });

    // Verify timestamps are correctly formatted and NEVER [object Object]
    assert.ok(!email.body.includes('[object Object]'), 'Body must NOT contain [object Object]');
    assert.ok(!email.subject.includes('[object Object]'), 'Subject must NOT contain [object Object]');
    assert.ok(email.body.includes('Driver Arrival Time: Oct 24, 2026, 03:41 PM CDT'));
    assert.ok(email.body.includes('Detention Started At: Oct 24, 2026, 05:41 PM CDT'));
    assert.ok(email.body.includes('Driver Departure Time: Nov 01, 2026, 11:41 AM CST'));

    // Verify required notice lines
    assert.ok(email.body.includes('• Total Billable Detention: 165.25 hours'), 'Must state 165.25 hours');
    assert.ok(email.body.includes('• Agreed Detention Rate: $75.00 / hour'), 'Must state $75.00 / hour');
    assert.ok(email.body.includes('• TOTAL DETENTION CLAIM AMOUNT: $12,393.75 USD'), 'Must state $12,393.75 USD');

    // Verify old bugged values do NOT appear
    assert.ok(!email.body.includes('187h 0m'), 'Must NOT report live calculated 187h 0m');
    assert.ok(!email.body.includes('$14,025.00'), 'Must NOT report live calculated $14,025.00');
  });

  it('3. Authoritative claim precedence prevents live elapsed clock recalculation', () => {
    const opsTz = 'America/Chicago';
    const localTz = 'America/Chicago';

    // A claim with authoritative billable_hours = 165.25 and amount = 12393.75
    // but detCalc passed with active live clock (e.g. 187h, $14,025.00)
    const mockClaim: any = {
      id: 'claim-1090-v11',
      organization_id: 'org-test',
      load_id: 'afl-2026-1090',
      type: 'detention',
      amount: 12393.75,
      status: 'draft',
      detention_details: {
        facility_type: 'pickup',
        facility_name: 'Buckeye Logistics Terminal',
        arrival_time: '2026-10-24T20:41:28.578Z',
        departure_time: '2026-11-01T17:41:00.000Z',
        free_time_hours: 2,
        billable_hours: 165.25,
        hourly_rate: 75,
        is_active_detention: false,
      },
      load: {
        id: 'afl-2026-1090',
        load_number: 'AFL-2026-1090',
      } as any,
    };

    // Simulated bugged/live calculation (e.g. without departure time)
    const buggedLiveDetCalc: any = {
      totalDwellMinutes: 11340,
      dwellDurationFormatted: '189h 0m',
      billableMinutes: 11220,
      billableHoursFormatted: '187h 0m',
      billableHoursDecimal: 187.0,
      totalAmount: 14025.0,
      amountFormatted: '$14,025.00',
      freeTimeMinutes: 120,
      freeTimeHours: 2,
      hourlyRate: 75,
      rateFormatted: '$75.00',
      isActive: true,
      detentionStartedAt: '2026-10-24T22:41:28.578Z',
      departureTime: undefined,
    };

    // Even if detCalc passed is buggedLiveDetCalc, generateBrokerDetentionEmail MUST prioritize the claim's authoritative figures
    const email = generateBrokerDetentionEmail(mockClaim, buggedLiveDetCalc, {
      operationalTimezone: opsTz,
      dispatcherTimezone: localTz,
    });

    assert.ok(email.body.includes('• Total Billable Detention: 165.25 hours'));
    assert.ok(email.body.includes('• TOTAL DETENTION CLAIM AMOUNT: $12,393.75 USD'));
    assert.ok(!email.body.includes('$14,025.00'));
    assert.ok(!email.body.includes('187h 0m'));
    assert.ok(!email.body.includes('[object Object]'));
  });

  it('4. validateDetentionNoticeData verifies fields and flags human review on incomplete data', () => {
    // Valid check
    const valid = validateDetentionNoticeData({
      claim: {
        id: 'claim-1',
        amount: 500,
        detention_details: {
          billable_hours: 5,
          hourly_rate: 100,
          arrival_time: '2026-10-24T20:00:00.000Z',
        },
      } as any,
    });
    assert.strictEqual(valid.valid, true);

    // Invalid: no claim and no audit
    const noData = validateDetentionNoticeData({});
    assert.strictEqual(noData.valid, false);
    assert.ok(noData.errors.some(e => e.includes('No authoritative detention claim or accepted audit')));

    // Invalid: non-numeric amount
    const badAmount = validateDetentionNoticeData({
      claim: {
        id: 'claim-2',
        amount: NaN,
        detention_details: {
          billable_hours: 5,
          hourly_rate: 100,
          arrival_time: '2026-10-24T20:00:00.000Z',
        },
      } as any,
    });
    assert.strictEqual(badAmount.valid, false);

    // Invalid: object string pollution
    const objectPollution = validateDetentionNoticeData({
      claim: {
        id: 'claim-3',
        amount: 500,
        location: '[object Object]',
        detention_details: {
          billable_hours: 5,
          hourly_rate: 100,
          arrival_time: '2026-10-24T20:00:00.000Z',
        },
      } as any,
    });
    assert.strictEqual(objectPollution.valid, false);
    assert.ok(objectPollution.errors.some(e => e.includes('[object Object]')));
  });

  it('5. Fallback without accepted audit preserves standard behavior without [object Object]', () => {
    const opsTz = 'America/Chicago';
    const localTz = 'America/Chicago';

    const fallbackDetCalc: any = {
      totalDwellMinutes: 240,
      dwellDurationFormatted: '4h 0m',
      billableMinutes: 120,
      billableHoursFormatted: '2h 0m',
      billableHoursDecimal: 2.0,
      totalAmount: 150.0,
      amountFormatted: '$150.00',
      freeTimeMinutes: 120,
      freeTimeHours: 2,
      hourlyRate: 75,
      rateFormatted: '$75.00',
      isActive: false,
      detentionStartedAt: '2026-10-25T14:00:00.000Z',
      departureTime: '2026-10-25T16:00:00.000Z',
    };

    const mockClaim: any = {
      id: 'claim-fallback',
      organization_id: 'org-test',
      load_id: 'load-fallback',
      type: 'detention',
      amount: 150.0,
      status: 'draft',
      detention_details: {
        facility_type: 'pickup',
        is_active_detention: false,
        arrival_time: '2026-10-25T12:00:00.000Z',
        departure_time: '2026-10-25T16:00:00.000Z',
        free_time_hours: 2,
        billable_hours: 2.0,
        hourly_rate: 75,
      },
      load: {
        load_number: 'L-1234',
      } as any,
    };

    const email = generateBrokerDetentionEmail(mockClaim, fallbackDetCalc, {
      operationalTimezone: opsTz,
      dispatcherTimezone: localTz,
    });

    assert.ok(!email.body.includes('[object Object]'));
    assert.ok(email.body.includes('• Total Billable Detention: 2.00 hours'));
    assert.ok(email.body.includes('• TOTAL DETENTION CLAIM AMOUNT: $150.00 USD'));
  });

});
