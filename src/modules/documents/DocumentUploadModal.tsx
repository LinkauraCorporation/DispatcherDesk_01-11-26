import React, { useState, useRef, useEffect } from 'react';
import { Load, DocumentType, DocumentStatus, Client, Driver, Truck, Broker } from '../../types/domain.types.ts';
import {
  CreateDocumentInput,
  DOCUMENT_TYPE_LABELS,
  ALLOWED_DOCUMENT_MIME_TYPES,
  MAX_DOCUMENT_FILE_SIZE_BYTES,
  formatDocumentFileSize,
} from './documentTypes.ts';
import { Modal } from '../../components/common/Modal.tsx';
import {
  Upload,
  FileText,
  FileSpreadsheet,
  FileImage,
  FileCheck,
  AlertCircle,
  CheckCircle2,
  X,
  Building2,
  AlertTriangle,
  User,
  Truck as TruckIcon,
  Briefcase,
} from 'lucide-react';

export type DocumentRelationType = 'load' | 'client' | 'driver' | 'truck' | 'broker' | 'general';

interface DocumentUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpload: (input: CreateDocumentInput, file?: File) => Promise<void>;
  loads: Load[];
  clients?: Client[];
  drivers?: Driver[];
  trucks?: Truck[];
  brokers?: Broker[];
  initialLoadId?: string;
  initialDocType?: DocumentType;
  isUploading?: boolean;
  onOpenAIExtraction?: () => void;
}

export const DocumentUploadModal: React.FC<DocumentUploadModalProps> = ({
  isOpen,
  onClose,
  onUpload,
  loads,
  clients = [],
  drivers = [],
  trucks = [],
  brokers = [],
  initialLoadId,
  initialDocType = 'rate_confirmation',
  isUploading = false,
  onOpenAIExtraction,
}) => {
  const [relationType, setRelationType] = useState<DocumentRelationType>(() => {
    if (initialLoadId) return 'load';
    if (loads.length > 0) return 'load';
    return 'general';
  });
  const [selectedLoadId, setSelectedLoadId] = useState<string>(initialLoadId || (loads[0]?.id || ''));
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [selectedDriverId, setSelectedDriverId] = useState<string>('');
  const [selectedTruckId, setSelectedTruckId] = useState<string>('');
  const [selectedBrokerId, setSelectedBrokerId] = useState<string>('');
  const [docType, setDocType] = useState<DocumentType>(initialDocType);
  const [docStatus, setDocStatus] = useState<DocumentStatus>('received');
  const [notes, setNotes] = useState<string>('');
  const [rawFile, setRawFile] = useState<File | null>(null);
  const [selectedFile, setSelectedFile] = useState<{
    name: string;
    size: number;
    type: string;
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync initial load if passed
  useEffect(() => {
    if (initialLoadId) {
      setRelationType('load');
      setSelectedLoadId(initialLoadId);
    }
  }, [initialLoadId]);

  useEffect(() => {
    if (initialDocType) {
      setDocType(initialDocType);
    }
  }, [initialDocType]);

  const handleFileSelection = (file: File) => {
    setErrorMessage(null);

    // MIME type check
    const isAllowedType = ALLOWED_DOCUMENT_MIME_TYPES.some((type) => {
      if (file.type === type) return true;
      // Handle extension fallbacks for docx or specific images
      if (file.name.endsWith('.docx') && type.includes('wordprocessingml')) return true;
      if (file.name.endsWith('.pdf') && type === 'application/pdf') return true;
      return false;
    });

    if (!isAllowedType && file.type) {
      setErrorMessage(
        `Unsupported file format (${file.type}). Allowed formats: PDF, PNG, JPG, WEBP, DOCX.`
      );
      return;
    }

    // Size check
    if (file.size > MAX_DOCUMENT_FILE_SIZE_BYTES) {
      setErrorMessage(
        `File size (${formatDocumentFileSize(file.size)}) exceeds maximum limit of 15 MB.`
      );
      return;
    }

    setRawFile(file);
    setSelectedFile({
      name: file.name,
      size: file.size,
      type: file.type || 'application/pdf',
    });
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelection(e.dataTransfer.files[0]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (relationType === 'load' && !selectedLoadId) {
      setErrorMessage('Please select a load to associate this paperwork with.');
      return;
    }

    if (!selectedFile) {
      setErrorMessage('Please select or drop a document file to upload.');
      return;
    }

    let finalLoadId: string | null = null;
    let entityContext = '';

    if (relationType === 'load') {
      finalLoadId = selectedLoadId || null;
    } else if (relationType === 'client') {
      finalLoadId = null;
      const client = clients.find((c) => c.id === selectedClientId);
      if (client) {
        entityContext = `[Client: ${client.company_name}]`;
      }
    } else if (relationType === 'driver') {
      finalLoadId = null;
      const driver = drivers.find((d) => d.id === selectedDriverId);
      if (driver) {
        entityContext = `[Driver: ${driver.full_name}]`;
      }
    } else if (relationType === 'truck') {
      finalLoadId = null;
      const truck = trucks.find((t) => t.id === selectedTruckId);
      if (truck) {
        entityContext = `[Truck: #${truck.truck_number}]`;
      }
    } else if (relationType === 'broker') {
      finalLoadId = null;
      const broker = brokers.find((b) => b.id === selectedBrokerId);
      if (broker) {
        entityContext = `[Broker: ${broker.company_name}]`;
      }
    } else {
      finalLoadId = null;
    }

    const trimmedNotes = notes.trim();
    const finalNotes = entityContext
      ? (trimmedNotes ? `${entityContext} ${trimmedNotes}` : entityContext)
      : (trimmedNotes || null);

    try {
      await onUpload(
        {
          load_id: finalLoadId,
          doc_type: docType,
          doc_status: docStatus,
          file_name: selectedFile.name,
          file_size_bytes: selectedFile.size,
          mime_type: selectedFile.type,
          notes: finalNotes,
          uploaded_by: 'Dispatcher',
        },
        rawFile || undefined
      );

      // Reset form state on success
      setRawFile(null);
      setSelectedFile(null);
      setNotes('');
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to upload document.';
      setErrorMessage(msg);
    }
  };

  const selectedLoad = loads.find((l) => l.id === selectedLoadId);

  return (
    <Modal
      id="document-upload-modal"
      isOpen={isOpen}
      onClose={onClose}
      title="Upload Freight Paperwork"
      subtitle="Attach Rate Confirmations, Signed BOLs, Delivery Receipts, or Invoices"
      maxWidth="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4 p-1 text-xs text-slate-200">
        {errorMessage && (
          <div className="p-3 rounded-xl bg-rose-950/80 border border-rose-800 text-rose-200 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Relation Type Selector */}
        <div className="space-y-1.5">
          <label className="block text-slate-300 font-semibold">
            Associate Paperwork With
          </label>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
            {[
              { type: 'load' as const, label: 'Load' },
              { type: 'client' as const, label: 'Client' },
              { type: 'driver' as const, label: 'Driver' },
              { type: 'truck' as const, label: 'Truck' },
              { type: 'broker' as const, label: 'Broker' },
              { type: 'general' as const, label: 'General' },
            ].map((item) => (
              <button
                key={item.type}
                type="button"
                id={`relation-type-${item.type}`}
                onClick={() => setRelationType(item.type)}
                className={`py-1.5 px-2 text-xs font-semibold rounded-lg border transition-all text-center cursor-pointer truncate ${
                  relationType === item.type
                    ? 'bg-indigo-600 border-indigo-500 text-white shadow-xs'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* Load Selector */}
        {relationType === 'load' && (
          <div className="space-y-1.5">
            <label htmlFor="doc-load-select" className="block text-slate-300 font-semibold">
              Associated Dispatch Load <span className="text-rose-400">*</span>
            </label>
            <select
              id="doc-load-select"
              value={selectedLoadId}
              onChange={(e) => setSelectedLoadId(e.target.value)}
              required
              className="w-full h-9 px-3 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 cursor-pointer"
            >
              <option value="">-- Select a Load --</option>
              {loads.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.load_number} ({l.origin_state} &rarr; {l.dest_state}) • {l.pipeline_status.toUpperCase()}
                </option>
              ))}
            </select>
            {selectedLoad && (
              <p className="text-[11px] text-slate-400 font-sans">
                Lane: {selectedLoad.origin_city}, {selectedLoad.origin_state} &rarr;{' '}
                {selectedLoad.dest_city}, {selectedLoad.dest_state}
              </p>
            )}
            {loads.length === 0 && (
              <p className="text-[11px] text-amber-400 font-sans">
                No loads found. You can choose another relation type or upload as General / Unrelated.
              </p>
            )}
          </div>
        )}

        {/* Client Selector */}
        {relationType === 'client' && (
          <div className="space-y-1.5">
            <label htmlFor="doc-client-select" className="block text-slate-300 font-semibold">
              Associated Carrier Client
            </label>
            <select
              id="doc-client-select"
              value={selectedClientId}
              onChange={(e) => setSelectedClientId(e.target.value)}
              className="w-full h-9 px-3 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 cursor-pointer"
            >
              <option value="">-- Select a Carrier Client --</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.company_name} ({c.client_type.replace('_', ' ')})
                </option>
              ))}
            </select>
            {clients.length === 0 && (
              <p className="text-[11px] text-amber-400 font-sans">
                No carrier clients found. Document will be recorded with standalone intake.
              </p>
            )}
          </div>
        )}

        {/* Driver Selector */}
        {relationType === 'driver' && (
          <div className="space-y-1.5">
            <label htmlFor="doc-driver-select" className="block text-slate-300 font-semibold">
              Associated Driver
            </label>
            <select
              id="doc-driver-select"
              value={selectedDriverId}
              onChange={(e) => setSelectedDriverId(e.target.value)}
              className="w-full h-9 px-3 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 cursor-pointer"
            >
              <option value="">-- Select a Driver --</option>
              {drivers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.full_name} {d.phone ? `(${d.phone})` : ''}
                </option>
              ))}
            </select>
            {drivers.length === 0 && (
              <p className="text-[11px] text-amber-400 font-sans">
                No drivers registered yet. Document will be recorded with standalone intake.
              </p>
            )}
          </div>
        )}

        {/* Truck Selector */}
        {relationType === 'truck' && (
          <div className="space-y-1.5">
            <label htmlFor="doc-truck-select" className="block text-slate-300 font-semibold">
              Associated Truck / Equipment
            </label>
            <select
              id="doc-truck-select"
              value={selectedTruckId}
              onChange={(e) => setSelectedTruckId(e.target.value)}
              className="w-full h-9 px-3 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 cursor-pointer"
            >
              <option value="">-- Select a Truck --</option>
              {trucks.map((t) => (
                <option key={t.id} value={t.id}>
                  Truck #{t.truck_number} ({t.equipment_type}) {t.vin ? `• VIN ${t.vin.slice(-6)}` : ''}
                </option>
              ))}
            </select>
            {trucks.length === 0 && (
              <p className="text-[11px] text-amber-400 font-sans">
                No trucks registered yet. Document will be recorded with standalone intake.
              </p>
            )}
          </div>
        )}

        {/* Broker Selector */}
        {relationType === 'broker' && (
          <div className="space-y-1.5">
            <label htmlFor="doc-broker-select" className="block text-slate-300 font-semibold">
              Associated Broker / Shipper
            </label>
            <select
              id="doc-broker-select"
              value={selectedBrokerId}
              onChange={(e) => setSelectedBrokerId(e.target.value)}
              className="w-full h-9 px-3 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 cursor-pointer"
            >
              <option value="">-- Select a Broker --</option>
              {brokers.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.company_name} {b.mc_number ? `(MC #${b.mc_number})` : ''}
                </option>
              ))}
            </select>
            {brokers.length === 0 && (
              <p className="text-[11px] text-amber-400 font-sans">
                No brokers listed yet. Document will be recorded with standalone intake.
              </p>
            )}
          </div>
        )}

        {/* General / Unrelated */}
        {relationType === 'general' && (
          <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 text-slate-400 text-xs flex items-center gap-2">
            <FileText className="w-4 h-4 text-slate-400 shrink-0" />
            <span>Uploading as a general standalone document without entity association.</span>
          </div>
        )}

        {/* Document Type & Initial Status */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label htmlFor="doc-type-select" className="block text-slate-300 font-semibold">
              Paperwork Type <span className="text-rose-400">*</span>
            </label>
            <select
              id="doc-type-select"
              value={docType}
              onChange={(e) => setDocType(e.target.value as DocumentType)}
              required
              className="w-full h-9 px-3 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 cursor-pointer"
            >
              <option value="rate_confirmation">Rate Confirmation</option>
              <option value="bol">Bill of Lading (BOL)</option>
              <option value="pod">Proof of Delivery (POD)</option>
              <option value="invoice">Freight Invoice</option>
              <option value="other">Other / Accessorial</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="doc-status-select" className="block text-slate-300 font-semibold">
              Review Status
            </label>
            <select
              id="doc-status-select"
              value={docStatus}
              onChange={(e) => setDocStatus(e.target.value as DocumentStatus)}
              className="w-full h-9 px-3 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 cursor-pointer"
            >
              <option value="received">Received (Ready for Audit)</option>
              <option value="pending">Pending Additional Review</option>
              <option value="verified">Verified & Approved</option>
            </select>
          </div>
        </div>

        {/* AI OCR Assistant Banner for Rate Confirmations */}
        {docType === 'rate_confirmation' && onOpenAIExtraction && (
          <div className="p-3.5 rounded-xl bg-indigo-950/40 border border-indigo-800/60 flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="p-2 rounded-xl bg-indigo-900/60 text-indigo-300 shrink-0">
                <FileSpreadsheet className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-slate-100">AI Rate Con OCR & Extraction</p>
                <p className="text-[11px] text-slate-400">
                  Automatically parse broker, rate, route, and accessorials with mandatory dispatcher review.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenAIExtraction();
              }}
              className="h-8 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition-colors shrink-0 cursor-pointer shadow-xs"
            >
              Launch AI OCR
            </button>
          </div>
        )}

        {/* File Dropzone & Picker */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="block text-slate-300 font-semibold">
              Select Document File <span className="text-rose-400">*</span>
            </label>
            {/* Format Chips */}
            <div className="flex items-center gap-1 font-mono text-[10px]">
              <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400">PDF</span>
              <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400">PNG</span>
              <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400">JPG</span>
              <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400">WEBP</span>
            </div>
          </div>

          <input
            type="file"
            ref={fileInputRef}
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                handleFileSelection(e.target.files[0]);
              }
            }}
            accept=".pdf,.png,.jpg,.jpeg,.webp,.docx"
            className="hidden"
          />

          {!selectedFile ? (
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`p-6 border-2 border-dashed rounded-xl flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
                isDragOver
                  ? 'border-indigo-500 bg-indigo-950/40 text-indigo-300 ring-2 ring-indigo-500/20'
                  : 'border-slate-800 bg-slate-950/70 hover:bg-slate-950 hover:border-slate-700'
              }`}
            >
              <div className="p-3 rounded-full bg-slate-900 border border-slate-800 mb-2">
                <Upload className="w-5 h-5 text-indigo-400" />
              </div>
              <p className="font-semibold text-slate-200 text-xs">
                Click to browse or drag and drop paperwork here
              </p>
              <p className="text-[11px] text-slate-400 mt-1 font-mono tabular-nums">
                Maximum file size: 15 MB
              </p>
            </div>
          ) : (
            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-2 rounded-xl bg-indigo-950/80 border border-indigo-800/60 text-indigo-400 shrink-0">
                  <FileCheck className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-slate-100 text-xs truncate" title={selectedFile.name}>
                    {selectedFile.name}
                  </p>
                  <p className="text-[11px] text-slate-400 font-mono tabular-nums">
                    {formatDocumentFileSize(selectedFile.size)} • {selectedFile.type || 'Document'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedFile(null)}
                className="p-1.5 text-slate-400 hover:text-rose-400 rounded-lg hover:bg-slate-900 transition-colors cursor-pointer shrink-0"
                title="Remove file"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* Notes */}
        <div className="space-y-1.5">
          <label htmlFor="doc-notes-input" className="block text-slate-300 font-semibold">
            Paperwork Audit Notes & Exceptions
          </label>
          <textarea
            id="doc-notes-input"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Clean signed BOL with seal # matched; Receiver stamped delivery time 14:30..."
            className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 placeholder-slate-600 resize-none"
          />
        </div>

        {/* Actions Bar */}
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            disabled={isUploading}
            className="h-9 px-4 text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isUploading || !selectedFile || (relationType === 'load' && !selectedLoadId)}
            className="h-9 inline-flex items-center gap-2 px-5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            <Upload className="w-4 h-4" />
            <span>{isUploading ? 'Uploading...' : 'Save Paperwork'}</span>
          </button>
        </div>
      </form>
    </Modal>
  );
};
