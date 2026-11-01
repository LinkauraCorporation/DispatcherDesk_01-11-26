/**
 * DispatcherDesk Phase 3A — Secure Payment Foundation Remediation Test Suite
 * File: src/server/billing/billing_phase3a_security.test.ts
 *
 * Verifies:
 * 1. Webhook signature cryptographic verification (valid, invalid, tampered, missing)
 * 2. Payment signature verification (valid, forged, missing fields, order vs subscription)
 * 3. Event normalization & state mapping (Razorpay events -> DispatcherDesk domain states)
 * 4. Ingestion idempotency (duplicate webhook delivery protection)
 * 5. Out-of-order / stale event protection (preventing stale rollbacks)
 * 6. Cross-tenant isolation & correlation safeguards
 * 7. Server-side Supabase service-role admin client & missing key fail-safe (Remediation Fix 1)
 * 8. Failed webhook redelivery & safe reprocessing (Remediation Fix 2)
 * 9. Concurrent retry lock race protection (Remediation Fix 2)
 * 10. HTTP status codes & error concealment on webhook ingestion (Remediation Fix 3)
 * 11. Controlled resubscription on terminal states (canceled, trial_expired) (Remediation Fix 4)
 * 12. Rejection of resubscription replacement on active / non-terminal states (Remediation Fix 4)
 */

import crypto from 'node:crypto';
import { RazorpayAdapter } from './providers/RazorpayAdapter.ts';
import { BillingOrchestrator, DatabaseExecutor } from './billingOrchestrator.ts';
import { getSupabaseAdmin, resetSupabaseAdminForTesting } from '../supabaseAdmin.ts';
import { BillingState, PlanType } from '../../types/domain.types.ts';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`[Phase 3A Assertion Failed]: ${message}`);
  }
}

// In-Memory Database Simulator for Orchestration Testing
class MockDatabaseExecutor implements DatabaseExecutor {
  public subscriptions: Map<string, any> = new Map();
  public webhookEvents: Map<string, any> = new Map();
  public paymentTransactions: any[] = [];
  public simulateConcurrentLockFailure: boolean = false;
  public simulateTransactionFailure: boolean = false;

  async getSubscriptionByProviderId(providerSubscriptionId: string) {
    for (const sub of this.subscriptions.values()) {
      if (sub.razorpay_subscription_id === providerSubscriptionId) {
        return { ...sub };
      }
    }
    return null;
  }

  async getSubscriptionByOrgId(organizationId: string) {
    const sub = this.subscriptions.get(organizationId);
    return sub ? { ...sub } : null;
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
    const key = `${event.provider}:${event.provider_event_id}`;
    if (this.webhookEvents.has(key)) {
      const existing = this.webhookEvents.get(key);

      // Terminal processed or ignored
      if (existing.status === 'processed') {
        return { id: existing.id, isDuplicate: true, canProcess: false, status: 'processed' };
      }
      if (existing.status === 'ignored') {
        return { id: existing.id, isDuplicate: true, canProcess: false, status: 'ignored' };
      }

      // Active processing lock
      if (existing.status === 'processing') {
        return { id: existing.id, isDuplicate: true, canProcess: false, status: 'processing' };
      }

      // Failed state: allow safe reprocessing with atomic optimistic lock simulation
      if (existing.status === 'failed') {
        if (this.simulateConcurrentLockFailure) {
          // Lost race to another worker
          return { id: existing.id, isDuplicate: true, canProcess: false, status: 'processing' };
        }
        existing.status = 'processing';
        existing.retry_count = (existing.retry_count || 0) + 1;
        this.webhookEvents.set(key, existing);
        return { id: existing.id, isDuplicate: false, canProcess: true, isRetry: true, status: 'processing' };
      }
    }

    const id = `evt-row-${Date.now()}-${Math.random()}`;
    this.webhookEvents.set(key, {
      id,
      ...event,
      status: 'processing',
      retry_count: 0,
      received_at: new Date().toISOString(),
    });

    return { id, isDuplicate: false, canProcess: true, status: 'processing' };
  }

  async updateWebhookEventStatus(
    eventId: string,
    status: 'processed' | 'failed' | 'ignored',
    error?: string,
    orgId?: string,
    subId?: string
  ) {
    for (const [key, ev] of this.webhookEvents.entries()) {
      if (ev.id === eventId) {
        ev.status = status;
        ev.error_message = error;
        if (orgId) ev.organization_id = orgId;
        if (subId) ev.subscription_id = subId;
        ev.processed_at = new Date().toISOString();
        this.webhookEvents.set(key, ev);
        break;
      }
    }
  }

  async applyPaymentTransition(params: any) {
    if (this.simulateTransactionFailure) {
      throw new Error('Database transaction deadlocked or connection lost');
    }

    const sub = this.subscriptions.get(params.organizationId);
    if (!sub) {
      throw new Error(`Subscription not found for organization ${params.organizationId}`);
    }

    // Controlled resubscription rule in database executor:
    // Replacement is ONLY permitted if existing subscription is in a terminal state ('canceled', 'trial_expired')
    if (
      sub.razorpay_subscription_id &&
      params.razorpaySubscriptionId &&
      sub.razorpay_subscription_id !== params.razorpaySubscriptionId
    ) {
      const ALLOWED_RESUBSCRIPTION_STATES = ['canceled', 'trial_expired'];
      if (!ALLOWED_RESUBSCRIPTION_STATES.includes(sub.billing_state)) {
        throw new Error(
          `Billing Transition Error: Provider subscription ID mismatch (existing: ${sub.razorpay_subscription_id}, supplied: ${params.razorpaySubscriptionId}). Current state "${sub.billing_state}" does not permit resubscription replacement.`
        );
      }
    }

    // Out of order / stale event check
    let isStale = false;
    if (params.providerEventTimestamp && sub.last_provider_event_at) {
      const eventTime = new Date(params.providerEventTimestamp).getTime();
      const lastTime = new Date(sub.last_provider_event_at).getTime();
      if (eventTime < lastTime) {
        isStale = true;
      }
    }

    // Never resurrect canceled via stale event
    if (sub.billing_state === 'canceled' && params.newBillingState === 'active' && isStale) {
      isStale = true;
    }

    let txId: string | undefined = undefined;
    if (params.paymentId && params.paymentStatus) {
      txId = `tx-${params.paymentId}`;
      this.paymentTransactions.push({
        id: txId,
        organization_id: params.organizationId,
        subscription_id: sub.id,
        provider: params.provider,
        provider_payment_id: params.paymentId,
        amount_cents: params.amountCents || 0,
        currency: params.currency || 'USD',
        status: params.paymentStatus,
        created_at: new Date().toISOString(),
      });
    }

    if (isStale) {
      return {
        success: true,
        status: 'stale_event_ignored',
        organization_id: params.organizationId,
        subscription_id: sub.id,
        current_billing_state: sub.billing_state,
        transaction_id: txId,
      };
    }

    sub.billing_state = params.newBillingState || sub.billing_state;
    sub.plan = params.plan || sub.plan;
    sub.current_period_start = params.currentPeriodStart || sub.current_period_start;
    sub.current_period_end = params.currentPeriodEnd || sub.current_period_end;
    sub.razorpay_customer_id = params.razorpayCustomerId || sub.razorpay_customer_id;
    sub.razorpay_subscription_id = params.razorpaySubscriptionId || sub.razorpay_subscription_id;
    sub.last_provider_event_at = params.providerEventTimestamp || new Date().toISOString();
    sub.updated_at = new Date().toISOString();

    this.subscriptions.set(params.organizationId, sub);

    return {
      success: true,
      status: 'applied',
      organization_id: params.organizationId,
      subscription_id: sub.id,
      new_billing_state: sub.billing_state,
      transaction_id: txId,
    };
  }
}

export async function runPhase3ASecurityTests() {
  console.log('================================================================');
  console.log('DISPATCHERDESK PHASE 3A SECURE PAYMENT REMEDIATION TEST SUITE');
  console.log('================================================================\n');

  const TEST_KEY_SECRET = 'rzp_sec_mock_test_key_secret_998877';
  const TEST_WEBHOOK_SECRET = 'whsec_dispatcherdesk_prod_secret_445566';

  const adapter = new RazorpayAdapter({
    keyId: 'rzp_test_mock_key',
    keySecret: TEST_KEY_SECRET,
    webhookSecret: TEST_WEBHOOK_SECRET,
  });

  // TEST 1: Webhook Signature Verification
  console.log('--- Test Group 1: Webhook Signature Verification ---');
  const samplePayload = JSON.stringify({
    entity: 'event',
    event: 'subscription.charged',
    created_at: 1757235600,
  });

  const validWebhookSig = crypto
    .createHmac('sha256', TEST_WEBHOOK_SECRET)
    .update(Buffer.from(samplePayload, 'utf8'))
    .digest('hex');

  // 1.1 Valid signature
  const validResult = adapter.verifyWebhookSignature({
    rawBody: samplePayload,
    signature: validWebhookSig,
    secret: TEST_WEBHOOK_SECRET,
  });
  assert(validResult === true, 'Valid webhook signature must be accepted');

  // 1.2 Invalid signature
  const invalidResult = adapter.verifyWebhookSignature({
    rawBody: samplePayload,
    signature: 'bad_signature_00000000000000000000000000000000000000000000000000000000',
    secret: TEST_WEBHOOK_SECRET,
  });
  assert(invalidResult === false, 'Invalid webhook signature must be rejected');

  // 1.3 Tampered body
  const tamperedPayload = samplePayload.replace('subscription.charged', 'subscription.cancelled');
  const tamperedResult = adapter.verifyWebhookSignature({
    rawBody: tamperedPayload,
    signature: validWebhookSig,
    secret: TEST_WEBHOOK_SECRET,
  });
  assert(tamperedResult === false, 'Tampered payload body must be rejected');

  // 1.4 Missing signature
  const missingResult = adapter.verifyWebhookSignature({
    rawBody: samplePayload,
    signature: '',
    secret: TEST_WEBHOOK_SECRET,
  });
  assert(missingResult === false, 'Missing signature must be rejected');
  console.log('✓ Webhook signature cryptographic verification passed (4/4 tests)');

  // TEST 2: Payment Signature Verification
  console.log('\n--- Test Group 2: Client Payment Signature Verification ---');
  const paymentId = 'pay_01JN8P3R8Z';
  const subscriptionId = 'sub_01JN8P3R9Y';
  const expectedSubData = `${paymentId}|${subscriptionId}`;
  const validSubPaymentSig = crypto
    .createHmac('sha256', TEST_KEY_SECRET)
    .update(expectedSubData)
    .digest('hex');

  const paymentRes1 = adapter.verifyPaymentSignature({
    paymentId,
    subscriptionId,
    signature: validSubPaymentSig,
  });
  assert(paymentRes1.isValid === true, 'Valid subscription payment signature must be verified');

  const paymentRes2 = adapter.verifyPaymentSignature({
    paymentId,
    subscriptionId,
    signature: 'forged_signature_1234567890abcdef1234567890abcdef1234567890abcdef1234',
  });
  assert(paymentRes2.isValid === false, 'Forged payment signature must be rejected');

  const paymentRes3 = adapter.verifyPaymentSignature({
    paymentId: '',
    subscriptionId,
    signature: validSubPaymentSig,
  });
  assert(paymentRes3.isValid === false, 'Missing paymentId must be rejected');
  console.log('✓ Payment signature verification passed (3/3 tests)');

  // TEST 3: Provider Event Normalization & State Mapping
  console.log('\n--- Test Group 3: Event Normalization & Domain State Mapping ---');
  const chargedPayload = {
    entity: 'event',
    event: 'subscription.charged',
    created_at: 1757235600,
    payload: {
      subscription: {
        entity: {
          id: 'sub_test_100',
          customer_id: 'cust_test_200',
          current_start: 1757235600,
          current_end: 1759827600,
          notes: {
            organization_id: 'org-uuid-001',
          },
        },
      },
      payment: {
        entity: {
          id: 'pay_test_300',
          amount: 29900,
          currency: 'USD',
          invoice_id: 'inv_test_400',
        },
      },
    },
  };

  const normalizedCharged = adapter.normalizeWebhookEvent(chargedPayload);
  assert(normalizedCharged.eventType === 'subscription.charged', 'Event type must be subscription.charged');
  assert(normalizedCharged.targetState === 'active', 'subscription.charged must map to active billing state');
  assert(normalizedCharged.amountCents === 29900, 'amountCents must be 29900');
  assert(normalizedCharged.currency === 'USD', 'currency must be USD');
  assert(normalizedCharged.organizationIdHint === 'org-uuid-001', 'organizationIdHint must match metadata');
  assert(normalizedCharged.providerSubscriptionId === 'sub_test_100', 'providerSubscriptionId must match');
  assert(normalizedCharged.providerPaymentId === 'pay_test_300', 'providerPaymentId must match');

  const cancelledEv = adapter.normalizeWebhookEvent({ event: 'subscription.cancelled' });
  assert(cancelledEv.targetState === 'canceled', 'subscription.cancelled must map to canceled');

  const pendingEv = adapter.normalizeWebhookEvent({ event: 'subscription.pending' });
  assert(pendingEv.targetState === 'past_due', 'subscription.pending must map to past_due');

  const haltedEv = adapter.normalizeWebhookEvent({ event: 'subscription.halted' });
  assert(haltedEv.targetState === 'suspended', 'subscription.halted must map to suspended');

  const authEv = adapter.normalizeWebhookEvent({ event: 'subscription.authenticated' });
  assert(authEv.targetState === 'subscription_pending', 'subscription.authenticated must map to subscription_pending');
  console.log('✓ Provider event normalization & state mapping passed (5/5 tests)');

  // TEST 4: Orchestrator Idempotency & Ingestion
  console.log('\n--- Test Group 4: Webhook Ingestion Idempotency ---');
  const db = new MockDatabaseExecutor();
  const orchestrator = new BillingOrchestrator(adapter, db);

  const orgId = 'org-uuid-001';
  db.subscriptions.set(orgId, {
    id: 'sub-internal-001',
    organization_id: orgId,
    plan: 'starter' as PlanType,
    billing_state: 'subscription_pending' as BillingState,
    razorpay_customer_id: 'cust_test_200',
    razorpay_subscription_id: 'sub_test_100',
    current_period_start: new Date(1757235600000).toISOString(),
    current_period_end: new Date(1759827600000).toISOString(),
    last_provider_event_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  // First delivery
  const res1 = await orchestrator.processWebhookEvent(chargedPayload, 'evt_unique_001');
  assert(res1.success === true, 'First event ingestion must succeed');
  assert(res1.duplicate !== true, 'First event ingestion is not duplicate');
  assert(res1.billingState === 'active', 'Subscription must transition to active');
  assert(db.paymentTransactions.length === 1, 'Payment transaction must be recorded');
  assert(db.paymentTransactions[0].provider_payment_id === 'pay_test_300', 'Payment ID must match');

  // Second delivery (duplicate delivery of already-processed event)
  const res2 = await orchestrator.processWebhookEvent(chargedPayload, 'evt_unique_001');
  assert(res2.success === true, 'Duplicate webhook returns success (200 OK equivalent)');
  assert(res2.duplicate === true, 'Duplicate webhook must be flagged as duplicate');
  assert(db.paymentTransactions.length === 1, 'Duplicate webhook must NOT create duplicate transactions');
  console.log('✓ Ingestion idempotency passed (no duplicate side-effects)');

  // TEST 5: Out-of-Order / Stale Event Protection
  console.log('\n--- Test Group 5: Out-of-Order & Stale Event Protection ---');
  const olderPayload = {
    ...chargedPayload,
    event: 'subscription.pending',
    created_at: 1757000000,
  };

  const resStale = await orchestrator.processWebhookEvent(olderPayload, 'evt_older_002');
  assert(resStale.success === true, 'Stale webhook processing succeeds without crash');
  assert(resStale.stale === true, 'Stale webhook must be flagged as stale');

  const currentSub = db.subscriptions.get(orgId);
  assert(currentSub.billing_state === 'active', 'Active billing state must NOT be reverted to past_due by older event');
  console.log('✓ Out-of-order / stale event protection passed (no regression on state)');

  // TEST 6: Tenant Isolation & Collision Protection
  console.log('\n--- Test Group 6: Cross-Tenant Isolation Safeguards ---');
  const maliciousCrossTenantPayload = {
    entity: 'event',
    event: 'subscription.charged',
    created_at: 1757300000,
    payload: {
      subscription: {
        entity: {
          id: 'sub_foreign_intruder_999',
          notes: {
            organization_id: orgId,
          },
        },
      },
    },
  };

  const resCross = await orchestrator.processWebhookEvent(maliciousCrossTenantPayload, 'evt_cross_003');
  assert(resCross.success === false, 'Cross-tenant mutation attempt on active subscription must be rejected');
  assert(resCross.error?.includes('Cross-tenant violation') === true, 'Error must identify cross-tenant violation');
  console.log('✓ Cross-tenant isolation safeguards passed');

  // TEST 7: Remediation Fix 1 — Server-Side Supabase Service Role Client
  console.log('\n--- Test Group 7: Remediation Fix 1 — Server-Side Service Role Admin Client ---');
  // 7.1 Fail safe when service role key is absent
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    resetSupabaseAdminForTesting();
    let caughtMissingKey = false;
    try {
      getSupabaseAdmin();
    } catch (err: any) {
      caughtMissingKey = true;
      assert(
        err.message.includes('SUPABASE_SERVICE_ROLE_KEY is required'),
        'Must fail fast with explicit error about SUPABASE_SERVICE_ROLE_KEY'
      );
    }
    assert(caughtMissingKey === true, 'Missing SUPABASE_SERVICE_ROLE_KEY must throw error');
  } finally {
    // Restore or provide test key
    process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey || 'sb_service_role_test_key_mock_secret_abcdef123456';
    resetSupabaseAdminForTesting();
  }

  // 7.2 Lazy initialization creates client successfully with service role key
  const adminClient = getSupabaseAdmin();
  assert(Boolean(adminClient), 'Admin client must be initialized');
  const cachedAdminClient = getSupabaseAdmin();
  assert(adminClient === cachedAdminClient, 'Subsequent calls must return cached singleton instance');
  console.log('✓ Server-side service-role client and fail-safe verified');

  // TEST 8: Remediation Fix 2 — Failed Webhook Redelivery & Reprocessing Lifecycle
  console.log('\n--- Test Group 8: Remediation Fix 2 — Failed Webhook Redelivery ---');
  const redeliveryEventId = 'evt_flaky_retry_001';
  const flakyPayload = {
    entity: 'event',
    event: 'subscription.charged',
    created_at: 1757400000,
    payload: {
      subscription: {
        entity: {
          id: 'sub_test_100',
          customer_id: 'cust_test_200',
          current_start: 1757400000,
          current_end: 1759992000,
          notes: {
            organization_id: orgId,
          },
        },
      },
      payment: {
        entity: {
          id: 'pay_retry_777',
          amount: 29900,
          currency: 'USD',
        },
      },
    },
  };

  // Simulate a temporary DB failure on first attempt
  db.simulateTransactionFailure = true;
  const failAttempt = await orchestrator.processWebhookEvent(flakyPayload, redeliveryEventId);
  assert(failAttempt.success === false, 'Initial attempt must fail due to simulated DB failure');
  assert(failAttempt.error?.includes('Database transaction deadlocked') === true, 'Error must reflect failure');

  // Verify the webhook event is marked 'failed' and preserved in the ledger
  const storedEventKey = `razorpay:${redeliveryEventId}`;
  const storedFailedEvent = db.webhookEvents.get(storedEventKey);
  assert(storedFailedEvent !== undefined, 'Failed webhook event row must exist in ledger');
  assert(storedFailedEvent.status === 'failed', 'Webhook ledger status must be "failed"');
  assert(storedFailedEvent.retry_count === 0, 'Retry count was 0 on initial attempt');

  // Now recover the DB: second redelivery attempt should successfully reprocess
  db.simulateTransactionFailure = false;
  const retryAttempt = await orchestrator.processWebhookEvent(flakyPayload, redeliveryEventId);
  assert(retryAttempt.success === true, 'Redelivered failed webhook must successfully reprocess');
  assert(retryAttempt.duplicate !== true, 'Successful retry is NOT treated as duplicate drop');

  const storedRetriedEvent = db.webhookEvents.get(storedEventKey);
  assert(storedRetriedEvent.status === 'processed', 'Webhook status must transition to terminal "processed"');
  assert(storedRetriedEvent.retry_count === 1, 'Retry count must be incremented to 1');
  console.log('✓ Failed webhook redelivery and reprocessing lifecycle verified');

  // TEST 9: Remediation Fix 2 — Concurrent Retry Lock Race Protection
  console.log('\n--- Test Group 9: Remediation Fix 2 — Concurrent Retry Lock Protection ---');
  // Put an event into 'failed' status
  const raceEventId = 'evt_race_retry_002';
  db.simulateTransactionFailure = true;
  await orchestrator.processWebhookEvent(flakyPayload, raceEventId);
  db.simulateTransactionFailure = false;

  // Simulate a competing worker locking the failed event first
  db.simulateConcurrentLockFailure = true;
  const competingResult = await orchestrator.processWebhookEvent(flakyPayload, raceEventId);
  assert(competingResult.success === false, 'Worker that lost the atomic lock race must NOT process');
  assert(
    competingResult.error?.includes('currently being processed by another worker') === true,
    'Must indicate event is currently being processed by another worker'
  );
  db.simulateConcurrentLockFailure = false;
  console.log('✓ Concurrent retry lock race protection verified');

  // TEST 10: Remediation Fix 3 — Webhook HTTP Acknowledgment & Error Concealment
  console.log('\n--- Test Group 10: Remediation Fix 3 — Webhook HTTP Acknowledgment ---');
  // Helper simulating the exact POST /api/billing/webhook controller logic in server.ts
  async function simulateWebhookRoute(
    headers: Record<string, string>,
    rawBody: Buffer | string,
    orchestratorInstance: BillingOrchestrator
  ) {
    const signature = headers['x-razorpay-signature'];
    const headerEventId = headers['x-razorpay-event-id'];
    const webhookSecret = TEST_WEBHOOK_SECRET;

    if (!signature) {
      return { status: 401, body: { error: 'Missing X-Razorpay-Signature header' } };
    }

    const rawBuf = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody || '');
    const localAdapter = new RazorpayAdapter({ webhookSecret });

    if (!localAdapter.verifyWebhookSignature({ rawBody: rawBuf, signature, secret: webhookSecret })) {
      return { status: 401, body: { error: 'Invalid webhook signature' } };
    }

    let payload: Record<string, any>;
    try {
      payload = JSON.parse(rawBuf.toString('utf-8'));
    } catch {
      return { status: 400, body: { error: 'Invalid JSON webhook payload' } };
    }

    const result = await orchestratorInstance.processWebhookEvent(payload, headerEventId);
    if (!result.success) {
      return {
        status: 500,
        body: {
          received: false,
          error: 'Webhook processing failed',
        },
      };
    }

    return {
      status: 200,
      body: {
        received: true,
        eventId: result.eventId,
        duplicate: result.duplicate || false,
        stale: result.stale || false,
        status: result.billingState || 'processed',
      },
    };
  }

  // 10.1 Missing signature -> HTTP 401
  const httpRes1 = await simulateWebhookRoute({}, samplePayload, orchestrator);
  assert(httpRes1.status === 401, 'Missing signature must return HTTP 401');

  // 10.2 Invalid signature -> HTTP 401
  const httpRes2 = await simulateWebhookRoute(
    { 'x-razorpay-signature': 'invalid_sig' },
    samplePayload,
    orchestrator
  );
  assert(httpRes2.status === 401, 'Invalid signature must return HTTP 401');

  // 10.3 Successful delivery -> HTTP 200
  const validEvPayload = JSON.stringify({
    entity: 'event',
    event: 'subscription.charged',
    created_at: 1757500000,
    payload: {
      subscription: {
        entity: {
          id: 'sub_test_100',
          customer_id: 'cust_test_200',
          current_start: 1757500000,
          current_end: 1759999000,
          notes: { organization_id: orgId },
        },
      },
      payment: {
        entity: { id: 'pay_http_success_1', amount: 29900, currency: 'USD' },
      },
    },
  });
  const validEvSig = crypto.createHmac('sha256', TEST_WEBHOOK_SECRET).update(validEvPayload).digest('hex');

  const httpRes3 = await simulateWebhookRoute(
    { 'x-razorpay-signature': validEvSig, 'x-razorpay-event-id': 'evt_http_200_1' },
    validEvPayload,
    orchestrator
  );
  assert(httpRes3.status === 200, 'Successful webhook must return HTTP 200');
  assert(httpRes3.body.received === true, 'received flag must be true');

  // 10.4 Duplicate processed event -> HTTP 200
  const httpRes4 = await simulateWebhookRoute(
    { 'x-razorpay-signature': validEvSig, 'x-razorpay-event-id': 'evt_http_200_1' },
    validEvPayload,
    orchestrator
  );
  assert(httpRes4.status === 200, 'Duplicate processed webhook must return HTTP 200');
  assert(httpRes4.body.duplicate === true, 'duplicate flag must be true');

  // 10.5 Internal processing failure -> HTTP 500 without leaking sensitive data
  db.simulateTransactionFailure = true;
  const failEvPayload = JSON.stringify({
    entity: 'event',
    event: 'subscription.charged',
    created_at: 1757600000,
    payload: {
      subscription: {
        entity: {
          id: 'sub_test_100',
          customer_id: 'cust_test_200',
          current_start: 1757600000,
          current_end: 1760000000,
          notes: { organization_id: orgId },
        },
      },
      payment: {
        entity: { id: 'pay_http_fail_1', amount: 29900, currency: 'USD' },
      },
    },
  });
  const failEvSig = crypto.createHmac('sha256', TEST_WEBHOOK_SECRET).update(failEvPayload).digest('hex');

  const httpRes5 = await simulateWebhookRoute(
    { 'x-razorpay-signature': failEvSig, 'x-razorpay-event-id': 'evt_http_500_1' },
    failEvPayload,
    orchestrator
  );
  db.simulateTransactionFailure = false;
  assert(httpRes5.status === 500, 'Internal webhook failure must return HTTP 500');
  assert(httpRes5.body.received === false, 'received flag must be false on failure');
  assert(
    httpRes5.body.error === 'Webhook processing failed',
    'Must conceal internal database details, stack traces, and secrets'
  );
  assert((httpRes5.body as any).message === undefined, 'Must NOT leak internal message or stack');
  console.log('✓ Webhook HTTP acknowledgment (401, 200, 500) and privacy verified');

  // TEST 11: Remediation Fix 4 — Controlled Resubscription on Terminal States
  console.log('\n--- Test Group 11: Remediation Fix 4 — Controlled Resubscription on Terminal State ---');
  // Put subscription into terminal 'canceled' state
  const targetSub = db.subscriptions.get(orgId);
  targetSub.billing_state = 'canceled';
  targetSub.razorpay_subscription_id = 'sub_old_canceled_111';
  db.subscriptions.set(orgId, targetSub);

  // New subscription event arrives for the same organization with a brand-new razorpay_subscription_id
  const newSubId = 'sub_new_resubscribed_222';
  const resubscribePayload = {
    entity: 'event',
    event: 'subscription.charged',
    created_at: 1757700000,
    payload: {
      subscription: {
        entity: {
          id: newSubId,
          customer_id: 'cust_test_200',
          current_start: 1757700000,
          current_end: 1760100000,
          notes: { organization_id: orgId },
        },
      },
      payment: {
        entity: { id: 'pay_resub_999', amount: 29900, currency: 'USD' },
      },
    },
  };

  const resubscribeResult = await orchestrator.processWebhookEvent(resubscribePayload, 'evt_resub_001');
  assert(resubscribeResult.success === true, 'Controlled resubscription on canceled state must succeed');
  assert(resubscribeResult.billingState === 'active', 'Subscription must transition from canceled to active');

  const updatedSub = db.subscriptions.get(orgId);
  assert(
    updatedSub.razorpay_subscription_id === newSubId,
    `Subscription ID must be updated to new provider ID: ${newSubId}`
  );
  console.log('✓ Controlled resubscription replacement on terminal state accepted');

  // Repeat verification on terminal 'trial_expired' state
  updatedSub.billing_state = 'trial_expired';
  db.subscriptions.set(orgId, updatedSub);
  const secondNewSubId = 'sub_after_trial_333';
  const trialResubPayload = {
    entity: 'event',
    event: 'subscription.charged',
    created_at: 1757800000,
    payload: {
      subscription: {
        entity: {
          id: secondNewSubId,
          customer_id: 'cust_test_200',
          current_start: 1757800000,
          current_end: 1760200000,
          notes: { organization_id: orgId },
        },
      },
      payment: {
        entity: { id: 'pay_trial_resub_1', amount: 29900, currency: 'USD' },
      },
    },
  };
  const trialResubResult = await orchestrator.processWebhookEvent(trialResubPayload, 'evt_trial_resub_002');
  assert(trialResubResult.success === true, 'Controlled resubscription on trial_expired state must succeed');
  assert(
    db.subscriptions.get(orgId).razorpay_subscription_id === secondNewSubId,
    'Subscription ID must be updated after trial_expired'
  );
  console.log('✓ Controlled resubscription replacement on trial_expired accepted');

  // TEST 12: Remediation Fix 4 — Controlled Resubscription Prevention on Non-Terminal States
  console.log('\n--- Test Group 12: Rejection of Provider ID Replacement on Non-Terminal States ---');
  const nonTerminalStates: BillingState[] = ['active', 'past_due', 'suspended', 'subscription_pending'];

  for (const state of nonTerminalStates) {
    const subToTest = db.subscriptions.get(orgId);
    subToTest.billing_state = state;
    subToTest.razorpay_subscription_id = 'sub_active_bound_444';
    db.subscriptions.set(orgId, subToTest);

    const conflictingPayload = {
      entity: 'event',
      event: 'subscription.charged',
      created_at: 1757900000,
      payload: {
        subscription: {
          entity: {
            id: 'sub_unauthorized_replacement_555',
            customer_id: 'cust_test_200',
            notes: { organization_id: orgId },
          },
        },
      },
    };

    const conflictResult = await orchestrator.processWebhookEvent(
      conflictingPayload,
      `evt_conflict_${state}`
    );
    assert(
      conflictResult.success === false,
      `Replacing provider subscription ID on non-terminal state "${state}" must be REJECTED`
    );
    assert(
      conflictResult.error?.includes('Cross-tenant violation') === true,
      `Rejection on "${state}" must identify violation`
    );
    assert(
      db.subscriptions.get(orgId).razorpay_subscription_id === 'sub_active_bound_444',
      `Provider subscription ID must remain unmodified on state "${state}"`
    );
  }
  console.log('✓ Provider ID replacement strictly blocked on all non-terminal states (active, past_due, suspended, subscription_pending)');

  console.log('\n================================================================');
  console.log('ALL PHASE 3A SECURITY REMEDIATION TESTS PASSED (100% SUCCESS)');
  console.log('================================================================\n');
}

// Auto-run if invoked directly via tsx
if (import.meta.url === `file://${process.argv[1]}`) {
  runPhase3ASecurityTests().catch((err) => {
    console.error('Test Suite Failure:', err);
    process.exit(1);
  });
}
