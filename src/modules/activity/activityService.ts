import { PipelineStatus, DocumentType, DocumentStatus } from '../../types/domain.types.ts';
import {
  ActivityType,
  LoadActivityEvent,
  CreateActivityInput,
  ActivityFilterOptions,
} from './activityTypes.ts';
import { DEMO_ORGANIZATION_ID } from '../checkcalls/checkCallService.ts';

const ACTIVITY_STORAGE_PREFIX = 'dispatchdesk_demo_activity_';

function isDemoActivity(activity: LoadActivityEvent): boolean {
  const id = activity.id || '';
  const loadId = activity.loadId || activity.load_id || '';

  if (
    id.startsWith('act-1-') ||
    id.startsWith('act-2-') ||
    id.startsWith('act-3-') ||
    loadId.startsWith('demo-load-')
  ) {
    return true;
  }

  return false;
}

// Initial realistic seed events for demo organization loads
const SEED_ACTIVITIES: Omit<LoadActivityEvent, 'organizationId' | 'organization_id'>[] = [
  // --- Demo Load 1 (LD-2024-8841: Booked dry van freight) ---
  {
    id: 'act-1-1',
    loadId: 'demo-load-1',
    load_id: 'demo-load-1',
    actorId: 'usr-alex-1',
    actorName: 'Alex Rivera (Dispatcher)',
    type: 'system_event',
    title: 'Load Created & Initialized',
    description: 'Load LD-2024-8841 generated from Dallas, TX to Atlanta, GA for client Eagle Express Fleet.',
    timestamp: new Date(Date.now() - 72 * 3600000).toISOString(),
    metadata: {
      initialStatus: 'sourced',
      commodity: 'Packaged Consumer Electronics',
      rate: 2450.0,
    },
  },
  {
    id: 'act-1-2',
    loadId: 'demo-load-1',
    load_id: 'demo-load-1',
    actorId: 'usr-alex-1',
    actorName: 'Alex Rivera (Dispatcher)',
    type: 'broker_update',
    title: 'Rate Negotiation & Term Agreement',
    description: 'Broker agreed to $2,450 all-in flat rate ($3.08/mi total) with $75/hr detention after 2 hours free time.',
    timestamp: new Date(Date.now() - 70 * 3600000).toISOString(),
    metadata: {
      brokerName: 'Apex Logistics Freight LLC',
      contactPerson: 'Sarah Jenkins',
      agreedRate: 2450.0,
      detentionRate: '$75/hr after 2 hrs',
    },
  },
  {
    id: 'act-1-3',
    loadId: 'demo-load-1',
    load_id: 'demo-load-1',
    actorId: 'usr-alex-1',
    actorName: 'Alex Rivera (Dispatcher)',
    type: 'document_event',
    title: 'Rate Confirmation Uploaded & Verified',
    description: 'Signed Rate Confirmation RateCon_Apex_8841.pdf received via Apex EDI and verified.',
    timestamp: new Date(Date.now() - 68 * 3600000).toISOString(),
    metadata: {
      docType: 'rate_confirmation',
      docName: 'RateCon_Apex_8841.pdf',
      docStatus: 'verified',
      docAction: 'verified',
    },
  },
  {
    id: 'act-1-4',
    loadId: 'demo-load-1',
    load_id: 'demo-load-1',
    actorId: 'usr-alex-1',
    actorName: 'Alex Rivera (Dispatcher)',
    type: 'assignment_change',
    title: 'Equipment & Driver Assigned',
    description: 'Assigned Truck #101 (Dry Van) and Driver Marcus Vance to load.',
    timestamp: new Date(Date.now() - 48 * 3600000).toISOString(),
    metadata: {
      newTruckId: 'demo-truck-101',
      newTruckNumber: '101',
      newDriverId: 'demo-driver-1',
      newDriverName: 'Marcus Vance',
    },
  },
  {
    id: 'act-1-5',
    loadId: 'demo-load-1',
    load_id: 'demo-load-1',
    actorId: 'usr-alex-1',
    actorName: 'Alex Rivera (Dispatcher)',
    type: 'status_change',
    title: 'Status Advanced to Booked',
    description: 'Load status updated from Sourced to Booked. Pickup scheduled for Dallas facility.',
    timestamp: new Date(Date.now() - 46 * 3600000).toISOString(),
    metadata: {
      previousStatus: 'sourced',
      newStatus: 'booked',
    },
  },
  {
    id: 'act-1-6',
    loadId: 'demo-load-1',
    load_id: 'demo-load-1',
    actorId: 'usr-marcus-1',
    actorName: 'Marcus Vance (Driver)',
    type: 'driver_update',
    title: 'Pre-Trip Inspection & Dispatch Check-In',
    description: 'Driver Marcus Vance confirmed pre-trip inspection complete. Trailer seal #89921 ready on board.',
    timestamp: new Date(Date.now() - 16 * 3600000).toISOString(),
    metadata: {
      locationCity: 'Dallas',
      locationState: 'TX',
      status: 'on_time',
      etaPickup: new Date(Date.now() + 18 * 3600000).toISOString(),
    },
  },

  // --- Demo Load 2 (LD-2024-8842: In Transit Reefer Load) ---
  {
    id: 'act-2-1',
    loadId: 'demo-load-2',
    load_id: 'demo-load-2',
    actorId: 'usr-alex-1',
    actorName: 'Alex Rivera (Dispatcher)',
    type: 'system_event',
    title: 'Load Created & Initialized',
    description: 'Load LD-2024-8842 generated from Memphis, TN to Charlotte, NC (Reefer 36°F).',
    timestamp: new Date(Date.now() - 96 * 3600000).toISOString(),
    metadata: {
      initialStatus: 'sourced',
      commodity: 'Chilled Dairy & Specialty Yogurt (36°F Continuous)',
      rate: 2850.0,
    },
  },
  {
    id: 'act-2-2',
    loadId: 'demo-load-2',
    load_id: 'demo-load-2',
    actorId: 'usr-alex-1',
    actorName: 'Alex Rivera (Dispatcher)',
    type: 'document_event',
    title: 'Rate Confirmation Verified',
    description: 'Signed Rate Confirmation RateCon_BlueRidge_8842.pdf verified for Blue Ridge Logistics.',
    timestamp: new Date(Date.now() - 72 * 3600000).toISOString(),
    metadata: {
      docType: 'rate_confirmation',
      docName: 'RateCon_BlueRidge_8842.pdf',
      docStatus: 'verified',
      docAction: 'verified',
    },
  },
  {
    id: 'act-2-3',
    loadId: 'demo-load-2',
    load_id: 'demo-load-2',
    actorId: 'usr-alex-1',
    actorName: 'Alex Rivera (Dispatcher)',
    type: 'assignment_change',
    title: 'Truck & Driver Dispatched',
    description: 'Assigned Truck #102 (Reefer) and Driver Elena Rostova.',
    timestamp: new Date(Date.now() - 50 * 3600000).toISOString(),
    metadata: {
      newTruckId: 'demo-truck-102',
      newTruckNumber: '102',
      newDriverId: 'demo-driver-2',
      newDriverName: 'Elena Rostova',
    },
  },
  {
    id: 'act-2-4',
    loadId: 'demo-load-2',
    load_id: 'demo-load-2',
    actorId: 'usr-elena-1',
    actorName: 'Elena Rostova (Driver)',
    type: 'driver_update',
    title: 'Loaded at Shipper with Clean BOL',
    description: 'Loaded 22 pallets at Memphis dairy facility. Reefer set to 36°F Continuous. Seal #774921 attached.',
    timestamp: new Date(Date.now() - 20 * 3600000).toISOString(),
    metadata: {
      locationCity: 'Memphis',
      locationState: 'TN',
      sealNumber: '774921',
      temperature: '36°F Continuous',
    },
  },
  {
    id: 'act-2-5',
    loadId: 'demo-load-2',
    load_id: 'demo-load-2',
    actorId: 'usr-elena-1',
    actorName: 'Elena Rostova (Driver)',
    type: 'document_event',
    title: 'Shipper Signed BOL Received',
    description: 'Uploaded clean shipper signed BOL (BOL_Shipper_Signed_8842.pdf).',
    timestamp: new Date(Date.now() - 19 * 3600000).toISOString(),
    metadata: {
      docType: 'bol',
      docName: 'BOL_Shipper_Signed_8842.pdf',
      docStatus: 'received',
      docAction: 'uploaded',
    },
  },
  {
    id: 'act-2-6',
    loadId: 'demo-load-2',
    load_id: 'demo-load-2',
    actorId: 'usr-alex-1',
    actorName: 'Alex Rivera (Dispatcher)',
    type: 'status_change',
    title: 'Status Advanced to In Transit',
    description: 'Shipper departure confirmed. Load is en route to Charlotte receiver dock.',
    timestamp: new Date(Date.now() - 18 * 3600000).toISOString(),
    metadata: {
      previousStatus: 'booked',
      newStatus: 'in_transit',
    },
  },
  {
    id: 'act-2-7',
    loadId: 'demo-load-2',
    load_id: 'demo-load-2',
    actorId: 'usr-elena-1',
    actorName: 'Elena Rostova (Driver)',
    type: 'driver_update',
    title: 'En Route Location Ping - Knoxville, TN',
    description: 'Passing Knoxville on I-40 East. Temperature maintaining 36°F steady. On schedule for delivery.',
    timestamp: new Date(Date.now() - 2 * 3600000).toISOString(),
    metadata: {
      locationCity: 'Knoxville',
      locationState: 'TN',
      etaDelivery: new Date(Date.now() + 12 * 3600000).toISOString(),
    },
  },

  // --- Demo Load 3 (LD-2024-8843: Flatbed freight) ---
  {
    id: 'act-3-1',
    loadId: 'demo-load-3',
    load_id: 'demo-load-3',
    actorId: 'usr-brandon-1',
    actorName: 'Brandon Cole (Dispatcher)',
    type: 'system_event',
    title: 'Load Created & Initialized',
    description: 'Load LD-2024-8843 created for Horizon Express Freight LLC.',
    timestamp: new Date(Date.now() - 120 * 3600000).toISOString(),
    metadata: {
      initialStatus: 'sourced',
      commodity: 'Structural Steel Beams',
      rate: 1950.0,
    },
  },
  {
    id: 'act-3-2',
    loadId: 'demo-load-3',
    load_id: 'demo-load-3',
    actorId: 'usr-brandon-1',
    actorName: 'Brandon Cole (Dispatcher)',
    type: 'dispatcher_note',
    title: 'Tarping Requirements Verified',
    description: 'Confirmed shipper requires 8ft drop tarps and corner protectors for all edge contact points.',
    timestamp: new Date(Date.now() - 110 * 3600000).toISOString(),
    metadata: {
      tarpingRequired: true,
      tarpType: '8ft Drop Tarps',
    },
  },
];

export interface IActivityService {
  getActivities(
    organizationId: string,
    loadId: string,
    filters?: ActivityFilterOptions
  ): Promise<LoadActivityEvent[]>;
  getAllActivities(
    organizationId: string,
    filters?: ActivityFilterOptions
  ): Promise<LoadActivityEvent[]>;
  logActivity(
    organizationId: string,
    input: CreateActivityInput
  ): Promise<LoadActivityEvent>;
  recordStatusChange(
    organizationId: string,
    loadId: string,
    previousStatus: PipelineStatus,
    newStatus: PipelineStatus,
    actorName?: string,
    actorId?: string,
    note?: string
  ): Promise<LoadActivityEvent>;
  recordAssignmentChange(
    organizationId: string,
    loadId: string,
    changes: {
      previousTruckNumber?: string | null;
      newTruckNumber?: string | null;
      previousDriverName?: string | null;
      newDriverName?: string | null;
      previousTruckId?: string | null;
      newTruckId?: string | null;
      previousDriverId?: string | null;
      newDriverId?: string | null;
      previousDispatcherId?: string | null;
      newDispatcherId?: string | null;
      previousDispatcherName?: string | null;
      newDispatcherName?: string | null;
    },
    actorName?: string,
    actorId?: string
  ): Promise<LoadActivityEvent>;
  recordDispatcherAssignmentChange(
    organizationId: string,
    loadId: string,
    previousDispatcherId: string | null | undefined,
    newDispatcherId: string | null | undefined,
    previousDispatcherName: string | null | undefined,
    newDispatcherName: string | null | undefined,
    actorName?: string,
    actorId?: string
  ): Promise<LoadActivityEvent>;
  recordTeamAssignmentChange(
    organizationId: string,
    loadId: string,
    previousMemberId: string | null | undefined,
    newMemberId: string | null | undefined,
    previousMemberName: string | null | undefined,
    newMemberName: string | null | undefined,
    memberRole?: string | null,
    actorName?: string,
    actorId?: string
  ): Promise<LoadActivityEvent>;
  recordMultiTeamAssignmentChange(
    organizationId: string,
    loadId: string,
    addedMembers?: ({ id: string; name: string; role?: string } | string)[],
    removedMembers?: ({ id: string; name: string; role?: string } | string)[],
    mode?: 'add' | 'replace' | 'remove',
    isBulk?: boolean,
    actorName?: string,
    actorId?: string
  ): Promise<LoadActivityEvent>;
  recordDocumentEvent(
    organizationId: string,
    loadId: string,
    docType: DocumentType,
    docName: string,
    action: 'uploaded' | 'verified' | 'rejected' | 'deleted' | 'status_updated',
    actorName?: string,
    actorId?: string,
    docStatus?: DocumentStatus
  ): Promise<LoadActivityEvent>;
  recordBrokerUpdate(
    organizationId: string,
    loadId: string,
    brokerName: string,
    details: string,
    actorName?: string,
    actorId?: string,
    metadata?: Record<string, any>
  ): Promise<LoadActivityEvent>;
  recordDriverUpdate(
    organizationId: string,
    loadId: string,
    driverName: string,
    details: string,
    actorName?: string,
    actorId?: string,
    metadata?: Record<string, any>
  ): Promise<LoadActivityEvent>;
  recordSystemEvent(
    organizationId: string,
    loadId: string,
    title: string,
    description: string,
    metadata?: Record<string, any>
  ): Promise<LoadActivityEvent>;
}

class LocalActivityService implements IActivityService {
  private getStorageKey(organizationId: string): string {
    return `${ACTIVITY_STORAGE_PREFIX}${organizationId}`;
  }

  private loadFromStorage(organizationId: string): LoadActivityEvent[] {
    const isDemoOrg = organizationId === DEMO_ORGANIZATION_ID;
    const key = this.getStorageKey(organizationId);
    const raw = localStorage.getItem(key);

    if (!raw) {
      if (isDemoOrg) {
        // Seed default activities only for demo organization
        const seeded: LoadActivityEvent[] = SEED_ACTIVITIES.map((act) => ({
          ...act,
          organizationId,
          organization_id: organizationId,
        }));
        localStorage.setItem(key, JSON.stringify(seeded));
        return seeded;
      }
      return [];
    }

    try {
      const parsed: LoadActivityEvent[] = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return [];
      }

      // For non-demo organizations, purge any leaked or legacy demo activities while preserving genuine ones
      if (!isDemoOrg) {
        const cleaned = parsed.filter((act) => !isDemoActivity(act));
        if (cleaned.length !== parsed.length) {
          localStorage.setItem(key, JSON.stringify(cleaned));
        }
        return cleaned;
      }

      return parsed;
    } catch (e) {
      console.error('Failed to parse activities from localStorage:', e);
      return [];
    }
  }

  private saveToStorage(organizationId: string, activities: LoadActivityEvent[]): void {
    const key = this.getStorageKey(organizationId);
    localStorage.setItem(key, JSON.stringify(activities));
  }

  async getActivities(
    organizationId: string,
    loadId: string,
    filters?: ActivityFilterOptions
  ): Promise<LoadActivityEvent[]> {
    const all = this.loadFromStorage(organizationId);
    let matched = all.filter((a) => a.loadId === loadId || a.load_id === loadId);

    if (filters) {
      if (filters.type && filters.type !== 'all') {
        matched = matched.filter((a) => a.type === filters.type);
      }

      if (filters.search && filters.search.trim()) {
        const q = filters.search.toLowerCase().trim();
        matched = matched.filter((a) => {
          return (
            a.title.toLowerCase().includes(q) ||
            a.description.toLowerCase().includes(q) ||
            a.actorName.toLowerCase().includes(q) ||
            (a.metadata?.brokerName && a.metadata.brokerName.toLowerCase().includes(q)) ||
            (a.metadata?.docName && a.metadata.docName.toLowerCase().includes(q))
          );
        });
      }
    }

    // Sort newest first
    return matched.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  async getAllActivities(
    organizationId: string,
    filters?: ActivityFilterOptions
  ): Promise<LoadActivityEvent[]> {
    let all = this.loadFromStorage(organizationId);

    if (filters) {
      if (filters.type && filters.type !== 'all') {
        all = all.filter((a) => a.type === filters.type);
      }

      if (filters.search && filters.search.trim()) {
        const q = filters.search.toLowerCase().trim();
        all = all.filter((a) => {
          return (
            a.title.toLowerCase().includes(q) ||
            a.description.toLowerCase().includes(q) ||
            a.actorName.toLowerCase().includes(q)
          );
        });
      }
    }

    return all.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  async logActivity(
    organizationId: string,
    input: CreateActivityInput
  ): Promise<LoadActivityEvent> {
    if (!input.loadId) {
      throw new Error('Load ID is required to log an activity event.');
    }
    if (!input.title || !input.title.trim()) {
      throw new Error('Activity event title is required.');
    }
    if (!input.description || !input.description.trim()) {
      throw new Error('Activity event description is required.');
    }

    const currentActivities = this.loadFromStorage(organizationId);

    const newEvent: LoadActivityEvent = {
      id: `act-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      organizationId,
      organization_id: organizationId,
      loadId: input.loadId,
      load_id: input.loadId,
      actorId: input.actorId || 'usr-current',
      actorName: input.actorName || 'Dispatcher',
      type: input.type,
      title: input.title.trim(),
      description: input.description.trim(),
      timestamp: input.timestamp || new Date().toISOString(),
      metadata: input.metadata || null,
    };

    // Append-only to history
    const updated = [newEvent, ...currentActivities];
    this.saveToStorage(organizationId, updated);

    return newEvent;
  }

  async recordStatusChange(
    organizationId: string,
    loadId: string,
    previousStatus: PipelineStatus,
    newStatus: PipelineStatus,
    actorName: string = 'Dispatcher',
    actorId: string = 'usr-dispatcher',
    note?: string
  ): Promise<LoadActivityEvent> {
    const prevLabel = previousStatus.replace('_', ' ').toUpperCase();
    const newLabel = newStatus.replace('_', ' ').toUpperCase();

    const title = `Status Shift: ${prevLabel} → ${newLabel}`;
    const description = note
      ? `Load pipeline stage updated from ${prevLabel} to ${newLabel}. Note: ${note}`
      : `Load pipeline stage advanced from ${prevLabel} to ${newLabel}.`;

    return this.logActivity(organizationId, {
      loadId,
      type: 'status_change',
      title,
      description,
      actorName,
      actorId,
      metadata: {
        previousStatus,
        newStatus,
        statusReason: note || null,
      },
    });
  }

  async recordAssignmentChange(
    organizationId: string,
    loadId: string,
    changes: {
      previousTruckNumber?: string | null;
      newTruckNumber?: string | null;
      previousDriverName?: string | null;
      newDriverName?: string | null;
      previousTruckId?: string | null;
      newTruckId?: string | null;
      previousDriverId?: string | null;
      newDriverId?: string | null;
      previousDispatcherId?: string | null;
      newDispatcherId?: string | null;
      previousDispatcherName?: string | null;
      newDispatcherName?: string | null;
    },
    actorName: string = 'Dispatcher',
    actorId: string = 'usr-dispatcher'
  ): Promise<LoadActivityEvent> {
    const details: string[] = [];

    if (changes.previousTruckNumber !== changes.newTruckNumber) {
      if (changes.newTruckNumber) {
        details.push(
          `Truck reassigned from ${changes.previousTruckNumber ? `#${changes.previousTruckNumber}` : 'None'} to #${changes.newTruckNumber}`
        );
      } else {
        details.push(`Truck #${changes.previousTruckNumber} unassigned`);
      }
    }

    if (changes.previousDriverName !== changes.newDriverName) {
      if (changes.newDriverName) {
        details.push(
          `Driver reassigned from ${changes.previousDriverName || 'None'} to ${changes.newDriverName}`
        );
      } else {
        details.push(`Driver ${changes.previousDriverName} unassigned`);
      }
    }

    if (changes.previousDispatcherId !== changes.newDispatcherId) {
      if (changes.newDispatcherId) {
        details.push(
          `Dispatcher assigned to ${changes.newDispatcherName || changes.newDispatcherId} (previously: ${changes.previousDispatcherName || 'None'})`
        );
      } else {
        details.push(`Dispatcher ${changes.previousDispatcherName || ''} unassigned`);
      }
    }

    const description = details.length > 0 ? details.join('. ') + '.' : 'Equipment, driver, or dispatcher assignment modified.';

    return this.logActivity(organizationId, {
      loadId,
      type: 'assignment_change',
      title: 'Dispatch Assignment Shift',
      description,
      actorName,
      actorId,
      metadata: {
        previousTruckId: changes.previousTruckId,
        newTruckId: changes.newTruckId,
        previousTruckNumber: changes.previousTruckNumber,
        newTruckNumber: changes.newTruckNumber,
        previousDriverId: changes.previousDriverId,
        newDriverId: changes.newDriverId,
        previousDriverName: changes.previousDriverName,
        newDriverName: changes.newDriverName,
        previousDispatcherId: changes.previousDispatcherId,
        newDispatcherId: changes.newDispatcherId,
        previousDispatcherName: changes.previousDispatcherName,
        newDispatcherName: changes.newDispatcherName,
      },
    });
  }

  async recordTeamAssignmentChange(
    organizationId: string,
    loadId: string,
    previousMemberId: string | null | undefined,
    newMemberId: string | null | undefined,
    previousMemberName: string | null | undefined,
    newMemberName: string | null | undefined,
    memberRole?: string | null,
    actorName: string = 'Admin',
    actorId: string = 'usr-admin'
  ): Promise<LoadActivityEvent> {
    const roleLabel = memberRole === 'owner_admin' ? 'Admin' : memberRole === 'dispatcher' ? 'Dispatcher' : memberRole === 'staff' ? 'Staff' : memberRole || '';
    let description = '';
    if (newMemberId) {
      const roleSuffix = roleLabel ? ` (${roleLabel})` : '';
      description = `Assigned to team member ${newMemberName || newMemberId}${roleSuffix}${
        previousMemberName ? ` (previously ${previousMemberName})` : ''
      } by ${actorName}.`;
    } else {
      description = `Team assignment cleared${
        previousMemberName ? ` (previously ${previousMemberName})` : ''
      } by ${actorName}.`;
    }

    return this.logActivity(organizationId, {
      loadId,
      type: 'assignment_change',
      title: newMemberId ? 'Team Member Assigned' : 'Team Member Unassigned',
      description,
      actorName,
      actorId,
      metadata: {
        previousMemberId,
        newMemberId,
        previousMemberName,
        newMemberName,
        memberRole,
        // Backward-compatible metadata keys
        previousDispatcherId: previousMemberId,
        newDispatcherId: newMemberId,
        previousDispatcherName: previousMemberName,
        newDispatcherName: newMemberName,
      },
    });
  }

  async recordMultiTeamAssignmentChange(
    organizationId: string,
    loadId: string,
    addedMembers: ({ id: string; name: string; role?: string } | string)[] = [],
    removedMembersOrNames: ({ id: string; name: string; role?: string } | string)[] = [],
    mode: 'add' | 'replace' | 'remove' = 'add',
    isBulk: boolean = false,
    actorName: string = 'Admin',
    actorId: string = 'usr-admin'
  ): Promise<LoadActivityEvent> {
    const normalizeList = (list: ({ id: string; name: string; role?: string } | string)[]) => {
      return list.map((item) => {
        if (typeof item === 'string') {
          return { id: item, name: item };
        }
        return item;
      });
    };

    const added = normalizeList(addedMembers);
    const removed = normalizeList(removedMembersOrNames);

    const formatMembers = (list: { id: string; name: string; role?: string }[]) =>
      list
        .map((m) => {
          const roleLabel =
            m.role === 'owner_admin'
              ? 'Admin'
              : m.role === 'dispatcher'
              ? 'Dispatcher'
              : m.role === 'staff'
              ? 'Staff'
              : m.role || '';
          return `${m.name}${roleLabel ? ` (${roleLabel})` : ''}`;
        })
        .join(', ');

    let description = '';
    let title = 'Team Assignment Updated';

    if (mode === 'replace') {
      title = 'Team Assignments Replaced';
      description =
        added.length > 0
          ? `Team assignments replaced with: ${formatMembers(added)} by ${actorName}${isBulk ? ' (bulk operation)' : ''}.`
          : `All team assignments cleared by ${actorName}${isBulk ? ' (bulk operation)' : ''}.`;
    } else if (mode === 'remove') {
      title = 'Team Members Removed';
      description =
        removed.length > 0
          ? `Removed ${formatMembers(removed)} from load by ${actorName}${isBulk ? ' (bulk operation)' : ''}.`
          : `Team members removed by ${actorName}${isBulk ? ' (bulk operation)' : ''}.`;
    } else {
      title = 'Team Members Added';
      description =
        added.length > 0
          ? `Added ${formatMembers(added)} to load team by ${actorName}${isBulk ? ' (bulk operation)' : ''}.`
          : `Team assignment updated by ${actorName}${isBulk ? ' (bulk operation)' : ''}.`;
    }

    return this.logActivity(organizationId, {
      loadId,
      type: 'assignment_change',
      title,
      description,
      actorName,
      actorId,
      metadata: {
        mode,
        isBulk,
        addedMembers: added,
        removedMembers: removed,
      },
    });
  }

  async recordDispatcherAssignmentChange(
    organizationId: string,
    loadId: string,
    previousDispatcherId: string | null | undefined,
    newDispatcherId: string | null | undefined,
    previousDispatcherName: string | null | undefined,
    newDispatcherName: string | null | undefined,
    actorName: string = 'Dispatcher',
    actorId: string = 'usr-dispatcher'
  ): Promise<LoadActivityEvent> {
    return this.recordTeamAssignmentChange(
      organizationId,
      loadId,
      previousDispatcherId,
      newDispatcherId,
      previousDispatcherName,
      newDispatcherName,
      'dispatcher',
      actorName,
      actorId
    );
  }

  async recordDocumentEvent(
    organizationId: string,
    loadId: string,
    docType: DocumentType,
    docName: string,
    action: 'uploaded' | 'verified' | 'rejected' | 'deleted' | 'status_updated',
    actorName: string = 'Dispatcher',
    actorId: string = 'usr-dispatcher',
    docStatus?: DocumentStatus
  ): Promise<LoadActivityEvent> {
    const docTypePretty = docType.replace('_', ' ').toUpperCase();
    let actionTitle = 'Paperwork Updated';
    let actionDesc = `Document ${docName} (${docTypePretty}) updated.`;

    if (action === 'uploaded') {
      actionTitle = `Paperwork Uploaded: ${docTypePretty}`;
      actionDesc = `New document ${docName} (${docTypePretty}) attached to load paperwork repository.`;
    } else if (action === 'verified') {
      actionTitle = `Paperwork Verified: ${docTypePretty}`;
      actionDesc = `Document ${docName} successfully verified and approved for billing audit.`;
    } else if (action === 'rejected') {
      actionTitle = `Paperwork Rejected: ${docTypePretty}`;
      actionDesc = `Document ${docName} was rejected during verification check. Replacement required.`;
    } else if (action === 'deleted') {
      actionTitle = `Paperwork Removed: ${docTypePretty}`;
      actionDesc = `Document ${docName} was detached and deleted from load paperwork.`;
    }

    return this.logActivity(organizationId, {
      loadId,
      type: 'document_event',
      title: actionTitle,
      description: actionDesc,
      actorName,
      actorId,
      metadata: {
        docType,
        docName,
        docAction: action,
        docStatus: docStatus || null,
      },
    });
  }

  async recordBrokerUpdate(
    organizationId: string,
    loadId: string,
    brokerName: string,
    details: string,
    actorName: string = 'Dispatcher',
    actorId: string = 'usr-dispatcher',
    metadata?: Record<string, any>
  ): Promise<LoadActivityEvent> {
    return this.logActivity(organizationId, {
      loadId,
      type: 'broker_update',
      title: `Broker Comms: ${brokerName}`,
      description: details,
      actorName,
      actorId,
      metadata: {
        brokerName,
        ...metadata,
      },
    });
  }

  async recordDriverUpdate(
    organizationId: string,
    loadId: string,
    driverName: string,
    details: string,
    actorName: string = 'Driver',
    actorId: string = 'usr-driver',
    metadata?: Record<string, any>
  ): Promise<LoadActivityEvent> {
    return this.logActivity(organizationId, {
      loadId,
      type: 'driver_update',
      title: `Driver Update: ${driverName}`,
      description: details,
      actorName,
      actorId,
      metadata: {
        driverName,
        ...metadata,
      },
    });
  }

  async recordSystemEvent(
    organizationId: string,
    loadId: string,
    title: string,
    description: string,
    metadata?: Record<string, any>
  ): Promise<LoadActivityEvent> {
    return this.logActivity(organizationId, {
      loadId,
      type: 'system_event',
      title,
      description,
      actorName: 'DispatchDesk System',
      actorId: 'system',
      metadata,
    });
  }
}

export const activityService: IActivityService = new LocalActivityService();
