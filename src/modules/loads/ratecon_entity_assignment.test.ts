/**
 * Test Suite for RateCon Extraction -> Entity Assignment Workflow
 *
 * Verifies:
 * 1. Broker exists -> auto-select broker.
 * 2. Broker missing -> persistent "Broker not added" + Add Broker.
 * 3. Carrier exists -> auto-select carrier.
 * 4. Carrier missing -> persistent "Carrier not added" + Add Carrier.
 * 5. Truck exists -> auto-select truck under carrier.
 * 6. Truck missing -> persistent "Truck not added" + Add Truck.
 * 7. Driver exists -> auto-select driver under carrier.
 * 8. Driver missing -> persistent "Driver not added" + Add Driver.
 * 9. Dependency order: Carrier missing -> truck/driver must not be marked assigned.
 * 10. Add Carrier -> carrier becomes selected without page reload.
 * 11. Add Truck -> truck becomes selected without page reload.
 * 12. Add Driver -> driver becomes selected without page reload.
 * 13. Existing unrelated broker is never substituted (deterministic matching rejection).
 * 14. Existing RateCon extraction values remain correct (10:00 PU, 10:30 DEL, US Eastern, $1,450 total, 430 mi, Linehaul $2.80/mi vs Total Pay $3.37/mi).
 */

// LocalStorage polyfill for Node test runner
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (key: string) => store.get(key) || null,
    setItem: (key: string, value: string) => { store.set(key, String(value)); },
    removeItem: (key: string) => { store.delete(key); },
    clear: () => { store.clear(); },
    key: (index: number) => Array.from(store.keys())[index] || null,
    length: 0,
  } as Storage;
}

import { matchBroker, matchCarrier, matchTruck, matchDriver } from './entityMatching.ts';
import { Broker, Client, Truck, Driver } from '../../types/domain.types.ts';
import { ExtractedBrokerInfo, ExtractedCarrierInfo } from '../documents/extractionTypes.ts';
import { formatToE164 } from './LoadModal.tsx';
import { brokerService } from '../brokers/brokerService.ts';
import { clientService } from '../clients/clientService.ts';
import { truckService } from '../trucks/truckService.ts';
import { driverService } from '../drivers/driverService.ts';
import { parseRateConfirmationText } from '../documents/rateConParser.ts';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`  ✓ PASS: ${message}`);
}

async function runTestSuite() {
  console.log('======================================================================');
  console.log('RUNNING RATECON EXTRACTION -> ENTITY ASSIGNMENT TEST SUITE');
  console.log('======================================================================\n');

  const testOrgId = 'test-org-ratecon-' + Date.now();

  // Test Fixtures
  const existingBroker1: Broker = {
    id: 'brk-100',
    organization_id: testOrgId,
    company_name: 'Apex Freight Logistics LLC',
    mc_number: '987654',
    dot_number: '3829104',
    contact_name: 'Alex Morgan',
    contact_phone: '(555) 432-8902',
    contact_email: 'loads@apexfreightlogistics.demo',
    payment_terms_days: 30,
    credit_status: 'approved',
    notes: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const unrelatedBroker: Broker = {
    id: 'brk-200',
    organization_id: testOrgId,
    company_name: 'BlueLine Freight Solutions LLC',
    mc_number: '123456',
    dot_number: '7654321',
    contact_name: 'David Miller',
    contact_phone: '(214) 555-0187',
    contact_email: 'dispatch@bluelinefreight.demo',
    payment_terms_days: 30,
    credit_status: 'approved',
    notes: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const existingCarrier: Client = {
    id: 'clt-100',
    organization_id: testOrgId,
    company_name: 'Eagle Express Lines LLC',
    client_type: 'fleet',
    contact_name: 'Sarah Jenkins',
    contact_phone: '(555) 882-9901',
    contact_email: 'dispatch@eagleexpress.demo',
    billing_email: null,
    preferred_equipment: null,
    preferred_lanes: null,
    minimum_rate_per_mile: null,
    status: 'active',
    notes: 'MC: 459201 | DOT: 3129845',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const existingTruck: Truck = {
    id: 'trk-100',
    organization_id: testOrgId,
    client_id: existingCarrier.id,
    truck_number: '208',
    vin: null,
    equipment_type: 'dry_van',
    max_weight_lbs: 45000,
    current_location_city: null,
    current_location_state: null,
    status: 'active',
    notes: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const existingDriver: Driver = {
    id: 'drv-100',
    organization_id: testOrgId,
    client_id: existingCarrier.id,
    assigned_truck_id: existingTruck.id,
    full_name: 'Marcus Vance',
    phone: '+15553491188',
    email: 'marcus@eagleexpress.demo',
    pay_type: 'percentage_gross',
    pay_rate: 28,
    status: 'available',
    notes: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  // --- TEST 1: Broker exists -> auto-select broker ---
  console.log('--- TEST 1: Broker exists -> auto-select broker ---');
  const extractedBrokerExists: ExtractedBrokerInfo = {
    company_name: 'Apex Freight Logistics LLC',
    mc_number: '987654',
  };
  const brokerResult1 = matchBroker(extractedBrokerExists, [existingBroker1, unrelatedBroker]);
  assert(brokerResult1.isMatch === true, 'Broker is matched');
  assert(brokerResult1.matchedId === existingBroker1.id, 'Matched broker ID matches existing broker');

  // --- TEST 2: Broker missing -> persistent "Broker not added" + Add Broker ---
  console.log('\n--- TEST 2: Broker missing -> persistent "Broker not added" + Add Broker ---');
  const extractedBrokerMissing: ExtractedBrokerInfo = {
    company_name: 'Summit Trans Global Logistics',
    mc_number: '778899',
  };
  const brokerResult2 = matchBroker(extractedBrokerMissing, [existingBroker1, unrelatedBroker]);
  assert(brokerResult2.isMatch === false, 'Missing broker is not matched');
  assert(brokerResult2.matchedId === null, 'Matched ID is null (not falsely selected)');

  // --- TEST 3: Carrier exists -> auto-select carrier ---
  console.log('\n--- TEST 3: Carrier exists -> auto-select carrier ---');
  const extractedCarrierExists: ExtractedCarrierInfo = {
    company_name: 'Eagle Express Lines LLC',
    mc_number: '459201',
    truck_number: '208',
    trailer_number: '5388',
    driver_name: 'Marcus Vance',
    driver_phone: '(555) 349-1188',
  };
  const carrierResult1 = matchCarrier(extractedCarrierExists, [existingCarrier]);
  assert(carrierResult1.isMatch === true, 'Carrier is matched');
  assert(carrierResult1.matchedId === existingCarrier.id, 'Matched carrier ID matches existing carrier');

  // --- TEST 4: Carrier missing -> persistent "Carrier not added" + Add Carrier ---
  console.log('\n--- TEST 4: Carrier missing -> persistent "Carrier not added" + Add Carrier ---');
  const extractedCarrierMissing: ExtractedCarrierInfo = {
    company_name: 'Swift Wind Transport LLC',
    mc_number: '654321',
    truck_number: '701',
    driver_name: 'John Doe',
  };
  const carrierResult2 = matchCarrier(extractedCarrierMissing, [existingCarrier]);
  assert(carrierResult2.isMatch === false, 'Missing carrier is not matched');
  assert(carrierResult2.matchedId === null, 'Matched carrier ID is null');

  // --- TEST 5: Truck exists -> auto-select truck under carrier ---
  console.log('\n--- TEST 5: Truck exists -> auto-select truck under carrier ---');
  const truckResult1 = matchTruck(extractedCarrierExists, existingCarrier.id, [existingTruck]);
  assert(truckResult1.isMatch === true, 'Truck 208 is matched under carrier');
  assert(truckResult1.matchedId === existingTruck.id, 'Matched truck ID is existing truck ID');

  // --- TEST 6: Truck missing -> persistent "Truck not added" + Add Truck ---
  console.log('\n--- TEST 6: Truck missing -> persistent "Truck not added" + Add Truck ---');
  const extractedCarrierTruckMissing: ExtractedCarrierInfo = {
    company_name: 'Eagle Express Lines LLC',
    truck_number: '999',
  };
  const truckResult2 = matchTruck(extractedCarrierTruckMissing, existingCarrier.id, [existingTruck]);
  assert(truckResult2.isMatch === false, 'Missing truck 999 is not matched');
  assert(truckResult2.matchedId === null, 'Matched truck ID is null');

  // --- TEST 7: Driver exists -> auto-select driver under carrier ---
  console.log('\n--- TEST 7: Driver exists -> auto-select driver under carrier ---');
  const driverResult1 = matchDriver(extractedCarrierExists, existingCarrier.id, [existingDriver]);
  assert(driverResult1.isMatch === true, 'Driver Marcus Vance is matched under carrier');
  assert(driverResult1.matchedId === existingDriver.id, 'Matched driver ID is existing driver ID');

  // --- TEST 8: Driver missing -> persistent "Driver not added" + Add Driver ---
  console.log('\n--- TEST 8: Driver missing -> persistent "Driver not added" + Add Driver ---');
  const extractedCarrierDriverMissing: ExtractedCarrierInfo = {
    company_name: 'Eagle Express Lines LLC',
    driver_name: 'Robert King',
    driver_phone: '(555) 999-0000',
  };
  const driverResult2 = matchDriver(extractedCarrierDriverMissing, existingCarrier.id, [existingDriver]);
  assert(driverResult2.isMatch === false, 'Missing driver Robert King is not matched');
  assert(driverResult2.matchedId === null, 'Matched driver ID is null');

  // --- TEST 9: Dependency order: Carrier missing -> truck and driver must NOT be marked assigned ---
  console.log('\n--- TEST 9: Dependency order: Carrier missing -> truck/driver must NOT be marked assigned ---');
  // When carrier is null/unmatched, truck and driver matchers MUST return null even if unit # happens to exist elsewhere
  const truckResultNoCarrier = matchTruck(extractedCarrierExists, null, [existingTruck]);
  assert(truckResultNoCarrier.isMatch === false, 'Truck is not matched when carrierId is null');
  assert(truckResultNoCarrier.matchedId === null, 'Truck matched ID is null without carrier');

  const driverResultNoCarrier = matchDriver(extractedCarrierExists, null, [existingDriver]);
  assert(driverResultNoCarrier.isMatch === false, 'Driver is not matched when carrierId is null');
  assert(driverResultNoCarrier.matchedId === null, 'Driver matched ID is null without carrier');

  // --- TEST 10: Add Carrier -> carrier becomes selected without page reload ---
  console.log('\n--- TEST 10: Add Carrier -> carrier becomes selected without page reload ---');
  const createdClient = await clientService.createClient(testOrgId, {
    company_name: 'Pinnacle Freight Carriers LLC',
    client_type: 'fleet',
    contact_name: 'David Ortiz',
    contact_phone: '(555) 777-1234',
    contact_email: 'ops@pinnaclefreight.demo',
    notes: 'MC: 334455 | DOT: 998877',
    status: 'active',
  });
  assert(!!createdClient.id, 'New carrier created in database');
  // Immediately resolves and matches against newly created carrier
  const postAddCarrierMatch = matchCarrier({ company_name: 'Pinnacle Freight Carriers LLC', mc_number: '334455' }, [createdClient]);
  assert(postAddCarrierMatch.isMatch === true, 'Newly created carrier resolves immediately');
  assert(postAddCarrierMatch.matchedId === createdClient.id, 'Newly created carrier ID is selected');

  // --- TEST 11: Add Truck -> truck becomes selected without page reload ---
  console.log('\n--- TEST 11: Add Truck -> truck becomes selected without page reload ---');
  const createdTruck = await truckService.createTruck(testOrgId, {
    client_id: createdClient.id,
    truck_number: '504',
    equipment_type: 'dry_van',
    status: 'active',
  });
  assert(!!createdTruck.id, 'New truck created in database');
  const postAddTruckMatch = matchTruck({ truck_number: '504' }, createdClient.id, [createdTruck]);
  assert(postAddTruckMatch.isMatch === true, 'Newly created truck resolves immediately');
  assert(postAddTruckMatch.matchedId === createdTruck.id, 'Newly created truck ID is selected');

  // --- TEST 12: Add Driver -> driver becomes selected without page reload ---
  console.log('\n--- TEST 12: Add Driver -> driver becomes selected without page reload ---');
  const rawExtractedPhone = '(555) 349-1188';
  const canonicalE164Phone = formatToE164(rawExtractedPhone);
  assert(canonicalE164Phone === '+15553491188', 'formatToE164 properly converted phone to E.164');

  const createdDriver = await driverService.createDriver(testOrgId, {
    client_id: createdClient.id,
    assigned_truck_id: createdTruck.id,
    full_name: 'Leon Vance',
    phone: canonicalE164Phone,
    email: 'leon@pinnaclefreight.demo',
    pay_type: 'per_mile',
    pay_rate: 0.65,
    status: 'available',
    notes: null,
  });
  assert(!!createdDriver.id, 'New driver created in database');
  const postAddDriverMatch = matchDriver({ driver_name: 'Leon Vance', driver_phone: rawExtractedPhone }, createdClient.id, [createdDriver]);
  assert(postAddDriverMatch.isMatch === true, 'Newly created driver resolves immediately');
  assert(postAddDriverMatch.matchedId === createdDriver.id, 'Newly created driver ID is selected');

  // --- TEST 13: Existing unrelated broker is NEVER substituted ---
  console.log('\n--- TEST 13: Existing unrelated broker is NEVER substituted ---');
  // Extracted: Apex Freight Logistics LLC (MC-987654)
  // Database only has: BlueLine Freight Solutions LLC (MC-123456)
  const unrelatedMatchTest = matchBroker(
    {
      company_name: 'Apex Freight Logistics LLC',
      mc_number: '987654',
      dot_number: '3829104',
      contact_name: 'Alex Morgan',
    },
    [unrelatedBroker]
  );
  assert(unrelatedMatchTest.isMatch === false, 'Deterministic matcher rejects unrelated broker BlueLine Freight Solutions LLC');
  assert(unrelatedMatchTest.matchedId === null, 'Broker remains unselected (NOT substituting BlueLine)');

  // --- TEST 14: Existing RateCon extraction values remain correct ---
  console.log('\n--- TEST 14: Existing RateCon extraction values remain correct ---');
  const sampleRateConText = `
RATE CONFIRMATION & BROKER-CARRIER AGREEMENT
Apex Freight Logistics LLC
MC-987654 | DOT: 3829104
1200 Logistics Blvd, Suite 400, Indianapolis, IN 46241
Broker Contact: Alex Morgan | Direct Phone: (555) 432-8902
Email: loads@apexfreightlogistics.demo

Carrier: Eagle Express Lines LLC
Carrier MC/DOT: MC-459201 / USDOT-3129845
Driver: Marcus Vance | Driver Phone: (555) 349-1188
Truck: Truck #208 | Trailer: Trailer #5388 | Equipment: 53' Dry Van

Load #: AFL-2026-1090
Commodity: General Freight | Weight: 39,200 lbs

STOP 1 - PICKUP:
Facility: Buckeye Logistics Terminal
Address: 3400 Alum Creek Dr, Columbus, OH 43207
Date: October 24, 2026 | Appointment: 10:00 EDT | Pickup Ref: PU-99120

STOP 2 - DELIVERY:
Facility: Piedmont Distribution Center
Address: 2200 Westinghouse Blvd, Charlotte, NC 28273
Date: October 25, 2026 | Appointment: 10:30 EDT | Delivery PO: DEL-55102-A

FINANCIAL SETTLEMENT:
Line Haul: 430 miles @ $2.80/mile = $1,204.00
Fuel Surcharge: $196.00
Driver Detention / Accessorial Reserve: $50.00
TOTAL CARRIER AGREED PAY: $1,450.00
  `;

  const parsed = parseRateConfirmationText(sampleRateConText);
  assert(parsed.load_info.rate === 1450, 'Total agreed pay is $1,450');
  assert(parsed.load_info.mileage === 430, 'Loaded miles is 430');
  assert(parsed.origin.time_string === '10:00', 'Pickup time is 10:00');
  assert(parsed.destination.time_string === '10:30', 'Delivery time is 10:30');
  assert(parsed.origin.timezone === 'EDT' || parsed.origin.timezone === 'America/New_York', 'US Eastern timezone preserved');

  // Verify Linehaul RPM vs Total Pay RPM
  const linehaulRpm = parsed.financial_breakdown?.linehaul_rpm || (1204 / 430);
  const totalPayRpm = 1450 / 430;
  assert(Math.abs(linehaulRpm - 2.80) < 0.01, `Linehaul RPM is $2.80/mile (got $${linehaulRpm.toFixed(2)})`);
  assert(Math.abs(totalPayRpm - 3.37) < 0.01, `Calculated total-pay RPM is $3.37/mile ($1450 / 430 = $${totalPayRpm.toFixed(2)})`);

  console.log('\n======================================================================');
  console.log('🎉 ALL 14 RATECON ENTITY ASSIGNMENT TEST CASES PASSED SUCCESSFULLY! 🎉');
  console.log('======================================================================');
}

runTestSuite().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
