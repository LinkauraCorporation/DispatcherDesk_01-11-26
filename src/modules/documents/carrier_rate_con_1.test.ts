import { jsPDF } from 'jspdf';
import { PDFParse } from 'pdf-parse';
import { parseRateConfirmationText, formatToDateInput, formatToTimeInput } from './rateConParser.ts';

/**
 * Regression Test Fixture for Carrier Rate Con 1.pdf
 * Based on ground-truth document structure provided in user specification.
 */
async function runRegressionTest() {
  console.log('--- Starting Rate Confirmation Regression Test (Carrier Rate Con 1.pdf) ---');

  // 1. Build ground-truth PDF replicating Carrier Rate Con 1.pdf
  const doc = new jsPDF();
  
  doc.setFontSize(16);
  doc.text('RATE CONFIRMATION & BROKER-CARRIER AGREEMENT', 14, 15);

  doc.setFontSize(11);
  doc.text('Apex Freight Logistics LLC', 14, 25);
  doc.text('MC-987654 | DOT: 3456789', 14, 32);
  doc.text('1200 Logistics Blvd, Suite 400, Indianapolis, IN 46241', 14, 39);
  doc.text('Broker Contact: Alex Morgan | Phone: (555) 432-8900', 14, 46);
  doc.text('Email: dispatch@apexfreightlogistics.demo', 14, 53);

  doc.text('Carrier: Eagle Express Lines LLC', 14, 63);
  doc.text('Carrier MC/DOT: MC-459201 / USDOT-3129845', 14, 70);
  doc.text('Carrier Phone: (555) 432-8902', 14, 77);
  doc.text('Driver: Marcus Vance | Driver Phone: (555) 349-1188', 14, 84);
  doc.text('Truck: Truck #208 | Trailer: Trailer #5388 | Equipment: 53\' Dry Van', 14, 91);

  doc.text('Load #: AFL-2026-1090', 14, 101);
  doc.text('Commodity: Commercial Hardware | Weight: 39,200 lbs', 14, 108);

  doc.text('STOP 1 - PICKUP:', 14, 118);
  doc.text('Facility: Buckeye Logistics Terminal', 14, 125);
  doc.text('Address: 3400 Alum Creek Dr, Columbus, OH 43207', 14, 132);
  doc.text('Appointment: October 24, 2026 @ 10:00 EDT | Pickup Ref: PU-99120', 14, 139);
  doc.text('Instructions: PPE required. Check in with dispatch 30 mins prior.', 14, 146);

  doc.text('STOP 2 - DELIVERY:', 14, 156);
  doc.text('Facility: Piedmont Distribution Center', 14, 163);
  doc.text('Address: 2200 Westinghouse Blvd, Charlotte, NC 28273', 14, 170);
  doc.text('Appointment: October 25, 2026 @ 10:30 EDT | Delivery PO: DEL-55102-A', 14, 177);
  doc.text('Instructions: Call receiving 1 hr before arrival. Proof of seal intact.', 14, 184);

  doc.text('FINANCIAL SETTLEMENT:', 14, 194);
  doc.text('Line Haul: 430 miles @ $2.80/mile = $1,204.00', 14, 201);
  doc.text('Fuel Surcharge: $196.00', 14, 208);
  doc.text('Driver Detention / Accessorial Reserve: $50.00', 14, 215);
  doc.text('TOTAL CARRIER AGREED PAY: $1,450.00', 14, 222);

  doc.text('TERMS & CONDITIONS:', 14, 232);
  doc.text('MacroPoint tracking must be active at least 2 hours before pickup until empty.', 14, 239);
  doc.text('Check calls required at loaded/unloaded status.', 14, 246);
  doc.text('Detention: $50/hour after 2 hours free time.', 14, 253);
  doc.text('Paperwork: Signed POD and BOL to ap@apexfreightlogistics.demo within 24 hours.', 14, 260);
  doc.text('Payment: Net 30 | QuickPay: 2%', 14, 267);

  const arrayBuffer = doc.output('arraybuffer');
  const pdfBuffer = Buffer.from(arrayBuffer);

  // 2. Parse text from PDF buffer using PDFParse
  const parser = new PDFParse({ data: pdfBuffer });
  let extractedRawText = '';
  try {
    const parseResult = await parser.getText();
    extractedRawText = parseResult.text || '';
  } finally {
    await parser.destroy();
  }

  if (!extractedRawText || !extractedRawText.includes('AFL-2026-1090')) {
    throw new Error('PDFParse failed to extract text from generated PDF.');
  }
  console.log('✓ PDFParse successfully extracted digital text from PDF buffer');

  // 3. Test parseRateConfirmationText
  const result = parseRateConfirmationText(extractedRawText, 'Carrier Rate Con 1.pdf');

  // --- ASSERTION 1: Broker Identity & Credential Isolation ---
  console.log(`Checking Broker: "${result.broker.company_name}"...`);
  if (result.broker.company_name !== 'Apex Freight Logistics LLC') {
    throw new Error(`Expected Broker Apex Freight Logistics LLC, got: ${result.broker.company_name}`);
  }
  if (result.broker.company_name.toLowerCase().includes('check in') || result.broker.company_name.toLowerCase().includes('30 mins')) {
    throw new Error(`Regression: Instruction text was used as broker company name: ${result.broker.company_name}`);
  }
  if (result.broker.mc_number !== 'MC-987654') {
    throw new Error(`Expected Broker MC MC-987654, got: ${result.broker.mc_number}`);
  }
  if (result.broker.dot_number !== '3456789') {
    throw new Error(`Expected Broker DOT 3456789, got: ${result.broker.dot_number}`);
  }
  if (result.broker.contact_phone !== '(555) 432-8900') {
    throw new Error(`Expected Broker phone (555) 432-8900, got: ${result.broker.contact_phone}`);
  }
  if ((result.broker.contact_phone as string) === '(555) 432-8902') {
    throw new Error('Regression: Carrier phone (555) 432-8902 was incorrectly assigned to Broker!');
  }
  if (result.broker.contact_email !== 'dispatch@apexfreightlogistics.demo') {
    throw new Error(`Expected Broker email dispatch@apexfreightlogistics.demo, got: ${result.broker.contact_email}`);
  }
  console.log('✓ Broker identity verified (Apex Freight Logistics LLC, MC-987654, DOT: 3456789, Phone: (555) 432-8900, Email: dispatch@apexfreightlogistics.demo)');

  // --- ASSERTION 2: Carrier Identity & Credential Isolation ---
  console.log(`Checking Carrier: "${result.carrier?.carrier_name}"...`);
  if (result.carrier?.carrier_name !== 'Eagle Express Lines LLC') {
    throw new Error(`Expected Carrier Eagle Express Lines LLC, got: ${result.carrier?.carrier_name}`);
  }
  if (result.carrier?.mc_number !== 'MC-459201') {
    throw new Error(`Expected Carrier MC-459201, got: ${result.carrier?.mc_number}`);
  }
  if (result.carrier?.dot_number !== '3129845') {
    throw new Error(`Expected Carrier DOT 3129845, got: ${result.carrier?.dot_number}`);
  }
  if ((result.carrier?.dot_number as string) === '3456789') {
    throw new Error('Regression: Broker DOT 3456789 was incorrectly assigned to Carrier!');
  }
  if (result.carrier?.contact_phone !== '(555) 432-8902') {
    throw new Error(`Expected Carrier contact phone (555) 432-8902, got: ${result.carrier?.contact_phone}`);
  }
  if (result.carrier?.driver_name !== 'Marcus Vance') {
    throw new Error(`Expected Driver Marcus Vance, got: ${result.carrier?.driver_name}`);
  }
  if (!result.carrier?.driver_phone?.includes('349-1188')) {
    throw new Error(`Expected Driver phone (555) 349-1188, got: ${result.carrier?.driver_phone}`);
  }
  if (!result.carrier?.truck_number?.includes('208')) {
    throw new Error(`Expected Truck #208, got: ${result.carrier?.truck_number}`);
  }
  if (!result.carrier?.trailer_number?.includes('5388')) {
    throw new Error(`Expected Trailer #5388, got: ${result.carrier?.trailer_number}`);
  }
  console.log('✓ Carrier identity verified (Eagle Express Lines LLC, MC-459201, DOT: 3129845, Phone: (555) 432-8902, Marcus Vance)');

  // --- ASSERTION 3: Load Number & Commodity Preservation ---
  if (result.load_info.load_number !== 'AFL-2026-1090') {
    throw new Error(`Expected Load # AFL-2026-1090, got: ${result.load_info.load_number}`);
  }
  console.log('✓ Load # verified (AFL-2026-1090)');

  console.log(`Checking Commodity: "${result.load_info.commodity}"...`);
  if (result.load_info.commodity !== 'Commercial Hardware') {
    throw new Error(`Expected full commodity "Commercial Hardware", got: "${result.load_info.commodity}"`);
  }
  if ((result.load_info.commodity as string) === 'Commercial') {
    throw new Error('Regression: Commodity was incorrectly reduced to only "Commercial"!');
  }
  console.log('✓ Commodity verified: "Commercial Hardware" (full description preserved)');

  // --- ASSERTION 4: Appointments, Times & Timezones ---
  console.log('Checking Facility Appointments & Timezones...');
  if (result.origin.city !== 'Columbus' || result.origin.state !== 'OH') {
    throw new Error(`Expected Pickup in Columbus, OH, got: ${result.origin.city}, ${result.origin.state}`);
  }
  if (result.origin.date_string !== '2026-10-24') {
    throw new Error(`Expected Pickup Date 2026-10-24, got: ${result.origin.date_string}`);
  }
  if (result.origin.time_string !== '10:00') {
    throw new Error(`Expected Pickup Time 10:00, got: ${result.origin.time_string}`);
  }
  if (result.origin.timezone !== 'America/New_York') {
    throw new Error(`Expected Pickup timezone America/New_York, got: ${result.origin.timezone}`);
  }
  console.log('✓ Origin Appointment verified: 2026-10-24 at 10:00 America/New_York');

  if (result.destination.city !== 'Charlotte' || result.destination.state !== 'NC') {
    throw new Error(`Expected Delivery in Charlotte, NC, got: ${result.destination.city}, ${result.destination.state}`);
  }
  if (result.destination.date_string !== '2026-10-25') {
    throw new Error(`Expected Delivery Date 2026-10-25, got: ${result.destination.date_string}`);
  }
  if (result.destination.time_string !== '10:30') {
    throw new Error(`Expected Delivery Time 10:30, got: ${result.destination.time_string}`);
  }
  if (result.destination.timezone !== 'America/New_York') {
    throw new Error(`Expected Delivery timezone America/New_York, got: ${result.destination.timezone}`);
  }
  console.log('✓ Destination Appointment verified: 2026-10-25 at 10:30 America/New_York');

  // --- ASSERTION 5: Broker Ref vs Pickup Appt # vs Delivery PO ---
  console.log('Checking Reference and PO Separation...');
  if (result.load_info.pickup_appointment_number !== 'PU-99120') {
    throw new Error(`Expected Pickup Appt # PU-99120, got: ${result.load_info.pickup_appointment_number}`);
  }
  if (result.origin.appointment_number !== 'PU-99120') {
    throw new Error(`Expected origin appointment_number PU-99120, got: ${result.origin.appointment_number}`);
  }
  if (result.load_info.delivery_po_number !== 'DEL-55102-A') {
    throw new Error(`Expected Delivery PO DEL-55102-A, got: ${result.load_info.delivery_po_number}`);
  }
  if (result.destination.po_number !== 'DEL-55102-A') {
    throw new Error(`Expected destination po_number DEL-55102-A, got: ${result.destination.po_number}`);
  }
  if (result.load_info.reference_number === 'DEL-55102-A') {
    throw new Error('Regression: Delivery PO DEL-55102-A was incorrectly mapped as generic broker reference_number!');
  }
  console.log('✓ Reference & PO separation verified (Pickup Appt: PU-99120, Delivery PO: DEL-55102-A, Broker Ref: null)');

  // --- ASSERTION 6: Financials Breakdown ---
  console.log('Checking Financial Settlement Breakdown...');
  if (result.load_info.rate !== 1450) {
    throw new Error(`Expected Total Agreed Pay $1,450, got: ${result.load_info.rate}`);
  }
  if (result.financial_breakdown?.linehaul_rate !== 1204) {
    throw new Error(`Expected Linehaul $1,204, got: ${result.financial_breakdown?.linehaul_rate}`);
  }
  if (result.financial_breakdown?.fuel_surcharge_amount !== 196) {
    throw new Error(`Expected Fuel Surcharge $196, got: ${result.financial_breakdown?.fuel_surcharge_amount}`);
  }
  if (result.financial_breakdown?.accessorial_reserve_amount !== 50) {
    throw new Error(`Expected Accessorial Reserve $50, got: ${result.financial_breakdown?.accessorial_reserve_amount}`);
  }
  if (result.financial_breakdown?.linehaul_rpm !== 2.80) {
    throw new Error(`Expected RPM $2.80/mi, got: ${result.financial_breakdown?.linehaul_rpm}`);
  }
  if (result.load_info.mileage !== 430) {
    throw new Error(`Expected load_info.mileage to be 430, got: ${result.load_info.mileage}`);
  }
  console.log('✓ Financial breakdown verified: Linehaul $1,204 + FSC $196 + Reserve $50 = Total $1,450 (RPM $2.80, Miles: 430)');

  // --- ASSERTION 7: rate_confirmation_test_sample.pdf Verification ---
  console.log('\n--- Checking rate_confirmation_test_sample.pdf extraction ---');
  const sampleText = `================================================================================
RATE CONFIRMATION & BROKER-CARRIER AGREEMENT
APEX FREIGHT SOLUTIONS LLC
MC: MC-892140 | DOT: 3108924
200 West Madison St, Suite 1400, Chicago, IL 60606
Phone: (800) 555-0142 | Email: dispatch@apex-freight-solutions.test
Broker Agent: Sarah Jenkins (Midwest Fleet Division)

Carrier: BlueLine Transport LLC
Carrier MC: MC-654321 | Carrier DOT: 3210984
================================================================================
LOAD / ORDER NUMBER: APX-78421
Reference / PO #: PO-458921
Booking Date: Today
Payment Terms: Net 30 Days

FINANCIAL BREAKDOWN & SETTLEMENT:
Linehaul: $2,800.00 USD
Fuel Surcharge: $350.00 USD
TOTAL AGREED CARRIER COMPENSATION: $3,150.00 USD

EQUIPMENT & SHIPMENT SPECIFICATIONS:
Equipment: 53' Dry Van (Air-Ride, Clean & Odor Free)
Commodity: General Freight (Palletized)
Total Weight: 42,500 lbs
Mileage: 1,125 miles
Pallet Count: 26 Standard Pallets

STOP 1 - PICKUP (ORIGIN):
Facility: Midwest Distribution Center
Address: 4800 S Central Ave
City/State/Zip: Chicago, IL 60632
Date / Time: Sept 5, 2026, 08:00 AM CST
Contact / Phone: Shipping Office (312) 555-0182
Pickup Instructions: Check in at Gate 2 with PO #PO-458921.

STOP 2 - DELIVERY (DESTINATION):
Facility: Texas Distribution Hub
Address: 5200 Mountain Creek Pkwy
City/State/Zip: Dallas, TX 75236
Date / Time: Sept 6, 2026, 02:00 PM CST
Contact / Phone: Receiving Inbound (214) 555-0199
Delivery Instructions: Unload at Docks 32-36. Clear POD required.
================================================================================`;

  const sampleResult = parseRateConfirmationText(sampleText, 'rate_confirmation_test_sample.pdf');
  if (!sampleResult.broker.company_name.toLowerCase().includes('apex freight solutions')) {
    throw new Error(`Sample Broker expected Apex Freight Solutions LLC, got: ${sampleResult.broker.company_name}`);
  }
  if (sampleResult.broker.mc_number !== 'MC-892140') {
    throw new Error(`Sample Broker MC expected MC-892140, got: ${sampleResult.broker.mc_number}`);
  }
  if (!sampleResult.carrier?.carrier_name?.toLowerCase().includes('blueline transport')) {
    throw new Error(`Sample Carrier expected BlueLine Transport LLC, got: ${sampleResult.carrier?.carrier_name}`);
  }
  if (sampleResult.carrier?.mc_number !== 'MC-654321') {
    throw new Error(`Sample Carrier MC expected MC-654321, got: ${sampleResult.carrier?.mc_number}`);
  }
  if (sampleResult.carrier?.dot_number !== '3210984') {
    throw new Error(`Sample Carrier DOT expected 3210984, got: ${sampleResult.carrier?.dot_number}`);
  }
  if (sampleResult.load_info.load_number !== 'APX-78421') {
    throw new Error(`Sample Load # expected APX-78421, got: ${sampleResult.load_info.load_number}`);
  }
  if (sampleResult.load_info.reference_number !== 'PO-458921') {
    throw new Error(`Sample Broker PO expected PO-458921, got: ${sampleResult.load_info.reference_number}`);
  }
  if (sampleResult.load_info.commodity !== 'General Freight (Palletized)') {
    throw new Error(`Sample Commodity expected "General Freight (Palletized)", got: "${sampleResult.load_info.commodity}"`);
  }
  if (sampleResult.origin.date_string !== '2026-09-05' || sampleResult.origin.time_string !== '08:00') {
    throw new Error(`Sample Pickup expected 2026-09-05 at 08:00, got: ${sampleResult.origin.date_string} ${sampleResult.origin.time_string}`);
  }
  if (sampleResult.destination.date_string !== '2026-09-06' || sampleResult.destination.time_string !== '14:00') {
    throw new Error(`Sample Delivery expected 2026-09-06 at 14:00, got: ${sampleResult.destination.date_string} ${sampleResult.destination.time_string}`);
  }
  if (sampleResult.origin.timezone !== 'America/Chicago' || sampleResult.destination.timezone !== 'America/Chicago') {
    throw new Error(`Sample Timezone expected America/Chicago, got PU: ${sampleResult.origin.timezone}, DEL: ${sampleResult.destination.timezone}`);
  }
  console.log('✓ rate_confirmation_test_sample.pdf verified: Broker/Carrier separation, dates/times, commodity, PO, timezone');

  // Assert formatToDateInput & formatToTimeInput unit tests
  if (formatToDateInput('October 24, 2026') !== '2026-10-24') throw new Error('formatToDateInput failed for named month');
  if (formatToDateInput('10/24/2026') !== '2026-10-24') throw new Error('formatToDateInput failed for slash date');
  if (formatToTimeInput('10:00 EDT') !== '10:00') throw new Error('formatToTimeInput failed for 10:00 EDT');
  if (formatToTimeInput('10:30 EDT') !== '10:30') throw new Error('formatToTimeInput failed for 10:30 EDT');
  if (formatToTimeInput('2:30 PM') !== '14:30') throw new Error('formatToTimeInput failed for 2:30 PM');
  console.log('✓ Helper unit functions formatToDateInput & formatToTimeInput passed');

  console.log('\n======================================================');
  console.log('🎉 ALL RATE CONFIRMATION REGRESSION TESTS PASSED! 🎉');
  console.log('======================================================\n');
}

runRegressionTest().catch((err) => {
  console.error('REGRESSION TEST FAILED:', err);
  process.exit(1);
});
