import {
  Document as DatabaseDocument,
  DocumentType,
  DocumentStatus,
  PipelineStatus,
  LoadWithRelations,
} from '../../types/domain.types.ts';

// Allowed MIME types for transportation paperwork
export const ALLOWED_DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
] as const;

export type AllowedMimeType = (typeof ALLOWED_DOCUMENT_MIME_TYPES)[number];

export const MAX_DOCUMENT_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15 MB

// Document Type presentation labels
export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  rate_confirmation: 'Rate Confirmation',
  bol: 'Bill of Lading (BOL)',
  pod: 'Proof of Delivery (POD)',
  invoice: 'Freight Invoice',
  other: 'Other / Accessorial',
};

export const DOCUMENT_TYPE_SHORT_LABELS: Record<DocumentType, string> = {
  rate_confirmation: 'Rate Con',
  bol: 'BOL',
  pod: 'POD',
  invoice: 'Invoice',
  other: 'Other',
};

// Document Status presentation labels
export const DOCUMENT_STATUS_LABELS: Record<DocumentStatus, string> = {
  missing: 'Missing',
  pending: 'Pending Review',
  received: 'Received',
  verified: 'Verified & Approved',
};

// Extended Domain Document Model with joined relations
export interface FreightDocument extends DatabaseDocument {
  load_number?: string | null;
  load?: LoadWithRelations | null;
}

// Input for creating a new document metadata record
export interface CreateDocumentInput {
  load_id: string | null;
  doc_type: DocumentType;
  doc_status?: DocumentStatus;
  file_name: string;
  file_size_bytes?: number | null;
  mime_type?: string | null;
  notes?: string | null;
  uploaded_by?: string | null;
}

// Input for updating document metadata or status
export interface UpdateDocumentInput {
  doc_type?: DocumentType;
  doc_status?: DocumentStatus;
  notes?: string | null;
  file_name?: string | null;
  file_size_bytes?: number | null;
  mime_type?: string | null;
  file_path?: string | null;
  uploaded_by?: string | null;
}

// Filter criteria for documents queries
export interface DocumentFilterCriteria {
  search?: string;
  doc_type?: string;
  doc_status?: string;
  load_status?: string;
  load_id?: string;
  date_range?: 'all' | 'today' | 'this_week' | 'this_month';
}

// Checklist item state for load detail & paperwork summary
export interface DocumentChecklistItem {
  doc_type: DocumentType;
  label: string;
  shortLabel: string;
  isRequired: boolean;
  requirementReason: string;
  status: DocumentStatus;
  document: FreightDocument | null;
}

// Paperwork readiness summary for a load
export interface LoadDocumentSummary {
  loadId: string;
  loadNumber: string;
  pipelineStatus: PipelineStatus;
  requiredTypes: DocumentType[];
  receivedTypes: DocumentType[];
  missingTypes: DocumentType[];
  totalRequired: number;
  totalCompleted: number; // received or verified
  isComplete: boolean;
  isReadyToInvoice: boolean;
  checklist: DocumentChecklistItem[];
}

// Aggregated statistical summary for document center
export interface DocumentStats {
  totalDocuments: number;
  pendingVerificationCount: number;
  verifiedCount: number;
  receivedCount: number;
  missingRateConsCount: number;
  missingPODsCount: number;
  readyToInvoiceLoadsCount: number;
}

/**
 * Deterministic helper: returns required document types for a given pipeline status.
 *
 * Sourced & Negotiating: No mandatory paperwork required yet.
 * Booked & In Transit: Rate Confirmation required.
 * Delivered: Rate Confirmation + BOL + POD required.
 * Invoiced & Paid: Rate Confirmation + BOL + POD + Invoice required.
 */
export function getRequiredDocumentsForLoadStatus(status: PipelineStatus): DocumentType[] {
  switch (status) {
    case 'sourced':
    case 'negotiating':
      return [];
    case 'booked':
    case 'in_transit':
      return ['rate_confirmation'];
    case 'delivered':
      return ['rate_confirmation', 'bol', 'pod'];
    case 'invoiced':
    case 'paid':
      return ['rate_confirmation', 'bol', 'pod', 'invoice'];
    default:
      return [];
  }
}

/**
 * Helper to determine if a specific document type is required for a load status.
 */
export function isDocumentRequired(docType: DocumentType, status: PipelineStatus): boolean {
  const requiredList = getRequiredDocumentsForLoadStatus(status);
  return requiredList.includes(docType);
}

/**
 * Status transition validator with operational checks and confirmation prompts.
 */
export interface DocumentStatusTransitionResult {
  allowed: boolean;
  reason?: string;
  requiresConfirmation?: boolean;
  confirmationTitle?: string;
  confirmationPrompt?: string;
}

export function validateDocumentStatusTransition(
  current: DocumentStatus,
  target: DocumentStatus,
  docType: DocumentType,
  loadNumber: string
): DocumentStatusTransitionResult {
  if (current === target) {
    return { allowed: true };
  }

  const docLabel = DOCUMENT_TYPE_SHORT_LABELS[docType] || 'document';

  // Normal progression: missing -> pending -> received -> verified
  if (current === 'missing' && target === 'pending') {
    return { allowed: true };
  }

  if (current === 'missing' && target === 'received') {
    return { allowed: true };
  }

  if (current === 'pending' && target === 'received') {
    return { allowed: true };
  }

  if (current === 'received' && target === 'verified') {
    return {
      allowed: true,
      requiresConfirmation: true,
      confirmationTitle: `Verify ${docLabel}?`,
      confirmationPrompt: `Are you sure you want to verify this ${docLabel} for Load ${loadNumber}? This marks the document as operationally audited and approved.`,
    };
  }

  // Jumping directly from pending to verified
  if (current === 'pending' && target === 'verified') {
    return {
      allowed: true,
      requiresConfirmation: true,
      confirmationTitle: `Verify ${docLabel}?`,
      confirmationPrompt: `Verify and approve this ${docLabel} for Load ${loadNumber}?`,
    };
  }

  // Reverse operational corrections
  if (current === 'verified' && target === 'received') {
    return {
      allowed: true,
      requiresConfirmation: true,
      confirmationTitle: `Reopen ${docLabel}?`,
      confirmationPrompt: `Move this ${docLabel} back to Received status for Load ${loadNumber}? This will revoke verified approval.`,
    };
  }

  if (current === 'received' && target === 'pending') {
    return { allowed: true };
  }

  if (target === 'missing') {
    return {
      allowed: true,
      requiresConfirmation: true,
      confirmationTitle: `Mark ${docLabel} as Missing?`,
      confirmationPrompt: `Reset this ${docLabel} status to Missing for Load ${loadNumber}?`,
    };
  }

  return {
    allowed: true,
  };
}

/**
 * Format file size in human-readable bytes (KB, MB)
 */
export function formatDocumentFileSize(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return '0 KB';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
