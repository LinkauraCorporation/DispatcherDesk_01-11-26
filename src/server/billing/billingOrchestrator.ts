/**
 * DispatcherDesk Billing Orchestrator
 * File: src/server/billing/billingOrchestrator.ts
 *
 * Coordinates normalized provider events with DispatcherDesk internal billing architecture.
 * Ensures event deduplication, idempotency, strict tenant isolation,
 * out-of-order protection, and transactional state mutations.
 */

import { NormalizedBillingEvent, PaymentProviderAdapter } from './providers/types.ts';
import { RazorpayAdapter } from './providers/RazorpayAdapter.ts';
import { getSupabaseAdmin } from '../supabaseAdmin.ts';

export interface WebhookProcessingResult {
  success: boolean;
  duplicate?: boolean;
  stale?: boolean;
  ignored?: boolean;
  eventId: string;
  eventType: string;
  organizationId?: string;
  subscriptionId?: string;
  billingState?: string;
  error?: string;
}

export interface StuckWebhookRecoveryResult {
  recoveredCount: number;
  recoveredEventIds: string[];
}

export interface StoredWebhookEvent {
  id: string;
  provider: string;
  provider_event_id: string;
  event_type: string;
  payload: any;
  status: string;
  error_message?: string | null;
  retry_count: number;
  organization_id?: string | null;
  subscription_id?: string | null;
  provider_event_created_at?: string | null;
  received_at: string;
  processed_at?: string | null;
}

export interface ReconciliationOptions {
  organizationId: string;
  applyFix?: boolean;
}

export interface ReconciliationResult {
  organizationId: string;
  subscriptionId?: string;
  providerSubscriptionId?: string | null;
  mismatch: boolean;
  mismatchType?:
    | 'no_subscription'
    | 'not_linked_to_provider'
    | 'provider_subscription_not_found'
    | 'cross_tenant_mismatch'
    | 'state_mismatch'
    | 'stale_provider_state';
  localState?: string;
  providerStatus?: string;
  expectedBillingState?: string;
  canAutoResolve: boolean;
  actionTaken: 'none' | 'applied_fix' | 'blocked_by_policy';
  reason?: string;
  reconciledAt: string;
}

export interface ReconciliationReport {
  totalChecked: number;
  mismatchesFound: number;
  autoResolved: number;
  blockedByPolicy: number;
  results: ReconciliationResult[];
}

export interface DatabaseExecutor {
  getSubscriptionByProviderId(providerSubscriptionId: string): Promise<{
    id: string;
    organization_id: string;
    billing_state: string;
    plan: string;
    razorpay_subscription_id: string | null;
    last_provider_event_at: string | null;
  } | null>;

  getSubscriptionByOrgId(organizationId: string): Promise<{
    id: string;
    organization_id: string;
    billing_state: string;
    plan: string;
    razorpay_subscription_id: string | null;
    last_provider_event_at: string | null;
  } | null>;

  recordWebhookEvent(event: {
    provider: string;
    provider_event_id: string;
    event_type: string;
    payload: any;
    provider_event_created_at: string;
    organization_id?: string | null;
    subscription_id?: string | null;
  }): Promise<{
    id: string;
    isDuplicate: boolean;
    canProcess: boolean;
    isRetry?: boolean;
    status?: string;
  }>;

  updateWebhookEventStatus(
    eventId: string,
    status: 'processed' | 'failed' | 'ignored',
    error?: string,
    orgId?: string,
    subId?: string
  ): Promise<void>;

  applyPaymentTransition(params: {
    organizationId: string;
    provider: string;
    providerEventId?: string;
    providerEventTimestamp?: string;
    newBillingState?: string;
    plan?: string;
    currentPeriodStart?: string;
    currentPeriodEnd?: string;
    razorpayCustomerId?: string;
    razorpaySubscriptionId?: string;
    paymentId?: string;
    invoiceId?: string;
    orderId?: string;
    amountCents?: number;
    currency?: string;
    paymentStatus?: string;
    errorCode?: string;
    errorDescription?: string;
  }): Promise<{
    success: boolean;
    status: string;
    current_billing_state?: string;
    new_billing_state?: string;
    transaction_id?: string;
  }>;

  recoverStuckWebhooks?(leaseTimeoutMs?: number): Promise<StuckWebhookRecoveryResult>;

  getWebhookEventById?(eventId: string): Promise<StoredWebhookEvent | null>;

  recordAuditLog?(audit: {
    provider: string;
    provider_event_id: string;
    event_type: string;
    payload: any;
    organization_id?: string | null;
    subscription_id?: string | null;
    status: 'processed' | 'failed' | 'ignored';
    error_message?: string | null;
  }): Promise<void>;

  listSubscriptionsWithProvider?(limit?: number): Promise<Array<{
    id: string;
    organization_id: string;
    billing_state: string;
    plan: string;
    razorpay_subscription_id: string | null;
    last_provider_event_at: string | null;
  }>>;
}

// Default Supabase backend executor implementation using privileged server-side admin client
class SupabaseDatabaseExecutor implements DatabaseExecutor {
  async getSubscriptionByProviderId(providerSubscriptionId: string) {
    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin
      .from('subscriptions')
      .select('id, organization_id, billing_state, plan, razorpay_subscription_id, last_provider_event_at')
      .eq('razorpay_subscription_id', providerSubscriptionId)
      .maybeSingle();

    if (error || !data) return null;
    return data as any;
  }

  async getSubscriptionByOrgId(organizationId: string) {
    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin
      .from('subscriptions')
      .select('id, organization_id, billing_state, plan, razorpay_subscription_id, last_provider_event_at')
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (error || !data) return null;
    return data as any;
  }

  async recordWebhookEvent(event: {
    provider: string;
    provider_event_id: string;
    event_type: string;
    payload: any;
    provider_event_created_at: string;
    organization_id?: string | null;
    subscription_id?: string | null;
  }): Promise<{
    id: string;
    isDuplicate: boolean;
    canProcess: boolean;
    isRetry?: boolean;
    status?: string;
  }> {
    const supabaseAdmin = getSupabaseAdmin();

    // 1. Attempt initial insertion in 'processing' status to secure atomic processing lock
    const { data, error } = await supabaseAdmin
      .from('billing_webhook_events')
      .insert({
        provider: event.provider,
        provider_event_id: event.provider_event_id,
        event_type: event.event_type,
        payload: event.payload,
        provider_event_created_at: event.provider_event_created_at,
        organization_id: event.organization_id || null,
        subscription_id: event.subscription_id || null,
        status: 'processing',
        retry_count: 0,
      } as any)
      .select('id, status')
      .maybeSingle();

    if (!error && data) {
      return {
        id: (data as any).id,
        isDuplicate: false,
        canProcess: true,
        status: 'processing',
      };
    }

    // 2. Handle unique constraint violation (duplicate or redelivered event)
    if (
      error &&
      (error.code === '23505' ||
        error.message?.includes('unique') ||
        error.message?.includes('duplicate'))
    ) {
      const { data: existing, error: fetchError } = await supabaseAdmin
        .from('billing_webhook_events')
        .select('id, status, retry_count')
        .eq('provider', event.provider)
        .eq('provider_event_id', event.provider_event_id)
        .maybeSingle();

      if (fetchError || !existing) {
        throw fetchError || new Error('Failed to retrieve existing webhook event.');
      }

      const row = existing as any;

      // Status: 'processed' -> duplicate/no-op
      if (row.status === 'processed') {
        return {
          id: row.id,
          isDuplicate: true,
          canProcess: false,
          status: 'processed',
        };
      }

      // Status: 'ignored' -> duplicate/no-op
      if (row.status === 'ignored') {
        return {
          id: row.id,
          isDuplicate: true,
          canProcess: false,
          status: 'ignored',
        };
      }

      // Status: 'processing' -> concurrent worker active. Do not create second processor.
      if (row.status === 'processing') {
        return {
          id: row.id,
          isDuplicate: true,
          canProcess: false,
          status: 'processing',
        };
      }

      // Status: 'failed' -> allow safe reprocessing with atomic state lock
      if (row.status === 'failed') {
        const nextRetry = (row.retry_count || 0) + 1;
        const { data: claimed, error: claimError } = await supabaseAdmin
          .from('billing_webhook_events')
          .update({
            status: 'processing',
            retry_count: nextRetry,
            error_message: null,
            processed_at: new Date().toISOString(),
          } as any)
          .eq('id', row.id)
          .eq('status', 'failed') // Atomic optimistic check ensures only one worker claims this failed event
          .select('id, retry_count')
          .maybeSingle();

        if (claimError || !claimed) {
          // Another concurrent worker claimed the failed event first
          return {
            id: row.id,
            isDuplicate: true,
            canProcess: false,
            status: 'processing',
          };
        }

        return {
          id: row.id,
          isDuplicate: false,
          canProcess: true,
          isRetry: true,
          status: 'processing',
        };
      }

      return {
        id: row.id,
        isDuplicate: true,
        canProcess: false,
        status: row.status,
      };
    }

    throw error;
  }

  async updateWebhookEventStatus(
    eventId: string,
    status: 'processed' | 'failed' | 'ignored',
    error?: string,
    orgId?: string,
    subId?: string
  ) {
    const supabaseAdmin = getSupabaseAdmin();
    const updateData: Record<string, any> = {
      status,
      error_message: error || null,
      processed_at: new Date().toISOString(),
    };
    if (orgId) updateData.organization_id = orgId;
    if (subId) updateData.subscription_id = subId;

    await supabaseAdmin
      .from('billing_webhook_events')
      .update(updateData as any)
      .eq('id', eventId);
  }

  async applyPaymentTransition(params: {
    organizationId: string;
    provider: string;
    providerEventId?: string;
    providerEventTimestamp?: string;
    newBillingState?: string;
    plan?: string;
    currentPeriodStart?: string;
    currentPeriodEnd?: string;
    razorpayCustomerId?: string;
    razorpaySubscriptionId?: string;
    paymentId?: string;
    invoiceId?: string;
    orderId?: string;
    amountCents?: number;
    currency?: string;
    paymentStatus?: string;
    errorCode?: string;
    errorDescription?: string;
  }) {
    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin.rpc('apply_subscription_payment_transition' as any, {
      p_organization_id: params.organizationId,
      p_provider: params.provider,
      p_provider_event_id: params.providerEventId || null,
      p_provider_event_timestamp: params.providerEventTimestamp || null,
      p_new_billing_state: params.newBillingState || null,
      p_plan: params.plan || null,
      p_current_period_start: params.currentPeriodStart || null,
      p_current_period_end: params.currentPeriodEnd || null,
      p_razorpay_customer_id: params.razorpayCustomerId || null,
      p_razorpay_subscription_id: params.razorpaySubscriptionId || null,
      p_payment_id: params.paymentId || null,
      p_invoice_id: params.invoiceId || null,
      p_order_id: params.orderId || null,
      p_amount_cents: params.amountCents || null,
      p_currency: params.currency || 'USD',
      p_payment_status: params.paymentStatus || null,
      p_error_code: params.errorCode || null,
      p_error_description: params.errorDescription || null,
    } as any);

    if (error) {
      throw error;
    }

    return data as any;
  }

  async recoverStuckWebhooks(leaseTimeoutMs: number = 15 * 60 * 1000): Promise<StuckWebhookRecoveryResult> {
    const supabaseAdmin = getSupabaseAdmin();
    const cutoff = new Date(Date.now() - leaseTimeoutMs).toISOString();

    const { data: candidates, error } = await supabaseAdmin
      .from('billing_webhook_events')
      .select('id, retry_count, received_at, processed_at')
      .eq('status', 'processing');

    if (error || !candidates) {
      if (error) console.error('[BillingRecovery] Failed to query stuck webhooks:', error);
      return { recoveredCount: 0, recoveredEventIds: [] };
    }

    const recoveredEventIds: string[] = [];
    const leaseMinutes = Math.round(leaseTimeoutMs / 60000);
    const cutoffTime = new Date(cutoff).getTime();

    for (const row of candidates as any[]) {
      const leaseStart = new Date(row.processed_at || row.received_at).getTime();
      if (leaseStart <= cutoffTime) {
        // Atomic, optimistic update: ONLY update if status is STILL 'processing'
        const { data: updated, error: updateErr } = await supabaseAdmin
          .from('billing_webhook_events')
          .update({
            status: 'failed',
            error_message: `Lease expired: Event processing timed out after ${leaseMinutes} minutes without completion. Recovered to failed for retry eligibility.`,
            processed_at: new Date().toISOString(),
          } as any)
          .eq('id', row.id)
          .eq('status', 'processing')
          .select('id')
          .maybeSingle();

        if (!updateErr && updated) {
          recoveredEventIds.push((updated as any).id);
        }
      }
    }

    return {
      recoveredCount: recoveredEventIds.length,
      recoveredEventIds,
    };
  }

  async getWebhookEventById(eventId: string): Promise<StoredWebhookEvent | null> {
    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin
      .from('billing_webhook_events')
      .select('*')
      .eq('id', eventId)
      .maybeSingle();

    if (error || !data) return null;
    return data as any;
  }

  async recordAuditLog(audit: {
    provider: string;
    provider_event_id: string;
    event_type: string;
    payload: any;
    organization_id?: string | null;
    subscription_id?: string | null;
    status: 'processed' | 'failed' | 'ignored';
    error_message?: string | null;
  }): Promise<void> {
    const supabaseAdmin = getSupabaseAdmin();
    await supabaseAdmin
      .from('billing_webhook_events')
      .insert({
        provider: audit.provider,
        provider_event_id: audit.provider_event_id,
        event_type: audit.event_type,
        payload: audit.payload,
        status: audit.status,
        error_message: audit.error_message || null,
        organization_id: audit.organization_id || null,
        subscription_id: audit.subscription_id || null,
        provider_event_created_at: new Date().toISOString(),
        received_at: new Date().toISOString(),
        processed_at: new Date().toISOString(),
        retry_count: 0,
      } as any);
  }

  async listSubscriptionsWithProvider(limit: number = 100) {
    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin
      .from('subscriptions')
      .select('id, organization_id, billing_state, plan, razorpay_subscription_id, last_provider_event_at')
      .not('razorpay_subscription_id', 'is', null)
      .limit(limit);

    if (error || !data) return [];
    return data as any[];
  }
}

export class BillingOrchestrator {
  private adapter: PaymentProviderAdapter;
  private db: DatabaseExecutor;

  constructor(adapter?: PaymentProviderAdapter, db?: DatabaseExecutor) {
    this.adapter = adapter || new RazorpayAdapter();
    this.db = db || new SupabaseDatabaseExecutor();
  }

  /**
   * Applies an authoritative payment transition directly to the underlying database executor.
   */
  async applyPaymentTransition(params: Parameters<DatabaseExecutor['applyPaymentTransition']>[0]) {
    return this.db.applyPaymentTransition(params);
  }

  /**
   * Authoritative, idempotent processing of verified webhook events.
   */
  async processWebhookEvent(rawPayload: Record<string, any>, headerEventId?: string): Promise<WebhookProcessingResult> {
    const event = this.adapter.normalizeWebhookEvent(rawPayload, headerEventId);

    // 1. Ingest into append-only billing_webhook_events with idempotency and retry semantics
    const ingestion = await this.db.recordWebhookEvent({
      provider: event.provider,
      provider_event_id: event.eventId,
      event_type: event.eventType,
      payload: rawPayload,
      provider_event_created_at: event.providerTimestamp.toISOString(),
    });

    if (ingestion.isDuplicate && !ingestion.canProcess) {
      if (ingestion.status === 'processing') {
        return {
          success: false,
          eventId: event.eventId,
          eventType: event.eventType,
          error: 'Webhook event is currently being processed by another worker.',
        };
      }

      return {
        success: true,
        duplicate: true,
        ignored: ingestion.status === 'ignored',
        eventId: event.eventId,
        eventType: event.eventType,
      };
    }

    if (!ingestion.canProcess) {
      return {
        success: false,
        eventId: event.eventId,
        eventType: event.eventType,
        error: 'Webhook event cannot be processed.',
      };
    }

    const webhookRowId = ingestion.id;
    let subscription: any = null;

    try {
      // 2. Correlate external provider subscription to internal subscription
      if (event.providerSubscriptionId) {
        subscription = await this.db.getSubscriptionByProviderId(event.providerSubscriptionId);
      }

      // Fallback: If subscription not linked yet by provider ID, correlate via organizationIdHint from metadata notes
      if (!subscription && event.organizationIdHint) {
        subscription = await this.db.getSubscriptionByOrgId(event.organizationIdHint);
      }

      if (!subscription) {
        // Uncorrelated event (e.g. unknown organization or external non-DispatcherDesk subscription)
        await this.db.updateWebhookEventStatus(
          webhookRowId,
          'ignored',
          `No matching subscription found for providerSubscriptionId="${event.providerSubscriptionId || ''}"`
        );
        return {
          success: true,
          ignored: true,
          eventId: event.eventId,
          eventType: event.eventType,
          error: 'Subscription correlation failed: unknown provider subscription.',
        };
      }

      // 3. Prevent cross-tenant mutation with CONTROLLED RESUBSCRIPTION:
      // Replacement of provider subscription ID is ONLY permitted if the existing internal
      // subscription has reached an explicitly allowed terminal lifecycle state ('canceled', 'trial_expired').
      // Active, past_due, suspended, or subscription_pending subscriptions CANNOT have their provider subscription ID replaced.
      if (
        subscription.razorpay_subscription_id &&
        event.providerSubscriptionId &&
        subscription.razorpay_subscription_id !== event.providerSubscriptionId
      ) {
        const ALLOWED_RESUBSCRIPTION_STATES = ['canceled', 'trial_expired'];
        if (!ALLOWED_RESUBSCRIPTION_STATES.includes(subscription.billing_state)) {
          const errorMsg = `Cross-tenant violation: internal sub belongs to ${subscription.razorpay_subscription_id}, event supplied ${event.providerSubscriptionId} while state is "${subscription.billing_state}"`;
          await this.db.updateWebhookEventStatus(
            webhookRowId,
            'failed',
            errorMsg,
            subscription.organization_id,
            subscription.id
          );
          return {
            success: false,
            eventId: event.eventId,
            eventType: event.eventType,
            error: errorMsg,
          };
        }
      }

      // 4. Determine payment status for ledger
      let paymentStatus: string | undefined = undefined;
      if (event.eventType === 'subscription.charged') {
        paymentStatus = 'captured';
      } else if (event.eventType === 'payment.failed') {
        paymentStatus = 'failed';
      }

      // 5. Execute transactional state transition via atomic RPC
      const transitionResult = await this.db.applyPaymentTransition({
        organizationId: subscription.organization_id,
        provider: event.provider,
        providerEventId: event.eventId,
        providerEventTimestamp: event.providerTimestamp.toISOString(),
        newBillingState: event.targetState,
        currentPeriodStart: event.periodStart?.toISOString(),
        currentPeriodEnd: event.periodEnd?.toISOString(),
        razorpayCustomerId: event.providerCustomerId,
        razorpaySubscriptionId: event.providerSubscriptionId,
        paymentId: event.providerPaymentId,
        invoiceId: event.providerInvoiceId,
        orderId: event.providerOrderId,
        amountCents: event.amountCents,
        currency: event.currency || 'USD',
        paymentStatus,
      });

      const isStale = transitionResult.status === 'stale_event_ignored';

      // 6. Update webhook event ledger to terminal processed status
      await this.db.updateWebhookEventStatus(
        webhookRowId,
        'processed',
        isStale ? 'Event was stale and ignored from state mutation' : undefined,
        subscription.organization_id,
        subscription.id
      );

      return {
        success: true,
        stale: isStale,
        eventId: event.eventId,
        eventType: event.eventType,
        organizationId: subscription.organization_id,
        subscriptionId: subscription.id,
        billingState: transitionResult.new_billing_state || transitionResult.current_billing_state,
      };
    } catch (err: any) {
      console.error(`[BillingOrchestrator] Webhook processing failed for event ${event.eventId}:`, err);
      try {
        await this.db.updateWebhookEventStatus(
          webhookRowId,
          'failed',
          err?.message || 'Processing error',
          subscription?.organization_id,
          subscription?.id
        );
      } catch (statusErr) {
        console.error(`[BillingOrchestrator] Failed to update webhook event status to failed:`, statusErr);
      }

      return {
        success: false,
        eventId: event.eventId,
        eventType: event.eventType,
        error: err?.message || 'Database transaction failed during webhook processing.',
      };
    }
  }

  /**
   * Phase 3B: Stuck Webhook Recovery
   * Detects events stuck in 'processing' beyond safe lease (default: 15 minutes)
   * and safely marks them 'failed' for retry eligibility.
   * Concurrency-safe via optimistic state check.
   */
  async recoverStuckWebhooks(options?: { leaseTimeoutMs?: number }): Promise<StuckWebhookRecoveryResult> {
    const leaseTimeoutMs = options?.leaseTimeoutMs ?? 15 * 60 * 1000;
    if (this.db.recoverStuckWebhooks) {
      return await this.db.recoverStuckWebhooks(leaseTimeoutMs);
    }
    return { recoveredCount: 0, recoveredEventIds: [] };
  }

  /**
   * Phase 3B: Retry Reliability
   * Reuses the existing failed-event retry mechanism, respecting atomic retry locks,
   * idempotency, controlled resubscription, and transactional transitions.
   */
  async retryFailedWebhookEvent(eventId: string): Promise<WebhookProcessingResult> {
    if (!this.db.getWebhookEventById) {
      return {
        success: false,
        eventId,
        eventType: 'unknown',
        error: 'Database executor does not support getWebhookEventById',
      };
    }

    const eventRecord = await this.db.getWebhookEventById(eventId);
    if (!eventRecord) {
      return {
        success: false,
        eventId,
        eventType: 'unknown',
        error: `Webhook event ${eventId} not found`,
      };
    }

    if (eventRecord.status === 'processed') {
      return {
        success: true,
        duplicate: true,
        eventId: eventRecord.provider_event_id,
        eventType: eventRecord.event_type,
        billingState: 'processed',
      };
    }

    if (eventRecord.status === 'ignored') {
      return {
        success: true,
        ignored: true,
        eventId: eventRecord.provider_event_id,
        eventType: eventRecord.event_type,
      };
    }

    // Re-dispatch through processWebhookEvent to reuse existing atomic retry lock,
    // idempotency, controlled resubscription, and transactional transitions
    return await this.processWebhookEvent(eventRecord.payload, eventRecord.provider_event_id);
  }

  /**
   * Phase 3B: Billing Reconciliation
   * Detects local subscription state mismatches against Razorpay provider state.
   * Strictly preserves tenant isolation, payment integrity, and terminal state invariants.
   * Never blindly overwrites canceled or newer state.
   */
  async reconcileSubscription(options: ReconciliationOptions): Promise<ReconciliationResult> {
    const reconciledAt = new Date().toISOString();
    const { organizationId, applyFix = false } = options;

    const localSub = await this.db.getSubscriptionByOrgId(organizationId);
    if (!localSub) {
      return {
        organizationId,
        mismatch: false,
        canAutoResolve: false,
        actionTaken: 'none',
        reason: 'Subscription record not found for organization.',
        reconciledAt,
      };
    }

    // Free trial organizations without provider binding
    if (!localSub.razorpay_subscription_id) {
      return {
        organizationId,
        subscriptionId: localSub.id,
        providerSubscriptionId: null,
        localState: localSub.billing_state,
        mismatch: false,
        canAutoResolve: false,
        actionTaken: 'none',
        reason: 'Organization is not linked to an external payment provider subscription.',
        reconciledAt,
      };
    }

    // Remote provider inspection
    if (!this.adapter.getSubscription) {
      return {
        organizationId,
        subscriptionId: localSub.id,
        providerSubscriptionId: localSub.razorpay_subscription_id,
        localState: localSub.billing_state,
        mismatch: false,
        canAutoResolve: false,
        actionTaken: 'none',
        reason: 'Payment provider adapter does not support remote subscription fetching.',
        reconciledAt,
      };
    }

    const remoteSub = await this.adapter.getSubscription(localSub.razorpay_subscription_id);
    if (!remoteSub) {
      const result: ReconciliationResult = {
        organizationId,
        subscriptionId: localSub.id,
        providerSubscriptionId: localSub.razorpay_subscription_id,
        localState: localSub.billing_state,
        mismatch: true,
        mismatchType: 'provider_subscription_not_found',
        canAutoResolve: false,
        actionTaken: 'blocked_by_policy',
        reason: 'Subscription ID not found at payment provider.',
        reconciledAt,
      };

      await this.recordReconciliationAudit(result, localSub);
      return result;
    }

    // Map remote status to authoritative domain BillingState
    let expectedBillingState: string;
    switch (remoteSub.status) {
      case 'active':
        expectedBillingState = 'active';
        break;
      case 'created':
      case 'authenticated':
        expectedBillingState = 'subscription_pending';
        break;
      case 'pending':
        expectedBillingState = 'past_due';
        break;
      case 'halted':
      case 'paused':
        expectedBillingState = 'suspended';
        break;
      case 'cancelled':
      case 'completed':
        expectedBillingState = 'canceled';
        break;
      default:
        expectedBillingState = localSub.billing_state;
        break;
    }

    // Evaluate state mismatch
    const isStateMismatch = localSub.billing_state !== expectedBillingState;

    if (!isStateMismatch) {
      const result: ReconciliationResult = {
        organizationId,
        subscriptionId: localSub.id,
        providerSubscriptionId: localSub.razorpay_subscription_id,
        localState: localSub.billing_state,
        providerStatus: remoteSub.status,
        expectedBillingState,
        mismatch: false,
        canAutoResolve: false,
        actionTaken: 'none',
        reason: 'Local billing state is in perfect synchronization with payment provider.',
        reconciledAt,
      };
      await this.recordReconciliationAudit(result, localSub);
      return result;
    }

    // Mismatch detected: Evaluate policy protections
    // Invariant 1: Terminal canceled state cannot be resurrected without explicit resubscription
    if (localSub.billing_state === 'canceled' && expectedBillingState !== 'canceled') {
      const result: ReconciliationResult = {
        organizationId,
        subscriptionId: localSub.id,
        providerSubscriptionId: localSub.razorpay_subscription_id,
        localState: localSub.billing_state,
        providerStatus: remoteSub.status,
        expectedBillingState,
        mismatch: true,
        mismatchType: 'state_mismatch',
        canAutoResolve: false,
        actionTaken: 'blocked_by_policy',
        reason: 'Blind overwrite forbidden: Local subscription is in terminal canceled state.',
        reconciledAt,
      };
      await this.recordReconciliationAudit(result, localSub);
      return result;
    }

    let actionTaken: 'none' | 'applied_fix' | 'blocked_by_policy' = 'none';
    let reason = `State mismatch detected: Local state is "${localSub.billing_state}", provider is "${remoteSub.status}" (maps to "${expectedBillingState}").`;

    if (applyFix) {
      try {
        const transition = await this.db.applyPaymentTransition({
          organizationId: localSub.organization_id,
          provider: 'razorpay',
          providerEventId: `reconcile_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          providerEventTimestamp: new Date().toISOString(),
          newBillingState: expectedBillingState,
          currentPeriodStart: remoteSub.currentPeriodStart?.toISOString(),
          currentPeriodEnd: remoteSub.currentPeriodEnd?.toISOString(),
          razorpayCustomerId: remoteSub.customerId,
          razorpaySubscriptionId: localSub.razorpay_subscription_id,
        });

        if (transition.status === 'stale_event_ignored') {
          actionTaken = 'blocked_by_policy';
          reason = 'Reconciliation blocked: Local subscription was modified by a newer provider event.';
        } else {
          actionTaken = 'applied_fix';
          reason = `State safely reconciled from "${localSub.billing_state}" to "${expectedBillingState}".`;
        }
      } catch (err: any) {
        actionTaken = 'blocked_by_policy';
        reason = `Reconciliation transition rejected: ${err.message}`;
      }
    }

    const result: ReconciliationResult = {
      organizationId,
      subscriptionId: localSub.id,
      providerSubscriptionId: localSub.razorpay_subscription_id,
      localState: localSub.billing_state,
      providerStatus: remoteSub.status,
      expectedBillingState,
      mismatch: true,
      mismatchType: 'state_mismatch',
      canAutoResolve: true,
      actionTaken,
      reason,
      reconciledAt,
    };

    await this.recordReconciliationAudit(result, localSub);
    return result;
  }

  /**
   * Phase 3B: Bulk Reconciliation Sweep
   */
  async reconcileAllSubscriptions(options?: { applyFix?: boolean; limit?: number }): Promise<ReconciliationReport> {
    const applyFix = options?.applyFix ?? false;
    const limit = options?.limit ?? 100;

    let subs: any[] = [];
    if (this.db.listSubscriptionsWithProvider) {
      subs = await this.db.listSubscriptionsWithProvider(limit);
    }

    const results: ReconciliationResult[] = [];
    let mismatchesFound = 0;
    let autoResolved = 0;
    let blockedByPolicy = 0;

    for (const sub of subs) {
      const res = await this.reconcileSubscription({
        organizationId: sub.organization_id,
        applyFix,
      });
      results.push(res);
      if (res.mismatch) mismatchesFound++;
      if (res.actionTaken === 'applied_fix') autoResolved++;
      if (res.actionTaken === 'blocked_by_policy') blockedByPolicy++;
    }

    return {
      totalChecked: subs.length,
      mismatchesFound,
      autoResolved,
      blockedByPolicy,
      results,
    };
  }

  /**
   * Phase 3B Auditability:
   * Records reconciliation outcomes and reasons without logging secrets or credentials.
   */
  private async recordReconciliationAudit(result: ReconciliationResult, sub: any): Promise<void> {
    if (!this.db.recordAuditLog) return;
    try {
      await this.db.recordAuditLog({
        provider: 'reconciliation',
        provider_event_id: `reconcile_${sub.id}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        event_type: 'billing.reconciliation',
        organization_id: sub.organization_id,
        subscription_id: sub.id,
        status: result.actionTaken === 'blocked_by_policy' ? 'ignored' : 'processed',
        payload: {
          organizationId: result.organizationId,
          subscriptionId: result.subscriptionId,
          providerSubscriptionId: result.providerSubscriptionId,
          localState: result.localState,
          providerStatus: result.providerStatus,
          expectedBillingState: result.expectedBillingState,
          mismatch: result.mismatch,
          mismatchType: result.mismatchType,
          canAutoResolve: result.canAutoResolve,
          actionTaken: result.actionTaken,
          reason: result.reason,
          reconciledAt: result.reconciledAt,
        },
      });
    } catch {
      // Audit failure must never crash core transaction
    }
  }
}
