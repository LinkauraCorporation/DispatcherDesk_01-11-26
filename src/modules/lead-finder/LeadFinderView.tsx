/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { Header } from './components/LeadFinderHeader';
import { FilePicker } from './components/FilePicker';
import { FilterPanel } from './components/FilterPanel';
import { ProgressDashboard } from './components/ProgressDashboard';
import { LeadTable } from './components/LeadTable';
import { LeadDetailsModal } from './components/LeadDetailsModal';
import { FmcsaFilterConfig, FmcsaLead, ProcessingMetrics, WorkerOutMessage } from './types/fmcsa';
import { exportLeadsToCsv, exportAllLeadsFromStorage } from './utils/csvExporter';
import { createSampleFmcsaFile } from './utils/sampleDataGenerator';
import { detectCsvEncoding } from './utils/encodingDetector';
import { getLeadsByIds } from './utils/leadStorage';

const DEFAULT_FILTERS: FmcsaFilterConfig = {
  minTrucks: 5,
  maxTrucks: 20,
  activeOnly: true,
  interstateOnly: true,
  forHireOnly: true,
  phoneRequired: true,
  emailRequired: true,
  selectedState: 'ALL',
  forHireCodes: ['A', 'B'], // FMCSA standard: A (Authorized For-Hire), B (Exempt For-Hire)
  activeStatusCodes: ['A', 'ACTIVE'],
  deduplicateDot: true, // Fix 3: Default ON
  encoding: 'auto',      // Fix 4: Default Auto
  authorityDateOption: 'ALL', // New Carrier Leads / Registration Date filter: Default All
};

const INITIAL_METRICS: ProcessingMetrics = {
  status: 'idle',
  totalBytes: 0,
  processedBytes: 0,
  percentage: 0,
  totalRowsProcessed: 0,
  matchingLeadsCount: 0,
  skippedRowsCount: 0,
  deduplicatedCount: 0,
  excludedMissingDateCount: 0,
  rowsPerSecond: 0,
  bytesPerSecond: 0,
  estimatedRemainingSeconds: 0,
  elapsedSeconds: 0,
  discoveredOperationCodes: {},
};

export function LeadFinderView() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filters, setFilters] = useState<FmcsaFilterConfig>(DEFAULT_FILTERS);
  const [metrics, setMetrics] = useState<ProcessingMetrics>(INITIAL_METRICS);
  const [leads, setLeads] = useState<FmcsaLead[]>([]);
  const [selectedLead, setSelectedLead] = useState<FmcsaLead | null>(null);
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set());
  const [isExportingAll, setIsExportingAll] = useState(false);

  const workerRef = useRef<Worker | null>(null);

  // Terminate worker on unmount
  useEffect(() => {
    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
      }
    };
  }, []);

  const handleStartExtraction = useCallback(async () => {
    if (!selectedFile) return;

    // Fix 4: Determine encoding (auto-detect sample or user override)
    let resolvedEncoding = 'utf-8';
    if (filters.encoding === 'auto') {
      try {
        resolvedEncoding = await detectCsvEncoding(selectedFile);
      } catch {
        resolvedEncoding = 'utf-8';
      }
    } else {
      resolvedEncoding = filters.encoding;
    }

    // Reset leads, selection, and metrics for new run
    setLeads([]);
    setSelectedLeadIds(new Set());
    setMetrics({
      ...INITIAL_METRICS,
      status: 'processing',
      totalBytes: selectedFile.size,
      detectedEncoding: resolvedEncoding,
    });

    // Terminate existing worker if any
    if (workerRef.current) {
      workerRef.current.terminate();
    }

    try {
      const worker = new Worker(
        new URL('./workers/fmcsaStreamWorker.ts', import.meta.url),
        { type: 'module' }
      );
      workerRef.current = worker;

      worker.onmessage = (e: MessageEvent<WorkerOutMessage>) => {
        const { type, metrics: newMetrics, newMatches, discoveredCodes, error, totalMatches } = e.data;

        if (type === 'CHUNK_MATCHES' && newMatches && newMatches.length > 0) {
          setLeads((prev) => {
            const matchMap = new Map(newMatches.map((m) => [m.id, m]));
            let replacedAny = false;
            const updated = prev.map((item) => {
              if (matchMap.has(item.id)) {
                replacedAny = true;
                const rep = matchMap.get(item.id)!;
                matchMap.delete(item.id);
                return rep;
              }
              return item;
            });
            if (matchMap.size > 0) {
              return [...updated, ...Array.from(matchMap.values())];
            }
            return replacedAny ? updated : prev;
          });
        }

        if (type === 'PROGRESS' && newMetrics) {
          setMetrics((prev) => ({
            ...prev,
            ...newMetrics,
            matchingLeadsCount: totalMatches ?? newMetrics.matchingLeadsCount ?? prev.matchingLeadsCount,
            deduplicatedCount: newMetrics.deduplicatedCount ?? prev.deduplicatedCount,
            discoveredOperationCodes: discoveredCodes || prev.discoveredOperationCodes,
            detectedEncoding: resolvedEncoding,
          }));
        }

        if (type === 'COMPLETE') {
          if (newMetrics) {
            setMetrics((prev) => ({
              ...prev,
              ...newMetrics,
              status: 'completed',
              matchingLeadsCount: totalMatches ?? prev.matchingLeadsCount,
              deduplicatedCount: newMetrics.deduplicatedCount ?? prev.deduplicatedCount,
              discoveredOperationCodes: discoveredCodes || prev.discoveredOperationCodes,
              detectedEncoding: resolvedEncoding,
            }));
          }
          worker.terminate();
          workerRef.current = null;
        }

        if (type === 'CANCELLED') {
          setMetrics((prev) => ({
            ...prev,
            status: 'cancelled',
          }));
          worker.terminate();
          workerRef.current = null;
        }

        if (type === 'ERROR') {
          setMetrics((prev) => ({
            ...prev,
            status: 'error',
            errorMessage: error || 'An unknown error occurred during CSV parsing',
          }));
          worker.terminate();
          workerRef.current = null;
        }
      };

      worker.onerror = (err) => {
        setMetrics((prev) => ({
          ...prev,
          status: 'error',
          errorMessage: err.message || 'Worker encountered an error',
        }));
        worker.terminate();
        workerRef.current = null;
      };

      // Start streaming process with resolved encoding & deduplication
      worker.postMessage({
        type: 'START',
        file: selectedFile,
        filters,
        resolvedEncoding,
        maxPreviewLeads: 25000,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to initialize worker';
      setMetrics((prev) => ({
        ...prev,
        status: 'error',
        errorMessage: msg,
      }));
    }
  }, [selectedFile, filters]);

  const handleCancelExtraction = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.postMessage({ type: 'CANCEL' });
      workerRef.current.terminate();
      workerRef.current = null;
    }
    setMetrics((prev) => ({
      ...prev,
      status: 'cancelled',
    }));
  }, []);

  // FIX 1: Export ALL matching leads (uncapped from IndexedDB)
  const handleExportAllMatching = useCallback(async () => {
    const totalCount = metrics.matchingLeadsCount || leads.length;
    if (totalCount === 0) return;
    setIsExportingAll(true);
    try {
      await exportAllLeadsFromStorage(leads, undefined, 'FMCSA_All_Matching_Leads');
    } catch (err) {
      console.error('Failed to export all leads:', err);
      // Fallback
      exportLeadsToCsv(leads, 'FMCSA_All_Matching_Leads');
    } finally {
      setIsExportingAll(false);
    }
  }, [leads, metrics.matchingLeadsCount]);

  // FIX 2: Export Selected Leads
  const handleExportSelected = useCallback(async () => {
    if (selectedLeadIds.size === 0) return;

    // Check if all selected leads are in preview cache
    const idSet = selectedLeadIds;
    const inMemorySelected = leads.filter((l) => idSet.has(l.id));

    if (inMemorySelected.length === idSet.size) {
      exportLeadsToCsv(inMemorySelected, 'FMCSA_Selected_Prospects');
    } else {
      // Query IndexedDB for any leads beyond the preview cache
      try {
        const dbSelected = await getLeadsByIds(Array.from(idSet));
        exportLeadsToCsv(
          dbSelected.length > 0 ? dbSelected : inMemorySelected,
          'FMCSA_Selected_Prospects'
        );
      } catch {
        exportLeadsToCsv(inMemorySelected, 'FMCSA_Selected_Prospects');
      }
    }
  }, [selectedLeadIds, leads]);

  // FIX 2: Selection Handlers
  const handleToggleLeadSelect = useCallback((id: string) => {
    setSelectedLeadIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleSelectAllFiltered = useCallback((filteredIds: string[]) => {
    setSelectedLeadIds((prev) => {
      const next = new Set(prev);
      filteredIds.forEach((id) => next.add(id));
      return next;
    });
  }, []);

  const handleSelectPage = useCallback((pageIds: string[]) => {
    setSelectedLeadIds((prev) => {
      const next = new Set(prev);
      pageIds.forEach((id) => next.add(id));
      return next;
    });
  }, []);

  const handleClearSelection = useCallback(() => {
    setSelectedLeadIds(new Set());
  }, []);

  const handleLoadSample = useCallback(() => {
    if (metrics.status === 'processing') return;
    const sample = createSampleFmcsaFile(3500);
    setSelectedFile(sample);
  }, [metrics.status]);

  const handleResetFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
  }, []);

  const isProcessing = metrics.status === 'processing';
  const totalMatches = metrics.matchingLeadsCount || leads.length;

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col font-sans">
      <Header
        onLoadSample={handleLoadSample}
        isProcessing={isProcessing}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Section 1: File Selection & Local Guarantee */}
        <FilePicker
          selectedFile={selectedFile}
          onFileSelected={(file) => {
            setSelectedFile(file);
            setMetrics(INITIAL_METRICS);
            setLeads([]);
            setSelectedLeadIds(new Set());
          }}
          isProcessing={isProcessing}
        />

        {/* Section 2: Filters Configuration (Includes USDOT Deduplication & Encoding) */}
        <FilterPanel
          filters={filters}
          onChange={setFilters}
          onReset={handleResetFilters}
          disabled={isProcessing}
          discoveredOps={metrics.discoveredOperationCodes}
          dateFieldName={metrics.dateFieldName}
        />

        {/* Section 3: Progress & Performance Dashboard */}
        <ProgressDashboard
          metrics={metrics}
          onStart={handleStartExtraction}
          onCancel={handleCancelExtraction}
          onExportAll={handleExportAllMatching}
          onExportSelected={handleExportSelected}
          hasFile={!!selectedFile}
          totalMatches={totalMatches}
          selectedCount={selectedLeadIds.size}
          isExportingAll={isExportingAll}
        />

        {/* Section 4: Extracted Leads Data Grid with Multi-Selection */}
        <LeadTable
          leads={leads}
          totalMatches={totalMatches}
          selectedLeadIds={selectedLeadIds}
          onToggleLeadSelect={handleToggleLeadSelect}
          onSelectAllFiltered={handleSelectAllFiltered}
          onSelectPage={handleSelectPage}
          onClearSelection={handleClearSelection}
          onExportAll={handleExportAllMatching}
          onExportSelected={handleExportSelected}
          onSelectLead={setSelectedLead}
          isProcessing={isProcessing}
          isExportingAll={isExportingAll}
        />
      </main>

      {/* Details Modal */}
      {selectedLead && (
        <LeadDetailsModal
          lead={selectedLead}
          onClose={() => setSelectedLead(null)}
        />
      )}

      {/* Subtle, clean footer */}
      <footer className="border-t border-neutral-900 bg-neutral-950/80 py-4 mt-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-neutral-500">
          <div>
            Local FMCSA Census Prospect Extractor · Offline IndexedDB Streaming Engine
          </div>
          <div>
            Zero server uploads · Built for massive 300MB+ company census files
          </div>
        </div>
      </footer>
    </div>
  );
}


