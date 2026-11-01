import React, { useState, useEffect, useCallback } from 'react';
import { CreditCard, RefreshCw, Shield, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext.tsx';
import { subscriptionService } from './subscriptionService.ts';
import { BILLING_PLANS, BillingPlanDefinition } from './billingPlans.ts';
import { BillingUsageCard } from './components/BillingUsageCard.tsx';
import { PlanCard } from './components/PlanCard.tsx';
import { PaymentHistoryTable } from './components/PaymentHistoryTable.tsx';
import { CancelSubscriptionModal } from './components/CancelSubscriptionModal.tsx';
import { BillingAlertBanner } from './components/BillingAlertBanner.tsx';
import {
  initiateRazorpayCheckout,
  getOrCreateCheckoutIdempotencyKey,
  clearCheckoutIdempotencyKey,
  clearAllCheckoutIdempotencyKeysForOrg,
  isDefinitiveCheckoutFailure,
} from './razorpayCheckout.ts';
import { SubscriptionUsageSummary, BillingPaymentTransaction } from '../../types/domain.types.ts';

export const BillingView: React.FC = () => {
  const { activeOrganization, user, userRole } = useAuth();
  const organizationId = activeOrganization?.id || 'demo-org-1';

  const [usage, setUsage] = useState<SubscriptionUsageSummary | null>(null);
  const [transactions, setTransactions] = useState<BillingPaymentTransaction[]>([]);
  const [isLoadingUsage, setIsLoadingUsage] = useState<boolean>(true);
  const [isLoadingTransactions, setIsLoadingTransactions] = useState<boolean>(true);
  const [processingPlanId, setProcessingPlanId] = useState<string | null>(null);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const plansRef = React.useRef<HTMLDivElement>(null);

  const fetchBillingData = useCallback(async () => {
    if (!organizationId) {
      setIsLoadingUsage(false);
      setIsLoadingTransactions(false);
      return;
    }

    // 1. Fetch Subscription Usage (entitlement telemetry)
    try {
      setIsLoadingUsage(true);
      const usageData = await subscriptionService.getSubscriptionUsage(organizationId);
      setUsage(usageData);
    } catch (err: any) {
      console.error('[BillingView] Failed to fetch subscription usage:', err);
    } finally {
      setIsLoadingUsage(false);
    }

    // 2. Fetch Payment Transactions
    try {
      setIsLoadingTransactions(true);
      const txData = await subscriptionService.getTransactions(organizationId);
      setTransactions(txData);
    } catch (err: any) {
      console.error('[BillingView] Failed to fetch transactions:', err);
    } finally {
      setIsLoadingTransactions(false);
    }
  }, [organizationId]);

  useEffect(() => {
    fetchBillingData();
  }, [fetchBillingData]);

  const scrollToPlans = () => {
    plansRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSelectPlan = async (plan: BillingPlanDefinition) => {
    if (!organizationId) {
      setFeedback({ type: 'error', message: 'No active organization selected.' });
      return;
    }

    // Prevent duplicate triggers if checkout is already actively processing
    if (processingPlanId) {
      return;
    }

    setProcessingPlanId(plan.id);
    setFeedback(null);

    // Retrieve or generate ONE stable idempotency key scoped to (organizationId, plan.id).
    // Preserved across double-clicks, re-renders, 409 conflicts, and 504 timeouts.
    const idempotencyKey = getOrCreateCheckoutIdempotencyKey(organizationId, plan.id);

    await initiateRazorpayCheckout({
      plan: plan.id,
      organizationId,
      userEmail: user?.email || undefined,
      idempotencyKey,
      onSuccess: async (res) => {
        // Clear stable key only upon definitive verified checkout success
        clearCheckoutIdempotencyKey(organizationId, plan.id);
        setProcessingPlanId(null);
        setFeedback({
          type: 'success',
          message: `Subscription to ${plan.name} completed successfully (Payment Ref: ${res.paymentId}).`,
        });
        await fetchBillingData();
      },
      onError: (errorMsg) => {
        setProcessingPlanId(null);
        // Only clear key if definitively rejected (e.g. 400 active sub exists, unauthorized).
        // For 409 conflict, 504 timeout, or network drops, RETAIN the key so user retries
        // allow the backend to reconcile and return the existing subscription!
        if (isDefinitiveCheckoutFailure(errorMsg)) {
          clearCheckoutIdempotencyKey(organizationId, plan.id);
        }
        setFeedback({ type: 'error', message: errorMsg });
      },
      onDismiss: () => {
        setProcessingPlanId(null);
        // Modal dismissed without payment; checkout attempt remains unresolved and retryable
        // with the same idempotency key to prevent duplicate Razorpay order creation.
      },
    });
  };

  const handleConfirmCancel = async () => {
    if (!organizationId) throw new Error('No active organization');

    const res = await subscriptionService.cancelSubscription(organizationId);
    if (res.success) {
      clearAllCheckoutIdempotencyKeysForOrg(organizationId);
      setFeedback({
        type: 'success',
        message: 'Your subscription has been canceled. Operational records remain accessible.',
      });
      await fetchBillingData();
    } else {
      throw new Error(res.error || 'Cancellation could not be completed.');
    }
  };

  return (
    <div id="billing-view" className="space-y-8 pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center gap-2.5">
              <CreditCard className="w-6 h-6 text-indigo-400" /> Billing & Plans
            </h1>
            <span className="text-xs px-2.5 py-0.5 rounded-md bg-indigo-950/60 text-indigo-300 border border-indigo-800/40 font-semibold">
              Tenant: {activeOrganization?.name || 'Active Desk'}
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Authoritative fleet capacity limits, subscription management, and payment reconciliation.
          </p>
        </div>

        <button
          id="btn-refresh-billing-view"
          onClick={fetchBillingData}
          disabled={isLoadingUsage || isLoadingTransactions}
          className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoadingUsage ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Dismissible Feedback Notification */}
      {feedback && (
        <div
          id="billing-feedback-notification"
          className={`p-4 rounded-xl flex items-center justify-between gap-3 text-xs font-semibold border ${
            feedback.type === 'success'
              ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
              : 'bg-rose-500/10 text-rose-300 border-rose-500/30'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button
            onClick={() => setFeedback(null)}
            className="text-slate-400 hover:text-white text-xs underline cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Critical Status Alert Banner */}
      {usage && (
        <BillingAlertBanner
          usage={usage}
          onOpenPlans={scrollToPlans}
          onNavigateToBilling={scrollToPlans}
        />
      )}

      {/* Subscription & AMT Usage Overview Card */}
      {usage ? (
        <BillingUsageCard
          usage={usage}
          onOpenPlans={scrollToPlans}
          onOpenCancelModal={() => setIsCancelModalOpen(true)}
          isLoading={isLoadingUsage}
        />
      ) : isLoadingUsage ? (
        <div className="p-8 rounded-2xl bg-slate-900 border border-slate-800 animate-pulse text-center text-xs text-slate-500">
          Loading organization subscription telemetry...
        </div>
      ) : (
        <div className="p-8 rounded-2xl bg-slate-900 border border-slate-800 text-center text-xs text-slate-400">
          No subscription found for this organization.
        </div>
      )}

      {/* Subscription Plans & Capacity Section */}
      <div ref={plansRef} className="space-y-4 pt-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight">Available Subscription Plans</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Choose the Active Managed Truck capacity that fits your fleet operations. Upgrade or downgrade anytime.
            </p>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-slate-400">
            <Shield className="w-3.5 h-3.5 text-indigo-400" />
            <span>Secure Razorpay Checkout • Verified Signatures</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {BILLING_PLANS.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              usage={usage}
              onSelectPlan={handleSelectPlan}
              isProcessing={processingPlanId === plan.id}
            />
          ))}
        </div>
      </div>

      {/* Payment & Transaction History */}
      <div className="pt-4">
        <PaymentHistoryTable
          transactions={transactions}
          isLoading={isLoadingTransactions}
          onRefresh={fetchBillingData}
        />
      </div>

      {/* Cancellation Confirmation Modal */}
      {usage && (
        <CancelSubscriptionModal
          isOpen={isCancelModalOpen}
          onClose={() => setIsCancelModalOpen(false)}
          onConfirmCancel={handleConfirmCancel}
          currentPlanName={usage.plan ? usage.plan.toUpperCase() : 'Current'}
          amtUsage={usage.amt_usage}
        />
      )}
    </div>
  );
};
