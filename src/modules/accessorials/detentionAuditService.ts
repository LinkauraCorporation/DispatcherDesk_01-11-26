/**
 * DispatcherDesk - AI Detention Audit Engine (Phase 2B)
 * File: src/modules/accessorials/detentionAuditService.ts
 *
 * Implements the deterministic evidence aggregation and detention audit foundation:
 * 1. Gathers all available detention evidence for an authorized load (load milestones,
 *    check calls, RateCon terms, BOL/POD documents, activity notes).
 * 2. Normalizes all timestamps to UTC/ISO internally before performing comparisons.
 * 3. Preserves pickup and delivery detention independently.
 * 4. Applies standard US freight detention rules (punctuality/on-time assessment,
 *    early-arrival buffer deduction, 2.0h default free time, 15-minute billing increments,
 *    signed POD verification, and discrepancy cross-checks).
 * 5. Produces a structured, fully typed DetentionAuditResult.
 * 6. Persists the deterministic audit result into public.load_detention_audits (with
 *    resilient offline / demo storage fallback).
 */

import { supabase, isSupabaseConfigured } from '../../lib/supabase.ts';
import {
  AuditStatus,
  FacilityAuditStatus,
  HumanReviewStatus,
  DiscrepancyCode,
  EvidenceSourceType,
  AuditFacilityReport,
  AuditEvidenceItem,
  AuditDiscrepancy,
  DetentionAuditInput,
  DetentionAuditResult,
} from './detentionAuditTypes.ts';
import {
  LoadDetentionAudit,
  LoadDetentionAuditInsert,
  LoadDetentionAuditUpdate,
  LoadDetentionRecord,
} from '../../types/domain.types.ts';
import { loadService } from '../loads/loadService.ts';
import { checkCallService } from '../checkcalls/checkCallService.ts';
import { documentService } from '../documents/documentService.ts';
import { accessorialService } from './accessorialService.ts';
import { activityService } from '../activity/activityService.ts';

const DETENTION_AUDITS_STORAGE_PREFIX = 'dispatchdesk_demo_detention_audits_';
export const DEMO_ORGANIZATION_ID = 'demo-org-1';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUUID(str?: string | null): boolean {
  return Boolean(str && UUID_REGEX.test(str.trim()));
}

function loadFromStorage<T>(key: string, fallback: T): T {
  if (typeof localStorage === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch (err) {
    console.error(`Error loading storage for key ${key}:`, err);
    return fallback;
  }
}

function saveToStorage<T>(key: string, data: T): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (err) {
    console.error(`Error saving storage for key ${key}:`, err);
  }
}

/**
 * Normalizes an arbitrary datetime string or Date object to a standard ISO-8601 UTC string.
 * Returns null if input is empty, null, or invalid.
 */
export function normalizeToIso(timeStr?: string | Date | null): string | null {
  if (!timeStr) return null;
  const d = typeof timeStr === 'string' ? new Date(timeStr) : timeStr;
  const ms = d.getTime();
  return isNaN(ms) ? null : d.toISOString();
}

/**
 * Converts a datetime string or Date to UTC epoch milliseconds.
 * Returns null if invalid or undefined.
 */
export function getTimeMs(timeStr?: string | Date | null): number | null {
  if (!timeStr) return null;
  const d = typeof timeStr === 'string' ? new Date(timeStr) : timeStr;
  const ms = d.getTime();
  return isNaN(ms) ? null : ms;
}

/**
 * Resolves the authoritative effective event timestamp for a check call during detention audit.
 *
 * Operational rules:
 * 1. Explicit event_at is preserved when it represents the genuine event timestamp (e.g. retroactive
 *    or concurrent entry where event_at <= created_at).
 * 2. If event_at is null, empty, or invalid, falls back to created_at.
 * 3. If created_at is null, empty, or invalid, falls back to event_at.
 * 4. In freight operations, an arrival or milestone event cannot physically occur in the future
 *    relative to the database record's creation (e.g. check call created Oct 24, but event_at
 *    stamped Nov 1 as seen in load AFL-2026-1090 due to an anomalous touch/default). When event_at
 *    conflicts with created_at (event_at > created_at), created_at represents the genuine physical
 *    arrival recorded when the check call was logged and is selected.
 */
export function resolveCheckCallEffectiveTime(c?: {
  event_at?: string | Date | null;
  created_at?: string | Date | null;
  eventAt?: string | Date | null;
  createdAt?: string | Date | null;
  call_type?: string | null;
  callType?: string | null;
  [key: string]: any;
} | null): string | null {
  if (!c) return null;

  const rawEvent = c.event_at !== undefined ? c.event_at : c.eventAt;
  const rawCreated = c.created_at !== undefined ? c.created_at : c.createdAt;

  const eventIso = normalizeToIso(rawEvent);
  const createdIso = normalizeToIso(rawCreated);

  if (!eventIso && !createdIso) return null;
  if (!eventIso) return createdIso;
  if (!createdIso) return eventIso;

  const eventMs = getTimeMs(eventIso);
  const createdMs = getTimeMs(createdIso);

  if (eventMs === null || createdMs === null) {
    return eventIso || createdIso;
  }

  // Conflicting timestamps: event_at is in the future relative to the record creation timestamp.
  // In freight logistics, an in-gate/arrival check call cannot occur after the check call was already logged.
  // When event_at > created_at, created_at is the authoritative timestamp of when the event was recorded.
  if (eventMs > createdMs) {
    return createdIso;
  }

  // Legitimate explicit event_at (e.g. retroactive logging where event_at <= created_at, or concurrent logging)
  return eventIso;
}


interface FacilityAuditContext {
  facilityType: 'pickup' | 'delivery';
  appointmentTime: string | null;
  milestoneArrival: string | null;
  milestoneStart: string | null;
  milestoneComplete: string | null;
  milestoneDeparture: string | null;
  matchingCheckCallArrival: { eventAt: string; id: string; notes?: string | null } | null;
  matchingCheckCallDeparture: { eventAt: string; id: string; notes?: string | null } | null;
  freeTimeHours: number;
  hourlyRate: number;
  asOfTime?: string | Date;
  hasPod?: boolean;
  isPodVerified?: boolean;
}

/**
 * Pure deterministic rule engine for a single facility (pickup or delivery).
 */
function auditSingleFacility(ctx: FacilityAuditContext): {
  report: AuditFacilityReport;
  discrepancies: AuditDiscrepancy[];
  evidence: AuditEvidenceItem[];
} {
  const facilityLabel = ctx.facilityType === 'pickup' ? 'Pickup' : 'Delivery';
  const findings: string[] = [];
  const discrepancies: AuditDiscrepancy[] = [];
  const evidence: AuditEvidenceItem[] = [];

  const appointmentIso = normalizeToIso(ctx.appointmentTime);
  const milestoneArrivalIso = normalizeToIso(ctx.milestoneArrival);
  const milestoneDepartureIso = normalizeToIso(ctx.milestoneDeparture || ctx.milestoneComplete);
  const checkCallArrivalIso = ctx.matchingCheckCallArrival ? normalizeToIso(ctx.matchingCheckCallArrival.eventAt) : null;
  const checkCallDepartureIso = ctx.matchingCheckCallDeparture ? normalizeToIso(ctx.matchingCheckCallDeparture.eventAt) : null;

  // 1. Evidence logging: appointment
  if (appointmentIso) {
    evidence.push({
      id: `ev-${ctx.facilityType}-appt`,
      sourceType: 'load_milestone',
      sourceReference: `loads.${ctx.facilityType}_datetime`,
      timestamp: appointmentIso,
      extractedFact: `${facilityLabel} scheduled appointment: ${appointmentIso}`,
      confidence: 1.0,
      supportsClaim: true,
    });
  }

  // 2. Determine effective arrival
  let effectiveArrivalIso: string | null = milestoneArrivalIso || checkCallArrivalIso;
  if (milestoneArrivalIso) {
    evidence.push({
      id: `ev-${ctx.facilityType}-arrival-milestone`,
      sourceType: 'load_milestone',
      sourceReference: `loads.${ctx.facilityType}_arrival_time`,
      timestamp: milestoneArrivalIso,
      extractedFact: `${facilityLabel} stop arrival milestone: ${milestoneArrivalIso}`,
      confidence: 0.95,
      supportsClaim: true,
    });
  }
  if (checkCallArrivalIso && ctx.matchingCheckCallArrival) {
    evidence.push({
      id: `ev-${ctx.facilityType}-arrival-checkcall`,
      sourceType: 'check_call',
      sourceReference: `check_calls.${ctx.matchingCheckCallArrival.id}`,
      timestamp: checkCallArrivalIso,
      extractedFact: `${facilityLabel} in-gate check call: ${checkCallArrivalIso}`,
      confidence: 0.90,
      supportsClaim: true,
    });
  }

  // Cross-verify milestone arrival vs check-call arrival
  if (milestoneArrivalIso && checkCallArrivalIso && ctx.matchingCheckCallArrival) {
    const mArrivalMs = getTimeMs(milestoneArrivalIso)!;
    const cArrivalMs = getTimeMs(checkCallArrivalIso)!;
    const diffMinutes = Math.round(Math.abs(mArrivalMs - cArrivalMs) / 60000);
    if (diffMinutes > 30) {
      discrepancies.push({
        code: 'CHECK_CALL_TIME_MISMATCH',
        severity: 'warning',
        description: `${facilityLabel} arrival milestone (${milestoneArrivalIso}) diverges from check-call timestamp (${checkCallArrivalIso}) by ${diffMinutes} minutes.`,
        conflictingSources: [`loads.${ctx.facilityType}_arrival_time`, `check_calls.${ctx.matchingCheckCallArrival.id}`],
        recommendedAction: 'Verify driver in-gate check call against receiver/shipper gate log.',
      });
    }
  }

  // Determine effective departure
  let effectiveDepartureIso: string | null = milestoneDepartureIso || checkCallDepartureIso;
  if (milestoneDepartureIso) {
    evidence.push({
      id: `ev-${ctx.facilityType}-departure-milestone`,
      sourceType: 'load_milestone',
      sourceReference: `loads.${ctx.facilityType}_departure_time`,
      timestamp: milestoneDepartureIso,
      extractedFact: `${facilityLabel} stop departure milestone: ${milestoneDepartureIso}`,
      confidence: 0.95,
      supportsClaim: true,
    });
  }
  if (checkCallDepartureIso && ctx.matchingCheckCallDeparture) {
    evidence.push({
      id: `ev-${ctx.facilityType}-departure-checkcall`,
      sourceType: 'check_call',
      sourceReference: `check_calls.${ctx.matchingCheckCallDeparture.id}`,
      timestamp: checkCallDepartureIso,
      extractedFact: `${facilityLabel} out-gate check call: ${checkCallDepartureIso}`,
      confidence: 0.90,
      supportsClaim: true,
    });
  }

  // If facility has no recorded arrival or activity, mark as not_applicable
  if (!effectiveArrivalIso) {
    findings.push(`No arrival timestamp recorded for ${facilityLabel.toLowerCase()} facility.`);
    return {
      report: {
        status: 'not_applicable',
        appointmentTime: appointmentIso,
        arrivalTime: null,
        departureTime: null,
        detentionStartTime: null,
        detentionEndTime: null,
        freeTimeHours: ctx.freeTimeHours,
        billableHours: 0.0,
        hourlyRate: ctx.hourlyRate,
        verifiedAmount: 0.0,
        punctualityAssessment: appointmentIso ? 'unknown' : 'not_applicable',
        earlyArrivalBufferDeductedMinutes: 0,
        findings,
      },
      discrepancies,
      evidence,
    };
  }

  const arrivalMs = getTimeMs(effectiveArrivalIso)!;
  let punctuality: 'on_time' | 'early' | 'late' | 'not_applicable' | 'unknown' = 'not_applicable';
  let earlyArrivalBufferDeductedMinutes = 0;
  let detentionBasisMs = arrivalMs;

  // 3. Punctuality assessment
  if (appointmentIso) {
    const apptMs = getTimeMs(appointmentIso)!;
    if (arrivalMs > apptMs) {
      punctuality = 'late';
      const lateMins = Math.round((arrivalMs - apptMs) / 60000);
      findings.push(`Driver arrived ${lateMins} minutes after scheduled appointment (${appointmentIso}).`);

      discrepancies.push({
        code: 'APPOINTMENT_MISMATCH',
        severity: lateMins > 60 ? 'blocker' : 'warning',
        description: `Driver arrived ${lateMins} minutes late past scheduled ${facilityLabel.toLowerCase()} appointment (${appointmentIso}). Standard freight terms may void detention.`,
        conflictingSources: [`loads.${ctx.facilityType}_datetime`, `loads.${ctx.facilityType}_arrival_time`],
        recommendedAction: 'Obtain written broker waiver or confirm facility work-in appointment window.',
      });

      discrepancies.push({
        code: 'BROKER_APPROVAL_REQUIRED',
        severity: 'warning',
        description: `Late arrival at ${facilityLabel.toLowerCase()} requires broker concession or revised rate confirmation to bill detention.`,
        conflictingSources: ['broker_rate_confirmation'],
        recommendedAction: 'Contact broker with carrier delay explanation and proof of facility delay.',
      });
    } else if (apptMs - arrivalMs >= 15 * 60 * 1000) {
      punctuality = 'early';
      earlyArrivalBufferDeductedMinutes = Math.round((apptMs - arrivalMs) / 60000);
      detentionBasisMs = apptMs;
      findings.push(
        `Driver arrived ${earlyArrivalBufferDeductedMinutes}m early. Dwell prior to appointment time (${appointmentIso}) is deducted; free time starts at appointment.`
      );
    } else {
      punctuality = 'on_time';
      findings.push(`Driver arrived on time for appointment (${appointmentIso}).`);
    }
  } else {
    punctuality = 'not_applicable';
    findings.push(`No scheduled appointment recorded; free time starts upon recorded arrival (${effectiveArrivalIso}).`);
  }

  // Hourly rate validation
  if (ctx.hourlyRate <= 0) {
    discrepancies.push({
      code: 'MISSING_HOURLY_RATE',
      severity: 'blocker',
      description: `Agreed detention hourly rate is $0 or missing for ${facilityLabel.toLowerCase()}.`,
      conflictingSources: ['rate_confirmation.accessorial_terms'],
      recommendedAction: 'Verify agreed rate confirmation accessorial terms with broker.',
    });
  }

  // 4. Duration and eligibility calculation
  const freeTimeMs = ctx.freeTimeHours * 3600000;
  let status: FacilityAuditStatus = 'not_eligible';
  let billableHours = 0.0;
  let verifiedAmount = 0.0;
  let detentionStartTime: string | null = null;
  let detentionEndTime: string | null = null;

  if (!effectiveDepartureIso) {
    // Departure is missing
    discrepancies.push({
      code: 'MISSING_DEPARTURE_TIMESTAMP',
      severity: 'warning',
      description: `${facilityLabel} departure timestamp is missing. Final billable detention requires confirmed out-gate or completed loading/unloading timestamp.`,
      conflictingSources: [`loads.${ctx.facilityType}_departure_time`],
      recommendedAction: 'Obtain signed BOL/POD with departure stamp or record driver completion check call.',
    });

    const nowOrAsOfMs = ctx.asOfTime ? getTimeMs(ctx.asOfTime)! : Date.now();
    const currentDwellMs = Math.max(0, nowOrAsOfMs - detentionBasisMs);

    if (currentDwellMs > freeTimeMs) {
      status = 'needs_review';
      const rawDetentionHours = (currentDwellMs - freeTimeMs) / 3600000;
      billableHours = Math.max(0.25, Math.ceil(rawDetentionHours * 4) / 4);
      verifiedAmount = Number((billableHours * ctx.hourlyRate).toFixed(2));
      detentionStartTime = new Date(detentionBasisMs + freeTimeMs).toISOString();
      detentionEndTime = null;
      findings.push(
        `Active dwell exceeds ${ctx.freeTimeHours}h free time by ${(currentDwellMs / 3600000).toFixed(2)}h, but departure timestamp is still pending.`
      );
    } else {
      status = 'not_eligible';
      findings.push(`Current dwell is within ${ctx.freeTimeHours}h free time.`);
    }
  } else {
    // Departure is recorded
    const departureMs = getTimeMs(effectiveDepartureIso)!;

    if (departureMs < arrivalMs) {
      discrepancies.push({
        code: 'ARRIVAL_AFTER_DEPARTURE',
        severity: 'blocker',
        description: `${facilityLabel} departure (${effectiveDepartureIso}) is earlier than arrival (${effectiveArrivalIso}). Invalid timestamp sequence.`,
        conflictingSources: [`loads.${ctx.facilityType}_arrival_time`, `loads.${ctx.facilityType}_departure_time`],
        recommendedAction: 'Correct facility arrival and departure milestone timestamps.',
      });
      status = 'needs_review';
      findings.push(`Invalid timeline: departure is recorded before arrival.`);
    } else {
      const totalDwellMs = departureMs - detentionBasisMs;
      const totalDwellHours = totalDwellMs / 3600000;

      if (totalDwellMs <= freeTimeMs) {
        status = 'not_eligible';
        billableHours = 0.0;
        verifiedAmount = 0.0;
        detentionStartTime = null;
        detentionEndTime = null;
        findings.push(
          `Released within free time. Total dwell: ${totalDwellHours.toFixed(2)}h (free time: ${ctx.freeTimeHours}h).`
        );
      } else {
        const rawDetentionHours = (totalDwellMs - freeTimeMs) / 3600000;
        billableHours = Math.max(0.25, Math.ceil(rawDetentionHours * 4) / 4);
        verifiedAmount = Number((billableHours * ctx.hourlyRate).toFixed(2));
        detentionStartTime = new Date(detentionBasisMs + freeTimeMs).toISOString();
        detentionEndTime = effectiveDepartureIso;

        findings.push(
          `Dwell of ${totalDwellHours.toFixed(2)}h exceeded ${ctx.freeTimeHours}h free time by ${rawDetentionHours.toFixed(2)}h. Billable: ${billableHours}h @ $${ctx.hourlyRate}/hr = $${verifiedAmount.toFixed(2)}.`
        );

        if (punctuality === 'late') {
          status = 'needs_review';
          findings.push(`Detention flagged as Needs Review due to unexcused late arrival.`);
        } else if (totalDwellHours > 6.0) {
          status = 'needs_review';
          discrepancies.push({
            code: 'BROKER_APPROVAL_REQUIRED',
            severity: 'warning',
            description: `Extreme dwell of ${totalDwellHours.toFixed(1)}h at ${facilityLabel.toLowerCase()} requires broker supervisor authorization.`,
            conflictingSources: ['carrier_detention_claim'],
            recommendedAction: 'Submit detention claim letter with dock logs directly to broker operations lead.',
          });
          findings.push(`Extreme dwell (${totalDwellHours.toFixed(1)}h) flagged for human supervisor review.`);
        } else {
          status = 'eligible';
          findings.push(`Detention criteria fully verified and eligible for billing.`);
        }
      }
    }
  }

  // Delivery-specific POD / Stamped BOL verification
  if (ctx.facilityType === 'delivery' && (status === 'eligible' || billableHours > 0)) {
    if (ctx.hasPod === false || ctx.isPodVerified === false) {
      discrepancies.push({
        code: 'MISSING_SIGNED_POD',
        severity: 'warning',
        description:
          'Signed Proof of Delivery (POD) / Stamped BOL is missing or unverified. Most freight brokers require stamped in/out times on the delivery receipt before approving detention payments.',
        conflictingSources: ['documents.pod'],
        recommendedAction: 'Upload receiver-stamped signed POD with receiver in/out gate times.',
      });
      findings.push(`Signed POD delivery receipt missing or unverified.`);
    } else {
      evidence.push({
        id: 'ev-delivery-pod-verified',
        sourceType: 'bol_pod',
        sourceReference: 'documents.pod',
        timestamp: effectiveDepartureIso,
        extractedFact: 'Signed Proof of Delivery (POD) is verified and attached.',
        confidence: 0.95,
        supportsClaim: true,
      });
    }
  }

  return {
    report: {
      status,
      appointmentTime: appointmentIso,
      arrivalTime: effectiveArrivalIso,
      departureTime: effectiveDepartureIso,
      detentionStartTime,
      detentionEndTime,
      freeTimeHours: ctx.freeTimeHours,
      billableHours,
      hourlyRate: ctx.hourlyRate,
      verifiedAmount,
      punctualityAssessment: punctuality,
      earlyArrivalBufferDeductedMinutes,
      findings,
    },
    discrepancies,
    evidence,
  };
}

/**
 * Pure deterministic detention audit engine.
 * Accepts a structured DetentionAuditInput and evaluates eligibility, punctuality,
 * dwell time, billing, and discrepancies using freight rules.
 */
export function auditDetentionEligibility(
  input: DetentionAuditInput,
  asOfTime?: string | Date
): DetentionAuditResult {
  const allDiscrepancies: AuditDiscrepancy[] = [];
  const allEvidence: AuditEvidenceItem[] = [];
  const missingEvidence: string[] = [];

  const freeTimeHours =
    input.rateConTerms?.freeTimeHours !== null && input.rateConTerms?.freeTimeHours !== undefined
      ? input.rateConTerms.freeTimeHours
      : 2.0;

  const hourlyRate =
    input.rateConTerms?.hourlyRate !== null && input.rateConTerms?.hourlyRate !== undefined
      ? input.rateConTerms.hourlyRate
      : 75.0;

  // RateCon Evidence
  if (input.rateConTerms?.hasRateCon) {
    allEvidence.push({
      id: 'ev-ratecon-terms',
      sourceType: 'rate_con',
      sourceReference: 'rate_confirmation',
      timestamp: null,
      extractedFact: `RateCon terms: ${freeTimeHours}h free time, $${hourlyRate}/hr detention rate.`,
      confidence: 0.95,
      supportsClaim: true,
    });
  } else {
    missingEvidence.push('Rate Confirmation (RateCon) document or verified ratecon terms');
  }

  // Find matching check calls
  const pickupArrivedCall =
    input.checkCalls.find((c) => c.callType === 'arrived_pickup' || c.callType === 'at_pickup') || null;
  const pickupDepartedCall =
    input.checkCalls.find((c) => c.callType === 'loaded' || c.callType === 'en_route_delivery') || null;

  const deliveryArrivedCall =
    input.checkCalls.find((c) => c.callType === 'arrived_delivery' || c.callType === 'at_delivery') || null;
  const deliveryDepartedCall =
    input.checkCalls.find((c) => c.callType === 'delivered') || null;

  // Document checks
  const podDoc = input.documentEvidence.find(
    (d) => d.docType === 'pod' || (d.docType === 'bol' && d.status === 'verified')
  );
  const hasPod = Boolean(podDoc);
  const isPodVerified = podDoc?.status === 'verified';

  if (!hasPod) {
    missingEvidence.push('Signed Proof of Delivery (POD) / Stamped BOL');
  }

  // Audit Pickup
  let pickupAudit: AuditFacilityReport;
  if (input.facilityScope === 'delivery') {
    pickupAudit = {
      status: 'not_applicable',
      appointmentTime: normalizeToIso(input.loadContext.pickupDatetime),
      arrivalTime: null,
      departureTime: null,
      detentionStartTime: null,
      detentionEndTime: null,
      freeTimeHours,
      billableHours: 0.0,
      hourlyRate,
      verifiedAmount: 0.0,
      punctualityAssessment: 'not_applicable',
      earlyArrivalBufferDeductedMinutes: 0,
      findings: ['Pickup facility excluded by audit scope (delivery only).'],
    };
  } else {
    const pickupRes = auditSingleFacility({
      facilityType: 'pickup',
      appointmentTime: input.loadContext.pickupDatetime,
      milestoneArrival: input.loadContext.pickupArrival,
      milestoneStart: input.loadContext.pickupLoadingStart,
      milestoneComplete: input.loadContext.pickupLoadingComplete,
      milestoneDeparture: input.loadContext.pickupDeparture,
      matchingCheckCallArrival: pickupArrivedCall
        ? {
            ...pickupArrivedCall,
            eventAt: resolveCheckCallEffectiveTime(pickupArrivedCall) || pickupArrivedCall.eventAt,
          }
        : null,
      matchingCheckCallDeparture: pickupDepartedCall
        ? {
            ...pickupDepartedCall,
            eventAt: resolveCheckCallEffectiveTime(pickupDepartedCall) || pickupDepartedCall.eventAt,
          }
        : null,
      freeTimeHours,
      hourlyRate,
      asOfTime,
    });
    pickupAudit = pickupRes.report;
    allDiscrepancies.push(...pickupRes.discrepancies);
    allEvidence.push(...pickupRes.evidence);
  }

  // Audit Delivery
  let deliveryAudit: AuditFacilityReport;
  if (input.facilityScope === 'pickup') {
    deliveryAudit = {
      status: 'not_applicable',
      appointmentTime: normalizeToIso(input.loadContext.deliveryDatetime),
      arrivalTime: null,
      departureTime: null,
      detentionStartTime: null,
      detentionEndTime: null,
      freeTimeHours,
      billableHours: 0.0,
      hourlyRate,
      verifiedAmount: 0.0,
      punctualityAssessment: 'not_applicable',
      earlyArrivalBufferDeductedMinutes: 0,
      findings: ['Delivery facility excluded by audit scope (pickup only).'],
    };
  } else {
    const deliveryRes = auditSingleFacility({
      facilityType: 'delivery',
      appointmentTime: input.loadContext.deliveryDatetime,
      milestoneArrival: input.loadContext.deliveryArrival,
      milestoneStart: input.loadContext.deliveryUnloadingStart,
      milestoneComplete: input.loadContext.deliveryUnloadingComplete,
      milestoneDeparture: input.loadContext.deliveryDeparture,
      matchingCheckCallArrival: deliveryArrivedCall
        ? {
            ...deliveryArrivedCall,
            eventAt: resolveCheckCallEffectiveTime(deliveryArrivedCall) || deliveryArrivedCall.eventAt,
          }
        : null,
      matchingCheckCallDeparture: deliveryDepartedCall
        ? {
            ...deliveryDepartedCall,
            eventAt: resolveCheckCallEffectiveTime(deliveryDepartedCall) || deliveryDepartedCall.eventAt,
          }
        : null,
      freeTimeHours,
      hourlyRate,
      asOfTime,
      hasPod,
      isPodVerified,
    });
    deliveryAudit = deliveryRes.report;
    allDiscrepancies.push(...deliveryRes.discrepancies);
    allEvidence.push(...deliveryRes.evidence);
  }

  // Activity notes evidence
  input.activityNotes.forEach((act) => {
    if (act.type === 'check_call' || act.content.toLowerCase().includes('detention') || act.content.toLowerCase().includes('delay')) {
      allEvidence.push({
        id: `ev-act-${act.id}`,
        sourceType: 'activity_note',
        sourceReference: `activity_notes.${act.id}`,
        timestamp: normalizeToIso(act.timestamp),
        extractedFact: `Note by ${act.authorName}: ${act.content}`,
        confidence: 0.85,
        supportsClaim: true,
      });
    }
  });

  // Calculate totals
  const totalVerifiedHours = Number((pickupAudit.billableHours + deliveryAudit.billableHours).toFixed(2));
  const totalVerifiedAmount = Number((pickupAudit.verifiedAmount + deliveryAudit.verifiedAmount).toFixed(2));

  // Determine overall audit status
  let overallStatus: AuditStatus = 'not_eligible';
  const hasBlocker = allDiscrepancies.some((d) => d.severity === 'blocker');
  const hasFacilityReview = pickupAudit.status === 'needs_review' || deliveryAudit.status === 'needs_review';

  if (hasBlocker || hasFacilityReview) {
    overallStatus = 'needs_review';
  } else if (pickupAudit.status === 'eligible' || deliveryAudit.status === 'eligible') {
    overallStatus = 'eligible';
  } else {
    overallStatus = 'not_eligible';
  }

  // Calculate confidence score (0.00 - 1.00)
  let confidence = 0.95;
  if (!input.rateConTerms?.hasRateCon) confidence -= 0.15;
  if (hasBlocker) confidence -= 0.25;
  const warningsCount = allDiscrepancies.filter((d) => d.severity === 'warning').length;
  confidence -= warningsCount * 0.08;
  if (!hasPod && (deliveryAudit.status === 'eligible' || deliveryAudit.billableHours > 0)) confidence -= 0.1;
  const overallConfidence = Math.max(0.15, Math.min(0.98, Math.round(confidence * 100) / 100));

  // Determine if human review is required
  const requiresHumanReview =
    overallStatus === 'needs_review' ||
    hasBlocker ||
    warningsCount > 0 ||
    pickupAudit.punctualityAssessment === 'late' ||
    deliveryAudit.punctualityAssessment === 'late' ||
    (!pickupAudit.departureTime && pickupAudit.status === 'eligible') ||
    (!deliveryAudit.departureTime && deliveryAudit.status === 'eligible');

  // Build reasoning summary
  const summaryParts: string[] = [];
  summaryParts.push(`Detention Audit for Load #${input.loadContext.loadNumber}: Status: ${overallStatus.toUpperCase()}.`);

  if (pickupAudit.status !== 'not_applicable') {
    summaryParts.push(
      `Pickup: ${pickupAudit.status} (${pickupAudit.billableHours}h billable, $${pickupAudit.verifiedAmount.toFixed(2)}).`
    );
  }
  if (deliveryAudit.status !== 'not_applicable') {
    summaryParts.push(
      `Delivery: ${deliveryAudit.status} (${deliveryAudit.billableHours}h billable, $${deliveryAudit.verifiedAmount.toFixed(2)}).`
    );
  }
  summaryParts.push(
    `Total Verified: ${totalVerifiedHours}h = $${totalVerifiedAmount.toFixed(2)} (Confidence: ${(overallConfidence * 100).toFixed(0)}%).`
  );

  if (allDiscrepancies.length > 0) {
    summaryParts.push(
      `${allDiscrepancies.length} discrepancy(s) identified: [${allDiscrepancies.map((d) => d.code).join(', ')}].`
    );
  }

  const reasoningSummary = summaryParts.join(' ');

  return {
    loadId: input.loadId,
    status: overallStatus,
    overallConfidence,
    requiresHumanReview,
    pickupAudit,
    deliveryAudit,
    totalVerifiedHours,
    totalVerifiedAmount,
    evidence: allEvidence,
    discrepancies: allDiscrepancies,
    missingEvidence,
    reasoningSummary,
  };
}

/**
 * Service orchestrating deterministic detention auditing, evidence gathering,
 * and database persistence into public.load_detention_audits.
 */
export class DetentionAuditService {
  // Load concurrency locks for local memory/fallback synchronization and in-process coordination
  private loadLocks: Map<string, Promise<void>> = new Map();

  private async withLoadLock<T>(loadId: string, fn: () => Promise<T>): Promise<T> {
    const prevLock = this.loadLocks.get(loadId) || Promise.resolve();
    let releaseLock: () => void = () => {};
    const lockPromise = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    const currentWait = prevLock.then(
      () => {},
      () => {}
    );
    this.loadLocks.set(loadId, lockPromise);

    try {
      await currentWait;
      return await fn();
    } finally {
      releaseLock();
      if (this.loadLocks.get(loadId) === lockPromise) {
        this.loadLocks.delete(loadId);
      }
    }
  }
  public async gatherDetentionEvidence(
    organizationId: string,
    loadId: string,
    options?: {
      facilityScope?: 'all' | 'pickup' | 'delivery';
      client?: any;
    }
  ): Promise<DetentionAuditInput> {
    if (!organizationId || !loadId) {
      throw new Error('Organization ID and Load ID are required to gather detention evidence.');
    }

    const client = options?.client;
    let load: any = null;

    if (client) {
      try {
        const { data: loadRow, error: loadErr } = await client
          .from('loads')
          .select('*')
          .eq('id', loadId)
          .eq('organization_id', organizationId)
          .maybeSingle();

        if (!loadErr && loadRow) {
          load = loadRow;
        }
      } catch (clientErr) {
        console.warn('[gatherDetentionEvidence] Client query load error:', clientErr);
      }
    }

    // Fallback to loadService if not retrieved via client
    if (!load) {
      load = await loadService.getLoadById(organizationId, loadId);
    }

    if (!load || load.organization_id !== organizationId) {
      throw new Error('Load not found or unauthorized for the current organization.');
    }

    // 2. Fetch check calls
    let checkCalls: any[] = [];
    if (client) {
      try {
        const { data: ccData, error: ccErr } = await client
          .from('check_calls')
          .select('*')
          .eq('load_id', loadId)
          .eq('organization_id', organizationId)
          .order('created_at', { ascending: true });
        if (!ccErr && ccData) {
          checkCalls = ccData;
        }
      } catch (ccErr) {
        console.warn('[gatherDetentionEvidence] Client query check_calls error:', ccErr);
      }
    }
    if (checkCalls.length === 0) {
      try {
        checkCalls = await checkCallService.getCheckCalls(organizationId, loadId);
      } catch {
        checkCalls = [];
      }
    }

    // 3. Fetch documents
    let documents: any[] = [];
    if (client) {
      try {
        const { data: docData, error: docErr } = await client
          .from('documents')
          .select('*')
          .eq('load_id', loadId)
          .eq('organization_id', organizationId);
        if (!docErr && docData) {
          documents = docData;
        }
      } catch (docErr) {
        console.warn('[gatherDetentionEvidence] Client query documents error:', docErr);
      }
    }
    if (documents.length === 0 && !client) {
      documents = await documentService.listDocuments(organizationId, { load_id: loadId });
    }

    // 4. RateCon terms extraction or defaults
    const rateConDoc = documents.find((d: any) => d.doc_type === 'rate_confirmation');
    let freeTimeHours: number = 2.0;
    let hourlyRate: number = 75.0;
    let hasRateCon = Boolean(rateConDoc);
    let specialInstructions = load.special_instructions || null;

    if (rateConDoc && rateConDoc.notes) {
      const notesLower = rateConDoc.notes.toLowerCase();
      const rateMatch = notesLower.match(/\$(\d+)(?:\/hr|\s*per\s*hour)/);
      if (rateMatch && rateMatch[1]) {
        hourlyRate = parseFloat(rateMatch[1]);
      }
      const freeTimeMatch = notesLower.match(/(\d+(?:\.\d+)?)\s*h(?:ou)?rs?\s*free/);
      if (freeTimeMatch && freeTimeMatch[1]) {
        freeTimeHours = parseFloat(freeTimeMatch[1]);
      }
    }

    // Also check if any existing detention record has established agreed terms
    let detentionRecords: any[] = [];
    if (client) {
      try {
        const { data: detData, error: detErr } = await client
          .from('load_detention_records')
          .select('*')
          .eq('load_id', loadId)
          .eq('organization_id', organizationId)
          .order('created_at', { ascending: false });
        if (!detErr && detData) {
          detentionRecords = detData;
        }
      } catch (detErr) {
        console.warn('[gatherDetentionEvidence] Client query detention_records error:', detErr);
      }
    }
    if (detentionRecords.length === 0 && !client) {
      detentionRecords = await accessorialService.getDetentionRecords(organizationId, loadId);
    }
    if (detentionRecords && detentionRecords.length > 0) {
      const latestDet = detentionRecords[0];
      if (latestDet.hourly_rate && latestDet.hourly_rate > 0) {
        hourlyRate = Number(latestDet.hourly_rate);
      }
      if (latestDet.free_time_hours && latestDet.free_time_hours > 0) {
        freeTimeHours = Number(latestDet.free_time_hours);
      }
    }

    // 5. Activity notes mapping
    let rawActivities: any[] = [];
    try {
      rawActivities = await activityService.getActivities(organizationId, loadId);
    } catch {
      rawActivities = [];
    }

    const activityNotes = rawActivities.map((act) => ({
      id: act.id,
      type: act.type || 'system_event',
      content: act.description || act.title || '',
      timestamp: act.timestamp || new Date().toISOString(),
      authorName: act.actorName || 'System',
    }));

    return {
      loadId,
      facilityScope: options?.facilityScope || 'all',
      loadContext: {
        loadNumber: load.load_number,
        pickupDatetime: load.pickup_datetime || null,
        pickupTimezone: load.origin_timezone || 'America/Chicago',
        deliveryDatetime: load.delivery_datetime || null,
        deliveryTimezone: load.dest_timezone || 'America/Chicago',
        operationalTimezone: load.operational_timezone || load.origin_timezone || 'America/Chicago',
        pipelineStatus: load.pipeline_status,
        pickupArrival: load.pickup_arrival_time || null,
        pickupLoadingStart: load.pickup_loading_start_time || null,
        pickupLoadingComplete: load.pickup_loading_complete_time || null,
        pickupDeparture: load.pickup_departure_time || null,
        deliveryArrival: load.delivery_arrival_time || null,
        deliveryUnloadingStart: load.delivery_unloading_start_time || null,
        deliveryUnloadingComplete: load.delivery_unloading_complete_time || null,
        deliveryDeparture: load.delivery_departure_time || null,
      },
      rateConTerms: {
        hasRateCon,
        freeTimeHours,
        hourlyRate,
        detentionNoticeTerms: null,
        specialInstructions,
      },
      checkCalls: checkCalls
        .map((c) => ({
          id: c.id,
          callType: c.call_type || c.callType,
          status: c.status,
          eventAt: resolveCheckCallEffectiveTime(c) || c.created_at || c.event_at || '',
          notes: c.notes,
          locationCity: c.location_city || c.locationCity || null,
          locationState: c.location_state || c.locationState || null,
          created_at: c.created_at || c.createdAt || null,
          event_at: c.event_at || c.eventAt || null,
        }))
        .sort((a, b) => {
          const aMs = getTimeMs(a.eventAt) ?? 0;
          const bMs = getTimeMs(b.eventAt) ?? 0;
          return aMs - bMs;
        }),
      documentEvidence: documents.map((d) => ({
        id: d.id,
        docType: (d.doc_type as 'rate_confirmation' | 'bol' | 'pod' | 'invoice' | 'other') || 'other',
        status: (d.doc_status as 'missing' | 'pending' | 'received' | 'verified') || 'received',
        fileName: d.file_name || 'document.pdf',
        notes: d.notes,
        uploadedAt: d.created_at,
      })),
      activityNotes,
      driverMessages: [],
    };
  }

  /**
   * Runs the full deterministic audit for a load and persists the result to public.load_detention_audits.
   */
  public async runDeterministicAudit(
    organizationId: string,
    loadId: string,
    options?: {
      detentionRecordId?: string;
      facilityScope?: 'all' | 'pickup' | 'delivery';
      asOfTime?: string | Date;
      createdBy?: string;
    }
  ): Promise<{ result: DetentionAuditResult; persistedAudit: LoadDetentionAudit }> {
    // 1. Gather all available evidence
    const input = await this.gatherDetentionEvidence(organizationId, loadId, {
      facilityScope: options?.facilityScope,
    });

    // 2. Run deterministic calculation
    const result = auditDetentionEligibility(input, options?.asOfTime);

    // 3. Link existing detention record if available and not explicitly provided
    let detentionRecordId = options?.detentionRecordId || null;
    if (!detentionRecordId) {
      try {
        const records = await accessorialService.getDetentionRecords(organizationId, loadId);
        if (records && records.length > 0) {
          detentionRecordId = records[0].id;
        }
      } catch {
        // Non-fatal
      }
    }

    // 4. Persist audit to public.load_detention_audits
    const persistedAudit = await this.saveAuditResult(organizationId, result, {
      detentionRecordId: detentionRecordId || undefined,
      createdBy: options?.createdBy,
    });

    result.auditId = persistedAudit.id;

    return { result, persistedAudit };
  }

  /**
   * Persists an audit result into public.load_detention_audits (or localStorage in offline/demo mode).
   */
  public async saveAuditResult(
    organizationId: string,
    result: DetentionAuditResult,
    options?: { detentionRecordId?: string; createdBy?: string; auditVersion?: number; client?: any }
  ): Promise<LoadDetentionAudit> {
    if (!organizationId || !result.loadId) {
      throw new Error('Organization ID and Load ID are required to persist a detention audit.');
    }

    return this.withLoadLock(result.loadId, async () => {
      const payloadToInsert: LoadDetentionAuditInsert = {
        organization_id: organizationId,
        load_id: result.loadId,
        detention_record_id: options?.detentionRecordId || null,
        audit_version: options?.auditVersion,
        audit_status: result.status,
        overall_confidence: result.overallConfidence,
        requires_human_review: result.requiresHumanReview,
        pickup_status: result.pickupAudit.status,
        pickup_appointment_time: result.pickupAudit.appointmentTime,
        pickup_arrival_time: result.pickupAudit.arrivalTime,
        pickup_departure_time: result.pickupAudit.departureTime,
        pickup_detention_start: result.pickupAudit.detentionStartTime,
        pickup_detention_end: result.pickupAudit.detentionEndTime,
        pickup_free_time_hours: result.pickupAudit.freeTimeHours,
        pickup_billable_hours: result.pickupAudit.billableHours,
        pickup_hourly_rate: result.pickupAudit.hourlyRate,
        pickup_verified_amount: result.pickupAudit.verifiedAmount,
        delivery_status: result.deliveryAudit.status,
        delivery_appointment_time: result.deliveryAudit.appointmentTime,
        delivery_arrival_time: result.deliveryAudit.arrivalTime,
        delivery_departure_time: result.deliveryAudit.departureTime,
        delivery_detention_start: result.deliveryAudit.detentionStartTime,
        delivery_detention_end: result.deliveryAudit.detentionEndTime,
        delivery_free_time_hours: result.deliveryAudit.freeTimeHours,
        delivery_billable_hours: result.deliveryAudit.billableHours,
        delivery_hourly_rate: result.deliveryAudit.hourlyRate,
        delivery_verified_amount: result.deliveryAudit.verifiedAmount,
        total_verified_hours: result.totalVerifiedHours,
        total_verified_amount: result.totalVerifiedAmount,
        evidence: result.evidence as any,
        discrepancies: result.discrepancies as any,
        missing_evidence: result.missingEvidence as any,
        reasoning_summary: result.reasoningSummary,
        human_review_status: 'pending',
        created_by: (options?.createdBy && isUUID(options.createdBy)) ? options.createdBy : null,
      };

      let persistedRecord: LoadDetentionAudit | null = null;
      const dbClient = options?.client || supabase;

      if (isSupabaseConfigured && isUUID(organizationId) && isUUID(result.loadId)) {
        try {
          // 1. Primary approach: atomic database RPC with pg_advisory_xact_lock
          const { data, error } = await (dbClient.rpc as any)('save_load_detention_audit_atomic', {
            p_audit_data: payloadToInsert,
          });

          if (!error && data) {
            persistedRecord = data as LoadDetentionAudit;
          } else if (error) {
            // If RPC is missing in remote database schema (e.g. migration pending), fallback to direct insert with retry
            if (error.code === 'PGRST202' || error.message?.includes('function') || error.message?.includes('not found')) {
              persistedRecord = await this.saveAuditDirectWithRetry(organizationId, result.loadId, payloadToInsert, 3, dbClient);
            } else {
              console.error('[DetentionAuditService] Supabase atomic RPC error:', error);
              throw new Error(error.message || 'Database error saving detention audit.');
            }
          }
        } catch (err) {
          if (err instanceof Error && err.message.includes('Database error')) throw err;
          console.warn('[DetentionAuditService] Supabase atomic insert failed, saving locally:', err);
        }
      }

      if (!persistedRecord) {
        // Fallback to storage: calculate next version dynamically at point-of-commit
        const storageKey = `${DETENTION_AUDITS_STORAGE_PREFIX}${organizationId}`;
        const records = loadFromStorage<LoadDetentionAudit[]>(storageKey, []);
        const loadAudits = records.filter((r) => r.load_id === result.loadId);
        const resolvedVersion =
          options?.auditVersion ||
          (loadAudits.length > 0 ? Math.max(...loadAudits.map((a) => a.audit_version || 1)) + 1 : 1);

        const now = new Date().toISOString();
        persistedRecord = {
          id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          ...payloadToInsert,
          audit_version: resolvedVersion,
          overall_confidence: result.overallConfidence,
          requires_human_review: result.requiresHumanReview,
          pickup_free_time_hours: result.pickupAudit.freeTimeHours,
          pickup_billable_hours: result.pickupAudit.billableHours,
          pickup_hourly_rate: result.pickupAudit.hourlyRate,
          pickup_verified_amount: result.pickupAudit.verifiedAmount,
          delivery_free_time_hours: result.deliveryAudit.freeTimeHours,
          delivery_billable_hours: result.deliveryAudit.billableHours,
          delivery_hourly_rate: result.deliveryAudit.hourlyRate,
          delivery_verified_amount: result.deliveryAudit.verifiedAmount,
          total_verified_hours: result.totalVerifiedHours,
          total_verified_amount: result.totalVerifiedAmount,
          human_review_status: 'pending',
          human_reviewed_by: null,
          human_reviewed_by_name: null,
          human_reviewed_at: null,
          human_override_notes: null,
          created_at: now,
          updated_at: now,
        } as LoadDetentionAudit;

        records.unshift(persistedRecord);
        saveToStorage(storageKey, records);
      }

      return persistedRecord;
    });
  }

  /**
   * Direct insert fallback with retry on unique constraint violation (code 23505)
   */
  private async saveAuditDirectWithRetry(
    organizationId: string,
    loadId: string,
    payload: LoadDetentionAuditInsert,
    maxRetries = 3,
    customClient?: any
  ): Promise<LoadDetentionAudit | null> {
    const client = customClient || supabase;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        let versionToUse = payload.audit_version;
        if (!versionToUse) {
          const { data: latestRows } = await (client.from('load_detention_audits' as any) as any)
            .select('audit_version')
            .eq('load_id', loadId)
            .order('audit_version', { ascending: false })
            .limit(1);

          const maxVer = (latestRows && latestRows.length > 0 && latestRows[0].audit_version)
            ? latestRows[0].audit_version
            : 0;
          versionToUse = maxVer + 1;
        }

        const toInsert = { ...payload, audit_version: versionToUse };
        const { data, error } = await (client.from('load_detention_audits' as any) as any)
          .insert(toInsert)
          .select()
          .single();

        if (!error && data) {
          return data as LoadDetentionAudit;
        }

        if (error && (error.code === '23505' || error.message?.includes('uq_load_detention_audits_load_version'))) {
          // Unique violation retry: reset payload.audit_version and retry
          payload.audit_version = undefined;
          continue;
        }

        if (error) {
          throw new Error(error.message || 'Database error saving detention audit.');
        }
      } catch (err: any) {
        if (attempt === maxRetries - 1) throw err;
      }
    }
    return null;
  }

  /**
   * Retrieves all detention audits for a load.
   */
  public async getAuditsByLoad(organizationId: string, loadId: string): Promise<LoadDetentionAudit[]> {
    if (!organizationId || !loadId) return [];

    if (isSupabaseConfigured && isUUID(organizationId) && isUUID(loadId)) {
      try {
        const { data, error } = await (supabase.from('load_detention_audits' as any) as any)
          .select('*')
          .eq('organization_id', organizationId)
          .eq('load_id', loadId)
          .order('created_at', { ascending: false });

        if (!error && data) {
          return data as LoadDetentionAudit[];
        }
      } catch (err) {
        console.warn('[DetentionAuditService] Supabase getAuditsByLoad error:', err);
      }
    }

    const storageKey = `${DETENTION_AUDITS_STORAGE_PREFIX}${organizationId}`;
    const records = loadFromStorage<LoadDetentionAudit[]>(storageKey, []);
    return records
      .filter((r) => r.load_id === loadId)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  /**
   * Retrieves the latest detention audit for a load.
   */
  public async getLatestAuditForLoad(organizationId: string, loadId: string): Promise<LoadDetentionAudit | null> {
    const audits = await this.getAuditsByLoad(organizationId, loadId);
    return audits.length > 0 ? audits[0] : null;
  }

  /**
   * Retrieves the latest accepted detention audit for a load.
   */
  public async getLatestAcceptedAuditForLoad(organizationId: string, loadId: string): Promise<LoadDetentionAudit | null> {
    const audits = await this.getAuditsByLoad(organizationId, loadId);
    return audits.find((a) => a.human_review_status === 'accepted') || null;
  }

  /**
   * Retrieves an audit by its ID.
   */
  public async getAuditById(organizationId: string, auditId: string): Promise<LoadDetentionAudit | null> {
    if (!organizationId || !auditId) return null;

    if (isSupabaseConfigured && isUUID(organizationId) && isUUID(auditId)) {
      try {
        const { data, error } = await (supabase.from('load_detention_audits' as any) as any)
          .select('*')
          .eq('organization_id', organizationId)
          .eq('id', auditId)
          .maybeSingle();

        if (!error && data) {
          return data as LoadDetentionAudit;
        }
      } catch (err) {
        console.warn('[DetentionAuditService] Supabase getAuditById error:', err);
      }
    }

    const storageKey = `${DETENTION_AUDITS_STORAGE_PREFIX}${organizationId}`;
    const records = loadFromStorage<LoadDetentionAudit[]>(storageKey, []);
    return records.find((r) => r.id === auditId) || null;
  }

  /**
   * Updates human review status and override notes for an audit record.
   */
  public async updateHumanReview(
    organizationId: string,
    auditId: string,
    reviewData: {
      status: 'accepted' | 'overridden' | 'rejected' | 'pending';
      notes?: string;
      reviewedBy?: string | null;
      reviewerName?: string | null;
    }
  ): Promise<LoadDetentionAudit> {
    const reviewedAt = new Date().toISOString();

    if (isSupabaseConfigured && isUUID(organizationId) && isUUID(auditId)) {
      try {
        const updatePayload: Record<string, any> = {
          human_review_status: reviewData.status,
          human_override_notes: reviewData.notes || null,
          human_reviewed_by: (reviewData.reviewedBy && isUUID(reviewData.reviewedBy)) ? reviewData.reviewedBy : null,
          human_reviewed_by_name: reviewData.reviewerName || null,
          human_reviewed_at: reviewedAt,
          updated_at: reviewedAt,
        };

        const { data, error } = await (supabase.from('load_detention_audits' as any) as any)
          .update(updatePayload)
          .eq('organization_id', organizationId)
          .eq('id', auditId)
          .select()
          .single();

        if (!error && data) {
          return data as LoadDetentionAudit;
        }
        if (error) {
          console.warn('[DetentionAuditService] Supabase updateHumanReview error:', error);
        }
      } catch (err) {
        console.warn('[DetentionAuditService] Supabase updateHumanReview exception:', err);
      }
    }

    // Storage fallback
    const storageKey = `${DETENTION_AUDITS_STORAGE_PREFIX}${organizationId}`;
    const records = loadFromStorage<LoadDetentionAudit[]>(storageKey, []);
    const index = records.findIndex((r) => r.id === auditId);
    if (index === -1) {
      throw new Error(`Detention audit record not found: ${auditId}`);
    }

    const updated: LoadDetentionAudit = {
      ...records[index],
      human_review_status: reviewData.status,
      human_override_notes: reviewData.notes || null,
      human_reviewed_by: (reviewData.reviewedBy && isUUID(reviewData.reviewedBy)) ? reviewData.reviewedBy : null,
      human_reviewed_by_name: reviewData.reviewerName || null,
      human_reviewed_at: reviewedAt,
      updated_at: reviewedAt,
    };

    records[index] = updated;
    saveToStorage(storageKey, records);
    return updated;
  }

  /**
   * Calls server-side AI detention audit endpoint.
   */
  public async runAiAuditViaEndpoint(
    organizationId: string,
    loadId: string,
    options?: { facilityScope?: 'all' | 'pickup' | 'delivery'; detentionRecordId?: string }
  ): Promise<{
    success: boolean;
    audit?: LoadDetentionAudit;
    result?: DetentionAuditResult;
    executionMode?: string;
    error?: string;
    code?: string;
    statusCode?: number;
  }> {
    let token = 'demo-token';
    try {
      const { data } = await supabase.auth.getSession();
      if (data?.session?.access_token) {
        token = data.session.access_token;
      }
    } catch {
      // ignore session lookup failure
    }

    try {
      const res = await fetch('/api/ai/detention/audit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'x-organization-id': organizationId,
        },
        body: JSON.stringify({
          organizationId,
          loadId,
          facilityScope: options?.facilityScope || 'all',
          detentionRecordId: options?.detentionRecordId,
        }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        return {
          success: false,
          statusCode: res.status,
          error:
            json.error ||
            (res.status === 401
              ? 'Authentication required to access detention audit engine.'
              : res.status === 403
              ? 'Forbidden: Requesting user is not authorized to audit this load.'
              : res.status === 429
              ? 'Too many requests: Rate limit exceeded. Please wait a moment.'
              : 'Detention audit service encountered an error.'),
          code: json.code,
        };
      }

      return {
        success: true,
        statusCode: 200,
        audit: json.audit,
        result: json.result,
        executionMode: json.executionMode,
      };
    } catch (err: any) {
      return {
        success: false,
        statusCode: 0,
        error: err?.message || 'Network error executing AI detention audit.',
      };
    }
  }
}

export const detentionAuditService = new DetentionAuditService();
