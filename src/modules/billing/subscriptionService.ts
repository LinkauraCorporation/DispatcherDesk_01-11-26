/**
 * DispatcherDesk Subscription & Entitlement Service (Phase 2)
 *
 * NOTE ON SECURITY & ARCHITECTURAL INVARIANTS:
 * This frontend usage service provides preflight calculations and read-only telemetry.
 * Authoritative billing entitlement enforcement MUST ALWAYS execute server-side in PostgreSQL
 * (via public.enforce_truck_billing_entitlement trigger and table row locks).
 * This service must NEVER be treated as a bypass or replacement for database enforcement.
 */

import { supabase, isSupabaseConfigured } from '../../lib/supabase.ts';
import { PlanType, BillingState, SubscriptionUsageSummary, BillingPaymentTransaction } from '../../types/domain.types.ts';

export interface CreateSubscriptionResponse {
  success: boolean;
  subscriptionId: string;
  keyId: string;
  plan: PlanType;
  customerId?: string;
  error?: string;
}

export interface VerifyPaymentPayload {
  paymentId: string;
  subscriptionId: string;
  signature: string;
  orderId?: string;
  organizationId: string;
}

export interface CancelSubscriptionResponse {
  success: boolean;
  status: string;
  error?: string;
}

/**
 * Returns the AMT capacity for a given plan and optional custom capacity.
 * Trial: 3 AMTs
 * Starter: 10 AMTs
 * Growth: 25 AMTs
 * Agency: 50 AMTs
 * Enterprise: custom capacity (minimum 50)
 */
export function getPlanAmtCapacity(plan: string, customAmtCapacity?: number | null): number {
  const normalized = (plan || '').toLowerCase().trim();
  switch (normalized) {
    case 'trial':
      return 3;
    case 'starter':
    case 'starter_fleet':
      return 10;
    case 'growth':
    case 'growth_agency':
      return 25;
    case 'agency':
      return 50;
    case 'enterprise': {
      if (typeof customAmtCapacity === 'number' && customAmtCapacity >= 50) {
        return customAmtCapacity;
      }
      throw new Error(`Enterprise plan requires custom AMT capacity of at least 50 (provided: ${customAmtCapacity})`);
    }
    default:
      throw new Error(`Invalid or unrecognized subscription plan: "${plan}"`);
  }
}

/**
 * Derives the canonical billing period key according to the authoritative contract:
 * - billing_state IN ('trialing', 'trial_expired') => 'trial'
 * - Any other billing_state + valid periodStart AND periodEnd => YYYYMMDD_YYYYMMDD
 * - Otherwise => 'trial'
 */
export function deriveBillingPeriodKey(
  billingState: BillingState,
  periodStart?: string | null,
  periodEnd?: string | null
): string {
  if (billingState === 'trialing' || billingState === 'trial_expired') {
    return 'trial';
  }
  if (periodStart && periodEnd) {
    try {
      const startStr = new Date(periodStart).toISOString().slice(0, 10).replace(/-/g, '');
      const endStr = new Date(periodEnd).toISOString().slice(0, 10).replace(/-/g, '');
      return `${startStr}_${endStr}`;
    } catch {
      return 'trial';
    }
  }
  return 'trial';
}

const getApiBase = (): string => {
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  const proc = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process;
  if (proc?.env?.VITE_API_URL) {
    return proc.env.VITE_API_URL;
  }
  if (typeof window !== 'undefined' && window.location.hostname === 'dispatcherdesk.online') {
    return 'https://dispatcherdesk-api.onrender.com';
  }
  return '';
};

const API_BASE = getApiBase();

class SubscriptionService {
  /**
   * Fetches real-time subscription usage for an organization.
   * Invokes the tenant-safe public.get_organization_subscription_usage RPC,
   * with automatic fallback to direct table querying and simulation if the RPC
   * is pending migration or reloading in the Supabase schema cache.
   */
  async getSubscriptionUsage(organizationId: string): Promise<SubscriptionUsageSummary> {
    if (isSupabaseConfigured) {
      try {
        const { data, error } = await supabase.rpc('get_organization_subscription_usage', {
          p_organization_id: organizationId,
        });

        if (!error && data) {
          return data as unknown as SubscriptionUsageSummary;
        }

        if (error) {
          // PGRST202 or schema cache notice: function not found in remote Supabase schema cache yet
          if (
            error.code === 'PGRST202' ||
            error.message?.includes('schema cache') ||
            error.message?.includes('Could not find the function')
          ) {
            console.warn(
              `[SubscriptionService] RPC get_organization_subscription_usage not found in schema cache (${error.code || 'PGRST202'}). Falling back to resilient direct table query.`
            );
          } else {
            console.warn('[SubscriptionService] Supabase get_organization_subscription_usage notice:', error.message || error);
          }

          return await this.fetchUsageFromTables(organizationId);
        }
      } catch (rpcErr: any) {
        console.warn('[SubscriptionService] RPC execution error, falling back to table query:', rpcErr?.message || rpcErr);
        return await this.fetchUsageFromTables(organizationId);
      }
    }

    // Local / Offline fallback simulation for standalone browser/demo mode
    return this.getOfflineSimulatedUsage(organizationId);
  }

  /**
   * Resilient table-based telemetry calculation: queries subscriptions and truck_activation_history
   * directly when the schema-cached RPC is not available in the remote instance.
   */
  private async fetchUsageFromTables(organizationId: string): Promise<SubscriptionUsageSummary> {
    try {
      const { data: sub, error: subError } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('organization_id', organizationId)
        .maybeSingle();

      if (subError || !sub) {
        return this.getOfflineSimulatedUsage(organizationId);
      }

      const isTrial = sub.billing_state === 'trialing';
      const isTrialExpired = Boolean(
        sub.billing_state === 'trial_expired' ||
        (isTrial && sub.trial_ends_at && new Date() > new Date(sub.trial_ends_at))
      );

      const billingPeriodKey = deriveBillingPeriodKey(
        sub.billing_state as BillingState,
        sub.current_period_start,
        sub.current_period_end
      );

      let amtCapacity = 3;
      try {
        amtCapacity = isTrial ? 3 : getPlanAmtCapacity(sub.plan as PlanType, sub.custom_amt_capacity);
      } catch {
        amtCapacity = 3;
      }

      let amtUsage = 0;
      try {
        const { data: activations, error: actError } = await supabase
          .from('truck_activation_history')
          .select('truck_id')
          .eq('organization_id', organizationId)
          .eq('billing_period_key', billingPeriodKey);

        if (!actError && activations && activations.length > 0) {
          const distinctTrucks = new Set(activations.map((a: any) => a.truck_id));
          amtUsage = distinctTrucks.size;
        }
      } catch {
        // Truck activation history query error is non-fatal
      }

      return {
        organization_id: organizationId,
        plan: (sub.plan as PlanType) || 'starter',
        billing_state: (sub.billing_state as BillingState) || 'trialing',
        billing_period_key: billingPeriodKey,
        current_period_start: sub.current_period_start || sub.trial_starts_at || new Date().toISOString(),
        current_period_end: sub.current_period_end || sub.trial_ends_at || new Date(Date.now() + 14 * 86400000).toISOString(),
        trial_starts_at: sub.trial_starts_at || new Date().toISOString(),
        trial_ends_at: sub.trial_ends_at || new Date(Date.now() + 14 * 86400000).toISOString(),
        is_trial: isTrial,
        is_trial_expired: isTrialExpired,
        amt_usage: amtUsage,
        amt_capacity: amtCapacity,
        remaining_amt_slots: Math.max(0, amtCapacity - amtUsage),
      };
    } catch (tableErr) {
      console.warn('[SubscriptionService] Direct table query error, falling back to simulated usage:', tableErr);
      return this.getOfflineSimulatedUsage(organizationId);
    }
  }

  /**
   * Helper for robust API requests with JSON parsing, credentials, and retry on warmup.
   */
  private async safeRequest<T>(endpoint: string, options: RequestInit, fallbackError: string): Promise<T> {
    const session = (await supabase.auth.getSession()).data.session;
    const token = session?.access_token;

    const maxAttempts = 2;
    let lastError: any = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await fetch(endpoint, {
          ...options,
          credentials: 'include',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            Authorization: token ? `Bearer ${token}` : 'Bearer demo-token',
            ...(options.headers || {}),
          },
        });

        // 502/503/504 means server/container is warming up or temporarily busy
        if (response.status === 502 || response.status === 503 || response.status === 504) {
          if (attempt < maxAttempts) {
            await new Promise((resolve) => setTimeout(resolve, 1500));
            continue;
          }
          throw new Error('Billing service is initializing. Please wait a moment and try again.');
        }

        const contentType = response.headers.get('content-type') || '';
        let data: any = null;

        if (contentType.includes('application/json')) {
          try {
            data = await response.json();
          } catch {
            // JSON parsing failed despite content-type
          }
        }

        if (!response.ok) {
          const errMsg =
            data?.error ||
            (typeof data === 'string' ? data : null) ||
            `Billing service error (HTTP ${response.status})`;
          throw new Error(errMsg);
        }

        if (!data) {
          throw new Error(
            `Unexpected non-JSON response from ${endpoint} (HTTP ${response.status}). The service may be restarting.`
          );
        }

        return data as T;
      } catch (err: any) {
        lastError = err;
        if (
          attempt < maxAttempts &&
          (err?.message?.includes('network') || err?.message?.includes('failed to fetch'))
        ) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          continue;
        }
        break;
      }
    }

    throw lastError || new Error(fallbackError);
  }

  /**
   * Initiates server-side subscription creation via RazorpayAdapter.
   * Returns public subscription ID and key ID for client checkout.
   * Supports optional idempotencyKey to guarantee exactly-once Razorpay subscription creation on retries.
   */
  async createSubscription(
    plan: PlanType,
    organizationId: string,
    idempotencyKey?: string
  ): Promise<CreateSubscriptionResponse> {
    const key =
      idempotencyKey ||
      (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `idemp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`);

    try {
      return await this.safeRequest<CreateSubscriptionResponse>(
        `${API_BASE}/api/billing/create-subscription`,
        {
          method: 'POST',
          headers: {
            'Idempotency-Key': key,
          },
          body: JSON.stringify({ plan, organizationId, idempotencyKey: key }),
        },
        'Failed to create subscription order'
      );
    } catch (err: any) {
      console.error('[SubscriptionService] createSubscription error:', err?.message || err);
      throw err;
    }
  }

  /**
   * Verifies payment signature server-side.
   */
  async verifyPayment(payload: VerifyPaymentPayload): Promise<{ verified: boolean; error?: string }> {
    try {
      return await this.safeRequest<{ verified: boolean; error?: string }>(
        `${API_BASE}/api/billing/verify-payment`,
        {
          method: 'POST',
          body: JSON.stringify(payload),
        },
        'Payment verification failed'
      );
    } catch (err: any) {
      console.error('[SubscriptionService] verifyPayment error:', err?.message || err);
      throw err;
    }
  }

  /**
   * Cancels subscription server-side through RazorpayAdapter and state machine.
   */
  async cancelSubscription(organizationId: string): Promise<CancelSubscriptionResponse> {
    try {
      return await this.safeRequest<CancelSubscriptionResponse>(
        `${API_BASE}/api/billing/cancel-subscription`,
        {
          method: 'POST',
          body: JSON.stringify({ organizationId }),
        },
        'Failed to cancel subscription'
      );
    } catch (err: any) {
      console.error('[SubscriptionService] cancelSubscription error:', err?.message || err);
      throw err;
    }
  }

  /**
   * Retrieves payment transactions for the active organization.
   */
  async getTransactions(organizationId: string): Promise<BillingPaymentTransaction[]> {
    if (isSupabaseConfigured) {
      try {
        const { data, error } = await supabase
          .from('billing_payment_transactions')
          .select('*')
          .eq('organization_id', organizationId)
          .order('created_at', { ascending: false });

        if (!error && data) {
          return data;
        }
      } catch {
        // Fall back to server route
      }
    }

    try {
      const session = (await supabase.auth.getSession()).data.session;
      const token = session?.access_token;
      const res = await fetch(`${API_BASE}/api/billing/transactions?organizationId=${organizationId}`, {
        credentials: 'include',
        headers: {
          'Accept': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (res.ok && res.headers.get('content-type')?.includes('application/json')) {
        const json = await res.json();
        return json.transactions || [];
      }
    } catch {
      // offline fallback
    }

    return [];
  }

  /**
   * Provides consistent fallback telemetry when offline or in demonstration mode.
   */
  private getOfflineSimulatedUsage(organizationId: string): SubscriptionUsageSummary {
    const defaultCapacity = 3;
    const defaultUsage = 0;
    return {
      organization_id: organizationId,
      plan: 'starter' as PlanType,
      billing_state: 'trialing' as BillingState,
      billing_period_key: 'trial',
      current_period_start: new Date().toISOString(),
      current_period_end: new Date(Date.now() + 14 * 86400000).toISOString(),
      trial_starts_at: new Date().toISOString(),
      trial_ends_at: new Date(Date.now() + 14 * 86400000).toISOString(),
      is_trial: true,
      is_trial_expired: false,
      amt_usage: defaultUsage,
      amt_capacity: defaultCapacity,
      remaining_amt_slots: defaultCapacity - defaultUsage,
    };
  }
}

export const subscriptionService = new SubscriptionService();
