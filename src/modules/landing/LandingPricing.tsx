import React from 'react';
import {
  Check,
  Truck,
  Users,
  Layers,
  ArrowRight,
  Info,
} from 'lucide-react';
import { BILLING_PLANS } from '../billing/billingPlans.ts';

interface LandingPricingProps {
  onGetStartedClick: () => void;
  onViewPricingClick: () => void;
}

export const LandingPricing: React.FC<LandingPricingProps> = ({
  onGetStartedClick,
  onViewPricingClick,
}) => {
  return (
    <section
      id="pricing"
      className="py-12 sm:py-16 md:py-20 bg-slate-950 border-t border-slate-800/80 relative"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto text-center mb-10 sm:mb-14 md:mb-16">
          <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-indigo-400 bg-indigo-950/60 border border-indigo-700/50 px-3 py-1 rounded-full inline-block mb-3">
            Simple, Predictable Pricing
          </span>

          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-slate-100 tracking-tight leading-tight mb-3 sm:mb-4">
            Pricing That Scales With Your Dispatch Operation
          </h2>

          <p className="text-sm sm:text-base text-slate-300 leading-relaxed max-w-2xl mx-auto">
            Choose the plan that fits your operation. Add team members without
            per-seat licensing and manage more freight without per-load
            platform fees.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 sm:gap-6 max-w-4xl mx-auto mb-10 sm:mb-14">
          <div className="p-4 sm:p-5 rounded-xl bg-slate-900/60 border border-slate-800 flex items-start gap-3.5">
            <div className="w-9 h-9 rounded-lg bg-indigo-950 border border-indigo-700/50 text-indigo-400 flex items-center justify-center shrink-0">
              <Truck className="w-5 h-5" />
            </div>

            <div>
              <h4 className="text-xs sm:text-sm font-bold text-slate-100 mb-1">
                Active Managed Trucks
              </h4>

              <p className="text-[11px] sm:text-xs text-slate-400 leading-relaxed">
                Pricing scales with the number of active managed trucks in your
                operation. Pay only for the fleet capacity you actively
                dispatch.
              </p>
            </div>
          </div>

          <div className="p-4 sm:p-5 rounded-xl bg-slate-900/60 border border-slate-800 flex items-start gap-3.5">
            <div className="w-9 h-9 rounded-lg bg-indigo-950 border border-indigo-700/50 text-indigo-400 flex items-center justify-center shrink-0">
              <Users className="w-5 h-5" />
            </div>

            <div>
              <h4 className="text-xs sm:text-sm font-bold text-slate-100 mb-1">
                No Per-Seat Licensing
              </h4>

              <p className="text-[11px] sm:text-xs text-slate-400 leading-relaxed">
                Add team members without per-seat licensing. Include your
                entire dispatch and operations staff without per-user fees.
              </p>
            </div>
          </div>

          <div className="p-4 sm:p-5 rounded-xl bg-slate-900/60 border border-slate-800 flex items-start gap-3.5">
            <div className="w-9 h-9 rounded-lg bg-indigo-950 border border-indigo-700/50 text-indigo-400 flex items-center justify-center shrink-0">
              <Layers className="w-5 h-5" />
            </div>

            <div>
              <h4 className="text-xs sm:text-sm font-bold text-slate-100 mb-1">
                No Per-Load Platform Fees
              </h4>

              <p className="text-[11px] sm:text-xs text-slate-400 leading-relaxed">
                Book additional freight without per-load platform fees. Move
                high-volume freight without per-shipment transaction charges.
              </p>
            </div>
          </div>
        </div>

        {/* Canonical Paid Subscription Plans from BILLING_PLANS */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 sm:gap-6 max-w-md lg:max-w-6xl mx-auto mb-8 sm:mb-10">
          {BILLING_PLANS.map((plan) => (
            <div
              key={plan.id}
              id={`landing-pricing-card-${plan.id}`}
              className={`p-5 sm:p-7 rounded-2xl flex flex-col justify-between transition-all ${
                plan.popular
                  ? 'bg-slate-900/90 border-2 border-indigo-500/70 shadow-xl shadow-indigo-600/10 relative'
                  : 'bg-slate-900/40 border border-slate-800/80 hover:border-slate-700'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-indigo-400">
                    {plan.badge || plan.name}
                  </span>

                  {plan.popular && (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-indigo-600 text-white">
                      Recommended
                    </span>
                  )}
                </div>

                <h3 className="text-lg sm:text-xl font-bold text-slate-100 mb-1.5 sm:mb-2">
                  {plan.name}
                </h3>

                <p className="text-xs text-slate-400 mb-4 sm:mb-5 min-h-[32px] sm:min-h-[36px]">
                  {plan.description}
                </p>

                <div className="mb-5 sm:mb-6">
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl sm:text-4xl font-extrabold text-slate-100 tracking-tight">
                      ${plan.monthlyPriceUsd}
                    </span>

                    <span className="text-xs sm:text-sm text-slate-400">
                      /month
                    </span>
                  </div>

                  <p className="text-[10px] sm:text-[11px] text-slate-500 mt-1">
                    Up to {plan.amtCapacity} active managed trucks
                  </p>
                </div>

                <div className="py-2.5 sm:py-3 px-3 sm:px-3.5 rounded-xl bg-slate-950/80 border border-slate-800/80 mb-5 sm:mb-6">
                  <span className="text-[10px] sm:text-[11px] font-semibold text-slate-300 block mb-0.5">
                    Capacity Model
                  </span>

                  <span className="text-xs text-indigo-300 font-medium">
                    Scaled to active managed truck count
                  </span>
                </div>

                <div className="space-y-2 sm:space-y-2.5 mb-6 sm:mb-8">
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">
                    What&apos;s Included
                  </span>

                  {plan.features.map((feat, fIdx) => (
                    <div
                      key={fIdx}
                      className="flex items-start gap-2.5 text-xs text-slate-300"
                    >
                      <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      <span>{feat}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <button
                  type="button"
                  id={`btn-landing-select-plan-${plan.id}`}
                  onClick={onGetStartedClick}
                  className={`w-full py-3 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer min-h-[44px] ${
                    plan.popular
                      ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/25'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                  }`}
                >
                  <span>Start Free Trial</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Enterprise & Custom Capacity Callout */}
        <div className="max-w-4xl mx-auto mb-6 p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-slate-900/90 via-slate-900/70 to-slate-900/90 border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-center sm:text-left">
            <div className="flex items-center justify-center sm:justify-start gap-2 mb-1">
              <span className="text-xs font-bold uppercase tracking-wider text-indigo-400">
                Enterprise Fleets (50+ AMT)
              </span>
            </div>
            <p className="text-xs text-slate-300">
              Need custom truck capacity beyond 50 AMT, dedicated account management, or custom integrations?
            </p>
          </div>
          <button
            type="button"
            id="btn-landing-enterprise-contact"
            onClick={onViewPricingClick}
            className="whitespace-nowrap px-4 py-2.5 rounded-xl text-xs font-bold text-slate-200 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-all flex items-center gap-1.5 cursor-pointer min-h-[40px]"
          >
            <span>Contact Enterprise Operations</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Pricing Disclaimer */}
        <div className="max-w-2xl mx-auto text-left sm:text-center flex items-start sm:items-center justify-center gap-2 text-[11px] sm:text-xs text-slate-400 bg-slate-900/40 p-3 sm:p-3.5 rounded-xl border border-slate-800">
          <Info className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5 sm:mt-0" />

          <span>
            Plans are scaled by Active Managed Truck (AMT) capacity: Starter Fleet supports up to 10 active managed trucks, Growth Agency supports up to 25, and Agency Fleet supports up to 50. Organizations requiring custom capacity beyond 50 trucks can contact our enterprise operations team.
          </span>
        </div>
      </div>
    </section>
  );
};