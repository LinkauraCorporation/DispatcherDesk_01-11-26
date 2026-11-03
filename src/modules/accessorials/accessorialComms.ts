import { AccessorialWithLoad, DetentionCalculationResult } from './accessorialTypes.ts';
import {
  formatInTimezone,
  DEFAULT_OPERATIONAL_TIMEZONE,
  DEFAULT_DISPATCHER_TIMEZONE,
} from '../../lib/timezones.ts';
import { LoadDetentionAudit } from '../../types/domain.types.ts';

export interface CommsContext {
  operationalTimezone: string;
  dispatcherTimezone: string;
  senderName?: string;
  senderPhone?: string;
  companyName?: string;
  mcNumber?: string;
  dotNumber?: string;
  acceptedAudit?: LoadDetentionAudit | null;
}

export interface DetentionNoticeValidationResult {
  valid: boolean;
  isValid: boolean;
  errors: string[];
}

/**
 * Normalizes and formats any timestamp, Date, wrapper object, or string input.
 * Guarantees that the returned value is a clean, timezone-aware human-readable string and NEVER contains "[object Object]".
 */
export function formatSafeTimestamp(
  rawInput: unknown,
  operationalTimezone: string = DEFAULT_OPERATIONAL_TIMEZONE,
  dispatcherTimezone: string = DEFAULT_DISPATCHER_TIMEZONE
): string {
  if (rawInput === null || rawInput === undefined) return 'N/A';

  // If already an object (e.g. from formatDualTime or Supabase response wrapper)
  if (typeof rawInput === 'object') {
    const obj = rawInput as Record<string, unknown>;
    if (typeof obj.combined === 'string' && obj.combined.trim() && !obj.combined.includes('[object Object]')) {
      return obj.combined;
    }
    if (typeof obj.primary === 'string' && obj.primary.trim() && !obj.primary.includes('[object Object]')) {
      return obj.primary;
    }
    if (typeof obj.iso === 'string') {
      rawInput = obj.iso;
    } else if (typeof obj.timestamp === 'string') {
      rawInput = obj.timestamp;
    } else if (typeof obj.value === 'string') {
      rawInput = obj.value;
    } else if (rawInput instanceof Date) {
      if (isNaN(rawInput.getTime())) return 'N/A';
      rawInput = rawInput.toISOString();
    } else {
      return 'N/A';
    }
  }

  const str = String(rawInput).trim();
  if (!str || str === 'null' || str === 'undefined' || str === '[object Object]') {
    return 'N/A';
  }

  try {
    const primary = formatInTimezone(str, operationalTimezone, {
      includeDate: true,
      includeTime: true,
      includeTimezoneCode: true,
    });

    if (dispatcherTimezone && dispatcherTimezone !== operationalTimezone) {
      const secondary = formatInTimezone(str, dispatcherTimezone, {
        includeDate: false,
        includeTime: true,
        includeTimezoneCode: true,
      });
      return `${primary} (${secondary})`;
    }

    return primary;
  } catch {
    try {
      const d = new Date(str);
      if (!isNaN(d.getTime())) {
        return d.toUTCString();
      }
    } catch {
      // fallback
    }
  }

  if (!str.includes('[object Object]')) {
    return str;
  }

  return 'N/A';
}

/**
 * Validates authoritative detention notice data before template rendering.
 */
export function validateDetentionNoticeData(params: {
  hasClaimOrAudit?: boolean;
  claim?: AccessorialWithLoad | null;
  audit?: LoadDetentionAudit | null;
  load?: any;
  amount?: unknown;
  billableHours?: unknown;
  hourlyRate?: unknown;
  arrivalTime?: unknown;
  departureTime?: unknown;
  detentionStartTime?: unknown;
  facilityName?: unknown;
}): DetentionNoticeValidationResult {
  const errors: string[] = [];

  const claim = params.claim;
  const audit = params.audit;
  const hasClaimOrAudit = params.hasClaimOrAudit ?? Boolean(claim || audit);

  if (!hasClaimOrAudit) {
    errors.push('No authoritative detention claim or accepted audit found for this load.');
  }

  const rawAmount = params.amount ?? audit?.total_verified_amount ?? audit?.pickup_verified_amount ?? (audit as any)?.calculated_amount ?? claim?.amount;
  const amt = Number(rawAmount);
  if (rawAmount === undefined || rawAmount === null || isNaN(amt) || amt < 0) {
    errors.push('Detention claim amount must be a valid numeric dollar figure.');
  }

  const rawHours = params.billableHours ?? audit?.total_verified_hours ?? audit?.pickup_billable_hours ?? (audit as any)?.billable_hours ?? claim?.detention_details?.billable_hours;
  const hours = Number(rawHours);
  if (rawHours === undefined || rawHours === null || isNaN(hours) || hours < 0) {
    errors.push('Billable detention hours must be a valid numeric figure.');
  }

  const rawRate = params.hourlyRate ?? audit?.pickup_hourly_rate ?? (audit as any)?.contract_terms?.detention_rate_per_hour ?? claim?.detention_details?.hourly_rate;
  const rate = Number(rawRate);
  if (rawRate === undefined || rawRate === null || isNaN(rate) || rate <= 0) {
    errors.push('Detention rate must be a valid positive hourly rate.');
  }

  const arrivalTime = params.arrivalTime ?? audit?.pickup_arrival_time ?? (audit as any)?.evidence_summary?.arrival_time ?? claim?.detention_details?.arrival_time;
  if (!arrivalTime) {
    errors.push('Facility arrival timestamp is required.');
  } else if (typeof arrivalTime === 'string') {
    if (arrivalTime.includes('[object Object]')) {
      errors.push('Arrival timestamp contains serialized [object Object].');
    } else {
      const d = new Date(arrivalTime);
      if (isNaN(d.getTime())) {
        errors.push('Facility arrival timestamp is an invalid date string.');
      }
    }
  }

  const departureTime = params.departureTime ?? audit?.pickup_departure_time ?? (audit as any)?.evidence_summary?.departure_time ?? claim?.detention_details?.departure_time;
  if (typeof departureTime === 'string' && departureTime.includes('[object Object]')) {
    errors.push('Departure timestamp contains serialized [object Object].');
  }

  const detentionStartTime = params.detentionStartTime ?? audit?.pickup_detention_start ?? (audit as any)?.evidence_summary?.detention_start_time;
  if (typeof detentionStartTime === 'string' && detentionStartTime.includes('[object Object]')) {
    errors.push('Detention start timestamp contains serialized [object Object].');
  }

  const locationStr = (claim as any)?.location;
  if (typeof locationStr === 'string' && locationStr.includes('[object Object]')) {
    errors.push('Claim location contains serialized [object Object].');
  }

  const facilityName = params.facilityName ?? (audit as any)?.facility_name ?? claim?.detention_details?.facility_name;
  if (typeof facilityName === 'string' && facilityName.includes('[object Object]')) {
    errors.push('Facility name contains serialized [object Object].');
  }

  const isValid = errors.length === 0;
  return {
    valid: isValid,
    isValid,
    errors,
  };
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
 * Enforces authoritative financial grounding when an accepted audit or claim exists.
 */
export function generateBrokerDetentionEmail(
  claim: AccessorialWithLoad,
  detCalc: DetentionCalculationResult,
  ctx: CommsContext
): { subject: string; body: string } {
  const info = getCarrierInfo(claim, ctx);
  const det = claim.detention_details;
  const audit = ctx.acceptedAudit;

  // Authoritative Audit Precedence Check
  const isAuditAccepted = Boolean(audit && audit.human_review_status === 'accepted');
  const hasAuthoritativeClaim = Boolean(
    claim.audit_id ||
    claim.audit_version ||
    (claim.type === 'detention' && claim.amount > 0 && det?.billable_hours !== undefined && det.billable_hours > 0)
  );

  const isDelivery = isAuditAccepted && audit
    ? (Number(audit.delivery_verified_amount || 0) > Number(audit.pickup_verified_amount || 0) ||
       ((audit as any)?.facility_type === 'delivery') ||
       (!audit.pickup_arrival_time && Boolean(audit.delivery_arrival_time)))
    : det?.facility_type === 'delivery';

  const facilityTypeLabel = isDelivery
    ? 'Receiver (Delivery)'
    : (det?.facility_type === 'intermediate_stop' ? 'Intermediate Stop' : 'Shipper (Pickup)');

  // Authoritative financial values:
  // Audit > Authoritative Claim > Fallback detCalc
  const rawAuditBillable = audit
    ? (isDelivery
        ? (audit.delivery_billable_hours ?? (audit as any).billable_hours)
        : (audit.pickup_billable_hours ?? (audit as any).billable_hours))
    : undefined;
  const billableHours: number = (isAuditAccepted && rawAuditBillable !== undefined && rawAuditBillable !== null)
    ? Number(rawAuditBillable)
    : hasAuthoritativeClaim && det?.billable_hours !== undefined && det.billable_hours > 0
    ? Number(det.billable_hours)
    : Number(detCalc.billableHours ?? 0);

  const rawAuditRate = audit
    ? (isDelivery
        ? (audit.delivery_hourly_rate ?? (audit as any).contract_terms?.detention_rate_per_hour)
        : (audit.pickup_hourly_rate ?? (audit as any).contract_terms?.detention_rate_per_hour))
    : undefined;
  const hourlyRate: number = (isAuditAccepted && rawAuditRate !== undefined && rawAuditRate !== null)
    ? Number(rawAuditRate)
    : hasAuthoritativeClaim && det?.hourly_rate !== undefined && det.hourly_rate > 0
    ? Number(det.hourly_rate)
    : Number(det?.hourly_rate ?? detCalc.hourlyRate ?? 75.0);

  const rawAuditAmount = audit
    ? (isDelivery
        ? (audit.delivery_verified_amount ?? (audit as any).calculated_amount)
        : (audit.pickup_verified_amount ?? (audit as any).calculated_amount ?? audit.total_verified_amount))
    : undefined;
  const totalAmount: number = (isAuditAccepted && rawAuditAmount !== undefined && rawAuditAmount !== null)
    ? Number(rawAuditAmount)
    : hasAuthoritativeClaim && claim.amount > 0
    ? Number(claim.amount)
    : Number(detCalc.totalAmount ?? 0);

  const rawAuditFreeTime = audit
    ? (isDelivery
        ? (audit.delivery_free_time_hours ?? (audit as any).contract_terms?.free_time_hours)
        : (audit.pickup_free_time_hours ?? (audit as any).contract_terms?.free_time_hours))
    : undefined;
  const freeTimeHours: number = (isAuditAccepted && rawAuditFreeTime !== undefined && rawAuditFreeTime !== null)
    ? Number(rawAuditFreeTime)
    : Number(det?.free_time_hours ?? detCalc.freeTimeHours ?? 2.0);

  // Authoritative timestamps
  const arrivalIso = isAuditAccepted && audit
    ? (isDelivery
        ? (audit.delivery_arrival_time || (audit as any).evidence_summary?.arrival_time)
        : (audit.pickup_arrival_time || (audit as any).evidence_summary?.arrival_time))
    : det?.arrival_time;

  const detStartIso = isAuditAccepted && audit
    ? (isDelivery
        ? (audit.delivery_detention_start || (audit as any).evidence_summary?.detention_start_time)
        : (audit.pickup_detention_start || (audit as any).evidence_summary?.detention_start_time))
    : (detCalc.detentionStartTimeIso || (arrivalIso ? new Date(new Date(arrivalIso).getTime() + freeTimeHours * 3600000).toISOString() : null));

  let departureIso = isAuditAccepted && audit
    ? (isDelivery
        ? (audit.delivery_departure_time || audit.delivery_detention_end || (audit as any).evidence_summary?.departure_time)
        : (audit.pickup_departure_time || audit.pickup_detention_end || (audit as any).evidence_summary?.departure_time))
    : det?.departure_time;

  if (!departureIso && det?.departure_time) {
    departureIso = det.departure_time;
  }
  if (!departureIso && arrivalIso && billableHours > 0) {
    departureIso = new Date(new Date(arrivalIso).getTime() + (freeTimeHours + billableHours) * 3600000).toISOString();
  }

  // Facility name & address
  const facilityName =
    det?.facility_name ||
    (isDelivery ? claim.load?.dest_facility_name || claim.load?.dest_city : claim.load?.origin_facility_name || claim.load?.origin_city) ||
    'Buckeye Logistics Terminal';

  const facilityAddress =
    det?.facility_address ||
    (isDelivery
      ? (claim.load?.dest_address || `${claim.load?.dest_city || ''}, ${claim.load?.dest_state || ''}`)
      : (claim.load?.origin_address || `${claim.load?.origin_city || ''}, ${claim.load?.origin_state || ''}`)) ||
    '1200 Terminal Way, Columbus, OH';

  // Safely format all timestamps (NEVER [object Object])
  const arrivalFormatted = formatSafeTimestamp(arrivalIso, ctx.operationalTimezone, ctx.dispatcherTimezone);
  const freeTimeExpiryFormatted = formatSafeTimestamp(detStartIso, ctx.operationalTimezone, ctx.dispatcherTimezone);
  const departureFormatted = departureIso
    ? formatSafeTimestamp(departureIso, ctx.operationalTimezone, ctx.dispatcherTimezone)
    : 'STILL AT DOCK (ACTIVE DETENTION ACCRUING)';

  const formattedHours = billableHours.toFixed(2);
  const formattedRate = hourlyRate.toFixed(2);
  const formattedAmount = totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const subject = `[DETENTION CLAIM] Load #${info.loadNumber} - ${info.companyName} (${info.mcNumber}) - ${facilityTypeLabel}`;

  const body = `ATTENTION: ${info.brokerContact} (${info.brokerName})
RE: Detention Notice & Revised Rate Confirmation Request
LOAD #: ${info.loadNumber}
CARRIER: ${info.companyName} | ${info.mcNumber} | ${info.dotNumber}
EQUIPMENT: Truck #${info.truckNumber} | Driver: ${info.driverName} (${info.driverPhone})

Dear Broker Team,

Please be advised that our driver has been detained at the ${facilityTypeLabel} beyond the agreed ${freeTimeHours} hours free time.

FACILITY & DETENTION LOG:
--------------------------------------------------
• Facility: ${facilityName} (${facilityAddress})
• Facility Type: ${facilityTypeLabel}
• Driver Arrival Time: ${arrivalFormatted}
• Free Time Allowed: ${freeTimeHours} Hours
• Detention Started At: ${freeTimeExpiryFormatted}
• Driver Departure Time: ${departureFormatted}
• Total Billable Detention: ${formattedHours} hours
• Agreed Detention Rate: $${formattedRate} / hour
• TOTAL DETENTION CLAIM AMOUNT: $${formattedAmount} USD
--------------------------------------------------

${
  departureIso
    ? `Driver has completed unloading/loading with signed BOL stamps showing in/out times.`
    : `Driver is currently still waiting at the facility. Detention clock is ongoing and running in 15-minute increments.`
}

Please issue a revised Rate Confirmation including the $${formattedAmount} detention fee at your earliest convenience to avoid billing delays.

Thank you,
${ctx.senderName || 'Dispatch Operations'}
${info.companyName} Dispatch Team
Phone: ${ctx.senderPhone || '(800) 555-0199'}`;

  // Fail-safe verification: guarantee no [object Object] in template output
  if (body.includes('[object Object]') || subject.includes('[object Object]')) {
    throw new Error('Detention notice validation failed: template output contains serialized [object Object].');
  }

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
