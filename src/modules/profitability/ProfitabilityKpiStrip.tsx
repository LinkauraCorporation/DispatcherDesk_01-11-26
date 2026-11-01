import React from 'react';
import {
  DollarSign,
  TrendingUp,
  Percent,
  Compass,
  Navigation,
  CheckCircle2,
} from 'lucide-react';
import { ProfitabilitySummary } from './profitabilityTypes.ts';
import { MetricCard } from '../../components/common/MetricCard.tsx';
import { formatCurrency, formatMiles, formatRPM } from '../../lib/calculations.ts';

interface ProfitabilityKpiStripProps {
  summary: ProfitabilitySummary;
}

export const ProfitabilityKpiStrip: React.FC<ProfitabilityKpiStripProps> = ({ summary }) => {
  return (
    <div
      id="profitability-kpi-strip"
      className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-3.5"
    >
      {/* Gross Booked Revenue */}
      <MetricCard
        id="kpi-gross-revenue"
        title="Gross Booked"
        value={formatCurrency(summary.grossRevenue)}
        subtitle={`From ${summary.totalLoads} load${summary.totalLoads === 1 ? '' : 's'}`}
        icon={DollarSign}
        accentColor="purple"
      />

      {/* Net Estimated Profit */}
      <MetricCard
        id="kpi-net-profit"
        title="Net Est. Profit"
        value={formatCurrency(summary.totalEstimatedProfit)}
        subtitle={`Cost: ${formatCurrency(summary.totalEstimatedCost)}`}
        icon={CheckCircle2}
        accentColor={summary.totalEstimatedProfit >= 0 ? 'emerald' : 'amber'}
      />

      {/* Average Rate Per Mile (RPM) */}
      <MetricCard
        id="kpi-avg-rpm"
        title="Average RPM"
        value={formatRPM(summary.averageRpm)}
        subtitle="Gross / Total Miles"
        icon={TrendingUp}
        accentColor="blue"
      />

      {/* Average Profit Margin */}
      <MetricCard
        id="kpi-avg-margin"
        title="Average Margin"
        value={`${summary.averageMargin.toFixed(1)}%`}
        subtitle={`Spread: ${summary.worstMargin.toFixed(0)}% to ${summary.bestMargin.toFixed(0)}%`}
        icon={Percent}
        accentColor={summary.averageMargin >= 15 ? 'emerald' : summary.averageMargin >= 0 ? 'amber' : 'slate'}
      />

      {/* Total Route Miles */}
      <MetricCard
        id="kpi-total-miles"
        title="Total Route Miles"
        value={formatMiles(summary.totalMiles)}
        subtitle={`${formatMiles(summary.totalLoadedMiles)} loaded`}
        icon={Navigation}
        accentColor="purple"
      />

      {/* Deadhead Miles */}
      <MetricCard
        id="kpi-deadhead-miles"
        title="Deadhead"
        value={formatMiles(summary.totalDeadheadMiles)}
        subtitle={`${summary.deadheadPercentage}% of total distance`}
        icon={Compass}
        accentColor={summary.deadheadPercentage > 20 ? 'amber' : 'blue'}
      />
    </div>
  );
};
