import React, { useState } from 'react';
import {
  Filter,
  RotateCcw,
  Calendar,
  Building2,
  Users,
  Truck,
  Layers,
  Activity,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  ProfitabilityFilters as FiltersType,
  ProfitabilityDateRange,
  ProfitabilityStatus,
} from './profitabilityTypes.ts';
import { Client, Broker, EquipmentType, PipelineStatus } from '../../types/domain.types.ts';

interface ProfitabilityFiltersProps {
  filters: FiltersType;
  onFilterChange: (newFilters: FiltersType) => void;
  clients: Client[];
  brokers: Broker[];
  activeFilterCount: number;
  resultCount: number;
  onClearFilters: () => void;
}

const DATE_RANGE_OPTIONS: { id: ProfitabilityDateRange; label: string }[] = [
  { id: 'all_time', label: 'All Time' },
  { id: 'today', label: 'Today' },
  { id: 'last_7_days', label: 'Last 7 Days' },
  { id: 'last_30_days', label: 'Last 30 Days' },
  { id: 'this_month', label: 'This Month' },
  { id: 'custom', label: 'Custom Range' },
];

const EQUIPMENT_OPTIONS: { id: EquipmentType | 'all'; label: string }[] = [
  { id: 'all', label: 'All Equipment' },
  { id: 'dry_van', label: 'Dry Van' },
  { id: 'reefer', label: 'Reefer' },
  { id: 'flatbed', label: 'Flatbed' },
  { id: 'step_deck', label: 'Step Deck' },
  { id: 'power_only', label: 'Power Only' },
  { id: 'box_truck', label: 'Box Truck' },
  { id: 'hotshot', label: 'Hotshot' },
];

const PIPELINE_OPTIONS: { id: PipelineStatus | 'all'; label: string }[] = [
  { id: 'all', label: 'All Stages' },
  { id: 'sourced', label: 'Sourced' },
  { id: 'negotiating', label: 'Negotiating' },
  { id: 'booked', label: 'Booked' },
  { id: 'in_transit', label: 'In Transit' },
  { id: 'delivered', label: 'Delivered' },
  { id: 'invoiced', label: 'Invoiced' },
  { id: 'paid', label: 'Paid' },
];

const HEALTH_OPTIONS: { id: ProfitabilityStatus | 'all'; label: string }[] = [
  { id: 'all', label: 'All Margins' },
  { id: 'healthy', label: 'Healthy (≥15%)' },
  { id: 'review', label: 'Review (0–15%)' },
  { id: 'loss', label: 'Loss (<0%)' },
];

export const ProfitabilityFilters: React.FC<ProfitabilityFiltersProps> = ({
  filters,
  onFilterChange,
  clients,
  brokers,
  activeFilterCount,
  resultCount,
  onClearFilters,
}) => {
  const [isExpandedMobile, setIsExpandedMobile] = useState(false);

  const handleDateRangeChange = (range: ProfitabilityDateRange) => {
    onFilterChange({
      ...filters,
      dateRange: range,
    });
  };

  return (
    <div id="profitability-filters-container" className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
      {/* Top Header Row with Active Count and Quick Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-indigo-950/60 border border-indigo-800/40 text-indigo-400">
            <Filter className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                Financial Query Filters
              </span>
              {activeFilterCount > 0 && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-950 text-indigo-300 border border-indigo-800/60 font-semibold">
                  {activeFilterCount} active
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400">
              Matching <span className="font-mono font-bold text-slate-200">{resultCount}</span> dispatch load record{resultCount === 1 ? '' : 's'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {activeFilterCount > 0 && (
            <button
              id="btn-clear-profitability-filters"
              type="button"
              onClick={onClearFilters}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700/60 rounded-lg text-xs font-semibold text-slate-200 hover:text-white transition-colors cursor-pointer shrink-0"
              title="Reset all filters"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
              <span>Reset Filters</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsExpandedMobile(!isExpandedMobile)}
            className="sm:hidden inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-slate-300 bg-slate-800 border border-slate-700 rounded-lg"
          >
            <span>{isExpandedMobile ? 'Hide Filters' : 'Show Filters'}</span>
            {isExpandedMobile ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Date Range Quick Pill Tabs */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] font-semibold text-slate-400 mr-1 flex items-center gap-1">
          <Calendar className="w-3.5 h-3.5 text-sky-400" /> Date:
        </span>
        {DATE_RANGE_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => handleDateRangeChange(opt.id)}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
              filters.dateRange === opt.id
                ? 'bg-indigo-600 text-white font-semibold shadow-sm'
                : 'bg-slate-950 text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-slate-800'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Custom Date Pickers (Shown only when 'custom' is active) */}
      {filters.dateRange === 'custom' && (
        <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-lg flex flex-wrap items-center gap-3 text-xs">
          <span className="text-slate-400 font-medium">Custom Pickup Window:</span>
          <div className="flex items-center gap-2">
            <label className="text-[11px] text-slate-400">From:</label>
            <input
              type="date"
              value={filters.customStartDate || ''}
              onChange={(e) => onFilterChange({ ...filters, customStartDate: e.target.value })}
              className="px-2 py-1 bg-slate-900 border border-slate-700 rounded text-slate-200 text-xs font-mono focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[11px] text-slate-400">To:</label>
            <input
              type="date"
              value={filters.customEndDate || ''}
              onChange={(e) => onFilterChange({ ...filters, customEndDate: e.target.value })}
              className="px-2 py-1 bg-slate-900 border border-slate-700 rounded text-slate-200 text-xs font-mono focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>
      )}

      {/* Primary Dimensional Dropdowns */}
      <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 pt-1 ${isExpandedMobile ? 'block' : 'hidden sm:grid'}`}>
        {/* Client Selector */}
        <div>
          <label className="block text-[11px] font-semibold text-slate-400 mb-1 flex items-center gap-1">
            <Users className="w-3 h-3 text-slate-400" /> Carrier Client
          </label>
          <select
            id="filter-client"
            value={filters.clientId || ''}
            onChange={(e) => onFilterChange({ ...filters, clientId: e.target.value || undefined })}
            className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-lg text-slate-200 text-xs focus:outline-none focus:border-indigo-500"
          >
            <option value="">All Clients (Owner-Ops & Fleets)</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.company_name}
              </option>
            ))}
          </select>
        </div>

        {/* Broker Selector */}
        <div>
          <label className="block text-[11px] font-semibold text-slate-400 mb-1 flex items-center gap-1">
            <Building2 className="w-3 h-3 text-slate-400" /> Freight Broker
          </label>
          <select
            id="filter-broker"
            value={filters.brokerId || ''}
            onChange={(e) => onFilterChange({ ...filters, brokerId: e.target.value || undefined })}
            className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-lg text-slate-200 text-xs focus:outline-none focus:border-indigo-500"
          >
            <option value="">All Freight Brokers</option>
            {brokers.map((b) => (
              <option key={b.id} value={b.id}>
                {b.company_name}
              </option>
            ))}
          </select>
        </div>

        {/* Equipment Selector */}
        <div>
          <label className="block text-[11px] font-semibold text-slate-400 mb-1 flex items-center gap-1">
            <Truck className="w-3 h-3 text-slate-400" /> Equipment Type
          </label>
          <select
            id="filter-equipment"
            value={filters.equipmentType || 'all'}
            onChange={(e) =>
              onFilterChange({ ...filters, equipmentType: e.target.value as EquipmentType | 'all' })
            }
            className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-lg text-slate-200 text-xs focus:outline-none focus:border-indigo-500"
          >
            {EQUIPMENT_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Pipeline Status Selector */}
        <div>
          <label className="block text-[11px] font-semibold text-slate-400 mb-1 flex items-center gap-1">
            <Layers className="w-3 h-3 text-slate-400" /> Pipeline Stage
          </label>
          <select
            id="filter-pipeline"
            value={filters.pipelineStatus || 'all'}
            onChange={(e) =>
              onFilterChange({ ...filters, pipelineStatus: e.target.value as PipelineStatus | 'all' })
            }
            className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-lg text-slate-200 text-xs focus:outline-none focus:border-indigo-500"
          >
            {PIPELINE_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Health Status Selector */}
        <div>
          <label className="block text-[11px] font-semibold text-slate-400 mb-1 flex items-center gap-1">
            <Activity className="w-3 h-3 text-slate-400" /> Margin Health
          </label>
          <select
            id="filter-health"
            value={filters.healthStatus || 'all'}
            onChange={(e) =>
              onFilterChange({ ...filters, healthStatus: e.target.value as ProfitabilityStatus | 'all' })
            }
            className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-lg text-slate-200 text-xs focus:outline-none focus:border-indigo-500"
          >
            {HEALTH_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
};
