import React from 'react';
import {
  BarChart3,
  TrendingUp,
  DollarSign,
  Truck,
  Building2,
  Calendar,
} from 'lucide-react';
import { MetricCard } from '../../components/common/MetricCard.tsx';
import { EmptyState } from '../../components/common/EmptyState.tsx';

export const ReportsView: React.FC = () => {
  return (
    <div id="reports-view" className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-xl sm:text-2xl font-bold text-slate-100 tracking-tight">
            Performance Reports & Analytics
          </h1>
          <span className="text-xs px-2.5 py-0.5 rounded-md bg-indigo-950/60 text-indigo-300 border border-indigo-800/40 font-semibold">
            Executive & Operational Metrics
          </span>
        </div>
        <p className="text-xs sm:text-sm text-slate-400 mt-1">
          Review dispatch volume, historical RPM by equipment lane, driver payout reconciliation, and broker turnaround.
        </p>
      </div>

      {/* Summary KPI grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          id="metric-report-volume"
          title="Total Dispatched Volume"
          value="0 Loads"
          subtitle="All-time completed"
          icon={Truck}
          accentColor="purple"
        />
        <MetricCard
          id="metric-report-rpm"
          title="Average Fleet RPM"
          value="$0.00/mi"
          subtitle="Across all lanes"
          icon={TrendingUp}
          accentColor="blue"
        />
        <MetricCard
          id="metric-report-revenue"
          title="Total Gross Revenue"
          value="$0.00"
          subtitle="Paid & Invoiced"
          icon={DollarSign}
          accentColor="emerald"
        />
        <MetricCard
          id="metric-report-brokers"
          title="Active Broker Partners"
          value="0"
          subtitle="Brokers booked this month"
          icon={Building2}
          accentColor="slate"
        />
      </div>

      {/* Reports Sections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-slate-900 border border-slate-800/80 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between pb-4 border-b border-slate-800">
            <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wider">
              RPM & Volume By Equipment Type
            </h2>
            <span className="text-xs text-slate-400 font-mono">Current Month</span>
          </div>

          <div className="pt-4">
            <EmptyState
              id="empty-equip-report"
              icon={BarChart3}
              title="No Equipment Analytics Yet"
              description="As your dispatchers book and complete loads across Dry Van, Reefer, Flatbed, and Step Deck units, lane averages and RPM benchmarks will display here."
            />
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800/80 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between pb-4 border-b border-slate-800">
            <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wider">
              Broker Pay & Factoring Timeliness
            </h2>
            <span className="text-xs text-slate-400 font-mono">30-Day Window</span>
          </div>

          <div className="pt-4">
            <EmptyState
              id="empty-broker-report"
              icon={Calendar}
              title="No Broker Invoicing Data Yet"
              description="Average payment turnaround days (e.g. 30 days net vs quick-pay factoring) will be computed from settled loads."
            />
          </div>
        </div>
      </div>
    </div>
  );
};
