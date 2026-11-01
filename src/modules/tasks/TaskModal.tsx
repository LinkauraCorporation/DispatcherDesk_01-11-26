import React, { useState, useEffect, useMemo } from 'react';
import { Modal } from '../../components/common/Modal.tsx';
import { useAuth } from '../../contexts/AuthContext.tsx';
import { useTimezone } from '../../contexts/TimezoneContext.tsx';
import { SUPPORTED_TIMEZONES, toLocalInputValue, parseInputToIso } from '../../lib/timezones.ts';
import { loadService } from '../loads/loadService.ts';
import { LoadWithRelations } from '../loads/loadTypes.ts';
import { taskService } from './taskService.ts';
import {
  DispatcherTask,
  CreateTaskInput,
  UpdateTaskInput,
  TaskCategory,
  TaskPriority,
  TASK_CATEGORY_CONFIG,
  TASK_PRIORITY_CONFIG,
} from './taskTypes.ts';
import { TEAM_MEMBERS } from './taskUtils.ts';
import {
  CheckSquare,
  Clock,
  User,
  Package,
  Calendar,
  AlertCircle,
  Bell,
  CheckCircle2,
  PhoneCall,
  Timer,
  FileText,
  Send,
  Truck,
  Receipt,
  ShieldAlert,
} from 'lucide-react';

export interface TaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  taskToEdit?: DispatcherTask | null;
  preselectedLoadId?: string | null;
  initialCategory?: TaskCategory;
  initialPriority?: TaskPriority;
  initialTitle?: string;
  initialDescription?: string;
  initialDueAt?: string;
  initialReminderOffset?: number;
  triggerSource?: string;
  referenceEntityId?: string | null;
  onSuccess: (task: DispatcherTask, isEdit: boolean) => void;
}

export const TaskModal: React.FC<TaskModalProps> = ({
  isOpen,
  onClose,
  taskToEdit,
  preselectedLoadId,
  initialCategory,
  initialPriority,
  initialTitle,
  initialDescription,
  initialDueAt,
  initialReminderOffset,
  triggerSource = 'manual',
  referenceEntityId = null,
  onSuccess,
}) => {
  const { activeOrganization, user, profile, userRole } = useAuth();
  const { operationalTimezone, dispatcherTimezone } = useTimezone();
  const orgId = activeOrganization?.id || '';

  const isEdit = Boolean(taskToEdit);
  const isReadOnly = userRole === 'staff';

  const [availableLoads, setAvailableLoads] = useState<LoadWithRelations[]>([]);
  const [selectedLoadId, setSelectedLoadId] = useState<string>('');

  // Form State
  const [title, setTitle] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [category, setCategory] = useState<TaskCategory>('check_call');
  const [priority, setPriority] = useState<TaskPriority>('normal');
  const [dueAtLocal, setDueAtLocal] = useState<string>('');
  const [timezoneContext, setTimezoneContext] = useState<string>(operationalTimezone);
  const [reminderOffset, setReminderOffset] = useState<number>(15);
  const [assignedToUserId, setAssignedToUserId] = useState<string>('');
  const [assignedToName, setAssignedToName] = useState<string>('');

  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Load org loads for selector
  useEffect(() => {
    if (isOpen && orgId) {
      loadService
        .getLoads(orgId)
        .then((loads) => setAvailableLoads(loads))
        .catch((err) => console.error('Error fetching loads for task modal:', err));
    }
  }, [isOpen, orgId]);

  // Helper to format ISO to datetime-local string (YYYY-MM-DDTHH:mm)
  const formatLocalInput = (isoString?: string, tzOverride?: string): string => {
    const tz = tzOverride || timezoneContext || operationalTimezone;
    const str = isoString || new Date(Date.now() + 30 * 60 * 1000).toISOString();
    return toLocalInputValue(str, tz);
  };

  // Reset or initialize form values
  useEffect(() => {
    if (!isOpen) return;
    setError(null);

    if (taskToEdit) {
      const effectiveTz = taskToEdit.timezone_context || operationalTimezone;
      setTitle(taskToEdit.title);
      setDescription(taskToEdit.description || '');
      setCategory(taskToEdit.category);
      setPriority(taskToEdit.priority);
      setTimezoneContext(effectiveTz);
      setDueAtLocal(formatLocalInput(taskToEdit.due_at, effectiveTz));
      setReminderOffset(taskToEdit.reminder_offset_minutes ?? 15);
      setSelectedLoadId(taskToEdit.load_id || '');
      setAssignedToUserId(taskToEdit.assigned_to_user_id || '');
      setAssignedToName(taskToEdit.assigned_to_name || '');
    } else {
      setTitle(initialTitle || '');
      setDescription(initialDescription || '');
      setCategory(initialCategory || 'check_call');
      setPriority(initialPriority || 'normal');
      setTimezoneContext(operationalTimezone);
      setDueAtLocal(initialDueAt ? formatLocalInput(initialDueAt, operationalTimezone) : formatLocalInput(undefined, operationalTimezone));
      setReminderOffset(initialReminderOffset ?? 15);
      setSelectedLoadId(preselectedLoadId || '');
      // Default assignment to current user or lead dispatcher
      const currentUserName = profile?.full_name || user?.email?.split('@')[0] || 'Alex Rivera';
      setAssignedToUserId(user?.id || 'usr-alex-1');
      setAssignedToName(currentUserName);
    }
  }, [
    isOpen,
    taskToEdit,
    preselectedLoadId,
    initialCategory,
    initialPriority,
    initialTitle,
    initialDescription,
    initialDueAt,
    initialReminderOffset,
    operationalTimezone,
    profile,
    user,
  ]);

  // Preset time modifiers
  const handleApplyPreset = (minutesToAdd: number | 'tomorrow_morning' | 'next_shift') => {
    const now = new Date();
    if (typeof minutesToAdd === 'number') {
      const target = new Date(now.getTime() + minutesToAdd * 60 * 1000);
      setDueAtLocal(toLocalInputValue(target.toISOString()));
    } else if (minutesToAdd === 'tomorrow_morning') {
      const target = new Date(now.getTime());
      target.setDate(target.getDate() + 1);
      target.setHours(8, 0, 0, 0);
      setDueAtLocal(toLocalInputValue(target.toISOString()));
    } else if (minutesToAdd === 'next_shift') {
      const target = new Date(now.getTime() + 8 * 3600 * 1000);
      setDueAtLocal(toLocalInputValue(target.toISOString()));
    }
  };

  const handleAssigneeChange = (userId: string) => {
    setAssignedToUserId(userId);
    if (!userId) {
      setAssignedToName('');
      return;
    }
    const found = TEAM_MEMBERS.find((m) => m.id === userId);
    if (found) {
      setAssignedToName(found.shortName);
    } else if (user && userId === user.id) {
      setAssignedToName(profile?.full_name || user.email?.split('@')[0] || 'Dispatcher');
    }
  };

  const getCategoryIcon = (cat: TaskCategory) => {
    switch (cat) {
      case 'check_call':
        return <PhoneCall className="w-4 h-4" />;
      case 'detention_warning':
        return <Timer className="w-4 h-4" />;
      case 'document_collection':
        return <FileText className="w-4 h-4" />;
      case 'broker_update':
        return <Send className="w-4 h-4" />;
      case 'driver_instruction':
        return <Truck className="w-4 h-4" />;
      case 'appointment_scheduling':
        return <Calendar className="w-4 h-4" />;
      case 'billing_prep':
        return <Receipt className="w-4 h-4" />;
      case 'general_operational':
      default:
        return <CheckSquare className="w-4 h-4" />;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgId) return;

    if (isReadOnly) {
      setError('Staff role is read-only. Only dispatchers and administrators can create or edit tasks.');
      return;
    }

    if (!title.trim()) {
      setError('Task title is required.');
      return;
    }

    if (!dueAtLocal) {
      setError('Due date and time is required.');
      return;
    }

    const effectiveTz = timezoneContext || operationalTimezone;
    const dueAtIso = parseInputToIso(dueAtLocal, effectiveTz);
    if (!dueAtIso) {
      setError('Please provide a valid due date and time.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const selectedLoad = availableLoads.find((l) => l.id === selectedLoadId);
      const actorName = profile?.full_name || user?.email?.split('@')[0] || 'Dispatcher';
      const actorId = user?.id || 'usr-alex-1';

      if (isEdit && taskToEdit) {
        const updatePayload: UpdateTaskInput = {
          title: title.trim(),
          description: description.trim(),
          category,
          priority,
          due_at: dueAtIso,
          timezone_context: timezoneContext,
          reminder_offset_minutes: reminderOffset,
          load_id: selectedLoadId || null,
          load_number: selectedLoad?.load_number || null,
          assigned_to_user_id: assignedToUserId || null,
          assigned_to_name: assignedToName || null,
          updated_by_user_id: actorId,
          updated_by_name: actorName,
        };

        const updated = await taskService.updateTask(orgId, taskToEdit.id, updatePayload, userRole);
        onSuccess(updated, true);
        onClose();
      } else {
        const createPayload: CreateTaskInput = {
          title: title.trim(),
          description: description.trim(),
          category,
          priority,
          due_at: dueAtIso,
          timezone_context: timezoneContext,
          reminder_offset_minutes: reminderOffset,
          load_id: selectedLoadId || null,
          load_number: selectedLoad?.load_number || null,
          assigned_to_user_id: assignedToUserId || null,
          assigned_to_name: assignedToName || null,
          created_by_user_id: actorId,
          created_by_name: actorName,
          trigger_source: triggerSource as any,
          reference_entity_id: referenceEntityId,
        };

        const created = await taskService.createTask(orgId, createPayload, userRole);
        onSuccess(created, false);
        onClose();
      }
    } catch (err: unknown) {
      console.error('Error saving task:', err);
      setError(err instanceof Error ? err.message : 'Failed to save task.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      id="task-modal"
      isOpen={isOpen}
      onClose={onClose}
      title={isEdit ? `Edit Task: ${taskToEdit?.title}` : 'Create Dispatch Task & Reminder'}
      subtitle="Schedule time-sensitive follow-ups, detention alerts, and driver check-in reminders"
      maxWidth="2xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {isReadOnly && (
          <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-center gap-2.5 text-xs text-amber-300">
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span>Read-Only Mode: Staff role members cannot create or modify task records.</span>
          </div>
        )}

        {error && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg flex items-center gap-2.5 text-xs text-rose-400">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Task Title */}
        <div className="space-y-1">
          <label className="block text-xs font-semibold text-slate-300">
            Task Title / Action Item <span className="text-rose-400">*</span>
          </label>
          <input
            type="text"
            required
            disabled={isReadOnly}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Call Driver Marcus Vance for I-40 East mile marker check-in"
            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 font-medium"
          />
        </div>

        {/* Category Selection Grid */}
        <div className="space-y-1.5">
          <label className="block text-xs font-semibold text-slate-300">
            Operational Category <span className="text-rose-400">*</span>
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {(Object.keys(TASK_CATEGORY_CONFIG) as TaskCategory[]).map((catKey) => {
              const cfg = TASK_CATEGORY_CONFIG[catKey];
              const isSelected = category === catKey;
              return (
                <button
                  key={catKey}
                  type="button"
                  disabled={isReadOnly}
                  onClick={() => setCategory(catKey)}
                  className={`p-2 rounded-lg border text-left flex items-start gap-2 transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-indigo-600/20 border-indigo-500 text-indigo-200 ring-1 ring-indigo-500/60'
                      : 'bg-slate-950/70 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                  }`}
                >
                  <div className={`mt-0.5 shrink-0 ${isSelected ? 'text-indigo-400' : cfg.color}`}>
                    {getCategoryIcon(catKey)}
                  </div>
                  <div className="min-w-0">
                    <span className="block text-[11px] font-bold truncate">{cfg.shortLabel}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Priority & Associated Load Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Priority selector */}
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-slate-300">Priority Level</label>
            <div className="grid grid-cols-4 gap-1.5">
              {(Object.keys(TASK_PRIORITY_CONFIG) as TaskPriority[]).map((pKey) => {
                const cfg = TASK_PRIORITY_CONFIG[pKey];
                const isSelected = priority === pKey;
                return (
                  <button
                    key={pKey}
                    type="button"
                    disabled={isReadOnly}
                    onClick={() => setPriority(pKey)}
                    className={`py-1.5 text-center text-xs font-bold rounded-lg border transition-all cursor-pointer ${
                      isSelected
                        ? `${cfg.bgColor} ${cfg.color} ${cfg.borderColor} ring-1 ring-current`
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {cfg.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Linked Load */}
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-slate-300">
              Linked Freight Load <span className="text-slate-500 font-normal">(Optional)</span>
            </label>
            <select
              value={selectedLoadId}
              disabled={isReadOnly}
              onChange={(e) => setSelectedLoadId(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
            >
              <option value="">No Load Linkage (General Task)</option>
              {availableLoads.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.load_number} — {l.origin_city}, {l.origin_state} ➔ {l.dest_city}, {l.dest_state}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Due Date & Scheduling Controls */}
        <div className="p-3.5 bg-slate-950/70 border border-slate-800 rounded-xl space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-200 uppercase tracking-wider">
              <Clock className="w-3.5 h-3.5 text-indigo-400" />
              <span>Timing & Dual-Timezone Scheduling</span>
            </div>
            <span className="text-[10px] text-slate-400 font-mono">Instant Presets</span>
          </div>

          {/* Quick Presets Strip */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-slate-400 mr-1">Quick Set:</span>
            <button
              type="button"
              disabled={isReadOnly}
              onClick={() => handleApplyPreset(15)}
              className="px-2 py-0.5 text-[11px] font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition-colors cursor-pointer"
            >
              +15m
            </button>
            <button
              type="button"
              disabled={isReadOnly}
              onClick={() => handleApplyPreset(30)}
              className="px-2 py-0.5 text-[11px] font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition-colors cursor-pointer"
            >
              +30m
            </button>
            <button
              type="button"
              disabled={isReadOnly}
              onClick={() => handleApplyPreset(60)}
              className="px-2 py-0.5 text-[11px] font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition-colors cursor-pointer"
            >
              +1h
            </button>
            <button
              type="button"
              disabled={isReadOnly}
              onClick={() => handleApplyPreset(120)}
              className="px-2 py-0.5 text-[11px] font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition-colors cursor-pointer"
            >
              +2h
            </button>
            <button
              type="button"
              disabled={isReadOnly}
              onClick={() => handleApplyPreset(240)}
              className="px-2 py-0.5 text-[11px] font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition-colors cursor-pointer"
            >
              +4h
            </button>
            <button
              type="button"
              disabled={isReadOnly}
              onClick={() => handleApplyPreset('tomorrow_morning')}
              className="px-2 py-0.5 text-[11px] font-semibold bg-indigo-950/80 hover:bg-indigo-900 text-indigo-300 rounded border border-indigo-800/60 transition-colors cursor-pointer"
            >
              Tomorrow 8 AM
            </button>
            <button
              type="button"
              disabled={isReadOnly}
              onClick={() => handleApplyPreset('next_shift')}
              className="px-2 py-0.5 text-[11px] font-semibold bg-indigo-950/80 hover:bg-indigo-900 text-indigo-300 rounded border border-indigo-800/60 transition-colors cursor-pointer"
            >
              Next Shift (+8h)
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Due Timestamp Picker */}
            <div className="space-y-1">
              <label className="block text-[11px] font-medium text-slate-300">
                Due Date & Time <span className="text-rose-400">*</span>
              </label>
              <input
                type="datetime-local"
                required
                disabled={isReadOnly}
                value={dueAtLocal}
                onChange={(e) => setDueAtLocal(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
              />
            </div>

            {/* Timezone Context */}
            <div className="space-y-1">
              <label className="block text-[11px] font-medium text-slate-300">Timezone Context</label>
              <select
                value={timezoneContext}
                disabled={isReadOnly}
                onChange={(e) => setTimezoneContext(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
              >
                {SUPPORTED_TIMEZONES.map((tz) => (
                  <option key={tz.id} value={tz.id}>
                    {tz.code} — {tz.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Reminder Offset */}
            <div className="space-y-1">
              <label className="block text-[11px] font-medium text-slate-300 flex items-center gap-1">
                <Bell className="w-3 h-3 text-amber-400" />
                <span>Reminder Alert</span>
              </label>
              <select
                value={reminderOffset}
                disabled={isReadOnly}
                onChange={(e) => setReminderOffset(Number(e.target.value))}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
              >
                <option value={0}>At time of event (0m)</option>
                <option value={15}>15 minutes before</option>
                <option value={30}>30 minutes before</option>
                <option value={60}>1 hour before</option>
                <option value={120}>2 hours before</option>
              </select>
            </div>
          </div>
        </div>

        {/* Assignee & Description */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-slate-300">Assignee</label>
            <select
              value={assignedToUserId}
              disabled={isReadOnly}
              onChange={(e) => handleAssigneeChange(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
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

          <div className="sm:col-span-2 space-y-1">
            <label className="block text-xs font-semibold text-slate-300">
              Operational Instructions / Details <span className="text-slate-500 font-normal">(Optional)</span>
            </label>
            <textarea
              rows={2}
              disabled={isReadOnly}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Call shipper before 11:00 AM to verify pallet count and confirm appointment window."
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        {/* Modal Action Buttons */}
        <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          >
            Cancel
          </button>

          <button
            type="submit"
            disabled={isSubmitting || isReadOnly}
            className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors shadow-sm cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
          >
            {isSubmitting ? (
              'Saving...'
            ) : isEdit ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" />
                Update Task
              </>
            ) : (
              <>
                <CheckSquare className="w-3.5 h-3.5" />
                Create Task
              </>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
};
