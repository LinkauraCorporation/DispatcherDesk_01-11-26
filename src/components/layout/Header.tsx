import React, { useState, useEffect, useCallback } from 'react';
import {
  Menu,
  Building,
  Globe2,
  ChevronDown,
  LogOut,
  Clock,
  Bell,
  CheckSquare,
  Check,
  AlertTriangle,
  ArrowRight,
  Sparkles,
  LogIn,
  UserPlus,
  Plus,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext.tsx';
import { useTimezone } from '../../contexts/TimezoneContext.tsx';
import { SUPPORTED_TIMEZONES, formatDualTime } from '../../lib/timezones.ts';
import { StatusBadge } from '../common/StatusBadge.tsx';
import { NavModule } from './Sidebar.tsx';
import { taskService, getEffectiveDueAt, isTaskOverdue } from '../../modules/tasks/taskService.ts';
import { DispatcherTask, TaskStats } from '../../modules/tasks/taskTypes.ts';
import { formatRelativeDue } from '../../modules/tasks/taskUtils.ts';

interface HeaderProps {
  onToggleSidebar: () => void;
  onSelectModule?: (module: NavModule) => void;
  onOpenAuthModal?: () => void;
  onCreateOrgClick?: (isFirstOrg?: boolean) => void;
}

export const Header: React.FC<HeaderProps> = ({
  onToggleSidebar,
  onSelectModule,
  onOpenAuthModal,
  onCreateOrgClick,
}) => {
  const { user, profile, activeOrganization, userRole, memberships, setActiveOrganizationId, signOut } = useAuth();
  const { operationalTimezone, dispatcherTimezone, setOperationalTimezone, setDispatcherTimezone, liveOpsTime, liveDispatcherTime } = useTimezone();

  const [isOrgDropdownOpen, setIsOrgDropdownOpen] = useState(false);
  const [isTimezoneModalOpen, setIsTimezoneModalOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isTaskDropdownOpen, setIsTaskDropdownOpen] = useState(false);

  const [urgentTasks, setUrgentTasks] = useState<DispatcherTask[]>([]);
  const [taskStats, setTaskStats] = useState<TaskStats | null>(null);

  const orgId = activeOrganization?.id || '';
  const canMutate = userRole === 'owner_admin' || userRole === 'dispatcher';

  const actorName = profile?.full_name || user?.email?.split('@')[0] || (userRole === 'owner_admin' ? 'Owner / Admin' : 'Dispatcher');
  const actorId = user?.id || 'usr-alex-1';

  const fetchHeaderTasks = useCallback(async () => {
    if (!orgId) return;
    try {
      const [allTasks, stats] = await Promise.all([
        taskService.getTasks(orgId),
        taskService.getTaskStats(orgId),
      ]);
      setTaskStats(stats);

      // Filter to top urgent/overdue/due soon tasks (active ones)
      const now = new Date();
      const active = allTasks.filter((t) => t.status !== 'completed' && t.status !== 'cancelled');
      active.sort((a, b) => {
        const aOverdue = isTaskOverdue(a, now);
        const bOverdue = isTaskOverdue(b, now);
        if (aOverdue && !bOverdue) return -1;
        if (!aOverdue && bOverdue) return 1;
        return new Date(getEffectiveDueAt(a)).getTime() - new Date(getEffectiveDueAt(b)).getTime();
      });
      setUrgentTasks(active.slice(0, 6));
    } catch (err) {
      console.error('Error fetching header tasks:', err);
    }
  }, [orgId]);

  useEffect(() => {
    fetchHeaderTasks();
    const interval = setInterval(fetchHeaderTasks, 20000);
    return () => clearInterval(interval);
  }, [fetchHeaderTasks]);

  const handleQuickCompleteInHeader = async (taskId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!orgId || !canMutate) return;
    try {
      await taskService.completeTask(orgId, taskId, {
        completed_by_user_id: actorId,
        completed_by_name: actorName,
        completion_notes: 'Completed via Header Reminder popup',
      }, userRole);
      fetchHeaderTasks();
    } catch (err) {
      console.error('Error completing task from header:', err);
    }
  };

  const handleQuickSnoozeInHeader = async (taskId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!orgId || !canMutate) return;
    try {
      const snoozeTarget = new Date(Date.now() + 30 * 60 * 1000).toISOString();
      await taskService.snoozeTask(orgId, taskId, {
        snooze_preset: '30m',
        snoozed_until: snoozeTarget,
        snoozed_by_name: actorName,
        snoozed_by_user_id: actorId,
      }, userRole);
      fetchHeaderTasks();
    } catch (err) {
      console.error('Error snoozing task from header:', err);
    }
  };

  const opsTzObj = SUPPORTED_TIMEZONES.find((t) => t.id === operationalTimezone);
  const dispTzObj = SUPPORTED_TIMEZONES.find((t) => t.id === dispatcherTimezone);

  const overdueCount = taskStats?.overdueCount ?? 0;
  const activeCount = taskStats?.totalActive ?? 0;

  return (
    <header
      id="app-header"
      className="sticky top-0 z-30 h-16 bg-slate-900/95 backdrop-blur-md border-b border-slate-800/80 px-4 sm:px-6 flex items-center justify-between shrink-0"
    >
      {/* Left: Mobile Toggle & Active Organization */}
      <div className="flex items-center gap-3 sm:gap-4">
        <button
          id="mobile-sidebar-toggle"
          onClick={onToggleSidebar}
          className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg lg:hidden cursor-pointer"
          aria-label="Toggle Navigation"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Organization Switcher */}
        <div className="relative">
          <button
            id="org-switcher-btn"
            onClick={() => setIsOrgDropdownOpen(!isOrgDropdownOpen)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-800 border border-slate-700/80 text-left transition-colors cursor-pointer"
          >
            <div className="w-6 h-6 rounded bg-indigo-950 text-indigo-400 border border-indigo-800/50 flex items-center justify-center font-bold text-xs">
              <Building className="w-3.5 h-3.5" />
            </div>
            <div className="hidden sm:block">
              <span className="text-xs font-semibold text-slate-200 block truncate max-w-[140px] md:max-w-[200px]">
                {activeOrganization?.name || 'No Organization Selected'}
              </span>
              <span className="text-[10px] text-slate-400 block -mt-0.5">
                {activeOrganization?.mc_number ? `MC-${activeOrganization.mc_number}` : 'Fleet Dispatch Tenant'}
              </span>
            </div>
            <ChevronDown className="w-4 h-4 text-slate-400 ml-1" />
          </button>

          {isOrgDropdownOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setIsOrgDropdownOpen(false)}
              />
              <div className="absolute left-0 mt-2 w-64 rounded-xl bg-slate-900 border border-slate-800 shadow-xl z-50 p-2 space-y-1">
                <p className="px-3 py-1 text-[10px] uppercase font-semibold text-slate-400">
                  Select Organization (Tenant)
                </p>
                {memberships.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-slate-400">No organizations found</p>
                ) : (
                  memberships.map((m) => (
                    <button
                      key={m.organization.id}
                      onClick={() => {
                        setActiveOrganizationId(m.organization.id);
                        setIsOrgDropdownOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2 text-xs rounded-lg text-left cursor-pointer transition-colors ${
                        activeOrganization?.id === m.organization.id
                          ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30'
                          : 'text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      <div>
                        <p className="font-semibold">{m.organization.name}</p>
                        <p className="text-[10px] text-slate-400 capitalize">{m.role.replace('_', ' ')}</p>
                      </div>
                      {activeOrganization?.id === m.organization.id && (
                        <span className="w-2 h-2 rounded-full bg-indigo-400" />
                      )}
                    </button>
                  ))
                )}
                {onCreateOrgClick && (
                  <>
                    <div className="border-t border-slate-800 my-1" />
                    <button
                      id="create-new-org-btn"
                      type="button"
                      onClick={() => {
                        setIsOrgDropdownOpen(false);
                        onCreateOrgClick(false);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-indigo-400 hover:text-indigo-300 hover:bg-slate-800/80 rounded-lg text-left cursor-pointer transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5 shrink-0" />
                      <span>+ Create New Organization</span>
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Right: Live Dual Clocks, Reminder Bell, Role Badge, User Profile */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Live Clocks Display */}
        <div
          id="dual-clocks-container"
          onClick={() => setIsTimezoneModalOpen(!isTimezoneModalOpen)}
          className="hidden md:flex items-center gap-3 px-3 py-1.5 rounded-lg bg-slate-950/60 border border-slate-800 text-xs font-mono cursor-pointer hover:border-slate-700 transition-colors"
          title={`Ops: ${opsTzObj?.label || 'US CT'} • Local: ${dispTzObj?.label || 'IST'} (Click to customize)`}
        >
          {/* US Ops Zone */}
          <div className="flex items-center gap-1.5 text-slate-300">
            <Clock className="w-3.5 h-3.5 text-indigo-400" />
            <span className="text-slate-200 font-semibold">{liveOpsTime || '10:00 AM'}</span>
          </div>

          <span className="text-slate-700">|</span>

          {/* Dispatcher Local Zone */}
          <div className="flex items-center gap-1.5 text-slate-300">
            <span className="text-indigo-300 font-semibold">{liveDispatcherTime || '8:30 PM'}</span>
          </div>

          <Globe2 className="w-3.5 h-3.5 text-slate-400 ml-1" />
        </div>

        {/* Global Task & Reminder Bell Button with Realtime Badge */}
        <div className="relative">
          <button
            id="header-tasks-bell-btn"
            onClick={() => {
              setIsTaskDropdownOpen(!isTaskDropdownOpen);
              fetchHeaderTasks();
            }}
            className={`relative p-2 rounded-lg border transition-all cursor-pointer ${
              overdueCount > 0
                ? 'bg-rose-950/30 border-rose-800/80 text-rose-300 hover:bg-rose-900/40'
                : activeCount > 0
                ? 'bg-slate-800/80 border-slate-700/80 text-slate-200 hover:bg-slate-800'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
            title="Operational Tasks & Reminders"
            aria-label="Tasks and Reminders"
          >
            <Bell className={`w-4 h-4 ${overdueCount > 0 ? 'text-rose-400 animate-bounce' : ''}`} />

            {/* Badges */}
            {overdueCount > 0 ? (
              <span className="absolute -top-1 -right-1 px-1.5 py-0.2 min-w-[18px] text-[10px] font-extrabold rounded-full bg-rose-600 text-white border border-slate-900 shadow-sm flex items-center justify-center">
                {overdueCount}
              </span>
            ) : activeCount > 0 ? (
              <span className="absolute -top-1 -right-1 px-1.5 py-0.2 min-w-[18px] text-[10px] font-bold rounded-full bg-indigo-600 text-white border border-slate-900 shadow-sm flex items-center justify-center">
                {activeCount}
              </span>
            ) : null}
          </button>

          {/* Reminder Center Dropdown Drawer */}
          {isTaskDropdownOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setIsTaskDropdownOpen(false)}
              />
              <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-xl bg-slate-900 border border-slate-800 shadow-2xl z-50 p-3 space-y-3">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <div className="flex items-center gap-2">
                    <CheckSquare className="w-4 h-4 text-indigo-400" />
                    <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wider">
                      Tasks & Reminders
                    </h3>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px]">
                    {overdueCount > 0 && (
                      <span className="px-1.5 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-800/60 font-bold">
                        {overdueCount} Overdue
                      </span>
                    )}
                    <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                      {activeCount} Active
                    </span>
                  </div>
                </div>

                {/* Urgent Task List */}
                <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
                  {urgentTasks.length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-400 space-y-1">
                      <p className="font-semibold text-slate-300">All Reminders Clear!</p>
                      <p className="text-[11px] text-slate-500">
                        No pending follow-ups or check-in alerts currently active.
                      </p>
                    </div>
                  ) : (
                    urgentTasks.map((task) => {
                      const rel = formatRelativeDue(task);
                      return (
                        <div
                          key={task.id}
                          className={`p-2.5 rounded-lg border text-xs space-y-1.5 transition-colors ${
                            rel.isOverdue
                              ? 'bg-rose-950/20 border-rose-800/60 hover:border-rose-700'
                              : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span
                              className={`px-1.5 py-0.2 rounded text-[9px] font-bold uppercase ${rel.bgClass} ${rel.colorClass} border ${rel.badgeBorder}`}
                            >
                              {rel.text}
                            </span>
                            {task.load_number && (
                              <span className="font-mono text-[10px] text-indigo-300 bg-slate-900 px-1.5 py-0.2 rounded border border-slate-800">
                                #{task.load_number}
                              </span>
                            )}
                          </div>

                          <p className="font-bold text-slate-200 line-clamp-1">{task.title}</p>

                          <div className="flex items-center justify-between pt-1 border-t border-slate-800/60 text-[11px]">
                            <span className="text-slate-400 truncate max-w-[130px]">
                              {task.assigned_to_name || 'Unassigned'}
                            </span>

                            {canMutate && (
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={(e) => handleQuickSnoozeInHeader(task.id, e)}
                                  className="px-2 py-0.5 text-[10px] font-semibold text-amber-300 hover:bg-amber-950/60 rounded border border-amber-800/40 cursor-pointer"
                                  title="Snooze 30 mins"
                                >
                                  +30m
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => handleQuickCompleteInHeader(task.id, e)}
                                  className="px-2 py-0.5 text-[10px] font-semibold text-emerald-300 hover:bg-emerald-950/60 rounded border border-emerald-800/40 cursor-pointer inline-flex items-center gap-0.5"
                                  title="Mark Complete"
                                >
                                  <Check className="w-3 h-3" />
                                  <span>Done</span>
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Footer Link to Full Tasks Workspace */}
                <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => {
                      setIsTaskDropdownOpen(false);
                      if (onSelectModule) onSelectModule('tasks');
                    }}
                    className="w-full py-1.5 text-xs font-bold text-indigo-300 hover:text-indigo-200 bg-indigo-950/70 hover:bg-indigo-900 border border-indigo-800/60 rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <span>Open Task Center ({activeCount})</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Timezone Config Dropdown */}
        {isTimezoneModalOpen && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setIsTimezoneModalOpen(false)}
            />
            <div className="absolute right-20 top-16 w-80 rounded-xl bg-slate-900 border border-slate-800 shadow-2xl z-50 p-4 space-y-4">
              <div>
                <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                  Operational Timezone
                </h4>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Used for shipper pickup & delivery appointments
                </p>
                <select
                  value={operationalTimezone}
                  onChange={(e) => setOperationalTimezone(e.target.value)}
                  className="mt-2 w-full px-3 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                >
                  {SUPPORTED_TIMEZONES.map((tz) => (
                    <option key={tz.id} value={tz.id}>
                      {tz.label} ({tz.code})
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-2 border-t border-slate-800">
                <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                  Dispatcher Local Timezone
                </h4>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Your physical location (e.g. India Standard Time)
                </p>
                <select
                  value={dispatcherTimezone}
                  onChange={(e) => setDispatcherTimezone(e.target.value)}
                  className="mt-2 w-full px-3 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                >
                  {SUPPORTED_TIMEZONES.map((tz) => (
                    <option key={tz.id} value={tz.id}>
                      {tz.label} ({tz.code})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </>
        )}

        {/* Role Badge */}
        {userRole && (
          <div className="hidden sm:block">
            <StatusBadge status={userRole} type="role" size="sm" />
          </div>
        )}

        {/* User Menu / Auth Controls */}
        {!user ? (
          <div className="flex items-center gap-2">
            <button
              id="header-login-btn"
              onClick={onOpenAuthModal}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors cursor-pointer"
            >
              <LogIn className="w-3.5 h-3.5 text-indigo-400" />
              <span>Log In</span>
            </button>
            <button
              id="header-signup-btn"
              onClick={onOpenAuthModal}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors cursor-pointer shadow-sm shadow-indigo-600/20"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Sign Up</span>
            </button>
          </div>
        ) : (
          <div className="relative">
            <button
              id="user-menu-btn"
              onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
              className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 text-white font-semibold text-xs flex items-center justify-center shadow-xs">
                {user.email?.charAt(0).toUpperCase() || 'U'}
              </div>
            </button>

            {isUserMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setIsUserMenuOpen(false)}
                />
                <div className="absolute right-0 mt-2 w-56 rounded-xl bg-slate-900 border border-slate-800 shadow-xl z-50 p-2 space-y-1">
                  <div className="px-3 py-2 border-b border-slate-800">
                    <p className="text-xs font-semibold text-slate-200 truncate">{user.email}</p>
                    <p className="text-[10px] text-indigo-400 capitalize mt-0.5">
                      {userRole?.replace('_', ' ') || 'Member'}
                    </p>
                  </div>

                  <button
                    id="header-signout-btn"
                    onClick={() => {
                      setIsUserMenuOpen(false);
                      signOut();
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-rose-300 hover:bg-rose-950/30 rounded-lg transition-colors cursor-pointer text-left"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Sign Out</span>
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </header>
  );
};

