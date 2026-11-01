import React, { useState, useEffect } from 'react';
import {
  Truck,
  PackageCheck,
  DollarSign,
  AlertTriangle,
  FileWarning,
  Plus,
  ArrowRight,
  TrendingUp,
  MapPin,
  Calendar,
  FileText,
  FileCheck,
  Receipt,
  CheckCircle2,
  Radio,
  AlertCircle,
  Clock,
  CheckSquare,
  Users,
  Building2,
  UserCheck,
  Check,
  Sparkles,
} from 'lucide-react';
import { MetricCard } from '../../components/common/MetricCard.tsx';
import { StatusBadge } from '../../components/common/StatusBadge.tsx';
import { EmptyState } from '../../components/common/EmptyState.tsx';
import { useAuth } from '../../contexts/AuthContext.tsx';
import { useTimezone } from '../../contexts/TimezoneContext.tsx';
import { formatInTimezone } from '../../lib/timezones.ts';
import { NavModule } from '../../components/layout/Sidebar.tsx';
import { loadService } from '../loads/loadService.ts';
import { checkCallService, isLoadActiveForCheckInTracking } from '../checkcalls/checkCallService.ts';
import { LoadWithRelations } from '../loads/loadTypes.ts';
import {
  DocumentStats,
  LoadDocumentSummary,
  DocumentChecklistItem,
  DOCUMENT_TYPE_LABELS,
  DOCUMENT_TYPE_SHORT_LABELS,
  getRequiredDocumentsForLoadStatus,
} from '../documents/documentTypes.ts';
import {
  TrackingStats,
  CheckCall,
  LoadTrackingSummary,
  isDeliveryEtaDelayed,
} from '../checkcalls/checkCallTypes.ts';
import { Document, DocumentType, DocumentStatus } from '../../types/domain.types.ts';
import { supabase, isSupabaseConfigured } from '../../lib/supabase.ts';
import { formatCurrency, formatRPM } from '../../lib/calculations.ts';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEMO_ORGANIZATION_ID = 'demo-org-1';
function isUUID(str?: string | null): boolean {
  return Boolean(str && UUID_REGEX.test(str.trim()));
}

const SEED_DOCUMENTS: Omit<Document, 'organization_id'>[] = [
  {
    id: 'demo-doc-1',
    load_id: 'demo-load-1',
    doc_type: 'rate_confirmation',
    doc_status: 'verified',
    file_path: 'freight-documents/demo-org-1/demo-load-1/RateCon_Apex_8841.pdf',
    file_name: 'RateCon_Apex_8841.pdf',
    file_size_bytes: 342100,
    mime_type: 'application/pdf',
    uploaded_by: 'Sarah Jenkins (Apex Broker)',
    notes: 'Signed rate confirmation received via Apex EDI. Fuel surcharge and detention terms agreed at $75/hr after 2 hrs.',
    created_at: new Date(Date.now() - 4 * 86400000).toISOString(),
    updated_at: new Date(Date.now() - 3 * 86400000).toISOString(),
  },
  {
    id: 'demo-doc-2',
    load_id: 'demo-load-2',
    doc_type: 'rate_confirmation',
    doc_status: 'verified',
    file_path: 'freight-documents/demo-org-1/demo-load-2/RateCon_BlueRidge_8842.pdf',
    file_name: 'RateCon_BlueRidge_8842.pdf',
    file_size_bytes: 419200,
    mime_type: 'application/pdf',
    uploaded_by: 'Brandon Cole',
    notes: 'Rate con signed for 44k lbs reefer produce. Continuous temperature monitoring active at 34°F.',
    created_at: new Date(Date.now() - 3 * 86400000).toISOString(),
    updated_at: new Date(Date.now() - 2 * 86400000).toISOString(),
  },
  {
    id: 'demo-doc-3',
    load_id: 'demo-load-2',
    doc_type: 'bol',
    doc_status: 'received',
    file_path: 'freight-documents/demo-org-1/demo-load-2/BOL_Shipper_Signed_8842.pdf',
    file_name: 'BOL_Shipper_Signed_8842.pdf',
    file_size_bytes: 885000,
    mime_type: 'application/pdf',
    uploaded_by: 'Driver Elena Rostova',
    notes: 'Shipper signed clean BOL at Salinas packing house. 22 pallets loaded, seal #774921.',
    created_at: new Date(Date.now() - 2 * 86400000).toISOString(),
    updated_at: new Date(Date.now() - 2 * 86400000).toISOString(),
  },
  {
    id: 'demo-doc-4',
    load_id: 'demo-load-3',
    doc_type: 'rate_confirmation',
    doc_status: 'verified',
    file_path: 'freight-documents/demo-org-1/demo-load-3/RateCon_Horizon_8843.pdf',
    file_name: 'RateCon_Horizon_8843.pdf',
    file_size_bytes: 298400,
    mime_type: 'application/pdf',
    uploaded_by: 'Amanda Cross',
    notes: 'Horizon Express flatbed rate confirmation.',
    created_at: new Date(Date.now() - 5 * 86400000).toISOString(),
    updated_at: new Date(Date.now() - 4 * 86400000).toISOString(),
  },
  {
    id: 'demo-doc-5',
    load_id: 'demo-load-3',
    doc_type: 'bol',
    doc_status: 'verified',
    file_path: 'freight-documents/demo-org-1/demo-load-3/BOL_Pickup_Signed_8843.pdf',
    file_name: 'BOL_Pickup_Signed_8843.pdf',
    file_size_bytes: 612000,
    mime_type: 'application/pdf',
    uploaded_by: 'Driver Marcus Vance',
    notes: 'Clean pickup BOL stamped by Gary Steel Mill.',
    created_at: new Date(Date.now() - 4 * 86400000).toISOString(),
    updated_at: new Date(Date.now() - 3 * 86400000).toISOString(),
  },
  {
    id: 'demo-doc-6',
    load_id: 'demo-load-3',
    doc_type: 'pod',
    doc_status: 'pending',
    file_path: 'freight-documents/demo-org-1/demo-load-3/Signed_POD_Rec_8843.jpg',
    file_name: 'Signed_POD_Rec_8843.jpg',
    file_size_bytes: 1420000,
    mime_type: 'image/jpeg',
    uploaded_by: 'Driver Marcus Vance',
    notes: 'Receiver stamped delivery receipt. Awaiting dispatcher audit for unloader signature verification.',
    created_at: new Date(Date.now() - 1 * 86400000).toISOString(),
    updated_at: new Date(Date.now() - 1 * 86400000).toISOString(),
  },
  {
    id: 'demo-doc-7',
    load_id: 'demo-load-4',
    doc_type: 'rate_confirmation',
    doc_status: 'verified',
    file_path: 'freight-documents/demo-org-1/demo-load-4/RateCon_Keystone_8844.pdf',
    file_name: 'RateCon_Keystone_8844.pdf',
    file_size_bytes: 312000,
    mime_type: 'application/pdf',
    uploaded_by: 'David Morrison',
    notes: 'Rate con verified.',
    created_at: new Date(Date.now() - 7 * 86400000).toISOString(),
    updated_at: new Date(Date.now() - 6 * 86400000).toISOString(),
  },
  {
    id: 'demo-doc-8',
    load_id: 'demo-load-4',
    doc_type: 'bol',
    doc_status: 'verified',
    file_path: 'freight-documents/demo-org-1/demo-load-4/BOL_Signed_8844.pdf',
    file_name: 'BOL_Signed_8844.pdf',
    file_size_bytes: 540000,
    mime_type: 'application/pdf',
    uploaded_by: 'Driver David Chen',
    notes: 'Shipper signed.',
    created_at: new Date(Date.now() - 6 * 86400000).toISOString(),
    updated_at: new Date(Date.now() - 5 * 86400000).toISOString(),
  },
  {
    id: 'demo-doc-9',
    load_id: 'demo-load-4',
    doc_type: 'pod',
    doc_status: 'verified',
    file_path: 'freight-documents/demo-org-1/demo-load-4/POD_Delivery_8844.pdf',
    file_name: 'POD_Delivery_8844.pdf',
    file_size_bytes: 780000,
    mime_type: 'application/pdf',
    uploaded_by: 'Driver David Chen',
    notes: 'Signed and dated POD with receiver stamp.',
    created_at: new Date(Date.now() - 4 * 86400000).toISOString(),
    updated_at: new Date(Date.now() - 3 * 86400000).toISOString(),
  },
  {
    id: 'demo-doc-10',
    load_id: 'demo-load-4',
    doc_type: 'invoice',
    doc_status: 'verified',
    file_path: 'freight-documents/demo-org-1/demo-load-4/Invoice_DD_8844.pdf',
    file_name: 'Invoice_DD_8844.pdf',
    file_size_bytes: 245000,
    mime_type: 'application/pdf',
    uploaded_by: 'Admin / Billing Dept',
    notes: 'Factoring billing packet generated and submitted to OTR Capital.',
    created_at: new Date(Date.now() - 2 * 86400000).toISOString(),
    updated_at: new Date(Date.now() - 1 * 86400000).toISOString(),
  },
];

async function fetchDashboardRawDocuments(orgId: string): Promise<Document[]> {
  if (!orgId) return [];
  if (isSupabaseConfigured && isUUID(orgId)) {
    try {
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false });
      if (!error && data) {
        return data as Document[];
      }
      if (orgId !== DEMO_ORGANIZATION_ID) {
        return [];
      }
    } catch (err) {
      console.warn('Dashboard document fetch failed, falling back:', err);
      if (orgId !== DEMO_ORGANIZATION_ID) {
        return [];
      }
    }
  } else if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false });
      if (!error && data) {
        return data as Document[];
      }
    } catch (err) {
      console.warn('Dashboard document fetch failed for demo organization:', err);
    }
  }

  if (isUUID(orgId) && orgId !== DEMO_ORGANIZATION_ID) {
    return [];
  }

  // Fallback to local storage (same as documentService fallback)
  try {
    const raw = localStorage.getItem(`dispatchdesk_demo_documents_${orgId}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed
          .filter((d: Document) => d && d.organization_id === orgId)
          .filter((d: Document) => !(isUUID(orgId) && orgId !== DEMO_ORGANIZATION_ID && typeof d.id === 'string' && d.id.startsWith('demo-doc-')));
      }
    } else if (!isUUID(orgId) || orgId === DEMO_ORGANIZATION_ID) {
      const seeded: Document[] = SEED_DOCUMENTS.map((doc) => ({
        ...doc,
        organization_id: orgId,
      }));
      localStorage.setItem(`dispatchdesk_demo_documents_${orgId}`, JSON.stringify(seeded));
      return seeded;
    }
  } catch {
    // Ignore local storage read errors
  }
  return [];
}

function computeLoadDocumentSummary(
  load: LoadWithRelations,
  loadDocs: Document[]
): LoadDocumentSummary {
  const requiredTypes = getRequiredDocumentsForLoadStatus(load.pipeline_status);
  const allStandardTypes: DocumentType[] = ['rate_confirmation', 'bol', 'pod', 'invoice'];

  const checklist: DocumentChecklistItem[] = allStandardTypes.map((docType) => {
    const isReq = requiredTypes.includes(docType);
    const existing = loadDocs.find((d) => d.doc_type === docType) || null;
    let requirementReason = 'Not required yet';
    if (isReq) {
      if (docType === 'rate_confirmation') requirementReason = 'Mandatory for Booked & In Transit status';
      if (docType === 'bol') requirementReason = 'Mandatory for Delivered status';
      if (docType === 'pod') requirementReason = 'Mandatory for Delivered & Invoicing';
      if (docType === 'invoice') requirementReason = 'Mandatory for Invoiced & Paid settlement';
    }
    let status: DocumentStatus = 'missing';
    if (existing) {
      status = existing.doc_status;
    }
    return {
      doc_type: docType,
      label: DOCUMENT_TYPE_LABELS[docType],
      shortLabel: DOCUMENT_TYPE_SHORT_LABELS[docType],
      isRequired: isReq,
      requirementReason,
      status,
      document: existing ? ({ ...existing, load_number: load.load_number, load: load as any } as any) : null,
    };
  });

  const receivedTypes = loadDocs
    .filter((d) => d.doc_status === 'received' || d.doc_status === 'verified')
    .map((d) => d.doc_type as DocumentType);

  const missingTypes = requiredTypes.filter((t) => !receivedTypes.includes(t));
  const totalRequired = requiredTypes.length;
  const totalCompleted = requiredTypes.filter((t) => receivedTypes.includes(t)).length;
  const isComplete = totalRequired > 0 ? missingTypes.length === 0 : true;

  const hasRateCon = loadDocs.some(
    (d) => d.doc_type === 'rate_confirmation' && (d.doc_status === 'received' || d.doc_status === 'verified')
  );
  const hasBOL = loadDocs.some(
    (d) => d.doc_type === 'bol' && (d.doc_status === 'received' || d.doc_status === 'verified')
  );
  const hasPOD = loadDocs.some(
    (d) => d.doc_type === 'pod' && (d.doc_status === 'received' || d.doc_status === 'verified')
  );
  const isReadyToInvoice = load.pipeline_status === 'delivered' && hasRateCon && hasBOL && hasPOD;

  return {
    loadId: load.id,
    loadNumber: load.load_number,
    pipelineStatus: load.pipeline_status,
    requiredTypes,
    receivedTypes,
    missingTypes,
    totalRequired,
    totalCompleted,
    isComplete,
    isReadyToInvoice,
    checklist,
  };
}

interface DashboardViewProps {
  onNavigate: (module: NavModule) => void;
  onNewLoadClick: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ onNavigate, onNewLoadClick }) => {
  const { activeOrganization, userRole, user } = useAuth();
  const { operationalTimezone } = useTimezone();
  const orgId = activeOrganization?.id || '';
  const isOwnerAdmin = userRole === 'owner_admin';

  const [isLoading, setIsLoading] = useState(true);
  const [activeLoads, setActiveLoads] = useState<LoadWithRelations[]>([]);
  const [totalLoadsCount, setTotalLoadsCount] = useState(0);
  const [activeLoadsCount, setActiveLoadsCount] = useState(0);
  const [grossRevenue, setGrossRevenue] = useState(0);
  const [avgRpm, setAvgRpm] = useState(0);
  const [trucksCount, setTrucksCount] = useState(0);
  const [availableTrucksCount, setAvailableTrucksCount] = useState(0);
  const [clientsCount, setClientsCount] = useState(0);
  const [brokersCount, setBrokersCount] = useState(0);
  const [driversCount, setDriversCount] = useState(0);

  const [docStats, setDocStats] = useState<DocumentStats>({
    totalDocuments: 0,
    pendingVerificationCount: 0,
    verifiedCount: 0,
    receivedCount: 0,
    missingRateConsCount: 0,
    missingPODsCount: 0,
    readyToInvoiceLoadsCount: 0,
  });

  const [missingDocItems, setMissingDocItems] = useState<
    { load: LoadWithRelations; missingDocs: string[]; summary: LoadDocumentSummary }[]
  >([]);

  const [trackingStats, setTrackingStats] = useState<TrackingStats>({
    totalCheckCalls: 0,
    activeLoadsTrackingCount: 0,
    onTimeCount: 0,
    delayedCount: 0,
    atRiskCount: 0,
    exceptionsCount: 0,
    missingRecentCheckInCount: 0,
  });

  const [missingCheckInLoads, setMissingCheckInLoads] = useState<LoadWithRelations[]>([]);
  const [activeTrackingSummaries, setActiveTrackingSummaries] = useState<Record<string, LoadTrackingSummary>>({});

  useEffect(() => {
    if (!orgId) return;

    let isMounted = true;
    const fetchDashData = async () => {
      setIsLoading(true);
      try {
        // Fetch base datasets once in parallel: loads, dependencies, documents, check_calls, tracking_stats
        const [loadsRes, depsRes, docsRes, callsRes, trackingStatsRes] = await Promise.allSettled([
          loadService.getLoads(orgId, { userRole: userRole || undefined, currentUserId: user?.id }),
          loadService.getDependencies(orgId),
          fetchDashboardRawDocuments(orgId),
          checkCallService.getCheckCalls(orgId),
          checkCallService.getTrackingStats(orgId),
        ]);

        if (!isMounted) return;

        const allLoads: LoadWithRelations[] = loadsRes.status === 'fulfilled' ? loadsRes.value : [];
        const deps = depsRes.status === 'fulfilled' ? depsRes.value : [[], [], [], [], []];
        const [trucks, drivers, clients, brokers] = deps;
        const allDocs: Document[] = docsRes.status === 'fulfilled' ? docsRes.value : [];
        const allCalls: CheckCall[] = callsRes.status === 'fulfilled' ? callsRes.value : [];

        // 1. Group documents by load_id
        const docsByLoadId = new Map<string, Document[]>();
        let pendingVerificationCount = 0;
        let verifiedCount = 0;
        let receivedCount = 0;

        for (const d of allDocs) {
          if (d.doc_status === 'pending') pendingVerificationCount++;
          if (d.doc_status === 'verified') verifiedCount++;
          if (d.doc_status === 'received') receivedCount++;

          if (d.load_id) {
            const existing = docsByLoadId.get(d.load_id);
            if (existing) {
              existing.push(d);
            } else {
              docsByLoadId.set(d.load_id, [d]);
            }
          }
        }

        // 2. Compute missing documents and document stats across all loads
        let missingRateConsCount = 0;
        let missingPODsCount = 0;
        let readyToInvoiceLoadsCount = 0;
        const missingDocsList: { load: LoadWithRelations; missingDocs: string[]; summary: LoadDocumentSummary }[] = [];

        for (const load of allLoads) {
          const loadDocs = docsByLoadId.get(load.id) || [];
          const summary = computeLoadDocumentSummary(load, loadDocs);

          if (summary.missingTypes.length > 0) {
            missingDocsList.push({
              load,
              missingDocs: summary.missingTypes,
              summary,
            });
          }

          if (summary.missingTypes.includes('rate_confirmation')) {
            missingRateConsCount++;
          }
          if (summary.missingTypes.includes('pod')) {
            missingPODsCount++;
          }
          if (summary.isReadyToInvoice) {
            readyToInvoiceLoadsCount++;
          }
        }

        const dStats: DocumentStats = {
          totalDocuments: allDocs.length,
          pendingVerificationCount,
          verifiedCount,
          receivedCount,
          missingRateConsCount,
          missingPODsCount,
          readyToInvoiceLoadsCount,
        };

        // 3. Compute missing check-ins across active loads and consume canonical tracking stats
        const activeTrackingLoads = allLoads.filter((l) => isLoadActiveForCheckInTracking(l));
        const twentyFourHoursAgoMs = Date.now() - 24 * 3600000;
        const missingCheckIns: LoadWithRelations[] = [];

        for (const load of activeTrackingLoads) {
          const loadCalls = allCalls.filter((c) => c.load_id === load.id);
          const latest = loadCalls.length > 0 ? loadCalls[0] : null;

          if (!latest) {
            missingCheckIns.push(load);
          } else {
            const lastTime = new Date(latest.created_at).getTime();
            if (lastTime < twentyFourHoursAgoMs) {
              missingCheckIns.push(load);
            }
          }
        }

        const tStats: TrackingStats = trackingStatsRes.status === 'fulfilled'
          ? trackingStatsRes.value
          : {
              totalCheckCalls: allCalls.length,
              activeLoadsTrackingCount: activeTrackingLoads.length,
              onTimeCount: 0,
              delayedCount: 0,
              atRiskCount: 0,
              exceptionsCount: 0,
              missingRecentCheckInCount: missingCheckIns.length,
            };

        // 4. Update state contracts identically
        setTotalLoadsCount(allLoads.length);
        const inFlight = allLoads.filter(
          (l: LoadWithRelations) => l.pipeline_status === 'booked' || l.pipeline_status === 'in_transit'
        );
        setActiveLoads(inFlight);
        setActiveLoadsCount(inFlight.length);

        // Fetch tracking summaries for active/in-flight loads displayed in "Active Dispatches & En Route"
        const summariesMap: Record<string, LoadTrackingSummary> = {};
        if (inFlight.length > 0) {
          const summaryResults = await Promise.allSettled(
            inFlight.map((load) => checkCallService.getTrackingSummaryForLoad(orgId, load))
          );
          inFlight.forEach((load, idx) => {
            const res = summaryResults[idx];
            if (res.status === 'fulfilled') {
              summariesMap[load.id] = res.value;
            }
          });
        }
        if (!isMounted) return;
        setActiveTrackingSummaries(summariesMap);

        const gross = allLoads.reduce((sum: number, l: LoadWithRelations) => sum + Number(l.rate || 0), 0);
        const loadedMiles = allLoads.reduce((sum: number, l: LoadWithRelations) => sum + Number(l.loaded_miles || 0), 0);
        setGrossRevenue(gross);
        setAvgRpm(loadedMiles > 0 ? gross / loadedMiles : 0);

        setTrucksCount(trucks.length);
        setAvailableTrucksCount(trucks.filter((t) => t.status === 'active').length);
        setClientsCount(clients.length);
        setBrokersCount(brokers.length);
        setDriversCount(drivers.length);
        setDocStats(dStats);
        setMissingDocItems(missingDocsList);
        setTrackingStats(tStats);
        setMissingCheckInLoads(missingCheckIns);
      } catch (err) {
        console.warn('Dashboard statistics load warning (gracefully handled):', err);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    fetchDashData();
    return () => {
      isMounted = false;
    };
  }, [orgId]);

  const isSetupComplete = clientsCount > 0 && trucksCount > 0 && driversCount > 0 && totalLoadsCount > 0;
  const completedSteps = 1 + (clientsCount > 0 ? 1 : 0) + (trucksCount > 0 ? 1 : 0) + (driversCount > 0 ? 1 : 0) + (totalLoadsCount > 0 ? 1 : 0);
  const setupPercent = Math.round((completedSteps / 5) * 100);

  const handleNewLoadClick = () => {
    if (clientsCount === 0) {
      onNavigate('clients');
      return;
    }
    if (trucksCount === 0) {
      onNavigate('trucks');
      return;
    }
    if (driversCount === 0) {
      onNavigate('drivers');
      return;
    }
    onNewLoadClick();
  };

  if (isLoading) {
    return (
      <div id="dashboard-view-skeleton" className="space-y-6 animate-pulse">
        {/* Header Skeleton */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="h-7 w-64 bg-slate-800 rounded-md" />
            <div className="h-4 w-96 bg-slate-800/60 rounded-md" />
          </div>
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-36 bg-slate-800 rounded-lg" />
            <div className="h-9 w-32 bg-indigo-900/60 rounded-lg" />
          </div>
        </div>

        {/* Metric Cards Skeleton */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 bg-slate-900/90 border border-slate-800/80 rounded-xl p-4 flex flex-col justify-between">
              <div className="flex justify-between items-start">
                <div className="space-y-2">
                  <div className="h-3.5 w-24 bg-slate-800 rounded" />
                  <div className="h-6 w-32 bg-slate-800 rounded" />
                </div>
                <div className="w-8 h-8 rounded-lg bg-slate-800" />
              </div>
              <div className="h-3 w-40 bg-slate-800/60 rounded" />
            </div>
          ))}
        </div>

        {/* Main Content Skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="h-64 bg-slate-900/90 border border-slate-800/80 rounded-xl p-5" />
            <div className="h-64 bg-slate-900/90 border border-slate-800/80 rounded-xl p-5" />
          </div>
          <div className="space-y-6">
            <div className="h-72 bg-slate-900/90 border border-slate-800/80 rounded-xl p-5" />
            <div className="h-56 bg-slate-900/90 border border-slate-800/80 rounded-xl p-5" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div id="dashboard-view" className="space-y-6">
      {/* Welcome & Action Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-1">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-100 tracking-tight">
            Dispatcher Operations Control
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Real-time fleet overview and operational load pipeline for{' '}
            <span className="text-slate-200 font-semibold">{activeOrganization?.name || 'Your Fleet'}</span>.
          </p>
        </div>

        {/* Action Controls Hierarchy */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
          {/* Secondary Action Group */}
          <div className="inline-flex items-center bg-slate-900/90 p-1 border border-slate-800/90 rounded-xl shadow-xs gap-1">
            <button
              id="dash-quick-pipeline-btn"
              type="button"
              onClick={() => onNavigate('pipeline')}
              className="px-2.5 py-1.5 text-xs font-semibold text-slate-300 hover:text-slate-100 hover:bg-slate-800/90 rounded-lg transition-colors cursor-pointer"
            >
              Pipeline
            </button>
            <button
              id="dash-quick-tracking-btn"
              type="button"
              onClick={() => onNavigate('checkcalls')}
              className="px-2.5 py-1.5 text-xs font-semibold text-slate-300 hover:text-slate-100 hover:bg-slate-800/90 rounded-lg transition-colors cursor-pointer inline-flex items-center gap-1.5"
            >
              <Radio className="w-3.5 h-3.5 text-indigo-400" />
              <span>Tracking</span>
            </button>
            <button
              id="dash-quick-tasks-btn"
              type="button"
              onClick={() => onNavigate('tasks')}
              className="px-2.5 py-1.5 text-xs font-semibold text-slate-300 hover:text-slate-100 hover:bg-slate-800/90 rounded-lg transition-colors cursor-pointer inline-flex items-center gap-1.5"
            >
              <CheckSquare className="w-3.5 h-3.5 text-emerald-400" />
              <span>Tasks</span>
            </button>
            <button
              id="dash-quick-documents-btn"
              type="button"
              onClick={() => onNavigate('documents')}
              className="px-2.5 py-1.5 text-xs font-semibold text-slate-300 hover:text-slate-100 hover:bg-slate-800/90 rounded-lg transition-colors cursor-pointer"
            >
              Documents
            </button>
            {isOwnerAdmin && (
              <button
                id="dash-quick-workload-btn"
                type="button"
                onClick={() => onNavigate('workload')}
                className="px-2.5 py-1.5 text-xs font-semibold text-indigo-300 hover:text-indigo-200 hover:bg-indigo-950/80 rounded-lg transition-colors cursor-pointer inline-flex items-center gap-1.5"
              >
                <Users className="w-3.5 h-3.5 text-indigo-400" />
                <span>Workload</span>
              </button>
            )}
          </div>

          {/* Strong Secondary Navigation: Operations Calendar */}
          <button
            id="dash-quick-calendar-btn"
            type="button"
            onClick={() => onNavigate('calendar')}
            className="px-3.5 py-2 text-xs font-semibold text-slate-200 hover:text-white bg-slate-800/90 hover:bg-slate-700 border border-slate-700/80 rounded-xl shadow-xs transition-colors cursor-pointer inline-flex items-center gap-1.5 shrink-0"
          >
            <Calendar className="w-3.5 h-3.5 text-amber-400" />
            <span>Operations Calendar</span>
          </button>

          {/* Dominant Primary CTA */}
          <button
            id="dash-new-load-btn"
            type="button"
            onClick={handleNewLoadClick}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl shadow-sm transition-colors cursor-pointer shrink-0"
          >
            {clientsCount === 0 ? (
              <>
                <Building2 className="w-4 h-4" />
                <span>Add First Client</span>
              </>
            ) : trucksCount === 0 ? (
              <>
                <Truck className="w-4 h-4" />
                <span>Add First Truck</span>
              </>
            ) : driversCount === 0 ? (
              <>
                <UserCheck className="w-4 h-4" />
                <span>Add First Driver</span>
              </>
            ) : (
              <>
                <Plus className="w-4 h-4" />
                <span>Book New Load</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* KPI Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4">
        <MetricCard
          id="metric-active-loads"
          title="Active Dispatches"
          value={activeLoadsCount.toString()}
          subtitle="Loads currently Booked or In Transit"
          icon={PackageCheck}
          accentColor="purple"
        />
        <MetricCard
          id="metric-trucks-available"
          title="Fleet Capacity"
          value={`${availableTrucksCount} / ${trucksCount}`}
          subtitle="Active trucks available in roster"
          icon={Truck}
          accentColor="blue"
        />
        <MetricCard
          id="metric-weekly-revenue"
          title="Gross Booked"
          value={formatCurrency(grossRevenue)}
          subtitle={`Avg RPM: ${formatRPM(avgRpm)}`}
          icon={DollarSign}
          accentColor="emerald"
        />
        <MetricCard
          id="metric-missing-docs"
          title="Pending / Missing Docs"
          value={(docStats.pendingVerificationCount + docStats.missingRateConsCount + docStats.missingPODsCount).toString()}
          subtitle={`${docStats.missingPODsCount} missing PODs • ${docStats.readyToInvoiceLoadsCount} ready to bill`}
          icon={FileWarning}
          accentColor="amber"
        />
      </div>

      {/* Dispatcher Setup & Fleet Onboarding Guide */}
      {!isSetupComplete && (
        <div
          id="dispatcher-setup-guide"
          className="bg-slate-900/90 border border-indigo-900/40 rounded-2xl p-5 sm:p-6 shadow-sm space-y-5"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-indigo-600/20 border border-indigo-500/30 text-indigo-400">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm sm:text-base font-bold text-slate-100 tracking-tight">
                    Dispatcher Setup Guide
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Follow the standard dispatch lifecycle to prepare your operations for load booking.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 self-start sm:self-auto">
              <span className="text-xs font-semibold px-3 py-1 rounded-full bg-indigo-950/80 text-indigo-300 border border-indigo-800/60 font-mono">
                {completedSteps} / 5 Steps Complete ({setupPercent}%)
              </span>
            </div>
          </div>

          {/* Progress bar */}
          <div className="w-full bg-slate-800/80 rounded-full h-1.5 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-indigo-500 to-emerald-400 transition-all duration-500"
              style={{ width: `${setupPercent}%` }}
            />
          </div>

          {/* Step Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {/* Step 1: Organization */}
            <div className="p-3.5 rounded-xl border border-emerald-800/40 bg-emerald-950/20 flex flex-col justify-between space-y-3">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">Step 1</span>
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                </div>
                <h3 className="text-xs font-bold text-slate-200">Organization</h3>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Workspace created for <span className="text-slate-300 font-medium">{activeOrganization?.name || 'team'}</span>.
                </p>
              </div>
              <span className="text-[11px] font-semibold text-emerald-400 flex items-center gap-1">
                <Check className="w-3.5 h-3.5" /> Completed
              </span>
            </div>

            {/* Step 2: Carrier Client */}
            <div
              className={`p-3.5 rounded-xl border flex flex-col justify-between space-y-3 transition-colors ${
                clientsCount > 0
                  ? 'border-emerald-800/40 bg-emerald-950/20'
                  : 'border-indigo-500/50 bg-indigo-950/30 ring-1 ring-indigo-500/30'
              }`}
            >
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className={`text-[11px] font-bold uppercase tracking-wider ${clientsCount > 0 ? 'text-emerald-400' : 'text-indigo-400'}`}>
                    Step 2 • Required
                  </span>
                  {clientsCount > 0 ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <Building2 className="w-4 h-4 text-indigo-400" />
                  )}
                </div>
                <h3 className="text-xs font-bold text-slate-200">Carrier Client</h3>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  {clientsCount > 0
                    ? `${clientsCount} carrier company on file.`
                    : 'The motor carrier company you dispatch for.'}
                </p>
              </div>
              {clientsCount > 0 ? (
                <span className="text-[11px] font-semibold text-emerald-400 flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" /> Completed
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => onNavigate('clients')}
                  className="w-full py-1.5 px-2.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors cursor-pointer text-center"
                >
                  Add Client
                </button>
              )}
            </div>

            {/* Step 3: Fleet Trucks */}
            <div
              className={`p-3.5 rounded-xl border flex flex-col justify-between space-y-3 transition-colors ${
                trucksCount > 0
                  ? 'border-emerald-800/40 bg-emerald-950/20'
                  : clientsCount > 0
                  ? 'border-indigo-500/50 bg-indigo-950/30 ring-1 ring-indigo-500/30'
                  : 'border-slate-800/80 bg-slate-950/40 opacity-70'
              }`}
            >
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className={`text-[11px] font-bold uppercase tracking-wider ${trucksCount > 0 ? 'text-emerald-400' : clientsCount > 0 ? 'text-indigo-400' : 'text-slate-500'}`}>
                    Step 3 • Required
                  </span>
                  {trucksCount > 0 ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <Truck className={`w-4 h-4 ${clientsCount > 0 ? 'text-indigo-400' : 'text-slate-600'}`} />
                  )}
                </div>
                <h3 className="text-xs font-bold text-slate-200">Power Units</h3>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  {trucksCount > 0
                    ? `${trucksCount} truck(s) registered.`
                    : clientsCount > 0
                    ? 'Trucks and tractors for your client.'
                    : 'Requires carrier client first.'}
                </p>
              </div>
              {trucksCount > 0 ? (
                <span className="text-[11px] font-semibold text-emerald-400 flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" /> Completed
                </span>
              ) : clientsCount > 0 ? (
                <button
                  type="button"
                  onClick={() => onNavigate('trucks')}
                  className="w-full py-1.5 px-2.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors cursor-pointer text-center"
                >
                  Add Truck
                </button>
              ) : (
                <span className="text-[11px] text-slate-500 font-medium">Locked</span>
              )}
            </div>

            {/* Step 4: Drivers */}
            <div
              className={`p-3.5 rounded-xl border flex flex-col justify-between space-y-3 transition-colors ${
                driversCount > 0
                  ? 'border-emerald-800/40 bg-emerald-950/20'
                  : clientsCount > 0
                  ? 'border-indigo-500/50 bg-indigo-950/30 ring-1 ring-indigo-500/30'
                  : 'border-slate-800/80 bg-slate-950/40 opacity-70'
              }`}
            >
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className={`text-[11px] font-bold uppercase tracking-wider ${driversCount > 0 ? 'text-emerald-400' : clientsCount > 0 ? 'text-indigo-400' : 'text-slate-500'}`}>
                    Step 4 • Required
                  </span>
                  {driversCount > 0 ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <UserCheck className={`w-4 h-4 ${clientsCount > 0 ? 'text-indigo-400' : 'text-slate-600'}`} />
                  )}
                </div>
                <h3 className="text-xs font-bold text-slate-200">Drivers</h3>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  {driversCount > 0
                    ? `${driversCount} driver(s) registered.`
                    : clientsCount > 0
                    ? 'Qualified operators for your client.'
                    : 'Requires carrier client first.'}
                </p>
              </div>
              {driversCount > 0 ? (
                <span className="text-[11px] font-semibold text-emerald-400 flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" /> Completed
                </span>
              ) : clientsCount > 0 ? (
                <button
                  type="button"
                  onClick={() => onNavigate('drivers')}
                  className="w-full py-1.5 px-2.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors cursor-pointer text-center"
                >
                  Add Driver
                </button>
              ) : (
                <span className="text-[11px] text-slate-500 font-medium">Locked</span>
              )}
            </div>

            {/* Step 5: Book First Load */}
            <div
              className={`p-3.5 rounded-xl border flex flex-col justify-between space-y-3 transition-colors ${
                totalLoadsCount > 0
                  ? 'border-emerald-800/40 bg-emerald-950/20'
                  : clientsCount > 0 && trucksCount > 0 && driversCount > 0
                  ? 'border-indigo-500/50 bg-indigo-950/30 ring-1 ring-indigo-500/30'
                  : 'border-slate-800/80 bg-slate-950/40 opacity-70'
              }`}
            >
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className={`text-[11px] font-bold uppercase tracking-wider ${totalLoadsCount > 0 ? 'text-emerald-400' : clientsCount > 0 && trucksCount > 0 && driversCount > 0 ? 'text-indigo-400' : 'text-slate-500'}`}>
                    Step 5 • Goal
                  </span>
                  {totalLoadsCount > 0 ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <PackageCheck className={`w-4 h-4 ${clientsCount > 0 && trucksCount > 0 && driversCount > 0 ? 'text-indigo-400' : 'text-slate-600'}`} />
                  )}
                </div>
                <h3 className="text-xs font-bold text-slate-200">First Load</h3>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  {totalLoadsCount > 0
                    ? `${totalLoadsCount} load(s) dispatched.`
                    : clientsCount > 0 && trucksCount > 0 && driversCount > 0
                    ? 'All fleet prerequisites met! Book your first trip.'
                    : 'Requires client, truck & driver.'}
                </p>
              </div>
              {totalLoadsCount > 0 ? (
                <span className="text-[11px] font-semibold text-emerald-400 flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" /> Completed
                </span>
              ) : clientsCount > 0 && trucksCount > 0 && driversCount > 0 ? (
                <button
                  type="button"
                  onClick={handleNewLoadClick}
                  className="w-full py-1.5 px-2.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors cursor-pointer text-center"
                >
                  Book Load
                </button>
              ) : (
                <span className="text-[11px] text-slate-500 font-medium">Locked</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Operational Grids */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Active Loads Pipeline & Paperwork Attention */}
        <div className="lg:col-span-2 space-y-6">
          {/* Active Loads Section */}
          <div className="bg-slate-900/90 border border-slate-800/80 rounded-xl p-4 sm:p-5 shadow-xs">
            <div className="flex items-center justify-between pb-3.5 border-b border-slate-800/80">
              <div className="flex items-center gap-2">
                <PackageCheck className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-400" />
                <h2 className="text-xs sm:text-sm font-bold text-slate-200 uppercase tracking-wider">
                  Active Dispatches & En Route ({activeLoads.length})
                </h2>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('pipeline')}
                className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 inline-flex items-center gap-1 transition-colors cursor-pointer"
              >
                <span>View in Pipeline</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="pt-3">
              {activeLoads.length === 0 ? (
                clientsCount === 0 ? (
                  <EmptyState
                    id="empty-dash-no-clients"
                    icon={Building2}
                    title="Add your first carrier client"
                    description="In DispatcherDesk, a client is the motor carrier company you dispatch for. Add your carrier client before booking loads."
                    actionLabel="Add Carrier Client"
                    onAction={() => onNavigate('clients')}
                  />
                ) : trucksCount === 0 ? (
                  <EmptyState
                    id="empty-dash-no-trucks"
                    icon={Truck}
                    title="Add fleet power units"
                    description="Add trucks for your carrier client so you can assign equipment to freight loads."
                    actionLabel="Add First Truck"
                    onAction={() => onNavigate('trucks')}
                  />
                ) : driversCount === 0 ? (
                  <EmptyState
                    id="empty-dash-no-drivers"
                    icon={UserCheck}
                    title="Add carrier drivers"
                    description="Add drivers for your carrier client so you can assign personnel to freight loads."
                    actionLabel="Add First Driver"
                    onAction={() => onNavigate('drivers')}
                  />
                ) : (
                  <EmptyState
                    id="empty-dash-loads"
                    icon={PackageCheck}
                    title="No Active Dispatches in Progress"
                    description="When you book loads for your owner-operators and fleet clients, active pickups and en-route tracking will appear here."
                    actionLabel="Dispatch First Load"
                    onAction={handleNewLoadClick}
                  />
                )
              ) : (
                <div className="divide-y divide-slate-800/60 font-sans">
                  {activeLoads.map((load) => {
                    const trackingSummary = activeTrackingSummaries[load.id];
                    const isDelayed = trackingSummary?.currentStatus === 'delayed' || trackingSummary?.hasException === true;
                    const hasDelayedEta = Boolean(
                      trackingSummary?.etaDelivery &&
                      load.delivery_datetime &&
                      isDeliveryEtaDelayed(load.delivery_datetime, trackingSummary.etaDelivery)
                    );
                    const formattedEta = trackingSummary?.etaDelivery
                      ? formatInTimezone(trackingSummary.etaDelivery, operationalTimezone, {
                          includeDate: true,
                          includeTime: false,
                          includeTimezoneCode: false,
                        })
                      : null;

                    return (
                      <div
                        key={load.id}
                        onClick={() => onNavigate('pipeline')}
                        className="py-3 px-2 flex items-center justify-between gap-4 hover:bg-slate-800/40 rounded-lg transition-colors cursor-pointer group"
                      >
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-xs font-bold text-sky-400 group-hover:text-sky-300 transition-colors">
                              {load.load_number}
                            </span>
                            <StatusBadge status={load.pipeline_status} type="pipeline" size="sm" />
                            {isDelayed && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-950/70 text-amber-300 border border-amber-800/60">
                                <span>⚠</span> Delayed
                              </span>
                            )}
                            {hasDelayedEta && formattedEta && (
                              <span className="inline-flex items-center text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-rose-950/60 text-rose-300 border border-rose-800/60">
                                ETA: {formattedEta}
                              </span>
                            )}
                            <span className="text-[10px] uppercase font-mono px-1.5 py-0.2 rounded bg-slate-800/80 text-slate-400 border border-slate-700/60">
                              {load.equipment_type.replace('_', ' ')}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-slate-200 font-medium">
                            <span className="font-semibold text-slate-100">{load.origin_city}, {load.origin_state}</span>
                            <ArrowRight className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                            <span className="font-semibold text-slate-100">{load.dest_city}, {load.dest_state}</span>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <p className="font-mono tabular-nums text-xs sm:text-sm font-bold text-emerald-400">
                            {formatCurrency(load.rate)}
                          </p>
                          <p className="text-[11px] text-slate-400 font-mono tabular-nums">
                            {load.loaded_miles || 0} mi
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Paperwork & Audit Attention */}
          <div className="bg-slate-900/90 border border-slate-800/80 rounded-xl p-4 sm:p-5 shadow-xs">
            <div className="flex items-center justify-between pb-3.5 border-b border-slate-800/80">
              <div className="flex items-center gap-2">
                <FileCheck className="w-4 h-4 sm:w-5 sm:h-5 text-sky-400" />
                <h2 className="text-xs sm:text-sm font-bold text-slate-200 uppercase tracking-wider">
                  Paperwork & Invoicing Audit ({missingDocItems.length} Missing)
                </h2>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('documents')}
                className="text-xs font-semibold text-sky-400 hover:text-sky-300 inline-flex items-center gap-1 transition-colors cursor-pointer"
              >
                <span>Go to Document Center</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="pt-3">
              {missingDocItems.length === 0 ? (
                <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                  <p className="text-xs text-slate-300">
                    All active loads have required paperwork uploaded on file.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {missingDocItems.slice(0, 4).map(({ load, missingDocs }) => (
                    <div
                      key={load.id}
                      onClick={() => onNavigate('documents')}
                      className="p-3 rounded-lg bg-slate-950/80 border border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs hover:border-slate-700/80 transition-colors cursor-pointer group"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono font-bold text-sky-400 group-hover:text-sky-300 transition-colors">{load.load_number}</span>
                          <StatusBadge status={load.pipeline_status} type="pipeline" size="sm" />
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mt-1">
                          <span className="text-slate-300">{load.origin_city}, {load.origin_state}</span>
                          <ArrowRight className="w-3 h-3 text-slate-500 shrink-0" />
                          <span className="text-slate-300">{load.dest_city}, {load.dest_state}</span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 justify-start sm:justify-end shrink-0">
                        {missingDocs.map((docType) => (
                          <span
                            key={docType}
                            className="text-[10px] px-2 py-0.5 rounded-full bg-rose-950/70 text-rose-300 border border-rose-800/50 font-mono whitespace-nowrap"
                          >
                            Missing {docType.replace('_', ' ').toUpperCase()}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right 1 Col: Urgent Operational Alerts & Fleet Status */}
        <div className="space-y-6">
          {/* Operational Alerts */}
          <div className="bg-slate-900/90 border border-slate-800/80 rounded-xl p-4 sm:p-5 shadow-xs">
            <div className="flex items-center gap-2 pb-3.5 border-b border-slate-800/80">
              <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-amber-400" />
              <h2 className="text-xs sm:text-sm font-bold text-slate-200 uppercase tracking-wider">
                Operational Status
              </h2>
            </div>

            <div className="pt-3.5 space-y-3 text-xs">
              {/* Check Calls & Tracking Live State */}
              {trackingStats.missingRecentCheckInCount > 0 ? (
                <div
                  id="dash-missing-checkin-alert"
                  className="p-3 rounded-xl bg-rose-950/40 border border-rose-800/60 flex items-start justify-between gap-2.5"
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    <AlertCircle className="w-4 h-4 text-rose-400 mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="font-semibold text-rose-200 text-xs">
                          {trackingStats.missingRecentCheckInCount} Load(s) Missing Check-In
                        </p>
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-rose-900/60 text-rose-300 border border-rose-700/60 shrink-0">
                          &gt;24h stale
                        </span>
                      </div>
                      <p className="text-rose-300/80 text-[11px] mt-0.5">
                        Active dispatches lacking driver/location check-in in the past 24 hours.
                      </p>
                    </div>
                  </div>
                  <button
                    id="dash-track-missing-btn"
                    type="button"
                    onClick={() => onNavigate('checkcalls')}
                    className="px-2.5 py-1 text-[11px] font-semibold text-rose-200 bg-rose-900/70 hover:bg-rose-800 border border-rose-700/70 rounded-lg cursor-pointer shrink-0 transition-colors"
                  >
                    Track
                  </button>
                </div>
              ) : (
                <div
                  id="dash-tracking-healthy-status"
                  className="p-3 rounded-xl bg-slate-950/80 border border-slate-800/80 flex items-start justify-between gap-2.5"
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    <Radio className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-200 text-xs">Live Load Tracking Active</p>
                      <p className="text-slate-400 text-[11px] mt-0.5">
                        All active loads have recent check-ins recorded.
                      </p>
                    </div>
                  </div>
                  <button
                    id="dash-view-tracking-healthy-btn"
                    type="button"
                    onClick={() => onNavigate('checkcalls')}
                    className="px-2.5 py-1 text-[11px] font-semibold text-slate-300 hover:text-slate-100 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg cursor-pointer shrink-0 transition-colors"
                  >
                    View
                  </button>
                </div>
              )}

              {/* Operational Exceptions Alert if any */}
              {trackingStats.exceptionsCount > 0 && (
                <div
                  id="dash-tracking-exceptions-alert"
                  className="p-3 rounded-xl bg-amber-950/40 border border-amber-800/50 flex items-start justify-between gap-2.5"
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    <Clock className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="font-semibold text-amber-200 text-xs">
                        {trackingStats.exceptionsCount} Operational Exception(s)
                      </p>
                      <p className="text-amber-300/80 text-[11px] mt-0.5">
                        Active loads with breakdown, transit delay, or at-risk status.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onNavigate('checkcalls')}
                    className="px-2.5 py-1 text-[11px] font-semibold text-amber-200 bg-amber-900/70 hover:bg-amber-800 border border-amber-700/70 rounded-lg cursor-pointer shrink-0 transition-colors"
                  >
                    Inspect
                  </button>
                </div>
              )}

              {docStats.pendingVerificationCount > 0 && (
                <div className="p-3 rounded-xl bg-blue-950/40 border border-blue-800/50 flex items-start gap-2.5">
                  <FileText className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="font-semibold text-blue-200 text-xs">
                      {docStats.pendingVerificationCount} Document(s) Awaiting Audit
                    </p>
                    <p className="text-blue-300/80 text-[11px] mt-0.5">
                      Review carrier-submitted paperwork in Document Center.
                    </p>
                  </div>
                </div>
              )}

              {docStats.readyToInvoiceLoadsCount > 0 && (
                <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-800/50 flex items-start gap-2.5">
                  <Receipt className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="font-semibold text-emerald-200 text-xs">
                      {docStats.readyToInvoiceLoadsCount} Load(s) Ready for Invoicing
                    </p>
                    <p className="text-emerald-300/80 text-[11px] mt-0.5">
                      Delivered loads with clean rate con, signed BOL, and stamped POD.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Quick Carrier Client & Truck Summary */}
          <div className="bg-slate-900/90 border border-slate-800/80 rounded-xl p-4 sm:p-5 shadow-xs">
            <div className="flex items-center justify-between pb-3.5 border-b border-slate-800/80">
              <div className="flex items-center gap-2">
                <Truck className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-400" />
                <h2 className="text-xs sm:text-sm font-bold text-slate-200 uppercase tracking-wider">
                  Roster Snapshot
                </h2>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('trucks')}
                className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 inline-flex items-center gap-1 transition-colors cursor-pointer"
              >
                <span>Manage</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="pt-3.5 space-y-2 text-xs">
              <div className="flex justify-between items-center p-2 rounded-lg bg-slate-950/60 border border-slate-800/60">
                <span className="text-slate-400 font-medium">Carrier Clients (Fleets)</span>
                <span className="text-slate-100 font-bold font-mono tabular-nums text-sm">{clientsCount}</span>
              </div>
              <div className="flex justify-between items-center p-2 rounded-lg bg-slate-950/60 border border-slate-800/60">
                <span className="text-slate-400 font-medium">Active Power Units</span>
                <span className="text-slate-100 font-bold font-mono tabular-nums text-sm">{availableTrucksCount}</span>
              </div>
              <div className="flex justify-between items-center p-2 rounded-lg bg-slate-950/60 border border-slate-800/60">
                <span className="text-slate-400 font-medium">Approved Brokers</span>
                <span className="text-slate-100 font-bold font-mono tabular-nums text-sm">{brokersCount}</span>
              </div>
              <div className="flex justify-between items-center p-2 rounded-lg bg-slate-950/60 border border-slate-800/60">
                <span className="text-slate-400 font-medium">Assigned Drivers</span>
                <span className="text-slate-100 font-bold font-mono tabular-nums text-sm">{driversCount}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};


