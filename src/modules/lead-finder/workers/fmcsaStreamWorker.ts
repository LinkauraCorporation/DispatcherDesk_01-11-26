import Papa from 'papaparse';
import { ColumnIndexMap, buildColumnIndexMap, testAndExtractLead } from '../utils/fmcsaParser';
import { FmcsaFilterConfig, FmcsaLead } from '../types/fmcsa';
import { clearLeadDb, putLeadsBatch } from '../utils/leadStorage';
import { resolveDateFilterRange } from '../utils/dateUtils';

interface StartPayload {
  file: File;
  filters: FmcsaFilterConfig;
  resolvedEncoding?: string;
  maxPreviewLeads?: number;
}

let isCancelled = false;
let parserInstance: Papa.Parser | null = null;

let discoveredOps: Record<string, number> = {};

self.onmessage = async (e: MessageEvent) => {
  const { type } = e.data;

  if (type === 'CANCEL') {
    isCancelled = true;
    if (parserInstance) {
      parserInstance.abort();
    }
    self.postMessage({ type: 'CANCELLED' });
    return;
  }

  if (type === 'START') {
    const {
      file,
      filters,
      resolvedEncoding = 'utf-8',
      maxPreviewLeads = 25000,
    } = e.data as StartPayload;

    if (!file) {
      self.postMessage({ type: 'ERROR', error: 'No file provided' });
      return;
    }

    isCancelled = false;
    discoveredOps = {};

    // Clear disk-backed IndexedDB store for new extraction
    try {
      await clearLeadDb();
    } catch (err) {
      console.warn('Could not reset IndexedDB:', err);
    }

    const totalBytes = file.size;
    let processedBytes = 0;
    let totalRowsProcessed = 0;
    let matchingLeadsCount = 0;
    let skippedRowsCount = 0;
    let deduplicatedCount = 0;
    let excludedMissingDateCount = 0;
    let isHeaderProcessed = false;
    let colMap: ColumnIndexMap | null = null;

    // Resolve date filter range (Calendar-safe, no timezone shift)
    const dateRange = resolveDateFilterRange(
      filters.authorityDateOption,
      filters.customStartDate,
      filters.customEndDate
    );

    // Track seen USDOTs for deduplication (Fix 3)
    // Stores dot -> { id, isActive }
    const seenDots = new Map<string, { id: string; isActive: boolean }>();

    const startTime = performance.now();
    let lastProgressTime = performance.now();

    // UI preview buffer (up to maxPreviewLeads for smooth 60fps React rendering)
    let leadsBufferForMainThread: FmcsaLead[] = [];
    // Disk storage buffer (flushed in batches of 1,000 to IndexedDB)
    let dbWriteBuffer: FmcsaLead[] = [];

    const flushDbBuffer = async () => {
      if (dbWriteBuffer.length > 0) {
        const batch = dbWriteBuffer;
        dbWriteBuffer = [];
        try {
          await putLeadsBatch(batch);
        } catch (err) {
          console.error('Failed to write leads batch to IndexedDB:', err);
        }
      }
    };

    Papa.parse<string[]>(file, {
      chunkSize: 1024 * 1024 * 3, // 3MB chunk for lean memory footprint
      skipEmptyLines: 'greedy',
      header: false,
      worker: false, // Already inside our dedicated Web Worker
      encoding: resolvedEncoding, // Fix 4: Windows-1252 / ANSI or UTF-8
      chunk: (results, parser) => {
        parserInstance = parser;

        if (isCancelled) {
          parser.abort();
          return;
        }

        const data = results.data;
        if (!data || data.length === 0) return;

        let startRowIdx = 0;

        // Process header on the very first chunk
        if (!isHeaderProcessed) {
          const rawHeader = data[0];
          colMap = buildColumnIndexMap(rawHeader);
          isHeaderProcessed = true;
          startRowIdx = 1;
        }

        if (!colMap) {
          skippedRowsCount += data.length;
          return;
        }

        const len = data.length;
        for (let i = startRowIdx; i < len; i++) {
          if (isCancelled) {
            parser.abort();
            return;
          }

          const row = data[i];
          if (!row || row.length < 2) {
            skippedRowsCount++;
            continue;
          }

          totalRowsProcessed++;

          try {
            const { matched, lead, carrierOp, isMissingDate } = testAndExtractLead(
              row,
              colMap,
              filters,
              totalRowsProcessed,
              dateRange
            );

            if (isMissingDate) {
              excludedMissingDateCount++;
            }

            // Record discovered carrier operations for dynamic filter configuration
            if (carrierOp) {
              const opClean = carrierOp.trim().toUpperCase();
              if (opClean) {
                discoveredOps[opClean] = (discoveredOps[opClean] || 0) + 1;
              }
            }

            if (matched && lead) {
              // FIX 3: USDOT Deduplication
              if (filters.deduplicateDot && lead.dot) {
                const dotClean = lead.dot.trim();
                const existing = seenDots.get(dotClean);

                if (existing) {
                  // Duplicate USDOT found
                  const isNewActive = lead.authorityStatus === 'A';
                  if (!existing.isActive && isNewActive) {
                    // Replace previous inactive with the active record
                    lead.id = existing.id; // overwrite same key in DB
                    seenDots.set(dotClean, { id: existing.id, isActive: true });
                    dbWriteBuffer.push(lead);
                    deduplicatedCount++;
                    // Send replaced lead to main thread to update preview in-place
                    leadsBufferForMainThread.push(lead);
                  } else {
                    // Skip duplicate
                    deduplicatedCount++;
                    continue;
                  }
                } else {
                  // First time seeing this USDOT
                  seenDots.set(dotClean, {
                    id: lead.id,
                    isActive: lead.authorityStatus === 'A',
                  });
                  matchingLeadsCount++;
                  dbWriteBuffer.push(lead);

                  // Keep preview leads for UI responsiveness
                  if (matchingLeadsCount <= maxPreviewLeads) {
                    leadsBufferForMainThread.push(lead);
                  }
                }
              } else {
                // Deduplication disabled or no DOT present
                matchingLeadsCount++;
                dbWriteBuffer.push(lead);

                if (matchingLeadsCount <= maxPreviewLeads) {
                  leadsBufferForMainThread.push(lead);
                }
              }

              // Periodically flush write buffer to IndexedDB (every 1,000 records)
              if (dbWriteBuffer.length >= 1000) {
                flushDbBuffer();
              }
            }
          } catch {
            skippedRowsCount++;
          }
        }

        // Update byte cursor from PapaParse meta
        processedBytes = results.meta.cursor || processedBytes;

        const now = performance.now();
        // Throttle progress updates to main thread (~120ms interval)
        if (now - lastProgressTime > 120 || results.meta.cursor >= totalBytes) {
          const elapsedSec = Math.max(0.001, (now - startTime) / 1000);
          const rps = Math.round(totalRowsProcessed / elapsedSec);
          const bps = processedBytes / elapsedSec;
          const remainingBytes = Math.max(0, totalBytes - processedBytes);
          const etaSec = bps > 0 ? Math.ceil(remainingBytes / bps) : 0;
          const percentage = Math.min(100, Number(((processedBytes / totalBytes) * 100).toFixed(1)));

          // Send any buffered preview leads to UI
          if (leadsBufferForMainThread.length > 0) {
            self.postMessage({
              type: 'CHUNK_MATCHES',
              newMatches: leadsBufferForMainThread,
              totalMatches: matchingLeadsCount,
            });
            leadsBufferForMainThread = [];
          }

          self.postMessage({
            type: 'PROGRESS',
            metrics: {
              status: 'processing',
              totalBytes,
              processedBytes,
              percentage,
              totalRowsProcessed,
              matchingLeadsCount,
              skippedRowsCount,
              deduplicatedCount,
              excludedMissingDateCount,
              rowsPerSecond: rps,
              bytesPerSecond: bps,
              estimatedRemainingSeconds: etaSec,
              elapsedSeconds: Math.floor(elapsedSec),
              detectedEncoding: resolvedEncoding,
              authorityDateLabel: dateRange.label,
              dateFieldName: colMap?.recordDateFieldName || 'ADD_DATE',
            },
            discoveredCodes: discoveredOps,
          });

          lastProgressTime = now;
        }
      },
      complete: async () => {
        if (isCancelled) return;

        // Flush any remaining leads to IndexedDB
        await flushDbBuffer();

        const now = performance.now();
        const elapsedSec = Math.max(0.001, (now - startTime) / 1000);
        const rps = Math.round(totalRowsProcessed / elapsedSec);

        // Send any final preview matches
        if (leadsBufferForMainThread.length > 0) {
          self.postMessage({
            type: 'CHUNK_MATCHES',
            newMatches: leadsBufferForMainThread,
            totalMatches: matchingLeadsCount,
          });
          leadsBufferForMainThread = [];
        }

        self.postMessage({
          type: 'COMPLETE',
          metrics: {
            status: 'completed',
            totalBytes,
            processedBytes: totalBytes,
            percentage: 100,
            totalRowsProcessed,
            matchingLeadsCount,
            skippedRowsCount,
            deduplicatedCount,
            excludedMissingDateCount,
            rowsPerSecond: rps,
            bytesPerSecond: 0,
            estimatedRemainingSeconds: 0,
            elapsedSeconds: Math.round(elapsedSec),
            detectedEncoding: resolvedEncoding,
            authorityDateLabel: dateRange.label,
            dateFieldName: colMap?.recordDateFieldName || 'ADD_DATE',
          },
          discoveredCodes: discoveredOps,
          totalMatches: matchingLeadsCount,
        });
      },
      error: (err) => {
        if (isCancelled) return;
        self.postMessage({
          type: 'ERROR',
          error: err.message || 'Error occurred while streaming CSV',
        });
      },
    });
  }
};
