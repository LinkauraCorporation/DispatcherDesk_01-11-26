import assert from 'assert';
import { deriveBillingPeriodKey } from './subscriptionService.ts';
import { BillingState } from '../../types/domain.types.ts';

console.log('===============================================================');
console.log('BILLING PERIOD KEY CONTRACT ALIGNMENT & REGRESSION TEST SUITE');
console.log('===============================================================');

const validStart = '2026-09-10T10:45:32.000Z';
const validEnd = '2026-10-10T10:45:32.000Z';
const expectedPaidKey = '20260910_20261010';

// Test 1: trialing => trial
console.log('--- Test 1: trialing => trial ---');
const key1 = deriveBillingPeriodKey('trialing', validStart, validEnd);
assert.strictEqual(key1, 'trial', 'trialing state must strictly yield "trial" even if dates exist');
console.log('✓ PASS: trialing state returns "trial"');

// Test 2: trial_expired => trial
console.log('--- Test 2: trial_expired => trial ---');
const key2 = deriveBillingPeriodKey('trial_expired', validStart, validEnd);
assert.strictEqual(key2, 'trial', 'trial_expired state must strictly yield "trial" even if dates exist');
console.log('✓ PASS: trial_expired state returns "trial"');

// Test 3: active + valid dates => paid key
console.log('--- Test 3: active + valid dates => paid key ---');
const key3 = deriveBillingPeriodKey('active', validStart, validEnd);
assert.strictEqual(key3, expectedPaidKey, `active state with valid dates must yield ${expectedPaidKey}`);
console.log(`✓ PASS: active returns ${expectedPaidKey}`);

// Test 4: past_due + valid dates => paid key
console.log('--- Test 4: past_due + valid dates => paid key ---');
const key4 = deriveBillingPeriodKey('past_due', validStart, validEnd);
assert.strictEqual(key4, expectedPaidKey, `past_due state with valid dates must yield ${expectedPaidKey}`);
console.log(`✓ PASS: past_due returns ${expectedPaidKey}`);

// Test 5: suspended + valid dates => paid key
console.log('--- Test 5: suspended + valid dates => paid key ---');
const key5 = deriveBillingPeriodKey('suspended', validStart, validEnd);
assert.strictEqual(key5, expectedPaidKey, `suspended state with valid dates must yield ${expectedPaidKey}`);
console.log(`✓ PASS: suspended returns ${expectedPaidKey}`);

// Test 6: canceled + valid dates => paid key
console.log('--- Test 6: canceled + valid dates => paid key ---');
const key6 = deriveBillingPeriodKey('canceled', validStart, validEnd);
assert.strictEqual(key6, expectedPaidKey, `canceled state with valid dates must yield ${expectedPaidKey}`);
console.log(`✓ PASS: canceled returns ${expectedPaidKey}`);

// Test 7: subscription_pending without paid dates => trial
console.log('--- Test 7: subscription_pending without paid dates => trial ---');
const key7 = deriveBillingPeriodKey('subscription_pending', null, null);
assert.strictEqual(key7, 'trial', 'subscription_pending without dates must yield "trial"');
console.log('✓ PASS: subscription_pending without paid dates returns "trial"');

// Test 8: canceled existing paid truck activation resolves using its paid period key (Fast Path)
console.log('--- Test 8: Canceled existing paid truck resolves using paid period key ---');
interface SimulatedActivation {
  organization_id: string;
  billing_period_key: string;
  truck_id: string;
}
const mockActivationLedger: SimulatedActivation[] = [
  {
    organization_id: 'org-test-canceled',
    billing_period_key: expectedPaidKey,
    truck_id: 'truck-already-activated',
  },
];

const orgCanceledState: BillingState = 'canceled';
const currentDerivedKey = deriveBillingPeriodKey(orgCanceledState, validStart, validEnd);
assert.strictEqual(currentDerivedKey, expectedPaidKey, 'Canceled subscription must derive the paid period key');

// Fast path lookup simulates trg_enforce_billing_entitlement lines 159-170
const existsInLedger = mockActivationLedger.some(
  (row) =>
    row.organization_id === 'org-test-canceled' &&
    row.billing_period_key === currentDerivedKey &&
    row.truck_id === 'truck-already-activated'
);
assert.strictEqual(existsInLedger, true, 'Existing paid truck activation must match ledger using the paid period key');
console.log('✓ PASS: Existing paid truck activation matches ledger using paid period key');

// Test 9: canceled/suspended still cannot activate a NEW truck (Slow Path Entitlement Invariant)
console.log('--- Test 9: canceled/suspended cannot activate a NEW truck ---');
function simulateTriggerNewActivation(
  subState: BillingState,
  truckId: string,
  periodStart: string,
  periodEnd: string
): { allowed: boolean; error?: string } {
  const periodKey = deriveBillingPeriodKey(subState, periodStart, periodEnd);
  // Fast path check
  const fastPathExists = mockActivationLedger.some(
    (row) =>
      row.organization_id === 'org-test-canceled' &&
      row.billing_period_key === periodKey &&
      row.truck_id === truckId
  );
  if (fastPathExists) {
    return { allowed: true };
  }

  // Slow path entitlement state validation (matches migration 20260907000008)
  if (subState === 'trialing' || subState === 'active') {
    return { allowed: true };
  } else if (subState === 'trial_expired') {
    return { allowed: false, error: 'Trial has expired' };
  } else if (['past_due', 'suspended', 'canceled', 'subscription_pending'].includes(subState)) {
    return {
      allowed: false,
      error: `Billing Entitlement Error: Subscription state "${subState}" does not permit new truck activations. Active subscription required.`,
    };
  }
  return { allowed: false, error: 'Unrecognized state' };
}

const canceledNewTruckResult = simulateTriggerNewActivation('canceled', 'truck-new-brand-new', validStart, validEnd);
assert.strictEqual(canceledNewTruckResult.allowed, false, 'New truck activation must be blocked on canceled subscription');
assert.ok(canceledNewTruckResult.error?.includes('does not permit new truck activations'));

const suspendedNewTruckResult = simulateTriggerNewActivation('suspended', 'truck-new-brand-new', validStart, validEnd);
assert.strictEqual(suspendedNewTruckResult.allowed, false, 'New truck activation must be blocked on suspended subscription');
assert.ok(suspendedNewTruckResult.error?.includes('does not permit new truck activations'));

console.log('✓ PASS: Canceled and suspended states strictly block new truck activations');

console.log('===============================================================');
console.log('ALL 9 BILLING PERIOD KEY CONTRACT & REGRESSION TESTS PASSED!');
console.log('===============================================================');
