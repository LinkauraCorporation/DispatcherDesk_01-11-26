import React, { useState } from 'react';
import {
  X,
  AlertTriangle,
  UserPlus,
  PackageCheck,
  CheckCircle2,
  ArrowRight,
  Search,
  CheckSquare,
  Square,
  ShieldCheck,
  Eye,
} from 'lucide-react';
import { LoadWithRelations } from '../loads/loadTypes.ts';
import { StatusBadge } from '../../components/common/StatusBadge.tsx';
import { formatCurrency } from '../../lib/calculations.ts';
import { useTimezone } from '../../contexts/TimezoneContext.tsx';
import { formatInTimezone } from '../../lib/timezones.ts';

interface UnassignedLoadsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  unassignedLoads: LoadWithRelations[];
  onOpenBulkAssign: (selectedLoads: LoadWithRelations[]) => void;
  onLoadClick: (load: LoadWithRelations) => void;
}

export const UnassignedLoadsDrawer: React.FC<UnassignedLoadsDrawerProps> = ({
  isOpen,
  onClose,
  unassignedLoads,
  onOpenBulkAssign,
  onLoadClick,
}) => {
  const { operationalTimezone } = useTimezone();
  const [selectedLoadIds, setSelectedLoadIds] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  if (!isOpen) return null;

  const filteredLoads = unassignedLoads.filter((load) => {
    if (!searchTerm.trim()) return true;
    const q = searchTerm.toLowerCase().trim();
    const loadNum = (load.load_number || '').toLowerCase();
    const client = (load.client?.company_name || '').toLowerCase();
    const broker = (load.broker?.company_name || '').toLowerCase();
    const origin = `${load.origin_city}, ${load.origin_state}`.toLowerCase();
    const dest = `${load.dest_city}, ${load.dest_state}`.toLowerCase();
    const commodity = (load.commodity || '').toLowerCase();

    return (
      loadNum.includes(q) ||
      client.includes(q) ||
      broker.includes(q) ||
      origin.includes(q) ||
      dest.includes(q) ||
      commodity.includes(q)
    );
  });

  const handleToggleSelectAll = () => {
    if (selectedLoadIds.length === filteredLoads.length && filteredLoads.length > 0) {
      setSelectedLoadIds([]);
    } else {
      setSelectedLoadIds(filteredLoads.map((l) => l.id));
    }
  };

  const handleToggleSelectLoad = (loadId: string) => {
    setSelectedLoadIds((prev) =>
      prev.includes(loadId) ? prev.filter((id) => id !== loadId) : [...prev, loadId]
    );
  };

  const selectedLoadsObjects = unassignedLoads.filter((l) =>
    selectedLoadIds.includes(l.id)
  );

  const isAllSelected =
    filteredLoads.length > 0 && selectedLoadIds.length === filteredLoads.length;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-3xl bg-slate-950 border-l border-slate-800 shadow-2xl flex flex-col">
          {/* Header */}
          <div className="px-6 py-5 border-b border-slate-800/80 bg-slate-900/80 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-950/80 text-amber-400 border border-amber-800/60 flex items-center justify-center font-bold">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-slate-100 tracking-tight">
                    Unassigned Active Loads
                  </h2>
                  <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-amber-950/80 text-amber-300 border border-amber-800/60 font-mono">
                    {unassignedLoads.length} Unassigned
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Active loads requiring operational team member assignment.
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Search & Bulk Action Bar */}
          <div className="px-6 py-3.5 border-b border-slate-800/80 bg-slate-900/40 flex flex-wrap items-center justify-between gap-3 shrink-0">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search unassigned loads by #, customer, route..."
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded-lg text-slate-200 placeholder-slate-400 focus:outline-hidden focus:border-amber-500"
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleToggleSelectAll}
                className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700/80 rounded-lg text-xs font-semibold text-slate-300 flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                {isAllSelected ? (
                  <CheckSquare className="w-3.5 h-3.5 text-amber-400" />
                ) : (
                  <Square className="w-3.5 h-3.5 text-slate-500" />
                )}
                <span>Select All ({filteredLoads.length})</span>
              </button>

              <button
                onClick={() => {
                  const loadsToAssign =
                    selectedLoadsObjects.length > 0 ? selectedLoadsObjects : filteredLoads;
                  onOpenBulkAssign(loadsToAssign);
                }}
                disabled={filteredLoads.length === 0}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm ${
                  selectedLoadIds.length > 0
                    ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-amber-600/20'
                    : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/20'
                }`}
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>
                  {selectedLoadIds.length > 0
                    ? `Assign Selected (${selectedLoadIds.length})`
                    : `Assign All (${filteredLoads.length})`}
                </span>
              </button>
            </div>
          </div>

          {/* List of Unassigned Loads */}
          <div className="flex-1 overflow-y-auto p-6 min-h-0">
            {filteredLoads.length === 0 ? (
              <div className="text-center py-16 px-4 border border-dashed border-slate-800 rounded-xl bg-slate-900/30">
                <CheckCircle2 className="w-12 h-12 text-emerald-500/80 mx-auto mb-3" />
                <h3 className="text-sm font-semibold text-slate-200">
                  All active loads have team members assigned!
                </h3>
                <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                  No active loads currently require team assignment. Great operational coverage!
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredLoads.map((load) => {
                  const isSelected = selectedLoadIds.includes(load.id);

                  return (
                    <div
                      key={load.id}
                      className={`group border rounded-xl p-4 transition-all duration-150 cursor-pointer shadow-sm ${
                        isSelected
                          ? 'bg-amber-950/20 border-amber-600/60 shadow-amber-500/5'
                          : 'bg-slate-900/80 hover:bg-slate-900 border-slate-800/90 hover:border-slate-700'
                      }`}
                      onClick={() => handleToggleSelectLoad(load.id)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleSelectLoad(load.id);
                            }}
                            className="mt-0.5 text-slate-400 hover:text-amber-400 transition-colors"
                          >
                            {isSelected ? (
                              <CheckSquare className="w-4 h-4 text-amber-400" />
                            ) : (
                              <Square className="w-4 h-4 text-slate-600" />
                            )}
                          </button>

                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-amber-400 text-sm">
                                #{load.load_number}
                              </span>
                              <StatusBadge status={load.pipeline_status} type="pipeline" size="sm" />
                              <span className="text-xs font-semibold text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 px-2 py-0.2 rounded">
                                {formatCurrency(Number(load.rate || 0))}
                              </span>
                              <span className="text-[10px] px-2 py-0.2 rounded bg-rose-950/60 text-rose-300 border border-rose-800/50 font-semibold">
                                Unassigned
                              </span>
                            </div>

                            {/* Route */}
                            <div className="flex items-center gap-2 mt-2 text-xs text-slate-200 font-medium">
                              <span>{load.origin_city}, {load.origin_state}</span>
                              <ArrowRight className="w-3 h-3 text-slate-500 shrink-0" />
                              <span>{load.dest_city}, {load.dest_state}</span>
                              {load.commodity && (
                                <span className="text-slate-400 text-[11px]">
                                  • {load.commodity}
                                </span>
                              )}
                            </div>

                            {/* Customer & Dates */}
                            <div className="text-[11px] text-slate-400 mt-1 flex flex-wrap items-center gap-3">
                              {load.client?.company_name && (
                                <span>Client: <strong className="text-slate-300">{load.client.company_name}</strong></span>
                              )}
                              {load.broker?.company_name && (
                                <span>Broker: <strong className="text-slate-300">{load.broker.company_name}</strong></span>
                              )}
                              {load.pickup_datetime && (
                                <span>Pickup: {formatInTimezone(load.pickup_datetime, operationalTimezone, { includeDate: true, includeTime: false, includeTimezoneCode: false })}</span>
                              )}
                              {load.delivery_datetime && (
                                <span>Delivery: {formatInTimezone(load.delivery_datetime, operationalTimezone, { includeDate: true, includeTime: false, includeTimezoneCode: false })}</span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onLoadClick(load);
                            }}
                            className="p-1.5 text-slate-400 hover:text-indigo-300 hover:bg-indigo-950/40 rounded-lg transition-colors cursor-pointer"
                            title="View Load Details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
