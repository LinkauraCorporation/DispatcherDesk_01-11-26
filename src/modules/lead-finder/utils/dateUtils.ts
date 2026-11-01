/**
 * Calendar-safe date utilities for FMCSA Census processing.
 *
 * CRITICAL REQUIREMENTS:
 * - Zero timezone shifting: Uses integer serials (YYYYMMDD) instead of UTC string-based Date objects.
 * - Calendar date comparisons: Handles dates consistently across all client timezones.
 * - Missing or invalid dates return null and never qualify for date ranges.
 */

export type AuthorityDateOption =
  | 'ALL'
  | 'LAST_30'
  | 'LAST_90'
  | 'LAST_180'
  | 'LAST_365'
  | 'CUSTOM';

const MONTH_NAME_MAP: Record<string, number> = {
  JAN: 1,
  FEB: 2,
  MAR: 3,
  APR: 4,
  MAY: 5,
  JUN: 6,
  JUL: 7,
  AUG: 8,
  SEP: 9,
  OCT: 10,
  NOV: 11,
  DEC: 12,
};

/**
 * Converts year, month, and day into an integer serial: YYYYMMDD
 * e.g., 2026, 10, 22 -> 20261022
 */
export function toCalendarSerial(year: number, month: number, day: number): number {
  return year * 10000 + month * 100 + day;
}

/**
 * Formats a calendar serial into a standard YYYY-MM-DD display string
 */
export function formatCalendarSerial(serial: number): string {
  if (!serial || isNaN(serial) || serial <= 0) return '';
  const y = Math.floor(serial / 10000);
  const m = Math.floor((serial % 10000) / 100);
  const d = serial % 100;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * Safely parses any FMCSA raw date string into an integer serial YYYYMMDD.
 * Handles:
 * - "YYYY-MM-DD" or "YYYY-MM-DD HH:MM:SS" (e.g. "2026-08-15")
 * - "MM/DD/YYYY" (e.g. "08/15/2026")
 * - "YYYYMMDD" (e.g. "20260815")
 * - "DD-MON-YYYY" or "DD-MON-YY" (e.g. "15-AUG-2026" or "15-AUG-26")
 *
 * Returns null if missing, empty, or invalid.
 */
export function parseFmcsaDateToSerial(raw: unknown): number | null {
  if (!raw) return null;
  const str = String(raw).trim();
  if (!str || str === 'undefined' || str === 'null' || str === 'NaN') return null;

  // 1. Format: YYYY-MM-DD or YYYY-MM-DD HH:MM:SS or YYYY/MM/DD
  const isoMatch = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (isoMatch) {
    const y = parseInt(isoMatch[1], 10);
    const m = parseInt(isoMatch[2], 10);
    const d = parseInt(isoMatch[3], 10);
    if (isValidCalendarDate(y, m, d)) {
      return toCalendarSerial(y, m, d);
    }
    return null;
  }

  // 2. Format: MM/DD/YYYY or MM-DD-YYYY
  const usMatch = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (usMatch) {
    const m = parseInt(usMatch[1], 10);
    const d = parseInt(usMatch[2], 10);
    const y = parseInt(usMatch[3], 10);
    if (isValidCalendarDate(y, m, d)) {
      return toCalendarSerial(y, m, d);
    }
    return null;
  }

  // 3. Format: YYYYMMDD
  const compactMatch = str.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compactMatch) {
    const y = parseInt(compactMatch[1], 10);
    const m = parseInt(compactMatch[2], 10);
    const d = parseInt(compactMatch[3], 10);
    if (isValidCalendarDate(y, m, d)) {
      return toCalendarSerial(y, m, d);
    }
    return null;
  }

  // 4. Format: DD-MON-YYYY or DD-MON-YY (Oracle / MCMIS legacy census)
  const oracleMatch = str.match(/^(\d{1,2})[-/ ]([A-Za-z]{3})[-/ ](\d{2,4})$/);
  if (oracleMatch) {
    const d = parseInt(oracleMatch[1], 10);
    const monStr = oracleMatch[2].toUpperCase();
    const m = MONTH_NAME_MAP[monStr];
    let y = parseInt(oracleMatch[3], 10);
    if (oracleMatch[3].length === 2) {
      y = y >= 50 ? 1900 + y : 2000 + y;
    }
    if (m && isValidCalendarDate(y, m, d)) {
      return toCalendarSerial(y, m, d);
    }
    return null;
  }

  return null;
}

function isValidCalendarDate(y: number, m: number, d: number): boolean {
  if (y < 1950 || y > 2100) return false;
  if (m < 1 || m > 12) return false;
  if (d < 1 || d > 31) return false;
  return true;
}

/**
 * Returns today's calendar date as a serial integer in local client time
 */
export function getTodayCalendarSerial(): number {
  const now = new Date();
  return toCalendarSerial(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

/**
 * Resolves the start and end calendar serials for a given AuthorityDateOption
 */
export function resolveDateFilterRange(
  option: AuthorityDateOption,
  customStart?: string,
  customEnd?: string
): { startSerial: number | null; endSerial: number | null; label: string } {
  if (option === 'ALL') {
    return { startSerial: null, endSerial: null, label: 'All Dates' };
  }

  const now = new Date();
  const todayYear = now.getFullYear();
  const todayMonth = now.getMonth(); // 0-indexed
  const todayDay = now.getDate();
  const todaySerial = toCalendarSerial(todayYear, todayMonth + 1, todayDay);

  let daysAgo = 0;
  let labelPrefix = '';

  if (option === 'LAST_30') {
    daysAgo = 30;
    labelPrefix = 'Last 30 Days';
  } else if (option === 'LAST_90') {
    daysAgo = 90;
    labelPrefix = 'Last 90 Days';
  } else if (option === 'LAST_180') {
    daysAgo = 180;
    labelPrefix = 'Last 180 Days';
  } else if (option === 'LAST_365') {
    daysAgo = 365;
    labelPrefix = 'Last 1 Year';
  } else if (option === 'CUSTOM') {
    const startSerial = parseFmcsaDateToSerial(customStart);
    const endSerial = parseFmcsaDateToSerial(customEnd);
    const startStr = startSerial ? formatCalendarSerial(startSerial) : 'Beginning';
    const endStr = endSerial ? formatCalendarSerial(endSerial) : 'Present';
    return {
      startSerial,
      endSerial,
      label: `Custom: ${startStr} to ${endStr}`,
    };
  }

  // Calculate cutoff calendar date without timezone shift
  const cutoffDate = new Date(todayYear, todayMonth, todayDay - daysAgo);
  const cutoffSerial = toCalendarSerial(
    cutoffDate.getFullYear(),
    cutoffDate.getMonth() + 1,
    cutoffDate.getDate()
  );

  return {
    startSerial: cutoffSerial,
    endSerial: todaySerial,
    label: `${labelPrefix} (${formatCalendarSerial(cutoffSerial)} to ${formatCalendarSerial(todaySerial)})`,
  };
}

/**
 * Tests whether a lead's raw date satisfies the date range
 */
export function isLeadWithinDateRange(
  leadDateRaw: string | undefined,
  startSerial: number | null,
  endSerial: number | null
): { matches: boolean; hasDate: boolean } {
  // If no date filter is active, all leads match
  if (startSerial === null && endSerial === null) {
    return { matches: true, hasDate: !!leadDateRaw };
  }

  const leadSerial = parseFmcsaDateToSerial(leadDateRaw);
  if (leadSerial === null) {
    // Missing or invalid date does NOT qualify
    return { matches: false, hasDate: false };
  }

  if (startSerial !== null && leadSerial < startSerial) {
    return { matches: false, hasDate: true };
  }
  if (endSerial !== null && leadSerial > endSerial) {
    return { matches: false, hasDate: true };
  }

  return { matches: true, hasDate: true };
}
