import {
  PipelineStatus,
  EquipmentType,
} from '../../types/domain.types.ts';
import { LoadWithRelations } from '../loads/loadTypes.ts';

export type PipelineStageType = 'operational' | 'financial';

export interface PipelineColumnDef {
  id: PipelineStatus;
  label: string;
  shortLabel: string;
  description: string;
  stageType: PipelineStageType;
  stepNumber: number;
}

export const PIPELINE_COLUMNS: PipelineColumnDef[] = [
  {
    id: 'sourced',
    label: 'Sourced',
    shortLabel: 'SRC',
    description: 'DAT/Truckstop loads identified or rate quotes requested',
    stageType: 'operational',
    stepNumber: 1,
  },
  {
    id: 'negotiating',
    label: 'Negotiating',
    shortLabel: 'NEG',
    description: 'Rate & accessorial terms in negotiation with broker',
    stageType: 'operational',
    stepNumber: 2,
  },
  {
    id: 'booked',
    label: 'Booked',
    shortLabel: 'BKD',
    description: 'Rate Con signed & dispatched to driver / truck',
    stageType: 'operational',
    stepNumber: 3,
  },
  {
    id: 'in_transit',
    label: 'In Transit',
    shortLabel: 'TRN',
    description: 'Freight loaded and rolling on highway to consignee',
    stageType: 'operational',
    stepNumber: 4,
  },
  {
    id: 'delivered',
    label: 'Delivered',
    shortLabel: 'DEL',
    description: 'Receiver unloaded freight; pending signed POD submission',
    stageType: 'financial',
    stepNumber: 5,
  },
  {
    id: 'invoiced',
    label: 'Invoiced',
    shortLabel: 'INV',
    description: 'Invoice submitted to broker or factoring assignment',
    stageType: 'financial',
    stepNumber: 6,
  },
  {
    id: 'paid',
    label: 'Paid',
    shortLabel: 'PAD',
    description: 'Payment settled, remittance reconciled & finalized',
    stageType: 'financial',
    stepNumber: 7,
  },
];

export interface PipelineFilterCriteria {
  search?: string;
  clientId?: string;
  brokerId?: string;
  equipmentType?: string;
  dateRange?: 'all' | 'today' | 'upcoming' | 'past';
}

export interface StatusTransitionResult {
  allowed: boolean;
  reason?: string;
  suggestedNextStatus?: PipelineStatus;
  requiresConfirmation?: boolean;
  confirmationTitle?: string;
  confirmationPrompt?: string;
}

/**
 * Valid forward & backward transitions in standard dispatching operations.
 * Canonical matrix:
 * sourced -> negotiating, booked
 * negotiating -> sourced, booked
 * booked -> sourced, negotiating, in_transit
 * in_transit -> booked, delivered
 * delivered -> in_transit, invoiced
 * invoiced -> delivered, paid
 * paid -> terminal
 */
const ALLOWED_FORWARD_TRANSITIONS: Record<PipelineStatus, PipelineStatus[]> = {
  sourced: ['negotiating', 'booked'],
  negotiating: ['booked'],
  booked: ['in_transit'],
  in_transit: ['delivered'],
  delivered: ['invoiced'],
  invoiced: ['paid'],
  paid: [],
};

const ALLOWED_BACKWARD_TRANSITIONS: Record<PipelineStatus, PipelineStatus[]> = {
  sourced: [],
  negotiating: ['sourced'],
  booked: ['negotiating', 'sourced'],
  in_transit: ['booked'],
  delivered: ['in_transit'],
  invoiced: ['delivered'],
  paid: [],
};

/**
 * Returns human-readable label for a pipeline status
 */
export function getPipelineStatusLabel(status: PipelineStatus): string {
  const col = PIPELINE_COLUMNS.find((c) => c.id === status);
  return col ? col.label : status.replace('_', ' ');
}

/**
 * Returns all valid transition targets from a current status.
 */
export function getAllowedTransitions(currentStatus: PipelineStatus): PipelineStatus[] {
  const forward = ALLOWED_FORWARD_TRANSITIONS[currentStatus] || [];
  const backward = ALLOWED_BACKWARD_TRANSITIONS[currentStatus] || [];
  return [...forward, ...backward];
}

/**
 * Validates whether moving from currentStatus to targetStatus complies with trucking operations.
 */
export function validateStatusTransition(
  currentStatus: PipelineStatus,
  targetStatus: PipelineStatus
): StatusTransitionResult {
  if (currentStatus === targetStatus) {
    return { allowed: true };
  }

  // Terminal state protection: paid loads cannot be transitioned
  if (currentStatus === 'paid') {
    return {
      allowed: false,
      reason: 'Paid loads are finalized and settled (terminal). Status cannot be changed.',
    };
  }

  const allowedForward = ALLOWED_FORWARD_TRANSITIONS[currentStatus] || [];
  const allowedBackward = ALLOWED_BACKWARD_TRANSITIONS[currentStatus] || [];

  // Check valid forward step
  if (allowedForward.includes(targetStatus)) {
    // Critical financial transition checks
    if (currentStatus === 'delivered' && targetStatus === 'invoiced') {
      return {
        allowed: true,
        requiresConfirmation: true,
        confirmationTitle: 'Confirm Invoice Submission',
        confirmationPrompt: 'Are you ready to mark this load as Invoiced and submit settlement documentation?',
      };
    }

    if (currentStatus === 'invoiced' && targetStatus === 'paid') {
      return {
        allowed: true,
        requiresConfirmation: true,
        confirmationTitle: 'Confirm Payment Settlement',
        confirmationPrompt: 'Has payment been received and remittance settled in full for this load?',
      };
    }

    return { allowed: true };
  }

  // Check valid backward correction step
  if (allowedBackward.includes(targetStatus)) {
    return { allowed: true };
  }

  // Invalid multi-step transition explanation
  const nextTarget = allowedForward[0];
  const prevTarget = allowedBackward[0];

  const currentLabel = getPipelineStatusLabel(currentStatus);
  const targetLabel = getPipelineStatusLabel(targetStatus);
  const nextLabel = nextTarget ? getPipelineStatusLabel(nextTarget) : undefined;

  let reason = `Cannot move load directly from "${currentLabel}" to "${targetLabel}".`;
  if (nextLabel) {
    reason += ` Please advance this load to "${nextLabel}" first.`;
  } else if (prevTarget) {
    reason += ` Move to "${getPipelineStatusLabel(prevTarget)}" for adjustments.`;
  }

  return {
    allowed: false,
    reason,
    suggestedNextStatus: nextTarget,
  };
}

export interface ColumnSummaryMetrics {
  count: number;
  totalGross: number;
  totalMiles: number;
  averageRpm: number;
}
