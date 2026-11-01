/**
 * DispatcherDesk P0-6 Client Forensic Verification Suite: Stable Checkout Idempotency Key
 * File: src/modules/billing/billing_phase3_p0_6_client_idempotency.test.ts
 *
 * Verifies all Client-Side Financial Safety Invariants:
 * TEST 1: Storage key format strictly matches dispatcherdesk_checkout_idempotency_${org}_${plan}.
 * TEST 2: First checkout attempt generates a UUID and stores it.
 * TEST 3: Subsequent checkout attempts for the SAME org + SAME plan reuse the exact same key.
 * TEST 4: Scoping isolation: Different plan for same org gets a distinct key.
 * TEST 5: Tenant isolation: Different org for same plan gets a distinct key.
 * TEST 6: Retryable error discrimination: 409 Conflict, 504 Timeout, Network failures are NOT marked definitive.
 * TEST 7: Definitive failure discrimination: 400 Active Sub, 401/403 Unauthorized ARE marked definitive.
 * TEST 8: Definitive success clearing: clearCheckoutIdempotencyKey rotates key for subsequent checkout.
 * TEST 9: Cancellation cleanup: clearAllCheckoutIdempotencyKeysForOrg clears all tenant keys.
 * TEST 10: In-memory fallback functions correctly when sessionStorage is unavailable or throws.
 */

import assert from 'node:assert';
import {
  getCheckoutIdempotencyStorageKey,
  getOrCreateCheckoutIdempotencyKey,
  clearCheckoutIdempotencyKey,
  clearAllCheckoutIdempotencyKeysForOrg,
  isDefinitiveCheckoutFailure,
} from './razorpayCheckout.ts';

console.log('================================================================');
console.log('DISPATCHERDESK P0-6 — CLIENT IDEMPOTENCY KEY FORENSIC TEST SUITE');
console.log('================================================================');

// Mock sessionStorage in Node.js global environment
const mockSessionStore = new Map<string, string>();
(globalThis as any).window = {
  sessionStorage: {
    getItem(k: string) {
      return mockSessionStore.get(k) || null;
    },
    setItem(k: string, v: string) {
      mockSessionStore.set(k, String(v));
    },
    removeItem(k: string) {
      mockSessionStore.delete(k);
    },
    clear() {
      mockSessionStore.clear();
    },
    get length() {
      return mockSessionStore.size;
    },
    key(index: number) {
      return Array.from(mockSessionStore.keys())[index] || null;
    },
  },
};

async function runTests() {
  mockSessionStore.clear();

  // --- TEST 1: Storage key format ---
  console.log('--- TEST 1: Storage key format matches specification ---');
  const orgA = 'org-client-123';
  const planA = 'starter_fleet' as any;
  const storageKey = getCheckoutIdempotencyStorageKey(orgA, planA);
  assert.strictEqual(
    storageKey,
    'dispatcherdesk_checkout_idempotency_org-client-123_starter_fleet',
    'Storage key must match canonical format'
  );
  console.log('✓ PASS: Canonical storage key format verified.');

  // --- TEST 2 & 3: Generation & Stability on same (org, plan) ---
  console.log('--- TEST 2 & 3: Key generated on first attempt and reused across rapid retries/re-renders ---');
  const key1 = getOrCreateCheckoutIdempotencyKey(orgA, planA);
  assert.ok(key1 && typeof key1 === 'string' && key1.length > 8, 'Key must be a valid non-empty string');
  assert.strictEqual(
    mockSessionStore.get(storageKey),
    key1,
    'Key must be saved into sessionStorage'
  );

  // Subsequent call simulating re-render, double click, or retry
  const key2 = getOrCreateCheckoutIdempotencyKey(orgA, planA);
  assert.strictEqual(key2, key1, 'Subsequent checkout attempt MUST return identical key');
  console.log('✓ PASS: Single stable key preserved across checkout calls.');

  // --- TEST 4: Plan Scoping Isolation ---
  console.log('--- TEST 4: Plan scoping isolation ---');
  const planB = 'growth_agency' as any;
  const keyPlanB = getOrCreateCheckoutIdempotencyKey(orgA, planB);
  assert.notStrictEqual(keyPlanB, key1, 'Different plan must receive a different idempotency key');
  console.log('✓ PASS: Different plan generated distinct key.');

  // --- TEST 5: Tenant Scoping Isolation ---
  console.log('--- TEST 5: Tenant scoping isolation ---');
  const orgB = 'org-client-456';
  const keyOrgB = getOrCreateCheckoutIdempotencyKey(orgB, planA);
  assert.notStrictEqual(keyOrgB, key1, 'Different organization must receive a different idempotency key');
  console.log('✓ PASS: Different tenant generated distinct key.');

  // --- TEST 6: Retryable error discrimination ---
  console.log('--- TEST 6: In-flight / retryable errors do NOT clear key ---');
  const retryableErrors = [
    'Subscription creation is pending verification. Retrying creation is blocked to prevent duplicate billing.',
    'A subscription request with this idempotency key is currently processing.',
    'Billing service is initializing. Please wait a moment and try again. (HTTP 504)',
    'Subscription creation request timed out or encountered an upstream transport error. Payment verification is pending; do not retry immediately.',
    'Failed to fetch',
    'NetworkError when attempting to fetch resource',
    'ECONNRESET upstream failure',
    'Service Unavailable (HTTP 503)',
  ];

  for (const err of retryableErrors) {
    const isDefinitive = isDefinitiveCheckoutFailure(err);
    assert.strictEqual(isDefinitive, false, `Error "${err}" must NOT be classified as definitive failure`);
  }
  console.log('✓ PASS: All 409, 504, transport, and pending verification errors retain idempotency key.');

  // --- TEST 7: Definitive failure discrimination ---
  console.log('--- TEST 7: Definitive rejections DO clear key ---');
  const definitiveErrors = [
    'Cannot create new subscription while an active subscription exists. Direct plan upgrades and downgrades are currently not supported via new subscription creation to prevent duplicate billing.',
    'Cannot create new subscription while in state "past_due". Please settle past due invoices or retry payment.',
    'Invalid subscription plan: non_existent_plan',
    'Missing required fields: plan, organizationId',
    'Unauthorized: Authentication required',
    'Forbidden: Insufficient permissions to manage billing subscriptions',
  ];

  for (const err of definitiveErrors) {
    const isDefinitive = isDefinitiveCheckoutFailure(err);
    assert.strictEqual(isDefinitive, true, `Error "${err}" MUST be classified as definitive failure`);
  }
  console.log('✓ PASS: All definitive 400/401/403 business rejections correctly classified.');

  // --- TEST 8: Definitive clearance and key rotation ---
  console.log('--- TEST 8: Key cleared on definitive completion, allowing fresh subsequent attempt ---');
  clearCheckoutIdempotencyKey(orgA, planA);
  assert.strictEqual(mockSessionStore.get(storageKey), undefined, 'Key must be removed from sessionStorage');

  const keyFresh = getOrCreateCheckoutIdempotencyKey(orgA, planA);
  assert.notStrictEqual(keyFresh, key1, 'After clearance, fresh attempt must receive a new key');
  console.log('✓ PASS: Definitive clearance rotates key cleanly.');

  // --- TEST 9: Tenant-wide cancellation cleanup ---
  console.log('--- TEST 9: Tenant-wide cancellation cleanup ---');
  getOrCreateCheckoutIdempotencyKey(orgA, 'starter' as any);
  getOrCreateCheckoutIdempotencyKey(orgA, 'growth' as any);
  clearAllCheckoutIdempotencyKeysForOrg(orgA);

  assert.strictEqual(
    mockSessionStore.has(getCheckoutIdempotencyStorageKey(orgA, 'starter' as any)),
    false
  );
  assert.strictEqual(
    mockSessionStore.has(getCheckoutIdempotencyStorageKey(orgA, 'growth' as any)),
    false
  );
  console.log('✓ PASS: Tenant cancellation removes all tenant idempotency reservations.');

  // --- TEST 10: In-memory fallback without sessionStorage ---
  console.log('--- TEST 10: In-memory fallback when sessionStorage is restricted ---');
  const originalWindow = (globalThis as any).window;
  (globalThis as any).window = undefined; // simulate disabled/unavailable window/sessionStorage

  const memOrg = 'org-mem-test';
  const memPlan = 'starter_fleet' as any;
  const memKey1 = getOrCreateCheckoutIdempotencyKey(memOrg, memPlan);
  const memKey2 = getOrCreateCheckoutIdempotencyKey(memOrg, memPlan);
  assert.strictEqual(memKey1, memKey2, 'In-memory fallback must provide identical stable key');

  clearCheckoutIdempotencyKey(memOrg, memPlan);
  const memKey3 = getOrCreateCheckoutIdempotencyKey(memOrg, memPlan);
  assert.notStrictEqual(memKey1, memKey3, 'In-memory fallback clears correctly');

  (globalThis as any).window = originalWindow;
  console.log('✓ PASS: In-memory store safely protects non-browser/restricted environments.');

  console.log('================================================================');
  console.log('ALL 10 CLIENT IDEMPOTENCY SAFETY TESTS PASSED (100% SUCCESS)');
  console.log('================================================================');
}

runTests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
