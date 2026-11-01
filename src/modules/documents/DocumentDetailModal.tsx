import React, { useState } from 'react';
import {
  FreightDocument,
  DOCUMENT_TYPE_LABELS,
  DOCUMENT_STATUS_LABELS,
  formatDocumentFileSize,
  validateDocumentStatusTransition,
} from './documentTypes.ts';
import { DocumentStatus, UserRole } from '../../types/domain.types.ts';
import { Modal } from '../../components/common/Modal.tsx';
import { StatusBadge } from '../../components/common/StatusBadge.tsx';
import { useTimezone } from '../../contexts/TimezoneContext.tsx';
import { formatInTimezone } from '../../lib/timezones.ts';
import { documentService } from './documentService.ts';
import {
  FileText,
  FileCheck,
  Clock,
  User,
  Building2,
  Download,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  FileSpreadsheet,
  FileImage,
  ExternalLink,
  ShieldCheck,
  ArrowRight,
  Copy,
  Check,
} from 'lucide-react';

interface DocumentDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  document: FreightDocument | null;
  onStatusChange: (doc: FreightDocument, newStatus: DocumentStatus) => Promise<void>;
  onDelete: (doc: FreightDocument) => Promise<void>;
  userRole: UserRole | null;
  onViewLoad?: (loadId: string) => void;
}

export const DocumentDetailModal: React.FC<DocumentDetailModalProps> = ({
  isOpen,
  onClose,
  document,
  onStatusChange,
  onDelete,
  userRole,
  onViewLoad,
}) => {
  const { operationalTimezone } = useTimezone();
  const [isUpdating, setIsUpdating] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{
    type: 'verify' | 'delete' | 'status_change';
    targetStatus?: DocumentStatus;
    title: string;
    prompt: string;
  } | null>(null);

  const [isDownloading, setIsDownloading] = useState(false);

  if (!document) return null;

  const storagePathString =
    document.file_path ||
    `freight-documents/${document.organization_id}/${document.load_id || 'unassigned'}/${document.file_name}`;

  const handleCopyPath = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(storagePathString);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }
  };

  const handleDownload = async () => {
    if (!document.file_path) return;
    setIsDownloading(true);
    try {
      if (documentService.getDownloadUrl) {
        const url = await documentService.getDownloadUrl(document.organization_id, document.file_path);
        if (url) {
          window.open(url, '_blank', 'noopener,noreferrer');
          return;
        }
      }
      if (documentService.downloadStorageFile) {
        const blob = await documentService.downloadStorageFile(document.organization_id, document.file_path);
        if (blob) {
          const blobUrl = URL.createObjectURL(blob);
          const a = window.document.createElement('a');
          a.href = blobUrl;
          a.download = document.file_name || 'document';
          window.document.body.appendChild(a);
          a.click();
          window.document.body.removeChild(a);
          URL.revokeObjectURL(blobUrl);
          return;
        }
      }
    } catch (err) {
      console.warn('Could not download file:', err);
    } finally {
      setIsDownloading(false);
    }
  };

  const canDelete = userRole === 'owner_admin';
  const canVerify = userRole === 'owner_admin' || userRole === 'dispatcher';
  const canChangeStatus = userRole === 'owner_admin' || userRole === 'dispatcher';

  const formattedCreated = formatInTimezone(document.created_at, operationalTimezone, {
    includeDate: true,
    includeTime: true,
    includeTimezoneCode: true,
  });

  const formattedUpdated = formatInTimezone(document.updated_at, operationalTimezone, {
    includeDate: true,
    includeTime: true,
    includeTimezoneCode: true,
  });

  const getDocIcon = (type: string) => {
    switch (type) {
      case 'rate_confirmation':
        return <FileSpreadsheet className="w-5 h-5 text-sky-400" />;
      case 'bol':
        return <FileText className="w-5 h-5 text-purple-400" />;
      case 'pod':
        return <FileCheck className="w-5 h-5 text-emerald-400" />;
      case 'invoice':
        return <FileText className="w-5 h-5 text-indigo-400" />;
      default:
        return <FileImage className="w-5 h-5 text-slate-400" />;
    }
  };

  const handleActionClick = (targetStatus: DocumentStatus) => {
    const loadNum = document.load_number || 'Unassigned';
    const validation = validateDocumentStatusTransition(
      document.doc_status,
      targetStatus,
      document.doc_type,
      loadNum
    );

    if (validation.requiresConfirmation) {
      setConfirmDialog({
        type: targetStatus === 'verified' ? 'verify' : 'status_change',
        targetStatus,
        title: validation.confirmationTitle || 'Confirm Status Update',
        prompt: validation.confirmationPrompt || `Update status to ${DOCUMENT_STATUS_LABELS[targetStatus]}?`,
      });
      return;
    }

    executeStatusChange(targetStatus);
  };

  const executeStatusChange = async (targetStatus: DocumentStatus) => {
    setIsUpdating(true);
    try {
      await onStatusChange(document, targetStatus);
      setConfirmDialog(null);
    } finally {
      setIsUpdating(false);
    }
  };

  const executeDelete = async () => {
    setIsUpdating(true);
    try {
      await onDelete(document);
      setConfirmDialog(null);
      onClose();
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <>
      <Modal
        id="document-detail-modal"
        isOpen={isOpen}
        onClose={onClose}
        title={DOCUMENT_TYPE_LABELS[document.doc_type]}
        subtitle={`Load #${document.load_number || 'Unassigned'} • ${document.file_name || 'Paperwork'}`}
        maxWidth="2xl"
      >
        <div className="space-y-4 text-xs text-slate-200">
          {/* Header Strip */}
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 shrink-0">
                {getDocIcon(document.doc_type)}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-bold text-slate-100">
                    {DOCUMENT_TYPE_LABELS[document.doc_type]}
                  </span>
                  <StatusBadge status={document.doc_status} type="document" size="sm" />
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5 font-mono truncate" title={document.file_name || ''}>
                  {document.file_name || 'No file attached'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-auto shrink-0 flex-wrap">
              {document.file_path && (
                <button
                  type="button"
                  disabled={isDownloading}
                  onClick={handleDownload}
                  className="h-8 inline-flex items-center gap-1.5 px-3 rounded-xl bg-indigo-950/80 hover:bg-indigo-900 border border-indigo-800/80 text-indigo-300 hover:text-indigo-200 font-semibold transition-colors cursor-pointer text-xs disabled:opacity-50"
                  title="Download / View document file"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>{isDownloading ? 'Opening...' : 'Download'}</span>
                </button>
              )}

              {document.load_id && onViewLoad && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onViewLoad(document.load_id!);
                  }}
                  className="h-8 inline-flex items-center gap-1.5 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-sky-400 hover:text-sky-300 font-semibold transition-colors cursor-pointer"
                >
                  <span>Load {document.load_number}</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Associated Load & Route Details */}
          {document.load && (
            <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                  Assigned Load & Lane
                </span>
                {(document.load.client || document.load.broker) && (
                  <span className="text-[11px] text-slate-400">
                    {document.load.client?.company_name || document.load.broker?.company_name}
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between text-xs font-semibold text-slate-100">
                <div className="flex items-center gap-1.5">
                  <span className="px-1.5 py-0.5 rounded-md bg-sky-950/80 text-sky-300 border border-sky-800/60 font-mono text-[11px]">
                    {document.load.origin_state}
                  </span>
                  <span>{document.load.origin_city}</span>
                </div>

                <ArrowRight className="w-3.5 h-3.5 text-indigo-400 shrink-0" />

                <div className="flex items-center gap-1.5">
                  <span>{document.load.dest_city}</span>
                  <span className="px-1.5 py-0.5 rounded-md bg-emerald-950/80 text-emerald-300 border border-emerald-800/60 font-mono text-[11px]">
                    {document.load.dest_state}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Metadata Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3 rounded-xl bg-slate-950/50 border border-slate-800/80 space-y-1">
              <span className="text-[10px] text-slate-400 uppercase font-semibold">File Details</span>
              <p className="font-mono text-slate-200 tabular-nums">{formatDocumentFileSize(document.file_size_bytes)}</p>
              <p className="text-[11px] text-slate-400 font-mono truncate">{document.mime_type || 'Unknown MIME'}</p>
            </div>

            <div className="p-3 rounded-xl bg-slate-950/50 border border-slate-800/80 space-y-1">
              <span className="text-[10px] text-slate-400 uppercase font-semibold">Uploaded By</span>
              <p className="font-medium text-slate-200">{document.uploaded_by || 'Dispatcher'}</p>
              <p className="text-[11px] text-slate-400 font-mono tabular-nums">{formattedCreated}</p>
            </div>

            <div className="p-3 rounded-xl bg-slate-950/50 border border-slate-800/80 space-y-1 sm:col-span-2">
              <span className="text-[10px] text-slate-400 uppercase font-semibold">Audit Timestamps</span>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between text-[11px] text-slate-400 font-mono tabular-nums gap-1">
                <span>Created: {formattedCreated}</span>
                <span>Last Updated: {formattedUpdated}</span>
              </div>
            </div>
          </div>

          {/* Notes & Audit Instructions */}
          {document.notes && (
            <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1.5">
              <div className="flex items-center gap-1.5 text-slate-400 font-semibold text-[10px] uppercase">
                <FileText className="w-3.5 h-3.5 text-indigo-400" />
                <span>Paperwork Notes & Sign-off Details</span>
              </div>
              <p className="text-slate-300 leading-relaxed text-xs whitespace-pre-wrap font-sans">
                {document.notes}
              </p>
            </div>
          )}

          {/* File Storage Reference Container */}
          <div className="p-3.5 rounded-xl border border-slate-800 bg-slate-950/80 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-sky-400" />
                <span className="font-bold text-slate-300 uppercase tracking-wider text-[11px]">
                  Storage Path Reference
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyPath}
                  className="px-2 py-0.5 rounded-md bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 text-[10px] font-mono flex items-center gap-1 cursor-pointer transition-colors"
                  title="Copy storage path"
                >
                  {isCopied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{isCopied ? 'Copied' : 'Copy'}</span>
                </button>
                <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-900 text-slate-400 border border-slate-800 font-mono">
                  Bucket Reference
                </span>
              </div>
            </div>
            <p className="font-mono text-[11px] text-slate-400 bg-slate-900/90 p-2 rounded-lg border border-slate-800/80 break-all select-all">
              {storagePathString}
            </p>
            <p className="text-[11px] text-slate-500">
              Binary storage is mapped to organization security scopes with row-level encryption and access logs.
            </p>
          </div>

          {/* Operational Action Buttons Bar */}
          <div className="pt-3 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
            {/* Delete button (owner_admin only) */}
            {canDelete ? (
              <button
                type="button"
                disabled={isUpdating}
                onClick={() =>
                  setConfirmDialog({
                    type: 'delete',
                    title: `Delete ${DOCUMENT_TYPE_LABELS[document.doc_type]}?`,
                    prompt: `Delete ${DOCUMENT_TYPE_LABELS[document.doc_type]} for Load ${document.load_number || ''}? This removes the record from your workspace.`,
                  })
                }
                className="h-9 inline-flex items-center gap-1.5 px-3 rounded-xl bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-800/60 font-semibold transition-colors cursor-pointer text-xs disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Paperwork</span>
              </button>
            ) : (
              <div />
            )}

            {/* Status updates */}
            <div className="flex flex-wrap items-center gap-2">
              {canChangeStatus && document.doc_status !== 'pending' && (
                <button
                  type="button"
                  disabled={isUpdating}
                  onClick={() => handleActionClick('pending')}
                  className="h-9 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 font-semibold transition-colors cursor-pointer text-xs disabled:opacity-50"
                >
                  Mark Pending
                </button>
              )}

              {canChangeStatus && document.doc_status !== 'received' && (
                <button
                  type="button"
                  disabled={isUpdating}
                  onClick={() => handleActionClick('received')}
                  className="h-9 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-sky-300 font-semibold transition-colors cursor-pointer text-xs disabled:opacity-50"
                >
                  Mark Received
                </button>
              )}

              {canVerify && document.doc_status !== 'verified' && (
                <button
                  type="button"
                  disabled={isUpdating}
                  onClick={() => handleActionClick('verified')}
                  className="h-9 inline-flex items-center gap-1.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold shadow-xs transition-colors cursor-pointer text-xs disabled:opacity-50"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Verify & Approve</span>
                </button>
              )}

              <button
                type="button"
                onClick={onClose}
                className="h-9 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold transition-colors cursor-pointer text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </Modal>

      {/* Confirmation Sub-Modal */}
      {confirmDialog && (
        <Modal
          id="doc-action-confirm-modal"
          isOpen={Boolean(confirmDialog)}
          onClose={() => setConfirmDialog(null)}
          title={confirmDialog.title}
          maxWidth="md"
        >
          <div className="p-5 space-y-4 text-xs text-slate-200">
            <div className="flex items-start gap-3">
              <div
                className={`p-2.5 rounded-xl shrink-0 ${
                  confirmDialog.type === 'delete'
                    ? 'bg-rose-950 text-rose-400 border border-rose-800/60'
                    : 'bg-amber-950 text-amber-400 border border-amber-800/60'
                }`}
              >
                {confirmDialog.type === 'delete' ? (
                  <Trash2 className="w-5 h-5" />
                ) : (
                  <AlertTriangle className="w-5 h-5" />
                )}
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-semibold text-slate-100">{confirmDialog.title}</h4>
                <p className="text-slate-300 leading-relaxed">{confirmDialog.prompt}</p>
                {confirmDialog.type === 'delete' && (
                  <p className="text-[11px] text-rose-400/90 font-mono mt-1">
                    Warning: This document record will be permanently deleted.
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                disabled={isUpdating}
                onClick={() => setConfirmDialog(null)}
                className="h-9 px-3.5 text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isUpdating}
                onClick={() => {
                  if (confirmDialog.type === 'delete') {
                    executeDelete();
                  } else if (confirmDialog.targetStatus) {
                    executeStatusChange(confirmDialog.targetStatus);
                  }
                }}
                className={`h-9 px-4 text-xs font-semibold text-white rounded-xl transition-colors cursor-pointer disabled:opacity-50 ${
                  confirmDialog.type === 'delete'
                    ? 'bg-rose-600 hover:bg-rose-500'
                    : 'bg-emerald-600 hover:bg-emerald-500'
                }`}
              >
                {isUpdating
                  ? 'Processing...'
                  : confirmDialog.type === 'delete'
                  ? 'Confirm Deletion'
                  : 'Confirm Verification'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
};
