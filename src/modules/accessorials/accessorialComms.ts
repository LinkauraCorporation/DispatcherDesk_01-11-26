import { AccessorialWithLoad, DetentionCalculationResult } from './accessorialTypes.ts';
import { formatDualTime, formatInTimezone } from '../../lib/timezones.ts';

export interface CommsContext {
  operationalTimezone: string;
  dispatcherTimezone: string;
  senderName?: string;
  senderPhone?: string;
  companyName?: string;
  mcNumber?: string;
  dotNumber?: string;
}

/**
 * Helper to get clean carrier details from relations or defaults
 */
function getCarrierInfo(claim: AccessorialWithLoad, ctx: CommsContext) {
  const load = claim.load;
  const companyName =
    ctx.companyName ||
    load?.client?.company_name ||
    'Eagle Express Freight LLC';
  const mcNumber = ctx.mcNumber || 'MC-1284901';
  const dotNumber = ctx.dotNumber || 'DOT-3891044';
  const loadNumber = load?.load_number || 'LD-PENDING';
  const brokerName = claim.broker_name || load?.broker?.company_name || 'Broker Logistics';
  const brokerContact = claim.broker_contact_person || load?.broker?.contact_name || 'Load Broker / Dispatch';
  const brokerEmail = claim.broker_contact_email || load?.broker?.contact_email || 'broker@freight.com';
  const driverName = load?.driver?.full_name || 'Assigned Driver';
  const driverPhone = load?.driver?.phone || '(555) 019-2834';
  const truckNumber = load?.truck?.truck_number || '101';

  return {
    companyName,
    mcNumber,
    dotNumber,
    loadNumber,
    brokerName,
    brokerContact,
    brokerEmail,
    driverName,
    driverPhone,
    truckNumber,
  };
}

/**
 * 1. Generates Broker Detention Notification & Official Claim Email
 */
export function generateBrokerDetentionEmail(
  claim: AccessorialWithLoad,
  detCalc: DetentionCalculationResult,
  ctx: CommsContext
): { subject: string; body: string } {
  const info = getCarrierInfo(claim, ctx);
  const det = claim.detention_details;

  const facilityTypeLabel =
    det?.facility_type === 'pickup'
      ? 'Shipper (Pickup)'
      : det?.facility_type === 'delivery'
      ? 'Receiver (Delivery)'
      : 'Facility Dock';

  const facilityName = det?.facility_name || (det?.facility_type === 'pickup' ? claim.load?.origin_city : claim.load?.dest_city) || 'Facility Dock';
  const facilityAddress = det?.facility_address || (det?.facility_type === 'pickup' ? `${claim.load?.origin_city}, ${claim.load?.origin_state}` : `${claim.load?.dest_city}, ${claim.load?.dest_state}`) || 'Facility Address';

  const arrivalFormatted = det?.arrival_time
    ? formatDualTime(det.arrival_time, ctx.operationalTimezone, ctx.dispatcherTimezone)
    : 'N/A';

  const freeTimeExpiryFormatted = detCalc.detentionStartTimeIso
    ? formatDualTime(detCalc.detentionStartTimeIso, ctx.operationalTimezone, ctx.dispatcherTimezone)
    : 'N/A';

  const departureFormatted = det?.departure_time
    ? formatDualTime(det.departure_time, ctx.operationalTimezone, ctx.dispatcherTimezone)
    : 'STILL AT DOCK (ACTIVE DETENTION ACCRUING)';

  const subject = `[DETENTION CLAIM] Load #${info.loadNumber} - ${info.companyName} (${info.mcNumber}) - ${facilityTypeLabel}`;

  const body = `ATTENTION: ${info.brokerContact} (${info.brokerName})
RE: Detention Notice & Revised Rate Confirmation Request
LOAD #: ${info.loadNumber}
CARRIER: ${info.companyName} | ${info.mcNumber} | ${info.dotNumber}
EQUIPMENT: Truck #${info.truckNumber} | Driver: ${info.driverName} (${info.driverPhone})

Dear Broker Team,

Please be advised that our driver has been detained at the ${facilityTypeLabel} beyond the agreed ${det?.free_time_hours ?? 2.0} hours free time.

FACILITY & DETENTION LOG:
--------------------------------------------------
• Facility: ${facilityName} (${facilityAddress})
• Facility Type: ${facilityTypeLabel}
• Driver Arrival Time: ${arrivalFormatted}
• Free Time Allowed: ${det?.free_time_hours ?? 2.0} Hours
• Detention Started At: ${freeTimeExpiryFormatted}
• Driver Departure Time: ${departureFormatted}
• Total Billable Detention: ${detCalc.formattedBillableTime} (${detCalc.billableHours.toFixed(2)} hours)
• Agreed Detention Rate: $${detCalc.hourlyRate.toFixed(2)} / hour
• TOTAL DETENTION CLAIM AMOUNT: $${detCalc.totalAmount.toFixed(2)} USD
--------------------------------------------------

${
  det?.departure_time
    ? `Driver has completed unloading/loading with signed BOL stamps showing in/out times.`
    : `Driver is currently still waiting at the facility. Detention clock is ongoing and running in 15-minute increments.`
}

Please issue a revised Rate Confirmation including the $${detCalc.totalAmount.toFixed(2)} detention fee at your earliest convenience to avoid billing delays.

Thank you,
${ctx.senderName || 'Dispatch Operations'}
${info.companyName} Dispatch Team
Phone: ${ctx.senderPhone || '(800) 555-0199'}`;

  return { subject, body };
}

/**
 * 2. Generates Driver WhatsApp Instructions & Gate Stamp Alert
 */
export function generateDriverWhatsAppReminder(
  claim: AccessorialWithLoad,
  detCalc: DetentionCalculationResult,
  ctx: CommsContext
): string {
  const info = getCarrierInfo(claim, ctx);
  const det = claim.detention_details;
  const facilityName = det?.facility_name || 'Facility Dock';
  const arrivalTime = det?.arrival_time
    ? formatInTimezone(det.arrival_time, ctx.operationalTimezone, { includeTime: true, includeDate: false })
    : 'Confirmed Time';

  return `🚨 *DISPATCH ALERT: DETENTION RUNNING FOR LOAD #${info.loadNumber}* 🚨

👤 *Driver:* ${info.driverName} (Truck #${info.truckNumber})
📍 *Facility:* ${facilityName}
⏱️ *Arrival Logged:* ${arrivalTime} (${ctx.operationalTimezone})
⏳ *Status:* ${detCalc.isActiveDetention ? `Accruing Detention (+${detCalc.billableHours.toFixed(2)} hrs billable)` : `Completed (${detCalc.formattedBillableTime})`}

⚠️ *CRITICAL INSTRUCTIONS FOR DRIVER:*
1. 📝 *GET BOL STAMPED:* You MUST have the facility shipping/receiving guard stamp or write the physical *CHECK-IN TIME* and *CHECK-OUT TIME* on your paper BOL.
2. ✍️ *GET SIGNATURE:* Ensure the clerk signs and dates the in/out time.
3. 📸 *TAKE PHOTO:* As soon as you get your signed BOL, take a clear, well-lit photo and WhatsApp it back to dispatch immediately!

*Brokers will REJECT our $${detCalc.hourlyRate}/hr detention claim without physical in/out stamps on the paper BOL.* 

Reply to confirm you have read this message. Thank you!`;
}

/**
 * 3. Generates Layover / TONU Claim Request
 */
export function generateLayoverTonuEmail(
  claim: AccessorialWithLoad,
  ctx: CommsContext
): { subject: string; body: string } {
  const info = getCarrierInfo(claim, ctx);
  const isTonu = claim.type === 'tonu';
  const typeLabel = isTonu ? 'TONU (Truck Ordered Not Used)' : 'Layover Claim';

  const subject = `[${typeLabel.toUpperCase()}] Load #${info.loadNumber} - ${info.companyName} (${info.mcNumber})`;

  const body = `ATTENTION: ${info.brokerContact} (${info.brokerName})
RE: ${typeLabel} Compensation & Revised Rate Confirmation Request
LOAD #: ${info.loadNumber}
CARRIER: ${info.companyName} | ${info.mcNumber} | ${info.dotNumber}
EQUIPMENT: Truck #${info.truckNumber} | Driver: ${info.driverName}

Dear Broker Team,

This is an official claim for ${typeLabel} compensation regarding Load #${info.loadNumber}.

CLAIM SUMMARY:
--------------------------------------------------
• Accessorial Type: ${typeLabel}
• Agreed Compensation: $${claim.amount.toFixed(2)} USD
• Reason / Details: ${claim.description}
${claim.notes ? `• Additional Notes: ${claim.notes}` : ''}
--------------------------------------------------

Our driver was on-site and ready to perform per the rate confirmation agreement. Due to ${
    isTonu ? 'cancellation after dispatch' : 'unforeseen shipper/receiver hold'
  }, we require a revised Rate Confirmation for $${claim.amount.toFixed(2)} to process billing.

Please reply with the updated rate confirmation at your earliest convenience.

Best regards,
${ctx.senderName || 'Dispatch Operations'}
${info.companyName}`;

  return { subject, body };
}

/**
 * 4. Generates Lumper Advance / Reimbursement Claim Request
 */
export function generateLumperClaimEmail(
  claim: AccessorialWithLoad,
  ctx: CommsContext
): { subject: string; body: string } {
  const info = getCarrierInfo(claim, ctx);

  const subject = `[LUMPER REIMBURSEMENT] Load #${info.loadNumber} - ${info.companyName} ($${claim.amount.toFixed(2)})`;

  const body = `ATTENTION: ${info.brokerContact} (${info.brokerName})
RE: Lumper Fee Reimbursement & Revised Rate Con
LOAD #: ${info.loadNumber}
CARRIER: ${info.companyName} | ${info.mcNumber}
DRIVER: ${info.driverName} (Truck #${info.truckNumber})

Dear Broker Team,

Please find the lumper payment details for unloading at the receiver facility for Load #${info.loadNumber}:

LUMPER PAYMENT SUMMARY:
--------------------------------------------------
• Lumper Fee Amount: $${claim.amount.toFixed(2)} USD
• Payment Method: ${claim.payment_method?.toUpperCase() || 'COMCHEK / DRIVER PAID'}
${claim.receipt_number ? `• Receipt / Check #: ${claim.receipt_number}` : ''}
• Details: ${claim.description}
--------------------------------------------------

The official signed lumper receipt is attached/on file. Please send an updated Rate Confirmation with the $${claim.amount.toFixed(2)} lumper fee added so we can finalize invoice processing.

Thank you,
${ctx.senderName || 'Dispatch Operations'}
${info.companyName}`;

  return { subject, body };
}
