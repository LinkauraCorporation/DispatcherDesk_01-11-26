import React, { useState } from 'react';
import {
  DollarSign,
  TrendingUp,
  Fuel,
  UserCheck,
  Receipt,
  ExternalLink,
  Download,
} from 'lucide-react';
import { LoadWithRelations } from '../loads/loadTypes.ts';
import { Modal } from '../../components/common/Modal.tsx';
import { StatusBadge } from '../../components/common/StatusBadge.tsx';
import { useTimezone } from '../../contexts/TimezoneContext.tsx';
import { useAuth } from '../../contexts/AuthContext.tsx';
import { formatInTimezone } from '../../lib/timezones.ts';
import {
  calculateProfitability,
  formatCurrency,
  formatMiles,
  formatRPM,
} from '../../lib/calculations.ts';
import { pdfService } from '../../lib/pdf/pdfService.ts';
import { accessorialService } from '../accessorials/accessorialService.ts';

interface ProfitabilityBreakdownModalProps {
  load: LoadWithRelations | null;
  isOpen: boolean;
  onClose: () => void;
  onOpenLoadDetail?: (loadId: string) => void;
}

export const ProfitabilityBreakdownModal: React.FC<ProfitabilityBreakdownModalProps> = ({
  load,
  isOpen,
  onClose,
  onOpenLoadDetail,
}) => {
  const { operationalTimezone, dispatcherTimezone } = useTimezone();
  const { activeOrganization } = useAuth();
  const [isExporting, setIsExporting] = useState<string | null>(null);

  if (!load) return null;

  const handleDownloadInvoice = async () => {
    setIsExporting('invoice');
    try {
      const claims = await accessorialService.getAccessorialsByLoadId(load.organization_id, load.id);
      await pdfService.downloadCarrierInvoice({
        load,
        accessorials: claims,
        organization: activeOrganization,
        operationalTimezone,
        dispatcherTimezone,
      });
    } catch (err) {
      console.error('Failed to generate invoice PDF:', err);
    } finally {
      setIsExporting(null);
    }
  };

  const handleDownloadSettlement = async () => {
    setIsExporting('settlement');
    try {
      const claims = await accessorialService.getAccessorialsByLoadId(load.organization_id, load.id);
      await pdfService.downloadDriverSettlement({
        load,
        accessorials: claims,
        organization: activeOrganization,
        operationalTimezone,
        dispatcherTimezone,
      });
    } catch (err) {
      console.error('Failed to generate settlement PDF:', err);
    } finally {
      setIsExporting(null);
    }
  };

  const metrics = calculateProfitability({
    rate: Number(load.rate || 0),
    loadedMiles: Number(load.loaded_miles || 0),
    deadheadMiles: Number(load.deadhead_miles || 0),
    fuelExpense: Number(load.fuel_expense || 0),
    driverPay: Number(load.driver_pay || 0),
    otherExpenses: Number(load.other_expenses || 0),
  });

  let healthStatus: 'healthy' | 'review' | 'loss' = 'healthy';
  if (metrics.profitMargin < 0) {
    healthStatus = 'loss';
  } else if (metrics.profitMargin < 15) {
    healthStatus = 'review';
  }

  const isProfitPositive = metrics.estimatedProfit >= 0;
  const deadheadPct =
    metrics.totalMiles > 0
      ? Number(((metrics.deadheadMiles / metrics.totalMiles) * 100).toFixed(1))
      : 0;

  return (
    <Modal
      id={`modal-profitability-${load.id}`}
      isOpen={isOpen}
      onClose={onClose}
      title={`Financial Audit: Load ${load.load_number}`}
      subtitle={`${load.origin_city}, ${load.origin_state} → ${load.dest_city}, ${load.dest_state}`}
      maxWidth="2xl"
    >
      <div className="space-y-6">
        {/* Top Header Summary Strip */}
        <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold font-mono text-slate-100">
                {load.load_number}
              </span>
              <StatusBadge status={load.pipeline_status} type="pipeline" size="sm" />
              <StatusBadge status={healthStatus} type="profitability" size="sm" />
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Equipment: <span className="font-mono text-slate-200 uppercase">{load.equipment_type.replace('_', ' ')}</span>
            </p>
          </div>

          <div className="text-right">
            <span className="text-[11px] text-slate-400 uppercase font-semibold">
              Net Carrier Margin
            </span>
            <div className="flex items-center justify-end gap-1.5">
              <span
                className={`text-2xl font-mono font-bold ${
                  metrics.profitMargin >= 15
                    ? 'text-emerald-400'
                    : metrics.profitMargin >= 0
                    ? 'text-amber-400'
                    : 'text-rose-400'
                }`}
              >
                {metrics.profitMargin.toFixed(1)}%
              </span>
            </div>
            <span className="text-xs font-mono text-slate-400">
              ({formatCurrency(metrics.estimatedProfit)} net)
            </span>
          </div>
        </div>

        {/* 2-Column Main Financial Grid: Revenue & Route vs Expenses & Net */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Left: Revenue & Mileage Analysis */}
          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-800 text-sky-400 font-bold text-xs uppercase tracking-wider">
              <DollarSign className="w-4 h-4" />
              <span>Revenue & Route Economics</span>
            </div>

            <div className="space-y-2.5 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Gross Broker Rate</span>
                <span className="font-mono font-bold text-slate-100 text-sm">
                  {formatCurrency(metrics.grossRate)}
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-slate-400">Loaded Miles</span>
                <span className="font-mono text-slate-200">
                  {formatMiles(metrics.loadedMiles)}
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-slate-400">Deadhead Distance</span>
                <div className="text-right font-mono">
                  <span className={deadheadPct > 20 ? 'text-amber-400' : 'text-slate-200'}>
                    {formatMiles(metrics.deadheadMiles)}
                  </span>
                  <span className="text-[10px] text-slate-500 ml-1">
                    ({deadheadPct}%)
                  </span>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-800 flex justify-between items-center font-bold">
                <span className="text-slate-300">Total Route Miles</span>
                <span className="font-mono text-slate-100">
                  {formatMiles(metrics.totalMiles)}
                </span>
              </div>

              <div className="flex justify-between items-center font-bold">
                <span className="text-sky-400 flex items-center gap-1">
                  <TrendingUp className="w-3.5 h-3.5" /> Rate Per Mile (RPM)
                </span>
                <span className="font-mono text-sky-400 text-sm">
                  {formatRPM(metrics.rpm)}
                </span>
              </div>
            </div>
          </div>

          {/* Right: Cost & Deductions Analysis */}
          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-800 text-amber-400 font-bold text-xs uppercase tracking-wider">
              <Receipt className="w-4 h-4" />
              <span>Operating Costs & Net Profit</span>
            </div>

            <div className="space-y-2.5 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <Fuel className="w-3.5 h-3.5 text-amber-400" /> Est. Fuel Burn
                </span>
                <span className="font-mono text-slate-200">
                  {formatCurrency(metrics.fuelExpense)}
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <UserCheck className="w-3.5 h-3.5 text-indigo-400" /> Driver Compensation
                </span>
                <span className="font-mono text-slate-200">
                  {formatCurrency(metrics.driverPay)}
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <Receipt className="w-3.5 h-3.5 text-sky-400" /> Tolls & Accessorials
                </span>
                <span className="font-mono text-slate-200">
                  {formatCurrency(metrics.otherExpenses)}
                </span>
              </div>

              <div className="pt-2 border-t border-slate-800 flex justify-between items-center font-bold">
                <span className="text-slate-300">Total Operating Cost</span>
                <span className="font-mono text-slate-200">
                  {formatCurrency(metrics.totalEstimatedCost)}
                </span>
              </div>

              <div className="flex justify-between items-center font-bold">
                <span className={isProfitPositive ? 'text-emerald-400' : 'text-rose-400'}>
                  Net Estimated Profit
                </span>
                <span className={`font-mono text-sm ${isProfitPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {formatCurrency(metrics.estimatedProfit)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Entity & Route Metadata Grid */}
        <div className="p-4 bg-slate-950/40 border border-slate-800/80 rounded-xl space-y-3">
          <h4 className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
            Operational Dispatch Assignment
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <span className="text-slate-500 block text-[10px] uppercase font-semibold">Carrier Client</span>
              <span className="text-slate-200 font-medium truncate block">
                {load.client?.company_name || 'Unassigned'}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px] uppercase font-semibold">Freight Broker</span>
              <span className="text-slate-200 font-medium truncate block">
                {load.broker?.company_name || 'Unassigned'}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px] uppercase font-semibold">Assigned Unit</span>
              <span className="text-slate-200 font-mono font-medium block">
                {load.truck ? `Unit ${load.truck.truck_number}` : 'Unassigned'}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px] uppercase font-semibold">Assigned Driver</span>
              <span className="text-slate-200 font-medium truncate block">
                {load.driver?.full_name || 'Unassigned'}
              </span>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-800/60 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-slate-500 block text-[10px] uppercase font-semibold">Pickup Time</span>
              <span className="text-slate-300 font-mono">
                {load.pickup_datetime
                  ? formatInTimezone(load.pickup_datetime, operationalTimezone)
                  : 'Pending'}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px] uppercase font-semibold">Delivery Time</span>
              <span className="text-slate-300 font-mono">
                {load.delivery_datetime
                  ? formatInTimezone(load.delivery_datetime, operationalTimezone)
                  : 'Pending'}
              </span>
            </div>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-800">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadInvoice}
              disabled={isExporting !== null}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 border border-emerald-800/60 rounded-lg text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
              title="Download Carrier Invoice PDF"
            >
              <Download className={`w-3.5 h-3.5 ${isExporting === 'invoice' ? 'animate-bounce text-emerald-300' : 'text-emerald-400'}`} />
              <span>{isExporting === 'invoice' ? 'Generating Invoice...' : 'Invoice PDF'}</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadSettlement}
              disabled={isExporting !== null}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-950/80 hover:bg-purple-900 text-purple-300 border border-purple-800/60 rounded-lg text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
              title="Download Driver Settlement Statement PDF"
            >
              <Download className={`w-3.5 h-3.5 ${isExporting === 'settlement' ? 'animate-bounce text-purple-300' : 'text-purple-400'}`} />
              <span>{isExporting === 'settlement' ? 'Generating Settlement...' : 'Settlement PDF'}</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            {onOpenLoadDetail && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenLoadDetail(load.id);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer"
              >
                <span>Open Load Details</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
};
