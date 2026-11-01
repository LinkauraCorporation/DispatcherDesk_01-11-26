import React from 'react';
import { Client, Broker } from '../../types/domain.types.ts';
import { EQUIPMENT_TYPE_OPTIONS } from '../loads/loadTypes.ts';
import { PipelineFilterCriteria } from './pipelineTypes.ts';
import {
  Search,
  Filter,
  X,
  Building2,
  Truck as TruckIcon,
  Calendar,
  Layers,
  RotateCcw,
} from 'lucide-react';

interface PipelineFiltersProps {
  filters: PipelineFilterCriteria;
  onFilterChange: (filters: PipelineFilterCriteria) => void;
  clients: Client[];
  brokers: Broker[];
  totalLoadsCount: number;
  filteredLoadsCount: number;
}

export const PipelineFilters: React.FC<PipelineFiltersProps> = ({
  filters,
  onFilterChange,
  clients,
  brokers,
  totalLoadsCount,
  filteredLoadsCount,
}) => {
  const activeFiltersCount = [
    Boolean(filters.search),
    Boolean(filters.clientId),
    Boolean(filters.brokerId),
    Boolean(filters.equipmentType),
    Boolean(filters.dateRange && filters.dateRange !== 'all'),
  ].filter(Boolean).length;

  const handleClearAll = () => {
    onFilterChange({
      search: '',
      clientId: '',
      brokerId: '',
      equipmentType: '',
      dateRange: 'all',
    });
  };

  return (
    <div
      id="pipeline-filters-panel"
      className="p-3 sm:p-4 rounded-xl bg-slate-900/90 border border-slate-800/90 space-y-3 shadow-xs"
    >
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 sm:gap-3">
        {/* Search Input */}
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            id="pipeline-search-input"
            type="text"
            placeholder="Search load #, origin, destination, carrier, broker, truck or driver..."
            value={filters.search || ''}
            onChange={(e) => onFilterChange({ ...filters, search: e.target.value })}
            className="w-full h-9 pl-9 pr-8 rounded-xl bg-slate-950 border border-slate-800 text-xs sm:text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-colors"
          />
          {filters.search && (
            <button
              type="button"
              onClick={() => onFilterChange({ ...filters, search: '' })}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 p-0.5 rounded cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filter Dropdowns */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Client Filter */}
          <div className="min-w-[135px]">
            <select
              id="pipeline-client-filter"
              value={filters.clientId || ''}
              onChange={(e) => onFilterChange({ ...filters, clientId: e.target.value })}
              className="w-full h-9 px-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-colors cursor-pointer"
            >
              <option value="">All Carriers</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.company_name}
                </option>
              ))}
            </select>
          </div>

          {/* Broker Filter */}
          <div className="min-w-[135px]">
            <select
              id="pipeline-broker-filter"
              value={filters.brokerId || ''}
              onChange={(e) => onFilterChange({ ...filters, brokerId: e.target.value })}
              className="w-full h-9 px-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-colors cursor-pointer"
            >
              <option value="">All Brokers</option>
              {brokers.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.company_name}
                </option>
              ))}
            </select>
          </div>

          {/* Equipment Filter */}
          <div className="min-w-[130px]">
            <select
              id="pipeline-equipment-filter"
              value={filters.equipmentType || ''}
              onChange={(e) => onFilterChange({ ...filters, equipmentType: e.target.value })}
              className="w-full h-9 px-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-colors cursor-pointer"
            >
              <option value="">All Equipment</option>
              {EQUIPMENT_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.shortLabel}
                </option>
              ))}
            </select>
          </div>

          {/* Date Filter */}
          <div className="min-w-[125px]">
            <select
              id="pipeline-date-filter"
              value={filters.dateRange || 'all'}
              onChange={(e) =>
                onFilterChange({
                  ...filters,
                  dateRange: e.target.value as 'all' | 'today' | 'upcoming' | 'past',
                })
              }
              className="w-full h-9 px-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-colors cursor-pointer"
            >
              <option value="all">All Dates</option>
              <option value="today">Today's Schedule</option>
              <option value="upcoming">Upcoming</option>
              <option value="past">Past / Delivered</option>
            </select>
          </div>

          {/* Clear Filters Button */}
          {activeFiltersCount > 0 && (
            <button
              id="pipeline-clear-filters-btn"
              type="button"
              onClick={handleClearAll}
              className="h-9 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700/60 text-xs text-slate-200 font-medium flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
              <span>Reset Filters</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter Feedback Status Bar */}
      <div className="flex items-center justify-between text-xs text-slate-400 pt-1.5 border-t border-slate-800/60 font-mono tabular-nums">
        <div className="flex items-center gap-2">
          <span>
            Displaying <strong className="text-slate-100 font-bold">{filteredLoadsCount}</strong> of{' '}
            <strong className="text-slate-100 font-bold">{totalLoadsCount}</strong> loads
          </span>
          {activeFiltersCount > 0 && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-950/80 text-sky-300 border border-sky-800/50 font-sans font-semibold">
              Filtered View
            </span>
          )}
        </div>

        <div className="text-[11px] text-slate-500 font-sans hidden sm:block">
          Drag cards or use card menu to transition between pipeline stages
        </div>
      </div>
    </div>
  );
};
