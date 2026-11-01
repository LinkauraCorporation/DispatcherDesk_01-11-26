import React, { useState } from 'react';
import {
  X,
  UserCheck,
  PackageCheck,
  Clock,
  Truck,
  CheckCircle2,
  DollarSign,
  Search,
  Filter,
  ArrowRight,
  Mail,
  Phone,
  Globe,
  Plus,
  Eye,
  UserMinus,
  AlertCircle,
  ExternalLink,
  Users,
} from 'lucide-react';
import { TeamMember, PipelineStatus } from '../../types/domain.types.ts';
import { LoadWithRelations } from '../loads/loadTypes.ts';
import {
  TeamMemberWorkloadSummary,
  getWorkloadBadgeConfig,
} from './workloadTypes.ts';
import { StatusBadge } from '../../components/common/StatusBadge.tsx';
import { formatCurrency } from '../../lib/calculations.ts';
import { loadService } from '../loads/loadService.ts';

interface MemberWorkloadDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  summary: TeamMemberWorkloadSummary | null;
  onLoadClick: (load: LoadWithRelations) => void;
  onAssignLoadsClick: (member: TeamMember) => void;
  onAssignmentChanged?: () => void;
  organizationId: string;
}

function getRoleBadge(role: string) {
  switch (role) {
    case 'owner_admin':
      return {
        label: 'Admin',
        class: 'bg-indigo-950/80 text-indigo-300 border-indigo-800/60',
      };
    case 'dispatcher':
      return {
        label: 'Dispatcher',
        class: 'bg-emerald-950/80 text-emerald-300 border-emerald-800/60',
      };
    case 'staff':
      return {
        label: 'Staff',
        class: 'bg-slate-800/80 text-slate-300 border-slate-700/60',
      };
    default:
      return {
        label: role,
        class: 'bg-slate-800/80 text-slate-300 border-slate-700/60',
      };
  }
}

export const MemberWorkloadDrawer: React.FC<MemberWorkloadDrawerProps> = ({
  isOpen,
  onClose,
  summary,
  onLoadClick,
  onAssignLoadsClick,
  onAssignmentChanged,
  organizationId,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | PipelineStatus>('all');
  const [isRemovingLoadId, setIsRemovingLoadId] = useState<string | null>(null);

  if (!isOpen || !summary) return null;

  const { member, assignedLoads, workloadLevel, workloadPercentage } = summary;
  const badgeConfig = getWorkloadBadgeConfig(workloadLevel);
  const roleBadge = getRoleBadge(member.role);

  // Filter loads within this member's assigned loads
  const filteredLoads = assignedLoads.filter((load) => {
    if (statusFilter !== 'all' && load.pipeline_status !== statusFilter) {
      return false;
    }
    if (searchTerm.trim()) {
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
    }
    return true;
  });

  const totalRevenue = assignedLoads.reduce(
    (sum, l) => sum + Number(l.rate || 0),
    0
  );

  const handleRemoveMemberFromLoad = async (load: LoadWithRelations, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Remove ${member.full_name || 'member'} from Load #${load.load_number}?`)) {
      return;
    }

    try {
      setIsRemovingLoadId(load.id);
      await loadService.removeTeamMemberFromLoad(
        organizationId,
        load.id,
        member.user_id,
        'Admin',
        'usr-admin'
      );
      if (onAssignmentChanged) {
        onAssignmentChanged();
      }
    } catch (err) {
      console.error('Failed to remove member from load:', err);
      alert('Failed to remove member from load.');
    } finally {
      setIsRemovingLoadId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-3xl bg-slate-950 border-l border-slate-800 shadow-2xl flex flex-col">
          {/* Top Header */}
          <div className="px-6 py-5 border-b border-slate-800/80 bg-slate-900/60 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-indigo-950 text-indigo-300 border border-indigo-800/60 flex items-center justify-center font-bold text-lg shadow-sm">
                {(member.full_name || 'U').charAt(0).toUpperCase()}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-slate-100 tracking-tight">
                    {member.full_name || 'Unnamed Member'}
                  </h2>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-md font-semibold border ${roleBadge.class}`}
                  >
                    {roleBadge.label}
                  </span>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-md font-semibold border ${badgeConfig.bgClass} ${badgeConfig.textClass} ${badgeConfig.borderClass}`}
                  >
                    {badgeConfig.label} Workload
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-slate-400">
                  {member.email && (
                    <span className="flex items-center gap-1">
                      <Mail className="w-3 h-3 text-slate-500" />
                      {member.email}
                    </span>
                  )}
                  {member.phone && (
                    <span className="flex items-center gap-1">
                      <Phone className="w-3 h-3 text-slate-500" />
                      {member.phone}
                    </span>
                  )}
                  {member.preferred_timezone && (
                    <span className="flex items-center gap-1">
                      <Globe className="w-3 h-3 text-slate-500" />
                      {member.preferred_timezone}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => onAssignLoadsClick(member)}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm shadow-indigo-600/20"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Assign Loads</span>
              </button>
              <button
                onClick={onClose}
                className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Workload Summary Bar & Metrics */}
          <div className="p-6 border-b border-slate-800/80 bg-slate-900/30 shrink-0 space-y-4">
            {/* Visual Workload Gauge */}
            <div className="bg-slate-900/90 border border-slate-800/80 rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-300 font-semibold flex items-center gap-1.5">
                  <UserCheck className="w-3.5 h-3.5 text-indigo-400" />
                  Active Workload Capacity
                </span>
                <span className="text-slate-200 font-bold">
                  {summary.activeLoadsCount} Active Loads ({workloadPercentage}% of 12-load baseline)
                </span>
              </div>
              <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${badgeConfig.barColor}`}
                  style={{ width: `${Math.min(100, Math.max(5, workloadPercentage))}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-slate-400 font-mono pt-1">
                <span>0 - 3 (Low)</span>
                <span>4 - 7 (Medium)</span>
                <span>8 - 11 (High)</span>
                <span>12+ (Very High)</span>
              </div>
            </div>

            {/* Quick Stat Tiles */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-slate-900/80 border border-slate-800/70 rounded-xl p-3">
                <span className="text-[11px] text-slate-400 font-medium block">
                  Active In-Flight
                </span>
                <span className="text-xl font-bold text-slate-100 mt-0.5 block">
                  {summary.activeLoadsCount}
                </span>
                <span className="text-[10px] text-indigo-400 block mt-0.5">
                  Assigned active loads
                </span>
              </div>

              <div className="bg-slate-900/80 border border-slate-800/70 rounded-xl p-3">
                <span className="text-[11px] text-slate-400 font-medium block">
                  Pending / Booked
                </span>
                <span className="text-xl font-bold text-amber-300 mt-0.5 block">
                  {summary.pendingLoadsCount}
                </span>
                <span className="text-[10px] text-slate-400 block mt-0.5">
                  Pre-transit stages
                </span>
              </div>

              <div className="bg-slate-900/80 border border-slate-800/70 rounded-xl p-3">
                <span className="text-[11px] text-slate-400 font-medium block">
                  In Transit
                </span>
                <span className="text-xl font-bold text-sky-300 mt-0.5 block">
                  {summary.inProgressLoadsCount}
                </span>
                <span className="text-[10px] text-slate-400 block mt-0.5">
                  Rolling freight
                </span>
              </div>

              <div className="bg-slate-900/80 border border-slate-800/70 rounded-xl p-3">
                <span className="text-[11px] text-slate-400 font-medium block">
                  Total Managed
                </span>
                <span className="text-xl font-bold text-emerald-300 mt-0.5 block">
                  {summary.totalAssignedLoadsCount}
                </span>
                <span className="text-[10px] text-slate-400 block mt-0.5">
                  {formatCurrency(totalRevenue)} total
                </span>
              </div>
            </div>
          </div>

          {/* Search & Filter Toolbar within Drawer */}
          <div className="px-6 py-3 border-b border-slate-800/80 bg-slate-950 flex flex-wrap items-center justify-between gap-3 shrink-0">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search assigned loads by #, customer, city..."
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded-lg text-slate-200 placeholder-slate-400 focus:outline-hidden focus:border-indigo-500"
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">Status:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="text-xs bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-hidden focus:border-indigo-500"
              >
                <option value="all">All Statuses ({assignedLoads.length})</option>
                <option value="booked">Booked ({assignedLoads.filter((l) => l.pipeline_status === 'booked').length})</option>
                <option value="in_transit">In Transit ({assignedLoads.filter((l) => l.pipeline_status === 'in_transit').length})</option>
                <option value="delivered">Delivered ({assignedLoads.filter((l) => l.pipeline_status === 'delivered').length})</option>
                <option value="invoiced">Invoiced ({assignedLoads.filter((l) => l.pipeline_status === 'invoiced').length})</option>
                <option value="paid">Paid ({assignedLoads.filter((l) => l.pipeline_status === 'paid').length})</option>
                <option value="sourced">Sourced ({assignedLoads.filter((l) => l.pipeline_status === 'sourced').length})</option>
                <option value="negotiating">Negotiating ({assignedLoads.filter((l) => l.pipeline_status === 'negotiating').length})</option>
              </select>
            </div>
          </div>

          {/* Assigned Loads Table / List */}
          <div className="flex-1 overflow-y-auto p-6 min-h-0">
            {filteredLoads.length === 0 ? (
              <div className="text-center py-12 px-4 border border-dashed border-slate-800 rounded-xl bg-slate-900/30">
                <PackageCheck className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                <h3 className="text-sm font-semibold text-slate-300">
                  {assignedLoads.length === 0
                    ? `No loads currently assigned to ${member.full_name || 'this member'}`
                    : 'No loads match your search or filter'}
                </h3>
                <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                  {assignedLoads.length === 0
                    ? 'Click "Assign Loads" above to assign active loads to this team member.'
                    : 'Try clearing the search or status filter to see other assigned loads.'}
                </p>
                {assignedLoads.length === 0 && (
                  <button
                    onClick={() => onAssignLoadsClick(member)}
                    className="mt-4 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Assign Active Loads</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {filteredLoads.map((load) => {
                  const otherTeamMembers = (load.assigned_team || []).filter(
                    (tm) => tm.user_id !== member.user_id && tm.id !== member.id
                  );

                  return (
                    <div
                      key={load.id}
                      onClick={() => onLoadClick(load)}
                      className="group bg-slate-900/80 hover:bg-slate-900 border border-slate-800/90 hover:border-indigo-500/50 rounded-xl p-4 transition-all duration-150 cursor-pointer shadow-sm hover:shadow-indigo-500/5"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-indigo-400 text-sm">
                              #{load.load_number}
                            </span>
                            <StatusBadge status={load.pipeline_status} type="pipeline" size="sm" />
                            <span className="text-xs font-semibold text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 px-2 py-0.2 rounded">
                              {formatCurrency(Number(load.rate || 0))}
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

                          {/* Customer / Broker */}
                          <div className="text-[11px] text-slate-400 mt-1 flex flex-wrap items-center gap-3">
                            {load.client?.company_name && (
                              <span>Client: <strong className="text-slate-300">{load.client.company_name}</strong></span>
                            )}
                            {load.broker?.company_name && (
                              <span>Broker: <strong className="text-slate-300">{load.broker.company_name}</strong></span>
                            )}
                            {load.truck?.truck_number && (
                              <span>Truck: <strong className="text-slate-300">#{load.truck.truck_number}</strong></span>
                            )}
                            {load.driver?.full_name && (
                              <span>Driver: <strong className="text-slate-300">{load.driver.full_name}</strong></span>
                            )}
                          </div>

                          {/* Multi-Team assigned on this load */}
                          {load.assigned_team && load.assigned_team.length > 1 && (
                            <div className="mt-2.5 pt-2 border-t border-slate-800/60 flex items-center gap-2 text-[11px] text-slate-400">
                              <Users className="w-3 h-3 text-indigo-400 shrink-0" />
                              <span>Co-assigned Team ({load.assigned_team.length}):</span>
                              <div className="flex flex-wrap items-center gap-1.5">
                                {load.assigned_team.map((tm) => (
                                  <span
                                    key={tm.user_id || tm.id}
                                    className={`text-[10px] px-1.5 py-0.2 rounded border font-medium ${
                                      tm.user_id === member.user_id || tm.id === member.id
                                        ? 'bg-indigo-950/80 text-indigo-300 border-indigo-700/60 font-bold'
                                        : 'bg-slate-950 text-slate-300 border-slate-800'
                                    }`}
                                  >
                                    {tm.full_name} ({tm.role === 'owner_admin' ? 'Admin' : tm.role === 'dispatcher' ? 'Disp' : 'Staff'})
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={(e) => handleRemoveMemberFromLoad(load, e)}
                            disabled={isRemovingLoadId === load.id}
                            title={`Remove ${member.full_name} from this load`}
                            className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 rounded-lg transition-colors cursor-pointer border border-transparent hover:border-rose-800/40"
                          >
                            <UserMinus className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => onLoadClick(load)}
                            className="p-1.5 text-slate-400 hover:text-indigo-300 hover:bg-indigo-950/40 rounded-lg transition-colors cursor-pointer"
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
