-- ====================================================================
-- DispatcherDesk Migration: Billing Idempotency Foundation (P0-6)
-- Version: 1.0.38
-- File: supabase/migrations/20261007000004_billing_idempotency_foundation.sql
-- Description:
-- 1. Creates public.billing_idempotency_reservations table to enforce
--    strict, atomic, organization-scoped idempotency for subscription orders.
-- 2. Adds public.reserve_billing_idempotency() RPC for atomic lock reservation,
--    completed replay, active conflict detection (409), and stale-lock takeover.
-- 3. Adds public.complete_billing_idempotency() RPC to cache final responses.
-- ====================================================================

-- 1. Table: public.billing_idempotency_reservations
CREATE TABLE IF NOT EXISTS public.billing_idempotency_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL,
  request_path TEXT NOT NULL DEFAULT '/api/billing/create-subscription',
  status TEXT NOT NULL DEFAULT 'started' CHECK (status IN ('started', 'completed', 'failed')),
  response_status INTEGER,
  response_payload JSONB,
  locked_until TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '2 minutes'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_billing_idempotency UNIQUE (organization_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_billing_idempotency_org_key
  ON public.billing_idempotency_reservations (organization_id, idempotency_key);

CREATE INDEX IF NOT EXISTS idx_billing_idempotency_status
  ON public.billing_idempotency_reservations (status, locked_until);

-- Enable RLS
ALTER TABLE public.billing_idempotency_reservations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.billing_idempotency_reservations FROM anon, public;
GRANT SELECT ON public.billing_idempotency_reservations TO authenticated;
GRANT ALL ON public.billing_idempotency_reservations TO service_role;

DROP POLICY IF EXISTS "Members can view their org billing idempotency" ON public.billing_idempotency_reservations;
CREATE POLICY "Members can view their org billing idempotency"
  ON public.billing_idempotency_reservations FOR SELECT
  TO authenticated
  USING (organization_id IN (SELECT public.get_user_organizations()));

-- 2. Atomic Reservation RPC
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

    -- B. Active in-flight request -> Deterministic conflict (409)
    IF v_rec.status = 'started' AND v_rec.locked_until > v_now THEN
      RETURN jsonb_build_object(
        'action', 'conflict_active',
        'status', 'started',
        'locked_until', v_rec.locked_until,
        'message', 'A subscription request with this idempotency key is currently processing.'
      );
    END IF;

    -- C. Stale lock or previously failed request -> Safe takeover
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
    ELSE
      RETURN jsonb_build_object(
        'action', 'conflict_active',
        'status', v_rec.status,
        'message', 'A subscription request with this idempotency key is currently processing.'
      );
    END IF;
END;
$$;

-- 3. Complete / Fail Reservation RPC
CREATE OR REPLACE FUNCTION public.complete_billing_idempotency(
  p_organization_id UUID,
  p_idempotency_key TEXT,
  p_response_status INTEGER,
  p_response_payload JSONB,
  p_status TEXT DEFAULT 'completed'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.billing_idempotency_reservations
  SET status = p_status,
      response_status = p_response_status,
      response_payload = p_response_payload,
      locked_until = NOW(),
      updated_at = NOW()
  WHERE organization_id = p_organization_id
    AND idempotency_key = p_idempotency_key;
END;
$$;
