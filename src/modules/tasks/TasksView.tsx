import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  CheckSquare,
  Plus,
  Search,
  Filter,
  Clock,
  AlertTriangle,
  CheckCircle2,
  PhoneCall,
  Timer,
  FileText,
  Send,
  Truck,
  Calendar,
  Receipt,
  RotateCcw,
  User,
  UserCheck,
  ChevronDown,
  RefreshCw,
  MoreVertical,
  ExternalLink,
  Pencil,
  Trash2,
  XCircle,
  ShieldAlert,
  Sparkles,
  ArrowRight,
  Bell,
  Check,
  Cpu,
  Sliders,
  SlidersHorizontal,
  Zap,
  Key,
  Info,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext.tsx';
import { useTimezone } from '../../contexts/TimezoneContext.tsx';
import { formatDualTime, formatInTimezone } from '../../lib/timezones.ts';
import { EmptyState } from '../../components/common/EmptyState.tsx';
import { Modal } from '../../components/common/Modal.tsx';
import { StatusBadge } from '../../components/common/StatusBadge.tsx';
import { taskService, getEffectiveDueAt, isTaskOverdue, isTaskDueSoon } from './taskService.ts';
import {
  DispatcherTask,
  TaskCategory,
  TaskPriority,
  TaskStatus,
  TaskFilterOptions,
  TaskStats,
  TaskTriggerSource,
  SnoozePreset,
  ReminderRuleConfig,
  ReminderEvaluationResult,
  DEFAULT_REMINDER_RULE_CONFIG,
  TASK_CATEGORY_CONFIG,
  TASK_PRIORITY_CONFIG,
} from './taskTypes.ts';
import { formatRelativeDue, RelativeDueInfo, TRIGGER_SOURCE_CONFIG, TEAM_MEMBERS } from './taskUtils.ts';
import { TaskModal } from './TaskModal.tsx';
import { loadService } from '../loads/loadService.ts';
import { LoadWithRelations } from '../loads/loadTypes.ts';
import { LoadDetailModal } from '../loads/LoadDetailModal.tsx';

type TabView = 'active' | 'overdue' | 'today' | 'snoozed' | 'completed' | 'all';

interface TasksViewProps {
  onOpenLoadDetail?: (load: LoadWithRelations) => void;
}

export const TasksView: React.FC<TasksViewProps> = ({ onOpenLoadDetail }) => {
  const { activeOrganization, userRole, user, profile } = useAuth();
  const { operationalTimezone, dispatcherTimezone } = useTimezone();
  const orgId = activeOrganization?.id || '';

  const canMutate = userRole === 'owner_admin' || userRole === 'dispatcher';

  // Core Data
  const [tasks, setTasks] = useState<DispatcherTask[]>([]);
  const [stats, setStats] = useState<TaskStats | null>(null);
  const [loads, setLoads] = useState<LoadWithRelations[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Auto-Reminder Engine State
  const [isRunningReminderScan, setIsRunningReminderScan] = useState<boolean>(false);
  const [reminderScanResult, setReminderScanResult] = useState<ReminderEvaluationResult | null>(null);
  const [isReminderConfigModalOpen, setIsReminderConfigModalOpen] = useState<boolean>(false);
  const [reminderConfig, setReminderConfig] = useState<ReminderRuleConfig>(DEFAULT_REMINDER_RULE_CONFIG);

  // Filters & Tabs
  const [activeTab, setActiveTab] = useState<TabView>('active');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [assigneeFilter, setAssigneeFilter] = useState<string>('all');
  const [triggerSourceFilter, setTriggerSourceFilter] = useState<string>('all');

  // Modals & Sub-actions
  const [isTaskModalOpen, setIsTaskModalOpen] = useState<boolean>(false);
  const [taskToEdit, setTaskToEdit] = useState<DispatcherTask | null>(null);

  // Snooze Action Modal
  const [snoozeTaskTarget, setSnoozeTaskTarget] = useState<DispatcherTask | null>(null);
  const [selectedSnoozePreset, setSelectedSnoozePreset] = useState<SnoozePreset>('30m');
  const [customSnoozeDate, setCustomSnoozeDate] = useState<string>('');

  // Reassign Action Modal
  const [reassignTaskTarget, setReassignTaskTarget] = useState<DispatcherTask | null>(null);
  const [reassignUserId, setReassignUserId] = useState<string>('');

  // Cancel Action Modal
  const [cancelTaskTarget, setCancelTaskTarget] = useState<DispatcherTask | null>(null);
  const [cancelReason, setCancelReason] = useState<string>('');

  // Complete Action Modal
  const [completeTaskTarget, setCompleteTaskTarget] = useState<DispatcherTask | null>(null);
  const [completionNotes, setCompletionNotes] = useState<string>('');

  // Safe Delete & Cancel State
  const [taskToDelete, setTaskToDelete] = useState<DispatcherTask | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [isCancelling, setIsCancelling] = useState<boolean>(false);
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Linked Load detail inspection
  const [selectedLoad, setSelectedLoad] = useState<LoadWithRelations | null>(null);
  const [isLoadDetailOpen, setIsLoadDetailOpen] = useState<boolean>(false);

  // Current actor info
  const actorName = profile?.full_name || user?.email?.split('@')[0] || (userRole === 'owner_admin' ? 'Owner / Admin' : 'Dispatcher');
  const actorId = user?.id || 'usr-alex-1';

  // Fetch all tasks and stats
  const fetchTasksData = useCallback(async () => {
    if (!orgId) return;
    setIsLoading(true);
    try {
      const [fetchedTasks, fetchedStats, fetchedLoads, fetchedConfig] = await Promise.all([
        taskService.getTasks(orgId),
        taskService.getTaskStats(orgId),
        loadService.getLoads(orgId),
        Promise.resolve(taskService.getReminderConfig(orgId)),
      ]);
      setTasks(fetchedTasks);
      setStats(fetchedStats);
      setLoads(fetchedLoads);
      setReminderConfig(fetchedConfig);
    } catch (err) {
      console.error('Error fetching tasks data:', err);
    } finally {
      setIsLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    fetchTasksData();
  }, [fetchTasksData]);

  // Periodic interval (every 30s) to refresh relative timing state
  useEffect(() => {
    const timer = setInterval(() => {
      if (orgId) {
        // Soft refresh stats and tasks to update dynamic relative countdowns
        taskService.getTasks(orgId).then((t) => setTasks(t));
        taskService.getTaskStats(orgId).then((s) => setStats(s));
      }
    }, 30000);
    return () => clearInterval(timer);
  }, [orgId]);

  // Execute Auto-Reminder Rule Evaluation
  const handleRunReminderScan = async () => {
    if (!orgId || isRunningReminderScan) return;
    setIsRunningReminderScan(true);
    try {
      const result = await taskService.evaluateAndGenerateReminders(orgId, userRole);
      setReminderScanResult(result);
      await fetchTasksData();
    } catch (err) {
      console.error('Error running auto-reminder evaluation:', err);
    } finally {
      setIsRunningReminderScan(false);
    }
  };

  // Save updated Reminder Rule Config
  const handleSaveReminderConfig = (updated: ReminderRuleConfig) => {
    if (!orgId) return;
    taskService.updateReminderConfig(orgId, updated, userRole);
    setReminderConfig(updated);
    setIsReminderConfigModalOpen(false);
  };

  // Load Map for fast lookups
  const loadMap = useMemo(() => {
    const map = new Map<string, LoadWithRelations>();
    loads.forEach((l) => map.set(l.id, l));
    return map;
  }, [loads]);

  // Filtered Tasks
  const filteredTasks = useMemo(() => {
    const now = new Date();
    return tasks.filter((task) => {
      // 1. Tab filter
      if (activeTab === 'active') {
        if (task.status === 'completed' || task.status === 'cancelled') return false;
      } else if (activeTab === 'overdue') {
        if (task.status === 'completed' || task.status === 'cancelled') return false;
        if (!isTaskOverdue(task, now)) return false;
      } else if (activeTab === 'today') {
        if (task.status === 'completed' || task.status === 'cancelled') return false;
        const due = new Date(getEffectiveDueAt(task));
        const isSameDay =
          due.getFullYear() === now.getFullYear() &&
          due.getMonth() === now.getMonth() &&
          due.getDate() === now.getDate();
        if (!isSameDay) return false;
      } else if (activeTab === 'snoozed') {
        if (task.status !== 'snoozed') return false;
      } else if (activeTab === 'completed') {
        if (task.status !== 'completed') return false;
      }

      // 2. Priority Filter
      if (priorityFilter !== 'all' && task.priority !== priorityFilter) {
        return false;
      }

      // 3. Category Filter
      if (categoryFilter !== 'all' && task.category !== categoryFilter) {
        return false;
      }

      // 4. Assignee Filter
      if (assigneeFilter === 'me') {
        if (task.assigned_to_user_id !== user?.id && task.assigned_to_user_id !== 'usr-alex-1') {
          return false;
        }
      } else if (assigneeFilter === 'unassigned') {
        if (task.assigned_to_user_id) return false;
      } else if (assigneeFilter !== 'all') {
        if (task.assigned_to_user_id !== assigneeFilter) return false;
      }

      // 5. Trigger Source Filter
      if (triggerSourceFilter !== 'all') {
        const src = task.trigger_source || 'manual';
        if (triggerSourceFilter === 'system_any') {
          if (src === 'manual' || src === 'ai_extracted') return false;
        } else if (src !== triggerSourceFilter) {
          return false;
        }
      }

      // 6. Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesTitle = task.title.toLowerCase().includes(q);
        const matchesDesc = (task.description || '').toLowerCase().includes(q);
        const matchesLoad = (task.load_number || '').toLowerCase().includes(q);
        const matchesAssignee = (task.assigned_to_name || '').toLowerCase().includes(q);
        const matchesDedup = (task.deduplication_key || '').toLowerCase().includes(q);
        if (!matchesTitle && !matchesDesc && !matchesLoad && !matchesAssignee && !matchesDedup) {
          return false;
        }
      }

      return true;
    });
  }, [tasks, activeTab, priorityFilter, categoryFilter, assigneeFilter, triggerSourceFilter, searchQuery, user]);

  const hasActiveFilters = Boolean(
    searchQuery.trim() ||
    priorityFilter !== 'all' ||
    categoryFilter !== 'all' ||
    triggerSourceFilter !== 'all' ||
    assigneeFilter !== 'all'
  );

  const handleResetFilters = () => {
    setSearchQuery('');
    setPriorityFilter('all');
    setCategoryFilter('all');
    setTriggerSourceFilter('all');
    setAssigneeFilter('all');
  };

  // Fast Actions
  const handleQuickComplete = async (task: DispatcherTask) => {
    if (!orgId || !canMutate) return;
    try {
      await taskService.completeTask(orgId, task.id, {
        completed_by_user_id: actorId,
        completed_by_name: actorName,
        completion_notes: 'Completed directly from task workspace.',
      }, userRole);
      fetchTasksData();
    } catch (err) {
      console.error('Error completing task:', err);
    }
  };

  const handleQuickSnooze = async (task: DispatcherTask, preset: SnoozePreset) => {
    if (!orgId || !canMutate) return;
    try {
      let snoozeTime = Date.now() + 30 * 60 * 1000;
      if (preset === '15m') snoozeTime = Date.now() + 15 * 60 * 1000;
      else if (preset === '1h') snoozeTime = Date.now() + 60 * 60 * 1000;
      else if (preset === '2h') snoozeTime = Date.now() + 2 * 3600 * 1000;

      await taskService.snoozeTask(orgId, task.id, {
        snooze_preset: preset,
        snoozed_until: new Date(snoozeTime).toISOString(),
        snoozed_by_name: actorName,
        snoozed_by_user_id: actorId,
      }, userRole);
      fetchTasksData();
    } catch (err) {
      console.error('Error snoozing task:', err);
    }
  };

  const handleConfirmSnooze = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgId || !snoozeTaskTarget || !canMutate) return;
    try {
      let targetDate = new Date();
      switch (selectedSnoozePreset) {
        case '15m': targetDate = new Date(Date.now() + 15 * 60 * 1000); break;
        case '30m': targetDate = new Date(Date.now() + 30 * 60 * 1000); break;
        case '1h': targetDate = new Date(Date.now() + 60 * 60 * 1000); break;
        case '2h': targetDate = new Date(Date.now() + 2 * 3600 * 1000); break;
        case '4h': targetDate = new Date(Date.now() + 4 * 3600 * 1000); break;
        case 'tomorrow_morning':
          targetDate = new Date();
          targetDate.setDate(targetDate.getDate() + 1);
          targetDate.setHours(8, 0, 0, 0);
          break;
        case 'next_shift':
          targetDate = new Date(Date.now() + 8 * 3600 * 1000);
          break;
        case 'custom':
          targetDate = customSnoozeDate ? new Date(customSnoozeDate) : new Date(Date.now() + 30 * 60 * 1000);
          break;
      }

      await taskService.snoozeTask(
        orgId,
        snoozeTaskTarget.id,
        {
          snooze_preset: selectedSnoozePreset,
          snoozed_until: targetDate.toISOString(),
          snoozed_by_name: actorName,
          snoozed_by_user_id: actorId,
        },
        userRole
      );
      setSnoozeTaskTarget(null);
      fetchTasksData();
    } catch (err) {
      console.error('Error snoozing task:', err);
    }
  };

  const handleConfirmReassign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgId || !reassignTaskTarget || !canMutate) return;
    try {
      const selectedMember = TEAM_MEMBERS.find((m) => m.id === reassignUserId);
      const newName = selectedMember ? selectedMember.shortName : reassignUserId ? 'Assigned Member' : null;
      await taskService.reassignTask(
        orgId,
        reassignTaskTarget.id,
        reassignUserId || null,
        newName,
        actorName,
        actorId,
        userRole
      );
      setReassignTaskTarget(null);
      fetchTasksData();
    } catch (err) {
      console.error('Error reassigning task:', err);
    }
  };

  const handleConfirmCancel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgId || !cancelTaskTarget || !canMutate || isCancelling) return;
    setIsCancelling(true);
    try {
      await taskService.cancelTask(
        orgId,
        cancelTaskTarget.id,
        cancelReason.trim() || 'Cancelled by dispatcher',
        actorName,
        actorId,
        userRole
      );
      const title = cancelTaskTarget.title;
      setCancelTaskTarget(null);
      setCancelReason('');
      await fetchTasksData();
      setFeedbackMessage({
        type: 'success',
        text: `Task "${title}" was cancelled successfully.`,
      });
      setTimeout(() => setFeedbackMessage(null), 4000);
    } catch (err: unknown) {
      console.error('Error cancelling task:', err);
      const msg = err instanceof Error ? err.message : 'Failed to cancel task.';
      setFeedbackMessage({
        type: 'error',
        text: msg,
      });
    } finally {
      setIsCancelling(false);
    }
  };

  const handleConfirmComplete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgId || !completeTaskTarget || !canMutate) return;
    try {
      await taskService.completeTask(
        orgId,
        completeTaskTarget.id,
        {
          completed_by_user_id: actorId,
          completed_by_name: actorName,
          completion_notes: completionNotes.trim() || undefined,
        },
        userRole
      );
      setCompleteTaskTarget(null);
      setCompletionNotes('');
      fetchTasksData();
    } catch (err) {
      console.error('Error completing task:', err);
    }
  };

  const handleDeleteTask = (task: DispatcherTask) => {
    if (!orgId || userRole !== 'owner_admin') return;
    setTaskToDelete(task);
  };

  const handleConfirmDelete = async () => {
    if (!orgId || !taskToDelete || userRole !== 'owner_admin' || isDeleting) return;
    setIsDeleting(true);
    try {
      await taskService.deleteTask(orgId, taskToDelete.id, userRole);
      const title = taskToDelete.title;
      setTaskToDelete(null);
      await fetchTasksData();
      setFeedbackMessage({
        type: 'success',
        text: `Task "${title}" permanently deleted.`,
      });
      setTimeout(() => setFeedbackMessage(null), 4000);
    } catch (err: unknown) {
      console.error('Error deleting task:', err);
      const msg = err instanceof Error ? err.message : 'Failed to delete task.';
      setFeedbackMessage({
        type: 'error',
        text: msg,
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleOpenLoadDetailModal = (loadNumberOrId: string) => {
    const found = loads.find((l) => l.id === loadNumberOrId || l.load_number === loadNumberOrId);
    if (found) {
      if (onOpenLoadDetail) {
        onOpenLoadDetail(found);
      } else {
        setSelectedLoad(found);
        setIsLoadDetailOpen(true);
      }
    }
  };

  const getCategoryIcon = (cat: TaskCategory) => {
    switch (cat) {
      case 'check_call':
        return <PhoneCall className="w-3.5 h-3.5" />;
      case 'detention_warning':
        return <Timer className="w-3.5 h-3.5" />;
      case 'document_collection':
        return <FileText className="w-3.5 h-3.5" />;
      case 'broker_update':
        return <Send className="w-3.5 h-3.5" />;
      case 'driver_instruction':
        return <Truck className="w-3.5 h-3.5" />;
      case 'appointment_scheduling':
        return <Calendar className="w-3.5 h-3.5" />;
      case 'billing_prep':
        return <Receipt className="w-3.5 h-3.5" />;
      case 'general_operational':
      default:
        return <CheckSquare className="w-3.5 h-3.5" />;
    }
  };

  return (
    <div id="tasks-view" className="space-y-6">
      {/* Feedback Banner */}
      {feedbackMessage && (
        <div
          id="tasks-feedback-banner"
          className={`p-3.5 rounded-xl text-xs flex items-center justify-between transition-all shadow-xs ${
            feedbackMessage.type === 'success'
              ? 'bg-emerald-950/60 border border-emerald-800/70 text-emerald-200'
              : 'bg-rose-950/60 border border-rose-800/70 text-rose-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedbackMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span>{feedbackMessage.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedbackMessage(null)}
            className="text-slate-400 hover:text-slate-200 cursor-pointer text-base leading-none"
          >
            &times;
          </button>
        </div>
      )}

      {/* View Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-100 tracking-tight flex items-center gap-2">
              <CheckSquare className="w-6 h-6 text-indigo-400" />
              <span>Global Task UI & Reminder Center</span>
            </h1>
            <span className="text-xs px-2.5 py-0.5 rounded-md bg-indigo-950/60 text-indigo-300 border border-indigo-800/40 font-semibold">
              Phase 2D.5.4 Engine Active
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Centralized operational task scheduler, deterministic auto-reminder engine, detention countdown alerts, driver check-in reminders, and multi-timezone follow-ups.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Auto-Reminder Engine Trigger Button */}
          {canMutate && (
            <button
              id="run-reminder-scan-btn"
              type="button"
              onClick={handleRunReminderScan}
              disabled={isRunningReminderScan}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-cyan-300 bg-cyan-950/80 hover:bg-cyan-900/90 border border-cyan-800/60 rounded-lg shadow-sm transition-all cursor-pointer disabled:opacity-50"
              title="Evaluate all tenant loads against deterministic auto-reminder rules"
            >
              <Cpu className={`w-4 h-4 text-cyan-400 ${isRunningReminderScan ? 'animate-spin' : ''}`} />
              <span>{isRunningReminderScan ? 'Evaluating Rules...' : 'Run Auto-Reminders'}</span>
            </button>
          )}

          {/* Settings / Config Button */}
          {canMutate && (
            <button
              id="reminder-config-btn"
              type="button"
              onClick={() => setIsReminderConfigModalOpen(true)}
              className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-slate-800 rounded-lg transition-colors cursor-pointer"
              title="Configure Reminder Engine Rules"
            >
              <SlidersHorizontal className="w-4 h-4" />
            </button>
          )}

          <button
            id="refresh-tasks-btn"
            onClick={fetchTasksData}
            disabled={isLoading}
            className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-slate-800 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
            title="Refresh Tasks"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>

          {canMutate && (
            <button
              id="create-task-btn"
              onClick={() => {
                setTaskToEdit(null);
                setIsTaskModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-sm transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>New Task / Reminder</span>
            </button>
          )}
        </div>
      </div>

      {/* Auto-Reminder Engine Active Rules & Status Strip */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-2.5">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-cyan-400" />
            <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
              Operational Auto-Reminder Engine (Deterministic Rules)
            </h3>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span className="inline-flex items-center gap-1 text-[11px] font-mono text-cyan-400 bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-800/40">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
              <span>5 Rules Active</span>
            </span>
            <span className="text-[11px] text-slate-500">•</span>
            <span className="text-[11px] text-slate-400">Zero External Auto-Send (Human Reviewable)</span>
          </div>
        </div>

        {/* Rule Indicators Pills */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-2 text-xs">
          <div className="bg-slate-950/80 border border-slate-800/80 rounded-lg p-2.5 space-y-1">
            <div className="flex items-center justify-between text-slate-400 text-[11px]">
              <span className="font-semibold text-slate-300">Stale Check-In</span>
              <PhoneCall className="w-3.5 h-3.5 text-cyan-400" />
            </div>
            <div className="text-[11px] text-slate-400">
              {'>'} {reminderConfig.staleCheckCallThresholdHours}h without GPS/Call
            </div>
          </div>

          <div className="bg-slate-950/80 border border-slate-800/80 rounded-lg p-2.5 space-y-1">
            <div className="flex items-center justify-between text-slate-400 text-[11px]">
              <span className="font-semibold text-slate-300">Detention Clocks</span>
              <Timer className="w-3.5 h-3.5 text-amber-400" />
            </div>
            <div className="text-[11px] text-slate-400">
              {reminderConfig.detentionWarningLeadMinutes}m lead / free-time expiry
            </div>
          </div>

          <div className="bg-slate-950/80 border border-slate-800/80 rounded-lg p-2.5 space-y-1">
            <div className="flex items-center justify-between text-slate-400 text-[11px]">
              <span className="font-semibold text-slate-300">Delivered PODs</span>
              <FileText className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <div className="text-[11px] text-slate-400">
              {reminderConfig.deliveredPodGracePeriodHours}h post-DEL paperwork audit
            </div>
          </div>

          <div className="bg-slate-950/80 border border-slate-800/80 rounded-lg p-2.5 space-y-1">
            <div className="flex items-center justify-between text-slate-400 text-[11px]">
              <span className="font-semibold text-slate-300">Transit Windows</span>
              <Calendar className="w-3.5 h-3.5 text-sky-400" />
            </div>
            <div className="text-[11px] text-slate-400">
              {reminderConfig.appointmentLeadHours}h before PU/DEL window
            </div>
          </div>

          <div className="bg-slate-950/80 border border-slate-800/80 rounded-lg p-2.5 space-y-1">
            <div className="flex items-center justify-between text-slate-400 text-[11px]">
              <span className="font-semibold text-slate-300">Deduplication</span>
              <Key className="w-3.5 h-3.5 text-indigo-400" />
            </div>
            <div className="text-[11px] text-slate-400">
              Deterministic Unique Keys
            </div>
          </div>
        </div>

        {/* Scan Result Notice Banner */}
        {reminderScanResult && (
          <div className="p-3 bg-cyan-950/40 border border-cyan-800/60 rounded-lg flex items-center justify-between gap-3 text-xs text-cyan-200">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0" />
              <span>
                <strong>Evaluation Scan Complete:</strong> Scanned {reminderScanResult.evaluatedLoadsCount} loads across tenant scope. Generated <strong>{reminderScanResult.generatedTasks.length}</strong> new actionable reminders, preserved <strong>{reminderScanResult.skippedExistingCount}</strong> existing deduplicated active tasks.
              </span>
            </div>
            <button
              type="button"
              onClick={() => setReminderScanResult(null)}
              className="text-cyan-400 hover:text-cyan-200 font-semibold underline text-[11px] cursor-pointer shrink-0"
            >
              Dismiss
            </button>
          </div>
        )}
      </div>

      {/* KPI Metric Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Total Active Tasks</span>
            <CheckSquare className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-2xl font-bold text-slate-100">{stats?.totalActive ?? 0}</div>
          <div className="text-[11px] text-slate-400">Pending, In-Progress, Snoozed</div>
        </div>

        <div
          onClick={() => setActiveTab('overdue')}
          className={`border rounded-xl p-4 space-y-1 cursor-pointer transition-all ${
            (stats?.overdueCount ?? 0) > 0
              ? 'bg-rose-950/20 border-rose-800/60 hover:border-rose-600'
              : 'bg-slate-900 border-slate-800'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Overdue Tasks</span>
            <AlertTriangle
              className={`w-4 h-4 ${(stats?.overdueCount ?? 0) > 0 ? 'text-rose-400' : 'text-slate-500'}`}
            />
          </div>
          <div
            className={`text-2xl font-bold ${
              (stats?.overdueCount ?? 0) > 0 ? 'text-rose-400' : 'text-slate-100'
            }`}
          >
            {stats?.overdueCount ?? 0}
          </div>
          <div className="text-[11px] text-slate-400">Requires immediate attention</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Due Next 60 Min</span>
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
          <div
            className={`text-2xl font-bold ${
              (stats?.dueNextHourCount ?? 0) > 0 ? 'text-amber-400' : 'text-slate-100'
            }`}
          >
            {stats?.dueNextHourCount ?? 0}
          </div>
          <div className="text-[11px] text-slate-400">Upcoming urgent window</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Completed Today</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-emerald-400">{stats?.completedTodayCount ?? 0}</div>
          <div className="text-[11px] text-slate-400">Tasks resolved this shift</div>
        </div>
      </div>

      {/* Urgent Overdue Attention Banner */}
      {(stats?.overdueCount ?? 0) > 0 && activeTab !== 'overdue' && (
        <div className="p-3.5 bg-rose-950/40 border border-rose-800/80 rounded-xl flex items-center justify-between gap-4 text-xs text-rose-200">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>
              <strong>{stats?.overdueCount} overdue task{stats?.overdueCount === 1 ? '' : 's'}</strong> require
              immediate dispatcher follow-up (missed check-ins, delayed updates, or detention notices).
            </span>
          </div>
          <button
            onClick={() => setActiveTab('overdue')}
            className="px-3 py-1 text-xs font-bold text-rose-200 bg-rose-900/80 hover:bg-rose-800 border border-rose-700/80 rounded-lg transition-colors cursor-pointer shrink-0"
          >
            Review Overdue ({stats?.overdueCount})
          </button>
        </div>
      )}

      {/* Main Tabs Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-2">
        <div className="flex flex-wrap gap-1.5 sm:gap-2">
          <button
            id="tab-active-tasks"
            onClick={() => setActiveTab('active')}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer inline-flex items-center gap-1.5 ${
              activeTab === 'active'
                ? 'bg-slate-800 text-slate-100 border border-slate-700 shadow-xs'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <span>Active</span>
            <span className="px-1.5 py-0.2 rounded bg-slate-900 text-slate-300 font-mono text-[10px]">
              {stats?.totalActive ?? 0}
            </span>
          </button>

          <button
            id="tab-overdue-tasks"
            onClick={() => setActiveTab('overdue')}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer inline-flex items-center gap-1.5 ${
              activeTab === 'overdue'
                ? 'bg-rose-950/60 text-rose-200 border border-rose-800/80 shadow-xs'
                : 'text-slate-400 hover:text-rose-300 hover:bg-slate-900'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
            <span>Overdue</span>
            {(stats?.overdueCount ?? 0) > 0 && (
              <span className="px-1.5 py-0.2 rounded bg-rose-900 text-rose-200 font-mono text-[10px] font-bold">
                {stats?.overdueCount}
              </span>
            )}
          </button>

          <button
            id="tab-today-tasks"
            onClick={() => setActiveTab('today')}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer inline-flex items-center gap-1.5 ${
              activeTab === 'today'
                ? 'bg-slate-800 text-slate-100 border border-slate-700 shadow-xs'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Calendar className="w-3.5 h-3.5 text-sky-400" />
            <span>Today</span>
            <span className="px-1.5 py-0.2 rounded bg-slate-900 text-slate-300 font-mono text-[10px]">
              {stats?.dueTodayCount ?? 0}
            </span>
          </button>

          <button
            id="tab-snoozed-tasks"
            onClick={() => setActiveTab('snoozed')}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer inline-flex items-center gap-1.5 ${
              activeTab === 'snoozed'
                ? 'bg-amber-950/40 text-amber-200 border border-amber-800/60 shadow-xs'
                : 'text-slate-400 hover:text-amber-300 hover:bg-slate-900'
            }`}
          >
            <Clock className="w-3.5 h-3.5 text-amber-400" />
            <span>Snoozed</span>
            <span className="px-1.5 py-0.2 rounded bg-slate-900 text-slate-300 font-mono text-[10px]">
              {stats?.snoozedCount ?? 0}
            </span>
          </button>

          <button
            id="tab-completed-tasks"
            onClick={() => setActiveTab('completed')}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer inline-flex items-center gap-1.5 ${
              activeTab === 'completed'
                ? 'bg-slate-800 text-slate-100 border border-slate-700 shadow-xs'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>Completed</span>
            <span className="px-1.5 py-0.2 rounded bg-slate-900 text-slate-300 font-mono text-[10px]">
              {stats?.completedTodayCount ?? 0}
            </span>
          </button>

          <button
            id="tab-all-tasks"
            onClick={() => setActiveTab('all')}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer inline-flex items-center gap-1.5 ${
              activeTab === 'all'
                ? 'bg-slate-800 text-slate-100 border border-slate-700 shadow-xs'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <span>All Tasks</span>
            <span className="px-1.5 py-0.2 rounded bg-slate-900 text-slate-300 font-mono text-[10px]">
              {tasks.length}
            </span>
          </button>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between shadow-xs">
        {/* Search input */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search tasks by title, instructions, load #, deduplication key, or assignee..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>

        {/* Secondary Filter Dropdowns */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Priority filter */}
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-300 focus:outline-none focus:border-indigo-500 cursor-pointer"
          >
            <option value="all">All Priorities</option>
            <option value="urgent">🔴 Urgent</option>
            <option value="high">🟠 High</option>
            <option value="normal">🔵 Normal</option>
            <option value="low">⚪ Low</option>
          </select>

          {/* Category filter */}
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-300 focus:outline-none focus:border-indigo-500 cursor-pointer max-w-[170px]"
          >
            <option value="all">All Categories</option>
            {(Object.keys(TASK_CATEGORY_CONFIG) as TaskCategory[]).map((cat) => (
              <option key={cat} value={cat}>
                {TASK_CATEGORY_CONFIG[cat].shortLabel}
              </option>
            ))}
          </select>

          {/* Trigger Source Filter */}
          <select
            value={triggerSourceFilter}
            onChange={(e) => setTriggerSourceFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-300 focus:outline-none focus:border-cyan-500 cursor-pointer max-w-[170px]"
          >
            <option value="all">All Trigger Sources</option>
            <option value="system_any">⚡ All System Rules</option>
            <option value="system_rule">🤖 System Auto-Reminder</option>
            <option value="detention_clock">⏱️ Detention Clock</option>
            <option value="document_alert">📄 Paperwork Audit</option>
            <option value="check_call_exception">🚨 Exception Alert</option>
            <option value="ai_extracted">✨ AI Copilot Extracted</option>
            <option value="manual">👤 Manual Tasks</option>
          </select>

          {/* Assignee filter */}
          <select
            value={assigneeFilter}
            onChange={(e) => setAssigneeFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-300 focus:outline-none focus:border-indigo-500 cursor-pointer max-w-[160px]"
          >
            <option value="all">All Assignees</option>
            <option value="me">Assigned to Me</option>
            <option value="unassigned">Unassigned</option>
            {TEAM_MEMBERS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.shortName}
              </option>
            ))}
          </select>

          {hasActiveFilters && (
            <button
              id="tasks-reset-filters-btn"
              type="button"
              onClick={handleResetFilters}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700/60 rounded-lg text-xs font-semibold text-slate-200 hover:text-white transition-colors cursor-pointer shrink-0"
              title="Reset all filters"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
              <span>Reset Filters</span>
            </button>
          )}
        </div>
      </div>

      {/* Task List / Table Workspace */}
      {filteredTasks.length === 0 ? (
        <EmptyState
          id="empty-tasks-state"
          icon={CheckSquare}
          title={
            activeTab === 'overdue'
              ? 'Zero Overdue Tasks!'
              : activeTab === 'snoozed'
              ? 'No Snoozed Tasks'
              : 'No Tasks Found'
          }
          description={
            activeTab === 'overdue'
              ? 'Great job! All operational follow-ups, detention alerts, and check-calls are on schedule.'
              : 'No task records match your active tab and filter criteria. Create a new task, evaluate auto-reminders, or adjust filters.'
          }
          actionLabel={canMutate ? 'Create New Task' : undefined}
          onAction={
            canMutate
              ? () => {
                  setTaskToEdit(null);
                  setIsTaskModalOpen(true);
                }
              : undefined
          }
        />
      ) : (
        <div className="space-y-3">
          {filteredTasks.map((task) => {
            const catConfig = TASK_CATEGORY_CONFIG[task.category] || TASK_CATEGORY_CONFIG.general_operational;
            const prioConfig = TASK_PRIORITY_CONFIG[task.priority] || TASK_PRIORITY_CONFIG.normal;
            const sourceConfig = TRIGGER_SOURCE_CONFIG[task.trigger_source || 'manual'] || TRIGGER_SOURCE_CONFIG.manual;
            const relativeTiming: RelativeDueInfo = formatRelativeDue(task);
            const dualTime = formatDualTime(
              getEffectiveDueAt(task),
              operationalTimezone,
              dispatcherTimezone
            );
            const isCompleted = task.status === 'completed';
            const isCancelled = task.status === 'cancelled';

            return (
              <div
                key={task.id}
                className={`bg-slate-900 border rounded-xl p-4 transition-all shadow-xs space-y-3 ${
                  relativeTiming.isOverdue
                    ? 'border-rose-800/80 bg-rose-950/10 hover:border-rose-700'
                    : isCompleted
                    ? 'border-slate-800/70 bg-slate-900/60 opacity-80'
                    : 'border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  {/* Left Column: Checkbox, Category, Title, Load Number */}
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    {/* One-Click Complete Button */}
                    <button
                      type="button"
                      disabled={!canMutate || isCompleted || isCancelled}
                      onClick={() => handleQuickComplete(task)}
                      title={isCompleted ? 'Task Completed' : 'Click to Mark Complete'}
                      className={`mt-0.5 shrink-0 p-1.5 rounded-lg border transition-all cursor-pointer ${
                        isCompleted
                          ? 'bg-emerald-950/60 border-emerald-700 text-emerald-400 cursor-default'
                          : isCancelled
                          ? 'bg-slate-900 border-slate-800 text-slate-600 cursor-default'
                          : 'bg-slate-950 border-slate-700 text-slate-500 hover:text-emerald-400 hover:border-emerald-600 hover:bg-emerald-950/20'
                      }`}
                    >
                      <Check className="w-4 h-4" />
                    </button>

                    <div className="space-y-1.5 min-w-0 flex-1">
                      {/* Top Badges Row */}
                      <div className="flex flex-wrap items-center gap-1.5 text-xs">
                        {/* Priority Badge */}
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${prioConfig.bgColor} ${prioConfig.color} border ${prioConfig.borderColor}`}
                        >
                          {prioConfig.label}
                        </span>

                        {/* Category Badge */}
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold ${catConfig.bgColor} ${catConfig.color} border ${catConfig.borderColor}`}
                        >
                          {getCategoryIcon(task.category)}
                          <span>{catConfig.shortLabel}</span>
                        </span>

                        {/* Trigger Source Badge */}
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${sourceConfig.badgeClass}`}
                          title={`Trigger Source: ${sourceConfig.label}`}
                        >
                          {sourceConfig.shortLabel}
                        </span>

                        {/* Relative Due Timing Badge */}
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold border ${relativeTiming.bgClass} ${relativeTiming.colorClass} ${relativeTiming.badgeBorder}`}
                        >
                          {relativeTiming.text}
                        </span>

                        {/* Linked Load Badge */}
                        {task.load_number && (
                          <button
                            type="button"
                            onClick={() => handleOpenLoadDetailModal(task.load_id || task.load_number!)}
                            className="inline-flex items-center gap-1 font-mono font-bold text-[11px] text-slate-200 hover:text-indigo-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800 transition-colors cursor-pointer"
                          >
                            <span>Load #{task.load_number}</span>
                            <ExternalLink className="w-2.5 h-2.5" />
                          </button>
                        )}

                        {/* Deduplication Key Tag */}
                        {task.deduplication_key && (
                          <span
                            className="inline-flex items-center gap-1 font-mono text-[9px] text-slate-500 bg-slate-950/80 px-1.5 py-0.2 rounded border border-slate-800/80"
                            title={`Deduplication Key: ${task.deduplication_key}`}
                          >
                            <Key className="w-2.5 h-2.5 text-slate-500" />
                            <span>dedup</span>
                          </span>
                        )}
                      </div>

                      {/* Title & Description */}
                      <div className="space-y-0.5">
                        <h3
                          className={`text-sm font-bold text-slate-100 ${
                            isCompleted ? 'line-through text-slate-400' : ''
                          }`}
                        >
                          {task.title}
                        </h3>
                        {task.description && (
                          <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
                            {task.description}
                          </p>
                        )}
                        {task.completion_notes && (
                          <p className="text-xs text-emerald-400/90 font-medium">
                            ✓ Notes: {task.completion_notes}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Timing, Assignee, Actions */}
                  <div className="flex flex-wrap lg:flex-nowrap items-center justify-between lg:justify-end gap-3 pt-2 lg:pt-0 border-t lg:border-t-0 border-slate-800/80">
                    {/* Dual Timezone Context */}
                    <div className="text-right text-[11px] font-mono space-y-0.5 min-w-[170px]">
                      <div className="text-slate-300 font-semibold flex items-center justify-end gap-1">
                        <Clock className="w-3 h-3 text-slate-500" />
                        <span>{dualTime.primary}</span>
                      </div>
                      <div className="text-slate-500">{dualTime.secondary}</div>
                    </div>

                    {/* Assignee Avatar Pill */}
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-xs">
                      <User className="w-3.5 h-3.5 text-slate-400" />
                      <span className="text-slate-200 font-medium truncate max-w-[110px]">
                        {task.assigned_to_name || 'Unassigned'}
                      </span>
                    </div>

                    {/* Action Buttons Toolbar */}
                    {canMutate && !isCompleted && !isCancelled && (
                      <div className="flex items-center gap-1.5">
                        {/* Snooze Presets Quick Dropdown */}
                        <div className="relative group">
                          <button
                            type="button"
                            onClick={() => {
                              setSnoozeTaskTarget(task);
                              setSelectedSnoozePreset('30m');
                            }}
                            className="px-2.5 py-1.5 text-xs font-semibold text-amber-300 bg-amber-950/40 hover:bg-amber-900/60 border border-amber-800/60 rounded-lg transition-colors cursor-pointer inline-flex items-center gap-1"
                            title="Snooze Reminder"
                          >
                            <Clock className="w-3 h-3" />
                            <span>Snooze</span>
                          </button>
                        </div>

                        {/* Reassign Button */}
                        <button
                          type="button"
                          onClick={() => {
                            setReassignTaskTarget(task);
                            setReassignUserId(task.assigned_to_user_id || '');
                          }}
                          className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                          title="Reassign Task"
                        >
                          <UserCheck className="w-3.5 h-3.5" />
                        </button>

                        {/* Edit Button */}
                        <button
                          type="button"
                          onClick={() => {
                            setTaskToEdit(task);
                            setIsTaskModalOpen(true);
                          }}
                          className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                          title="Edit Task"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>

                        {/* Cancel Button */}
                        <button
                          type="button"
                          disabled={isCancelling}
                          onClick={() => {
                            setCancelTaskTarget(task);
                            setCancelReason('');
                          }}
                          className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                          title="Cancel Task"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                        </button>

                        {/* Delete Button (Owner Admin Only) */}
                        {userRole === 'owner_admin' && (
                          <button
                            type="button"
                            disabled={isDeleting}
                            onClick={() => handleDeleteTask(task)}
                            className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-950/40 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                            title="Delete Task"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal 1: Create / Edit Task Modal */}
      <TaskModal
        isOpen={isTaskModalOpen}
        onClose={() => {
          setIsTaskModalOpen(false);
          setTaskToEdit(null);
        }}
        taskToEdit={taskToEdit}
        onSuccess={() => {
          fetchTasksData();
        }}
      />

      {/* Modal 2: Snooze Task Modal */}
      {snoozeTaskTarget && (
        <Modal
          id="snooze-task-modal"
          isOpen={Boolean(snoozeTaskTarget)}
          onClose={() => setSnoozeTaskTarget(null)}
          title={`Snooze Task: ${snoozeTaskTarget.title}`}
          subtitle="Postpone reminder trigger and recalculate operational relative deadline"
          maxWidth="md"
        >
          <form onSubmit={handleConfirmSnooze} className="space-y-4 text-xs">
            <div className="space-y-2">
              <label className="block text-slate-300 font-semibold">Select Snooze Duration</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {(
                  [
                    { id: '15m', label: '+15 Min' },
                    { id: '30m', label: '+30 Min' },
                    { id: '1h', label: '+1 Hour' },
                    { id: '2h', label: '+2 Hours' },
                    { id: '4h', label: '+4 Hours' },
                    { id: 'tomorrow_morning', label: 'Tomorrow 8 AM' },
                    { id: 'next_shift', label: 'Next Shift (+8h)' },
                    { id: 'custom', label: 'Custom Time' },
                  ] as { id: SnoozePreset; label: string }[]
                ).map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setSelectedSnoozePreset(preset.id)}
                    className={`p-2 rounded-lg border text-center font-semibold transition-all cursor-pointer ${
                      selectedSnoozePreset === preset.id
                        ? 'bg-amber-600/20 border-amber-500 text-amber-200 ring-1 ring-amber-500'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            {selectedSnoozePreset === 'custom' && (
              <div className="space-y-1">
                <label className="block text-slate-300 font-semibold">Custom Snooze Target Date/Time</label>
                <input
                  type="datetime-local"
                  required
                  value={customSnoozeDate}
                  onChange={(e) => setCustomSnoozeDate(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 font-mono focus:outline-none focus:border-amber-500"
                />
              </div>
            )}

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setSnoozeTaskTarget(null)}
                className="px-4 py-2 text-slate-400 hover:text-slate-200 bg-slate-800 rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 font-bold text-white bg-amber-600 hover:bg-amber-500 rounded-lg transition-colors cursor-pointer"
              >
                Confirm Snooze
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal 3: Reassign Task Modal */}
      {reassignTaskTarget && (
        <Modal
          id="reassign-task-modal"
          isOpen={Boolean(reassignTaskTarget)}
          onClose={() => setReassignTaskTarget(null)}
          title="Reassign Task Responsibility"
          subtitle={`Task: ${reassignTaskTarget.title}`}
          maxWidth="md"
        >
          <form onSubmit={handleConfirmReassign} className="space-y-4 text-xs">
            <div className="space-y-1">
              <label className="block text-slate-300 font-semibold">Assign To Member</label>
              <select
                value={reassignUserId}
                onChange={(e) => setReassignUserId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-indigo-500"
              >
                <option value="">Unassigned</option>
                {user && (
                  <option value={user.id}>
                    {profile?.full_name || user.email?.split('@')[0] || 'Current User'} (You)
                  </option>
                )}
                {TEAM_MEMBERS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setReassignTaskTarget(null)}
                className="px-4 py-2 text-slate-400 hover:text-slate-200 bg-slate-800 rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors cursor-pointer"
              >
                Reassign Task
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal 4: Cancel Task Modal */}
      {cancelTaskTarget && (
        <Modal
          id="cancel-task-modal"
          isOpen={Boolean(cancelTaskTarget)}
          onClose={() => {
            if (!isCancelling) setCancelTaskTarget(null);
          }}
          title="Cancel Operational Task"
          subtitle={`Void reminder for: ${cancelTaskTarget.title}`}
          maxWidth="md"
        >
          <form onSubmit={handleConfirmCancel} className="space-y-4 text-xs">
            <div className="space-y-1">
              <label className="block text-slate-300 font-semibold">Reason for Cancellation</label>
              <input
                type="text"
                required
                disabled={isCancelling}
                placeholder="e.g. Load cancelled by broker / Check-in received via automated GPS"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-rose-500 disabled:opacity-50"
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setCancelTaskTarget(null)}
                disabled={isCancelling}
                className="px-4 py-2 text-slate-400 hover:text-slate-200 bg-slate-800 rounded-lg cursor-pointer disabled:opacity-50"
              >
                Keep Task
              </button>
              <button
                id="btn-confirm-cancel-task"
                type="submit"
                disabled={isCancelling || !cancelReason.trim()}
                className="px-4 py-2 font-bold text-white bg-rose-600 hover:bg-rose-500 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                {isCancelling ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Cancelling...</span>
                  </>
                ) : (
                  <span>Confirm Cancellation</span>
                )}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal 5: Reminder Engine Rule Configuration Modal */}
      {isReminderConfigModalOpen && (
        <Modal
          id="reminder-rule-config-modal"
          isOpen={isReminderConfigModalOpen}
          onClose={() => setIsReminderConfigModalOpen(false)}
          title="Auto-Reminder Engine Rules"
          subtitle="Tenant-scoped operational thresholds for deterministic task generation"
          maxWidth="lg"
        >
          <div className="space-y-4 text-xs">
            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1 text-slate-300">
              <div className="flex items-center gap-1.5 font-bold text-cyan-300">
                <Info className="w-3.5 h-3.5" />
                <span>Deterministic Operational Rules</span>
              </div>
              <p className="text-[11px] text-slate-400">
                The engine evaluates loads, check-ins, accessorial detention, and document status without sending any automated external emails or messages. All generated tasks are strictly tenant-scoped and require human dispatcher verification.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Stale Check-call hours */}
              <div className="space-y-1.5 p-3 rounded-lg bg-slate-950 border border-slate-800">
                <label className="block text-slate-200 font-bold">Stale Check-Call Threshold (Hours)</label>
                <p className="text-[11px] text-slate-400">Time without a recorded check-in before flagging an in-transit load.</p>
                <select
                  value={reminderConfig.staleCheckCallThresholdHours}
                  onChange={(e) =>
                    setReminderConfig({ ...reminderConfig, staleCheckCallThresholdHours: Number(e.target.value) })
                  }
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-200"
                >
                  <option value={2}>2 Hours (Strict)</option>
                  <option value={4}>4 Hours (Recommended Standard)</option>
                  <option value={6}>6 Hours (Relaxed)</option>
                  <option value={8}>8 Hours (Long Haul)</option>
                </select>
              </div>

              {/* Detention Lead Minutes */}
              <div className="space-y-1.5 p-3 rounded-lg bg-slate-950 border border-slate-800">
                <label className="block text-slate-200 font-bold">Detention Free-Time Warning Lead (Minutes)</label>
                <p className="text-[11px] text-slate-400">Lead time before 2-hour shipper/receiver free time expires.</p>
                <select
                  value={reminderConfig.detentionWarningLeadMinutes}
                  onChange={(e) =>
                    setReminderConfig({ ...reminderConfig, detentionWarningLeadMinutes: Number(e.target.value) })
                  }
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-200"
                >
                  <option value={15}>15 Minutes</option>
                  <option value={30}>30 Minutes (Recommended)</option>
                  <option value={45}>45 Minutes</option>
                  <option value={60}>60 Minutes</option>
                </select>
              </div>

              {/* Delivered POD Grace Hours */}
              <div className="space-y-1.5 p-3 rounded-lg bg-slate-950 border border-slate-800">
                <label className="block text-slate-200 font-bold">Delivered POD Grace Period (Hours)</label>
                <p className="text-[11px] text-slate-400">Grace period after delivery before prompting driver/broker for POD.</p>
                <select
                  value={reminderConfig.deliveredPodGracePeriodHours}
                  onChange={(e) =>
                    setReminderConfig({ ...reminderConfig, deliveredPodGracePeriodHours: Number(e.target.value) })
                  }
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-200"
                >
                  <option value={1}>1 Hour (Fast-turn)</option>
                  <option value={2}>2 Hours (Standard)</option>
                  <option value={4}>4 Hours</option>
                  <option value={8}>8 Hours (Next shift)</option>
                </select>
              </div>

              {/* Transit Appointment Lead Hours */}
              <div className="space-y-1.5 p-3 rounded-lg bg-slate-950 border border-slate-800">
                <label className="block text-slate-200 font-bold">Appointment ETA Lead Time (Hours)</label>
                <p className="text-[11px] text-slate-400">Advance warning prior to scheduled pickup or delivery window.</p>
                <select
                  value={reminderConfig.appointmentLeadHours}
                  onChange={(e) =>
                    setReminderConfig({ ...reminderConfig, appointmentLeadHours: Number(e.target.value) })
                  }
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-200"
                >
                  <option value={1}>1 Hour Before</option>
                  <option value={2}>2 Hours Before (Standard)</option>
                  <option value={3}>3 Hours Before</option>
                  <option value={4}>4 Hours Before</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsReminderConfigModalOpen(false)}
                className="px-4 py-2 text-slate-400 hover:text-slate-200 bg-slate-800 rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleSaveReminderConfig(reminderConfig)}
                className="px-4 py-2 font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors cursor-pointer"
              >
                Save Rule Settings
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Linked Load Detail Modal */}
      {selectedLoad && (
        <LoadDetailModal
          isOpen={isLoadDetailOpen}
          onClose={() => {
            setIsLoadDetailOpen(false);
            setSelectedLoad(null);
          }}
          load={selectedLoad}
          canEdit={canMutate}
        />
      )}

      {/* Modal 6: Permanently Delete Task Modal */}
      {taskToDelete && (
        <Modal
          id="delete-task-modal"
          isOpen={Boolean(taskToDelete)}
          onClose={() => {
            if (!isDeleting) setTaskToDelete(null);
          }}
          title="Permanently Delete Task"
          subtitle={`Are you sure you want to remove "${taskToDelete.title}"?`}
          maxWidth="md"
        >
          <div className="p-6 space-y-4">
            <div className="flex items-start gap-3 p-3.5 rounded-xl bg-rose-950/40 border border-rose-800/60 text-xs text-rose-200 leading-relaxed">
              <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <strong className="text-rose-100 font-semibold block mb-0.5">
                  Confirm Permanent Deletion
                </strong>
                Deleting this task permanently removes the task record, operational due timestamps, and associated reminders from the task schedule. This action cannot be undone.
              </div>
            </div>

            {/* Task Details Summary */}
            <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Task Title:</span>
                <span className="font-semibold text-slate-100 max-w-[240px] truncate text-right">
                  {taskToDelete.title}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Category:</span>
                <span className="font-medium text-slate-200">
                  {TASK_CATEGORY_CONFIG[taskToDelete.category]?.label || taskToDelete.category}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Priority:</span>
                <span className="font-semibold text-amber-400">
                  {TASK_PRIORITY_CONFIG[taskToDelete.priority]?.label || taskToDelete.priority}
                </span>
              </div>
              {taskToDelete.load_number && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Linked Load:</span>
                  <span className="font-semibold text-indigo-300">
                    Load #{taskToDelete.load_number}
                  </span>
                </div>
              )}
              {taskToDelete.assigned_to_name && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Assignee:</span>
                  <span className="text-slate-300">
                    {taskToDelete.assigned_to_name}
                  </span>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setTaskToDelete(null)}
                disabled={isDeleting}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
              >
                Keep Task
              </button>
              <button
                id="btn-confirm-delete-task"
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-lg shadow-rose-900/30 flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
              >
                {isDeleting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Permanently Delete</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
