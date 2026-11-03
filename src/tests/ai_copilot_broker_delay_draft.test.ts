// In-memory localStorage and sessionStorage polyfills for Node.js test environment
if (typeof (globalThis as any).localStorage === 'undefined') {
  const store = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (key: string) => store.get(key) || null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
    key: (index: number) => Array.from(store.keys())[index] || null,
    get length() { return store.size; },
  };
}

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { generateLocalBrokerEmail } from '../modules/ai/aiService.ts';
import { AIContext, AIRequest, AIContextLoad, AIContextCheckCall } from '../modules/ai/aiTypes.ts';

describe('AI Copilot Broker Draft - Check-Call Delay Grounding', () => {

  const baseLoad: AIContextLoad = {
    id: 'load-101',
    loadNumber: 'LD-8801',
    pipelineStatus: 'in_transit',
    origin: 'Dallas, TX',
    destination: 'Chicago, IL',
    pickupTimeFormatted: 'Oct 28, 2026, 08:00 AM CDT',
    deliveryTimeFormatted: 'Oct 29, 2026, 04:00 PM CDT',
    deliveryDatetimeRaw: '2026-10-29T21:00:00.000Z',
    equipmentType: 'dry_van',
    carrierClientName: 'Apex Fleet Logistics',
    brokerCompanyName: 'C.H. Robinson Worldwide',
    brokerContact: 'Sarah Jenkins',
    brokerEmail: 'sjenkins@chrobinson.example.com',
    driverName: 'Marcus Vance',
    truckNumber: 'TRK-402',
    rateFormatted: '$3,400.00',
    rpmFormatted: '$3.65/mi',
    isAtRisk: false,
    isTracked: true,
    isMissingRecentCheckIn: false,
    totalCheckCalls: 2,
    timeSinceLastUpdate: '2 hours ago',
  };

  const baseContext: AIContext = {
    organizationId: 'org-test-1',
    userRole: 'dispatcher',
    generatedAtIso: new Date().toISOString(),
    operationalTimezone: 'America/Chicago',
    dispatcherTimezone: 'America/Chicago',
    currentTimeOps: 'Oct 29, 2026, 10:00 AM CDT',
    currentTimeDispatcher: 'Oct 29, 2026, 10:00 AM CDT',
    loads: [baseLoad],
    recentCheckCalls: [],
    pendingAccessorials: [],
    missingDocuments: [],
    recentActivities: [],
    tasks: [],
    operationalAlerts: [],
  };

  const baseRequest: AIRequest = {
    action: 'broker_email',
    loadId: 'load-101',
    mode: 'local',
  };

  it('1. No delay check call: preserves existing routine tracking update behavior exactly', async () => {
    const routineCall: AIContextCheckCall = {
      id: 'cc-routine-1',
      loadId: 'load-101',
      loadNumber: 'LD-8801',
      callType: 'en_route_delivery',
      status: 'on_time',
      location: 'Little Rock, AR',
      loggedAtFormatted: 'Oct 29, 2026, 08:00 AM CDT',
      eventAtRaw: '2026-10-29T13:00:00.000Z',
      isException: false,
    };

    const ctx: AIContext = {
      ...baseContext,
      recentCheckCalls: [routineCall],
    };

    const response = await generateLocalBrokerEmail(
      'resp-1',
      new Date().toISOString(),
      ctx,
      baseRequest
    );

    assert.strictEqual(response.action, 'broker_email');
    assert.ok(response.subject?.includes('[STATUS UPDATE] Load #LD-8801'));
    assert.ok(response.content.includes('The driver is on schedule and tracking smoothly.'));
    assert.ok(response.content.includes('Marcus Vance'));
    assert.ok(response.content.includes('TRK-402'));
    assert.ok(response.content.includes('C.H. Robinson Worldwide'));
    assert.ok(!response.content.toLowerCase().includes('transit delay'));
  });

  it('2. Delay check call exists: draft explicitly mentions the delay and updates subject', async () => {
    const delayCall: AIContextCheckCall = {
      id: 'cc-delay-1',
      loadId: 'load-101',
      loadNumber: 'LD-8801',
      callType: 'delay',
      status: 'delayed',
      location: 'Memphis, TN',
      notes: 'Severe tire blowout on right tandem, roadside assistance dispatched',
      loggedAtFormatted: 'Oct 29, 2026, 09:30 AM CDT',
      eventAtRaw: '2026-10-29T14:30:00.000Z',
      isException: true,
    };

    const ctx: AIContext = {
      ...baseContext,
      recentCheckCalls: [delayCall],
    };

    const response = await generateLocalBrokerEmail(
      'resp-2',
      new Date().toISOString(),
      ctx,
      baseRequest
    );

    assert.strictEqual(response.action, 'broker_email');
    assert.ok(response.subject?.includes('[TRANSIT DELAY UPDATE] Load #LD-8801'));
    assert.ok(response.content.includes('The driver has experienced a delay'));
    assert.ok(response.content.includes('Severe tire blowout on right tandem'));
    assert.ok(response.content.includes('DELAYED'));
  });

  it('3. Delay reason and duration impact are included when available', async () => {
    // Scheduled delivery: 2026-10-29T21:00:00.000Z
    // Revised ETA: 2026-10-30T00:00:00.000Z (3 hours delay)
    const delayCall: AIContextCheckCall = {
      id: 'cc-delay-2',
      loadId: 'load-101',
      loadNumber: 'LD-8801',
      callType: 'delay',
      status: 'delayed',
      location: 'Effingham, IL',
      notes: 'Heavy interstate construction gridlock on I-57 North',
      etaDeliveryRaw: '2026-10-30T00:00:00.000Z',
      etaDeliveryFormatted: 'Oct 29, 2026, 07:00 PM CDT',
      loggedAtFormatted: 'Oct 29, 2026, 11:00 AM CDT',
      eventAtRaw: '2026-10-29T16:00:00.000Z',
      isException: true,
    };

    const ctx: AIContext = {
      ...baseContext,
      recentCheckCalls: [delayCall],
    };

    const response = await generateLocalBrokerEmail(
      'resp-3',
      new Date().toISOString(),
      ctx,
      baseRequest
    );

    assert.ok(response.content.includes('Heavy interstate construction gridlock on I-57 North'));
    assert.ok(response.content.includes('approximately 3 hours'));
    assert.ok(response.content.includes('Oct 29, 2026, 07:00 PM CDT'));
    assert.ok(response.content.includes('Revised Delivery ETA: Oct 29, 2026, 07:00 PM CDT'));
  });

  it('4. NEVER says "on schedule", "tracking smoothly", or "no delays" when delay evidence exists', async () => {
    const delayCall: AIContextCheckCall = {
      id: 'cc-delay-3',
      loadId: 'load-101',
      loadNumber: 'LD-8801',
      callType: 'breakdown',
      status: 'delayed',
      location: 'Mount Vernon, IL',
      notes: 'Alternator failure',
      loggedAtFormatted: 'Oct 29, 2026, 09:00 AM CDT',
      eventAtRaw: '2026-10-29T14:00:00.000Z',
      isException: true,
    };

    const ctx: AIContext = {
      ...baseContext,
      recentCheckCalls: [delayCall],
    };

    const response = await generateLocalBrokerEmail(
      'resp-4',
      new Date().toISOString(),
      ctx,
      baseRequest
    );

    const lower = response.content.toLowerCase();
    assert.strictEqual(lower.includes('on schedule'), false, 'Draft must not claim "on schedule"');
    assert.strictEqual(lower.includes('tracking smoothly'), false, 'Draft must not claim "tracking smoothly"');
    assert.strictEqual(lower.includes('no delays'), false, 'Draft must not claim "no delays"');
  });

  it('5. Multiple check calls: sorts by timestamp and uses the most recent operational event', async () => {
    const earlierCall: AIContextCheckCall = {
      id: 'cc-call-old',
      loadId: 'load-101',
      loadNumber: 'LD-8801',
      callType: 'en_route_delivery',
      status: 'on_time',
      location: 'Texarkana, AR',
      loggedAtFormatted: 'Oct 29, 2026, 06:00 AM CDT',
      eventAtRaw: '2026-10-29T11:00:00.000Z',
      isException: false,
    };

    const laterDelayCall: AIContextCheckCall = {
      id: 'cc-call-new',
      loadId: 'load-101',
      loadNumber: 'LD-8801',
      callType: 'delay',
      status: 'delayed',
      location: 'Sikeston, MO',
      notes: 'DOT mandatory scale inspection line backup',
      loggedAtFormatted: 'Oct 29, 2026, 10:15 AM CDT',
      eventAtRaw: '2026-10-29T15:15:00.000Z',
      isException: true,
    };

    // Even if earlierCall is placed first in the array, sorting ensures laterDelayCall is picked
    const ctx: AIContext = {
      ...baseContext,
      recentCheckCalls: [earlierCall, laterDelayCall],
    };

    const response = await generateLocalBrokerEmail(
      'resp-5',
      new Date().toISOString(),
      ctx,
      baseRequest
    );

    assert.ok(response.subject?.includes('[TRANSIT DELAY UPDATE]'));
    assert.ok(response.content.includes('DOT mandatory scale inspection line backup'));
    assert.ok(response.content.includes('Sikeston, MO'));
    // Does not duplicate or refer to Texarkana
    assert.ok(!response.content.includes('Texarkana, AR'));
  });

  it('6. Missing optional delay fields: does NOT invent reasons, durations, or ETAs', async () => {
    // Delay check call without notes and without ETA
    const bareDelayCall: AIContextCheckCall = {
      id: 'cc-bare-delay',
      loadId: 'load-101',
      loadNumber: 'LD-8801',
      callType: 'delay',
      status: 'delayed',
      location: 'Location Pending',
      loggedAtFormatted: 'Oct 29, 2026, 10:00 AM CDT',
      eventAtRaw: '2026-10-29T15:00:00.000Z',
      isException: true,
    };

    const ctx: AIContext = {
      ...baseContext,
      recentCheckCalls: [bareDelayCall],
    };

    const response = await generateLocalBrokerEmail(
      'resp-6',
      new Date().toISOString(),
      ctx,
      baseRequest
    );

    assert.ok(response.subject?.includes('[TRANSIT DELAY UPDATE]'));
    // Should say transit delay without hallucinating a specific reason or duration
    assert.ok(response.content.includes('The driver has experienced a transit delay. Current delivery impact is being monitored'));
    assert.ok(!response.content.includes('due to undefined'));
    assert.ok(!response.content.includes('due to null'));
    assert.ok(!response.content.includes('[object Object]'));
    assert.ok(!response.content.includes('Revised Delivery ETA:'));
  });

  it('7. Unrelated load check calls are isolated: only target load check calls are considered', async () => {
    const otherLoadDelayCall: AIContextCheckCall = {
      id: 'cc-other-load',
      loadId: 'load-999',
      loadNumber: 'LD-9999',
      callType: 'delay',
      status: 'delayed',
      location: 'Atlanta, GA',
      notes: 'Severe multi-vehicle collision',
      loggedAtFormatted: 'Oct 29, 2026, 10:00 AM CDT',
      eventAtRaw: '2026-10-29T15:00:00.000Z',
      isException: true,
    };

    const targetLoadNormalCall: AIContextCheckCall = {
      id: 'cc-target-normal',
      loadId: 'load-101',
      loadNumber: 'LD-8801',
      callType: 'en_route_delivery',
      status: 'on_time',
      location: 'Marion, IL',
      loggedAtFormatted: 'Oct 29, 2026, 09:00 AM CDT',
      eventAtRaw: '2026-10-29T14:00:00.000Z',
      isException: false,
    };

    const ctx: AIContext = {
      ...baseContext,
      recentCheckCalls: [otherLoadDelayCall, targetLoadNormalCall],
    };

    const response = await generateLocalBrokerEmail(
      'resp-7',
      new Date().toISOString(),
      ctx,
      baseRequest
    );

    // Target load has no delay, so it should be on schedule
    assert.ok(response.subject?.includes('[STATUS UPDATE] Load #LD-8801'));
    assert.ok(response.content.includes('The driver is on schedule and tracking smoothly.'));
    assert.ok(!response.content.includes('Severe multi-vehicle collision'));
  });

});
