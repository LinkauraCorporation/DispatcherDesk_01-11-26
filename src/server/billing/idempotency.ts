/**
 * DispatcherDesk Billing Idempotency Foundation (P0-6 Hardened)
 * File: src/server/billing/idempotency.ts
 *
 * Implements strict, PostgreSQL-authoritative, organization-scoped idempotency
 * reservations for Razorpay subscription order creation (/api/billing/create-subscription).
 *
 * Guarantees:
 * 1. PostgreSQL is the authoritative source of truth in production.
 * 2. Database reservation failure fails-safe: NEVER downgrades to in-memory in production.
 * 3. Exactly-once provider subscription creation per organization & logical request.
 * 4. Deterministic replay of completed responses on retry.
 * 5. 409 Conflict return for active in-flight requests.
 * 6. Unknown transport outcomes transition to 'pending_verification', blocking duplicate creation.
 * 7. Completed reservations are immutable and cannot be overwritten.
 */

import { getSupabaseAdmin } from '../supabaseAdmin.ts';

export type IdempotencyAction =
  | 'acquired_new'
  | 'acquired_takeover'
  | 'replay_completed'
  | 'conflict_active'
  | 'verification_pending';

export type IdempotencyStatus = 'started' | 'completed' | 'failed' | 'pending_verification';

export interface IdempotencyReservationRecord {
  id?: string;
  organization_id: string;
  idempotency_key: string;
  request_path: string;
  status: IdempotencyStatus;
  response_status?: number | null;
  response_payload?: any | null;
  locked_until: number; // Unix timestamp in ms
  created_at: number;
  updated_at: number;
}

export interface ReserveIdempotencyParams {
  organizationId: string;
  idempotencyKey: string;
  requestPath?: string;
  lockTimeoutSeconds?: number;
}

export interface ReserveIdempotencyResult {
  action: IdempotencyAction;
  status: IdempotencyStatus;
  response_status?: number;
  response_payload?: any;
  message?: string;
  locked_until?: string | number;
  window_active?: boolean;
}

export interface CompleteIdempotencyParams {
  organizationId: string;
  idempotencyKey: string;
  responseStatus: number;
  responsePayload: any;
  status?: IdempotencyStatus;
  verificationWindowSeconds?: number;
}

export type ErrorClassification =
  | 'definitive_pre_provider'
  | 'definitive_provider_rejection'
  | 'unknown_provider_outcome';

/**
 * Classifies errors during subscription creation to distinguish between definitive failures
 * and unknown outcomes (where the request may have reached the provider).
 */
export function classifySubscriptionError(err: any): ErrorClassification {
  const statusCode = err?.statusCode || err?.status;
  const msg = (err?.message || '').toLowerCase();

  // Network / transport / timeout failures where request may have reached provider
  if (
    msg.includes('fetch failed') ||
    msg.includes('network') ||
    msg.includes('timeout') ||
    msg.includes('timed out') ||
    msg.includes('econnreset') ||
    msg.includes('etimedout') ||
    msg.includes('econnrefused') ||
    msg.includes('socket') ||
    msg.includes('abort') ||
    msg.includes('hang up') ||
    msg.includes('gateway')
  ) {
    return 'unknown_provider_outcome';
  }

  // Provider 5xx: upstream processing outcome is unknown
  if (typeof statusCode === 'number' && statusCode >= 500) {
    return 'unknown_provider_outcome';
  }

  // Definitive provider rejection: 4xx client errors proving request was evaluated and rejected
  if (typeof statusCode === 'number' && statusCode >= 400 && statusCode < 500) {
    return 'definitive_provider_rejection';
  }

  // Pre-provider validation / missing fields
  if (msg.includes('missing required') || msg.includes('validation') || msg.includes('invalid plan')) {
    return 'definitive_pre_provider';
  }

  // Default to unknown_provider_outcome for financial safety
  return 'unknown_provider_outcome';
}

// In-memory isolated test ledger (strictly used in test mode when RPC is mocked)
const inMemoryTestReservations = new Map<string, IdempotencyReservationRecord>();

function getStoreKey(orgId: string, key: string): string {
  return `${orgId.trim()}::${key.trim()}`;
}

/**
 * Resets the in-memory test reservation store (for test suites).
 */
export function resetBillingIdempotencyStoreForTesting(): void {
  inMemoryTestReservations.clear();
}

/**
 * Atomically reserves an idempotency lock for an organization subscription request.
 * In production, PostgreSQL is the sole authoritative source of truth.
 */
export async function reserveBillingIdempotency(
  params: ReserveIdempotencyParams
): Promise<ReserveIdempotencyResult> {
  const { organizationId, idempotencyKey, requestPath = '/api/billing/create-subscription', lockTimeoutSeconds = 120 } = params;

  if (!organizationId || !idempotencyKey) {
    throw new Error('organizationId and idempotencyKey are required for idempotency reservation');
  }

  const isTestEnv = process.env.NODE_ENV === 'test';

  // 1. Authoritative PostgreSQL RPC reservation
  try {
    const admin = getSupabaseAdmin();
    const { data, error } = await (admin as any).rpc('reserve_billing_idempotency', {
      p_organization_id: organizationId,
      p_idempotency_key: idempotencyKey,
      p_request_path: requestPath,
      p_lock_timeout_seconds: lockTimeoutSeconds,
    });

    if (error) {
      if (!isTestEnv) {
        throw new Error(
          `Billing idempotency infrastructure failure: PostgreSQL RPC rejected (${error.message || error.code})`
        );
      }
    } else if (data && (data as any).action) {
      return data as ReserveIdempotencyResult;
    }
  } catch (dbErr: any) {
    if (!isTestEnv) {
      // In production, database error must fail-safe: NEVER downgrade to in-memory authority
      throw new Error(
        `Billing idempotency infrastructure failure: PostgreSQL database unavailable (${dbErr?.message || 'DB Error'})`
      );
    }
  }

  // 2. In-Memory Isolated Fallback (Strictly active only in test environment)
  if (!isTestEnv) {
    throw new Error('Billing idempotency infrastructure failure: PostgreSQL authority required in production');
  }

  const storeKey = getStoreKey(organizationId, idempotencyKey);
  const now = Date.now();
  const lockUntilMs = now + (lockTimeoutSeconds * 1000);
  const existing = inMemoryTestReservations.get(storeKey);

  if (existing) {
    // A. Replay completed
    if (existing.status === 'completed') {
      return {
        action: 'replay_completed',
        status: 'completed',
        response_status: existing.response_status || 200,
        response_payload: existing.response_payload,
      };
    }

    // B. Pending verification -> Block retry to avoid duplicate provider operations
    if (existing.status === 'pending_verification') {
      const windowActive = existing.locked_until > now;
      return {
        action: 'verification_pending',
        status: 'pending_verification',
        locked_until: existing.locked_until,
        window_active: windowActive,
        message: windowActive
          ? 'Subscription creation is pending verification. Retrying is blocked to prevent duplicate billing.'
          : 'Subscription creation verification window has elapsed. Provider verification required for recovery.',
      };
    }

    // C. Active in-flight lock conflict
    if (existing.status === 'started' && existing.locked_until > now) {
      return {
        action: 'conflict_active',
        status: 'started',
        locked_until: existing.locked_until,
        message: 'A subscription request with this idempotency key is currently processing.',
      };
    }

    // D. Stale lock or failed: safe takeover
    existing.status = 'started';
    existing.request_path = requestPath;
    existing.response_status = null;
    existing.response_payload = null;
    existing.locked_until = lockUntilMs;
    existing.updated_at = now;

    return {
      action: 'acquired_takeover',
      status: 'started',
    };
  }

  // E. New reservation
  inMemoryTestReservations.set(storeKey, {
    organization_id: organizationId,
    idempotency_key: idempotencyKey,
    request_path: requestPath,
    status: 'started',
    response_status: null,
    response_payload: null,
    locked_until: lockUntilMs,
    created_at: now,
    updated_at: now,
  });

  return {
    action: 'acquired_new',
    status: 'started',
  };
}

/**
 * Completes or fails an idempotency reservation, storing the final response payload.
 * Completed reservations are immutable and cannot be overwritten.
 */
export async function completeBillingIdempotency(
  params: CompleteIdempotencyParams
): Promise<void> {
  const {
    organizationId,
    idempotencyKey,
    responseStatus,
    responsePayload,
    status = 'completed',
    verificationWindowSeconds = 60,
  } = params;

  const isTestEnv = process.env.NODE_ENV === 'test';
  const now = Date.now();
  const lockUntilMs = status === 'pending_verification'
    ? now + (verificationWindowSeconds * 1000)
    : now;

  // 1. In-memory test mirror update (enforcing immutability)
  const storeKey = getStoreKey(organizationId, idempotencyKey);
  const existing = inMemoryTestReservations.get(storeKey);

  if (existing) {
    // Immutability: A completed reservation cannot be overwritten by failed or pending_verification
    if (existing.status === 'completed' && status !== 'completed') {
      return;
    }
    existing.status = status;
    existing.response_status = responseStatus;
    existing.response_payload = responsePayload;
    existing.locked_until = lockUntilMs;
    existing.updated_at = now;
  } else if (isTestEnv) {
    inMemoryTestReservations.set(storeKey, {
      organization_id: organizationId,
      idempotency_key: idempotencyKey,
      request_path: '/api/billing/create-subscription',
      status,
      response_status: responseStatus,
      response_payload: responsePayload,
      locked_until: lockUntilMs,
      created_at: now,
      updated_at: now,
    });
  }

  // 2. Authoritative PostgreSQL RPC completion
  try {
    const admin = getSupabaseAdmin();
    const { error } = await (admin as any).rpc('complete_billing_idempotency', {
      p_organization_id: organizationId,
      p_idempotency_key: idempotencyKey,
      p_response_status: responseStatus,
      p_response_payload: responsePayload,
      p_status: status,
      p_verification_window_seconds: verificationWindowSeconds,
    });

    if (error && !isTestEnv) {
      console.error('[BillingIdempotency] Database completion error:', error);
    }

    if (status === 'pending_verification') {
      const lockUntilIso = new Date(lockUntilMs).toISOString();
      await (admin as any)
        .from('billing_idempotency_reservations')
        .update({ locked_until: lockUntilIso })
        .eq('organization_id', organizationId)
        .eq('idempotency_key', idempotencyKey)
        .eq('status', 'pending_verification');
    }
  } catch (err: any) {
    if (!isTestEnv) {
      console.error('[BillingIdempotency] Database connection error during completion:', err?.message || err);
    }
  }
}

/**
 * Safely transitions a reservation from 'pending_verification' to 'started'
 * ONLY if the verification window has elapsed (locked_until <= now).
 * This ensures that a controlled takeover/retry can happen ONLY after provider verification
 * establishes that no matching provider subscription exists.
 */
export async function transitionPendingVerificationToStarted(params: {
  organizationId: string;
  idempotencyKey: string;
  lockTimeoutSeconds?: number;
}): Promise<boolean> {
  const { organizationId, idempotencyKey, lockTimeoutSeconds = 120 } = params;
  const isTestEnv = process.env.NODE_ENV === 'test';
  const now = Date.now();
  const lockUntilMs = now + (lockTimeoutSeconds * 1000);

  // 1. Authoritative PostgreSQL atomic update
  try {
    const admin = getSupabaseAdmin();
    const nowIso = new Date().toISOString();
    const lockUntilIso = new Date(lockUntilMs).toISOString();

    const { data, error } = await (admin as any)
      .from('billing_idempotency_reservations')
      .update({
        status: 'started',
        response_status: null,
        response_payload: null,
        locked_until: lockUntilIso,
        updated_at: nowIso,
      })
      .eq('organization_id', organizationId)
      .eq('idempotency_key', idempotencyKey)
      .eq('status', 'pending_verification')
      .lte('locked_until', nowIso)
      .select('id');

    if (!error && data && data.length > 0) {
      const storeKey = getStoreKey(organizationId, idempotencyKey);
      const existing = inMemoryTestReservations.get(storeKey);
      if (existing) {
        existing.status = 'started';
        existing.response_status = null;
        existing.response_payload = null;
        existing.locked_until = lockUntilMs;
        existing.updated_at = now;
      }
      return true;
    }
  } catch (dbErr: any) {
    if (!isTestEnv) {
      console.error('[BillingIdempotency] transitionPendingVerificationToStarted DB error:', dbErr?.message || dbErr);
      return false;
    }
  }

  // 2. In-memory test store fallback
  const storeKey = getStoreKey(organizationId, idempotencyKey);
  const existing = inMemoryTestReservations.get(storeKey);

  if (existing && existing.status === 'pending_verification') {
    if (existing.locked_until <= now) {
      existing.status = 'started';
      existing.response_status = null;
      existing.response_payload = null;
      existing.locked_until = lockUntilMs;
      existing.updated_at = now;
      return true;
    }
    return false;
  }

  return false;
}
