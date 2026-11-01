import { LoadWithRelations } from '../loads/loadTypes.ts';
import { DispatcherTask } from '../tasks/taskTypes.ts';
import { CheckCallWithRelations } from '../checkcalls/checkCallTypes.ts';
import { PipelineStatus, UserRole } from '../../types/domain.types.ts';

export type CalendarViewMode = 'week' | 'month' | 'day' | 'agenda';

export type CalendarEventType =
  | 'pickup'           // Load pickup window / appointment
  | 'delivery'         // Load delivery window / appointment
  | 'task'             // Task due / reminder
  | 'check_call_due'   // Next scheduled driver check-in
  | 'eta_warning';     // Delay or approaching delivery deadline

export type EventUrgency = 'normal' | 'urgent' | 'overdue' | 'completed';

export interface OperationsCalendarEvent {
  id: string;                          // Unique event ID (e.g. "pickup-load-123", "task-456")
  sourceType: 'load' | 'task' | 'check_call';
  sourceId: string;                    // ID of the underlying Load, Task, or CheckCall
  title: string;                       // e.g. "Pickup: LD-2024-8841 (Dallas, TX)"
  datetime: string;                    // ISO-8601 UTC timestamp
  endDatetime?: string;                // Window end (if window exists)
  eventType: CalendarEventType;
  status: string;                      // LoadStatus or TaskStatus
  urgency: EventUrgency;
  isOverdue: boolean;
  
  // Enriched Dispatch & Freight Metadata
  loadNumber?: string;
  clientName?: string;
  clientId?: string;
  brokerName?: string;
  brokerId?: string;
  driverName?: string;
  driverId?: string;
  truckUnit?: string;
  truckId?: string;
  origin?: string;
  destination?: string;
  commodity?: string;
  equipmentType?: string;
  rate?: number;
  
  // Task specific
  taskCategory?: string;
  taskPriority?: string;
  
  // Check-call specific
  lastLocation?: string;
  reportedEta?: string;

  // Raw underlying entity for modal interactions
  rawLoad?: LoadWithRelations;
  rawTask?: DispatcherTask;
  rawCheckCall?: CheckCallWithRelations;
}

export interface CalendarFilterState {
  searchQuery: string;
  eventTypes: CalendarEventType[];
  clientIds: string[];
  driverIds: string[];
  truckIds: string[];
  brokerIds: string[];
  loadStatuses: PipelineStatus[];
  onlyOverdue: boolean;
  onlyToday: boolean;
}

export interface CalendarStats {
  todayPickupsCount: number;
  todayDeliveriesCount: number;
  pendingCheckCallsCount: number;
  highPriorityTasksCount: number;
  overdueCount: number;
  totalActiveLoadsCount: number;
}

export interface CalendarDataResult {
  events: OperationsCalendarEvent[];
  stats: CalendarStats;
  loads: LoadWithRelations[];
  tasks: DispatcherTask[];
  checkCalls: CheckCallWithRelations[];
}

export const CALENDAR_EVENT_CONFIG: Record<CalendarEventType, {
  label: string;
  shortLabel: string;
  colorClass: string;
  bgClass: string;
  borderClass: string;
  badgeClass: string;
}> = {
  pickup: {
    label: 'Pickup Appointment',
    shortLabel: 'Pickup',
    colorClass: 'text-amber-400',
    bgClass: 'bg-amber-500/10',
    borderClass: 'border-amber-500/30',
    badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
  },
  delivery: {
    label: 'Delivery Appointment',
    shortLabel: 'Delivery',
    colorClass: 'text-emerald-400',
    bgClass: 'bg-emerald-500/10',
    borderClass: 'border-emerald-500/30',
    badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  },
  task: {
    label: 'Dispatcher Task',
    shortLabel: 'Task',
    colorClass: 'text-indigo-400',
    bgClass: 'bg-indigo-500/10',
    borderClass: 'border-indigo-500/30',
    badgeClass: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40',
  },
  check_call_due: {
    label: 'Check Call Due',
    shortLabel: 'Check Call',
    colorClass: 'text-cyan-400',
    bgClass: 'bg-cyan-500/10',
    borderClass: 'border-cyan-500/30',
    badgeClass: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
  },
  eta_warning: {
    label: 'Delay / ETA Alert',
    shortLabel: 'ETA Warning',
    colorClass: 'text-rose-400',
    bgClass: 'bg-rose-500/10',
    borderClass: 'border-rose-500/30',
    badgeClass: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
  },
};
