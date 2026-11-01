import React, { useState, useMemo } from 'react';
import { CreditStatus } from '../../types/domain.types.ts';
import {
  BrokerWithPerformance,
  BrokerStatus,
  formatMcNumber,
  formatDotNumber,
  CREDIT_STATUS_OPTIONS,
  BROKER_STATUS_OPTIONS,
} from './brokerTypes.ts';
import { StatusBadge } from '../../components/common/StatusBadge.tsx';
import { EmptyState } from '../../components/common/EmptyState.tsx';
import {
  Search,
  Building2,
  Phone,
  Mail,
  ShieldCheck,
  Clock,
  DollarSign,
  Plus,
  Eye,
  Edit2,
  Trash2,
  RefreshCw,
  SlidersHorizontal,
  ChevronDown,
  Layers,
  TrendingUp,
  AlertTriangle,
  Copy,
  Check,
  RotateCcw,
} from 'lucide-react';

export interface BrokerListProps {
  brokers: BrokerWithPerformance[];
  isLoading: boolean;
  error: string | null;
  onRefresh: () => void;
  onViewDetails: (broker: BrokerWithPerformance) => void;
  onEditBroker: (broker: BrokerWithPerformance) => void;
  onToggleStatus: (broker: BrokerWithPerformance) => void;
  onDeleteBroker?: (broker: BrokerWithPerformance) => void;
  onAddBroker: () => void;
  canEdit: boolean;
  canDelete: boolean;
  updatingBrokerId?: string | null;
}

export const BrokerList: React.FC<BrokerListProps> = ({
  brokers,
  isLoading,
  error,
  onRefresh,
  onViewDetails,
  onEditBroker,
  onToggleStatus,
  onDeleteBroker,
  onAddBroker,
  canEdit,
  canDelete,
  updatingBrokerId,
}) => {
  // Search & Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [creditFilter, setCreditFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('newest');
  const [copiedMcId, setCopiedMcId] = useState<string | null>(null);

  // Copy MC Number helper
  const handleCopyMc = (e: React.MouseEvent, brokerId: string, mc: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(mc.replace(/[^0-9]/g, ''));
    setCopiedMcId(brokerId);
    setTimeout(() => setCopiedMcId(null), 2000);
  };

  // Filtered & Sorted brokers
  const filteredBrokers = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();

    return brokers.filter((b) => {
      // 1. Search Query
      if (q) {
        const companyMatch = b.company_name.toLowerCase().includes(q);
        const mcMatch = b.mc_number ? b.mc_number.toLowerCase().includes(q) : false;
        const dotMatch = b.dot_number ? b.dot_number.toLowerCase().includes(q) : false;
        const contactMatch = b.contact_name ? b.contact_name.toLowerCase().includes(q) : false;
        const emailMatch = b.contact_email ? b.contact_email.toLowerCase().includes(q) : false;
        const phoneMatch = b.contact_phone ? b.contact_phone.toLowerCase().includes(q) : false;
        const notesMatch = b.notes ? b.notes.toLowerCase().includes(q) : false;

        if (!companyMatch && !mcMatch && !dotMatch && !contactMatch && !emailMatch && !phoneMatch && !notesMatch) {
          return false;
        }
      }

      // 2. Credit Filter
      if (creditFilter !== 'all' && b.credit_status !== creditFilter) {
        return false;
      }

      // 3. Status Filter
      if (statusFilter !== 'all' && (b.status || 'active') !== statusFilter) {
        return false;
      }

      return true;
    });
  }, [brokers, searchQuery, creditFilter, statusFilter]);

  // Apply sorting
  const sortedBrokers = useMemo(() => {
    const list = [...filteredBrokers];
    list.sort((a, b) => {
      switch (sortBy) {
        case 'newest':
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case 'oldest':
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case 'company_asc':
          return a.company_name.localeCompare(b.company_name);
        case 'company_desc':
          return b.company_name.localeCompare(a.company_name);
        case 'payment_terms':
          return a.payment_terms_days - b.payment_terms_days;
        case 'total_gross':
          return (b.performance?.total_gross || 0) - (a.performance?.total_gross || 0);
        default:
          return 0;
      }
    });
    return list;
  }, [filteredBrokers, sortBy]);

  const activeFiltersCount =
    (searchQuery ? 1 : 0) +
    (creditFilter !== 'all' ? 1 : 0) +
    (statusFilter !== 'all' ? 1 : 0) +
    (sortBy !== 'newest' ? 1 : 0);

  const resetFilters = () => {
    setSearchQuery('');
    setCreditFilter('all');
    setStatusFilter('all');
    setSortBy('newest');
  };

  return (
    <div id="broker-list-component" className="space-y-4">
      {/* Control Bar: Search, Filters & Action */}
      <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Search Bar */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              id="broker-search-input"
              type="text"
              placeholder="Search by Brokerage name, MC#, DOT#, contact person, phone, or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 hover:border-slate-700 transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-200"
              >
                Clear
              </button>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 self-end md:self-auto">
            <button
              id="refresh-brokers-btn"
              onClick={onRefresh}
              disabled={isLoading}
              title="Refresh broker directory"
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>

            {canEdit && (
              <button
                id="add-broker-btn"
                onClick={onAddBroker}
                className="px-3.5 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold shadow-md shadow-sky-900/30 flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Add Broker / Shipper</span>
              </button>
            )}
          </div>
        </div>

        {/* Filter Badges Row */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-800/80">
          <div className="flex items-center gap-1.5 text-xs text-slate-400 mr-1">
            <SlidersHorizontal className="w-3.5 h-3.5 text-sky-400" />
            <span>Filters:</span>
          </div>

          {/* Credit Status Filter */}
          <select
            id="broker-credit-filter-select"
            value={creditFilter}
            onChange={(e) => setCreditFilter(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500 hover:border-slate-700 cursor-pointer"
          >
            <option value="all">All Credit Ratings</option>
            {CREDIT_STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          {/* Status Filter */}
          <select
            id="broker-status-filter-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500 hover:border-slate-700 cursor-pointer"
          >
            <option value="all">All Statuses</option>
            {BROKER_STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          {/* Sort By */}
          <select
            id="broker-sort-select"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500 hover:border-slate-700 cursor-pointer ml-auto"
          >
            <option value="newest">Sort: Newest Added</option>
            <option value="oldest">Sort: Oldest Added</option>
            <option value="company_asc">Sort: Company A-Z</option>
            <option value="company_desc">Sort: Company Z-A</option>
            <option value="payment_terms">Sort: Payment Terms (Fastest)</option>
            <option value="total_gross">Sort: Revenue (Highest)</option>
          </select>

          {activeFiltersCount > 0 && (
            <button
              id="broker-reset-filters-btn"
              type="button"
              onClick={resetFilters}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700/60 rounded-lg text-xs font-semibold text-slate-200 hover:text-white transition-colors cursor-pointer shrink-0"
              title="Reset all filters"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
              <span>Reset Filters</span>
            </button>
          )}
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="flex items-center justify-between p-3.5 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-200 text-xs">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={onRefresh}
            className="underline text-rose-300 hover:text-rose-100 font-semibold"
          >
            Retry
          </button>
        </div>
      )}

      {/* Main Content Area */}
      {isLoading ? (
        <div className="p-8 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
          <div className="h-6 bg-slate-800 rounded animate-pulse w-1/4" />
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-16 bg-slate-950/60 rounded-lg animate-pulse" />
            ))}
          </div>
        </div>
      ) : sortedBrokers.length === 0 ? (
        <EmptyState
          id="broker-directory-empty-state"
          icon={Building2}
          title={activeFiltersCount > 0 ? 'No Brokers Found' : 'No Freight Brokers in Directory'}
          description={
            activeFiltersCount > 0
              ? 'No brokerages match your current search and filter criteria. Try resetting filters.'
              : 'Add freight brokers, 3PL logistics companies, and direct shippers to track credit ratings and booking history.'
          }
          actionLabel={activeFiltersCount > 0 ? 'Reset Filters' : 'Add First Broker'}
          onAction={activeFiltersCount > 0 ? resetFilters : onAddBroker}
        />
      ) : (
        <div className="overflow-hidden rounded-xl bg-slate-900 border border-slate-800 shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-950/80 border-b border-slate-800 text-slate-400 uppercase tracking-wider text-[11px] font-semibold">
                  <th className="py-3.5 px-4">Brokerage / Authority</th>
                  <th className="py-3.5 px-4">Credit Assessment</th>
                  <th className="py-3.5 px-4">Payment Terms</th>
                  <th className="py-3.5 px-4">Primary Contact</th>
                  <th className="py-3.5 px-4">Load History & Gross</th>
                  <th className="py-3.5 px-4 text-center">Status</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {sortedBrokers.map((broker) => {
                  const isUpdating = updatingBrokerId === broker.id;
                  const perf = broker.performance || {
                    loads_count: 0,
                    total_gross: 0,
                    avg_rpm: 0,
                    active_loads_count: 0,
                    last_booked_at: null,
                    payment_terms_avg_days: broker.payment_terms_days,
                  };

                  return (
                    <tr
                      key={broker.id}
                      onClick={() => onViewDetails(broker)}
                      className={`hover:bg-slate-850/60 transition-colors cursor-pointer ${
                        isUpdating ? 'opacity-50 pointer-events-none' : ''
                      } ${broker.status === 'inactive' ? 'bg-slate-950/30' : ''}`}
                    >
                      {/* Column 1: Company & Authorities */}
                      <td className="py-3.5 px-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-100 text-sm hover:text-sky-300 transition-colors">
                              {broker.company_name}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 flex-wrap text-[11px] font-mono">
                            {broker.mc_number ? (
                              <button
                                type="button"
                                onClick={(e) => handleCopyMc(e, broker.id, broker.mc_number!)}
                                title="Click to copy MC Number"
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800 text-sky-300 hover:border-sky-700 transition-colors"
                              >
                                <span>{formatMcNumber(broker.mc_number)}</span>
                                {copiedMcId === broker.id ? (
                                  <Check className="w-3 h-3 text-emerald-400" />
                                ) : (
                                  <Copy className="w-3 h-3 text-slate-500 opacity-70" />
                                )}
                              </button>
                            ) : (
                              <span className="text-slate-600 font-sans">No MC</span>
                            )}

                            {broker.dot_number && (
                              <span className="text-slate-400">
                                {formatDotNumber(broker.dot_number)}
                              </span>
                            )}
                          </div>

                          {broker.notes && (
                            <p className="text-[11px] text-slate-500 line-clamp-1 max-w-xs">
                              {broker.notes}
                            </p>
                          )}
                        </div>
                      </td>

                      {/* Column 2: Credit Status */}
                      <td className="py-3.5 px-4">
                        <div className="space-y-1">
                          <StatusBadge status={broker.credit_status} type="credit" size="sm" />
                          <div className="text-[11px] text-slate-500">
                            {broker.credit_status === 'approved'
                              ? 'Direct & Factoring OK'
                              : broker.credit_status === 'caution'
                              ? 'Slow Pay / Watch DSO'
                              : broker.credit_status === 'factoring_only'
                              ? 'Factoring Required'
                              : 'Do Not Dispatch'}
                          </div>
                        </div>
                      </td>

                      {/* Column 3: Payment Terms */}
                      <td className="py-3.5 px-4 font-mono">
                        <div className="flex items-center gap-1.5 text-slate-200 font-semibold">
                          <Clock className="w-3.5 h-3.5 text-amber-400" />
                          <span>{broker.payment_terms_days}d Net</span>
                        </div>
                        <div className="text-[11px] text-slate-500 font-sans">
                          {broker.payment_terms_days <= 1
                            ? 'Instant QuickPay'
                            : broker.payment_terms_days <= 15
                            ? 'Fast turnaround'
                            : 'Standard terms'}
                        </div>
                      </td>

                      {/* Column 4: Primary Contact */}
                      <td className="py-3.5 px-4">
                        <div className="space-y-0.5">
                          <div className="font-medium text-slate-200">
                            {broker.contact_name || 'General Desk'}
                          </div>
                          {broker.contact_phone && (
                            <div className="flex items-center gap-1 text-slate-400">
                              <Phone className="w-3 h-3 text-slate-500" />
                              <a
                                href={`tel:${broker.contact_phone}`}
                                onClick={(e) => e.stopPropagation()}
                                className="hover:text-emerald-400 transition-colors"
                              >
                                {broker.contact_phone}
                              </a>
                            </div>
                          )}
                          {broker.contact_email && (
                            <div className="flex items-center gap-1 text-slate-400">
                              <Mail className="w-3 h-3 text-slate-500" />
                              <a
                                href={`mailto:${broker.contact_email}`}
                                onClick={(e) => e.stopPropagation()}
                                className="hover:text-sky-400 transition-colors truncate max-w-[150px] inline-block"
                              >
                                {broker.contact_email}
                              </a>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Column 5: Performance / Dispatches */}
                      <td className="py-3.5 px-4 font-mono">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5 font-bold text-slate-200">
                            <span className="text-emerald-400">
                              ${perf.total_gross.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                            </span>
                            <span className="text-[11px] text-slate-500 font-normal">
                              ({perf.loads_count} {perf.loads_count === 1 ? 'load' : 'loads'})
                            </span>
                          </div>
                          {perf.avg_rpm > 0 && (
                            <div className="text-[11px] text-purple-300">
                              ${perf.avg_rpm.toFixed(2)}/mi avg
                            </div>
                          )}
                          {perf.active_loads_count > 0 && (
                            <div className="text-[10px] text-sky-400 font-sans font-semibold">
                              ● {perf.active_loads_count} active in transit
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Column 6: Status Toggle */}
                      <td className="py-3.5 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => canEdit && onToggleStatus(broker)}
                          disabled={!canEdit}
                          title={canEdit ? 'Click to toggle Active / Inactive status' : 'Read-only'}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition-all ${
                            broker.status === 'inactive'
                              ? 'bg-slate-800 text-slate-400 hover:bg-slate-750'
                              : 'bg-emerald-950/70 border border-emerald-800/60 text-emerald-300 hover:bg-emerald-900/80'
                          } ${canEdit ? 'cursor-pointer' : 'cursor-default'}`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              broker.status === 'inactive' ? 'bg-slate-500' : 'bg-emerald-400'
                            }`}
                          />
                          <span>{broker.status === 'inactive' ? 'Inactive' : 'Active'}</span>
                        </button>
                      </td>

                      {/* Column 7: Actions */}
                      <td className="py-3.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => onViewDetails(broker)}
                            title="View Full Broker Profile"
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-sky-300 transition-colors cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          {canEdit && (
                            <button
                              type="button"
                              onClick={() => onEditBroker(broker)}
                              title="Edit Broker"
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-sky-300 transition-colors cursor-pointer"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {canDelete && onDeleteBroker && (
                            <button
                              type="button"
                              onClick={() => onDeleteBroker(broker)}
                              title="Delete Broker"
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950/60 text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
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

          {/* Table Footer / Counter */}
          <div className="p-3 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-xs text-slate-500">
            <div>
              Showing <span className="text-slate-300 font-semibold">{sortedBrokers.length}</span> of{' '}
              <span className="text-slate-300 font-semibold">{brokers.length}</span> freight brokers
            </div>
            <div className="flex items-center gap-4">
              <span>
                Active Partners:{' '}
                <strong className="text-emerald-400">
                  {brokers.filter((b) => (b.status || 'active') === 'active').length}
                </strong>
              </span>
              <span>
                Factoring Verified:{' '}
                <strong className="text-sky-400">
                  {brokers.filter((b) => b.credit_status === 'factoring_only').length}
                </strong>
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
