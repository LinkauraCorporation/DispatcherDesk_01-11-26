import { SupportedTimezone } from '../types/domain.types.ts';

export const SUPPORTED_TIMEZONES: SupportedTimezone[] = [
  { id: 'America/New_York', label: 'US Eastern (ET)', code: 'EST/EDT', region: 'US' },
  { id: 'America/Chicago', label: 'US Central (CT)', code: 'CST/CDT', region: 'US' },
  { id: 'America/Denver', label: 'US Mountain (MT)', code: 'MST/MDT', region: 'US' },
  { id: 'America/Los_Angeles', label: 'US Pacific (PT)', code: 'PST/PDT', region: 'US' },
  { id: 'America/Toronto', label: 'Canada Eastern (ET)', code: 'EST/EDT', region: 'Canada' },
  { id: 'Asia/Kolkata', label: 'India Standard Time (IST)', code: 'IST', region: 'India' },
  { id: 'Asia/Karachi', label: 'Pakistan Standard Time (PKT)', code: 'PKT', region: 'Pakistan' },
];

export const DEFAULT_DISPATCHER_TIMEZONE = 'Asia/Kolkata';
export const DEFAULT_OPERATIONAL_TIMEZONE = 'America/Chicago';

/**
 * Checks if a string represents a pure date (YYYY-MM-DD) or a UTC-midnight representation
 * (e.g. 2026-03-23, 2026-03-23T00:00:00Z, 2026-03-23T00:00:00.000Z).
 */
export function isDateOnlyString(val: string | null | undefined): boolean {
  if (!val) return false;
  const trimmed = val.trim();
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ||
    /^(\d{4}-\d{2}-\d{2})[T ]00:00(?::00(?:\.000)?)?(?:Z|[+-]00:?00)?$/.test(trimmed)
  );
}

/**
 * Extracts the YYYY-MM-DD part from a date-only or timestamp string.
 */
export function extractDateOnlyString(val: string | null | undefined): string | null {
  if (!val) return null;
  const m = val.trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

/**
 * Returns formatted YYYY-MM-DD string in a specific timezone without shifting date-only values.
 */
export function toLocalDateString(
  d: Date | string,
  operationalTimezone: string = DEFAULT_OPERATIONAL_TIMEZONE
): string {
  if (typeof d === 'string') {
    if (isDateOnlyString(d)) {
      const extracted = extractDateOnlyString(d);
      if (extracted) return extracted;
    }
    const parsed = new Date(d);
    if (!isNaN(parsed.getTime())) {
      d = parsed;
    }
  }

  if (d instanceof Date && !isNaN(d.getTime())) {
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: operationalTimezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).formatToParts(d);
      const p = Object.fromEntries(parts.map((part) => [part.type, part.value]));
      if (p.year && p.month && p.day) {
        return `${p.year}-${p.month}-${p.day}`;
      }
    } catch {
      // Fallback if timezone string is invalid
    }
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  return '';
}

/**
 * Parses an ISO string or date-only string into separate date (YYYY-MM-DD) and time (HH:mm) components
 * in the operational timezone, preserving date-only values without calendar day shifting.
 */
export function parseDateAndTimeToInputs(
  isoString?: string | null,
  operationalTimezone: string = DEFAULT_OPERATIONAL_TIMEZONE
): { date: string; time: string } {
  if (!isoString) return { date: '', time: '' };
  const trimmed = typeof isoString === 'string' ? isoString.trim() : '';
  if (!trimmed) return { date: '', time: '' };

  if (isDateOnlyString(trimmed)) {
    const datePart = extractDateOnlyString(trimmed);
    return {
      date: datePart || trimmed,
      time: '',
    };
  }

  try {
    const d = new Date(trimmed);
    if (isNaN(d.getTime())) return { date: '', time: '' };

    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: operationalTimezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(d);

    const p = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    if (!p.year || !p.month || !p.day) return { date: '', time: '' };

    const date = `${p.year}-${p.month}-${p.day}`;
    const time = `${p.hour || '00'}:${p.minute || '00'}`;
    return { date, time };
  } catch {
    return { date: '', time: '' };
  }
}

/**
 * Constructs an exact UTC ISO timestamp from separate date and time input values
 * interpreted in the specified operational timezone.
 */
export function constructIsoDatetime(
  dateStr: string,
  timeStr: string,
  operationalTimezone: string = DEFAULT_OPERATIONAL_TIMEZONE
): string | null {
  if (!dateStr || !dateStr.trim()) return null;
  const time = timeStr && timeStr.trim() ? timeStr.trim() : '00:00';
  const [yearStr, monthStr, dayStr] = dateStr.trim().split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);
  if (isNaN(year) || isNaN(month) || isNaN(day)) return null;

  const [hourStr, minuteStr] = time.split(':');
  const hour = parseInt(hourStr || '0', 10);
  const minute = parseInt(minuteStr || '0', 10);
  if (isNaN(hour) || isNaN(minute)) return null;

  // Interpret wall-clock date and time in the operational timezone.
  // Use Date.UTC to establish a pure UTC reference without browser-local timezone bias.
  const targetUtcMs = Date.UTC(year, month - 1, day, hour, minute, 0, 0);

  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: operationalTimezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });

    // Iteratively resolve for the exact UTC ms that formats to the desired wall-clock time in operationalTimezone
    let guessUtcMs = targetUtcMs;
    for (let i = 0; i < 3; i++) {
      const parts = formatter.formatToParts(new Date(guessUtcMs));
      const p = Object.fromEntries(parts.map((part) => [part.type, part.value]));
      const renderedYear = parseInt(p.year, 10);
      const renderedMonth = parseInt(p.month, 10);
      const renderedDay = parseInt(p.day, 10);
      const renderedHour = parseInt(p.hour, 10);
      const renderedMinute = parseInt(p.minute, 10);

      const renderedAsUtcMs = Date.UTC(
        renderedYear,
        renderedMonth - 1,
        renderedDay,
        renderedHour,
        renderedMinute,
        0,
        0
      );
      const diff = renderedAsUtcMs - targetUtcMs;
      guessUtcMs -= diff;
      if (diff === 0) break;
    }

    const finalDate = new Date(guessUtcMs);
    if (isNaN(finalDate.getTime())) return null;
    return finalDate.toISOString();
  } catch {
    // Fallback if operationalTimezone is unrecognized
    const fallbackDate = new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0));
    return isNaN(fallbackDate.getTime()) ? null : fallbackDate.toISOString();
  }
}

/**
 * Converts an ISO string or date-only string to datetime-local input format (YYYY-MM-DDTHH:mm)
 * in the specified operational timezone.
 */
export function toLocalInputValue(
  isoString?: string | null,
  operationalTimezone: string = DEFAULT_OPERATIONAL_TIMEZONE
): string {
  if (!isoString) return '';
  const parsed = parseDateAndTimeToInputs(isoString, operationalTimezone);
  if (!parsed.date) return '';
  return `${parsed.date}T${parsed.time || '00:00'}`;
}

/**
 * Parses a datetime-local input value (YYYY-MM-DDTHH:mm) into an exact UTC ISO timestamp
 * in the specified operational timezone.
 */
export function parseInputToIso(
  inputValue?: string | null,
  operationalTimezone: string = DEFAULT_OPERATIONAL_TIMEZONE
): string | null {
  if (!inputValue || !inputValue.trim()) return null;
  const trimmed = inputValue.trim();
  const [dStr, tStr] = trimmed.split('T');
  if (!dStr) return null;
  return constructIsoDatetime(dStr, tStr || '00:00', operationalTimezone);
}

/**
 * Formats a UTC / ISO timestamp or date-only string for display in a specific IANA timezone.
 * Uses Intl.DateTimeFormat to respect DST changes automatically.
 * Date-only values (e.g. 2026-03-23 or UTC midnight) are preserved without backward calendar day shift.
 */
export function formatInTimezone(
  dateString: string | null | undefined,
  timeZone: string,
  options: {
    includeDate?: boolean;
    includeTime?: boolean;
    includeSeconds?: boolean;
    includeTimezoneCode?: boolean;
  } = {}
): string {
  if (!dateString) return '—';

  const {
    includeDate = true,
    includeTime = true,
    includeSeconds = false,
    includeTimezoneCode = true,
  } = options;

  // Handle date-only strings and UTC-midnight representations without timezone backward shift
  if (isDateOnlyString(dateString)) {
    const datePart = extractDateOnlyString(dateString);
    if (!datePart) return '—';

    const [yearStr, monthStr, dayStr] = datePart.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    const day = parseInt(dayStr, 10);
    if (isNaN(year) || isNaN(month) || isNaN(day)) return datePart;

    // Use UTC noon to ensure calendar date is invariant across all world timezones
    const noonUtc = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));

    try {
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'UTC',
        month: includeDate ? 'short' : undefined,
        day: includeDate ? '2-digit' : undefined,
        year: includeDate ? 'numeric' : undefined,
      });
      return formatter.format(noonUtc);
    } catch {
      return datePart;
    }
  }

  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '—';

  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      month: includeDate ? 'short' : undefined,
      day: includeDate ? '2-digit' : undefined,
      year: includeDate ? 'numeric' : undefined,
      hour: includeTime ? '2-digit' : undefined,
      minute: includeTime ? '2-digit' : undefined,
      second: includeSeconds ? '2-digit' : undefined,
      hour12: true,
      timeZoneName: includeTimezoneCode ? 'short' : undefined,
    });

    return formatter.format(date);
  } catch {
    // Fallback if timezone string is invalid
    return date.toISOString().replace('T', ' ').substring(0, 16);
  }
}

/**
 * Returns formatted dual timestamp for dispatchers (e.g. US Ops Time + Dispatcher Time)
 * Example: "Oct 24, 10:00 AM CDT (8:30 PM IST)"
 * Date-only values display the invariant calendar date without spurious time conversion.
 */
export function formatDualTime(
  dateString: string | null | undefined,
  opsTimezone = DEFAULT_OPERATIONAL_TIMEZONE,
  localTimezone = DEFAULT_DISPATCHER_TIMEZONE
): {
  primary: string;
  secondary: string;
  combined: string;
} {
  if (!dateString) {
    return { primary: '—', secondary: '—', combined: '—' };
  }

  if (isDateOnlyString(dateString)) {
    const primary = formatInTimezone(dateString, opsTimezone, {
      includeDate: true,
      includeTime: false,
      includeTimezoneCode: false,
    });
    return {
      primary,
      secondary: '—',
      combined: primary,
    };
  }

  const primary = formatInTimezone(dateString, opsTimezone, {
    includeDate: true,
    includeTime: true,
    includeTimezoneCode: true,
  });

  const secondary = formatInTimezone(dateString, localTimezone, {
    includeDate: false,
    includeTime: true,
    includeTimezoneCode: true,
  });

  return {
    primary,
    secondary,
    combined: `${primary} (${secondary})`,
  };
}

/**
 * Get current time in specified timezone formatted for live clocks in Header.
 */
export function getCurrentTimeInZone(timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
      timeZoneName: 'short',
    }).format(new Date());
  } catch {
    return new Date().toLocaleTimeString();
  }
}

/**
 * Standard mapping of US 2-letter state codes and Canadian province codes
 * to their primary IANA timezones supported by DispatcherDesk.
 */
const STATE_TIMEZONE_MAP: Record<string, string> = {
  // US Eastern (America/New_York)
  CT: 'America/New_York',
  DE: 'America/New_York',
  DC: 'America/New_York',
  FL: 'America/New_York',
  GA: 'America/New_York',
  IN: 'America/New_York',
  KY: 'America/New_York',
  ME: 'America/New_York',
  MD: 'America/New_York',
  MA: 'America/New_York',
  MI: 'America/New_York',
  NH: 'America/New_York',
  NJ: 'America/New_York',
  NY: 'America/New_York',
  NC: 'America/New_York',
  OH: 'America/New_York',
  PA: 'America/New_York',
  RI: 'America/New_York',
  SC: 'America/New_York',
  VA: 'America/New_York',
  VT: 'America/New_York',
  WV: 'America/New_York',
  PR: 'America/New_York',

  // US Central (America/Chicago)
  AL: 'America/Chicago',
  AR: 'America/Chicago',
  IL: 'America/Chicago',
  IA: 'America/Chicago',
  KS: 'America/Chicago',
  LA: 'America/Chicago',
  MN: 'America/Chicago',
  MS: 'America/Chicago',
  MO: 'America/Chicago',
  NE: 'America/Chicago',
  ND: 'America/Chicago',
  OK: 'America/Chicago',
  SD: 'America/Chicago',
  TN: 'America/Chicago',
  TX: 'America/Chicago',
  WI: 'America/Chicago',

  // US Mountain (America/Denver)
  AZ: 'America/Denver',
  CO: 'America/Denver',
  ID: 'America/Denver',
  MT: 'America/Denver',
  NM: 'America/Denver',
  UT: 'America/Denver',
  WY: 'America/Denver',

  // US Pacific / Alaska / Hawaii (America/Los_Angeles)
  CA: 'America/Los_Angeles',
  NV: 'America/Los_Angeles',
  OR: 'America/Los_Angeles',
  WA: 'America/Los_Angeles',
  AK: 'America/Los_Angeles',
  HI: 'America/Los_Angeles',

  // Canadian Provinces
  ON: 'America/Toronto',
  QC: 'America/Toronto',
  NB: 'America/Toronto',
  NS: 'America/Toronto',
  NL: 'America/Toronto',
  PE: 'America/Toronto',
  AB: 'America/Denver',
  BC: 'America/Los_Angeles',
  MB: 'America/Chicago',
  SK: 'America/Chicago',
  NT: 'America/Denver',
  YT: 'America/Los_Angeles',
  NU: 'America/Toronto',
};

const FULL_NAME_TO_CODE: Record<string, string> = {
  ALABAMA: 'AL', ALASKA: 'AK', ARIZONA: 'AZ', ARKANSAS: 'AR', CALIFORNIA: 'CA',
  COLORADO: 'CO', CONNECTICUT: 'CT', DELAWARE: 'DE', FLORIDA: 'FL', GEORGIA: 'GA',
  HAWAII: 'HI', IDAHO: 'ID', ILLINOIS: 'IL', INDIANA: 'IN', IOWA: 'IA',
  KANSAS: 'KS', KENTUCKY: 'KY', LOUISIANA: 'LA', MAINE: 'ME', MARYLAND: 'MD',
  MASSACHUSETTS: 'MA', MICHIGAN: 'MI', MINNESOTA: 'MN', MISSISSIPPI: 'MS', MISSOURI: 'MO',
  MONTANA: 'MT', NEBRASKA: 'NE', NEVADA: 'NV', 'NEW HAMPSHIRE': 'NH', 'NEW JERSEY': 'NJ',
  'NEW MEXICO': 'NM', 'NEW YORK': 'NY', 'NORTH CAROLINA': 'NC', 'NORTH DAKOTA': 'ND',
  OHIO: 'OH', OKLAHOMA: 'OK', OREGON: 'OR', PENNSYLVANIA: 'PA', 'RHODE ISLAND': 'RI',
  'SOUTH CAROLINA': 'SC', 'SOUTH DAKOTA': 'SD', TENNESSEE: 'TN', TEXAS: 'TX', UTAH: 'UT',
  VERMONT: 'VT', VIRGINIA: 'VA', WASHINGTON: 'WA', 'WEST VIRGINIA': 'WV', WISCONSIN: 'WI',
  WYOMING: 'WY', 'DISTRICT OF COLUMBIA': 'DC', 'PUERTO RICO': 'PR',
  // Canada
  ONTARIO: 'ON', QUEBEC: 'QC', 'BRITISH COLUMBIA': 'BC', ALBERTA: 'AB',
  MANITOBA: 'MB', SASKATCHEWAN: 'SK', 'NOVA SCOTIA': 'NS', 'NEW BRUNSWICK': 'NB',
  NEWFOUNDLAND: 'NL', 'PRINCE EDWARD ISLAND': 'PE',
};

/**
 * Returns the canonical default IANA timezone for a US state or Canadian province.
 * Safely falls back to DEFAULT_OPERATIONAL_TIMEZONE (America/Chicago) when unknown.
 */
export function getStateTimezone(stateCode?: string | null): string {
  if (!stateCode || typeof stateCode !== 'string') {
    return DEFAULT_OPERATIONAL_TIMEZONE;
  }
  const trimmed = stateCode.trim().toUpperCase();
  if (!trimmed) {
    return DEFAULT_OPERATIONAL_TIMEZONE;
  }

  // Direct 2-letter lookup
  if (STATE_TIMEZONE_MAP[trimmed]) {
    return STATE_TIMEZONE_MAP[trimmed];
  }

  // Full name lookup fallback
  const mappedCode = FULL_NAME_TO_CODE[trimmed];
  if (mappedCode && STATE_TIMEZONE_MAP[mappedCode]) {
    return STATE_TIMEZONE_MAP[mappedCode];
  }

  return DEFAULT_OPERATIONAL_TIMEZONE;
}

