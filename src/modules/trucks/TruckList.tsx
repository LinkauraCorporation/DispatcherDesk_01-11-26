import React, { useState } from 'react';
import { TruckStatus, Client } from '../../types/domain.types.ts';
import { TruckWithClient } from './TruckDetailModal.tsx';
import { EQUIPMENT_TYPE_OPTIONS } from './TruckModal.tsx';
import { EmptyState } from '../../components/common/EmptyState.tsx';
import { StatusBadge } from '../../components/common/StatusBadge.tsx';
import {
  Search,
  Filter,
  Truck as TruckIcon,
  Eye,
  Edit2,
  Trash2,
  RefreshCw,
  MapPin,
  AlertTriangle,
  ChevronRight,
  Wrench,
  CheckCircle2,
  Power,
  Building2,
  RotateCcw,
} from 'lucide-react';

interface TruckListProps {
  trucks: TruckWithClient[];
  clients: Client[];
  isLoading: boolean;
  error: string | null;
  onRefresh: () => void;
  onViewDetails: (truck: TruckWithClient) => void;
  onEditTruck: (truck: TruckWithClient) => void;
  onChangeStatus: (truck: TruckWithClient, newStatus: TruckStatus) => void;
  onDeleteTruck?: (truck: TruckWithClient) => void;
  onAddTruck: () => void;
  canEdit: boolean;
  canDelete: boolean;
  togglingTruckId?: string | null;
  onNavigateToClients?: () => void;
}

export const TruckList: React.FC<TruckListProps> = ({
  trucks,
  clients,
  isLoading,
  error,
  onRefresh,
  onViewDetails,
  onEditTruck,
  onChangeStatus,
  onDeleteTruck,
  onAddTruck,
  canEdit,
  canDelete,
  togglingTruckId,
  onNavigateToClients,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [equipmentFilter, setEquipmentFilter] = useState<string>('all');
  const [clientFilter, setClientFilter] = useState<string>('all');

  const filteredTrucks = trucks.filter((t) => {
    const q = searchQuery.toLowerCase().trim();
    const clientName = t.client?.company_name?.toLowerCase() || '';
    const city = t.current_location_city?.toLowerCase() || '';
    const state = t.current_location_state?.toLowerCase() || '';
    const vin = t.vin?.toLowerCase() || '';
    const truckNo = t.truck_number.toLowerCase();

    const matchesSearch =
      !q ||
      truckNo.includes(q) ||
      clientName.includes(q) ||
      city.includes(q) ||
      state.includes(q) ||
      vin.includes(q);

    const matchesStatus = statusFilter === 'all' || t.status === statusFilter;
    const matchesEquipment = equipmentFilter === 'all' || t.equipment_type === equipmentFilter;
    const matchesClient =
      clientFilter === 'all'
        ? true
        : clientFilter === 'unassigned'
        ? !t.client_id
        : t.client_id === clientFilter;

    return matchesSearch && matchesStatus && matchesEquipment && matchesClient;
  });

  const hasActiveFilters = Boolean(
    searchQuery.trim() ||
    statusFilter !== 'all' ||
    equipmentFilter !== 'all' ||
    clientFilter !== 'all'
  );

  const clearFilters = () => {
    setSearchQuery('');
    setStatusFilter('all');
    setEquipmentFilter('all');
    setClientFilter('all');
  };

  return (
    <div id="trucks-list-container" className="space-y-4">
      {/* Search & Multi-Filter Bar */}
      <div className="bg-slate-900 border border-slate-800/80 rounded-xl p-3 sm:p-4 flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between shadow-xs">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            id="trucks-search-input"
            type="text"
            placeholder="Search unit #, carrier client, city, state, VIN..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Client Filter */}
          <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1">
            <Building2 className="w-3.5 h-3.5 text-slate-400" />
            <select
              id="trucks-client-filter"
              value={clientFilter}
              onChange={(e) => setClientFilter(e.target.value)}
              className="text-xs bg-transparent text-slate-200 focus:outline-none cursor-pointer max-w-[140px] truncate"
            >
              <option value="all" className="bg-slate-900 text-slate-200">
                All Clients
              </option>
              <option value="unassigned" className="bg-slate-900 text-slate-200">
                Unassigned Units
              </option>
              {clients.map((c) => (
                <option key={c.id} value={c.id} className="bg-slate-900 text-slate-200">
                  {c.company_name}
                </option>
              ))}
            </select>
          </div>

          {/* Equipment Filter */}
          <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              id="trucks-equipment-filter"
              value={equipmentFilter}
              onChange={(e) => setEquipmentFilter(e.target.value)}
              className="text-xs bg-transparent text-slate-200 focus:outline-none cursor-pointer"
            >
              <option value="all" className="bg-slate-900 text-slate-200">
                All Equipment
              </option>
              {EQUIPMENT_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value} className="bg-slate-900 text-slate-200">
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1">
            <span className="text-[11px] text-slate-400 font-medium">Status:</span>
            <select
              id="trucks-status-filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="text-xs bg-transparent text-slate-200 focus:outline-none cursor-pointer"
            >
              <option value="all" className="bg-slate-900 text-slate-200">
                All Statuses
              </option>
              <option value="active" className="bg-slate-900 text-slate-200">
                Active / Ready
              </option>
              <option value="maintenance" className="bg-slate-900 text-slate-200">
                In Shop / Maintenance
              </option>
              <option value="inactive" className="bg-slate-900 text-slate-200">
                Inactive / Parked
              </option>
            </select>
          </div>

          {hasActiveFilters && (
            <button
              id="trucks-reset-filters-btn"
              type="button"
              onClick={clearFilters}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700/60 rounded-lg text-xs font-semibold text-slate-200 hover:text-white transition-colors cursor-pointer shrink-0"
              title="Reset all filters"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
              <span>Reset Filters</span>
            </button>
          )}

          {/* Refresh Button */}
          <button
            id="trucks-refresh-btn"
            onClick={onRefresh}
            disabled={isLoading}
            title="Refresh truck roster"
            className="p-2 text-slate-400 hover:text-slate-200 bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
            aria-label="Refresh truck list"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-indigo-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div
          id="trucks-error-banner"
          className="p-4 bg-rose-950/40 border border-rose-800/80 rounded-xl flex items-center justify-between text-rose-200 text-xs"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={onRefresh}
            className="px-3 py-1 bg-rose-900 hover:bg-rose-800 text-rose-100 font-semibold rounded-md transition-colors cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading Skeleton */}
      {isLoading && trucks.length === 0 && (
        <div className="bg-slate-900 border border-slate-800/80 rounded-xl p-8 text-center">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-indigo-950/60 text-indigo-400 border border-indigo-800/50 mb-3 animate-pulse">
            <TruckIcon className="w-5 h-5" />
          </div>
          <p className="text-xs text-slate-300 font-medium">Loading power units & trailers...</p>
          <p className="text-[11px] text-slate-500 mt-1">Verifying organization tenant security</p>
        </div>
      )}

      {/* Main Table or Empty State */}
      {!isLoading && trucks.length === 0 && !error && (
        clients.length === 0 ? (
          <EmptyState
            id="empty-trucks-no-clients-state"
            icon={Building2}
            title="Add a client first"
            description="Trucks are managed for a carrier client. Add your first client before adding a truck."
            actionLabel={canEdit && onNavigateToClients ? 'Add Client' : undefined}
            onAction={onNavigateToClients}
          />
        ) : (
          <EmptyState
            id="empty-trucks-state"
            icon={TruckIcon}
            title="No Truck Units Registered Yet"
            description="Add power units and trailers operated by your carrier clients to manage staging locations, equipment specifications, and dispatch assignments."
            actionLabel={canEdit ? 'Add First Truck Unit' : undefined}
            onAction={canEdit ? onAddTruck : undefined}
          />
        )
      )}

      {trucks.length > 0 && filteredTrucks.length === 0 && (
        <div className="bg-slate-900 border border-slate-800/80 rounded-xl p-8 text-center space-y-3">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-slate-800 text-slate-400 mb-1">
            <Search className="w-5 h-5" />
          </div>
          <h3 className="text-sm font-semibold text-slate-200">No Truck Units Found</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            No truck units match your current search query or filter criteria.
          </p>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700/60 rounded-lg text-xs font-semibold text-slate-200 hover:text-white transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
              <span>Reset Filters</span>
            </button>
          )}
        </div>
      )}

      {filteredTrucks.length > 0 && (
        <div className="bg-slate-900 border border-slate-800/80 rounded-xl overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table id="trucks-table" className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950/80 text-slate-400 font-semibold uppercase tracking-wider border-b border-slate-800 text-[11px]">
                <tr>
                  <th className="px-4 py-3 min-w-[130px]">Truck #</th>
                  <th className="px-4 py-3 min-w-[180px]">Carrier Client</th>
                  <th className="px-4 py-3 min-w-[160px]">Equipment</th>
                  <th className="px-4 py-3 min-w-[160px]">Current Location</th>
                  <th className="px-4 py-3 min-w-[110px]">Capacity</th>
                  <th className="px-4 py-3 min-w-[100px]">Status</th>
                  <th className="px-4 py-3 text-right min-w-[140px]">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-sans">
                {filteredTrucks.map((truck) => {
                  const isRowToggling = togglingTruckId === truck.id;
                  const equipmentLabel =
                    EQUIPMENT_TYPE_OPTIONS.find((opt) => opt.value === truck.equipment_type)?.label ||
                    truck.equipment_type.replace(/_/g, ' ');

                  return (
                    <tr
                      key={truck.id}
                      id={`truck-row-${truck.id}`}
                      className={`hover:bg-slate-800/40 transition-colors group ${
                        truck.status === 'inactive' ? 'opacity-70 bg-slate-950/30' : ''
                      }`}
                    >
                      {/* Truck Number */}
                      <td className="px-4 py-3">
                        <button
                          onClick={() => onViewDetails(truck)}
                          className="font-mono font-bold text-slate-100 hover:text-indigo-400 text-left transition-colors cursor-pointer group-hover:underline flex items-center gap-1.5"
                        >
                          <span>#{truck.truck_number}</span>
                          <ChevronRight className="w-3 h-3 text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </button>
                        {truck.vin && (
                          <div className="text-[10px] text-slate-500 font-mono tracking-wider truncate max-w-[120px]" title={truck.vin}>
                            VIN: {truck.vin}
                          </div>
                        )}
                      </td>

                      {/* Carrier Client */}
                      <td className="px-4 py-3 text-slate-300">
                        {truck.client ? (
                          <div>
                            <div className="font-semibold text-slate-200 truncate max-w-[180px]" title={truck.client.company_name}>
                              {truck.client.company_name}
                            </div>
                            <span className="text-[10px] text-slate-400 font-mono capitalize">
                              {truck.client.client_type === 'owner_operator' ? 'Owner-Op' : 'Fleet'}
                            </span>
                          </div>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded bg-amber-950/40 text-amber-400 border border-amber-800/50 text-[10px] font-medium">
                            Unassigned
                          </span>
                        )}
                      </td>

                      {/* Equipment */}
                      <td className="px-4 py-3">
                        <span className="text-slate-200 block truncate max-w-[150px]" title={equipmentLabel}>
                          {equipmentLabel}
                        </span>
                      </td>

                      {/* Current Location */}
                      <td className="px-4 py-3">
                        {truck.current_location_city || truck.current_location_state ? (
                          <span className="inline-flex items-center gap-1 text-slate-300 font-medium">
                            <MapPin className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                            <span className="truncate max-w-[140px]">
                              {truck.current_location_city || ''}
                              {truck.current_location_city && truck.current_location_state ? ', ' : ''}
                              {truck.current_location_state || ''}
                            </span>
                          </span>
                        ) : (
                          <span className="text-slate-500 font-mono">—</span>
                        )}
                      </td>

                      {/* Capacity */}
                      <td className="px-4 py-3 font-mono text-slate-300">
                        {truck.max_weight_lbs ? (
                          <span>{truck.max_weight_lbs.toLocaleString()} lbs</span>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        <StatusBadge status={truck.status} type="truck" size="sm" />
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-1 justify-end">
                          {/* View Details */}
                          <button
                            id={`truck-view-btn-${truck.id}`}
                            onClick={() => onViewDetails(truck)}
                            title="View Truck Details"
                            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-md transition-colors cursor-pointer"
                            aria-label={`View details for Truck #${truck.truck_number}`}
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          {/* Edit (Admin & Dispatcher) */}
                          {canEdit && (
                            <button
                              id={`truck-edit-btn-${truck.id}`}
                              onClick={() => onEditTruck(truck)}
                              title="Edit Truck Unit"
                              className="p-1.5 text-slate-400 hover:text-indigo-300 hover:bg-indigo-950/50 rounded-md transition-colors cursor-pointer"
                              aria-label={`Edit Truck #${truck.truck_number}`}
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {/* Status Quick Cycle (Active -> Maintenance -> Inactive -> Active) */}
                          {canEdit && (
                            <button
                              id={`truck-status-btn-${truck.id}`}
                              onClick={() => {
                                const nextStatus: TruckStatus =
                                  truck.status === 'active'
                                    ? 'maintenance'
                                    : truck.status === 'maintenance'
                                    ? 'inactive'
                                    : 'active';
                                onChangeStatus(truck, nextStatus);
                              }}
                              disabled={isRowToggling}
                              title={`Cycle Status (Current: ${truck.status})`}
                              className={`p-1.5 rounded-md transition-colors cursor-pointer disabled:opacity-50 ${
                                truck.status === 'active'
                                  ? 'text-amber-400 hover:text-amber-300 hover:bg-amber-950/50'
                                  : truck.status === 'maintenance'
                                  ? 'text-slate-400 hover:text-slate-300 hover:bg-slate-800'
                                  : 'text-emerald-400 hover:text-emerald-300 hover:bg-emerald-950/50'
                              }`}
                              aria-label={`Cycle status for Truck #${truck.truck_number}`}
                            >
                              {truck.status === 'active' ? (
                                <Wrench className={`w-3.5 h-3.5 ${isRowToggling ? 'animate-spin' : ''}`} />
                              ) : truck.status === 'maintenance' ? (
                                <Power className={`w-3.5 h-3.5 ${isRowToggling ? 'animate-spin' : ''}`} />
                              ) : (
                                <CheckCircle2 className={`w-3.5 h-3.5 ${isRowToggling ? 'animate-spin' : ''}`} />
                              )}
                            </button>
                          )}

                          {/* Delete (Owner Admin Only) */}
                          {canDelete && onDeleteTruck && (
                            <button
                              id={`truck-delete-btn-${truck.id}`}
                              onClick={() => onDeleteTruck(truck)}
                              title="Delete Truck Unit"
                              className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-950/50 rounded-md transition-colors cursor-pointer"
                              aria-label={`Delete Truck #${truck.truck_number}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
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

          {/* Table Footer Count */}
          <div className="px-4 py-2.5 bg-slate-950/80 border-t border-slate-800 text-[11px] text-slate-400 flex flex-wrap items-center justify-between gap-2">
            <span>
              Showing {filteredTrucks.length} of {trucks.length} power {trucks.length === 1 ? 'unit' : 'units'}
            </span>
            <span className="font-mono text-slate-500">
              Active: {trucks.filter((t) => t.status === 'active').length} • Maintenance:{' '}
              {trucks.filter((t) => t.status === 'maintenance').length} • Inactive:{' '}
              {trucks.filter((t) => t.status === 'inactive').length}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
