import React from 'react';
import {
  PieChart,
  DollarSign,
  Fuel,
  UserCheck,
  Receipt,
  CheckCircle2,
  AlertTriangle,
  Compass,
  TrendingUp,
  Activity,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';
import { ProfitabilitySummary, ProfitabilityAlertItem } from './profitabilityTypes.ts';
import { LoadWithRelations } from '../loads/loadTypes.ts';
import { formatCurrency, formatMiles, formatRPM } from '../../lib/calculations.ts';

interface ProfitabilityOverviewProps {
  summary: ProfitabilitySummary;
  alerts: ProfitabilityAlertItem[];
  onSelectLoad: (load: LoadWithRelations) => void;
}

export const ProfitabilityOverview: React.FC<ProfitabilityOverviewProps> = ({
  summary,
  alerts,
  onSelectLoad,
}) => {
  const totalLoads = summary.totalLoads;
  const healthyPct = totalLoads > 0 ? (summary.healthyCount / totalLoads) * 100 : 0;
  const reviewPct = totalLoads > 0 ? (summary.reviewCount / totalLoads) * 100 : 0;
  const lossPct = totalLoads > 0 ? (summary.lossCount / totalLoads) * 100 : 0;

  const gross = summary.grossRevenue;
  const fuelPct = gross > 0 ? (summary.totalFuelExpense / gross) * 100 : 0;
  const driverPct = gross > 0 ? (summary.totalDriverPay / gross) * 100 : 0;
  const otherPct = gross > 0 ? (summary.totalOtherExpenses / gross) * 100 : 0;
  const netPct = gross > 0 ? (summary.totalEstimatedProfit / gross) * 100 : 0;

  return (
    <div id="profitability-overview-panel" className="space-y-6">
      {/* 4-Column Metric Grid: Health Distribution, Cost Breakdown, Operational Efficiency, Margin Quality */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* A. Profitability Health Distribution */}
        <div className="bg-slate-900 border border-slate-800/90 rounded-xl p-4.5 flex flex-col justify-between space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <PieChart className="w-4 h-4 text-indigo-400" />
              <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                Health Distribution
              </h3>
            </div>
            <span className="text-[11px] font-mono text-slate-400">
              {totalLoads} Load{totalLoads === 1 ? '' : 's'}
            </span>
          </div>

          {/* Health Segment Bar */}
          <div className="space-y-3">
            <div className="h-3 w-full bg-slate-950 rounded-full overflow-hidden flex border border-slate-800">
              {healthyPct > 0 && (
                <div
                  style={{ width: `${healthyPct}%` }}
                  className="bg-emerald-500 transition-all duration-300"
                  title={`Healthy: ${summary.healthyCount} loads (${healthyPct.toFixed(1)}%)`}
                />
              )}
              {reviewPct > 0 && (
                <div
                  style={{ width: `${reviewPct}%` }}
                  className="bg-amber-500 transition-all duration-300"
                  title={`Review: ${summary.reviewCount} loads (${reviewPct.toFixed(1)}%)`}
                />
              )}
              {lossPct > 0 && (
                <div
                  style={{ width: `${lossPct}%` }}
                  className="bg-rose-500 transition-all duration-300"
                  title={`Loss: ${summary.lossCount} loads (${lossPct.toFixed(1)}%)`}
                />
              )}
            </div>

            <div className="space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  <span className="text-slate-300 font-medium">Healthy (≥15% Margin)</span>
                </div>
                <span className="font-mono text-slate-200 font-semibold">
                  {summary.healthyCount} ({healthyPct.toFixed(0)}%)
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                  <span className="text-slate-300 font-medium">Review (0–15% Margin)</span>
                </div>
                <span className="font-mono text-slate-200 font-semibold">
                  {summary.reviewCount} ({reviewPct.toFixed(0)}%)
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                  <span className="text-slate-300 font-medium">Loss (&lt;0% Margin)</span>
                </div>
                <span className="font-mono text-slate-200 font-semibold">
                  {summary.lossCount} ({lossPct.toFixed(0)}%)
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* B. Revenue vs Cost Breakdown */}
        <div className="bg-slate-900 border border-slate-800/90 rounded-xl p-4.5 flex flex-col justify-between space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-emerald-400" />
              <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                Cost & Net Breakdown
              </h3>
            </div>
            <span className="text-[11px] font-mono text-emerald-400 font-bold">
              {formatCurrency(gross)}
            </span>
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex justify-between items-center py-0.5">
              <span className="text-slate-400 flex items-center gap-1.5">
                <Fuel className="w-3.5 h-3.5 text-amber-400" /> Est. Fuel Burn
              </span>
              <div className="text-right">
                <span className="font-mono text-slate-200 font-semibold">
                  {formatCurrency(summary.totalFuelExpense)}
                </span>
                <span className="text-[10px] text-slate-500 font-mono ml-1.5">
                  ({fuelPct.toFixed(1)}%)
                </span>
              </div>
            </div>

            <div className="flex justify-between items-center py-0.5">
              <span className="text-slate-400 flex items-center gap-1.5">
                <UserCheck className="w-3.5 h-3.5 text-indigo-400" /> Driver Compensation
              </span>
              <div className="text-right">
                <span className="font-mono text-slate-200 font-semibold">
                  {formatCurrency(summary.totalDriverPay)}
                </span>
                <span className="text-[10px] text-slate-500 font-mono ml-1.5">
                  ({driverPct.toFixed(1)}%)
                </span>
              </div>
            </div>

            <div className="flex justify-between items-center py-0.5">
              <span className="text-slate-400 flex items-center gap-1.5">
                <Receipt className="w-3.5 h-3.5 text-sky-400" /> Tolls & Accessorials
              </span>
              <div className="text-right">
                <span className="font-mono text-slate-200 font-semibold">
                  {formatCurrency(summary.totalOtherExpenses)}
                </span>
                <span className="text-[10px] text-slate-500 font-mono ml-1.5">
                  ({otherPct.toFixed(1)}%)
                </span>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-800 flex justify-between items-center font-bold">
              <span className="text-emerald-400 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" /> Net Profit
              </span>
              <div className="text-right">
                <span className={`font-mono ${summary.totalEstimatedProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {formatCurrency(summary.totalEstimatedProfit)}
                </span>
                <span className="text-[10px] text-slate-400 font-mono ml-1.5">
                  ({netPct.toFixed(1)}%)
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* C. Operational Mileage Efficiency */}
        <div className="bg-slate-900 border border-slate-800/90 rounded-xl p-4.5 flex flex-col justify-between space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Compass className="w-4 h-4 text-sky-400" />
              <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                Route Efficiency
              </h3>
            </div>
            <span className="text-[11px] font-mono text-slate-400">
              {formatMiles(summary.totalMiles)}
            </span>
          </div>

          <div className="space-y-2.5 text-xs">
            <div className="flex justify-between items-center">
              <span className="text-slate-400">Loaded Miles</span>
              <span className="font-mono text-slate-200 font-semibold">
                {formatMiles(summary.totalLoadedMiles)}
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-slate-400">Deadhead Miles</span>
              <span className="font-mono text-slate-200 font-semibold">
                {formatMiles(summary.totalDeadheadMiles)}
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-slate-400">Deadhead Ratio</span>
              <span className={`font-mono font-semibold ${summary.deadheadPercentage > 20 ? 'text-amber-400' : 'text-emerald-400'}`}>
                {summary.deadheadPercentage}%
              </span>
            </div>

            <div className="pt-2 border-t border-slate-800 flex justify-between items-center">
              <span className="text-slate-300 font-medium">Average RPM</span>
              <span className="font-mono text-sky-400 font-bold">
                {formatRPM(summary.averageRpm)}
              </span>
            </div>
          </div>
        </div>

        {/* D. Margin Quality & Spread */}
        <div className="bg-slate-900 border border-slate-800/90 rounded-xl p-4.5 flex flex-col justify-between space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-purple-400" />
              <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                Margin Quality
              </h3>
            </div>
            <span className={`text-[11px] font-mono font-bold ${summary.averageMargin >= 15 ? 'text-emerald-400' : 'text-amber-400'}`}>
              {summary.averageMargin.toFixed(1)}% Avg
            </span>
          </div>

          <div className="space-y-2.5 text-xs">
            <div className="flex justify-between items-center">
              <span className="text-slate-400">Best Load Margin</span>
              <span className="font-mono text-emerald-400 font-bold">
                +{summary.bestMargin.toFixed(1)}%
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-slate-400">Lowest Load Margin</span>
              <span className={`font-mono font-bold ${summary.worstMargin < 0 ? 'text-rose-400' : 'text-amber-400'}`}>
                {summary.worstMargin.toFixed(1)}%
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-slate-400">Target Benchmark</span>
              <span className="font-mono text-slate-400">15.0% - 25.0%</span>
            </div>

            <div className="pt-2 border-t border-slate-800 flex justify-between items-center">
              <span className="text-slate-300 font-medium">Operating Efficiency</span>
              <span className="font-mono text-slate-200 font-semibold">
                {totalLoads > 0 ? (summary.healthyCount / totalLoads >= 0.75 ? 'Optimal' : 'Needs Optimization') : 'No Data'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Decision Support & Operational Alerts Panel */}
      {alerts.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4.5 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-400" />
              <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                Financial Decision Support & Alerts ({alerts.length})
              </h3>
            </div>
            <span className="text-[11px] text-slate-400 font-mono">
              Actionable margin protection
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {alerts.slice(0, 6).map((alert) => (
              <div
                key={alert.id}
                onClick={() => onSelectLoad(alert.load)}
                className={`p-3 rounded-lg border flex flex-col justify-between gap-2 transition-all cursor-pointer ${
                  alert.severity === 'high'
                    ? 'bg-rose-950/25 border-rose-900/50 hover:border-rose-700'
                    : alert.severity === 'warning'
                    ? 'bg-amber-950/25 border-amber-900/50 hover:border-amber-700'
                    : 'bg-blue-950/25 border-blue-900/50 hover:border-blue-700'
                }`}
              >
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-200">
                      {alert.title}
                    </span>
                    <span
                      className={`text-[9px] uppercase font-mono px-1.5 py-0.2 rounded font-bold ${
                        alert.severity === 'high'
                          ? 'bg-rose-950 text-rose-300 border border-rose-800'
                          : alert.severity === 'warning'
                          ? 'bg-amber-950 text-amber-300 border border-amber-800'
                          : 'bg-blue-950 text-blue-300 border border-blue-800'
                      }`}
                    >
                      {alert.category.replace('_', ' ')}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300/90 leading-relaxed">
                    {alert.description}
                  </p>
                </div>

                <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-400">
                  <span>{alert.load.origin_city}, {alert.load.origin_state} &rarr; {alert.load.dest_city}, {alert.load.dest_state}</span>
                  <span className="text-indigo-400 font-semibold flex items-center gap-0.5 hover:text-indigo-300">
                    Inspect <ArrowRight className="w-3 h-3" />
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
