import React from 'react';
import { Play, Square, CheckCircle, AlertCircle, Clock, Zap, Activity, Download, ListOrdered, CheckSquare, Layers, Calendar } from 'lucide-react';
import { ProcessingMetrics } from '../types/fmcsa';
import { formatBytes } from './FilePicker';

interface ProgressDashboardProps {
  metrics: ProcessingMetrics;
  onStart: () => void;
  onCancel: () => void;
  onExportAll: () => void;
  onExportSelected: () => void;
  hasFile: boolean;
  totalMatches: number;
  selectedCount: number;
  isExportingAll?: boolean;
}

function formatDuration(seconds: number): string {
  if (isNaN(seconds) || seconds < 0 || !isFinite(seconds)) return '--:--';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export const ProgressDashboard: React.FC<ProgressDashboardProps> = ({
  metrics,
  onStart,
  onCancel,
  onExportAll,
  onExportSelected,
  hasFile,
  totalMatches,
  selectedCount,
  isExportingAll = false,
}) => {
  const isProcessing = metrics.status === 'processing';
  const isCompleted = metrics.status === 'completed';
  const isCancelled = metrics.status === 'cancelled';
  const isError = metrics.status === 'error';

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 space-y-5">
      {/* Action Row */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 pb-4 border-b border-neutral-800">
        <div className="flex flex-wrap items-center gap-3">
          {!isProcessing ? (
            <button
              type="button"
              onClick={onStart}
              disabled={!hasFile}
              className="flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-semibold text-neutral-950 bg-emerald-400 hover:bg-emerald-300 active:bg-emerald-500 rounded-lg shadow-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>Extract Leads</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onCancel}
              className="flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-500 active:bg-red-700 rounded-lg shadow-sm transition-all cursor-pointer whitespace-nowrap"
            >
              <Square className="w-4 h-4 fill-current" />
              <span>Cancel Extraction</span>
            </button>
          )}

          {/* FIX 2: Export All Matching Leads (Uncapped from IndexedDB) */}
          <button
            type="button"
            onClick={onExportAll}
            disabled={totalMatches === 0 || isProcessing || isExportingAll}
            className="flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
            title="Streams all matching leads from local storage into an RFC-4180 CSV"
          >
            <Download className="w-4 h-4 text-emerald-400" />
            <span>
              {isExportingAll ? 'Streaming CSV...' : `Export All Matching (${totalMatches.toLocaleString()})`}
            </span>
          </button>

          {/* FIX 2: Export Selected Leads */}
          <button
            type="button"
            onClick={onExportSelected}
            disabled={selectedCount === 0 || isProcessing}
            className="flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-emerald-300 bg-emerald-950/40 hover:bg-emerald-900/50 border border-emerald-500/40 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed whitespace-nowrap"
            title="Exports only the specifically checked leads"
          >
            <CheckSquare className="w-4 h-4 text-emerald-400" />
            <span>Export Selected ({selectedCount.toLocaleString()})</span>
          </button>
        </div>

        {/* Status indicator */}
        <div className="flex items-center gap-2 text-xs">
          <span className="text-neutral-500">Status:</span>
          {isProcessing && (
            <span className="text-emerald-400 font-medium flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Streaming & Filtering Chunks...
            </span>
          )}
          {isCompleted && (
            <span className="text-emerald-400 font-medium flex items-center gap-1.5">
              <CheckCircle className="w-4 h-4 text-emerald-400" />
              Extraction Complete
            </span>
          )}
          {isCancelled && (
            <span className="text-amber-400 font-medium flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4 text-amber-400" />
              Aborted by User
            </span>
          )}
          {isError && (
            <span className="text-red-400 font-medium flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4 text-red-400" />
              {metrics.errorMessage || 'Error Processing CSV'}
            </span>
          )}
          {metrics.status === 'idle' && (
            <span className="text-neutral-400 font-medium">
              Ready to process
            </span>
          )}
        </div>
      </div>

      {/* Real-time Progress Bar */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs font-mono">
          <span className="text-neutral-400 flex items-center gap-1.5 font-sans">
            <Activity className="w-3.5 h-3.5 text-emerald-400" />
            Overall Progress
          </span>
          <span className="text-white font-semibold">
            {metrics.percentage.toFixed(1)}%
            {metrics.totalBytes > 0 && (
              <span className="text-neutral-400 text-[11px] font-normal ml-2">
                ({formatBytes(metrics.processedBytes)} / {formatBytes(metrics.totalBytes)})
              </span>
            )}
          </span>
        </div>
        <div className="w-full bg-neutral-950 rounded-full h-2.5 overflow-hidden border border-neutral-800">
          <div
            className="bg-emerald-500 h-full rounded-full transition-all duration-150 ease-out"
            style={{ width: `${Math.max(0, Math.min(100, metrics.percentage))}%` }}
          />
        </div>

        {/* New Carrier Filter Status Banner */}
        {metrics.authorityDateLabel && metrics.authorityDateLabel !== 'All' && (
          <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 bg-neutral-950/80 border border-emerald-500/30 rounded-lg text-xs mt-2">
            <div className="flex items-center gap-2 text-emerald-400">
              <Calendar className="w-3.5 h-3.5" />
              <span>
                New Carrier Filter: <strong className="text-white font-medium">{metrics.authorityDateLabel}</strong>
                <span className="text-neutral-400 text-[11px] ml-1.5">
                  (Source Field: {metrics.dateFieldName || 'ADD_DATE'})
                </span>
              </span>
            </div>
            {typeof metrics.excludedMissingDateCount === 'number' && metrics.excludedMissingDateCount > 0 && (
              <div className="text-[11px] text-neutral-400">
                Excluded (missing / invalid date):{' '}
                <span className="font-mono text-amber-400 font-medium">
                  {metrics.excludedMissingDateCount.toLocaleString()}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Metrics Strip (Tabular Figures) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-2">
        {/* Metric 1: Rows Processed */}
        <div className="p-3 bg-neutral-950/70 border border-neutral-800 rounded-lg">
          <div className="text-[11px] text-neutral-400 flex items-center gap-1 mb-1">
            <ListOrdered className="w-3 h-3 text-neutral-500" />
            Rows Processed
          </div>
          <div className="text-lg font-bold font-mono text-white tabular-nums">
            {metrics.totalRowsProcessed.toLocaleString()}
          </div>
        </div>

        {/* Metric 2: Matching Leads */}
        <div className="p-3 bg-neutral-950/70 border border-neutral-800 rounded-lg">
          <div className="text-[11px] text-neutral-400 flex items-center gap-1 mb-1">
            <CheckCircle className="w-3 h-3 text-emerald-400" />
            Matching Leads
          </div>
          <div className="text-lg font-bold font-mono text-emerald-400 tabular-nums">
            {totalMatches.toLocaleString()}
          </div>
        </div>

        {/* Metric 3: Processing Speed */}
        <div className="p-3 bg-neutral-950/70 border border-neutral-800 rounded-lg">
          <div className="text-[11px] text-neutral-400 flex items-center gap-1 mb-1">
            <Zap className="w-3 h-3 text-amber-400" />
            Throughput Speed
          </div>
          <div className="text-base font-bold font-mono text-white tabular-nums">
            {metrics.rowsPerSecond.toLocaleString()}{' '}
            <span className="text-[11px] font-normal text-neutral-400">rows/s</span>
          </div>
        </div>

        {/* Metric 4: Estimated Time Remaining (ETA) */}
        <div className="p-3 bg-neutral-950/70 border border-neutral-800 rounded-lg">
          <div className="text-[11px] text-neutral-400 flex items-center gap-1 mb-1">
            <Clock className="w-3 h-3 text-blue-400" />
            ETA Remaining
          </div>
          <div className="text-base font-bold font-mono text-white tabular-nums">
            {isProcessing ? formatDuration(metrics.estimatedRemainingSeconds) : '--:--'}
          </div>
        </div>

        {/* Metric 5: USDOT Deduplicated Count (Fix 3) */}
        <div className="p-3 bg-neutral-950/70 border border-neutral-800 rounded-lg">
          <div className="text-[11px] text-neutral-400 flex items-center gap-1 mb-1">
            <Layers className="w-3 h-3 text-purple-400" />
            USDOT Duplicates
          </div>
          <div className="text-base font-bold font-mono text-purple-300 tabular-nums">
            {metrics.deduplicatedCount.toLocaleString()}
          </div>
        </div>

        {/* Metric 6: Skipped / Encoding Info (Fix 4) */}
        <div className="p-3 bg-neutral-950/70 border border-neutral-800 rounded-lg">
          <div className="text-[11px] text-neutral-400 flex items-center gap-1 mb-1">
            <AlertCircle className="w-3 h-3 text-neutral-500" />
            Skipped / Encoding
          </div>
          <div className="text-sm font-bold font-mono text-neutral-300 truncate">
            {metrics.skippedRowsCount.toLocaleString()}{' '}
            <span className="text-[10px] text-neutral-500 uppercase font-sans">
              ({metrics.detectedEncoding || 'utf-8'})
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
