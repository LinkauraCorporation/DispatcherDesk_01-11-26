import React from 'react';
import {
  CalendarViewMode,
  CalendarEventType,
  CalendarFilterState,
  CALENDAR_EVENT_CONFIG,
} from './calendarTypes.ts';
import { Client, Broker, Truck, Driver } from '../../types/domain.types.ts';
import {
  Search,
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Filter,
  X,
  AlertTriangle,
  RotateCcw,
  Clock,
  Layers,
} from 'lucide-react';

interface CalendarFiltersProps {
  currentDate: Date;
  viewMode: CalendarViewMode;
  onViewModeChange: (mode: CalendarViewMode) => void;
  onNavigateDate: (direction: 'prev' | 'next' | 'today') => void;
  filters: CalendarFilterState;
  onFilterChange: (newFilters: CalendarFilterState) => void;
  clients: Client[];
  drivers: Driver[];
  trucks: Truck[];
  brokers: Broker[];
  overdueCount: number;
  dateDisplayLabel: string;
}

export const CalendarFilters: React.FC<CalendarFiltersProps> = ({
  currentDate,
  viewMode,
  onViewModeChange,
  onNavigateDate,
  filters,
  onFilterChange,
  clients,
  drivers,
  trucks,
  brokers,
  overdueCount,
  dateDisplayLabel,
}) => {
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = React.useState(false);

  const toggleEventType = (type: CalendarEventType) => {
    const exists = filters.eventTypes.includes(type);
    const updated = exists
      ? filters.eventTypes.filter((t) => t !== type)
      : [...filters.eventTypes, type];
    onFilterChange({ ...filters, eventTypes: updated });
  };

  const handleResetFilters = () => {
    onFilterChange({
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
  };

  const hasActiveDropdownFilters =
    filters.clientIds.length > 0 ||
    filters.driverIds.length > 0 ||
    filters.truckIds.length > 0 ||
    filters.brokerIds.length > 0 ||
    filters.loadStatuses.length > 0 ||
    filters.eventTypes.length > 0 ||
    filters.onlyOverdue;

  return (
    <div className="space-y-3 bg-slate-900/90 border border-slate-800 rounded-xl p-3 shadow-xs">
      {/* Top Navigation & View Mode Row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Date Jump Controls */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg p-0.5">
            <button
              type="button"
              onClick={() => onNavigateDate('prev')}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-md transition-colors cursor-pointer"
              title="Previous period"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => onNavigateDate('today')}
              className="px-2.5 py-1 text-xs font-semibold text-slate-200 hover:text-white hover:bg-slate-800 rounded-md transition-colors cursor-pointer"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => onNavigateDate('next')}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-md transition-colors cursor-pointer"
              title="Next period"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-2 px-2 py-1">
            <CalendarIcon className="w-4 h-4 text-indigo-400 shrink-0" />
            <span className="text-sm font-bold text-white tracking-tight">
              {dateDisplayLabel}
            </span>
          </div>
        </div>

        {/* View Mode Toggle Switcher */}
        <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg p-0.5">
          {(['week', 'month', 'day', 'agenda'] as CalendarViewMode[]).map((mode) => {
            const isActive = viewMode === mode;
            const labels: Record<CalendarViewMode, string> = {
              week: 'Week',
              month: 'Month',
              day: 'Day',
              agenda: 'Agenda',
            };
            return (
              <button
                key={mode}
                type="button"
                onClick={() => onViewModeChange(mode)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer capitalize ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                {labels[mode]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Secondary Row: Quick Filters & Search */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1 border-t border-slate-800/60">
        {/* Search Input */}
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search load #, driver, lane, client, broker..."
            value={filters.searchQuery}
            onChange={(e) => onFilterChange({ ...filters, searchQuery: e.target.value })}
            className="w-full pl-8 pr-7 py-1.5 text-xs bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-hidden"
          />
          {filters.searchQuery && (
            <button
              type="button"
              onClick={() => onFilterChange({ ...filters, searchQuery: '' })}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Quick Event Type Toggles */}
        <div className="flex flex-wrap items-center gap-1.5">
          {(['pickup', 'delivery', 'task', 'check_call_due'] as CalendarEventType[]).map((type) => {
            const config = CALENDAR_EVENT_CONFIG[type];
            const isSelected = filters.eventTypes.length === 0 || filters.eventTypes.includes(type);
            return (
              <button
                key={type}
                type="button"
                onClick={() => toggleEventType(type)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md border transition-all cursor-pointer flex items-center gap-1.5 ${
                  isSelected
                    ? `${config.bgClass} ${config.borderClass} ${config.colorClass}`
                    : 'bg-slate-950/40 border-slate-800/80 text-slate-500 opacity-60 hover:opacity-100'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-current" />
                <span>{config.shortLabel}</span>
              </button>
            );
          })}

          {/* Overdue Only Filter Pill */}
          <button
            type="button"
            onClick={() => onFilterChange({ ...filters, onlyOverdue: !filters.onlyOverdue })}
            className={`px-2.5 py-1 text-xs font-semibold rounded-md border transition-all cursor-pointer flex items-center gap-1.5 ${
              filters.onlyOverdue
                ? 'bg-rose-500/20 border-rose-500/60 text-rose-300 ring-1 ring-rose-500/30'
                : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <AlertTriangle className={`w-3.5 h-3.5 ${filters.onlyOverdue ? 'text-rose-400 animate-pulse' : 'text-slate-500'}`} />
            <span>Overdue</span>
            {overdueCount > 0 && (
              <span className="px-1.5 py-0.2 bg-rose-500/30 text-rose-300 rounded-full text-[10px] font-bold">
                {overdueCount}
              </span>
            )}
          </button>

          {/* More Filters Dropdown Trigger */}
          <button
            type="button"
            onClick={() => setIsFilterDrawerOpen(!isFilterDrawerOpen)}
            className={`px-2.5 py-1 text-xs font-medium rounded-md border transition-colors cursor-pointer flex items-center gap-1.5 ${
              hasActiveDropdownFilters
                ? 'bg-indigo-950/60 border-indigo-700 text-indigo-300'
                : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <Filter className="w-3.5 h-3.5" />
            <span>Filters</span>
            {hasActiveDropdownFilters && (
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
            )}
          </button>

          {hasActiveDropdownFilters && (
            <button
              id="calendar-reset-filters-btn"
              type="button"
              onClick={handleResetFilters}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700/60 rounded-lg text-xs font-semibold text-slate-200 hover:text-white transition-colors cursor-pointer shrink-0"
              title="Reset all filters"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
              <span>Reset Filters</span>
            </button>
          )}
        </div>
      </div>

      {/* Expandable Advanced Entity Filter Drawer */}
      {isFilterDrawerOpen && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5 pt-2.5 pb-1 border-t border-slate-800/60 text-xs">
          {/* Client Filter */}
          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1">
              Carrier Client
            </label>
            <select
              value={filters.clientIds[0] || ''}
              onChange={(e) =>
                onFilterChange({
                  ...filters,
                  clientIds: e.target.value ? [e.target.value] : [],
                })
              }
              className="w-full py-1 px-2 bg-slate-950 border border-slate-800 rounded-md text-slate-200 focus:outline-hidden focus:border-indigo-500"
            >
              <option value="">All Clients</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.company_name}
                </option>
              ))}
            </select>
          </div>

          {/* Driver Filter */}
          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1">
              Assigned Driver
            </label>
            <select
              value={filters.driverIds[0] || ''}
              onChange={(e) =>
                onFilterChange({
                  ...filters,
                  driverIds: e.target.value ? [e.target.value] : [],
                })
              }
              className="w-full py-1 px-2 bg-slate-950 border border-slate-800 rounded-md text-slate-200 focus:outline-hidden focus:border-indigo-500"
            >
              <option value="">All Drivers</option>
              {drivers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.full_name}
                </option>
              ))}
            </select>
          </div>

          {/* Truck Filter */}
          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1">
              Truck Unit
            </label>
            <select
              value={filters.truckIds[0] || ''}
              onChange={(e) =>
                onFilterChange({
                  ...filters,
                  truckIds: e.target.value ? [e.target.value] : [],
                })
              }
              className="w-full py-1 px-2 bg-slate-950 border border-slate-800 rounded-md text-slate-200 focus:outline-hidden focus:border-indigo-500"
            >
              <option value="">All Trucks</option>
              {trucks.map((t) => (
                <option key={t.id} value={t.id}>
                  Unit #{t.truck_number} ({t.equipment_type})
                </option>
              ))}
            </select>
          </div>

          {/* Broker Filter */}
          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1">
              Broker / Shipper
            </label>
            <select
              value={filters.brokerIds[0] || ''}
              onChange={(e) =>
                onFilterChange({
                  ...filters,
                  brokerIds: e.target.value ? [e.target.value] : [],
                })
              }
              className="w-full py-1 px-2 bg-slate-950 border border-slate-800 rounded-md text-slate-200 focus:outline-hidden focus:border-indigo-500"
            >
              <option value="">All Brokers</option>
              {brokers.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.company_name}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  );
};
