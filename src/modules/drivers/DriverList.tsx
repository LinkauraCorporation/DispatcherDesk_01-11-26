import React, { useState, useMemo } from 'react';
import { DriverStatus, DriverPayType, Client, Truck } from '../../types/domain.types.ts';
import {
  DriverWithRelations,
  formatDriverPayRate,
  DRIVER_PAY_TYPE_OPTIONS,
  DRIVER_STATUS_OPTIONS,
} from './driverTypes.ts';
import { StatusBadge } from '../../components/common/StatusBadge.tsx';
import { EmptyState } from '../../components/common/EmptyState.tsx';
import {
  Search,
  Filter,
  UserCheck,
  Eye,
  Edit2,
  Trash2,
  RefreshCw,
  Phone,
  Mail,
  Truck as TruckIcon,
  Building2,
  DollarSign,
  Plus,
  AlertCircle,
  CheckCircle2,
  Power,
  Package,
  MapPin,
  ChevronDown,
  RotateCcw,
} from 'lucide-react';

export interface DriverListProps {
  drivers: DriverWithRelations[];
  clients: Client[];
  trucks: Truck[];
  isLoading: boolean;
  error: string | null;
  onRefresh: () => void;
  onViewDetails: (driver: DriverWithRelations) => void;
  onEditDriver: (driver: DriverWithRelations) => void;
  onStatusChange: (driver: DriverWithRelations, newStatus: DriverStatus) => void;
  onDeleteDriver?: (driver: DriverWithRelations) => void;
  onAddDriver: () => void;
  canEdit: boolean;
  canDelete: boolean;
  updatingDriverId?: string | null;
  onNavigateToClients?: () => void;
}

export const DriverList: React.FC<DriverListProps> = ({
  drivers,
  clients,
  trucks,
  isLoading,
  error,
  onRefresh,
  onViewDetails,
  onEditDriver,
  onStatusChange,
  onDeleteDriver,
  onAddDriver,
  canEdit,
  canDelete,
  updatingDriverId,
  onNavigateToClients,
}) => {
  // Search and filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [clientFilter, setClientFilter] = useState('all');
  const [truckFilter, setTruckFilter] = useState('all');
  const [payTypeFilter, setPayTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Quick status dropdown open tracker
  const [statusMenuOpenId, setStatusMenuOpenId] = useState<string | null>(null);

  // Filter logic
  const filteredDrivers = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();

    return drivers.filter((d) => {
      // 1. Search Query
      if (q) {
        const nameMatch = d.full_name.toLowerCase().includes(q);
        const phoneMatch = d.phone ? d.phone.toLowerCase().includes(q) : false;
        const emailMatch = d.email ? d.email.toLowerCase().includes(q) : false;
        const truckMatch = d.assigned_truck
          ? d.assigned_truck.truck_number.toLowerCase().includes(q) ||
            d.assigned_truck.equipment_type.toLowerCase().includes(q)
          : false;
        const clientMatch = d.client
          ? d.client.company_name.toLowerCase().includes(q)
          : false;

        if (!nameMatch && !phoneMatch && !emailMatch && !truckMatch && !clientMatch) {
          return false;
        }
      }

      // 2. Client Filter
      if (clientFilter !== 'all') {
        if (clientFilter === 'unassigned') {
          if (d.client_id) return false;
        } else if (d.client_id !== clientFilter) {
          return false;
        }
      }

      // 3. Truck Filter
      if (truckFilter !== 'all') {
        if (truckFilter === 'assigned' && !d.assigned_truck_id) return false;
        if (truckFilter === 'unassigned' && d.assigned_truck_id) return false;
        if (truckFilter !== 'assigned' && truckFilter !== 'unassigned' && d.assigned_truck_id !== truckFilter) {
          return false;
        }
      }

      // 4. Pay Type Filter
      if (payTypeFilter !== 'all' && d.pay_type !== payTypeFilter) {
        return false;
      }

      // 5. Status Filter
      if (statusFilter !== 'all' && d.status !== statusFilter) {
        return false;
      }

      return true;
    });
  }, [drivers, searchQuery, clientFilter, truckFilter, payTypeFilter, statusFilter]);

  const hasActiveFilters =
    searchQuery.trim() !== '' ||
    clientFilter !== 'all' ||
    truckFilter !== 'all' ||
    payTypeFilter !== 'all' ||
    statusFilter !== 'all';

  const handleClearFilters = () => {
    setSearchQuery('');
    setClientFilter('all');
    setTruckFilter('all');
    setPayTypeFilter('all');
    setStatusFilter('all');
  };

  return (
    <div id="driver-list-container" className="space-y-4">
      {/* Search & Filter Bar */}
      <div className="p-3.5 bg-slate-900 border border-slate-800 rounded-xl space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Search Field */}
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              id="driver-search-input"
              type="text"
              placeholder="Search by driver name, phone, email, truck #, or carrier..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-xs px-1"
              >
                ✕
              </button>
            )}
          </div>

          {/* Action Buttons: Refresh & Add Driver */}
          <div className="flex items-center gap-2 self-end lg:self-auto shrink-0">
            <button
              id="driver-refresh-btn"
              onClick={onRefresh}
              disabled={isLoading}
              title="Refresh Driver Records"
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold border border-slate-700 transition-colors cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>

            {canEdit && (
              <button
                id="driver-add-btn"
                onClick={onAddDriver}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Driver</span>
              </button>
            )}
          </div>
        </div>

        {/* Dropdown Filters Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-800/60 text-xs">
          {/* Client Filter */}
          <div>
            <label className="block text-[10px] text-slate-400 font-medium mb-1 uppercase tracking-wider">
              Carrier Client
            </label>
            <select
              id="driver-filter-client"
              value={clientFilter}
              onChange={(e) => setClientFilter(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-slate-300 text-xs focus:outline-none focus:border-indigo-500 cursor-pointer"
            >
              <option value="all">All Carriers</option>
              <option value="unassigned">Unassigned Only</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.company_name}
                </option>
              ))}
            </select>
          </div>

          {/* Truck Assignment Filter */}
          <div>
            <label className="block text-[10px] text-slate-400 font-medium mb-1 uppercase tracking-wider">
              Assigned Truck
            </label>
            <select
              id="driver-filter-truck"
              value={truckFilter}
              onChange={(e) => setTruckFilter(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-slate-300 text-xs focus:outline-none focus:border-indigo-500 cursor-pointer"
            >
              <option value="all">All Trucks</option>
              <option value="assigned">Assigned Power Unit</option>
              <option value="unassigned">Unassigned (Standby)</option>
              {trucks.map((t) => (
                <option key={t.id} value={t.id}>
                  Unit #{t.truck_number} ({t.equipment_type.replace(/_/g, ' ')})
                </option>
              ))}
            </select>
          </div>

          {/* Pay Type Filter */}
          <div>
            <label className="block text-[10px] text-slate-400 font-medium mb-1 uppercase tracking-wider">
              Pay Agreement
            </label>
            <select
              id="driver-filter-paytype"
              value={payTypeFilter}
              onChange={(e) => setPayTypeFilter(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-slate-300 text-xs focus:outline-none focus:border-indigo-500 cursor-pointer"
            >
              <option value="all">All Pay Contracts</option>
              {DRIVER_PAY_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <label className="block text-[10px] text-slate-400 font-medium mb-1 uppercase tracking-wider">
              Duty Status
            </label>
            <select
              id="driver-filter-status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-slate-300 text-xs focus:outline-none focus:border-indigo-500 cursor-pointer"
            >
              <option value="all">All Statuses</option>
              {DRIVER_STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Active Filter Clear Bar */}
        {hasActiveFilters && (
          <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-800/40">
            <span>
              Showing <strong className="text-slate-200">{filteredDrivers.length}</strong> of{' '}
              <strong className="text-slate-200">{drivers.length}</strong> registered drivers
            </span>
            <button
              id="driver-reset-filters-btn"
              type="button"
              onClick={handleClearFilters}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700/60 rounded-lg text-xs font-semibold text-slate-200 hover:text-white transition-colors cursor-pointer shrink-0"
              title="Reset all filters"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
              <span>Reset Filters</span>
            </button>
          </div>
        )}
      </div>

      {/* Error Banner */}
      {error && (
        <div
          id="driver-list-error"
          className="p-4 bg-rose-950/50 border border-rose-800/80 rounded-xl text-rose-200 flex items-start gap-3"
        >
          <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="font-semibold text-xs text-rose-100">Unable to Load Drivers</h4>
            <p className="text-xs text-rose-300/90 mt-0.5">{error}</p>
          </div>
          <button
            onClick={onRefresh}
            className="px-3 py-1.5 bg-rose-900/60 hover:bg-rose-800/80 text-rose-100 rounded-lg text-xs font-semibold transition-colors cursor-pointer shrink-0"
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading Skeletons */}
      {isLoading && (
        <div className="border border-slate-800 rounded-xl bg-slate-900/50 p-4 space-y-3">
          <div className="h-6 bg-slate-800 rounded w-1/4 animate-pulse" />
          <div className="space-y-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-12 bg-slate-800/50 rounded-lg animate-pulse" />
            ))}
          </div>
        </div>
      )}

      {/* Empty State: Zero drivers registered */}
      {!isLoading && !error && drivers.length === 0 && (
        <div className="p-8 bg-slate-900 border border-slate-800 rounded-xl">
          {clients.length === 0 ? (
            <EmptyState
              id="empty-drivers-no-clients-list"
              title="Add a client first"
              description="Drivers are managed for a carrier client. Add your first client before setting up drivers."
              icon={Building2}
              actionLabel={canEdit && onNavigateToClients ? 'Add Client' : undefined}
              onAction={onNavigateToClients}
            />
          ) : (
            <EmptyState
              id="empty-drivers-list"
              title="No Drivers Registered Yet"
              description="Start building your fleet dispatch roster by adding carrier company drivers or owner-operators."
              icon={UserCheck}
              actionLabel={canEdit ? 'Register First Driver' : undefined}
              onAction={canEdit ? onAddDriver : undefined}
            />
          )}
        </div>
      )}

      {/* Empty State: No results matching current filters */}
      {!isLoading && !error && drivers.length > 0 && filteredDrivers.length === 0 && (
        <div className="p-8 bg-slate-900 border border-slate-800 rounded-xl text-center space-y-3">
          <UserCheck className="w-10 h-10 text-slate-500 mx-auto" />
          <div>
            <h3 className="text-sm font-semibold text-slate-200">No matching drivers found</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
              No driver profiles match your active search terms and filter criteria.
            </p>
          </div>
          <button
            onClick={handleClearFilters}
            className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold border border-slate-700 cursor-pointer"
          >
            Reset Filters
          </button>
        </div>
      )}

      {/* Drivers Data Table */}
      {!isLoading && !error && filteredDrivers.length > 0 && (
        <div className="border border-slate-800 rounded-xl bg-slate-900 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950/80 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800 font-semibold">
                <tr>
                  <th className="py-3 px-3.5">Driver</th>
                  <th className="py-3 px-3.5">Client / Carrier</th>
                  <th className="py-3 px-3.5">Assigned Truck</th>
                  <th className="py-3 px-3.5">Phone</th>
                  <th className="py-3 px-3.5">Pay Type</th>
                  <th className="py-3 px-3.5">Pay Rate</th>
                  <th className="py-3 px-3.5">Status</th>
                  <th className="py-3 px-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredDrivers.map((driver) => {
                  const isUpdating = updatingDriverId === driver.id;

                  return (
                    <tr
                      key={driver.id}
                      id={`driver-row-${driver.id}`}
                      className="hover:bg-slate-800/40 transition-colors group"
                    >
                      {/* Driver Column */}
                      <td className="py-3 px-3.5">
                        <div>
                          <button
                            onClick={() => onViewDetails(driver)}
                            className="font-bold text-slate-100 hover:text-indigo-400 transition-colors cursor-pointer text-left flex items-center gap-1.5"
                          >
                            <span>{driver.full_name}</span>
                          </button>
                          {driver.email ? (
                            <span className="text-[11px] text-slate-500 block truncate max-w-[180px]">
                              {driver.email}
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-600 block">No email</span>
                          )}
                        </div>
                      </td>

                      {/* Client Column */}
                      <td className="py-3 px-3.5">
                        {driver.client ? (
                          <div>
                            <span className="font-semibold text-slate-200 block truncate max-w-[160px]">
                              {driver.client.company_name}
                            </span>
                            <span className="text-[10px] uppercase font-mono text-slate-400">
                              {driver.client.client_type === 'owner_operator' ? 'Owner-Op' : 'Fleet'}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-500 text-[11px] italic">Unassigned</span>
                        )}
                      </td>

                      {/* Assigned Truck Column */}
                      <td className="py-3 px-3.5">
                        {driver.assigned_truck ? (
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-1.5 font-mono text-slate-100 font-bold">
                              <TruckIcon className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                              <span>Unit #{driver.assigned_truck.truck_number}</span>
                            </div>
                            <span className="text-[10px] text-slate-400 block capitalize">
                              {driver.assigned_truck.equipment_type.replace(/_/g, ' ')}
                            </span>
                            {(driver.assigned_truck.current_location_city ||
                              driver.assigned_truck.current_location_state) && (
                              <span className="text-[10px] text-slate-500 flex items-center gap-1">
                                <MapPin className="w-2.5 h-2.5 text-slate-400" />
                                {[
                                  driver.assigned_truck.current_location_city,
                                  driver.assigned_truck.current_location_state,
                                ]
                                  .filter(Boolean)
                                  .join(', ')}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-500 italic bg-slate-950 px-2 py-0.5 rounded border border-slate-800 inline-block">
                            Standby (No Unit)
                          </span>
                        )}
                      </td>

                      {/* Phone Column */}
                      <td className="py-3 px-3.5 font-mono text-slate-300">
                        {driver.phone ? (
                          <a
                            href={`tel:${driver.phone}`}
                            className="inline-flex items-center gap-1 hover:text-indigo-400"
                          >
                            <Phone className="w-3 h-3 text-slate-500" />
                            <span>{driver.phone}</span>
                          </a>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </td>

                      {/* Pay Type Column */}
                      <td className="py-3 px-3.5">
                        <span className="inline-block px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-[11px] text-slate-300 capitalize font-medium">
                          {driver.pay_type.replace(/_/g, ' ')}
                        </span>
                      </td>

                      {/* Pay Rate Column */}
                      <td className="py-3 px-3.5 font-mono font-semibold text-slate-100">
                        {formatDriverPayRate(driver.pay_type, driver.pay_rate)}
                      </td>

                      {/* Status Column with quick toggle dropdown */}
                      <td className="py-3 px-3.5">
                        <div className="relative inline-block">
                          {canEdit ? (
                            <button
                              id={`driver-status-btn-${driver.id}`}
                              disabled={isUpdating}
                              onClick={() =>
                                setStatusMenuOpenId(
                                  statusMenuOpenId === driver.id ? null : driver.id
                                )
                              }
                              className="inline-flex items-center gap-1 cursor-pointer disabled:opacity-50 group-hover:ring-1 group-hover:ring-slate-700 rounded-md"
                              title="Click to quick-change status"
                            >
                              <StatusBadge status={driver.status} type="driver" size="sm" />
                              <ChevronDown className="w-3 h-3 text-slate-500" />
                            </button>
                          ) : (
                            <StatusBadge status={driver.status} type="driver" size="sm" />
                          )}

                          {/* Quick Status Dropdown Menu */}
                          {statusMenuOpenId === driver.id && (
                            <div
                              className="absolute left-0 top-full mt-1 z-30 w-36 bg-slate-950 border border-slate-800 rounded-lg shadow-xl py-1 text-xs"
                              onMouseLeave={() => setStatusMenuOpenId(null)}
                            >
                              <div className="px-2.5 py-1 text-[10px] uppercase font-semibold text-slate-500 border-b border-slate-800/80">
                                Update Status
                              </div>
                              <button
                                onClick={() => {
                                  onStatusChange(driver, 'available');
                                  setStatusMenuOpenId(null);
                                }}
                                className="w-full text-left px-2.5 py-1.5 hover:bg-slate-900 text-emerald-400 flex items-center gap-1.5 cursor-pointer"
                              >
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                <span>Available</span>
                              </button>
                              <button
                                onClick={() => {
                                  onStatusChange(driver, 'on_load');
                                  setStatusMenuOpenId(null);
                                }}
                                className="w-full text-left px-2.5 py-1.5 hover:bg-slate-900 text-purple-400 flex items-center gap-1.5 cursor-pointer"
                              >
                                <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                                <span>On Load</span>
                              </button>
                              <button
                                onClick={() => {
                                  onStatusChange(driver, 'off_duty');
                                  setStatusMenuOpenId(null);
                                }}
                                className="w-full text-left px-2.5 py-1.5 hover:bg-slate-900 text-amber-400 flex items-center gap-1.5 cursor-pointer"
                              >
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                                <span>Off Duty</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Actions Column */}
                      <td className="py-3 px-3.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            id={`driver-view-btn-${driver.id}`}
                            onClick={() => onViewDetails(driver)}
                            title="View Driver Details"
                            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-md transition-colors cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          {canEdit && (
                            <button
                              id={`driver-edit-btn-${driver.id}`}
                              onClick={() => onEditDriver(driver)}
                              title="Edit Driver Profile"
                              className="p-1.5 text-slate-400 hover:text-indigo-400 hover:bg-slate-800 rounded-md transition-colors cursor-pointer"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {canDelete && onDeleteDriver && (
                            <button
                              id={`driver-delete-btn-${driver.id}`}
                              onClick={() => onDeleteDriver(driver)}
                              title="Delete Driver Profile"
                              className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-md transition-colors cursor-pointer"
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

          {/* Table Footer Summary */}
          <div className="p-3 bg-slate-950/60 border-t border-slate-800 text-[11px] text-slate-400 flex flex-col sm:flex-row items-center justify-between gap-2">
            <div>
              Total registered drivers:{' '}
              <strong className="text-slate-200">{drivers.length}</strong> (
              <span className="text-emerald-400">
                {drivers.filter((d) => d.status === 'available').length} available
              </span>
              ,{' '}
              <span className="text-purple-400">
                {drivers.filter((d) => d.status === 'on_load').length} on load
              </span>
              ,{' '}
              <span className="text-amber-400">
                {drivers.filter((d) => d.status === 'off_duty').length} off duty
              </span>
              )
            </div>
            <div className="text-[10px] text-slate-500 font-mono">
              Driver Pay & Compensation Module • Phase 2B.2
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
