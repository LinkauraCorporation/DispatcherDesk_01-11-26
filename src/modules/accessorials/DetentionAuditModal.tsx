import React, { useState, useEffect, useCallback } from 'react';
import { LoadWithRelations } from '../loads/loadTypes.ts';
import { LoadDetentionAudit } from '../../types/domain.types.ts';
import {
  AuditStatus,
  HumanReviewStatus,
  AuditEvidenceItem,
  AuditDiscrepancy,
} from './detentionAuditTypes.ts';
import { detentionAuditService } from './detentionAuditService.ts';
import { Modal } from '../../components/common/Modal.tsx';
import { useAuth } from '../../contexts/AuthContext.tsx';
import { useTimezone } from '../../contexts/TimezoneContext.tsx';
import { formatCurrency } from '../../lib/calculations.ts';
import { formatInTimezone } from '../../lib/timezones.ts';
import {
  ShieldCheck,
  Timer,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Sparkles,
  RefreshCw,
  FileText,
  Clock,
  ArrowRight,
  UserCheck,
  AlertOctagon,
  FileCheck,
  FileQuestion,
  Lock,
  History,
  Info,
  DollarSign,
  ChevronRight,
  Calendar,
  MessageSquare,
  Radio,
  FileSpreadsheet,
} from 'lucide-react';

export interface DetentionAuditModalProps {
  isOpen: boolean;
  onClose: () => void;
  load: LoadWithRelations | null;
  onAuditUpdated?: (audit: LoadDetentionAudit) => void;
}

export const DetentionAuditModal: React.FC<DetentionAuditModalProps> = ({
  isOpen,
  onClose,
  load,
  onAuditUpdated,
}) => {
  const { activeOrganization, userRole, profile, user } = useAuth();
  const { operationalTimezone } = useTimezone();

  const orgId = activeOrganization?.id || load?.organization_id || '';
  const currentUserId = user?.id || (typeof localStorage !== 'undefined' ? localStorage.getItem('dispatchdesk_current_user_id') : null);
  const currentUserName = profile?.full_name || user?.email?.split('@')[0] || 'Dispatcher';

  // Authorization check matching LoadDetailModal & server-side access control
  const isAuthorized = React.useMemo(() => {
    if (!load) return false;
    if (userRole === 'owner_admin' || userRole === null) return true;
    if (userRole === 'dispatcher' || userRole === 'staff') {
      if (!currentUserId) return false;
      const isDirectlyAssigned = load.assigned_dispatcher_id === currentUserId;
      const isInTeam = load.assigned_team?.some((m) => m.user_id === currentUserId);
      const isInAssignments = load.assigned_team_assignments?.some((a) => a.user_id === currentUserId);
      return isDirectlyAssigned || Boolean(isInTeam) || Boolean(isInAssignments);
    }
    return false;
  }, [load, userRole, currentUserId]);

  const canReview = userRole === 'owner_admin' || userRole === 'dispatcher' || userRole === null;

  // Audit state
  const [audits, setAudits] = useState<LoadDetentionAudit[]>([]);
  const [selectedAuditId, setSelectedAuditId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRunningAudit, setIsRunningAudit] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Human review form state
  const [reviewAction, setReviewAction] = useState<'accept' | 'override' | 'reject' | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [reviewFormError, setReviewFormError] = useState<string | null>(null);

  const fetchAudits = useCallback(async () => {
    if (!orgId || !load?.id) return;
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const records = await detentionAuditService.getAuditsByLoad(orgId, load.id);
      setAudits(records);
      if (records.length > 0) {
        setSelectedAuditId((prev) => (prev && records.some((r) => r.id === prev) ? prev : records[0].id));
      } else {
        setSelectedAuditId(null);
      }
    } catch (err: any) {
      console.error('[DetentionAuditModal] Error fetching audits:', err);
      setErrorMessage(err?.message || 'Failed to load detention audits.');
    } finally {
      setIsLoading(false);
    }
  }, [orgId, load?.id]);

  useEffect(() => {
    if (isOpen && load) {
      fetchAudits();
      setReviewAction(null);
      setReviewNotes('');
      setReviewFormError(null);
    }
  }, [isOpen, load, fetchAudits]);

  // Selected audit record and latest audit
  const latestAudit = audits.length > 0 ? audits[0] : null;
  const currentAudit = audits.find((a) => a.id === selectedAuditId) || latestAudit;
  const isViewingHistorical = Boolean(latestAudit && currentAudit && currentAudit.id !== latestAudit.id);

  // Trigger Run AI Audit
  const handleRunAiAudit = async () => {
    if (!orgId || !load?.id || isRunningAudit) return;
    setIsRunningAudit(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const response = await detentionAuditService.runAiAuditViaEndpoint(orgId, load.id, {
        facilityScope: 'all',
      });

      if (!response.success) {
        setErrorMessage(response.error || 'Failed to execute detention audit.');
      } else if (response.audit) {
        setSuccessMessage(
          `Detention audit v${response.audit.audit_version} generated successfully (${
            response.executionMode === 'gemini_reconciled' ? 'AI Reconciled' : 'Deterministic Engine'
          }).`
        );
        setTimeout(() => setSuccessMessage(null), 5000);
        await fetchAudits();
        setSelectedAuditId(response.audit.id);
        onAuditUpdated?.(response.audit);
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Unexpected error running detention audit.');
    } finally {
      setIsRunningAudit(false);
    }
  };

  // Submit human review (Accept / Override / Reject)
  const handleSubmitReview = async () => {
    if (!orgId || !currentAudit || !reviewAction || isSubmittingReview) return;

    if ((reviewAction === 'override' || reviewAction === 'reject') && !reviewNotes.trim()) {
      setReviewFormError(`Justification notes are required when ${reviewAction === 'override' ? 'overriding' : 'rejecting'} an audit.`);
      return;
    }

    setIsSubmittingReview(true);
    setReviewFormError(null);

    try {
      const statusMap: Record<'accept' | 'override' | 'reject', HumanReviewStatus> = {
        accept: 'accepted',
        override: 'overridden',
        reject: 'rejected',
      };

      const updated = await detentionAuditService.updateHumanReview(orgId, currentAudit.id, {
        status: statusMap[reviewAction],
        notes: reviewNotes.trim() || undefined,
        reviewedBy: currentUserId,
        reviewerName: currentUserName,
      });

      setSuccessMessage(`Audit human review updated to "${statusMap[reviewAction]}".`);
      setTimeout(() => setSuccessMessage(null), 5000);
      setReviewAction(null);
      setReviewNotes('');

      // Refresh records
      await fetchAudits();
      onAuditUpdated?.(updated);
    } catch (err: any) {
      setReviewFormError(err?.message || 'Failed to submit human review.');
    } finally {
      setIsSubmittingReview(false);
    }
  };

  if (!isOpen) return null;

  // Access denial screen if unauthorized
  if (!isAuthorized || !load) {
    return (
      <Modal
        id="detention-audit-unauthorized-modal"
        isOpen={isOpen}
        onClose={onClose}
        title="Detention Audit Access Restricted"
        maxWidth="lg"
      >
        <div className="text-center py-8 px-4 space-y-4">
          <div className="w-12 h-12 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 mx-auto flex items-center justify-center">
            <Lock className="w-6 h-6" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-slate-100">Unauthorized Load Access</h4>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
              You do not have permission to view or execute detention audits for Load #{load?.load_number || 'N/A'}. Only assigned dispatchers or organization administrators can access load detention records.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
          >
            Close Window
          </button>
        </div>
      </Modal>
    );
  }

  // Formatting helpers
  const formatTime = (iso: string | null | undefined): string => {
    if (!iso) return 'Not available';
    return formatInTimezone(iso, operationalTimezone, {
      includeDate: true,
      includeTime: true,
      includeTimezoneCode: true,
    });
  };

  const getStatusBadge = (status: AuditStatus | string) => {
    switch (status) {
      case 'eligible':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Eligible for Detention</span>
          </span>
        );
      case 'not_eligible':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-slate-800 text-slate-300 border border-slate-700">
            <XCircle className="w-3.5 h-3.5 text-slate-400" />
            <span>Not Eligible</span>
          </span>
        );
      case 'needs_review':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Needs Review</span>
          </span>
        );
    }
  };

  const getHumanReviewBadge = (status: HumanReviewStatus | string) => {
    switch (status) {
      case 'accepted':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
            <CheckCircle2 className="w-3 h-3" />
            <span>Accepted</span>
          </span>
        );
      case 'overridden':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-sky-500/10 text-sky-300 border border-sky-500/20">
            <UserCheck className="w-3 h-3" />
            <span>Overridden</span>
          </span>
        );
      case 'rejected':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-rose-500/10 text-rose-300 border border-rose-500/20">
            <XCircle className="w-3 h-3" />
            <span>Rejected</span>
          </span>
        );
      case 'pending':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-amber-500/10 text-amber-300 border border-amber-500/20">
            <Clock className="w-3 h-3" />
            <span>Pending Review</span>
          </span>
        );
    }
  };

  const getPunctualityLabel = (
    arrival: string | null,
    appt: string | null,
    status: string
  ): { label: string; color: string } => {
    if (!arrival || !appt) return { label: 'Punctuality Unknown', color: 'text-slate-400' };
    const arrTime = new Date(arrival).getTime();
    const apptTime = new Date(appt).getTime();
    const diffMins = Math.round((arrTime - apptTime) / (60 * 1000));

    if (diffMins <= 0 && diffMins >= -15) {
      return { label: 'On Time', color: 'text-emerald-400' };
    }
    if (diffMins < -15) {
      return { label: `Early Arrival (${Math.abs(diffMins)}m ahead)`, color: 'text-sky-400' };
    }
    return { label: `Late Arrival (${diffMins}m delayed)`, color: 'text-rose-400' };
  };

  // Evidence Parsing
  const evidenceList: AuditEvidenceItem[] = Array.isArray(currentAudit?.evidence)
    ? (currentAudit?.evidence as any)
    : [];
  const discrepanciesList: AuditDiscrepancy[] = Array.isArray(currentAudit?.discrepancies)
    ? (currentAudit?.discrepancies as any)
    : [];
  const missingEvidenceList: string[] = Array.isArray(currentAudit?.missing_evidence)
    ? (currentAudit?.missing_evidence as any)
    : [];

  // Group evidence by category
  const evidenceBySource = {
    rate_con: evidenceList.filter((e) => e.sourceType === 'rate_con'),
    milestones: evidenceList.filter((e) => e.sourceType === 'load_milestone'),
    check_calls: evidenceList.filter((e) => e.sourceType === 'check_call'),
    documents: evidenceList.filter((e) => e.sourceType === 'bol_pod'),
    notes: evidenceList.filter((e) => e.sourceType === 'activity_note'),
    driver: evidenceList.filter((e) => e.sourceType === 'driver_message'),
  };

  const brokerName = load.broker?.company_name || (load as any).broker_name || load.client?.company_name || 'Not available';

  return (
    <Modal
      id="detention-audit-workspace-modal"
      isOpen={isOpen}
      onClose={onClose}
      title={`AI Detention Audit & Verification Workspace`}
      subtitle={`Load #${load.load_number} · ${load.origin_city}, ${load.origin_state} → ${load.dest_city}, ${load.dest_state}`}
      maxWidth="near-full"
    >
      <div className="space-y-6">
        {/* TOP ALERT / FEEDBACK BANNERS */}
        {errorMessage && (
          <div
            id="detention-audit-error-banner"
            className="p-3.5 rounded-lg bg-rose-500/10 border border-rose-500/30 flex items-start justify-between gap-3 text-xs text-rose-300"
          >
            <div className="flex items-center gap-2">
              <AlertOctagon className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{errorMessage}</span>
            </div>
            <button
              type="button"
              onClick={() => setErrorMessage(null)}
              className="text-slate-400 hover:text-slate-200 cursor-pointer text-base leading-none"
            >
              &times;
            </button>
          </div>
        )}

        {successMessage && (
          <div
            id="detention-audit-success-banner"
            className="p-3.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-start justify-between gap-3 text-xs text-emerald-300"
          >
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{successMessage}</span>
            </div>
            <button
              type="button"
              onClick={() => setSuccessMessage(null)}
              className="text-slate-400 hover:text-slate-200 cursor-pointer text-base leading-none"
            >
              &times;
            </button>
          </div>
        )}

        {/* HISTORICAL VERSION NOTICE BANNER */}
        {isViewingHistorical && currentAudit && latestAudit && (
          <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center justify-between gap-4 text-xs">
            <div className="flex items-center gap-2 text-amber-300">
              <History className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                Viewing historical audit record <strong>v{currentAudit.audit_version}</strong> (Read-Only). Latest active version is <strong>v{latestAudit.audit_version}</strong>.
              </span>
            </div>
            <button
              type="button"
              onClick={() => setSelectedAuditId(latestAudit.id)}
              className="px-2.5 py-1 text-xs font-semibold text-amber-900 bg-amber-300 hover:bg-amber-200 rounded-md transition-colors cursor-pointer shrink-0"
            >
              Return to Latest (v{latestAudit.audit_version})
            </button>
          </div>
        )}

        {/* WORKSPACE TOP HEADER METRIC STRIP */}
        <div className="p-4 bg-slate-900/90 rounded-xl border border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-bold text-slate-100 font-mono">Load #{load.load_number}</span>
              <span className="text-slate-600">·</span>
              <span className="text-xs text-slate-300">Broker: {brokerName}</span>
              <span className="text-slate-600">·</span>
              {currentAudit && (
                <>
                  <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                    Version v{currentAudit.audit_version}
                  </span>
                  <span className="text-xs text-slate-400">
                    Confidence: <strong className="font-mono text-slate-200">{(currentAudit.overall_confidence * 100).toFixed(0)}%</strong>
                  </span>
                </>
              )}
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-400 flex-wrap">
              <span>{load.origin_city}, {load.origin_state}</span>
              <ArrowRight className="w-3 h-3 text-slate-500" />
              <span>{load.dest_city}, {load.dest_state}</span>
              {currentAudit && (
                <>
                  <span className="text-slate-600">·</span>
                  <span>Last Audited: {formatTime(currentAudit.created_at)}</span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {currentAudit && (
              <div className="flex items-center gap-2">
                {getStatusBadge(currentAudit.audit_status)}
                {getHumanReviewBadge(currentAudit.human_review_status)}
              </div>
            )}

            <button
              id="btn-run-detention-audit"
              type="button"
              disabled={isRunningAudit}
              onClick={handleRunAiAudit}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors shadow-xs cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <Sparkles className={`w-3.5 h-3.5 ${isRunningAudit ? 'animate-spin' : 'text-indigo-200'}`} />
              <span>{isRunningAudit ? 'Reconciling Evidence...' : currentAudit ? 'Re-Run AI Audit' : 'Run AI Audit'}</span>
            </button>
          </div>
        </div>

        {/* LOADING STATE */}
        {isLoading && (
          <div className="p-12 text-center text-slate-400 space-y-3">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto text-indigo-400" />
            <p className="text-xs">Loading detention evidence ledger and audit records...</p>
          </div>
        )}

        {/* EMPTY STATE: NO AUDIT RUN YET */}
        {!isLoading && !currentAudit && (
          <div className="p-8 text-center rounded-xl border border-dashed border-slate-800 bg-slate-900/50 space-y-4">
            <div className="w-12 h-12 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 mx-auto flex items-center justify-center">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div className="max-w-md mx-auto space-y-1">
              <h4 className="text-sm font-bold text-slate-200">No Detention Audit Generated Yet</h4>
              <p className="text-xs text-slate-400">
                Run an audit to gather deterministic milestones, check-calls, documents, and rate confirmation terms for Load #{load.load_number}. The audit engine will calculate billable hours and reconcile discrepancies.
              </p>
            </div>
            <button
              type="button"
              id="btn-empty-run-ai-audit"
              disabled={isRunningAudit}
              onClick={handleRunAiAudit}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors cursor-pointer disabled:opacity-60"
            >
              <Sparkles className={`w-3.5 h-3.5 ${isRunningAudit ? 'animate-spin' : ''}`} />
              <span>{isRunningAudit ? 'Executing Engine...' : 'Run First Detention Audit'}</span>
            </button>
          </div>
        )}

        {/* POPULATED AUDIT VIEW */}
        {!isLoading && currentAudit && (
          <div className="space-y-6">
            {/* 1. FINANCIAL SUMMARY KPI STRIP */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                  Total Verified Amount
                </span>
                <span className="text-xl font-bold font-mono text-emerald-400 tabular-nums block">
                  {formatCurrency(currentAudit.total_verified_amount)}
                </span>
                <span className="text-[10px] text-slate-500">
                  Authoritative deterministic total
                </span>
              </div>

              <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                  Total Billable Hours
                </span>
                <span className="text-xl font-bold font-mono text-slate-100 tabular-nums block">
                  {currentAudit.total_verified_hours.toFixed(2)} hrs
                </span>
                <span className="text-[10px] text-slate-500">
                  15-min billing increments
                </span>
              </div>

              <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                  Pickup Claim
                </span>
                <span className="text-base font-bold font-mono text-slate-200 tabular-nums block">
                  {formatCurrency(currentAudit.pickup_verified_amount)}
                </span>
                <span className="text-[10px] text-slate-500 font-mono">
                  {currentAudit.pickup_billable_hours.toFixed(2)} hrs @ ${currentAudit.pickup_hourly_rate.toFixed(2)}/hr
                </span>
              </div>

              <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                  Delivery Claim
                </span>
                <span className="text-base font-bold font-mono text-slate-200 tabular-nums block">
                  {formatCurrency(currentAudit.delivery_verified_amount)}
                </span>
                <span className="text-[10px] text-slate-500 font-mono">
                  {currentAudit.delivery_billable_hours.toFixed(2)} hrs @ ${currentAudit.delivery_hourly_rate.toFixed(2)}/hr
                </span>
              </div>
            </div>

            {/* 2. DUAL FACILITY SUB-LEDGERS: PICKUP & DELIVERY CARDS */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* PICKUP DETENTION CARD */}
              <div className="p-5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                    <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                      Pickup Facility Detention
                    </h4>
                  </div>
                  <div className="flex items-center gap-2">
                    {getStatusBadge(currentAudit.pickup_status)}
                  </div>
                </div>

                {/* Punctuality Indicator */}
                <div className="flex items-center justify-between text-xs py-1.5 px-3 rounded-lg bg-slate-950/60 border border-slate-800/80">
                  <span className="text-slate-400">Arrival Punctuality:</span>
                  <span className={`font-semibold ${getPunctualityLabel(currentAudit.pickup_arrival_time, currentAudit.pickup_appointment_time, currentAudit.pickup_status).color}`}>
                    {getPunctualityLabel(currentAudit.pickup_arrival_time, currentAudit.pickup_appointment_time, currentAudit.pickup_status).label}
                  </span>
                </div>

                {/* Timestamp & Financial Grid */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-xs">
                  <div>
                    <span className="text-[11px] text-slate-400 block">Appointment</span>
                    <span className="font-mono text-slate-200 text-[11px]">{formatTime(currentAudit.pickup_appointment_time)}</span>
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-400 block">Arrival Time</span>
                    <span className="font-mono text-slate-200 text-[11px]">{formatTime(currentAudit.pickup_arrival_time)}</span>
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-400 block">Loading Start</span>
                    <span className="font-mono text-slate-200 text-[11px]">{formatTime(load.pickup_loading_start_time || null)}</span>
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-400 block">Loading Complete</span>
                    <span className="font-mono text-slate-200 text-[11px]">{formatTime(load.pickup_loading_complete_time || null)}</span>
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-400 block">Departure Time</span>
                    <span className="font-mono text-slate-200 text-[11px]">{formatTime(currentAudit.pickup_departure_time)}</span>
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-400 block">Detention Window</span>
                    <span className="font-mono text-slate-200 text-[11px]">
                      {currentAudit.pickup_detention_start ? `${formatTime(currentAudit.pickup_detention_start)} → ${formatTime(currentAudit.pickup_detention_end)}` : 'Not applicable'}
                    </span>
                  </div>
                  <div className="pt-2 border-t border-slate-800/80">
                    <span className="text-[11px] text-slate-400 block">Free Time</span>
                    <span className="font-mono text-slate-200">{currentAudit.pickup_free_time_hours.toFixed(2)} hrs</span>
                  </div>
                  <div className="pt-2 border-t border-slate-800/80">
                    <span className="text-[11px] text-slate-400 block">Hourly Rate</span>
                    <span className="font-mono text-slate-200">${currentAudit.pickup_hourly_rate.toFixed(2)}/hr</span>
                  </div>
                  <div className="pt-1">
                    <span className="text-[11px] text-slate-400 block">Billable Hours</span>
                    <span className="font-mono font-bold text-slate-100">{currentAudit.pickup_billable_hours.toFixed(2)} hrs</span>
                  </div>
                  <div className="pt-1">
                    <span className="text-[11px] text-slate-400 block">Verified Amount</span>
                    <span className="font-mono font-bold text-emerald-400">{formatCurrency(currentAudit.pickup_verified_amount)}</span>
                  </div>
                </div>
              </div>

              {/* DELIVERY DETENTION CARD */}
              <div className="p-5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-indigo-400" />
                    <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                      Delivery Facility Detention
                    </h4>
                  </div>
                  <div className="flex items-center gap-2">
                    {getStatusBadge(currentAudit.delivery_status)}
                  </div>
                </div>

                {/* Punctuality Indicator */}
                <div className="flex items-center justify-between text-xs py-1.5 px-3 rounded-lg bg-slate-950/60 border border-slate-800/80">
                  <span className="text-slate-400">Arrival Punctuality:</span>
                  <span className={`font-semibold ${getPunctualityLabel(currentAudit.delivery_arrival_time, currentAudit.delivery_appointment_time, currentAudit.delivery_status).color}`}>
                    {getPunctualityLabel(currentAudit.delivery_arrival_time, currentAudit.delivery_appointment_time, currentAudit.delivery_status).label}
                  </span>
                </div>

                {/* Timestamp & Financial Grid */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-xs">
                  <div>
                    <span className="text-[11px] text-slate-400 block">Appointment</span>
                    <span className="font-mono text-slate-200 text-[11px]">{formatTime(currentAudit.delivery_appointment_time)}</span>
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-400 block">Arrival Time</span>
                    <span className="font-mono text-slate-200 text-[11px]">{formatTime(currentAudit.delivery_arrival_time)}</span>
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-400 block">Unloading Start</span>
                    <span className="font-mono text-slate-200 text-[11px]">{formatTime(load.delivery_unloading_start_time || null)}</span>
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-400 block">Unloading Complete</span>
                    <span className="font-mono text-slate-200 text-[11px]">{formatTime(load.delivery_unloading_complete_time || null)}</span>
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-400 block">Departure Time</span>
                    <span className="font-mono text-slate-200 text-[11px]">{formatTime(currentAudit.delivery_departure_time)}</span>
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-400 block">Detention Window</span>
                    <span className="font-mono text-slate-200 text-[11px]">
                      {currentAudit.delivery_detention_start ? `${formatTime(currentAudit.delivery_detention_start)} → ${formatTime(currentAudit.delivery_detention_end)}` : 'Not applicable'}
                    </span>
                  </div>
                  <div className="pt-2 border-t border-slate-800/80">
                    <span className="text-[11px] text-slate-400 block">Free Time</span>
                    <span className="font-mono text-slate-200">{currentAudit.delivery_free_time_hours.toFixed(2)} hrs</span>
                  </div>
                  <div className="pt-2 border-t border-slate-800/80">
                    <span className="text-[11px] text-slate-400 block">Hourly Rate</span>
                    <span className="font-mono text-slate-200">${currentAudit.delivery_hourly_rate.toFixed(2)}/hr</span>
                  </div>
                  <div className="pt-1">
                    <span className="text-[11px] text-slate-400 block">Billable Hours</span>
                    <span className="font-mono font-bold text-slate-100">{currentAudit.delivery_billable_hours.toFixed(2)} hrs</span>
                  </div>
                  <div className="pt-1">
                    <span className="text-[11px] text-slate-400 block">Verified Amount</span>
                    <span className="font-mono font-bold text-emerald-400">{formatCurrency(currentAudit.delivery_verified_amount)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 3. AI REASONING & EVIDENCE INTERPRETATION PANEL */}
            <div className="p-5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-violet-400" />
                  <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                    AI Evidence Reconciliation & Reasoning
                  </h4>
                </div>
                <div className="text-[11px] text-slate-400">
                  Interpretation Confidence: <span className="font-mono text-slate-200 font-bold">{(currentAudit.overall_confidence * 100).toFixed(0)}%</span>
                </div>
              </div>

              {/* Authoritative boundary banner */}
              <div className="p-3 rounded-lg bg-slate-950/80 border border-slate-800 text-[11px] text-slate-400 flex items-start gap-2.5">
                <Info className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                <p>
                  <strong className="text-slate-200">System Authority Protocol:</strong> Deterministic calculations for timestamps, free time, and billable amounts are strictly authoritative and cannot be overridden by AI interpretation. AI is used solely for multi-source evidence grounding and discrepancy analysis.
                </p>
              </div>

              {/* AI Reasoning Summary */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                  Reconciliation Summary
                </span>
                <p className="text-xs text-slate-200 leading-relaxed bg-slate-950/60 p-3 rounded-lg border border-slate-800/80">
                  {currentAudit.reasoning_summary || 'No AI reasoning summary generated.'}
                </p>
              </div>
            </div>

            {/* 4. DISCREPANCIES & MISSING EVIDENCE */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* DISCREPANCIES */}
              <div className="p-5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                    <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                      Audit Discrepancies ({discrepanciesList.length})
                    </h4>
                  </div>
                </div>

                {discrepanciesList.length === 0 ? (
                  <div className="py-6 text-center text-xs text-slate-400">
                    <CheckCircle2 className="w-6 h-6 text-emerald-400/60 mx-auto mb-1.5" />
                    <span>No operational discrepancies detected across evidence sources.</span>
                  </div>
                ) : (
                  <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                    {discrepanciesList.map((disc, idx) => (
                      <div
                        key={idx}
                        className={`p-3 rounded-lg border text-xs space-y-1.5 ${
                          disc.severity === 'blocker'
                            ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                            : disc.severity === 'warning'
                            ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                            : 'bg-sky-500/10 border-sky-500/30 text-sky-300'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-bold text-[11px]">{disc.code}</span>
                          <span className="uppercase text-[10px] font-semibold tracking-wider">
                            {disc.severity}
                          </span>
                        </div>
                        <p className="text-slate-200 text-xs">{disc.description}</p>
                        {disc.recommendedAction && (
                          <p className="text-[11px] text-slate-400 italic">
                            Action: {disc.recommendedAction}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* MISSING EVIDENCE */}
              <div className="p-5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <FileQuestion className="w-4 h-4 text-sky-400" />
                    <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                      Missing Supporting Evidence ({missingEvidenceList.length})
                    </h4>
                  </div>
                </div>

                {missingEvidenceList.length === 0 ? (
                  <div className="py-6 text-center text-xs text-slate-400">
                    <CheckCircle2 className="w-6 h-6 text-emerald-400/60 mx-auto mb-1.5" />
                    <span>All required documents and operational milestones are present.</span>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                    {missingEvidenceList.map((item, idx) => (
                      <div
                        key={idx}
                        className="p-3 rounded-lg bg-slate-950/60 border border-slate-800 text-xs flex items-center gap-2 text-slate-300"
                      >
                        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* 5. EVIDENCE PANEL (GROUPED BY SOURCE) */}
            <div className="p-5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-indigo-400" />
                  <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                    Evidence Ledger & Multi-Source Ground Truth ({evidenceList.length})
                  </h4>
                </div>
              </div>

              {evidenceList.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-400">
                  No evidence records gathered for this load.
                </div>
              ) : (
                <div className="space-y-4 max-h-96 overflow-y-auto pr-1">
                  {/* Rate Confirmation Terms */}
                  {evidenceBySource.rate_con.length > 0 && (
                    <div className="space-y-1.5">
                      <span className="text-[11px] font-semibold text-slate-400 flex items-center gap-1.5">
                        <FileSpreadsheet className="w-3.5 h-3.5 text-amber-400" />
                        <span>Rate Confirmation Terms</span>
                      </span>
                      <div className="space-y-1.5">
                        {evidenceBySource.rate_con.map((ev) => (
                          <div key={ev.id} className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800 text-xs flex items-center justify-between gap-3">
                            <div>
                              <span className="font-semibold text-slate-200">{ev.sourceReference}: </span>
                              <span className="text-slate-300">{ev.extractedFact}</span>
                            </div>
                            <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded shrink-0">
                              Supports Claim
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Operational Milestones */}
                  {evidenceBySource.milestones.length > 0 && (
                    <div className="space-y-1.5">
                      <span className="text-[11px] font-semibold text-slate-400 flex items-center gap-1.5">
                        <Timer className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Operational Milestone Timestamps</span>
                      </span>
                      <div className="space-y-1.5">
                        {evidenceBySource.milestones.map((ev) => (
                          <div key={ev.id} className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800 text-xs flex items-center justify-between gap-3">
                            <div>
                              <span className="font-semibold text-slate-200">{ev.sourceReference}: </span>
                              <span className="text-slate-300">{ev.extractedFact}</span>
                            </div>
                            <span className="text-[10px] font-mono text-slate-400">{formatTime(ev.timestamp)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Check Calls */}
                  {evidenceBySource.check_calls.length > 0 && (
                    <div className="space-y-1.5">
                      <span className="text-[11px] font-semibold text-slate-400 flex items-center gap-1.5">
                        <Radio className="w-3.5 h-3.5 text-sky-400" />
                        <span>Driver Check Calls</span>
                      </span>
                      <div className="space-y-1.5">
                        {evidenceBySource.check_calls.map((ev) => (
                          <div key={ev.id} className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800 text-xs flex items-center justify-between gap-3">
                            <div>
                              <span className="font-semibold text-slate-200">{ev.sourceReference}: </span>
                              <span className="text-slate-300">{ev.extractedFact}</span>
                            </div>
                            <span className="text-[10px] font-mono text-slate-400">{formatTime(ev.timestamp)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Documents & BOL / POD */}
                  {evidenceBySource.documents.length > 0 && (
                    <div className="space-y-1.5">
                      <span className="text-[11px] font-semibold text-slate-400 flex items-center gap-1.5">
                        <FileCheck className="w-3.5 h-3.5 text-indigo-400" />
                        <span>Freight Documents (BOL / POD)</span>
                      </span>
                      <div className="space-y-1.5">
                        {evidenceBySource.documents.map((ev) => (
                          <div key={ev.id} className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800 text-xs flex items-center justify-between gap-3">
                            <div>
                              <span className="font-semibold text-slate-200">{ev.sourceReference}: </span>
                              <span className="text-slate-300">{ev.extractedFact}</span>
                            </div>
                            <span className="text-[10px] font-mono text-slate-400">{formatTime(ev.timestamp)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Activity Notes & Communications */}
                  {(evidenceBySource.notes.length > 0 || evidenceBySource.driver.length > 0) && (
                    <div className="space-y-1.5">
                      <span className="text-[11px] font-semibold text-slate-400 flex items-center gap-1.5">
                        <MessageSquare className="w-3.5 h-3.5 text-slate-400" />
                        <span>Activity Log & Driver Comms</span>
                      </span>
                      <div className="space-y-1.5">
                        {[...evidenceBySource.notes, ...evidenceBySource.driver].map((ev) => (
                          <div key={ev.id} className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800 text-xs flex items-center justify-between gap-3">
                            <div>
                              <span className="font-semibold text-slate-200">{ev.sourceReference}: </span>
                              <span className="text-slate-300">{ev.extractedFact}</span>
                            </div>
                            <span className="text-[10px] font-mono text-slate-400">{formatTime(ev.timestamp)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 6. HUMAN-IN-THE-LOOP REVIEW WORKSPACE */}
            <div className="p-5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-emerald-400" />
                  <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                    Human Review & Sign-Off Workflow
                  </h4>
                </div>
                <div>{getHumanReviewBadge(currentAudit.human_review_status)}</div>
              </div>

              {/* Review History / Meta if already reviewed */}
              {currentAudit.human_reviewed_at && (
                <div className="p-3.5 rounded-lg bg-slate-950/70 border border-slate-800 space-y-2 text-xs">
                  <div className="flex items-center justify-between text-slate-400 text-[11px]">
                    <span>Reviewed By: <strong className="text-slate-200">{currentAudit.human_reviewed_by_name || 'Staff Member'}</strong></span>
                    <span>Reviewed At: <strong className="text-slate-200 font-mono">{formatTime(currentAudit.human_reviewed_at)}</strong></span>
                  </div>
                  {currentAudit.human_override_notes && (
                    <div className="pt-2 border-t border-slate-800/80">
                      <span className="text-[11px] text-slate-400 block font-semibold">Review / Justification Notes:</span>
                      <p className="text-slate-200 text-xs italic mt-0.5">{currentAudit.human_override_notes}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Action Buttons for Authorized Reviewers */}
              {canReview && !isViewingHistorical && (
                <div className="space-y-3 pt-1">
                  {!reviewAction ? (
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        id="btn-audit-accept"
                        onClick={() => {
                          setReviewAction('accept');
                          setReviewNotes('');
                          setReviewFormError(null);
                        }}
                        className="px-3.5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Accept Deterministic Audit</span>
                      </button>

                      <button
                        type="button"
                        id="btn-audit-override"
                        onClick={() => {
                          setReviewAction('override');
                          setReviewNotes('');
                          setReviewFormError(null);
                        }}
                        className="px-3.5 py-2 text-xs font-bold text-white bg-sky-600 hover:bg-sky-500 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5"
                      >
                        <UserCheck className="w-3.5 h-3.5" />
                        <span>Override Audit</span>
                      </button>

                      <button
                        type="button"
                        id="btn-audit-reject"
                        onClick={() => {
                          setReviewAction('reject');
                          setReviewNotes('');
                          setReviewFormError(null);
                        }}
                        className="px-3.5 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        <span>Reject Detention Claim</span>
                      </button>
                    </div>
                  ) : (
                    /* Review Confirmation & Notes Form */
                    <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3 text-xs">
                      <div className="flex items-center justify-between">
                        <h5 className="font-bold text-slate-100 uppercase tracking-wider text-[11px]">
                          {reviewAction === 'accept'
                            ? 'Confirm Acceptance of Audit'
                            : reviewAction === 'override'
                            ? 'Provide Override Justification'
                            : 'Provide Rejection Reason'}
                        </h5>
                        <button
                          type="button"
                          onClick={() => {
                            setReviewAction(null);
                            setReviewFormError(null);
                          }}
                          className="text-slate-400 hover:text-slate-200 cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>

                      {reviewFormError && (
                        <p className="text-xs text-rose-400 font-medium">{reviewFormError}</p>
                      )}

                      <div>
                        <label className="block text-[11px] text-slate-400 mb-1">
                          {reviewAction === 'accept'
                            ? 'Optional Acceptance Notes'
                            : 'Required Justification Notes *'}
                        </label>
                        <textarea
                          id="textarea-audit-review-notes"
                          rows={3}
                          value={reviewNotes}
                          onChange={(e) => setReviewNotes(e.target.value)}
                          placeholder={
                            reviewAction === 'accept'
                              ? 'e.g. Verified with signed in/out stamps on BOL and broker notice.'
                              : reviewAction === 'override'
                              ? 'Explain why this audit is being overridden (e.g., broker granted special waiver for facility delay).'
                              : 'Explain reason for claim rejection (e.g., driver arrived 2 hours late without appointment authorization).'
                          }
                          className="w-full p-2.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 text-xs"
                        />
                      </div>

                      <div className="flex items-center justify-end gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => setReviewAction(null)}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:text-slate-200 cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          id="btn-confirm-submit-review"
                          disabled={isSubmittingReview}
                          onClick={handleSubmitReview}
                          className={`px-4 py-1.5 rounded-lg text-xs font-bold text-white transition-colors cursor-pointer disabled:opacity-50 ${
                            reviewAction === 'accept'
                              ? 'bg-emerald-600 hover:bg-emerald-500'
                              : reviewAction === 'override'
                              ? 'bg-sky-600 hover:bg-sky-500'
                              : 'bg-rose-600 hover:bg-rose-500'
                          }`}
                        >
                          {isSubmittingReview ? 'Saving Review...' : `Submit ${reviewAction.toUpperCase()}`}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 7. AUDIT VERSION HISTORY */}
            <div className="p-5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <History className="w-4 h-4 text-slate-400" />
                  <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                    Audit Version History ({audits.length})
                  </h4>
                </div>
              </div>

              {audits.length <= 1 ? (
                <p className="text-xs text-slate-400">
                  This is the initial audit version (v1) for Load #{load.load_number}. Previous versions will be archived here sequentially when re-audits occur.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left text-slate-300">
                    <thead className="text-[10px] text-slate-400 uppercase bg-slate-950/60 border-b border-slate-800">
                      <tr>
                        <th className="px-3 py-2">Version</th>
                        <th className="px-3 py-2">Audit Status</th>
                        <th className="px-3 py-2">Confidence</th>
                        <th className="px-3 py-2">Verified Amount</th>
                        <th className="px-3 py-2">Human Review</th>
                        <th className="px-3 py-2">Created At</th>
                        <th className="px-3 py-2 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {audits.map((a) => {
                        const isCurrent = a.id === currentAudit.id;
                        return (
                          <tr
                            key={a.id}
                            className={`hover:bg-slate-800/40 transition-colors ${
                              isCurrent ? 'bg-indigo-950/20' : ''
                            }`}
                          >
                            <td className="px-3 py-2 font-mono font-bold text-slate-100">
                              v{a.audit_version}
                              {a.id === latestAudit?.id && (
                                <span className="ml-1.5 text-[9px] px-1.5 py-0.2 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                                  Latest
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2">{getStatusBadge(a.audit_status)}</td>
                            <td className="px-3 py-2 font-mono tabular-nums">
                              {(a.overall_confidence * 100).toFixed(0)}%
                            </td>
                            <td className="px-3 py-2 font-mono font-bold text-emerald-400 tabular-nums">
                              {formatCurrency(a.total_verified_amount)}
                            </td>
                            <td className="px-3 py-2">{getHumanReviewBadge(a.human_review_status)}</td>
                            <td className="px-3 py-2 font-mono text-slate-400 text-[11px]">
                              {formatTime(a.created_at)}
                            </td>
                            <td className="px-3 py-2 text-right">
                              {isCurrent ? (
                                <span className="text-[11px] font-semibold text-indigo-400">Viewing</span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setSelectedAuditId(a.id)}
                                  className="text-[11px] font-semibold text-slate-300 hover:text-white underline cursor-pointer"
                                >
                                  View
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};
