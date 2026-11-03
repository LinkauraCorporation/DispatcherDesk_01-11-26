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

if (typeof (globalThis as any).sessionStorage === 'undefined') {
  const sStore = new Map<string, string>();
  (globalThis as any).sessionStorage = {
    getItem: (key: string) => sStore.get(key) || null,
    setItem: (key: string, value: string) => sStore.set(key, value),
    removeItem: (key: string) => sStore.delete(key),
    clear: () => sStore.clear(),
    key: (index: number) => Array.from(sStore.keys())[index] || null,
    get length() { return sStore.size; },
  };
}

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { loadService } from '../modules/loads/loadService.ts';
import { checkCallService } from '../modules/checkcalls/checkCallService.ts';
import { isPickupDepartureCheckCall } from '../modules/checkcalls/checkCallTypes.ts';
import { clientService } from '../modules/clients/clientService.ts';
import { truckService } from '../modules/trucks/truckService.ts';

describe('Pickup Departure → In Transit Automation Tests', () => {

  it('1. Booked + pickup departure (loaded) automatically transitions load to in_transit', async () => {
    const testOrgId = `test-org-pickup-dep-${Date.now()}-1`;
    const client = await clientService.createClient(testOrgId, {
      company_name: 'Apex Carriers',
      client_type: 'fleet',
      status: 'active',
    });

    const bookedLoad = await loadService.createLoad(testOrgId, {
      load_number: 'LD-AUTO-001',
      client_id: client.id,
      pipeline_status: 'booked',
      equipment_type: 'dry_van',
      origin_city: 'Chicago',
      origin_state: 'IL',
      dest_city: 'Atlanta',
      dest_state: 'GA',
      pickup_datetime: new Date(Date.now() + 4 * 3600000).toISOString(),
      delivery_datetime: new Date(Date.now() + 28 * 3600000).toISOString(),
      rate: 2200,
      loaded_miles: 715,
    });

    assert.strictEqual(bookedLoad.pipeline_status, 'booked', 'Load must initially be Booked');

    // Create pickup departure check call ('loaded')
    const checkCall = await checkCallService.createCheckCall(testOrgId, {
      load_id: bookedLoad.id,
      call_type: 'loaded',
      status: 'on_time',
      location_city: 'Chicago',
      location_state: 'IL',
      notes: 'Driver departed shipper facility with sealed trailer',
      created_by: 'Alex Rivera (Dispatcher)',
    });

    assert.ok(checkCall.id, 'Check call must be created with ID');
    assert.strictEqual(checkCall.call_type, 'loaded');

    // Check load status after check call creation
    const reloaded = await loadService.getLoad(testOrgId, bookedLoad.id);
    assert.ok(reloaded, 'Load must exist');
    assert.strictEqual(
      reloaded.pipeline_status,
      'in_transit',
      'Booked load must automatically advance to In Transit upon pickup departure check call'
    );
  });

  it('2. Booked + pickup departure (en_route_delivery) automatically transitions load to in_transit', async () => {
    const testOrgId = `test-org-pickup-dep-${Date.now()}-2`;
    const client = await clientService.createClient(testOrgId, {
      company_name: 'Apex Carriers',
      client_type: 'fleet',
      status: 'active',
    });

    const bookedLoad = await loadService.createLoad(testOrgId, {
      load_number: 'LD-AUTO-002',
      client_id: client.id,
      pipeline_status: 'booked',
      equipment_type: 'dry_van',
      origin_city: 'Dallas',
      origin_state: 'TX',
      dest_city: 'Houston',
      dest_state: 'TX',
      pickup_datetime: new Date(Date.now() + 2 * 3600000).toISOString(),
      delivery_datetime: new Date(Date.now() + 8 * 3600000).toISOString(),
      rate: 950,
      loaded_miles: 240,
    });

    assert.strictEqual(bookedLoad.pipeline_status, 'booked', 'Load must initially be Booked');

    // Create en_route_delivery check call
    const checkCall = await checkCallService.createCheckCall(testOrgId, {
      load_id: bookedLoad.id,
      call_type: 'en_route_delivery',
      status: 'on_time',
      location_city: 'Dallas',
      location_state: 'TX',
      notes: 'Rolling on I-45 South towards Houston consignee',
      created_by: 'Dispatcher',
    });

    assert.ok(checkCall.id);

    const reloaded = await loadService.getLoad(testOrgId, bookedLoad.id);
    assert.ok(reloaded);
    assert.strictEqual(
      reloaded.pipeline_status,
      'in_transit',
      'Booked load must advance to In Transit upon en_route_delivery check call'
    );
  });

  it('3. Check-call creation failure leaves load status unchanged in Booked', async () => {
    const testOrgId = `test-org-pickup-dep-${Date.now()}-3`;
    const client = await clientService.createClient(testOrgId, {
      company_name: 'Apex Carriers',
      client_type: 'fleet',
      status: 'active',
    });

    const bookedLoad = await loadService.createLoad(testOrgId, {
      load_number: 'LD-AUTO-003',
      client_id: client.id,
      pipeline_status: 'booked',
      equipment_type: 'dry_van',
      origin_city: 'Memphis',
      origin_state: 'TN',
      dest_city: 'Nashville',
      dest_state: 'TN',
      pickup_datetime: new Date(Date.now() + 6 * 3600000).toISOString(),
      delivery_datetime: new Date(Date.now() + 12 * 3600000).toISOString(),
      rate: 800,
      loaded_miles: 210,
    });

    assert.strictEqual(bookedLoad.pipeline_status, 'booked');

    // Attempt to create check call with invalid state code (e.g. 3-letter invalid postal code)
    let creationFailed = false;
    try {
      await checkCallService.createCheckCall(testOrgId, {
        load_id: bookedLoad.id,
        call_type: 'loaded',
        status: 'on_time',
        location_city: 'Memphis',
        location_state: 'INVALID_STATE', // Must fail 2-letter postal code check
        notes: 'Departed dock',
      });
    } catch (err: any) {
      creationFailed = true;
      assert.ok(
        err.message.includes('State must be exactly a 2-letter uppercase postal code') ||
        err.message.includes('postal code'),
        `Expected validation error, got: ${err.message}`
      );
    }

    assert.strictEqual(creationFailed, true, 'Check call creation must fail validation');

    // Verify 0 check calls logged and load remains Booked
    const calls = await checkCallService.getCheckCalls(testOrgId, bookedLoad.id);
    assert.strictEqual(calls.length, 0, 'No check call should have been persisted');

    const reloaded = await loadService.getLoad(testOrgId, bookedLoad.id);
    assert.ok(reloaded);
    assert.strictEqual(
      reloaded.pipeline_status,
      'booked',
      'Load status must remain strictly Booked after check call creation failure'
    );
  });

  it('4. Unrelated check calls do not trigger in_transit transition (status unchanged)', async () => {
    const testOrgId = `test-org-pickup-dep-${Date.now()}-4`;
    const client = await clientService.createClient(testOrgId, {
      company_name: 'Apex Carriers',
      client_type: 'fleet',
      status: 'active',
    });

    const bookedLoad = await loadService.createLoad(testOrgId, {
      load_number: 'LD-AUTO-004',
      client_id: client.id,
      pipeline_status: 'booked',
      equipment_type: 'dry_van',
      origin_city: 'Indianapolis',
      origin_state: 'IN',
      dest_city: 'Columbus',
      dest_state: 'OH',
      rate: 1100,
      loaded_miles: 175,
    });

    // Unrelated 1: arrived_pickup
    const call1 = await checkCallService.createCheckCall(testOrgId, {
      load_id: bookedLoad.id,
      call_type: 'arrived_pickup',
      status: 'on_time',
      location_city: 'Indianapolis',
      location_state: 'IN',
      notes: 'Truck arrived at shipper security gate',
    });
    assert.ok(call1.id);
    let reloaded = await loadService.getLoad(testOrgId, bookedLoad.id);
    assert.strictEqual(reloaded?.pipeline_status, 'booked', 'arrived_pickup must NOT advance load to in_transit');

    // Unrelated 2: dispatch
    const call2 = await checkCallService.createCheckCall(testOrgId, {
      load_id: bookedLoad.id,
      call_type: 'dispatch',
      status: 'on_time',
      location_city: 'Indianapolis',
      location_state: 'IN',
      notes: 'Initial dispatch confirmation sent to driver',
    });
    assert.ok(call2.id);
    reloaded = await loadService.getLoad(testOrgId, bookedLoad.id);
    assert.strictEqual(reloaded?.pipeline_status, 'booked', 'dispatch must NOT advance load to in_transit');

    // Unrelated 3: delay exception
    const call3 = await checkCallService.createCheckCall(testOrgId, {
      load_id: bookedLoad.id,
      call_type: 'delay',
      status: 'delayed',
      location_city: 'Indianapolis',
      location_state: 'IN',
      notes: 'Staging dock delay due to late forklift operator arrival',
    });
    assert.ok(call3.id);
    reloaded = await loadService.getLoad(testOrgId, bookedLoad.id);
    assert.strictEqual(reloaded?.pipeline_status, 'booked', 'delay check call must NOT advance load to in_transit');

    // Verify all 3 check calls exist
    const calls = await checkCallService.getCheckCalls(testOrgId, bookedLoad.id);
    assert.strictEqual(calls.length, 3, 'All 3 check calls should be persisted');
  });

  it('5. Already In Transit load does nothing harmful on pickup departure check call', async () => {
    const testOrgId = `test-org-pickup-dep-${Date.now()}-5`;
    const client = await clientService.createClient(testOrgId, {
      company_name: 'Apex Carriers',
      client_type: 'fleet',
      status: 'active',
    });

    const inTransitLoad = await loadService.createLoad(testOrgId, {
      load_number: 'LD-AUTO-005',
      client_id: client.id,
      pipeline_status: 'in_transit',
      equipment_type: 'dry_van',
      origin_city: 'Denver',
      origin_state: 'CO',
      dest_city: 'Salt Lake City',
      dest_state: 'UT',
      rate: 1900,
      loaded_miles: 520,
    });

    assert.strictEqual(inTransitLoad.pipeline_status, 'in_transit');

    // Log pickup departure check call on already in_transit load
    const call = await checkCallService.createCheckCall(testOrgId, {
      load_id: inTransitLoad.id,
      call_type: 'loaded',
      status: 'on_time',
      location_city: 'Denver',
      location_state: 'CO',
      notes: 'Confirmatory loaded status logged',
    });

    assert.ok(call.id);

    const reloaded = await loadService.getLoad(testOrgId, inTransitLoad.id);
    assert.ok(reloaded);
    assert.strictEqual(
      reloaded.pipeline_status,
      'in_transit',
      'Status must remain in_transit without error or duplicate transition'
    );
  });

  it('6. Tenant isolation and authorization regressions are strictly prevented', async () => {
    const orgAlpha = `test-org-alpha-${Date.now()}`;
    const orgBeta = `test-org-beta-${Date.now()}`;

    const clientAlpha = await clientService.createClient(orgAlpha, {
      company_name: 'Alpha Fleet',
      client_type: 'fleet',
      status: 'active',
    });

    const loadAlpha = await loadService.createLoad(orgAlpha, {
      load_number: 'LD-ALPHA-901',
      client_id: clientAlpha.id,
      pipeline_status: 'booked',
      equipment_type: 'dry_van',
      origin_city: 'Phoenix',
      origin_state: 'AZ',
      dest_city: 'Tucson',
      dest_state: 'AZ',
      rate: 600,
      loaded_miles: 115,
    });

    // Attempt cross-tenant check call creation (Org Beta trying to create check call on Org Alpha's load)
    let crossTenantBlocked = false;
    try {
      await checkCallService.createCheckCall(orgBeta, {
        load_id: loadAlpha.id,
        call_type: 'loaded',
        status: 'on_time',
        location_city: 'Phoenix',
        location_state: 'AZ',
        notes: 'Malicious cross-tenant attempt',
      });
    } catch (err: any) {
      crossTenantBlocked = true;
      assert.ok(
        err.message.includes('Referenced load does not exist or does not belong to the active organization'),
        `Expected tenant boundary error, got: ${err.message}`
      );
    }

    assert.strictEqual(crossTenantBlocked, true, 'Cross-tenant check call creation must be rejected');

    // Verify Org Alpha load remains Booked
    const reloadedAlpha = await loadService.getLoad(orgAlpha, loadAlpha.id);
    assert.strictEqual(reloadedAlpha?.pipeline_status, 'booked', 'Org Alpha load must remain in Booked status');

    // Verify 0 check calls in Org Beta and Org Alpha
    const betaCalls = await checkCallService.getCheckCalls(orgBeta, loadAlpha.id);
    assert.strictEqual(betaCalls.length, 0);

    const alphaCalls = await checkCallService.getCheckCalls(orgAlpha, loadAlpha.id);
    assert.strictEqual(alphaCalls.length, 0);
  });

  it('7. Helper isPickupDepartureCheckCall accurately identifies pickup departure types', () => {
    assert.strictEqual(isPickupDepartureCheckCall('loaded'), true);
    assert.strictEqual(isPickupDepartureCheckCall('en_route_delivery'), true);

    assert.strictEqual(isPickupDepartureCheckCall('arrived_pickup'), false);
    assert.strictEqual(isPickupDepartureCheckCall('dispatch'), false);
    assert.strictEqual(isPickupDepartureCheckCall('en_route_pickup'), false);
    assert.strictEqual(isPickupDepartureCheckCall('arrived_delivery'), false);
    assert.strictEqual(isPickupDepartureCheckCall('delivered'), false);
    assert.strictEqual(isPickupDepartureCheckCall('delay'), false);
    assert.strictEqual(isPickupDepartureCheckCall('breakdown'), false);
    assert.strictEqual(isPickupDepartureCheckCall('other'), false);
    assert.strictEqual(isPickupDepartureCheckCall(null), false);
    assert.strictEqual(isPickupDepartureCheckCall(undefined), false);
    assert.strictEqual(isPickupDepartureCheckCall(''), false);
  });
});
