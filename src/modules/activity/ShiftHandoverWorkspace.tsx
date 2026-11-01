import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext.tsx';
import { useTimezone } from '../../contexts/TimezoneContext.tsx';
import { formatDualTime, formatInTimezone } from '../../lib/timezones.ts';
import { formatCurrency, formatMiles } from '../../lib/calculations.ts';
import { loadService } from '../loads/loadService.ts';
import { checkCallService } from '../checkcalls/checkCallService.ts';
import { documentService } from '../documents/documentService.ts';
import { activityService } from './activityService.ts';
import { accessorialService, calculateDetention } from '../accessorials/accessorialService.ts';
import { AccessorialWithLoad } from '../accessorials/accessorialTypes.ts';
import { LoadWithRelations } from '../loads/loadTypes.ts';
import { TrackingStats, CheckCallWithRelations } from '../checkcalls/checkCallTypes.ts';
import { DocumentStats, LoadDocumentSummary } from '../documents/documentTypes.ts';
import { LoadActivityEvent } from './activityTypes.ts';
import { taskService } from '../tasks/taskService.ts';
import {
  DispatcherTask,
  TaskStats,
  TASK_CATEGORY_CONFIG,
  TASK_PRIORITY_CONFIG,
} from '../tasks/taskTypes.ts';
import { TEAM_MEMBERS, formatRelativeDue } from '../tasks/taskUtils.ts';
import { TaskModal } from '../tasks/TaskModal.tsx';
import { StatusBadge } from '../../components/common/StatusBadge.tsx';
import { ContextualCopilotModal } from '../ai/ContextualCopilotModal.tsx';
import { pdfService } from '../../lib/pdf/pdfService.ts';
import {
  ClipboardCopy,
  Check,
  RefreshCw,
  Clock,
  AlertTriangle,
  FileWarning,
  Calendar,
  Truck,
  Building2,
  User,
  Radio,
  FileText,
  MessageSquare,
  Sparkles,
  ArrowRight,
  ShieldAlert,
  CheckCircle2,
  FileCheck,
  Download,
  Share2,
  CheckSquare,
  UserCheck,
  Plus,
  Bell,
} from 'lucide-react';

interface ShiftHandoverWorkspaceProps {
  onOpenLoadDetail?: (load: LoadWithRelations) => void;
}

export const ShiftHandoverWorkspace: React.FC<ShiftHandoverWorkspaceProps> = ({
  onOpenLoadDetail,
}) => {
  const { activeOrganization, userRole, profile, user } = useAuth();
  const { operationalTimezone, dispatcherTimezone } = useTimezone();

  const [isLoading, setIsLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [snapshotTimestamp, setSnapshotTimestamp] = useState<string>(new Date().toISOString());
  const [shiftName, setShiftName] = useState<string>('US Day Shift ➔ India Night Shift');
  const [isCopilotOpen, setIsCopilotOpen] = useState(false);

  // Aggregated Data State
  const [activeLoads, setActiveLoads] = useState<LoadWithRelations[]>([]);
  const [allLoads, setAllLoads] = useState<LoadWithRelations[]>([]);
  const [trackingStats, setTrackingStats] = useState<TrackingStats | null>(null);
  const [missingCheckInLoads, setMissingCheckInLoads] = useState<LoadWithRelations[]>([]);
  const [recentCheckCalls, setRecentCheckCalls] = useState<CheckCallWithRelations[]>([]);
  const [missingDocs, setMissingDocs] = useState<
    { load: LoadWithRelations; missingDocs: string[]; summary: LoadDocumentSummary }[]
  >([]);
  const [docStats, setDocStats] = useState<DocumentStats | null>(null);
  const [recentActivities, setRecentActivities] = useState<LoadActivityEvent[]>([]);
  const [accessorialClaims, setAccessorialClaims] = useState<AccessorialWithLoad[]>([]);
  const [openTasks, setOpenTasks] = useState<DispatcherTask[]>([]);
  const [taskStats, setTaskStats] = useState<TaskStats | null>(null);

  // Task Modal State
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [selectedTaskForEdit, setSelectedTaskForEdit] = useState<DispatcherTask | null>(null);

  const orgId = activeOrganization?.id || '';
  const canEdit = userRole === 'owner_admin' || userRole === 'dispatcher';

  const loadHandoverData = useCallback(async () => {
    if (!orgId) return;
    setIsLoading(true);

    try {
      const [
        loads,
        tStats,
        staleLoads,
        cCalls,
        mDocs,
        dStats,
        activities,
        claims,
        activeTasksList,
        tStatsData,
      ] = await Promise.all([
        loadService.getLoads(orgId),
        checkCallService.getTrackingStats(orgId),
        checkCallService.getLoadsMissingRecentCheckIn(orgId),
        checkCallService.getCheckCallsWithRelations(orgId),
        documentService.getMissingDocuments(orgId),
        documentService.getDocumentStats(orgId),
        activityService.getAllActivities(orgId),
        accessorialService.getAccessorials(orgId),
        taskService.getTasks(orgId, { status: 'active' }),
        taskService.getTaskStats(orgId),
      ]);

      setAllLoads(loads);
      const active = loads.filter(
        (l) => l.pipeline_status === 'booked' || l.pipeline_status === 'in_transit'
      );
      setActiveLoads(active);
      setTrackingStats(tStats);
      setMissingCheckInLoads(staleLoads);
      setRecentCheckCalls(cCalls.slice(0, 10));
      setMissingDocs(
        mDocs as unknown as {
          load: LoadWithRelations;
          missingDocs: string[];
          summary: LoadDocumentSummary;
        }[]
      );
      setDocStats(dStats);
      setRecentActivities(activities.slice(0, 12));
      setAccessorialClaims(claims);
      setOpenTasks(activeTasksList);
      setTaskStats(tStatsData);
      setSnapshotTimestamp(new Date().toISOString());
    } catch (err) {
      console.error('Error fetching shift handover data:', err);
    } finally {
      setIsLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    loadHandoverData();
  }, [loadHandoverData]);

  // Handlers for Task Operations
  const handleReassignTask = async (taskId: string, newUserId: string, newUserName: string) => {
    if (!orgId || !canEdit) return;
    const actorName = profile?.full_name || user?.email?.split('@')[0] || 'Dispatcher';
    const actorId = user?.id || 'usr-alex-1';

    try {
      const updated = await taskService.reassignTask(
        orgId,
        taskId,
        newUserId || null,
        newUserName || null,
        actorName,
        actorId
      );
      setOpenTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    } catch (err) {
      console.error('Error reassigning task:', err);
    }
  };

  const handleCompleteTask = async (taskId: string) => {
    if (!orgId || !canEdit) return;
    const actorName = profile?.full_name || user?.email?.split('@')[0] || 'Dispatcher';
    const actorId = user?.id || 'usr-alex-1';

    try {
      await taskService.completeTask(orgId, taskId, {
        completed_by_name: actorName,
        completed_by_user_id: actorId,
      });
      setOpenTasks((prev) => prev.filter((t) => t.id !== taskId));
      taskService.getTaskStats(orgId).then(setTaskStats).catch(() => {});
    } catch (err) {
      console.error('Error completing task:', err);
    }
  };

  // Operational Exceptions List (Delays, Breakdowns, Missing Check-Ins)
  const exceptionItems = useMemo(() => {
    const items: {
      type: 'breakdown' | 'delay' | 'missing_checkin' | 'at_risk';
      load: LoadWithRelations;
      message: string;
      details?: string | null;
    }[] = [];

    // Check recent check calls for delay/breakdown
    recentCheckCalls.forEach((cc) => {
      if (cc.call_type === 'breakdown' && cc.load) {
        items.push({
          type: 'breakdown',
          load: cc.load,
          message: `Mechanical Breakdown: ${cc.location_city || 'En Route'}, ${cc.location_state || ''}`,
          details: cc.notes,
        });
      } else if (cc.call_type === 'delay' && cc.load) {
        items.push({
          type: 'delay',
          load: cc.load,
          message: `Transit Delay: ${cc.location_city || 'En Route'}, ${cc.location_state || ''}`,
          details: cc.notes,
        });
      }
    });

    // Add loads missing check-ins
    missingCheckInLoads.forEach((l) => {
      items.push({
        type: 'missing_checkin',
        load: l,
        message: 'No Check-In Recorded in >24 Hours',
        details: `Current stage: ${l.pipeline_status.toUpperCase()} | Driver: ${l.driver?.full_name || 'Unassigned'}`,
      });
    });

    return items;
  }, [recentCheckCalls, missingCheckInLoads]);

  // Upcoming appointments (Next 48 Hours)
  const upcomingAppointments = useMemo(() => {
    const now = Date.now();
    const futureLimit = now + 48 * 3600000;
    const appointments: {
      type: 'pickup' | 'delivery';
      datetime: string;
      load: LoadWithRelations;
      location: string;
    }[] = [];

    activeLoads.forEach((l) => {
      if (l.pickup_datetime) {
        const pTime = new Date(l.pickup_datetime).getTime();
        if (pTime >= now - 4 * 3600000 && pTime <= futureLimit) {
          appointments.push({
            type: 'pickup',
            datetime: l.pickup_datetime,
            load: l,
            location: `${l.origin_city}, ${l.origin_state}`,
          });
        }
      }

      if (l.delivery_datetime) {
        const dTime = new Date(l.delivery_datetime).getTime();
        if (dTime >= now - 4 * 3600000 && dTime <= futureLimit) {
          appointments.push({
            type: 'delivery',
            datetime: l.delivery_datetime,
            load: l,
            location: `${l.dest_city}, ${l.dest_state}`,
          });
        }
      }
    });

    return appointments.sort(
      (a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime()
    );
  }, [activeLoads]);

  // Generate plain text report formatted for Slack / WhatsApp / Email
  const handoverPlainText = useMemo(() => {
    const dualSnapshot = formatDualTime(snapshotTimestamp, operationalTimezone, dispatcherTimezone);
    const orgName = activeOrganization?.name || 'DispatchDesk Fleet';
    const dispatcherName =
      profile?.full_name || user?.email?.split('@')[0] || (userRole === 'owner_admin' ? 'Owner / Admin' : 'Dispatcher');

    let text = `==================================================\n`;
    text += `DISPATCHDESK — OPERATIONAL SHIFT HANDOVER\n`;
    text += `==================================================\n`;
    text += `Organization: ${orgName}\n`;
    text += `Shift Transition: ${shiftName}\n`;
    text += `Snapshot Time: ${dualSnapshot.primary} (${dualSnapshot.secondary})\n`;
    text += `Generated By: ${dispatcherName}\n\n`;

    // 1. IN-FLIGHT ACTIVE FREIGHT
    text += `1. IN-FLIGHT ACTIVE FREIGHT (${activeLoads.length} Active Loads)\n`;
    text += `--------------------------------------------------\n`;
    if (activeLoads.length === 0) {
      text += `• No loads currently in transit or booked.\n\n`;
    } else {
      activeLoads.forEach((l, idx) => {
        const truckInfo = l.truck?.truck_number ? `Trk #${l.truck.truck_number}` : 'Unassigned';
        const driverInfo = l.driver?.full_name ? `Drv: ${l.driver.full_name}` : 'No Driver';
        const clientInfo = l.client?.company_name || 'Fleet';
        const brokerInfo = l.broker?.company_name || 'Direct';

        text += `${idx + 1}. [${l.load_number}] ${clientInfo} | ${truckInfo} (${driverInfo})\n`;
        text += `   Route: ${l.origin_city}, ${l.origin_state} ➔ ${l.dest_city}, ${l.dest_state}\n`;
        text += `   Stage: ${l.pipeline_status.toUpperCase()} | Rate: ${formatCurrency(l.rate)} (${formatMiles(l.loaded_miles)} mi)\n`;
        text += `   Broker: ${brokerInfo}\n`;
        if (l.pickup_datetime) {
          const puTime = formatInTimezone(l.pickup_datetime, operationalTimezone);
          text += `   PU: ${puTime}\n`;
        }
        if (l.delivery_datetime) {
          const delTime = formatInTimezone(l.delivery_datetime, operationalTimezone);
          text += `   DEL: ${delTime}\n`;
        }
        text += `\n`;
      });
    }

    // 2. OPERATIONAL EXCEPTIONS & ATTENTION
    text += `2. OPERATIONAL EXCEPTIONS & ATTENTION\n`;
    text += `--------------------------------------------------\n`;
    if (exceptionItems.length === 0) {
      text += `• All active loads on-time. No mechanical breakdowns or critical delays reported.\n\n`;
    } else {
      exceptionItems.forEach((item, idx) => {
        text += `• [ALERT] ${item.load.load_number}: ${item.message}\n`;
        if (item.details) text += `  Notes: ${item.details}\n`;
      });
      text += `\n`;
    }

    // 3. PAPERWORK & INVOICING READINESS
    text += `3. PAPERWORK & BILLING ACTION ITEMS\n`;
    text += `--------------------------------------------------\n`;
    if (missingDocs.length === 0) {
      text += `• All mandatory Rate Confirmations and PODs are up to date.\n\n`;
    } else {
      missingDocs.slice(0, 5).forEach((item) => {
        const missingLabels = item.missingDocs.map((d) => d.replace('_', ' ').toUpperCase()).join(', ');
        text += `• [${item.load.load_number}] (${item.load.pipeline_status.toUpperCase()}): Missing ${missingLabels}\n`;
      });
      if (missingDocs.length > 5) {
        text += `• ...and ${missingDocs.length - 5} more paperwork items pending.\n`;
      }
      text += `\n`;
    }

    // 4. ACTIVE DETENTION & ACCESSORIAL REVENUE
    text += `4. ACCESSORIAL & DETENTION REVENUE\n`;
    text += `--------------------------------------------------\n`;
    if (accessorialClaims.length === 0) {
      text += `• No accessorial or detention claims currently active.\n\n`;
    } else {
      const activeDets = accessorialClaims.filter((c) => {
        const isDet = c.type === 'detention';
        const isDepSet = Boolean(c.detention_details?.departure_time);
        return isDet && !isDepSet && c.status !== 'rejected' && c.status !== 'invoiced';
      });

      if (activeDets.length > 0) {
        text += `• ACTIVE DETENTION CLOCKS (URGENT ATTENTION):\n`;
        activeDets.forEach((c) => {
          const calc = c.detention_details
            ? calculateDetention({
                arrivalTime: c.detention_details.arrival_time,
                departureTime: c.detention_details.departure_time,
                freeTimeHours: c.detention_details.free_time_hours,
                hourlyRate: c.detention_details.hourly_rate,
              })
            : null;
          text += `  - [Load #${c.load?.load_number || 'N/A'}] ${c.detention_details?.facility_name || 'Facility'}: At dock ${calc?.formattedDuration || '2h+'}, Billable: +${calc?.billableHours.toFixed(2) || '0'} hrs (${formatCurrency(calc?.totalAmount || c.amount)})\n`;
        });
      }

      const pendingClaims = accessorialClaims.filter((c) => c.status === 'submitted_to_broker' || c.status === 'draft');
      if (pendingClaims.length > 0) {
        text += `• PENDING BROKER APPROVALS:\n`;
        pendingClaims.slice(0, 5).forEach((c) => {
          text += `  - [Load #${c.load?.load_number || 'N/A'}] ${c.type.toUpperCase()}: ${formatCurrency(c.amount)} (${c.description}) — Status: ${c.status}\n`;
        });
      }
      text += `\n`;
    }

    // 5. UPCOMING APPOINTMENTS (NEXT 24-48H)
    text += `5. UPCOMING APPOINTMENTS (NEXT 24-48 HOURS)\n`;
    text += `--------------------------------------------------\n`;
    if (upcomingAppointments.length === 0) {
      text += `• No scheduled pickups or deliveries in the next 48 hours.\n\n`;
    } else {
      upcomingAppointments.forEach((apt) => {
        const aptTime = formatInTimezone(apt.datetime, operationalTimezone);
        const typeLabel = apt.type === 'pickup' ? 'PICKUP' : 'DELIVERY';
        text += `• ${aptTime} [${typeLabel}]: ${apt.load.load_number} @ ${apt.location}\n`;
      });
      text += `\n`;
    }

    // 6. LATEST DISPATCHER NOTES
    text += `6. RECENT DISPATCHER NOTES & COLLABORATION\n`;
    text += `--------------------------------------------------\n`;
    const notesOnly = recentActivities.filter(
      (a) => a.type === 'dispatcher_note' || a.type === 'broker_update' || a.type === 'driver_update'
    );
    if (notesOnly.length === 0) {
      text += `• No dispatcher notes recorded in the past 24 hours.\n\n`;
    } else {
      notesOnly.slice(0, 5).forEach((note) => {
        text += `• [${note.actorName}]: ${note.title} — ${note.description}\n`;
      });
      text += `\n`;
    }

    // 7. OPEN OPERATIONAL TASKS & TRANSITION FOLLOW-UPS
    text += `7. OPEN TASKS & TRANSITION FOLLOW-UPS (${openTasks.length} Open, ${taskStats?.overdueCount || 0} Overdue)\n`;
    text += `--------------------------------------------------\n`;
    if (openTasks.length === 0) {
      text += `• All operational tasks and shift follow-ups completed. Clean desk handover.\n`;
    } else {
      openTasks.forEach((task, idx) => {
        const loadTag = task.load_number ? ` [Load #${task.load_number}]` : '';
        const assigneeTag = task.assigned_to_name ? ` (Assigned: ${task.assigned_to_name})` : ' (Unassigned)';
        const dueTime = formatInTimezone(task.due_at, operationalTimezone);
        text += `${idx + 1}. [${task.priority.toUpperCase()}]${loadTag} ${task.title}${assigneeTag}\n`;
        text += `   Due: ${dueTime} | Category: ${TASK_CATEGORY_CONFIG[task.category]?.shortLabel || task.category}\n`;
        if (task.description) {
          text += `   Notes: ${task.description}\n`;
        }
      });
    }

    text += `==================================================\n`;
    text += `End of Handover Snapshot\n`;

    return text;
  }, [
    snapshotTimestamp,
    operationalTimezone,
    dispatcherTimezone,
    activeOrganization,
    shiftName,
    profile,
    user,
    userRole,
    activeLoads,
    exceptionItems,
    missingDocs,
    accessorialClaims,
    upcomingAppointments,
    recentActivities,
    openTasks,
    taskStats,
  ]);

  const [isExportingPdf, setIsExportingPdf] = useState(false);

  const handleExportPdf = async () => {
    setIsExportingPdf(true);
    try {
      await pdfService.downloadShiftHandover({
        organization: activeOrganization,
        shiftName,
        snapshotTimestamp,
        dispatcherName: profile?.full_name || user?.email?.split('@')[0] || 'DispatcherDesk Lead',
        activeLoads,
        exceptions: exceptionItems.map((exc) => ({
          type: exc.type,
          load: exc.load,
          message: exc.message,
          details: exc.details,
        })),
        missingDocs: missingDocs.map((m) => ({
          load: m.load,
          missingDocs: m.missingDocs,
        })),
        accessorials: accessorialClaims,
        upcomingAppointments,
        recentActivities,
        openTasks,
        taskStats,
        operationalTimezone,
        dispatcherTimezone,
      });
    } catch (err) {
      console.error('Failed to export shift handover PDF:', err);
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(handoverPlainText);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch (e) {
      console.error('Failed to copy to clipboard:', e);
    }
  };

  const dualTimeSnapshot = formatDualTime(snapshotTimestamp, operationalTimezone, dispatcherTimezone);

  return (
    <div id="shift-handover-workspace" className="space-y-6">
      {/* Handover Action Toolbar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h2 className="text-base sm:text-lg font-bold text-slate-100 flex items-center gap-2">
              <Share2 className="w-5 h-5 text-indigo-400" />
              <span>Shift Handover Summary Workspace</span>
            </h2>
            <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-800/60">
              Live Aggregate
            </span>
          </div>
          <p className="text-xs text-slate-400">
            Synthesized operational snapshot of in-transit freight, check-calls, urgent exceptions, and paperwork blockers.
          </p>
          <div className="flex items-center gap-3 pt-1 text-[11px] text-slate-400 font-mono">
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-slate-500" />
              Snapshot: <strong className="text-slate-200">{dualTimeSnapshot.primary}</strong> ({dualTimeSnapshot.secondary})
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <select
            id="shift-selector"
            value={shiftName}
            onChange={(e) => setShiftName(e.target.value)}
            className="px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer"
          >
            <option value="US Day Shift ➔ India Night Shift">US Day ➔ India Night Shift</option>
            <option value="India Night Shift ➔ US Morning Day Shift">India Night ➔ US Morning Shift</option>
            <option value="Weekend Dispatch Handover">Weekend Dispatch Handover</option>
            <option value="Custom Operational Briefing">Custom Operational Briefing</option>
          </select>

          <button
            id="ai-handover-digest-btn"
            onClick={() => setIsCopilotOpen(true)}
            className="px-3.5 py-2 text-xs font-semibold text-violet-300 bg-violet-950/80 hover:bg-violet-900 border border-violet-800/60 rounded-lg transition-colors cursor-pointer inline-flex items-center gap-1.5 shadow-sm"
            title="Generate structured AI Handover Digest prioritizing active detention, missing check-ins, and paperwork blockers"
          >
            <Sparkles className="w-4 h-4 text-violet-400" />
            <span>Generate AI Digest</span>
          </button>

          <button
            id="refresh-handover-btn"
            onClick={loadHandoverData}
            disabled={isLoading}
            className="px-3 py-2 text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors cursor-pointer inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          <button
            id="copy-handover-btn"
            onClick={handleCopy}
            className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors cursor-pointer inline-flex items-center gap-1.5 shadow-sm"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 text-emerald-300" />
                <span>Copied to Clipboard!</span>
              </>
            ) : (
              <>
                <ClipboardCopy className="w-4 h-4" />
                <span>Copy Summary (Slack/WhatsApp)</span>
              </>
            )}
          </button>

          <button
            id="export-handover-pdf-btn"
            type="button"
            onClick={handleExportPdf}
            disabled={isExportingPdf}
            className="px-4 py-2 text-xs font-semibold text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors cursor-pointer inline-flex items-center gap-1.5 shadow-sm disabled:opacity-50"
            title="Download complete multi-page Shift Handover Report PDF"
          >
            <Download className={`w-4 h-4 ${isExportingPdf ? 'animate-bounce text-sky-300' : 'text-sky-400'}`} />
            <span>{isExportingPdf ? 'Generating PDF...' : 'Export Handover PDF'}</span>
          </button>
        </div>
      </div>

      {/* KPI Metric Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 sm:gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>In-Flight Freight</span>
            <Truck className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-2xl font-bold text-slate-100">{activeLoads.length}</div>
          <div className="text-[11px] text-slate-400">Booked & In-Transit</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Operational Alerts</span>
            <AlertTriangle className="w-4 h-4 text-amber-400" />
          </div>
          <div
            className={`text-2xl font-bold ${
              exceptionItems.length > 0 ? 'text-amber-400' : 'text-slate-100'
            }`}
          >
            {exceptionItems.length}
          </div>
          <div className="text-[11px] text-slate-400">Delays / Breakdowns / Stale</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Open Tasks</span>
            <CheckSquare className="w-4 h-4 text-sky-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-100">{openTasks.length}</span>
            {(taskStats?.overdueCount || 0) > 0 && (
              <span className="text-xs font-bold text-rose-400">
                ({taskStats?.overdueCount} Overdue)
              </span>
            )}
          </div>
          <div className="text-[11px] text-slate-400">Follow-ups & Reminders</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Missing Paperwork</span>
            <FileWarning className="w-4 h-4 text-rose-400" />
          </div>
          <div
            className={`text-2xl font-bold ${
              missingDocs.length > 0 ? 'text-rose-400' : 'text-slate-100'
            }`}
          >
            {missingDocs.length}
          </div>
          <div className="text-[11px] text-slate-400">Rate Cons & PODs required</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Appointments</span>
            <Calendar className="w-4 h-4 text-teal-400" />
          </div>
          <div className="text-2xl font-bold text-slate-100">{upcomingAppointments.length}</div>
          <div className="text-[11px] text-slate-400">Next 48h PU & DEL</div>
        </div>
      </div>

      {/* Main Grid: Live Drilldowns & Plaintext Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Side: Structured Operational Feeds (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Section 1: Open Tasks & Follow-ups (Handover Reassignments) */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckSquare className="w-4 h-4 text-sky-400" />
                <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                  Open Tasks & Follow-ups ({openTasks.length})
                </h3>
                {(taskStats?.overdueCount || 0) > 0 && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-rose-950/80 text-rose-300 border border-rose-800/60">
                    {taskStats?.overdueCount} Overdue
                  </span>
                )}
              </div>
              {canEdit && (
                <button
                  onClick={() => {
                    setSelectedTaskForEdit(null);
                    setIsTaskModalOpen(true);
                  }}
                  className="px-2.5 py-1 text-[11px] font-semibold text-sky-300 bg-sky-950/80 hover:bg-sky-900 border border-sky-800/60 rounded-md transition-colors cursor-pointer inline-flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>New Handover Task</span>
                </button>
              )}
            </div>

            {openTasks.length === 0 ? (
              <div className="p-3.5 rounded-lg bg-emerald-950/30 border border-emerald-800/40 flex items-center gap-2.5 text-xs text-emerald-300">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>All operational tasks cleared. No open transition blockers.</span>
              </div>
            ) : (
              <div className="space-y-2.5">
                {openTasks.map((task) => {
                  const rel = formatRelativeDue(task);
                  const catConfig = TASK_CATEGORY_CONFIG[task.category] || TASK_CATEGORY_CONFIG.general_operational;
                  const prioConfig = TASK_PRIORITY_CONFIG[task.priority] || TASK_PRIORITY_CONFIG.normal;
                  const taskLoad = task.load_id
                    ? allLoads.find((l) => l.id === task.load_id)
                    : null;

                  return (
                    <div
                      key={task.id}
                      className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 hover:border-slate-700 transition-all space-y-2.5 text-xs"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2.5 min-w-0">
                          {canEdit && (
                            <button
                              onClick={() => handleCompleteTask(task.id)}
                              className="mt-0.5 w-4 h-4 rounded border border-slate-600 hover:border-emerald-400 hover:bg-emerald-950/60 transition-colors flex items-center justify-center cursor-pointer shrink-0 text-transparent hover:text-emerald-300"
                              title="Mark task completed"
                            >
                              <Check className="w-3 h-3" />
                            </button>
                          )}
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-semibold text-slate-100">
                                {task.title}
                              </span>
                              {task.load_number && (
                                <button
                                  onClick={() => taskLoad && onOpenLoadDetail && onOpenLoadDetail(taskLoad)}
                                  className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-indigo-950/70 text-indigo-300 border border-indigo-800/60 hover:bg-indigo-900 cursor-pointer"
                                  title="Inspect load details"
                                >
                                  #{task.load_number}
                                </button>
                              )}
                            </div>
                            {task.description && (
                              <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-2">
                                {task.description}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <span
                            className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${prioConfig.badgeClass}`}
                          >
                            {prioConfig.label}
                          </span>
                          <span
                            className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${rel.bgClass} ${rel.colorClass} ${rel.badgeBorder}`}
                          >
                            {rel.shortText}
                          </span>
                        </div>
                      </div>

                      {/* Assignment & Operational Details Row */}
                      <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-800/60 text-[11px] text-slate-400">
                        <div className="flex items-center gap-1.5">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] border ${catConfig.bgColor} ${catConfig.color} ${catConfig.borderColor}`}>
                            {catConfig.shortLabel}
                          </span>
                          <span className="text-slate-500 font-mono">
                            Due {formatInTimezone(task.due_at, operationalTimezone)}
                          </span>
                        </div>

                        {/* Reassignment Dropdown during Shift Handover */}
                        <div className="flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                          {canEdit ? (
                            <select
                              value={task.assigned_to_user_id || ''}
                              onChange={(e) => {
                                const newId = e.target.value;
                                const member = TEAM_MEMBERS.find((m) => m.id === newId);
                                handleReassignTask(task.id, newId, member?.name || '');
                              }}
                              className="px-2 py-0.5 text-[11px] bg-slate-900 border border-slate-700/80 rounded text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer"
                              title="Reassign task to shift dispatcher"
                            >
                              <option value="">Unassigned</option>
                              {TEAM_MEMBERS.map((m) => (
                                <option key={m.id} value={m.id}>
                                  {m.shortName}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="text-slate-300">
                              {task.assigned_to_name || 'Unassigned'}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Section 2: Active In-Flight Freight */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                <Truck className="w-4 h-4 text-indigo-400" />
                <span>Active In-Flight Loads ({activeLoads.length})</span>
              </h3>
              <span className="text-[11px] text-slate-400">Click load to inspect details</span>
            </div>

            {activeLoads.length === 0 ? (
              <div className="p-4 rounded-lg bg-slate-950/60 border border-slate-800/80 text-center text-xs text-slate-400">
                No active booked or in-transit freight currently moving.
              </div>
            ) : (
              <div className="space-y-3">
                {activeLoads.map((load) => {
                  return (
                    <div
                      key={load.id}
                      onClick={() => onOpenLoadDetail && onOpenLoadDetail(load)}
                      className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 hover:border-indigo-500/60 transition-all cursor-pointer space-y-2 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-slate-100 text-sm">
                            {load.load_number}
                          </span>
                          <StatusBadge status={load.pipeline_status} type="pipeline" />
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                            {load.equipment_type.replace('_', ' ').toUpperCase()}
                          </span>
                        </div>
                        <span className="font-mono font-bold text-emerald-400">
                          {formatCurrency(load.rate)}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-slate-300">
                        <span>
                          {load.origin_city}, {load.origin_state}
                        </span>
                        <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
                        <span>
                          {load.dest_city}, {load.dest_state}
                        </span>
                        <span className="text-slate-500 font-mono">
                          ({formatMiles(load.loaded_miles)} mi)
                        </span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1 border-t border-slate-800/60 text-[11px] text-slate-400">
                        <div>
                          <span className="text-slate-500">Client: </span>
                          <span className="text-slate-300 font-medium">
                            {load.client?.company_name || 'Fleet'}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500">Truck / Drv: </span>
                          <span className="text-slate-300 font-medium">
                            {load.truck ? `#${load.truck.truck_number}` : 'No Trk'} /{' '}
                            {load.driver?.full_name?.split(' ')[0] || 'No Drv'}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500">Broker: </span>
                          <span className="text-slate-300 font-medium">
                            {load.broker?.company_name?.split(' ')[0] || 'Direct'}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Section 2: Operational Exceptions & Action Items */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 sm:p-5 space-y-4">
            <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <span>Operational Attention & Handover Flags</span>
            </h3>

            {exceptionItems.length === 0 ? (
              <div className="p-3.5 rounded-lg bg-emerald-950/30 border border-emerald-800/40 flex items-center gap-2.5 text-xs text-emerald-300">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>All active operations running smooth. Zero reported delays or mechanical breakdowns.</span>
              </div>
            ) : (
              <div className="space-y-2.5">
                {exceptionItems.map((item, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-lg bg-rose-950/40 border border-rose-800/60 space-y-1 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-rose-200 flex items-center gap-1.5">
                        <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
                        [{item.load.load_number}] {item.message}
                      </span>
                      <StatusBadge status={item.load.pipeline_status} type="pipeline" />
                    </div>
                    {item.details && (
                      <p className="text-rose-300/90 text-[11px] pl-5">{item.details}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section 3: Paperwork & Billing Readiness */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 sm:p-5 space-y-4">
            <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
              <FileCheck className="w-4 h-4 text-emerald-400" />
              <span>Paperwork Checklist & Invoicing Action Items</span>
            </h3>

            {missingDocs.length === 0 ? (
              <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 flex items-center gap-2.5 text-xs text-slate-400">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>All mandatory Rate Confirmations and PODs are attached.</span>
              </div>
            ) : (
              <div className="space-y-2 text-xs">
                {missingDocs.slice(0, 4).map((item) => (
                  <div
                    key={item.load.id}
                    className="p-3 rounded-lg bg-slate-950 border border-slate-800/80 flex items-center justify-between"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-slate-200">
                          {item.load.load_number}
                        </span>
                        <StatusBadge status={item.load.pipeline_status} type="pipeline" />
                      </div>
                      <p className="text-[11px] text-rose-400">
                        Missing: {item.missingDocs.map((d) => d.replace('_', ' ').toUpperCase()).join(', ')}
                      </p>
                    </div>
                    <button
                      onClick={() => onOpenLoadDetail && onOpenLoadDetail(item.load)}
                      className="px-2.5 py-1 text-[11px] font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded transition-colors cursor-pointer"
                    >
                      Audit
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Formatted Plaintext Export Box (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 sm:p-5 space-y-3 sticky top-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-indigo-400" />
                <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                  Handover Export Preview
                </h3>
              </div>
              <button
                id="copy-preview-btn"
                onClick={handleCopy}
                className="px-3 py-1 text-xs font-semibold text-indigo-300 hover:text-indigo-200 bg-indigo-950/80 hover:bg-indigo-900/80 border border-indigo-800/60 rounded-md transition-colors cursor-pointer inline-flex items-center gap-1"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <ClipboardCopy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied!' : 'Copy Text'}</span>
              </button>
            </div>

            <p className="text-[11px] text-slate-400">
              Instant plain-text output ready to paste into team Slack channels, WhatsApp dispatch groups, or shift transition emails.
            </p>

            <textarea
              readOnly
              value={handoverPlainText}
              rows={22}
              className="w-full p-3 font-mono text-[11px] bg-slate-950 border border-slate-800 rounded-lg text-slate-300 focus:outline-none select-all leading-relaxed"
            />
          </div>
        </div>
      </div>

      {/* Contextual AI Copilot Modal for Shift Handover */}
      <ContextualCopilotModal
        isOpen={isCopilotOpen}
        onClose={() => setIsCopilotOpen(false)}
        initialAction="shift_handover_digest"
        titleContext="Shift Handover Digest"
        onOpenLoadDetail={(loadIdentifier: string | LoadWithRelations) => {
          if (!onOpenLoadDetail) return;
          if (typeof loadIdentifier === 'string') {
            const found = activeLoads.find(
              (l) => l.id === loadIdentifier || l.load_number === loadIdentifier
            );
            if (found) {
              onOpenLoadDetail(found);
            }
          } else if (loadIdentifier) {
            onOpenLoadDetail(loadIdentifier);
          }
        }}
      />

      {/* Task Modal for creating/editing handover tasks */}
      <TaskModal
        isOpen={isTaskModalOpen}
        onClose={() => {
          setIsTaskModalOpen(false);
          setSelectedTaskForEdit(null);
        }}
        taskToEdit={selectedTaskForEdit}
        initialCategory="general_operational"
        initialPriority="normal"
        triggerSource="manual"
        onSuccess={(task, isEdit) => {
          setIsTaskModalOpen(false);
          setSelectedTaskForEdit(null);
          loadHandoverData();
        }}
      />
    </div>
  );
};
