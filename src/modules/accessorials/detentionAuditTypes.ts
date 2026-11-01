/**
 * DispatcherDesk - AI Detention Audit Engine Domain Types (Phase 2)
 * File: src/modules/accessorials/detentionAuditTypes.ts
 *
 * Implements strict, typed contracts for:
 * - Deterministic dwell & punctuality reconciliation
 * - Multi-source evidence grounding (Milestones, RateCons, Check Calls, BOL/POD, Comms)
 * - Traceable discrepancies and human review lifecycle
 */

export type AuditStatus = 'eligible' | 'not_eligible' | 'needs_review';

export type FacilityAuditStatus = 'eligible' | 'not_eligible' | 'needs_review' | 'not_applicable';

export type HumanReviewStatus = 'pending' | 'accepted' | 'overridden' | 'rejected';

export type DiscrepancyCode =
  | 'CHECK_CALL_TIME_MISMATCH'
  | 'RATE_CON_FREE_TIME_CONFLICT'
  | 'ARRIVAL_AFTER_DEPARTURE'
  | 'MISSING_DEPARTURE_TIMESTAMP'
  | 'APPOINTMENT_MISMATCH'
  | 'MISSING_SIGNED_POD'
  | 'MISSING_HOURLY_RATE'
  | 'BROKER_APPROVAL_REQUIRED'
  | 'EARLY_ARRIVAL_WITHOUT_APPT';

export type EvidenceSourceType =
  | 'load_milestone'
  | 'check_call'
  | 'rate_con'
  | 'bol_pod'
  | 'activity_note'
  | 'driver_message';

export interface AuditFacilityReport {
  status: FacilityAuditStatus;
  appointmentTime: string | null;
  arrivalTime: string | null;
  departureTime: string | null;
  detentionStartTime: string | null;
  detentionEndTime: string | null;
  freeTimeHours: number;
  billableHours: number;
  hourlyRate: number;
  verifiedAmount: number;
  punctualityAssessment?: 'on_time' | 'early' | 'late' | 'not_applicable' | 'unknown';
  earlyArrivalBufferDeductedMinutes?: number;
  findings: string[];
}

export interface AuditEvidenceItem {
  id: string;
  sourceType: EvidenceSourceType;
  sourceReference: string;
  timestamp: string | null;
  extractedFact: string;
  confidence: number; // 0.00 - 1.00
  supportsClaim: boolean;
}

export interface AuditDiscrepancy {
  code: DiscrepancyCode;
  severity: 'blocker' | 'warning' | 'info';
  description: string;
  conflictingSources: string[];
  recommendedAction: string;
}

export interface DetentionAuditInput {
  loadId: string;
  facilityScope: 'all' | 'pickup' | 'delivery';

  loadContext: {
    loadNumber: string;
    pickupDatetime: string | null;
    pickupTimezone: string;
    deliveryDatetime: string | null;
    deliveryTimezone: string;
    operationalTimezone: string;
    pipelineStatus: string;
    pickupArrival: string | null;
    pickupLoadingStart: string | null;
    pickupLoadingComplete: string | null;
    pickupDeparture: string | null;
    deliveryArrival: string | null;
    deliveryUnloadingStart: string | null;
    deliveryUnloadingComplete: string | null;
    deliveryDeparture: string | null;
  };

  rateConTerms?: {
    hasRateCon: boolean;
    freeTimeHours: number | null;
    hourlyRate: number | null;
    detentionNoticeTerms: string | null;
    specialInstructions: string | null;
    pickupWindow?: { start: string | null; end: string | null; type: string | null };
    deliveryWindow?: { start: string | null; end: string | null; type: string | null };
  };

  checkCalls: Array<{
    id: string;
    callType: string;
    status: string;
    eventAt: string;
    notes: string | null;
    locationCity: string | null;
    locationState: string | null;
  }>;

  documentEvidence: Array<{
    id: string;
    docType: 'rate_confirmation' | 'bol' | 'pod' | 'invoice' | 'other';
    status: 'missing' | 'pending' | 'received' | 'verified';
    fileName: string;
    notes: string | null;
    uploadedAt: string;
  }>;

  activityNotes: Array<{
    id: string;
    type: string;
    content: string;
    timestamp: string;
    authorName: string;
  }>;

  driverMessages: Array<{
    id: string;
    sender: 'driver' | 'dispatcher';
    text: string;
    timestamp: string;
  }>;
}

export interface DetentionAuditResult {
  auditId?: string;
  loadId: string;
  status: AuditStatus;
  overallConfidence: number; // 0.00 - 1.00
  requiresHumanReview: boolean;

  pickupAudit: AuditFacilityReport;
  deliveryAudit: AuditFacilityReport;

  totalVerifiedHours: number;
  totalVerifiedAmount: number;

  evidence: AuditEvidenceItem[];
  discrepancies: AuditDiscrepancy[];
  missingEvidence: string[];
  reasoningSummary: string;
}
