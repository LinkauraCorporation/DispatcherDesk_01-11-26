/**
 * DispatcherDesk - AI Detention Audit Engine: Gemini Reconciliation & Grounding Layer (Phase 2C)
 * File: src/modules/accessorials/detentionAuditReconciliation.ts
 *
 * Implements the server-side Gemini reconciliation, grounding validation,
 * and deterministic financial protection boundaries for detention audits:
 * 1. Prepares normalized UTC/ISO context from deterministic evidence.
 * 2. Grounding validation:
 *    - All evidence sourceReferences exist in input.
 *    - All timestamps exist in input evidence.
 *    - Discrepancy codes match valid domain union.
 *    - Confidence values are strictly in [0.00, 1.00].
 *    - AI cannot invent timestamps, hourly rates, free-time, or document IDs.
 * 3. Deterministic financial protection:
 *    - Deterministic billable hours and verified amount are strictly authoritative.
 *    - Gemini may explain, classify, and recommend, but cannot override billing math.
 * 4. User load access & tenant isolation check.
 */

import {
  AuditStatus,
  FacilityAuditStatus,
  DiscrepancyCode,
  EvidenceSourceType,
  AuditFacilityReport,
  AuditEvidenceItem,
  AuditDiscrepancy,
  DetentionAuditInput,
  DetentionAuditResult,
} from './detentionAuditTypes.ts';
import { normalizeToIso } from './detentionAuditService.ts';
import { getSupabaseAdmin, getSupabaseAdminSafe } from '../../server/supabaseAdmin.ts';
import { loadService } from '../loads/loadService.ts';

export const VALID_DISCREPANCY_CODES = new Set<DiscrepancyCode>([
  'CHECK_CALL_TIME_MISMATCH',
  'RATE_CON_FREE_TIME_CONFLICT',
  'ARRIVAL_AFTER_DEPARTURE',
  'MISSING_DEPARTURE_TIMESTAMP',
  'APPOINTMENT_MISMATCH',
  'MISSING_SIGNED_POD',
  'MISSING_HOURLY_RATE',
  'BROKER_APPROVAL_REQUIRED',
  'EARLY_ARRIVAL_WITHOUT_APPT',
]);

export const VALID_AUDIT_STATUSES = new Set<AuditStatus>([
  'eligible',
  'not_eligible',
  'needs_review',
]);

export const VALID_FACILITY_STATUSES = new Set<FacilityAuditStatus>([
  'eligible',
  'not_eligible',
  'needs_review',
  'not_applicable',
]);

export interface GroundTruth {
  knownTimestamps: Set<string>;
  knownSourceReferences: Set<string>;
  knownCheckCallIds: Set<string>;
  knownDocumentIds: Set<string>;
  knownActivityNoteIds: Set<string>;
  knownDriverMessageIds: Set<string>;
  knownRates: Set<number>;
  knownFreeTimes: Set<number>;
}

export const ALLOWED_SEVERITIES = ['blocker', 'warning', 'info'] as const;
export type DiscrepancySeverity = (typeof ALLOWED_SEVERITIES)[number];

/**
 * Normalizes discrepancy severity values to the strict application domain enum:
 * 'blocker' | 'warning' | 'info'
 * Maps high-impact synonyms (e.g. 'critical', 'high', 'fatal') to 'blocker',
 * medium-impact synonyms (e.g. 'medium', 'warn') to 'warning',
 * and low-impact synonyms (e.g. 'low', 'notice', 'informational') to 'info'.
 * Returns null for any unsupported or arbitrary value (which will be rejected).
 */
export function normalizeDiscrepancySeverity(rawSeverity: any): DiscrepancySeverity | null {
  if (typeof rawSeverity !== 'string') return null;
  const s = rawSeverity.trim().toLowerCase();
  if (s === 'blocker' || s === 'critical' || s === 'high' || s === 'fatal') {
    return 'blocker';
  }
  if (s === 'warning' || s === 'warn' || s === 'medium') {
    return 'warning';
  }
  if (s === 'info' || s === 'informational' || s === 'low' || s === 'notice') {
    return 'info';
  }
  return null;
}

/**
 * Collects all authoritative ground-truth entities from the deterministic input and result.
 * Used to ensure Gemini never hallucinates or introduces ungrounded facts.
 */
export function collectGroundTruth(
  input: DetentionAuditInput,
  deterministicResult: DetentionAuditResult
): GroundTruth {
  const knownTimestamps = new Set<string>();
  const knownSourceReferences = new Set<string>();
  const knownCheckCallIds = new Set<string>();
  const knownDocumentIds = new Set<string>();
  const knownActivityNoteIds = new Set<string>();
  const knownDriverMessageIds = new Set<string>();
  const knownRates = new Set<number>();
  const knownFreeTimes = new Set<number>();

  const addTs = (val?: string | Date | null) => {
    const iso = normalizeToIso(val);
    if (iso) knownTimestamps.add(iso);
  };

  // Load context timestamps & references
  addTs(input.loadContext.pickupDatetime);
  addTs(input.loadContext.deliveryDatetime);
  addTs(input.loadContext.pickupArrival);
  addTs(input.loadContext.pickupLoadingStart);
  addTs(input.loadContext.pickupLoadingComplete);
  addTs(input.loadContext.pickupDeparture);
  addTs(input.loadContext.deliveryArrival);
  addTs(input.loadContext.deliveryUnloadingStart);
  addTs(input.loadContext.deliveryUnloadingComplete);
  addTs(input.loadContext.deliveryDeparture);

  knownSourceReferences.add('loads.pickup_datetime');
  knownSourceReferences.add('loads.pickup_arrival_time');
  knownSourceReferences.add('loads.pickup_loading_start_time');
  knownSourceReferences.add('loads.pickup_loading_complete_time');
  knownSourceReferences.add('loads.pickup_departure_time');
  knownSourceReferences.add('loads.delivery_datetime');
  knownSourceReferences.add('loads.delivery_arrival_time');
  knownSourceReferences.add('loads.delivery_unloading_start_time');
  knownSourceReferences.add('loads.delivery_unloading_complete_time');
  knownSourceReferences.add('loads.delivery_departure_time');
  knownSourceReferences.add('rate_con');
  knownSourceReferences.add('rate_con.terms');
  knownSourceReferences.add('rate_con.notes');
  knownSourceReferences.add('rate_con.special_instructions');
  knownSourceReferences.add('rate_confirmation');
  knownSourceReferences.add('deterministic_audit');
  knownSourceReferences.add('documents.pod');
  knownSourceReferences.add('documents.bol');

  // Check calls
  input.checkCalls.forEach((c) => {
    addTs(c.eventAt);
    if (c.id) {
      knownCheckCallIds.add(c.id);
      knownSourceReferences.add(c.id);
      knownSourceReferences.add(`check_calls.${c.id}`);
      knownSourceReferences.add(`check_call.${c.id}`);
    }
  });

  // Document evidence
  input.documentEvidence.forEach((d) => {
    addTs(d.uploadedAt);
    if (d.id) {
      knownDocumentIds.add(d.id);
      knownSourceReferences.add(d.id);
      knownSourceReferences.add(`documents.${d.id}`);
      knownSourceReferences.add(`bol_pod.${d.id}`);
      knownSourceReferences.add(`rate_con.${d.id}`);
    }
  });

  // Activity notes
  input.activityNotes.forEach((a) => {
    addTs(a.timestamp);
    if (a.id) {
      knownActivityNoteIds.add(a.id);
      knownSourceReferences.add(a.id);
      knownSourceReferences.add(`activity_notes.${a.id}`);
      knownSourceReferences.add(`activity_note.${a.id}`);
    }
  });

  // Driver messages
  input.driverMessages.forEach((m) => {
    addTs(m.timestamp);
    if (m.id) {
      knownDriverMessageIds.add(m.id);
      knownSourceReferences.add(m.id);
      knownSourceReferences.add(`driver_messages.${m.id}`);
      knownSourceReferences.add(`driver_message.${m.id}`);
    }
  });

  // Deterministic result timestamps & evidence
  addTs(deterministicResult.pickupAudit.appointmentTime);
  addTs(deterministicResult.pickupAudit.arrivalTime);
  addTs(deterministicResult.pickupAudit.departureTime);
  addTs(deterministicResult.pickupAudit.detentionStartTime);
  addTs(deterministicResult.pickupAudit.detentionEndTime);

  addTs(deterministicResult.deliveryAudit.appointmentTime);
  addTs(deterministicResult.deliveryAudit.arrivalTime);
  addTs(deterministicResult.deliveryAudit.departureTime);
  addTs(deterministicResult.deliveryAudit.detentionStartTime);
  addTs(deterministicResult.deliveryAudit.detentionEndTime);

  deterministicResult.evidence.forEach((ev) => {
    addTs(ev.timestamp);
    knownSourceReferences.add(ev.sourceReference);
    if (ev.sourceReference.startsWith('check_calls.')) {
      const ccId = ev.sourceReference.replace(/^check_calls\./, '');
      knownCheckCallIds.add(ccId);
      knownSourceReferences.add(ccId);
    } else if (ev.sourceReference.startsWith('documents.')) {
      const docId = ev.sourceReference.replace(/^documents\./, '');
      knownDocumentIds.add(docId);
      knownSourceReferences.add(docId);
    }
  });

  // Known hourly rates
  if (deterministicResult.pickupAudit.hourlyRate) {
    knownRates.add(Number(deterministicResult.pickupAudit.hourlyRate));
  }
  if (deterministicResult.deliveryAudit.hourlyRate) {
    knownRates.add(Number(deterministicResult.deliveryAudit.hourlyRate));
  }
  if (input.rateConTerms?.hourlyRate) {
    knownRates.add(Number(input.rateConTerms.hourlyRate));
  }

  // Known free times
  if (deterministicResult.pickupAudit.freeTimeHours !== undefined) {
    knownFreeTimes.add(Number(deterministicResult.pickupAudit.freeTimeHours));
  }
  if (deterministicResult.deliveryAudit.freeTimeHours !== undefined) {
    knownFreeTimes.add(Number(deterministicResult.deliveryAudit.freeTimeHours));
  }
  if (input.rateConTerms?.freeTimeHours !== null && input.rateConTerms?.freeTimeHours !== undefined) {
    knownFreeTimes.add(Number(input.rateConTerms.freeTimeHours));
  }

  return {
    knownTimestamps,
    knownSourceReferences,
    knownCheckCallIds,
    knownDocumentIds,
    knownActivityNoteIds,
    knownDriverMessageIds,
    knownRates,
    knownFreeTimes,
  };
}

/**
 * Prepares the normalized audit context payload sent to Gemini.
 * Ensures:
 * 1. All timestamps are UTC/ISO.
 * 2. Pickup and delivery facilities remain distinct.
 * 3. Includes deterministic financial calculations and discrepancies.
 */
export function prepareNormalizedAuditContext(
  input: DetentionAuditInput,
  deterministicResult: DetentionAuditResult
) {
  return {
    loadIdentification: {
      loadId: input.loadId,
      loadNumber: input.loadContext.loadNumber,
      pipelineStatus: input.loadContext.pipelineStatus,
      operationalTimezone: input.loadContext.operationalTimezone,
    },
    facilityScope: input.facilityScope,
    pickupFacility: {
      appointmentUtc: normalizeToIso(input.loadContext.pickupDatetime),
      localTimezone: input.loadContext.pickupTimezone,
      milestonesUtc: {
        arrival: normalizeToIso(input.loadContext.pickupArrival),
        loadingStart: normalizeToIso(input.loadContext.pickupLoadingStart),
        loadingComplete: normalizeToIso(input.loadContext.pickupLoadingComplete),
        departure: normalizeToIso(input.loadContext.pickupDeparture),
      },
      deterministicReport: {
        status: deterministicResult.pickupAudit.status,
        punctualityAssessment: deterministicResult.pickupAudit.punctualityAssessment,
        freeTimeHours: deterministicResult.pickupAudit.freeTimeHours,
        billableHours: deterministicResult.pickupAudit.billableHours,
        hourlyRate: deterministicResult.pickupAudit.hourlyRate,
        verifiedAmount: deterministicResult.pickupAudit.verifiedAmount,
        findings: deterministicResult.pickupAudit.findings,
      },
    },
    deliveryFacility: {
      appointmentUtc: normalizeToIso(input.loadContext.deliveryDatetime),
      localTimezone: input.loadContext.deliveryTimezone,
      milestonesUtc: {
        arrival: normalizeToIso(input.loadContext.deliveryArrival),
        unloadingStart: normalizeToIso(input.loadContext.deliveryUnloadingStart),
        unloadingComplete: normalizeToIso(input.loadContext.deliveryUnloadingComplete),
        departure: normalizeToIso(input.loadContext.deliveryDeparture),
      },
      deterministicReport: {
        status: deterministicResult.deliveryAudit.status,
        punctualityAssessment: deterministicResult.deliveryAudit.punctualityAssessment,
        freeTimeHours: deterministicResult.deliveryAudit.freeTimeHours,
        billableHours: deterministicResult.deliveryAudit.billableHours,
        hourlyRate: deterministicResult.deliveryAudit.hourlyRate,
        verifiedAmount: deterministicResult.deliveryAudit.verifiedAmount,
        findings: deterministicResult.deliveryAudit.findings,
      },
    },
    rateConTerms: {
      hasRateCon: Boolean(input.rateConTerms?.hasRateCon),
      freeTimeHours: input.rateConTerms?.freeTimeHours ?? null,
      hourlyRate: input.rateConTerms?.hourlyRate ?? null,
      detentionNoticeTerms: input.rateConTerms?.detentionNoticeTerms ?? null,
      specialInstructions: input.rateConTerms?.specialInstructions ?? null,
    },
    checkCalls: input.checkCalls.map((c) => ({
      id: c.id,
      callType: c.callType,
      status: c.status,
      eventAtUtc: normalizeToIso(c.eventAt),
      notes: c.notes,
      location: [c.locationCity, c.locationState].filter(Boolean).join(', '),
    })),
    documents: input.documentEvidence.map((d) => ({
      id: d.id,
      docType: d.docType,
      status: d.status,
      fileName: d.fileName,
      notes: d.notes,
      uploadedAtUtc: normalizeToIso(d.uploadedAt),
    })),
    activityNotes: input.activityNotes.map((a) => ({
      id: a.id,
      type: a.type,
      authorName: a.authorName,
      content: a.content,
      timestampUtc: normalizeToIso(a.timestamp),
    })),
    driverMessages: input.driverMessages.map((m) => ({
      id: m.id,
      sender: m.sender,
      text: m.text,
      timestampUtc: normalizeToIso(m.timestamp),
    })),
    deterministicTotals: {
      totalVerifiedHours: deterministicResult.totalVerifiedHours,
      totalVerifiedAmount: deterministicResult.totalVerifiedAmount,
      overallStatus: deterministicResult.status,
      requiresHumanReview: deterministicResult.requiresHumanReview,
      discrepancies: deterministicResult.discrepancies,
      missingEvidence: deterministicResult.missingEvidence,
    },
  };
}

export interface GroundingValidationResult {
  valid: boolean;
  errors: string[];
  sanitizedAiResult?: any;
}

/**
 * Grounding validator ensuring:
 * 1. Output is valid structured JSON.
 * 2. Every evidence sourceReference exists in supplied input.
 * 3. Timestamps referenced exist in supplied evidence.
 * 4. Discrepancy codes are valid domain union.
 * 5. Confidence values are numbers in [0.00, 1.00].
 * 6. Status is valid ('eligible' | 'not_eligible' | 'needs_review').
 * 7. Pickup/delivery reports exist.
 * 8. AI has not supplied an unsupported hourly rate.
 * 9. AI has not supplied invented document IDs.
 */
export function validateGrounding(
  rawAi: any,
  groundTruth: GroundTruth,
  deterministicResult: DetentionAuditResult
): GroundingValidationResult {
  const errors: string[] = [];

  if (!rawAi || typeof rawAi !== 'object' || Array.isArray(rawAi)) {
    return {
      valid: false,
      errors: ['AI response must be a valid JSON object.'],
    };
  }

  // 1. Status validation
  if (!rawAi.status || !VALID_AUDIT_STATUSES.has(rawAi.status)) {
    errors.push(`Invalid audit status: "${rawAi.status}". Must be 'eligible', 'not_eligible', or 'needs_review'.`);
  }

  // 2. Confidence validation
  if (
    typeof rawAi.overallConfidence !== 'number' ||
    isNaN(rawAi.overallConfidence) ||
    rawAi.overallConfidence < 0 ||
    rawAi.overallConfidence > 1
  ) {
    errors.push(`Invalid overallConfidence: "${rawAi.overallConfidence}". Must be a number between 0.00 and 1.00.`);
  }

  // 3. Facility reports exist & valid
  if (!rawAi.pickupAudit || typeof rawAi.pickupAudit !== 'object') {
    errors.push('Missing pickupAudit in AI response.');
  } else if (rawAi.pickupAudit.status && !VALID_FACILITY_STATUSES.has(rawAi.pickupAudit.status)) {
    errors.push(`Invalid pickupAudit status: "${rawAi.pickupAudit.status}".`);
  }

  if (!rawAi.deliveryAudit || typeof rawAi.deliveryAudit !== 'object') {
    errors.push('Missing deliveryAudit in AI response.');
  } else if (rawAi.deliveryAudit.status && !VALID_FACILITY_STATUSES.has(rawAi.deliveryAudit.status)) {
    errors.push(`Invalid deliveryAudit status: "${rawAi.deliveryAudit.status}".`);
  }

  // 4. Rate grounding validation
  const checkRate = (rateVal: any, label: string) => {
    if (rateVal !== undefined && rateVal !== null) {
      const num = Number(rateVal);
      if (isNaN(num) || num < 0) {
        errors.push(`Invalid ${label} rate: "${rateVal}".`);
      } else if (!groundTruth.knownRates.has(num)) {
        errors.push(`Unsupported hourly rate: $${num}/hr in ${label}. AI cannot invent new rates without source evidence.`);
      }
    }
  };
  if (rawAi.pickupAudit) checkRate(rawAi.pickupAudit.hourlyRate, 'pickupAudit');
  if (rawAi.deliveryAudit) checkRate(rawAi.deliveryAudit.hourlyRate, 'deliveryAudit');

  // 5. Facility timestamps grounding
  const checkFacilityTs = (tsVal: any, label: string) => {
    if (tsVal) {
      const iso = normalizeToIso(tsVal);
      if (!iso) {
        errors.push(`Invalid timestamp format in ${label}: "${tsVal}".`);
      } else if (!groundTruth.knownTimestamps.has(iso)) {
        errors.push(`Unsupported timestamp in ${label}: "${tsVal}". AI cannot invent facility timestamps.`);
      }
    }
  };
  if (rawAi.pickupAudit) {
    checkFacilityTs(rawAi.pickupAudit.arrivalTime, 'pickup arrival');
    checkFacilityTs(rawAi.pickupAudit.departureTime, 'pickup departure');
  }
  if (rawAi.deliveryAudit) {
    checkFacilityTs(rawAi.deliveryAudit.arrivalTime, 'delivery arrival');
    checkFacilityTs(rawAi.deliveryAudit.departureTime, 'delivery departure');
  }

  // 6. Evidence grounding validation
  if (rawAi.evidence !== undefined) {
    if (!Array.isArray(rawAi.evidence)) {
      errors.push('evidence must be an array.');
    } else {
      rawAi.evidence.forEach((ev: any, idx: number) => {
        if (!ev || typeof ev !== 'object') {
          errors.push(`evidence[${idx}] must be an object.`);
          return;
        }

        // SourceReference validation
        if (!ev.sourceReference || typeof ev.sourceReference !== 'string') {
          errors.push(`evidence[${idx}] missing sourceReference.`);
        } else {
          const ref = ev.sourceReference.trim();
          let isValidRef = false;
          let normalizedRef = ref;

          // Check if it directly matches an authoritative known source reference
          if (groundTruth.knownSourceReferences.has(ref)) {
            isValidRef = true;
            if (groundTruth.knownCheckCallIds.has(ref)) {
              normalizedRef = `check_calls.${ref}`;
            } else if (groundTruth.knownDocumentIds.has(ref)) {
              normalizedRef = `documents.${ref}`;
            } else if (groundTruth.knownActivityNoteIds.has(ref)) {
              normalizedRef = `activity_notes.${ref}`;
            } else if (groundTruth.knownDriverMessageIds.has(ref)) {
              normalizedRef = `driver_messages.${ref}`;
            }
          } else if (ref.startsWith('check_calls.') || ref.startsWith('check_call.')) {
            const ccId = ref.replace(/^check_calls?\./, '');
            if (groundTruth.knownCheckCallIds.has(ccId)) {
              isValidRef = true;
              normalizedRef = `check_calls.${ccId}`;
            } else {
              errors.push(`evidence[${idx}] unsupported check call ID: "${ccId}". AI cannot invent source references.`);
            }
          } else if (ref.startsWith('documents.') || ref.startsWith('bol_pod.')) {
            const docId = ref.replace(/^(documents\.|bol_pod\.)/, '');
            if (groundTruth.knownDocumentIds.has(docId)) {
              isValidRef = true;
              normalizedRef = `documents.${docId}`;
            } else {
              errors.push(`evidence[${idx}] unsupported document ID: "${docId}".`);
            }
          } else if (ref.startsWith('activity_notes.') || ref.startsWith('activity_note.')) {
            const noteId = ref.replace(/^activity_notes?\./, '');
            if (groundTruth.knownActivityNoteIds.has(noteId)) {
              isValidRef = true;
              normalizedRef = `activity_notes.${noteId}`;
            } else {
              errors.push(`evidence[${idx}] unsupported activity note ID: "${noteId}".`);
            }
          } else if (ref.startsWith('driver_messages.') || ref.startsWith('driver_message.')) {
            const msgId = ref.replace(/^driver_messages?\./, '');
            if (groundTruth.knownDriverMessageIds.has(msgId)) {
              isValidRef = true;
              normalizedRef = `driver_messages.${msgId}`;
            } else {
              errors.push(`evidence[${idx}] unsupported driver message ID: "${msgId}".`);
            }
          }

          if (!isValidRef && !errors.some((e) => e.startsWith(`evidence[${idx}]`))) {
            errors.push(`evidence[${idx}] unsupported sourceReference: "${ref}". AI cannot invent source references.`);
          } else if (isValidRef) {
            ev.sourceReference = normalizedRef;
          }
        }

        // Timestamp grounding check
        if (ev.timestamp) {
          const iso = normalizeToIso(ev.timestamp);
          if (!iso) {
            errors.push(`evidence[${idx}] malformed timestamp: "${ev.timestamp}".`);
          } else if (!groundTruth.knownTimestamps.has(iso)) {
            errors.push(`evidence[${idx}] unsupported timestamp: "${ev.timestamp}". AI cannot invent timestamps.`);
          }
        }

        // Confidence validation
        if (
          typeof ev.confidence !== 'number' ||
          isNaN(ev.confidence) ||
          ev.confidence < 0 ||
          ev.confidence > 1
        ) {
          errors.push(`evidence[${idx}] invalid confidence: "${ev.confidence}". Must be in [0.00, 1.00].`);
        }
      });
    }
  }

  // 7. Discrepancy codes validation
  if (rawAi.discrepancies !== undefined) {
    if (!Array.isArray(rawAi.discrepancies)) {
      errors.push('discrepancies must be an array.');
    } else {
      rawAi.discrepancies.forEach((disc: any, idx: number) => {
        if (!disc || typeof disc !== 'object') {
          errors.push(`discrepancies[${idx}] must be an object.`);
          return;
        }
        if (!disc.code || !VALID_DISCREPANCY_CODES.has(disc.code)) {
          errors.push(`discrepancies[${idx}] invalid discrepancy code: "${disc.code}".`);
        }
        if (!disc.severity) {
          errors.push(`discrepancies[${idx}] missing severity. Must be one of: blocker, warning, info.`);
        } else {
          const normSeverity = normalizeDiscrepancySeverity(disc.severity);
          if (!normSeverity) {
            errors.push(`discrepancies[${idx}] invalid severity: "${disc.severity}". Must be one of: blocker, warning, info.`);
          } else {
            disc.severity = normSeverity;
          }
        }
        if (Array.isArray(disc.conflictingSources)) {
          disc.conflictingSources = disc.conflictingSources.map((src: any) => {
            if (typeof src === 'string') {
              const trimmedSrc = src.trim();
              if (groundTruth.knownCheckCallIds.has(trimmedSrc)) {
                return `check_calls.${trimmedSrc}`;
              }
              if (groundTruth.knownDocumentIds.has(trimmedSrc)) {
                return `documents.${trimmedSrc}`;
              }
              if (trimmedSrc.startsWith('documents.')) {
                const docId = trimmedSrc.replace(/^documents\./, '');
                if (!groundTruth.knownDocumentIds.has(docId)) {
                  errors.push(`discrepancies[${idx}] conflictingSource references unknown document: "${docId}".`);
                }
              }
              if (trimmedSrc.startsWith('check_calls.')) {
                const ccId = trimmedSrc.replace(/^check_calls\./, '');
                if (!groundTruth.knownCheckCallIds.has(ccId)) {
                  errors.push(`discrepancies[${idx}] conflictingSource references unknown check call: "${ccId}".`);
                }
              }
              return trimmedSrc;
            }
            return src;
          });
        }
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    sanitizedAiResult: rawAi,
  };
}

/**
 * Reconciles the validated AI interpretation with the authoritative deterministic math.
 * Enforces:
 * - Deterministic billable hours, verified amounts, hourly rates, and timestamps are PROTECTED.
 * - AI cannot lower status from 'needs_review' to 'eligible' if deterministic engine flagged discrepancies.
 * - AI reasoning summary, contractual findings, and valid grounded discrepancies are preserved.
 */
export function protectAndReconcileResult(
  deterministicResult: DetentionAuditResult,
  validatedAi: any,
  input: DetentionAuditInput
): DetentionAuditResult {
  const mergedDiscrepancies: AuditDiscrepancy[] = [...deterministicResult.discrepancies];

  // Incorporate valid AI discrepancies
  if (Array.isArray(validatedAi?.discrepancies)) {
    validatedAi.discrepancies.forEach((aiDisc: AuditDiscrepancy) => {
      if (
        VALID_DISCREPANCY_CODES.has(aiDisc.code) &&
        !mergedDiscrepancies.some((d) => d.code === aiDisc.code && d.description === aiDisc.description)
      ) {
        mergedDiscrepancies.push(aiDisc);
      }
    });
  }

  // Detect and record if AI attempted to suggest different billable hours or amount
  if (
    validatedAi?.pickupAudit?.billableHours !== undefined &&
    validatedAi.pickupAudit.billableHours !== deterministicResult.pickupAudit.billableHours
  ) {
    if (!mergedDiscrepancies.some((d) => d.code === 'RATE_CON_FREE_TIME_CONFLICT')) {
      mergedDiscrepancies.push({
        code: 'RATE_CON_FREE_TIME_CONFLICT',
        severity: 'warning',
        description: `AI recommended ${validatedAi.pickupAudit.billableHours}h pickup detention vs authoritative calculation of ${deterministicResult.pickupAudit.billableHours}h. Authoritative calculation enforced.`,
        conflictingSources: ['deterministic_audit', 'rate_con'],
        recommendedAction: 'Verify RateCon free time clauses and gate times.',
      });
    }
  }

  // Merge evidence without duplicates
  const mergedEvidence: AuditEvidenceItem[] = [...deterministicResult.evidence];
  if (Array.isArray(validatedAi?.evidence)) {
    validatedAi.evidence.forEach((aiEv: AuditEvidenceItem, idx: number) => {
      if (!mergedEvidence.some((e) => e.sourceReference === aiEv.sourceReference && e.timestamp === aiEv.timestamp)) {
        mergedEvidence.push({
          ...aiEv,
          id: aiEv.id || `ev-ai-${idx}-${Date.now().toString(36)}`,
        });
      }
    });
  }

  // Merge missing evidence
  const mergedMissing = new Set<string>(deterministicResult.missingEvidence);
  if (Array.isArray(validatedAi?.missingEvidence)) {
    validatedAi.missingEvidence.forEach((item: string) => {
      if (typeof item === 'string' && item.trim()) mergedMissing.add(item.trim());
    });
  }

  // Determine reconciled status:
  // - If deterministic calculation flagged needs_review or requiresHumanReview, status MUST remain needs_review.
  // - If check-call time mismatch or rate-con conflict exists, status MUST be needs_review.
  // - If AI recommends needs_review due to ambiguous RateCon or contract conditions, escalate to needs_review.
  // - Clean eligibility requires BOTH deterministic calculation and AI agreement with zero discrepancies.
  const hasBlockers = mergedDiscrepancies.some((d) => d.severity === 'blocker');
  const hasTimeMismatch = mergedDiscrepancies.some((d) => d.code === 'CHECK_CALL_TIME_MISMATCH');
  const hasContractConflict = mergedDiscrepancies.some((d) => d.code === 'RATE_CON_FREE_TIME_CONFLICT');

  let finalStatus: AuditStatus = deterministicResult.status;
  if (
    deterministicResult.status === 'needs_review' ||
    deterministicResult.requiresHumanReview ||
    hasTimeMismatch ||
    hasContractConflict ||
    hasBlockers ||
    validatedAi?.status === 'needs_review'
  ) {
    finalStatus = 'needs_review';
  } else if (deterministicResult.status === 'eligible' && validatedAi?.status === 'eligible') {
    finalStatus = 'eligible';
  } else if (deterministicResult.status === 'not_eligible' && validatedAi?.status === 'not_eligible') {
    finalStatus = 'not_eligible';
  } else {
    finalStatus = 'needs_review';
  }

  const requiresHumanReview =
    deterministicResult.requiresHumanReview ||
    Boolean(validatedAi?.requiresHumanReview) ||
    finalStatus === 'needs_review' ||
    hasBlockers ||
    hasTimeMismatch ||
    hasContractConflict;

  // Confidence score: bounded between 0.10 and 0.98
  let overallConfidence = deterministicResult.overallConfidence;
  if (typeof validatedAi?.overallConfidence === 'number' && !isNaN(validatedAi.overallConfidence)) {
    overallConfidence = Math.max(0.10, Math.min(0.98, Number(validatedAi.overallConfidence.toFixed(2))));
  }

  // Reasoning summary: preserve AI summary or append to deterministic summary
  let reasoningSummary = deterministicResult.reasoningSummary;
  if (validatedAi?.reasoningSummary && typeof validatedAi.reasoningSummary === 'string' && validatedAi.reasoningSummary.trim()) {
    reasoningSummary = validatedAi.reasoningSummary.trim();
  }

  // Merge findings for pickup
  const pickupFindings = [...deterministicResult.pickupAudit.findings];
  if (Array.isArray(validatedAi?.pickupAudit?.findings)) {
    validatedAi.pickupAudit.findings.forEach((f: string) => {
      if (typeof f === 'string' && !pickupFindings.includes(f)) pickupFindings.push(f);
    });
  }

  // Merge findings for delivery
  const deliveryFindings = [...deterministicResult.deliveryAudit.findings];
  if (Array.isArray(validatedAi?.deliveryAudit?.findings)) {
    validatedAi.deliveryAudit.findings.forEach((f: string) => {
      if (typeof f === 'string' && !deliveryFindings.includes(f)) deliveryFindings.push(f);
    });
  }

  return {
    auditId: deterministicResult.auditId,
    loadId: deterministicResult.loadId,
    status: finalStatus,
    overallConfidence,
    requiresHumanReview,

    // Deterministic financial figures are strictly protected
    pickupAudit: {
      status: validatedAi?.pickupAudit?.status && VALID_FACILITY_STATUSES.has(validatedAi.pickupAudit.status)
        ? (deterministicResult.pickupAudit.status === 'needs_review' ? 'needs_review' : validatedAi.pickupAudit.status)
        : deterministicResult.pickupAudit.status,
      appointmentTime: deterministicResult.pickupAudit.appointmentTime,
      arrivalTime: deterministicResult.pickupAudit.arrivalTime,
      departureTime: deterministicResult.pickupAudit.departureTime,
      detentionStartTime: deterministicResult.pickupAudit.detentionStartTime,
      detentionEndTime: deterministicResult.pickupAudit.detentionEndTime,
      freeTimeHours: deterministicResult.pickupAudit.freeTimeHours,
      billableHours: deterministicResult.pickupAudit.billableHours,
      hourlyRate: deterministicResult.pickupAudit.hourlyRate,
      verifiedAmount: deterministicResult.pickupAudit.verifiedAmount,
      punctualityAssessment: deterministicResult.pickupAudit.punctualityAssessment,
      earlyArrivalBufferDeductedMinutes: deterministicResult.pickupAudit.earlyArrivalBufferDeductedMinutes,
      findings: pickupFindings,
    },

    deliveryAudit: {
      status: validatedAi?.deliveryAudit?.status && VALID_FACILITY_STATUSES.has(validatedAi.deliveryAudit.status)
        ? (deterministicResult.deliveryAudit.status === 'needs_review' ? 'needs_review' : validatedAi.deliveryAudit.status)
        : deterministicResult.deliveryAudit.status,
      appointmentTime: deterministicResult.deliveryAudit.appointmentTime,
      arrivalTime: deterministicResult.deliveryAudit.arrivalTime,
      departureTime: deterministicResult.deliveryAudit.departureTime,
      detentionStartTime: deterministicResult.deliveryAudit.detentionStartTime,
      detentionEndTime: deterministicResult.deliveryAudit.detentionEndTime,
      freeTimeHours: deterministicResult.deliveryAudit.freeTimeHours,
      billableHours: deterministicResult.deliveryAudit.billableHours,
      hourlyRate: deterministicResult.deliveryAudit.hourlyRate,
      verifiedAmount: deterministicResult.deliveryAudit.verifiedAmount,
      punctualityAssessment: deterministicResult.deliveryAudit.punctualityAssessment,
      earlyArrivalBufferDeductedMinutes: deterministicResult.deliveryAudit.earlyArrivalBufferDeductedMinutes,
      findings: deliveryFindings,
    },

    totalVerifiedHours: deterministicResult.totalVerifiedHours,
    totalVerifiedAmount: deterministicResult.totalVerifiedAmount,

    evidence: mergedEvidence,
    discrepancies: mergedDiscrepancies,
    missingEvidence: Array.from(mergedMissing),
    reasoningSummary,
  };
}

/**
 * Creates a controlled fallback NEEDS_REVIEW result when AI output fails grounding or JSON validation.
 */
export function buildGroundingFallbackResult(
  deterministicResult: DetentionAuditResult,
  validationErrors: string[]
): DetentionAuditResult {
  const discrepancies: AuditDiscrepancy[] = [
    ...deterministicResult.discrepancies,
    {
      code: 'RATE_CON_FREE_TIME_CONFLICT',
      severity: 'warning',
      description: `AI reconciliation encountered validation errors: ${validationErrors.join('; ')}. Preserved deterministic calculations and flagged for human review.`,
      conflictingSources: ['deterministic_audit'],
      recommendedAction: 'Perform manual dispatcher review of RateCon contract terms and timestamps.',
    },
  ];

  return {
    ...deterministicResult,
    status: 'needs_review',
    requiresHumanReview: true,
    overallConfidence: Math.min(deterministicResult.overallConfidence, 0.70),
    discrepancies,
    reasoningSummary: `AI validation notice: ${validationErrors.slice(0, 2).join('. ')}. Audit preserved using authoritative deterministic calculation pending human review.`,
  };
}

function isUUID(str?: string | null): boolean {
  if (!str) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

/**
 * Checks whether an authenticated user has authorization to access and audit a specific load.
 * Owner Admin: Has access to all loads within their organization.
 * Dispatcher / Staff: Has access ONLY if directly assigned (assigned_dispatcher_id or in load_team_assignments).
 * Rejects cross-organization loads.
 */
export async function checkUserLoadAccess(
  userId: string,
  userRole: string,
  organizationId: string,
  loadId: string
): Promise<boolean> {
  if (!userId || !organizationId || !loadId) return false;

  // 1. Try Supabase admin / database check
  try {
    const admin = getSupabaseAdminSafe();

    // 1a. Direct table query on public.loads (used by service_role and test mocks)
    const { data: loadRow, error: loadErr } = await admin
      .from('loads')
      .select('id, organization_id, assigned_dispatcher_id')
      .eq('id', loadId)
      .maybeSingle();

    if (!loadErr && loadRow) {
      // Cross-organization boundary enforcement
      if (loadRow.organization_id !== organizationId) {
        return false;
      }

      // Owner Admin has full organization access
      if (userRole === 'owner_admin') {
        return true;
      }

      // Employee assignment check (direct)
      if (loadRow.assigned_dispatcher_id === userId) {
        return true;
      }

      // Employee team assignment check
      const { data: teamRow } = await admin
        .from('load_team_assignments')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('load_id', loadId)
        .eq('user_id', userId)
        .maybeSingle();

      if (teamRow) {
        return true;
      }

      return false;
    }

    // 1b. If direct table query didn't find the load (e.g. table RLS applies when using anon client),
    // and both loadId and userId are valid UUIDs, invoke the database SECURITY DEFINER function:
    // public.user_has_load_access(p_load_id UUID, p_user_id UUID)
    if (isUUID(loadId) && isUUID(userId) && typeof (admin as any).rpc === 'function') {
      const { data: hasAccess, error: rpcErr } = await (admin as any).rpc('user_has_load_access', {
        p_load_id: loadId,
        p_user_id: userId,
      });

      if (!rpcErr && typeof hasAccess === 'boolean') {
        if (!hasAccess) {
          return false;
        }

        // Verified load access via database SECURITY DEFINER function.
        // Confirm tenant boundary if load row organization can be checked.
        if (loadRow && (loadRow as any).organization_id && (loadRow as any).organization_id !== organizationId) {
          return false;
        }

        return true;
      }
    }
  } catch {
    // Fall back to loadService in test/demo environments
  }

  // 2. Fallback check via loadService (handles in-memory test mocks and demo orgs)
  try {
    const load = await loadService.getLoadById(organizationId, loadId);
    if (!load || load.organization_id !== organizationId) {
      return false;
    }

    if (userRole === 'owner_admin') {
      return true;
    }

    const isAssigned =
      load.assigned_dispatcher_id === userId ||
      (load.assigned_team && load.assigned_team.some((m) => m.user_id === userId)) ||
      (load.assigned_team_assignments && load.assigned_team_assignments.some((a) => a.user_id === userId));

    return Boolean(isAssigned);
  } catch {
    return false;
  }
}

