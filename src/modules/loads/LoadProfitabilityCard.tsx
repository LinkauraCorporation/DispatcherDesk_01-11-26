import React from 'react';
import { calculateProfitability, formatCurrency, formatMiles, formatRPM } from '../../lib/calculations.ts';
import { DollarSign, Fuel, UserCheck, Receipt, TrendingUp, Gauge } from 'lucide-react';

interface LoadProfitabilityCardProps {
  rate: number;
  loadedMiles: number;
  deadheadMiles: number;
  fuelExpense?: number;
  driverPay?: number;
  otherExpenses?: number;
}

export const LoadProfitabilityCard: React.FC<LoadProfitabilityCardProps> = ({
  rate,
  loadedMiles,
  deadheadMiles,
  fuelExpense = 0,
  driverPay = 0,
  otherExpenses = 0,
}) => {
  const metrics = calculateProfitability({
    rate,
    loadedMiles,
    deadheadMiles,
    fuelExpense,
    driverPay,
    otherExpenses,
  });

  const isProfitable = metrics.estimatedProfit >= 0;

  return (
    <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-4">
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-indigo-400" />
          <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">
            Deterministic Profitability Engine
          </span>
        </div>
        <span
          className={`text-xs font-mono font-bold px-2 py-0.5 rounded border ${
            isProfitable
              ? 'bg-emerald-950/50 text-emerald-300 border-emerald-800/50'
              : 'bg-rose-950/50 text-rose-300 border-rose-800/50'
          }`}
        >
          Margin: {metrics.profitMargin}%
        </span>
      </div>

      {/* Top Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div className="bg-slate-900/90 p-2.5 rounded-lg border border-slate-800/80">
          <p className="text-slate-400 text-[10px] uppercase font-semibold">Gross Rate</p>
          <p className="text-base font-bold text-slate-100 font-mono mt-0.5">
            {formatCurrency(metrics.grossRate)}
          </p>
        </div>

        <div className="bg-slate-900/90 p-2.5 rounded-lg border border-slate-800/80">
          <p className="text-slate-400 text-[10px] uppercase font-semibold">Total Miles</p>
          <p className="text-base font-bold text-slate-100 font-mono mt-0.5">
            {formatMiles(metrics.totalMiles)}
          </p>
          <span className="text-[10px] text-slate-400">
            {metrics.loadedMiles} loaded + {metrics.deadheadMiles} DH
          </span>
        </div>

        <div className="bg-slate-900/90 p-2.5 rounded-lg border border-slate-800/80">
          <p className="text-slate-400 text-[10px] uppercase font-semibold">Rate Per Mile (RPM)</p>
          <p className="text-base font-bold text-sky-400 font-mono mt-0.5">
            {formatRPM(metrics.rpm)}
          </p>
        </div>

        <div className="bg-slate-900/90 p-2.5 rounded-lg border border-slate-800/80">
          <p className="text-slate-400 text-[10px] uppercase font-semibold">Net Est. Profit</p>
          <p
            className={`text-base font-bold font-mono mt-0.5 ${
              isProfitable ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {formatCurrency(metrics.estimatedProfit)}
          </p>
        </div>
      </div>

      {/* Expense Breakdown Details */}
      <div className="pt-2 border-t border-slate-800/60 grid grid-cols-3 gap-2 text-[11px] text-slate-400 font-mono">
        <div className="flex items-center gap-1.5">
          <Fuel className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span>Fuel: <strong className="text-slate-200">{formatCurrency(metrics.fuelExpense)}</strong></span>
        </div>
        <div className="flex items-center gap-1.5">
          <UserCheck className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
          <span>Driver: <strong className="text-slate-200">{formatCurrency(metrics.driverPay)}</strong></span>
        </div>
        <div className="flex items-center gap-1.5">
          <Receipt className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span>Other: <strong className="text-slate-200">{formatCurrency(metrics.otherExpenses)}</strong></span>
        </div>
      </div>
    </div>
  );
};
