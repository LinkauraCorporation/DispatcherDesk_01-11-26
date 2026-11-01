-- ====================================================================
-- DispatcherDesk Migration: Billing Idempotency Hardening (P0-6)
-- Version: 1.0.39
-- File: supabase/migrations/20261007000005_billing_idempotency_hardening.sql
-- Description:
-- 1. Updates public.billing_idempotency_reservations status CHECK constraint
--    to include 'pending_verification'.
-- 2. Secures public.reserve_billing_idempotency() and
--    public.complete_billing_idempotency() by revoking EXECUTE from
--    PUBLIC, anon, and authenticated, and granting EXECUTE strictly to service_role.
-- 3. Hardens reserve_billing_idempotency() to prevent immediate takeover
--    when a reservation is in 'pending_verification'.
-- 4. Hardens complete_billing_idempotency() so that completed reservations
--    cannot be overwritten (requires status IN ('started', 'pending_verification')).
-- 5. Drops legacy 5-parameter complete_billing_idempotency overload from 20261007000004.
--
-- ROLLBACK OPERATIONAL NOTE:
-- Rolling back this migration to 20261007000004 requires handling or transitioning
-- any existing rows with status = 'pending_verification' (e.g., to 'failed' or 'started')
-- prior to restoring the older status CHECK constraint (which only allows 'started', 'completed', 'failed').
-- ====================================================================

-- 1. Update status constraint to include 'pending_verification'
ALTER TABLE public.billing_idempotency_reservations
  DROP CONSTRAINT IF EXISTS billing_idempotency_reservations_status_check;

ALTER TABLE public.billing_idempotency_reservations
  ADD CONSTRAINT billing_idempotency_reservations_status_check
  CHECK (status IN ('started', 'completed', 'failed', 'pending_verification'));

-- 2. Hardened Atomic Reservation RPC
CREATE OR REPLACE FUNCTION public.reserve_billing_idempotency(
  p_organization_id UUID,
  p_idempotency_key TEXT,
  p_request_path TEXT DEFAULT '/api/billing/create-subscription',
  p_lock_timeout_seconds INTEGER DEFAULT 120
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rec public.billing_idempotency_reservations%ROWTYPE;
  v_now TIMESTAMPTZ := NOW();
  v_lock_until TIMESTAMPTZ;
BEGIN
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization_id is required for idempotency reservation';
  END IF;
  IF p_idempotency_key IS NULL OR TRIM(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'idempotency_key is required for idempotency reservation';
  END IF;

  v_lock_until := v_now + (COALESCE(p_lock_timeout_seconds, 120) || ' seconds')::INTERVAL;

  -- 1. Check existing reservation with row-level lock
  SELECT * INTO v_rec
  FROM public.billing_idempotency_reservations
  WHERE organization_id = p_organization_id
    AND idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF FOUND THEN
    -- A. Already completed -> Return cached response
    IF v_rec.status = 'completed' THEN
      RETURN jsonb_build_object(
        'action', 'replay_completed',
        'status', 'completed',
        'response_status', v_rec.response_status,
        'response_payload', v_rec.response_payload,
        'created_at', v_rec.created_at,
        'updated_at', v_rec.updated_at
      );
    END IF;

    -- B. Pending verification -> Block retry to avoid duplicate creation
    IF v_rec.status = 'pending_verification' THEN
      RETURN jsonb_build_object(
        'action', 'verification_pending',
        'status', 'pending_verification',
        'locked_until', v_rec.locked_until,
        'message', 'Subscription creation is pending verification. Retrying is blocked to prevent duplicate billing.'
      );
    END IF;

    -- C. Active in-flight request -> Deterministic conflict (409)
    IF v_rec.status = 'started' AND v_rec.locked_until > v_now THEN
      RETURN jsonb_build_object(
        'action', 'conflict_active',
        'status', 'started',
        'locked_until', v_rec.locked_until,
        'message', 'A subscription request with this idempotency key is currently processing.'
      );
    END IF;

    -- D. Stale lock or previously failed request -> Safe takeover
    UPDATE public.billing_idempotency_reservations
    SET status = 'started',
        request_path = p_request_path,
        response_status = NULL,
        response_payload = NULL,
        locked_until = v_lock_until,
        updated_at = v_now
    WHERE id = v_rec.id;

    RETURN jsonb_build_object(
      'action', 'acquired_takeover',
      'reservation_id', v_rec.id,
      'status', 'started'
    );
  END IF;

  -- 2. New reservation -> Insert row
  INSERT INTO public.billing_idempotency_reservations (
    organization_id,
    idempotency_key,
    request_path,
    status,
    locked_until,
    created_at,
    updated_at
  ) VALUES (
    p_organization_id,
    p_idempotency_key,
    p_request_path,
    'started',
    v_lock_until,
    v_now,
    v_now
  )
  RETURNING * INTO v_rec;

  RETURN jsonb_build_object(
    'action', 'acquired_new',
    'reservation_id', v_rec.id,
    'status', 'started'
  );

EXCEPTION
  WHEN unique_violation THEN
    -- Concurrent insert race condition caught by unique constraint
    SELECT * INTO v_rec
    FROM public.billing_idempotency_reservations
    WHERE organization_id = p_organization_id
      AND idempotency_key = p_idempotency_key;

    IF v_rec.status = 'completed' THEN
      RETURN jsonb_build_object(
        'action', 'replay_completed',
        'status', 'completed',
        'response_status', v_rec.response_status,
        'response_payload', v_rec.response_payload
      );
    ELSIF v_rec.status = 'pending_verification' THEN
      RETURN jsonb_build_object(
        'action', 'verification_pending',
        'status', 'pending_verification',
        'locked_until', v_rec.locked_until,
        'message', 'Subscription creation is pending verification. Retrying is blocked to prevent duplicate billing.'
      );
    ELSE
      RETURN jsonb_build_object(
        'action', 'conflict_active',
        'status', v_rec.status,
        'message', 'A subscription request with this idempotency key is currently processing.'
      );
    END IF;
END;
$$;

-- 3. Hardened Complete / Fail Reservation RPC (Immutable completed state)
-- Drop the unhardened 5-parameter overload from migration 20261007000004 to eliminate orphaned functions
DROP FUNCTION IF EXISTS public.complete_billing_idempotency(
  UUID,
  TEXT,
  INTEGER,
  JSONB,
  TEXT
);

CREATE OR REPLACE FUNCTION public.complete_billing_idempotency(
  p_organization_id UUID,
  p_idempotency_key TEXT,
  p_response_status INTEGER,
  p_response_payload JSONB,
  p_status TEXT DEFAULT 'completed',
  p_verification_window_seconds INTEGER DEFAULT 120
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Immutable completion: only transition rows in 'started' or 'pending_verification'
  UPDATE public.billing_idempotency_reservations
  SET status = p_status,
      response_status = p_response_status,
      response_payload = p_response_payload,
      locked_until = CASE
        WHEN p_status = 'pending_verification' THEN NOW() + (COALESCE(p_verification_window_seconds, 120) || ' seconds')::INTERVAL
        ELSE NOW()
      END,
      updated_at = NOW()
  WHERE organization_id = p_organization_id
    AND idempotency_key = p_idempotency_key
    AND status IN ('started', 'pending_verification');
END;
$$;

-- 4. Controlled Recovery RPC for pending_verification
-- Can ONLY transition from pending_verification to started when the verification window has expired (locked_until <= NOW())
CREATE OR REPLACE FUNCTION public.recover_pending_verification_idempotency(
  p_organization_id UUID,
  p_idempotency_key TEXT,
  p_lock_timeout_seconds INTEGER DEFAULT 120
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_updated INTEGER;
BEGIN
  UPDATE public.billing_idempotency_reservations
  SET status = 'started',
      response_status = NULL,
      response_payload = NULL,
      locked_until = NOW() + (COALESCE(p_lock_timeout_seconds, 120) || ' seconds')::INTERVAL,
      updated_at = NOW()
  WHERE organization_id = p_organization_id
    AND idempotency_key = p_idempotency_key
    AND status = 'pending_verification'
    AND locked_until <= NOW();

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

-- 5. Restrict RPC Execution strictly to service_role (Revoke from PUBLIC, anon, authenticated)
REVOKE EXECUTE ON FUNCTION public.reserve_billing_idempotency(UUID, TEXT, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_billing_idempotency(UUID, TEXT, TEXT, INTEGER) TO service_role;

-- Defensively revoke execute from both legacy 5-param and hardened 6-param signatures
DO $$
BEGIN
  REVOKE EXECUTE ON FUNCTION public.complete_billing_idempotency(UUID, TEXT, INTEGER, JSONB, TEXT) FROM PUBLIC, anon, authenticated;
EXCEPTION
  WHEN undefined_function THEN
    NULL;
END $$;

REVOKE EXECUTE ON FUNCTION public.complete_billing_idempotency(UUID, TEXT, INTEGER, JSONB, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_billing_idempotency(UUID, TEXT, INTEGER, JSONB, TEXT, INTEGER) TO service_role;

REVOKE EXECUTE ON FUNCTION public.recover_pending_verification_idempotency(UUID, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recover_pending_verification_idempotency(UUID, TEXT, INTEGER) TO service_role;
