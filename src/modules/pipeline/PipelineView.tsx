import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext.tsx';
import { useTimezone } from '../../contexts/TimezoneContext.tsx';
import { loadService } from '../loads/loadService.ts';
import { getLocalDateString } from '../calendar/calendarService.ts';
import {
  LoadWithRelations,
  CreateLoadInput,
  UpdateLoadInput,
} from '../loads/loadTypes.ts';
import { Client, Broker, Truck, Driver, PipelineStatus } from '../../types/domain.types.ts';
import {
  PipelineFilterCriteria,
  validateStatusTransition,
  getPipelineStatusLabel,
  PIPELINE_COLUMNS,
} from './pipelineTypes.ts';
import { PipelineFilters } from './PipelineFilters.tsx';
import { PipelineBoard } from './PipelineBoard.tsx';
import { LoadDetailModal } from '../loads/LoadDetailModal.tsx';
import { LoadModal } from '../loads/LoadModal.tsx';
import { documentService } from '../documents/documentService.ts';
import { checkCallService } from '../checkcalls/checkCallService.ts';
import { Modal } from '../../components/common/Modal.tsx';
import { formatCurrency } from '../../lib/calculations.ts';
import {
  Plus,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  Info,
  Kanban,
  DollarSign,
  TrendingUp,
  X,
  Calendar,
  Layers,
} from 'lucide-react';

interface PipelineViewProps {
  onNewLoadClick?: () => void;
  onNavigate?: (module: string) => void;
}

interface AlertNotification {
  type: 'success' | 'warning' | 'error' | 'info';
  text: string;
}

interface StatusConfirmationState {
  isOpen: boolean;
  load: LoadWithRelations;
  targetStatus: PipelineStatus;
  title: string;
  prompt: string;
}

export const PipelineView: React.FC<PipelineViewProps> = ({ onNewLoadClick, onNavigate }) => {
  const { activeOrganization, userRole, user } = useAuth();
  const { operationalTimezone } = useTimezone();
  const orgId = activeOrganization?.id || 'demo-org-1';

  // Role permissions
  const canMove = userRole === 'owner_admin' || userRole === 'dispatcher';
  const canEdit = userRole === 'owner_admin' || userRole === 'dispatcher';

  // Data state
  const [loads, setLoads] = useState<LoadWithRelations[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [brokers, setBrokers] = useState<Broker[]>([]);
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [nextLoadNumber, setNextLoadNumber] = useState<string>('');

  // UI state
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [alertNotification, setAlertNotification] = useState<AlertNotification | null>(null);

  // Filters
  const [filters, setFilters] = useState<PipelineFilterCriteria>({
    search: '',
    clientId: '',
    brokerId: '',
    equipmentType: '',
    dateRange: 'all',
  });

  // Modal states
  const [selectedLoadForDetail, setSelectedLoadForDetail] = useState<LoadWithRelations | null>(null);
  const [loadToEdit, setLoadToEdit] = useState<LoadWithRelations | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [confirmationModal, setConfirmationModal] = useState<StatusConfirmationState | null>(null);

  const showAlert = useCallback((type: 'success' | 'warning' | 'error' | 'info', text: string) => {
    setAlertNotification({ type, text });
    setTimeout(() => {
      setAlertNotification((prev) => (prev?.text === text ? null : prev));
    }, 4500);
  }, []);

  // Fetch all domain data strictly isolated by active organization
  const loadData = useCallback(async () => {
    if (!orgId) return;
    setIsLoading(true);
    setError(null);
    try {
      const [loadsData, clientsData, brokersData, trucksData, driversData, nextNum] =
        await Promise.all([
          loadService.getLoads(orgId, { userRole: userRole || undefined, currentUserId: user?.id }),
          loadService.getClients(orgId),
          loadService.getBrokers(orgId),
          loadService.getTrucks(orgId),
          loadService.getDrivers(orgId),
          loadService.generateNextLoadNumber(orgId),
        ]);

      setLoads(loadsData);
      setClients(clientsData);
      setBrokers(brokersData);
      setTrucks(trucksData);
      setDrivers(driversData);
      setNextLoadNumber(nextNum);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load pipeline records';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Real-time synchronization: subscribe to check call updates to reflect tracking data and stage moves immediately
  useEffect(() => {
    if (!orgId) return;

    const unsubscribe = checkCallService.subscribeToLoadTracking(null, async (updatedLoadId) => {
      try {
        const freshLoad = await loadService.getLoad(orgId, updatedLoadId);
        if (freshLoad) {
          setLoads((prev) => prev.map((l) => (l.id === updatedLoadId ? freshLoad : l)));
          setSelectedLoadForDetail((prev) => (prev?.id === updatedLoadId ? freshLoad : prev));
        }
      } catch (err) {
        console.warn('[PipelineView] Failed to refresh load tracking in pipeline:', err);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [orgId]);

  // Status transition execution with optimistic UI & rollback
  const executeStatusTransition = async (load: LoadWithRelations, newStatus: PipelineStatus) => {
    if (!canMove) {
      showAlert('warning', 'Your role permissions do not allow modifying load statuses.');
      return;
    }

    const previousLoads = [...loads];
    const previousStatus = load.pipeline_status;

    // Optimistic UI update
    setLoads((prev) =>
      prev.map((l) => (l.id === load.id ? { ...l, pipeline_status: newStatus } : l))
    );

    // If detail modal is currently showing this load, keep it in sync
    if (selectedLoadForDetail?.id === load.id) {
      setSelectedLoadForDetail((prev) => (prev ? { ...prev, pipeline_status: newStatus } : null));
    }

    try {
      await loadService.updateLoadStatus(orgId, load.id, newStatus);
      showAlert(
        'success',
        `Load ${load.load_number} moved to ${getPipelineStatusLabel(newStatus)}.`
      );
    } catch (err: unknown) {
      // Rollback on failure
      setLoads(previousLoads);
      if (selectedLoadForDetail?.id === load.id) {
        setSelectedLoadForDetail((prev) =>
          prev ? { ...prev, pipeline_status: previousStatus } : null
        );
      }
      const msg = err instanceof Error ? err.message : 'Failed to update load status.';
      showAlert('error', msg);
    }
  };

  // Status change handler that runs transition validation and confirmation flow
  const handleStatusChangeRequest = (load: LoadWithRelations, newStatus: PipelineStatus) => {
    if (load.pipeline_status === newStatus) return;

    const validation = validateStatusTransition(load.pipeline_status, newStatus);

    if (!validation.allowed) {
      showAlert('warning', validation.reason || 'Invalid pipeline transition.');
      return;
    }

    if (validation.requiresConfirmation) {
      setConfirmationModal({
        isOpen: true,
        load,
        targetStatus: newStatus,
        title: validation.confirmationTitle || 'Confirm Status Change',
        prompt:
          validation.confirmationPrompt ||
          `Mark load ${load.load_number} as ${getPipelineStatusLabel(newStatus)}?`,
      });
      return;
    }

    executeStatusTransition(load, newStatus);
  };

  // Create load submit handler
  const handleCreateSave = async (
    input: CreateLoadInput | UpdateLoadInput,
    rateConFile?: File | null
  ) => {
    setIsSaving(true);
    try {
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
          console.error('Failed to attach Rate Con document after load creation in pipeline:', docErr);
        }
      }

      await loadData();
      setIsCreateModalOpen(false);
      showAlert('success', `Load ${(input as CreateLoadInput).load_number} booked successfully.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save load.';
      showAlert('error', msg);
      throw err;
    } finally {
      setIsSaving(false);
    }
  };

  // Edit load submit handler
  const handleEditSave = async (input: CreateLoadInput | UpdateLoadInput) => {
    if (!loadToEdit) return;
    setIsSaving(true);
    try {
      const updated = await loadService.updateLoad(orgId, loadToEdit.id, input as UpdateLoadInput);
      await loadData();
      setLoadToEdit(null);
      if (selectedLoadForDetail?.id === updated.id) {
        setSelectedLoadForDetail(updated);
      }
      showAlert('success', `Load ${updated.load_number} updated successfully.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update load.';
      showAlert('error', msg);
      throw err;
    } finally {
      setIsSaving(false);
    }
  };

  // Filtered dataset
  const filteredLoads = useMemo(() => {
    const today = getLocalDateString(new Date(), operationalTimezone);

    return loads.filter((load) => {
      // Search
      if (filters.search) {
        const query = filters.search.toLowerCase().trim();
        const matchesLoadNum = load.load_number.toLowerCase().includes(query);
        const matchesOrigin =
          load.origin_city.toLowerCase().includes(query) ||
          load.origin_state.toLowerCase().includes(query);
        const matchesDest =
          load.dest_city.toLowerCase().includes(query) ||
          load.dest_state.toLowerCase().includes(query);
        const matchesClient = load.client?.company_name?.toLowerCase().includes(query) || false;
        const matchesBroker = load.broker?.company_name?.toLowerCase().includes(query) || false;
        const matchesTruck = load.truck?.truck_number?.toLowerCase().includes(query) || false;
        const matchesDriver = load.driver?.full_name?.toLowerCase().includes(query) || false;
        const matchesCommodity = load.commodity?.toLowerCase().includes(query) || false;

        if (
          !matchesLoadNum &&
          !matchesOrigin &&
          !matchesDest &&
          !matchesClient &&
          !matchesBroker &&
          !matchesTruck &&
          !matchesDriver &&
          !matchesCommodity
        ) {
          return false;
        }
      }

      // Client filter
      if (filters.clientId && load.client_id !== filters.clientId) {
        return false;
      }

      // Broker filter
      if (filters.brokerId && load.broker_id !== filters.brokerId) {
        return false;
      }

      // Equipment filter
      if (filters.equipmentType && load.equipment_type !== filters.equipmentType) {
        return false;
      }

      // Date range filter
      if (filters.dateRange && filters.dateRange !== 'all') {
        const pickupDate = load.pickup_datetime
          ? getLocalDateString(load.pickup_datetime, operationalTimezone)
          : null;
        const delivDate = load.delivery_datetime
          ? getLocalDateString(load.delivery_datetime, operationalTimezone)
          : null;

        if (filters.dateRange === 'today') {
          if (pickupDate !== today && delivDate !== today) return false;
        } else if (filters.dateRange === 'upcoming') {
          if ((!pickupDate || pickupDate < today) && (!delivDate || delivDate < today)) return false;
        } else if (filters.dateRange === 'past') {
          if (!delivDate || delivDate >= today) return false;
        }
      }

      return true;
    });
  }, [loads, filters, operationalTimezone]);

  // Overall pipeline metrics summary
  const pipelineMetrics = useMemo(() => {
    let totalGross = 0;
    let totalLoadedMiles = 0;
    let activeLoadsCount = 0;

    loads.forEach((l) => {
      totalGross += Number(l.rate || 0);
      totalLoadedMiles += Number(l.loaded_miles || 0);
      if (l.pipeline_status !== 'paid') {
        activeLoadsCount++;
      }
    });

    return {
      totalLoads: loads.length,
      activeLoads: activeLoadsCount,
      totalGross,
      totalLoadedMiles,
    };
  }, [loads]);

  return (
    <div id="pipeline-orchestrator-view" className="space-y-5">
      {/* Header & Quick Action Hierarchy */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-1">
        <div>
          <div className="flex items-center gap-2.5">
            <Kanban className="w-5 h-5 sm:w-6 sm:h-6 text-sky-400" />
            <h1 className="text-xl sm:text-2xl font-bold text-slate-100 tracking-tight">
              Load Pipeline Flow
            </h1>
            <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-sky-950/80 text-sky-300 border border-sky-800/60 font-semibold font-mono">
              7-Stage Lifecycle
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Real-time visual freight board. Move loads across Sourced &rarr; Negotiating &rarr; Booked &rarr; In Transit &rarr; Delivered &rarr; Invoiced &rarr; Paid.
          </p>
        </div>

        {/* Action Controls Hierarchy */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-2.5 self-start lg:self-auto">
          {/* Secondary Tools Group */}
          <div className="inline-flex items-center bg-slate-900/90 p-1 border border-slate-800/90 rounded-xl shadow-xs">
            <button
              id="pipeline-refresh-btn"
              type="button"
              onClick={loadData}
              disabled={isLoading}
              className="p-1.5 text-slate-300 hover:text-slate-100 hover:bg-slate-800/90 rounded-lg transition-colors cursor-pointer"
              title="Refresh Pipeline"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-sky-400' : ''}`} />
            </button>
          </div>

          {/* Strong Secondary Navigation: Operations Calendar */}
          {onNavigate && (
            <button
              id="pipeline-calendar-btn"
              type="button"
              onClick={() => onNavigate('calendar')}
              className="px-3.5 py-2 text-xs font-semibold text-slate-200 hover:text-white bg-slate-800/90 hover:bg-slate-700 border border-slate-700/80 rounded-xl shadow-xs transition-colors cursor-pointer inline-flex items-center gap-1.5 shrink-0"
            >
              <Calendar className="w-3.5 h-3.5 text-amber-400" />
              <span>Operations Calendar</span>
            </button>
          )}

          {/* Dominant Primary CTA: Book New Load */}
          {canEdit && (
            <button
              id="pipeline-create-load-btn"
              type="button"
              onClick={() => {
                if (onNewLoadClick) {
                  onNewLoadClick();
                } else {
                  setLoadToEdit(null);
                  setIsCreateModalOpen(true);
                }
              }}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl shadow-sm transition-colors cursor-pointer shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>Book New Load</span>
            </button>
          )}
        </div>
      </div>

      {/* Floating Alert Notifications Banner */}
      {alertNotification && (
        <div
          id="pipeline-alert-banner"
          className={`fixed top-5 right-5 z-50 max-w-md p-3.5 rounded-xl border flex items-center justify-between gap-3 text-xs sm:text-sm transition-all duration-200 shadow-2xl backdrop-blur-sm animate-in fade-in slide-in-from-top-2 ${
            alertNotification.type === 'success'
              ? 'bg-emerald-950/90 text-emerald-200 border-emerald-800/80'
              : alertNotification.type === 'warning'
              ? 'bg-amber-950/90 text-amber-200 border-amber-800/80'
              : alertNotification.type === 'error'
              ? 'bg-rose-950/90 text-rose-200 border-rose-800/80'
              : 'bg-sky-950/90 text-sky-200 border-sky-800/80'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {alertNotification.type === 'success' && <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />}
            {alertNotification.type === 'warning' && <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />}
            {alertNotification.type === 'error' && <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />}
            {alertNotification.type === 'info' && <Info className="w-4 h-4 shrink-0 text-sky-400" />}
            <span>{alertNotification.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setAlertNotification(null)}
            className="text-slate-400 hover:text-slate-200 p-0.5 rounded cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Pipeline Quick Stats Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800/80 flex items-center justify-between shadow-xs">
          <div>
            <span className="text-[10px] text-slate-400 uppercase font-semibold tracking-wider">Active Dispatches</span>
            <p className="text-lg sm:text-xl font-bold font-mono tabular-nums text-slate-100 mt-0.5">{pipelineMetrics.activeLoads}</p>
          </div>
          <div className="p-1.5 rounded-lg bg-sky-950/40 border border-sky-800/40 text-sky-400">
            <Kanban className="w-4 h-4" />
          </div>
        </div>

        <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800/80 flex items-center justify-between shadow-xs">
          <div>
            <span className="text-[10px] text-slate-400 uppercase font-semibold tracking-wider">Total Pipeline Value</span>
            <p className="text-lg sm:text-xl font-bold font-mono tabular-nums text-emerald-400 mt-0.5">{formatCurrency(pipelineMetrics.totalGross)}</p>
          </div>
          <div className="p-1.5 rounded-lg bg-emerald-950/40 border border-emerald-800/40 text-emerald-400">
            <DollarSign className="w-4 h-4" />
          </div>
        </div>

        <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800/80 flex items-center justify-between shadow-xs">
          <div>
            <span className="text-[10px] text-slate-400 uppercase font-semibold tracking-wider">Total Fleet Volume</span>
            <p className="text-lg sm:text-xl font-bold font-mono tabular-nums text-slate-100 mt-0.5">{pipelineMetrics.totalLoads} Loads</p>
          </div>
          <div className="p-1.5 rounded-lg bg-indigo-950/40 border border-indigo-800/40 text-indigo-400">
            <TrendingUp className="w-4 h-4" />
          </div>
        </div>

        <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800/80 flex items-center justify-between shadow-xs">
          <div>
            <span className="text-[10px] text-slate-400 uppercase font-semibold tracking-wider">Loaded Distance</span>
            <p className="text-lg sm:text-xl font-bold font-mono tabular-nums text-slate-100 mt-0.5">{pipelineMetrics.totalLoadedMiles.toLocaleString()} mi</p>
          </div>
          <span className="text-xs font-mono tabular-nums font-bold text-slate-300 px-2 py-1 rounded-lg bg-slate-800 border border-slate-700/60">
            {pipelineMetrics.totalLoads > 0 ? (pipelineMetrics.totalGross / Math.max(1, pipelineMetrics.totalLoadedMiles)).toFixed(2) : '0.00'}/mi
          </span>
        </div>
      </div>

      {/* Filters Toolbar */}
      <PipelineFilters
        filters={filters}
        onFilterChange={setFilters}
        clients={clients}
        brokers={brokers}
        totalLoadsCount={loads.length}
        filteredLoadsCount={filteredLoads.length}
      />

      {/* Loading Skeleton / Error / Kanban Board */}
      {isLoading ? (
        <div
          id="pipeline-loading-skeleton"
          className="w-full overflow-x-auto overflow-y-hidden pb-4 pt-1 select-none scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-slate-900"
        >
          <div className="flex gap-4 w-max min-w-full items-start animate-pulse pb-2">
            {PIPELINE_COLUMNS.map((c) => (
              <div
                key={c.id}
                className="flex flex-col w-[300px] min-w-[280px] max-w-[320px] shrink-0 rounded-2xl bg-slate-900/60 border border-slate-800/80 max-h-[calc(100vh-280px)] min-h-[380px] overflow-hidden"
              >
                {/* Column Header Skeleton */}
                <div className="p-3.5 bg-slate-950/80 border-b border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="h-5 w-24 bg-slate-800 rounded-md" />
                    <div className="h-5 w-6 bg-slate-800 rounded-full" />
                  </div>
                  <div className="flex items-center justify-between pt-1 border-t border-slate-800/60">
                    <div className="h-3.5 w-16 bg-slate-800/80 rounded" />
                    <div className="h-3.5 w-12 bg-slate-800/80 rounded" />
                  </div>
                </div>

                {/* Column Body Cards Skeleton */}
                <div className="p-3 space-y-3 min-h-[380px]">
                  <div className="rounded-xl bg-slate-900/90 border border-slate-800/90 p-3.5 space-y-3">
                    <div className="flex justify-between items-center">
                      <div className="h-4 w-24 bg-slate-800 rounded" />
                      <div className="h-4 w-12 bg-slate-800 rounded" />
                    </div>
                    <div className="h-10 bg-slate-950/80 rounded-lg" />
                    <div className="h-4 w-full bg-slate-800/60 rounded" />
                    <div className="h-4 w-2/3 bg-slate-800/60 rounded" />
                  </div>
                  <div className="rounded-xl bg-slate-900/90 border border-slate-800/90 p-3.5 space-y-3">
                    <div className="flex justify-between items-center">
                      <div className="h-4 w-20 bg-slate-800 rounded" />
                      <div className="h-4 w-14 bg-slate-800 rounded" />
                    </div>
                    <div className="h-10 bg-slate-950/80 rounded-lg" />
                    <div className="h-4 w-4/5 bg-slate-800/60 rounded" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : error ? (
        <div
          id="pipeline-error-container"
          className="p-8 text-center rounded-2xl bg-rose-950/20 border border-rose-900/40 space-y-3"
        >
          <AlertCircle className="w-8 h-8 text-rose-400 mx-auto" />
          <h3 className="text-base font-semibold text-slate-100">Failed to Load Pipeline</h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto">{error}</p>
          <button
            type="button"
            onClick={loadData}
            className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 rounded-lg cursor-pointer transition-colors"
          >
            Retry Loading
          </button>
        </div>
      ) : (
        <PipelineBoard
          loads={filteredLoads}
          canMove={canMove}
          canEdit={canEdit}
          onViewLoad={(load) => setSelectedLoadForDetail(load)}
          onEditLoad={(load) => setLoadToEdit(load)}
          onStatusChangeRequest={handleStatusChangeRequest}
        />
      )}

      {/* Reuse Existing LoadDetailModal */}
      {selectedLoadForDetail && (
        <LoadDetailModal
          isOpen={Boolean(selectedLoadForDetail)}
          onClose={() => setSelectedLoadForDetail(null)}
          load={selectedLoadForDetail}
          onEdit={(load) => {
            setSelectedLoadForDetail(null);
            setLoadToEdit(load);
          }}
          onStatusChange={async (loadId, newStatus) => {
            const current = loads.find((l) => l.id === loadId);
            if (current) {
              handleStatusChangeRequest(current, newStatus);
            }
          }}
          onCheckCallUpdated={async (loadId) => {
            try {
              const freshLoad = await loadService.getLoad(orgId, loadId);
              if (freshLoad) {
                setLoads((prev) => prev.map((l) => (l.id === loadId ? freshLoad : l)));
                if (selectedLoadForDetail?.id === loadId) {
                  setSelectedLoadForDetail(freshLoad);
                }
              } else {
                setLoads((prev) => prev.map((l) => (l.id === loadId ? { ...l } : l)));
              }
            } catch {
              setLoads((prev) => prev.map((l) => (l.id === loadId ? { ...l } : l)));
            }
          }}
          canEdit={canEdit}
        />
      )}

      {/* Reuse Existing LoadModal for Edit */}
      {loadToEdit && (
        <LoadModal
          isOpen={Boolean(loadToEdit)}
          onClose={() => setLoadToEdit(null)}
          onSave={handleEditSave}
          initialLoad={loadToEdit}
          clients={clients}
          brokers={brokers}
          trucks={trucks}
          drivers={drivers}
          isSaving={isSaving}
          organizationId={activeOrganization?.id}
        />
      )}

      {/* Reuse Existing LoadModal for Create */}
      {isCreateModalOpen && (
        <LoadModal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          onSave={handleCreateSave}
          clients={clients}
          brokers={brokers}
          trucks={trucks}
          drivers={drivers}
          nextLoadNumber={nextLoadNumber}
          isSaving={isSaving}
          organizationId={activeOrganization?.id}
        />
      )}

      {/* Financial Settlement Confirmation Modal */}
      {confirmationModal && (
        <Modal
          id="pipeline-status-confirm-modal"
          isOpen={confirmationModal.isOpen}
          onClose={() => setConfirmationModal(null)}
          title={confirmationModal.title}
          maxWidth="md"
        >
          <div className="p-5 space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-amber-950/60 text-amber-400 border border-amber-800/60 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-semibold text-slate-100">
                  {confirmationModal.title}
                </h4>
                <p className="text-xs text-slate-300">
                  {confirmationModal.prompt}
                </p>
                <div className="p-2.5 mt-2 rounded-lg bg-slate-950 border border-slate-800 font-mono text-xs space-y-1">
                  <div className="flex justify-between text-slate-400">
                    <span>Load:</span>
                    <strong className="text-sky-400">{confirmationModal.load.load_number}</strong>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Gross Rate:</span>
                    <strong className="text-emerald-400">{formatCurrency(confirmationModal.load.rate)}</strong>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Target Status:</span>
                    <strong className="text-slate-100 uppercase">{getPipelineStatusLabel(confirmationModal.targetStatus)}</strong>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setConfirmationModal(null)}
                className="px-3.5 py-2 text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const { load, targetStatus } = confirmationModal;
                  setConfirmationModal(null);
                  executeStatusTransition(load, targetStatus);
                }}
                className="px-4 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 rounded-lg transition-colors cursor-pointer"
              >
                Confirm Transition
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
