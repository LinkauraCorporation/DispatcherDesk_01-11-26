import { UserRole } from '../../types/domain.types.ts';
import { supabase, isSupabaseConfigured } from '../../lib/supabase.ts';
import {
  DispatcherTask,
  CreateTaskInput,
  UpdateTaskInput,
  CompleteTaskInput,
  SnoozeTaskInput,
  TaskFilterOptions,
  TaskStats,
  SnoozePreset,
  TaskPriority,
  TaskCategory,
  ReminderEvaluationResult,
  ReminderRuleConfig,
  DEFAULT_REMINDER_RULE_CONFIG,
} from './taskTypes.ts';
import { activityService } from '../activity/activityService.ts';
import { loadService } from '../loads/loadService.ts';
import { checkCallService } from '../checkcalls/checkCallService.ts';
import { accessorialService, calculateDetention, DEMO_ORGANIZATION_ID } from '../accessorials/accessorialService.ts';
import { documentService } from '../documents/documentService.ts';
import { formatInTimezone } from '../../lib/timezones.ts';

const TASK_STORAGE_PREFIX = 'dispatchdesk_demo_tasks_';
const REMINDER_CONFIG_STORAGE_PREFIX = 'dispatchdesk_demo_reminder_config_';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUUID(str?: string | null): boolean {
  return Boolean(str && UUID_REGEX.test(str.trim()));
}

/**
 * Deterministic helper to get the active due timestamp for a task,
 * taking into account whether it is currently snoozed.
 */
export function getEffectiveDueAt(task: DispatcherTask): string {
  if (task.status === 'snoozed' && task.snoozed_until) {
    return task.snoozed_until;
  }
  return task.due_at;
}

/**
 * Determines if a task is overdue based on current time.
 * Snoozed tasks are evaluated against their snoozed_until timestamp.
 */
export function isTaskOverdue(task: DispatcherTask, now: Date = new Date()): boolean {
  if (task.status === 'completed' || task.status === 'cancelled') {
    return false;
  }
  const effectiveDue = new Date(getEffectiveDueAt(task));
  return effectiveDue.getTime() < now.getTime();
}

/**
 * Determines if a task is due within a given threshold (default: 60 minutes).
 */
export function isTaskDueSoon(
  task: DispatcherTask,
  thresholdMinutes: number = 60,
  now: Date = new Date()
): boolean {
  if (task.status === 'completed' || task.status === 'cancelled') {
    return false;
  }
  const effectiveDue = new Date(getEffectiveDueAt(task));
  const diffMs = effectiveDue.getTime() - now.getTime();
  return diffMs > 0 && diffMs <= thresholdMinutes * 60 * 1000;
}

/**
 * Calculates a future ISO timestamp based on standard dispatch snooze presets.
 */
export function calculateSnoozeDate(
  preset: SnoozePreset,
  fromDate: Date = new Date()
): string {
  const target = new Date(fromDate.getTime());

  switch (preset) {
    case '15m':
      target.setMinutes(target.getMinutes() + 15);
      break;
    case '30m':
      target.setMinutes(target.getMinutes() + 30);
      break;
    case '1h':
      target.setHours(target.getHours() + 1);
      break;
    case '2h':
      target.setHours(target.getHours() + 2);
      break;
    case '4h':
      target.setHours(target.getHours() + 4);
      break;
    case 'tomorrow_morning':
      // Next day 08:00 AM local
      target.setDate(target.getDate() + 1);
      target.setHours(8, 0, 0, 0);
      break;
    case 'next_shift':
      // 8 hours shift jump
      target.setHours(target.getHours() + 8);
      break;
    case 'custom':
    default:
      target.setMinutes(target.getMinutes() + 30);
      break;
  }

  return target.toISOString();
}

/**
 * Initial realistic seed tasks for newly initialized demo organizations.
 */
function generateSeedTasks(orgId: string): DispatcherTask[] {
  // Demo seed tasks are strictly limited to the dedicated demo organization
  if (orgId !== DEMO_ORGANIZATION_ID) {
    return [];
  }

  const now = Date.now();

  return [
    {
      id: `task-seed-1-${orgId.slice(0, 6)}`,
      organization_id: orgId,
      load_id: 'demo-load-2',
      load_number: 'LD-2024-8842',
      category: 'detention_warning',
      title: 'Warn Broker Apex Logistics: Free-Time Expiry approaching',
      description: 'Driver Marcus Vance arrived at receiver at 09:30 CDT. 2-hr free time expires at 11:30 CDT. Prepare detention notification.',
      priority: 'urgent',
      status: 'pending',
      due_at: new Date(now - 15 * 60 * 1000).toISOString(), // 15m overdue to demonstrate alert
      timezone_context: 'America/Chicago',
      reminder_offset_minutes: 15,
      assigned_to_user_id: 'usr-alex-1',
      assigned_to_name: 'Alex Rivera',
      created_by_user_id: 'sys-rule',
      created_by_name: 'System Detention Watcher',
      trigger_source: 'detention_clock',
      created_at: new Date(now - 2 * 3600 * 1000).toISOString(),
      updated_at: new Date(now - 15 * 60 * 1000).toISOString(),
    },
    {
      id: `task-seed-2-${orgId.slice(0, 6)}`,
      organization_id: orgId,
      load_id: 'demo-load-3',
      load_number: 'LD-2024-8843',
      category: 'check_call',
      title: 'Routine Transit Check-in with Driver Elena Gomez',
      description: 'Truck #TRK-104 en route on I-40 East. Check current mile marker, weather on Cumberland Plateau, and updated ETA.',
      priority: 'high',
      status: 'pending',
      due_at: new Date(now + 25 * 60 * 1000).toISOString(), // Due in 25m
      timezone_context: 'America/Chicago',
      reminder_offset_minutes: 30,
      assigned_to_user_id: 'usr-alex-1',
      assigned_to_name: 'Alex Rivera',
      created_by_user_id: 'usr-alex-1',
      created_by_name: 'Alex Rivera',
      trigger_source: 'check_call_exception',
      created_at: new Date(now - 3 * 3600 * 1000).toISOString(),
      updated_at: new Date(now - 3 * 3600 * 1000).toISOString(),
    },
    {
      id: `task-seed-3-${orgId.slice(0, 6)}`,
      organization_id: orgId,
      load_id: 'demo-load-4',
      load_number: 'LD-2024-8844',
      category: 'document_collection',
      title: 'Collect Signed Clean POD & Lumper Receipt from Driver',
      description: 'Load delivered at Kroger Distribution Center. WhatsApp driver for high-res photo of stamped BOL/POD to unlock factoring packet.',
      priority: 'normal',
      status: 'pending',
      due_at: new Date(now + 90 * 60 * 1000).toISOString(), // Due in 1.5h
      timezone_context: 'America/Chicago',
      reminder_offset_minutes: 15,
      assigned_to_user_id: null,
      assigned_to_name: null,
      created_by_user_id: 'usr-alex-1',
      created_by_name: 'Alex Rivera',
      trigger_source: 'document_alert',
      created_at: new Date(now - 4 * 3600 * 1000).toISOString(),
      updated_at: new Date(now - 4 * 3600 * 1000).toISOString(),
    },
    {
      id: `task-seed-4-${orgId.slice(0, 6)}`,
      organization_id: orgId,
      load_id: 'demo-load-1',
      load_number: 'LD-2024-8841',
      category: 'broker_update',
      title: 'Send Revised Delivery ETA to Broker Sarah Jenkins',
      description: 'Driver encountered 40 min traffic backup outside Atlanta. Reassure broker appointment window remains secure.',
      priority: 'high',
      status: 'completed',
      due_at: new Date(now - 60 * 60 * 1000).toISOString(),
      timezone_context: 'America/Chicago',
      completed_at: new Date(now - 45 * 60 * 1000).toISOString(),
      completed_by_user_id: 'usr-alex-1',
      completed_by_name: 'Alex Rivera',
      completion_notes: 'Broker emailed revised ETA 16:30 EDT. Acknowledged without penalty.',
      assigned_to_user_id: 'usr-alex-1',
      assigned_to_name: 'Alex Rivera',
      created_by_user_id: 'usr-alex-1',
      created_by_name: 'Alex Rivera',
      trigger_source: 'manual',
      created_at: new Date(now - 2 * 3600 * 1000).toISOString(),
      updated_at: new Date(now - 45 * 60 * 1000).toISOString(),
    },
  ];
}

export interface ITaskService {
  getTasks(organizationId: string, filters?: TaskFilterOptions): Promise<DispatcherTask[]>;
  getTaskById(organizationId: string, taskId: string): Promise<DispatcherTask | null>;
  getTasksByLoadId(organizationId: string, loadId: string): Promise<DispatcherTask[]>;
  getTaskStats(organizationId: string): Promise<TaskStats>;
  createTask(organizationId: string, input: CreateTaskInput, userRole?: UserRole | null): Promise<DispatcherTask>;
  updateTask(organizationId: string, taskId: string, input: UpdateTaskInput, userRole?: UserRole | null): Promise<DispatcherTask>;
  completeTask(organizationId: string, taskId: string, input?: CompleteTaskInput, userRole?: UserRole | null): Promise<DispatcherTask>;
  snoozeTask(organizationId: string, taskId: string, input: SnoozeTaskInput, userRole?: UserRole | null): Promise<DispatcherTask>;
  reassignTask(
    organizationId: string,
    taskId: string,
    assignedToUserId: string | null,
    assignedToName: string | null,
    actorName?: string,
    actorId?: string,
    userRole?: UserRole | null
  ): Promise<DispatcherTask>;
  cancelTask(
    organizationId: string,
    taskId: string,
    reason?: string,
    actorName?: string,
    actorId?: string,
    userRole?: UserRole | null
  ): Promise<DispatcherTask>;
  deleteTask(organizationId: string, taskId: string, userRole?: UserRole | null): Promise<boolean>;
  getReminderConfig(organizationId: string): ReminderRuleConfig;
  updateReminderConfig(
    organizationId: string,
    config: Partial<ReminderRuleConfig>,
    userRole?: UserRole | null
  ): ReminderRuleConfig;
  evaluateAndGenerateReminders(
    organizationId: string,
    userRole?: UserRole | null,
    customConfig?: Partial<ReminderRuleConfig>
  ): Promise<ReminderEvaluationResult>;
}

export class TaskService implements ITaskService {
  private getStorageKey(organizationId: string): string {
    if (!organizationId || typeof organizationId !== 'string' || organizationId.trim() === '') {
      throw new Error('[TaskService] organizationId is strictly required for tenant-isolated task queries.');
    }
    return `${TASK_STORAGE_PREFIX}${organizationId.trim()}`;
  }

  private loadTasksFromStorage(organizationId: string): DispatcherTask[] {
    const key = this.getStorageKey(organizationId);
    try {
      const raw = localStorage.getItem(key);
      if (!raw) {
        // Initialize seed tasks for this tenant
        const initial = generateSeedTasks(organizationId);
        this.saveTasksToStorage(organizationId, initial);
        return initial;
      }
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        console.warn(`[TaskService] Invalid task store for org ${organizationId}. Resetting with seeds.`);
        const seeds = generateSeedTasks(organizationId);
        this.saveTasksToStorage(organizationId, seeds);
        return seeds;
      }

      // For non-demo organizations: detect and purge known demo detention task (task-seed-1) from previous runs
      if (organizationId !== DEMO_ORGANIZATION_ID) {
        const hasDemoDetentionTask = parsed.some(
          (t: DispatcherTask) =>
            t.id.startsWith('task-seed-1') ||
            (t.category === 'detention_warning' && t.load_id === 'demo-load-2' && t.trigger_source === 'detention_clock')
        );
        if (hasDemoDetentionTask) {
          const cleaned = parsed.filter(
            (t: DispatcherTask) =>
              !t.id.startsWith('task-seed-1') &&
              !(t.category === 'detention_warning' && t.load_id === 'demo-load-2' && t.trigger_source === 'detention_clock')
          );
          this.saveTasksToStorage(organizationId, cleaned);
          return cleaned;
        }
      }

      return parsed;
    } catch (err) {
      console.error(`[TaskService] Storage read error for org ${organizationId}:`, err);
      return generateSeedTasks(organizationId);
    }
  }

  private saveTasksToStorage(organizationId: string, tasks: DispatcherTask[]): void {
    const key = this.getStorageKey(organizationId);
    try {
      localStorage.setItem(key, JSON.stringify(tasks));
    } catch (err) {
      console.error(`[TaskService] Storage write error for org ${organizationId}:`, err);
    }
  }

  private assertCanMutate(userRole?: UserRole | null): void {
    if (userRole === 'staff') {
      throw new Error('[TaskService RBAC] Staff members have read-only access and cannot create or modify tasks.');
    }
  }

  private logActivityAsync(
    organizationId: string,
    loadId: string | null | undefined,
    title: string,
    description: string,
    actorName: string = 'Dispatcher',
    actorId: string = 'usr-dispatcher',
    metadata?: Record<string, any>
  ): void {
    // Non-blocking activity audit logging
    if (!loadId) return;
    try {
      activityService.logActivity(organizationId, {
        loadId,
        type: 'dispatcher_note',
        title,
        description,
        actorName,
        actorId,
        metadata: {
          subsystem: 'tasks',
          ...metadata,
        },
      }).catch((err) => {
        console.warn('[TaskService] Non-blocking activity logging failed:', err);
      });
    } catch (err) {
      console.warn('[TaskService] Non-blocking activity logging caught error:', err);
    }
  }

  /**
   * Fetch all tasks for an organization with optional filtering.
   */
  async getTasks(
    organizationId: string,
    filters?: TaskFilterOptions
  ): Promise<DispatcherTask[]> {
    if (!organizationId) return [];

    let rawTasks: DispatcherTask[] = [];

    if (isSupabaseConfigured && isUUID(organizationId)) {
      try {
        let query = (supabase.from('tasks' as any) as any)
          .select('*')
          .eq('organization_id', organizationId);

        if (filters?.loadId && isUUID(filters.loadId)) {
          query = query.eq('load_id', filters.loadId);
        }

        if (filters?.category && filters.category !== 'all') {
          query = query.eq('category', filters.category);
        }

        if (filters?.priority && filters.priority !== 'all') {
          query = query.eq('priority', filters.priority);
        }

        if (filters?.assignedTo && filters.assignedTo !== 'all') {
          if (filters.assignedTo === 'unassigned') {
            query = query.is('assigned_to_user_id', null);
          } else if (isUUID(filters.assignedTo)) {
            query = query.eq('assigned_to_user_id', filters.assignedTo);
          }
        }

        const { data, error } = await query;

        if (!error && data) {
          rawTasks = (data as unknown) as DispatcherTask[];
        }
      } catch (err) {
        console.warn('Supabase getTasks failed, falling back to local storage:', err);
      }
    }

    if (rawTasks.length === 0) {
      rawTasks = this.loadTasksFromStorage(organizationId);
    }

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const endOfToday = startOfToday + 24 * 3600 * 1000;

    let filtered = rawTasks.filter((task) => {
      // Status filtering
      if (filters?.status) {
        if (filters.status === 'active') {
          if (task.status === 'completed' || task.status === 'cancelled') return false;
        } else if (filters.status === 'completed') {
          if (task.status !== 'completed') return false;
        } else if (filters.status === 'snoozed') {
          if (task.status !== 'snoozed') return false;
        } else if (filters.status === 'overdue') {
          if (!isTaskOverdue(task, now)) return false;
        } else if (filters.status === 'today') {
          if (task.status === 'completed' || task.status === 'cancelled') return false;
          const dueTime = new Date(getEffectiveDueAt(task)).getTime();
          if (dueTime < startOfToday || dueTime > endOfToday) return false;
        }
      }

      // Priority filtering
      if (filters?.priority && filters.priority !== 'all') {
        if (task.priority !== filters.priority) return false;
      }

      // Category filtering
      if (filters?.category && filters.category !== 'all') {
        if (task.category !== filters.category) return false;
      }

      // Load ID filtering
      if (filters?.loadId) {
        if (task.load_id !== filters.loadId) return false;
      }

      // Assignment filtering
      if (filters?.assignedTo && filters.assignedTo !== 'all') {
        if (filters.assignedTo === 'unassigned') {
          if (task.assigned_to_user_id) return false;
        } else {
          if (task.assigned_to_user_id !== filters.assignedTo) return false;
        }
      }

      // Search query filtering
      if (filters?.searchQuery && filters.searchQuery.trim() !== '') {
        const q = filters.searchQuery.toLowerCase();
        const titleMatch = task.title.toLowerCase().includes(q);
        const descMatch = task.description ? task.description.toLowerCase().includes(q) : false;
        const loadMatch = task.load_number ? task.load_number.toLowerCase().includes(q) : false;
        const assigneeMatch = task.assigned_to_name ? task.assigned_to_name.toLowerCase().includes(q) : false;
        if (!titleMatch && !descMatch && !loadMatch && !assigneeMatch) return false;
      }

      return true;
    });

    // Deterministic sorting: Overdue first, then Urgent -> High -> Normal -> Low, then earliest due_at
    const priorityRank: Record<TaskPriority, number> = {
      urgent: 4,
      high: 3,
      normal: 2,
      low: 1,
    };

    filtered.sort((a, b) => {
      // Completed/cancelled tasks sink to the bottom
      const aDone = a.status === 'completed' || a.status === 'cancelled';
      const bDone = b.status === 'completed' || b.status === 'cancelled';
      if (aDone && !bDone) return 1;
      if (!aDone && bDone) return -1;

      // Check overdue priority
      const aOverdue = isTaskOverdue(a, now);
      const bOverdue = isTaskOverdue(b, now);
      if (aOverdue && !bOverdue) return -1;
      if (!aOverdue && bOverdue) return 1;

      // Priority ranking
      const pDiff = priorityRank[b.priority] - priorityRank[a.priority];
      if (pDiff !== 0) return pDiff;

      // Due timestamp
      return new Date(getEffectiveDueAt(a)).getTime() - new Date(getEffectiveDueAt(b)).getTime();
    });

    if (filters?.limit && filters.limit > 0) {
      filtered = filtered.slice(0, filters.limit);
    }

    return filtered;
  }

  /**
   * Get a single task by ID.
   */
  async getTaskById(organizationId: string, taskId: string): Promise<DispatcherTask | null> {
    if (!organizationId || !taskId) return null;

    if (isSupabaseConfigured && isUUID(organizationId) && isUUID(taskId)) {
      try {
        const { data, error } = await (supabase.from('tasks' as any) as any)
          .select('*')
          .eq('id', taskId)
          .eq('organization_id', organizationId)
          .maybeSingle();

        if (!error && data) {
          return (data as unknown) as DispatcherTask;
        }
      } catch (err) {
        console.warn('Supabase getTaskById failed, falling back to local storage:', err);
      }
    }

    const tasks = this.loadTasksFromStorage(organizationId);
    return tasks.find((t) => t.id === taskId) || null;
  }

  /**
   * Get all tasks associated with a specific load.
   */
  async getTasksByLoadId(organizationId: string, loadId: string): Promise<DispatcherTask[]> {
    return this.getTasks(organizationId, { loadId });
  }

  /**
   * Get operational task counts and health statistics.
   */
  async getTaskStats(organizationId: string): Promise<TaskStats> {
    const all = await this.getTasks(organizationId);
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const endOfToday = startOfToday + 24 * 3600 * 1000;

    let totalActive = 0;
    let overdueCount = 0;
    let dueNextHourCount = 0;
    let dueTodayCount = 0;
    let completedTodayCount = 0;
    let snoozedCount = 0;

    const byPriority: Record<TaskPriority, number> = {
      urgent: 0,
      high: 0,
      normal: 0,
      low: 0,
    };

    const byCategory: Record<TaskCategory, number> = {
      check_call: 0,
      detention_warning: 0,
      document_collection: 0,
      broker_update: 0,
      driver_instruction: 0,
      appointment_scheduling: 0,
      billing_prep: 0,
      general_operational: 0,
    };

    for (const task of all) {
      if (task.status === 'completed') {
        if (task.completed_at) {
          const compTime = new Date(task.completed_at).getTime();
          if (compTime >= startOfToday && compTime <= endOfToday) {
            completedTodayCount++;
          }
        }
        continue;
      }

      if (task.status === 'cancelled') {
        continue;
      }

      totalActive++;
      byPriority[task.priority] = (byPriority[task.priority] || 0) + 1;
      byCategory[task.category] = (byCategory[task.category] || 0) + 1;

      if (task.status === 'snoozed') {
        snoozedCount++;
      }

      if (isTaskOverdue(task, now)) {
        overdueCount++;
      } else {
        if (isTaskDueSoon(task, 60, now)) {
          dueNextHourCount++;
        }
        const dueTime = new Date(getEffectiveDueAt(task)).getTime();
        if (dueTime >= startOfToday && dueTime <= endOfToday) {
          dueTodayCount++;
        }
      }
    }

    return {
      totalActive,
      overdueCount,
      dueNextHourCount,
      dueTodayCount,
      completedTodayCount,
      snoozedCount,
      byPriority,
      byCategory,
    };
  }

  /**
   * Create a new dispatcher task.
   */
  async createTask(
    organizationId: string,
    input: CreateTaskInput,
    userRole?: UserRole | null
  ): Promise<DispatcherTask> {
    this.assertCanMutate(userRole);

    if (!organizationId) {
      throw new Error('[TaskService] organizationId is required to create a task.');
    }

    if (!input.title || !input.title.trim()) {
      throw new Error('[TaskService] Task title is required.');
    }

    if (!input.due_at) {
      throw new Error('[TaskService] Task due_at timestamp is required.');
    }

    if (isSupabaseConfigured && isUUID(organizationId)) {
      try {
        const insertPayload: Record<string, unknown> = {
          organization_id: organizationId,
          load_id: isUUID(input.load_id) ? input.load_id : null,
          load_number: input.load_number || null,
          category: input.category,
          title: input.title.trim(),
          description: input.description?.trim() || null,
          priority: input.priority || 'normal',
          status: 'pending',
          due_at: input.due_at,
          timezone_context: input.timezone_context || 'America/Chicago',
          reminder_offset_minutes: input.reminder_offset_minutes ?? 15,
          snoozed_until: null,
          assigned_to_user_id: isUUID(input.assigned_to_user_id) ? input.assigned_to_user_id : null,
          assigned_to_name: input.assigned_to_name || null,
          created_by_user_id: isUUID(input.created_by_user_id) ? input.created_by_user_id : null,
          created_by_name: input.created_by_name || 'Dispatcher',
          trigger_source: input.trigger_source || 'manual',
          reference_entity_id: input.reference_entity_id || null,
          deduplication_key: input.deduplication_key || null,
        };

        const { data, error } = await (supabase.from('tasks' as any) as any)
          .insert(insertPayload)
          .select()
          .single();

        if (!error && data) {
          const createdTask = (data as unknown) as DispatcherTask;
          // Synchronize local cache
          const tasks = this.loadTasksFromStorage(organizationId);
          this.saveTasksToStorage(organizationId, [createdTask, ...tasks.filter((t) => t.id !== createdTask.id)]);

          this.logActivityAsync(
            organizationId,
            createdTask.load_id,
            `Task Created: ${createdTask.title}`,
            `Task assigned to ${createdTask.assigned_to_name || 'Unassigned'}. Due: ${createdTask.due_at}`,
            createdTask.created_by_name,
            createdTask.created_by_user_id || 'usr-dispatcher',
            { taskId: createdTask.id, category: createdTask.category, priority: createdTask.priority }
          );

          return createdTask;
        }
      } catch (err) {
        console.warn('Supabase createTask failed, saving locally:', err);
      }
    }

    const now = new Date().toISOString();
    const newTask: DispatcherTask = {
      id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      organization_id: organizationId,
      load_id: input.load_id || null,
      load_number: input.load_number || null,
      category: input.category,
      title: input.title.trim(),
      description: input.description?.trim() || '',
      priority: input.priority || 'normal',
      status: 'pending',
      due_at: input.due_at,
      timezone_context: input.timezone_context || 'America/Chicago',
      reminder_offset_minutes: input.reminder_offset_minutes ?? 15,
      snoozed_until: null,
      assigned_to_user_id: input.assigned_to_user_id || null,
      assigned_to_name: input.assigned_to_name || null,
      created_by_user_id: input.created_by_user_id || 'usr-dispatcher',
      created_by_name: input.created_by_name || 'Dispatcher',
      trigger_source: input.trigger_source || 'manual',
      reference_entity_id: input.reference_entity_id || null,
      deduplication_key: input.deduplication_key || null,
      completed_at: null,
      completed_by_user_id: null,
      completed_by_name: null,
      completion_notes: null,
      created_at: now,
      updated_at: now,
    };

    const tasks = this.loadTasksFromStorage(organizationId);
    tasks.unshift(newTask);
    this.saveTasksToStorage(organizationId, tasks);

    // Non-blocking activity audit event
    this.logActivityAsync(
      organizationId,
      newTask.load_id,
      `Task Created: ${newTask.title}`,
      `Task assigned to ${newTask.assigned_to_name || 'Unassigned'}. Due: ${newTask.due_at}`,
      newTask.created_by_name,
      newTask.created_by_user_id,
      { taskId: newTask.id, category: newTask.category, priority: newTask.priority }
    );

    return newTask;
  }

  /**
   * Update an existing task.
   */
  async updateTask(
    organizationId: string,
    taskId: string,
    input: UpdateTaskInput,
    userRole?: UserRole | null
  ): Promise<DispatcherTask> {
    this.assertCanMutate(userRole);

    if (!organizationId || !taskId) {
      throw new Error('[TaskService] organizationId and taskId are required.');
    }

    if (isSupabaseConfigured && isUUID(organizationId) && isUUID(taskId)) {
      try {
        const updatePayload: Record<string, unknown> = {
          updated_at: new Date().toISOString(),
        };

        if (input.load_id !== undefined) updatePayload.load_id = isUUID(input.load_id) ? input.load_id : null;
        if (input.load_number !== undefined) updatePayload.load_number = input.load_number || null;
        if (input.category !== undefined) updatePayload.category = input.category;
        if (input.title !== undefined) updatePayload.title = input.title.trim();
        if (input.description !== undefined) updatePayload.description = input.description.trim();
        if (input.priority !== undefined) updatePayload.priority = input.priority;
        if (input.status !== undefined) updatePayload.status = input.status;
        if (input.due_at !== undefined) updatePayload.due_at = input.due_at;
        if (input.timezone_context !== undefined) updatePayload.timezone_context = input.timezone_context;
        if (input.reminder_offset_minutes !== undefined) updatePayload.reminder_offset_minutes = input.reminder_offset_minutes;
        if (input.assigned_to_user_id !== undefined) updatePayload.assigned_to_user_id = isUUID(input.assigned_to_user_id) ? input.assigned_to_user_id : null;
        if (input.assigned_to_name !== undefined) updatePayload.assigned_to_name = input.assigned_to_name || null;
        if (input.deduplication_key !== undefined) updatePayload.deduplication_key = input.deduplication_key || null;

        const { data, error } = await (supabase.from('tasks' as any) as any)
          .update(updatePayload)
          .eq('id', taskId)
          .eq('organization_id', organizationId)
          .select()
          .single();

        if (!error && data) {
          const updatedTask = (data as unknown) as DispatcherTask;
          const tasks = this.loadTasksFromStorage(organizationId);
          const index = tasks.findIndex((t) => t.id === taskId);
          if (index !== -1) {
            tasks[index] = updatedTask;
            this.saveTasksToStorage(organizationId, tasks);
          }
          return updatedTask;
        }
      } catch (err) {
        console.warn('Supabase updateTask failed, saving locally:', err);
      }
    }

    const tasks = this.loadTasksFromStorage(organizationId);
    const index = tasks.findIndex((t) => t.id === taskId);
    if (index === -1) {
      throw new Error(`[TaskService] Task not found with ID: ${taskId}`);
    }

    const current = tasks[index];
    const now = new Date().toISOString();

    const updated: DispatcherTask = {
      ...current,
      load_id: input.load_id !== undefined ? input.load_id : current.load_id,
      load_number: input.load_number !== undefined ? input.load_number : current.load_number,
      category: input.category || current.category,
      title: input.title !== undefined ? input.title.trim() : current.title,
      description: input.description !== undefined ? input.description.trim() : current.description,
      priority: input.priority || current.priority,
      status: input.status || current.status,
      due_at: input.due_at || current.due_at,
      timezone_context: input.timezone_context || current.timezone_context,
      reminder_offset_minutes:
        input.reminder_offset_minutes !== undefined
          ? input.reminder_offset_minutes
          : current.reminder_offset_minutes,
      assigned_to_user_id:
        input.assigned_to_user_id !== undefined
          ? input.assigned_to_user_id
          : current.assigned_to_user_id,
      assigned_to_name:
        input.assigned_to_name !== undefined ? input.assigned_to_name : current.assigned_to_name,
      deduplication_key:
        input.deduplication_key !== undefined
          ? input.deduplication_key
          : current.deduplication_key,
      updated_at: now,
    };

    tasks[index] = updated;
    this.saveTasksToStorage(organizationId, tasks);

    return updated;
  }

  /**
   * Mark a task as completed with audit trail metadata.
   */
  async completeTask(
    organizationId: string,
    taskId: string,
    input?: CompleteTaskInput,
    userRole?: UserRole | null
  ): Promise<DispatcherTask> {
    this.assertCanMutate(userRole);

    if (!organizationId || !taskId) {
      throw new Error('[TaskService] organizationId and taskId are required.');
    }

    const now = new Date().toISOString();

    if (isSupabaseConfigured && isUUID(organizationId) && isUUID(taskId)) {
      try {
        const updatePayload: Record<string, unknown> = {
          status: 'completed',
          snoozed_until: null,
          completed_at: now,
          completed_by_user_id: isUUID(input?.completed_by_user_id) ? input?.completed_by_user_id : null,
          completed_by_name: input?.completed_by_name || 'Dispatcher',
          completion_notes: input?.completion_notes?.trim() || null,
          updated_at: now,
        };

        const { data, error } = await (supabase.from('tasks' as any) as any)
          .update(updatePayload)
          .eq('id', taskId)
          .eq('organization_id', organizationId)
          .select()
          .single();

        if (!error && data) {
          const completed = (data as unknown) as DispatcherTask;
          const tasks = this.loadTasksFromStorage(organizationId);
          const index = tasks.findIndex((t) => t.id === taskId);
          if (index !== -1) {
            tasks[index] = completed;
            this.saveTasksToStorage(organizationId, tasks);
          }

          this.logActivityAsync(
            organizationId,
            completed.load_id,
            `Task Completed: ${completed.title}`,
            completed.completion_notes || `Task marked completed by ${completed.completed_by_name}.`,
            completed.completed_by_name || 'Dispatcher',
            completed.completed_by_user_id || 'usr-dispatcher',
            { taskId: completed.id, completedAt: now }
          );

          return completed;
        }
      } catch (err) {
        console.warn('Supabase completeTask failed, saving locally:', err);
      }
    }

    const tasks = this.loadTasksFromStorage(organizationId);
    const index = tasks.findIndex((t) => t.id === taskId);
    if (index === -1) {
      throw new Error(`[TaskService] Task not found with ID: ${taskId}`);
    }

    const current = tasks[index];

    const completed: DispatcherTask = {
      ...current,
      status: 'completed',
      snoozed_until: null,
      completed_at: now,
      completed_by_user_id: input?.completed_by_user_id || 'usr-dispatcher',
      completed_by_name: input?.completed_by_name || 'Dispatcher',
      completion_notes: input?.completion_notes?.trim() || null,
      updated_at: now,
    };

    tasks[index] = completed;
    this.saveTasksToStorage(organizationId, tasks);

    // Non-blocking activity audit event
    this.logActivityAsync(
      organizationId,
      completed.load_id,
      `Task Completed: ${completed.title}`,
      completed.completion_notes || `Task marked completed by ${completed.completed_by_name}.`,
      completed.completed_by_name || 'Dispatcher',
      completed.completed_by_user_id || 'usr-dispatcher',
      { taskId: completed.id, completedAt: now }
    );

    return completed;
  }

  /**
   * Snooze a task to a future timestamp.
   */
  async snoozeTask(
    organizationId: string,
    taskId: string,
    input: SnoozeTaskInput,
    userRole?: UserRole | null
  ): Promise<DispatcherTask> {
    this.assertCanMutate(userRole);

    if (!organizationId || !taskId) {
      throw new Error('[TaskService] organizationId and taskId are required.');
    }

    const now = new Date().toISOString();

    if (isSupabaseConfigured && isUUID(organizationId) && isUUID(taskId)) {
      try {
        const updatePayload: Record<string, unknown> = {
          status: 'snoozed',
          snoozed_until: input.snoozed_until,
          updated_at: now,
        };

        const { data, error } = await (supabase.from('tasks' as any) as any)
          .update(updatePayload)
          .eq('id', taskId)
          .eq('organization_id', organizationId)
          .select()
          .single();

        if (!error && data) {
          const snoozed = (data as unknown) as DispatcherTask;
          const tasks = this.loadTasksFromStorage(organizationId);
          const index = tasks.findIndex((t) => t.id === taskId);
          if (index !== -1) {
            tasks[index] = snoozed;
            this.saveTasksToStorage(organizationId, tasks);
          }

          this.logActivityAsync(
            organizationId,
            snoozed.load_id,
            `Task Snoozed: ${snoozed.title}`,
            `Snoozed until ${snoozed.snoozed_until}${input.snooze_reason ? `. Reason: ${input.snooze_reason}` : ''}`,
            input.snoozed_by_name || 'Dispatcher',
            input.snoozed_by_user_id || 'usr-dispatcher',
            { taskId: snoozed.id, snoozedUntil: input.snoozed_until, preset: input.snooze_preset }
          );

          return snoozed;
        }
      } catch (err) {
        console.warn('Supabase snoozeTask failed, saving locally:', err);
      }
    }

    const tasks = this.loadTasksFromStorage(organizationId);
    const index = tasks.findIndex((t) => t.id === taskId);
    if (index === -1) {
      throw new Error(`[TaskService] Task not found with ID: ${taskId}`);
    }

    const current = tasks[index];

    const snoozed: DispatcherTask = {
      ...current,
      status: 'snoozed',
      snoozed_until: input.snoozed_until,
      updated_at: now,
    };

    tasks[index] = snoozed;
    this.saveTasksToStorage(organizationId, tasks);

    // Non-blocking activity audit event
    this.logActivityAsync(
      organizationId,
      snoozed.load_id,
      `Task Snoozed: ${snoozed.title}`,
      `Snoozed until ${snoozed.snoozed_until}${input.snooze_reason ? `. Reason: ${input.snooze_reason}` : ''}`,
      input.snoozed_by_name || 'Dispatcher',
      input.snoozed_by_user_id || 'usr-dispatcher',
      { taskId: snoozed.id, snoozedUntil: input.snoozed_until, preset: input.snooze_preset }
    );

    return snoozed;
  }

  /**
   * Reassign a task to another team member or dispatcher.
   */
  async reassignTask(
    organizationId: string,
    taskId: string,
    assignedToUserId: string | null,
    assignedToName: string | null,
    actorName: string = 'Dispatcher',
    actorId: string = 'usr-dispatcher',
    userRole?: UserRole | null
  ): Promise<DispatcherTask> {
    this.assertCanMutate(userRole);

    if (!organizationId || !taskId) {
      throw new Error('[TaskService] organizationId and taskId are required.');
    }

    const now = new Date().toISOString();

    if (isSupabaseConfigured && isUUID(organizationId) && isUUID(taskId)) {
      try {
        const updatePayload: Record<string, unknown> = {
          assigned_to_user_id: isUUID(assignedToUserId) ? assignedToUserId : null,
          assigned_to_name: assignedToName || null,
          updated_at: now,
        };

        const { data, error } = await (supabase.from('tasks' as any) as any)
          .update(updatePayload)
          .eq('id', taskId)
          .eq('organization_id', organizationId)
          .select()
          .single();

        if (!error && data) {
          const updated = (data as unknown) as DispatcherTask;
          const tasks = this.loadTasksFromStorage(organizationId);
          const index = tasks.findIndex((t) => t.id === taskId);
          const previousAssignee = index !== -1 ? tasks[index].assigned_to_name || 'Unassigned' : 'Unassigned';
          if (index !== -1) {
            tasks[index] = updated;
            this.saveTasksToStorage(organizationId, tasks);
          }

          this.logActivityAsync(
            organizationId,
            updated.load_id,
            `Task Reassigned: ${updated.title}`,
            `Reassigned from ${previousAssignee} to ${assignedToName || 'Unassigned'}`,
            actorName,
            actorId,
            { taskId: updated.id, previousAssignee, newAssignee: assignedToName }
          );

          return updated;
        }
      } catch (err) {
        console.warn('Supabase reassignTask failed, saving locally:', err);
      }
    }

    const tasks = this.loadTasksFromStorage(organizationId);
    const index = tasks.findIndex((t) => t.id === taskId);
    if (index === -1) {
      throw new Error(`[TaskService] Task not found with ID: ${taskId}`);
    }

    const current = tasks[index];
    const previousAssignee = current.assigned_to_name || 'Unassigned';

    const updated: DispatcherTask = {
      ...current,
      assigned_to_user_id: assignedToUserId,
      assigned_to_name: assignedToName,
      updated_at: now,
    };

    tasks[index] = updated;
    this.saveTasksToStorage(organizationId, tasks);

    // Non-blocking activity audit event
    this.logActivityAsync(
      organizationId,
      updated.load_id,
      `Task Reassigned: ${updated.title}`,
      `Reassigned from ${previousAssignee} to ${assignedToName || 'Unassigned'}`,
      actorName,
      actorId,
      { taskId: updated.id, previousAssignee, newAssignee: assignedToName }
    );

    return updated;
  }

  /**
   * Cancel a task.
   */
  async cancelTask(
    organizationId: string,
    taskId: string,
    reason?: string,
    actorName: string = 'Dispatcher',
    actorId: string = 'usr-dispatcher',
    userRole?: UserRole | null
  ): Promise<DispatcherTask> {
    this.assertCanMutate(userRole);

    if (!organizationId || !taskId) {
      throw new Error('[TaskService] organizationId and taskId are required.');
    }

    const now = new Date().toISOString();

    if (isSupabaseConfigured && isUUID(organizationId) && isUUID(taskId)) {
      try {
        const updatePayload: Record<string, unknown> = {
          status: 'cancelled',
          completion_notes: reason || 'Cancelled by dispatcher',
          updated_at: now,
        };

        const { data, error } = await (supabase.from('tasks' as any) as any)
          .update(updatePayload)
          .eq('id', taskId)
          .eq('organization_id', organizationId)
          .select()
          .single();

        if (!error && data) {
          const cancelled = (data as unknown) as DispatcherTask;
          const tasks = this.loadTasksFromStorage(organizationId);
          const index = tasks.findIndex((t) => t.id === taskId);
          if (index !== -1) {
            tasks[index] = cancelled;
            this.saveTasksToStorage(organizationId, tasks);
          }

          this.logActivityAsync(
            organizationId,
            cancelled.load_id,
            `Task Cancelled: ${cancelled.title}`,
            reason ? `Reason: ${reason}` : `Cancelled by ${actorName}`,
            actorName,
            actorId,
            { taskId: cancelled.id, reason }
          );

          return cancelled;
        }
      } catch (err) {
        console.warn('Supabase cancelTask failed, saving locally:', err);
      }
    }

    const tasks = this.loadTasksFromStorage(organizationId);
    const index = tasks.findIndex((t) => t.id === taskId);
    if (index === -1) {
      throw new Error(`[TaskService] Task not found with ID: ${taskId}`);
    }

    const current = tasks[index];

    const cancelled: DispatcherTask = {
      ...current,
      status: 'cancelled',
      completion_notes: reason || 'Cancelled by dispatcher',
      updated_at: now,
    };

    tasks[index] = cancelled;
    this.saveTasksToStorage(organizationId, tasks);

    // Non-blocking activity audit event
    this.logActivityAsync(
      organizationId,
      cancelled.load_id,
      `Task Cancelled: ${cancelled.title}`,
      reason ? `Reason: ${reason}` : `Cancelled by ${actorName}`,
      actorName,
      actorId,
      { taskId: cancelled.id, reason }
    );

    return cancelled;
  }

  /**
   * Permanently delete a task (owner_admin only).
   */
  async deleteTask(
    organizationId: string,
    taskId: string,
    userRole?: UserRole | null
  ): Promise<boolean> {
    if (userRole !== 'owner_admin') {
      throw new Error('[TaskService RBAC] Only Owner/Admin can permanently delete task records.');
    }

    if (!organizationId || !taskId) return false;

    if (isSupabaseConfigured && isUUID(organizationId) && isUUID(taskId)) {
      try {
        await (supabase.from('tasks' as any) as any)
          .delete()
          .eq('id', taskId)
          .eq('organization_id', organizationId);
      } catch (err) {
        console.warn('Supabase deleteTask failed:', err);
      }
    }

    const tasks = this.loadTasksFromStorage(organizationId);
    const filtered = tasks.filter((t) => t.id !== taskId);
    if (filtered.length === tasks.length) {
      return false;
    }

    this.saveTasksToStorage(organizationId, filtered);
    return true;
  }

  /**
   * Retrieve tenant-scoped reminder rule configuration.
   */
  getReminderConfig(organizationId: string): ReminderRuleConfig {
    if (!organizationId) return { ...DEFAULT_REMINDER_RULE_CONFIG };
    const key = `${REMINDER_CONFIG_STORAGE_PREFIX}${organizationId.trim()}`;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return { ...DEFAULT_REMINDER_RULE_CONFIG };
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_REMINDER_RULE_CONFIG, ...parsed };
    } catch {
      return { ...DEFAULT_REMINDER_RULE_CONFIG };
    }
  }

  /**
   * Update tenant-scoped reminder rule configuration.
   */
  updateReminderConfig(
    organizationId: string,
    config: Partial<ReminderRuleConfig>,
    userRole?: UserRole | null
  ): ReminderRuleConfig {
    this.assertCanMutate(userRole);
    const key = `${REMINDER_CONFIG_STORAGE_PREFIX}${organizationId.trim()}`;
    const current = this.getReminderConfig(organizationId);
    const updated = { ...current, ...config };
    try {
      localStorage.setItem(key, JSON.stringify(updated));
    } catch (err) {
      console.error('[TaskService] Error saving reminder config:', err);
    }
    return updated;
  }

  /**
   * Phase 2D.5.4: Operational Auto-Reminder Engine
   * Evaluates tenant-scoped deterministic reminder rules:
   *  1. Stale Check-Calls for in-transit dispatches
   *  2. Active facility detention free-time expiration
   *  3. Delivered-load POD & critical document collection
   *  4. Unresolved check-call operational exceptions
   *  5. Approaching appointment windows (pickup/delivery)
   *
   * Deduplication Strategy:
   *  - Each generated reminder carries a unique deterministic `deduplication_key`.
   *  - Existing active tasks (pending, in_progress, snoozed) matching the key or the same
   *    load + category are preserved, preventing duplicate task generation across runs.
   *  - All generated tasks are tagged with trigger_source, created by 'sys-reminder-engine',
   *    and logged into activity trails without autonomous external comms sending.
   */
  async evaluateAndGenerateReminders(
    organizationId: string,
    userRole?: UserRole | null,
    customConfig?: Partial<ReminderRuleConfig>
  ): Promise<ReminderEvaluationResult> {
    if (!organizationId || typeof organizationId !== 'string' || organizationId.trim() === '') {
      throw new Error('[TaskService] organizationId is strictly required for reminder evaluation.');
    }

    const config: ReminderRuleConfig = {
      ...this.getReminderConfig(organizationId),
      ...customConfig,
    };

    const now = new Date();
    const nowMs = now.getTime();
    const nowIso = now.toISOString();

    // 1. Fetch domain state concurrently
    const [allLoads, allCheckCalls, allAccessorials, allDocuments] = await Promise.all([
      loadService.getLoads(organizationId),
      checkCallService.getCheckCalls(organizationId),
      accessorialService.getAccessorials(organizationId),
      documentService.listDocuments(organizationId),
    ]);

    const existingTasks = await this.getTasks(organizationId);

    // Set of active task deduplication keys and load+category pairs for fast check
    const activeTasks = existingTasks.filter(
      (t) => t.status === 'pending' || t.status === 'in_progress' || t.status === 'snoozed'
    );
    const existingDedupKeys = new Set<string>();
    const activeLoadCategoryPairs = new Set<string>();

    activeTasks.forEach((t) => {
      if (t.deduplication_key) {
        existingDedupKeys.add(t.deduplication_key);
      }
      if (t.load_id) {
        activeLoadCategoryPairs.add(`${t.load_id}_${t.category}`);
      }
    });

    const candidateTasks: CreateTaskInput[] = [];
    let staleCheckCallsCount = 0;
    let detentionExpiryCount = 0;
    let deliveredPodCollectionCount = 0;
    let appointmentWindowCount = 0;
    let unresolvedExceptionsCount = 0;
    let skippedExistingCount = 0;

    // Helper to evaluate and queue candidate if not deduplicated
    const queueCandidate = (
      input: CreateTaskInput,
      ruleTypeCounter: () => void
    ) => {
      ruleTypeCounter();
      if (input.deduplication_key && existingDedupKeys.has(input.deduplication_key)) {
        skippedExistingCount++;
        return;
      }
      if (input.load_id && activeLoadCategoryPairs.has(`${input.load_id}_${input.category}`)) {
        skippedExistingCount++;
        return;
      }
      // Register in local lookup to prevent duplicate candidates within the same run
      if (input.deduplication_key) existingDedupKeys.add(input.deduplication_key);
      if (input.load_id) activeLoadCategoryPairs.add(`${input.load_id}_${input.category}`);

      candidateTasks.push(input);
    };

    // ==========================================
    // Rule 1: Stale Check-Calls (In-Transit Loads)
    // ==========================================
    const inTransitLoads = allLoads.filter((l) => l.pipeline_status === 'in_transit');
    const staleThresholdMs = config.staleCheckCallThresholdHours * 3600 * 1000;

    inTransitLoads.forEach((load) => {
      const loadCalls = allCheckCalls.filter((c) => c.load_id === load.id);
      loadCalls.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      const latestCall = loadCalls[0];

      let msSinceLastCheck = 0;
      let referenceTimeStr = '';

      if (latestCall) {
        msSinceLastCheck = nowMs - new Date(latestCall.created_at).getTime();
        referenceTimeStr = latestCall.location_city ? ` (${latestCall.location_city}, ${latestCall.location_state || ''})` : '';
      } else {
        const baseTime = load.pickup_datetime ? new Date(load.pickup_datetime).getTime() : new Date(load.created_at).getTime();
        msSinceLastCheck = nowMs - baseTime;
      }

      if (msSinceLastCheck >= staleThresholdMs) {
        const hoursElapsed = Math.round((msSinceLastCheck / 3600000) * 10) / 10;
        const driverName = load.driver?.full_name || 'Assigned Driver';
        const dedupKey = `reminder_stale_checkcall_${load.id}`;

        queueCandidate(
          {
            load_id: load.id,
            load_number: load.load_number,
            category: 'check_call',
            title: `Routine Check-in Due: Load #${load.load_number} (${driverName})`,
            description: `In-transit dispatch has had no check-call recorded for ${hoursElapsed}h (threshold: ${config.staleCheckCallThresholdHours}h). Route: ${load.origin_city}, ${load.origin_state} ➔ ${load.dest_city}, ${load.dest_state}${referenceTimeStr}. Contact driver to record location and confirm delivery appointment.`,
            priority: hoursElapsed >= 8 ? 'urgent' : 'high',
            due_at: new Date(nowMs + 15 * 60 * 1000).toISOString(),
            timezone_context: 'America/Chicago',
            reminder_offset_minutes: 15,
            assigned_to_user_id: null,
            assigned_to_name: null,
            created_by_user_id: 'sys-reminder-engine',
            created_by_name: 'Operational Reminder Engine',
            trigger_source: 'system_rule',
            reference_entity_id: latestCall?.id || load.id,
            deduplication_key: dedupKey,
          },
          () => staleCheckCallsCount++
        );
      }
    });

    // ==========================================
    // Rule 2: Detention Free-Time Expiry
    // ==========================================
    const activeDetentions = allAccessorials.filter(
      (a) => a.type === 'detention' && (a.detention_details?.is_active_detention || (a.detention_details?.billable_hours && a.detention_details.billable_hours > 0) || a.status === 'draft')
    );

    activeDetentions.forEach((acc) => {
      const load = allLoads.find((l) => l.id === acc.load_id);
      if (!load) return;

      const freeTimeHours = acc.detention_details?.free_time_hours ?? 2.0;
      const arrivalTime = acc.detention_details?.arrival_time;
      const arrivalMs = arrivalTime ? new Date(arrivalTime).getTime() : nowMs - 2 * 3600000;
      const freeTimeEndMs = arrivalMs + freeTimeHours * 3600000;
      const leadMs = config.detentionWarningLeadMinutes * 60 * 1000;

      if (nowMs >= freeTimeEndMs - leadMs) {
        const isPastFreeTime = nowMs >= freeTimeEndMs;
        const billableHours = acc.detention_details?.billable_hours ?? (isPastFreeTime ? Math.max(0.25, Math.ceil(((nowMs - freeTimeEndMs) / 3600000) * 4) / 4) : 0);
        const facility = acc.detention_details?.facility_name || `${load.dest_city || 'Delivery'} Facility`;
        const driverName = load.driver?.full_name || 'Driver';
        const brokerName = load.broker?.company_name || acc.broker_name || 'Broker';
        const dedupKey = `reminder_detention_${load.id}_${acc.id}`;

        queueCandidate(
          {
            load_id: load.id,
            load_number: load.load_number,
            category: 'detention_warning',
            title: `Detention ${isPastFreeTime ? 'Accruing' : 'Approaching Expiry'}: Load #${load.load_number} at ${facility}`,
            description: `Driver ${driverName} has been at ${facility} since ${arrivalTime ? formatInTimezone(arrivalTime, 'America/Chicago', { includeDate: false, includeTime: true, includeTimezoneCode: true }) : 'arrival'}. 2-Hour free time ${isPastFreeTime ? `expired (${billableHours}h accrued billable detention)` : 'expires in <30 minutes'}. Alert ${brokerName} in writing and secure in/out stamps.`,
            priority: isPastFreeTime ? 'urgent' : 'high',
            due_at: new Date(nowMs + 15 * 60 * 1000).toISOString(),
            timezone_context: 'America/Chicago',
            reminder_offset_minutes: 15,
            created_by_user_id: 'sys-reminder-engine',
            created_by_name: 'Operational Reminder Engine',
            trigger_source: 'detention_clock',
            reference_entity_id: acc.id,
            deduplication_key: dedupKey,
          },
          () => detentionExpiryCount++
        );
      }
    });

    // ==========================================
    // Rule 3: Delivered-Load POD / Document Collection
    // ==========================================
    const deliveredLoads = allLoads.filter((l) => l.pipeline_status === 'delivered');

    deliveredLoads.forEach((load) => {
      const loadDocs = allDocuments.filter((d) => d.load_id === load.id);
      const hasVerifiedPod = loadDocs.some(
        (d) => d.doc_type === 'pod' && (d.doc_status === 'received' || d.doc_status === 'verified')
      );

      if (!hasVerifiedPod) {
        const driverName = load.driver?.full_name || 'Assigned Driver';
        const dedupKey = `reminder_delivered_pod_${load.id}`;

        queueCandidate(
          {
            load_id: load.id,
            load_number: load.load_number,
            category: 'document_collection',
            title: `Collect Signed POD: Load #${load.load_number} (${load.dest_city || 'Delivered'})`,
            description: `Load #${load.load_number} is marked delivered at ${load.dest_city}, ${load.dest_state}. Signed Proof of Delivery (POD) has not been uploaded. Contact driver ${driverName} for high-resolution document photo to unlock billing.`,
            priority: 'high',
            due_at: new Date(nowMs + 60 * 60 * 1000).toISOString(),
            timezone_context: 'America/Chicago',
            reminder_offset_minutes: 30,
            created_by_user_id: 'sys-reminder-engine',
            created_by_name: 'Operational Reminder Engine',
            trigger_source: 'document_alert',
            reference_entity_id: load.id,
            deduplication_key: dedupKey,
          },
          () => deliveredPodCollectionCount++
        );
      }
    });

    // ==========================================
    // Rule 4: Unresolved Check-Call Operational Exceptions
    // ==========================================
    const exceptionCalls = allCheckCalls.filter(
      (c) => c.status === 'delayed' || c.status === 'at_risk' || c.call_type === 'breakdown' || c.call_type === 'delay'
    );

    exceptionCalls.forEach((call) => {
      const load = allLoads.find((l) => l.id === call.load_id);
      if (!load) return;
      if (load.pipeline_status === 'delivered' || load.pipeline_status === 'invoiced' || load.pipeline_status === 'paid') return;

      const callTypeLabel = call.call_type === 'breakdown' ? 'Breakdown' : 'Delay';
      const dedupKey = `reminder_exception_${call.id}`;

      queueCandidate(
        {
          load_id: load.id,
          load_number: load.load_number,
          category: 'check_call',
          title: `Exception Follow-up: Load #${load.load_number} (${callTypeLabel})`,
          description: `Operational exception logged in ${call.location_city || 'transit'}: "${call.notes || call.status}". Verify truck repair/traffic status, update broker with revised ETA, and document delay reason.`,
          priority: 'urgent',
          due_at: new Date(nowMs + 20 * 60 * 1000).toISOString(),
          timezone_context: 'America/Chicago',
          reminder_offset_minutes: 15,
          created_by_user_id: 'sys-reminder-engine',
          created_by_name: 'Operational Reminder Engine',
          trigger_source: 'check_call_exception',
          reference_entity_id: call.id,
          deduplication_key: dedupKey,
        },
        () => unresolvedExceptionsCount++
      );
    });

    // ==========================================
    // Rule 5: Approaching Appointment Windows
    // ==========================================
    const appointmentLeadMs = config.appointmentLeadHours * 3600 * 1000;
    const activeDispatches = allLoads.filter(
      (l) => l.pipeline_status === 'booked' || l.pipeline_status === 'in_transit'
    );

    activeDispatches.forEach((load) => {
      if (load.pickup_datetime && load.pipeline_status === 'booked') {
        const pickupMs = new Date(load.pickup_datetime).getTime();
        const diffMs = pickupMs - nowMs;
        if (diffMs > 0 && diffMs <= appointmentLeadMs) {
          const dedupKey = `reminder_appt_pickup_${load.id}`;
          const mins = Math.round(diffMs / 60000);

          queueCandidate(
            {
              load_id: load.id,
              load_number: load.load_number,
              category: 'appointment_scheduling',
              title: `Pickup Window in ${mins}m: Load #${load.load_number}`,
              description: `Pickup appointment scheduled at ${load.origin_city}, ${load.origin_state} in ${mins} minutes. Confirm driver ${load.driver?.full_name || ''} has arrived on-site with clean trailer and pickup number.`,
              priority: 'high',
              due_at: new Date(pickupMs).toISOString(),
              timezone_context: 'America/Chicago',
              reminder_offset_minutes: 30,
              created_by_user_id: 'sys-reminder-engine',
              created_by_name: 'Operational Reminder Engine',
              trigger_source: 'system_rule',
              reference_entity_id: load.id,
              deduplication_key: dedupKey,
            },
            () => appointmentWindowCount++
          );
        }
      }

      if (load.delivery_datetime && load.pipeline_status === 'in_transit') {
        const deliveryMs = new Date(load.delivery_datetime).getTime();
        const diffMs = deliveryMs - nowMs;
        if (diffMs > 0 && diffMs <= appointmentLeadMs) {
          const dedupKey = `reminder_appt_delivery_${load.id}`;
          const mins = Math.round(diffMs / 60000);

          queueCandidate(
            {
              load_id: load.id,
              load_number: load.load_number,
              category: 'broker_update',
              title: `Delivery Window in ${mins}m: Load #${load.load_number}`,
              description: `Scheduled delivery at ${load.dest_city}, ${load.dest_state} in ${mins} minutes. Send arrival ETA to broker and prepare dock check-in.`,
              priority: 'normal',
              due_at: new Date(deliveryMs).toISOString(),
              timezone_context: 'America/Chicago',
              reminder_offset_minutes: 30,
              created_by_user_id: 'sys-reminder-engine',
              created_by_name: 'Operational Reminder Engine',
              trigger_source: 'system_rule',
              reference_entity_id: load.id,
              deduplication_key: dedupKey,
            },
            () => appointmentWindowCount++
          );
        }
      }
    });

    // Generate tasks via createTask for database and local persistence
    const generatedTasks: DispatcherTask[] = [];

    if (candidateTasks.length > 0) {
      for (const input of candidateTasks) {
        try {
          const created = await this.createTask(organizationId, input, userRole);
          generatedTasks.push(created);
        } catch (err) {
          console.warn('[TaskService] Failed to create auto-reminder task:', err);
        }
      }

      // Non-blocking audit log
      this.logActivityAsync(
        organizationId,
        null,
        `Auto-Reminder Engine Run: Generated ${generatedTasks.length} Reminder(s)`,
        `Evaluated ${allLoads.length} loads against operational rules. Generated ${generatedTasks.length} new tasks, preserved ${skippedExistingCount} existing active items.`,
        'Operational Reminder Engine',
        'sys-reminder-engine',
        {
          generatedCount: generatedTasks.length,
          skippedExistingCount,
          rules: {
            staleCheckCalls: staleCheckCallsCount,
            detentionExpiry: detentionExpiryCount,
            deliveredPodCollection: deliveredPodCollectionCount,
            appointmentWindow: appointmentWindowCount,
            unresolvedExceptions: unresolvedExceptionsCount,
          },
        }
      );
    }

    return {
      evaluatedLoadsCount: allLoads.length,
      generatedTasks,
      skippedExistingCount,
      timestamp: nowIso,
      rulesEvaluated: {
        staleCheckCalls: staleCheckCallsCount,
        detentionExpiry: detentionExpiryCount,
        deliveredPodCollection: deliveredPodCollectionCount,
        appointmentWindow: appointmentWindowCount,
        unresolvedExceptions: unresolvedExceptionsCount,
      },
    };
  }
}

export const taskService = new TaskService();
