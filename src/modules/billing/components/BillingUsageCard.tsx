import React from 'react';
import { Truck, ShieldCheck, AlertTriangle, Clock, Ban, RefreshCw, ChevronRight } from 'lucide-react';
import { SubscriptionUsageSummary, BillingState } from '../../../types/domain.types.ts';
import { getPlanDefinition } from '../billingPlans.ts';

interface BillingUsageCardProps {
  usage: SubscriptionUsageSummary;
  onOpenPlans: () => void;
  onOpenCancelModal: () => void;
  isLoading?: boolean;
}

export const BillingUsageCard: React.FC<BillingUsageCardProps> = ({
  usage,
  onOpenPlans,
  onOpenCancelModal,
  isLoading = false,
}) => {
  const planDef = getPlanDefinition(usage.plan);

  const usagePercent = Math.min(
    100,
    usage.amt_capacity > 0 ? Math.round((usage.amt_usage / usage.amt_capacity) * 100) : 0
  );

  // Status Badge Helper
  const getStatusBadge = (state: BillingState, isTrial: boolean, isTrialExpired: boolean) => {
    if (isTrialExpired || state === 'trial_expired') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">
          <Clock className="w-3.5 h-3.5" /> Trial Expired
        </span>
      );
    }
    if (isTrial && state === 'trialing') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
          <Clock className="w-3.5 h-3.5" /> Free Trial
        </span>
      );
    }
    switch (state) {
      case 'active':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
            <ShieldCheck className="w-3.5 h-3.5" /> Active Paid
          </span>
        );
      case 'past_due':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/15 text-rose-300 border border-rose-500/30">
            <AlertTriangle className="w-3.5 h-3.5" /> Past Due (Grace Period)
          </span>
        );
      case 'suspended':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-500/20 text-red-300 border border-red-500/40">
            <Ban className="w-3.5 h-3.5" /> Suspended
          </span>
        );
      case 'canceled':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-700 text-slate-300 border border-slate-600">
            <RefreshCw className="w-3.5 h-3.5" /> Canceled
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-700 text-slate-300">
            {state}
          </span>
        );
    }
  };

  // Format date helper
  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return 'N/A';
    try {
      return new Date(dateStr).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div
      id="billing-usage-card"
      className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden"
    >
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-6 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-3">
            <h3 className="text-xl font-bold text-white tracking-tight">{planDef.name}</h3>
            {getStatusBadge(usage.billing_state, usage.is_trial, usage.is_trial_expired)}
          </div>
          <p className="text-sm text-slate-400 mt-1 max-w-xl">
            {planDef.description}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {usage.billing_state === 'canceled' || usage.billing_state === 'trial_expired' || usage.is_trial_expired ? (
            <button
              id="btn-usage-resubscribe"
              onClick={onOpenPlans}
              disabled={isLoading}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm bg-indigo-600 hover:bg-indigo-500 text-white transition-all shadow-lg shadow-indigo-600/20 active:scale-[0.98]"
            >
              <RefreshCw className="w-4 h-4" /> Re-subscribe Now
            </button>
          ) : (
            <>
              <button
                id="btn-usage-change-plan"
                onClick={onOpenPlans}
                disabled={isLoading}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl font-semibold text-sm bg-indigo-600 hover:bg-indigo-500 text-white transition-all shadow-md shadow-indigo-600/20"
              >
                {usage.is_trial ? 'Upgrade to Paid Plan' : 'Change Plan / Capacity'}
                <ChevronRight className="w-4 h-4" />
              </button>

              {usage.billing_state === 'active' && (
                <button
                  id="btn-usage-cancel-sub"
                  onClick={onOpenCancelModal}
                  disabled={isLoading}
                  className="px-3.5 py-2 rounded-xl font-medium text-xs text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 transition-colors"
                >
                  Cancel Subscription
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* AMT Usage Gauge & Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-6">
        {/* Metric 1: Capacity Meter */}
        <div className="md:col-span-2 bg-slate-800/50 rounded-xl p-5 border border-slate-800/80">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Truck className="w-4 h-4 text-indigo-400" />
              <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Active Managed Truck (AMT) Capacity
              </span>
            </div>
            <span className="text-sm font-bold text-white">
              {usage.amt_usage} / {usage.amt_capacity} Trucks ({usagePercent}%)
            </span>
          </div>

          {/* Progress Bar */}
          <div className="w-full h-3 bg-slate-950 rounded-full overflow-hidden p-0.5 border border-slate-700/50">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                usagePercent >= 100
                  ? 'bg-rose-500'
                  : usagePercent >= 80
                  ? 'bg-amber-500'
                  : 'bg-indigo-500'
              }`}
              style={{ width: `${usagePercent}%` }}
            />
          </div>

          <div className="flex items-center justify-between mt-3 text-xs text-slate-400">
            <span>
              {usage.remaining_amt_slots > 0
                ? `${usage.remaining_amt_slots} available truck slot${usage.remaining_amt_slots === 1 ? '' : 's'} remaining`
                : 'Plan capacity limit reached'}
            </span>
            <span className="text-slate-500">
              Only active dispatch trucks count against capacity
            </span>
          </div>
        </div>

        {/* Metric 2: Period / Renewal Information */}
        <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-800/80 flex flex-col justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider block mb-2">
              {usage.is_trial ? 'Trial Status' : 'Billing Cycle'}
            </span>
            {usage.is_trial ? (
              <div>
                <p className="text-sm font-semibold text-white">
                  {usage.is_trial_expired ? 'Expired' : '14-Day Free Evaluation'}
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  Expires: <span className="text-slate-200">{formatDate(usage.trial_ends_at)}</span>
                </p>
              </div>
            ) : (
              <div>
                <p className="text-sm font-semibold text-white">
                  ${planDef.monthlyPriceUsd}/month
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  Current Period: <span className="text-slate-200">{formatDate(usage.current_period_start)} – {formatDate(usage.current_period_end)}</span>
                </p>
              </div>
            )}
          </div>

          <div className="pt-3 mt-3 border-t border-slate-700/50 text-[11px] text-slate-400 flex items-center justify-between">
            <span>Billing Period Key:</span>
            <code className="px-1.5 py-0.5 rounded bg-slate-900 text-indigo-300 font-mono text-[10px]">
              {usage.billing_period_key || 'trial'}
            </code>
          </div>
        </div>
      </div>
    </div>
  );
};
