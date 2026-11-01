import React from 'react';
import {
  DocumentFilterCriteria,
  DOCUMENT_TYPE_LABELS,
  DOCUMENT_STATUS_LABELS,
} from './documentTypes.ts';
import { PIPELINE_STATUS_OPTIONS } from '../loads/loadTypes.ts';
import { DocumentType, DocumentStatus, PipelineStatus } from '../../types/domain.types.ts';
import { Search, Filter, X, Calendar, FileText, CheckCircle2, RotateCcw } from 'lucide-react';

interface DocumentFiltersProps {
  filters: DocumentFilterCriteria;
  onFilterChange: (filters: DocumentFilterCriteria) => void;
  totalDocsCount: number;
  filteredDocsCount: number;
}

export const DocumentFilters: React.FC<DocumentFiltersProps> = ({
  filters,
  onFilterChange,
  totalDocsCount,
  filteredDocsCount,
}) => {
  const activeFiltersCount = [
    Boolean(filters.search),
    Boolean(filters.doc_type && filters.doc_type !== 'all'),
    Boolean(filters.doc_status && filters.doc_status !== 'all'),
    Boolean(filters.load_status && filters.load_status !== 'all'),
    Boolean(filters.date_range && filters.date_range !== 'all'),
    Boolean(filters.load_id),
  ].filter(Boolean).length;

  const handleClear = () => {
    onFilterChange({
      search: '',
      doc_type: 'all',
      doc_status: 'all',
      load_status: 'all',
      date_range: 'all',
      load_id: '',
    });
  };

  return (
    <div
      id="document-filters-panel"
      className="p-4 rounded-xl bg-slate-900/80 border border-slate-800/90 space-y-3 shadow-xs"
    >
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        {/* Search Input */}
        <div className="relative flex-1 min-w-[260px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            id="doc-search-input"
            type="text"
            placeholder="Search load #, file name, document type or notes..."
            value={filters.search || ''}
            onChange={(e) => onFilterChange({ ...filters, search: e.target.value })}
            className="w-full h-9 pl-9 pr-8 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-colors"
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
          {/* Document Type Filter */}
          <div className="min-w-[140px]">
            <select
              id="doc-type-filter"
              value={filters.doc_type || 'all'}
              onChange={(e) => onFilterChange({ ...filters, doc_type: e.target.value })}
              className="w-full h-9 px-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-colors cursor-pointer"
            >
              <option value="all">All Doc Types</option>
              <option value="rate_confirmation">Rate Confirmation</option>
              <option value="bol">Bill of Lading (BOL)</option>
              <option value="pod">Proof of Delivery (POD)</option>
              <option value="invoice">Freight Invoice</option>
              <option value="other">Other / Accessorial</option>
            </select>
          </div>

          {/* Document Status Filter */}
          <div className="min-w-[140px]">
            <select
              id="doc-status-filter"
              value={filters.doc_status || 'all'}
              onChange={(e) => onFilterChange({ ...filters, doc_status: e.target.value })}
              className="w-full h-9 px-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-colors cursor-pointer"
            >
              <option value="all">All Review Statuses</option>
              <option value="verified">Verified & Approved</option>
              <option value="received">Received</option>
              <option value="pending">Pending Review</option>
              <option value="missing">Missing</option>
            </select>
          </div>

          {/* Load Pipeline Status Filter */}
          <div className="min-w-[140px]">
            <select
              id="doc-load-status-filter"
              value={filters.load_status || 'all'}
              onChange={(e) => onFilterChange({ ...filters, load_status: e.target.value })}
              className="w-full h-9 px-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-colors cursor-pointer"
            >
              <option value="all">All Load Stages</option>
              {PIPELINE_STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  Load: {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Date Filter */}
          <div className="min-w-[125px]">
            <select
              id="doc-date-filter"
              value={filters.date_range || 'all'}
              onChange={(e) =>
                onFilterChange({
                  ...filters,
                  date_range: e.target.value as 'all' | 'today' | 'this_week' | 'this_month',
                })
              }
              className="w-full h-9 px-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-colors cursor-pointer"
            >
              <option value="all">All Time</option>
              <option value="today">Uploaded Today</option>
              <option value="this_week">Past 7 Days</option>
              <option value="this_month">Past 30 Days</option>
            </select>
          </div>

          {/* Clear Filters Button */}
          {activeFiltersCount > 0 && (
            <button
              id="doc-clear-filters-btn"
              type="button"
              onClick={handleClear}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700/60 rounded-lg text-xs font-semibold text-slate-200 hover:text-white transition-colors cursor-pointer shrink-0"
              title="Reset all filters"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
              <span>Reset Filters</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter Feedback Status Bar */}
      <div className="flex items-center justify-between text-xs text-slate-400 pt-2 border-t border-slate-800/60 font-mono">
        <div className="flex items-center gap-2">
          <span>
            Displaying <strong className="text-slate-100 tabular-nums">{filteredDocsCount}</strong> of{' '}
            <strong className="text-slate-100 tabular-nums">{totalDocsCount}</strong> paperwork records
          </span>
          {activeFiltersCount > 0 && (
            <span className="text-[10px] px-2 py-0.5 rounded-md bg-indigo-950/80 text-indigo-300 border border-indigo-800/50 font-sans font-medium">
              Filtered View
            </span>
          )}
        </div>

        <div className="text-[11px] text-slate-500 font-sans hidden sm:block">
          Audit rate confirmations, signed delivery receipts, and invoicing packets
        </div>
      </div>
    </div>
  );
};
