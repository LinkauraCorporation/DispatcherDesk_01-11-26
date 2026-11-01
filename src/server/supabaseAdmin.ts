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
 * Resets or overrides the admin client instance for isolated testing.
 */
export function resetSupabaseAdminForTesting(): void {
  adminClient = null;
}

export function setSupabaseAdminForTesting(client: any): void {
  adminClient = client;
}
