/**
 * DispatcherDesk Razorpay Adapter
 * File: src/server/billing/providers/RazorpayAdapter.ts
 *
 * Encapsulates all Razorpay-specific REST APIs, cryptographic verification,
 * and webhook event normalization. Never leaks credentials to browser.
 */

import crypto from 'node:crypto';
import {
  PaymentProviderAdapter,
  PaymentVerificationRequest,
  PaymentVerificationResult,
  WebhookVerificationRequest,
  NormalizedBillingEvent,
  NormalizedBillingEventType,
  ProviderCustomerRef,
  ProviderSubscriptionRef,
  ProviderPaymentRef,
} from './types.ts';
import { BillingState, PlanType } from '../../../types/domain.types.ts';

export interface RazorpayAdapterConfig {
  keyId?: string;
  keySecret?: string;
  webhookSecret?: string;
  baseUrl?: string;
}

export interface ReconcileSubscriptionParams {
  organizationId: string;
  idempotencyKey: string;
  customerId?: string;
  maxPages?: number;
  pageSize?: number;
}

export type ReconcileSubscriptionResult =
  | { status: 'found'; subscription: ProviderSubscriptionRef }
  | { status: 'not_found'; pagesExamined?: number; recordsExamined?: number }
  | { status: 'ambiguous'; matches: ProviderSubscriptionRef[]; message?: string }
  | { status: 'search_incomplete'; pagesExamined: number; recordsExamined: number; message?: string }
  | { status: 'provider_unavailable'; error: string };

export interface MockSubscriptionRecord extends ProviderSubscriptionRef {
  organizationId?: string;
  idempotencyKey?: string;
  created_at?: number;
}

export class RazorpayAdapter implements PaymentProviderAdapter {
  readonly providerName = 'razorpay' as const;
  private readonly keyId: string;
  private readonly keySecret: string;
  private readonly webhookSecret: string;
  private readonly baseUrl: string;

  private static mockSubscriptions = new Map<string, MockSubscriptionRecord>();
  private static mockSubscriptionsList: MockSubscriptionRecord[] = [];
  private static simulateOutage: boolean = false;
  private static simulateOutageOnPage: number | null = null;

  static setSimulateOutageForTesting(simulate: boolean): void {
    RazorpayAdapter.simulateOutage = simulate;
  }

  static setSimulateOutageOnPageForTesting(page: number | null): void {
    RazorpayAdapter.simulateOutageOnPage = page;
  }

  static clearMockSubscriptionsForTesting(): void {
    RazorpayAdapter.mockSubscriptions.clear();
    RazorpayAdapter.mockSubscriptionsList = [];
    RazorpayAdapter.simulateOutage = false;
    RazorpayAdapter.simulateOutageOnPage = null;
  }

  static addMockSubscriptionForTesting(sub: MockSubscriptionRecord): void {
    RazorpayAdapter.mockSubscriptionsList.push(sub);
    if (sub.organizationId && sub.idempotencyKey) {
      RazorpayAdapter.mockSubscriptions.set(`${sub.organizationId}::${sub.idempotencyKey}`, sub);
    }
  }

  static setMockSubscriptionsForTesting(subs: MockSubscriptionRecord[]): void {
    RazorpayAdapter.mockSubscriptionsList = [...subs];
    RazorpayAdapter.mockSubscriptions.clear();
    for (const sub of subs) {
      if (sub.organizationId && sub.idempotencyKey) {
        RazorpayAdapter.mockSubscriptions.set(`${sub.organizationId}::${sub.idempotencyKey}`, sub);
      }
    }
  }

  constructor(config?: RazorpayAdapterConfig) {
    this.keyId = config?.keyId || process.env.RAZORPAY_KEY_ID || 'rzp_test_placeholder';
    this.keySecret = config?.keySecret || process.env.RAZORPAY_KEY_SECRET || '';
    this.webhookSecret = config?.webhookSecret || process.env.RAZORPAY_WEBHOOK_SECRET || '';
    this.baseUrl = config?.baseUrl || 'https://api.razorpay.com/v1';
  }

  /**
   * Returns public Key ID for client checkout invocation (never returns secret).
   */
  getKeyId(): string {
    return this.keyId;
  }

  /**
   * Verifies incoming webhook HMAC-SHA256 signature using constant-time comparison.
   */
  verifyWebhookSignature(request: WebhookVerificationRequest): boolean {
    const secret = request.secret || this.webhookSecret;
    if (!secret || !request.signature) {
      return false;
    }

    try {
      const rawPayload = Buffer.isBuffer(request.rawBody)
        ? request.rawBody
        : Buffer.from(request.rawBody, 'utf8');

      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(rawPayload)
        .digest('hex');

      const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
      const signatureBuffer = Buffer.from(request.signature, 'utf8');

      if (expectedBuffer.length !== signatureBuffer.length) {
        return false;
      }

      return crypto.timingSafeEqual(expectedBuffer, signatureBuffer);
    } catch {
      return false;
    }
  }

  /**
   * Verifies client-returned payment authorization signature after modal completion.
   * For subscriptions: HMAC(razorpay_payment_id + '|' + razorpay_subscription_id, secret)
   * For one-time orders: HMAC(razorpay_order_id + '|' + razorpay_payment_id, secret)
   */
  verifyPaymentSignature(request: PaymentVerificationRequest): PaymentVerificationResult {
    const { paymentId, subscriptionId, orderId, signature } = request;

    if (!paymentId || !signature) {
      return {
        isValid: false,
        paymentId,
        subscriptionId,
        orderId,
        error: 'Missing required payment verification identifiers.',
      };
    }

    if (!this.keySecret) {
      return {
        isValid: false,
        paymentId,
        subscriptionId,
        orderId,
        error: 'Server Razorpay key secret is not configured.',
      };
    }

    try {
      let expectedData = '';
      if (subscriptionId) {
        expectedData = `${paymentId}|${subscriptionId}`;
      } else if (orderId) {
        expectedData = `${orderId}|${paymentId}`;
      } else {
        return {
          isValid: false,
          paymentId,
          subscriptionId,
          orderId,
          error: 'Either subscriptionId or orderId must be provided for payment signature verification.',
        };
      }

      const expectedSignature = crypto
        .createHmac('sha256', this.keySecret)
        .update(expectedData)
        .digest('hex');

      const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
      const signatureBuffer = Buffer.from(signature, 'utf8');

      const isValid =
        expectedBuffer.length === signatureBuffer.length &&
        crypto.timingSafeEqual(expectedBuffer, signatureBuffer);

      return {
        isValid,
        paymentId,
        subscriptionId,
        orderId,
        error: isValid ? undefined : 'Payment signature mismatch.',
      };
    } catch (err: any) {
      return {
        isValid: false,
        paymentId,
        subscriptionId,
        orderId,
        error: err?.message || 'Payment signature verification encountered an internal error.',
      };
    }
  }

  /**
   * Normalizes Razorpay webhook payload into a provider-neutral event.
   * Maps Razorpay states to authoritative DispatcherDesk BillingState.
   */
  normalizeWebhookEvent(payload: Record<string, any>, headerEventId?: string): NormalizedBillingEvent {
    if (!payload || typeof payload !== 'object') {
      throw new Error('Invalid webhook payload: expected an object.');
    }

    const rawEventType = String(payload.event || '');
    const createdAtSeconds = typeof payload.created_at === 'number' ? payload.created_at : Math.floor(Date.now() / 1000);
    const providerTimestamp = new Date(createdAtSeconds * 1000);

    const subEntity = payload.payload?.subscription?.entity || {};
    const paymentEntity = payload.payload?.payment?.entity || {};

    const providerSubscriptionId = subEntity.id || paymentEntity.subscription_id || undefined;
    const providerCustomerId = subEntity.customer_id || paymentEntity.customer_id || undefined;
    const providerPaymentId = paymentEntity.id || undefined;
    const providerInvoiceId = paymentEntity.invoice_id || undefined;
    const providerOrderId = paymentEntity.order_id || undefined;

    const amountCents = typeof paymentEntity.amount === 'number' ? paymentEntity.amount : undefined;
    const currency = typeof paymentEntity.currency === 'string' ? paymentEntity.currency : 'USD';

    // Current period start and end from Razorpay subscription entity
    const currentStartSec = subEntity.current_start;
    const currentEndSec = subEntity.current_end;
    const periodStart = typeof currentStartSec === 'number' ? new Date(currentStartSec * 1000) : undefined;
    const periodEnd = typeof currentEndSec === 'number' ? new Date(currentEndSec * 1000) : undefined;

    // Organization ID correlation hint from metadata notes
    const organizationIdHint = subEntity.notes?.organization_id || paymentEntity.notes?.organization_id || undefined;

    // Deterministic Event ID derivation
    const eventId =
      headerEventId ||
      payload.id ||
      payload.event_id ||
      `evt_${crypto
        .createHash('sha256')
        .update(`${rawEventType}_${providerSubscriptionId || ''}_${providerPaymentId || ''}_${createdAtSeconds}`)
        .digest('hex')
        .slice(0, 24)}`;

    let eventType: NormalizedBillingEventType = 'unknown';
    let targetState: BillingState | undefined = undefined;

    switch (rawEventType) {
      case 'subscription.authenticated':
        eventType = 'subscription.authenticated';
        targetState = 'subscription_pending';
        break;

      case 'subscription.activated':
        eventType = 'subscription.activated';
        targetState = 'active';
        break;

      case 'subscription.charged':
        eventType = 'subscription.charged';
        targetState = 'active';
        break;

      case 'subscription.pending':
        eventType = 'subscription.pending';
        targetState = 'past_due';
        break;

      case 'subscription.halted':
        eventType = 'subscription.halted';
        targetState = 'suspended';
        break;

      case 'subscription.paused':
        eventType = 'subscription.paused';
        targetState = 'suspended';
        break;

      case 'subscription.resumed':
        eventType = 'subscription.resumed';
        targetState = 'active';
        break;

      case 'subscription.cancelled':
        eventType = 'subscription.cancelled';
        targetState = 'canceled';
        break;

      case 'payment.failed':
        eventType = 'payment.failed';
        targetState = 'past_due';
        break;

      default:
        eventType = 'unknown';
        break;
    }

    return {
      provider: 'razorpay',
      eventId,
      eventType,
      rawEventType,
      providerTimestamp,
      providerSubscriptionId,
      providerCustomerId,
      providerPaymentId,
      providerInvoiceId,
      providerOrderId,
      amountCents,
      currency,
      periodStart,
      periodEnd,
      targetState,
      organizationIdHint,
      rawPayload: payload,
    };
  }

  /**
   * Helper for server-to-server authenticated REST API calls
   */
  private async fetchRazorpay(endpoint: string, options: RequestInit = {}): Promise<any> {
    if (!this.keyId || !this.keySecret) {
      throw new Error('Razorpay API credentials missing (keyId or keySecret).');
    }

    const authHeader = `Basic ${Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64')}`;
    const url = `${this.baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

    const headers: Record<string, string> = {
      Authorization: authHeader,
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    const response = await fetch(url, {
      ...options,
      headers,
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const errorMsg = data?.error?.description || data?.error?.message || `Razorpay API error: ${response.statusText}`;
      throw new Error(errorMsg);
    }

    return data;
  }

  /**
   * Helper to determine whether real remote Razorpay REST APIs can be called.
   */
  private isLiveConfigured(): boolean {
    if (!this.keyId || !this.keySecret) return false;
    if (this.keyId.includes('placeholder') || this.keySecret.includes('placeholder')) return false;
    if (this.keyId.startsWith('rzp_test_suite') || this.keySecret.startsWith('test_secret')) return false;
    if (this.keySecret === 'your_razorpay_key_secret') return false;
    return true;
  }

  async createCustomer(params: { organizationId: string; name: string; email: string }): Promise<ProviderCustomerRef> {
    if (!this.isLiveConfigured()) {
      return {
        id: `cust_mock_${params.organizationId.replace(/-/g, '').substring(0, 10)}`,
        name: params.name,
        email: params.email,
      };
    }

    try {
      const data = await this.fetchRazorpay('/customers', {
        method: 'POST',
        body: JSON.stringify({
          name: params.name,
          email: params.email,
          notes: {
            organization_id: params.organizationId,
          },
        }),
      });

      return {
        id: data.id,
        name: data.name,
        email: data.email,
      };
    } catch (err: any) {
      if (err?.message?.includes('already exists') || err?.message?.includes('Customer already exists')) {
        const existingList = await this.fetchRazorpay('/customers?count=100');
        const found = existingList?.items?.find((c: any) => c.email?.toLowerCase() === params.email?.toLowerCase());
        if (found) {
          return {
            id: found.id,
            name: found.name || params.name,
            email: found.email || params.email,
          };
        }
      }
      throw err;
    }
  }

  async createSubscription(params: {
    customerId: string;
    plan: PlanType;
    organizationId: string;
    idempotencyKey?: string;
  }): Promise<ProviderSubscriptionRef> {
    if (!this.isLiveConfigured()) {
      const mockSub: MockSubscriptionRecord = {
        id: `sub_mock_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        customerId: params.customerId,
        planId: `plan_${params.plan}`,
        status: 'created',
        organizationId: params.organizationId,
        idempotencyKey: params.idempotencyKey,
        created_at: Math.floor(Date.now() / 1000),
      };
      RazorpayAdapter.addMockSubscriptionForTesting(mockSub);
      return {
        id: mockSub.id,
        customerId: mockSub.customerId,
        planId: mockSub.planId,
        status: mockSub.status,
      };
    }

    const planId = process.env[`RAZORPAY_PLAN_${params.plan.toUpperCase()}`] || `plan_${params.plan}`;
    const data = await this.fetchRazorpay('/subscriptions', {
      method: 'POST',
      body: JSON.stringify({
        plan_id: planId,
        customer_id: params.customerId,
        total_count: 120, // 10 years monthly recurrence
        quantity: 1,
        customer_notify: 1,
        notes: {
          organization_id: params.organizationId,
          ...(params.idempotencyKey ? { idempotency_key: params.idempotencyKey } : {}),
        },
      }),
    });

    return {
      id: data.id,
      customerId: data.customer_id,
      planId: data.plan_id,
      status: data.status,
    };
  }

  /**
   * Fetches a single page of subscriptions using Razorpay skip & count query semantics.
   * In testing/mock mode, simulates paging through mock subscriptions collection.
   */
  private async fetchSubscriptionsPage(
    count: number,
    skip: number,
    signal?: AbortSignal,
    pageNumber: number = 1
  ): Promise<{ items: any[]; count: number }> {
    if (!this.isLiveConfigured()) {
      if (RazorpayAdapter.simulateOutage) {
        throw new Error('Razorpay simulated upstream network timeout / 5xx outage');
      }
      if (RazorpayAdapter.simulateOutageOnPage === pageNumber) {
        throw new Error(`Razorpay simulated upstream outage on page ${pageNumber}`);
      }

      const pageSlice = RazorpayAdapter.mockSubscriptionsList.slice(skip, skip + count);
      return {
        items: pageSlice.map((sub) => ({
          id: sub.id,
          customer_id: sub.customerId,
          plan_id: sub.planId,
          status: sub.status,
          current_start: sub.currentPeriodStart ? Math.floor(sub.currentPeriodStart.getTime() / 1000) : undefined,
          current_end: sub.currentPeriodEnd ? Math.floor(sub.currentPeriodEnd.getTime() / 1000) : undefined,
          notes: {
            ...(sub.organizationId ? { organization_id: sub.organizationId } : {}),
            ...(sub.idempotencyKey ? { idempotency_key: sub.idempotencyKey } : {}),
          },
          created_at: sub.created_at || Math.floor(Date.now() / 1000),
        })),
        count: pageSlice.length,
      };
    }

    const data = await this.fetchRazorpay(`/subscriptions?count=${count}&skip=${skip}`, {
      signal,
    });

    return {
      items: Array.isArray(data?.items) ? data.items : [],
      count: typeof data?.count === 'number' ? data.count : (data?.items?.length || 0),
    };
  }

  /**
   * Reconciles subscription existence by searching provider records.
   * - Searches page 1 first; continues to subsequent pages only when necessary.
   * - Never makes unbounded provider requests (bounded by maxPages / pageSize, default 5 pages = 500 records).
   * - Preserves 10-second timeout per provider request.
   * - Zero matches -> { status: 'not_found' } (only when collection is definitively exhausted).
   * - Single exact match -> { status: 'found', subscription }.
   * - Two or more exact matches -> { status: 'ambiguous', matches } (REFUSES automatic completion/sorting).
   * - Hard limit reached without exhaustion -> { status: 'search_incomplete' } (BLOCKS automatic takeover).
   * - Outage/transport failure -> { status: 'provider_unavailable', error }.
   */
  async reconcileSubscription(params: ReconcileSubscriptionParams): Promise<ReconcileSubscriptionResult> {
    const maxPages = params.maxPages || 5;
    const pageSize = params.pageSize || 100;

    const allMatches: ProviderSubscriptionRef[] = [];
    let totalExamined = 0;
    let providerExhausted = false;

    for (let page = 1; page <= maxPages; page++) {
      const skip = (page - 1) * pageSize;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      let pageData: { items: any[]; count: number };
      try {
        pageData = await this.fetchSubscriptionsPage(pageSize, skip, controller.signal, page);
      } catch (err: any) {
        return {
          status: 'provider_unavailable',
          error: err?.message || 'Razorpay API unavailable during subscription reconciliation',
        };
      } finally {
        clearTimeout(timeoutId);
      }

      const items = Array.isArray(pageData?.items) ? pageData.items : [];
      totalExamined += items.length;

      const matchesOnPage = items.filter((item: any) => {
        const notes = item?.notes || {};
        const matchesOrg = notes.organization_id === params.organizationId;
        const matchesKey = notes.idempotency_key === params.idempotencyKey;
        const matchesCustomer = !params.customerId || item.customer_id === params.customerId;
        return matchesOrg && matchesKey && matchesCustomer;
      });

      for (const item of matchesOnPage) {
        allMatches.push({
          id: item.id,
          customerId: item.customer_id,
          planId: item.plan_id,
          status: item.status,
          currentPeriodStart: item.current_start ? new Date(item.current_start * 1000) : undefined,
          currentPeriodEnd: item.current_end ? new Date(item.current_end * 1000) : undefined,
        });
      }

      // If multiple matches discovered across examined records, refuse automatic completion immediately
      if (allMatches.length > 1) {
        return {
          status: 'ambiguous',
          matches: allMatches,
          message: `Multiple (${allMatches.length}) exact matching subscriptions found for organization "${params.organizationId}" and idempotency key "${params.idempotencyKey}". Automatic reconciliation blocked.`,
        };
      }

      // If exactly 1 match discovered, stop search early (subsequent pages only when necessary)
      if (allMatches.length === 1) {
        return {
          status: 'found',
          subscription: allMatches[0],
        };
      }

      // If provider returned fewer items than requested pageSize, provider list is definitively exhausted
      if (items.length < pageSize) {
        providerExhausted = true;
        break;
      }
    }

    if (allMatches.length === 0) {
      if (providerExhausted) {
        return {
          status: 'not_found',
          pagesExamined: Math.ceil(totalExamined / pageSize) || 1,
          recordsExamined: totalExamined,
        };
      }

      // Hard limit reached without finding match and without provider exhaustion
      return {
        status: 'search_incomplete',
        pagesExamined: maxPages,
        recordsExamined: totalExamined,
        message: `Bounded search reached maximum limit (${maxPages} pages, ${totalExamined} records) without exhausting provider subscriptions.`,
      };
    }

    return {
      status: 'not_found',
      pagesExamined: maxPages,
      recordsExamined: totalExamined,
    };
  }

  async findSubscriptionByNotes(params: {
    organizationId: string;
    idempotencyKey: string;
    customerId?: string;
    maxPages?: number;
    pageSize?: number;
  }): Promise<ProviderSubscriptionRef | null> {
    const res = await this.reconcileSubscription(params);
    if (res.status === 'found') {
      return res.subscription;
    }
    if (res.status === 'provider_unavailable') {
      throw new Error(`Razorpay provider unavailable during reconciliation: ${res.error}`);
    }
    if (res.status === 'ambiguous') {
      throw new Error(`Ambiguous reconciliation: multiple exact subscription matches found for idempotency key "${params.idempotencyKey}"`);
    }
    if (res.status === 'search_incomplete') {
      throw new Error(`Search incomplete: bounded pagination limit reached without definitive match for idempotency key "${params.idempotencyKey}"`);
    }
    return null;
  }

  async cancelSubscription(subscriptionId: string): Promise<boolean> {
    if (!this.isLiveConfigured()) {
      return true;
    }

    const data = await this.fetchRazorpay(`/subscriptions/${subscriptionId}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ cancel_at_cycle_end: 0 }),
    });

    return data.status === 'cancelled';
  }

  async getSubscription(subscriptionId: string): Promise<ProviderSubscriptionRef | null> {
    try {
      const data = await this.fetchRazorpay(`/subscriptions/${subscriptionId}`);
      if (!data || !data.id) return null;
      return {
        id: data.id,
        customerId: data.customer_id,
        planId: data.plan_id,
        status: data.status,
        currentPeriodStart: data.current_start ? new Date(data.current_start * 1000) : undefined,
        currentPeriodEnd: data.current_end ? new Date(data.current_end * 1000) : undefined,
      };
    } catch (err: any) {
      if (err.message?.includes('404') || err.message?.includes('not found')) {
        return null;
      }
      throw err;
    }
  }

  async getPayment(paymentId: string): Promise<ProviderPaymentRef | null> {
    try {
      const data = await this.fetchRazorpay(`/payments/${paymentId}`);
      if (!data || !data.id) return null;
      return {
        id: data.id,
        amount: Number(data.amount),
        currency: data.currency,
        status: data.status,
        invoiceId: data.invoice_id || undefined,
        orderId: data.order_id || undefined,
      };
    } catch (err: any) {
      if (err.message?.includes('404') || err.message?.includes('not found')) {
        return null;
      }
      throw err;
    }
  }
}
