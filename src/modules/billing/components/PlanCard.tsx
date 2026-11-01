import React from 'react';
import { Check, Zap, AlertCircle, ArrowUpRight, RefreshCw } from 'lucide-react';
import { BillingPlanDefinition } from '../billingPlans.ts';
import { SubscriptionUsageSummary } from '../../../types/domain.types.ts';

interface PlanCardProps {
  plan: BillingPlanDefinition;
  usage: SubscriptionUsageSummary | null;
  onSelectPlan: (plan: BillingPlanDefinition) => void;
  isProcessing?: boolean;
}

export const PlanCard: React.FC<PlanCardProps> = ({
  plan,
  usage,
  onSelectPlan,
  isProcessing = false,
}) => {
  const currentPlanId = usage?.plan === 'starter_fleet' ? 'starter' : usage?.plan === 'growth_agency' ? 'growth' : usage?.plan;
  const isCurrentPlan = currentPlanId === plan.id;
  const isCanceled = usage?.billing_state === 'canceled';
  const isTrialExpired = usage?.billing_state === 'trial_expired' || usage?.is_trial_expired;
  const isTrial = usage?.is_trial && !isTrialExpired;
  const isActivePaid = usage?.billing_state === 'active';
  const isBlockedState = usage?.billing_state === 'past_due' || usage?.billing_state === 'suspended';

  // Capacity comparisons
  const currentCapacity = usage?.amt_capacity || 0;
  const currentUsage = usage?.amt_usage || 0;
  const isUpgrade = plan.amtCapacity > currentCapacity;
  const isDowngrade = plan.amtCapacity < currentCapacity;
  const wouldExceedCapacity = isDowngrade && currentUsage > plan.amtCapacity;

  // Button label determination
  let buttonLabel = 'Select Plan';
  let buttonDisabled = isProcessing;
  let buttonVariant: 'primary' | 'secondary' | 'current' = 'primary';

  if (isCurrentPlan && isActivePaid) {
    buttonLabel = 'Current Plan';
    buttonDisabled = true;
    buttonVariant = 'current';
  } else if (isCanceled || isTrialExpired) {
    buttonLabel = isCurrentPlan ? 'Re-subscribe' : `Re-subscribe on ${plan.name}`;
    buttonVariant = 'primary';
  } else if (isTrial) {
    buttonLabel = `Subscribe (${plan.name})`;
    buttonVariant = plan.popular ? 'primary' : 'secondary';
  } else if (isActivePaid) {
    // When actively subscribed to another plan, direct subscription creation for upgrade/downgrade
    // is safely disabled to prevent duplicate provider subscriptions or orphaning existing subscriptions.
    buttonLabel = isUpgrade ? 'Upgrade Unavailable' : 'Downgrade Unavailable';
    buttonDisabled = true;
    buttonVariant = 'secondary';
  } else if (isUpgrade) {
    buttonLabel = `Upgrade to ${plan.amtCapacity} AMT`;
    buttonVariant = 'primary';
  } else if (isDowngrade) {
    buttonLabel = `Downgrade to ${plan.amtCapacity} AMT`;
    buttonVariant = 'secondary';
  }

  return (
    <div
      id={`billing-plan-card-${plan.id}`}
      className={`relative flex flex-col justify-between rounded-2xl p-6 transition-all duration-200 ${
        plan.popular
          ? 'bg-slate-900 border-2 border-indigo-500 shadow-xl shadow-indigo-950/40'
          : 'bg-slate-900/80 border border-slate-800 hover:border-slate-700 shadow-lg'
      }`}
    >
      {/* Popular or Category Badge */}
      {plan.badge && (
        <div className="absolute -top-3 left-6">
          <span
            className={`inline-flex items-center gap-1 px-3 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider ${
              plan.popular
                ? 'bg-indigo-600 text-white shadow-md'
                : 'bg-slate-800 text-slate-300 border border-slate-700'
            }`}
          >
            {plan.popular && <Zap className="w-3 h-3 fill-white" />}
            {plan.badge}
          </span>
        </div>
      )}

      <div>
        {/* Header & Pricing */}
        <div className="pt-2">
          <div className="flex items-center justify-between">
            <h4 className="text-lg font-bold text-white">{plan.name}</h4>
            {isCurrentPlan && isActivePaid && (
              <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                Active
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-1 min-h-[32px]">{plan.description}</p>
        </div>

        <div className="my-5 pb-5 border-b border-slate-800">
          <div className="flex items-baseline gap-1">
            <span className="text-3xl font-extrabold text-white">${plan.monthlyPriceUsd}</span>
            <span className="text-xs text-slate-400 font-medium">/ month</span>
          </div>
          <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800 text-slate-200 text-xs font-semibold">
            <span className="text-indigo-400 font-bold">{plan.amtCapacity}</span> Active Managed Trucks capacity
          </div>
        </div>

        {/* Warning if downgrade exceeds current active trucks */}
        {wouldExceedCapacity && (
          <div className="mb-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <span>
              Your fleet currently has <strong>{currentUsage} active trucks</strong>. Downgrading to {plan.amtCapacity} AMT requires deactivating {currentUsage - plan.amtCapacity} truck(s) first.
            </span>
          </div>
        )}

        {/* Feature List */}
        <div className="space-y-2.5 mb-6">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
            Plan Capabilities
          </span>
          {plan.features.map((feature, idx) => (
            <div key={idx} className="flex items-start gap-2.5 text-xs text-slate-300">
              <div className="rounded-full p-0.5 bg-emerald-500/10 text-emerald-400 shrink-0 mt-0.5">
                <Check className="w-3.5 h-3.5" />
              </div>
              <span>{feature}</span>
            </div>
          ))}
        </div>
      </div>

      {/* CTA Button */}
      <div className="pt-4 border-t border-slate-800/80">
        {buttonVariant === 'current' ? (
          <div className="w-full py-2.5 text-center text-xs font-semibold text-slate-400 bg-slate-800/50 rounded-xl border border-slate-800">
            Current Plan
          </div>
        ) : (
          <button
            id={`btn-select-plan-${plan.id}`}
            onClick={() => onSelectPlan(plan)}
            disabled={buttonDisabled || isBlockedState}
            className={`w-full py-2.5 px-4 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
              buttonVariant === 'primary'
                ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/20 active:scale-[0.98]'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 active:scale-[0.98]'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {isProcessing ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : isCanceled || isTrialExpired ? (
              <RefreshCw className="w-4 h-4" />
            ) : isUpgrade ? (
              <ArrowUpRight className="w-4 h-4" />
            ) : null}
            {buttonLabel}
          </button>
        )}
        {isBlockedState && (
          <p className="text-[10px] text-rose-400 text-center mt-1.5">
            Resolve past due balance to change plans
          </p>
        )}
        {isActivePaid && !isCurrentPlan && (
          <p className="text-[10px] text-slate-400 text-center mt-1.5">
            Direct plan change disabled while active. Cancel current plan to switch at renewal.
          </p>
        )}
      </div>
    </div>
  );
};
