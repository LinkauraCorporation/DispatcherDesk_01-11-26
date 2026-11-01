import React, { useState, useEffect } from 'react';
import { LoadWithRelations } from '../loads/loadTypes.ts';
import { PipelineStatus } from '../../types/domain.types.ts';
import { StatusBadge } from '../../components/common/StatusBadge.tsx';
import { calculateProfitability, formatCurrency, formatMiles, formatRPM } from '../../lib/calculations.ts';
import { useTimezone } from '../../contexts/TimezoneContext.tsx';
import { formatInTimezone } from '../../lib/timezones.ts';
import { documentService } from '../documents/documentService.ts';
import { LoadDocumentSummary } from '../documents/documentTypes.ts';
import { checkCallService } from '../checkcalls/checkCallService.ts';
import { LoadTrackingSummary, CHECK_CALL_STATUS_BADGES } from '../checkcalls/checkCallTypes.ts';
import {
  getAllowedTransitions,
  getPipelineStatusLabel,
} from './pipelineTypes.ts';
import {
  ArrowRight,
  MapPin,
  Calendar,
  Truck as TruckIcon,
  User,
  Building2,
  Package,
  Weight,
  MoreVertical,
  Eye,
  Edit2,
  Copy,
  Check,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  GripVertical,
  Clock,
  FileCheck,
  FileWarning,
  Radio,
  AlertTriangle,
  ShieldAlert,
} from 'lucide-react';

interface PipelineLoadCardProps {
  load: LoadWithRelations;
  canMove: boolean;
  canEdit: boolean;
  onViewLoad: (load: LoadWithRelations) => void;
  onEditLoad: (load: LoadWithRelations) => void;
  onStatusChange: (load: LoadWithRelations, newStatus: PipelineStatus) => void;
  onDragStart: (e: React.DragEvent<HTMLDivElement>, load: LoadWithRelations) => void;
  onDragEnd: (e: React.DragEvent<HTMLDivElement>) => void;
}

export const PipelineLoadCard: React.FC<PipelineLoadCardProps> = ({
  load,
  canMove,
  canEdit,
  onViewLoad,
  onEditLoad,
  onStatusChange,
  onDragStart,
  onDragEnd,
}) => {
  const { operationalTimezone } = useTimezone();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [hasCopied, setHasCopied] = useState(false);
  const [docSummary, setDocSummary] = useState<LoadDocumentSummary | null>(null);
  const [trackingSummary, setTrackingSummary] = useState<LoadTrackingSummary | null>(null);

  useEffect(() => {
    let isMounted = true;

    const fetchTracking = () => {
      checkCallService.getTrackingSummaryForLoad(load.organization_id, load).then((trackRes) => {
        if (isMounted) {
          setTrackingSummary(trackRes);
        }
      });
    };

    documentService.getDocumentSummaryForLoad(load.organization_id, load).then((docRes) => {
      if (isMounted) {
        setDocSummary(docRes);
      }
    });

    fetchTracking();

    const unsubscribe = checkCallService.subscribeToLoadTracking(load.id, () => {
      fetchTracking();
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [load]);

  // Financial calculations
  const totalMiles = Number(load.loaded_miles || 0) + Number(load.deadhead_miles || 0);
  const financialMetrics = calculateProfitability({
    rate: load.rate || 0,
    loadedMiles: load.loaded_miles || 0,
    deadheadMiles: load.deadhead_miles || 0,
    fuelExpense: load.fuel_expense || 0,
    driverPay: load.driver_pay || 0,
    otherExpenses: load.other_expenses || 0,
  });

  const isProfitable = financialMetrics.estimatedProfit >= 0;
  const isHighMargin = financialMetrics.profitMargin >= 15;

  const allowedTransitions = getAllowedTransitions(load.pipeline_status);

  const handleCopyLoadNumber = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(load.load_number);
    setHasCopied(true);
    setTimeout(() => {
      setHasCopied(false);
      setIsMenuOpen(false);
    }, 1500);
  };

  const formattedPickup = load.pickup_datetime
    ? formatInTimezone(load.pickup_datetime, operationalTimezone, {
        includeDate: true,
        includeTime: true,
        includeTimezoneCode: false,
      })
    : null;

  const formattedDelivery = load.delivery_datetime
    ? formatInTimezone(load.delivery_datetime, operationalTimezone, {
        includeDate: true,
        includeTime: true,
        includeTimezoneCode: false,
      })
    : null;

  return (
    <div
      id={`pipeline-card-${load.id}`}
      draggable={canMove}
      onDragStart={(e) => onDragStart(e, load)}
      onDragEnd={onDragEnd}
      onClick={() => onViewLoad(load)}
      className={`group relative bg-slate-900/90 hover:bg-slate-900 border border-slate-800/90 hover:border-slate-700 rounded-xl p-3.5 space-y-3 transition-all duration-150 shadow-sm hover:shadow-md cursor-pointer select-none ${
        canMove ? 'active:cursor-grabbing' : ''
      }`}
    >
      {/* Top Header: Load #, Grip, & Quick Actions */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {canMove && (
            <span
              className="text-slate-500 group-hover:text-slate-300 cursor-grab active:cursor-grabbing p-0.5 -ml-1 rounded transition-colors"
              title="Drag to move status"
              onClick={(e) => e.stopPropagation()}
            >
              <GripVertical className="w-3.5 h-3.5" />
            </span>
          )}
          <span className="font-mono tabular-nums text-xs font-bold text-sky-400 tracking-tight truncate">
            {load.load_number}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
          {/* Equipment Tag */}
          <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-md bg-slate-800/90 text-slate-300 border border-slate-700/60 font-mono">
            {load.equipment_type.replace('_', ' ')}
          </span>

          {/* Quick Actions Menu Trigger */}
          <div className="relative">
            <button
              id={`load-menu-btn-${load.id}`}
              type="button"
              onClick={() => setIsMenuOpen((prev) => !prev)}
              className="p-1 rounded-md text-slate-400 hover:text-slate-100 hover:bg-slate-800 border border-transparent hover:border-slate-700 transition-colors cursor-pointer"
              title="Actions"
            >
              <MoreVertical className="w-3.5 h-3.5" />
            </button>

            {isMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-30"
                  onClick={() => setIsMenuOpen(false)}
                />
                <div className="absolute right-0 top-6 z-40 w-48 bg-slate-950 border border-slate-700 rounded-xl shadow-2xl py-1 text-xs text-slate-200 space-y-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      setIsMenuOpen(false);
                      onViewLoad(load);
                    }}
                    className="w-full px-3 py-2 text-left hover:bg-slate-800 flex items-center gap-2 transition-colors cursor-pointer text-slate-200"
                  >
                    <Eye className="w-3.5 h-3.5 text-sky-400" />
                    <span>View Load Details</span>
                  </button>

                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsMenuOpen(false);
                        onEditLoad(load);
                      }}
                      className="w-full px-3 py-2 text-left hover:bg-slate-800 flex items-center gap-2 transition-colors cursor-pointer text-slate-200"
                    >
                      <Edit2 className="w-3.5 h-3.5 text-amber-400" />
                      <span>Edit Load</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleCopyLoadNumber}
                    className="w-full px-3 py-2 text-left hover:bg-slate-800 flex items-center gap-2 transition-colors cursor-pointer text-slate-200"
                  >
                    {hasCopied ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5 text-slate-400" />
                    )}
                    <span>{hasCopied ? 'Copied!' : 'Copy Load Number'}</span>
                  </button>

                  {/* Move To Sub-actions (Keyboard / Click alternative to Drag) */}
                  {canMove && allowedTransitions.length > 0 && (
                    <div className="pt-1 mt-1 border-t border-slate-800">
                      <div className="px-3 py-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                        Move to Status:
                      </div>
                      {allowedTransitions.map((targetStatus) => (
                        <button
                          key={targetStatus}
                          type="button"
                          onClick={() => {
                            setIsMenuOpen(false);
                            onStatusChange(load, targetStatus);
                          }}
                          className="w-full px-3 py-1.5 text-left hover:bg-slate-800 flex items-center justify-between transition-colors cursor-pointer text-slate-300 text-xs"
                        >
                          <span>{getPipelineStatusLabel(targetStatus)}</span>
                          <ChevronRight className="w-3 h-3 text-slate-500" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Origin -> Destination Route Display */}
      <div className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800/80 space-y-1.5">
        <div className="flex items-center justify-between text-xs font-semibold text-slate-100">
          <div className="flex items-center gap-1.5 truncate">
            <span className="px-1.5 py-0.5 rounded bg-sky-950/80 text-sky-300 border border-sky-800/60 font-mono text-[11px] shrink-0">
              {load.origin_state}
            </span>
            <span className="truncate">{load.origin_city}</span>
          </div>

          <ArrowRight className="w-3.5 h-3.5 text-indigo-400 shrink-0 mx-1.5" />

          <div className="flex items-center gap-1.5 truncate justify-end">
            <span className="truncate">{load.dest_city}</span>
            <span className="px-1.5 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-800/60 font-mono text-[11px] shrink-0">
              {load.dest_state}
            </span>
          </div>
        </div>

        {/* Pickup & Delivery Times */}
        {(formattedPickup || formattedDelivery) && (
          <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono tabular-nums pt-1 border-t border-slate-800/60">
            <div className="flex items-center gap-1 truncate max-w-[48%]">
              <Clock className="w-2.5 h-2.5 text-slate-500 shrink-0" />
              <span className="truncate">PU: {formattedPickup || 'TBD'}</span>
            </div>
            <span className="truncate max-w-[48%] text-right">DEL: {formattedDelivery || 'TBD'}</span>
          </div>
        )}
      </div>

      {/* Assignments & Stakeholders */}
      <div className="space-y-1.5 text-[11px]">
        {/* Carrier Client / Broker */}
        <div className="flex items-center justify-between text-slate-300">
          <div className="flex items-center gap-1.5 truncate max-w-[50%]">
            <Building2 className="w-3 h-3 text-sky-400 shrink-0" />
            <span className="truncate font-medium" title={load.client?.company_name || 'No Client'}>
              {load.client?.company_name || 'Carrier Fleet'}
            </span>
          </div>

          <div className="flex items-center gap-1 truncate max-w-[48%] text-right justify-end text-slate-400">
            <span className="truncate" title={load.broker?.company_name || 'Direct Shipper'}>
              {load.broker?.company_name || 'Direct Shipper'}
            </span>
          </div>
        </div>

        {/* Truck & Driver */}
        <div className="flex items-center justify-between text-slate-400">
          <div className="flex items-center gap-1.5 truncate max-w-[50%]">
            <TruckIcon className="w-3 h-3 text-purple-400 shrink-0" />
            <span className="truncate font-mono tabular-nums">
              {load.truck?.truck_number ? `Unit #${load.truck.truck_number}` : 'Unassigned Truck'}
            </span>
          </div>

          <div className="flex items-center gap-1 truncate max-w-[48%] justify-end">
            <User className="w-3 h-3 text-indigo-400 shrink-0" />
            <span className="truncate">
              {load.driver?.full_name || 'Unassigned Driver'}
            </span>
          </div>
        </div>

        {/* Commodity / Weight if present */}
        {(load.commodity || load.weight_lbs) && (
          <div className="flex items-center justify-between text-[10px] text-slate-400 pt-0.5">
            <span className="truncate max-w-[65%]">
              {load.commodity || 'General Freight'}
            </span>
            {load.weight_lbs ? (
              <span className="font-mono tabular-nums">
                {Number(load.weight_lbs).toLocaleString()} lbs
              </span>
            ) : null}
          </div>
        )}

        {/* Paperwork Readiness Strip */}
        {docSummary && docSummary.totalRequired > 0 && (
          <div
            className="flex items-center justify-between pt-1 border-t border-slate-800/60 text-[10px] cursor-pointer hover:opacity-90"
            onClick={(e) => {
              e.stopPropagation();
              onViewLoad(load);
            }}
            title="Click to view & manage paperwork for this load"
          >
            <div className="flex items-center gap-1">
              {docSummary.isReadyToInvoice ? (
                <FileCheck className="w-3 h-3 text-emerald-400" />
              ) : docSummary.isComplete ? (
                <FileCheck className="w-3 h-3 text-sky-400" />
              ) : (
                <FileWarning className="w-3 h-3 text-amber-400" />
              )}
              <span
                className={
                  docSummary.isReadyToInvoice
                    ? 'text-emerald-400 font-semibold'
                    : docSummary.isComplete
                    ? 'text-sky-300 font-medium'
                    : 'text-amber-400 font-semibold'
                }
              >
                {docSummary.isReadyToInvoice
                  ? 'Ready to Invoice'
                  : docSummary.isComplete
                  ? 'Paperwork Complete'
                  : `Missing ${docSummary.missingTypes.length} Doc${docSummary.missingTypes.length > 1 ? 's' : ''}`}
              </span>
            </div>

            <span className="font-mono tabular-nums text-slate-400 text-[10px]">
              {docSummary.totalCompleted}/{docSummary.totalRequired} Docs
            </span>
          </div>
        )}

        {/* Live Dispatch Tracking / Check-In Status */}
        {trackingSummary && (load.pipeline_status === 'booked' || load.pipeline_status === 'in_transit' || trackingSummary.totalCheckCalls > 0) && (
          <div
            className="flex items-center justify-between pt-1 border-t border-slate-800/60 text-[10px] cursor-pointer hover:opacity-90"
            onClick={(e) => {
              e.stopPropagation();
              onViewLoad(load);
            }}
            title="Click to view tracking and dispatch timeline"
          >
            <div className="flex items-center gap-1 min-w-0">
              <Radio className="w-3 h-3 text-indigo-400 shrink-0" />
              {trackingSummary.hasException ? (
                <span className="text-rose-400 font-semibold truncate flex items-center gap-1">
                  <AlertTriangle className="w-2.5 h-2.5 shrink-0" />
                  Exception Logged
                </span>
              ) : trackingSummary.currentLocation ? (
                <span className="text-slate-300 truncate font-medium">
                  {trackingSummary.currentLocation}
                </span>
              ) : (
                <span className="text-slate-400 truncate">
                  {trackingSummary.totalCheckCalls > 0 ? `${trackingSummary.totalCheckCalls} Check-Ins` : 'No Check-Ins'}
                </span>
              )}
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {trackingSummary.isMissingRecentCheckIn ? (
                <span className="inline-flex items-center gap-0.5 px-1 py-0.2 rounded bg-amber-950 text-amber-300 border border-amber-800/50 font-mono tabular-nums text-[9px]">
                  <Clock className="w-2.5 h-2.5" /> &gt;24h
                </span>
              ) : trackingSummary.currentStatus ? (
                <span
                  className={`inline-flex items-center gap-1 px-1.5 py-0.2 rounded font-semibold text-[9px] border ${
                    CHECK_CALL_STATUS_BADGES[trackingSummary.currentStatus]?.bg || 'bg-slate-800'
                  } ${
                    CHECK_CALL_STATUS_BADGES[trackingSummary.currentStatus]?.text || 'text-slate-300'
                  } ${
                    CHECK_CALL_STATUS_BADGES[trackingSummary.currentStatus]?.border || 'border-slate-700'
                  }`}
                >
                  <span
                    className={`w-1 h-1 rounded-full ${
                      CHECK_CALL_STATUS_BADGES[trackingSummary.currentStatus]?.dot || 'bg-slate-400'
                    }`}
                  />
                  {CHECK_CALL_STATUS_BADGES[trackingSummary.currentStatus]?.label || trackingSummary.currentStatus}
                </span>
              ) : null}
            </div>
          </div>
        )}
      </div>

      {/* Financials & Profitability Strip */}
      <div className="pt-2 border-t border-slate-800/80 space-y-1.5">
        <div className="flex items-baseline justify-between">
          <div className="flex items-baseline gap-1.5">
            <span className="text-sm font-bold font-mono tabular-nums text-emerald-400">
              {formatCurrency(load.rate)}
            </span>
            <span className="text-[10px] font-mono tabular-nums text-slate-400">
              ({formatRPM(financialMetrics.rpm)})
            </span>
          </div>

          {/* Margin indicator */}
          <div
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono tabular-nums font-bold border ${
              !isProfitable
                ? 'bg-rose-950/60 text-rose-300 border-rose-800/60'
                : isHighMargin
                ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800/60'
                : 'bg-amber-950/60 text-amber-300 border-amber-800/60'
            }`}
            title={`Net Est. Profit: ${formatCurrency(financialMetrics.estimatedProfit)}`}
          >
            {isProfitable ? (
              <TrendingUp className="w-2.5 h-2.5" />
            ) : (
              <TrendingDown className="w-2.5 h-2.5" />
            )}
            <span>{financialMetrics.profitMargin}%</span>
          </div>
        </div>

        <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono tabular-nums">
          <span>{formatMiles(totalMiles)} ({load.loaded_miles || 0}L + {load.deadhead_miles || 0}DH)</span>
          <span>Net: <strong className={isProfitable ? 'text-slate-200' : 'text-rose-400'}>{formatCurrency(financialMetrics.estimatedProfit)}</strong></span>
        </div>
      </div>
    </div>
  );
};
