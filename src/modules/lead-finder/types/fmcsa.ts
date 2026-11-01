import { SupportedEncoding } from '../utils/encodingDetector';
import { AuthorityDateOption } from '../utils/dateUtils';

export type { AuthorityDateOption };

export interface FmcsaLead {
  id: string; // generated unique id
  company: string; // LEGAL_NAME
  dba: string; // DBA_NAME
  dot: string; // DOT_NUMBER
  mc: string; // DOCKET1PREFIX + DOCKET1
  phone: string; // PHONE
  email: string; // EMAIL_ADDRESS
  trucks: number; // TRUCK_UNITS
  powerUnits: number; // POWER_UNITS
  drivers: number; // TOTAL_DRIVERS
  officer: string; // COMPANY_OFFICER_1
  city: string; // PHY_CITY
  state: string; // PHY_STATE
  zip: string; // PHY_ZIP
  carrierOperation: string; // Raw CARRIER_OPERATION
  interstateBeyond100: string; // INTERSTATE_BEYOND_100_MILES
  interstateWithin100: string; // INTERSTATE_WITHIN_100_MILES
  authorityStatus: string; // DOCKET1_STATUS_CODE or STATUS_CODE
  recordDate: string; // Raw date from ADD_DATE or AUTH_GRANT_DATE
  recordDateType: string; // Name of date column (e.g., 'ADD_DATE')
}

export interface FmcsaFilterConfig {
  minTrucks: number;
  maxTrucks: number;
  activeOnly: boolean;
  interstateOnly: boolean;
  forHireOnly: boolean;
  phoneRequired: boolean;
  emailRequired: boolean;
  selectedState: string; // 'ALL' or 2-letter state code
  // Configurable for-hire operation codes (e.g., ['A', 'B'])
  forHireCodes: string[];
  // Allowed active status codes (e.g., ['A', 'ACTIVE'])
  activeStatusCodes: string[];
  // Fix 3: Deduplicate by USDOT (default: true)
  deduplicateDot: boolean;
  // Fix 4: Encoding selection (auto, utf-8, windows-1252)
  encoding: SupportedEncoding;
  // New MC / New Authority Filter
  authorityDateOption: AuthorityDateOption;
  customStartDate?: string;
  customEndDate?: string;
}

export interface ProcessingMetrics {
  status: 'idle' | 'processing' | 'paused' | 'completed' | 'cancelled' | 'error';
  totalBytes: number;
  processedBytes: number;
  percentage: number;
  totalRowsProcessed: number;
  matchingLeadsCount: number;
  skippedRowsCount: number;
  deduplicatedCount: number;
  excludedMissingDateCount: number;
  rowsPerSecond: number;
  bytesPerSecond: number;
  estimatedRemainingSeconds: number;
  elapsedSeconds: number;
  discoveredOperationCodes: Record<string, number>;
  detectedEncoding?: string;
  authorityDateLabel?: string;
  dateFieldName?: string;
  errorMessage?: string;
}

export interface WorkerInMessage {
  type: 'START' | 'CANCEL';
  file?: File;
  filters?: FmcsaFilterConfig;
  resolvedEncoding?: string;
  maxPreviewLeads?: number;
}

export interface WorkerOutMessage {
  type: 'PROGRESS' | 'CHUNK_MATCHES' | 'COMPLETE' | 'CANCELLED' | 'ERROR';
  metrics?: Partial<ProcessingMetrics>;
  newMatches?: FmcsaLead[];
  discoveredCodes?: Record<string, number>;
  error?: string;
  totalMatches?: number;
}

