import React, { useState, useEffect, useCallback } from 'react';
import { LoadWithRelations, PIPELINE_STATUS_OPTIONS } from './loadTypes.ts';
import { getAllowedTransitions } from '../pipeline/pipelineTypes.ts';
import { PipelineStatus, DocumentStatus, DocumentType, LoadDetentionAudit } from '../../types/domain.types.ts';
import { Modal } from '../../components/common/Modal.tsx';
import { StatusBadge } from '../../components/common/StatusBadge.tsx';
import { LoadProfitabilityCard } from './LoadProfitabilityCard.tsx';
import { useTimezone } from '../../contexts/TimezoneContext.tsx';
import { useAuth } from '../../contexts/AuthContext.tsx';
import { formatDualTime, formatInTimezone } from '../../lib/timezones.ts';
import { formatCurrency, formatMiles, formatRPM } from '../../lib/calculations.ts';
import { formatDriverPayRate } from '../drivers/driverTypes.ts';
import { documentService } from '../documents/documentService.ts';
import {
  LoadDocumentSummary,
  FreightDocument,
  CreateDocumentInput,
  formatDocumentFileSize,
} from '../documents/documentTypes.ts';
import { DocumentUploadModal } from '../documents/DocumentUploadModal.tsx';
import { DocumentDetailModal } from '../documents/DocumentDetailModal.tsx';
import { checkCallService } from '../checkcalls/checkCallService.ts';
import {
  CheckCall,
  CheckCallType,
  CheckCallOperationalStatus,
  CreateCheckCallInput,
  UpdateCheckCallInput,
  LoadTrackingSummary,
  CHECK_CALL_STATUS_BADGES,
  CHECK_CALL_STATUS_LABELS,
  CHECK_CALL_TYPE_LABELS,
  isOperationalException,
} from '../checkcalls/checkCallTypes.ts';
import { CheckCallModal } from '../checkcalls/CheckCallModal.tsx';
import { CheckCallTimeline } from '../checkcalls/CheckCallTimeline.tsx';
import { ActivityTimeline } from '../activity/ActivityTimeline.tsx';
import { AccessorialTab } from '../accessorials/AccessorialTab.tsx';
import { DetentionAuditModal } from '../accessorials/DetentionAuditModal.tsx';
import { accessorialService } from '../accessorials/accessorialService.ts';
import { ContextualCopilotModal } from '../ai/ContextualCopilotModal.tsx';
import { CopilotAction } from '../ai/aiTypes.ts';
import { pdfService } from '../../lib/pdf/pdfService.ts';
import { taskService, isTaskOverdue, calculateSnoozeDate, getEffectiveDueAt } from '../tasks/taskService.ts';
import {
  DispatcherTask,
  TaskCategory,
  TaskPriority,
  SnoozePreset,
  TASK_CATEGORY_CONFIG,
  TASK_PRIORITY_CONFIG,
} from '../tasks/taskTypes.ts';
import { TaskModal } from '../tasks/TaskModal.tsx';
import { InvoiceSettlementModal } from '../billing/InvoiceSettlementModal.tsx';
import { BillingDocumentType } from '../billing/billingTypes.ts';
import {
  PackageCheck,
  Building2,
  Truck as TruckIcon,
  UserCheck,
  ShieldCheck,
  MapPin,
  Calendar,
  DollarSign,
  FileText,
  Clock,
  Edit2,
  Phone,
  Mail,
  Receipt,
  FileCheck,
  Radio,
  ArrowRight,
  Plus,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  ShieldAlert,
  Navigation,
  History,
  Timer,
  Sparkles,
  CheckSquare,
  Bell,
  Trash2,
  Download,
  RefreshCw,
} from 'lucide-react';

interface LoadDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  load: LoadWithRelations | null;
  onEdit?: (load: LoadWithRelations) => void;
  onStatusChange?: (loadId: string, newStatus: PipelineStatus) => Promise<void>;
  canEdit?: boolean;
  onDocumentUpdated?: () => Promise<void> | void;
  onCheckCallUpdated?: (loadId: string) => Promise<void> | void;
}

export const LoadDetailModal: React.FC<LoadDetailModalProps> = ({
  isOpen,
  onClose,
  load,
  onEdit,
  onStatusChange,
  canEdit = true,
  onDocumentUpdated,
  onCheckCallUpdated,
}) => {
  const { operationalTimezone, dispatcherTimezone } = useTimezone();
  const { userRole, user, profile, activeOrganization } = useAuth();

  const isAuthorized = React.useMemo(() => {
    if (!load) return false;
    if (userRole === 'owner_admin' || userRole === null) return true;
    if (userRole === 'dispatcher' || userRole === 'staff') {
      const currentUserId = user?.id || (typeof localStorage !== 'undefined' ? localStorage.getItem('dispatchdesk_current_user_id') : null);
      if (!currentUserId) return false;
      const isDirectlyAssigned = load.assigned_dispatcher_id === currentUserId;
      const isInTeam = load.assigned_team?.some((m) => m.user_id === currentUserId);
      const isInAssignments = load.assigned_team_assignments?.some((a) => a.user_id === currentUserId);
      return Boolean(isDirectlyAssigned || isInTeam || isInAssignments);
    }
    return false;
  }, [load, userRole, user?.id]);

  const [generatingPdfType, setGeneratingPdfType] = useState<string | null>(null);

  const [docSummary, setDocSummary] = useState<LoadDocumentSummary | null>(null);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [selectedUploadType, setSelectedUploadType] = useState<DocumentType>('rate_confirmation');
  const [selectedDoc, setSelectedDoc] = useState<FreightDocument | null>(null);
  const [isDocDetailOpen, setIsDocDetailOpen] = useState(false);
  const [isLoadingDocs, setIsLoadingDocs] = useState(false);

  // Dispatch Tracking State
  const [checkCalls, setCheckCalls] = useState<CheckCall[]>([]);
  const [trackingSummary, setTrackingSummary] = useState<LoadTrackingSummary | null>(null);
  const [isCheckCallModalOpen, setIsCheckCallModalOpen] = useState(false);
  const [selectedCheckCallForEdit, setSelectedCheckCallForEdit] = useState<CheckCall | null>(null);
  const [quickCallType, setQuickCallType] = useState<CheckCallType | undefined>(undefined);
  const [quickCallStatus, setQuickCallStatus] = useState<CheckCallOperationalStatus | undefined>(undefined);
  const [isLoadingTracking, setIsLoadingTracking] = useState(false);

  // Load-Linked Tasks State
  const [loadTasks, setLoadTasks] = useState<DispatcherTask[]>([]);
  const [isLoadingTasks, setIsLoadingTasks] = useState(false);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [selectedTaskToEdit, setSelectedTaskToEdit] = useState<DispatcherTask | null>(null);
  const [initialTaskCategory, setInitialTaskCategory] = useState<TaskCategory | undefined>(undefined);
  const [initialTaskTitle, setInitialTaskTitle] = useState<string | undefined>(undefined);
  const [initialTaskPriority, setInitialTaskPriority] = useState<TaskPriority | undefined>(undefined);
  const [initialTaskDueAt, setInitialTaskDueAt] = useState<string | undefined>(undefined);

  // Contextual Copilot State
  const [isCopilotOpen, setIsCopilotOpen] = useState(false);
  const [copilotAction, setCopilotAction] = useState<CopilotAction>('analyze_load');

  // Detention Audit Workspace State
  const [isDetentionAuditOpen, setIsDetentionAuditOpen] = useState(false);

  // Billing & Settlement Generator State
  const [isBillingModalOpen, setIsBillingModalOpen] = useState(false);
  const [billingModalType, setBillingModalType] = useState<BillingDocumentType>('broker_invoice');

  // Check Call Deletion & Feedback State
  const [checkCallToDelete, setCheckCallToDelete] = useState<CheckCall | null>(null);
  const [isDeletingCheckCall, setIsDeletingCheckCall] = useState(false);
  const [checkCallFeedback, setCheckCallFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleOpenInvoiceGenerator = () => {
    setBillingModalType('broker_invoice');
    setIsBillingModalOpen(true);
  };

  const handleOpenSettlementGenerator = () => {
    setBillingModalType('carrier_settlement');
    setIsBillingModalOpen(true);
  };

  const handleOpenCopilot = (action: CopilotAction = 'analyze_load') => {
    setCopilotAction(action);
    setIsCopilotOpen(true);
  };

  const canEditCheckCalls = userRole === 'owner_admin' || userRole === 'dispatcher';
  const canMutateTasks = userRole === 'owner_admin' || userRole === 'dispatcher';

  const actorName = profile?.full_name || user?.email?.split('@')[0] || 'Alex Rivera';
  const actorId = user?.id || 'usr-alex-1';

  const fetchTasks = useCallback(async () => {
    if (!load) return;
    setIsLoadingTasks(true);
    try {
      const tasks = await taskService.getTasks(load.organization_id, { loadId: load.id });
      setLoadTasks(tasks);
    } catch (err) {
      console.error('Error fetching load tasks:', err);
    } finally {
      setIsLoadingTasks(false);
    }
  }, [load]);

  const fetchPaperwork = useCallback(async () => {
    if (!load) return;
    setIsLoadingDocs(true);
    try {
      const summary = await documentService.getDocumentSummaryForLoad(load.organization_id, load);
      setDocSummary(summary);
    } catch (err) {
      console.error('Error fetching load paperwork:', err);
    } finally {
      setIsLoadingDocs(false);
    }
  }, [load]);

  const fetchTracking = useCallback(async () => {
    if (!load) return;
    setIsLoadingTracking(true);
    try {
      const [calls, summary] = await Promise.all([
        checkCallService.getCheckCalls(load.organization_id, load.id),
        checkCallService.getTrackingSummaryForLoad(load.organization_id, load),
      ]);
      setCheckCalls(calls);
      setTrackingSummary(summary);
    } catch (err) {
      console.error('Error fetching load tracking:', err);
    } finally {
      setIsLoadingTracking(false);
    }
  }, [load]);

  useEffect(() => {
    if (isOpen && load && isAuthorized) {
      fetchPaperwork();
      fetchTracking();
      fetchTasks();
    }
  }, [isOpen, load, isAuthorized, fetchPaperwork, fetchTracking, fetchTasks]);

  const handleDetentionAuditUpdated = useCallback((_audit: LoadDetentionAudit) => {
    fetchTracking();
    fetchPaperwork();
    fetchTasks();
    if (load?.id && onCheckCallUpdated) {
      onCheckCallUpdated(load.id);
    }
    if (onDocumentUpdated) {
      onDocumentUpdated();
    }
  }, [fetchTracking, fetchPaperwork, fetchTasks, load?.id, onCheckCallUpdated, onDocumentUpdated]);

  const handleOpenCreateReminder = (
    category: TaskCategory = 'general_operational',
    title?: string,
    priority: TaskPriority = 'normal',
    dueAt?: string
  ) => {
    setSelectedTaskToEdit(null);
    setInitialTaskCategory(category);
    setInitialTaskTitle(title || `Follow-up on Load #${load?.load_number}`);
    setInitialTaskPriority(priority);
    setInitialTaskDueAt(dueAt);
    setIsTaskModalOpen(true);
  };

  const handleQuickCompleteTask = async (task: DispatcherTask) => {
    if (!load || !canMutateTasks) return;
    try {
      await taskService.completeTask(
        load.organization_id,
        task.id,
        {
          completed_by_user_id: actorId,
          completed_by_name: actorName,
          completion_notes: 'Completed from Load Detail view',
        },
        userRole
      );
      await fetchTasks();
    } catch (err) {
      console.error('Error completing task:', err);
    }
  };

  const handleQuickSnoozeTask = async (task: DispatcherTask, preset: SnoozePreset = '30m') => {
    if (!load || !canMutateTasks) return;
    try {
      const snoozedUntil = calculateSnoozeDate(preset);
      await taskService.snoozeTask(
        load.organization_id,
        task.id,
        {
          snooze_preset: preset,
          snoozed_until: snoozedUntil,
          snoozed_by_name: actorName,
          snoozed_by_user_id: actorId,
        },
        userRole
      );
      await fetchTasks();
    } catch (err) {
      console.error('Error snoozing task:', err);
    }
  };

  const handleOpenQuickCheckCall = (
    type: CheckCallType,
    status: CheckCallOperationalStatus = 'on_time'
  ) => {
    setSelectedCheckCallForEdit(null);
    setQuickCallType(type);
    setQuickCallStatus(status);
    setIsCheckCallModalOpen(true);
  };

  const handleEditCheckCall = (call: CheckCall) => {
    setSelectedCheckCallForEdit(call);
    setQuickCallType(undefined);
    setQuickCallStatus(undefined);
    setIsCheckCallModalOpen(true);
  };

  const handleDeleteCheckCall = (call: CheckCall) => {
    setCheckCallToDelete(call);
  };

  const handleConfirmDeleteCheckCall = async () => {
    if (!load || !checkCallToDelete || isDeletingCheckCall) return;
    setIsDeletingCheckCall(true);
    try {
      await checkCallService.deleteCheckCall(load.organization_id, checkCallToDelete.id);
      await fetchTracking();
      await onCheckCallUpdated?.(load.id);
      const typeLabel = CHECK_CALL_TYPE_LABELS[checkCallToDelete.call_type] || checkCallToDelete.call_type;
      setCheckCallFeedback({
        type: 'success',
        text: `Check call record "${typeLabel}" on Load #${load.load_number} deleted successfully.`,
      });
      setTimeout(() => setCheckCallFeedback(null), 4000);
      setCheckCallToDelete(null);
    } catch (err: unknown) {
      console.error('Error deleting check call:', err);
      const msg = err instanceof Error ? err.message : 'Failed to delete check call record.';
      setCheckCallFeedback({
        type: 'error',
        text: msg,
      });
    } finally {
      setIsDeletingCheckCall(false);
    }
  };

  const handleSubmitCheckCall = async (data: CreateCheckCallInput | UpdateCheckCallInput) => {
    if (!load) return;
    try {
      if (selectedCheckCallForEdit) {
        await checkCallService.updateCheckCall(
          load.organization_id,
          selectedCheckCallForEdit.id,
          data as UpdateCheckCallInput
        );
      } else {
        await checkCallService.createCheckCall(load.organization_id, data as CreateCheckCallInput);
      }
      await fetchTracking();
      await onCheckCallUpdated?.(load.id);
      setIsCheckCallModalOpen(false);
    } catch (err) {
      throw err;
    }
  };

  if (!load) return null;

  const totalMiles = (load.loaded_miles || 0) + (load.deadhead_miles || 0);
  const pickupTimeDual = formatDualTime(load.pickup_datetime, operationalTimezone, dispatcherTimezone);
  const deliveryTimeDual = formatDualTime(load.delivery_datetime, operationalTimezone, dispatcherTimezone);

  const handleUploadPaperwork = async (input: CreateDocumentInput) => {
    await documentService.createDocument(load.organization_id, input);
    await fetchPaperwork();
    setIsUploadModalOpen(false);
  };

  const handleDocStatusChange = async (doc: FreightDocument, newStatus: DocumentStatus) => {
    await documentService.updateDocumentStatus(load.organization_id, doc.id, newStatus);
    await onDocumentUpdated?.();
    await fetchPaperwork();
    const updated = await documentService.getDocument(load.organization_id, doc.id);
    setSelectedDoc(updated);
  };

  const handleDocDelete = async (doc: FreightDocument) => {
    await documentService.deleteDocument(load.organization_id, doc.id);
    await fetchPaperwork();
  };

  const handleDownloadRateConPdf = async () => {
    if (!load) return;
    setGeneratingPdfType('rate_con');
    try {
      const claims = await accessorialService.getAccessorialsByLoadId(load.organization_id, load.id);
      await pdfService.downloadRateConfirmation({
        load,
        accessorials: claims,
        organization: activeOrganization,
        operationalTimezone,
        dispatcherTimezone,
      });
    } catch (err) {
      console.error('Failed to generate Rate Con PDF:', err);
    } finally {
      setGeneratingPdfType(null);
    }
  };

  const handleDownloadInvoicePdf = async () => {
    if (!load) return;
    setGeneratingPdfType('invoice');
    try {
      const claims = await accessorialService.getAccessorialsByLoadId(load.organization_id, load.id);
      await pdfService.downloadCarrierInvoice({
        load,
        accessorials: claims,
        organization: activeOrganization,
        operationalTimezone,
        dispatcherTimezone,
      });
    } catch (err) {
      console.error('Failed to generate Carrier Invoice PDF:', err);
    } finally {
      setGeneratingPdfType(null);
    }
  };

  const handleDownloadSettlementPdf = async () => {
    if (!load) return;
    setGeneratingPdfType('settlement');
    try {
      const claims = await accessorialService.getAccessorialsByLoadId(load.organization_id, load.id);
      await pdfService.downloadDriverSettlement({
        load,
        accessorials: claims,
        organization: activeOrganization,
        operationalTimezone,
        dispatcherTimezone,
      });
    } catch (err) {
      console.error('Failed to generate Driver Settlement PDF:', err);
    } finally {
      setGeneratingPdfType(null);
    }
  };

  if (!load || !isAuthorized) {
    return (
      <Modal
        id="load-detail-modal-denied"
        isOpen={isOpen}
        onClose={onClose}
        title="Access Denied"
        maxWidth="md"
      >
        <div className="p-6 text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-rose-950/60 border border-rose-800/80 text-rose-400 flex items-center justify-center mx-auto">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-slate-100">Unauthorized Load Access</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
              You do not have permission to view or manage this load. Employees and dispatchers can only access loads assigned directly to them.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-semibold transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      id="load-detail-modal"
      isOpen={isOpen}
      onClose={onClose}
      title={`Load Details: ${load.load_number}`}
      subtitle={`${load.origin_city}, ${load.origin_state} → ${load.dest_city}, ${load.dest_state}`}
      maxWidth="near-full"
    >
      <div className="space-y-6 text-xs text-slate-200">
        {/* Top Operational Status Header */}
        <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-indigo-950/60 border border-indigo-800/40 text-indigo-400">
              <PackageCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-bold text-slate-100 font-mono tracking-tight">
                  {load.load_number}
                </span>
                <StatusBadge status={load.pipeline_status} type="pipeline" size="sm" />
              </div>
              <p className="text-slate-400 text-[11px] mt-0.5">
                Created: {formatInTimezone(load.created_at, operationalTimezone, { includeDate: true, includeTime: false, includeTimezoneCode: false })} • Updated: {formatInTimezone(load.updated_at, operationalTimezone, { includeDate: false, includeTime: true, includeTimezoneCode: true })}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Invoice & Settlement Generator Action Buttons */}
            <div className="flex items-center gap-1.5">
              <button
                id="btn-generate-invoice-header"
                type="button"
                onClick={handleOpenInvoiceGenerator}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-300 bg-emerald-950/80 hover:bg-emerald-900/90 hover:text-white rounded-lg transition-colors cursor-pointer border border-emerald-800/60 shadow-xs"
                title="Open Broker Freight Invoice Generator"
              >
                <Receipt className="w-3.5 h-3.5 text-emerald-400" />
                <span>Generate Invoice</span>
              </button>

              <button
                id="btn-generate-settlement-header"
                type="button"
                onClick={handleOpenSettlementGenerator}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-300 bg-indigo-950/80 hover:bg-indigo-900/90 hover:text-white rounded-lg transition-colors cursor-pointer border border-indigo-800/60 shadow-xs"
                title="Open Carrier & Driver Settlement Statement Generator"
              >
                <DollarSign className="w-3.5 h-3.5 text-indigo-400" />
                <span>Generate Settlement</span>
              </button>
            </div>

            {/* Operational Quick PDF Export Buttons */}
            <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-lg p-0.5">
              <button
                id="btn-download-rate-con-pdf"
                type="button"
                onClick={handleDownloadRateConPdf}
                disabled={generatingPdfType !== null}
                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-slate-300 hover:text-white hover:bg-slate-800 rounded transition-colors cursor-pointer disabled:opacity-50"
                title="Download Rate Confirmation PDF"
              >
                <Download className={`w-3 h-3 ${generatingPdfType === 'rate_con' ? 'animate-bounce text-indigo-400' : 'text-indigo-400'}`} />
                <span>Rate Con</span>
              </button>
              <button
                id="btn-download-invoice-pdf"
                type="button"
                onClick={handleDownloadInvoicePdf}
                disabled={generatingPdfType !== null}
                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-slate-300 hover:text-white hover:bg-slate-800 rounded transition-colors cursor-pointer disabled:opacity-50"
                title="Download Carrier Invoice PDF"
              >
                <Download className={`w-3 h-3 ${generatingPdfType === 'invoice' ? 'animate-bounce text-emerald-400' : 'text-emerald-400'}`} />
                <span>PDF</span>
              </button>
            </div>

            {/* Ask Copilot Main Button */}
            <button
              id="btn-ask-copilot-load-detail"
              type="button"
              onClick={() => handleOpenCopilot('analyze_load')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-violet-300 bg-violet-950/80 hover:bg-violet-900/90 hover:text-white rounded-lg transition-colors cursor-pointer border border-violet-800/60 shadow-xs"
              title="Open AI Dispatch Copilot for Load Analysis, Risk & Communications"
            >
              <Sparkles className="w-3.5 h-3.5 text-violet-400" />
              <span>Ask Copilot</span>
            </button>

            {/* Detention Audit Engine Button (Phase 3A) */}
            {isAuthorized && (
              <button
                id="btn-detention-audit-load-detail"
                type="button"
                onClick={() => setIsDetentionAuditOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-amber-300 bg-amber-950/80 hover:bg-amber-900/90 hover:text-white rounded-lg transition-colors cursor-pointer border border-amber-800/60 shadow-xs"
                title="Open AI Detention Audit & Human Review Workspace"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                <span>Detention Audit</span>
              </button>
            )}

            {canEdit && onStatusChange && (
              <div className="flex items-center gap-1.5">
                <span className="text-slate-400 text-[11px]">Quick Status:</span>
                <select
                  id="quick-status-change-select"
                  value={load.pipeline_status}
                  onChange={(e) => onStatusChange(load.id, e.target.value as PipelineStatus)}
                  className="px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 font-semibold focus:outline-none focus:border-indigo-500 cursor-pointer text-xs"
                >
                  {PIPELINE_STATUS_OPTIONS.map((opt) => {
                    const allowed = getAllowedTransitions(load.pipeline_status);
                    const isCurrent = opt.value === load.pipeline_status;
                    const isAllowed = isCurrent || allowed.includes(opt.value);
                    return (
                      <option key={opt.value} value={opt.value} disabled={!isAllowed}>
                        {opt.label}{!isAllowed && !isCurrent ? ' (Invalid)' : ''}
                      </option>
                    );
                  })}
                </select>
              </div>
            )}

            {canEdit && onEdit && (
              <button
                id="edit-load-from-detail-btn"
                type="button"
                onClick={() => {
                  onClose();
                  onEdit(load);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-200 bg-slate-800 hover:bg-slate-700 hover:text-white rounded-lg transition-colors cursor-pointer border border-slate-700"
              >
                <Edit2 className="w-3.5 h-3.5" />
                <span>Edit Load</span>
              </button>
            )}
          </div>
        </div>

        {/* Lane, Schedule & Timezones */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Origin / Pickup Card */}
          <div className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800 space-y-2">
            <div className="flex items-center gap-2 text-emerald-400 font-bold uppercase tracking-wider text-[11px] pb-1 border-b border-slate-800/80">
              <MapPin className="w-3.5 h-3.5" />
              <span>Shipper / Pickup Origin</span>
            </div>
            <div className="space-y-0.5">
              {load.origin_facility_name && (
                <div className="text-sm font-bold text-slate-100">
                  {load.origin_facility_name}
                </div>
              )}
              {load.origin_address && (
                <div className="text-xs text-slate-300 font-medium">
                  {load.origin_address}
                </div>
              )}
              <div className={load.origin_facility_name || load.origin_address ? 'text-xs text-slate-400 font-medium' : 'text-sm font-bold text-slate-100'}>
                {load.origin_city}, {load.origin_state} {load.origin_zip || ''}
              </div>
            </div>
            <div className="bg-slate-900/90 p-2.5 rounded-lg border border-slate-800/80 space-y-1 font-mono text-[11px]">
              <div className="flex items-center justify-between text-slate-400">
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-slate-400" />
                  Scheduled Pickup:
                </span>
              </div>
              <p className="text-slate-200 font-semibold">{pickupTimeDual.primary}</p>
              {pickupTimeDual.secondary !== '—' && (
                <p className="text-slate-400 text-[10px]">Dispatcher Time: {pickupTimeDual.secondary}</p>
              )}
            </div>

            {/* Pickup Dock Milestones */}
            <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800/60 space-y-1.5 font-mono text-[11px]">
              <div className="flex items-center justify-between text-slate-400 font-sans font-medium text-[10px] uppercase tracking-wider pb-1 border-b border-slate-800/50">
                <span className="flex items-center gap-1 text-emerald-400">
                  <Clock className="w-3 h-3" />
                  Pickup Dock Milestones
                </span>
                {(load.pickup_arrival_time || load.pickup_departure_time) && (
                  <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-800/50 font-mono">
                    {load.pickup_departure_time ? 'Departed' : 'On Site'}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[10px]">
                <div>
                  <span className="text-slate-500 block">Arrival:</span>
                  <span className="text-slate-200 font-semibold">
                    {load.pickup_arrival_time
                      ? formatInTimezone(load.pickup_arrival_time, operationalTimezone, { includeDate: true, includeTime: true, includeTimezoneCode: true })
                      : '—'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Loading Start:</span>
                  <span className="text-slate-200 font-semibold">
                    {load.pickup_loading_start_time
                      ? formatInTimezone(load.pickup_loading_start_time, operationalTimezone, { includeDate: false, includeTime: true, includeTimezoneCode: true })
                      : '—'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Loading Done:</span>
                  <span className="text-slate-200 font-semibold">
                    {load.pickup_loading_complete_time
                      ? formatInTimezone(load.pickup_loading_complete_time, operationalTimezone, { includeDate: false, includeTime: true, includeTimezoneCode: true })
                      : '—'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Departure:</span>
                  <span className="text-slate-200 font-semibold">
                    {load.pickup_departure_time
                      ? formatInTimezone(load.pickup_departure_time, operationalTimezone, { includeDate: true, includeTime: true, includeTimezoneCode: true })
                      : '—'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Destination / Delivery Card */}
          <div className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800 space-y-2">
            <div className="flex items-center gap-2 text-teal-400 font-bold uppercase tracking-wider text-[11px] pb-1 border-b border-slate-800/80">
              <MapPin className="w-3.5 h-3.5" />
              <span>Receiver / Destination</span>
            </div>
            <div className="space-y-0.5">
              {load.dest_facility_name && (
                <div className="text-sm font-bold text-slate-100">
                  {load.dest_facility_name}
                </div>
              )}
              {load.dest_address && (
                <div className="text-xs text-slate-300 font-medium">
                  {load.dest_address}
                </div>
              )}
              <div className={load.dest_facility_name || load.dest_address ? 'text-xs text-slate-400 font-medium' : 'text-sm font-bold text-slate-100'}>
                {load.dest_city}, {load.dest_state} {load.dest_zip || ''}
              </div>
            </div>
            <div className="bg-slate-900/90 p-2.5 rounded-lg border border-slate-800/80 space-y-1 font-mono text-[11px]">
              <div className="flex items-center justify-between text-slate-400">
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-slate-400" />
                  Scheduled Delivery:
                </span>
              </div>
              <p className="text-slate-200 font-semibold">{deliveryTimeDual.primary}</p>
              {deliveryTimeDual.secondary !== '—' && (
                <p className="text-slate-400 text-[10px]">Dispatcher Time: {deliveryTimeDual.secondary}</p>
              )}
            </div>

            {/* Delivery Dock Milestones */}
            <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800/60 space-y-1.5 font-mono text-[11px]">
              <div className="flex items-center justify-between text-slate-400 font-sans font-medium text-[10px] uppercase tracking-wider pb-1 border-b border-slate-800/50">
                <span className="flex items-center gap-1 text-teal-400">
                  <Clock className="w-3 h-3" />
                  Delivery Dock Milestones
                </span>
                {(load.delivery_arrival_time || load.delivery_departure_time) && (
                  <span className="text-[9px] px-1.5 py-0.2 rounded bg-teal-950/80 text-teal-300 border border-teal-800/50 font-mono">
                    {load.delivery_departure_time ? 'Completed' : 'At Facility'}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[10px]">
                <div>
                  <span className="text-slate-500 block">Arrival:</span>
                  <span className="text-slate-200 font-semibold">
                    {load.delivery_arrival_time
                      ? formatInTimezone(load.delivery_arrival_time, operationalTimezone, { includeDate: true, includeTime: true, includeTimezoneCode: true })
                      : '—'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Unload Start:</span>
                  <span className="text-slate-200 font-semibold">
                    {load.delivery_unloading_start_time
                      ? formatInTimezone(load.delivery_unloading_start_time, operationalTimezone, { includeDate: false, includeTime: true, includeTimezoneCode: true })
                      : '—'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Unload Done:</span>
                  <span className="text-slate-200 font-semibold">
                    {load.delivery_unloading_complete_time
                      ? formatInTimezone(load.delivery_unloading_complete_time, operationalTimezone, { includeDate: false, includeTime: true, includeTimezoneCode: true })
                      : '—'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Departure:</span>
                  <span className="text-slate-200 font-semibold">
                    {load.delivery_departure_time
                      ? formatInTimezone(load.delivery_departure_time, operationalTimezone, { includeDate: true, includeTime: true, includeTimezoneCode: true })
                      : '—'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Operational Entity Cards (Client, Broker, Truck, Driver, Dispatcher) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Client Carrier */}
          <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-1.5 text-indigo-400 font-bold uppercase tracking-wider text-[10px] mb-1">
                <Building2 className="w-3 h-3" />
                <span>Client Carrier</span>
              </div>
              <p className="font-semibold text-slate-100 text-xs truncate">
                {load.client?.company_name || 'Unassigned Client'}
              </p>
              <p className="text-slate-400 text-[11px] capitalize mt-0.5">
                {load.client?.client_type?.replace('_', ' ') || 'Carrier'}
              </p>
            </div>
            {load.client?.contact_phone && (
              <div className="pt-2 mt-2 border-t border-slate-800/60 text-slate-400 text-[10px] flex items-center gap-1">
                <Phone className="w-2.5 h-2.5" />
                <span>{load.client.contact_phone}</span>
              </div>
            )}
          </div>

          {/* Brokerage */}
          <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-1.5 text-sky-400 font-bold uppercase tracking-wider text-[10px] mb-1">
                <ShieldCheck className="w-3 h-3" />
                <span>Broker / Customer</span>
              </div>
              <p className="font-semibold text-slate-100 text-xs truncate">
                {load.broker?.company_name || 'Direct / Unlinked'}
              </p>
              <div className="flex items-center gap-1.5 mt-0.5">
                {load.broker?.mc_number && (
                  <span className="text-[10px] font-mono text-slate-400">MC-{load.broker.mc_number}</span>
                )}
                {load.broker?.credit_status && (
                  <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-300 border border-emerald-800/40">
                    {load.broker.credit_status}
                  </span>
                )}
              </div>
            </div>
            {load.broker?.contact_name && (
              <div className="pt-2 mt-2 border-t border-slate-800/60 text-slate-400 text-[10px] truncate">
                Rep: {load.broker.contact_name}
              </div>
            )}
          </div>

          {/* Power Unit (Truck) */}
          <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-1.5 text-amber-400 font-bold uppercase tracking-wider text-[10px] mb-1">
                <TruckIcon className="w-3 h-3" />
                <span>Dispatched Truck</span>
              </div>
              <p className="font-semibold text-slate-100 text-xs">
                {load.truck ? `Truck #${load.truck.truck_number}` : 'No Unit Assigned'}
              </p>
              <p className="text-slate-400 text-[11px] capitalize mt-0.5">
                {load.truck?.equipment_type.replace('_', ' ') || load.equipment_type.replace('_', ' ')}
              </p>
            </div>
            {load.truck?.vin && (
              <div className="pt-2 mt-2 border-t border-slate-800/60 font-mono text-slate-400 text-[10px] truncate">
                VIN: {load.truck.vin}
              </div>
            )}
          </div>

          {/* Assigned Driver */}
          <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-1.5 text-purple-400 font-bold uppercase tracking-wider text-[10px] mb-1">
                <UserCheck className="w-3 h-3" />
                <span>Assigned Driver</span>
              </div>
              <p className="font-semibold text-slate-100 text-xs truncate">
                {load.driver?.full_name || 'No Driver Assigned'}
              </p>
              {load.driver && (
                <p className="text-slate-400 text-[10px] mt-0.5">
                  Pay: {formatDriverPayRate(load.driver.pay_type, load.driver.pay_rate)}
                </p>
              )}
            </div>
            {load.driver?.phone && (
              <div className="pt-2 mt-2 border-t border-slate-800/60 text-slate-400 text-[10px] flex items-center gap-1">
                <Phone className="w-2.5 h-2.5" />
                <span>{load.driver.phone}</span>
              </div>
            )}
          </div>

          {/* Assigned To (Operational Team) */}
          <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-1.5 text-indigo-400 font-bold uppercase tracking-wider text-[10px] mb-1">
                <UserCheck className="w-3 h-3" />
                <span>
                  {load.assigned_team && load.assigned_team.length > 1
                    ? `Assigned Team (${load.assigned_team.length})`
                    : 'Assigned To'}
                </span>
              </div>
              {load.assigned_team && load.assigned_team.length > 0 ? (
                load.assigned_team.length === 1 ? (
                  <>
                    <p className="font-semibold text-slate-100 text-xs truncate">
                      {load.assigned_team[0].full_name}
                    </p>
                    <p className="text-slate-400 text-[11px] capitalize mt-0.5">
                      {load.assigned_team[0].role === 'owner_admin'
                        ? 'Admin'
                        : load.assigned_team[0].role === 'dispatcher'
                        ? 'Dispatcher'
                        : 'Staff'}
                    </p>
                  </>
                ) : (
                  <div className="space-y-1 mt-1 max-h-20 overflow-y-auto pr-1">
                    {load.assigned_team.map((m) => (
                      <div
                        key={m.user_id || m.id}
                        className="flex items-center justify-between gap-1 text-[11px] bg-slate-900/90 px-1.5 py-0.5 rounded border border-slate-800"
                        title={m.email || m.full_name || undefined}
                      >
                        <span className="font-medium text-slate-200 truncate">{m.full_name}</span>
                        <span className="text-[9px] text-indigo-300 font-medium px-1 bg-indigo-950/80 rounded shrink-0">
                          {m.role === 'owner_admin' ? 'Admin' : m.role === 'dispatcher' ? 'Disp' : 'Staff'}
                        </span>
                      </div>
                    ))}
                  </div>
                )
              ) : load.dispatcher_profile ? (
                <>
                  <p className="font-semibold text-slate-100 text-xs truncate">
                    {load.dispatcher_profile.full_name}
                  </p>
                  <p className="text-slate-400 text-[11px] capitalize mt-0.5">
                    {load.dispatcher_profile.role === 'owner_admin'
                      ? 'Admin'
                      : load.dispatcher_profile.role === 'dispatcher'
                      ? 'Dispatcher'
                      : 'Staff'}
                  </p>
                </>
              ) : (
                <>
                  <p className="font-semibold text-slate-400 text-xs">Unassigned</p>
                  <p className="text-slate-500 text-[11px] mt-0.5">No team member</p>
                </>
              )}
            </div>
            {((load.assigned_team && load.assigned_team[0]?.email) || load.dispatcher_profile?.email) && (
              <div className="pt-2 mt-2 border-t border-slate-800/60 text-slate-400 text-[10px] flex items-center gap-1 truncate">
                <Mail className="w-2.5 h-2.5 shrink-0" />
                <span className="truncate">
                  {load.assigned_team && load.assigned_team[0]?.email
                    ? load.assigned_team[0].email
                    : load.dispatcher_profile?.email}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Freight Specs Summary */}
        <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div>
            <span className="text-slate-400 text-[10px] uppercase font-semibold">Equipment Type</span>
            <p className="font-semibold text-slate-200 capitalize mt-0.5">
              {load.equipment_type.replace('_', ' ')}
            </p>
          </div>
          <div>
            <span className="text-slate-400 text-[10px] uppercase font-semibold">Commodity</span>
            <p className="font-semibold text-slate-200 mt-0.5 truncate" title={load.commodity || 'General Freight'}>
              {load.commodity || 'General Freight'}
            </p>
          </div>
          <div>
            <span className="text-slate-400 text-[10px] uppercase font-semibold">Gross Weight</span>
            <p className="font-semibold text-slate-200 font-mono mt-0.5">
              {load.weight_lbs ? `${load.weight_lbs.toLocaleString()} lbs` : '—'}
            </p>
          </div>
          <div>
            <span className="text-slate-400 text-[10px] uppercase font-semibold">Mileage Specs</span>
            <p className="font-semibold text-slate-200 font-mono mt-0.5">
              {formatMiles(totalMiles)} ({load.loaded_miles} loaded + {load.deadhead_miles} DH)
            </p>
          </div>
        </div>

        {/* Deterministic Profitability Engine Preview */}
        <div className="space-y-2">
          <div className="text-slate-400 font-bold uppercase tracking-wider text-[11px]">
            Financial & Profitability Breakdown
          </div>
          <LoadProfitabilityCard
            rate={load.rate}
            loadedMiles={load.loaded_miles}
            deadheadMiles={load.deadhead_miles}
            fuelExpense={load.fuel_expense}
            driverPay={load.driver_pay}
            otherExpenses={load.other_expenses}
          />
        </div>

        {/* Special Instructions / Notes */}
        {load.special_instructions && (
          <div className="bg-slate-950/70 p-3.5 rounded-xl border border-slate-800 space-y-1.5">
            <div className="flex items-center gap-1.5 text-slate-400 font-semibold text-[11px]">
              <FileText className="w-3.5 h-3.5 text-purple-400" />
              <span>Special Instructions & Broker Protocol</span>
            </div>
            <p className="text-slate-300 leading-relaxed text-xs whitespace-pre-wrap font-sans">
              {load.special_instructions}
            </p>
          </div>
        )}

        {/* LIVE DISPATCH PAPERWORK & AUDIT SECTION (PHASE 2D) */}
        <div className="bg-slate-950/80 p-4 rounded-xl border border-slate-800 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-800/80">
            <div className="flex items-center gap-2">
              <FileCheck className="w-4 h-4 text-sky-400" />
              <div>
                <span className="font-bold text-slate-200 uppercase tracking-wider text-[11px]">
                  Paperwork Checklist & Invoicing Readiness
                </span>
                <p className="text-[10px] text-slate-400 font-mono">
                  {docSummary?.isReadyToInvoice ? (
                    <span className="text-emerald-400 font-semibold flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Ready for Invoicing & Factoring
                    </span>
                  ) : docSummary?.isComplete ? (
                    <span className="text-sky-400">All current required paperwork on file</span>
                  ) : (
                    <span className="text-amber-400">
                      Missing {docSummary?.missingTypes.length || 0} required documents for {load.pipeline_status.toUpperCase()} stage
                    </span>
                  )}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap self-start sm:self-auto">
              <button
                type="button"
                onClick={handleOpenInvoiceGenerator}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition-all cursor-pointer text-xs shadow-xs"
                title="Generate and Review Broker Invoice"
              >
                <Receipt className="w-3.5 h-3.5" />
                <span>Generate Invoice</span>
              </button>

              <button
                type="button"
                onClick={handleOpenSettlementGenerator}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-950/80 hover:bg-indigo-900 text-indigo-300 border border-indigo-800/60 font-semibold transition-colors cursor-pointer text-xs"
                title="Generate Carrier Settlement Statement"
              >
                <DollarSign className="w-3.5 h-3.5 text-indigo-400" />
                <span>Settlement</span>
              </button>

              <button
                type="button"
                onClick={handleDownloadRateConPdf}
                disabled={generatingPdfType !== null}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700 font-semibold transition-colors cursor-pointer text-xs disabled:opacity-50"
                title="Download Rate Con PDF"
              >
                <Download className="w-3.5 h-3.5 text-indigo-400" />
                <span>Rate Con</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setSelectedUploadType('rate_confirmation');
                  setIsUploadModalOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700 font-semibold transition-colors cursor-pointer text-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Attach Paperwork</span>
              </button>
            </div>
          </div>

          {/* Checklist Items */}
          <div className="space-y-2">
            {docSummary?.checklist.map((item) => (
              <div
                key={item.doc_type}
                className={`p-3 rounded-lg border flex flex-col sm:flex-row sm:items-center justify-between gap-2 transition-colors ${
                  item.document
                    ? 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                    : item.isRequired
                    ? 'bg-rose-950/20 border-rose-900/40'
                    : 'bg-slate-950/40 border-slate-900 text-slate-500'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="shrink-0">
                    {item.document?.doc_status === 'verified' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : item.document ? (
                      <Clock className="w-4 h-4 text-sky-400" />
                    ) : item.isRequired ? (
                      <AlertTriangle className="w-4 h-4 text-rose-400" />
                    ) : (
                      <div className="w-4 h-4 rounded-full border border-slate-700" />
                    )}
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`font-semibold text-xs ${item.document ? 'text-slate-200' : item.isRequired ? 'text-rose-200' : 'text-slate-400'}`}>
                        {item.label}
                      </span>
                      {item.isRequired && (
                        <span className="text-[9px] uppercase px-1.5 py-0.2 rounded bg-rose-950 text-rose-300 border border-rose-800/60 font-mono">
                          Required
                        </span>
                      )}
                    </div>
                    {item.document ? (
                      <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                        {item.document.file_name} ({formatDocumentFileSize(item.document.file_size_bytes)})
                      </p>
                    ) : (
                      <p className="text-[10px] text-slate-500 font-sans mt-0.5">
                        {item.requirementReason}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-auto">
                  <StatusBadge status={item.status} type="document" size="sm" />

                  {item.document ? (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedDoc(item.document);
                        setIsDocDetailOpen(true);
                      }}
                      className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-semibold transition-colors cursor-pointer"
                    >
                      View & Audit
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedUploadType(item.doc_type);
                        setIsUploadModalOpen(true);
                      }}
                      className="px-2.5 py-1 rounded bg-indigo-950/80 hover:bg-indigo-900 text-indigo-300 border border-indigo-800/50 text-[11px] font-semibold transition-colors cursor-pointer"
                    >
                      Upload Now
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* DISPATCH TRACKING & CHECK CALLS SECTION */}
        <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/90 space-y-4">
          {/* Section Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2 flex-wrap">
              <Radio className="w-4 h-4 text-indigo-400" />
              <h4 className="font-bold text-slate-200 uppercase tracking-wider text-xs">
                Dispatch Tracking & Check Calls
              </h4>
              <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800/60 font-mono">
                {checkCalls.length} Logged
              </span>
              {trackingSummary?.isMissingRecentCheckIn && (
                <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800/60 font-mono font-semibold">
                  <Clock className="w-3 h-3 text-amber-400" />
                  Missing Recent Check-In (&gt;24h)
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                id="btn-analyze-tracking-risk"
                onClick={() => handleOpenCopilot('explain_load_risk')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-950/80 hover:bg-violet-900 text-violet-300 border border-violet-800/60 text-xs font-semibold shadow-xs transition-colors cursor-pointer self-start sm:self-auto"
                title="Analyze load transit delay, ETA variance & risk factors"
              >
                <Sparkles className="w-3.5 h-3.5 text-violet-400" />
                <span>Analyze Risk</span>
              </button>

              {canEditCheckCalls && (
                <button
                  type="button"
                  id="btn-add-checkcall-detail"
                  onClick={() => handleOpenQuickCheckCall('en_route_delivery')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer self-start sm:self-auto"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Check Call</span>
                </button>
              )}
            </div>
          </div>

          {/* Quick Action Dispatch Buttons for Active Operations */}
          {canEditCheckCalls && (
            <div className="bg-slate-950/70 p-3 rounded-lg border border-slate-800/80 space-y-2">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1">
                <Navigation className="w-3 h-3 text-indigo-400" />
                Quick Dispatch Updates
              </span>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => handleOpenQuickCheckCall('en_route_pickup', 'on_time')}
                  className="px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700 text-[11px] font-medium transition-colors cursor-pointer"
                >
                  En Route to PU
                </button>
                <button
                  type="button"
                  onClick={() => handleOpenQuickCheckCall('arrived_pickup', 'on_time')}
                  className="px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700 text-[11px] font-medium transition-colors cursor-pointer"
                >
                  At Pickup
                </button>
                <button
                  type="button"
                  onClick={() => handleOpenQuickCheckCall('loaded', 'on_time')}
                  className="px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 text-emerald-300 hover:text-white border border-emerald-900/60 text-[11px] font-medium transition-colors cursor-pointer"
                >
                  Loaded / Departed
                </button>
                <button
                  type="button"
                  onClick={() => handleOpenQuickCheckCall('en_route_delivery', 'on_time')}
                  className="px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700 text-[11px] font-medium transition-colors cursor-pointer"
                >
                  En Route DEL
                </button>
                <button
                  type="button"
                  onClick={() => handleOpenQuickCheckCall('arrived_delivery', 'on_time')}
                  className="px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700 text-[11px] font-medium transition-colors cursor-pointer"
                >
                  At Delivery
                </button>
                <button
                  type="button"
                  onClick={() => handleOpenQuickCheckCall('delivered', 'completed')}
                  className="px-2.5 py-1 rounded bg-indigo-950/80 hover:bg-indigo-900 text-indigo-300 hover:text-white border border-indigo-800/60 text-[11px] font-medium transition-colors cursor-pointer"
                >
                  Delivered / Empty
                </button>
                <button
                  type="button"
                  onClick={() => handleOpenQuickCheckCall('delay', 'delayed')}
                  className="px-2.5 py-1 rounded bg-amber-950/70 hover:bg-amber-900 text-amber-300 hover:text-white border border-amber-800/60 text-[11px] font-medium transition-colors cursor-pointer"
                >
                  Delay / Exception
                </button>
              </div>
            </div>
          )}

          {/* Operational Exception Warning if present */}
          {trackingSummary?.hasException && (
            <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-800/60 text-rose-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-rose-900/60 border border-rose-700/60 text-rose-300 shrink-0">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <h4 className="font-bold text-rose-300 text-xs">Active Operational Exception Flagged</h4>
                  <p className="text-[11px] text-rose-200/90 leading-relaxed">
                    Latest check call reported a schedule variance, transit delay, or equipment malfunction.
                    Review the dispatcher notes below for mitigation notes and updated delivery scheduling.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleOpenCopilot('explain_load_risk')}
                className="px-3 py-1.5 rounded-lg bg-rose-900/80 hover:bg-rose-800 text-rose-200 border border-rose-700/60 font-semibold text-xs transition-colors cursor-pointer shrink-0 flex items-center gap-1.5 self-start sm:self-auto shadow-xs"
              >
                <Sparkles className="w-3.5 h-3.5 text-rose-300" />
                <span>Explain & Mitigate Risk</span>
              </button>
            </div>
          )}

          {/* Tracking Summary Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-950/80 p-3.5 rounded-xl border border-slate-800 text-xs">
            {/* Current Location */}
            <div className="space-y-1">
              <span className="text-[10px] uppercase font-semibold text-slate-400">Current Location</span>
              <div className="flex items-center gap-1.5 text-slate-200 font-medium">
                <MapPin className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                <span className="truncate">
                  {trackingSummary?.currentLocation || 'No GPS Ping Yet'}
                </span>
              </div>
            </div>

            {/* Operational Status */}
            <div className="space-y-1">
              <span className="text-[10px] uppercase font-semibold text-slate-400">Tracking Status</span>
              <div>
                {trackingSummary?.currentStatus ? (
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold border ${
                      CHECK_CALL_STATUS_BADGES[trackingSummary.currentStatus]?.bg || 'bg-slate-800'
                    } ${
                      CHECK_CALL_STATUS_BADGES[trackingSummary.currentStatus]?.text || 'text-slate-300'
                    } ${
                      CHECK_CALL_STATUS_BADGES[trackingSummary.currentStatus]?.border || 'border-slate-700'
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        CHECK_CALL_STATUS_BADGES[trackingSummary.currentStatus]?.dot || 'bg-slate-400'
                      }`}
                    />
                    {CHECK_CALL_STATUS_BADGES[trackingSummary.currentStatus]?.label || trackingSummary.currentStatus}
                  </span>
                ) : (
                  <span className="text-slate-500 text-[11px]">Pending check-in</span>
                )}
              </div>
            </div>

            {/* Pickup ETA */}
            <div className="space-y-1">
              <span className="text-[10px] uppercase font-semibold text-slate-400">Pickup ETA</span>
              <div className="text-slate-300 font-mono text-[11px] truncate">
                {trackingSummary?.etaPickup
                  ? formatInTimezone(trackingSummary.etaPickup, operationalTimezone, {
                      includeDate: true,
                      includeTime: true,
                    })
                  : '—'}
              </div>
            </div>

            {/* Delivery ETA */}
            <div className="space-y-1">
              <span className="text-[10px] uppercase font-semibold text-slate-400">Delivery ETA</span>
              <div className="text-slate-300 font-mono text-[11px] truncate">
                {trackingSummary?.etaDelivery
                  ? formatInTimezone(trackingSummary.etaDelivery, operationalTimezone, {
                      includeDate: true,
                      includeTime: true,
                    })
                  : '—'}
              </div>
            </div>
          </div>

          {/* Tracking Feedback Banner */}
          {checkCallFeedback && (
            <div
              id="load-tracking-feedback-banner"
              className={`p-3 rounded-lg border flex items-center justify-between text-xs transition-all ${
                checkCallFeedback.type === 'success'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              }`}
            >
              <div className="flex items-center gap-2">
                {checkCallFeedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                )}
                <span>{checkCallFeedback.text}</span>
              </div>
              <button
                type="button"
                onClick={() => setCheckCallFeedback(null)}
                className="text-slate-400 hover:text-slate-200 cursor-pointer text-base leading-none"
              >
                &times;
              </button>
            </div>
          )}

          {/* Timeline Feed */}
          <div className="space-y-3 pt-2">
            <h5 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Chronological Dispatch Timeline
            </h5>
            <CheckCallTimeline
              checkCalls={checkCalls}
              canEdit={canEditCheckCalls}
              onEdit={handleEditCheckCall}
              onDelete={handleDeleteCheckCall}
            />
          </div>
        </div>

        {/* ACCESSORIALS & DETENTION LEDGER (PHASE 2D.3) */}
        <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/90 space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-800">
            <Timer className="w-4 h-4 text-amber-400" />
            <h4 className="font-bold text-slate-200 uppercase tracking-wider text-xs">
              Detention & Accessorial Management
            </h4>
          </div>

          <AccessorialTab load={load} />
        </div>

        {/* TASKS & OPERATIONAL REMINDERS (PHASE 2D.5) */}
        <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/90 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-800">
            <div className="flex items-center gap-2 flex-wrap">
              <CheckSquare className="w-4 h-4 text-sky-400" />
              <h4 className="font-bold text-slate-200 uppercase tracking-wider text-xs">
                Tasks & Operational Reminders
              </h4>
              <span className="text-[10px] px-2 py-0.5 rounded bg-sky-950 text-sky-300 border border-sky-800/60 font-mono">
                {loadTasks.length} Active / Total
              </span>
            </div>

            {canMutateTasks && (
              <button
                type="button"
                id="btn-set-followup-reminder-detail"
                onClick={() => handleOpenCreateReminder('general_operational')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-950/80 hover:bg-sky-900 text-sky-300 border border-sky-800/60 text-xs font-semibold shadow-xs transition-colors cursor-pointer self-start sm:self-auto"
              >
                <Bell className="w-3.5 h-3.5" />
                <span>Set Follow-up Reminder</span>
              </button>
            )}
          </div>

          {isLoadingTasks ? (
            <div className="py-4 text-center text-slate-500 text-xs">Loading load tasks...</div>
          ) : loadTasks.length === 0 ? (
            <div className="p-4 bg-slate-950/60 rounded-xl border border-slate-800/70 text-center space-y-1">
              <p className="text-slate-400 font-medium">No open tasks or reminders for this load.</p>
              <p className="text-[11px] text-slate-500">
                Use the button above to schedule check-in calls, document follow-ups, or detention warnings.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {loadTasks.map((task) => {
                const isOverdue = isTaskOverdue(task);
                const categoryConfig = TASK_CATEGORY_CONFIG[task.category] || TASK_CATEGORY_CONFIG.general_operational;
                const priorityConfig = TASK_PRIORITY_CONFIG[task.priority] || TASK_PRIORITY_CONFIG.normal;
                const effectiveDue = getEffectiveDueAt(task);

                return (
                  <div
                    key={task.id}
                    className={`p-3 rounded-lg border flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${
                      task.status === 'completed'
                        ? 'bg-slate-950/40 border-slate-900 opacity-60'
                        : isOverdue
                        ? 'bg-rose-950/30 border-rose-800/60'
                        : 'bg-slate-950/70 border-slate-800/80 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="mt-0.5 shrink-0">
                        {task.status === 'completed' ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        ) : isOverdue ? (
                          <AlertTriangle className="w-4 h-4 text-rose-400" />
                        ) : (
                          <Clock className="w-4 h-4 text-sky-400" />
                        )}
                      </div>

                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`font-semibold text-xs truncate ${
                              task.status === 'completed'
                                ? 'line-through text-slate-400'
                                : isOverdue
                                ? 'text-rose-200'
                                : 'text-slate-200'
                            }`}
                          >
                            {task.title}
                          </span>

                          {/* Category Badge */}
                          <span
                            className={`px-1.5 py-0.2 rounded text-[10px] font-semibold border ${categoryConfig.bgColor} ${categoryConfig.color} ${categoryConfig.borderColor}`}
                          >
                            {categoryConfig.shortLabel}
                          </span>

                          {/* Priority Badge */}
                          <span
                            className={`px-1.5 py-0.2 rounded text-[10px] font-semibold border ${priorityConfig.bgColor} ${priorityConfig.color} ${priorityConfig.borderColor}`}
                          >
                            {priorityConfig.label}
                          </span>

                          {task.status === 'snoozed' && (
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-amber-950 text-amber-300 border border-amber-800/60 font-mono">
                              Snoozed
                            </span>
                          )}
                        </div>

                        {task.description && (
                          <p className="text-[11px] text-slate-400 line-clamp-1">{task.description}</p>
                        )}

                        <div className="flex items-center gap-3 text-[10px] text-slate-400 font-mono flex-wrap">
                          <span>
                            Due:{' '}
                            <strong className={isOverdue ? 'text-rose-400' : 'text-slate-300'}>
                              {formatInTimezone(effectiveDue, operationalTimezone, {
                                includeDate: true,
                                includeTime: true,
                              })}
                            </strong>
                          </span>
                          {task.assigned_to_name && (
                            <span>Assignee: {task.assigned_to_name}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Task Actions */}
                    <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0">
                      {task.status !== 'completed' && canMutateTasks && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleQuickCompleteTask(task)}
                            className="px-2 py-1 rounded bg-emerald-950/70 hover:bg-emerald-900 text-emerald-300 border border-emerald-800/50 text-[11px] font-semibold transition-colors cursor-pointer flex items-center gap-1"
                            title="Mark task completed"
                          >
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Complete</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleQuickSnoozeTask(task, '30m')}
                            className="px-2 py-1 rounded bg-amber-950/70 hover:bg-amber-900 text-amber-300 border border-amber-800/50 text-[11px] font-semibold transition-colors cursor-pointer flex items-center gap-1"
                            title="Snooze +30m"
                          >
                            <Clock className="w-3 h-3" />
                            <span>+30m</span>
                          </button>
                        </>
                      )}

                      {canMutateTasks && (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedTaskToEdit(task);
                            setIsTaskModalOpen(true);
                          }}
                          className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-[11px] transition-colors cursor-pointer"
                          title="Edit Task"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* LOAD ACTIVITY TIMELINE & AUDIT LOG (PHASE 2D.1) */}
        <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/90 space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-800">
            <History className="w-4 h-4 text-indigo-400" />
            <h4 className="font-bold text-slate-200 uppercase tracking-wider text-xs">
              Load Activity Timeline & Dispatcher Audit Log
            </h4>
          </div>

          <ActivityTimeline
            loadId={load.id}
            organizationId={load.organization_id}
            showComposer={true}
          />
        </div>

        {/* Modal Close Button */}
        <div className="flex justify-end pt-4 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 text-xs font-semibold text-slate-300 hover:text-slate-100 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          >
            Close Details
          </button>
        </div>
      </div>

      {/* Sub-Modals for Paperwork & Check Calls */}
      <CheckCallModal
        isOpen={isCheckCallModalOpen}
        onClose={() => {
          setIsCheckCallModalOpen(false);
          setSelectedCheckCallForEdit(null);
          setQuickCallType(undefined);
          setQuickCallStatus(undefined);
        }}
        load={load}
        initialCheckCall={selectedCheckCallForEdit}
        initialCallType={quickCallType}
        initialStatus={quickCallStatus}
        onSubmit={handleSubmitCheckCall}
      />
      <DocumentUploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onUpload={handleUploadPaperwork}
        loads={[load]}
        initialLoadId={load.id}
        initialDocType={selectedUploadType}
      />

      <DocumentDetailModal
        isOpen={isDocDetailOpen}
        onClose={() => {
          setIsDocDetailOpen(false);
          setSelectedDoc(null);
        }}
        document={selectedDoc}
        onStatusChange={handleDocStatusChange}
        onDelete={handleDocDelete}
        userRole={userRole}
      />

      <ContextualCopilotModal
        isOpen={isCopilotOpen}
        onClose={() => setIsCopilotOpen(false)}
        load={load}
        loadId={load.id}
        initialAction={copilotAction}
      />

      <TaskModal
        isOpen={isTaskModalOpen}
        onClose={() => {
          setIsTaskModalOpen(false);
          setSelectedTaskToEdit(null);
        }}
        taskToEdit={selectedTaskToEdit}
        preselectedLoadId={load.id}
        initialCategory={initialTaskCategory}
        initialTitle={initialTaskTitle}
        initialPriority={initialTaskPriority}
        initialDueAt={initialTaskDueAt}
        triggerSource="manual"
        referenceEntityId={load.id}
        onSuccess={async () => {
          setIsTaskModalOpen(false);
          setSelectedTaskToEdit(null);
          await fetchTasks();
        }}
      />

      <InvoiceSettlementModal
        isOpen={isBillingModalOpen}
        onClose={() => setIsBillingModalOpen(false)}
        load={load}
        initialType={billingModalType}
        onStatusChange={onStatusChange}
      />

      {/* Check Call Delete Confirmation Modal */}
      {checkCallToDelete && (
        <Modal
          id="delete-load-check-call-modal"
          isOpen={Boolean(checkCallToDelete)}
          onClose={() => {
            if (!isDeletingCheckCall) setCheckCallToDelete(null);
          }}
          title="Delete Check Call Record"
          subtitle={`Are you sure you want to remove this milestone from Load #${load.load_number}?`}
          maxWidth="md"
        >
          <div className="p-6 space-y-4">
            <div className="flex items-start gap-3 p-3.5 rounded-xl bg-rose-950/40 border border-rose-800/60 text-xs text-rose-200 leading-relaxed">
              <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <strong className="text-rose-100 font-semibold block mb-0.5">
                  Confirm Permanent Deletion
                </strong>
                Deleting this check call permanently removes the milestone and timestamp from this load's dispatch timeline.
              </div>
            </div>

            {/* Check Call Details Summary */}
            <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Load Reference:</span>
                <span className="font-semibold text-indigo-300">
                  #{load.load_number}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Milestone Type:</span>
                <span className="font-semibold text-slate-100">
                  {CHECK_CALL_TYPE_LABELS[checkCallToDelete.call_type] || checkCallToDelete.call_type}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Tracking Status:</span>
                <span className="font-medium text-slate-200">
                  {CHECK_CALL_STATUS_LABELS[checkCallToDelete.status] || checkCallToDelete.status}
                </span>
              </div>
              {(checkCallToDelete.location_city || checkCallToDelete.location_state) && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Location:</span>
                  <span className="text-slate-200">
                    {[checkCallToDelete.location_city, checkCallToDelete.location_state].filter(Boolean).join(', ')}
                  </span>
                </div>
              )}
              {checkCallToDelete.created_at && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Recorded At:</span>
                  <span className="text-slate-300 font-mono">
                    {formatInTimezone(checkCallToDelete.created_at, operationalTimezone)}
                  </span>
                </div>
              )}
              {checkCallToDelete.notes && (
                <div className="pt-2 border-t border-slate-800/80 text-[11px] text-slate-400">
                  <span className="font-medium text-slate-300">Notes: </span>
                  {checkCallToDelete.notes}
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setCheckCallToDelete(null)}
                disabled={isDeletingCheckCall}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                id="btn-confirm-delete-load-check-call"
                type="button"
                onClick={handleConfirmDeleteCheckCall}
                disabled={isDeletingCheckCall}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-lg shadow-rose-900/30 flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
              >
                {isDeletingCheckCall ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Check Call</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* AI Detention Audit & Human Review Workspace (Phase 3A) */}
      <DetentionAuditModal
        isOpen={isDetentionAuditOpen}
        onClose={() => setIsDetentionAuditOpen(false)}
        load={load}
        onAuditUpdated={handleDetentionAuditUpdated}
      />
    </Modal>
  );
};
