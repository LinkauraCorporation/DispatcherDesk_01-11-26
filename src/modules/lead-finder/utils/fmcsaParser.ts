import { FmcsaFilterConfig, FmcsaLead } from '../types/fmcsa';
import { isLeadWithinDateRange } from './dateUtils';

export interface ColumnIndexMap {
  statusCode: number;
  dotNumber: number;
  phone: number;
  companyOfficer1: number;
  carrierOperation: number;
  truckUnits: number;
  powerUnits: number;
  totalDrivers: number;
  legalName: number;
  dbaName: number;
  phyCity: number;
  phyState: number;
  phyZip: number;
  emailAddress: number;
  docket1Prefix: number;
  docket1: number;
  interstateBeyond100: number;
  interstateWithin100: number;
  docket1StatusCode: number;
  recordDate: number;
  recordDateFieldName: string;
}

/**
 * Normalizes header string for fuzzy matching (uppercase, alphanumeric only)
 */
function normalizeHeaderName(name: string): string {
  return (name || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Builds an index map from the header row
 */
export function buildColumnIndexMap(headerRow: string[]): ColumnIndexMap {
  const normMap = new Map<string, number>();
  
  headerRow.forEach((col, idx) => {
    const norm = normalizeHeaderName(col);
    if (!normMap.has(norm)) {
      normMap.set(norm, idx);
    }
  });

  const findIdx = (possibleNames: string[]): number => {
    for (const name of possibleNames) {
      const norm = normalizeHeaderName(name);
      if (normMap.has(norm)) {
        return normMap.get(norm)!;
      }
    }
    return -1;
  };

  const findIdxWithMatch = (possibleNames: string[]): { idx: number; name: string } => {
    for (const name of possibleNames) {
      const norm = normalizeHeaderName(name);
      if (normMap.has(norm)) {
        return { idx: normMap.get(norm)!, name };
      }
    }
    return { idx: -1, name: '' };
  };

  const dateMatch = findIdxWithMatch([
    'AUTH_GRANT_DATE',
    'GRANT_DATE',
    'DOCKET1_GRANT_DATE',
    'ADD_DATE',
    'ADD_DT',
    'RECORD_DATE',
    'REGISTRATION_DATE',
    'MCS150_DATE',
  ]);

  return {
    statusCode: findIdx(['STATUS_CODE', 'STATUS', 'CARRIER_STATUS']),
    dotNumber: findIdx(['DOT_NUMBER', 'DOT_NO', 'USDOT', 'DOT']),
    phone: findIdx(['PHONE', 'TELEPHONE', 'TEL_NO', 'PHONE_NUMBER']),
    companyOfficer1: findIdx(['COMPANY_OFFICER_1', 'OFFICER_1', 'OFFICER', 'CONTACT']),
    carrierOperation: findIdx(['CARRIER_OPERATION', 'CARRIER_OP', 'OPERATION_CODE', 'CARRIER_OPERATION_CODE']),
    truckUnits: findIdx(['TRUCK_UNITS', 'TRUCKS', 'TOTAL_TRUCKS', 'NBR_TRUCKS']),
    powerUnits: findIdx(['POWER_UNITS', 'POWER_UNIT', 'NBR_POWER_UNIT']),
    totalDrivers: findIdx(['TOTAL_DRIVERS', 'DRIVERS', 'NBR_DRIVERS']),
    legalName: findIdx(['LEGAL_NAME', 'NAME', 'COMPANY_NAME']),
    dbaName: findIdx(['DBA_NAME', 'DBA']),
    phyCity: findIdx(['PHY_CITY', 'CITY', 'PHYSICAL_CITY']),
    phyState: findIdx(['PHY_STATE', 'STATE', 'PHYSICAL_STATE']),
    phyZip: findIdx(['PHY_ZIP', 'ZIP', 'PHYSICAL_ZIP', 'POSTAL_CODE']),
    emailAddress: findIdx(['EMAIL_ADDRESS', 'EMAIL', 'EMAIL_ADDR']),
    docket1Prefix: findIdx(['DOCKET1PREFIX', 'DOCKET_PREFIX', 'PREFIX']),
    docket1: findIdx(['DOCKET1', 'DOCKET_NUMBER', 'MC_NUMBER', 'DOCKET']),
    interstateBeyond100: findIdx(['INTERSTATE_BEYOND_100_MILES', 'INTERSTATE_BEYOND_100', 'INTER_BEYOND_100']),
    interstateWithin100: findIdx(['INTERSTATE_WITHIN_100_MILES', 'INTERSTATE_WITHIN_100', 'INTER_WITHIN_100']),
    docket1StatusCode: findIdx(['DOCKET1_STATUS_CODE', 'DOCKET_STATUS', 'AUTH_STATUS', 'OPERATING_STATUS']),
    recordDate: dateMatch.idx,
    recordDateFieldName: dateMatch.name || 'ADD_DATE',
  };
}

/**
 * Sanitizes and cleans a text field
 */
export function cleanField(val: unknown): string {
  if (val === null || val === undefined) return '';
  const s = String(val).trim();
  if (s === 'undefined' || s === 'null' || s === 'NaN') return '';
  return s;
}

/**
 * Safely parses integer with fallback to 0
 */
export function safeInt(val: unknown): number {
  if (val === null || val === undefined) return 0;
  const s = String(val).replace(/[^0-9-]/g, '');
  if (!s) return 0;
  const num = parseInt(s, 10);
  return isNaN(num) ? 0 : num;
}

/**
 * Formats MC Number from prefix and docket
 */
export function formatMC(prefixRaw: string, docketRaw: string): string {
  const prefix = cleanField(prefixRaw).toUpperCase();
  const docket = cleanField(docketRaw);
  if (!docket) return '';
  if (prefix) {
    return `${prefix}-${docket}`;
  }
  return docket;
}

/**
 * Validates phone format (must have at least 7 digits, not all zeros)
 */
export function isValidPhone(phone: string): boolean {
  if (!phone) return false;
  const digits = phone.replace(/[^0-9]/g, '');
  if (digits.length < 7) return false;
  // Reject junk like 0000000 or 9999999999 if all same digit
  if (/^(\d)\1+$/.test(digits)) return false;
  return true;
}

/**
 * Validates basic email address structure
 */
export function isValidEmail(email: string): boolean {
  if (!email) return false;
  const trimmed = email.trim();
  // Basic robust regex for local & domain format
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(trimmed);
}

/**
 * Checks if carrier operates interstate
 */
export function isInterstate(
  interBeyondRaw: string,
  interWithinRaw: string,
  operationCode: string
): boolean {
  const beyond = cleanField(interBeyondRaw).toUpperCase();
  const within = cleanField(interWithinRaw).toUpperCase();
  const op = cleanField(operationCode).toUpperCase();

  const yesValues = ['Y', 'YES', '1', 'X', 'TRUE'];
  if (yesValues.includes(beyond) || yesValues.includes(within)) {
    return true;
  }

  // Operation codes A, B, C typically represent Interstate in FMCSA definitions
  if (op.includes('A') || op.includes('B') || op.includes('C')) {
    return true;
  }

  return false;
}

/**
 * Checks if row satisfies the filter configuration
 */
export function testAndExtractLead(
  row: string[],
  colMap: ColumnIndexMap,
  filters: FmcsaFilterConfig,
  counter: number,
  dateRange?: { startSerial: number | null; endSerial: number | null }
): { matched: boolean; lead?: FmcsaLead; carrierOp: string; isMissingDate?: boolean } {
  const getCol = (idx: number): string => (idx >= 0 && idx < row.length ? cleanField(row[idx]) : '');

  // 1. Raw Carrier Operation code tracking
  const rawCarrierOp = getCol(colMap.carrierOperation);
  const carrierOpUpper = rawCarrierOp.toUpperCase();

  // 2. Phone requirement (Fail Fast)
  const phone = getCol(colMap.phone);
  if (filters.phoneRequired && !isValidPhone(phone)) {
    return { matched: false, carrierOp: rawCarrierOp };
  }

  // 3. Email requirement (Fail Fast)
  const email = getCol(colMap.emailAddress);
  if (filters.emailRequired && !isValidEmail(email)) {
    return { matched: false, carrierOp: rawCarrierOp };
  }

  // 4. State requirement
  const state = getCol(colMap.phyState).toUpperCase();
  if (filters.selectedState !== 'ALL' && state !== filters.selectedState.toUpperCase()) {
    return { matched: false, carrierOp: rawCarrierOp };
  }

  // 5. Active Status Check
  const statusCode = getCol(colMap.statusCode).toUpperCase();
  if (filters.activeOnly) {
    const allowed = filters.activeStatusCodes.map((s) => s.toUpperCase());
    const isAllowed = allowed.some((status) => statusCode === status || (status === 'A' && statusCode.startsWith('ACT')));
    if (!isAllowed) {
      return { matched: false, carrierOp: rawCarrierOp };
    }
  }

  // 6. Truck range check
  const truckUnitsVal = getCol(colMap.truckUnits);
  const powerUnitsVal = getCol(colMap.powerUnits);
  let truckCount = safeInt(truckUnitsVal);
  if (truckCount === 0 && powerUnitsVal) {
    // If truck_units is 0 or unlisted, check power_units as fallback
    truckCount = safeInt(powerUnitsVal);
  }

  if (truckCount < filters.minTrucks) {
    return { matched: false, carrierOp: rawCarrierOp };
  }
  if (filters.maxTrucks > 0 && truckCount > filters.maxTrucks) {
    return { matched: false, carrierOp: rawCarrierOp };
  }

  // 7. Interstate Check
  const interBeyond = getCol(colMap.interstateBeyond100);
  const interWithin = getCol(colMap.interstateWithin100);
  if (filters.interstateOnly && !isInterstate(interBeyond, interWithin, rawCarrierOp)) {
    return { matched: false, carrierOp: rawCarrierOp };
  }

  // 8. For-Hire Check (Configurable operation code)
  if (filters.forHireOnly) {
    const allowedCodes = filters.forHireCodes.map((c) => c.trim().toUpperCase()).filter(Boolean);
    // If user provided codes like ['A', 'B'], test if carrierOpUpper matches or contains any of the codes
    const isForHire = allowedCodes.some((code) => {
      if (carrierOpUpper === code) return true;
      if (carrierOpUpper.includes(code)) return true;
      // also if code is descriptive like 'FOR-HIRE'
      if (code === 'FOR-HIRE' && (carrierOpUpper.includes('FOR') || carrierOpUpper.includes('HIRE'))) return true;
      return false;
    });

    if (!isForHire) {
      return { matched: false, carrierOp: rawCarrierOp };
    }
  }

  // 9. New Authority / Date Check
  const rawDate = colMap.recordDate >= 0 ? getCol(colMap.recordDate) : '';
  if (dateRange && (dateRange.startSerial !== null || dateRange.endSerial !== null)) {
    const { matches: dateMatches, hasDate } = isLeadWithinDateRange(
      rawDate,
      dateRange.startSerial,
      dateRange.endSerial
    );
    if (!dateMatches) {
      return { matched: false, carrierOp: rawCarrierOp, isMissingDate: !hasDate };
    }
  }

  // If passed all filters, extract lead
  const legalName = getCol(colMap.legalName);
  const dbaName = getCol(colMap.dbaName);
  const company = legalName || dbaName || 'Unknown Carrier';

  const dot = getCol(colMap.dotNumber);
  const mc = formatMC(getCol(colMap.docket1Prefix), getCol(colMap.docket1));
  const powerUnits = safeInt(powerUnitsVal);
  const drivers = safeInt(getCol(colMap.totalDrivers));
  const officer = getCol(colMap.companyOfficer1);
  const city = getCol(colMap.phyCity);
  const zip = getCol(colMap.phyZip);
  const authorityStatus = getCol(colMap.docket1StatusCode) || statusCode || 'Active';

  const lead: FmcsaLead = {
    id: `fmcsa-${dot || counter}-${Date.now() % 10000}`,
    company,
    dba: dbaName,
    dot,
    mc,
    phone,
    email,
    trucks: truckCount,
    powerUnits,
    drivers,
    officer,
    city,
    state,
    zip,
    carrierOperation: rawCarrierOp, // PRESERVE RAW VALUE
    interstateBeyond100: interBeyond,
    interstateWithin100: interWithin,
    authorityStatus,
    recordDate: rawDate,
    recordDateType: colMap.recordDateFieldName || 'ADD_DATE',
  };

  return { matched: true, lead, carrierOp: rawCarrierOp };
}

export const US_STATES = [
  { code: 'ALL', name: 'All States & Territories' },
  { code: 'AL', name: 'Alabama' },
  { code: 'AK', name: 'Alaska' },
  { code: 'AZ', name: 'Arizona' },
  { code: 'AR', name: 'Arkansas' },
  { code: 'CA', name: 'California' },
  { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' },
  { code: 'DE', name: 'Delaware' },
  { code: 'DC', name: 'District of Columbia' },
  { code: 'FL', name: 'Florida' },
  { code: 'GA', name: 'Georgia' },
  { code: 'HI', name: 'Hawaii' },
  { code: 'ID', name: 'Idaho' },
  { code: 'IL', name: 'Illinois' },
  { code: 'IN', name: 'Indiana' },
  { code: 'IA', name: 'Iowa' },
  { code: 'KS', name: 'Kansas' },
  { code: 'KY', name: 'Kentucky' },
  { code: 'LA', name: 'Louisiana' },
  { code: 'ME', name: 'Maine' },
  { code: 'MD', name: 'Maryland' },
  { code: 'MA', name: 'Massachusetts' },
  { code: 'MI', name: 'Michigan' },
  { code: 'MN', name: 'Minnesota' },
  { code: 'MS', name: 'Mississippi' },
  { code: 'MO', name: 'Missouri' },
  { code: 'MT', name: 'Montana' },
  { code: 'NE', name: 'Nebraska' },
  { code: 'NV', name: 'Nevada' },
  { code: 'NH', name: 'New Hampshire' },
  { code: 'NJ', name: 'New Jersey' },
  { code: 'NM', name: 'New Mexico' },
  { code: 'NY', name: 'New York' },
  { code: 'NC', name: 'North Carolina' },
  { code: 'ND', name: 'North Dakota' },
  { code: 'OH', name: 'Ohio' },
  { code: 'OK', name: 'Oklahoma' },
  { code: 'OR', name: 'Oregon' },
  { code: 'PA', name: 'Pennsylvania' },
  { code: 'PR', name: 'Puerto Rico' },
  { code: 'RI', name: 'Rhode Island' },
  { code: 'SC', name: 'South Carolina' },
  { code: 'SD', name: 'South Dakota' },
  { code: 'TN', name: 'Tennessee' },
  { code: 'TX', name: 'Texas' },
  { code: 'UT', name: 'Utah' },
  { code: 'VT', name: 'Vermont' },
  { code: 'VA', name: 'Virginia' },
  { code: 'WA', name: 'Washington' },
  { code: 'WV', name: 'West Virginia' },
  { code: 'WI', name: 'Wisconsin' },
  { code: 'WY', name: 'Wyoming' },
];
