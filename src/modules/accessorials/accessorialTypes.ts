import { Load, LoadDetentionRecord, LoadDetentionRecordInsert, LoadDetentionRecordUpdate } from '../../types/domain.types.ts';
import { LoadWithRelations } from '../loads/loadTypes.ts';

export type { LoadDetentionRecord, LoadDetentionRecordInsert, LoadDetentionRecordUpdate };
export type CreateDetentionRecordInput = Omit<LoadDetentionRecordInsert, 'organization_id'> & { organization_id?: string };

export type AccessorialType =
  | 'detention'
  | 'layover'
  | 'tonu'
  | 'lumper'
  | 'extra_stop'
  | 'scale_tickets'
  | 'tolls'
  | 'pallet_jack'
  | 'other';

export type AccessorialStatus =
  | 'draft'
  | 'submitted_to_broker'
  | 'approved_on_rate_con'
  | 'rejected'
  | 'invoiced';

export type FacilityStopType = 'pickup' | 'delivery' | 'intermediate_stop';

export interface DetentionDetails {
  facility_type: FacilityStopType;
  facility_name?: string;
  facility_address?: string;
  facility_timezone?: string;
  appointment_time?: string | null; // ISO datetime
  arrival_time: string; // ISO datetime
  loading_start_time?: string | null;
  loading_complete_time?: string | null;
  unloading_start_time?: string | null;
  unloading_complete_time?: string | null;
  departure_time?: string | null; // ISO datetime; null if still at dock (active)
  free_time_hours: number; // default 2.0
  hourly_rate: number; // default 75.0
  detention_start_time?: string | null;
  billable_hours: number; // rounded to 0.25 (15 min) increments
  is_active_detention: boolean; // true if driver is currently waiting past free time
  auto_synced_from_checkcall_id?: string | null;
}

export interface AccessorialClaim {
  id: string;
  organization_id: string;
  load_id: string;
  type: AccessorialType;
  status: AccessorialStatus;
  description: string;
  amount: number;
  currency: string; // 'USD'
  
  // Detention specific payload (if type === 'detention')
  detention_details?: DetentionDetails;

  // Lumper / receipts
  receipt_doc_id?: string | null;
  receipt_doc_name?: string | null;
  receipt_number?: string | null;
  payment_method?: 'comchek' | 'efs' | 'credit_card' | 'driver_cash' | 'broker_direct' | 'other';

  // Broker negotiation & tracking
  broker_name?: string;
  broker_contact_person?: string;
  broker_contact_email?: string;
  broker_contact_phone?: string;
  rate_con_revision_number?: string | null;

  // Lifecycle actors & timestamps
  requested_by_id: string;
  requested_by_name: string;
  submitted_at?: string | null;
  approved_at?: string | null;
  rejected_at?: string | null;
  rejection_reason?: string | null;
  invoiced_at?: string | null;
  notes?: string | null;

  created_at: string;
  updated_at: string;
}

export interface AccessorialWithLoad extends AccessorialClaim {
  load?: LoadWithRelations | null;
}

export interface CreateAccessorialInput {
  load_id: string;
  type: AccessorialType;
  status?: AccessorialStatus;
  description: string;
  amount?: number;
  currency?: string;
  
  detention_details?: {
    facility_type: FacilityStopType;
    facility_name?: string;
    facility_address?: string;
    facility_timezone?: string;
    appointment_time?: string | null;
    arrival_time: string;
    loading_start_time?: string | null;
    loading_complete_time?: string | null;
    unloading_start_time?: string | null;
    unloading_complete_time?: string | null;
    departure_time?: string | null;
    free_time_hours?: number;
    hourly_rate?: number;
    detention_start_time?: string | null;
    billable_hours?: number;
    is_active_detention?: boolean;
    auto_synced_from_checkcall_id?: string | null;
  };

  receipt_doc_id?: string | null;
  receipt_doc_name?: string | null;
  receipt_number?: string | null;
  payment_method?: 'comchek' | 'efs' | 'credit_card' | 'driver_cash' | 'broker_direct' | 'other';

  broker_name?: string;
  broker_contact_person?: string;
  broker_contact_email?: string;
  broker_contact_phone?: string;
  rate_con_revision_number?: string | null;
  notes?: string | null;
}

export interface UpdateAccessorialInput {
  type?: AccessorialType;
  status?: AccessorialStatus;
  description?: string;
  amount?: number;
  
  detention_details?: {
    facility_type?: FacilityStopType;
    facility_name?: string;
    facility_address?: string;
    facility_timezone?: string;
    appointment_time?: string | null;
    arrival_time?: string;
    loading_start_time?: string | null;
    loading_complete_time?: string | null;
    unloading_start_time?: string | null;
    unloading_complete_time?: string | null;
    departure_time?: string | null;
    free_time_hours?: number;
    hourly_rate?: number;
    detention_start_time?: string | null;
    billable_hours?: number;
    is_active_detention?: boolean;
    auto_synced_from_checkcall_id?: string | null;
  };

  receipt_doc_id?: string | null;
  receipt_doc_name?: string | null;
  receipt_number?: string | null;
  payment_method?: 'comchek' | 'efs' | 'credit_card' | 'driver_cash' | 'broker_direct' | 'other';

  broker_name?: string;
  broker_contact_person?: string;
  broker_contact_email?: string;
  broker_contact_phone?: string;
  rate_con_revision_number?: string | null;
  rejection_reason?: string | null;
  notes?: string | null;
}

export interface DetentionCalculationResult {
  totalDurationMs: number;
  totalDurationHours: number;
  freeTimeHours: number;
  freeTimeMs: number;
  detentionStartTimeIso: string;
  rawDetentionHours: number;
  billableHours: number; // 0.25 (15-min) increments
  hourlyRate: number;
  totalAmount: number;
  isWithinFreeTime: boolean;
  isActiveDetention: boolean;
  timeRemainingInFreeTimeMs: number;
  formattedDuration: string;
  formattedBillableTime: string;
}

export interface AccessorialSummaryStats {
  totalClaimsCount: number;
  activeDetentionsCount: number;
  pendingBrokerAmount: number;
  approvedAmount: number;
  invoicedAmount: number;
  rejectedCount: number;
}

export const ACCESSORIAL_TYPE_CONFIG: Record<
  AccessorialType,
  { label: string; defaultRate: number; requiresReceipt: boolean; badgeColor: string }
> = {
  detention: {
    label: 'Detention Time',
    defaultRate: 75.0,
    requiresReceipt: false,
    badgeColor: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  },
  layover: {
    label: 'Layover',
    defaultRate: 250.0,
    requiresReceipt: false,
    badgeColor: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
  },
  tonu: {
    label: 'TONU (Truck Ordered Not Used)',
    defaultRate: 150.0,
    requiresReceipt: false,
    badgeColor: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
  },
  lumper: {
    label: 'Lumper Fee',
    defaultRate: 0.0,
    requiresReceipt: true,
    badgeColor: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  },
  extra_stop: {
    label: 'Extra Stop-Off',
    defaultRate: 100.0,
    requiresReceipt: false,
    badgeColor: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  },
  scale_tickets: {
    label: 'Scale Tickets (CAT Scale)',
    defaultRate: 15.0,
    requiresReceipt: true,
    badgeColor: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30',
  },
  tolls: {
    label: 'Reimbursable Tolls',
    defaultRate: 0.0,
    requiresReceipt: true,
    badgeColor: 'bg-sky-500/10 text-sky-400 border-sky-500/30',
  },
  pallet_jack: {
    label: 'Pallet Jack / Gate Fee',
    defaultRate: 50.0,
    requiresReceipt: false,
    badgeColor: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30',
  },
  other: {
    label: 'Other Accessorial',
    defaultRate: 0.0,
    requiresReceipt: false,
    badgeColor: 'bg-slate-500/10 text-slate-400 border-slate-500/30',
  },
};

export const ACCESSORIAL_STATUS_CONFIG: Record<
  AccessorialStatus,
  { label: string; color: string; description: string }
> = {
  draft: {
    label: 'Draft',
    color: 'bg-slate-700/50 text-slate-300 border-slate-600',
    description: 'Claim prepared by dispatcher, not yet sent to broker',
  },
  submitted_to_broker: {
    label: 'Submitted to Broker',
    color: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    description: 'Claim notice sent to broker; awaiting revised Rate Con',
  },
  approved_on_rate_con: {
    label: 'Approved (Revised Rate Con)',
    color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    description: 'Broker sent revised rate confirmation with accessorial added',
  },
  rejected: {
    label: 'Disputed / Rejected',
    color: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
    description: 'Broker rejected claim or refused compensation',
  },
  invoiced: {
    label: 'Invoiced / Factored',
    color: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30',
    description: 'Included on final carrier billing invoice to broker/factoring',
  },
};
