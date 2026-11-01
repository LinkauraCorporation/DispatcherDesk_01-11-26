import { PipelineStatus, DocumentType, DocumentStatus } from '../../types/domain.types.ts';

export type ActivityType =
  | 'status_change'
  | 'dispatcher_note'
  | 'driver_update'
  | 'broker_update'
  | 'document_event'
  | 'assignment_change'
  | 'ai_assistant'
  | 'system_event';

export interface LoadActivityEvent {
  id: string;
  organizationId: string;
  organization_id?: string;
  loadId: string;
  load_id?: string;
  actorId: string;
  actorName: string;
  type: ActivityType;
  title: string;
  description: string;
  timestamp: string; // ISO datetime string
  metadata?: {
    // Status Change
    previousStatus?: PipelineStatus;
    newStatus?: PipelineStatus;
    statusReason?: string;

    // Assignment Change
    previousTruckId?: string | null;
    newTruckId?: string | null;
    previousTruckNumber?: string | null;
    newTruckNumber?: string | null;
    previousDriverId?: string | null;
    newDriverId?: string | null;
    previousDriverName?: string | null;
    newDriverName?: string | null;

    // Document Event
    docId?: string;
    docType?: DocumentType;
    docName?: string;
    docStatus?: DocumentStatus;
    docAction?: 'uploaded' | 'verified' | 'rejected' | 'deleted' | 'status_updated';

    // Broker / Driver / Dispatcher Update
    brokerName?: string;
    contactPerson?: string;
    contactPhone?: string;
    driverPhone?: string;
    locationCity?: string;
    locationState?: string;
    eta?: string;
    criticalAlert?: boolean;

    // Custom Key-Values
    [key: string]: any;
  } | null;
}

export interface CreateActivityInput {
  loadId: string;
  type: ActivityType;
  title: string;
  description: string;
  actorId?: string;
  actorName?: string;
  timestamp?: string;
  metadata?: Record<string, any> | null;
}

export type ActivityFilterType = 'all' | ActivityType;

export interface ActivityFilterOptions {
  type?: ActivityFilterType;
  search?: string;
}

export const ACTIVITY_TYPE_LABELS: Record<ActivityType, string> = {
  status_change: 'Status Shift',
  dispatcher_note: 'Dispatcher Note',
  driver_update: 'Driver Check-In',
  broker_update: 'Broker Comms',
  document_event: 'Paperwork Event',
  assignment_change: 'Assignment Shift',
  ai_assistant: 'AI Copilot Event',
  system_event: 'System Audit',
};

export const ACTIVITY_FILTER_OPTIONS: { value: ActivityFilterType; label: string }[] = [
  { value: 'all', label: 'All Activity' },
  { value: 'status_change', label: 'Status Shifts' },
  { value: 'dispatcher_note', label: 'Dispatcher Notes' },
  { value: 'driver_update', label: 'Driver Updates' },
  { value: 'broker_update', label: 'Broker Comms' },
  { value: 'document_event', label: 'Paperwork Events' },
  { value: 'assignment_change', label: 'Assignments' },
  { value: 'ai_assistant', label: 'AI Copilot' },
  { value: 'system_event', label: 'System Audits' },
];

export interface ActivityBadgeConfig {
  label: string;
  color: string;
  badgeBg: string;
  badgeBorder: string;
  badgeText: string;
  iconBg: string;
  iconBorder: string;
  iconColor: string;
}

export const ACTIVITY_TYPE_CONFIG: Record<ActivityType, ActivityBadgeConfig> = {
  status_change: {
    label: 'Status Shift',
    color: 'indigo',
    badgeBg: 'bg-indigo-950/80',
    badgeBorder: 'border-indigo-800/60',
    badgeText: 'text-indigo-300',
    iconBg: 'bg-indigo-950/90',
    iconBorder: 'border-indigo-700/60',
    iconColor: 'text-indigo-400',
  },
  dispatcher_note: {
    label: 'Dispatcher Note',
    color: 'amber',
    badgeBg: 'bg-amber-950/80',
    badgeBorder: 'border-amber-800/60',
    badgeText: 'text-amber-300',
    iconBg: 'bg-amber-950/90',
    iconBorder: 'border-amber-700/60',
    iconColor: 'text-amber-400',
  },
  driver_update: {
    label: 'Driver Update',
    color: 'purple',
    badgeBg: 'bg-purple-950/80',
    badgeBorder: 'border-purple-800/60',
    badgeText: 'text-purple-300',
    iconBg: 'bg-purple-950/90',
    iconBorder: 'border-purple-700/60',
    iconColor: 'text-purple-400',
  },
  broker_update: {
    label: 'Broker Comms',
    color: 'sky',
    badgeBg: 'bg-sky-950/80',
    badgeBorder: 'border-sky-800/60',
    badgeText: 'text-sky-300',
    iconBg: 'bg-sky-950/90',
    iconBorder: 'border-sky-700/60',
    iconColor: 'text-sky-400',
  },
  document_event: {
    label: 'Paperwork Event',
    color: 'emerald',
    badgeBg: 'bg-emerald-950/80',
    badgeBorder: 'border-emerald-800/60',
    badgeText: 'text-emerald-300',
    iconBg: 'bg-emerald-950/90',
    iconBorder: 'border-emerald-700/60',
    iconColor: 'text-emerald-400',
  },
  assignment_change: {
    label: 'Assignment Shift',
    color: 'orange',
    badgeBg: 'bg-orange-950/80',
    badgeBorder: 'border-orange-800/60',
    badgeText: 'text-orange-300',
    iconBg: 'bg-orange-950/90',
    iconBorder: 'border-orange-700/60',
    iconColor: 'text-orange-400',
  },
  ai_assistant: {
    label: 'AI Copilot',
    color: 'violet',
    badgeBg: 'bg-violet-950/80',
    badgeBorder: 'border-violet-800/60',
    badgeText: 'text-violet-300',
    iconBg: 'bg-violet-950/90',
    iconBorder: 'border-violet-700/60',
    iconColor: 'text-violet-400',
  },
  system_event: {
    label: 'System Audit',
    color: 'slate',
    badgeBg: 'bg-slate-900',
    badgeBorder: 'border-slate-700',
    badgeText: 'text-slate-300',
    iconBg: 'bg-slate-900',
    iconBorder: 'border-slate-700',
    iconColor: 'text-slate-400',
  },
};
