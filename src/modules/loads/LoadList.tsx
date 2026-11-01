import React, { useState } from 'react';
import {
  LoadWithRelations,
  LoadFilterCriteria,
  PIPELINE_STATUS_OPTIONS,
  EQUIPMENT_TYPE_OPTIONS,
} from './loadTypes.ts';
import { getAllowedTransitions } from '../pipeline/pipelineTypes.ts';
import {
  Client,
  Broker,
  PipelineStatus,
  TeamMember,
} from '../../types/domain.types.ts';
import { StatusBadge } from '../../components/common/StatusBadge.tsx';
import { EmptyState } from '../../components/common/EmptyState.tsx';
import { useTimezone } from '../../contexts/TimezoneContext.tsx';
import { formatInTimezone } from '../../lib/timezones.ts';
import { formatCurrency, formatRPM, calculateProfitability } from '../../lib/calculations.ts';
import {
  PackageCheck,
  Search,
  Filter,
  RefreshCw,
  RotateCcw,
  Eye,
  Edit2,
  Trash2,
  MapPin,
  ArrowRight,
  Truck as TruckIcon,
  Building2,
  ShieldCheck,
  Calendar,
  AlertCircle,
  Users,
  UserCheck,
  CheckSquare,
  Square,
} from 'lucide-react';

interface LoadListProps {
  loads: LoadWithRelations[];
  clients: Client[];
  brokers: Broker[];
  teamMembers?: TeamMember[];
  isLoading: boolean;
  error: string | null;
  filters: LoadFilterCriteria;
  onFilterChange: (filters: LoadFilterCriteria) => void;
  onRefresh: () => void;
  onAddLoad: () => void;
  onViewLoad: (load: LoadWithRelations) => void;
  onEditLoad: (load: LoadWithRelations) => void;
  onDeleteLoad?: (load: LoadWithRelations) => void;
  onStatusChange?: (loadId: string, status: PipelineStatus) => Promise<void>;
  selectedLoadIds?: string[];
  onSelectLoad?: (loadId: string, selected: boolean) => void;
  onSelectAll?: (selected: boolean) => void;
  onBulkAssignClick?: () => void;
  canEdit: boolean;
  canDelete: boolean;
  trucksCount?: number;
  driversCount?: number;
  onNavigate?: (module: any) => void;
}

export const LoadList: React.FC<LoadListProps> = ({
  loads,
  clients,
  brokers,
  teamMembers = [],
  isLoading,
  error,
  filters,
  onFilterChange,
  onRefresh,
  onAddLoad,
  onViewLoad,
  onEditLoad,
  onDeleteLoad,
  onStatusChange,
  selectedLoadIds = [],
  onSelectLoad,
  onSelectAll,
  onBulkAssignClick,
  canEdit,
  canDelete,
  trucksCount,
  driversCount,
  onNavigate,
}) => {
  const { operationalTimezone } = useTimezone();
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);

  const handleStatusSelect = async (loadId: string, newStatus: PipelineStatus) => {
    if (!onStatusChange) return;
    setUpdatingStatusId(loadId);
    try {
      await onStatusChange(loadId, newStatus);
    } finally {
      setUpdatingStatusId(null);
    }
  };

  const isAllSelected =
    loads.length > 0 && loads.every((l) => selectedLoadIds.includes(l.id));
  const isPartiallySelected =
    selectedLoadIds.length > 0 && !isAllSelected;

  // Filter operational team members for the filter dropdown (Admin, Dispatcher, Staff)
  const activeTeamMembers = teamMembers.filter(
    (m) =>
      (m.role === 'owner_admin' || m.role === 'dispatcher' || m.role === 'staff') &&
      (m as any).status !== 'inactive'
  );

  const getRoleLabel = (role?: string | null) => {
    if (role === 'owner_admin') return 'Admin';
    if (role === 'dispatcher') return 'Dispatcher';
    if (role === 'staff') return 'Staff';
    return role ? role.charAt(0).toUpperCase() + role.slice(1) : 'Staff';
  };

  const hasActiveFilters = Boolean(
    (filters.search && filters.search.trim()) ||
    (filters.status && filters.status !== 'all') ||
    (filters.dispatcherId && filters.dispatcherId !== 'all') ||
    (filters.clientId && filters.clientId !== 'all') ||
    (filters.brokerId && filters.brokerId !== 'all') ||
    (filters.equipmentType && filters.equipmentType !== 'all') ||
    (filters.dateRange && filters.dateRange !== 'all')
  );

  const handleResetFilters = () => {
    onFilterChange({
      search: '',
      clientId: 'all',
      brokerId: 'all',
      equipmentType: 'all',
      status: 'all',
      dispatcherId: 'all',
      dateRange: 'all',
    });
  };

  return (
    <div id="load-list-container" className="space-y-4">
      {/* Search & Comprehensive Filters Bar */}
      <div className="bg-slate-900/90 border border-slate-800/90 rounded-xl p-3.5 sm:p-4 space-y-3 shadow-xs">
        <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
          {/* Main Search Input */}
          <div className="relative flex-1 min-w-[280px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              id="loads-search-input"
              type="text"
              placeholder="Search Load #, origin, dest, commodity, carrier, broker, dispatcher, driver..."
              value={filters.search || ''}
              onChange={(e) => onFilterChange({ ...filters, search: e.target.value })}
              className="w-full pl-10 pr-16 py-2 text-xs bg-slate-950/80 border border-slate-800 rounded-lg text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 transition-colors font-sans"
            />
            {filters.search && (
              <button
                type="button"
                onClick={() => onFilterChange({ ...filters, search: '' })}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-200 bg-slate-800/80 px-1.5 py-0.5 rounded cursor-pointer transition-colors"
              >
                Clear
              </button>
            )}
          </div>

          {/* Quick Refresh Action */}
          <div className="flex items-center gap-2 self-end lg:self-auto shrink-0">
            <button
              id="refresh-loads-btn"
              type="button"
              onClick={onRefresh}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-300 hover:text-slate-100 bg-slate-950/80 hover:bg-slate-800 border border-slate-800 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
              title="Reload loads from dispatch store"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-indigo-400' : 'text-slate-400'}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>
        </div>

        {/* Dropdown Filters Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 pt-2.5 border-t border-slate-800/70 text-xs">
          {/* Status Filter */}
          <div>
            <select
              id="filter-status-select"
              value={filters.status || 'all'}
              onChange={(e) => onFilterChange({ ...filters, status: e.target.value })}
              className="w-full px-2.5 py-1.5 bg-slate-950/80 border border-slate-800 rounded-lg text-slate-300 focus:outline-none focus:border-indigo-500 cursor-pointer font-medium"
            >
              <option value="all">Status: All</option>
              {PIPELINE_STATUS_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          {/* Assigned To Filter */}
          <div>
            <select
              id="filter-dispatcher-select"
              value={filters.dispatcherId || 'all'}
              onChange={(e) => onFilterChange({ ...filters, dispatcherId: e.target.value })}
              className="w-full px-2.5 py-1.5 bg-slate-950/80 border border-slate-800 rounded-lg text-slate-300 focus:outline-none focus:border-indigo-500 cursor-pointer font-medium"
            >
              <option value="all">Assigned: All</option>
              <option value="me">My Loads (Assigned to Me)</option>
              <option value="unassigned">⚠️ Unassigned Loads</option>
              <optgroup label="Operational Team" className="bg-slate-900 text-slate-300">
                {activeTeamMembers.map((m) => (
                  <option key={m.user_id || m.id} value={m.user_id || m.id}>
                    {m.full_name} — {getRoleLabel(m.role)}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>

          {/* Client Filter */}
          <div>
            <select
              id="filter-client-select"
              value={filters.clientId || 'all'}
              onChange={(e) => onFilterChange({ ...filters, clientId: e.target.value })}
              className="w-full px-2.5 py-1.5 bg-slate-950/80 border border-slate-800 rounded-lg text-slate-300 focus:outline-none focus:border-indigo-500 cursor-pointer font-medium"
            >
              <option value="all">Carrier: All</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.company_name}
                </option>
              ))}
            </select>
          </div>

          {/* Broker Filter */}
          <div>
            <select
              id="filter-broker-select"
              value={filters.brokerId || 'all'}
              onChange={(e) => onFilterChange({ ...filters, brokerId: e.target.value })}
              className="w-full px-2.5 py-1.5 bg-slate-950/80 border border-slate-800 rounded-lg text-slate-300 focus:outline-none focus:border-indigo-500 cursor-pointer font-medium"
            >
              <option value="all">Broker: All</option>
              {brokers.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.company_name}
                </option>
              ))}
            </select>
          </div>

          {/* Equipment Filter */}
          <div>
            <select
              id="filter-equipment-select"
              value={filters.equipmentType || 'all'}
              onChange={(e) => onFilterChange({ ...filters, equipmentType: e.target.value })}
              className="w-full px-2.5 py-1.5 bg-slate-950/80 border border-slate-800 rounded-lg text-slate-300 focus:outline-none focus:border-indigo-500 cursor-pointer font-medium"
            >
              <option value="all">Equip: All</option>
              {EQUIPMENT_TYPE_OPTIONS.map((eq) => (
                <option key={eq.value} value={eq.value}>
                  {eq.shortLabel}
                </option>
              ))}
            </select>
          </div>

          {/* Date Filter */}
          <div>
            <select
              id="filter-date-select"
              value={filters.dateRange || 'all'}
              onChange={(e) => onFilterChange({ ...filters, dateRange: e.target.value as any })}
              className="w-full px-2.5 py-1.5 bg-slate-950/80 border border-slate-800 rounded-lg text-slate-300 focus:outline-none focus:border-indigo-500 cursor-pointer font-medium"
            >
              <option value="all">Schedule: All</option>
              <option value="today">Today's Pickups</option>
              <option value="upcoming">Upcoming Loads</option>
              <option value="past">Completed / Past</option>
            </select>
          </div>

          {/* Reset Filters Action */}
          {hasActiveFilters && (
            <div className="col-span-2 sm:col-span-3 lg:col-span-6 flex justify-end pt-1">
              <button
                id="loads-reset-filters-btn"
                type="button"
                onClick={handleResetFilters}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700/90 border border-slate-700/60 rounded-lg text-xs font-semibold text-slate-200 hover:text-white transition-colors cursor-pointer shadow-xs"
                title="Reset all Load & Dispatch filters"
              >
                <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
                <span>Reset Filters</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Bulk Action Toolbar */}
      {selectedLoadIds.length > 0 && (
        <div
          id="loads-bulk-action-bar"
          className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 sm:p-3.5 bg-slate-900 border border-indigo-500/40 rounded-xl text-slate-200 animate-in fade-in slide-in-from-top-2 duration-200 shadow-lg"
        >
          <div className="flex items-center gap-3">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-white text-xs font-bold font-mono shadow-xs shrink-0">
              {selectedLoadIds.length}
            </span>
            <div>
              <span className="text-xs font-bold text-slate-100">
                {selectedLoadIds.length} {selectedLoadIds.length === 1 ? 'load selected' : 'loads selected'}
              </span>
              <p className="text-[11px] text-slate-400 hidden sm:block">
                Ready for multi-load team assignment or fleet operations
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            {canEdit && onBulkAssignClick && (
              <button
                id="btn-bulk-assign-dispatcher"
                type="button"
                onClick={onBulkAssignClick}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-sm transition-colors cursor-pointer"
              >
                <Users className="w-3.5 h-3.5" />
                <span>Assign to Team ({selectedLoadIds.length})</span>
              </button>
            )}

            {onSelectAll && (
              <button
                id="btn-clear-load-selection"
                type="button"
                onClick={() => onSelectAll(false)}
                className="px-3 py-2 text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              >
                Clear Selection
              </button>
            )}
          </div>
        </div>
      )}

      {/* Error Alert */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
          <div className="flex-1">
            <span className="font-semibold">Failed to load dispatch records:</span> {error}
          </div>
          <button
            type="button"
            onClick={onRefresh}
            className="px-3 py-1 bg-rose-900/60 hover:bg-rose-800 text-white rounded text-xs font-semibold"
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading Skeleton */}
      {isLoading && loads.length === 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 space-y-4">
          <div className="flex items-center justify-center gap-3 text-slate-400 text-xs font-semibold animate-pulse">
            <RefreshCw className="w-5 h-5 animate-spin text-indigo-400" />
            <span>Loading dispatch load roster...</span>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !error && loads.length === 0 && (
        <div className="p-8 bg-slate-900 border border-slate-800 rounded-xl">
          {filters.search || filters.clientId !== 'all' || filters.status !== 'all' || filters.dispatcherId !== 'all' ? (
            <EmptyState
              id="empty-loads-state"
              title="No Loads Found"
              description="No loads matched your active search and filter criteria. Try resetting filters."
              icon={PackageCheck}
              actionLabel={canEdit ? 'Create First Load' : undefined}
              onAction={canEdit ? onAddLoad : undefined}
            />
          ) : clients.length === 0 ? (
            <EmptyState
              id="empty-loads-no-clients"
              title="Add your first client"
              description="Every load must be associated with a carrier client."
              icon={Building2}
              actionLabel={canEdit && onNavigate ? 'Add Client' : undefined}
              onAction={() => onNavigate?.('clients')}
            />
          ) : (trucksCount !== undefined && trucksCount === 0) || (driversCount !== undefined && driversCount === 0) ? (
            <EmptyState
              id="empty-loads-missing-fleet"
              title="Complete fleet setup first"
              description={
                trucksCount === 0
                  ? "Power units must be registered for your carrier client before creating dispatch loads."
                  : "Drivers must be registered and assigned to your carrier client before creating dispatch loads."
              }
              icon={trucksCount === 0 ? TruckIcon : UserCheck}
              actionLabel={canEdit && onNavigate ? (trucksCount === 0 ? 'Add Truck' : 'Add Driver') : undefined}
              onAction={() => onNavigate?.(trucksCount === 0 ? 'trucks' : 'drivers')}
            />
          ) : (
            <EmptyState
              id="empty-loads-state"
              title="No Loads Found"
              description="Start dispatching by booking your first carrier freight load."
              icon={PackageCheck}
              actionLabel={canEdit ? 'Create First Load' : undefined}
              onAction={canEdit ? onAddLoad : undefined}
            />
          )}
        </div>
      )}

      {/* Dispatch Loads Table */}
      {!isLoading && loads.length > 0 && (
        <div className="bg-slate-900 border border-slate-800/90 rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950/95 text-slate-400 font-bold uppercase tracking-wider border-b border-slate-800 text-[10px]">
                <tr>
                  {/* Select All Checkbox */}
                  <th className="w-10 px-3 py-3.5 text-center">
                    <input
                      id="select-all-loads-checkbox"
                      type="checkbox"
                      checked={isAllSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = isPartiallySelected;
                      }}
                      onChange={(e) => onSelectAll?.(e.target.checked)}
                      aria-label="Select all displayed loads"
                      className="rounded border-slate-700 bg-slate-950 text-indigo-600 focus:ring-indigo-500/20 focus:ring-1 cursor-pointer h-4 w-4"
                    />
                  </th>
                  <th className="px-4 py-3.5">Load #</th>
                  <th className="px-4 py-3.5">Carrier / Fleet</th>
                  <th className="px-4 py-3.5">Broker / Shipper</th>
                  <th className="px-4 py-3.5">Route (Origin → Destination)</th>
                  <th className="px-3 py-3.5 text-center">Unit</th>
                  <th className="px-4 py-3.5">Driver</th>
                  <th className="px-4 py-3.5">Assigned To</th>
                  <th className="px-4 py-3.5">Pickup</th>
                  <th className="px-4 py-3.5">Delivery</th>
                  <th className="px-4 py-3.5 text-right font-mono">Rate</th>
                  <th className="px-4 py-3.5 text-right font-mono">RPM</th>
                  <th className="px-4 py-3.5">Status</th>
                  <th className="px-4 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-sans">
                {loads.map((load) => {
                  const totalMiles = (load.loaded_miles || 0) + (load.deadhead_miles || 0);
                  const metrics = calculateProfitability({
                    rate: load.rate,
                    loadedMiles: load.loaded_miles,
                    deadheadMiles: load.deadhead_miles,
                    fuelExpense: load.fuel_expense,
                    driverPay: load.driver_pay,
                    otherExpenses: load.other_expenses,
                  });
                  const isSelected = selectedLoadIds.includes(load.id);

                  return (
                    <tr
                      key={load.id}
                      id={`load-row-${load.id}`}
                      className={`transition-colors group cursor-pointer ${
                        isSelected
                          ? 'bg-indigo-950/40 hover:bg-indigo-950/60'
                          : 'hover:bg-slate-800/50'
                      }`}
                      onClick={() => onViewLoad(load)}
                    >
                      {/* Row Checkbox */}
                      <td
                        className="w-10 px-3 py-3.5 text-center"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          id={`select-load-checkbox-${load.id}`}
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => onSelectLoad?.(load.id, e.target.checked)}
                          aria-label={`Select load ${load.load_number}`}
                          className="rounded border-slate-700 bg-slate-950 text-indigo-600 focus:ring-indigo-500/20 focus:ring-1 cursor-pointer h-4 w-4"
                        />
                      </td>

                      {/* Load # */}
                      <td className="px-4 py-3.5 font-mono font-bold text-slate-100 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span className="group-hover:text-indigo-300 transition-colors">
                            {load.load_number}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-400 block font-sans font-medium uppercase tracking-wider mt-0.5">
                          {load.equipment_type.replace('_', ' ')}
                        </span>
                      </td>

                      {/* Client */}
                      <td className="px-4 py-3.5 text-slate-200">
                        <div className="font-semibold text-slate-100 truncate max-w-[140px]" title={load.client?.company_name || '—'}>
                          {load.client?.company_name || '—'}
                        </div>
                        <span className="text-[10px] text-slate-400 capitalize block mt-0.5">
                          {load.client?.client_type?.replace('_', ' ') || ''}
                        </span>
                      </td>

                      {/* Broker */}
                      <td className="px-4 py-3.5 text-slate-200">
                        <div className="font-semibold text-slate-200 truncate max-w-[130px]" title={load.broker?.company_name || '—'}>
                          {load.broker?.company_name || '—'}
                        </div>
                        {load.broker?.mc_number ? (
                          <span className="text-[10px] font-mono text-slate-400 block mt-0.5">
                            MC-{load.broker.mc_number}
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400 block mt-0.5">Broker</span>
                        )}
                      </td>

                      {/* Lane (Origin -> Dest) */}
                      <td className="px-4 py-3.5 font-medium text-slate-200 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-100 text-[13px]">
                            {load.origin_city}, {load.origin_state}
                          </span>
                          <ArrowRight className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                          <span className="font-bold text-slate-100 text-[13px]">
                            {load.dest_city}, {load.dest_state}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                          <span className="text-slate-300 font-medium">{load.loaded_miles} mi</span> loaded
                          {load.deadhead_miles ? ` (${totalMiles} mi total)` : ''}
                        </div>
                      </td>

                      {/* Truck */}
                      <td className="px-3 py-3.5 text-slate-300 whitespace-nowrap text-center">
                        {load.truck ? (
                          <span className="inline-flex items-center gap-1 font-mono font-semibold px-2 py-0.5 rounded bg-slate-800 text-amber-300 border border-slate-700/80 text-[11px]">
                            <TruckIcon className="w-3 h-3 text-amber-400" />
                            #{load.truck.truck_number}
                          </span>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </td>

                      {/* Driver */}
                      <td className="px-4 py-3.5 text-slate-300 whitespace-nowrap">
                        {load.driver ? (
                          <div className="truncate max-w-[120px]" title={load.driver.full_name}>
                            <span className="font-medium text-slate-200">{load.driver.full_name}</span>
                          </div>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </td>

                      {/* Assigned To (Operational Team) */}
                      <td className="px-4 py-3.5 text-slate-300 whitespace-nowrap">
                        {load.assigned_team && load.assigned_team.length > 0 ? (
                          load.assigned_team.length === 1 ? (
                            <div
                              className="flex items-center gap-2"
                              title={`${load.assigned_team[0].full_name} (${getRoleLabel(load.assigned_team[0].role)}) • ${load.assigned_team[0].email || ''}`}
                            >
                              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-950 text-indigo-300 border border-indigo-800/60 text-[10px] font-bold shrink-0">
                                {(load.assigned_team[0].full_name || 'U').charAt(0).toUpperCase()}
                              </div>
                              <div className="truncate max-w-[120px]">
                                <span className="font-semibold text-slate-200 text-xs block truncate">
                                  {load.assigned_team[0].full_name}
                                </span>
                                <span className="text-[10px] text-indigo-300/90 block font-medium">
                                  {getRoleLabel(load.assigned_team[0].role)}
                                </span>
                              </div>
                            </div>
                          ) : (
                            <div
                              className="flex items-center gap-1.5"
                              title={load.assigned_team.map((m) => `${m.full_name} (${getRoleLabel(m.role)})`).join(' • ')}
                            >
                              <div className="flex -space-x-1.5 overflow-hidden shrink-0">
                                {load.assigned_team.slice(0, 3).map((m, idx) => (
                                  <div
                                    key={m.user_id || m.id || idx}
                                    className="inline-block h-6 w-6 rounded-full ring-2 ring-slate-900 bg-indigo-950 text-indigo-300 border border-indigo-700/60 text-[10px] font-bold text-center leading-5"
                                  >
                                    {(m.full_name || 'U').charAt(0).toUpperCase()}
                                  </div>
                                ))}
                              </div>
                              <div className="truncate max-w-[130px]">
                                <span className="font-semibold text-slate-200 text-xs block truncate">
                                  {load.assigned_team[0].full_name}
                                </span>
                                <span className="inline-flex items-center gap-1 text-[10px] text-indigo-300 font-medium">
                                  +{load.assigned_team.length - 1} more
                                </span>
                              </div>
                            </div>
                          )
                        ) : load.dispatcher_profile ? (
                          <div
                            className="flex items-center gap-2"
                            title={`${load.dispatcher_profile.full_name} (${getRoleLabel(load.dispatcher_profile.role)}) • ${load.dispatcher_profile.email || ''}`}
                          >
                            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-950 text-indigo-300 border border-indigo-800/60 text-[10px] font-bold shrink-0">
                              {(load.dispatcher_profile.full_name || 'U').charAt(0).toUpperCase()}
                            </div>
                            <div className="truncate max-w-[120px]">
                              <span className="font-semibold text-slate-200 text-xs block truncate">
                                {load.dispatcher_profile.full_name}
                              </span>
                              <span className="text-[10px] text-indigo-300/90 block font-medium">
                                {getRoleLabel(load.dispatcher_profile.role)}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-400 bg-slate-800/60 px-2 py-0.5 rounded border border-slate-700/60">
                            <UserCheck className="w-3 h-3 text-slate-500" />
                            Unassigned
                          </span>
                        )}
                      </td>

                      {/* Pickup Date/Time */}
                      <td className="px-4 py-3.5 text-slate-300 whitespace-nowrap font-mono text-[11px]">
                        {load.pickup_datetime
                          ? formatInTimezone(load.pickup_datetime, operationalTimezone, {
                              includeDate: true,
                              includeTime: true,
                              includeTimezoneCode: false,
                            })
                          : '—'}
                      </td>

                      {/* Delivery Date/Time */}
                      <td className="px-4 py-3.5 text-slate-300 whitespace-nowrap font-mono text-[11px]">
                        {load.delivery_datetime
                          ? formatInTimezone(load.delivery_datetime, operationalTimezone, {
                              includeDate: true,
                              includeTime: true,
                              includeTimezoneCode: false,
                            })
                          : '—'}
                      </td>

                      {/* Rate */}
                      <td className="px-4 py-3.5 font-mono font-bold text-slate-100 text-sm text-right whitespace-nowrap">
                        {formatCurrency(load.rate)}
                      </td>

                      {/* RPM */}
                      <td className="px-4 py-3.5 font-mono text-sky-400 font-bold text-right whitespace-nowrap text-[12px]">
                        {formatRPM(metrics.rpm)}
                      </td>

                      {/* Status */}
                      <td
                        className="px-4 py-3.5 whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {canEdit && onStatusChange ? (
                          <select
                            value={load.pipeline_status}
                            disabled={updatingStatusId === load.id}
                            onChange={(e) => handleStatusSelect(load.id, e.target.value as PipelineStatus)}
                            className="px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-950/90 border border-slate-700 text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer shadow-xs"
                          >
                            {PIPELINE_STATUS_OPTIONS.map((opt) => {
                              const allowed = getAllowedTransitions(load.pipeline_status);
                              const isCurrent = opt.value === load.pipeline_status;
                              const isAllowed = isCurrent || allowed.includes(opt.value);
                              return (
                                <option key={opt.value} value={opt.value} disabled={!isAllowed}>
                                  {opt.label}{!isAllowed && !isCurrent ? ' (Invalid)' : ''}
                                </option>
                              );
                            })}
                          </select>
                        ) : (
                          <StatusBadge status={load.pipeline_status} type="pipeline" size="sm" />
                        )}
                      </td>

                      {/* Actions */}
                      <td
                        className="px-4 py-3.5 text-right whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => onViewLoad(load)}
                            className="p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                            title="View Full Load Details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          {canEdit && (
                            <button
                              type="button"
                              onClick={() => onEditLoad(load)}
                              className="p-1.5 text-slate-400 hover:text-indigo-300 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                              title="Edit Load"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                          )}

                          {canDelete && onDeleteLoad && (
                            <button
                              type="button"
                              onClick={() => onDeleteLoad(load)}
                              className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                              title="Delete Load"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Table Footer Count & Summary */}
          <div className="px-4 py-3 bg-slate-950/80 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
            <span>
              Showing <strong className="text-slate-200">{loads.length}</strong> active dispatch {loads.length === 1 ? 'load' : 'loads'}
              {selectedLoadIds.length > 0 && (
                <span className="ml-2 text-indigo-400 font-semibold">
                  ({selectedLoadIds.length} selected)
                </span>
              )}
            </span>
            <span className="text-[11px] font-mono text-slate-400">
              Operational Timezone: {operationalTimezone}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
