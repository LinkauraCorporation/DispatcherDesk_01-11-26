import { LoadWithRelations } from '../loads/loadTypes.ts';
import { Load } from '../../types/domain.types.ts';
import { formatInTimezone, DEFAULT_OPERATIONAL_TIMEZONE } from '../../lib/timezones.ts';

export type CheckCallType =
  | 'dispatch'
  | 'en_route_pickup'
  | 'arrived_pickup'
  | 'loaded'
  | 'en_route_delivery'
  | 'arrived_delivery'
  | 'delivered'
  | 'delay'
  | 'breakdown'
  | 'other';

export type CheckCallOperationalStatus =
  | 'on_time'
  | 'delayed'
  | 'at_risk'
  | 'completed';

/**
 * Authoritative check whether a check-call type represents departure from pickup facility.
 * In DispatcherDesk:
 * - 'loaded': Loaded / Departed Shipper
 * - 'en_route_delivery': En Route to Delivery
 */
export function isPickupDepartureCheckCall(callType?: string | null): boolean {
  if (!callType) return false;
  return callType === 'loaded' || callType === 'en_route_delivery';
}

export interface CheckCall {
  id: string;
  organization_id: string;
  load_id: string;

  call_type: CheckCallType;
  status: CheckCallOperationalStatus;

  location_city: string | null;
  location_state: string | null;

  latitude: number | null;
  longitude: number | null;

  eta_pickup: string | null;
  eta_delivery: string | null;

  notes: string | null;

  created_by: string;
  event_at: string;
  created_at: string;
  updated_at: string;
}

export interface CheckCallWithRelations extends CheckCall {
  load?: LoadWithRelations | null;
}

export interface CreateCheckCallInput {
  load_id: string;
  call_type: CheckCallType;
  status: CheckCallOperationalStatus;
  event_at?: string | null;
  location_city?: string | null;
  location_state?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  eta_pickup?: string | null;
  eta_delivery?: string | null;
  notes?: string | null;
  created_by?: string;
}

export interface UpdateCheckCallInput {
  call_type?: CheckCallType;
  status?: CheckCallOperationalStatus;
  event_at?: string | null;
  location_city?: string | null;
  location_state?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  eta_pickup?: string | null;
  eta_delivery?: string | null;
  notes?: string | null;
}

export interface CheckCallFilters {
  loadId?: string;
  callType?: CheckCallType | 'all';
  status?: CheckCallOperationalStatus | 'all';
  search?: string;
  dateRange?: string;
  hasException?: boolean;
}

export interface LoadTrackingSummary {
  latestCheckCall: CheckCall | null;
  totalCheckCalls: number;
  currentStatus: CheckCallOperationalStatus | null;
  currentLocation: string | null;
  etaPickup: string | null;
  etaDelivery: string | null;
  lastUpdated: string | null;
  timeSinceLastUpdate: string;
  hasException: boolean;
  isMissingRecentCheckIn: boolean;
}

export interface TrackingStats {
  totalCheckCalls: number;
  activeLoadsTrackingCount: number;
  onTimeCount: number;
  delayedCount: number;
  atRiskCount: number;
  exceptionsCount: number;
  missingRecentCheckInCount: number;
}

export const CHECK_CALL_TYPE_LABELS: Record<CheckCallType, string> = {
  dispatch: 'Initial Dispatch',
  en_route_pickup: 'En Route to Pickup',
  arrived_pickup: 'Arrived at Pickup',
  loaded: 'Loaded / Departed Shipper',
  en_route_delivery: 'En Route to Delivery',
  arrived_delivery: 'Arrived at Delivery',
  delivered: 'Delivered / Empty',
  delay: 'Traffic / Weather Delay',
  breakdown: 'Mechanical Breakdown',
  other: 'General Status Check',
};

export const CHECK_CALL_TYPE_SHORT_LABELS: Record<CheckCallType, string> = {
  dispatch: 'Dispatched',
  en_route_pickup: 'En Route PU',
  arrived_pickup: 'At Pickup',
  loaded: 'Loaded',
  en_route_delivery: 'En Route DEL',
  arrived_delivery: 'At Delivery',
  delivered: 'Delivered',
  delay: 'Delay Alert',
  breakdown: 'Breakdown',
  other: 'Check-In',
};

export const CHECK_CALL_STATUS_LABELS: Record<CheckCallOperationalStatus, string> = {
  on_time: 'On Time',
  delayed: 'Delayed',
  at_risk: 'At Risk',
  completed: 'Completed',
};

export const CHECK_CALL_STATUS_BADGES: Record<
  CheckCallOperationalStatus,
  { label: string; bg: string; text: string; border: string; dot: string }
> = {
  on_time: {
    label: 'On Time',
    bg: 'bg-emerald-950/70',
    text: 'text-emerald-300',
    border: 'border-emerald-800/60',
    dot: 'bg-emerald-400',
  },
  delayed: {
    label: 'Delayed',
    bg: 'bg-rose-950/70',
    text: 'text-rose-300',
    border: 'border-rose-800/60',
    dot: 'bg-rose-400',
  },
  at_risk: {
    label: 'At Risk',
    bg: 'bg-amber-950/70',
    text: 'text-amber-300',
    border: 'border-amber-800/60',
    dot: 'bg-amber-400',
  },
  completed: {
    label: 'Completed',
    bg: 'bg-indigo-950/70',
    text: 'text-indigo-300',
    border: 'border-indigo-800/60',
    dot: 'bg-indigo-400',
  },
};

/**
 * Compares scheduled delivery against reported delivery ETA.
 * Returns true only when reported delivery ETA is strictly after scheduled delivery.
 */
export function isDeliveryEtaDelayed(
  scheduledDelivery?: string | null,
  reportedEtaDelivery?: string | null
): boolean {
  if (!scheduledDelivery || !reportedEtaDelivery) {
    return false;
  }
  const scheduledMs = new Date(scheduledDelivery).getTime();
  const etaMs = new Date(reportedEtaDelivery).getTime();
  if (isNaN(scheduledMs) || isNaN(etaMs)) {
    return false;
  }
  return etaMs > scheduledMs;
}

/**
 * Checks if a call type, status, or ETA variance represents an operational exception.
 */
export function isOperationalException(
  callType: CheckCallType,
  status?: CheckCallOperationalStatus,
  scheduledDelivery?: string | null,
  reportedEtaDelivery?: string | null
): boolean {
  if (callType === 'delay' || callType === 'breakdown' || status === 'delayed' || status === 'at_risk') {
    return true;
  }
  return isDeliveryEtaDelayed(scheduledDelivery, reportedEtaDelivery);
}

/**
 * Format relative elapsed time since a given ISO timestamp.
 */
export function formatTimeSince(isoDate: string | null | undefined, timeZone = DEFAULT_OPERATIONAL_TIMEZONE): string {
  if (!isoDate) return 'No check-ins';
  const timestamp = new Date(isoDate).getTime();
  if (isNaN(timestamp)) return 'Unknown';

  const diffMs = Date.now() - timestamp;
  if (diffMs < 0) return 'Just now';

  const diffMinutes = Math.floor(diffMs / 60000);
  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;

  return formatInTimezone(isoDate, timeZone, {
    includeDate: true,
    includeTime: false,
    includeTimezoneCode: false,
  });
}
