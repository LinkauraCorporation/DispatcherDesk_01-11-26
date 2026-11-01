import React, { useState } from 'react';
import { LoadWithRelations } from '../loads/loadTypes.ts';
import { PipelineStatus } from '../../types/domain.types.ts';
import { PipelineColumnDef, ColumnSummaryMetrics } from './pipelineTypes.ts';
import { PipelineLoadCard } from './PipelineLoadCard.tsx';
import { formatCurrency, formatRPM } from '../../lib/calculations.ts';
import {
  Layers,
  DollarSign,
  PackageCheck,
  TrendingUp,
  Inbox,
  Lock,
} from 'lucide-react';

interface PipelineColumnProps {
  column: PipelineColumnDef;
  loads: LoadWithRelations[];
  canMove: boolean;
  canEdit: boolean;
  onViewLoad: (load: LoadWithRelations) => void;
  onEditLoad: (load: LoadWithRelations) => void;
  onStatusChange: (load: LoadWithRelations, newStatus: PipelineStatus) => void;
  onCardDragStart: (e: React.DragEvent<HTMLDivElement>, load: LoadWithRelations) => void;
  onCardDragEnd: (e: React.DragEvent<HTMLDivElement>) => void;
  onDropOnColumn: (targetStatus: PipelineStatus) => void;
}

export const PipelineColumn: React.FC<PipelineColumnProps> = ({
  column,
  loads,
  canMove,
  canEdit,
  onViewLoad,
  onEditLoad,
  onStatusChange,
  onCardDragStart,
  onCardDragEnd,
  onDropOnColumn,
}) => {
  const [isDragOver, setIsDragOver] = useState(false);

  // Compute column summary metrics
  const metrics: ColumnSummaryMetrics = React.useMemo(() => {
    let totalGross = 0;
    let totalMiles = 0;

    loads.forEach((l) => {
      totalGross += Number(l.rate || 0);
      totalMiles += Number(l.loaded_miles || 0) + Number(l.deadhead_miles || 0);
    });

    const averageRpm = totalMiles > 0 ? totalGross / totalMiles : 0;

    return {
      count: loads.length,
      totalGross,
      totalMiles,
      averageRpm,
    };
  }, [loads]);

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (!canMove) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (!isDragOver) {
      setIsDragOver(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    // Only clear drag over if leaving the column element itself
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    if (!canMove) return;
    e.preventDefault();
    setIsDragOver(false);
    onDropOnColumn(column.id);
  };

  // Header coloring based on stage
  const isFinancialStage = column.stageType === 'financial';
  const stageHeaderBg = isFinancialStage
    ? 'bg-gradient-to-b from-slate-900 via-slate-950 to-slate-950 border-b border-indigo-950/80'
    : 'bg-slate-950/80 border-b border-slate-800';

  const badgeTheme = {
    sourced: 'bg-slate-800 text-slate-300 border-slate-700',
    negotiating: 'bg-amber-950/70 text-amber-300 border-amber-800/60',
    booked: 'bg-sky-950/70 text-sky-300 border-sky-800/60',
    in_transit: 'bg-purple-950/70 text-purple-300 border-purple-800/60',
    delivered: 'bg-teal-950/70 text-teal-300 border-teal-800/60',
    invoiced: 'bg-indigo-950/70 text-indigo-300 border-indigo-800/60',
    paid: 'bg-emerald-950/70 text-emerald-300 border-emerald-800/60',
  }[column.id];

  return (
    <div
      id={`pipeline-col-${column.id}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`flex flex-col flex-1 min-w-[280px] max-w-[320px] rounded-2xl bg-slate-900/60 border transition-all duration-200 shadow-sm ${
        isDragOver
          ? 'border-sky-500 bg-sky-950/20 ring-2 ring-sky-500/40 shadow-lg shadow-sky-900/20'
          : 'border-slate-800/90'
      }`}
    >
      {/* Column Header */}
      <div className={`p-3.5 rounded-t-2xl space-y-2 ${stageHeaderBg}`}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span
              className={`px-2.5 py-0.5 rounded-lg text-[11px] font-bold uppercase tracking-wider border font-mono ${badgeTheme}`}
            >
              {column.stepNumber}. {column.label}
            </span>
            {isFinancialStage && (
              <span
                className="text-[9px] font-semibold text-indigo-300 uppercase tracking-widest bg-indigo-950/70 px-1.5 py-0.5 rounded-md border border-indigo-800/60"
                title="Financial settlement stage"
              >
                Settlement
              </span>
            )}
          </div>

          <span className="text-xs font-mono tabular-nums font-bold px-2 py-0.5 rounded-full bg-slate-800/90 text-slate-200 border border-slate-700/80 shrink-0">
            {metrics.count}
          </span>
        </div>

        {/* Aggregate Revenue & RPM Metrics */}
        <div className="flex items-center justify-between text-xs pt-1.5 border-t border-slate-800/70 font-mono tabular-nums">
          <div className="flex items-center gap-1.5 text-slate-300">
            <span className="text-[10px] text-slate-500 uppercase font-sans font-medium">Vol:</span>
            <span className="font-bold text-slate-100">{formatCurrency(metrics.totalGross)}</span>
          </div>

          {metrics.averageRpm > 0 && (
            <div className="text-[11px] text-sky-400 font-semibold" title="Average Rate Per Mile">
              Avg: {formatRPM(metrics.averageRpm)}
            </div>
          )}
        </div>
      </div>

      {/* Column Body / Drop Zone */}
      <div className="p-2.5 sm:p-3 flex-1 space-y-3 min-h-[380px] overflow-y-auto max-h-[calc(100vh-280px)]">
        {loads.length === 0 ? (
          <div
            className={`h-full min-h-[180px] flex flex-col items-center justify-center p-4 text-center rounded-xl border border-dashed transition-colors ${
              isDragOver
                ? 'border-sky-400/80 bg-sky-950/40 text-sky-300'
                : 'border-slate-800/80 bg-slate-950/40 text-slate-500'
            }`}
          >
            <Inbox className="w-5 h-5 mb-2 opacity-50 text-slate-400" />
            <span className="text-xs font-medium text-slate-400">No loads in {column.label}</span>
            {canMove && (
              <span className="text-[10px] text-slate-500 mt-1">
                Drop loads here to advance stage
              </span>
            )}
          </div>
        ) : (
          loads.map((load) => (
            <PipelineLoadCard
              key={load.id}
              load={load}
              canMove={canMove}
              canEdit={canEdit}
              onViewLoad={onViewLoad}
              onEditLoad={onEditLoad}
              onStatusChange={onStatusChange}
              onDragStart={onCardDragStart}
              onDragEnd={onCardDragEnd}
            />
          ))
        )}
      </div>
    </div>
  );
};
