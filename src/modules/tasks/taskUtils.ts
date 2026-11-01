import { TaskStatus, TaskPriority, TaskCategory, TaskTriggerSource, DispatcherTask } from './taskTypes.ts';
import { getEffectiveDueAt } from './taskService.ts';

export interface RelativeDueInfo {
  text: string;
  shortText: string;
  isOverdue: boolean;
  isDueSoon: boolean;
  colorClass: string;
  bgClass: string;
  badgeBorder: string;
}

export const TRIGGER_SOURCE_CONFIG: Record<
  TaskTriggerSource,
  { label: string; shortLabel: string; badgeClass: string }
> = {
  manual: {
    label: 'Manual Task',
    shortLabel: 'Manual',
    badgeClass: 'text-slate-400 bg-slate-800/60 border-slate-700',
  },
  system_rule: {
    label: 'System Auto-Reminder',
    shortLabel: 'Auto-Rule',
    badgeClass: 'text-cyan-400 bg-cyan-950/60 border-cyan-800/70',
  },
  ai_extracted: {
    label: 'AI Copilot Extracted',
    shortLabel: 'AI Copilot',
    badgeClass: 'text-indigo-400 bg-indigo-950/60 border-indigo-800/70',
  },
  check_call_exception: {
    label: 'Check-Call Exception',
    shortLabel: 'Exception',
    badgeClass: 'text-rose-400 bg-rose-950/60 border-rose-800/70',
  },
  detention_clock: {
    label: 'Detention Clock Alert',
    shortLabel: 'Detention Clock',
    badgeClass: 'text-amber-400 bg-amber-950/60 border-amber-800/70',
  },
  document_alert: {
    label: 'Document Audit Alert',
    shortLabel: 'Paperwork Alert',
    badgeClass: 'text-emerald-400 bg-emerald-950/60 border-emerald-800/70',
  },
};

export const TEAM_MEMBERS = [
  { id: 'usr-alex-1', name: 'Alex Rivera (Lead Dispatcher)', shortName: 'Alex Rivera', role: 'Lead Dispatcher' },
  { id: 'usr-david-4', name: 'David Miller (Night Dispatcher)', shortName: 'David Miller', role: 'Night Dispatcher' },
  { id: 'usr-marcus-2', name: 'Marcus Vance (Fleet Driver)', shortName: 'Marcus Vance', role: 'Driver' },
  { id: 'usr-elena-3', name: 'Elena Gomez (Fleet Driver)', shortName: 'Elena Gomez', role: 'Driver' },
  { id: 'usr-sarah-5', name: 'Sarah Jenkins (Broker Account Rep)', shortName: 'Sarah Jenkins', role: 'Broker Rep' },
];

/**
 * Calculates human-readable relative timing with high-contrast color badges.
 */
export function formatRelativeDue(task: DispatcherTask, now: Date = new Date()): RelativeDueInfo {
  if (task.status === 'completed') {
    return {
      text: 'Completed',
      shortText: 'Done',
      isOverdue: false,
      isDueSoon: false,
      colorClass: 'text-emerald-400',
      bgClass: 'bg-emerald-950/40',
      badgeBorder: 'border-emerald-800/60',
    };
  }

  if (task.status === 'cancelled') {
    return {
      text: 'Cancelled',
      shortText: 'Void',
      isOverdue: false,
      isDueSoon: false,
      colorClass: 'text-slate-400',
      bgClass: 'bg-slate-900/60',
      badgeBorder: 'border-slate-800',
    };
  }

  const effectiveDueIso = getEffectiveDueAt(task);
  const target = new Date(effectiveDueIso);
  const diffMs = target.getTime() - now.getTime();

  if (diffMs < 0) {
    // Overdue
    const absMs = Math.abs(diffMs);
    const minutes = Math.floor(absMs / (60 * 1000));
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    let text = '';
    let shortText = '';
    if (days > 0) {
      text = `Overdue by ${days}d ${hours % 24}h`;
      shortText = `+${days}d`;
    } else if (hours > 0) {
      text = `Overdue by ${hours}h ${minutes % 60}m`;
      shortText = `+${hours}h`;
    } else {
      const m = Math.max(1, minutes);
      text = `Overdue by ${m}m`;
      shortText = `+${m}m`;
    }

    return {
      text,
      shortText,
      isOverdue: true,
      isDueSoon: false,
      colorClass: 'text-rose-400',
      bgClass: 'bg-rose-950/60',
      badgeBorder: 'border-rose-800/70',
    };
  }

  // Future due
  const minutes = Math.floor(diffMs / (60 * 1000));
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const isDueSoon = minutes <= 60;

  if (task.status === 'snoozed') {
    let text = '';
    let shortText = '';
    if (days > 0) {
      text = `Snoozed (${days}d remaining)`;
      shortText = `Zzz ${days}d`;
    } else if (hours > 0) {
      text = `Snoozed (${hours}h ${minutes % 60}m)`;
      shortText = `Zzz ${hours}h`;
    } else {
      const m = Math.max(1, minutes);
      text = `Snoozed (${m}m)`;
      shortText = `Zzz ${m}m`;
    }

    return {
      text,
      shortText,
      isOverdue: false,
      isDueSoon: false,
      colorClass: 'text-amber-400',
      bgClass: 'bg-amber-950/40',
      badgeBorder: 'border-amber-800/60',
    };
  }

  let text = '';
  let shortText = '';
  if (days > 0) {
    text = `Due in ${days}d ${hours % 24}h`;
    shortText = `in ${days}d`;
  } else if (hours > 0) {
    text = `Due in ${hours}h ${minutes % 60}m`;
    shortText = `in ${hours}h`;
  } else {
    const m = Math.max(1, minutes);
    text = `Due in ${m}m`;
    shortText = `in ${m}m`;
  }

  return {
    text,
    shortText,
    isOverdue: false,
    isDueSoon,
    colorClass: isDueSoon ? 'text-amber-300' : 'text-slate-300',
    bgClass: isDueSoon ? 'bg-amber-950/40' : 'bg-slate-900/60',
    badgeBorder: isDueSoon ? 'border-amber-800/60' : 'border-slate-800',
  };
}
