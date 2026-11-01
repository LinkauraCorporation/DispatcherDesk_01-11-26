import { Broker, Client, Truck, Driver } from '../../types/domain.types.ts';
import { ExtractedBrokerInfo, ExtractedCarrierInfo } from '../documents/extractionTypes.ts';

/**
 * Normalizes string for deterministic case-insensitive and punctuation-insensitive comparison.
 */
export const normalizeEntityString = (str?: string | null): string => {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

/**
 * Extracts digits only from an identifier or telephone string.
 */
export const normalizeDigitsOnly = (str?: string | null): string => {
  if (!str) return '';
  return str.replace(/\D/g, '');
};

export interface MatchResult<T> {
  matchedId: string | null;
  matchedEntity: T | null;
  hasMultipleMatches: boolean;
  isMatch: boolean;
}

/**
 * Deterministic Broker Matching
 * Priority: MC Number -> DOT Number -> Exact normalized company name
 * Rejects weak fuzzy substring matching to prevent substituting unrelated brokers.
 */
export function matchBroker(
  extracted: ExtractedBrokerInfo | null | undefined,
  brokerList: Broker[]
): MatchResult<Broker> {
  if (!extracted || !brokerList || brokerList.length === 0) {
    return { matchedId: null, matchedEntity: null, hasMultipleMatches: false, isMatch: false };
  }

  // 1. Match by MC number if provided (minimum 4 digits)
  const cleanExtractedMC = normalizeDigitsOnly(extracted.mc_number);
  if (cleanExtractedMC && cleanExtractedMC.length >= 4) {
    const mcMatches = brokerList.filter((b) => {
      const bMC = normalizeDigitsOnly(b.mc_number);
      return bMC === cleanExtractedMC;
    });
    if (mcMatches.length === 1) {
      return { matchedId: mcMatches[0].id, matchedEntity: mcMatches[0], hasMultipleMatches: false, isMatch: true };
    }
    if (mcMatches.length > 1) {
      return { matchedId: null, matchedEntity: null, hasMultipleMatches: true, isMatch: false };
    }
  }

  // 2. Match by DOT number if provided (minimum 4 digits)
  const cleanExtractedDOT = normalizeDigitsOnly(extracted.dot_number);
  if (cleanExtractedDOT && cleanExtractedDOT.length >= 4) {
    const dotMatches = brokerList.filter((b) => {
      const bDOT = normalizeDigitsOnly(b.dot_number);
      return bDOT === cleanExtractedDOT;
    });
    if (dotMatches.length === 1) {
      return { matchedId: dotMatches[0].id, matchedEntity: dotMatches[0], hasMultipleMatches: false, isMatch: true };
    }
    if (dotMatches.length > 1) {
      return { matchedId: null, matchedEntity: null, hasMultipleMatches: true, isMatch: false };
    }
  }

  // 3. Match by exact normalized company name
  const normExtractedName = normalizeEntityString(extracted.company_name);
  if (normExtractedName && normExtractedName.length >= 3) {
    const nameMatches = brokerList.filter((b) => {
      return normalizeEntityString(b.company_name) === normExtractedName;
    });
    if (nameMatches.length === 1) {
      return { matchedId: nameMatches[0].id, matchedEntity: nameMatches[0], hasMultipleMatches: false, isMatch: true };
    }
    if (nameMatches.length > 1) {
      return { matchedId: null, matchedEntity: null, hasMultipleMatches: true, isMatch: false };
    }
  }

  return { matchedId: null, matchedEntity: null, hasMultipleMatches: false, isMatch: false };
}

/**
 * Deterministic Carrier Matching
 * Priority: MC Number -> DOT Number -> Exact normalized legal/company name
 */
export function matchCarrier(
  extracted: ExtractedCarrierInfo | null | undefined,
  clientList: Client[]
): MatchResult<Client> {
  if (!extracted || !clientList || clientList.length === 0) {
    return { matchedId: null, matchedEntity: null, hasMultipleMatches: false, isMatch: false };
  }

  // 1. Match by MC number if provided (minimum 4 digits)
  const cleanMC = normalizeDigitsOnly(extracted.mc_number);
  if (cleanMC && cleanMC.length >= 4) {
    const mcMatches = clientList.filter((c) => {
      const cMC = normalizeDigitsOnly((c as any).mc_number || (c.notes?.match(/MC[- :]*(\d+)/i)?.[1]));
      return cMC === cleanMC;
    });
    if (mcMatches.length === 1) {
      return { matchedId: mcMatches[0].id, matchedEntity: mcMatches[0], hasMultipleMatches: false, isMatch: true };
    }
    if (mcMatches.length > 1) {
      return { matchedId: null, matchedEntity: null, hasMultipleMatches: true, isMatch: false };
    }
  }

  // 2. Match by DOT number if provided (minimum 4 digits)
  const cleanDOT = normalizeDigitsOnly(extracted.dot_number);
  if (cleanDOT && cleanDOT.length >= 4) {
    const dotMatches = clientList.filter((c) => {
      const cDOT = normalizeDigitsOnly((c as any).dot_number || (c.notes?.match(/DOT[- :]*(\d+)/i)?.[1]));
      return cDOT === cleanDOT;
    });
    if (dotMatches.length === 1) {
      return { matchedId: dotMatches[0].id, matchedEntity: dotMatches[0], hasMultipleMatches: false, isMatch: true };
    }
    if (dotMatches.length > 1) {
      return { matchedId: null, matchedEntity: null, hasMultipleMatches: true, isMatch: false };
    }
  }

  // 3. Match by exact normalized legal/company name
  const normName = normalizeEntityString(extracted.carrier_name || extracted.company_name);
  if (normName && normName.length >= 3) {
    const nameMatches = clientList.filter((c) => {
      return normalizeEntityString(c.company_name) === normName;
    });
    if (nameMatches.length === 1) {
      return { matchedId: nameMatches[0].id, matchedEntity: nameMatches[0], hasMultipleMatches: false, isMatch: true };
    }
    if (nameMatches.length > 1) {
      return { matchedId: null, matchedEntity: null, hasMultipleMatches: true, isMatch: false };
    }
  }

  return { matchedId: null, matchedEntity: null, hasMultipleMatches: false, isMatch: false };
}

/**
 * Deterministic Truck Matching
 * Must belong to selected carrier. Matches normalized truck number.
 */
export function matchTruck(
  extracted: ExtractedCarrierInfo | null | undefined,
  carrierId: string | null | undefined,
  truckList: Truck[]
): MatchResult<Truck> {
  if (!extracted || !carrierId || !extracted.truck_number || !truckList || truckList.length === 0) {
    return { matchedId: null, matchedEntity: null, hasMultipleMatches: false, isMatch: false };
  }

  const carrierTrucks = truckList.filter((t) => t.client_id === carrierId);
  if (carrierTrucks.length === 0) {
    return { matchedId: null, matchedEntity: null, hasMultipleMatches: false, isMatch: false };
  }

  const cleanExtractedNum = normalizeDigitsOnly(extracted.truck_number) || normalizeEntityString(extracted.truck_number);
  if (!cleanExtractedNum) {
    return { matchedId: null, matchedEntity: null, hasMultipleMatches: false, isMatch: false };
  }

  const matches = carrierTrucks.filter((t) => {
    const tDigits = normalizeDigitsOnly(t.truck_number);
    const tNorm = normalizeEntityString(t.truck_number);
    return (tDigits && tDigits === cleanExtractedNum) || (tNorm && tNorm === cleanExtractedNum);
  });

  if (matches.length === 1) {
    return { matchedId: matches[0].id, matchedEntity: matches[0], hasMultipleMatches: false, isMatch: true };
  }
  if (matches.length > 1) {
    return { matchedId: null, matchedEntity: null, hasMultipleMatches: true, isMatch: false };
  }

  return { matchedId: null, matchedEntity: null, hasMultipleMatches: false, isMatch: false };
}

/**
 * Deterministic Driver Matching
 * Must belong to selected carrier. Matches normalized driver name or phone.
 */
export function matchDriver(
  extracted: ExtractedCarrierInfo | null | undefined,
  carrierId: string | null | undefined,
  driverList: Driver[]
): MatchResult<Driver> {
  if (!extracted || !carrierId || (!extracted.driver_name && !extracted.driver_phone) || !driverList || driverList.length === 0) {
    return { matchedId: null, matchedEntity: null, hasMultipleMatches: false, isMatch: false };
  }

  const carrierDrivers = driverList.filter((d) => d.client_id === carrierId);
  if (carrierDrivers.length === 0) {
    return { matchedId: null, matchedEntity: null, hasMultipleMatches: false, isMatch: false };
  }

  const normExtractedName = normalizeEntityString(extracted.driver_name);
  const cleanPhone = normalizeDigitsOnly(extracted.driver_phone);

  // 1. Try exact normalized driver name match under this carrier
  if (normExtractedName && normExtractedName.length >= 3) {
    const nameMatches = carrierDrivers.filter((d) => {
      return normalizeEntityString(d.full_name) === normExtractedName;
    });
    if (nameMatches.length === 1) {
      return { matchedId: nameMatches[0].id, matchedEntity: nameMatches[0], hasMultipleMatches: false, isMatch: true };
    }
    if (nameMatches.length > 1) {
      return { matchedId: null, matchedEntity: null, hasMultipleMatches: true, isMatch: false };
    }
  }

  // 2. Try phone match if phone available and at least 7 digits
  if (cleanPhone && cleanPhone.length >= 7) {
    const last7 = cleanPhone.slice(-7);
    const phoneMatches = carrierDrivers.filter((d) => {
      const dPhone = normalizeDigitsOnly(d.phone);
      return dPhone.endsWith(last7);
    });
    if (phoneMatches.length === 1) {
      return { matchedId: phoneMatches[0].id, matchedEntity: phoneMatches[0], hasMultipleMatches: false, isMatch: true };
    }
    if (phoneMatches.length > 1) {
      return { matchedId: null, matchedEntity: null, hasMultipleMatches: true, isMatch: false };
    }
  }

  return { matchedId: null, matchedEntity: null, hasMultipleMatches: false, isMatch: false };
}
