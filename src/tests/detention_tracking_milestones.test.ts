/**
 * DispatcherDesk - Phase 1 Detention Tracking & Stop Milestones Verification Tests
 *
 * Verifies:
 * 1. Stop Milestone Timestamps on Loads (pickup/delivery arrival, start, complete, departure)
 * 2. Dedicated Check Call 'event_at' field occurrence timestamps & ordering
 * 3. PostgreSQL-backed Load Detention Records CRUD & billable calculation (15-min increments, free time)
 * 4. Separate Pickup vs Delivery detention record tracking
 * 5. Milestone synchronization between detention records/claims and load stops
 * 6. Backward compatibility with existing accessorial services and seed loads
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

import { loadService } from '../modules/loads/loadService.ts';
import { clientService } from '../modules/clients/clientService.ts';
import { checkCallService } from '../modules/checkcalls/checkCallService.ts';
import { accessorialService, calculateDetention } from '../modules/accessorials/accessorialService.ts';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`  ✓ PASS: ${message}`);
}

async function runTests() {
  console.log('================================================================');
  console.log('RUNNING PHASE 1 DETENTION TRACKING & MILESTONE VERIFICATION TESTS');
  console.log('================================================================\n');

  const testOrgId = 'test-org-detention-' + Date.now();

  const testClient = await clientService.createClient(testOrgId, {
    company_name: 'Apex Transport Inc',
    contact_name: 'Marcus Vance',
    client_type: 'fleet',
  });

  // -------------------------------------------------------------
  // Test Suite 1: Stop Milestone Timestamps on Loads
  // -------------------------------------------------------------
  console.log('--- Test Suite 1: Stop Milestone Timestamps on Loads ---');

  const pickupScheduled = '2026-11-01T08:00:00Z';
  const deliveryScheduled = '2026-11-02T14:00:00Z';

  const pickupArrival = '2026-11-01T07:45:00Z';
  const pickupLoadingStart = '2026-11-01T08:15:00Z';
  const pickupLoadingComplete = '2026-11-01T11:30:00Z';
  const pickupDeparture = '2026-11-01T11:45:00Z';

  const deliveryArrival = '2026-11-02T13:30:00Z';
  const deliveryUnloadingStart = '2026-11-02T14:15:00Z';
  const deliveryUnloadingComplete = '2026-11-02T17:45:00Z';
  const deliveryDeparture = '2026-11-02T18:00:00Z';

  const createdLoad = await loadService.createLoad(testOrgId, {
    load_number: 'LD-DET-001',
    client_id: testClient.id,
    rate: 2850,
    loaded_miles: 715,
    origin_city: 'Chicago',
    origin_state: 'IL',
    pickup_datetime: pickupScheduled,
    dest_city: 'Atlanta',
    dest_state: 'GA',
    delivery_datetime: deliveryScheduled,
    pipeline_status: 'in_transit',
    equipment_type: 'reefer',
    // Phase 1 milestone fields
    pickup_arrival_time: pickupArrival,
    pickup_loading_start_time: pickupLoadingStart,
    pickup_loading_complete_time: pickupLoadingComplete,
    pickup_departure_time: pickupDeparture,
    delivery_arrival_time: deliveryArrival,
    delivery_unloading_start_time: deliveryUnloadingStart,
    delivery_unloading_complete_time: deliveryUnloadingComplete,
    delivery_departure_time: deliveryDeparture,
  });

  assert(!!createdLoad.id, 'Load created successfully with ID');
  assert(createdLoad.pickup_datetime === pickupScheduled, 'Appointment pickup_datetime preserved intact');
  assert(createdLoad.delivery_datetime === deliveryScheduled, 'Appointment delivery_datetime preserved intact');
  assert(createdLoad.pickup_arrival_time === pickupArrival, 'Pickup arrival timestamp preserved');
  assert(createdLoad.pickup_loading_start_time === pickupLoadingStart, 'Pickup loading start timestamp preserved');
  assert(createdLoad.pickup_loading_complete_time === pickupLoadingComplete, 'Pickup loading complete timestamp preserved');
  assert(createdLoad.pickup_departure_time === pickupDeparture, 'Pickup departure timestamp preserved');
  assert(createdLoad.delivery_arrival_time === deliveryArrival, 'Delivery arrival timestamp preserved');
  assert(createdLoad.delivery_unloading_start_time === deliveryUnloadingStart, 'Delivery unloading start timestamp preserved');
  assert(createdLoad.delivery_unloading_complete_time === deliveryUnloadingComplete, 'Delivery unloading complete timestamp preserved');
  assert(createdLoad.delivery_departure_time === deliveryDeparture, 'Delivery departure timestamp preserved');

  // Test updating milestone timestamps
  const updatedDeliveryDeparture = '2026-11-02T18:15:00Z';
  const updatedLoad = await loadService.updateLoad(testOrgId, createdLoad.id, {
    delivery_departure_time: updatedDeliveryDeparture,
  });

  assert(updatedLoad.delivery_departure_time === updatedDeliveryDeparture, 'Updated delivery departure timestamp reflected');
  assert(updatedLoad.delivery_arrival_time === deliveryArrival, 'Unmodified milestone timestamps retained');

  // -------------------------------------------------------------
  // Test Suite 2: Dedicated Check Call event_at Timestamps
  // -------------------------------------------------------------
  console.log('\n--- Test Suite 2: Dedicated Check Call event_at Timestamps ---');

  const historicalEventTime1 = new Date('2026-11-01T07:45:00Z').toISOString();
  const historicalEventTime2 = new Date('2026-11-01T11:30:00Z').toISOString();

  const checkCall1 = await checkCallService.createCheckCall(testOrgId, {
    load_id: createdLoad.id,
    call_type: 'arrived_pickup',
    status: 'on_time',
    location_city: 'Chicago',
    location_state: 'IL',
    notes: 'Arrived at gate 4, staging for dock assignment',
    event_at: historicalEventTime1,
  });

  assert(!!checkCall1.id, 'Check call 1 created with ID');
  assert(new Date(checkCall1.event_at).getTime() === new Date(historicalEventTime1).getTime(), 'Check call 1 event_at preserved correctly');
  assert(!!checkCall1.created_at, 'Check call 1 created_at timestamp generated');

  const checkCall2 = await checkCallService.createCheckCall(testOrgId, {
    load_id: createdLoad.id,
    call_type: 'loaded',
    status: 'on_time',
    location_city: 'Chicago',
    location_state: 'IL',
    notes: 'BOL signed, seals verified 449210',
    event_at: historicalEventTime2,
  });

  assert(new Date(checkCall2.event_at).getTime() === new Date(historicalEventTime2).getTime(), 'Check call 2 event_at preserved correctly');

  // Fetch check calls for load and verify sorted newest event_at first
  const loadCheckCalls = await checkCallService.getCheckCalls(testOrgId, createdLoad.id);
  assert(loadCheckCalls.length === 2, 'Fetched 2 check calls for load');
  assert(loadCheckCalls[0].id === checkCall2.id, 'Check calls correctly sorted by event_at DESC (call 2 first)');
  assert(loadCheckCalls[1].id === checkCall1.id, 'Check call 1 is second');

  // -------------------------------------------------------------
  // Test Suite 3: Dedicated load_detention_records CRUD & Calculations
  // -------------------------------------------------------------
  console.log('\n--- Test Suite 3: Dedicated load_detention_records CRUD & Calculations ---');

  // Calculation unit tests
  const calcTest1 = calculateDetention({
    arrivalTime: '2026-11-01T08:00:00Z',
    departureTime: '2026-11-01T11:45:00Z', // 3 hours 45 min on site (225 min)
    freeTimeHours: 2.0, // 120 min free
    hourlyRate: 75.0,
  });

  // Total time: 3.75 hrs. Free time: 2.0 hrs. Excess: 1.75 hrs (105 min).
  // 105 min / 15 min = exactly 7 intervals = 1.75 hrs billable.
  // 1.75 * 75 = $131.25
  assert(calcTest1.totalDurationHours === 3.75, 'Total duration calculated as 3.75 hours (3h 45m)');
  assert(calcTest1.billableHours === 1.75, 'Billable hours is 1.75');
  assert(calcTest1.totalAmount === 131.25, `Total billable amount is $131.25 (got ${calcTest1.totalAmount})`);
  assert(calcTest1.isWithinFreeTime === false, 'Detention is eligible (not within free time)');

  // Calculation unit test with 15-minute rounding up
  const calcTest2 = calculateDetention({
    arrivalTime: '2026-11-01T08:00:00Z',
    departureTime: '2026-11-01T10:10:00Z', // 2 hours 10 min (130 min)
    freeTimeHours: 2.0, // 120 min free
    hourlyRate: 80.0,
  });

  // Excess: 10 minutes. Rounded up to nearest 15-minute increment = 15 minutes = 0.25 billable hours.
  // 0.25 * 80 = $20.00
  assert(calcTest2.billableHours === 0.25, '10 minutes of detention correctly rounded up to 0.25 billable hours');
  assert(calcTest2.totalAmount === 20.0, 'Total billable amount is $20.00');

  // Create Pickup Detention Record in service
  const pickupDetention = await accessorialService.createDetentionRecord(testOrgId, {
    load_id: createdLoad.id,
    facility_type: 'pickup',
    facility_name: 'Chicago Cold Hub Dock #4',
    facility_address: '1200 Logistics Pkwy, Chicago, IL',
    appointment_time: pickupScheduled,
    arrival_time: pickupArrival,
    loading_start_time: pickupLoadingStart,
    loading_complete_time: pickupLoadingComplete,
    departure_time: pickupDeparture,
    free_time_hours: 2.0,
    hourly_rate: 75.0,
    notes: 'Driver staged 07:45, dock doors frozen until 08:15',
  });

  assert(!!pickupDetention.id, 'Pickup detention record created with ID');
  assert(pickupDetention.facility_type === 'pickup', 'Facility type is pickup');
  assert(pickupDetention.billable_hours === 2.0, 'Billable hours is 2.0');
  assert(pickupDetention.detention_amount === 150.0, 'Total billable amount is $150.00 (2.0h * $75)');
  assert(new Date(pickupDetention.detention_start_time || '').getTime() === new Date('2026-11-01T09:45:00.000Z').getTime(), 'Detention start time calculated exactly 2h after arrival');
  assert(pickupDetention.departure_time === pickupDeparture, 'Departure timestamp saved');

  // Create Delivery Detention Record (Driver still at dock)
  const deliveryDetention = await accessorialService.createDetentionRecord(testOrgId, {
    load_id: createdLoad.id,
    facility_type: 'delivery',
    facility_name: 'Atlanta Distribution Center Receiver',
    facility_address: '450 Industrial Blvd, Atlanta, GA',
    appointment_time: deliveryScheduled,
    arrival_time: deliveryArrival,
    unloading_start_time: deliveryUnloadingStart,
    departure_time: null, // Driver still at dock!
    free_time_hours: 2.0,
    hourly_rate: 80.0,
    notes: 'Driver waiting at bay 12, receiver short-staffed',
  });

  assert(!!deliveryDetention.id, 'Delivery detention record created with ID');
  assert(deliveryDetention.facility_type === 'delivery', 'Facility type is delivery');
  assert(deliveryDetention.departure_time === null, 'Driver still at dock: departure_time is null');

  // Verify querying detention records for the load
  const loadDetentions = await accessorialService.getDetentionRecords(testOrgId, createdLoad.id);
  assert(loadDetentions.length === 2, 'Fetched 2 separate detention records for load');
  const types = loadDetentions.map(d => d.facility_type);
  assert(types.includes('pickup') && types.includes('delivery'), 'Separate pickup and delivery detention records preserved');

  // Update delivery detention when driver departs
  const updatedDeliveryDetention = await accessorialService.updateDetentionRecord(
    testOrgId,
    deliveryDetention.id,
    {
      departure_time: deliveryDeparture,
      unloading_complete_time: deliveryUnloadingComplete,
      status: 'submitted_to_broker',
    }
  );

  assert(updatedDeliveryDetention.departure_time === deliveryDeparture, 'Departure timestamp updated');
  assert(updatedDeliveryDetention.status === 'submitted_to_broker', 'Status updated to submitted_to_broker');
  assert(updatedDeliveryDetention.unloading_complete_time === deliveryUnloadingComplete, 'Unloading complete time saved');

  // -------------------------------------------------------------
  // Test Suite 4: Accessorial & Load Milestone Synchronization
  // -------------------------------------------------------------
  console.log('\n--- Test Suite 4: Accessorial & Load Milestone Synchronization ---');

  const syncload = await loadService.createLoad(testOrgId, {
    load_number: 'LD-DET-SYNC',
    client_id: testClient.id,
    rate: 2200,
    loaded_miles: 240,
    origin_city: 'Dallas',
    origin_state: 'TX',
    pickup_datetime: '2026-11-05T09:00:00Z',
    dest_city: 'Houston',
    dest_state: 'TX',
    delivery_datetime: '2026-11-05T17:00:00Z',
    pipeline_status: 'booked',
    equipment_type: 'dry_van',
  });

  assert(!syncload.pickup_arrival_time, 'New load initially has no pickup arrival timestamp');

  // Create an accessorial claim for pickup detention
  const newPickupArr = '2026-11-05T08:30:00Z';
  const newPickupLoadStart = '2026-11-05T09:15:00Z';
  const newPickupLoadComplete = '2026-11-05T12:00:00Z';
  const newPickupDep = '2026-11-05T12:15:00Z';

  const claim = await accessorialService.createAccessorial(testOrgId, {
    load_id: syncload.id,
    type: 'detention',
    status: 'draft',
    amount: 150.0,
    description: 'Pickup detention in Dallas',
    detention_details: {
      facility_type: 'pickup',
      facility_name: 'Dallas Distribution Hub',
      arrival_time: newPickupArr,
      loading_start_time: newPickupLoadStart,
      loading_complete_time: newPickupLoadComplete,
      departure_time: newPickupDep,
      free_time_hours: 2.0,
      hourly_rate: 75.0,
      billable_hours: 1.75,
    },
  });

  assert(!!claim.id, 'Accessorial claim created with ID');
  assert(claim.detention_details?.loading_start_time === newPickupLoadStart, 'Claim preserves loading_start_time');
  assert(claim.detention_details?.loading_complete_time === newPickupLoadComplete, 'Claim preserves loading_complete_time');

  // Check that milestone timestamps were synchronized to the load
  const refreshedSyncLoad = await loadService.getLoadById(testOrgId, syncload.id);
  assert(!!refreshedSyncLoad, 'Refreshed load found');
  assert(refreshedSyncLoad?.pickup_arrival_time === newPickupArr, 'Load pickup_arrival_time synchronized from claim');
  assert(refreshedSyncLoad?.pickup_loading_start_time === newPickupLoadStart, 'Load pickup_loading_start_time synchronized from claim');
  assert(refreshedSyncLoad?.pickup_loading_complete_time === newPickupLoadComplete, 'Load pickup_loading_complete_time synchronized from claim');
  assert(refreshedSyncLoad?.pickup_departure_time === newPickupDep, 'Load pickup_departure_time synchronized from claim');

  // Verify SEED_LOADS backward compatibility
  const demoSeedLoads = await loadService.getLoads('demo-org-1');
  assert(demoSeedLoads.length > 0, 'Seed loads are successfully retrieved for demo organization');
  const demoLoad2 = demoSeedLoads.find(l => l.load_number === 'LD-2024-8842');
  assert(!!demoLoad2, 'Demo load LD-2024-8842 exists');
  assert(!!demoLoad2?.pickup_arrival_time, 'Demo load LD-2024-8842 has valid pickup_arrival_time milestone');

  console.log('\n================================================================');
  console.log('✅ ALL DETENTION TRACKING & MILESTONE VERIFICATION TESTS PASSED');
  console.log('================================================================\n');
}

runTests().catch((err) => {
  console.error('\n❌ TEST RUN FAILED:\n', err);
  process.exit(1);
});
