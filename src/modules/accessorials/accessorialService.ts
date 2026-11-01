import { supabase, isSupabaseConfigured } from '../../lib/supabase.ts';
import {
  AccessorialClaim,
  AccessorialWithLoad,
  AccessorialStatus,
  AccessorialType,
  CreateAccessorialInput,
  UpdateAccessorialInput,
  DetentionCalculationResult,
  AccessorialSummaryStats,
  ACCESSORIAL_TYPE_CONFIG,
  LoadDetentionRecord,
  LoadDetentionRecordInsert,
  LoadDetentionRecordUpdate,
  CreateDetentionRecordInput,
} from './accessorialTypes.ts';
import { loadService } from '../loads/loadService.ts';
import { activityService } from '../activity/activityService.ts';
import { CheckCall } from '../checkcalls/checkCallTypes.ts';
import { LoadWithRelations } from '../loads/loadTypes.ts';

export const DEMO_ORGANIZATION_ID = 'demo-org-1';
const ACCESSORIALS_STORAGE_PREFIX = 'dispatchdesk_demo_accessorials_';
const DETENTION_RECORDS_STORAGE_PREFIX = 'dispatchdesk_demo_detention_records_';
const KNOWN_DEMO_ACCESSORIAL_IDS = new Set(['demo-acc-1', 'demo-acc-2', 'demo-acc-3']);

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUUID(str?: string | null): boolean {
  return Boolean(str && UUID_REGEX.test(str.trim()));
}

/**
 * Pure calculation function for detention time and billing.
 * Preserves reproducible precision with quarter-hour (15-min) standard freight increments.
 */
export function calculateDetention(params: {
  arrivalTime: string;
  departureTime?: string | null;
  freeTimeHours?: number;
  hourlyRate?: number;
  asOfTime?: string | Date;
}): DetentionCalculationResult {
  const freeTimeHours = params.freeTimeHours !== undefined && params.freeTimeHours >= 0 ? params.freeTimeHours : 2.0;
  const hourlyRate = params.hourlyRate !== undefined && params.hourlyRate >= 0 ? params.hourlyRate : 75.0;

  const arrivalMs = new Date(params.arrivalTime).getTime();
  const isDepartureSet = Boolean(params.departureTime);
  const endMs = isDepartureSet
    ? new Date(params.departureTime!).getTime()
    : params.asOfTime
    ? new Date(params.asOfTime).getTime()
    : Date.now();

  const totalDurationMs = Math.max(0, endMs - arrivalMs);
  const totalDurationHours = totalDurationMs / 3600000;

  const freeTimeMs = freeTimeHours * 3600000;
  const detentionStartMs = arrivalMs + freeTimeMs;
  const detentionStartTimeIso = new Date(detentionStartMs).toISOString();

  let rawDetentionHours = 0;
  let billableHours = 0;
  let totalAmount = 0;
  let isWithinFreeTime = true;
  let timeRemainingInFreeTimeMs = 0;

  if (totalDurationMs > freeTimeMs) {
    isWithinFreeTime = false;
    rawDetentionHours = (totalDurationMs - freeTimeMs) / 3600000;
    // Standard US freight rule: 15-minute (0.25 hr) increments, minimum 0.25 hr once detention begins
    billableHours = Math.max(0.25, Math.ceil(rawDetentionHours * 4) / 4);
    totalAmount = billableHours * hourlyRate;
  } else {
    isWithinFreeTime = true;
    timeRemainingInFreeTimeMs = freeTimeMs - totalDurationMs;
  }

  const isActiveDetention = !isDepartureSet && !isWithinFreeTime;

  // Format readable strings
  const totalHoursInt = Math.floor(totalDurationHours);
  const totalMinsInt = Math.floor((totalDurationHours - totalHoursInt) * 60);
  const formattedDuration = `${totalHoursInt}h ${totalMinsInt}m`;

  const billableHoursInt = Math.floor(billableHours);
  const billableMinsInt = Math.round((billableHours - billableHoursInt) * 60);
  const formattedBillableTime = billableHours > 0 ? `${billableHoursInt}h ${billableMinsInt}m` : '0h 0m';

  return {
    totalDurationMs,
    totalDurationHours,
    freeTimeHours,
    freeTimeMs,
    detentionStartTimeIso,
    rawDetentionHours,
    billableHours,
    hourlyRate,
    totalAmount,
    isWithinFreeTime,
    isActiveDetention,
    timeRemainingInFreeTimeMs,
    formattedDuration,
    formattedBillableTime,
  };
}

// Initial realistic seed accessorials for demo organizations
const SEED_ACCESSORIALS: Omit<AccessorialClaim, 'organization_id'>[] = [
  {
    id: 'demo-acc-1',
    load_id: 'demo-load-2', // LD-2024-8842 (in_transit - Memphis to Charlotte)
    type: 'detention',
    status: 'submitted_to_broker',
    description: 'Driver detained at Memphis Shipper dock 4 hours during pallet re-stacking.',
    amount: 150.0,
    currency: 'USD',
    detention_details: {
      facility_type: 'pickup',
      facility_name: 'Memphis Cold Logistics Hub',
      facility_address: '4920 Airways Blvd, Memphis, TN',
      facility_timezone: 'America/Chicago',
      appointment_time: new Date(Date.now() - 14 * 3600000).toISOString(),
      arrival_time: new Date(Date.now() - 14 * 3600000).toISOString(),
      departure_time: new Date(Date.now() - 10 * 3600000).toISOString(),
      free_time_hours: 2.0,
      hourly_rate: 75.0,
      billable_hours: 2.0,
      is_active_detention: false,
      auto_synced_from_checkcall_id: 'demo-checkcall-2',
    },
    broker_name: 'Apex Logistics Freight LLC',
    broker_contact_person: 'Sarah Jenkins',
    broker_contact_email: 'sarah.jenkins@apexlogistics.com',
    broker_contact_phone: '(214) 555-0182',
    rate_con_revision_number: null,
    requested_by_id: 'usr-alex-1',
    requested_by_name: 'Alex Rivera (Dispatcher)',
    submitted_at: new Date(Date.now() - 8 * 3600000).toISOString(),
    notes: 'Submitted stamped BOL showing in-gate 06:00 AM and out-gate 10:00 AM. Broker acknowledged email.',
    created_at: new Date(Date.now() - 9 * 3600000).toISOString(),
    updated_at: new Date(Date.now() - 8 * 3600000).toISOString(),
  },
  {
    id: 'demo-acc-2',
    load_id: 'demo-load-4', // LD-2024-8844 (delivered - Houston to Phoenix)
    type: 'lumper',
    status: 'approved_on_rate_con',
    description: 'Receiver required third-party lumper service for floor-unloaded frozen cartons.',
    amount: 185.0,
    currency: 'USD',
    payment_method: 'comchek',
    receipt_number: 'LUMP-778219-PHX',
    receipt_doc_name: 'Phoenix_Lumper_Receipt_8844.pdf',
    broker_name: 'LoneStar Express LLC',
    broker_contact_person: 'Carmen Delgado',
    broker_contact_email: 'carmen@lonestarexpress.com',
    rate_con_revision_number: 'RC-8844-REV2',
    requested_by_id: 'usr-alex-1',
    requested_by_name: 'Alex Rivera (Dispatcher)',
    submitted_at: new Date(Date.now() - 24 * 3600000).toISOString(),
    approved_at: new Date(Date.now() - 20 * 3600000).toISOString(),
    notes: 'Revised Rate Confirmation RC-8844-REV2 received with $185 lumper reimbursement added to line haul.',
    created_at: new Date(Date.now() - 26 * 3600000).toISOString(),
    updated_at: new Date(Date.now() - 20 * 3600000).toISOString(),
  },
  {
    id: 'demo-acc-3',
    load_id: 'demo-load-3', // LD-2024-8843 (negotiating)
    type: 'layover',
    status: 'draft',
    description: 'Shipper facility power outage delayed loading past Friday weekend cutoff.',
    amount: 250.0,
    currency: 'USD',
    broker_name: 'Coyote Logistics Partner',
    broker_contact_person: 'Broker Desk',
    requested_by_id: 'usr-alex-1',
    requested_by_name: 'Alex Rivera (Dispatcher)',
    notes: 'Prepared claim letter for Monday morning re-dispatch negotiation.',
    created_at: new Date(Date.now() - 12 * 3600000).toISOString(),
    updated_at: new Date(Date.now() - 12 * 3600000).toISOString(),
  },
];

const SEED_DETENTION_RECORDS: Omit<LoadDetentionRecord, 'organization_id'>[] = [
  {
    id: 'demo-det-1',
    load_id: 'demo-load-2',
    facility_type: 'pickup',
    facility_name: 'Mid-South Cold Logistics',
    facility_address: '890 Riverside Dr, Memphis, TN',
    facility_timezone: 'America/Chicago',
    appointment_time: new Date(Date.now() - 14 * 3600000).toISOString(),
    arrival_time: new Date(Date.now() - 13 * 3600000).toISOString(),
    loading_start_time: new Date(Date.now() - 12.5 * 3600000).toISOString(),
    loading_complete_time: new Date(Date.now() - 11.5 * 3600000).toISOString(),
    unloading_start_time: null,
    unloading_complete_time: null,
    departure_time: new Date(Date.now() - 11.2 * 3600000).toISOString(),
    free_time_hours: 2.0,
    hourly_rate: 75.0,
    detention_start_time: new Date(Date.now() - 11 * 3600000).toISOString(),
    billable_hours: 0.25,
    detention_amount: 18.75,
    is_active_detention: false,
    status: 'draft',
    check_call_id: 'demo-checkcall-2',
    notes: 'Shipper dock forklift breakdown resulted in 2h 10m dwell. Driver out-gated at 11.2h ago.',
    created_by: null,
    created_at: new Date(Date.now() - 11 * 3600000).toISOString(),
    updated_at: new Date(Date.now() - 11 * 3600000).toISOString(),
  },
];

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch (err) {
    console.error(`Error loading storage for key ${key}:`, err);
    return fallback;
  }
}

function saveToStorage<T>(key: string, data: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (err) {
    console.error(`Error saving storage for key ${key}:`, err);
  }
}

export interface IAccessorialService {
  getAccessorials(
    organizationId: string,
    filters?: { loadId?: string; status?: AccessorialStatus; type?: AccessorialType; search?: string }
  ): Promise<AccessorialWithLoad[]>;
  getAccessorialById(organizationId: string, id: string): Promise<AccessorialWithLoad | null>;
  getAccessorialsByLoadId(organizationId: string, loadId: string): Promise<AccessorialWithLoad[]>;
  getActiveDetentions(organizationId: string): Promise<AccessorialWithLoad[]>;
  getAccessorialStats(organizationId: string): Promise<AccessorialSummaryStats>;
  createAccessorial(
    organizationId: string,
    input: CreateAccessorialInput,
    actorName?: string,
    actorId?: string
  ): Promise<AccessorialClaim>;
  updateAccessorial(
    organizationId: string,
    id: string,
    input: UpdateAccessorialInput,
    actorName: string,
    actorId: string
  ): Promise<AccessorialClaim>;
  updateAccessorialStatus(
    organizationId: string,
    id: string,
    status: AccessorialStatus,
    actorName: string,
    actorId: string,
    metadata?: { rejection_reason?: string; rate_con_revision_number?: string; notes?: string }
  ): Promise<AccessorialClaim>;
  deleteAccessorial(organizationId: string, id: string, actorName: string, actorId: string): Promise<void>;
  createDetentionFromCheckCall(
    organizationId: string,
    checkCall: CheckCall,
    load: LoadWithRelations,
    actorName: string,
    actorId: string
  ): Promise<AccessorialClaim>;

  // PostgreSQL-backed Load Detention Records API
  getDetentionRecords(organizationId: string, loadId?: string): Promise<LoadDetentionRecord[]>;
  getDetentionRecordById(organizationId: string, id: string): Promise<LoadDetentionRecord | null>;
  createDetentionRecord(organizationId: string, input: CreateDetentionRecordInput): Promise<LoadDetentionRecord>;
  updateDetentionRecord(organizationId: string, id: string, input: LoadDetentionRecordUpdate): Promise<LoadDetentionRecord>;
  deleteDetentionRecord(organizationId: string, id: string): Promise<void>;
}

class AccessorialService implements IAccessorialService {
  private ensureInitialized(organizationId: string): AccessorialClaim[] {
    if (!organizationId) {
      return [];
    }

    const key = `${ACCESSORIALS_STORAGE_PREFIX}${organizationId}`;
    const rawStored = localStorage.getItem(key);

    // Dedicated Demo Organization: seed once if storage is uninitialized
    if (organizationId === DEMO_ORGANIZATION_ID) {
      if (!rawStored) {
        const claims = SEED_ACCESSORIALS.map((c) => ({
          ...c,
          organization_id: organizationId,
        }));
        saveToStorage(key, claims);
        return claims;
      }
      return loadFromStorage<AccessorialClaim[]>(key, []);
    }

    // Non-Demo Organizations: NEVER inject demo seeds
    if (!rawStored) {
      return [];
    }

    let claims = loadFromStorage<AccessorialClaim[]>(key, []);
    if (!Array.isArray(claims) || claims.length === 0) {
      return [];
    }

    // Detect and clean up known demo IDs (demo-acc-1, demo-acc-2, demo-acc-3) from earlier runs
    const hasDemoClaims = claims.some((c) => KNOWN_DEMO_ACCESSORIAL_IDS.has(c.id));
    if (hasDemoClaims) {
      claims = claims.filter((c) => !KNOWN_DEMO_ACCESSORIAL_IDS.has(c.id));
      saveToStorage(key, claims);
    }

    return claims;
  }

  async getAccessorials(
    organizationId: string,
    filters?: { loadId?: string; status?: AccessorialStatus; type?: AccessorialType; search?: string }
  ): Promise<AccessorialWithLoad[]> {
    const claims = this.ensureInitialized(organizationId);
    const loads = await loadService.getLoads(organizationId);
    const loadMap = new Map<string, LoadWithRelations>();
    loads.forEach((l) => loadMap.set(l.id, l));

    let filtered = claims.map((c) => ({
      ...c,
      load: loadMap.get(c.load_id) || null,
    }));

    if (filters?.loadId) {
      filtered = filtered.filter((c) => c.load_id === filters.loadId);
    }

    if (filters?.status) {
      filtered = filtered.filter((c) => c.status === filters.status);
    }

    if (filters?.type) {
      filtered = filtered.filter((c) => c.type === filters.type);
    }

    if (filters?.search?.trim()) {
      const q = filters.search.trim().toLowerCase();
      filtered = filtered.filter(
        (c) =>
          c.description.toLowerCase().includes(q) ||
          c.load?.load_number.toLowerCase().includes(q) ||
          c.broker_name?.toLowerCase().includes(q) ||
          c.detention_details?.facility_name?.toLowerCase().includes(q) ||
          c.load?.driver?.full_name?.toLowerCase().includes(q) ||
          c.load?.truck?.truck_number?.toLowerCase().includes(q)
      );
    }

    // Sort newest created first
    return filtered.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  async getAccessorialById(organizationId: string, id: string): Promise<AccessorialWithLoad | null> {
    const all = await this.getAccessorials(organizationId);
    return all.find((c) => c.id === id) || null;
  }

  async getAccessorialsByLoadId(organizationId: string, loadId: string): Promise<AccessorialWithLoad[]> {
    return this.getAccessorials(organizationId, { loadId });
  }

  async getActiveDetentions(organizationId: string): Promise<AccessorialWithLoad[]> {
    const all = await this.getAccessorials(organizationId, { type: 'detention' });
    return all.filter((c) => {
      if (c.status === 'rejected' || c.status === 'invoiced') return false;
      const det = c.detention_details;
      if (!det) return false;
      // Active if departure time is not yet set
      if (!det.departure_time) {
        const calc = calculateDetention({
          arrivalTime: det.arrival_time,
          freeTimeHours: det.free_time_hours,
          hourlyRate: det.hourly_rate,
        });
        return !calc.isWithinFreeTime;
      }
      return false;
    });
  }

  async getAccessorialStats(organizationId: string): Promise<AccessorialSummaryStats> {
    const claims = await this.getAccessorials(organizationId);
    const activeDetentions = await this.getActiveDetentions(organizationId);

    let pendingBrokerAmount = 0;
    let approvedAmount = 0;
    let invoicedAmount = 0;
    let rejectedCount = 0;

    claims.forEach((c) => {
      if (c.status === 'submitted_to_broker' || c.status === 'draft') {
        pendingBrokerAmount += c.amount;
      } else if (c.status === 'approved_on_rate_con') {
        approvedAmount += c.amount;
      } else if (c.status === 'invoiced') {
        invoicedAmount += c.amount;
      } else if (c.status === 'rejected') {
        rejectedCount += 1;
      }
    });

    return {
      totalClaimsCount: claims.length,
      activeDetentionsCount: activeDetentions.length,
      pendingBrokerAmount,
      approvedAmount,
      invoicedAmount,
      rejectedCount,
    };
  }

  async createAccessorial(
    organizationId: string,
    input: CreateAccessorialInput,
    actorName: string = 'Dispatcher',
    actorId: string = 'usr-system'
  ): Promise<AccessorialClaim> {
    if (!input.load_id) {
      throw new Error('Load ID is required to log an accessorial claim.');
    }
    if (!input.description?.trim()) {
      throw new Error('Accessorial description is required.');
    }

    const claims = this.ensureInitialized(organizationId);
    const now = new Date().toISOString();

    let computedAmount = input.amount || ACCESSORIAL_TYPE_CONFIG[input.type]?.defaultRate || 0;
    let formattedDetention: DetentionCalculationResult | null = null;

    let detentionDetails = undefined;
    if (input.type === 'detention' && input.detention_details) {
      formattedDetention = calculateDetention({
        arrivalTime: input.detention_details.arrival_time,
        departureTime: input.detention_details.departure_time,
        freeTimeHours: input.detention_details.free_time_hours ?? 2.0,
        hourlyRate: input.detention_details.hourly_rate ?? 75.0,
      });

      computedAmount = formattedDetention.totalAmount;

      detentionDetails = {
        facility_type: input.detention_details.facility_type,
        facility_name: input.detention_details.facility_name || undefined,
        facility_address: input.detention_details.facility_address || undefined,
        facility_timezone: input.detention_details.facility_timezone || undefined,
        appointment_time: input.detention_details.appointment_time || null,
        arrival_time: input.detention_details.arrival_time,
        loading_start_time: input.detention_details.loading_start_time || null,
        loading_complete_time: input.detention_details.loading_complete_time || null,
        unloading_start_time: input.detention_details.unloading_start_time || null,
        unloading_complete_time: input.detention_details.unloading_complete_time || null,
        departure_time: input.detention_details.departure_time || null,
        free_time_hours: input.detention_details.free_time_hours ?? 2.0,
        hourly_rate: input.detention_details.hourly_rate ?? 75.0,
        detention_start_time: formattedDetention.detentionStartTimeIso,
        billable_hours: formattedDetention.billableHours,
        is_active_detention: formattedDetention.isActiveDetention,
        auto_synced_from_checkcall_id: input.detention_details.auto_synced_from_checkcall_id || null,
      };
    }

    const newClaim: AccessorialClaim = {
      id: `acc-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      organization_id: organizationId,
      load_id: input.load_id,
      type: input.type,
      status: input.status || 'draft',
      description: input.description.trim(),
      amount: computedAmount,
      currency: input.currency || 'USD',
      detention_details: detentionDetails,
      receipt_doc_id: input.receipt_doc_id || null,
      receipt_doc_name: input.receipt_doc_name || null,
      receipt_number: input.receipt_number?.trim() || null,
      payment_method: input.payment_method || undefined,
      broker_name: input.broker_name?.trim() || undefined,
      broker_contact_person: input.broker_contact_person?.trim() || undefined,
      broker_contact_email: input.broker_contact_email?.trim() || undefined,
      broker_contact_phone: input.broker_contact_phone?.trim() || undefined,
      rate_con_revision_number: input.rate_con_revision_number?.trim() || null,
      requested_by_id: actorId,
      requested_by_name: actorName,
      submitted_at: input.status === 'submitted_to_broker' ? now : null,
      notes: input.notes?.trim() || null,
      created_at: now,
      updated_at: now,
    };

    claims.unshift(newClaim);
    saveToStorage(`${ACCESSORIALS_STORAGE_PREFIX}${organizationId}`, claims);

    // Auto-sync milestone timestamps to the load if detention details provided
    if (newClaim.detention_details) {
      await this.syncMilestoneTimestampsToLoad(organizationId, input.load_id, {
        facility_type: newClaim.detention_details.facility_type,
        arrival_time: newClaim.detention_details.arrival_time,
        loading_start_time: newClaim.detention_details.loading_start_time,
        loading_complete_time: newClaim.detention_details.loading_complete_time,
        unloading_start_time: newClaim.detention_details.unloading_start_time,
        unloading_complete_time: newClaim.detention_details.unloading_complete_time,
        departure_time: newClaim.detention_details.departure_time,
      });
    }

    // Non-blocking Activity Log
    activityService
      .logActivity(organizationId, {
        loadId: input.load_id,
        actorId,
        actorName,
        type: 'broker_update',
        title: `Accessorial Logged: ${ACCESSORIAL_TYPE_CONFIG[input.type].label} ($${computedAmount.toFixed(2)})`,
        description: `${input.description.trim()} [Status: ${newClaim.status.toUpperCase()}]`,
        metadata: {
          accessorialId: newClaim.id,
          accessorialType: input.type,
          amount: computedAmount,
          status: newClaim.status,
          brokerName: newClaim.broker_name,
        },
      })
      .catch(() => {});

    return newClaim;
  }

  async updateAccessorial(
    organizationId: string,
    id: string,
    input: UpdateAccessorialInput,
    actorName: string,
    actorId: string
  ): Promise<AccessorialClaim> {
    const claims = this.ensureInitialized(organizationId);
    const index = claims.findIndex((c) => c.id === id);
    if (index === -1) {
      throw new Error(`Accessorial claim with ID "${id}" was not found.`);
    }

    const current = claims[index];
    const now = new Date().toISOString();

    let computedAmount = input.amount !== undefined ? input.amount : current.amount;
    let detentionDetails = current.detention_details;

    if ((input.type === 'detention' || current.type === 'detention') && input.detention_details) {
      const mergedDetention = {
        ...current.detention_details,
        ...input.detention_details,
      };

      const calc = calculateDetention({
        arrivalTime: mergedDetention.arrival_time!,
        departureTime: mergedDetention.departure_time,
        freeTimeHours: mergedDetention.free_time_hours ?? 2.0,
        hourlyRate: mergedDetention.hourly_rate ?? 75.0,
      });

      computedAmount = calc.totalAmount;
      detentionDetails = {
        facility_type: mergedDetention.facility_type || 'pickup',
        facility_name: mergedDetention.facility_name,
        facility_address: mergedDetention.facility_address,
        facility_timezone: mergedDetention.facility_timezone,
        appointment_time: mergedDetention.appointment_time || null,
        arrival_time: mergedDetention.arrival_time!,
        loading_start_time: mergedDetention.loading_start_time || null,
        loading_complete_time: mergedDetention.loading_complete_time || null,
        unloading_start_time: mergedDetention.unloading_start_time || null,
        unloading_complete_time: mergedDetention.unloading_complete_time || null,
        departure_time: mergedDetention.departure_time || null,
        free_time_hours: mergedDetention.free_time_hours ?? 2.0,
        hourly_rate: mergedDetention.hourly_rate ?? 75.0,
        detention_start_time: calc.detentionStartTimeIso,
        billable_hours: calc.billableHours,
        is_active_detention: calc.isActiveDetention,
        auto_synced_from_checkcall_id: mergedDetention.auto_synced_from_checkcall_id || null,
      };
    }

    const updated: AccessorialClaim = {
      ...current,
      ...(input.type !== undefined ? { type: input.type } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.description !== undefined ? { description: input.description.trim() } : {}),
      amount: computedAmount,
      detention_details: detentionDetails,
      ...(input.receipt_doc_id !== undefined ? { receipt_doc_id: input.receipt_doc_id } : {}),
      ...(input.receipt_doc_name !== undefined ? { receipt_doc_name: input.receipt_doc_name } : {}),
      ...(input.receipt_number !== undefined ? { receipt_number: input.receipt_number?.trim() || null } : {}),
      ...(input.payment_method !== undefined ? { payment_method: input.payment_method } : {}),
      ...(input.broker_name !== undefined ? { broker_name: input.broker_name?.trim() || undefined } : {}),
      ...(input.broker_contact_person !== undefined
        ? { broker_contact_person: input.broker_contact_person?.trim() || undefined }
        : {}),
      ...(input.broker_contact_email !== undefined
        ? { broker_contact_email: input.broker_contact_email?.trim() || undefined }
        : {}),
      ...(input.broker_contact_phone !== undefined
        ? { broker_contact_phone: input.broker_contact_phone?.trim() || undefined }
        : {}),
      ...(input.rate_con_revision_number !== undefined
        ? { rate_con_revision_number: input.rate_con_revision_number?.trim() || null }
        : {}),
      ...(input.rejection_reason !== undefined ? { rejection_reason: input.rejection_reason?.trim() || null } : {}),
      ...(input.notes !== undefined ? { notes: input.notes?.trim() || null } : {}),
      updated_at: now,
    };

    claims[index] = updated;
    saveToStorage(`${ACCESSORIALS_STORAGE_PREFIX}${organizationId}`, claims);

    // Auto-sync milestone timestamps to the load if detention details provided
    if (updated.detention_details) {
      await this.syncMilestoneTimestampsToLoad(organizationId, updated.load_id, {
        facility_type: updated.detention_details.facility_type,
        arrival_time: updated.detention_details.arrival_time,
        loading_start_time: updated.detention_details.loading_start_time,
        loading_complete_time: updated.detention_details.loading_complete_time,
        unloading_start_time: updated.detention_details.unloading_start_time,
        unloading_complete_time: updated.detention_details.unloading_complete_time,
        departure_time: updated.detention_details.departure_time,
      });
    }

    // Non-blocking Activity Log
    activityService
      .logActivity(organizationId, {
        loadId: updated.load_id,
        actorId,
        actorName,
        type: 'broker_update',
        title: `Accessorial Updated: ${ACCESSORIAL_TYPE_CONFIG[updated.type].label} ($${updated.amount.toFixed(2)})`,
        description: updated.description,
        metadata: {
          accessorialId: updated.id,
          accessorialType: updated.type,
          amount: updated.amount,
          status: updated.status,
        },
      })
      .catch(() => {});

    return updated;
  }

  async updateAccessorialStatus(
    organizationId: string,
    id: string,
    status: AccessorialStatus,
    actorName: string,
    actorId: string,
    metadata?: { rejection_reason?: string; rate_con_revision_number?: string; notes?: string }
  ): Promise<AccessorialClaim> {
    const claims = this.ensureInitialized(organizationId);
    const index = claims.findIndex((c) => c.id === id);
    if (index === -1) {
      throw new Error(`Accessorial claim with ID "${id}" was not found.`);
    }

    const current = claims[index];
    const now = new Date().toISOString();

    const updated: AccessorialClaim = {
      ...current,
      status,
      ...(status === 'submitted_to_broker' && !current.submitted_at ? { submitted_at: now } : {}),
      ...(status === 'approved_on_rate_con' ? { approved_at: now } : {}),
      ...(status === 'rejected' ? { rejected_at: now, rejection_reason: metadata?.rejection_reason || null } : {}),
      ...(status === 'invoiced' ? { invoiced_at: now } : {}),
      ...(metadata?.rate_con_revision_number ? { rate_con_revision_number: metadata.rate_con_revision_number } : {}),
      ...(metadata?.notes ? { notes: metadata.notes } : {}),
      updated_at: now,
    };

    claims[index] = updated;
    saveToStorage(`${ACCESSORIALS_STORAGE_PREFIX}${organizationId}`, claims);

    // Non-blocking Activity Log
    activityService
      .logActivity(organizationId, {
        loadId: updated.load_id,
        actorId,
        actorName,
        type: 'broker_update',
        title: `Accessorial Claim Status: ${status.toUpperCase()} ($${updated.amount.toFixed(2)})`,
        description: `Claim for ${ACCESSORIAL_TYPE_CONFIG[updated.type].label} transitioned to ${status}.${
          metadata?.rejection_reason ? ` Reason: ${metadata.rejection_reason}` : ''
        }`,
        metadata: {
          accessorialId: updated.id,
          newStatus: status,
          amount: updated.amount,
          rateConRevision: updated.rate_con_revision_number,
        },
      })
      .catch(() => {});

    return updated;
  }

  async deleteAccessorial(organizationId: string, id: string, actorName: string, actorId: string): Promise<void> {
    const claims = this.ensureInitialized(organizationId);
    const target = claims.find((c) => c.id === id);
    if (!target) {
      throw new Error(`Accessorial claim with ID "${id}" was not found.`);
    }

    const filtered = claims.filter((c) => c.id !== id);
    saveToStorage(`${ACCESSORIALS_STORAGE_PREFIX}${organizationId}`, filtered);

    // Non-blocking Activity Log
    activityService
      .logActivity(organizationId, {
        loadId: target.load_id,
        actorId,
        actorName,
        type: 'system_event',
        title: `Accessorial Claim Deleted: ${ACCESSORIAL_TYPE_CONFIG[target.type].label}`,
        description: `Removed claim of $${target.amount.toFixed(2)} (${target.description})`,
        metadata: {
          deletedAccessorialId: id,
          deletedType: target.type,
          deletedAmount: target.amount,
        },
      })
      .catch(() => {});
  }

  /**
   * Synchronizes Check Call arrival milestones into Detention Claims
   * without mutating the original Check Call data.
   */
  async createDetentionFromCheckCall(
    organizationId: string,
    checkCall: CheckCall,
    load: LoadWithRelations,
    actorName: string,
    actorId: string
  ): Promise<AccessorialClaim> {
    const facilityType = checkCall.call_type === 'arrived_pickup' ? 'pickup' : 'delivery';
    const facilityName =
      facilityType === 'pickup'
        ? `${load.origin_city}, ${load.origin_state} (Shipper)`
        : `${load.dest_city}, ${load.dest_state} (Receiver)`;

    const apptTime = facilityType === 'pickup' ? load.pickup_datetime : load.delivery_datetime;
    const actualArrivalTime = checkCall.event_at || checkCall.created_at;

    const input: CreateAccessorialInput = {
      load_id: load.id,
      type: 'detention',
      status: 'draft',
      description: `Detention clock initiated from driver check-in at ${facilityName}.`,
      detention_details: {
        facility_type: facilityType,
        facility_name: facilityName,
        facility_address: `${checkCall.location_city || ''}, ${checkCall.location_state || ''}`.trim(),
        appointment_time: apptTime || null,
        arrival_time: actualArrivalTime,
        departure_time: null, // Driver currently waiting
        free_time_hours: 2.0,
        hourly_rate: 75.0,
        auto_synced_from_checkcall_id: checkCall.id,
      },
      broker_name: load.broker?.company_name || undefined,
      broker_contact_person: load.broker?.contact_name || undefined,
      broker_contact_email: load.broker?.contact_email || undefined,
      broker_contact_phone: load.broker?.contact_phone || undefined,
    };

    return this.createAccessorial(organizationId, input, actorName, actorId);
  }

  // ====================================================================
  // PostgreSQL-backed Load Detention Records API (Phase 1)
  // ====================================================================

  private ensureDetentionInitialized(organizationId: string): LoadDetentionRecord[] {
    if (!organizationId) return [];
    const key = `${DETENTION_RECORDS_STORAGE_PREFIX}${organizationId}`;
    const rawStored = localStorage.getItem(key);
    if (!rawStored) {
      const seeded: LoadDetentionRecord[] = organizationId === DEMO_ORGANIZATION_ID
        ? SEED_DETENTION_RECORDS.map((r) => ({ ...r, organization_id: organizationId }))
        : [];
      saveToStorage(key, seeded);
      return seeded;
    }
    return loadFromStorage<LoadDetentionRecord[]>(key, []);
  }

  async getDetentionRecords(organizationId: string, loadId?: string): Promise<LoadDetentionRecord[]> {
    if (isSupabaseConfigured && isUUID(organizationId)) {
      try {
        let query = (supabase.from('load_detention_records' as any) as any)
          .select('*')
          .eq('organization_id', organizationId);
        if (loadId) {
          query = query.eq('load_id', loadId);
        }
        const { data, error } = await query.order('arrival_time', { ascending: false });
        if (!error && data) {
          return data as LoadDetentionRecord[];
        }
        if (error) {
          console.warn('[AccessorialService] Supabase getDetentionRecords error, falling back to local storage:', error);
        }
      } catch (err) {
        console.warn('[AccessorialService] Error fetching detention records from Supabase:', err);
      }
    }

    const records = this.ensureDetentionInitialized(organizationId);
    let filtered = records;
    if (loadId) {
      filtered = filtered.filter((r) => r.load_id === loadId);
    }
    return filtered.sort((a, b) => new Date(b.arrival_time).getTime() - new Date(a.arrival_time).getTime());
  }

  async getDetentionRecordById(organizationId: string, id: string): Promise<LoadDetentionRecord | null> {
    if (isSupabaseConfigured && isUUID(organizationId) && isUUID(id)) {
      try {
        const { data, error } = await (supabase.from('load_detention_records' as any) as any)
          .select('*')
          .eq('organization_id', organizationId)
          .eq('id', id)
          .maybeSingle();
        if (!error && data) {
          return data as LoadDetentionRecord;
        }
      } catch (err) {
        console.warn('[AccessorialService] Error fetching detention record by id from Supabase:', err);
      }
    }

    const records = this.ensureDetentionInitialized(organizationId);
    return records.find((r) => r.id === id) || null;
  }

  async createDetentionRecord(organizationId: string, input: CreateDetentionRecordInput): Promise<LoadDetentionRecord> {
    if (!organizationId || !input.load_id) {
      throw new Error('organization_id and load_id are required to create a detention record.');
    }

    const targetLoad = await loadService.getLoad(organizationId, input.load_id);
    if (!targetLoad || targetLoad.organization_id !== organizationId) {
      throw new Error('Referenced load does not exist in the active organization.');
    }

    const freeTimeHours = input.free_time_hours !== undefined ? Number(input.free_time_hours) : 2.0;
    const hourlyRate = input.hourly_rate !== undefined ? Number(input.hourly_rate) : 75.0;

    const calc = calculateDetention({
      arrivalTime: input.arrival_time,
      departureTime: input.departure_time,
      freeTimeHours,
      hourlyRate,
    });

    const now = new Date().toISOString();
    const payloadToInsert = {
      organization_id: organizationId,
      load_id: input.load_id,
      facility_type: input.facility_type,
      facility_name: input.facility_name?.trim() || null,
      facility_address: input.facility_address?.trim() || null,
      facility_timezone: input.facility_timezone || targetLoad.origin_timezone || 'America/Chicago',
      appointment_time: input.appointment_time || null,
      arrival_time: input.arrival_time,
      loading_start_time: input.loading_start_time || null,
      loading_complete_time: input.loading_complete_time || null,
      unloading_start_time: input.unloading_start_time || null,
      unloading_complete_time: input.unloading_complete_time || null,
      departure_time: input.departure_time || null,
      free_time_hours: freeTimeHours,
      hourly_rate: hourlyRate,
      detention_start_time: calc.detentionStartTimeIso,
      billable_hours: calc.billableHours,
      detention_amount: calc.totalAmount,
      is_active_detention: calc.isActiveDetention,
      status: input.status || 'draft',
      check_call_id: input.check_call_id || null,
      notes: input.notes?.trim() || null,
      created_by: input.created_by || null,
    };

    let persistedRecord: LoadDetentionRecord | null = null;

    if (isSupabaseConfigured && isUUID(organizationId) && isUUID(input.load_id)) {
      try {
        const { data, error } = await (supabase.from('load_detention_records' as any) as any)
          .insert(payloadToInsert)
          .select()
          .single();
        if (!error && data) {
          persistedRecord = data as LoadDetentionRecord;
        } else if (error) {
          console.error('[AccessorialService] Supabase createDetentionRecord error:', error);
          throw new Error(error.message || 'Database error creating detention record.');
        }
      } catch (err) {
        if (err instanceof Error && err.message.includes('Database error')) throw err;
        console.warn('[AccessorialService] Supabase insert failed, saving locally:', err);
      }
    }

    if (!persistedRecord) {
      persistedRecord = {
        id: `det-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        ...payloadToInsert,
        created_at: now,
        updated_at: now,
      } as LoadDetentionRecord;
      const records = this.ensureDetentionInitialized(organizationId);
      records.unshift(persistedRecord);
      saveToStorage(`${DETENTION_RECORDS_STORAGE_PREFIX}${organizationId}`, records);
    }

    // Auto-sync stop milestones on load
    await this.syncMilestoneTimestampsToLoad(organizationId, input.load_id, {
      facility_type: input.facility_type,
      arrival_time: input.arrival_time,
      loading_start_time: input.loading_start_time,
      loading_complete_time: input.loading_complete_time,
      unloading_start_time: input.unloading_start_time,
      unloading_complete_time: input.unloading_complete_time,
      departure_time: input.departure_time,
    });

    return persistedRecord;
  }

  async updateDetentionRecord(organizationId: string, id: string, input: LoadDetentionRecordUpdate): Promise<LoadDetentionRecord> {
    const current = await this.getDetentionRecordById(organizationId, id);
    if (!current) {
      throw new Error(`Detention record with ID "${id}" was not found.`);
    }

    const arrivalTime = input.arrival_time !== undefined ? input.arrival_time : current.arrival_time;
    const departureTime = input.departure_time !== undefined ? input.departure_time : current.departure_time;
    const freeTimeHours = input.free_time_hours !== undefined ? Number(input.free_time_hours) : current.free_time_hours;
    const hourlyRate = input.hourly_rate !== undefined ? Number(input.hourly_rate) : current.hourly_rate;

    const calc = calculateDetention({
      arrivalTime,
      departureTime,
      freeTimeHours,
      hourlyRate,
    });

    const updatePayload = {
      ...(input.facility_type !== undefined ? { facility_type: input.facility_type } : {}),
      ...(input.facility_name !== undefined ? { facility_name: input.facility_name } : {}),
      ...(input.facility_address !== undefined ? { facility_address: input.facility_address } : {}),
      ...(input.facility_timezone !== undefined ? { facility_timezone: input.facility_timezone } : {}),
      ...(input.appointment_time !== undefined ? { appointment_time: input.appointment_time } : {}),
      arrival_time: arrivalTime,
      ...(input.loading_start_time !== undefined ? { loading_start_time: input.loading_start_time } : {}),
      ...(input.loading_complete_time !== undefined ? { loading_complete_time: input.loading_complete_time } : {}),
      ...(input.unloading_start_time !== undefined ? { unloading_start_time: input.unloading_start_time } : {}),
      ...(input.unloading_complete_time !== undefined ? { unloading_complete_time: input.unloading_complete_time } : {}),
      departure_time: departureTime,
      free_time_hours: freeTimeHours,
      hourly_rate: hourlyRate,
      detention_start_time: calc.detentionStartTimeIso,
      billable_hours: calc.billableHours,
      detention_amount: calc.totalAmount,
      is_active_detention: calc.isActiveDetention,
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.check_call_id !== undefined ? { check_call_id: input.check_call_id } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      updated_at: new Date().toISOString(),
    };

    let updatedRecord: LoadDetentionRecord | null = null;

    if (isSupabaseConfigured && isUUID(organizationId) && isUUID(id)) {
      try {
        const { data, error } = await (supabase.from('load_detention_records' as any) as any)
          .update(updatePayload)
          .eq('organization_id', organizationId)
          .eq('id', id)
          .select()
          .single();
        if (!error && data) {
          updatedRecord = data as LoadDetentionRecord;
        } else if (error) {
          console.error('[AccessorialService] Supabase updateDetentionRecord error:', error);
          throw new Error(error.message || 'Database error updating detention record.');
        }
      } catch (err) {
        if (err instanceof Error && err.message.includes('Database error')) throw err;
        console.warn('[AccessorialService] Supabase update failed, saving locally:', err);
      }
    }

    if (!updatedRecord) {
      const records = this.ensureDetentionInitialized(organizationId);
      const idx = records.findIndex((r) => r.id === id);
      if (idx !== -1) {
        records[idx] = { ...records[idx], ...updatePayload } as LoadDetentionRecord;
        saveToStorage(`${DETENTION_RECORDS_STORAGE_PREFIX}${organizationId}`, records);
        updatedRecord = records[idx];
      } else {
        throw new Error(`Detention record with ID "${id}" was not found.`);
      }
    }

    // Auto-sync stop milestones on load
    await this.syncMilestoneTimestampsToLoad(organizationId, current.load_id, {
      facility_type: input.facility_type !== undefined ? input.facility_type : current.facility_type,
      arrival_time: arrivalTime,
      loading_start_time: input.loading_start_time !== undefined ? input.loading_start_time : current.loading_start_time,
      loading_complete_time: input.loading_complete_time !== undefined ? input.loading_complete_time : current.loading_complete_time,
      unloading_start_time: input.unloading_start_time !== undefined ? input.unloading_start_time : current.unloading_start_time,
      unloading_complete_time: input.unloading_complete_time !== undefined ? input.unloading_complete_time : current.unloading_complete_time,
      departure_time: departureTime,
    });

    return updatedRecord;
  }

  async deleteDetentionRecord(organizationId: string, id: string): Promise<void> {
    if (isSupabaseConfigured && isUUID(organizationId) && isUUID(id)) {
      try {
        const { error } = await (supabase.from('load_detention_records' as any) as any)
          .delete()
          .eq('organization_id', organizationId)
          .eq('id', id);
        if (error) {
          console.error('[AccessorialService] Supabase deleteDetentionRecord error:', error);
        }
      } catch (err) {
        console.warn('[AccessorialService] Supabase delete failed, deleting locally:', err);
      }
    }
    const records = this.ensureDetentionInitialized(organizationId);
    const filtered = records.filter((r) => r.id !== id);
    saveToStorage(`${DETENTION_RECORDS_STORAGE_PREFIX}${organizationId}`, filtered);
  }

  private async syncMilestoneTimestampsToLoad(
    organizationId: string,
    loadId: string,
    milestones: {
      facility_type: 'pickup' | 'delivery' | 'intermediate_stop';
      arrival_time?: string | null;
      loading_start_time?: string | null;
      loading_complete_time?: string | null;
      unloading_start_time?: string | null;
      unloading_complete_time?: string | null;
      departure_time?: string | null;
    }
  ): Promise<void> {
    try {
      const updatePayload: Record<string, string | null> = {};
      if (milestones.facility_type === 'pickup') {
        if (milestones.arrival_time) updatePayload.pickup_arrival_time = milestones.arrival_time;
        if (milestones.loading_start_time !== undefined) updatePayload.pickup_loading_start_time = milestones.loading_start_time;
        if (milestones.loading_complete_time !== undefined) updatePayload.pickup_loading_complete_time = milestones.loading_complete_time;
        if (milestones.departure_time !== undefined) updatePayload.pickup_departure_time = milestones.departure_time;
      } else if (milestones.facility_type === 'delivery') {
        if (milestones.arrival_time) updatePayload.delivery_arrival_time = milestones.arrival_time;
        if (milestones.unloading_start_time !== undefined) updatePayload.delivery_unloading_start_time = milestones.unloading_start_time;
        if (milestones.unloading_complete_time !== undefined) updatePayload.delivery_unloading_complete_time = milestones.unloading_complete_time;
        if (milestones.departure_time !== undefined) updatePayload.delivery_departure_time = milestones.departure_time;
      }
      if (Object.keys(updatePayload).length > 0) {
        await loadService.updateLoad(organizationId, loadId, updatePayload as any);
      }
    } catch (err) {
      console.warn('[AccessorialService] Milestone timestamp sync to load warning:', err);
    }
  }
}

export const accessorialService: IAccessorialService = new AccessorialService();
