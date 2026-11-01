import { createClient } from '@supabase/supabase-js';
import { Database } from '../types/database.types.ts';

const getEnvVar = (key: string): string => {
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[key]) {
    return import.meta.env[key];
  }
  const globalProc = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process;
  return globalProc?.env?.[key] || '';
};

const supabaseUrl = getEnvVar('VITE_SUPABASE_URL') || 'https://ombipqikqaawcbnhrhuy.supabase.co';
const supabaseAnonKey = getEnvVar('VITE_SUPABASE_ANON_KEY') || 'sb_publishable_GupZ7BNKNunw__ykakt9Aw_WbI_Uvhp';

export const isSupabaseConfigured = Boolean(
  supabaseUrl && 
  supabaseAnonKey && 
  supabaseUrl !== 'https://your-project.supabase.co' &&
  !supabaseUrl.includes('your-project')
);

// Resolve Supabase endpoint:
// In browser environments (inside preview iframes or cross-domain contexts), route through
// the same-origin server proxy `/api/supabase` to completely avoid CORS preflight failures,
// third-party cookie restrictions, and "TypeError: Failed to fetch" errors.
// In SSR/Node environments, resolve directly to the configured endpoint.
const resolveSupabaseUrl = (): string => {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/api/supabase`;
  }
  if (supabaseUrl && !supabaseUrl.includes('your-project')) {
    return supabaseUrl;
  }
  return 'https://ombipqikqaawcbnhrhuy.supabase.co';
};

let clientRef: any = null;
let refreshSessionPromise: Promise<string | null> | null = null;

/**
 * Transparently refreshes the user's session if expired.
 * Deduplicates in-flight refresh calls to avoid concurrency issues.
 */
const getRefreshedToken = async (): Promise<string | null> => {
  if (!clientRef) return null;
  if (!refreshSessionPromise) {
    refreshSessionPromise = (async () => {
      try {
        const { data, error } = await clientRef.auth.refreshSession();
        if (!error && data?.session?.access_token) {
          return data.session.access_token;
        }
        return null;
      } catch (err) {
        console.warn('[Supabase] Background token refresh warning:', err);
        return null;
      } finally {
        refreshSessionPromise = null;
      }
    })();
  }
  return refreshSessionPromise;
};

const DIRECT_SUPABASE_URL = (supabaseUrl && !supabaseUrl.includes('your-project'))
  ? supabaseUrl.replace(/\/$/, '')
  : 'https://ombipqikqaawcbnhrhuy.supabase.co';

const getAlternateUrl = (url: string): string | null => {
  if (typeof window === 'undefined' || !window.location?.origin) return null;
  const proxyBase = `${window.location.origin}/api/supabase`;

  if (url.startsWith(proxyBase)) {
    return url.replace(proxyBase, DIRECT_SUPABASE_URL);
  }
  if (url.startsWith('/api/supabase')) {
    return url.replace('/api/supabase', DIRECT_SUPABASE_URL);
  }
  if (url.startsWith(DIRECT_SUPABASE_URL)) {
    return url.replace(DIRECT_SUPABASE_URL, proxyBase);
  }
  return null;
};

let preferDirectEndpoint = false;

/**
 * Executes a fetch request with automatic retries on transient network errors
 * (e.g. "TypeError: Failed to fetch") and transparent fallback between the
 * same-origin proxy (/api/supabase) and direct Supabase endpoint.
 */
const executeWithNetworkRetry = async (
  input: RequestInfo | URL,
  init?: RequestInit,
  attempt = 0
): Promise<Response> => {
  let urlStr = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input || '');

  // If direct endpoint was previously preferred due to a proxy failure, route directly
  if (preferDirectEndpoint && urlStr.includes('/api/supabase')) {
    const directUrl = getAlternateUrl(urlStr);
    if (directUrl) {
      urlStr = directUrl;
      input = directUrl;
    }
  }

  try {
    const response = await fetch(input, init);

    const isProxyUrl = Boolean(
      urlStr.includes('/api/supabase') ||
      (typeof window !== 'undefined' && window.location?.origin && urlStr.startsWith(`${window.location.origin}/api/supabase`))
    );

    const contentType = response.headers.get('content-type') || '';
    const isHtmlResponse = contentType.includes('text/html');

    // If proxy returns 5xx Server Error (500, 502, 503, 504) or an HTML error page, attempt direct endpoint fallback
    if (isProxyUrl && (response.status >= 500 || isHtmlResponse)) {
      const altUrl = getAlternateUrl(urlStr);
      if (altUrl) {
        console.warn(`[Supabase] Proxy returned HTTP ${response.status} (${contentType || 'no-type'}). Falling back to direct endpoint:`, altUrl);
        try {
          const directResponse = await fetch(altUrl, init);
          if (directResponse.ok || directResponse.status < 500) {
            preferDirectEndpoint = true;
            return directResponse;
          }
        } catch (altErr) {
          console.warn('[Supabase] Direct endpoint fallback failed:', altErr);
        }
      }
    }

    return response;
  } catch (err: any) {
    const isNetworkError =
      err?.name === 'TypeError' ||
      String(err?.message || '').toLowerCase().includes('failed to fetch') ||
      String(err || '').toLowerCase().includes('failed to fetch');

    if (isNetworkError && attempt < 2) {
      const altUrl = getAlternateUrl(urlStr);
      if (altUrl) {
        console.warn(`[Supabase] Network fetch error on attempt ${attempt + 1}. Trying alternate endpoint:`, altUrl);
        await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
        try {
          const altResponse = await executeWithNetworkRetry(altUrl, init, attempt + 1);
          if (altResponse.ok || altResponse.status < 500) {
            preferDirectEndpoint = true;
            return altResponse;
          }
        } catch (altErr) {
          console.warn('[Supabase] Alternate endpoint also failed, retrying original:', altErr);
        }
      }

      await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
      return await executeWithNetworkRetry(input, init, attempt + 1);
    }

    throw err;
  }
};

/**
 * Custom fetch wrapper for Supabase client:
 * 1. Automatically catches network glitches and falls back between proxy and direct endpoint.
 * 2. Catches PostgREST PGRST303 ("JWT expired") responses, refreshes token, and retries request.
 */
const customFetch: typeof fetch = async (input, init) => {
  const urlStr = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input || '');
  const isAuthTokenEndpoint = urlStr.includes('/auth/v1/token');

  let response: Response;
  try {
    response = await executeWithNetworkRetry(input, init);
  } catch (fetchErr) {
    console.warn('[Supabase] Fetch execution error after retries:', fetchErr);
    throw fetchErr;
  }

  // Check for expired JWT on non-auth requests
  if (response.status === 401 && !isAuthTokenEndpoint && clientRef) {
    try {
      const cloned = response.clone();
      const bodyText = await cloned.text();

      if (bodyText.includes('PGRST303') || bodyText.includes('JWT expired') || bodyText.includes('jwt expired')) {
        console.warn('[Supabase] Expired JWT detected (PGRST303). Refreshing session and retrying request...');
        const newToken = await getRefreshedToken();

        if (newToken) {
          const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : {}));
          headers.set('Authorization', `Bearer ${newToken}`);

          // Retry request with fresh access token
          return await executeWithNetworkRetry(input, {
            ...init,
            headers,
          });
        }
      }
    } catch (interceptorErr) {
      console.warn('[Supabase] Auth interceptor retry notice:', interceptorErr);
    }
  }

  return response;
};

// Type-safe Supabase client initialized with anon public key
export const supabase = createClient<Database>(
  resolveSupabaseUrl(),
  supabaseAnonKey || 'sb_publishable_GupZ7BNKNunw__ykakt9Aw_WbI_Uvhp',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
    global: {
      fetch: customFetch,
    },
  }
);

clientRef = supabase;
