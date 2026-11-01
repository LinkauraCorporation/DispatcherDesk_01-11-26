// In-memory localStorage polyfill for Node.js test environment
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

import { loadService } from '../modules/loads/loadService.ts';
import { checkCallService } from '../modules/checkcalls/checkCallService.ts';
import { truckService } from '../modules/trucks/truckService.ts';
import { clientService } from '../modules/clients/clientService.ts';

async function runTestSuite() {
  console.log('=== Running Focused Test Suite: One IN TRANSIT Load Per Truck Rule ===\n');

  const testOrgId = `test-org-${Date.now()}`;

  // 1. Setup Client and Trucks
  const client = await clientService.createClient(testOrgId, {
    company_name: 'FastFreight Logistics',
    client_type: 'fleet',
    status: 'active',
  });

  const truck1 = await truckService.createTruck(testOrgId, {
    truck_number: 'TRK-101',
    equipment_type: 'dry_van',
    client_id: client.id,
    status: 'active',
  });

  const truck2 = await truckService.createTruck(testOrgId, {
    truck_number: 'TRK-202',
    equipment_type: 'dry_van',
    client_id: client.id,
    status: 'active',
  });

  console.log(`[Setup] Created Client "${client.company_name}" and Trucks "${truck1.truck_number}", "${truck2.truck_number}" in org "${testOrgId}".\n`);

  // Create Load A on Truck 1: in_transit
  const now = new Date();
  const pastPickup = new Date(now.getTime() - 4 * 3600 * 1000).toISOString();
  const nearDelivery = new Date(now.getTime() + 10 * 3600 * 1000).toISOString();

  const loadA = await loadService.createLoad(testOrgId, {
    load_number: 'LD-TST-A01',
    client_id: client.id,
    truck_id: truck1.id,
    pipeline_status: 'in_transit',
    equipment_type: 'dry_van',
    origin_city: 'Chicago',
    origin_state: 'IL',
    dest_city: 'Dallas',
    dest_state: 'TX',
    pickup_datetime: pastPickup,
    delivery_datetime: nearDelivery,
    rate: 2400,
    loaded_miles: 920,
  });

  console.log(`[Setup] Load A created: #${loadA.load_number}, Status: ${loadA.pipeline_status}, Truck: ${truck1.truck_number}`);

  // Create Load B on Truck 1: booked (future date, no temporal overlap)
  const futurePickup = new Date(now.getTime() + 48 * 3600 * 1000).toISOString();
  const futureDelivery = new Date(now.getTime() + 72 * 3600 * 1000).toISOString();

  const loadB = await loadService.createLoad(testOrgId, {
    load_number: 'LD-TST-B02',
    client_id: client.id,
    truck_id: truck1.id,
    pipeline_status: 'booked',
    equipment_type: 'dry_van',
    origin_city: 'Dallas',
    origin_state: 'TX',
    dest_city: 'Atlanta',
    dest_state: 'GA',
    pickup_datetime: futurePickup,
    delivery_datetime: futureDelivery,
    rate: 3100,
    loaded_miles: 780,
  });

  console.log(`[Setup] Load B created: #${loadB.load_number}, Status: ${loadB.pipeline_status}, Truck: ${truck1.truck_number} (Scheduled 48h in future)`);

  // Create Load C on Truck 2: booked
  const loadC = await loadService.createLoad(testOrgId, {
    load_number: 'LD-TST-C03',
    client_id: client.id,
    truck_id: truck2.id,
    pipeline_status: 'booked',
    equipment_type: 'dry_van',
    origin_city: 'Nashville',
    origin_state: 'TN',
    dest_city: 'Columbus',
    dest_state: 'OH',
    pickup_datetime: futurePickup,
    delivery_datetime: futureDelivery,
    rate: 1800,
    loaded_miles: 380,
  });

  console.log(`[Setup] Load C created: #${loadC.load_number}, Status: ${loadC.pipeline_status}, Truck: ${truck2.truck_number}\n`);

  // =========================================================================
  // Scenario 1: Same Truck, Load A is in_transit, Load B is booked (future date)
  // Attempt: Load B: booked -> in_transit
  // Expected: MUST FAIL with clear error message
  // =========================================================================
  console.log('--- Test Scenario 1: Transition Load B -> in_transit (Same Truck T1 as active Load A) ---');
  let scenario1Blocked = false;
  let scenario1Message = '';
  try {
    await loadService.updateLoadStatus(testOrgId, loadB.id, 'in_transit');
  } catch (err: any) {
    scenario1Blocked = true;
    scenario1Message = err?.message || '';
  }

  if (scenario1Blocked && scenario1Message.includes('already has Load') && scenario1Message.includes('IN TRANSIT')) {
    console.log(`PASS Scenario 1: Blocked correctly! Error: "${scenario1Message}"\n`);
  } else {
    throw new Error(`FAIL Scenario 1: Expected Load B to be blocked from becoming in_transit, but got blocked=${scenario1Blocked}, message="${scenario1Message}"`);
  }

  // =========================================================================
  // Scenario 3: Different Trucks
  // Load A is in_transit on Truck T1. Load C is booked on Truck T2.
  // Attempt: Load C: booked -> in_transit
  // Expected: MUST SUCCEED
  // =========================================================================
  console.log('--- Test Scenario 3: Transition Load C -> in_transit (Different Truck T2) ---');
  const updatedLoadC = await loadService.updateLoadStatus(testOrgId, loadC.id, 'in_transit');
  if (updatedLoadC.pipeline_status === 'in_transit') {
    console.log(`PASS Scenario 3: Load C on Truck ${truck2.truck_number} successfully transitioned to in_transit while Truck ${truck1.truck_number} has Load A in_transit.\n`);
  } else {
    throw new Error(`FAIL Scenario 3: Expected Load C to be in_transit, but status is ${updatedLoadC.pipeline_status}`);
  }

  // =========================================================================
  // Scenario 4: Check Call auto-advance protection
  // Load A is in_transit on Truck T1. Load B is booked on Truck T1.
  // Action: Log check call with call_type = 'en_route_delivery' on Load B.
  // Expected:
  // - Check call is blocked by operational movement rule
  // - Operational rule throws descriptive error
  // - Load B remains in 'booked' status (0 check calls logged)
  // =========================================================================
  console.log('--- Test Scenario 4: Check Call en_route_delivery on Load B while Load A is in_transit ---');
  let checkCallWarning = '';
  try {
    await checkCallService.createCheckCall(testOrgId, {
      load_id: loadB.id,
      call_type: 'en_route_delivery',
      status: 'on_time',
      location_city: 'Dallas',
      location_state: 'TX',
      notes: 'Driver departed terminal',
      created_by: 'Dispatcher Test',
    });
  } catch (err: any) {
    checkCallWarning = err?.message || '';
  }

  const checkCallsForB = await checkCallService.getCheckCalls(testOrgId, loadB.id);
  const reloadedB = await loadService.getLoad(testOrgId, loadB.id);

  if (checkCallsForB.length === 0 && reloadedB?.pipeline_status === 'booked' && checkCallWarning.includes('IN TRANSIT')) {
    console.log(`PASS Scenario 4: Check call blocked correctly (${checkCallsForB.length} records), Load B remained in status "${reloadedB.pipeline_status}", and surfaced warning: "${checkCallWarning}"\n`);
  } else {
    throw new Error(`FAIL Scenario 4: Check call protection failed! checkCalls=${checkCallsForB.length}, status=${reloadedB?.pipeline_status}, warning="${checkCallWarning}"`);
  }

  // =========================================================================
  // Scenario 2: Load A delivered -> then Load B to in_transit
  // Action:
  // 1. Deliver Load A (Load A: in_transit -> delivered)
  // 2. Transition Load B: booked -> in_transit
  // Expected: MUST SUCCEED
  // =========================================================================
  console.log('--- Test Scenario 2: Deliver Load A, then transition Load B -> in_transit ---');
  const deliveredLoadA = await loadService.updateLoadStatus(testOrgId, loadA.id, 'delivered');
  console.log(`[Step] Load A status updated to: ${deliveredLoadA.pipeline_status}`);

  const updatedLoadB = await loadService.updateLoadStatus(testOrgId, loadB.id, 'in_transit');
  if (updatedLoadB.pipeline_status === 'in_transit') {
    console.log(`PASS Scenario 2: Load B successfully moved to in_transit once Load A reached ${deliveredLoadA.pipeline_status}!\n`);
  } else {
    throw new Error(`FAIL Scenario 2: Expected Load B to be in_transit after Load A was delivered, but status is ${updatedLoadB.pipeline_status}`);
  }

  console.log('=== ALL SCENARIOS PASSED SUCCESSFULLY! ===');
}

runTestSuite().catch((err) => {
  console.error('\nTEST SUITE FAILED:', err);
  process.exit(1);
});
