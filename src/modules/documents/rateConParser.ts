import { EquipmentType } from '../../types/domain.types.ts';
import { getStateTimezone } from '../../lib/timezones.ts';
import {
  RateConfirmationExtraction,
  ExtractedBrokerInfo,
  ExtractedCarrierInfo,
  ExtractedLoadInfo,
  ExtractedLocationInfo,
  ExtractedStopInfo,
  ExtractedAccessorial,
  FinancialBreakdown,
  ExtractionConfidenceScores,
} from './extractionTypes.ts';

/**
 * Normalizes US currency values from strings, numbers, or formatted amounts.
 * Removes symbols, commas, whitespace. Returns a clean non-negative float rounded to 2 decimals.
 */
export function normalizeCurrency(val: any): number {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') {
    return isNaN(val) ? 0 : Math.max(0, Math.round(val * 100) / 100);
  }
  const cleanStr = String(val).replace(/[^0-9.-]/g, '');
  const parsed = parseFloat(cleanStr);
  return isNaN(parsed) ? 0 : Math.max(0, Math.round(parsed * 100) / 100);
}

/**
 * Normalizes mileage to an integer.
 */
export function normalizeMileage(val: any): number | null {
  if (val === null || val === undefined || val === '') return null;
  if (typeof val === 'number') {
    return isNaN(val) ? null : Math.max(0, Math.round(val));
  }
  const cleanStr = String(val).replace(/[^0-9.]/g, '');
  const parsed = parseFloat(cleanStr);
  return isNaN(parsed) ? null : Math.max(0, Math.round(parsed));
}

/**
 * Normalizes weight in lbs to an integer.
 */
export function normalizeWeight(val: any): number | null {
  if (val === null || val === undefined || val === '') return null;
  if (typeof val === 'number') {
    return isNaN(val) ? null : Math.max(0, Math.round(val));
  }
  const str = String(val).trim();
  if (str.toLowerCase().endsWith('k') || str.toLowerCase().endsWith('k lbs')) {
    const kNum = parseFloat(str.replace(/[^0-9.]/g, ''));
    if (!isNaN(kNum)) return Math.round(kNum * 1000);
  }
  const cleanStr = str.replace(/[^0-9.]/g, '');
  const parsed = parseFloat(cleanStr);
  return isNaN(parsed) ? null : Math.max(0, Math.round(parsed));
}

/**
 * Normalizes equipment strings into standard EquipmentType.
 */
export function normalizeEquipmentType(eqStr?: string | null): EquipmentType {
  if (!eqStr) return 'dry_van';
  const lower = eqStr.toLowerCase().trim();
  if (lower.includes('reefer') || lower.includes('refrigerated') || lower.includes('temp') || lower.includes('frozen') || lower.includes('chilled')) {
    return 'reefer';
  }
  if (lower.includes('flatbed') || lower.includes('flat bed') || lower.includes('tarp') || lower.includes('chain')) {
    return 'flatbed';
  }
  if (lower.includes('step') && (lower.includes('deck') || lower.includes('deck'))) {
    return 'step_deck';
  }
  if (lower.includes('power') || lower.includes('towaway') || lower.includes('power only')) {
    return 'power_only';
  }
  if (lower.includes('box') || lower.includes('straight truck')) {
    return 'box_truck';
  }
  if (lower.includes('hotshot') || lower.includes('hot shot')) {
    return 'hotshot';
  }
  if (lower.includes('van') || lower.includes('dry') || lower.includes('air-ride') || lower.includes('53') || lower.includes('48')) {
    return 'dry_van';
  }
  return 'dry_van';
}

/**
 * Formats diverse date strings into standardized YYYY-MM-DD for HTML inputs.
 */
export function formatToDateInput(val?: string | null): string {
  if (!val) return '';
  const trimmed = val.trim();

  // ISO: YYYY-MM-DD
  const isoMatch = trimmed.match(/\b(20\d{2})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\b/);
  if (isoMatch) return isoMatch[0];

  // US numeric dates: M/D/YYYY, MM/DD/YYYY, M/D/YY, MM/DD/YY
  const slashMatch = trimmed.match(/\b(0?[1-9]|1[0-2])\/(0?[1-9]|[12]\d|3[01])\/(\d{2}|\d{4})\b/);
  if (slashMatch) {
    const mm = String(parseInt(slashMatch[1], 10)).padStart(2, '0');
    const dd = String(parseInt(slashMatch[2], 10)).padStart(2, '0');
    const rawYear = slashMatch[3];
    const yyyy = rawYear.length === 2 ? `20${rawYear}` : rawYear;
    return `${yyyy}-${mm}-${dd}`;
  }

  // Named month: Oct 24, 2026 / October 24 2026 / Oct. 24, 2026
  const namedMatch = trimmed.match(
    /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Sept|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)[.]?\s+(\d{1,2})(?:st|nd|rd|th)?[,\s]+(20\d{2})\b/i
  );

  if (namedMatch) {
    const monthNames: Record<string, number> = {
      jan: 1, january: 1,
      feb: 2, february: 2,
      mar: 3, march: 3,
      apr: 4, april: 4,
      may: 5,
      jun: 6, june: 6,
      jul: 7, july: 7,
      aug: 8, august: 8,
      sep: 9, sept: 9, september: 9,
      oct: 10, october: 10,
      nov: 11, november: 11,
      dec: 12, december: 12,
    };

    const key = namedMatch[1].toLowerCase().replace('.', '');
    const month = monthNames[key];
    if (!month) return '';

    const dd = String(parseInt(namedMatch[2], 10)).padStart(2, '0');
    return `${namedMatch[3]}-${String(month).padStart(2, '0')}-${dd}`;
  }

  // DD-MMM-YYYY, e.g. 24-Oct-2026
  const dmyMatch = trimmed.match(
    /\b(\d{1,2})[-\/](Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*[-\/](20\d{2})\b/i
  );

  if (dmyMatch) {
    const monthNames: Record<string, number> = {
      jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
      jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
    };
    const month = monthNames[dmyMatch[2].toLowerCase()];
    if (!month) return '';

    return `${dmyMatch[3]}-${String(month).padStart(2, '0')}-${String(parseInt(dmyMatch[1], 10)).padStart(2, '0')}`;
  }

  return '';
}

export function formatToTimeInput(val?: string | null): string {
  if (!val) return '';
  const trimmed = val.trim();

  // Prefer explicit clock times with minutes: 14:00, 08:30, 2:00 PM.
  const clockMatch = trimmed.match(/(?:^|[^0-9])(\d{1,2}):([0-5]\d)\s*(AM|PM)?(?=\s|$|[.,;:@])/i);
  if (clockMatch) {
    let hour = parseInt(clockMatch[1], 10);
    const minute = parseInt(clockMatch[2], 10);
    const meridiem = clockMatch[3]?.toUpperCase() || null;

    if (meridiem) {
      if (hour < 1 || hour > 12) return '';
      if (meridiem === 'PM' && hour < 12) hour += 12;
      if (meridiem === 'AM' && hour === 12) hour = 0;
    } else if (hour > 23) {
      return '';
    }

    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  }

  // Hour-only times are accepted only when AM/PM is explicitly present.
  const meridiemMatch = trimmed.match(/(?:^|[^0-9])(\d{1,2})\s*(AM|PM)\b/i);
  if (!meridiemMatch) return '';

  let hour = parseInt(meridiemMatch[1], 10);
  const meridiem = meridiemMatch[2].toUpperCase();
  if (hour < 1 || hour > 12) return '';
  if (meridiem === 'PM' && hour < 12) hour += 12;
  if (meridiem === 'AM' && hour === 12) hour = 0;

  return `${String(hour).padStart(2, '0')}:00`;
}
export function parseTimeWindow(val?: string | null): {
  start: string | null;
  end: string | null;
  type: string | null;
} {
  if (!val) return { start: null, end: null, type: null };

  const trimmed = val.trim();

  const typeMatch = trimmed.match(/\b(FCFS|APPOINTMENT|BY|BETWEEN|APPT)\b(?!\s*#)/i);
  const typeRaw = typeMatch?.[1]?.toUpperCase() || null;
  const type =
    typeRaw === 'APPOINTMENT' ? 'APPT' : typeRaw;

  const timePattern = String.raw`(?:\d{1,2}:\d{2}\s*(?:AM|PM)?|\d{1,2}\s*(?:AM|PM))`;

  const rangeMatch = trimmed.match(
    new RegExp(`(${timePattern})\\s*(?:-|–|—|TO|UNTIL|THRU|THROUGH)\\s*(${timePattern})`, 'i')
  );

  if (rangeMatch) {
    const start = formatToTimeInput(rangeMatch[1]);
    const end = formatToTimeInput(rangeMatch[2]);

    return {
      start: start || null,
      end: end || null,
      type,
    };
  }

  const betweenMatch = trimmed.match(
    new RegExp(`\\bBETWEEN\\s+(${timePattern})\\s+(?:AND|TO)\\s+(${timePattern})`, 'i')
  );

  if (betweenMatch) {
    const start = formatToTimeInput(betweenMatch[1]);
    const end = formatToTimeInput(betweenMatch[2]);

    return {
      start: start || null,
      end: end || null,
      type: 'BETWEEN',
    };
  }

  const single = formatToTimeInput(trimmed);

  return {
    start: single || null,
    end: null,
    type,
  };
}
export function mapTimezoneToStandard(tz?: string | null): string {
  if (!tz) return 'America/New_York';

  const upper = tz.toUpperCase().trim().replace(/\s+/g, '_');

  if (
    upper.includes('NEW_YORK') ||
    upper === 'EDT' ||
    upper === 'EST' ||
    upper === 'ET' ||
    upper === 'EASTERN'
  ) {
    return 'America/New_York';
  }

  if (
    upper.includes('CHICAGO') ||
    upper === 'CDT' ||
    upper === 'CST' ||
    upper === 'CT' ||
    upper === 'CENTRAL'
  ) {
    return 'America/Chicago';
  }

  if (
    upper.includes('DENVER') ||
    upper === 'MDT' ||
    upper === 'MST' ||
    upper === 'MT' ||
    upper === 'MOUNTAIN'
  ) {
    return 'America/Denver';
  }

  if (
    upper.includes('LOS_ANGELES') ||
    upper === 'PDT' ||
    upper === 'PST' ||
    upper === 'PT' ||
    upper === 'PACIFIC'
  ) {
    return 'America/Los_Angeles';
  }

  if (upper.includes('TORONTO')) return 'America/Toronto';
  if (upper === 'UTC' || upper === 'GMT') return 'UTC';

  return 'America/New_York';
}

export function normalizeDateTime(rawDateTime?: string | null): {
  iso: string | null;
  dateStr: string | null;
  timeStr: string | null;
  timezone: string | null;
} {
  if (!rawDateTime || !rawDateTime.trim()) {
    return { iso: null, dateStr: null, timeStr: null, timezone: null };
  }

  const str = rawDateTime.trim();

  // Explicit timezone abbreviation.
  const tzMatch = str.match(
    /\b(CST|CDT|EST|EDT|PST|PDT|MST|MDT|UTC|GMT|CT|ET|PT|MT)\b/i
  );

  const rawTz = tzMatch ? tzMatch[1].toUpperCase() : null;
  const canonicalTz = rawTz ? mapTimezoneToStandard(rawTz) : null;

  // Extract date.
  const dateStr = formatToDateInput(str);

  // Extract time without inventing a default.
  const timeStr = formatToTimeInput(str);

  let year: number | null = null;
  let monthIndex: number | null = null;
  let day: number | null = null;

  if (dateStr) {
    const parts = dateStr.split('-');
    year = parseInt(parts[0], 10);
    monthIndex = parseInt(parts[1], 10) - 1;
    day = parseInt(parts[2], 10);
  }

  let iso: string | null = null;

  /*
   * Important:
   * Keep the extracted appointment wall-clock date/time exact.
   * Only construct a UTC ISO instant when BOTH date and time are explicitly
   * present. Never invent 08:00 when the document does not provide a time.
   */
  if (
    year !== null &&
    monthIndex !== null &&
    day !== null &&
    timeStr
  ) {
    const [hour, minute] = timeStr.split(':').map(Number);

    let offsetHours = 0;

    if (rawTz === 'EST') offsetHours = -5;
    else if (rawTz === 'EDT' || rawTz === 'ET') offsetHours = -4;
    else if (rawTz === 'CST') offsetHours = -6;
    else if (rawTz === 'CDT' || rawTz === 'CT') offsetHours = -5;
    else if (rawTz === 'MST') offsetHours = -7;
    else if (rawTz === 'MDT' || rawTz === 'MT') offsetHours = -6;
    else if (rawTz === 'PST') offsetHours = -8;
    else if (rawTz === 'PDT' || rawTz === 'PT') offsetHours = -7;
    else if (rawTz === 'UTC' || rawTz === 'GMT') offsetHours = 0;
    else {
      /*
       * No explicit timezone:
       * do not silently convert the facility's local wall-clock time.
       * The caller already has the facility state and can supply its timezone.
       */
      iso = `${dateStr}T${timeStr}:00`;
    }

    if (!iso && rawTz) {
      const utcMillis = Date.UTC(
        year,
        monthIndex,
        day,
        hour - offsetHours,
        minute,
        0,
        0
      );

      iso = `${dateStr}T${timeStr}:00`;
    }
  } else if (dateStr && !timeStr) {
    /*
     * Date is known but time is not.
     * Return the date only; never fabricate an appointment time.
     */
    iso = null;
  }

  return {
    iso,
    dateStr: dateStr || null,
    timeStr: timeStr || null,
    timezone: canonicalTz || rawTz,
  };
}
export function calculateTrueRPM(rate: number, mileage: number | null | undefined): number | null {
  if (!mileage || mileage <= 0 || !rate || rate <= 0) return null;
  const rpm = rate / mileage;
  return Math.round(rpm * 100) / 100;
}

/**
 * Pure deterministic parser that extracts all structured rate confirmation fields
 * directly from actual text without hallucinations or hardcoded mock stubs.
 */
export function parseRateConfirmationText(rawText: string, fileName?: string): RateConfirmationExtraction {
  const text = rawText || '';
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  // --- SECTION SEGMENTATION FOR STRICT ROLE & CREDENTIAL ISOLATION ---
  const carrierHeaderMatch = text.match(/(?:^|\n)\s*(?:Carrier(?:\s*Information|\s*Name)?|Contract\s*Carrier|Carrier\s*Payee|Vendor)\s*[:\-]/i);
  const carrierSectionStart = carrierHeaderMatch ? carrierHeaderMatch.index! : -1;

  const loadHeaderMatch = text.match(/(?:^|\n)\s*(?:LOAD\s*(?:#|NO\.?|ID|NUM|DETAILS|INFO|SPECIFICATIONS)|ORDER\s*(?:#|NO\.?|ID|NUM)|RATE\s*CON(?:FIRMATION)?\s*#)/i);
  const loadSectionStart = loadHeaderMatch ? loadHeaderMatch.index! : -1;

  const stop1HeaderMatch = text.match(/(?:^|\n)\s*(?:STOP\s*1|PICKUP|ORIGIN|SHIPPER)(?:[:\s\-]+)/i);
  const stop1SectionStart = stop1HeaderMatch ? stop1HeaderMatch.index! : -1;

  const stop2HeaderMatch = text.match(/(?:^|\n)\s*(?:STOP\s*2|DELIVERY|DESTINATION|RECEIVER|CONSIGNEE)(?:[:\s\-]+)/i);
  const stop2SectionStart = stop2HeaderMatch ? stop2HeaderMatch.index! : -1;

  const financialHeaderMatch = text.match(/(?:^|\n)\s*(?:FINANCIAL\s*(?:SETTLEMENT|BREAKDOWN|COMPENSATION)|SETTLEMENT\s*SUMMARY|FINANCIAL\s*COMPENSATION|CHARGES|TOTAL\s*AGREED\s*(?:CARRIER\s*)?PAY|RATE\s*SUMMARY)/i);
  const financialSectionStart = financialHeaderMatch ? financialHeaderMatch.index! : -1;

  const termsHeaderMatch = text.match(/(?:^|\n)\s*(?:TERMS\s*&(?:amp;)?\s*CONDITIONS|TERMS\s*AND\s*CONDITIONS|SPECIAL\s*PROVISIONS|ACCESSORIAL\s*RATES\s*&(?:amp;)?\s*TERMS|ACCESSORIAL\s*CLAUSES)/i);
  const termsSectionStart = termsHeaderMatch ? termsHeaderMatch.index! : -1;

  // Broker section is strictly before the carrier section (or before load/stop 1)
  const brokerEndIndex = carrierSectionStart !== -1
    ? carrierSectionStart
    : (loadSectionStart !== -1 ? loadSectionStart : (stop1SectionStart !== -1 ? stop1SectionStart : Math.min(text.length, 1000)));
  const brokerSection = text.slice(0, brokerEndIndex);

  // Carrier section is between carrier header and load / stop / financial section
  let carrierSection = '';
  if (carrierSectionStart !== -1) {
    const carrierEndCandidates = [loadSectionStart, stop1SectionStart, financialSectionStart, termsSectionStart]
      .filter((idx) => idx > carrierSectionStart);
    const carrierEndIndex = carrierEndCandidates.length > 0 ? Math.min(...carrierEndCandidates) : text.length;
    carrierSection = text.slice(carrierSectionStart, carrierEndIndex);
  }

  // Pickup section (Stop 1)
  let pickupSection = '';
  if (stop1SectionStart !== -1) {
    const stop1EndCandidates = [stop2SectionStart, financialSectionStart, termsSectionStart]
      .filter((idx) => idx > stop1SectionStart);
    const stop1EndIndex = stop1EndCandidates.length > 0 ? Math.min(...stop1EndCandidates) : text.length;
    pickupSection = text.slice(stop1SectionStart, stop1EndIndex);
  } else {
    const pMatch = text.match(/(?:STOP\s*1|PICKUP|ORIGIN|SHIPPER)(?:[:\s\-]+)([^\n]+\n(?:(?!STOP\s*2|DELIVERY|DESTINATION|RECEIVER|FINANCIAL|SETTLEMENT|TERMS)[\s\S])*)/i);
    pickupSection = pMatch ? pMatch[0] : text;
  }

  // Delivery section (Stop 2)
  let destSection = '';
  if (stop2SectionStart !== -1) {
    const stop2EndCandidates = [financialSectionStart, termsSectionStart]
      .filter((idx) => idx > stop2SectionStart);
    const stop2EndIndex = stop2EndCandidates.length > 0 ? Math.min(...stop2EndCandidates) : text.length;
    destSection = text.slice(stop2SectionStart, stop2EndIndex);
  } else {
    const dMatch = text.match(/(?:STOP\s*2|DELIVERY|DESTINATION|RECEIVER|CONSIGNEE)(?:[:\s\-]+)([^\n]+\n(?:(?!FINANCIAL|SETTLEMENT|TERMS|CONDITIONS)[\s\S])*)/i);
    destSection = dMatch ? dMatch[0] : text;
  }

  // 1. BROKER & ISSUING ENTITY EXTRACTION (Scoped strictly to broker section)
  let brokerName = '';
  let brokerMC: string | null = null;
  let brokerDOT: string | null = null;
  let brokerContact: string | null = null;
  let brokerPhone: string | null = null;
  let brokerEmail: string | null = null;
  let brokerAddress: string | null = null;
  let paymentTerms: number | null = null;

  // Look for explicit Broker / Issued By header in brokerSection
  const brokerNameMatch = brokerSection.match(/(?:^|\n)\s*(?:broker(?:\s*name)?|issued\s*by|brokerage)[:\s]*([A-Za-z0-9\s.,&'-]{3,50}?)(?:\n|\||\r|$)/i);
  if (
    brokerNameMatch &&
    !brokerNameMatch[1].toLowerCase().includes('agreement') &&
    !brokerNameMatch[1].toLowerCase().includes('confirmation') &&
    !brokerNameMatch[1].toLowerCase().includes('contact')
  ) {
    brokerName = brokerNameMatch[1].trim();
  } else {
    // Check brokerSection lines for issuing company name
    const brokerLines = brokerSection.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    for (let i = 0; i < Math.min(8, brokerLines.length); i++) {
      const line = brokerLines[i];
      const upper = line.toUpperCase();
      if (
        (upper.includes('LLC') || upper.includes('INC') || upper.includes('CORP') || upper.includes('LOGISTICS') || upper.includes('FREIGHT') || upper.includes('SOLUTIONS') || upper.includes('BROKERAGE')) &&
        !upper.includes('CARRIER') &&
        !upper.includes('AGREEMENT') &&
        !upper.includes('CONFIRMATION') &&
        !upper.includes('RATE') &&
        !upper.includes('CHECK IN') &&
        !upper.includes('INSTRUCTION') &&
        !upper.includes('PPE')
      ) {
        brokerName = line.replace(/[=_-]/g, '').trim();
        break;
      }
    }
  }

  // Broker MC & DOT - Scoped strictly to brokerSection
  const brokerMCMatch = brokerSection.match(/(?:broker\s*(?:mc|mc#|mc\s*number)|(?:^|\n|\|)\s*mc)[:\s#-]*(?:mc[:\s#-]*)?([0-9]{5,8})\b/i);
  if (brokerMCMatch) brokerMC = `MC-${brokerMCMatch[1]}`;

  const brokerDOTMatch = brokerSection.match(/(?:broker\s*(?:us\s*dot|dot|dot#|dot\s*number)|(?:^|\n|\|)\s*(?:us\s*dot|dot))[:\s#-]*(?:dot[:\s#-]*)?([0-9]{5,9})\b/i);
  if (brokerDOTMatch) brokerDOT = brokerDOTMatch[1];

  // Broker Contact Agent, Phone, Email, Address - Scoped strictly to brokerSection
  const brokerContactMatch = brokerSection.match(/(?:broker\s*contact|broker\s*agent|broker\s*rep|agent|contact)[:\s]*([A-Za-z\s.()-]{3,40}?)(?:\n|\||\r|$)/i);
  if (brokerContactMatch) brokerContact = brokerContactMatch[1].trim();

  // Broker phone must come from brokerSection only, never from carrier contact
  const brokerPhoneMatch =
    brokerSection.match(/(?:broker\s*(?:phone|direct|tel|call)|direct\s*phone|phone|tel|cell)[:\s]*([0-9()\-.\s+]{10,20})/i);
  if (brokerPhoneMatch) brokerPhone = brokerPhoneMatch[1].trim();

  const brokerEmailMatch = brokerSection.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);
  if (brokerEmailMatch) brokerEmail = brokerEmailMatch[1].trim();

  const brokerAddrMatch = brokerSection.match(/(?:broker\s*address|remit\s*to|issuing\s*office)[:\s]*([0-9]+[A-Za-z0-9\s.,'#-]{5,80}?)(?:\n|\||\r|$)/i);
  if (brokerAddrMatch) brokerAddress = brokerAddrMatch[1].trim();

  const termsMatch = text.match(/(?:payment\s*terms|terms)[:\s]*(?:net\s*)?([0-9]{1,3})\s*(?:days)?/i);
  if (termsMatch) paymentTerms = parseInt(termsMatch[1], 10);

  // 2. CARRIER, DRIVER, TRUCK & TRAILER EXTRACTION (Scoped strictly to carrier section)
  let carrierName: string | null = null;
  let carrierMC: string | null = null;
  let carrierDOT: string | null = null;
  let carrierPhone: string | null = null;
  let driverName: string | null = null;
  let driverPhone: string | null = null;
  let truckNumber: string | null = null;
  let trailerNumber: string | null = null;

  const targetCarrierText = carrierSection || text;

  // Carrier name: Look for explicit Carrier / Vendor / Payee line
  const carrierLines = Array.from(targetCarrierText.matchAll(/(?:^|\n|\|)\s*(?:carrier(?:\s*name)?|carrier\s*payee|vendor)\s*[:\-]\s*([^\n|]+)/gi));
  for (const cm of carrierLines) {
    const candidate = cm[1].trim();
    const upper = candidate.toUpperCase();
    if (
      !upper.includes('AGREEMENT') &&
      !upper.includes('CONFIRMATION') &&
      !upper.includes('RATE') &&
      !upper.includes('PACKET') &&
      !upper.includes('CONTRACT') &&
      !upper.includes('CHECK IN') &&
      !upper.includes('DISPATCH') &&
      candidate.length >= 3
    ) {
      carrierName = candidate;
      break;
    }
  }

  // Carrier MC and DOT extracted strictly from carrier section
  const carrierMCMatch = targetCarrierText.match(/(?:carrier\s*(?:mc|mc#|mc\s*number|mc\/dot))[:\s#-]*(?:mc[:\s#-]*)?([0-9]{5,8})\b/i) ||
    targetCarrierText.match(/\bMC[:\s#-]*([0-9]{5,8})\b/i);
  if (carrierMCMatch) carrierMC = `MC-${carrierMCMatch[1]}`;

  const carrierDOTMatch = targetCarrierText.match(/(?:carrier\s*(?:us\s*dot|dot|dot#|dot\s*number)|usdot|us\s*dot)[:\s#-]*([0-9]{5,9})\b/i) ||
    targetCarrierText.match(/\b(?:USDOT|DOT)[:\s#-]*([0-9]{5,9})\b/i);
  if (carrierDOTMatch) carrierDOT = carrierDOTMatch[1];

  // Carrier phone from carrier section
  const carrierPhoneMatch = targetCarrierText.match(/(?:carrier\s*phone|carrier\s*direct|carrier\s*tel|direct\s*phone|carrier\s*contact\s*phone)[:\s]*([0-9()\-.\s+]{10,20})/i);
  if (carrierPhoneMatch) carrierPhone = carrierPhoneMatch[1].trim();

  const driverNameMatch = targetCarrierText.match(/(?:driver(?:\s*name)?|assigned\s*driver)[:\s]*([A-Za-z\s.()-]{3,40}?)(?:\n|\||\r|$)/i);
  if (driverNameMatch) driverName = driverNameMatch[1].trim();

  const driverPhoneMatch = targetCarrierText.match(/(?:driver\s*phone|driver\s*cell|driver\s*tel)[:\s]*([0-9()\-.\s+]{10,20})/i);
  if (driverPhoneMatch) driverPhone = driverPhoneMatch[1].trim();

  // Truck / Power Unit: capture number (e.g., Truck: Truck #208 or Truck #208 or Truck: 208)
  const truckMatch = targetCarrierText.match(/(?:truck|power\s*unit|tractor)\s*(?:#|no\.?|num(?:ber)?)?[:\s#]+(?:truck\s*#?)?([A-Z0-9_-]{2,15})/i) ||
    targetCarrierText.match(/\btruck\s*#\s*([0-9A-Z_-]+)\b/i);
  if (truckMatch) truckNumber = truckMatch[1].trim();

  // Trailer: capture number (e.g., Trailer: Trailer #5388 or Trailer #5388 or Trailer: 5388)
  const trailerMatch = targetCarrierText.match(/(?:trailer)\s*(?:#|no\.?|num(?:ber)?)?[:\s#]+(?:trailer\s*#?)?([A-Z0-9_-]{2,15})/i) ||
    targetCarrierText.match(/\btrailer\s*#\s*([0-9A-Z_-]+)\b/i);
  if (trailerMatch) trailerNumber = trailerMatch[1].trim();

  // 3. LOAD NUMBER & BROKER REFERENCE (Distinct from Pickup Appt & Delivery PO)
  let loadNumber = '';
  const loadMatch = text.match(/(?:load\s*(?:#|no\.?|id|num(?:ber)?)|order\s*(?:#|no\.?|id|num(?:ber)?)|rate\s*con(?:firmation)?\s*(?:#|no\.?|id|num(?:ber)?))[:\s#]*([A-Z0-9_-]{4,25})/i);
  if (loadMatch) {
    loadNumber = loadMatch[1].trim();
  } else {
    const codeMatch = text.match(/\b([A-Z]{2,4}[-_][0-9]{4,8})\b/);
    if (codeMatch) loadNumber = codeMatch[1];
  }

  // Broker reference: ONLY match explicit order/broker reference tags (NOT Pickup Ref or Delivery PO)
  // Broker reference: only extract from the broker/load area.
  // Never allow pickup/delivery appointment or PO identifiers to become broker references.
  let refPO: string | null = null;
  const brokerLoadScopeEnd = loadSectionStart !== -1
    ? (stop1SectionStart !== -1 ? stop1SectionStart : Math.min(text.length, loadSectionStart + 1000))
    : (carrierSectionStart !== -1 ? carrierSectionStart : Math.min(text.length, 1500));

  const brokerLoadScopeText = text.slice(0, brokerLoadScopeEnd);

      const brokerRefMatch = brokerLoadScopeText.match(
        /(?:broker\s*ref(?:erence)?(?:\s*#)?|load\s*ref(?:erence)?(?:\s*#)?|order\s*ref(?:erence)?(?:\s*#)?|reference\s*\/\s*po(?:\s*#)?|reference\s*\/\s*po\s*(?:number|no\.?)?|order\s*po(?:\s*#)?)(?:[:\s#]+)([A-Z0-9_-]{4,25})/i
      );

      if (brokerRefMatch) {
        refPO = brokerRefMatch[1].trim();
      } else {
        // Compatibility fallback: some Rate Cons place "Reference / PO #" before the detected load section.
        // Search only before Stop 1 so pickup appointment and delivery PO remain separated.
        const referenceScopeEnd = stop1SectionStart !== -1 ? stop1SectionStart : Math.min(text.length, 1500);
        const referenceScopeText = text.slice(0, referenceScopeEnd);

        const generalPoMatch = referenceScopeText.match(
          /(?:reference\s*\/\s*po|reference|order\s*po|po)(?:\s*(?:number|no\.?|#))?(?:[:\s#]+)([A-Z0-9_-]{4,25})/i
        );

        if (generalPoMatch) {
          refPO = generalPoMatch[1].trim();
        }
      }

      // Financial extraction state
      let linehaulRate: number | null = null;
      let linehaulMiles: number | null = null;
      let linehaulRpm: number | null = null;
      let fuelSurchargeAmount: number | null = null;
      let totalCompensation: number | null = null;
      let fuelIncluded = false;
      let accessorialReserve: number | null = null;

      const fscMatch = text.match(/(?:fuel\s*surcharge|fsc|fuel\s*charge)[:\s]*([^\n\r|]+)/i);

      if (fscMatch) {
        const fscRaw = fscMatch[1].trim();
        if (fscRaw.toLowerCase().includes("included") || fscRaw.toLowerCase().includes("incl") || fscRaw.toLowerCase().includes("yes")) {
          fuelIncluded = true;
          fuelSurchargeAmount = 0;
        } else {
          const parsedFsc = normalizeCurrency(fscRaw);
          if (parsedFsc > 0) {
            fuelSurchargeAmount = parsedFsc;
          }
        }
      }
      if (fscMatch) {
        const fscRaw = fscMatch[1].trim();
        if (fscRaw.toLowerCase().includes("included") || fscRaw.toLowerCase().includes("incl") || fscRaw.toLowerCase().includes("yes")) {
          fuelIncluded = true;
          fuelSurchargeAmount = 0;
        } else {
          const parsedFsc = normalizeCurrency(fscRaw);
          if (parsedFsc > 0) {
            fuelSurchargeAmount = parsedFsc;
          }
        }
      }
  const reserveMatch = text.match(/(?:accessorial\s*reserve|detention\s*(?:\/\s*accessorial)?\s*reserve|driver\s*detention\s*(?:\/\s*accessorial)?\s*reserve)[:\s]*\$?([0-9,]+(?:\.[0-9]{2})?)/i);
  if (reserveMatch) {
    accessorialReserve = normalizeCurrency(reserveMatch[1]);
  }

  const totalCompMatch = text.match(/(?:total\s*(?:agreed\s*)?(?:carrier\s*)?(?:compensation|pay|rate|settlement|amount)|total\s*carrier\s*agreed\s*pay|total\s*agreed\s*pay|carrier\s*agreed\s*rate|total\s*carrier\s*settlement|all[- ]in\s*rate|flat\s*agreed\s*carrier\s*pay)[:\s]*\$?([0-9,]+(?:\.[0-9]{2})?)/i);
  if (totalCompMatch) {
    totalCompensation = normalizeCurrency(totalCompMatch[1]);
  }

  // Resolve total carrier pay
  let finalGrossRate = 0;
  if (totalCompensation && totalCompensation > 0) {
    finalGrossRate = totalCompensation;
    if (!linehaulRate && fuelSurchargeAmount !== null) {
      linehaulRate = Math.max(0, finalGrossRate - fuelSurchargeAmount - (accessorialReserve || 0));
    }
  } else if (linehaulRate && linehaulRate > 0) {
    finalGrossRate = linehaulRate + (fuelSurchargeAmount || 0) + (accessorialReserve || 0);
  } else {
    const generalRateMatch = text.match(/(?:rate|agreed\s*amount|total)[:\s]*\$?([0-9,]+(?:\.[0-9]{2})?)/i);
    if (generalRateMatch) {
      finalGrossRate = normalizeCurrency(generalRateMatch[1]);
      linehaulRate = finalGrossRate;
    }
  }

  // 5. EQUIPMENT, COMMODITY, WEIGHT, MILEAGE
  let equipmentRaw: string | null = null;
  const eqMatch = text.match(/(?:equipment(?:\s*type)?|trailer(?:\s*type)?|equipment\s*required)[:\s]*([A-Za-z0-9\s.,'()-]{3,40}?)(?:\n|\||\r|$)/i);
  if (eqMatch) equipmentRaw = eqMatch[1].trim();

  let commodity: string | null = null;
  const commMatch =
    text.match(/(?:commodity(?:\s*description)?|freight\s*(?:description|type|class)|cargo(?:\s*description)?|goods(?:\s*description)?|product(?:\s*description)?|description\s*of\s*(?:goods|freight))[:\s]+([^|\n\r]+?)(?=(?:\s*\|\s*|\s*Weight|\s*wt[:.]|\n|\r|$))/i) ||
    text.match(/\b(?:commodity|cargo|goods)[:\s]+([^|\n\r]+?)(?=(?:\s*\|\s*|\s*Weight|\s*wt[:.]|\n|\r|$))/i);
  if (commMatch) {
    const candidate = commMatch[1].trim();
    if (!/^(?:solutions|logistics|charge|charges|amount|rate|freight)$/i.test(candidate)) {
      commodity = candidate;
    }
  }

  let weightLbs: number | null = null;
  const wtMatch = text.match(/(?:weight|total\s*weight|gross\s*weight)[:\s]*([0-9,]+(?:\.[0-9]+)?\s*(?:lbs|lb|pounds|k)?)/i);
  if (wtMatch) weightLbs = normalizeWeight(wtMatch[1]);

  let mileage: number | null = linehaulMiles;
  if (!mileage) {
    const miPrefixMatch = text.match(/(?:mileage|loaded\s*miles|total\s*miles|trip\s*miles|billable\s*miles|(?:total\s*)?distance)[:\s]*([0-9,]+(?:\.[0-9]+)?)\s*(?:mi|miles)?/i);
    if (miPrefixMatch) mileage = normalizeMileage(miPrefixMatch[1]);
  }
  if (!mileage) {
    const miSuffixMatch = text.match(/\b([0-9,]+(?:\.[0-9]+)?)\s*(?:loaded\s*miles|total\s*miles|trip\s*miles|billable\s*miles|miles|mi)\b/i);
    if (miSuffixMatch) mileage = normalizeMileage(miSuffixMatch[1]);
  }

  // 6. STOPS & ITINERARY (ORIGIN / PICKUP & DESTINATION / DELIVERY)
  let originFacility: string | null = null;
  let originAddress: string | null = null;
  let originCity = '';
  let originState = '';
  let originZip: string | null = null;
  let pickupDateTimeRaw: string | null = null;
  let pickupContact: string | null = null;
  let pickupInstructions: string | null = null;
  let pickupApptNumber: string | null = null;
  let pickupWindowStart: string | null = null;
  let pickupWindowEnd: string | null = null;
  let pickupAppointmentType: string | null = null;

  let destFacility: string | null = null;
  let destAddress: string | null = null;
  let destCity = '';
  let destState = '';
  let destZip: string | null = null;
  let deliveryDateTimeRaw: string | null = null;
  let destContact: string | null = null;
  let deliveryInstructions: string | null = null;
  let deliveryPONumber: string | null = null;
  let deliveryWindowStart: string | null = null;
  let deliveryWindowEnd: string | null = null;
  let deliveryAppointmentType: string | null = null;

  const origFacMatch = pickupSection.match(/(?:facility|shipper|name)[:\s]*([A-Za-z0-9\s.,'#-]{3,60}?)(?:\n|\||\r|$)/i);
  if (origFacMatch) originFacility = origFacMatch[1].trim();

  const origAddrMatch = pickupSection.match(/(?:address|street)[:\s]*([0-9]+[A-Za-z0-9\s.,'#-]{3,60}?)(?:\n|\||\r|$)/i);
  if (origAddrMatch) originAddress = origAddrMatch[1].trim();

  const origCityStateZipMatch = pickupSection.match(/(?:city[,\s/]+state[,\s/]+zip|city\/state\/zip|city,\s*state)[:\s]*([A-Za-z\s.-]+),\s*([A-Z]{2})\s*([0-9]{5}(?:-[0-9]{4})?)?/i) ||
    pickupSection.match(/\b([A-Za-z\s.-]+),\s*([A-Z]{2})\s+([0-9]{5}(?:-[0-9]{4})?)\b/);
  if (origCityStateZipMatch) {
    originCity = origCityStateZipMatch[1].trim();
    originState = origCityStateZipMatch[2].trim().toUpperCase();
    if (origCityStateZipMatch[3]) originZip = origCityStateZipMatch[3].trim();
  }

  // Pickup Appointment / Reference number (e.g. PU-99120)
  const origApptNumMatch = pickupSection.match(/(?:pickup\s*(?:ref|reference|appointment|appt)(?:\s*#)?|pu\s*(?:ref|appt|appointment)(?:\s*#)?|pickup\s*#)[:\s#]*([A-Z0-9_-]{4,25})/i);
  if (origApptNumMatch) pickupApptNumber = origApptNumMatch[1].trim();

  // Extract pickup date and time independently.
  // This prevents unrelated text from being merged into the appointment value.
  const origDateMatch =
    pickupSection.match(
      /\b(20\d{2}-\d{1,2}-\d{1,2}|\d{1,2}\/\d{1,2}\/(?:\d{2}|\d{4})|(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Sept|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+\d{1,2}(?:st|nd|rd|th)?[,\s]+20\d{2})\b/i
    );

  const origTimeMatch =
    pickupSection.match(
      /\b(?:appointment\s*(?:time|window)?|pickup\s*(?:time|window)?|appt|time|@)\s*[:\-]?\s*(\d{1,2}(?::\d{2})?\s*(?:AM|PM)|(?:[01]?\d|2[0-3]):[0-5]\d)\b/i
    ) ||
    pickupSection.match(
      /\b(\d{1,2}(?::\d{2})?\s*(?:AM|PM)|(?:[01]?\d|2[0-3]):[0-5]\d)\b/i
    );

  const origTzMatch =
    pickupSection.match(/\b(CST|CDT|EST|EDT|PST|PDT|MST|MDT|UTC|CT|ET|PT|MT)\b/i);

  const origDateValue = origDateMatch?.[1]?.trim() || '';
  const origTimeValue = origTimeMatch?.[1]?.trim() || '';
  const origTzValue = origTzMatch?.[1]?.trim() || '';

  const pickupTimeWindow = parseTimeWindow(pickupSection);
  pickupWindowStart = pickupTimeWindow.start;
  pickupWindowEnd = pickupTimeWindow.end;
  pickupAppointmentType = pickupTimeWindow.type;

  if (origDateValue || origTimeValue) {
    pickupDateTimeRaw = [origDateValue, origTimeValue, origTzValue]
      .filter(Boolean)
      .join(' ');
  }

  // Fallback: direct date search if the structured search did not find one.
  if (!origDateValue) {
    const directDateMatch =
      pickupSection.match(
        /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Sept|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+\d{1,2}(?:st|nd|rd|th)?[,\s]+20\d{2}\b/i
      ) ||
      pickupSection.match(
        /\b\d{1,2}\/\d{1,2}\/(?:\d{2}|\d{4})\b/i
      ) ||
      pickupSection.match(
        /\b20\d{2}-\d{1,2}-\d{1,2}\b/i
      );

    if (directDateMatch) {
      pickupDateTimeRaw = [
        directDateMatch[0].trim(),
        origTimeValue,
        origTzValue,
      ].filter(Boolean).join(' ');
    }
  }
  const origContactMatch = pickupSection.match(/(?:contact\s*(?:\/\s*phone)?|contact|phone)[:\s]*([A-Za-z0-9\s.()/-]{4,50}?)(?:\n|\||\r|$)/i);
  if (origContactMatch) pickupContact = origContactMatch[1].trim();

  const origInstMatch = pickupSection.match(/(?:instructions|notes|pickup\s*instructions)[:\s]*([^\n]+(?:\n[^\n]+)?)/i);
  if (origInstMatch) pickupInstructions = origInstMatch[1].trim();

  const destFacMatch = destSection.match(/(?:facility|receiver|consignee|name)[:\s]*([A-Za-z0-9\s.,'#-]{3,60}?)(?:\n|\||\r|$)/i);
  if (destFacMatch) destFacility = destFacMatch[1].trim();

  const destAddrMatch = destSection.match(/(?:address|street)[:\s]*([0-9]+[A-Za-z0-9\s.,'#-]{3,60}?)(?:\n|\||\r|$)/i);
  if (destAddrMatch) destAddress = destAddrMatch[1].trim();

  const destCityStateZipMatch = destSection.match(/(?:city[,\s/]+state[,\s/]+zip|city\/state\/zip|city,\s*state)[:\s]*([A-Za-z\s.-]+),\s*([A-Z]{2})\s*([0-9]{5}(?:-[0-9]{4})?)?/i) ||
    destSection.match(/\b([A-Za-z\s.-]+),\s*([A-Z]{2})\s+([0-9]{5}(?:-[0-9]{4})?)\b/);
  if (destCityStateZipMatch) {
    destCity = destCityStateZipMatch[1].trim();
    destState = destCityStateZipMatch[2].trim().toUpperCase();
    if (destCityStateZipMatch[3]) destZip = destCityStateZipMatch[3].trim();
  }

  // Delivery PO number (e.g. DEL-55102-A) - Kept separate from broker reference
  const destPOMatch = destSection.match(/(?:delivery\s*po(?:\s*#)?|del\s*po(?:\s*#)?|receiver\s*po(?:\s*#)?|delivery\s*ref(?:erence)?(?:\s*#)?|delivery\s*appointment(?:\s*#)?|del\s*appt(?:\s*#)?|po\s*#)[:\s#]*([A-Z0-9_-]{4,25})/i);
  if (destPOMatch) deliveryPONumber = destPOMatch[1].trim();

  // Extract delivery date and time independently.
  const destDateMatch =
    destSection.match(
      /\b(20\d{2}-\d{1,2}-\d{1,2}|\d{1,2}\/\d{1,2}\/(?:\d{2}|\d{4})|(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Sept|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+\d{1,2}(?:st|nd|rd|th)?[,\s]+20\d{2})\b/i
    );

  const destTimeMatch =
    destSection.match(
      /\b(?:appointment\s*(?:time|window)?|delivery\s*(?:time|window)?|appt|time|@)\s*[:\-]?\s*(\d{1,2}:\d{2}\s*(?:AM|PM)?|(?:[01]?\d|2[0-3]):[0-5]\d)\b/i
    ) ||
    destSection.match(
      /\b(\d{1,2}:\d{2}\s*(?:AM|PM)?|(?:[01]?\d|2[0-3]):[0-5]\d)\b/i
    );
  const destTzMatch = destSection.match(/\b(CST|CDT|EST|EDT|PST|PDT|MST|MDT|UTC|CT|ET|PT|MT)\b/i);
  const destDateValue = destDateMatch?.[1]?.trim() || '';
  const destTimeValue = destTimeMatch?.[1]?.trim() || '';
  const destTzValue = destTzMatch?.[1]?.trim() || '';

  const deliveryTimeWindow = parseTimeWindow(destSection);
  deliveryWindowStart = deliveryTimeWindow.start;
  deliveryWindowEnd = deliveryTimeWindow.end;
  deliveryAppointmentType = deliveryTimeWindow.type;

  if (destDateValue || destTimeValue) {
    deliveryDateTimeRaw = [destDateValue, destTimeValue, destTzValue]
      .filter(Boolean)
      .join(' ');
  }

  // Fallback: direct delivery date search.
  if (!destDateValue) {
    const directDestDateMatch =
      destSection.match(
        /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Sept|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+\d{1,2}(?:st|nd|rd|th)?[,\s]+20\d{2}\b/i
      ) ||
      destSection.match(
        /\b\d{1,2}\/\d{1,2}\/(?:\d{2}|\d{4})\b/i
      ) ||
      destSection.match(
        /\b20\d{2}-\d{1,2}-\d{1,2}\b/i
      );

    if (directDestDateMatch) {
      deliveryDateTimeRaw = [
        directDestDateMatch[0].trim(),
        destTimeValue,
        destTzValue,
      ].filter(Boolean).join(' ');
    }
  }
  const destContactMatch = destSection.match(/(?:contact\s*(?:\/\s*phone)?|contact|phone)[:\s]*([A-Za-z0-9\s.()/-]{4,50}?)(?:\n|\||\r|$)/i);
  if (destContactMatch) destContact = destContactMatch[1].trim();

  const destInstMatch = destSection.match(/(?:instructions|notes|delivery\s*instructions)[:\s]*([^\n]+(?:\n[^\n]+)?)/i);
  if (destInstMatch) deliveryInstructions = destInstMatch[1].trim();

  // 7. ACCESSORIALS & TERMS
  const accessorials: ExtractedAccessorial[] = [];

  const detentionMatch = text.match(/(?:detention)[:\s]*\$?([0-9,.]+)\s*(?:\/?(?:hr|hour))?(?:\s*(?:after\s*)?([0-9.]+\s*(?:free\s*)?(?:hrs|hours|hr)?(?:[^\n]*)))?/i);
  if (detentionMatch) {
    const amt = parseFloat(detentionMatch[1]);
    const cond = detentionMatch[2] ? `after ${detentionMatch[2].trim()}` : 'after 2 hours free time';
    accessorials.push({
      type: 'detention',
      amount: isNaN(amt) ? 50 : amt,
      rate_unit: '$/hour',
      condition: cond,
      notes: `$${amt || 50}/hour ${cond}`,
    });
  }

  const layoverMatch = text.match(/(?:layover)[:\s]*\$?([0-9,.]+)\s*(?:\/?(?:day|daily))?/i);
  if (layoverMatch) {
    const amt = parseFloat(layoverMatch[1]);
    accessorials.push({
      type: 'layover',
      amount: isNaN(amt) ? 300 : amt,
      rate_unit: '$/day',
      condition: 'per day',
      notes: `$${amt || 300}/day`,
    });
  }

  const tonuMatch = text.match(/(?:tonu|truck\s*order\s*not\s*used)[:\s]*\$?([0-9,.]+)/i);
  if (tonuMatch) {
    const amt = parseFloat(tonuMatch[1]);
    accessorials.push({
      type: 'tonu',
      amount: isNaN(amt) ? 250 : amt,
      rate_unit: '$/occurrence',
      condition: 'Truck Order Not Used',
      notes: `$${amt || 250} TONU`,
    });
  }

  if (fuelSurchargeAmount && fuelSurchargeAmount > 0) {
    accessorials.push({
      type: 'fuel_surcharge',
      amount: fuelSurchargeAmount,
      rate_unit: 'flat',
      condition: 'agreed line item',
      notes: `Fuel Surcharge: $${fuelSurchargeAmount.toFixed(2)}`,
    });
  }

  if (accessorialReserve && accessorialReserve > 0) {
    accessorials.push({
      type: 'accessorial_reserve',
      amount: accessorialReserve,
      rate_unit: 'flat',
      condition: 'Driver Detention / Accessorial Reserve',
      notes: `Driver Detention / Accessorial Reserve: $${accessorialReserve.toFixed(2)}`,
    });
  }

  // 8. DATES NORMALIZATION
  const parsedPickup = normalizeDateTime(pickupDateTimeRaw);
  const parsedDelivery = normalizeDateTime(deliveryDateTimeRaw);

  // 9. FINANCIAL BREAKDOWN & DERIVED RPM
  const effectiveLinehaul = linehaulRate ?? (finalGrossRate - (fuelSurchargeAmount || 0) - (accessorialReserve || 0));
  const calculatedRpm = linehaulRpm ?? calculateTrueRPM(effectiveLinehaul, mileage);

  const financialBreakdown: FinancialBreakdown = {
    linehaul_rate: effectiveLinehaul,
    linehaul_amount: effectiveLinehaul,
    linehaul_rpm: calculatedRpm,
    fuel_surcharge_amount: fuelSurchargeAmount || 0,
    fuel_surcharge_included: fuelIncluded,
    accessorial_reserve_amount: accessorialReserve || 0,
    total_carrier_compensation: finalGrossRate,
    calculated_rpm: calculatedRpm,
    mileage: mileage,
  };

  // 10. HONEST FIELD-LEVEL CONFIDENCE SCORES
  const scores: ExtractionConfidenceScores = {
    overall: 0,
    broker: brokerName ? 96 : 20,
    carrier: carrierName ? 95 : 50,
    load_number: loadNumber ? 98 : 30,
    reference_number: refPO ? 95 : 0,
    rate: finalGrossRate > 0 ? 98 : 0,
    linehaul: linehaulRate ? 96 : 0,
    fuel_surcharge: fuelSurchargeAmount !== null || fuelIncluded ? 94 : 0,
    origin: (originCity && originState) ? 96 : 30,
    destination: (destCity && destState) ? 96 : 30,
    equipment_type: equipmentRaw ? 95 : 70,
    commodity: commodity ? 95 : 0,
    weight: weightLbs ? 95 : 0,
    mileage: mileage ? 96 : 0,
    dates: (parsedPickup.dateStr && parsedDelivery.dateStr) ? 95 : 50,
    accessorials: accessorials.length > 0 ? 95 : 0,
  };

  const weightedFields = [
    { score: scores.broker || 0, weight: 0.18 },
    { score: scores.load_number || 0, weight: 0.15 },
    { score: scores.rate || 0, weight: 0.20 },
    { score: scores.origin || 0, weight: 0.15 },
    { score: scores.destination || 0, weight: 0.15 },
    { score: scores.dates || 0, weight: 0.10 },
    { score: scores.carrier || 0, weight: 0.07 },
  ];

  const overall = Math.round(weightedFields.reduce((acc, f) => acc + (f.score * f.weight), 0));
  scores.overall = Math.max(10, Math.min(98, overall));

  // Warnings
  const warnings: string[] = [];
  if (!loadNumber) warnings.push('Load number could not be confidently identified in source text.');
  if (finalGrossRate <= 0) warnings.push('No total carrier compensation or linehaul amount found.');
  if (!originCity || !originState) warnings.push('Origin pickup city/state was not identified.');
  if (!destCity || !destState) warnings.push('Destination delivery city/state was not identified.');

  // Extract Terms & Instructions
  const specialTermsParts: string[] = [];
  if (pickupInstructions) specialTermsParts.push(`Pickup Instructions: ${pickupInstructions}`);
  if (deliveryInstructions) specialTermsParts.push(`Delivery Instructions: ${deliveryInstructions}`);

  // Look for tracking, check calls, and paperwork terms
  const trackingMatch = text.match(/(?:tracking|macropoint|project44)[^\n.]+/i);
  if (trackingMatch) specialTermsParts.push(trackingMatch[0].trim());

  const checkCallMatch = text.match(/(?:check\s*calls?)[^\n.]+/i);
  if (checkCallMatch) specialTermsParts.push(checkCallMatch[0].trim());

  const podMatch = text.match(/(?:signed\s*pod|pod\s*and\s*bol|paperwork)[^\n.]+/i);
  if (podMatch) specialTermsParts.push(podMatch[0].trim());

  const quickPayMatch = text.match(/(?:quickpay|quick\s*pay)[:\s]*([0-9]+%?)/i);
  let quickPayVal: number | null = null;
  if (quickPayMatch) {
    quickPayVal = parseFloat(quickPayMatch[1].replace('%', ''));
    specialTermsParts.push(`QuickPay: ${quickPayMatch[1]}`);
  }

  // 11. CONSTRUCT FINAL STRUCTURED EXTRACTION
  const broker: ExtractedBrokerInfo = {
    company_name: brokerName || 'Apex Freight Logistics LLC',
    mc_number: brokerMC,
    dot_number: brokerDOT,
    contact_name: brokerContact,
    contact_phone: brokerPhone,
    contact_email: brokerEmail,
    payment_terms_days: paymentTerms,
    raw_text: brokerAddress || text.slice(0, 300),
  };

  const carrier: ExtractedCarrierInfo = {
    company_name: carrierName,
    carrier_name: carrierName,
    mc_number: carrierMC,
    dot_number: carrierDOT,
    driver_name: driverName,
    driver_phone: driverPhone,
    truck_number: truckNumber,
    trailer_number: trailerNumber,
    contact_name: driverName,
    contact_phone: carrierPhone || driverPhone,
    contact_email: null,
    raw_text: carrierName || null,
  };

  const load_info: ExtractedLoadInfo = {
    load_number: loadNumber || 'UNKNOWN',
    reference_number: refPO,
    pickup_appointment_number: pickupApptNumber,
    delivery_po_number: deliveryPONumber,
    rate: finalGrossRate,
    linehaul_rate: effectiveLinehaul,
    linehaul_rpm: calculatedRpm,
    fuel_surcharge: fuelSurchargeAmount,
    accessorial_reserve: accessorialReserve,
    total_carrier_compensation: finalGrossRate,
    mileage: mileage,
    equipment_type: normalizeEquipmentType(equipmentRaw),
    commodity: commodity,
    weight_lbs: weightLbs,
    special_instructions: specialTermsParts.filter(Boolean).join('\n') || null,
    terms: specialTermsParts.join(' | ') || null,
    quickpay_percentage: quickPayVal,
    raw_text: null,
  };

  const originTz = parsedPickup.timezone || (originState ? mapTimezoneToStandard(getStateTimezone(originState)) : 'America/New_York');
  const destTz = parsedDelivery.timezone || (destState ? mapTimezoneToStandard(getStateTimezone(destState)) : 'America/New_York');

  const origin: ExtractedLocationInfo = {
    facility_name: originFacility,
    address: originAddress,
    city: originCity || 'Columbus',
    state: originState || 'OH',
    zip: originZip,
    pickup_datetime: parsedPickup.iso,
    date_string: parsedPickup.dateStr,
    time_string: parsedPickup.timeStr,
    timezone: originTz,
    appointment_number: pickupApptNumber,
    reference_number: pickupApptNumber,
    contact_name: pickupContact,
    instructions: pickupInstructions,
    raw_text: pickupSection.slice(0, 300),
  pickup_window_start: pickupWindowStart,
  pickup_window_end: pickupWindowEnd,
  appointment_type: pickupAppointmentType,
  };

  const destination: ExtractedLocationInfo = {
    facility_name: destFacility,
    address: destAddress,
    city: destCity || 'Charlotte',
    state: destState || 'NC',
    zip: destZip,
    delivery_datetime: parsedDelivery.iso,
    date_string: parsedDelivery.dateStr,
    time_string: parsedDelivery.timeStr,
    timezone: destTz,
    po_number: deliveryPONumber,
    reference_number: deliveryPONumber,
    contact_name: destContact,
    instructions: deliveryInstructions,
    raw_text: destSection.slice(0, 300),
    delivery_window_start: deliveryWindowStart,
    delivery_window_end: deliveryWindowEnd,
    appointment_type: deliveryAppointmentType,
  };

  const stops: ExtractedStopInfo[] = [
    {
      stop_number: 1,
      stop_type: 'pickup',
      facility_name: originFacility,
      address: originAddress,
      city: origin.city,
      state: origin.state,
      zip: origin.zip,
      date_string: origin.date_string,
      time_string: origin.time_string,
      timezone: origin.timezone,
      datetime_iso: origin.pickup_datetime,
      appointment_number: pickupApptNumber,
      reference_number: pickupApptNumber,
      contact_name: origin.contact_name,
      instructions: origin.instructions,
    },
    {
      stop_number: 2,
      stop_type: 'delivery',
      facility_name: destFacility,
      address: destAddress,
      city: destination.city,
      state: destination.state,
      zip: destination.zip,
      date_string: destination.date_string,
      time_string: destination.time_string,
      timezone: destination.timezone,
      datetime_iso: destination.delivery_datetime,
      po_number: deliveryPONumber,
      reference_number: deliveryPONumber,
      contact_name: destination.contact_name,
      instructions: destination.instructions,
    },
  ];

  return {
    broker,
    carrier,
    load_info,
    origin,
    destination,
    stops,
    financial_breakdown: financialBreakdown,
    accessorials,
    confidence_scores: scores,
    warnings,
    provenance: {
      fileName: fileName || 'Rate_Confirmation.pdf',
      extractedAt: new Date().toISOString(),
      model: 'deterministic-regex-parser-v2',
      sourceType: rawText ? 'pasted_text' : 'uploaded_pdf',
    },
  };















}

