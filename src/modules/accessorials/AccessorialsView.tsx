import React, { useState, useEffect, useCallback } from 'react';
import {
  AccessorialWithLoad,
  AccessorialStatus,
  AccessorialType,
  AccessorialSummaryStats,
  ACCESSORIAL_TYPE_CONFIG,
} from './accessorialTypes.ts';
import { accessorialService } from './accessorialService.ts';
import { AccessorialList } from './AccessorialList.tsx';
import { AccessorialModal } from './AccessorialModal.tsx';
import { TaskModal } from '../tasks/TaskModal.tsx';
import { TaskCategory, TaskPriority } from '../tasks/taskTypes.ts';
import { useAuth } from '../../contexts/AuthContext.tsx';
import { useTimezone } from '../../contexts/TimezoneContext.tsx';
import { formatCurrency } from '../../lib/calculations.ts';
import { formatInTimezone } from '../../lib/timezones.ts';
import { Modal } from '../../components/common/Modal.tsx';
import {
  Receipt,
  Plus,
  Search,
  Filter,
  RefreshCw,
  Timer,
  DollarSign,
  FileCheck,
  Building2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
} from 'lucide-react';

export const AccessorialsView: React.FC = () => {
  const { activeOrganization, userRole, profile, user } = useAuth();
  const { operationalTimezone } = useTimezone();
  const orgId = activeOrganization?.id || '';

  const canEdit = userRole === 'owner_admin' || userRole === 'dispatcher';
  const canDelete = userRole === 'owner_admin';

  const [claims, setClaims] = useState<AccessorialWithLoad[]>([]);
  const [stats, setStats] = useState<AccessorialSummaryStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<AccessorialStatus | 'all' | 'active_detention'>('all');
  const [typeFilter, setTypeFilter] = useState<AccessorialType | 'all'>('all');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedClaimForEdit, setSelectedClaimForEdit] = useState<AccessorialWithLoad | null>(null);
  const [claimToDelete, setClaimToDelete] = useState<AccessorialWithLoad | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Task Modal State
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [taskPreselectedLoadId, setTaskPreselectedLoadId] = useState<string | null>(null);
  const [taskInitialCategory, setTaskInitialCategory] = useState<TaskCategory>('detention_warning');
  const [taskInitialPriority, setTaskInitialPriority] = useState<TaskPriority>('high');
  const [taskInitialTitle, setTaskInitialTitle] = useState<string>('');
  const [taskInitialDueAt, setTaskInitialDueAt] = useState<string | undefined>(undefined);
  const [taskInitialDescription, setTaskInitialDescription] = useState<string>('');
  const [taskTriggerSource, setTaskTriggerSource] = useState<string>('manual');
  const [taskReferenceEntityId, setTaskReferenceEntityId] = useState<string | null>(null);

  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchClaimsAndStats = useCallback(async () => {
    if (!orgId) return;
    setIsLoading(true);
    setError(null);

    try {
      const [allClaims, calculatedStats] = await Promise.all([
        accessorialService.getAccessorials(orgId),
        accessorialService.getAccessorialStats(orgId),
      ]);
      setClaims(allClaims);
      setStats(calculatedStats);
    } catch (err: unknown) {
      console.error('Error fetching accessorials:', err);
      setError(err instanceof Error ? err.message : 'Failed to load accessorial claims.');
    } finally {
      setIsLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    fetchClaimsAndStats();
  }, [fetchClaimsAndStats]);

  // Handle status update
  const handleStatusChange = async (claim: AccessorialWithLoad, newStatus: AccessorialStatus) => {
    if (!canEdit) return;
    const actorName = profile?.full_name || user?.email?.split('@')[0] || 'Dispatcher';
    const actorId = user?.id || 'usr-alex-1';

    try {
      const updated = await accessorialService.updateAccessorialStatus(
        orgId,
        claim.id,
        newStatus,
        actorName,
        actorId
      );
      setClaims((prev) => prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c)));
      setFeedbackMessage({
        type: 'success',
        text: `Claim updated to "${newStatus.replace(/_/g, ' ')}" successfully.`,
      });
      // Refresh stats
      accessorialService.getAccessorialStats(orgId).then(setStats).catch(() => {});
      setTimeout(() => setFeedbackMessage(null), 3000);
    } catch (err: unknown) {
      console.error('Error updating status:', err);
      setFeedbackMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to update status.',
      });
    }
  };

  // Handle delete
  const executeDelete = async () => {
    if (!claimToDelete || !canDelete) return;
    setIsDeleting(true);
    const actorName = profile?.full_name || user?.email?.split('@')[0] || 'Admin';
    const actorId = user?.id || 'usr-alex-1';

    try {
      await accessorialService.deleteAccessorial(orgId, claimToDelete.id, actorName, actorId);
      setClaims((prev) => prev.filter((c) => c.id !== claimToDelete.id));
      setClaimToDelete(null);
      setFeedbackMessage({
        type: 'success',
        text: `Accessorial claim deleted successfully.`,
      });
      accessorialService.getAccessorialStats(orgId).then(setStats).catch(() => {});
      setTimeout(() => setFeedbackMessage(null), 3000);
    } catch (err: unknown) {
      console.error('Error deleting accessorial claim:', err);
      setFeedbackMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to delete claim.',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  // Filtered claims list
  const filteredClaims = claims.filter((c) => {
    // Status Filter
    if (statusFilter === 'active_detention') {
      const isDet = c.type === 'detention';
      const isDepSet = Boolean(c.detention_details?.departure_time);
      if (!isDet || isDepSet || c.status === 'rejected' || c.status === 'invoiced') {
        return false;
      }
    } else if (statusFilter !== 'all') {
      if (c.status !== statusFilter) return false;
    }

    // Type Filter
    if (typeFilter !== 'all' && c.type !== typeFilter) {
      return false;
    }

    // Search Query
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      const matchLoad = c.load?.load_number.toLowerCase().includes(q);
      const matchBroker = c.broker_name?.toLowerCase().includes(q);
      const matchDesc = c.description.toLowerCase().includes(q);
      const matchFacility = c.detention_details?.facility_name?.toLowerCase().includes(q);
      const matchDriver = c.load?.driver?.full_name?.toLowerCase().includes(q);
      if (!matchLoad && !matchBroker && !matchDesc && !matchFacility && !matchDriver) {
        return false;
      }
    }

    return true;
  });

  const handleCreateTask = (
    claim: AccessorialWithLoad,
    taskType: 'detention_reminder' | 'broker_followup'
  ) => {
    const loadNum = claim.load?.load_number || 'Load';
    const typeLabel = ACCESSORIAL_TYPE_CONFIG[claim.type]?.label || claim.type;

    setTaskPreselectedLoadId(claim.load_id || null);

    if (taskType === 'detention_reminder') {
      const arrivalIso = claim.detention_details?.arrival_time || new Date().toISOString();
      const arrivalMs = new Date(arrivalIso).getTime();
      const freeHours = claim.detention_details?.free_time_hours ?? 2;
      const freeTimeEndMs = arrivalMs + freeHours * 60 * 60 * 1000;
      const freeTimeEndIso = new Date(freeTimeEndMs).toISOString();

      const freeTimeEndFormatted = formatInTimezone(freeTimeEndIso, operationalTimezone, {
        includeDate: false,
        includeTime: true,
        includeTimezoneCode: true,
      });

      setTaskInitialCategory('detention_warning');
      setTaskInitialPriority('high');
      setTaskInitialTitle(`Detention Free-Time Expiry: Load #${loadNum}`);
      setTaskInitialDueAt(freeTimeEndIso);
      setTaskInitialDescription(
        `Driver arrival logged at dock. Deterministic free time (${freeHours} hrs) expires at ${freeTimeEndFormatted}. Check driver release status or escalate detention billing with broker ($${
          claim.detention_details?.hourly_rate ?? 50
        }/hr).`
      );
      setTaskTriggerSource('detention_clock');
      setTaskReferenceEntityId(claim.id);
    } else {
      setTaskInitialCategory('billing_prep');
      setTaskInitialPriority('normal');
      setTaskInitialTitle(`Follow up on ${typeLabel} Claim (${formatCurrency(claim.amount)}): Load #${loadNum}`);
      setTaskInitialDueAt(undefined);
      setTaskInitialDescription(
        `Verify broker (${claim.broker_name || 'Broker'}) approved revised rate confirmation for ${typeLabel} claim amount of ${formatCurrency(
          claim.amount
        )}.`
      );
      setTaskTriggerSource('manual');
      setTaskReferenceEntityId(claim.id);
    }

    setIsTaskModalOpen(true);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Feedback Banner */}
      {feedbackMessage && (
        <div
          className={`p-3 rounded-lg border flex items-center justify-between text-xs transition-all ${
            feedbackMessage.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedbackMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-400" />
            )}
            <span>{feedbackMessage.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedbackMessage(null)}
            className="text-slate-400 hover:text-slate-200 cursor-pointer"
          >
            &times;
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <Timer className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-100 tracking-tight">Accessorials & Detention</h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Track live facility detention clocks, claim reimbursements, and generate 1-click broker notices.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={fetchClaimsAndStats}
            disabled={isLoading}
            className="px-3 py-2 text-xs font-semibold text-slate-300 hover:text-slate-100 bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          {canEdit && (
            <button
              type="button"
              id="new-accessorial-claim-btn"
              onClick={() => {
                setSelectedClaimForEdit(null);
                setIsModalOpen(true);
              }}
              className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors shadow-sm shadow-indigo-500/20 flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Log Accessorial Claim</span>
            </button>
          )}
        </div>
      </div>

      {/* KPI Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Active Detention Clocks */}
        <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/5 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-amber-400 uppercase tracking-wider">
              Active Detention Clocks
            </span>
            <Timer className="w-4 h-4 text-amber-400 animate-pulse" />
          </div>
          <div className="text-2xl font-bold font-mono text-amber-300">
            {stats?.activeDetentionsCount ?? 0}
          </div>
          <p className="text-[10px] text-amber-400/80">Trucks currently past 2h free time at docks</p>
        </div>

        {/* Pending Broker Approval */}
        <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/80 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Pending Broker Review
            </span>
            <Building2 className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-slate-100">
            {formatCurrency(stats?.pendingBrokerAmount ?? 0)}
          </div>
          <p className="text-[10px] text-slate-400">Claims submitted / draft awaiting revised Rate Con</p>
        </div>

        {/* Approved on Rate Con */}
        <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider">
              Approved on Rate Con
            </span>
            <FileCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-emerald-300">
            {formatCurrency(stats?.approvedAmount ?? 0)}
          </div>
          <p className="text-[10px] text-emerald-400/80">Recovered revenue added to carrier line haul</p>
        </div>

        {/* Invoiced / Factored */}
        <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/80 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Invoiced / Factored
            </span>
            <DollarSign className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-indigo-300">
            {formatCurrency(stats?.invoicedAmount ?? 0)}
          </div>
          <p className="text-[10px] text-slate-400">Completed accessorial payouts processed</p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/80 space-y-3">
        <div className="flex flex-col md:flex-row gap-3">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by Load #, Broker, Facility name, Driver..."
              className="w-full pl-9 pr-4 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2 text-slate-500 hover:text-slate-300 text-xs cursor-pointer"
              >
                &times;
              </button>
            )}
          </div>

          {/* Accessorial Type Filter */}
          <div className="w-full md:w-56">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as AccessorialType | 'all')}
              className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer"
            >
              <option value="all">All Accessorial Types</option>
              {(Object.keys(ACCESSORIAL_TYPE_CONFIG) as AccessorialType[]).map((t) => (
                <option key={t} value={t}>
                  {ACCESSORIAL_TYPE_CONFIG[t].label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Status Filter Chips */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <span className="text-[11px] font-semibold text-slate-400 mr-1">Status:</span>

          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
              statusFilter === 'all'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            All ({claims.length})
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('active_detention')}
            className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer flex items-center gap-1 ${
              statusFilter === 'active_detention'
                ? 'bg-amber-500 text-slate-950 font-bold shadow-xs'
                : 'bg-slate-950 text-amber-400 hover:bg-amber-500/10 border border-amber-500/30'
            }`}
          >
            <Timer className="w-3 h-3" />
            Active Detention ({stats?.activeDetentionsCount ?? 0})
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('submitted_to_broker')}
            className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
              statusFilter === 'submitted_to_broker'
                ? 'bg-amber-600 text-white'
                : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            Submitted to Broker
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('approved_on_rate_con')}
            className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
              statusFilter === 'approved_on_rate_con'
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            Approved (Revised Rate Con)
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('draft')}
            className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
              statusFilter === 'draft'
                ? 'bg-slate-700 text-white'
                : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            Drafts
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('invoiced')}
            className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
              statusFilter === 'invoiced'
                ? 'bg-indigo-800 text-indigo-100'
                : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            Invoiced
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('rejected')}
            className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
              statusFilter === 'rejected'
                ? 'bg-rose-600 text-white'
                : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            Disputed / Rejected
          </button>
        </div>
      </div>

      {/* Claims List */}
      <AccessorialList
        claims={filteredClaims}
        isLoading={isLoading}
        canEdit={canEdit}
        canDelete={canDelete}
        onEdit={(claim) => {
          setSelectedClaimForEdit(claim);
          setIsModalOpen(true);
        }}
        onDelete={(claim) => setClaimToDelete(claim)}
        onStatusChange={handleStatusChange}
        onCreateTask={handleCreateTask}
      />

      {/* Create / Edit Modal */}
      <AccessorialModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedClaimForEdit(null);
        }}
        claimToEdit={selectedClaimForEdit}
        onSuccess={(savedClaim, isEdit) => {
          fetchClaimsAndStats();
          setFeedbackMessage({
            type: 'success',
            text: isEdit ? `Accessorial claim updated.` : `Accessorial claim logged successfully.`,
          });
          setTimeout(() => setFeedbackMessage(null), 3000);
        }}
      />

      {/* Task Modal for Detention & Claim Reminders */}
      <TaskModal
        isOpen={isTaskModalOpen}
        onClose={() => {
          setIsTaskModalOpen(false);
          setTaskPreselectedLoadId(null);
          setTaskReferenceEntityId(null);
        }}
        preselectedLoadId={taskPreselectedLoadId}
        initialCategory={taskInitialCategory}
        initialPriority={taskInitialPriority}
        initialTitle={taskInitialTitle}
        initialDueAt={taskInitialDueAt}
        initialDescription={taskInitialDescription}
        triggerSource={taskTriggerSource}
        referenceEntityId={taskReferenceEntityId}
        onSuccess={() => {
          setIsTaskModalOpen(false);
          setTaskPreselectedLoadId(null);
          setTaskReferenceEntityId(null);
        }}
      />

      {/* Delete Confirmation Modal */}
      {claimToDelete && (
        <Modal
          id="delete-accessorial-modal"
          isOpen={Boolean(claimToDelete)}
          onClose={() => setClaimToDelete(null)}
          title="Delete Accessorial Claim"
          maxWidth="md"
        >
          <div className="space-y-4">
            <p className="text-xs text-slate-300">
              Are you sure you want to delete this{' '}
              <strong className="text-white">
                {ACCESSORIAL_TYPE_CONFIG[claimToDelete.type].label} ($
                {claimToDelete.amount.toFixed(2)})
              </strong>{' '}
              claim for Load #{claimToDelete.load?.load_number || 'N/A'}?
            </p>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setClaimToDelete(null)}
                className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={executeDelete}
                className="px-4 py-1.5 text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white rounded-lg cursor-pointer disabled:opacity-50"
              >
                {isDeleting ? 'Deleting...' : 'Delete Claim'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
