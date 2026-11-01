import React from 'react';
import {
  FreightDocument,
  DOCUMENT_TYPE_LABELS,
  DOCUMENT_TYPE_SHORT_LABELS,
  formatDocumentFileSize,
} from './documentTypes.ts';
import { DocumentStatus, UserRole } from '../../types/domain.types.ts';
import { StatusBadge } from '../../components/common/StatusBadge.tsx';
import { useTimezone } from '../../contexts/TimezoneContext.tsx';
import { formatInTimezone } from '../../lib/timezones.ts';
import {
  FileText,
  FileSpreadsheet,
  FileCheck,
  FileImage,
  Eye,
  CheckCircle2,
  Trash2,
  Building2,
  Clock,
  User,
  ShieldCheck,
  Download,
  PackageCheck,
} from 'lucide-react';
import { EmptyState } from '../../components/common/EmptyState.tsx';

interface DocumentListProps {
  documents: FreightDocument[];
  isLoading: boolean;
  onViewDocument: (doc: FreightDocument) => void;
  onVerifyDocument: (doc: FreightDocument) => void;
  onDeleteDocument: (doc: FreightDocument) => void;
  onViewLoad: (loadId: string) => void;
  userRole: UserRole | null;
  onNewDocumentClick: () => void;
  onResetFilters?: () => void;
  hasActiveFilters?: boolean;
  loadsCount?: number;
  clientsCount?: number;
  trucksCount?: number;
  driversCount?: number;
  onNavigate?: (module: any) => void;
}

export const DocumentList: React.FC<DocumentListProps> = ({
  documents,
  isLoading,
  onViewDocument,
  onVerifyDocument,
  onDeleteDocument,
  onViewLoad,
  userRole,
  onNewDocumentClick,
  onResetFilters,
  hasActiveFilters = false,
  loadsCount,
  clientsCount,
  trucksCount,
  driversCount,
  onNavigate,
}) => {
  const { operationalTimezone } = useTimezone();

  const canDelete = userRole === 'owner_admin';
  const canVerify = userRole === 'owner_admin' || userRole === 'dispatcher';

  const getDocTypeIcon = (type: string) => {
    switch (type) {
      case 'rate_confirmation':
        return <FileSpreadsheet className="w-4 h-4 text-sky-400" />;
      case 'bol':
        return <FileText className="w-4 h-4 text-purple-400" />;
      case 'pod':
        return <FileCheck className="w-4 h-4 text-emerald-400" />;
      case 'invoice':
        return <FileText className="w-4 h-4 text-indigo-400" />;
      default:
        return <FileImage className="w-4 h-4 text-slate-400" />;
    }
  };

  if (isLoading) {
    return (
      <div id="documents-loading-skeleton" className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/80 shadow-xs">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-950/90 text-[11px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-800">
            <tr>
              <th className="py-3 px-4">Document Type</th>
              <th className="py-3 px-4">Load #</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4">File Name & Size</th>
              <th className="py-3 px-4">Uploaded By</th>
              <th className="py-3 px-4">Date Uploaded</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {[1, 2, 3, 4, 5].map((i) => (
              <tr key={i} className="animate-pulse">
                <td className="py-3.5 px-4">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-slate-800/70 shrink-0" />
                    <div className="space-y-1.5 flex-1">
                      <div className="h-3.5 w-28 bg-slate-800/80 rounded" />
                      <div className="h-2.5 w-36 bg-slate-800/40 rounded" />
                    </div>
                  </div>
                </td>
                <td className="py-3.5 px-4">
                  <div className="h-6 w-20 bg-slate-800/70 rounded-md" />
                </td>
                <td className="py-3.5 px-4">
                  <div className="h-5 w-16 bg-slate-800/70 rounded-full" />
                </td>
                <td className="py-3.5 px-4">
                  <div className="space-y-1">
                    <div className="h-3 w-32 bg-slate-800/70 rounded" />
                    <div className="h-2.5 w-16 bg-slate-800/40 rounded" />
                  </div>
                </td>
                <td className="py-3.5 px-4">
                  <div className="h-3 w-20 bg-slate-800/70 rounded" />
                </td>
                <td className="py-3.5 px-4">
                  <div className="h-3 w-24 bg-slate-800/70 rounded" />
                </td>
                <td className="py-3.5 px-4 text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    <div className="w-7 h-7 bg-slate-800/60 rounded-lg" />
                    <div className="w-7 h-7 bg-slate-800/60 rounded-lg" />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (documents.length === 0) {
    if (hasActiveFilters) {
      return (
        <div className="p-8 text-center rounded-xl border border-slate-800 bg-slate-900/60 space-y-3">
          <div className="inline-flex p-3 rounded-full bg-slate-800/70 text-slate-400">
            <FileText className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-slate-200">No Matching Paperwork Records</h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              No documents matched your active search query or filter criteria. Try adjusting or clearing your filters.
            </p>
          </div>
          {onResetFilters && (
            <button
              type="button"
              onClick={onResetFilters}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl transition-colors cursor-pointer"
            >
              Reset Filters
            </button>
          )}
        </div>
      );
    }

    if (loadsCount !== undefined && loadsCount === 0) {
      if (clientsCount !== undefined && clientsCount === 0) {
        return (
          <EmptyState
            id="empty-documents-no-clients"
            icon={FileText}
            title="No Freight Paperwork Uploaded"
            description="Upload signed rate confirmations, bills of lading (BOLs), proof of delivery receipts (PODs), or general documents. You can also add carrier clients to organize your fleet."
            actionLabel="Upload Document"
            onAction={onNewDocumentClick}
            secondaryActionLabel={onNavigate ? 'Add Client' : undefined}
            onSecondaryAction={() => onNavigate?.('clients')}
          />
        );
      }
      if (
        (trucksCount !== undefined && trucksCount === 0) ||
        (driversCount !== undefined && driversCount === 0)
      ) {
        return (
          <EmptyState
            id="empty-documents-missing-fleet"
            icon={FileText}
            title="No Freight Paperwork Uploaded"
            description="Upload paperwork or general documents directly. You can also complete fleet setup to attach documents to loads."
            actionLabel="Upload Document"
            onAction={onNewDocumentClick}
            secondaryActionLabel={onNavigate ? (trucksCount === 0 ? 'Add Truck' : 'Add Driver') : undefined}
            onSecondaryAction={() => onNavigate?.(trucksCount === 0 ? 'trucks' : 'drivers')}
          />
        );
      }
      return (
        <EmptyState
          id="empty-documents-no-loads"
          icon={FileText}
          title="No Freight Paperwork Uploaded"
          description="Upload standalone or general paperwork anytime, or create loads to manage dispatched freight."
          actionLabel="Upload Document"
          onAction={onNewDocumentClick}
          secondaryActionLabel={onNavigate ? 'Create First Load' : undefined}
          onSecondaryAction={() => onNavigate?.('loads')}
        />
      );
    }

    return (
      <EmptyState
        id="empty-documents-list"
        icon={FileText}
        title="No Freight Paperwork Uploaded"
        description="Upload signed rate confirmations, bills of lading (BOLs), proof of delivery receipts (PODs), or carrier factoring invoices."
        actionLabel="Upload Document"
        onAction={onNewDocumentClick}
      />
    );
  }

  return (
    <div id="documents-table-container" className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/80 shadow-xs">
      <table className="w-full text-left text-xs text-slate-300">
        <thead className="bg-slate-950/90 text-[11px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-800">
          <tr>
            <th className="py-3 px-4">Document Type</th>
            <th className="py-3 px-4">Load #</th>
            <th className="py-3 px-4">Status</th>
            <th className="py-3 px-4">File Name & Size</th>
            <th className="py-3 px-4">Uploaded By</th>
            <th className="py-3 px-4">Date Uploaded</th>
            <th className="py-3 px-4 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/80">
          {documents.map((doc) => {
            const formattedDate = formatInTimezone(doc.created_at, operationalTimezone, {
              includeDate: true,
              includeTime: true,
            });

            return (
              <tr
                key={doc.id}
                id={`document-row-${doc.id}`}
                onClick={() => onViewDocument(doc)}
                className="hover:bg-slate-800/50 transition-colors cursor-pointer group"
              >
                {/* Document Type + Icon + Route */}
                <td className="py-3.5 px-4">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-slate-950 border border-slate-800 shrink-0 group-hover:border-slate-700">
                      {getDocTypeIcon(doc.doc_type)}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-100 truncate">
                        {DOCUMENT_TYPE_LABELS[doc.doc_type]}
                      </p>
                      {doc.load && (
                        <p className="text-[11px] text-slate-400 font-sans mt-0.5 flex items-center gap-1">
                          <span>{doc.load.origin_city}, {doc.load.origin_state}</span>
                          <span className="text-slate-500">&rarr;</span>
                          <span>{doc.load.dest_city}, {doc.load.dest_state}</span>
                        </p>
                      )}
                    </div>
                  </div>
                </td>

                {/* Load Number & Context */}
                <td className="py-3.5 px-4">
                  {doc.load_number ? (
                    <div className="space-y-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (doc.load_id) onViewLoad(doc.load_id);
                        }}
                        className="px-2 py-0.5 rounded-md bg-slate-950 hover:bg-slate-800 border border-slate-700/80 text-sky-400 hover:text-sky-300 font-mono font-bold text-xs transition-colors cursor-pointer"
                        title="View load operational details"
                      >
                        {doc.load_number}
                      </button>
                      {doc.load && (doc.load.client || doc.load.broker) && (
                        <div className="text-[10px] text-slate-400 truncate max-w-[140px]" title={doc.load.client?.company_name || doc.load.broker?.company_name || ''}>
                          {doc.load.client?.company_name || doc.load.broker?.company_name}
                        </div>
                      )}
                    </div>
                  ) : (
                    <span className="text-slate-500 font-mono text-[11px]">Unlinked</span>
                  )}
                </td>

                {/* Review Status Badge */}
                <td className="py-3.5 px-4">
                  <StatusBadge status={doc.doc_status} type="document" size="sm" />
                </td>

                {/* File Details */}
                <td className="py-3.5 px-4 font-mono text-slate-300">
                  <div className="max-w-[200px] truncate font-sans text-xs text-slate-200" title={doc.file_name || 'Paperwork'}>
                    {doc.file_name || 'Paperwork'}
                  </div>
                  <div className="text-[10px] text-slate-500 tabular-nums">
                    {formatDocumentFileSize(doc.file_size_bytes)}
                  </div>
                </td>

                {/* Uploaded By */}
                <td className="py-3.5 px-4 text-slate-300">
                  <div className="flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    <span className="truncate max-w-[120px] text-xs">{doc.uploaded_by || 'Staff'}</span>
                  </div>
                </td>

                {/* Date Uploaded */}
                <td className="py-3.5 px-4 font-mono tabular-nums text-[11px] text-slate-400">
                  {formattedDate}
                </td>

                {/* Actions */}
                <td className="py-3.5 px-4 text-right">
                  <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                    {/* View Details button */}
                    <button
                      type="button"
                      onClick={() => onViewDocument(doc)}
                      className="p-1.5 rounded-lg text-slate-300 hover:text-slate-100 hover:bg-slate-800 transition-colors cursor-pointer"
                      title="View Paperwork Audit Details"
                    >
                      <Eye className="w-4 h-4" />
                    </button>

                    {/* Quick Verify button */}
                    {canVerify && doc.doc_status !== 'verified' && (
                      <button
                        type="button"
                        onClick={() => onVerifyDocument(doc)}
                        className="p-1.5 rounded-lg text-emerald-400 hover:text-emerald-300 hover:bg-emerald-950/70 border border-transparent hover:border-emerald-800/50 transition-colors cursor-pointer"
                        title="Audit & Approve Document"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                      </button>
                    )}

                    {/* Delete button (owner_admin only) */}
                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => onDeleteDocument(doc)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-950/60 transition-colors cursor-pointer"
                        title="Delete Document Record"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
