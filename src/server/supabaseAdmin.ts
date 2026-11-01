/**
 * DispatcherDesk Server-Side Supabase Admin Client
 * File: src/server/supabaseAdmin.ts
 *
 * Dedicated server-side Supabase client initialized with the privileged service_role key.
 * Used exclusively by backend server services (e.g. BillingOrchestrator, webhook processors)
 * for executing security definer RPCs and administrative database mutations.
 *
 * CRITICAL SECURITY CONSTRAINTS:
 * 1. MUST NEVER be imported or bundled into client-side code.
 * 2. Uses process.env.SUPABASE_SERVICE_ROLE_KEY (never prefixed with VITE_).
 * 3. Fails fast with an explicit configuration error if the key is absent.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Database } from '../types/database.types.ts';

let adminClient: SupabaseClient<Database> | null = null;
let authClient: SupabaseClient<Database> | null = null;

export function getSupabaseAdmin(): SupabaseClient<Database> {
  if (adminClient) {
    return adminClient;
  }

  const supabaseUrl =
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    'https://ombipqikqaawcbnhrhuy.supabase.co';

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    throw new Error(
      '[Configuration Error] SUPABASE_SERVICE_ROLE_KEY is required for server-side admin operations.'
    );
  }

  adminClient = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return adminClient;
}

/**
 * Returns a Supabase client capable of verifying JWT tokens via auth.getUser(token).
 * If adminClient is already initialized (e.g. in tests via setSupabaseAdminForTesting or
 * when SUPABASE_SERVICE_ROLE_KEY is set), it uses that.
 * Otherwise, it falls back to a client initialized with the public anon key.
 * This ensures JWT verification succeeds even when service_role operations are not configured.
 */
export function getSupabaseAuthClient(): SupabaseClient<Database> {
  if (adminClient) {
    return adminClient;
  }

  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return getSupabaseAdmin();
  }

  if (authClient) {
    return authClient;
  }

  const supabaseUrl =
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    'https://ombipqikqaawcbnhrhuy.supabase.co';

  const anonKey =
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    'sb_publishable_GupZ7BNKNunw__ykakt9Aw_WbI_Uvhp';

  authClient = createClient<Database>(supabaseUrl, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return authClient;
}

/**
 * Safe accessor that returns getSupabaseAdmin() if available,
 * or getSupabaseAuthClient() as a fallback without throwing.
 */
export function getSupabaseAdminSafe(): SupabaseClient<Database> {
  try {
    return getSupabaseAdmin();
  } catch {
    return getSupabaseAuthClient();
  }
}

/**
 * Resets or overrides the admin client instance for isolated testing.
 */
export function resetSupabaseAdminForTesting(): void {
  adminClient = null;
  authClient = null;
}

export function setSupabaseAdminForTesting(client: any): void {
  adminClient = client;
}
