import React, { useState, useEffect, useCallback } from 'react';
import {
  FreightDocument,
  DocumentFilterCriteria,
  CreateDocumentInput,
  DocumentStats,
  LoadDocumentSummary,
  DOCUMENT_TYPE_LABELS,
} from './documentTypes.ts';
import { Load, DocumentStatus, PipelineStatus } from '../../types/domain.types.ts';
import { documentService } from './documentService.ts';
import { loadService } from '../loads/loadService.ts';
import { LoadWithRelations } from '../loads/loadTypes.ts';
import { DocumentList } from './DocumentList.tsx';
import { DocumentFilters } from './DocumentFilters.tsx';
import { DocumentUploadModal } from './DocumentUploadModal.tsx';
import { DocumentDetailModal } from './DocumentDetailModal.tsx';
import { RateConExtractionModal } from './RateConExtractionModal.tsx';
import { LoadDetailModal } from '../loads/LoadDetailModal.tsx';
import { Modal } from '../../components/common/Modal.tsx';
import { MetricCard } from '../../components/common/MetricCard.tsx';
import { TaskModal } from '../tasks/TaskModal.tsx';
import { TaskCategory, TaskPriority } from '../tasks/taskTypes.ts';
import { useAuth } from '../../contexts/AuthContext.tsx';
import { clientService } from '../clients/clientService.ts';
import { brokerService } from '../brokers/brokerService.ts';
import { truckService } from '../trucks/truckService.ts';
import { driverService } from '../drivers/driverService.ts';
import { Client, Broker, Truck, Driver } from '../../types/domain.types.ts';
import {
  FileText,
  FileCheck,
  FileWarning,
  Plus,
  RefreshCw,
  AlertTriangle,
  Receipt,
  CheckCircle2,
  ShieldCheck,
  ArrowRight,
  Sparkles,
  Bell,
  CheckSquare,
  FileSpreadsheet,
  Building2,
  Truck as TruckIcon,
  UserCheck,
  PackageCheck,
  Upload,
  Trash2,
} from 'lucide-react';
import { NavModule } from '../../components/layout/Sidebar.tsx';

interface DocumentsViewProps {
  onNavigate?: (module: NavModule) => void;
}

export const DocumentsView: React.FC<DocumentsViewProps> = ({ onNavigate }) => {
  const { activeOrganization, userRole } = useAuth();
  const orgId = activeOrganization?.id || '';

  const canEdit = userRole === 'owner_admin' || userRole === 'dispatcher';

  const [documents, setDocuments] = useState<FreightDocument[]>([]);
  const [loads, setLoads] = useState<Load[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [brokers, setBrokers] = useState<Broker[]>([]);
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [isMissingExpanded, setIsMissingExpanded] = useState<boolean>(false);

  const [missingDocLoads, setMissingDocLoads] = useState<
    { load: Load; missingDocs: string[]; summary: LoadDocumentSummary }[]
  >([]);
  const [stats, setStats] = useState<DocumentStats>({
    totalDocuments: 0,
    pendingVerificationCount: 0,
    verifiedCount: 0,
    receivedCount: 0,
    missingRateConsCount: 0,
    missingPODsCount: 0,
    readyToInvoiceLoadsCount: 0,
  });

  const [filters, setFilters] = useState<DocumentFilterCriteria>({
    search: '',
    doc_type: 'all',
    doc_status: 'all',
    load_status: 'all',
    date_range: 'all',
    load_id: '',
  });

  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);

  // Modals state
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isExtractionModalOpen, setIsExtractionModalOpen] = useState(false);
  const [extractionPreselectLoadId, setExtractionPreselectLoadId] = useState<string | undefined>(undefined);
  const [uploadPreselectLoadId, setUploadPreselectLoadId] = useState<string | undefined>(undefined);
  const [selectedDoc, setSelectedDoc] = useState<FreightDocument | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [documentToDelete, setDocumentToDelete] = useState<FreightDocument | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 4000);
  };

  // Task Modal state
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [taskPreselectedLoadId, setTaskPreselectedLoadId] = useState<string | null>(null);
  const [taskInitialCategory, setTaskInitialCategory] = useState<TaskCategory>('document_collection');
  const [taskInitialPriority, setTaskInitialPriority] = useState<TaskPriority>('high');
  const [taskInitialTitle, setTaskInitialTitle] = useState<string>('');
  const [taskInitialDescription, setTaskInitialDescription] = useState<string>('');
  const [taskTriggerSource, setTaskTriggerSource] = useState<string>('manual');
  const [taskReferenceEntityId, setTaskReferenceEntityId] = useState<string | null>(null);

  // Load Inspection Modal
  const [inspectingLoad, setInspectingLoad] = useState<LoadWithRelations | null>(null);
  const [isLoadModalOpen, setIsLoadModalOpen] = useState(false);

  const loadData = useCallback(async () => {
    if (!orgId) return;
    setIsLoading(true);
    try {
      const [docsList, allLoads, docStats, missingList, allClients, allBrokers, allTrucks, allDrivers] = await Promise.all([
        documentService.listDocuments(orgId, filters),
        loadService.getLoads(orgId),
        documentService.getDocumentStats(orgId),
        documentService.getMissingDocuments(orgId),
        clientService.getClients(orgId),
        brokerService.listBrokers(orgId),
        truckService.getTrucks(orgId),
        driverService.getDrivers(orgId),
      ]);

      setDocuments(docsList);
      setLoads(allLoads);
      setStats(docStats);
      setMissingDocLoads(missingList);
      setClients(allClients);
      setBrokers(allBrokers);
      setTrucks(allTrucks);
      setDrivers(allDrivers);
    } catch (err) {
      console.error('Error fetching document center data:', err);
    } finally {
      setIsLoading(false);
    }
  }, [orgId, filters]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handlers
  const handleUploadDocument = async (input: CreateDocumentInput, file?: File) => {
    if (!orgId) return;
    setIsUploading(true);
    try {
      await documentService.createDocument(orgId, input, file);
      await loadData();
      setIsUploadModalOpen(false);
    } finally {
      setIsUploading(false);
    }
  };

  const handleStatusChange = async (doc: FreightDocument, newStatus: DocumentStatus) => {
    if (!orgId) return;
    await documentService.updateDocumentStatus(orgId, doc.id, newStatus);
    await loadData();
    // update current selected doc in modal
    const updated = await documentService.getDocument(orgId, doc.id);
    setSelectedDoc(updated);
  };

  const handleDeleteDocument = async (doc: FreightDocument) => {
    if (!orgId || isDeleting) return;
    setIsDeleting(true);
    try {
      await documentService.deleteDocument(orgId, doc.id);
      await loadData();
      if (selectedDoc?.id === doc.id) {
        setIsDetailModalOpen(false);
        setSelectedDoc(null);
      }
      setDocumentToDelete(null);
      const docLabel = DOCUMENT_TYPE_LABELS[doc.doc_type] || doc.doc_type;
      const docName = doc.file_name || docLabel;
      showToast(`Document "${docName}" was successfully deleted.`);
    } catch (err: unknown) {
      console.error('Failed to delete document:', err);
      const msg = err instanceof Error ? err.message : 'Failed to delete document record.';
      showToast(msg, 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleOpenLoadDetail = async (loadId: string) => {
    if (!orgId) return;
    const fullLoad = await loadService.getLoad(orgId, loadId);
    if (fullLoad) {
      setInspectingLoad(fullLoad);
      setIsLoadModalOpen(true);
    }
  };

  const handleQuickUploadForMissingLoad = (loadId: string) => {
    setUploadPreselectLoadId(loadId);
    setIsUploadModalOpen(true);
  };

  const handleCreateDocumentCollectionTask = (load: Load, missingDocs: string[]) => {
    const docLabels = missingDocs
      .map((d) => DOCUMENT_TYPE_LABELS[d as keyof typeof DOCUMENT_TYPE_LABELS] || d)
      .join(', ');
    const isDelivered = load.pipeline_status === 'delivered';

    setTaskPreselectedLoadId(load.id);
    setTaskInitialCategory('document_collection');
    setTaskInitialPriority(isDelivered ? 'urgent' : 'high');
    setTaskInitialTitle(`Collect Missing ${docLabels}: Load #${load.load_number}`);
    setTaskInitialDescription(
      `Load #${load.load_number} (${load.pipeline_status.toUpperCase()}) is missing required paperwork: ${docLabels}. Follow up with driver or shipper/receiver to obtain signed documentation to clear audit and prepare billing packet.`
    );
    setTaskTriggerSource('missing_document');
    setTaskReferenceEntityId(load.id);
    setIsTaskModalOpen(true);
  };

  const handleResetFilters = () => {
    setFilters({
      search: '',
      doc_type: 'all',
      doc_status: 'all',
      load_status: 'all',
      date_range: 'all',
      load_id: '',
    });
  };

  const handleOpenUploadModal = () => {
    setUploadPreselectLoadId(undefined);
    setIsUploadModalOpen(true);
  };

  const visibleMissingLoads = isMissingExpanded ? missingDocLoads : missingDocLoads.slice(0, 3);

  return (
    <div id="documents-view" className="space-y-6">
      {/* Toast Notification */}
      {toast && (
        <div
          id="documents-toast"
          className={`fixed bottom-5 right-5 z-50 p-4 rounded-xl border shadow-2xl flex items-center gap-3 transition-all animate-in slide-in-from-bottom-2 duration-200 ${
            toast.type === 'success'
              ? 'bg-emerald-950/95 border-emerald-800 text-emerald-100'
              : 'bg-rose-950/95 border-rose-800 text-rose-100'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
          )}
          <span className="text-xs font-medium">{toast.message}</span>
        </div>
      )}

      {/* Top Header & Actions Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-100 tracking-tight">
              Dispatch Document Center
            </h1>
            <span className="px-2.5 py-0.5 rounded-full bg-indigo-950/90 border border-indigo-800/70 text-indigo-300 font-sans font-medium text-xs">
              Audit & Compliance
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Rate confirmations, signed bills of lading (BOL), proof of delivery (POD), and carrier invoicing packets.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0 flex-wrap sm:flex-nowrap">
          <button
            id="refresh-documents-btn"
            type="button"
            onClick={() => loadData()}
            className="h-9 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-slate-300 hover:text-slate-100 transition-colors cursor-pointer flex items-center justify-center"
            title="Refresh Paperwork Feed"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>

          <button
            id="ai-ocr-rate-con-btn"
            type="button"
            onClick={() => {
              setExtractionPreselectLoadId(undefined);
              setIsExtractionModalOpen(true);
            }}
            className="h-9 inline-flex items-center gap-2 px-3.5 text-xs font-semibold text-slate-200 hover:text-slate-100 bg-slate-900 hover:bg-slate-800 border border-slate-700/80 rounded-xl transition-all cursor-pointer shadow-xs"
          >
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span>AI Rate Con OCR</span>
          </button>

          <button
            id="upload-paperwork-btn"
            type="button"
            onClick={handleOpenUploadModal}
            className="h-9 inline-flex items-center gap-2 px-4 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            <Upload className="w-4 h-4" />
            <span>Upload Document</span>
          </button>
        </div>
      </div>

      {/* KPI Metric Cards Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <MetricCard
          id="metric-total-docs"
          title="Total Documents"
          value={stats.totalDocuments.toString()}
          subtitle={`${stats.verifiedCount} Verified & Approved`}
          icon={FileText}
          accentColor="purple"
        />
        <MetricCard
          id="metric-pending-audit"
          title="Pending Verification"
          value={stats.pendingVerificationCount.toString()}
          subtitle="Requires dispatcher audit"
          icon={FileCheck}
          accentColor="blue"
        />
        <MetricCard
          id="metric-missing-rc"
          title="Missing Rate Cons"
          value={stats.missingRateConsCount.toString()}
          subtitle="Booked / transit loads"
          icon={FileWarning}
          accentColor="amber"
        />
        <MetricCard
          id="metric-ready-invoice"
          title="Ready to Invoice"
          value={stats.readyToInvoiceLoadsCount.toString()}
          subtitle="Delivered loads with clean PODs"
          icon={Receipt}
          accentColor="emerald"
        />
      </div>

      {/* Urgent Missing Paperwork Checklist Banner */}
      {missingDocLoads.length > 0 && (
        <div
          id="missing-paperwork-alert-panel"
          className="p-4 rounded-xl bg-amber-950/20 border border-amber-800/40 space-y-3 shadow-xs"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-amber-300">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
              <h2 className="text-xs font-bold uppercase tracking-wider">
                Missing Required Paperwork ({missingDocLoads.length} Active Loads)
              </h2>
            </div>
            <div className="flex items-center gap-3">
              {missingDocLoads.length > 3 && (
                <button
                  type="button"
                  onClick={() => setIsMissingExpanded((prev) => !prev)}
                  className="text-xs font-semibold text-amber-300 hover:text-amber-200 underline cursor-pointer"
                >
                  {isMissingExpanded ? 'Show Less' : `View All (${missingDocLoads.length})`}
                </button>
              )}
              <span className="text-[11px] text-amber-400 font-mono tabular-nums">
                Audit Active
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {visibleMissingLoads.map(({ load, missingDocs }) => (
              <div
                key={load.id}
                className="p-3 rounded-xl bg-slate-950/90 border border-slate-800/90 flex items-center justify-between gap-3 text-xs"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 font-mono tabular-nums">
                    <button
                      type="button"
                      onClick={() => handleOpenLoadDetail(load.id)}
                      className="font-bold text-sky-400 hover:text-sky-300 cursor-pointer truncate"
                    >
                      {load.load_number}
                    </button>
                    <span className="text-[10px] text-slate-400 flex items-center gap-1 shrink-0">
                      <span>{load.origin_state}</span>
                      <ArrowRight className="w-2.5 h-2.5 text-slate-500 inline" />
                      <span>{load.dest_state}</span>
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {missingDocs.map((docType) => (
                      <span
                        key={docType}
                        className="text-[10px] px-2 py-0.5 rounded-md bg-rose-950/70 text-rose-300 border border-rose-800/60 font-mono"
                      >
                        Missing {DOCUMENT_TYPE_LABELS[docType as keyof typeof DOCUMENT_TYPE_LABELS]}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => handleCreateDocumentCollectionTask(load, missingDocs)}
                      title="Create Document Collection Task"
                      className="h-7 px-2 text-[11px] font-semibold text-amber-300 hover:text-amber-200 bg-amber-950/80 hover:bg-amber-900 border border-amber-800/60 rounded-lg transition-colors cursor-pointer flex items-center gap-1"
                    >
                      <CheckSquare className="w-3 h-3 text-amber-400" />
                      <span>Task</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleQuickUploadForMissingLoad(load.id)}
                    className="h-7 px-2.5 text-[11px] font-semibold text-indigo-300 hover:text-indigo-200 bg-indigo-950/80 hover:bg-indigo-900 border border-indigo-800/60 rounded-lg transition-colors cursor-pointer"
                  >
                    Upload
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters Toolbar */}
      <DocumentFilters
        filters={filters}
        onFilterChange={setFilters}
        totalDocsCount={stats.totalDocuments}
        filteredDocsCount={documents.length}
      />

      {/* Document List Table */}
      <DocumentList
        documents={documents}
        isLoading={isLoading}
        onViewDocument={(doc) => {
          setSelectedDoc(doc);
          setIsDetailModalOpen(true);
        }}
        onVerifyDocument={async (doc) => {
          await handleStatusChange(doc, 'verified');
        }}
        onDeleteDocument={(doc) => {
          setDocumentToDelete(doc);
        }}
        onViewLoad={(loadId) => handleOpenLoadDetail(loadId)}
        userRole={userRole}
        onNewDocumentClick={handleOpenUploadModal}
        onResetFilters={handleResetFilters}
        hasActiveFilters={
          Boolean(filters.search) ||
          (Boolean(filters.doc_type) && filters.doc_type !== 'all') ||
          (Boolean(filters.doc_status) && filters.doc_status !== 'all') ||
          (Boolean(filters.load_status) && filters.load_status !== 'all') ||
          (Boolean(filters.date_range) && filters.date_range !== 'all') ||
          Boolean(filters.load_id)
        }
        loadsCount={loads.length}
        clientsCount={clients.length}
        trucksCount={trucks.length}
        driversCount={drivers.length}
        onNavigate={onNavigate}
      />

      {/* Upload Paperwork Modal */}
      <DocumentUploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onUpload={handleUploadDocument}
        loads={loads}
        clients={clients}
        drivers={drivers}
        trucks={trucks}
        brokers={brokers}
        initialLoadId={uploadPreselectLoadId}
        isUploading={isUploading}
        onOpenAIExtraction={() => {
          setExtractionPreselectLoadId(uploadPreselectLoadId);
          setIsExtractionModalOpen(true);
        }}
      />

      {/* AI Rate Confirmation OCR & Extraction Modal */}
      <RateConExtractionModal
        isOpen={isExtractionModalOpen}
        onClose={() => {
          setIsExtractionModalOpen(false);
          setExtractionPreselectLoadId(undefined);
        }}
        organizationId={orgId}
        loads={loads}
        clients={clients}
        brokers={brokers}
        trucks={trucks}
        drivers={drivers}
        initialLoadId={extractionPreselectLoadId}
        onExtractionApplied={async (updatedOrNewLoad) => {
          await loadData();
          setInspectingLoad(updatedOrNewLoad);
          setIsLoadModalOpen(true);
        }}
      />

      {/* Document Detail & Audit Modal */}
      <DocumentDetailModal
        isOpen={isDetailModalOpen}
        onClose={() => {
          setIsDetailModalOpen(false);
          setSelectedDoc(null);
        }}
        document={selectedDoc}
        onStatusChange={handleStatusChange}
        onDelete={handleDeleteDocument}
        userRole={userRole}
        onViewLoad={(loadId) => handleOpenLoadDetail(loadId)}
      />

      {/* Task Modal for Document Collection */}
      <TaskModal
        isOpen={isTaskModalOpen}
        onClose={() => {
          setIsTaskModalOpen(false);
          setTaskPreselectedLoadId(null);
          setTaskReferenceEntityId(null);
        }}
        preselectedLoadId={taskPreselectedLoadId}
        initialCategory={taskInitialCategory}
        initialPriority={taskInitialPriority}
        initialTitle={taskInitialTitle}
        initialDescription={taskInitialDescription}
        triggerSource={taskTriggerSource}
        referenceEntityId={taskReferenceEntityId}
        onSuccess={() => {
          setIsTaskModalOpen(false);
          setTaskPreselectedLoadId(null);
          setTaskReferenceEntityId(null);
        }}
      />

      {/* Inspect Load Details Modal */}
      {inspectingLoad && (
        <LoadDetailModal
          isOpen={isLoadModalOpen}
          onClose={() => {
            setIsLoadModalOpen(false);
            setInspectingLoad(null);
            loadData();
          }}
          load={inspectingLoad}
          canEdit={userRole === 'owner_admin' || userRole === 'dispatcher'}
          onDocumentUpdated={loadData}
        />
      )}

      {/* Delete Confirmation Modal */}
      {documentToDelete && (
        <Modal
          id="delete-document-modal"
          isOpen={Boolean(documentToDelete)}
          onClose={() => {
            if (!isDeleting) setDocumentToDelete(null);
          }}
          title="Confirm Document Deletion"
          subtitle={`Permanently delete ${DOCUMENT_TYPE_LABELS[documentToDelete.doc_type] || 'paperwork'} from vault?`}
          maxWidth="md"
        >
          <div className="p-6 space-y-4">
            {/* Warning Banner */}
            <div className="flex items-start gap-3 p-3.5 rounded-xl bg-rose-950/40 border border-rose-800/60 text-xs text-rose-200 leading-relaxed">
              <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <strong className="text-rose-100 font-semibold block mb-0.5">
                  Permanent Document Deletion
                </strong>
                Deleting this file will permanently remove the storage object and purge audit verification records from your workspace.
              </div>
            </div>

            {/* Document Details Summary */}
            <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Document Type:</span>
                <span className="font-semibold text-slate-100">
                  {DOCUMENT_TYPE_LABELS[documentToDelete.doc_type] || documentToDelete.doc_type}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">File Name:</span>
                <span
                  className="font-mono text-slate-200 truncate max-w-[220px]"
                  title={documentToDelete.file_name || 'Paperwork file'}
                >
                  {documentToDelete.file_name || 'Paperwork file'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Associated Load:</span>
                <span className="font-semibold text-indigo-300">
                  {documentToDelete.load_number ? `#${documentToDelete.load_number}` : 'Unassigned'}
                </span>
              </div>
              {documentToDelete.created_at && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Uploaded Date:</span>
                  <span className="text-slate-300">
                    {new Date(documentToDelete.created_at).toLocaleDateString()}
                  </span>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setDocumentToDelete(null)}
                disabled={isDeleting}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                id="confirm-delete-document-btn"
                type="button"
                onClick={() => handleDeleteDocument(documentToDelete)}
                disabled={isDeleting}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-lg shadow-rose-900/30 flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
              >
                {isDeleting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Document</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
