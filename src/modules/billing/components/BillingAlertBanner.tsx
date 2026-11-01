import React from 'react';
import { AlertTriangle, Clock, AlertCircle, RefreshCw, ArrowRight } from 'lucide-react';
import { BillingState, SubscriptionUsageSummary } from '../../../types/domain.types.ts';

interface BillingAlertBannerProps {
  usage: SubscriptionUsageSummary | null;
  onOpenPlans?: () => void;
  onNavigateToBilling?: () => void;
  className?: string;
}

export const BillingAlertBanner: React.FC<BillingAlertBannerProps> = ({
  usage,
  onOpenPlans,
  onNavigateToBilling,
  className = '',
}) => {
  if (!usage) return null;

  const { billing_state, is_trial, trial_ends_at, is_trial_expired } = usage;

  // Calculate days remaining if in trial
  let daysRemaining = 0;
  if (is_trial && trial_ends_at) {
    const end = new Date(trial_ends_at).getTime();
    const now = Date.now();
    daysRemaining = Math.max(0, Math.ceil((end - now) / (1000 * 60 * 60 * 24)));
  }

  // 1. Trial Expired
  if (is_trial_expired || billing_state === 'trial_expired') {
    return (
      <div
        id="billing-alert-trial-expired"
        className={`bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-amber-200 ${className}`}
      >
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-amber-500/20 text-amber-400 shrink-0">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-amber-100">Free Trial Expired</h4>
            <p className="text-xs text-amber-300/90 mt-0.5">
              Your 14-day trial has ended. Select a plan to maintain Active Managed Truck capacity and dispatching operations.
            </p>
          </div>
        </div>
        <button
          id="btn-alert-choose-plan"
          onClick={onOpenPlans || onNavigateToBilling}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 transition-colors shrink-0 shadow-sm"
        >
          Select Plan <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  // 2. Trial Expiring Soon (3 days or less)
  if (is_trial && daysRemaining <= 3 && billing_state === 'trialing') {
    return (
      <div
        id="billing-alert-trial-expiring"
        className={`bg-indigo-500/10 border border-indigo-500/30 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-indigo-200 ${className}`}
      >
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-indigo-500/20 text-indigo-400 shrink-0">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-indigo-100">
              {daysRemaining === 0 ? 'Trial Ends Today' : `Trial Ends in ${daysRemaining} Day${daysRemaining === 1 ? '' : 's'}`}
            </h4>
            <p className="text-xs text-indigo-300/90 mt-0.5">
              Upgrade now to unlock up to 50 active trucks and keep continuous fleet dispatching uninterrupted.
            </p>
          </div>
        </div>
        <button
          id="btn-alert-upgrade-trial"
          onClick={onOpenPlans || onNavigateToBilling}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors shrink-0 shadow-sm"
        >
          Upgrade Plan <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  // 3. Past Due (Grace period)
  if (billing_state === 'past_due') {
    return (
      <div
        id="billing-alert-past-due"
        className={`bg-rose-500/10 border border-rose-500/30 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-rose-200 ${className}`}
      >
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-rose-500/20 text-rose-400 shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-rose-100">Payment Past Due (Grace Period)</h4>
            <p className="text-xs text-rose-300/90 mt-0.5">
              Your recurring subscription payment failed. Your account is in a grace period. Please update your payment method to prevent dispatch suspension.
            </p>
          </div>
        </div>
        <button
          id="btn-alert-resolve-payment"
          onClick={onOpenPlans || onNavigateToBilling}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-rose-600 hover:bg-rose-500 text-white transition-colors shrink-0 shadow-sm"
        >
          Update Payment <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  // 4. Suspended
  if (billing_state === 'suspended') {
    return (
      <div
        id="billing-alert-suspended"
        className={`bg-red-500/15 border border-red-500/40 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-red-200 ${className}`}
      >
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-red-500/20 text-red-400 shrink-0">
            <AlertCircle className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-red-100">Operations Suspended</h4>
            <p className="text-xs text-red-300/90 mt-0.5">
              Your account has been suspended due to unresolved billing. Active truck dispatching is currently locked. Settle past due balance to restore full access.
            </p>
          </div>
        </div>
        <button
          id="btn-alert-restore-access"
          onClick={onOpenPlans || onNavigateToBilling}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-red-600 hover:bg-red-500 text-white transition-colors shrink-0 shadow-sm"
        >
          Restore Access <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  // 5. Canceled
  if (billing_state === 'canceled') {
    return (
      <div
        id="billing-alert-canceled"
        className={`bg-slate-800/80 border border-slate-700 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-slate-300 ${className}`}
      >
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-slate-700 text-slate-400 shrink-0">
            <RefreshCw className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-slate-100">Subscription Canceled</h4>
            <p className="text-xs text-slate-400 mt-0.5">
              Your subscription is inactive. Re-subscribe anytime to reactivate managed truck capacity and continue dispatching.
            </p>
          </div>
        </div>
        <button
          id="btn-alert-resubscribe"
          onClick={onOpenPlans || onNavigateToBilling}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors shrink-0 shadow-sm"
        >
          Re-subscribe <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return null;
};
