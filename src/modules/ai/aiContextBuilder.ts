import {
  AIContext,
  AIContextLoad,
  AIContextCheckCall,
  AIContextAccessorial,
  AIContextDocument,
  AIContextActivity,
  AIContextTask,
  AIContextFinancials,
  AIUserRole,
} from './aiTypes.ts';
import { LoadWithRelations } from '../loads/loadTypes.ts';
import {
  CheckCall,
  isOperationalException,
  isDeliveryEtaDelayed,
  formatTimeSince,
} from '../checkcalls/checkCallTypes.ts';
import { AccessorialWithLoad } from '../accessorials/accessorialTypes.ts';
import { FreightDocument } from '../documents/documentTypes.ts';
import { LoadActivityEvent } from '../activity/activityTypes.ts';
import { taskService } from '../tasks/taskService.ts';
import { DispatcherTask, TASK_CATEGORY_CONFIG } from '../tasks/taskTypes.ts';
import { loadService } from '../loads/loadService.ts';
import { checkCallService, isLoadActiveForCheckInTracking } from '../checkcalls/checkCallService.ts';
import { accessorialService } from '../accessorials/accessorialService.ts';
import { documentService } from '../documents/documentService.ts';
import { activityService } from '../activity/activityService.ts';
import { profitabilityService } from '../profitability/profitabilityService.ts';
import {
  DEFAULT_OPERATIONAL_TIMEZONE,
  DEFAULT_DISPATCHER_TIMEZONE,
  formatDualTime,
  formatInTimezone,
  getCurrentTimeInZone,
} from '../../lib/timezones.ts';
import { calculateProfitability } from '../../lib/calculations.ts';

export interface BuildContextOptions {
  organizationId: string;
  userRole: AIUserRole;
  operationalTimezone?: string;
  dispatcherTimezone?: string;
  specificLoadId?: string;
  specificClaimId?: string;
  maxRecentItems?: number;
}

/**
 * Builds a compact, tenant-isolated, role-gated operational context
 * for ingestion by the AI Dispatch Copilot (Gemini or Local Fallback).
 */
export async function buildCopilotContext(options: BuildContextOptions): Promise<AIContext> {
  const {
    organizationId,
    userRole,
    operationalTimezone = DEFAULT_OPERATIONAL_TIMEZONE,
    dispatcherTimezone = DEFAULT_DISPATCHER_TIMEZONE,
    specificLoadId,
    specificClaimId,
    maxRecentItems = 15,
  } = options;

  if (!organizationId || !organizationId.trim()) {
    throw new Error('Organization ID is required to build AI Copilot context.');
  }

  // 1. Fetch domain records concurrently
  const [
    allLoads,
    allCheckCalls,
    allAccessorials,
    allDocuments,
    allActivities,
    allTasks,
    tStats,
  ]: [
    LoadWithRelations[],
    CheckCall[],
    AccessorialWithLoad[],
    FreightDocument[],
    LoadActivityEvent[],
    DispatcherTask[],
    any
  ] = await Promise.all([
    loadService.getLoads(organizationId),
    checkCallService.getCheckCalls(organizationId),
    accessorialService.getAccessorials(organizationId),
    documentService.listDocuments(organizationId),
    activityService.getAllActivities(organizationId),
    taskService.getTasks(organizationId, { status: 'active' }),
    taskService.getTaskStats(organizationId).catch(() => null),
  ]);

  // 2. Filter loads to relevant set (active + delivered/recent + target)
  const activeLoads: LoadWithRelations[] = allLoads.filter((l: LoadWithRelations) => {
    if (specificLoadId) return l.id === specificLoadId;
    return ['sourced', 'negotiating', 'booked', 'in_transit', 'delivered'].includes(l.pipeline_status);
  });

  // 3. Map compact Load contexts with deterministic field formatting
  const contextLoads: AIContextLoad[] = activeLoads.map((load: LoadWithRelations) => {
    const pickupFormatted = load.pickup_datetime
      ? formatDualTime(load.pickup_datetime, operationalTimezone, dispatcherTimezone).combined
      : 'Unscheduled';

    const deliveryFormatted = load.delivery_datetime
      ? formatDualTime(load.delivery_datetime, operationalTimezone, dispatcherTimezone).combined
      : 'Unscheduled';

    // Find active detention if any
    const loadAccessorials = allAccessorials.filter((a: AccessorialWithLoad) => a.load_id === load.id);
    const activeDet = loadAccessorials.find(
      (a: AccessorialWithLoad) => a.type === 'detention' && a.detention_details?.is_active_detention
    );
    const activeDetHours = activeDet?.detention_details?.billable_hours;

    // Canonical check call tracking & exception evaluation
    const loadCalls = allCheckCalls.filter((c: CheckCall) => c.load_id === load.id);
    const latestCall = loadCalls.length > 0 ? loadCalls[0] : null;
    const isTracked = isLoadActiveForCheckInTracking(load);
    let isMissingRecentCheckIn = false;

    if (isTracked) {
      if (!latestCall) {
        isMissingRecentCheckIn = true;
      } else {
        const lastUpdatedMs = new Date(latestCall.created_at).getTime();
        const twentyFourHoursAgoMs = Date.now() - 24 * 3600000;
        if (lastUpdatedMs < twentyFourHoursAgoMs) {
          isMissingRecentCheckIn = true;
        }
      }
    }

    const hasCheckCallException = latestCall
      ? isOperationalException(
          latestCall.call_type,
          latestCall.status,
          load.delivery_datetime,
          latestCall.eta_delivery
        )
      : false;
    const isAtRisk = hasCheckCallException || isMissingRecentCheckIn;

    // RBAC-gated financial string population
    let rateFormatted: string | undefined = undefined;
    let rpmFormatted: string | undefined = undefined;

    if (userRole === 'owner_admin') {
      rateFormatted = `$${load.rate.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      const prof = calculateProfitability({
        rate: Number(load.rate || 0),
        loadedMiles: Number(load.loaded_miles || 0),
        deadheadMiles: Number(load.deadhead_miles || 0),
        fuelExpense: Number(load.fuel_expense || 0),
        driverPay: Number(load.driver_pay || 0),
        otherExpenses: Number(load.other_expenses || 0),
      });
      rpmFormatted = `$${prof.rpm.toFixed(2)}/mi`;
    } else if (userRole === 'dispatcher') {
      rateFormatted = `$${load.rate.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      // Dispatcher sees gross rate for rate con verification, but no internal rpm/margin calculations
    }

    return {
      id: load.id,
      loadNumber: load.load_number,
      pipelineStatus: load.pipeline_status,
      origin: `${load.origin_city}, ${load.origin_state}`,
      destination: `${load.dest_city}, ${load.dest_state}`,
      pickupTimeFormatted: pickupFormatted,
      deliveryTimeFormatted: deliveryFormatted,
      equipmentType: load.equipment_type,
      carrierClientName: load.client?.company_name || 'Carrier Fleet',
      brokerCompanyName: load.broker?.company_name || 'Brokerage',
      brokerContact: load.broker?.contact_name || undefined,
      brokerEmail: load.broker?.contact_email || undefined,
      driverName: load.driver?.full_name || 'Unassigned Driver',
      driverPhone: load.driver?.phone || undefined,
      truckNumber: load.truck?.truck_number || 'Unassigned Truck',
      specialInstructions: load.commodity ? `Commodity: ${load.commodity}` : undefined,
      rateFormatted,
      rpmFormatted,
      isAtRisk,
      activeDetentionHours: activeDetHours,
      isTracked,
      isMissingRecentCheckIn,
      totalCheckCalls: loadCalls.length,
      timeSinceLastUpdate: latestCall ? formatTimeSince(latestCall.created_at) : 'No check-ins',
    };
  });

  // 4. Map compact Check Calls
  const targetLoadCalls = specificLoadId
    ? allCheckCalls.filter((c: CheckCall) => c.load_id === specificLoadId)
    : [];
  const baseCallsSlice = allCheckCalls.slice(0, maxRecentItems);
  const recentCallsSlice = specificLoadId && targetLoadCalls.length > 0
    ? [
        ...targetLoadCalls,
        ...baseCallsSlice.filter((c: CheckCall) => c.load_id !== specificLoadId),
      ]
    : baseCallsSlice;

  const contextCheckCalls: AIContextCheckCall[] = recentCallsSlice.map((cc: CheckCall) => {
    const matchedLoad = allLoads.find(
      (l: LoadWithRelations) => l.id === cc.load_id
    );

    const isEtaLate = isDeliveryEtaDelayed(
      matchedLoad?.delivery_datetime,
      cc.eta_delivery
    );

    const effectiveStatus =
      isEtaLate && cc.status === 'on_time'
        ? 'delayed'
        : cc.status;

    const isException = isOperationalException(
      cc.call_type,
      cc.status,
      matchedLoad?.delivery_datetime,
      cc.eta_delivery
    );

    return {
      id: cc.id,
      loadNumber: matchedLoad?.load_number || 'N/A',
      callType: cc.call_type,
      status: effectiveStatus,
      location: cc.location_city && cc.location_state ? `${cc.location_city}, ${cc.location_state}` : 'Location Pending',
      etaPickupFormatted: cc.eta_pickup
        ? formatInTimezone(cc.eta_pickup, operationalTimezone, { includeTime: true, includeDate: true })
        : undefined,
      etaDeliveryFormatted: cc.eta_delivery
        ? formatInTimezone(cc.eta_delivery, operationalTimezone, { includeTime: true, includeDate: true })
        : undefined,
      notes: cc.notes || undefined,
      loggedAtFormatted: formatDualTime(cc.created_at, operationalTimezone, dispatcherTimezone).combined,
      isException,
    };
  });

  // 5. Map compact Accessorial & Detention Claims
  const filteredAccessorials = specificClaimId
    ? allAccessorials.filter((a: AccessorialWithLoad) => a.id === specificClaimId)
    : allAccessorials.filter((a: AccessorialWithLoad) => a.status === 'draft' || a.status === 'submitted_to_broker');

  const contextAccessorials: AIContextAccessorial[] = filteredAccessorials.map((acc: AccessorialWithLoad) => {
    const det = acc.detention_details;

    return {
      id: acc.id,
      loadNumber: acc.load?.load_number || 'N/A',
      type: acc.type,
      status: acc.status,
      amountFormatted: `$${acc.amount.toFixed(2)}`,
      description: acc.description,
      facilityName: det?.facility_name,
      facilityType: det?.facility_type,
      billableHours: det?.billable_hours,
      isActiveDetention: det?.is_active_detention,
      hourlyRateFormatted: det ? `$${det.hourly_rate.toFixed(2)}/hr` : undefined,
    };
  });

  // 6. Map Missing Documents
  const contextDocuments: AIContextDocument[] = [];
  for (const load of activeLoads) {
    const loadDocs = allDocuments.filter((d: FreightDocument) => d.load_id === load.id);
    const hasRateCon = loadDocs.some((d: FreightDocument) => d.doc_type === 'rate_confirmation');
    const hasBol = loadDocs.some((d: FreightDocument) => d.doc_type === 'bol');
    const hasPod = loadDocs.some((d: FreightDocument) => d.doc_type === 'pod');

    if (!hasRateCon && ['booked', 'in_transit', 'delivered', 'invoiced'].includes(load.pipeline_status)) {
      contextDocuments.push({
        loadId: load.id,
        loadNumber: load.load_number,
        docType: 'rate_confirmation',
        docStatus: 'missing',
        isMissingCritical: true,
      });
    }

    if (!hasBol && ['in_transit', 'delivered', 'invoiced'].includes(load.pipeline_status)) {
      contextDocuments.push({
        loadId: load.id,
        loadNumber: load.load_number,
        docType: 'bol',
        docStatus: 'missing',
        isMissingCritical: ['delivered', 'invoiced'].includes(load.pipeline_status),
      });
    }

    if (!hasPod && ['delivered', 'invoiced'].includes(load.pipeline_status)) {
      contextDocuments.push({
        loadId: load.id,
        loadNumber: load.load_number,
        docType: 'pod',
        docStatus: 'missing',
        isMissingCritical: true,
      });
    }
  }

  // 7. Map Recent Activities & Dispatcher Notes
  const recentActivitiesSlice = allActivities.slice(0, maxRecentItems);
  const contextActivities: AIContextActivity[] = recentActivitiesSlice.map((act: LoadActivityEvent) => {
    const matchedLoad = allLoads.find((l: LoadWithRelations) => l.id === (act.loadId || act.load_id));
    const isCritical =
      act.type === 'dispatcher_note' &&
      (act.metadata?.criticalAlert === true || act.metadata?.urgentHandover === true);

    return {
      id: act.id,
      loadNumber: matchedLoad?.load_number,
      type: act.type,
      title: act.title,
      description: act.description,
      actorName: act.actorName,
      timestampFormatted: formatDualTime(act.timestamp, operationalTimezone, dispatcherTimezone).combined,
      isCriticalAlert: isCritical,
    };
  });

  // 8. Map Active Dispatcher Tasks
  const nowMs = Date.now();
  const contextTasks: AIContextTask[] = allTasks.map((t: DispatcherTask) => {
    const isOverdue =
      (t.status === 'pending' || t.status === 'in_progress') &&
      new Date(t.due_at).getTime() < nowMs;
    const catCfg = TASK_CATEGORY_CONFIG[t.category] || TASK_CATEGORY_CONFIG.general_operational;
    return {
      id: t.id,
      loadId: t.load_id,
      loadNumber: t.load_number,
      category: t.category,
      categoryLabel: catCfg.label,
      title: t.title,
      description: t.description,
      priority: t.priority,
      dueAtFormatted: formatDualTime(t.due_at, operationalTimezone, dispatcherTimezone).combined,
      isOverdue,
      assignedToName: t.assigned_to_name,
    };
  });

  // 9. Generate Operational Alerts
  const operationalAlerts: string[] = [];

  // A. Overdue Tasks
  const overdueTasks = contextTasks.filter((t) => t.isOverdue);
  if (overdueTasks.length > 0) {
    operationalAlerts.push(
      `${overdueTasks.length} operational follow-up task(s) are OVERDUE (e.g. "${overdueTasks[0].title}").`
    );
  }

  // B. Stale Check Calls (>4h without check-in on active load)
  const fourHoursAgo = Date.now() - 4 * 3600000;
  for (const load of activeLoads.filter((l: LoadWithRelations) => isLoadActiveForCheckInTracking(l))) {
    const loadCalls = allCheckCalls.filter((c: CheckCall) => c.load_id === load.id);
    if (loadCalls.length === 0) {
      operationalAlerts.push(`Load ${load.load_number} has NO check calls recorded yet.`);
    } else {
      const lastCallTime = new Date(loadCalls[0].created_at).getTime();
      if (lastCallTime < fourHoursAgo) {
        operationalAlerts.push(`Load ${load.load_number} check-in is overdue (last update >4 hours ago).`);
      }
    }
  }

  // C. Active Detentions
  const activeDetentions = contextAccessorials.filter((a: AIContextAccessorial) => a.isActiveDetention);
  if (activeDetentions.length > 0) {
    activeDetentions.forEach((ad: AIContextAccessorial) => {
      operationalAlerts.push(
        `Active detention running on Load ${ad.loadNumber} at ${ad.facilityName || 'Dock'} (${ad.billableHours ?? 0} hrs billable).`
      );
    });
  }

  // D. Missing PODs on Delivered Loads
  const missingCriticalDocs = contextDocuments.filter((d: AIContextDocument) => d.isMissingCritical && d.docType === 'pod');
  if (missingCriticalDocs.length > 0) {
    operationalAlerts.push(
      `${missingCriticalDocs.length} delivered load(s) are missing Proof of Delivery (POD) for invoice creation.`
    );
  }

  // 10. Optional Financials Context (strictly owner_admin)
  let financials: AIContextFinancials | undefined = undefined;
  if (userRole === 'owner_admin') {
    try {
      const profSummary = await profitabilityService.getProfitabilitySummary(organizationId, {
        dateRange: 'all_time',
        pipelineStatus: 'all',
      });

      financials = {
        totalActiveGrossRevenue: `$${profSummary.grossRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        averageRpm: `$${profSummary.averageRpm.toFixed(2)}/mi`,
        estimatedNetProfit: `$${profSummary.totalEstimatedProfit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        profitMargin: `${profSummary.averageMargin}%`,
        activeLoadsCount: profSummary.totalLoads,
      };
    } catch {
      // Gracefully continue if profitability summary is unavailable
    }
  }

  return {
    organizationId,
    userRole,
    generatedAtIso: new Date().toISOString(),
    operationalTimezone,
    dispatcherTimezone,
    currentTimeOps: getCurrentTimeInZone(operationalTimezone),
    currentTimeDispatcher: getCurrentTimeInZone(dispatcherTimezone),
    loads: contextLoads,
    recentCheckCalls: contextCheckCalls,
    pendingAccessorials: contextAccessorials,
    missingDocuments: contextDocuments,
    recentActivities: contextActivities,
    tasks: contextTasks,
    taskStats: tStats
      ? {
          totalActive: tStats.totalActive,
          overdueCount: tStats.overdueCount,
          dueTodayCount: tStats.dueTodayCount,
        }
      : undefined,
    operationalAlerts,
    financials,
  };
}

/**
 * Builds targeted context for a single load (e.g. for drafting driver WhatsApp instructions
 * or broker rate confirmation updates).
 */
export async function buildLoadSpecificContext(
  organizationId: string,
  loadId: string,
  userRole: AIUserRole,
  timezones: { ops?: string; local?: string } = {}
): Promise<{
  load: AIContextLoad | null;
  checkCalls: AIContextCheckCall[];
  accessorials: AIContextAccessorial[];
  documents: AIContextDocument[];
  activities: AIContextActivity[];
}> {
  const fullContext = await buildCopilotContext({
    organizationId,
    userRole,
    operationalTimezone: timezones.ops,
    dispatcherTimezone: timezones.local,
    specificLoadId: loadId,
  });

  const load = fullContext.loads.find((l: AIContextLoad) => l.id === loadId) || null;
  const loadNumber = load?.loadNumber;

  return {
    load,
    checkCalls: fullContext.recentCheckCalls.filter((c: AIContextCheckCall) => c.loadNumber === loadNumber),
    accessorials: fullContext.pendingAccessorials.filter((a: AIContextAccessorial) => a.loadNumber === loadNumber),
    documents: fullContext.missingDocuments.filter((d: AIContextDocument) => d.loadNumber === loadNumber),
    activities: fullContext.recentActivities.filter((a: AIContextActivity) => a.loadNumber === loadNumber),
  };
}
