import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext.tsx';
import { useTimezone } from '../../contexts/TimezoneContext.tsx';
import {
  CalendarViewMode,
  CalendarFilterState,
  OperationsCalendarEvent,
  CalendarStats,
} from './calendarTypes.ts';
import { calendarService, getDaysInWeek, getLocalDateString } from './calendarService.ts';
import { clientService } from '../clients/clientService.ts';
import { driverService } from '../drivers/driverService.ts';
import { truckService } from '../trucks/truckService.ts';
import { brokerService } from '../brokers/brokerService.ts';
import { loadService } from '../loads/loadService.ts';
import { Client, Driver, Truck, Broker, UserRole } from '../../types/domain.types.ts';
import { LoadWithRelations, CreateLoadInput, UpdateLoadInput } from '../loads/loadTypes.ts';
import { DispatcherTask } from '../tasks/taskTypes.ts';
import { CheckCallWithRelations } from '../checkcalls/checkCallTypes.ts';

// Calendar Components
import { CalendarFilters } from './CalendarFilters.tsx';
import { WeekCalendarView } from './WeekCalendarView.tsx';
import { MonthCalendarView } from './MonthCalendarView.tsx';
import { DayCalendarView } from './DayCalendarView.tsx';
import { AgendaCalendarView } from './AgendaCalendarView.tsx';

// Modals
import { LoadDetailModal } from '../loads/LoadDetailModal.tsx';
import { LoadModal } from '../loads/LoadModal.tsx';
import { documentService } from '../documents/documentService.ts';
import { TaskModal } from '../tasks/TaskModal.tsx';
import { CheckCallModal } from '../checkcalls/CheckCallModal.tsx';
import { checkCallService } from '../checkcalls/checkCallService.ts';
import { CreateCheckCallInput, UpdateCheckCallInput, CheckCall } from '../checkcalls/checkCallTypes.ts';

import {
  Calendar as CalendarIcon,
  PackageCheck,
  Truck as TruckIcon,
  CheckSquare,
  Radio,
  AlertTriangle,
  Clock,
  Plus,
  RefreshCw,
  Sparkles,
  Layers,
  ChevronRight,
  TrendingUp,
} from 'lucide-react';

interface CalendarViewProps {
  onNewLoadClick?: () => void;
}

export const CalendarView: React.FC<CalendarViewProps> = ({ onNewLoadClick }) => {
  const { activeOrganization, userRole } = useAuth();
  const { operationalTimezone, dispatcherTimezone, liveOpsTime, liveDispatcherTime } = useTimezone();

  const orgId = activeOrganization?.id || 'demo-org-1';
  const canEdit = userRole === 'owner_admin' || userRole === 'dispatcher';

  // Calendar State
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [viewMode, setViewMode] = useState<CalendarViewMode>('week');
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Raw and Derived Data
  const [allEvents, setAllEvents] = useState<OperationsCalendarEvent[]>([]);
  const [stats, setStats] = useState<CalendarStats>({
    todayPickupsCount: 0,
    todayDeliveriesCount: 0,
    pendingCheckCallsCount: 0,
    highPriorityTasksCount: 0,
    overdueCount: 0,
    totalActiveLoadsCount: 0,
  });

  const [loads, setLoads] = useState<LoadWithRelations[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [brokers, setBrokers] = useState<Broker[]>([]);

  // Filter State
  const [filters, setFilters] = useState<CalendarFilterState>({
    searchQuery: '',
    eventTypes: [],
    clientIds: [],
    driverIds: [],
    truckIds: [],
    brokerIds: [],
    loadStatuses: [],
    onlyOverdue: false,
    onlyToday: false,
  });

  // Modal States
  const [selectedLoad, setSelectedLoad] = useState<LoadWithRelations | null>(null);
  const [isLoadDetailModalOpen, setIsLoadDetailModalOpen] = useState(false);

  const [selectedTask, setSelectedTask] = useState<DispatcherTask | null>(null);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);

  const [selectedCheckCallLoad, setSelectedCheckCallLoad] = useState<LoadWithRelations | null>(null);
  const [selectedCheckCall, setSelectedCheckCall] = useState<CheckCall | null>(null);
  const [isCheckCallModalOpen, setIsCheckCallModalOpen] = useState(false);

  const [isLoadModalOpen, setIsLoadModalOpen] = useState(false);
  const [loadToEdit, setLoadToEdit] = useState<LoadWithRelations | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Load calendar & entity data
  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [calData, clientsList, driversList, trucksList, brokersList] = await Promise.all([
        calendarService.getCalendarEvents(orgId, operationalTimezone),
        clientService.getClients(orgId),
        driverService.getDrivers(orgId),
        truckService.getTrucks(orgId),
        brokerService.listBrokers(orgId),
      ]);

      setAllEvents(calData.events);
      setStats(calData.stats);
      setLoads(calData.loads);
      setClients(clientsList);
      setDrivers(driversList);
      setTrucks(trucksList);
      setBrokers(brokersList);
    } catch (err) {
      console.error('Error fetching calendar data:', err);
    } finally {
      setIsLoading(false);
    }
  }, [orgId, operationalTimezone]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Date Navigation logic
  const handleNavigateDate = (direction: 'prev' | 'next' | 'today') => {
    if (direction === 'today') {
      setCurrentDate(new Date());
      return;
    }

    const next = new Date(currentDate);
    const amount = direction === 'next' ? 1 : -1;

    if (viewMode === 'month') {
      next.setMonth(next.getMonth() + amount);
    } else if (viewMode === 'week') {
      next.setDate(next.getDate() + amount * 7);
    } else {
      next.setDate(next.getDate() + amount);
    }
    setCurrentDate(next);
  };

  // Generate friendly date display string for current view
  const dateDisplayLabel = useMemo(() => {
    if (viewMode === 'month') {
      return new Intl.DateTimeFormat('en-US', {
        month: 'long',
        year: 'numeric',
        timeZone: operationalTimezone,
      }).format(currentDate);
    }

    if (viewMode === 'week') {
      const weekDays = getDaysInWeek(currentDate, false);
      const start = weekDays[0];
      const end = weekDays[6];

      const startMonth = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: operationalTimezone }).format(start);
      const endMonth = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: operationalTimezone }).format(end);
      const startDay = start.getDate();
      const endDay = end.getDate();
      const year = end.getFullYear();

      if (startMonth === endMonth) {
        return `${startMonth} ${startDay} – ${endDay}, ${year}`;
      }
      return `${startMonth} ${startDay} – ${endMonth} ${endDay}, ${year}`;
    }

    if (viewMode === 'day') {
      return new Intl.DateTimeFormat('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        timeZone: operationalTimezone,
      }).format(currentDate);
    }

    return `Schedule Queue (${new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric', timeZone: operationalTimezone }).format(currentDate)})`;
  }, [currentDate, viewMode, operationalTimezone]);

  // Filtered Events
  const filteredEvents = useMemo(() => {
    return calendarService.filterEvents(allEvents, filters);
  }, [allEvents, filters]);

  // Handle Event Click
  const handleSelectEvent = (event: OperationsCalendarEvent) => {
    if (event.sourceType === 'check_call' || event.eventType === 'check_call_due' || event.eventType === 'eta_warning') {
      const targetLoad = event.rawLoad || (event.loadNumber ? loads.find((l) => l.load_number === event.loadNumber) : null);
      if (targetLoad) {
        setSelectedCheckCallLoad(targetLoad);
        setSelectedCheckCall(event.rawCheckCall || null);
        setIsCheckCallModalOpen(true);
      }
    } else if (event.sourceType === 'load' && event.rawLoad) {
      setSelectedLoad(event.rawLoad);
      setIsLoadDetailModalOpen(true);
    } else if (event.sourceType === 'task' && event.rawTask) {
      setSelectedTask(event.rawTask);
      setIsTaskModalOpen(true);
    } else if (event.loadNumber) {
      const matchingLoad = loads.find((l) => l.load_number === event.loadNumber);
      if (matchingLoad) {
        setSelectedLoad(matchingLoad);
        setIsLoadDetailModalOpen(true);
      }
    }
  };

  const handleSaveCheckCall = async (data: CreateCheckCallInput | UpdateCheckCallInput) => {
    try {
      if (selectedCheckCall) {
        await checkCallService.updateCheckCall(orgId, selectedCheckCall.id, data as UpdateCheckCallInput);
        showToast('Check-call updated successfully.');
      } else {
        await checkCallService.createCheckCall(orgId, data as CreateCheckCallInput);
        showToast('New check-call logged.');
      }
      setIsCheckCallModalOpen(false);
      setSelectedCheckCall(null);
      setSelectedCheckCallLoad(null);
      await fetchData();
    } catch (err: any) {
      console.error('Failed to save check call:', err);
      showToast(err.message || 'Error saving check call');
    }
  };

  const handleSaveLoad = async (
    input: CreateLoadInput | UpdateLoadInput,
    rateConFile?: File | null
  ) => {
    try {
      if (loadToEdit) {
        await loadService.updateLoad(orgId, loadToEdit.id, input as UpdateLoadInput);
        showToast(`Load #${loadToEdit.load_number} updated successfully.`);
      } else {
        const created = await loadService.createLoad(orgId, input as CreateLoadInput);

        if (rateConFile) {
          try {
            await documentService.createDocument(
              orgId,
              {
                load_id: created.id,
                doc_type: 'rate_confirmation',
                doc_status: 'verified', // Dispatcher reviewed and confirmed during Load Booking
                file_name: rateConFile.name,
                file_size_bytes: rateConFile.size,
                mime_type: rateConFile.type || 'application/pdf',
              },
              rateConFile
            );
          } catch (docErr) {
            console.error('Failed to attach Rate Con document after load creation in calendar:', docErr);
          }
        }

        showToast(`Load #${created.load_number} booked and added to calendar.`);
      }
      setIsLoadModalOpen(false);
      setLoadToEdit(null);
      await fetchData();
    } catch (err: any) {
      console.error('Failed to save load:', err);
      showToast(err.message || 'Error saving load');
      throw err;
    }
  };

  return (
    <div className="space-y-4 pb-12">
      {/* Toast notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-2.5 bg-emerald-950 border border-emerald-600 text-emerald-200 rounded-xl shadow-xl text-xs font-semibold flex items-center gap-2 animate-bounce">
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header Banner & Live Operational Clocks */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <CalendarIcon className="w-5 h-5 text-indigo-400" />
            <h1 className="text-lg font-bold text-white tracking-tight">
              Operations Calendar & Dispatch Timeline
            </h1>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Synchronized freight schedule, pickup & delivery windows, transit check-ins, and actionable dispatcher reminders.
          </p>
        </div>

        {/* Dual Timezone Live Display */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 bg-slate-950/80 border border-slate-800 px-3 py-1.5 rounded-lg text-xs">
            <Clock className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block leading-tight">
                Ops Time (CT)
              </span>
              <span className="font-mono font-bold text-slate-100">
                {liveOpsTime || '—'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 bg-slate-950/80 border border-slate-800 px-3 py-1.5 rounded-lg text-xs">
            <Clock className="w-3.5 h-3.5 text-indigo-400" />
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block leading-tight">
                Dispatcher Time
              </span>
              <span className="font-mono font-bold text-slate-100">
                {liveDispatcherTime || '—'}
              </span>
            </div>
          </div>

          {canEdit && (
            <div className="flex items-center gap-1.5 ml-auto sm:ml-0">
              <button
                type="button"
                onClick={() => {
                  setSelectedTask(null);
                  setIsTaskModalOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors cursor-pointer"
              >
                <CheckSquare className="w-3.5 h-3.5 text-indigo-400" />
                <span>Add Task</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (onNewLoadClick) {
                    onNewLoadClick();
                  } else {
                    setLoadToEdit(null);
                    setIsLoadModalOpen(true);
                  }
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-xs transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Book Load</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Top Metric Cards Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Today Pickups */}
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-3 flex flex-col justify-between">
          <span className="text-[11px] font-semibold text-amber-400 uppercase tracking-wider flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            Today's Pickups
          </span>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-xl font-bold text-white font-mono">
              {stats.todayPickupsCount}
            </span>
            <span className="text-[10px] text-slate-400 font-medium">Shipper Docks</span>
          </div>
        </div>

        {/* Today Deliveries */}
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-3 flex flex-col justify-between">
          <span className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            Today's Deliveries
          </span>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-xl font-bold text-white font-mono">
              {stats.todayDeliveriesCount}
            </span>
            <span className="text-[10px] text-slate-400 font-medium">Receiver Docks</span>
          </div>
        </div>

        {/* Active Loads in Transit */}
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-3 flex flex-col justify-between">
          <span className="text-[11px] font-semibold text-indigo-400 uppercase tracking-wider flex items-center gap-1">
            <TruckIcon className="w-3 h-3 text-indigo-400" />
            Active Loads
          </span>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-xl font-bold text-white font-mono">
              {stats.totalActiveLoadsCount}
            </span>
            <span className="text-[10px] text-slate-400 font-medium">Under Dispatch</span>
          </div>
        </div>

        {/* Tasks Due Today */}
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-3 flex flex-col justify-between">
          <span className="text-[11px] font-semibold text-cyan-400 uppercase tracking-wider flex items-center gap-1">
            <CheckSquare className="w-3 h-3 text-cyan-400" />
            High-Priority Tasks
          </span>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-xl font-bold text-white font-mono">
              {stats.highPriorityTasksCount}
            </span>
            <span className="text-[10px] text-slate-400 font-medium">Action Items</span>
          </div>
        </div>

        {/* Pending Check-Calls */}
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-3 flex flex-col justify-between">
          <span className="text-[11px] font-semibold text-blue-400 uppercase tracking-wider flex items-center gap-1">
            <Radio className="w-3 h-3 text-blue-400" />
            Transit Alerts
          </span>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-xl font-bold text-white font-mono">
              {stats.pendingCheckCallsCount}
            </span>
            <span className="text-[10px] text-slate-400 font-medium">Check-In ETA</span>
          </div>
        </div>

        {/* Overdue Total */}
        <div
          onClick={() => setFilters({ ...filters, onlyOverdue: !filters.onlyOverdue })}
          className={`border rounded-xl p-3 flex flex-col justify-between cursor-pointer transition-all ${
            stats.overdueCount > 0
              ? 'bg-rose-950/30 border-rose-500/40 hover:bg-rose-950/50'
              : 'bg-slate-900/60 border-slate-800/80'
          }`}
        >
          <span className="text-[11px] font-semibold text-rose-400 uppercase tracking-wider flex items-center gap-1">
            <AlertTriangle className={`w-3 h-3 ${stats.overdueCount > 0 ? 'animate-pulse' : ''}`} />
            Overdue Items
          </span>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-xl font-bold text-rose-300 font-mono">
              {stats.overdueCount}
            </span>
            <span className="text-[10px] text-rose-400 font-medium">
              {filters.onlyOverdue ? 'Active Filter' : 'Click to Filter'}
            </span>
          </div>
        </div>
      </div>

      {/* Calendar Filter & View Switcher Bar */}
      <CalendarFilters
        currentDate={currentDate}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onNavigateDate={handleNavigateDate}
        filters={filters}
        onFilterChange={setFilters}
        clients={clients}
        drivers={drivers}
        trucks={trucks}
        brokers={brokers}
        overdueCount={stats.overdueCount}
        dateDisplayLabel={dateDisplayLabel}
      />

      {/* Main View Area */}
      {isLoading ? (
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-16 text-center text-slate-400 flex flex-col items-center justify-center">
          <RefreshCw className="w-8 h-8 animate-spin text-indigo-400 mb-2" />
          <p className="text-sm font-semibold text-slate-300">Synchronizing Operations Calendar...</p>
          <span className="text-xs text-slate-500">Compiling loads, delivery appointments, and dispatch tasks</span>
        </div>
      ) : (
        <>
          {viewMode === 'week' && (
            <WeekCalendarView
              currentDate={currentDate}
              events={filteredEvents}
              operationalTimezone={operationalTimezone}
              dispatcherTimezone={dispatcherTimezone}
              onSelectEvent={handleSelectEvent}
            />
          )}

          {viewMode === 'month' && (
            <MonthCalendarView
              currentDate={currentDate}
              events={filteredEvents}
              operationalTimezone={operationalTimezone}
              dispatcherTimezone={dispatcherTimezone}
              onSelectEvent={handleSelectEvent}
              onDayClick={(date) => {
                setCurrentDate(date);
                setViewMode('day');
              }}
            />
          )}

          {viewMode === 'day' && (
            <DayCalendarView
              currentDate={currentDate}
              events={filteredEvents}
              operationalTimezone={operationalTimezone}
              dispatcherTimezone={dispatcherTimezone}
              onSelectEvent={handleSelectEvent}
            />
          )}

          {viewMode === 'agenda' && (
            <AgendaCalendarView
              events={filteredEvents}
              operationalTimezone={operationalTimezone}
              dispatcherTimezone={dispatcherTimezone}
              onSelectEvent={handleSelectEvent}
            />
          )}
        </>
      )}

      {/* Deep-Linked Load Detail Modal */}
      {selectedLoad && (
        <LoadDetailModal
          isOpen={isLoadDetailModalOpen}
          onClose={() => {
            setIsLoadDetailModalOpen(false);
            setSelectedLoad(null);
          }}
          load={selectedLoad}
          canEdit={canEdit}
          onStatusChange={async () => {
            await fetchData();
            showToast(`Load #${selectedLoad.load_number} status updated.`);
          }}
        />
      )}

      {/* Deep-Linked Task Modal */}
      <TaskModal
        isOpen={isTaskModalOpen}
        onClose={() => {
          setIsTaskModalOpen(false);
          setSelectedTask(null);
        }}
        taskToEdit={selectedTask}
        onSuccess={async (savedTask, isEdit) => {
          await fetchData();
          showToast(isEdit ? 'Task updated successfully.' : 'New task scheduled.');
          setIsTaskModalOpen(false);
          setSelectedTask(null);
        }}
      />

      {/* Deep-Linked Check Call Modal */}
      {selectedCheckCallLoad && (
        <CheckCallModal
          isOpen={isCheckCallModalOpen}
          onClose={() => {
            setIsCheckCallModalOpen(false);
            setSelectedCheckCall(null);
            setSelectedCheckCallLoad(null);
          }}
          load={selectedCheckCallLoad}
          initialCheckCall={selectedCheckCall}
          onSubmit={handleSaveCheckCall}
        />
      )}

      {/* Quick Add / Edit Load Modal */}
      <LoadModal
        isOpen={isLoadModalOpen}
        onClose={() => {
          setIsLoadModalOpen(false);
          setLoadToEdit(null);
        }}
        onSave={handleSaveLoad}
        initialLoad={loadToEdit}
        clients={clients}
        brokers={brokers}
        trucks={trucks}
        drivers={drivers}
        organizationId={activeOrganization?.id}
      />
    </div>
  );
};
