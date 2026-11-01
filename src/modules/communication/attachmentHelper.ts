/**
 * Shared helper for resolving and refreshing chat attachment signed URLs.
 * Handles initial temporary signed URLs, expiry detection, and on-demand refresh
 * via the secure backend proxy endpoint GET /api/chat/attachment-url?path=...
 */
import { supabase } from '../../lib/supabase.ts';
import { MessageAttachmentContext } from './types.ts';

// In-memory cache for refreshed signed URLs to avoid duplicate network fetches
const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();

// In-flight request deduplication map to prevent race conditions
const inFlightRequests = new Map<string, Promise<string | null>>();

/**
 * Fetch a fresh signed URL for a given storage path from the secure backend.
 */
export async function fetchFreshAttachmentUrl(storagePath: string): Promise<string | null> {
  if (!storagePath) return null;

  // Check cache first (cached up to 50 minutes of the 60-minute window)
  const cached = signedUrlCache.get(storagePath);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.url;
  }

  // Deduplicate ongoing requests for the same path
  if (inFlightRequests.has(storagePath)) {
    return inFlightRequests.get(storagePath)!;
  }

  const promise = (async () => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) {
        console.warn('[AttachmentHelper] No active authentication session to refresh URL');
        return null;
      }

      const res = await fetch(`/api/chat/attachment-url?path=${encodeURIComponent(storagePath)}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        console.warn(`[AttachmentHelper] Refresh request failed with status ${res.status}`);
        return null;
      }

      const data = await res.json();
      if (data?.signed_url) {
        const expiresInSeconds = typeof data.expires_in === 'number' ? data.expires_in : 3600;
        // Cache URL with a safety margin (subtract 5 minutes)
        const expiresAt = Date.now() + Math.max(expiresInSeconds - 300, 60) * 1000;
        signedUrlCache.set(storagePath, { url: data.signed_url, expiresAt });
        return data.signed_url;
      }
      return null;
    } catch (err) {
      console.warn('[AttachmentHelper] Error fetching fresh attachment URL:', err);
      return null;
    } finally {
      inFlightRequests.delete(storagePath);
    }
  })();

  inFlightRequests.set(storagePath, promise);
  return promise;
}

/**
 * Checks if a signed URL might already be expired by inspecting its token or timestamp if available,
 * or returns true if no signed URL is present at all.
 */
export function isSignedUrlMissingOrExpired(attachment?: MessageAttachmentContext | null): boolean {
  if (!attachment || !attachment.storage_path) return false;
  if (!attachment.signed_url) return true;

  try {
    const url = new URL(attachment.signed_url);
    // Supabase signed URLs often contain a token query param or expiration timestamp
    // If cache has a newer valid URL, prefer refreshing
    const cached = signedUrlCache.get(attachment.storage_path);
    if (cached && cached.expiresAt > Date.now()) {
      return false;
    }
  } catch {
    return true;
  }
  return false;
}
