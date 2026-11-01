import {
  OperationsCalendarEvent,
  CalendarStats,
  CalendarFilterState,
  CalendarDataResult,
  EventUrgency,
} from './calendarTypes.ts';
import { loadService } from '../loads/loadService.ts';
import { taskService } from '../tasks/taskService.ts';
import { checkCallService, isLoadActiveForCheckInTracking } from '../checkcalls/checkCallService.ts';
import { isDeliveryEtaDelayed, isOperationalException } from '../checkcalls/checkCallTypes.ts';
import { getEffectiveDueAt } from '../tasks/taskService.ts';
import { constructIsoDatetime, isDateOnlyString, extractDateOnlyString, toLocalDateString } from '../../lib/timezones.ts';

/**
 * Normalizes date input for calendar operations.
 * If the input is a pure date-only string (YYYY-MM-DD), anchors it to the specified
 * default operational time (e.g. 17:00 for delivery/ETA, 08:00 for pickup) in the operational timezone,
 * preventing UTC midnight from shifting backward by one day in North American timezones.
 */
export function normalizeCalendarDatetime(
  datetimeStr: string | null | undefined,
  operationalTz: string,
  defaultTime: string = '17:00'
): string | null | undefined {
  if (!datetimeStr) return datetimeStr;
  const trimmed = datetimeStr.trim();
  if (isDateOnlyString(trimmed)) {
    const datePart = extractDateOnlyString(trimmed);
    if (datePart) {
      const iso = constructIsoDatetime(datePart, defaultTime, operationalTz);
      return iso || trimmed;
    }
  }
  return trimmed;
}

export class CalendarService {
  /**
   * Aggregates all scheduled events across Loads, Tasks, and Check Calls
   * into a unified chronological array for the active organization.
   */
  async getCalendarEvents(
    organizationId: string,
    operationalTz: string
  ): Promise<CalendarDataResult> {
    const [loads, tasks, checkCalls] = await Promise.all([
      loadService.getLoads(organizationId),
      taskService.getTasks(organizationId),
      checkCallService.getCheckCalls(organizationId),
    ]);

    const events: OperationsCalendarEvent[] = [];
    const now = new Date();
    const nowMs = now.getTime();

    // 1. Derive Active Pickup Events (Only visible when pickup is the active milestone)
    loads.forEach((load) => {
      const shouldShowPickup =
        Boolean(load.pickup_datetime) &&
        !['in_transit', 'delivered', 'invoiced', 'paid', 'cancelled'].includes(load.pipeline_status);

      if (shouldShowPickup && load.pickup_datetime) {
        const effectivePickup = normalizeCalendarDatetime(load.pickup_datetime, operationalTz, '08:00') || load.pickup_datetime;
        const pickupMs = new Date(effectivePickup).getTime();
        const isPast = pickupMs < nowMs;
        const isCompleted = ['in_transit', 'delivered', 'invoiced', 'paid'].includes(load.pipeline_status);
        const isOverdue = isPast && !isCompleted;

        let urgency: EventUrgency = 'normal';
        if (isCompleted) urgency = 'completed';
        else if (isOverdue) urgency = 'overdue';
        else if (pickupMs - nowMs < 3 * 3600000) urgency = 'urgent'; // within 3 hours

        events.push({
          id: `pickup-${load.id}`,
          sourceType: 'load',
          sourceId: load.id,
          title: `Pickup: #${load.load_number} (${load.origin_city}, ${load.origin_state})`,
          datetime: effectivePickup,
          eventType: 'pickup',
          status: load.pipeline_status,
          urgency,
          isOverdue,
          loadNumber: load.load_number,
          clientName: load.client?.company_name,
          clientId: load.client_id || undefined,
          brokerName: load.broker?.company_name,
          brokerId: load.broker_id || undefined,
          driverName: load.driver?.full_name,
          driverId: load.driver_id || undefined,
          truckUnit: load.truck?.truck_number,
          truckId: load.truck_id || undefined,
          origin: `${load.origin_city}, ${load.origin_state}`,
          destination: `${load.dest_city}, ${load.dest_state}`,
          commodity: load.commodity || undefined,
          equipmentType: load.equipment_type || undefined,
          rate: load.rate,
          rawLoad: load,
        });
      }

      // 2. Derive Active Delivery Events (Only visible when in_transit as the active milestone)
      const shouldShowDelivery =
        Boolean(load.delivery_datetime) &&
        load.pipeline_status === 'in_transit';

      if (shouldShowDelivery && load.delivery_datetime) {
        const effectiveDelivery = normalizeCalendarDatetime(load.delivery_datetime, operationalTz, '17:00') || load.delivery_datetime;
        const deliveryMs = new Date(effectiveDelivery).getTime();
        const isPast = deliveryMs < nowMs;
        const isCompleted = ['delivered', 'invoiced', 'paid'].includes(load.pipeline_status);
        const isOverdue = isPast && !isCompleted;

        let urgency: EventUrgency = 'normal';
        if (isCompleted) urgency = 'completed';
        else if (isOverdue) urgency = 'overdue';
        else if (deliveryMs - nowMs < 4 * 3600000) urgency = 'urgent'; // within 4 hours

        events.push({
          id: `delivery-${load.id}`,
          sourceType: 'load',
          sourceId: load.id,
          title: `Delivery: #${load.load_number} (${load.dest_city}, ${load.dest_state})`,
          datetime: effectiveDelivery,
          eventType: 'delivery',
          status: load.pipeline_status,
          urgency,
          isOverdue,
          loadNumber: load.load_number,
          clientName: load.client?.company_name,
          clientId: load.client_id || undefined,
          brokerName: load.broker?.company_name,
          brokerId: load.broker_id || undefined,
          driverName: load.driver?.full_name,
          driverId: load.driver_id || undefined,
          truckUnit: load.truck?.truck_number,
          truckId: load.truck_id || undefined,
          origin: `${load.origin_city}, ${load.origin_state}`,
          destination: `${load.dest_city}, ${load.dest_state}`,
          commodity: load.commodity || undefined,
          equipmentType: load.equipment_type || undefined,
          rate: load.rate,
          rawLoad: load,
        });
      }
    });

    // 3. Derive Task Events
    tasks.forEach((task) => {
      if (task.status === 'cancelled') return;

      const effectiveDue = getEffectiveDueAt(task);
      if (!effectiveDue) return;

      const dueMs = new Date(effectiveDue).getTime();
      const isCompleted = task.status === 'completed';
      const isOverdue = !isCompleted && dueMs < nowMs;

      let urgency: EventUrgency = 'normal';
      if (isCompleted) urgency = 'completed';
      else if (isOverdue) urgency = 'overdue';
      else if (task.priority === 'urgent' || task.priority === 'high') urgency = 'urgent';

      const relatedLoad = task.load_id ? loads.find((l) => l.id === task.load_id) : undefined;

      events.push({
        id: `task-${task.id}`,
        sourceType: 'task',
        sourceId: task.id,
        title: `Task: ${task.title}`,
        datetime: effectiveDue,
        eventType: 'task',
        status: task.status,
        urgency,
        isOverdue,
        loadNumber: task.load_number || relatedLoad?.load_number || undefined,
        clientId: (relatedLoad?.client_id || undefined) as string | undefined,
        clientName: relatedLoad?.client?.company_name,
        brokerId: (relatedLoad?.broker_id || undefined) as string | undefined,
        brokerName: relatedLoad?.broker?.company_name,
        driverId: (relatedLoad?.driver_id || undefined) as string | undefined,
        driverName: relatedLoad?.driver?.full_name,
        truckUnit: relatedLoad?.truck?.truck_number,
        truckId: (relatedLoad?.truck_id || undefined) as string | undefined,
        taskCategory: task.category,
        taskPriority: task.priority,
        rawTask: task,
        rawLoad: relatedLoad,
      });
    });

    // 4. Derive Check Call Milestones & Follow-ups
    loads.forEach((load) => {
      if (isLoadActiveForCheckInTracking(load)) {
        const loadCheckCalls = checkCalls.filter((cc) => cc.load_id === load.id);
        const latestCall = loadCheckCalls[0] || checkCalls.find((cc) => cc.load_id === load.id);
        
        const isEtaLate = Boolean(
          latestCall &&
          isDeliveryEtaDelayed(
            load.delivery_datetime,
            latestCall.eta_delivery
          )
        );

        const isDelayed = Boolean(
          latestCall &&
          (latestCall.status === 'delayed' || isEtaLate)
        );

        const hasException = Boolean(
          latestCall &&
          isOperationalException(
            latestCall.call_type,
            latestCall.status,
            load.delivery_datetime,
            latestCall.eta_delivery
          )
        );

        const effectiveStatus =
          isDelayed
            ? 'delayed'
            : (latestCall?.status || 'scheduled');

        const isDelayedEta = Boolean(
          latestCall &&
          (isDelayed || hasException) &&
          latestCall.eta_delivery
        );

        if (isDelayedEta && latestCall?.eta_delivery) {
          // 4b. When the latest check call represents an active delayed ETA:
          // Emit the existing eta_warning event as the primary exception representation
          const effectiveEtaDelivery = normalizeCalendarDatetime(latestCall.eta_delivery, operationalTz, '17:00') || latestCall.eta_delivery;
          const isWarningOverdue = new Date(effectiveEtaDelivery).getTime() < now.getTime();

          events.push({
            id: `eta-warning-${load.id}`,
            sourceType: 'check_call',
            sourceId: latestCall.id,
            title: `Delay Warning: #${load.load_number}`,
            datetime: effectiveEtaDelivery,
            eventType: 'eta_warning',
            status: 'delayed',
            urgency: isWarningOverdue ? 'overdue' : 'urgent',
            isOverdue: isWarningOverdue,
            loadNumber: load.load_number,
            driverName: load.driver?.full_name,
            truckUnit: load.truck?.truck_number,
            driverId: load.driver_id || undefined,
            truckId: load.truck_id || undefined,
            clientId: load.client_id || undefined,
            brokerId: load.broker_id || undefined,
            origin: `${load.origin_city}, ${load.origin_state}`,
            destination: `${load.dest_city}, ${load.dest_state}`,
            lastLocation: `${latestCall.location_city || ''}, ${latestCall.location_state || ''}`.replace(/^, |^,$/, ''),
            reportedEta: latestCall.eta_delivery,
            rawLoad: load,
            rawCheckCall: latestCall,
          });
        } else {
          // 4a. Check-Call Due / Milestone Scheduled Event for normal / non-delayed load
          const rawCheckCallTarget = latestCall?.eta_delivery || latestCall?.eta_pickup || load.pickup_datetime;
          if (rawCheckCallTarget) {
            const checkCallTargetTime = normalizeCalendarDatetime(rawCheckCallTarget, operationalTz, '17:00') || rawCheckCallTarget;
            const targetDate = new Date(checkCallTargetTime);
            const isCheckCallOverdue = targetDate.getTime() < now.getTime() && latestCall?.status !== 'completed';

            events.push({
              id: `check-call-due-${load.id}`,
              sourceType: 'check_call',
              sourceId: latestCall ? latestCall.id : `load-cc-${load.id}`,
              title: `Transit Check-In: #${load.load_number}`,
              datetime: checkCallTargetTime,
              eventType: 'check_call_due',
              status: effectiveStatus,
              urgency:
                isCheckCallOverdue
                  ? 'overdue'
                  : (latestCall?.status === 'at_risk' || hasException)
                    ? 'urgent'
                    : 'normal',
              isOverdue: isCheckCallOverdue,
              loadNumber: load.load_number,
              driverName: load.driver?.full_name,
              truckUnit: load.truck?.truck_number,
              driverId: load.driver_id || undefined,
              truckId: load.truck_id || undefined,
              clientId: load.client_id || undefined,
              brokerId: load.broker_id || undefined,
              origin: `${load.origin_city}, ${load.origin_state}`,
              destination: `${load.dest_city}, ${load.dest_state}`,
              lastLocation: latestCall ? `${latestCall.location_city || ''}, ${latestCall.location_state || ''}`.replace(/^, |^,$/, '') : undefined,
              reportedEta: latestCall?.eta_delivery || latestCall?.eta_pickup || undefined,
              rawLoad: load,
              rawCheckCall: latestCall,
            });
          }
        }
      }
    });

    // Sort chronologically
    events.sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime());

    // 5. Compute Calendar Stats for Operational Header
    const todayStr = getLocalDateString(now, operationalTz);
    
    let todayPickupsCount = 0;
    let todayDeliveriesCount = 0;
    let pendingCheckCallsCount = 0;
    let highPriorityTasksCount = 0;
    let overdueCount = 0;

    events.forEach((ev) => {
      const evDateStr = getLocalDateString(ev.datetime, operationalTz);
      const isToday = evDateStr === todayStr;

      if (ev.isOverdue) {
        overdueCount++;
      }

      if (isToday) {
        if (ev.eventType === 'pickup') todayPickupsCount++;
        if (ev.eventType === 'delivery') todayDeliveriesCount++;
      }

      if (ev.eventType === 'task' && ev.rawTask) {
        if (ev.rawTask.status !== 'completed' && (ev.rawTask.priority === 'urgent' || ev.rawTask.priority === 'high')) {
          highPriorityTasksCount++;
        }
      }

      if (ev.eventType === 'check_call_due' || ev.eventType === 'eta_warning') {
        pendingCheckCallsCount++;
      }
    });

    const activeLoads = loads.filter((l) => !['delivered', 'invoiced', 'paid'].includes(l.pipeline_status));

    const stats: CalendarStats = {
      todayPickupsCount,
      todayDeliveriesCount,
      pendingCheckCallsCount,
      highPriorityTasksCount,
      overdueCount,
      totalActiveLoadsCount: activeLoads.length,
    };

    return {
      events,
      stats,
      loads,
      tasks,
      checkCalls,
    };
  }

  /**
   * Pure filtering function for calendar events
   */
  filterEvents(events: OperationsCalendarEvent[], filters: CalendarFilterState): OperationsCalendarEvent[] {
    const query = filters.searchQuery.trim().toLowerCase();

    return events.filter((event) => {
      // 1. Text Search Filter
      if (query) {
        const matchTitle = event.title.toLowerCase().includes(query);
        const matchLoadNum = event.loadNumber?.toLowerCase().includes(query);
        const matchClient = event.clientName?.toLowerCase().includes(query);
        const matchBroker = event.brokerName?.toLowerCase().includes(query);
        const matchDriver = event.driverName?.toLowerCase().includes(query);
        const matchTruck = event.truckUnit?.toLowerCase().includes(query);
        const matchOrigin = event.origin?.toLowerCase().includes(query);
        const matchDest = event.destination?.toLowerCase().includes(query);

        if (!matchTitle && !matchLoadNum && !matchClient && !matchBroker && !matchDriver && !matchTruck && !matchOrigin && !matchDest) {
          return false;
        }
      }

      // 2. Event Type Filter
      if (filters.eventTypes.length > 0) {
        const matchesDirect = filters.eventTypes.includes(event.eventType);
        const matchesCheckCallGroup =
          event.eventType === 'eta_warning' && filters.eventTypes.includes('check_call_due');
        if (!matchesDirect && !matchesCheckCallGroup) {
          return false;
        }
      }

      // 3. Client Filter
      if (filters.clientIds.length > 0 && (!event.clientId || !filters.clientIds.includes(event.clientId))) {
        return false;
      }

      // 4. Driver Filter
      if (filters.driverIds.length > 0 && (!event.driverId || !filters.driverIds.includes(event.driverId))) {
        return false;
      }

      // 5. Truck Filter
      if (filters.truckIds.length > 0 && (!event.truckId || !filters.truckIds.includes(event.truckId))) {
        return false;
      }

      // 6. Broker Filter
      if (filters.brokerIds.length > 0 && (!event.brokerId || !filters.brokerIds.includes(event.brokerId))) {
        return false;
      }

      // 7. Load Status Filter
      if (filters.loadStatuses.length > 0 && event.sourceType === 'load') {
        if (!filters.loadStatuses.includes(event.status as any)) {
          return false;
        }
      }

      // 8. Overdue Only Filter
      if (filters.onlyOverdue && !event.isOverdue) {
        return false;
      }

      return true;
    });
  }
}

/**
 * Returns formatted YYYY-MM-DD string in a specific timezone
 */
export function getLocalDateString(date: Date | string, timeZone: string): string {
  if (typeof date === 'string') {
    if (isDateOnlyString(date)) {
      const extracted = extractDateOnlyString(date);
      if (extracted) return extracted;
    }
    const parsed = new Date(date);
    if (!isNaN(parsed.getTime())) {
      date = parsed;
    }
  }
  return toLocalDateString(date, timeZone);
}

/**
 * Generates an array of Date objects for a 7-day week starting on Sunday or Monday
 */
export function getDaysInWeek(anchorDate: Date, startOnMonday: boolean = false): Date[] {
  const current = new Date(anchorDate);
  const day = current.getDay(); // 0 is Sunday, 1 is Monday
  
  const diff = current.getDate() - day + (startOnMonday ? (day === 0 ? -6 : 1) : 0);
  const startOfWeek = new Date(current.setDate(diff));
  startOfWeek.setHours(12, 0, 0, 0);

  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + i);
    d.setHours(12, 0, 0, 0);
    days.push(d);
  }
  return days;
}

/**
 * Generates 35 or 42 calendar grid days for a given month
 */
export function getDaysInMonthGrid(year: number, monthIndex: number): { date: Date; isCurrentMonth: boolean }[] {
  const firstDayOfMonth = new Date(year, monthIndex, 1);
  const lastDayOfMonth = new Date(year, monthIndex + 1, 0);
  
  const startDayOfWeek = firstDayOfMonth.getDay(); // 0 = Sunday
  const daysInMonth = lastDayOfMonth.getDate();

  const grid: { date: Date; isCurrentMonth: boolean }[] = [];

  // Previous month padding
  const prevMonthLastDay = new Date(year, monthIndex, 0).getDate();
  for (let i = startDayOfWeek - 1; i >= 0; i--) {
    const d = new Date(year, monthIndex - 1, prevMonthLastDay - i);
    grid.push({ date: d, isCurrentMonth: false });
  }

  // Current month days
  for (let i = 1; i <= daysInMonth; i++) {
    const d = new Date(year, monthIndex, i);
    grid.push({ date: d, isCurrentMonth: true });
  }

  // Next month padding (fill up to 35 or 42 grid cells)
  const totalCells = grid.length <= 35 ? 35 : 42;
  const remainingCells = totalCells - grid.length;
  for (let i = 1; i <= remainingCells; i++) {
    const d = new Date(year, monthIndex + 1, i);
    grid.push({ date: d, isCurrentMonth: false });
  }

  return grid;
}

export const calendarService = new CalendarService();
