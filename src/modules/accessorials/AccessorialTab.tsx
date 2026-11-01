import React, { useState, useEffect, useCallback } from 'react';
import { LoadWithRelations } from '../loads/loadTypes.ts';
import {
  AccessorialWithLoad,
  AccessorialStatus,
  AccessorialType,
  ACCESSORIAL_TYPE_CONFIG,
} from './accessorialTypes.ts';
import { accessorialService, calculateDetention } from './accessorialService.ts';
import { AccessorialList } from './AccessorialList.tsx';
import { AccessorialModal } from './AccessorialModal.tsx';
import { ContextualCopilotModal } from '../ai/ContextualCopilotModal.tsx';
import { TaskModal } from '../tasks/TaskModal.tsx';
import { TaskCategory, TaskPriority } from '../tasks/taskTypes.ts';
import { Modal } from '../../components/common/Modal.tsx';
import { useAuth } from '../../contexts/AuthContext.tsx';
import { useTimezone } from '../../contexts/TimezoneContext.tsx';
import { formatCurrency } from '../../lib/calculations.ts';
import { formatInTimezone } from '../../lib/timezones.ts';
import { DetentionAuditModal } from './DetentionAuditModal.tsx';
import {
  Receipt,
  Plus,
  Timer,
  DollarSign,
  FileCheck,
  Building2,
  RefreshCw,
  AlertTriangle,
  Sparkles,
  CheckCircle2,
  Trash2,
  ShieldCheck,
} from 'lucide-react';

export interface AccessorialTabProps {
  load: LoadWithRelations;
}

export const AccessorialTab: React.FC<AccessorialTabProps> = ({ load }) => {
  const { activeOrganization, userRole, profile, user } = useAuth();
  const { operationalTimezone } = useTimezone();
  const orgId = activeOrganization?.id || '';

  const canEdit = userRole === 'owner_admin' || userRole === 'dispatcher';
  const canDelete = userRole === 'owner_admin';

  const [claims, setClaims] = useState<AccessorialWithLoad[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedClaimForEdit, setSelectedClaimForEdit] = useState<AccessorialWithLoad | null>(null);
  const [claimToDelete, setClaimToDelete] = useState<AccessorialWithLoad | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Task Modal state
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [taskInitialCategory, setTaskInitialCategory] = useState<TaskCategory>('detention_warning');
  const [taskInitialPriority, setTaskInitialPriority] = useState<TaskPriority>('high');
  const [taskInitialTitle, setTaskInitialTitle] = useState<string>('');
  const [taskInitialDueAt, setTaskInitialDueAt] = useState<string | undefined>(undefined);
  const [taskInitialDescription, setTaskInitialDescription] = useState<string>('');
  const [taskTriggerSource, setTaskTriggerSource] = useState<string>('manual');
  const [taskReferenceEntityId, setTaskReferenceEntityId] = useState<string | null>(null);

  // AI Copilot Modal State
  const [isCopilotOpen, setIsCopilotOpen] = useState(false);
  const [copilotClaimId, setCopilotClaimId] = useState<string | undefined>(undefined);

  // Detention Audit Workspace State
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);

  const fetchLoadClaims = useCallback(async () => {
    if (!orgId || !load.id) return;
    setIsLoading(true);
    try {
      const data = await accessorialService.getAccessorialsByLoadId(orgId, load.id);
      setClaims(data);
    } catch (err) {
      console.error('Error loading load accessorial claims:', err);
    } finally {
      setIsLoading(false);
    }
  }, [orgId, load.id]);

  useEffect(() => {
    fetchLoadClaims();
  }, [fetchLoadClaims]);

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
    } catch (err) {
      console.error('Error updating status:', err);
    }
  };

  const confirmDelete = async () => {
    if (!claimToDelete || !canDelete || isDeleting) return;
    setIsDeleting(true);
    const actorName = profile?.full_name || user?.email?.split('@')[0] || 'Admin';
    const actorId = user?.id || 'usr-alex-1';

    try {
      await accessorialService.deleteAccessorial(orgId, claimToDelete.id, actorName, actorId);
      setClaims((prev) => prev.filter((c) => c.id !== claimToDelete.id));
      const typeLabel = ACCESSORIAL_TYPE_CONFIG[claimToDelete.type]?.label || claimToDelete.type;
      const amountStr = formatCurrency(claimToDelete.amount);
      setFeedbackMessage({
        type: 'success',
        text: `Accessorial claim "${typeLabel}" (${amountStr}) deleted successfully.`,
      });
      setTimeout(() => setFeedbackMessage(null), 4000);
      setClaimToDelete(null);
      await fetchLoadClaims();
    } catch (err: unknown) {
      console.error('Error deleting accessorial claim:', err);
      const msg = err instanceof Error ? err.message : 'Failed to delete accessorial claim.';
      setFeedbackMessage({
        type: 'error',
        text: msg,
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCreateTask = (
    claim: AccessorialWithLoad,
    taskType: 'detention_reminder' | 'broker_followup'
  ) => {
    const loadNum = claim.load?.load_number || load.load_number;
    const typeLabel = ACCESSORIAL_TYPE_CONFIG[claim.type]?.label || claim.type;

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

  // Compute Total Approved vs Pending Accessorials for this load
  const totalApproved = claims
    .filter((c) => c.status === 'approved_on_rate_con' || c.status === 'invoiced')
    .reduce((sum, c) => sum + c.amount, 0);

  const totalPending = claims
    .filter((c) => c.status === 'draft' || c.status === 'submitted_to_broker')
    .reduce((sum, c) => sum + c.amount, 0);

  return (
    <div className="space-y-4">
      {/* Feedback Banner */}
      {feedbackMessage && (
        <div
          id="accessorial-tab-feedback-banner"
          className={`p-3 rounded-lg border flex items-center justify-between text-xs transition-all ${
            feedbackMessage.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedbackMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span>{feedbackMessage.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedbackMessage(null)}
            className="text-slate-400 hover:text-slate-200 cursor-pointer text-base leading-none"
          >
            &times;
          </button>
        </div>
      )}

      {/* Mini Summary Banner */}
      <div className="p-3.5 bg-slate-900/90 rounded-xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
            <Timer className="w-4 h-4" />
          </div>
          <div>
            <h5 className="text-xs font-bold text-slate-200">Load Accessorials & Detention Ledger</h5>
            <p className="text-[11px] text-slate-400">
              Track extra billable events and revised rate confirmations for Load #{load.load_number}.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <span className="block text-[10px] text-slate-400 uppercase">Approved Add-ons</span>
            <span className="text-xs font-mono font-bold text-emerald-400">
              {formatCurrency(totalApproved)}
            </span>
          </div>
          {totalPending > 0 && (
            <div className="text-right border-l border-slate-800 pl-4">
              <span className="block text-[10px] text-slate-400 uppercase">Pending Claims</span>
              <span className="text-xs font-mono font-bold text-amber-400">
                {formatCurrency(totalPending)}
              </span>
            </div>
          )}

          {/* AI Broker Escalation Draft Button */}
          <button
            type="button"
            id="btn-copilot-broker-escalation"
            onClick={() => {
              setCopilotClaimId(claims.find((c) => c.type === 'detention')?.id || claims[0]?.id);
              setIsCopilotOpen(true);
            }}
            className="px-3 py-1.5 text-xs font-bold text-violet-300 bg-violet-950/80 hover:bg-violet-900 text-white rounded-lg transition-colors shadow-xs flex items-center gap-1.5 cursor-pointer shrink-0 ml-2 border border-violet-800/60"
            title="Draft official broker detention escalation email with dual timezone timestamps"
          >
            <Sparkles className="w-3.5 h-3.5 text-violet-400" />
            <span>Draft Escalation</span>
          </button>

          {/* Detention Audit Workspace Button (Phase 3A) */}
          <button
            type="button"
            id="btn-open-detention-audit-tab"
            onClick={() => setIsAuditModalOpen(true)}
            className="px-3 py-1.5 text-xs font-bold text-amber-300 bg-amber-950/80 hover:bg-amber-900 rounded-lg transition-colors shadow-xs flex items-center gap-1.5 cursor-pointer shrink-0 border border-amber-800/60"
            title="Open AI Detention Audit & Human Review Workspace"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
            <span>Detention Audit</span>
          </button>

          {canEdit && (
            <button
              type="button"
              onClick={() => {
                setSelectedClaimForEdit(null);
                setIsModalOpen(true);
              }}
              className="px-3 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors shadow-xs flex items-center gap-1 cursor-pointer shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Log Claim</span>
            </button>
          )}
        </div>
      </div>

      {/* Claims List */}
      <AccessorialList
        claims={claims}
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

      {/* Modal */}
      <AccessorialModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedClaimForEdit(null);
        }}
        load={load}
        claimToEdit={selectedClaimForEdit}
        onSuccess={() => fetchLoadClaims()}
      />

      {/* Task Modal for Detention & Claim Reminders */}
      <TaskModal
        isOpen={isTaskModalOpen}
        onClose={() => {
          setIsTaskModalOpen(false);
          setTaskReferenceEntityId(null);
        }}
        preselectedLoadId={load.id}
        initialCategory={taskInitialCategory}
        initialPriority={taskInitialPriority}
        initialTitle={taskInitialTitle}
        initialDueAt={taskInitialDueAt}
        initialDescription={taskInitialDescription}
        triggerSource={taskTriggerSource}
        referenceEntityId={taskReferenceEntityId}
        onSuccess={() => {
          setIsTaskModalOpen(false);
          setTaskReferenceEntityId(null);
        }}
      />

      {/* Contextual AI Copilot Modal */}
      <ContextualCopilotModal
        isOpen={isCopilotOpen}
        onClose={() => setIsCopilotOpen(false)}
        load={load}
        loadId={load.id}
        claimId={copilotClaimId}
        initialAction="detention_escalation"
        titleContext="Broker Detention Escalation"
      />

      {/* Delete Confirmation Modal */}
      {claimToDelete && (
        <Modal
          id="delete-accessorial-modal"
          isOpen={Boolean(claimToDelete)}
          onClose={() => {
            if (!isDeleting) setClaimToDelete(null);
          }}
          title="Delete Accessorial Claim"
          subtitle={`Are you sure you want to remove this ${ACCESSORIAL_TYPE_CONFIG[claimToDelete.type]?.label || 'accessorial'} claim?`}
          maxWidth="md"
        >
          <div className="p-6 space-y-4">
            <div className="flex items-start gap-3 p-3.5 rounded-xl bg-rose-950/40 border border-rose-800/60 text-xs text-rose-200 leading-relaxed">
              <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <strong className="text-rose-100 font-semibold block mb-0.5">
                  Confirm Permanent Removal
                </strong>
                Are you sure you want to delete this accessorial record? This will remove the charge from the load's ledger and audit trail.
              </div>
            </div>

            {/* Accessorial Details Summary */}
            <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Claim Type:</span>
                <span className="font-semibold text-slate-100">
                  {ACCESSORIAL_TYPE_CONFIG[claimToDelete.type]?.label || claimToDelete.type}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Claim Amount:</span>
                <span className="font-mono font-bold text-amber-400">
                  {formatCurrency(claimToDelete.amount)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Load Reference:</span>
                <span className="font-semibold text-indigo-300">
                  #{claimToDelete.load?.load_number || load.load_number}
                </span>
              </div>
              {claimToDelete.broker_name && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Broker:</span>
                  <span className="text-slate-200">{claimToDelete.broker_name}</span>
                </div>
              )}
              {claimToDelete.notes && (
                <div className="pt-2 border-t border-slate-800/80 text-[11px] text-slate-400">
                  <span className="font-medium text-slate-300">Notes: </span>
                  {claimToDelete.notes}
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setClaimToDelete(null)}
                disabled={isDeleting}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                id="btn-confirm-delete-accessorial"
                type="button"
                onClick={confirmDelete}
                disabled={isDeleting}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-lg shadow-rose-900/30 flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
              >
                {isDeleting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Claim</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
