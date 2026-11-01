import React, { useState, useEffect, useCallback } from 'react';
import {
  Users,
  UserCheck,
  PackageCheck,
  AlertTriangle,
  Share2,
  Search,
  Filter,
  ArrowUpDown,
  RefreshCw,
  Plus,
  Eye,
  UserPlus,
  Shield,
  ShieldAlert,
  Clock,
  ExternalLink,
  ChevronDown,
  Info,
  CheckCircle2,
  TrendingUp,
  X,
  Layers,
  RotateCcw,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext.tsx';
import { TeamMember, UserRole, PipelineStatus } from '../../types/domain.types.ts';
import { LoadWithRelations } from '../loads/loadTypes.ts';
import {
  TeamMemberWorkloadSummary,
  OrganizationWorkloadStats,
  WorkloadFilterCriteria,
  WorkloadLevel,
  getWorkloadBadgeConfig,
} from './workloadTypes.ts';
import { workloadService } from './workloadService.ts';
import { loadService } from '../loads/loadService.ts';
import { MemberWorkloadDrawer } from './MemberWorkloadDrawer.tsx';
import { UnassignedLoadsDrawer } from './UnassignedLoadsDrawer.tsx';
import { BulkAssignTeamMemberModal } from '../loads/BulkAssignTeamMemberModal.tsx';
import { LoadDetailModal } from '../loads/LoadDetailModal.tsx';
import { StatusBadge } from '../../components/common/StatusBadge.tsx';
import { useTimezone } from '../../contexts/TimezoneContext.tsx';
import { formatInTimezone } from '../../lib/timezones.ts';

interface WorkloadViewProps {
  onNavigateToLoads?: (filterKey?: string, filterVal?: string) => void;
  onNavigateToDashboard?: () => void;
}

export const WorkloadView: React.FC<WorkloadViewProps> = ({
  onNavigateToLoads,
  onNavigateToDashboard,
}) => {
  const { activeOrganization, user, userRole, isConfigured } = useAuth();
  const { operationalTimezone } = useTimezone();
  const orgId = activeOrganization?.id || '';

  // RBAC check: only owner_admin / manager roles are authorized
  const isAuthorizedAdmin = userRole === 'owner_admin';

  // Data states
  const [stats, setStats] = useState<OrganizationWorkloadStats>({
    totalEligibleMembers: 0,
    totalUniqueActiveLoads: 0,
    assignedActiveLoadsCount: 0,
    unassignedActiveLoadsCount: 0,
    totalActiveAssignmentsCount: 0,
    averageActiveLoadsPerMember: 0,
    overloadedMembersCount: 0,
  });
  const [summaries, setSummaries] = useState<TeamMemberWorkloadSummary[]>([]);
  const [unassignedLoads, setUnassignedLoads] = useState<LoadWithRelations[]>([]);
  const [allLoads, setAllLoads] = useState<LoadWithRelations[]>([]);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Filters state
  const [filters, setFilters] = useState<WorkloadFilterCriteria>({
    search: '',
    role: 'all',
    workloadLevel: 'all',
    assignmentStatus: 'all',
    loadStatus: 'all',
    sortBy: 'active_loads',
    sortOrder: 'desc',
  });

  // Modal / Drawer states
  const [selectedMemberSummary, setSelectedMemberSummary] = useState<TeamMemberWorkloadSummary | null>(null);
  const [isMemberDrawerOpen, setIsMemberDrawerOpen] = useState<boolean>(false);
  const [isUnassignedDrawerOpen, setIsUnassignedDrawerOpen] = useState<boolean>(false);
  const [isBulkAssignModalOpen, setIsBulkAssignModalOpen] = useState<boolean>(false);
  const [bulkAssignTargetLoads, setBulkAssignTargetLoads] = useState<LoadWithRelations[]>([]);
  const [viewingDetailLoad, setViewingDetailLoad] = useState<LoadWithRelations | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Main data loader
  const loadWorkloadData = useCallback(async () => {
    if (!orgId) {
      setIsLoading(false);
      return;
    }
    setError(null);
    try {
      const [overviewData, loadsData] = await Promise.all([
        workloadService.getWorkloadOverview(orgId, filters),
        loadService.getLoads(orgId),
      ]);

      setStats(overviewData.stats);
      setSummaries(overviewData.summaries);
      setUnassignedLoads(overviewData.unassignedLoads);
      setAllLoads(loadsData);

      // Keep selected drawer member summary refreshed if open
      if (selectedMemberSummary) {
        const refreshedMember = overviewData.summaries.find(
          (s) =>
            s.member.id === selectedMemberSummary.member.id ||
            s.member.user_id === selectedMemberSummary.member.user_id
        );
        if (refreshedMember) {
          setSelectedMemberSummary(refreshedMember);
        }
      }
    } catch (err: any) {
      console.error('Failed to load team workload data:', err);
      setError(err.message || 'Failed to fetch team workload statistics.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [orgId, filters, selectedMemberSummary]);

  useEffect(() => {
    setIsLoading(true);
    loadWorkloadData();
  }, [orgId, filters.role, filters.workloadLevel, filters.assignmentStatus, filters.loadStatus, filters.sortBy, filters.sortOrder]);

  // Handle manual refresh
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadWorkloadData();
  };

  // Quick action: Open member drilldown
  const handleOpenMemberDrilldown = (summary: TeamMemberWorkloadSummary) => {
    setSelectedMemberSummary(summary);
    setIsMemberDrawerOpen(true);
  };

  // Quick action: Assign loads directly for a member
  const handleAssignLoadsForMember = (member: TeamMember) => {
    // If there are unassigned loads, target them for assignment
    const targetLoads = unassignedLoads.length > 0 ? unassignedLoads : allLoads.slice(0, 5);
    setBulkAssignTargetLoads(targetLoads);
    setIsBulkAssignModalOpen(true);
  };

  // Quick action: Assign unassigned loads
  const handleAssignUnassignedLoads = (loadsToAssign: LoadWithRelations[]) => {
    setBulkAssignTargetLoads(loadsToAssign);
    setIsBulkAssignModalOpen(true);
  };

  const handleBulkAssignedSuccess = async (count: number, summaryName: string | null) => {
    setIsBulkAssignModalOpen(false);
    showToast(`Successfully assigned ${count} load${count === 1 ? '' : 's'} ${summaryName ? `to ${summaryName}` : ''}.`);
    await loadWorkloadData();
  };

  const handleResetFilters = () => {
    setFilters({
      search: '',
      role: 'all',
      workloadLevel: 'all',
      assignmentStatus: 'all',
      loadStatus: 'all',
      sortBy: 'active_loads',
      sortOrder: 'desc',
    });
  };

  const hasActiveFilters =
    filters.search !== '' ||
    filters.role !== 'all' ||
    filters.workloadLevel !== 'all' ||
    filters.assignmentStatus !== 'all' ||
    filters.loadStatus !== 'all' ||
    filters.sortBy !== 'active_loads' ||
    filters.sortOrder !== 'desc';

  // ----------------------------------------------------
  // RBAC Access Control Guard
  // ----------------------------------------------------
  if (!isAuthorizedAdmin && userRole !== null) {
    return (
      <div id="workload-unauthorized" className="p-8 max-w-2xl mx-auto my-12 text-center">
        <div className="w-16 h-16 rounded-2xl bg-amber-950/60 border border-amber-800/60 text-amber-400 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-amber-950/30">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-slate-100 tracking-tight">
          Admin Access Required
        </h2>
        <p className="text-sm text-slate-400 mt-2 leading-relaxed">
          The <strong>Team Workload & Assignment Overview</strong> is restricted to organization administrators and managers.
          Standard dispatchers and staff cannot view organization-wide workload distributions.
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          {onNavigateToDashboard && (
            <button
              onClick={onNavigateToDashboard}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer"
            >
              Return to Dashboard
            </button>
          )}
          {onNavigateToLoads && (
            <button
              onClick={() => onNavigateToLoads('dispatcherId', 'me')}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
            >
              View My Assigned Loads
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div id="team-workload-view" className="space-y-6 pb-12">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-4 right-4 z-50 bg-slate-900 border border-emerald-500/50 text-emerald-300 px-4 py-3 rounded-xl shadow-xl flex items-center gap-2.5 animate-in fade-in duration-200">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="text-xs font-semibold">{toastMessage}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-100 tracking-tight">
              Team Workload & Assignment Overview
            </h1>
            <span className="text-xs px-2.5 py-0.5 rounded-md bg-indigo-950/60 text-indigo-300 border border-indigo-800/40 font-semibold">
              Admin Operations
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Real-time monitoring of team capacity, active load assignments, and operational distribution across all dispatchers.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            onClick={() => setIsUnassignedDrawerOpen(true)}
            className={`px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer border ${
              stats.unassignedActiveLoadsCount > 0
                ? 'bg-amber-950/50 hover:bg-amber-900/60 text-amber-300 border-amber-800/60 shadow-xs'
                : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-800'
            }`}
          >
            <AlertTriangle className={`w-3.5 h-3.5 ${stats.unassignedActiveLoadsCount > 0 ? 'text-amber-400' : 'text-slate-500'}`} />
            <span>Unassigned Loads</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
              stats.unassignedActiveLoadsCount > 0
                ? 'bg-amber-500 text-slate-950'
                : 'bg-slate-800 text-slate-400'
            }`}>
              {stats.unassignedActiveLoadsCount}
            </span>
          </button>

          <button
            onClick={handleRefresh}
            disabled={isRefreshing || isLoading}
            className="p-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-300 hover:text-white transition-colors cursor-pointer"
            title="Refresh Workload Statistics"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-indigo-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="bg-rose-950/40 border border-rose-800/50 rounded-xl p-4 flex items-center gap-3 text-rose-300 text-xs">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          <div className="flex-1">{error}</div>
          <button
            onClick={loadWorkloadData}
            className="text-rose-200 underline font-semibold hover:text-white"
          >
            Retry
          </button>
        </div>
      )}

      {/* 4 Top Summary Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Total Team Members */}
        <div className="bg-slate-900 border border-slate-800/80 rounded-xl p-5 shadow-sm space-y-1 relative overflow-hidden group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Total Team Members
            </span>
            <div className="w-8 h-8 rounded-lg bg-indigo-950 text-indigo-400 border border-indigo-800/50 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-100 tracking-tight pt-1">
            {stats.totalEligibleMembers}
          </div>
          <p className="text-[11px] text-slate-400 flex items-center gap-1 pt-1">
            <span className="text-indigo-400 font-medium">
              {stats.overloadedMembersCount} high workload
            </span>
            <span>• Active roster</span>
          </p>
        </div>

        {/* Metric 2: Assigned Active Loads (Unique Loads) */}
        <div className="bg-slate-900 border border-slate-800/80 rounded-xl p-5 shadow-sm space-y-1 relative overflow-hidden group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Assigned Active Loads
            </span>
            <div className="w-8 h-8 rounded-lg bg-emerald-950 text-emerald-400 border border-emerald-800/50 flex items-center justify-center">
              <PackageCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-100 tracking-tight pt-1">
            {stats.assignedActiveLoadsCount}
          </div>
          <p className="text-[11px] text-slate-400 flex items-center gap-1 pt-1">
            <span className="text-emerald-400 font-medium">
              {stats.totalUniqueActiveLoads > 0
                ? `${Math.round((stats.assignedActiveLoadsCount / stats.totalUniqueActiveLoads) * 100)}% covered`
                : '0%'}
            </span>
            <span>• Unique active loads</span>
          </p>
        </div>

        {/* Metric 3: Unassigned Active Loads */}
        <div
          onClick={() => setIsUnassignedDrawerOpen(true)}
          className={`bg-slate-900 border rounded-xl p-5 shadow-sm space-y-1 relative overflow-hidden group cursor-pointer transition-all duration-150 ${
            stats.unassignedActiveLoadsCount > 0
              ? 'border-amber-800/70 hover:border-amber-500/70 hover:bg-amber-950/10'
              : 'border-slate-800/80 hover:border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Unassigned Active Loads
            </span>
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
              stats.unassignedActiveLoadsCount > 0
                ? 'bg-amber-950 text-amber-400 border border-amber-800/50'
                : 'bg-slate-800 text-slate-400'
            }`}>
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className={`text-2xl font-bold tracking-tight pt-1 ${
            stats.unassignedActiveLoadsCount > 0 ? 'text-amber-400' : 'text-slate-100'
          }`}>
            {stats.unassignedActiveLoadsCount}
          </div>
          <p className="text-[11px] text-slate-400 flex items-center justify-between pt-1">
            <span>Requires dispatcher assignment</span>
            <span className="text-amber-400 text-[10px] font-semibold group-hover:underline">
              View & Assign →
            </span>
          </p>
        </div>

        {/* Metric 4: Total Active Assignments (Relationships) */}
        <div className="bg-slate-900 border border-slate-800/80 rounded-xl p-5 shadow-sm space-y-1 relative overflow-hidden group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
              Total Active Assignments
              <span
                className="cursor-help text-slate-500 hover:text-slate-300"
                title="Total many-to-many relationship rows across all active loads. A load assigned to 2 members counts as 2 assignments."
              >
                <Info className="w-3 h-3 inline" />
              </span>
            </span>
            <div className="w-8 h-8 rounded-lg bg-sky-950 text-sky-400 border border-sky-800/50 flex items-center justify-center">
              <Share2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-100 tracking-tight pt-1">
            {stats.totalActiveAssignmentsCount}
          </div>
          <p className="text-[11px] text-slate-400 flex items-center gap-1 pt-1">
            <span className="text-sky-400 font-medium">
              ~{stats.averageActiveLoadsPerMember} / member
            </span>
            <span>• Many-to-many relationships</span>
          </p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-slate-900 border border-slate-800/80 rounded-xl p-4 shadow-sm space-y-3">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          {/* Search */}
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={filters.search}
              onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
              placeholder="Search team member by name, email, phone..."
              className="w-full pl-9 pr-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-200 placeholder-slate-400 focus:outline-hidden focus:border-indigo-500"
            />
            {filters.search && (
              <button
                onClick={() => setFilters((prev) => ({ ...prev, search: '' }))}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Filter Dropdowns */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Role filter */}
            <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs">
              <span className="text-slate-400">Role:</span>
              <select
                value={filters.role}
                onChange={(e) => setFilters((prev) => ({ ...prev, role: e.target.value as any }))}
                className="bg-transparent text-slate-200 font-medium focus:outline-hidden cursor-pointer"
              >
                <option value="all" className="bg-slate-900">All Roles</option>
                <option value="owner_admin" className="bg-slate-900">Admin</option>
                <option value="dispatcher" className="bg-slate-900">Dispatcher</option>
                <option value="staff" className="bg-slate-900">Staff</option>
              </select>
            </div>

            {/* Workload level filter */}
            <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs">
              <span className="text-slate-400">Workload:</span>
              <select
                value={filters.workloadLevel}
                onChange={(e) => setFilters((prev) => ({ ...prev, workloadLevel: e.target.value as any }))}
                className="bg-transparent text-slate-200 font-medium focus:outline-hidden cursor-pointer"
              >
                <option value="all" className="bg-slate-900">All Workloads</option>
                <option value="low" className="bg-slate-900">Low (0-3)</option>
                <option value="medium" className="bg-slate-900">Medium (4-7)</option>
                <option value="high" className="bg-slate-900">High (8-11)</option>
                <option value="very_high" className="bg-slate-900">Very High (12+)</option>
              </select>
            </div>

            {/* Assignment status filter */}
            <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs">
              <span className="text-slate-400">Assignment:</span>
              <select
                value={filters.assignmentStatus}
                onChange={(e) => setFilters((prev) => ({ ...prev, assignmentStatus: e.target.value as any }))}
                className="bg-transparent text-slate-200 font-medium focus:outline-hidden cursor-pointer"
              >
                <option value="all" className="bg-slate-900">All Members</option>
                <option value="has_active" className="bg-slate-900">Has Active Loads</option>
                <option value="no_active" className="bg-slate-900">No Active Loads</option>
              </select>
            </div>

            {/* Sort by */}
            <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs">
              <span className="text-slate-400">Sort:</span>
              <select
                value={filters.sortBy}
                onChange={(e) => setFilters((prev) => ({ ...prev, sortBy: e.target.value as any }))}
                className="bg-transparent text-slate-200 font-medium focus:outline-hidden cursor-pointer"
              >
                <option value="active_loads" className="bg-slate-900">Active Loads</option>
                <option value="name" className="bg-slate-900">Name</option>
                <option value="role" className="bg-slate-900">Role</option>
                <option value="pending" className="bg-slate-900">Pending</option>
                <option value="in_progress" className="bg-slate-900">In Progress</option>
                <option value="delivered" className="bg-slate-900">Delivered</option>
                <option value="last_activity" className="bg-slate-900">Last Activity</option>
              </select>
              <button
                type="button"
                onClick={() =>
                  setFilters((prev) => ({
                    ...prev,
                    sortOrder: prev.sortOrder === 'asc' ? 'desc' : 'asc',
                  }))
                }
                className="text-slate-400 hover:text-slate-200 pl-1"
                title={`Toggle order (${filters.sortOrder})`}
              >
                <ArrowUpDown className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Reset Filters */}
            {hasActiveFilters && (
              <button
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
      </div>

      {/* Main Team Workload Table / Cards */}
      {isLoading ? (
        <div className="bg-slate-900 border border-slate-800/80 rounded-xl p-8 space-y-4 animate-pulse">
          <div className="h-6 bg-slate-800 rounded-md w-1/4" />
          <div className="space-y-3 pt-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-16 bg-slate-800/60 rounded-lg" />
            ))}
          </div>
        </div>
      ) : summaries.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800/80 rounded-xl p-12 text-center">
          <Users className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-200">
            {hasActiveFilters ? 'No team members match the applied filters' : 'No active team members found'}
          </h3>
          <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
            {hasActiveFilters
              ? 'Try adjusting or resetting your search and filter criteria.'
              : 'Add organization team members in Settings & Security → Team Members to start assigning loads.'}
          </p>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700/60 rounded-lg text-xs font-semibold text-slate-200 hover:text-white transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
              <span>Reset Filters</span>
            </button>
          )}
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800/80 rounded-xl shadow-sm overflow-hidden">
          {/* Desktop Table View */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                  <th className="py-3.5 px-4">Team Member</th>
                  <th className="py-3.5 px-3">Role</th>
                  <th className="py-3.5 px-3 text-center">Active Loads</th>
                  <th className="py-3.5 px-3 text-center">Pending</th>
                  <th className="py-3.5 px-3 text-center">In Progress</th>
                  <th className="py-3.5 px-3 text-center">Delivered</th>
                  <th className="py-3.5 px-4 min-w-[160px]">Workload Indicator</th>
                  <th className="py-3.5 px-4">Last Activity</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {summaries.map((summary) => {
                  const { member, activeLoadsCount, pendingLoadsCount, inProgressLoadsCount, deliveredLoadsCount, workloadLevel, workloadPercentage, lastActivityAt } = summary;
                  const badge = getWorkloadBadgeConfig(workloadLevel);

                  return (
                    <tr
                      key={member.id || member.user_id}
                      className="hover:bg-slate-800/40 transition-colors group"
                    >
                      {/* Member column */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-lg bg-indigo-950/80 text-indigo-300 border border-indigo-800/50 flex items-center justify-center font-bold text-sm shrink-0">
                            {(member.full_name || 'U').charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <button
                              onClick={() => handleOpenMemberDrilldown(summary)}
                              className="font-bold text-slate-100 hover:text-indigo-400 transition-colors text-left text-sm block tracking-tight cursor-pointer"
                            >
                              {member.full_name || 'Unnamed Member'}
                            </button>
                            <span className="text-[11px] text-slate-400 block truncate max-w-[180px]">
                              {member.email || member.phone || 'No email provided'}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Role */}
                      <td className="py-3.5 px-3">
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-md font-semibold uppercase border ${
                            member.role === 'owner_admin'
                              ? 'bg-indigo-950/60 text-indigo-300 border-indigo-800/50'
                              : member.role === 'dispatcher'
                              ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800/50'
                              : 'bg-slate-800 text-slate-300 border-slate-700'
                          }`}
                        >
                          {member.role === 'owner_admin'
                            ? 'Admin'
                            : member.role === 'dispatcher'
                            ? 'Dispatcher'
                            : 'Staff'}
                        </span>
                      </td>

                      {/* Active Loads Count */}
                      <td className="py-3.5 px-3 text-center">
                        <span
                          className={`inline-block px-2.5 py-1 rounded-md font-bold text-sm font-mono ${
                            activeLoadsCount > 0
                              ? 'bg-indigo-950/80 text-indigo-200 border border-indigo-800/60'
                              : 'bg-slate-800/60 text-slate-400'
                          }`}
                        >
                          {activeLoadsCount}
                        </span>
                      </td>

                      {/* Pending */}
                      <td className="py-3.5 px-3 text-center font-mono text-slate-300 font-medium">
                        {pendingLoadsCount > 0 ? (
                          <span className="text-amber-300">{pendingLoadsCount}</span>
                        ) : (
                          <span className="text-slate-600">0</span>
                        )}
                      </td>

                      {/* In Progress */}
                      <td className="py-3.5 px-3 text-center font-mono text-slate-300 font-medium">
                        {inProgressLoadsCount > 0 ? (
                          <span className="text-sky-300">{inProgressLoadsCount}</span>
                        ) : (
                          <span className="text-slate-600">0</span>
                        )}
                      </td>

                      {/* Delivered */}
                      <td className="py-3.5 px-3 text-center font-mono text-slate-300 font-medium">
                        {deliveredLoadsCount > 0 ? (
                          <span className="text-emerald-300">{deliveredLoadsCount}</span>
                        ) : (
                          <span className="text-slate-600">0</span>
                        )}
                      </td>

                      {/* Workload Indicator Gauge */}
                      <td className="py-3.5 px-4">
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between text-[11px]">
                            <span
                              className={`px-1.5 py-0.2 rounded text-[10px] font-bold border ${badge.bgClass} ${badge.textClass} ${badge.borderClass}`}
                            >
                              {badge.label}
                            </span>
                            <span className="text-slate-400 text-[10px] font-mono">
                              {activeLoadsCount} active
                            </span>
                          </div>
                          <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-300 ${badge.barColor}`}
                              style={{ width: `${Math.min(100, Math.max(6, workloadPercentage))}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      {/* Last Activity */}
                      <td className="py-3.5 px-4 text-slate-400 text-[11px]">
                        {lastActivityAt ? (
                          <div className="flex items-center gap-1.5" title={formatInTimezone(lastActivityAt, operationalTimezone)}>
                            <Clock className="w-3 h-3 text-slate-500" />
                            <span>{formatInTimezone(lastActivityAt, operationalTimezone, { includeDate: true, includeTime: false, includeTimezoneCode: false })}</span>
                          </div>
                        ) : (
                          <span className="text-slate-600">No recent activity</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleOpenMemberDrilldown(summary)}
                            className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700/80 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                            title="Drill down into member loads"
                          >
                            <Eye className="w-3.5 h-3.5 text-indigo-400" />
                            <span>View Loads</span>
                          </button>

                          <button
                            onClick={() => handleAssignLoadsForMember(member)}
                            className="p-1.5 bg-indigo-950/60 hover:bg-indigo-900 text-indigo-300 border border-indigo-800/50 rounded-lg transition-colors cursor-pointer"
                            title="Assign loads to this member"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile / Tablet Responsive Cards */}
          <div className="block md:hidden divide-y divide-slate-800/80">
            {summaries.map((summary) => {
              const { member, activeLoadsCount, pendingLoadsCount, inProgressLoadsCount, deliveredLoadsCount, workloadLevel, workloadPercentage } = summary;
              const badge = getWorkloadBadgeConfig(workloadLevel);

              return (
                <div
                  key={member.id || member.user_id}
                  className="p-4 space-y-3 bg-slate-900 hover:bg-slate-800/30 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-indigo-950 text-indigo-300 border border-indigo-800/50 flex items-center justify-center font-bold text-sm">
                        {(member.full_name || 'U').charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <button
                          onClick={() => handleOpenMemberDrilldown(summary)}
                          className="font-bold text-slate-100 hover:text-indigo-400 text-sm block text-left"
                        >
                          {member.full_name || 'Unnamed Member'}
                        </button>
                        <span className="text-[11px] text-slate-400 block">
                          {member.email || member.phone || 'No contact'}
                        </span>
                      </div>
                    </div>

                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-md font-semibold uppercase border ${badge.bgClass} ${badge.textClass} ${badge.borderClass}`}
                    >
                      {badge.label}
                    </span>
                  </div>

                  {/* Stat row */}
                  <div className="grid grid-cols-4 gap-2 py-2 px-3 bg-slate-950/80 rounded-lg text-center text-xs">
                    <div>
                      <span className="text-[10px] text-slate-400 block">Active</span>
                      <span className="font-bold text-indigo-300 font-mono text-sm">{activeLoadsCount}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block">Pending</span>
                      <span className="font-bold text-amber-300 font-mono text-sm">{pendingLoadsCount}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block">In Transit</span>
                      <span className="font-bold text-sky-300 font-mono text-sm">{inProgressLoadsCount}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block">Delivered</span>
                      <span className="font-bold text-emerald-300 font-mono text-sm">{deliveredLoadsCount}</span>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${badge.barColor}`}
                      style={{ width: `${Math.min(100, Math.max(6, workloadPercentage))}%` }}
                    />
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center justify-between pt-1">
                    <button
                      onClick={() => handleOpenMemberDrilldown(summary)}
                      className="flex-1 py-1.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 mr-2 cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5 text-indigo-400" />
                      <span>View Assigned Loads ({summary.totalAssignedLoadsCount})</span>
                    </button>

                    <button
                      onClick={() => handleAssignLoadsForMember(member)}
                      className="py-1.5 px-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Assign</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Member Drill-Down Drawer */}
      <MemberWorkloadDrawer
        isOpen={isMemberDrawerOpen}
        onClose={() => setIsMemberDrawerOpen(false)}
        summary={selectedMemberSummary}
        organizationId={orgId}
        onLoadClick={(load) => setViewingDetailLoad(load)}
        onAssignLoadsClick={(member) => {
          setIsMemberDrawerOpen(false);
          handleAssignLoadsForMember(member);
        }}
        onAssignmentChanged={loadWorkloadData}
      />

      {/* Unassigned Active Loads Drawer */}
      <UnassignedLoadsDrawer
        isOpen={isUnassignedDrawerOpen}
        onClose={() => setIsUnassignedDrawerOpen(false)}
        unassignedLoads={unassignedLoads}
        onOpenBulkAssign={(loads) => {
          setIsUnassignedDrawerOpen(false);
          handleAssignUnassignedLoads(loads);
        }}
        onLoadClick={(load) => setViewingDetailLoad(load)}
      />

      {/* Bulk Assign Modal (Reused) */}
      <BulkAssignTeamMemberModal
        isOpen={isBulkAssignModalOpen}
        onClose={() => setIsBulkAssignModalOpen(false)}
        selectedLoads={bulkAssignTargetLoads}
        onAssigned={handleBulkAssignedSuccess}
      />

      {/* Load Detail Modal (Reused) */}
      {viewingDetailLoad && (
        <LoadDetailModal
          isOpen={Boolean(viewingDetailLoad)}
          onClose={() => setViewingDetailLoad(null)}
          load={viewingDetailLoad}
          onEdit={() => {}}
          onStatusChange={async () => {
            await loadWorkloadData();
          }}
        />
      )}
    </div>
  );
};
