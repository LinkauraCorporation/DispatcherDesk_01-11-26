import { UserRole } from '../../types/domain.types.ts';

export type TaskCategory =
  | 'check_call'             // Follow up on driver location / transit milestone
  | 'detention_warning'      // Notify broker of approaching/accumulating detention
  | 'document_collection'    // Collect signed POD, BOL, lumper receipt, or Rate Con
  | 'broker_update'          // Send scheduled ETA update or revised appointment
  | 'driver_instruction'     // Dispatch pickup numbers, gate codes, or delivery address
  | 'appointment_scheduling' // Reschedule missed receiver/shipper window
  | 'billing_prep'           // Verify all accessorials and paperwork before invoicing
  | 'general_operational';   // Custom dispatcher task

export type TaskPriority = 'urgent' | 'high' | 'normal' | 'low';

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'snoozed' | 'cancelled';

export type TaskTriggerSource =
  | 'manual'
  | 'system_rule'
  | 'ai_extracted'
  | 'check_call_exception'
  | 'detention_clock'
  | 'document_alert';

export type SnoozePreset =
  | '15m'
  | '30m'
  | '1h'
  | '2h'
  | '4h'
  | 'tomorrow_morning'
  | 'next_shift'
  | 'custom';

export interface DispatcherTask {
  id: string;
  organization_id: string;
  load_id?: string | null;           // Optional link to specific load
  load_number?: string | null;       // Denormalized for rapid listing
  category: TaskCategory;
  title: string;
  description?: string;
  priority: TaskPriority;
  status: TaskStatus;

  // Timing & Dual-Timezone Scheduling
  due_at: string;                    // ISO 8601 UTC timestamp
  timezone_context?: string;         // e.g. 'America/Chicago' (Operational) or 'Asia/Kolkata' (Dispatcher)
  reminder_offset_minutes?: number;  // Alert N minutes prior to due_at (e.g. 15, 30, 60)
  snoozed_until?: string | null;     // ISO 8601 UTC timestamp

  // Assignment & Ownership
  assigned_to_user_id?: string | null;
  assigned_to_name?: string | null;
  created_by_user_id: string;
  created_by_name: string;

  // Contextual Trigger Source & Deduplication
  trigger_source?: TaskTriggerSource;
  reference_entity_id?: string | null; // check_call_id, accessorial_id, document_id
  deduplication_key?: string | null;   // Deterministic idempotency key to prevent duplicate reminders

  // Completion Metadata
  completed_at?: string | null;
  completed_by_user_id?: string | null;
  completed_by_name?: string | null;
  completion_notes?: string | null;

  created_at: string;
  updated_at: string;
}

export interface CreateTaskInput {
  load_id?: string | null;
  load_number?: string | null;
  category: TaskCategory;
  title: string;
  description?: string;
  priority?: TaskPriority;
  due_at: string; // ISO UTC
  timezone_context?: string;
  reminder_offset_minutes?: number;
  assigned_to_user_id?: string | null;
  assigned_to_name?: string | null;
  created_by_user_id?: string;
  created_by_name?: string;
  trigger_source?: TaskTriggerSource;
  reference_entity_id?: string | null;
  deduplication_key?: string | null;
}

export interface UpdateTaskInput {
  load_id?: string | null;
  load_number?: string | null;
  category?: TaskCategory;
  title?: string;
  description?: string;
  priority?: TaskPriority;
  status?: TaskStatus;
  due_at?: string;
  timezone_context?: string;
  reminder_offset_minutes?: number;
  assigned_to_user_id?: string | null;
  assigned_to_name?: string | null;
  deduplication_key?: string | null;
  updated_by_user_id?: string;
  updated_by_name?: string;
}

export interface CompleteTaskInput {
  completed_by_user_id?: string;
  completed_by_name?: string;
  completion_notes?: string;
}

export interface SnoozeTaskInput {
  snooze_preset?: SnoozePreset;
  snoozed_until: string; // ISO UTC
  snooze_reason?: string;
  snoozed_by_user_id?: string;
  snoozed_by_name?: string;
}

export interface TaskFilterOptions {
  status?: 'active' | 'completed' | 'snoozed' | 'all' | 'overdue' | 'today';
  priority?: TaskPriority | 'all';
  category?: TaskCategory | 'all';
  loadId?: string;
  assignedTo?: string | 'all' | 'unassigned' | 'me';
  searchQuery?: string;
  limit?: number;
}

export interface TaskStats {
  totalActive: number;
  overdueCount: number;
  dueNextHourCount: number;
  dueTodayCount: number;
  completedTodayCount: number;
  snoozedCount: number;
  byPriority: Record<TaskPriority, number>;
  byCategory: Record<TaskCategory, number>;
}

// Category Configuration & Labels
export const TASK_CATEGORY_CONFIG: Record<
  TaskCategory,
  { label: string; shortLabel: string; color: string; bgColor: string; borderColor: string; iconName: string }
> = {
  check_call: {
    label: 'Driver Check-Call Follow-up',
    shortLabel: 'Check Call',
    color: 'text-sky-400',
    bgColor: 'bg-sky-950/40',
    borderColor: 'border-sky-800/60',
    iconName: 'PhoneCall',
  },
  detention_warning: {
    label: 'Detention Free-Time Warning',
    shortLabel: 'Detention',
    color: 'text-amber-400',
    bgColor: 'bg-amber-950/40',
    borderColor: 'border-amber-800/60',
    iconName: 'Timer',
  },
  document_collection: {
    label: 'POD / Document Collection',
    shortLabel: 'Paperwork',
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-950/40',
    borderColor: 'border-emerald-800/60',
    iconName: 'FileText',
  },
  broker_update: {
    label: 'Broker ETA / Status Notice',
    shortLabel: 'Broker Comms',
    color: 'text-violet-400',
    bgColor: 'bg-violet-950/40',
    borderColor: 'border-violet-800/60',
    iconName: 'Send',
  },
  driver_instruction: {
    label: 'Driver Dispatch Instructions',
    shortLabel: 'Driver Dispatch',
    color: 'text-blue-400',
    bgColor: 'bg-blue-950/40',
    borderColor: 'border-blue-800/60',
    iconName: 'Truck',
  },
  appointment_scheduling: {
    label: 'Appointment Rescheduling',
    shortLabel: 'Appointment',
    color: 'text-orange-400',
    bgColor: 'bg-orange-950/40',
    borderColor: 'border-orange-800/60',
    iconName: 'Calendar',
  },
  billing_prep: {
    label: 'Billing & Invoice Readiness Audit',
    shortLabel: 'Billing Prep',
    color: 'text-teal-400',
    bgColor: 'bg-teal-950/40',
    borderColor: 'border-teal-800/60',
    iconName: 'Receipt',
  },
  general_operational: {
    label: 'General Dispatch Task',
    shortLabel: 'General Task',
    color: 'text-slate-300',
    bgColor: 'bg-slate-800/60',
    borderColor: 'border-slate-700/60',
    iconName: 'CheckSquare',
  },
};

// Priority Configuration & Labels
export const TASK_PRIORITY_CONFIG: Record<
  TaskPriority,
  { label: string; color: string; bgColor: string; borderColor: string; badgeClass: string; rank: number }
> = {
  urgent: {
    label: 'Urgent',
    color: 'text-rose-400',
    bgColor: 'bg-rose-950/50',
    borderColor: 'border-rose-800/70',
    badgeClass: 'text-rose-400 bg-rose-950/60 border-rose-800/80',
    rank: 4,
  },
  high: {
    label: 'High',
    color: 'text-amber-400',
    bgColor: 'bg-amber-950/50',
    borderColor: 'border-amber-800/70',
    badgeClass: 'text-amber-400 bg-amber-950/60 border-amber-800/80',
    rank: 3,
  },
  normal: {
    label: 'Normal',
    color: 'text-blue-400',
    bgColor: 'bg-blue-950/50',
    borderColor: 'border-blue-800/70',
    badgeClass: 'text-blue-400 bg-blue-950/60 border-blue-800/80',
    rank: 2,
  },
  low: {
    label: 'Low',
    color: 'text-slate-400',
    bgColor: 'bg-slate-900/50',
    borderColor: 'border-slate-800',
    badgeClass: 'text-slate-400 bg-slate-800/60 border-slate-700',
    rank: 1,
  },
};

// ==========================================
// Operational Auto-Reminder Engine Interfaces
// ==========================================

export type ReminderRuleType =
  | 'stale_check_call'
  | 'detention_expiry'
  | 'delivered_pod_collection'
  | 'appointment_window'
  | 'unresolved_exception';

export interface ReminderRuleConfig {
  staleCheckCallThresholdHours: number;    // Default: 4 hours
  detentionWarningLeadMinutes: number;     // Default: 30 minutes before free-time expiry
  deliveredPodGracePeriodHours: number;    // Default: 2 hours post-delivery
  appointmentLeadHours: number;            // Default: 2 hours before scheduled window
  autoEvaluateEnabled: boolean;            // Default: true
}

export const DEFAULT_REMINDER_RULE_CONFIG: ReminderRuleConfig = {
  staleCheckCallThresholdHours: 4,
  detentionWarningLeadMinutes: 30,
  deliveredPodGracePeriodHours: 2,
  appointmentLeadHours: 2,
  autoEvaluateEnabled: true,
};

export interface ReminderEvaluationResult {
  evaluatedLoadsCount: number;
  generatedTasks: DispatcherTask[];
  skippedExistingCount: number;
  timestamp: string;
  rulesEvaluated: {
    staleCheckCalls: number;
    detentionExpiry: number;
    deliveredPodCollection: number;
    appointmentWindow: number;
    unresolvedExceptions: number;
  };
}
