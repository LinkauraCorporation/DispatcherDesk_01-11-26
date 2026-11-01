import { Broker, CreditStatus } from '../../types/domain.types.ts';

export type BrokerStatus = 'active' | 'inactive';

export interface BrokerPerformanceMetrics {
  loads_count: number;
  total_gross: number;
  avg_rpm: number;
  active_loads_count: number;
  last_booked_at: string | null;
  payment_terms_avg_days: number;
}

export interface BrokerWithPerformance extends Broker {
  performance?: BrokerPerformanceMetrics;
  status?: BrokerStatus;
}

export interface CreateBrokerInput {
  company_name: string;
  mc_number?: string | null;
  dot_number?: string | null;
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  payment_terms_days: number;
  credit_status: CreditStatus;
  notes?: string | null;
  status?: BrokerStatus;
}

export interface UpdateBrokerInput {
  company_name?: string;
  mc_number?: string | null;
  dot_number?: string | null;
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  payment_terms_days?: number;
  credit_status?: CreditStatus;
  notes?: string | null;
  status?: BrokerStatus;
}

export interface BrokerFilterCriteria {
  search?: string;
  creditStatus?: CreditStatus | 'all';
  status?: BrokerStatus | 'all';
  sortBy?: 'newest' | 'oldest' | 'company_asc' | 'company_desc' | 'payment_terms' | 'total_gross';
}

export const CREDIT_STATUS_OPTIONS: {
  value: CreditStatus;
  label: string;
  badgeLabel: string;
  description: string;
  color: 'emerald' | 'amber' | 'sky' | 'rose';
  riskLevel: 'Low' | 'Moderate' | 'Factoring Assignment' | 'High / DNU';
}[] = [
  {
    value: 'approved',
    label: 'Approved Credit',
    badgeLabel: 'Approved',
    description: 'Clean credit rating. Approved for direct invoicing or standard factoring.',
    color: 'emerald',
    riskLevel: 'Low',
  },
  {
    value: 'caution',
    label: 'Caution / Slow Pay',
    badgeLabel: 'Caution',
    description: 'Delayed payment history or high DSO reported. Dispatch with vigilance.',
    color: 'amber',
    riskLevel: 'Moderate',
  },
  {
    value: 'factoring_only',
    label: 'Factoring Only Required',
    badgeLabel: 'Factoring Only',
    description: 'Approved only with factoring assignment verification (NO direct credit).',
    color: 'sky',
    riskLevel: 'Factoring Assignment',
  },
  {
    value: 'blocked',
    label: 'Blocked / Do Not Use (DNU)',
    badgeLabel: 'Blocked / DNU',
    description: 'Do Not Use (DNU). Severe payment default, bad debt, or brokerage fraud risk.',
    color: 'rose',
    riskLevel: 'High / DNU',
  },
];

export const BROKER_STATUS_OPTIONS: {
  value: BrokerStatus;
  label: string;
}[] = [
  { value: 'active', label: 'Active Partner' },
  { value: 'inactive', label: 'Inactive / Archived' },
];

/**
 * Format an MC Number consistently as MC-XXXXXX
 */
export function formatMcNumber(mc: string | null | undefined): string {
  if (!mc) return '—';
  const clean = mc.replace(/[^0-9]/g, '');
  return clean ? `MC-${clean}` : mc;
}

/**
 * Format a USDOT Number consistently as USDOT XXXXXXX
 */
export function formatDotNumber(dot: string | null | undefined): string {
  if (!dot) return '—';
  const clean = dot.replace(/[^0-9]/g, '');
  return clean ? `USDOT ${clean}` : dot;
}

/**
 * Strips formatting for storage
 */
export function cleanIdentifier(idStr: string): string {
  return idStr.replace(/[^0-9]/g, '').trim();
}

/**
 * Email format validator
 */
export function isValidEmail(email: string): boolean {
  if (!email) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}
