import React from 'react';
import {
  MapFilterState,
  MapFilterStatus,
  MapLoadRoute,
  MapStats,
} from '../mapTypes.ts';
import { Client, Driver, Truck } from '../../../types/domain.types.ts';
import { LoadWithRelations } from '../../loads/loadTypes.ts';
import { StatusBadge } from '../../../components/common/StatusBadge.tsx';
import { useTimezone } from '../../../contexts/TimezoneContext.tsx';
import { formatInTimezone } from '../../../lib/timezones.ts';
import { formatTimeSince, isOperationalException, CHECK_CALL_TYPE_SHORT_LABELS } from '../../checkcalls/checkCallTypes.ts';
import {
  Search,
  X,
  Filter,
  Truck as TruckIcon,
  UserCheck,
  Building2,
  Calendar,
  Radio,
  ArrowRight,
  ChevronRight,
  RotateCcw,
  Navigation,
  Eye,
  AlertTriangle,
} from 'lucide-react';

interface MapControlPanelProps {
  routes: MapLoadRoute[];
  filteredRoutes: MapLoadRoute[];
  clients: Client[];
  drivers: Driver[];
  trucks: Truck[];
  stats: MapStats;
  filters: MapFilterState;
  onFilterChange: (updates: Partial<MapFilterState>) => void;
  onResetFilters: () => void;
  selectedLoadId: string | null;
  onSelectLoad: (loadId: string) => void;
  onOpenLoadDetail: (load: LoadWithRelations) => void;
}

export const MapControlPanel: React.FC<MapControlPanelProps> = ({
  routes,
  filteredRoutes,
  clients,
  drivers,
  trucks,
  stats,
  filters,
  onFilterChange,
  onResetFilters,
  selectedLoadId,
  onSelectLoad,
  onOpenLoadDetail,
}) => {
  const { operationalTimezone } = useTimezone();
  const statusOptions: { id: MapFilterStatus; label: string; count?: number }[] = [
    { id: 'all_active', label: 'All Active', count: stats.totalActiveLoads },
    { id: 'in_transit', label: 'In Transit', count: stats.inTransitCount },
    { id: 'booked', label: 'Booked', count: stats.bookedCount },
    { id: 'all', label: 'All Loads', count: routes.length },
  ];

  const hasActiveFilters =
    filters.search.trim() !== '' ||
    filters.statusFilter !== 'all_active' ||
    filters.clientId !== 'all' ||
    filters.driverId !== 'all';

  return (
    <div
      id="map-control-panel"
      className="flex flex-col h-full bg-slate-950 border-r border-slate-800/80 w-full overflow-hidden select-none"
    >
      {/* Panel Header & KPI Strip */}
      <div className="p-3.5 sm:p-4 border-b border-slate-800/80 bg-slate-900/60 shrink-0 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Navigation className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-100 tracking-tight leading-none">
                Dispatch Operations Map
              </h2>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {filteredRoutes.length} of {routes.length} loads visible
              </p>
            </div>
          </div>

          {hasActiveFilters && (
            <button
              id="map-reset-filters-btn"
              type="button"
              onClick={onResetFilters}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700/60 rounded-lg text-xs font-semibold text-slate-200 hover:text-white transition-colors cursor-pointer shrink-0"
              title="Reset all filters"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
              <span>Reset Filters</span>
            </button>
          )}
        </div>

        {/* Quick KPI Counters */}
        <div className="grid grid-cols-3 gap-2">
          <div className="p-2 rounded-lg bg-slate-950/70 border border-slate-800/80">
            <span className="text-[10px] text-slate-400 uppercase font-medium block">Active</span>
            <span className="text-sm font-bold text-slate-100 font-mono">{stats.totalActiveLoads}</span>
          </div>
          <div className="p-2 rounded-lg bg-slate-950/70 border border-slate-800/80">
            <span className="text-[10px] text-purple-400 uppercase font-medium block">In Transit</span>
            <span className="text-sm font-bold text-purple-300 font-mono">{stats.inTransitCount}</span>
          </div>
          <div className="p-2 rounded-lg bg-slate-950/70 border border-slate-800/80">
            <span className="text-[10px] text-amber-400 uppercase font-medium block">Check-Ins</span>
            <span className="text-sm font-bold text-amber-300 font-mono">{stats.withCheckCallsCount}</span>
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            id="map-search-input"
            type="text"
            placeholder="Search load #, city, carrier, driver..."
            value={filters.search}
            onChange={(e) => onFilterChange({ search: e.target.value })}
            className="w-full pl-8 pr-8 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
          />
          {filters.search && (
            <button
              onClick={() => onFilterChange({ search: '' })}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 cursor-pointer p-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Status Filter Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto pb-0.5 no-scrollbar">
          {statusOptions.map((opt) => {
            const isActive = filters.statusFilter === opt.id;
            return (
              <button
                key={opt.id}
                id={`map-filter-tab-${opt.id}`}
                onClick={() => onFilterChange({ statusFilter: opt.id })}
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold whitespace-nowrap cursor-pointer transition-colors ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-slate-950 text-slate-400 hover:text-slate-200 hover:bg-slate-800/70 border border-slate-800/60'
                }`}
              >
                <span>{opt.label}</span>
                {typeof opt.count === 'number' && (
                  <span
                    className={`ml-1.5 px-1 py-0.2 rounded text-[10px] font-mono ${
                      isActive ? 'bg-indigo-800/80 text-white' : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {opt.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Dropdown Filters (Carrier & Driver) */}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <div>
            <label className="text-[10px] text-slate-400 font-medium block mb-1">Carrier Client</label>
            <select
              id="map-client-filter"
              value={filters.clientId}
              onChange={(e) => onFilterChange({ clientId: e.target.value })}
              className="w-full px-2 py-1 bg-slate-950 border border-slate-800 rounded-md text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
            >
              <option value="all">All Carriers ({clients.length})</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.company_name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[10px] text-slate-400 font-medium block mb-1">Assigned Driver</label>
            <select
              id="map-driver-filter"
              value={filters.driverId}
              onChange={(e) => onFilterChange({ driverId: e.target.value })}
              className="w-full px-2 py-1 bg-slate-950 border border-slate-800 rounded-md text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
            >
              <option value="all">All Drivers ({drivers.length})</option>
              {drivers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.full_name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Scrollable Load Cards List */}
      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2.5 overscroll-contain">
        {filteredRoutes.length === 0 ? (
          <div className="p-6 text-center rounded-xl border border-dashed border-slate-800/80 bg-slate-900/40 text-slate-400">
            <Filter className="w-8 h-8 text-slate-500 mx-auto mb-2 opacity-60" />
            <h4 className="text-xs font-semibold text-slate-300">No matching active loads</h4>
            <p className="text-[11px] text-slate-500 mt-1">
              Try adjusting your search terms or filter criteria.
            </p>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={onResetFilters}
                className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700/60 rounded-lg text-xs font-semibold text-slate-200 hover:text-white transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
                <span>Reset Filters</span>
              </button>
            )}
          </div>
        ) : (
          filteredRoutes.map((route) => {
            const { load, latestCheckCall } = route;
            const isSelected = load.id === selectedLoadId;
            const hasCheckCall = Boolean(latestCheckCall);
            const isException =
              latestCheckCall &&
              isOperationalException(latestCheckCall.call_type, latestCheckCall.status);

            const pickupTime = load.pickup_datetime
              ? formatInTimezone(load.pickup_datetime, operationalTimezone, {
                  includeDate: true,
                  includeTime: false,
                  includeTimezoneCode: false,
                })
              : null;
            const deliveryTime = load.delivery_datetime
              ? formatInTimezone(load.delivery_datetime, operationalTimezone, {
                  includeDate: true,
                  includeTime: false,
                  includeTimezoneCode: false,
                })
              : null;

            return (
              <div
                key={load.id}
                id={`map-load-card-${load.id}`}
                onClick={() => onSelectLoad(load.id)}
                className={`p-3 rounded-xl border transition-all cursor-pointer select-none text-left relative ${
                  isSelected
                    ? 'bg-indigo-950/40 border-indigo-500/80 shadow-md shadow-indigo-950/40 ring-1 ring-indigo-500/40'
                    : 'bg-slate-900/80 hover:bg-slate-900 border-slate-800/90 hover:border-slate-700'
                }`}
              >
                {/* Header Row: Load Number & Status Badge */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="font-mono text-xs font-bold text-slate-100 truncate">
                      {load.load_number}
                    </span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 border border-slate-700 uppercase font-mono">
                      {load.equipment_type.replace('_', ' ')}
                    </span>
                  </div>
                  <StatusBadge status={load.pipeline_status} type="pipeline" size="sm" />
                </div>

                {/* Carrier & Assigned Driver */}
                <div className="mt-2 text-[11px] text-slate-400 space-y-0.5">
                  <div className="flex items-center gap-1.5 truncate">
                    <Building2 className="w-3 h-3 text-slate-500 shrink-0" />
                    <span className="text-slate-300 font-medium truncate">
                      {load.client?.company_name || 'Unassigned Carrier'}
                    </span>
                  </div>
                  {(load.driver?.full_name || load.truck?.truck_number) && (
                    <div className="flex items-center gap-1.5 truncate text-[10px]">
                      <UserCheck className="w-3 h-3 text-slate-500 shrink-0" />
                      <span className="truncate">
                        {load.driver?.full_name || 'No driver'} &bull; Truck #{load.truck?.truck_number || 'N/A'}
                      </span>
                    </div>
                  )}
                </div>

                {/* Route Sequence Badge: Origin -> Destination */}
                <div className="mt-2.5 pt-2 border-t border-slate-800/70 flex items-center justify-between text-xs font-medium">
                  <div className="flex items-center gap-1 text-emerald-300">
                    <span className="w-3.5 h-3.5 rounded-full bg-emerald-950 border border-emerald-700 text-emerald-300 flex items-center justify-center text-[9px] font-bold">
                      1
                    </span>
                    <span className="truncate max-w-[90px]">
                      {load.origin_city}, {load.origin_state}
                    </span>
                  </div>

                  <ArrowRight className="w-3 h-3 text-slate-600 shrink-0 mx-1" />

                  <div className="flex items-center gap-1 text-indigo-300">
                    <span className="w-3.5 h-3.5 rounded-full bg-indigo-950 border border-indigo-700 text-indigo-300 flex items-center justify-center text-[9px] font-bold">
                      2
                    </span>
                    <span className="truncate max-w-[90px]">
                      {load.dest_city}, {load.dest_state}
                    </span>
                  </div>
                </div>

                {/* Last Verified Check-Call Info Banner */}
                {hasCheckCall && latestCheckCall && (
                  <div
                    className={`mt-2 p-1.5 rounded-md text-[10px] flex items-center justify-between gap-1.5 border ${
                      isException
                        ? 'bg-rose-950/40 border-rose-800/50 text-rose-300'
                        : 'bg-amber-950/40 border-amber-800/50 text-amber-300'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 truncate">
                      <Radio className="w-3 h-3 shrink-0 animate-pulse" />
                      <span className="truncate font-medium">
                        Last reported:{' '}
                        {latestCheckCall.location_city && latestCheckCall.location_state
                          ? `${latestCheckCall.location_city}, ${latestCheckCall.location_state}`
                          : 'Location recorded'}{' '}
                        ({CHECK_CALL_TYPE_SHORT_LABELS[latestCheckCall.call_type] || 'Update'})
                      </span>
                    </div>
                    <span className="text-slate-400 text-[9px] shrink-0">
                      {formatTimeSince(latestCheckCall.created_at)}
                    </span>
                  </div>
                )}

                {/* Footer Action */}
                <div className="mt-2.5 pt-2 border-t border-slate-800/60 flex items-center justify-between text-[11px]">
                  <span className="text-slate-500 font-mono text-[10px]">
                    {load.loaded_miles ? `${load.loaded_miles} mi` : ''}
                    {pickupTime ? ` &bull; PU: ${pickupTime}` : ''}
                  </span>
                  <button
                    id={`map-open-load-detail-btn-${load.id}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenLoadDetail(load);
                    }}
                    className="text-indigo-400 hover:text-indigo-300 font-semibold inline-flex items-center gap-1 cursor-pointer transition-colors py-0.5 px-1.5 rounded hover:bg-indigo-950/50"
                  >
                    <Eye className="w-3 h-3" />
                    <span>View Details</span>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
