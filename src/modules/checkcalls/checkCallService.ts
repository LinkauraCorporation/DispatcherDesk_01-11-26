import { Load } from '../../types/domain.types.ts';
import { LoadWithRelations } from '../loads/loadTypes.ts';
import { loadService } from '../loads/loadService.ts';
import { supabase, isSupabaseConfigured } from '../../lib/supabase.ts';
import {
  CheckCall,
  CheckCallWithRelations,
  CheckCallType,
  CHECK_CALL_TYPE_LABELS,
  CreateCheckCallInput,
  UpdateCheckCallInput,
  CheckCallFilters,
  LoadTrackingSummary,
  TrackingStats,
  isOperationalException,
  isDeliveryEtaDelayed,
  formatTimeSince,
  isPickupDepartureCheckCall,
} from './checkCallTypes.ts';

/**
 * Authoritative list of physical transit movement and progress check-call types.
 * Per Operational Rule B: These cannot be logged for a load if its assigned truck
 * is already running another load in 'in_transit' status.
 */
export const PHYSICAL_PROGRESS_CALL_TYPES: readonly CheckCallType[] = [
  'dispatch',
  'en_route_pickup',
  'arrived_pickup',
  'loaded',
  'en_route_delivery',
  'arrived_delivery',
  'delivered',
] as const;

const CHECK_CALLS_STORAGE_PREFIX = 'dispatchdesk_demo_check_calls_';

export const DEMO_ORGANIZATION_ID = 'demo-org-1';

const KNOWN_DEMO_CHECK_CALL_IDS = new Set([
  'demo-checkcall-1',
  'demo-checkcall-2',
  'demo-checkcall-3',
  'demo-checkcall-4',
  'demo-checkcall-5',
  'demo-checkcall-6',
]);

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUUID(str?: string | null): boolean {
  return Boolean(str && UUID_REGEX.test(str.trim()));
}

/**
 * Determines whether a load is in scope for active check-in tracking & stale evaluation.
 * - in_transit: always in scope (tracked)
 * - booked + pickup_datetime <= now: in scope (tracked)
 * - booked + pickup_datetime > now: NOT in scope (future pickup, not tracked)
 * - booked + no pickup_datetime: in scope (existing behavior preserved)
 * - all other statuses: NOT in scope
 */
export function isLoadActiveForCheckInTracking(load: {
  pipeline_status: string;
  pickup_datetime?: string | null;
}): boolean {
  if (load.pipeline_status === 'in_transit') {
    return true;
  }
  if (load.pipeline_status === 'booked') {
    if (!load.pickup_datetime) {
      return true;
    }
    const pickupTime = new Date(load.pickup_datetime).getTime();
    if (isNaN(pickupTime)) {
      return true;
    }
    return pickupTime <= Date.now();
  }
  return false;
}

// Initial realistic seed check calls for demo organization
const SEED_CHECK_CALLS: Omit<CheckCall, 'organization_id'>[] = [
  {
    id: 'demo-checkcall-1',
    load_id: 'demo-load-1', // LD-2024-8841 (booked)
    call_type: 'dispatch',
    status: 'on_time',
    location_city: 'Dallas',
    location_state: 'TX',
    latitude: 32.7767,
    longitude: -96.7970,
    eta_pickup: new Date(Date.now() + 18 * 3600000).toISOString(),
    eta_delivery: new Date(Date.now() + 48 * 3600000).toISOString(),
    notes: 'Driver Marcus Vance confirmed rate confirmation, booked appointment at Gate 4. Pre-trip inspection clean.',
    created_by: 'Alex Rivera (Dispatcher)',
    event_at: new Date(Date.now() - 16 * 3600000).toISOString(),
    created_at: new Date(Date.now() - 16 * 3600000).toISOString(),
    updated_at: new Date(Date.now() - 16 * 3600000).toISOString(),
  },
  {
    id: 'demo-checkcall-2',
    load_id: 'demo-load-2', // LD-2024-8842 (in_transit)
    call_type: 'dispatch',
    status: 'on_time',
    location_city: 'Memphis',
    location_state: 'TN',
    latitude: 35.1495,
    longitude: -90.0490,
    eta_pickup: new Date(Date.now() - 14 * 3600000).toISOString(),
    eta_delivery: new Date(Date.now() + 14 * 3600000).toISOString(),
    notes: 'Driver Elena Rostova dispatched to shipper facility with pre-cooled reefer at 34°F.',
    created_by: 'Alex Rivera (Dispatcher)',
    event_at: new Date(Date.now() - 20 * 3600000).toISOString(),
    created_at: new Date(Date.now() - 20 * 3600000).toISOString(),
    updated_at: new Date(Date.now() - 20 * 3600000).toISOString(),
  },
  {
    id: 'demo-checkcall-3',
    load_id: 'demo-load-2', // LD-2024-8842 (in_transit)
    call_type: 'loaded',
    status: 'on_time',
    location_city: 'Memphis',
    location_state: 'TN',
    latitude: 35.1495,
    longitude: -90.0490,
    eta_pickup: new Date(Date.now() - 12 * 3600000).toISOString(),
    eta_delivery: new Date(Date.now() + 14 * 3600000).toISOString(),
    notes: '22 pallets of chilled yogurt loaded and secured. Seal #774921 applied. Clean signed BOL in hand.',
    created_by: 'Elena Rostova (Driver)',
    event_at: new Date(Date.now() - 11 * 3600000).toISOString(),
    created_at: new Date(Date.now() - 11 * 3600000).toISOString(),
    updated_at: new Date(Date.now() - 11 * 3600000).toISOString(),
  },
  {
    id: 'demo-checkcall-4',
    load_id: 'demo-load-2', // LD-2024-8842 (in_transit)
    call_type: 'en_route_delivery',
    status: 'on_time',
    location_city: 'Knoxville',
    location_state: 'TN',
    latitude: 35.9606,
    longitude: -83.9207,
    eta_pickup: null,
    eta_delivery: new Date(Date.now() + 12 * 3600000).toISOString(),
    notes: 'Passing Knoxville on I-40 East. Reefer continuous at 36°F. On schedule for Charlotte receiver dock appointment.',
    created_by: 'Elena Rostova (Driver)',
    event_at: new Date(Date.now() - 2 * 3600000).toISOString(),
    created_at: new Date(Date.now() - 2 * 3600000).toISOString(),
    updated_at: new Date(Date.now() - 2 * 3600000).toISOString(),
  },
  {
    id: 'demo-checkcall-5',
    load_id: 'demo-load-4', // LD-2024-8844 (delivered)
    call_type: 'delivered',
    status: 'completed',
    location_city: 'Phoenix',
    location_state: 'AZ',
    latitude: 33.4484,
    longitude: -112.0740,
    eta_pickup: null,
    eta_delivery: new Date(Date.now() - 10 * 3600000).toISOString(),
    notes: 'Delivered and unloaded at Phoenix Cold Logistics dock 14. Signed & stamped POD received with no OS&D shortages.',
    created_by: 'David Chen (Driver)',
    event_at: new Date(Date.now() - 10 * 3600000).toISOString(),
    created_at: new Date(Date.now() - 10 * 3600000).toISOString(),
    updated_at: new Date(Date.now() - 10 * 3600000).toISOString(),
  },
];

export type CheckCallSubscriber = (loadId: string) => void;

export interface ICheckCallService {
  getCheckCalls(organizationId: string, loadId?: string, filters?: CheckCallFilters): Promise<CheckCall[]>;
  getCheckCallsWithRelations(organizationId: string, loadId?: string, filters?: CheckCallFilters): Promise<CheckCallWithRelations[]>;
  getCheckCall(organizationId: string, checkCallId: string): Promise<CheckCall | null>;
  createCheckCall(organizationId: string, payload: CreateCheckCallInput): Promise<CheckCall>;
  updateCheckCall(organizationId: string, checkCallId: string, payload: UpdateCheckCallInput): Promise<CheckCall>;
  deleteCheckCall(organizationId: string, checkCallId: string): Promise<void>;
  getLatestCheckCall(organizationId: string, loadId: string): Promise<CheckCall | null>;
  getTrackingSummaryForLoad(organizationId: string, load: Load | LoadWithRelations): Promise<LoadTrackingSummary>;
  getTrackingStats(organizationId: string): Promise<TrackingStats>;
  getLoadsMissingRecentCheckIn(organizationId: string): Promise<LoadWithRelations[]>;
  subscribeToLoadTracking(loadId?: string | null, callback?: (updatedLoadId: string) => void): () => void;
  notifySubscribers(loadId: string): void;
}

class CheckCallService implements ICheckCallService {
  private subscribers: Set<CheckCallSubscriber> = new Set();

  public subscribeToLoadTracking(
    loadId?: string | null,
    callback?: (updatedLoadId: string) => void
  ): () => void {
    const listener: CheckCallSubscriber = (updatedLoadId) => {
      if (!loadId || updatedLoadId === loadId) {
        callback?.(updatedLoadId);
      }
    };
    this.subscribers.add(listener);
    return () => {
      this.subscribers.delete(listener);
    };
  }

  public notifySubscribers(loadId: string): void {
    this.subscribers.forEach((cb) => {
      try {
        cb(loadId);
      } catch (err) {
        console.error('[CheckCallService] Error in subscriber:', err);
      }
    });
  }
  private getStorageKey(organizationId: string): string {
    return `${CHECK_CALLS_STORAGE_PREFIX}${organizationId}`;
  }

  private readRawCheckCalls(organizationId: string): CheckCall[] {
    if (!organizationId) return [];

    const isDemoOrg = organizationId === DEMO_ORGANIZATION_ID || !isUUID(organizationId);

    try {
      const raw = localStorage.getItem(this.getStorageKey(organizationId));
      if (!raw) {
        if (isDemoOrg) {
          // Seed default check calls for the initial demo organization
          const seeded: CheckCall[] = SEED_CHECK_CALLS.map((call) => ({
            ...call,
            organization_id: organizationId,
          }));
          this.writeRawCheckCalls(organizationId, seeded);
          return seeded;
        }
        // Non-demo normal UUID organization: NEVER seed demo check calls
        return [];
      }

      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];

      // Guarantee strict tenant isolation and schema validation
      let tenantCalls = parsed.filter((c: CheckCall) => {
        return (
          c &&
          typeof c === 'object' &&
          c.organization_id === organizationId &&
          typeof c.id === 'string' &&
          typeof c.load_id === 'string' &&
          typeof c.call_type === 'string'
        );
      });

      // For normal UUID organizations: sanitize stale demo contamination
      if (!isDemoOrg) {
        const hasContamination = tenantCalls.some(
          (c) =>
            KNOWN_DEMO_CHECK_CALL_IDS.has(c.id) ||
            c.id.startsWith('demo-') ||
            c.load_id.startsWith('demo-')
        );

        if (hasContamination) {
          tenantCalls = tenantCalls.filter(
            (c) =>
              !KNOWN_DEMO_CHECK_CALL_IDS.has(c.id) &&
              !c.id.startsWith('demo-') &&
              !c.load_id.startsWith('demo-')
          );
          this.writeRawCheckCalls(organizationId, tenantCalls);
        }
      }

      return tenantCalls;
    } catch (err) {
      console.error('Error reading check calls from storage:', err);
      return [];
    }
  }

  private writeRawCheckCalls(organizationId: string, calls: CheckCall[]): void {
    if (!organizationId) return;
    try {
      // Ensure all persisted records strictly carry the active organization_id
      const sanitized = calls.filter((c) => c && c.organization_id === organizationId);
      localStorage.setItem(this.getStorageKey(organizationId), JSON.stringify(sanitized));
    } catch (err) {
      console.error('Error saving check calls to storage:', err);
    }
  }

  public async getCheckCalls(
    organizationId: string,
    loadId?: string,
    filters?: CheckCallFilters
  ): Promise<CheckCall[]> {
    if (!organizationId) return [];

    let rawCalls: CheckCall[] = [];
    let isSupabaseAuthoritative = false;

    if (isSupabaseConfigured && isUUID(organizationId)) {
      try {
        let query = (supabase.from('check_calls' as any) as any)
          .select('*')
          .eq('organization_id', organizationId)
          .order('created_at', { ascending: false });

        if (loadId) {
          query = query.eq('load_id', loadId);
        }

        if (filters?.callType && filters.callType !== 'all') {
          query = query.eq('call_type', filters.callType);
        }

        if (filters?.status && filters.status !== 'all') {
          query = query.eq('status', filters.status);
        }

        const { data, error } = await query;

        if (!error && data !== null) {
          rawCalls = (data as unknown) as CheckCall[];
          isSupabaseAuthoritative = true;
        } else if (error) {
          console.warn('Supabase getCheckCalls error, falling back to local storage:', error);
        }
      } catch (err) {
        console.warn('Supabase getCheckCalls failed, falling back to local storage:', err);
      }
    } else if (isSupabaseConfigured) {
      // Non-UUID or demo organization with Supabase configured
      try {
        let query = (supabase.from('check_calls' as any) as any)
          .select('*')
          .eq('organization_id', organizationId)
          .order('created_at', { ascending: false });

        if (loadId) {
          query = query.eq('load_id', loadId);
        }

        if (filters?.callType && filters.callType !== 'all') {
          query = query.eq('call_type', filters.callType);
        }

        if (filters?.status && filters.status !== 'all') {
          query = query.eq('status', filters.status);
        }

        const { data, error } = await query;

        if (!error && data && data.length > 0) {
          rawCalls = (data as unknown) as CheckCall[];
          isSupabaseAuthoritative = true;
        }
      } catch (err) {
        console.warn('Supabase getCheckCalls fallback for demo organization:', err);
      }
    }

    if (!isSupabaseAuthoritative) {
      const all = this.readRawCheckCalls(organizationId);
      let filtered = all;

      if (loadId) {
        filtered = filtered.filter((c) => c.load_id === loadId);
      }

      if (filters?.callType && filters.callType !== 'all') {
        filtered = filtered.filter((c) => c.call_type === filters.callType);
      }

      if (filters?.status && filters.status !== 'all') {
        filtered = filtered.filter((c) => c.status === filters.status);
      }

      rawCalls = filtered;
    }

    // Apply exception filter if set
    if (filters?.hasException) {
      rawCalls = rawCalls.filter((c) => isOperationalException(c.call_type, c.status));
    }

    // Apply search filter if set
    if (filters?.search) {
      const query = filters.search.toLowerCase().trim();
      rawCalls = rawCalls.filter((c) => {
        const cityMatch = c.location_city?.toLowerCase().includes(query) ?? false;
        const stateMatch = c.location_state?.toLowerCase().includes(query) ?? false;
        const notesMatch = c.notes?.toLowerCase().includes(query) ?? false;
        const creatorMatch = c.created_by?.toLowerCase().includes(query) ?? false;
        return cityMatch || stateMatch || notesMatch || creatorMatch;
      });
    }

    // Access control: dispatchers and staff can only see check calls for their assigned loads
    const effectiveRole =
      typeof localStorage !== 'undefined' ? localStorage.getItem('dispatchdesk_current_role') : null;
    if (effectiveRole === 'dispatcher' || effectiveRole === 'staff') {
      const authorizedLoads = await loadService.getLoads(organizationId);
      const authorizedLoadIds = new Set(authorizedLoads.map((l) => l.id));
      rawCalls = rawCalls.filter((c) => authorizedLoadIds.has(c.load_id));
    }

    // Sort newest event first (falls back to created_at)
    return rawCalls.sort((a, b) => new Date(b.event_at || b.created_at).getTime() - new Date(a.event_at || a.created_at).getTime());
  }

  public async getCheckCallsWithRelations(
    organizationId: string,
    loadId?: string,
    filters?: CheckCallFilters
  ): Promise<CheckCallWithRelations[]> {
    const checkCalls = await this.getCheckCalls(organizationId, loadId, filters);
    const loads = await loadService.getLoads(organizationId);
    const loadMap = new Map<string, LoadWithRelations>();
    loads.forEach((l) => loadMap.set(l.id, l));

    return checkCalls.map((call) => ({
      ...call,
      load: loadMap.get(call.load_id) || null,
    }));
  }

  public async getCheckCall(organizationId: string, checkCallId: string): Promise<CheckCall | null> {
    if (!organizationId || !checkCallId) return null;

    if (isSupabaseConfigured && isUUID(checkCallId)) {
      try {
        const { data, error } = await (supabase.from('check_calls' as any) as any)
          .select('*')
          .eq('id', checkCallId)
          .eq('organization_id', organizationId)
          .maybeSingle();

        if (!error && data) {
          return (data as unknown) as CheckCall;
        }
      } catch (err) {
        console.warn('Supabase getCheckCall failed, falling back to local storage:', err);
      }
    }

    const all = this.readRawCheckCalls(organizationId);
    const found = all.find((c) => c.id === checkCallId && c.organization_id === organizationId) || null;

    if (found) {
      const effectiveRole =
        typeof localStorage !== 'undefined' ? localStorage.getItem('dispatchdesk_current_role') : null;
      if (effectiveRole === 'dispatcher' || effectiveRole === 'staff') {
        const authorizedLoad = await loadService.getLoadById(organizationId, found.load_id);
        if (!authorizedLoad) return null;
      }
    }

    return found;
  }

  public async createCheckCall(organizationId: string, payload: CreateCheckCallInput): Promise<CheckCall> {
    if (!organizationId) {
      throw new Error('Organization ID is required to create a check call.');
    }

    if (!payload.load_id) {
      throw new Error('A valid load_id is required.');
    }

    // Verify tenant boundary: load must exist and belong to the same organization
    const targetLoad = await loadService.getLoad(organizationId, payload.load_id);
    if (!targetLoad || targetLoad.organization_id !== organizationId) {
      throw new Error('Referenced load does not exist or does not belong to the active organization.');
    }

    // Operational Rule B: Enforce that physical movement/progress check calls cannot be logged
    // if the truck currently has another load in IN TRANSIT status.
    await this.validateOperationalMovementRule(organizationId, targetLoad, payload.call_type);

    // Location validation: city and state must be paired
    const city = payload.location_city?.trim() || null;
    const state = payload.location_state?.trim().toUpperCase() || null;

    if (city && !state) {
      throw new Error('State is required when city is provided.');
    }
    if (state && !city) {
      throw new Error('City is required when state is provided.');
    }
    if (state && state.length !== 2) {
      throw new Error('State must be exactly a 2-letter uppercase postal code.');
    }

    // Exception notes validation
    const isException = payload.call_type === 'delay' || payload.call_type === 'breakdown';
    const notes = payload.notes?.trim() || null;
    if (isException && (!notes || notes.length < 5)) {
      throw new Error('Operational exceptions (delay / breakdown) require descriptive notes (min 5 characters).');
    }

    const createdBy = payload.created_by?.trim() || 'Dispatcher';
    const latitude = typeof payload.latitude === 'number' ? payload.latitude : null;
    const longitude = typeof payload.longitude === 'number' ? payload.longitude : null;
    const etaPickup = payload.eta_pickup || null;
    const etaDelivery = payload.eta_delivery || null;
    const eventAt = payload.event_at ? new Date(payload.event_at).toISOString() : new Date().toISOString();

    let persistedCheckCall: CheckCall | null = null;

    if (isSupabaseConfigured && isUUID(payload.load_id)) {
      try {
        const { data, error } = await (supabase.from('check_calls' as any) as any)
          .insert({
            organization_id: organizationId,
            load_id: payload.load_id,
            call_type: payload.call_type,
            status: payload.status,
            location_city: city,
            location_state: state,
            latitude: latitude,
            longitude: longitude,
            eta_pickup: etaPickup,
            eta_delivery: etaDelivery,
            notes: notes,
            created_by: createdBy,
            event_at: eventAt,
          })
          .select()
          .single();

        if (!error && data) {
          const createdCheckCall = (data as unknown) as CheckCall;
          // Synchronize local cache
          const existing = this.readRawCheckCalls(organizationId);
          this.writeRawCheckCalls(organizationId, [createdCheckCall, ...existing.filter((c) => c.id !== createdCheckCall.id)]);
          persistedCheckCall = createdCheckCall;
        }
      } catch (err) {
        console.warn('Supabase createCheckCall failed, saving locally:', err);
      }
    }

    if (!persistedCheckCall) {
      const now = new Date().toISOString();
      const newCheckCall: CheckCall = {
        id: `checkcall-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        organization_id: organizationId,
        load_id: payload.load_id,
        call_type: payload.call_type,
        status: payload.status,
        location_city: city,
        location_state: state,
        latitude: latitude,
        longitude: longitude,
        eta_pickup: etaPickup,
        eta_delivery: etaDelivery,
        notes: notes,
        created_by: createdBy,
        event_at: eventAt,
        created_at: now,
        updated_at: now,
      };

      const existing = this.readRawCheckCalls(organizationId);
      this.writeRawCheckCalls(organizationId, [newCheckCall, ...existing]);
      persistedCheckCall = newCheckCall;
    }

    // Atomic status advance: if advancing status to IN TRANSIT fails, rollback the created check call
    if (persistedCheckCall) {
      try {
        await this.autoAdvanceLoadToInTransit(organizationId, payload.load_id, persistedCheckCall.call_type);
      } catch (advanceErr) {
        try {
          await this.deleteCheckCall(organizationId, persistedCheckCall.id);
        } catch (rollbackErr) {
          console.warn('[CheckCallService] Failed to rollback check call after auto-advance failure:', rollbackErr);
        }
        throw advanceErr;
      }
    }

    if (persistedCheckCall?.load_id) {
      this.notifySubscribers(persistedCheckCall.load_id);
    }

    return persistedCheckCall;
  }

  /**
   * Authoritative Operational Rule B enforcement:
   * Rejects physical movement/progress check calls on a load if its assigned truck
   * currently has another load in 'in_transit' status.
   */
  private async validateOperationalMovementRule(
    organizationId: string,
    targetLoad: LoadWithRelations,
    callType: CheckCallType
  ): Promise<void> {
    if (!PHYSICAL_PROGRESS_CALL_TYPES.includes(callType) || !targetLoad.truck_id) {
      return;
    }

    let conflictingLoad: { id: string; load_number: string } | null = null;

    if (isSupabaseConfigured && isUUID(organizationId)) {
      try {
        const { data: conflictData, error: conflictErr } = await (supabase.from('loads' as any) as any)
          .select('id, load_number')
          .eq('organization_id', organizationId)
          .eq('truck_id', targetLoad.truck_id)
          .eq('pipeline_status', 'in_transit')
          .neq('id', targetLoad.id)
          .limit(1);

        if (!conflictErr && conflictData && conflictData.length > 0) {
          conflictingLoad = conflictData[0];
        }
      } catch (fetchErr) {
        console.warn('[CheckCallService] Error checking conflicting in-transit loads from Supabase:', fetchErr);
      }
    }

    if (!conflictingLoad) {
      const allLoads = await loadService.getLoads(organizationId);
      const found = allLoads.find(
        (l) =>
          l.truck_id === targetLoad.truck_id &&
          l.pipeline_status === 'in_transit' &&
          l.id !== targetLoad.id
      );
      if (found) {
        conflictingLoad = { id: found.id, load_number: found.load_number };
      }
    }

    if (conflictingLoad) {
      const callTypeLabel = CHECK_CALL_TYPE_LABELS[callType] || callType;
      const truckNumber = targetLoad.truck?.truck_number || 'assigned truck';
      throw new Error(
        `Cannot log "${callTypeLabel}" on Load #${targetLoad.load_number}. Truck "${truckNumber}" currently has Load #${conflictingLoad.load_number} IN TRANSIT. Deliver Load #${conflictingLoad.load_number} before advancing this load.`
      );
    }
  }

  private async autoAdvanceLoadToInTransit(
    organizationId: string,
    loadId: string,
    callType: string
  ): Promise<void> {
    if (isPickupDepartureCheckCall(callType)) {
      const currentTargetLoad = await loadService.getLoad(organizationId, loadId);
      if (currentTargetLoad && currentTargetLoad.pipeline_status === 'booked') {
        try {
          await loadService.updateLoadStatus(organizationId, loadId, 'in_transit');
        } catch (transitionErr) {
          const msg = transitionErr instanceof Error ? transitionErr.message : 'Failed to advance load to in_transit';
          console.error('[CheckCallService] Failed to advance booked load to in_transit:', transitionErr);
          throw new Error(msg);
        }
      }
    }
  }

  public async updateCheckCall(
    organizationId: string,
    checkCallId: string,
    payload: UpdateCheckCallInput
  ): Promise<CheckCall> {
    if (!organizationId || !checkCallId) {
      throw new Error('Organization ID and checkCallId are required.');
    }

    const existing = this.readRawCheckCalls(organizationId);
    const existingIndex = existing.findIndex((c) => c.id === checkCallId && c.organization_id === organizationId);
    const current = existingIndex !== -1 ? existing[existingIndex] : null;

    // Location validation if updated
    const city = payload.location_city !== undefined ? payload.location_city?.trim() || null : current?.location_city || null;
    const state = payload.location_state !== undefined ? payload.location_state?.trim().toUpperCase() || null : current?.location_state || null;

    if (city && !state) {
      throw new Error('State is required when city is provided.');
    }
    if (state && !city) {
      throw new Error('City is required when state is provided.');
    }
    if (state && state.length !== 2) {
      throw new Error('State must be exactly a 2-letter uppercase postal code.');
    }

    const callType = payload.call_type || current?.call_type || 'other';
    const status = payload.status || current?.status || 'on_time';
    const notes = payload.notes !== undefined ? payload.notes?.trim() || null : current?.notes || null;

    if ((callType === 'delay' || callType === 'breakdown') && (!notes || notes.length < 5)) {
      throw new Error('Operational exceptions (delay / breakdown) require descriptive notes (min 5 characters).');
    }

    if (current?.load_id && payload.call_type && payload.call_type !== current.call_type) {
      const targetLoad = await loadService.getLoad(organizationId, current.load_id);
      if (targetLoad) {
        await this.validateOperationalMovementRule(organizationId, targetLoad, payload.call_type);
      }
    }

    if (isSupabaseConfigured && isUUID(checkCallId)) {
      try {
        const updateFields: Record<string, unknown> = {
          updated_at: new Date().toISOString(),
        };

        if (payload.call_type !== undefined) updateFields.call_type = payload.call_type;
        if (payload.status !== undefined) updateFields.status = payload.status;
        if (payload.location_city !== undefined) updateFields.location_city = city;
        if (payload.location_state !== undefined) updateFields.location_state = state;
        if (payload.latitude !== undefined) updateFields.latitude = typeof payload.latitude === 'number' ? payload.latitude : null;
        if (payload.longitude !== undefined) updateFields.longitude = typeof payload.longitude === 'number' ? payload.longitude : null;
        if (payload.eta_pickup !== undefined) updateFields.eta_pickup = payload.eta_pickup || null;
        if (payload.eta_delivery !== undefined) updateFields.eta_delivery = payload.eta_delivery || null;
        if (payload.notes !== undefined) updateFields.notes = notes;
        if (payload.event_at !== undefined) updateFields.event_at = payload.event_at ? new Date(payload.event_at).toISOString() : new Date().toISOString();

        const { data, error } = await (supabase.from('check_calls' as any) as any)
          .update(updateFields)
          .eq('id', checkCallId)
          .eq('organization_id', organizationId)
          .select()
          .single();

        if (!error && data) {
          const updatedCheckCall = (data as unknown) as CheckCall;
          // Synchronize local cache
          if (existingIndex !== -1) {
            existing[existingIndex] = updatedCheckCall;
            this.writeRawCheckCalls(organizationId, existing);
          }
          if (updatedCheckCall.load_id) {
            await this.autoAdvanceLoadToInTransit(organizationId, updatedCheckCall.load_id, updatedCheckCall.call_type);
            this.notifySubscribers(updatedCheckCall.load_id);
          }
          return updatedCheckCall;
        }
      } catch (err) {
        console.warn('Supabase updateCheckCall failed, saving locally:', err);
      }
    }

    if (!current) {
      throw new Error('Check call record not found.');
    }

    const updated: CheckCall = {
      ...current,
      call_type: callType,
      status: status,
      location_city: city,
      location_state: state,
      latitude: payload.latitude !== undefined ? payload.latitude : current.latitude,
      longitude: payload.longitude !== undefined ? payload.longitude : current.longitude,
      eta_pickup: payload.eta_pickup !== undefined ? payload.eta_pickup : current.eta_pickup,
      eta_delivery: payload.eta_delivery !== undefined ? payload.eta_delivery : current.eta_delivery,
      notes: notes,
      event_at: payload.event_at !== undefined ? (payload.event_at ? new Date(payload.event_at).toISOString() : current.event_at) : current.event_at,
      updated_at: new Date().toISOString(),
    };

    existing[existingIndex] = updated;
    this.writeRawCheckCalls(organizationId, existing);

    if (updated.load_id) {
      await this.autoAdvanceLoadToInTransit(organizationId, updated.load_id, updated.call_type);
      this.notifySubscribers(updated.load_id);
    }

    return updated;
  }

  public async deleteCheckCall(organizationId: string, checkCallId: string): Promise<void> {
    if (!organizationId || !checkCallId) return;

    let loadId: string | undefined;
    const existing = this.readRawCheckCalls(organizationId);
    const target = existing.find((c) => c.id === checkCallId && c.organization_id === organizationId);
    if (target?.load_id) {
      loadId = target.load_id;
    } else if (isSupabaseConfigured && isUUID(checkCallId)) {
      try {
        const { data } = await (supabase.from('check_calls' as any) as any)
          .select('load_id')
          .eq('id', checkCallId)
          .maybeSingle();
        if (data?.load_id) {
          loadId = data.load_id;
        }
      } catch {}
    }

    if (isSupabaseConfigured && isUUID(checkCallId)) {
      try {
        const { error } = await (supabase.from('check_calls' as any) as any)
          .delete()
          .eq('id', checkCallId)
          .eq('organization_id', organizationId);
        if (error) {
          console.error('Supabase deleteCheckCall failed:', error);
          throw new Error(error.message || 'Failed to delete check call from database.');
        }
      } catch (err) {
        console.error('Supabase deleteCheckCall exception:', err);
        throw err;
      }
    }

    const filtered = existing.filter((c) => !(c.id === checkCallId && c.organization_id === organizationId));
    this.writeRawCheckCalls(organizationId, filtered);

    if (loadId) {
      this.notifySubscribers(loadId);
    }
  }

  public async getLatestCheckCall(organizationId: string, loadId: string): Promise<CheckCall | null> {
    if (!organizationId || !loadId) return null;
    const calls = await this.getCheckCalls(organizationId, loadId);
    return calls.length > 0 ? calls[0] : null;
  }

  public async getTrackingSummaryForLoad(
    organizationId: string,
    load: Load | LoadWithRelations
  ): Promise<LoadTrackingSummary> {
    const calls = await this.getCheckCalls(organizationId, load.id);
    const latest = calls.length > 0 ? calls[0] : null;

    let currentLocation: string | null = null;
    if (latest?.location_city && latest?.location_state) {
      currentLocation = `${latest.location_city}, ${latest.location_state}`;
    }

    // Determine if load is missing a recent check-in (>24 hours for booked or in_transit)
    const isTracked = isLoadActiveForCheckInTracking(load);
    let isMissingRecentCheckIn = false;

    if (isTracked) {
      if (!latest) {
        isMissingRecentCheckIn = true;
      } else {
        const lastUpdatedMs = new Date(latest.created_at).getTime();
        const twentyFourHoursAgoMs = Date.now() - 24 * 3600000;
        if (lastUpdatedMs < twentyFourHoursAgoMs) {
          isMissingRecentCheckIn = true;
        }
      }
    }

    const isEtaLate = isTracked && isDeliveryEtaDelayed(load.delivery_datetime, latest?.eta_delivery);

    let effectiveStatus = latest?.status || null;
    if (isEtaLate && effectiveStatus === 'on_time') {
      effectiveStatus = 'delayed';
    }

    const hasException = latest
      ? isOperationalException(
          latest.call_type,
          latest.status,
          isTracked ? load.delivery_datetime : null,
          isTracked ? latest.eta_delivery : null
        )
      : false;

    return {
      latestCheckCall: latest,
      totalCheckCalls: calls.length,
      currentStatus: effectiveStatus,
      currentLocation: currentLocation,
      etaPickup: latest?.eta_pickup || load.pickup_datetime || null,
      etaDelivery: latest?.eta_delivery || load.delivery_datetime || null,
      lastUpdated: latest?.created_at || null,
      timeSinceLastUpdate: formatTimeSince(latest?.created_at),
      hasException: hasException,
      isMissingRecentCheckIn: isMissingRecentCheckIn,
    };
  }

  public async getTrackingStats(organizationId: string): Promise<TrackingStats> {
    const [allCalls, allLoads] = await Promise.all([
      this.getCheckCalls(organizationId),
      loadService.getLoads(organizationId),
    ]);

    const activeLoads = allLoads.filter((l) => isLoadActiveForCheckInTracking(l));

    let onTimeCount = 0;
    let delayedCount = 0;
    let atRiskCount = 0;
    let exceptionsCount = 0;
    let missingRecentCheckInCount = 0;

    const twentyFourHoursAgoMs = Date.now() - 24 * 3600000;

    for (const load of activeLoads) {
      const loadCalls = allCalls.filter((c) => c.load_id === load.id);
      const latest = loadCalls.length > 0 ? loadCalls[0] : null;

      if (!latest) {
        missingRecentCheckInCount++;
      } else {
        const lastTime = new Date(latest.created_at).getTime();
        if (lastTime < twentyFourHoursAgoMs) {
          missingRecentCheckInCount++;
        }

        const isEtaLate = isDeliveryEtaDelayed(load.delivery_datetime, latest.eta_delivery);
        let effectiveStatus = latest.status;
        if (isEtaLate && effectiveStatus === 'on_time') {
          effectiveStatus = 'delayed';
        }

        if (effectiveStatus === 'on_time') onTimeCount++;
        else if (effectiveStatus === 'delayed') delayedCount++;
        else if (effectiveStatus === 'at_risk') atRiskCount++;

        if (isOperationalException(latest.call_type, latest.status, load.delivery_datetime, latest.eta_delivery)) {
          exceptionsCount++;
        }
      }
    }

    return {
      totalCheckCalls: allCalls.length,
      activeLoadsTrackingCount: activeLoads.length,
      onTimeCount,
      delayedCount,
      atRiskCount,
      exceptionsCount,
      missingRecentCheckInCount,
    };
  }

  public async getLoadsMissingRecentCheckIn(organizationId: string): Promise<LoadWithRelations[]> {
    const [allLoads, allCalls] = await Promise.all([
      loadService.getLoads(organizationId),
      this.getCheckCalls(organizationId),
    ]);

    const activeLoads = allLoads.filter((l) => isLoadActiveForCheckInTracking(l));

    const twentyFourHoursAgoMs = Date.now() - 24 * 3600000;

    return activeLoads.filter((load) => {
      const loadCalls = allCalls.filter((c) => c.load_id === load.id);
      if (loadCalls.length === 0) return true;
      const latest = loadCalls[0];
      return new Date(latest.created_at).getTime() < twentyFourHoursAgoMs;
    });
  }
}

export const checkCallService = new CheckCallService();

