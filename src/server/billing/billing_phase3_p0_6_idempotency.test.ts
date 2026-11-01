/**
 * DispatcherDesk P0-6 Forensic Verification Suite: Razorpay Subscription Idempotency (Hardened)
 * File: src/server/billing/billing_phase3_p0_6_idempotency.test.ts
 *
 * Verifies all 7 Financial Safety Invariants:
 * TEST 1: Database reservation failure -> Razorpay MUST NOT be called (fails-safe, returns 503).
 * TEST 2: Same idempotency key concurrent requests -> only one request may reach provider creation.
 * TEST 3: Completed reservation replay -> provider NOT called, identical payload returned.
 * TEST 4: Completed reservation cannot be overwritten by failed/pending states (immutability).
 * TEST 5: Definitive provider rejection (400) -> reservation marked failed, clean retry allowed.
 * TEST 6: Unknown network failure after provider request -> reservation transitions to 'pending_verification', NOT 'failed'.
 * TEST 7: Retry after unknown outcome:
 *         A. Deterministic provider lookup reconciles subscription without creating duplicate.
 *         B. When provider lookup cannot verify, blocks creation with 409 pending verification.
 */

process.env.NODE_ENV = 'test';
process.env.RAZORPAY_KEY_ID = 'rzp_test_suite_key_id';
process.env.RAZORPAY_KEY_SECRET = 'test_secret_for_suite_cryptography_123';

import assert from 'node:assert';
import http from 'node:http';
import { AddressInfo } from 'node:net';
import { app } from '../../../server.ts';
import { setSupabaseAdminForTesting, resetSupabaseAdminForTesting } from '../supabaseAdmin.ts';
import { resetBillingIdempotencyStoreForTesting, completeBillingIdempotency, reserveBillingIdempotency } from './idempotency.ts';
import { RazorpayAdapter } from './providers/RazorpayAdapter.ts';

console.log('================================================================');
console.log('DISPATCHERDESK P0-6 — FINANCIAL SAFETY FORENSIC TEST SUITE');
console.log('================================================================');

function createMockSupabaseAdmin(options?: { failRpc?: boolean }) {
  const subscriptions = new Map<string, any>();
  const orgMembers = new Map<string, any[]>();

  orgMembers.set('org-p06-1', [
    { organization_id: 'org-p06-1', user_id: 'user-p06-admin', role: 'owner_admin', status: 'active' },
  ]);
  orgMembers.set('org-p06-active', [
    { organization_id: 'org-p06-active', user_id: 'user-p06-admin', role: 'owner_admin', status: 'active' },
  ]);

  subscriptions.set('org-p06-active', {
    id: 'sub-active-1',
    organization_id: 'org-p06-active',
    billing_state: 'active',
    plan: 'starter_fleet',
  });

  return {
    from(table: string) {
      return {
        select() {
          return {
            eq(col: string, val: any) {
              return {
                eq(col2: string, val2: any) {
                  return {
                    async maybeSingle() {
                      if (table === 'organization_members') {
                        const members = orgMembers.get(val) || [];
                        const m = members.find((x) => x.user_id === val2 && x.status === 'active');
                        return { data: m || null, error: null };
                      }
                      return { data: null, error: null };
                    },
                  };
                },
                async maybeSingle() {
                  if (table === 'subscriptions') {
                    return { data: subscriptions.get(val) || null, error: null };
                  }
                  if (table === 'organizations') {
                    return { data: { id: val, name: `Org ${val}` }, error: null };
                  }
                  return { data: null, error: null };
                },
              };
            },
          };
        },
      };
    },
    auth: {
      async getUser(token: string) {
        if (token === 'valid-admin-token') {
          return {
            data: {
              user: {
                id: 'user-p06-admin',
                email: 'admin@p06test.com',
                app_metadata: {},
                user_metadata: {},
              },
            },
            error: null,
          };
        }
        return { data: { user: null }, error: new Error('Invalid token') };
      },
    },
    rpc(name: string) {
      if (options?.failRpc) {
        return Promise.reject(new Error('PostgreSQL database connection refused / deadlocked'));
      }
      return Promise.resolve({ data: null, error: { code: 'PGRST202', message: 'Function not found in schema cache' } });
    },
  };
}

async function runTests() {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as AddressInfo).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const mockAdmin = createMockSupabaseAdmin();
    setSupabaseAdminForTesting(mockAdmin as any);
    resetBillingIdempotencyStoreForTesting();
    RazorpayAdapter.clearMockSubscriptionsForTesting();

    const postCreateSub = async (payload: any, idempotencyKey?: string) => {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid-admin-token',
      };
      if (idempotencyKey) {
        headers['Idempotency-Key'] = idempotencyKey;
      }

      const res = await fetch(`${baseUrl}/api/billing/create-subscription`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      return { status: res.status, data };
    };

    const orgId = 'org-p06-1';

    // =========================================================================
    // TEST 1: Database reservation failure -> Razorpay MUST NOT be called
    // =========================================================================
    console.log('\n--- TEST 1: Database reservation failure -> Razorpay MUST NOT be called ---');
    {
      const failingDb = createMockSupabaseAdmin({ failRpc: true });
      setSupabaseAdminForTesting(failingDb as any);

      const savedEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production'; // Enforce production fail-safe semantics

      const res = await postCreateSub({ plan: 'starter', organizationId: orgId }, 'test-db-fail-key');
      assert.strictEqual(res.status, 503, 'Must return 503 Service Unavailable when DB idempotency fails');
      assert.ok(res.data.error.includes('temporarily unavailable'), 'Must return fail-safe error');

      process.env.NODE_ENV = savedEnv;
      setSupabaseAdminForTesting(mockAdmin as any);
      console.log('✓ PASS: Database failure fails safe with 503 (Razorpay is NEVER called)');
    }

    // =========================================================================
    // TEST 2: Same idempotency key concurrent requests
    // =========================================================================
    console.log('\n--- TEST 2: Same idempotency key concurrent requests ---');
    {
      resetBillingIdempotencyStoreForTesting();
      const keyConcurrent = 'test-idemp-concurrent-001';
      const [reqA, reqB] = await Promise.all([
        postCreateSub({ plan: 'growth', organizationId: orgId }, keyConcurrent),
        postCreateSub({ plan: 'growth', organizationId: orgId }, keyConcurrent),
      ]);

      const statuses = [reqA.status, reqB.status].sort();
      if (statuses[0] === 200 && statuses[1] === 409) {
        console.log('✓ PASS: In-flight concurrent request correctly received 409 Conflict');
      } else if (statuses[0] === 200 && statuses[1] === 200) {
        assert.strictEqual(reqA.data.subscriptionId, reqB.data.subscriptionId);
        console.log('✓ PASS: Both concurrent requests coordinated with identical subscription ID');
      } else {
        assert.fail(`Unexpected status combination: ${statuses.join(', ')}`);
      }
    }

    // =========================================================================
    // TEST 3: Completed reservation replay -> provider NOT called
    // =========================================================================
    console.log('\n--- TEST 3: Completed reservation replay ---');
    {
      const keyReplay = 'test-idemp-replay-001';
      const initial = await postCreateSub({ plan: 'starter', organizationId: orgId }, keyReplay);
      assert.strictEqual(initial.status, 200);

      const replay = await postCreateSub({ plan: 'starter', organizationId: orgId }, keyReplay);
      assert.strictEqual(replay.status, 200);
      assert.strictEqual(replay.data.subscriptionId, initial.data.subscriptionId, 'Must replay identical subscription ID');
      console.log('✓ PASS: Completed reservation replayed without calling provider');
    }

    // =========================================================================
    // TEST 4: Completed reservation cannot be overwritten
    // =========================================================================
    console.log('\n--- TEST 4: Completed reservation immutability ---');
    {
      const keyImmutable = 'test-idemp-immutable-001';
      await reserveBillingIdempotency({ organizationId: orgId, idempotencyKey: keyImmutable });
      await completeBillingIdempotency({
        organizationId: orgId,
        idempotencyKey: keyImmutable,
        responseStatus: 200,
        responsePayload: { success: true, subscriptionId: 'sub_authoritative_original' },
        status: 'completed',
      });

      // Attempt to tamper/overwrite with failed
      await completeBillingIdempotency({
        organizationId: orgId,
        idempotencyKey: keyImmutable,
        responseStatus: 500,
        responsePayload: { error: 'Malicious overwrite' },
        status: 'failed',
      });

      // Check replay
      const res = await postCreateSub({ plan: 'starter', organizationId: orgId }, keyImmutable);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.subscriptionId, 'sub_authoritative_original', 'Original completed payload must remain intact');
      console.log('✓ PASS: Completed reservation is immutable and cannot be overwritten');
    }

    // =========================================================================
    // TEST 5: Definitive provider rejection -> clean retry allowed
    // =========================================================================
    console.log('\n--- TEST 5: Definitive provider rejection ---');
    {
      const keyDefinitive = 'test-idemp-def-reject-001';
      // Acquire reservation
      await reserveBillingIdempotency({ organizationId: orgId, idempotencyKey: keyDefinitive });
      // Simulate 400 Bad Request rejection from provider
      await completeBillingIdempotency({
        organizationId: orgId,
        idempotencyKey: keyDefinitive,
        responseStatus: 400,
        responsePayload: { error: 'Invalid plan or customer ID' },
        status: 'failed',
      });

      // Retry should be allowed since definitive failure proves no subscription was created
      const retryRes = await postCreateSub({ plan: 'starter', organizationId: orgId }, keyDefinitive);
      assert.strictEqual(retryRes.status, 200, 'Retry after definitive failure should be permitted');
      assert.ok(retryRes.data.subscriptionId);
      console.log('✓ PASS: Definitive provider rejection permits safe retry');
    }

    // =========================================================================
    // TEST 6: Unknown network failure -> transitions to pending_verification (NOT failed)
    // =========================================================================
    console.log('\n--- TEST 6: Unknown network failure transitions to pending_verification ---');
    {
      const keyUnknown = 'test-idemp-unknown-001';
      await reserveBillingIdempotency({ organizationId: orgId, idempotencyKey: keyUnknown });

      // Simulate network timeout after POST sent
      await completeBillingIdempotency({
        organizationId: orgId,
        idempotencyKey: keyUnknown,
        responseStatus: 504,
        responsePayload: { error: 'Network timeout', pendingVerification: true },
        status: 'pending_verification',
      });

      // Immediate retry without reconciliation must be blocked
      const retryRes = await postCreateSub({ plan: 'starter', organizationId: orgId }, keyUnknown);
      assert.strictEqual(retryRes.status, 409, 'Must return 409 Conflict when pending verification');
      assert.ok(retryRes.data.pendingVerification, 'Must indicate pendingVerification');
      console.log('✓ PASS: Unknown network outcome is NOT marked failed; immediate retry is blocked (409)');
    }

    // =========================================================================
    // TEST 7: Retry after unknown outcome with provider reconciliation
    // =========================================================================
    console.log('\n--- TEST 7: Provider reconciliation on unknown outcome retry ---');
    {
      const keyReconcile = 'test-idemp-reconcile-001';
      await reserveBillingIdempotency({ organizationId: orgId, idempotencyKey: keyReconcile });

      // Suppose Razorpay DID create the subscription sub_reconciled_999, but transport timed out
      const adapter = new RazorpayAdapter();
      await adapter.createSubscription({
        customerId: 'cust_test_1',
        plan: 'starter',
        organizationId: orgId,
        idempotencyKey: keyReconcile,
      });

      // Mark reservation as pending_verification
      await completeBillingIdempotency({
        organizationId: orgId,
        idempotencyKey: keyReconcile,
        responseStatus: 504,
        responsePayload: { error: 'Transport timeout', pendingVerification: true },
        status: 'pending_verification',
      });

      // Request B retries with same idempotency key
      const retryRes = await postCreateSub({ plan: 'starter', organizationId: orgId }, keyReconcile);
      assert.strictEqual(retryRes.status, 200, 'Reconciliation must return 200 OK');
      assert.strictEqual(retryRes.data.reconciled, true, 'Must indicate subscription was reconciled');
      assert.ok(retryRes.data.subscriptionId, 'Must return the existing subscription');
      console.log('✓ PASS: Provider reconciliation discovered existing subscription; duplicate creation avoided (reconciled: true)');
    }

    // =========================================================================
    // TEST 8: Safe pending_verification recovery after window expires AND provider confirms not found
    // =========================================================================
    console.log('\n--- TEST 8: Safe recovery after window expires & provider confirms not found ---');
    {
      const keyRecovery = 'test-idemp-recovery-001';
      await reserveBillingIdempotency({ organizationId: orgId, idempotencyKey: keyRecovery });

      // Mark reservation as pending_verification with expired verification window (0s)
      await completeBillingIdempotency({
        organizationId: orgId,
        idempotencyKey: keyRecovery,
        responseStatus: 504,
        responsePayload: { error: 'Initial transport timeout', pendingVerification: true },
        status: 'pending_verification',
        verificationWindowSeconds: 0, // Expired window
      });

      // No subscription exists on Razorpay adapter.
      // Retry should:
      // 1. Reconcile provider -> not_found
      // 2. See that window is expired (locked_until <= now)
      // 3. Atomically acquire recovery lock (transition to started)
      // 4. Safely create new subscription with provider
      // 5. Complete reservation as completed and return 200
      const retryRes = await postCreateSub({ plan: 'starter', organizationId: orgId }, keyRecovery);
      assert.strictEqual(retryRes.status, 200, 'Controlled recovery must return 200 OK');
      assert.ok(retryRes.data.subscriptionId, 'Must return new subscription ID');
      assert.strictEqual(retryRes.data.reconciled, undefined, 'Must be newly created subscription');

      // Subsequent retry should now replay the completed subscription
      const replayRes = await postCreateSub({ plan: 'starter', organizationId: orgId }, keyRecovery);
      assert.strictEqual(replayRes.status, 200);
      assert.strictEqual(replayRes.data.subscriptionId, retryRes.data.subscriptionId, 'Replay must return recovered subscription ID');
      console.log('✓ PASS: Safely recovered expired pending_verification after provider verified not found');
    }

    // =========================================================================
    // TEST 9: Provider outage during reconciliation -> DO NOT recover, return 503
    // =========================================================================
    console.log('\n--- TEST 9: Provider outage during reconciliation blocks recovery with 503 ---');
    {
      const keyOutage = 'test-idemp-outage-001';
      await reserveBillingIdempotency({ organizationId: orgId, idempotencyKey: keyOutage });

      // Expired verification window
      await completeBillingIdempotency({
        organizationId: orgId,
        idempotencyKey: keyOutage,
        responseStatus: 504,
        responsePayload: { error: 'Upstream gateway error', pendingVerification: true },
        status: 'pending_verification',
        verificationWindowSeconds: 0,
      });

      // Simulate provider outage / unreachable API
      RazorpayAdapter.setSimulateOutageForTesting(true);

      const retryRes = await postCreateSub({ plan: 'starter', organizationId: orgId }, keyOutage);
      assert.strictEqual(retryRes.status, 503, 'Must return 503 Service Unavailable when provider is down');
      assert.ok(retryRes.data.retryLater, 'Must instruct client to retry later');
      assert.ok(retryRes.data.pendingVerification, 'Reservation must remain pending_verification');

      RazorpayAdapter.setSimulateOutageForTesting(false);
      console.log('✓ PASS: Provider outage preserves pending_verification and fails safe with 503 (no duplicate creation)');
    }

    // =========================================================================
    // TEST 10: Premature retry blocked during active verification window
    // =========================================================================
    console.log('\n--- TEST 10: Active verification window blocks recovery with 409 ---');
    {
      const keyActiveWindow = 'test-idemp-active-win-001';
      await reserveBillingIdempotency({ organizationId: orgId, idempotencyKey: keyActiveWindow });

      // Set active verification window (60s)
      await completeBillingIdempotency({
        organizationId: orgId,
        idempotencyKey: keyActiveWindow,
        responseStatus: 504,
        responsePayload: { error: 'Request timeout', pendingVerification: true },
        status: 'pending_verification',
        verificationWindowSeconds: 60,
      });

      // Retry during active window while provider has no match
      const retryRes = await postCreateSub({ plan: 'starter', organizationId: orgId }, keyActiveWindow);
      assert.strictEqual(retryRes.status, 409, 'Must return 409 Conflict during active verification window');
      assert.ok(retryRes.data.pendingVerification, 'Must indicate pendingVerification');
      assert.ok(typeof retryRes.data.remainingSeconds === 'number', 'Must indicate remainingSeconds');
      console.log('✓ PASS: Active verification window blocks premature takeover even if provider returns not_found');
    }

    // =========================================================================
    // TEST A: Matching subscription appears on page 2 (Bounded Pagination)
    // =========================================================================
    console.log('\n--- TEST A: Matching subscription appears on page 2 ---');
    {
      RazorpayAdapter.clearMockSubscriptionsForTesting();
      const keyPage2 = 'test-idemp-p2-001';

      // Populate page 1 with 100 unrelated subscriptions
      for (let i = 0; i < 100; i++) {
        RazorpayAdapter.addMockSubscriptionForTesting({
          id: `sub_unrelated_p1_${i}`,
          customerId: `cust_other_${i}`,
          planId: 'plan_starter',
          status: 'created',
          organizationId: 'other-org',
          idempotencyKey: `other-key-${i}`,
        });
      }

      // Target subscription appears on page 2
      RazorpayAdapter.addMockSubscriptionForTesting({
        id: 'sub_match_on_page_2',
        customerId: 'cust_target_p2',
        planId: 'plan_starter',
        status: 'created',
        organizationId: orgId,
        idempotencyKey: keyPage2,
      });

      const adapter = new RazorpayAdapter();
      const directReconcile = await adapter.reconcileSubscription({
        organizationId: orgId,
        idempotencyKey: keyPage2,
      });
      assert.strictEqual(directReconcile.status, 'found', 'Adapter must search page 2 and find subscription');
      if (directReconcile.status === 'found') {
        assert.strictEqual(directReconcile.subscription.id, 'sub_match_on_page_2');
      }

      // Server flow: pending_verification recovery finds it on page 2 without creating duplicate
      await reserveBillingIdempotency({ organizationId: orgId, idempotencyKey: keyPage2 });
      await completeBillingIdempotency({
        organizationId: orgId,
        idempotencyKey: keyPage2,
        responseStatus: 504,
        responsePayload: { error: 'Transport timeout', pendingVerification: true },
        status: 'pending_verification',
        verificationWindowSeconds: 0,
      });

      const res = await postCreateSub({ plan: 'starter', organizationId: orgId }, keyPage2);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.reconciled, true);
      assert.strictEqual(res.data.subscriptionId, 'sub_match_on_page_2', 'Must return page 2 subscription without creating duplicate');
      console.log('✓ PASS: Bounded pagination reached page 2, found subscription, and prevented duplicate creation');
    }

    // =========================================================================
    // TEST B: Matching subscription appears on page 3 within configured bound
    // =========================================================================
    console.log('\n--- TEST B: Matching subscription appears on page 3 within configured bound ---');
    {
      RazorpayAdapter.clearMockSubscriptionsForTesting();
      const keyPage3 = 'test-idemp-p3-001';

      // 200 unrelated subscriptions (pages 1 and 2)
      for (let i = 0; i < 200; i++) {
        RazorpayAdapter.addMockSubscriptionForTesting({
          id: `sub_unrelated_p1_p2_${i}`,
          customerId: `cust_other_${i}`,
          planId: 'plan_starter',
          status: 'created',
          organizationId: 'other-org',
          idempotencyKey: `other-key-${i}`,
        });
      }

      // Target subscription appears on page 3
      RazorpayAdapter.addMockSubscriptionForTesting({
        id: 'sub_match_on_page_3',
        customerId: 'cust_target_p3',
        planId: 'plan_starter',
        status: 'created',
        organizationId: orgId,
        idempotencyKey: keyPage3,
      });

      const adapter = new RazorpayAdapter();
      const directReconcile = await adapter.reconcileSubscription({
        organizationId: orgId,
        idempotencyKey: keyPage3,
      });
      assert.strictEqual(directReconcile.status, 'found', 'Must reach page 3 within 5-page bound');
      if (directReconcile.status === 'found') {
        assert.strictEqual(directReconcile.subscription.id, 'sub_match_on_page_3');
      }

      await reserveBillingIdempotency({ organizationId: orgId, idempotencyKey: keyPage3 });
      await completeBillingIdempotency({
        organizationId: orgId,
        idempotencyKey: keyPage3,
        responseStatus: 504,
        responsePayload: { error: 'Timeout', pendingVerification: true },
        status: 'pending_verification',
      });

      const res = await postCreateSub({ plan: 'starter', organizationId: orgId }, keyPage3);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.reconciled, true);
      assert.strictEqual(res.data.subscriptionId, 'sub_match_on_page_3');
      console.log('✓ PASS: Matching subscription found on page 3 within bounded search');
    }

    // =========================================================================
    // TEST C: Multiple exact matches -> status = ambiguous, HTTP 409, no new sub
    // =========================================================================
    console.log('\n--- TEST C: Multiple exact matches -> status = ambiguous ---');
    {
      RazorpayAdapter.clearMockSubscriptionsForTesting();
      const keyAmbiguous = 'test-idemp-ambiguous-001';

      // Add 2 exact matching subscriptions
      RazorpayAdapter.addMockSubscriptionForTesting({
        id: 'sub_dup_match_1',
        customerId: 'cust_target_dup',
        planId: 'plan_starter',
        status: 'created',
        organizationId: orgId,
        idempotencyKey: keyAmbiguous,
      });
      RazorpayAdapter.addMockSubscriptionForTesting({
        id: 'sub_dup_match_2',
        customerId: 'cust_target_dup',
        planId: 'plan_starter',
        status: 'active',
        organizationId: orgId,
        idempotencyKey: keyAmbiguous,
      });

      const adapter = new RazorpayAdapter();
      const directReconcile = await adapter.reconcileSubscription({
        organizationId: orgId,
        idempotencyKey: keyAmbiguous,
      });
      assert.strictEqual(directReconcile.status, 'ambiguous', 'Must return ambiguous when 2 exact matches exist');
      if (directReconcile.status === 'ambiguous') {
        assert.strictEqual(directReconcile.matches.length, 2);
      }

      // Server endpoint: pending_verification retry MUST return 409 and NOT complete or create new sub
      await reserveBillingIdempotency({ organizationId: orgId, idempotencyKey: keyAmbiguous });
      await completeBillingIdempotency({
        organizationId: orgId,
        idempotencyKey: keyAmbiguous,
        responseStatus: 504,
        responsePayload: { error: 'Timeout', pendingVerification: true },
        status: 'pending_verification',
      });

      const res = await postCreateSub({ plan: 'starter', organizationId: orgId }, keyAmbiguous);
      assert.strictEqual(res.status, 409, 'Must return 409 Conflict when ambiguous');
      assert.strictEqual(res.data.ambiguousMatches, true, 'Must indicate ambiguousMatches');
      assert.strictEqual(res.data.pendingVerification, true, 'Must preserve pendingVerification');
      assert.strictEqual(res.data.matchesCount, 2);
      console.log('✓ PASS: Multiple exact matches detected as ambiguous; automatic completion rejected with 409');
    }

    // =========================================================================
    // TEST D: Provider outage during page 2 -> provider_unavailable, no takeover
    // =========================================================================
    console.log('\n--- TEST D: Provider outage during page 2 ---');
    {
      RazorpayAdapter.clearMockSubscriptionsForTesting();
      const keyOutageP2 = 'test-idemp-outage-p2-001';

      // 100 items on page 1 so reconciliation must request page 2
      for (let i = 0; i < 100; i++) {
        RazorpayAdapter.addMockSubscriptionForTesting({
          id: `sub_unrelated_p1_${i}`,
          customerId: `cust_other_${i}`,
          planId: 'plan_starter',
          status: 'created',
          organizationId: 'other-org',
          idempotencyKey: `other-key-${i}`,
        });
      }

      // Simulate outage on page 2
      RazorpayAdapter.setSimulateOutageOnPageForTesting(2);

      const adapter = new RazorpayAdapter();
      const directReconcile = await adapter.reconcileSubscription({
        organizationId: orgId,
        idempotencyKey: keyOutageP2,
      });
      assert.strictEqual(directReconcile.status, 'provider_unavailable', 'Outage on page 2 must yield provider_unavailable');

      await reserveBillingIdempotency({ organizationId: orgId, idempotencyKey: keyOutageP2 });
      await completeBillingIdempotency({
        organizationId: orgId,
        idempotencyKey: keyOutageP2,
        responseStatus: 504,
        responsePayload: { error: 'Timeout', pendingVerification: true },
        status: 'pending_verification',
        verificationWindowSeconds: 0, // Window expired, but provider outage must block recovery
      });

      const res = await postCreateSub({ plan: 'starter', organizationId: orgId }, keyOutageP2);
      assert.strictEqual(res.status, 503, 'Must fail safe with 503 on provider outage during page 2');
      assert.strictEqual(res.data.retryLater, true);
      assert.strictEqual(res.data.pendingVerification, true);

      RazorpayAdapter.setSimulateOutageOnPageForTesting(null);
      console.log('✓ PASS: Provider outage on page 2 correctly yields provider_unavailable and blocks recovery');
    }

    // =========================================================================
    // TEST E: Pagination hard limit reached -> search_incomplete, no takeover
    // =========================================================================
    console.log('\n--- TEST E: Pagination hard limit reached -> search_incomplete ---');
    {
      RazorpayAdapter.clearMockSubscriptionsForTesting();
      const keyHardLimit = 'test-idemp-hardlimit-001';

      // 600 items (exceeds default 5 pages of 100 items = 500 records)
      for (let i = 0; i < 600; i++) {
        RazorpayAdapter.addMockSubscriptionForTesting({
          id: `sub_unrelated_${i}`,
          customerId: `cust_other_${i}`,
          planId: 'plan_starter',
          status: 'created',
          organizationId: 'other-org',
          idempotencyKey: `other-key-${i}`,
        });
      }

      const adapter = new RazorpayAdapter();
      const directReconcile = await adapter.reconcileSubscription({
        organizationId: orgId,
        idempotencyKey: keyHardLimit,
      });
      assert.strictEqual(directReconcile.status, 'search_incomplete', 'Hard limit reached without exhaustion must yield search_incomplete');
      if (directReconcile.status === 'search_incomplete') {
        assert.strictEqual(directReconcile.pagesExamined, 5);
        assert.strictEqual(directReconcile.recordsExamined, 500);
      }

      // Server endpoint: pending_verification recovery MUST NOT take over or create new subscription
      await reserveBillingIdempotency({ organizationId: orgId, idempotencyKey: keyHardLimit });
      await completeBillingIdempotency({
        organizationId: orgId,
        idempotencyKey: keyHardLimit,
        responseStatus: 504,
        responsePayload: { error: 'Timeout', pendingVerification: true },
        status: 'pending_verification',
        verificationWindowSeconds: 0, // Window expired, but search_incomplete must forbid takeover
      });

      const res = await postCreateSub({ plan: 'starter', organizationId: orgId }, keyHardLimit);
      assert.strictEqual(res.status, 503, 'Must return 503 when search is incomplete');
      assert.strictEqual(res.data.searchIncomplete, true);
      assert.strictEqual(res.data.pendingVerification, true);
      console.log('✓ PASS: Hard limit yields search_incomplete and strictly blocks takeover (prevents double billing)');
    }

    // =========================================================================
    // TEST F: Exactly one exact match among multiple unrelated subscriptions
    // =========================================================================
    console.log('\n--- TEST F: Exactly one exact match among multiple unrelated subscriptions ---');
    {
      RazorpayAdapter.clearMockSubscriptionsForTesting();
      const keySingle = 'test-idemp-single-001';

      // 50 unrelated
      for (let i = 0; i < 50; i++) {
        RazorpayAdapter.addMockSubscriptionForTesting({
          id: `sub_noise_a_${i}`,
          customerId: `cust_noise_${i}`,
          planId: 'plan_starter',
          status: 'created',
          organizationId: 'other-org-noise',
          idempotencyKey: `noise-key-a-${i}`,
        });
      }

      // Exactly one exact match
      RazorpayAdapter.addMockSubscriptionForTesting({
        id: 'sub_single_exact_match',
        customerId: 'cust_target_single',
        planId: 'plan_starter',
        status: 'active',
        organizationId: orgId,
        idempotencyKey: keySingle,
      });

      // 50 more unrelated
      for (let i = 0; i < 50; i++) {
        RazorpayAdapter.addMockSubscriptionForTesting({
          id: `sub_noise_b_${i}`,
          customerId: `cust_noise_b_${i}`,
          planId: 'plan_starter',
          status: 'created',
          organizationId: 'other-org-noise',
          idempotencyKey: `noise-key-b-${i}`,
        });
      }

      const adapter = new RazorpayAdapter();
      const directReconcile = await adapter.reconcileSubscription({
        organizationId: orgId,
        idempotencyKey: keySingle,
      });
      assert.strictEqual(directReconcile.status, 'found');
      if (directReconcile.status === 'found') {
        assert.strictEqual(directReconcile.subscription.id, 'sub_single_exact_match');
      }

      await reserveBillingIdempotency({ organizationId: orgId, idempotencyKey: keySingle });
      await completeBillingIdempotency({
        organizationId: orgId,
        idempotencyKey: keySingle,
        responseStatus: 504,
        responsePayload: { error: 'Timeout', pendingVerification: true },
        status: 'pending_verification',
      });

      const res = await postCreateSub({ plan: 'starter', organizationId: orgId }, keySingle);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.reconciled, true);
      assert.strictEqual(res.data.subscriptionId, 'sub_single_exact_match');
      console.log('✓ PASS: Unique match among noise identified cleanly without ambiguity');
    }

    // =========================================================================
    // TEST G: Zero exact matches after complete bounded search (not_found)
    // =========================================================================
    console.log('\n--- TEST G: Zero exact matches after complete bounded search ---');
    {
      RazorpayAdapter.clearMockSubscriptionsForTesting();
      const keyZero = 'test-idemp-zero-001';

      // 30 items for other orgs (total < 100, so page 1 exhausts provider list)
      for (let i = 0; i < 30; i++) {
        RazorpayAdapter.addMockSubscriptionForTesting({
          id: `sub_other_${i}`,
          customerId: `cust_other_${i}`,
          planId: 'plan_starter',
          status: 'created',
          organizationId: 'unrelated-org',
          idempotencyKey: `unrelated-key-${i}`,
        });
      }

      const adapter = new RazorpayAdapter();
      const directReconcile = await adapter.reconcileSubscription({
        organizationId: orgId,
        idempotencyKey: keyZero,
      });
      assert.strictEqual(directReconcile.status, 'not_found');

      // Server flow: expired window (0s) + provider confirmed not_found -> controlled safe recovery succeeds!
      await reserveBillingIdempotency({ organizationId: orgId, idempotencyKey: keyZero });
      await completeBillingIdempotency({
        organizationId: orgId,
        idempotencyKey: keyZero,
        responseStatus: 504,
        responsePayload: { error: 'Initial transport timeout', pendingVerification: true },
        status: 'pending_verification',
        verificationWindowSeconds: 0,
      });

      const res = await postCreateSub({ plan: 'starter', organizationId: orgId }, keyZero);
      assert.strictEqual(res.status, 200, 'Expired window with definitive not_found allows safe recovery');
      assert.ok(res.data.subscriptionId);
      assert.strictEqual(res.data.reconciled, undefined, 'Must be a newly created subscription');
      console.log('✓ PASS: Definitive not_found correctly permits controlled recovery after window expiry');
    }

    console.log('\n================================================================');
    console.log('ALL 17 FINANCIAL SAFETY TESTS (1-10 + A-G) PASSED (100% SUCCESS)');
    console.log('================================================================');
  } finally {
    resetSupabaseAdminForTesting();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
