import React, { useState, useMemo } from 'react';
import { Search, ChevronLeft, ChevronRight, Download, Eye, Copy, Check, ArrowUpDown, CheckSquare, Square, X } from 'lucide-react';
import { FmcsaLead } from '../types/fmcsa';

interface LeadTableProps {
  leads: FmcsaLead[];
  totalMatches: number;
  selectedLeadIds: Set<string>;
  onToggleLeadSelect: (id: string) => void;
  onSelectAllFiltered: (filteredIds: string[]) => void;
  onSelectPage: (pageIds: string[]) => void;
  onClearSelection: () => void;
  onExportAll: () => void;
  onExportSelected: () => void;
  onSelectLead: (lead: FmcsaLead) => void;
  isProcessing: boolean;
  isExportingAll?: boolean;
}

type SortField = 'company' | 'trucks' | 'dot' | 'state' | 'city' | 'recordDate';
type SortOrder = 'asc' | 'desc';

export const LeadTable: React.FC<LeadTableProps> = ({
  leads,
  totalMatches,
  selectedLeadIds,
  onToggleLeadSelect,
  onSelectAllFiltered,
  onSelectPage,
  onClearSelection,
  onExportAll,
  onExportSelected,
  onSelectLead,
  isProcessing,
  isExportingAll = false,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [sortField, setSortField] = useState<SortField>('trucks');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copyToClipboard = (text: string, key: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  };

  // Filter leads based on in-table search query
  const filteredLeads = useMemo(() => {
    if (!searchQuery.trim()) return leads;
    const q = searchQuery.toLowerCase().trim();
    return leads.filter((lead) => {
      return (
        lead.company.toLowerCase().includes(q) ||
        lead.dba.toLowerCase().includes(q) ||
        lead.dot.toLowerCase().includes(q) ||
        lead.mc.toLowerCase().includes(q) ||
        lead.phone.toLowerCase().includes(q) ||
        lead.email.toLowerCase().includes(q) ||
        lead.city.toLowerCase().includes(q) ||
        lead.state.toLowerCase().includes(q) ||
        lead.officer.toLowerCase().includes(q)
      );
    });
  }, [leads, searchQuery]);

  // Sort leads
  const sortedLeads = useMemo(() => {
    return [...filteredLeads].sort((a, b) => {
      let comp = 0;
      if (sortField === 'trucks') {
        comp = a.trucks - b.trucks;
      } else if (sortField === 'company') {
        comp = a.company.localeCompare(b.company);
      } else if (sortField === 'dot') {
        comp = (parseInt(a.dot, 10) || 0) - (parseInt(b.dot, 10) || 0);
      } else if (sortField === 'state') {
        comp = a.state.localeCompare(b.state);
      } else if (sortField === 'city') {
        comp = a.city.localeCompare(b.city);
      } else if (sortField === 'recordDate') {
        comp = (a.recordDate || '').localeCompare(b.recordDate || '');
      }
      return sortOrder === 'asc' ? comp : -comp;
    });
  }, [filteredLeads, sortField, sortOrder]);

  // Pagination calculation
  const totalPages = Math.max(1, Math.ceil(sortedLeads.length / pageSize));
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedLeads = sortedLeads.slice(startIndex, startIndex + pageSize);

  const paginatedLeadIds = useMemo(() => paginatedLeads.map((l) => l.id), [paginatedLeads]);
  const filteredLeadIds = useMemo(() => filteredLeads.map((l) => l.id), [filteredLeads]);

  // Check if all leads on current page are selected
  const isAllPageSelected =
    paginatedLeadIds.length > 0 && paginatedLeadIds.every((id) => selectedLeadIds.has(id));
  const isSomePageSelected =
    paginatedLeadIds.some((id) => selectedLeadIds.has(id)) && !isAllPageSelected;

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
    setCurrentPage(1);
  };

  const handleMasterCheckboxToggle = () => {
    if (isAllPageSelected) {
      // Deselect page
      paginatedLeadIds.forEach((id) => {
        if (selectedLeadIds.has(id)) {
          onToggleLeadSelect(id);
        }
      });
    } else {
      // Select all visible on current page
      onSelectPage(paginatedLeadIds);
    }
  };

  const selectedCount = selectedLeadIds.size;

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden flex flex-col">
      {/* Top Toolbar */}
      <div className="p-4 border-b border-neutral-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-neutral-900/90">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Filter by company, DOT, MC, city, phone..."
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-emerald-500/80 transition-colors"
            />
          </div>
          <div className="text-xs text-neutral-400 whitespace-nowrap">
            Showing <span className="font-mono font-medium text-white">{sortedLeads.length.toLocaleString()}</span> of{' '}
            <span className="font-mono font-medium text-white">{totalMatches.toLocaleString()}</span> matching leads
          </div>
        </div>

        {/* Dual Export Actions (Fix 2) */}
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <div className="flex items-center gap-2 text-xs text-neutral-400 mr-2">
            <span>Per page:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="bg-neutral-950 border border-neutral-800 rounded-md px-2 py-1 text-xs text-white focus:outline-none focus:border-emerald-500"
            >
              <option value="25">25</option>
              <option value="50">50</option>
              <option value="100">100</option>
              <option value="250">250</option>
            </select>
          </div>

          {/* Action 1: Export All Matching Leads */}
          <button
            type="button"
            onClick={onExportAll}
            disabled={totalMatches === 0 || isProcessing || isExportingAll}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-neutral-950 bg-emerald-400 hover:bg-emerald-300 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
            title="Exports all matching leads from local IndexedDB storage"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{isExportingAll ? 'Streaming CSV...' : 'Export All Matching'}</span>
          </button>

          {/* Action 2: Export Selected Leads */}
          <button
            type="button"
            onClick={onExportSelected}
            disabled={selectedCount === 0 || isProcessing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-300 bg-emerald-950/40 hover:bg-emerald-900/50 border border-emerald-500/40 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed whitespace-nowrap"
            title="Exports only the checked prospects"
          >
            <CheckSquare className="w-3.5 h-3.5" />
            <span>Export Selected ({selectedCount.toLocaleString()})</span>
          </button>
        </div>
      </div>

      {/* Multi-Selection Control Bar (Fix 2) */}
      <div className="px-4 py-2 bg-neutral-950/70 border-b border-neutral-800 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-3">
          {/* Selected indicator */}
          <div className="flex items-center gap-2">
            <span className="font-semibold text-emerald-400 font-mono tabular-nums">
              {selectedCount.toLocaleString()} leads selected
            </span>
            {selectedCount > 0 && (
              <button
                type="button"
                onClick={onClearSelection}
                className="inline-flex items-center gap-1 text-[11px] text-neutral-400 hover:text-red-400 ml-1 transition-colors"
                title="Deselect all records"
              >
                <X className="w-3 h-3" />
                Clear
              </button>
            )}
          </div>

          <span aria-hidden="true" className="text-neutral-700 hidden sm:inline">|</span>

          {/* Quick Selection Buttons */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onSelectPage(paginatedLeadIds)}
              disabled={paginatedLeadIds.length === 0}
              className="px-2 py-0.5 text-[11px] font-medium text-neutral-300 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 rounded transition-colors disabled:opacity-30"
            >
              Select Page ({paginatedLeadIds.length})
            </button>
            <button
              type="button"
              onClick={() => onSelectAllFiltered(filteredLeadIds)}
              disabled={filteredLeadIds.length === 0}
              className="px-2 py-0.5 text-[11px] font-medium text-neutral-300 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 rounded transition-colors disabled:opacity-30"
            >
              Select All Filtered ({filteredLeadIds.length.toLocaleString()})
            </button>
          </div>
        </div>

        {/* Scalable storage indicator for Fix 1 */}
        {totalMatches > leads.length && (
          <div className="text-[11px] text-neutral-400 italic">
            Displaying top {leads.length.toLocaleString()} leads in live table · All {totalMatches.toLocaleString()} leads saved in IndexedDB for full export.
          </div>
        )}
      </div>

      {/* Main Table Area */}
      <div className="overflow-x-auto min-h-[380px] max-h-[620px]">
        {paginatedLeads.length > 0 ? (
          <table className="w-full text-left border-collapse text-xs">
            <thead className="bg-neutral-950 text-neutral-400 font-medium sticky top-0 z-10 border-b border-neutral-800">
              <tr>
                {/* Checkbox Master Column */}
                <th className="py-2.5 px-3 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={isAllPageSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = isSomePageSelected;
                    }}
                    onChange={handleMasterCheckboxToggle}
                    className="w-4 h-4 rounded border-neutral-700 bg-neutral-900 text-emerald-500 focus:ring-emerald-500/20 cursor-pointer"
                    title="Select/deselect all leads on current page"
                  />
                </th>
                <th
                  onClick={() => handleSort('company')}
                  className="py-2.5 px-3 cursor-pointer hover:text-white transition-colors whitespace-nowrap"
                >
                  <div className="flex items-center gap-1">
                    <span>Company / DBA</span>
                    <ArrowUpDown className="w-3 h-3 text-neutral-600" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('dot')}
                  className="py-2.5 px-3 cursor-pointer hover:text-white transition-colors whitespace-nowrap"
                >
                  <div className="flex items-center gap-1">
                    <span>DOT / MC</span>
                    <ArrowUpDown className="w-3 h-3 text-neutral-600" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('recordDate')}
                  className="py-2.5 px-3 cursor-pointer hover:text-white transition-colors whitespace-nowrap"
                >
                  <div className="flex items-center gap-1">
                    <span>Record Date</span>
                    <ArrowUpDown className="w-3 h-3 text-neutral-600" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('trucks')}
                  className="py-2.5 px-3 text-right cursor-pointer hover:text-white transition-colors whitespace-nowrap"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>Trucks</span>
                    <ArrowUpDown className="w-3 h-3 text-neutral-600" />
                  </div>
                </th>
                <th className="py-2.5 px-3 text-right whitespace-nowrap">Power Units</th>
                <th className="py-2.5 px-3 text-right whitespace-nowrap">Drivers</th>
                <th className="py-2.5 px-3 whitespace-nowrap">Phone</th>
                <th className="py-2.5 px-3 whitespace-nowrap">Email</th>
                <th
                  onClick={() => handleSort('city')}
                  className="py-2.5 px-3 cursor-pointer hover:text-white transition-colors whitespace-nowrap"
                >
                  <div className="flex items-center gap-1">
                    <span>City, State</span>
                    <ArrowUpDown className="w-3 h-3 text-neutral-600" />
                  </div>
                </th>
                <th className="py-2.5 px-3 whitespace-nowrap">Carrier Op (Raw)</th>
                <th className="py-2.5 px-3 whitespace-nowrap">Officer</th>
                <th className="py-2.5 px-3 whitespace-nowrap">Interstate</th>
                <th className="py-2.5 px-3 text-center whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/60 font-sans">
              {paginatedLeads.map((lead) => {
                const isSelected = selectedLeadIds.has(lead.id);
                return (
                  <tr
                    key={lead.id}
                    onClick={() => onSelectLead(lead)}
                    className={`hover:bg-neutral-800/40 transition-colors cursor-pointer group ${
                      isSelected ? 'bg-emerald-500/5' : ''
                    }`}
                  >
                    {/* Checkbox Cell */}
                    <td
                      className="py-2 px-3 text-center"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => onToggleLeadSelect(lead.id)}
                        className="w-4 h-4 rounded border-neutral-700 bg-neutral-900 text-emerald-500 focus:ring-emerald-500/20 cursor-pointer"
                      />
                    </td>

                    {/* Company */}
                    <td className="py-2 px-3 max-w-[220px]">
                      <div className="font-semibold text-white truncate group-hover:text-emerald-400 transition-colors">
                        {lead.company}
                      </div>
                      {lead.dba && (
                        <div className="text-[11px] text-neutral-400 truncate">
                          DBA: {lead.dba}
                        </div>
                      )}
                    </td>

                    {/* DOT / MC */}
                    <td className="py-2 px-3 whitespace-nowrap font-mono text-[11px]">
                      <div className="text-white">DOT {lead.dot || 'N/A'}</div>
                      <div className="text-neutral-400">{lead.mc ? lead.mc : 'No MC'}</div>
                    </td>

                    {/* Record Date */}
                    <td className="py-2 px-3 whitespace-nowrap font-mono text-[11px] text-neutral-300">
                      {lead.recordDate || '—'}
                    </td>

                    {/* Trucks */}
                    <td className="py-2 px-3 text-right font-mono text-emerald-400 font-semibold tabular-nums whitespace-nowrap">
                      {lead.trucks}
                    </td>

                    {/* Power Units */}
                    <td className="py-2 px-3 text-right font-mono text-neutral-300 tabular-nums whitespace-nowrap">
                      {lead.powerUnits}
                    </td>

                    {/* Drivers */}
                    <td className="py-2 px-3 text-right font-mono text-neutral-300 tabular-nums whitespace-nowrap">
                      {lead.drivers}
                    </td>

                    {/* Phone */}
                    <td className="py-2 px-3 whitespace-nowrap font-mono text-[11px]">
                      {lead.phone ? (
                        <div className="flex items-center gap-1.5">
                          <span className="text-white">{lead.phone}</span>
                          <button
                            type="button"
                            onClick={(e) => copyToClipboard(lead.phone, `p-${lead.id}`, e)}
                            className="opacity-0 group-hover:opacity-100 text-neutral-400 hover:text-white transition-opacity"
                            title="Copy phone"
                          >
                            {copiedKey === `p-${lead.id}` ? (
                              <Check className="w-3 h-3 text-emerald-400" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      ) : (
                        <span className="text-neutral-600">None</span>
                      )}
                    </td>

                    {/* Email */}
                    <td className="py-2 px-3 max-w-[180px] font-mono text-[11px] truncate">
                      {lead.email ? (
                        <div className="flex items-center gap-1.5">
                          <span className="text-white truncate">{lead.email}</span>
                          <button
                            type="button"
                            onClick={(e) => copyToClipboard(lead.email, `e-${lead.id}`, e)}
                            className="opacity-0 group-hover:opacity-100 text-neutral-400 hover:text-white transition-opacity shrink-0"
                            title="Copy email"
                          >
                            {copiedKey === `e-${lead.id}` ? (
                              <Check className="w-3 h-3 text-emerald-400" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      ) : (
                        <span className="text-neutral-600">None</span>
                      )}
                    </td>

                    {/* City, State */}
                    <td className="py-2 px-3 whitespace-nowrap text-neutral-300">
                      {lead.city ? `${lead.city}, ` : ''}{lead.state}
                    </td>

                    {/* Raw Carrier Operation */}
                    <td className="py-2 px-3 whitespace-nowrap font-mono text-emerald-400">
                      {lead.carrierOperation || '—'}
                    </td>

                    {/* Officer */}
                    <td className="py-2 px-3 max-w-[130px] truncate text-neutral-300">
                      {lead.officer || '—'}
                    </td>

                    {/* Interstate Beyond / Within */}
                    <td className="py-2 px-3 whitespace-nowrap font-mono text-[11px] text-neutral-400">
                      &gt;100:{lead.interstateBeyond100 || 'N'} / &lt;100:{lead.interstateWithin100 || 'N'}
                    </td>

                    {/* Actions */}
                    <td className="py-2 px-3 text-center whitespace-nowrap">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectLead(lead);
                        }}
                        className="p-1 text-neutral-400 hover:text-emerald-400 hover:bg-neutral-800 rounded transition-colors"
                        title="View all details"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="p-12 text-center space-y-3">
            <div className="text-neutral-500 text-sm font-medium">
              {leads.length === 0
                ? 'No matching leads extracted yet'
                : 'No leads match your search query'}
            </div>
            <p className="text-xs text-neutral-600 max-w-md mx-auto">
              {leads.length === 0
                ? 'Select an FMCSA census file and click "Extract Leads" or try the "Load Sample Census" button to see streaming in action.'
                : 'Try adjusting your search terms or clearing the filter box.'}
            </p>
          </div>
        )}
      </div>

      {/* Pagination Footer */}
      {totalPages > 1 && (
        <div className="p-3 border-t border-neutral-800 bg-neutral-950/80 flex items-center justify-between text-xs text-neutral-400">
          <div>
            Page <span className="font-mono text-white">{currentPage}</span> of{' '}
            <span className="font-mono text-white">{totalPages}</span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="p-1.5 rounded-md bg-neutral-900 border border-neutral-800 hover:border-neutral-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-2 font-mono text-neutral-300">
              {startIndex + 1}–{Math.min(startIndex + pageSize, sortedLeads.length)}
            </span>
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              className="p-1.5 rounded-md bg-neutral-900 border border-neutral-800 hover:border-neutral-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
