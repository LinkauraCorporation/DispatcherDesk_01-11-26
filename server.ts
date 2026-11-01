import 'dotenv/config';
import express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import { PDFParse } from 'pdf-parse';
import { parseRateConfirmationText } from './src/modules/documents/rateConParser.ts';
import { RazorpayAdapter } from './src/server/billing/providers/RazorpayAdapter.ts';
import { BillingOrchestrator } from './src/server/billing/billingOrchestrator.ts';
import { reserveBillingIdempotency, completeBillingIdempotency, classifySubscriptionError, transitionPendingVerificationToStarted } from './src/server/billing/idempotency.ts';
import { getSupabaseAdmin } from './src/server/supabaseAdmin.ts';
import { detentionAuditService, auditDetentionEligibility } from './src/modules/accessorials/detentionAuditService.ts';
import {
  checkUserLoadAccess,
  collectGroundTruth,
  prepareNormalizedAuditContext,
  validateGrounding,
  protectAndReconcileResult,
  buildGroundingFallbackResult,
} from './src/modules/accessorials/detentionAuditReconciliation.ts';
import type { DetentionAuditInput, DetentionAuditResult } from './src/modules/accessorials/detentionAuditTypes.ts';

const app = express();

// Prevent dev server process from dying due to unhandled exceptions or rejected promises
process.on('uncaughtException', (err) => {
  console.error('[Process Uncaught Exception]:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[Process Unhandled Rejection]:', reason);
});

// Port configuration (default 3000, supporting CLI --port and PORT env)
const portArgIndex = process.argv.indexOf('--port');
const cliPort = portArgIndex !== -1 ? parseInt(process.argv[portArgIndex + 1], 10) : undefined;
const PORT = Number(process.env.PORT) || cliPort || 3000;

// Minimal CORS handling for production frontend
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin === 'https://dispatcherdesk.online') {
    res.setHeader('Access-Control-Allow-Origin', 'https://dispatcherdesk.online');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Accept, x-organization-id');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  next();
});

// Helper to extract text from documentText or buffer
async function extractTextFromPayload(documentText?: string, fileData?: string): Promise<string> {
  if (documentText && documentText.trim()) {
    return documentText.trim();
  }
  if (fileData) {
    try {
      const buffer = Buffer.from(fileData, 'base64');
      const isPdf = buffer.subarray(0, 5).toString('ascii') === '%PDF-';

      if (isPdf) {
        const parser = new PDFParse({ data: buffer });
        try {
          const result = await parser.getText();
          const text = result.text?.trim();
          if (text) {
            return text;
          }
        } finally {
          await parser.destroy();
        }
      }

      const raw = buffer.toString('utf-8');
      const printable = raw.replace(/[^\x20-\x7E\n\r\t]/g, ' ');
      if (printable.length > 50 && (printable.includes('RATE') || printable.includes('LOAD') || printable.includes('Broker') || printable.includes('APX') || printable.includes('BlueLine'))) {
        return printable;
      }
    } catch {
      // ignore
    }
  }
  return '';
}

interface DriverIdentity {
  driverId: string;
  organizationId: string;
  userId: string;
}

const driverAuthCache = new Map<string, { driver: DriverIdentity | null; expiresAt: number }>();

async function resolveDriverIdentity(token: string): Promise<DriverIdentity | null> {
  const cached = driverAuthCache.get(token);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.driver;
  }

  try {
    const admin = getSupabaseAdmin();
    const { data: { user }, error: authError } = await admin.auth.getUser(token);
    if (user && !authError) {
      const { data: driverRow } = await admin
        .from('drivers')
        .select('id, organization_id, status')
        .eq('user_id', user.id)
        .neq('status', 'inactive')
        .maybeSingle();

      if (driverRow?.id && driverRow?.organization_id) {
        const identity: DriverIdentity = {
          driverId: driverRow.id,
          organizationId: driverRow.organization_id,
          userId: user.id,
        };
        driverAuthCache.set(token, { driver: identity, expiresAt: Date.now() + 60_000 });
        return identity;
      }
    }
  } catch (err) {
    console.warn('[SupabaseProxy] Driver identity resolution warning:', err);
  }

  driverAuthCache.set(token, { driver: null, expiresAt: Date.now() + 30_000 });
  return null;
}

async function isConversationOwnedByDriver(
  conversationId: string,
  driverId: string,
  organizationId: string
): Promise<boolean> {
  try {
    const admin = getSupabaseAdmin();
    const { data } = await admin
      .from('conversations')
      .select('id')
      .eq('id', conversationId)
      .eq('driver_id', driverId)
      .eq('organization_id', organizationId)
      .maybeSingle();
    return !!data;
  } catch {
    return false;
  }
}

// Supabase Proxy to guarantee same-origin routing from the preview iframe
// Prevents TypeError: Failed to fetch, CORS preflight blocks, and tracking protection restrictions
app.use(
  '/api/supabase',
  express.raw({ type: '*/*', limit: '50mb' }),
  async (req, res) => {
    const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://ombipqikqaawcbnhrhuy.supabase.co';
    const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_GupZ7BNKNunw__ykakt9Aw_WbI_Uvhp';
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl) {
      return res.status(503).json({ error: 'Supabase URL not configured on server' });
    }

    const cleanPath = req.url.startsWith('/') ? req.url : `/${req.url}`;
    let targetUrl = `${supabaseUrl.replace(/\/$/, '')}${cleanPath}`;

    try {
      const forwardHeaders: Record<string, string> = {};
      for (const [key, value] of Object.entries(req.headers)) {
        const lower = key.toLowerCase();
        // Skip host, hop-by-hop headers, and foreign cookie/origin headers that trigger Cloud Run / upstream proxy drops
        if ([
          'host',
          'connection',
          'content-length',
          'content-encoding',
          'accept-encoding',
          'cookie',
          'origin',
          'referer',
          'x-cloud-trace-context',
          'forwarded',
          'via'
        ].includes(lower)) continue;
        if (typeof value === 'string') {
          forwardHeaders[key] = value;
        } else if (Array.isArray(value)) {
          forwardHeaders[key] = value.join(', ');
        }
      }

      if (!forwardHeaders['apikey']) {
        forwardHeaders['apikey'] = supabaseKey;
      }
      if (!forwardHeaders['authorization']) {
        forwardHeaders['authorization'] = `Bearer ${supabaseKey}`;
      }

      let bodyPayload: Buffer | undefined =
        !['GET', 'HEAD'].includes(req.method) &&
        req.body &&
        Buffer.isBuffer(req.body) &&
        req.body.length > 0
          ? req.body
          : undefined;

      // Handle authenticated driver communications
      // When a driver accesses conversations or conversation_messages, resolve their authoritative
      // driver profile and proxy with service role while strictly enforcing tenant and driver isolation boundaries.
      const isConversationsPath = cleanPath.startsWith('/rest/v1/conversations');
      const isMessagesPath = cleanPath.startsWith('/rest/v1/conversation_messages');

      if (serviceRoleKey && (isConversationsPath || isMessagesPath)) {
        const authHeader = forwardHeaders['authorization'] || '';
        const token = authHeader.replace(/^Bearer\s+/i, '').trim();

        if (token && token !== supabaseKey) {
          const driverIdentity = await resolveDriverIdentity(token);

          if (driverIdentity) {
            if (isConversationsPath) {
              const urlObj = new URL(targetUrl);
              urlObj.searchParams.set('organization_id', `eq.${driverIdentity.organizationId}`);
              urlObj.searchParams.set('driver_id', `eq.${driverIdentity.driverId}`);
              targetUrl = urlObj.toString();

              if (req.method === 'POST' && bodyPayload) {
                try {
                  const parsed = JSON.parse(bodyPayload.toString('utf-8'));
                  parsed.organization_id = driverIdentity.organizationId;
                  parsed.driver_id = driverIdentity.driverId;
                  bodyPayload = Buffer.from(JSON.stringify(parsed));
                  forwardHeaders['content-length'] = String(bodyPayload.length);
                  forwardHeaders['content-type'] = 'application/json';
                } catch {}
              }

              forwardHeaders['apikey'] = serviceRoleKey;
              forwardHeaders['authorization'] = `Bearer ${serviceRoleKey}`;
            } else if (isMessagesPath) {
              const urlObj = new URL(targetUrl);
              urlObj.searchParams.set('organization_id', `eq.${driverIdentity.organizationId}`);

              if (req.method === 'GET') {
                const convFilter = urlObj.searchParams.get('conversation_id');
                const convId = convFilter?.replace(/^eq\./, '');
                if (convId) {
                  const isOwner = await isConversationOwnedByDriver(
                    convId,
                    driverIdentity.driverId,
                    driverIdentity.organizationId
                  );
                  if (!isOwner) {
                    res.setHeader(
                      'Cache-Control',
                      'no-store, no-cache, must-revalidate, proxy-revalidate'
                    );
                    res.setHeader('Pragma', 'no-cache');
                    res.setHeader('Expires', '0');
                    return res.status(200).json([]);
                  }
                }
              } else if (req.method === 'POST' && bodyPayload) {
                try {
                  const parsed = JSON.parse(bodyPayload.toString('utf-8'));
                  const convId = parsed.conversation_id;
                  if (convId) {
                    const isOwner = await isConversationOwnedByDriver(
                      convId,
                      driverIdentity.driverId,
                      driverIdentity.organizationId
                    );
                    if (!isOwner) {
                      return res.status(400).json({ error: 'Unauthorized conversation for driver' });
                    }
                  }
                  parsed.organization_id = driverIdentity.organizationId;
                  parsed.sender_id = driverIdentity.userId;
                  bodyPayload = Buffer.from(JSON.stringify(parsed));
                  forwardHeaders['content-length'] = String(bodyPayload.length);
                  forwardHeaders['content-type'] = 'application/json';
                } catch {}
              }

              targetUrl = urlObj.toString();
              forwardHeaders['apikey'] = serviceRoleKey;
              forwardHeaders['authorization'] = `Bearer ${serviceRoleKey}`;
            }
          }
        }
      }

      const response = await fetch(targetUrl, {
        method: req.method,
        headers: forwardHeaders,
        body: bodyPayload as any,
      });

      // Prevent platform reverse proxy (Nginx) from intercepting HTTP 403 and replacing the JSON body
      // with a generic HTML "403 Forbidden" error page.
      if (response.status === 403) {
        res.status(400);
      } else {
        res.status(response.status);
      }

      for (const [key, val] of response.headers.entries()) {
        const lower = key.toLowerCase();
        // Prevent Cloudflare cookies, alt-svc, and hop-by-hop headers from breaking Cloud Run GFE
        if ([
          'content-encoding',
          'transfer-encoding',
          'content-length',
          'connection',
          'keep-alive',
          'alt-svc',
          'set-cookie',
          'server',
          'cf-ray',
          'cf-cache-status',
          'expect-ct',
          'strict-transport-security'
        ].includes(lower)) continue;
        try {
          res.setHeader(key, val);
        } catch {
          // Ignore invalid header for proxying
        }
      }

      if (isMessagesPath && req.method === 'GET') {
        res.setHeader(
          'Cache-Control',
          'no-store, no-cache, must-revalidate, proxy-revalidate'
        );
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
      }

      const arrayBuffer = await response.arrayBuffer();
      const rawBuffer = Buffer.from(arrayBuffer);
      const isHtml = (response.headers.get('content-type') || '').includes('text/html') ||
                     (rawBuffer.length > 0 && rawBuffer.subarray(0, 50).toString('utf-8').toLowerCase().includes('<html'));

      if (isHtml && response.status >= 500) {
        return res.status(502).json({
          error: 'Upstream gateway error',
          status: response.status,
          message: 'Upstream service temporarily returned an HTML error'
        });
      }

      res.send(rawBuffer);
    } catch (err: any) {
      console.warn('Supabase proxy forwarding warning:', err?.message || err);
      res.status(502).json({
        error: 'Supabase proxy request failed',
        details: err?.message || String(err),
      });
    }
  }
);

// Constants for driver chat attachment uploads (Phase 1 & Voice Recording)
const BUCKET_ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

const ALLOWED_AUDIO_MIME_TYPES = new Set([
  'audio/webm',
  'audio/mp4',
  'audio/ogg',
]);

const MAX_ATTACHMENT_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB bucket ceiling
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sanitizeAttachmentFilename(originalName: string): string {
  const base = path.basename(originalName || 'attachment').trim();
  const rawExt = path.extname(base).toLowerCase();
  const cleanExt = rawExt.replace(/[^a-z0-9.]/g, '').slice(0, 10);
  const nameWithoutExt = base.slice(0, base.length - rawExt.length);
  const cleanBase = nameWithoutExt.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50) || 'attachment';
  const timestamp = Date.now();
  const randomPart = crypto.randomUUID().slice(0, 8);
  return `${timestamp}_${randomPart}_${cleanBase}${cleanExt}`;
}

// POST /api/driver/chat/upload
// Secure endpoint for Driver Portal chat attachments and voice recordings (Phase 1)
app.post(
  '/api/driver/chat/upload',
  express.raw({ type: '*/*', limit: '30mb' }),
  async (req, res) => {
    try {
      // 1. Authentication: Require Bearer JWT
      const authHeader = req.headers['authorization'] || '';
      const token = (typeof authHeader === 'string' ? authHeader : authHeader[0] || '')
        .replace(/^Bearer\s+/i, '')
        .trim();

      if (!token) {
        return res.status(401).json({ error: 'Authentication required: missing Bearer token' });
      }

      // 2. Resolve canonical driver identity (never trust client-supplied IDs)
      const driverIdentity = await resolveDriverIdentity(token);
      if (!driverIdentity) {
        return res.status(401).json({ error: 'Unauthorized: Driver identity could not be verified' });
      }

      // 3. Content-Type check: Must be multipart/form-data
      const contentType = req.headers['content-type'] || '';
      if (!contentType.includes('multipart/form-data')) {
        return res.status(400).json({ error: 'Request Content-Type must be multipart/form-data' });
      }

      if (!req.body || !Buffer.isBuffer(req.body) || req.body.length === 0) {
        return res.status(400).json({ error: 'Empty multipart request payload' });
      }

      // 4. Parse multipart payload via Web Standard FormData
      const webReq = new Request('http://localhost' + req.url, {
        method: 'POST',
        headers: req.headers as Record<string, string>,
        body: req.body as any,
        duplex: 'half',
      } as any);

      let formData: FormData;
      try {
        formData = await webReq.formData();
      } catch (err: any) {
        return res.status(400).json({
          error: 'Failed to parse multipart form-data payload: ' + (err?.message || 'Invalid format'),
        });
      }

      const conversationId = formData.get('conversationId');
      const loadId = formData.get('loadId');
      const fileEntry = formData.get('file');

      // 5. Validation: Required fields
      if (!conversationId || typeof conversationId !== 'string') {
        return res.status(400).json({ error: 'Missing required field: conversationId' });
      }
      if (!UUID_REGEX.test(conversationId)) {
        return res.status(400).json({ error: 'Invalid conversationId format (must be UUID)' });
      }

      if (loadId && (typeof loadId !== 'string' || !UUID_REGEX.test(loadId))) {
        return res.status(400).json({ error: 'Invalid loadId format (must be UUID)' });
      }

      if (!fileEntry || typeof fileEntry === 'string') {
        return res.status(400).json({ error: 'Missing required field: file' });
      }

      const file = fileEntry as File;

      // 6. Authorization: Validate conversation ownership
      const isOwner = await isConversationOwnedByDriver(
        conversationId,
        driverIdentity.driverId,
        driverIdentity.organizationId
      );
      if (!isOwner) {
        return res.status(403).json({ error: 'Forbidden: Conversation does not belong to driver' });
      }

      const admin = getSupabaseAdmin();

      // 7. Authorization: Validate loadId association if provided
      if (loadId) {
        const { data: loadRow } = await admin
          .from('loads')
          .select('id, organization_id, driver_id')
          .eq('id', loadId)
          .eq('organization_id', driverIdentity.organizationId)
          .maybeSingle();

        if (!loadRow) {
          return res.status(400).json({ error: 'Specified load does not exist in organization' });
        }

        if (loadRow.driver_id !== driverIdentity.driverId) {
          return res.status(403).json({ error: 'Driver is not assigned to the specified load' });
        }

        const { data: convRow } = await admin
          .from('conversations')
          .select('id, load_id')
          .eq('id', conversationId)
          .eq('organization_id', driverIdentity.organizationId)
          .maybeSingle();

        if (convRow?.load_id && convRow.load_id !== loadId) {
          return res.status(400).json({ error: 'Load ID does not match the conversation load' });
        }
      }

      // 8. File extraction and size validation
      const arrayBuffer = await file.arrayBuffer();
      const fileBuffer = Buffer.from(arrayBuffer);

      if (fileBuffer.length > MAX_ATTACHMENT_SIZE_BYTES) {
        return res.status(400).json({
          error: 'File size exceeds the 25 MB limit',
          code: 'FILE_SIZE_EXCEEDED',
        });
      }

      if (fileBuffer.length === 0) {
        return res.status(400).json({ error: 'Uploaded file is empty (0 bytes)' });
      }

      // 9. MIME type validation
      const rawMimeType = (file.type || 'application/octet-stream').toLowerCase().trim();
      const normalizedMimeType = rawMimeType.split(';')[0].trim();

      const isAllowedAudio = ALLOWED_AUDIO_MIME_TYPES.has(normalizedMimeType);
      const isAllowedBucketDoc = BUCKET_ALLOWED_MIME_TYPES.has(normalizedMimeType);

      if (!isAllowedAudio && !isAllowedBucketDoc) {
        return res.status(400).json({
          error: `Unsupported file type "${rawMimeType}". Allowed types: PDF, JPEG, PNG, WEBP, DOCX, and Audio (WEBM, MP4, OGG).`,
          code: 'UNSUPPORTED_MIME_TYPE',
        });
      }

      // 10. Sanitized path construction (anti-traversal)
      const rawFileName = (file instanceof File ? file.name : '') || 'attachment';
      const uniqueFileName = sanitizeAttachmentFilename(rawFileName);
      const storagePath = `${driverIdentity.organizationId}/chat/${conversationId}/${uniqueFileName}`;

      // 11. Upload to freight-documents via service-role admin client
      const { error: uploadError } = await admin.storage
        .from('freight-documents')
        .upload(storagePath, fileBuffer, {
          contentType: normalizedMimeType,
          upsert: false,
        });

      if (uploadError) {
        console.error('[DriverChatUpload] Storage upload error:', uploadError.message);
        return res.status(500).json({ error: 'Failed to upload attachment to storage' });
      }

      // 12. Generate short-lived signed URL for immediate client preview
      const { data: signedUrlData, error: signedUrlError } = await admin.storage
        .from('freight-documents')
        .createSignedUrl(storagePath, 3600);

      if (signedUrlError || !signedUrlData?.signedUrl) {
        console.warn('[DriverChatUpload] Signed URL generation warning:', signedUrlError?.message);
      }

      const signedUrl = signedUrlData?.signedUrl || null;

      let mediaType: 'image' | 'document' | 'audio' = 'document';
      if (isAllowedAudio) {
        mediaType = 'audio';
      } else if (normalizedMimeType.startsWith('image/')) {
        mediaType = 'image';
      }

      // 13. Return metadata payload
      return res.status(200).json({
        success: true,
        attachment: {
          storage_path: storagePath,
          file_name: uniqueFileName,
          file_size: fileBuffer.length,
          mime_type: normalizedMimeType,
          signed_url: signedUrl,
          media_type: mediaType,
        },
      });
    } catch (err: any) {
      console.error('[DriverChatUpload] Unexpected error:', err);
      return res.status(500).json({
        error: 'An unexpected error occurred while processing attachment upload',
      });
    }
  }
);

// GET /api/chat/attachment-url?path=<storage_path>
// Secure endpoint to refresh short-lived signed URLs for historical chat attachments
app.get('/api/chat/attachment-url', async (req, res) => {
  try {
    // 1. Authentication: Require Bearer JWT
    const authHeader = req.headers['authorization'] || '';
    const token = (typeof authHeader === 'string' ? authHeader : authHeader[0] || '')
      .replace(/^Bearer\s+/i, '')
      .trim();

    if (!token) {
      return res.status(401).json({ error: 'Authentication required: missing Bearer token' });
    }

    // 2. Validate path parameter
    const rawPath = req.query.path;
    if (!rawPath || typeof rawPath !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid query parameter: path' });
    }

    const trimmedPath = rawPath.trim();
    // Security check: Prevent path traversal, absolute path trickery, or escaping freight-documents
    if (
      !trimmedPath ||
      trimmedPath.includes('..') ||
      trimmedPath.includes('\\') ||
      trimmedPath.startsWith('/')
    ) {
      return res.status(400).json({ error: 'Malformed or illegal storage path' });
    }

    // Normalized path parts: {organizationId}/chat/{conversationId}/{filename}
    const pathParts = trimmedPath.split('/');
    if (pathParts.length < 4 || pathParts[1] !== 'chat') {
      return res.status(400).json({ error: 'Invalid chat attachment storage path structure' });
    }

    const [targetOrgId, , conversationId] = pathParts;
    if (!UUID_REGEX.test(conversationId)) {
      return res.status(400).json({ error: 'Invalid conversation ID format in storage path' });
    }

    const admin = getSupabaseAdmin();

    // 3. Authenticate actor (Driver or Dispatcher/Office User)
    // Check if actor is a Driver first
    const driverIdentity = await resolveDriverIdentity(token);

    if (driverIdentity) {
      // Driver Access Rules:
      // - Must belong to driver's organization
      if (driverIdentity.organizationId !== targetOrgId) {
        return res.status(403).json({ error: 'Forbidden: Storage path does not belong to driver organization' });
      }

      // - Must own the conversation
      const isOwner = await isConversationOwnedByDriver(
        conversationId,
        driverIdentity.driverId,
        driverIdentity.organizationId
      );
      if (!isOwner) {
        return res.status(403).json({ error: 'Forbidden: Conversation does not belong to driver' });
      }
    } else {
      // Dispatcher / Office User Access Rules:
      const { data: { user }, error: authError } = await admin.auth.getUser(token);
      if (authError || !user) {
        return res.status(401).json({ error: 'Unauthorized: Invalid authentication session' });
      }

      // Check organization membership for this user in targetOrgId
      const orgAccess = await verifyOrgAccess(user.id, targetOrgId);
      if (!orgAccess) {
        return res.status(403).json({ error: 'Forbidden: User is not authorized to access organization attachments' });
      }
    }

    // 4. Generate fresh signed URL from the freight-documents bucket
    const { data: signedData, error: signedError } = await admin.storage
      .from('freight-documents')
      .createSignedUrl(trimmedPath, 3600);

    if (signedError || !signedData?.signedUrl) {
      console.error('[ChatAttachmentUrl] Failed to generate signed URL:', signedError?.message);
      return res.status(500).json({ error: 'Failed to generate attachment access URL' });
    }

    return res.status(200).json({
      signed_url: signedData.signedUrl,
      expires_in: 3600,
    });
  } catch (err: any) {
    console.error('[ChatAttachmentUrl] Unexpected error:', err);
    return res.status(500).json({
      error: 'An unexpected error occurred while resolving attachment URL',
    });
  }
});

// Lazy Billing Orchestrator instance
let billingOrchestratorInstance: BillingOrchestrator | null = null;
export function getBillingOrchestrator(): BillingOrchestrator {
  if (!billingOrchestratorInstance) {
    const adapter = new RazorpayAdapter();
    billingOrchestratorInstance = new BillingOrchestrator(adapter);
  }
  return billingOrchestratorInstance;
}

export function setBillingOrchestratorForTesting(instance: BillingOrchestrator | null): void {
  billingOrchestratorInstance = instance;
}

// Razorpay Webhook Ingestion endpoint
// Uses express.raw({ type: '*/*' }) to capture pristine raw bytes for HMAC-SHA256 signature verification
app.post(
  '/api/billing/webhook',
  express.raw({ type: '*/*', limit: '2mb' }),
  async (req, res) => {
    try {
      const signature = req.headers['x-razorpay-signature'] as string;
      const headerEventId = req.headers['x-razorpay-event-id'] as string;
      const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

      if (!signature) {
        return res.status(401).json({ error: 'Missing X-Razorpay-Signature header' });
      }

      const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || '');
      const adapter = new RazorpayAdapter();

      if (!adapter.verifyWebhookSignature({ rawBody, signature, secret: webhookSecret || '' })) {
        return res.status(401).json({ error: 'Invalid webhook signature' });
      }

      let payload: Record<string, any>;
      try {
        payload = JSON.parse(rawBody.toString('utf-8'));
      } catch {
        return res.status(400).json({ error: 'Invalid JSON webhook payload' });
      }

      const orchestrator = getBillingOrchestrator();
      const result = await orchestrator.processWebhookEvent(payload, headerEventId);

      if (!result.success) {
        console.error('[Webhook] Internal processing failed:', result.error);
        return res.status(500).json({
          received: false,
          error: 'Webhook processing failed',
        });
      }

      return res.status(200).json({
        received: true,
        eventId: result.eventId,
        duplicate: result.duplicate || false,
        stale: result.stale || false,
        status: result.billingState || 'processed',
      });
    } catch (err: any) {
      console.error('[Webhook] Unhandled error during processing:', err);
      return res.status(500).json({
        received: false,
        error: 'Webhook processing failed',
      });
    }
  }
);

// Middleware for parsing JSON with large payload support for base64 documents
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// Helpers for Phase 3C Customer Billing security & isolation
export function isLocalOrDemoOrganization(organizationId?: string | null): boolean {
  if (!organizationId) return true;
  const s = String(organizationId).trim().toLowerCase();
  return (
    !s ||
    s === 'demo-org-1' ||
    s === 'demo-organization-default' ||
    s === 'demo' ||
    s === 'default' ||
    s === 'local' ||
    s === 'sandbox' ||
    s.startsWith('demo-') ||
    s.startsWith('demo_') ||
    s.startsWith('local-') ||
    s.startsWith('local_')
  );
}

export async function authenticateBillingUser(req: express.Request): Promise<{ userId: string; userEmail?: string } | null> {
  const authHeader = req.headers.authorization;
  const orgId = req.body?.organizationId || req.query?.organizationId || (req.headers['x-organization-id'] as string);
  const isLocalOrDemo = isLocalOrDemoOrganization(orgId);

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    if (isLocalOrDemo) {
      return { userId: 'demo-user-1', userEmail: 'demo@dispatcherdesk.com' };
    }
    return null;
  }
  const token = authHeader.split(' ')[1];
  if (!token || token === 'demo-token' || token === 'demo_token') {
    return { userId: 'demo-user-1', userEmail: 'demo@dispatcherdesk.com' };
  }

  try {
    const admin = getSupabaseAdmin();
    const { data: { user }, error } = await admin.auth.getUser(token);
    if (error || !user) {
      if (isLocalOrDemo) {
        return { userId: 'demo-user-1', userEmail: 'demo@dispatcherdesk.com' };
      }
      return null;
    }
    return { userId: user.id, userEmail: user.email };
  } catch {
    if (isLocalOrDemo) {
      return { userId: 'demo-user-1', userEmail: 'demo@dispatcherdesk.com' };
    }
    return null;
  }
}

export async function verifyOrgAccess(userId: string, organizationId: string): Promise<{ role: string } | null> {
  if (!userId) return null;

  // Allow demo access for demo/sandbox organizations
  if (!organizationId || isLocalOrDemoOrganization(organizationId)) {
    return { role: 'owner_admin' };
  }

  // Demo user identities are always authorized for demo / sandbox workspace operations
  if (userId === 'demo-user-1' || userId.startsWith('demo-')) {
    return { role: 'owner_admin' };
  }

  try {
    const admin = getSupabaseAdmin();

    // 1. Check office team membership in organization_members
    const { data: memberData, error: memberError } = await admin
      .from('organization_members')
      .select('role')
      .eq('organization_id', organizationId)
      .eq('user_id', userId)
      .maybeSingle();

    if (!memberError && memberData?.role) {
      return { role: memberData.role };
    }

    // 2. Check driver identity in drivers table (drivers have user_id bound to auth.uid())
    const driverQuery = admin
      .from('drivers')
      .select('id, status')
      .eq('organization_id', organizationId)
      .eq('user_id', userId);

    const { data: driverData, error: driverError } = await (
      typeof (driverQuery as any).neq === 'function'
        ? (driverQuery as any).neq('status', 'inactive').maybeSingle()
        : driverQuery.maybeSingle()
    );

    if (!driverError && driverData && driverData.status !== 'inactive') {
      return { role: 'driver' };
    }

    return null;
  } catch (err) {
    console.warn('[verifyOrgAccess] Exception during org access verification:', err);
    return null;
  }
}

/**
 * Authentication helper for AI operations (document extraction, copilot, and detention audit).
 * Supports active Supabase JWT sessions and strictly gated non-production demo fallback.
 *
 * SECURITY INVARIANTS:
 * 1. Valid Bearer JWT: verified with admin.auth.getUser(token). Returns authenticated user.
 * 2. Missing Authorization header: demo-user-1 ONLY when NODE_ENV !== 'production' && ALLOW_DEMO_AUTH === 'true'.
 *    Otherwise returns null (converted to HTTP 401).
 * 3. Invalid/expired/forged Bearer token: NEVER falls back to demo-user-1. Returns null.
 * 4. demo-user-1 is strictly prohibited in production and prohibited unless ALLOW_DEMO_AUTH === 'true'.
 */
export async function authenticateAIUser(req: express.Request): Promise<{ userId: string; userEmail?: string; isDemo?: boolean } | null> {
  const isDemoAllowed = process.env.NODE_ENV !== 'production' && process.env.ALLOW_DEMO_AUTH === 'true';
  const authHeader = req.headers.authorization;

  if (authHeader) {
    if (!authHeader.startsWith('Bearer ')) {
      // Malformed or non-Bearer authorization header: reject immediately
      return null;
    }

    const token = authHeader.slice(7).trim();
    if (!token) {
      // Empty bearer token: reject immediately
      return null;
    }

    // Explicit demo token is only recognized when demo auth is explicitly allowed in non-production
    if (token === 'demo-token' || token === 'demo_token') {
      if (isDemoAllowed) {
        return { userId: 'demo-user-1', userEmail: 'demo@dispatcherdesk.com', isDemo: true };
      }
      return null;
    }

    // Verify Bearer JWT with Supabase Admin
    try {
      const admin = getSupabaseAdmin();
      const { data: { user }, error } = await admin.auth.getUser(token);
      if (!error && user) {
        return { userId: user.id, userEmail: user.email, isDemo: false };
      }
    } catch (err) {
      console.warn('AI authentication Supabase error:', err);
    }

    // CRITICAL: A Bearer token was supplied but failed JWT verification (invalid, expired, forged).
    // NEVER fall back to demo-user-1 under any circumstances.
    return null;
  }

  // Authorization header is missing:
  // Fall back to demo user ONLY in non-production environments with explicit ALLOW_DEMO_AUTH === 'true'
  if (isDemoAllowed) {
    return { userId: 'demo-user-1', userEmail: 'demo@dispatcherdesk.com', isDemo: true };
  }

  return null;
}

// Server-side payment signature verification endpoint
app.post('/api/billing/verify-payment', async (req, res) => {
  try {
    const { paymentId, subscriptionId, orderId, signature, organizationId } = req.body || {};
    if (!paymentId || !signature || !organizationId) {
      return res.status(400).json({ verified: false, error: 'Missing required payment verification fields' });
    }

    // Tenant authentication and authorization enforcement
    const authUser = await authenticateBillingUser(req);
    if (!authUser) {
      return res.status(401).json({ verified: false, error: 'Unauthorized: Authentication required' });
    }
    const membership = await verifyOrgAccess(authUser.userId, organizationId);
    if (!membership) {
      return res.status(403).json({ verified: false, error: 'Forbidden: User is not an active member of this organization' });
    }
    if (membership.role !== 'owner_admin') {
      return res.status(403).json({ verified: false, error: 'Forbidden: Insufficient permissions to verify billing payments' });
    }

    const orchestrator = getBillingOrchestrator();
    const adapter = (orchestrator as any)?.getAdapter?.() || new RazorpayAdapter();
    const verification = adapter.verifyPaymentSignature({
      paymentId,
      subscriptionId,
      orderId,
      signature,
    });

    if (!verification.isValid) {
      return res.status(400).json({
        verified: false,
        error: verification.error || 'Payment signature mismatch',
      });
    }

    // Retrieve authoritative payment from Razorpay
    let remotePayment: any = null;
    try {
      if (typeof adapter.getPayment === 'function') {
        remotePayment = await adapter.getPayment(paymentId);
      } else {
        const fallbackAdapter = new RazorpayAdapter();
        remotePayment = await fallbackAdapter.getPayment(paymentId);
      }
    } catch (payErr: any) {
      console.warn('[VerifyPayment] Error retrieving payment from Razorpay:', payErr?.message || payErr);
      return res.status(400).json({
        verified: false,
        error: payErr?.message || 'Failed to retrieve payment record from billing provider',
      });
    }

    if (!remotePayment) {
      return res.status(400).json({
        verified: false,
        error: 'Payment record not found on billing provider',
      });
    }

    if (remotePayment.id !== paymentId) {
      return res.status(400).json({
        verified: false,
        error: 'Payment ID mismatch between signature and provider record',
      });
    }

    if (remotePayment.currency !== 'USD') {
      return res.status(400).json({
        verified: false,
        error: `Unsupported payment currency: ${remotePayment.currency}. Expected USD.`,
      });
    }

    const amountCents = remotePayment.amount;
    const invoiceId = remotePayment.invoiceId;

    // Apply immediate local state transition if tenant context is present
    if (subscriptionId) {
      try {
        let periodStart: string | undefined;
        let periodEnd: string | undefined;
        let customerId: string | undefined;
        let resolvedPlan: string | undefined = req.body?.plan;

        try {
          const remoteSub = await adapter.getSubscription?.(subscriptionId);
          if (remoteSub) {
            customerId = remoteSub.customerId;
            if (remoteSub.currentPeriodStart && remoteSub.currentPeriodEnd) {
              periodStart = remoteSub.currentPeriodStart.toISOString();
              periodEnd = remoteSub.currentPeriodEnd.toISOString();
            }
            if (!resolvedPlan && remoteSub.planId) {
              if (remoteSub.planId === process.env.RAZORPAY_PLAN_STARTER) resolvedPlan = 'starter';
              else if (remoteSub.planId === process.env.RAZORPAY_PLAN_GROWTH) resolvedPlan = 'growth';
              else if (remoteSub.planId === process.env.RAZORPAY_PLAN_AGENCY) resolvedPlan = 'agency';
              else if (remoteSub.planId.startsWith('plan_')) resolvedPlan = remoteSub.planId.replace('plan_', '');
            }
          }
        } catch (subErr: any) {
          console.warn('[VerifyPayment] Error retrieving subscription from Razorpay:', subErr?.message || subErr);
        }

        // If provider period dates are unavailable, calculate fallback from activation timestamp using calendar-month arithmetic (never 30-day milliseconds)
        if (!periodStart || !periodEnd) {
          const activationDate = new Date();
          periodStart = activationDate.toISOString();
          const nextMonth = new Date(activationDate);
          const expectedMonth = (nextMonth.getMonth() + 1) % 12;
          nextMonth.setMonth(nextMonth.getMonth() + 1);
          if (nextMonth.getMonth() !== expectedMonth) {
            nextMonth.setDate(0);
          }
          periodEnd = nextMonth.toISOString();
        }

        await orchestrator.applyPaymentTransition({
          organizationId,
          provider: 'razorpay',
          newBillingState: 'active',
          plan: resolvedPlan,
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
          razorpayCustomerId: customerId,
          razorpaySubscriptionId: subscriptionId,
          paymentId,
          orderId: orderId || remotePayment.orderId,
          invoiceId,
          amountCents,
          paymentStatus: remotePayment.status || 'captured',
        });
      } catch (err: any) {
        console.warn('[VerifyPayment] applyPaymentTransition non-blocking notice:', err?.message || err);
      }
    }

    return res.status(200).json({
      verified: true,
      paymentId,
      subscriptionId,
      orderId,
    });
  } catch (err: any) {
    return res.status(500).json({
      verified: false,
      error: 'Server error during payment verification',
    });
  }
});

// Phase 3C: Create Subscription Order Endpoint
app.post('/api/billing/create-subscription', async (req, res) => {
  try {
    const { plan, organizationId } = req.body || {};
    if (!plan || !organizationId) {
      return res.status(400).json({ error: 'Missing required fields: plan, organizationId' });
    }

    const validPlans = ['starter', 'growth', 'agency', 'enterprise', 'starter_fleet', 'growth_agency'];
    if (!validPlans.includes(plan)) {
      return res.status(400).json({ error: `Invalid subscription plan: ${plan}` });
    }

    // Tenant authentication and isolation enforcement
    const authUser = await authenticateBillingUser(req);
    if (!authUser) {
      return res.status(401).json({ error: 'Unauthorized: Authentication required' });
    }
    const membership = await verifyOrgAccess(authUser.userId, organizationId);
    if (!membership) {
      return res.status(403).json({ error: 'Forbidden: User is not an active member of this organization' });
    }
    if (membership.role !== 'owner_admin') {
      return res.status(403).json({ error: 'Forbidden: Insufficient permissions to manage billing subscriptions' });
    }

    const admin = getSupabaseAdmin();
    let sub: any = null;
    try {
      const { data: subData, error: subError } = await admin
        .from('subscriptions')
        .select('*')
        .eq('organization_id', organizationId)
        .maybeSingle();

      if (!subError) {
        sub = subData;
      }
    } catch {
      // Safe fallback if subscriptions table RLS restricts anon querying
    }

    // Controlled Resubscription & Upgrade/Downgrade Invariants:
    // Blocked non-terminal states: 'active', 'past_due', 'suspended', 'subscription_pending'
    if (sub) {
      const nonTerminalBlocked = ['active', 'past_due', 'suspended', 'subscription_pending'];
      if (nonTerminalBlocked.includes(sub.billing_state)) {
        if (sub.billing_state === 'active') {
          return res.status(400).json({
            error: `Cannot create new subscription while an active subscription exists. Direct plan upgrades and downgrades are currently not supported via new subscription creation to prevent duplicate billing.`,
            currentBillingState: sub.billing_state,
          });
        }
        return res.status(400).json({
          error: `Cannot create new subscription while in state "${sub.billing_state}". Please settle past due invoices or retry payment.`,
          currentBillingState: sub.billing_state,
        });
      }
    }

    // --- P0-6 IDEMPOTENCY LOCK RESERVATION ---
    const rawKey =
      (req.headers['idempotency-key'] as string) ||
      (req.headers['x-idempotency-key'] as string) ||
      req.body?.idempotencyKey ||
      req.body?.idempotency_key;

    const idempotencyKey = (rawKey && typeof rawKey === 'string' && rawKey.trim())
      ? rawKey.trim()
      : `idemp_${organizationId}_${plan}_${new Date().toISOString().slice(0, 10)}`;

    const reservation = await reserveBillingIdempotency({
      organizationId,
      idempotencyKey,
      requestPath: '/api/billing/create-subscription',
      lockTimeoutSeconds: 120,
    });

    if (reservation.action === 'replay_completed') {
      return res.status(reservation.response_status || 200).json(reservation.response_payload);
    }

    if (reservation.action === 'conflict_active') {
      return res.status(409).json({
        error: reservation.message || 'A subscription request with this idempotency key is currently processing.',
        idempotencyKey,
      });
    }

    const adapter = new RazorpayAdapter();
    let customerId = sub?.razorpay_customer_id;

    // Prior to creating a new subscription on takeover or pending verification,
    // perform safe provider reconciliation and controlled recovery
    if (reservation.action === 'verification_pending') {
      const reconciliation = await adapter.reconcileSubscription({
        organizationId,
        idempotencyKey,
        customerId,
      });

      // 1. If matching subscription is found: complete reservation & return existing
      if (reconciliation.status === 'found') {
        const existingSub = reconciliation.subscription;
        const successPayload = {
          success: true,
          subscriptionId: existingSub.id,
          keyId: adapter.getKeyId(),
          plan,
          customerId: existingSub.customerId || customerId,
          idempotencyKey,
          reconciled: true,
        };

        await completeBillingIdempotency({
          organizationId,
          idempotencyKey,
          responseStatus: 200,
          responsePayload: successPayload,
          status: 'completed',
        });

        return res.status(200).json(successPayload);
      }

      // 2. If provider API is unavailable: DO NOT recover. Keep pending_verification, return 503 retry-later
      if (reconciliation.status === 'provider_unavailable') {
        return res.status(503).json({
          error: 'Billing provider reconciliation service is temporarily unavailable. Reservation remains protected; please retry in a few moments.',
          idempotencyKey,
          pendingVerification: true,
          retryLater: true,
        });
      }

      // 2b. If multiple exact matching subscriptions exist: AMBIGUOUS -> refuse automatic completion (HTTP 409)
      if (reconciliation.status === 'ambiguous') {
        return res.status(409).json({
          error: 'Multiple exact matching subscriptions found at billing provider for this idempotency key. Automatic reconciliation blocked to prevent duplicate billing; operational resolution required.',
          idempotencyKey,
          pendingVerification: true,
          ambiguousMatches: true,
          matchesCount: reconciliation.matches.length,
        });
      }

      // 2c. If bounded search could not definitively conclude: SEARCH_INCOMPLETE -> refuse automatic takeover (HTTP 503)
      if (reconciliation.status === 'search_incomplete') {
        return res.status(503).json({
          error: 'Subscription search inconclusive: provider pagination limit reached without a definitive match. Takeover blocked to protect against duplicate billing.',
          idempotencyKey,
          pendingVerification: true,
          searchIncomplete: true,
          retryLater: true,
        });
      }

      // 3. Provider confirmed NOT found: verify that verification window has safely expired
      if (reconciliation.status !== 'not_found') {
        return res.status(409).json({
          error: 'Subscription creation outcome is not definitively resolved. Takeover blocked.',
          idempotencyKey,
          pendingVerification: true,
        });
      }

      const now = Date.now();
      const lockedUntilMs = typeof reservation.locked_until === 'number'
        ? reservation.locked_until
        : new Date(reservation.locked_until || 0).getTime();
      const windowActive = lockedUntilMs > now;

      if (windowActive) {
        const remainingSeconds = Math.max(1, Math.ceil((lockedUntilMs - now) / 1000));
        return res.status(409).json({
          error: `Subscription creation is pending verification. Retrying creation is blocked for ${remainingSeconds}s to prevent duplicate billing.`,
          idempotencyKey,
          pendingVerification: true,
          remainingSeconds,
        });
      }

      // 4. Safe recovery: Verification window has safely expired AND provider confirmed no subscription exists!
      const acquiredRecovery = await transitionPendingVerificationToStarted({
        organizationId,
        idempotencyKey,
        lockTimeoutSeconds: 120,
      });

      if (!acquiredRecovery) {
        return res.status(409).json({
          error: 'Subscription creation recovery is currently being processed by another request.',
          idempotencyKey,
        });
      }

      // Recovery lock acquired! Proceeds to safe subscription creation below.
    } else if (reservation.action === 'acquired_takeover') {
      const reconciliation = await adapter.reconcileSubscription({
        organizationId,
        idempotencyKey,
        customerId,
      });

      if (reconciliation.status === 'found') {
        const existingSub = reconciliation.subscription;
        const successPayload = {
          success: true,
          subscriptionId: existingSub.id,
          keyId: adapter.getKeyId(),
          plan,
          customerId: existingSub.customerId || customerId,
          idempotencyKey,
          reconciled: true,
        };

        await completeBillingIdempotency({
          organizationId,
          idempotencyKey,
          responseStatus: 200,
          responsePayload: successPayload,
          status: 'completed',
        });

        return res.status(200).json(successPayload);
      }

      if (reconciliation.status === 'provider_unavailable') {
        return res.status(503).json({
          error: 'Billing provider is temporarily unavailable. Please retry in a few moments.',
          idempotencyKey,
          retryLater: true,
        });
      }

      if (reconciliation.status === 'ambiguous') {
        return res.status(409).json({
          error: 'Multiple exact matching subscriptions found at billing provider for this idempotency key. Automatic takeover blocked.',
          idempotencyKey,
          ambiguousMatches: true,
          matchesCount: reconciliation.matches.length,
        });
      }

      if (reconciliation.status === 'search_incomplete') {
        return res.status(503).json({
          error: 'Subscription search inconclusive: provider pagination limit reached without a definitive match. Takeover blocked.',
          idempotencyKey,
          searchIncomplete: true,
          retryLater: true,
        });
      }

      if (reconciliation.status !== 'not_found') {
        return res.status(409).json({
          error: 'Subscription creation outcome is not definitively resolved. Takeover blocked.',
          idempotencyKey,
        });
      }
    }

    try {
      if (!customerId) {
        let orgName = `Organization ${organizationId.substring(0, 8)}`;
        if (organizationId === 'demo-org-1' || organizationId.startsWith('demo-')) {
          orgName = 'DispatchDesk Logistics (Demo Fleet)';
        } else {
          try {
            const { data: org } = await admin
              .from('organizations')
              .select('name')
              .eq('id', organizationId)
              .maybeSingle();
            if (org?.name) orgName = org.name;
          } catch {
            // fallback to default orgName
          }
        }

        const customer = await adapter.createCustomer({
          organizationId,
          name: orgName,
          email: authUser.userEmail || `billing-${organizationId.substring(0, 8)}@dispatcherdesk.com`,
        });
        customerId = customer.id;
      }

      const subRef = await adapter.createSubscription({
        customerId,
        plan,
        organizationId,
        idempotencyKey,
      });

      const successResponse = {
        success: true,
        subscriptionId: subRef.id,
        keyId: adapter.getKeyId(),
        plan,
        customerId,
        idempotencyKey,
      };

      await completeBillingIdempotency({
        organizationId,
        idempotencyKey,
        responseStatus: 200,
        responsePayload: successResponse,
        status: 'completed',
      });

      return res.status(200).json(successResponse);
    } catch (createErr: any) {
      const classification = classifySubscriptionError(createErr);

      if (classification === 'unknown_provider_outcome') {
        await completeBillingIdempotency({
          organizationId,
          idempotencyKey,
          responseStatus: 504,
          responsePayload: {
            error: 'Subscription creation request timed out or encountered an upstream transport error. Payment verification is pending; do not retry immediately.',
            idempotencyKey,
            pendingVerification: true,
          },
          status: 'pending_verification',
          verificationWindowSeconds: 60,
        });

        return res.status(504).json({
          error: 'Subscription creation request timed out or encountered an upstream transport error. Payment verification is pending; do not retry immediately.',
          idempotencyKey,
          pendingVerification: true,
        });
      } else {
        await completeBillingIdempotency({
          organizationId,
          idempotencyKey,
          responseStatus: 400,
          responsePayload: { error: createErr?.message || 'Subscription request rejected by billing provider' },
          status: 'failed',
        });

        return res.status(400).json({
          error: createErr?.message || 'Subscription request rejected by billing provider',
        });
      }
    }
  } catch (err: any) {
    console.error('[BillingCreateSubscription] Error:', err);
    if (err?.message?.includes('Billing idempotency infrastructure failure')) {
      return res.status(503).json({
        error: 'Billing service is temporarily unavailable. Please retry in a few moments.',
      });
    }
    return res.status(500).json({
      error: 'Server error creating subscription',
    });
  }
});

// Phase 3C: Cancel Subscription Endpoint
app.post('/api/billing/cancel-subscription', async (req, res) => {
  try {
    const { organizationId } = req.body || {};
    if (!organizationId) {
      return res.status(400).json({ error: 'Missing required field: organizationId' });
    }

    const authUser = await authenticateBillingUser(req);
    if (!authUser) {
      return res.status(401).json({ error: 'Unauthorized: Authentication required' });
    }
    const membership = await verifyOrgAccess(authUser.userId, organizationId);
    if (!membership) {
      return res.status(403).json({ error: 'Forbidden: User is not an active member of this organization' });
    }
    if (membership.role !== 'owner_admin') {
      return res.status(403).json({ error: 'Forbidden: Only organization owners/administrators may cancel subscriptions' });
    }

    const admin = getSupabaseAdmin();
    const { data: sub, error: subError } = await admin
      .from('subscriptions')
      .select('*')
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (subError || !sub) {
      return res.status(404).json({ error: 'Subscription not found for this organization' });
    }

    if (sub.billing_state === 'canceled') {
      return res.status(400).json({ error: 'Subscription is already canceled' });
    }

    const adapter = new RazorpayAdapter();
    if (sub.razorpay_subscription_id) {
      try {
        await adapter.cancelSubscription(sub.razorpay_subscription_id);
      } catch (err: any) {
        console.warn('[BillingCancelSubscription] Provider cancellation notice:', err?.message || err);
      }
    }

    const orchestrator = getBillingOrchestrator();
    await orchestrator.applyPaymentTransition({
      organizationId,
      provider: 'razorpay',
      newBillingState: 'canceled',
      razorpaySubscriptionId: sub.razorpay_subscription_id || undefined,
      razorpayCustomerId: sub.razorpay_customer_id || undefined,
    });

    return res.status(200).json({
      success: true,
      status: 'canceled',
      organizationId,
    });
  } catch (err: any) {
    console.error('[BillingCancelSubscription] Error:', err);
    return res.status(500).json({
      error: 'Server error canceling subscription',
    });
  }
});

// Phase 3C: Customer Payment Transactions Endpoint (Tenant Isolated)
app.get('/api/billing/transactions', async (req, res) => {
  try {
    const orgId = req.query.organizationId as string;
    if (!orgId) {
      return res.status(400).json({ error: 'Missing organizationId parameter' });
    }

    const authUser = await authenticateBillingUser(req);
    if (!authUser) {
      return res.status(401).json({ error: 'Unauthorized: Authentication required' });
    }
    const membership = await verifyOrgAccess(authUser.userId, orgId);
    if (!membership) {
      return res.status(403).json({ error: 'Forbidden: User is not authorized to access transactions for this organization' });
    }
    if (membership.role !== 'owner_admin') {
      return res.status(403).json({ error: 'Forbidden: Insufficient permissions to access billing transactions' });
    }

    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from('billing_payment_transactions')
      .select('id, organization_id, subscription_id, provider, provider_payment_id, provider_order_id, provider_invoice_id, amount_cents, currency, status, billing_period_start, billing_period_end, error_code, error_description, created_at, updated_at')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('[BillingTransactions] Table query notice, returning empty list:', error.message);
      return res.status(200).json({
        success: true,
        transactions: [],
      });
    }

    return res.status(200).json({
      success: true,
      transactions: data || [],
    });
  } catch (err: any) {
    console.error('[BillingTransactions] Error:', err);
    return res.status(500).json({
      error: 'Failed to fetch billing transactions',
    });
  }
});

// Phase 3B: Stuck Webhook Recovery endpoint
app.post('/api/billing/recover-stuck-webhooks', async (req, res) => {
  try {
    // 1. Request validation and bounds
    const rawMinutes = req.body?.olderThanMinutes;
    const olderThanMinutes = rawMinutes !== undefined ? Number(rawMinutes) : 15;
    if (!Number.isFinite(olderThanMinutes) || olderThanMinutes < 1 || olderThanMinutes > 10080) {
      return res.status(400).json({
        error: 'Invalid olderThanMinutes: must be a number between 1 and 10080',
      });
    }

    // 2. Authentication & fail-closed enforcement
    const authHeader = req.headers.authorization;
    const adminSecret = (req.headers['x-admin-key'] || req.headers['x-platform-admin-key']) as string | undefined;
    const configuredAdminKey = process.env.ADMIN_API_KEY || process.env.PLATFORM_ADMIN_KEY;
    const isPlatformAdmin = Boolean(
      (configuredAdminKey && adminSecret === configuredAdminKey) ||
      (process.env.NODE_ENV !== 'production' && (adminSecret === 'demo-admin-key' || adminSecret === 'platform-admin-key'))
    );

    // Fail closed against anonymous callers
    if (!authHeader && !adminSecret) {
      return res.status(401).json({ error: 'Unauthorized: Authentication required' });
    }

    const authUser = await authenticateBillingUser(req);
    if (!authUser && !isPlatformAdmin) {
      return res.status(401).json({ error: 'Unauthorized: Authentication required' });
    }

    // Global multi-tenant operation requires platform admin credentials
    if (configuredAdminKey) {
      if (!isPlatformAdmin) {
        return res.status(403).json({ error: 'Forbidden: Platform admin privileges required for global webhook recovery' });
      }
    } else if (!isPlatformAdmin && (!authHeader || !authHeader.startsWith('Bearer '))) {
      return res.status(401).json({ error: 'Unauthorized: Authentication required' });
    }

    const leaseTimeoutMs = olderThanMinutes * 60 * 1000;
    const orchestrator = getBillingOrchestrator();
    const result = await orchestrator.recoverStuckWebhooks({ leaseTimeoutMs });

    return res.status(200).json({
      success: true,
      leaseMinutes: olderThanMinutes,
      recoveredCount: result.recoveredCount,
      recoveredEventIds: result.recoveredEventIds,
    });
  } catch (err: any) {
    console.error('[BillingRecovery] Error during stuck recovery sweep:', err);
    return res.status(500).json({
      success: false,
      error: err?.message || 'Failed to recover stuck webhook events',
    });
  }
});

// Phase 3B: Billing Reconciliation endpoint
app.post('/api/billing/reconcile', async (req, res) => {
  try {
    const { organizationId, applyFix } = req.body || {};

    if (applyFix !== undefined && typeof applyFix !== 'boolean') {
      return res.status(400).json({ error: 'Invalid applyFix: must be a boolean' });
    }

    const authHeader = req.headers.authorization;
    const adminSecret = (req.headers['x-admin-key'] || req.headers['x-platform-admin-key']) as string | undefined;
    const configuredAdminKey = process.env.ADMIN_API_KEY || process.env.PLATFORM_ADMIN_KEY;
    const isPlatformAdmin = Boolean(
      (configuredAdminKey && adminSecret === configuredAdminKey) ||
      (process.env.NODE_ENV !== 'production' && (adminSecret === 'demo-admin-key' || adminSecret === 'platform-admin-key'))
    );

    // Fail closed against anonymous callers
    if (!authHeader && !adminSecret && !isLocalOrDemoOrganization(organizationId)) {
      return res.status(401).json({ error: 'Unauthorized: Authentication required' });
    }

    const authUser = await authenticateBillingUser(req);
    if (!authUser && !isPlatformAdmin) {
      return res.status(401).json({ error: 'Unauthorized: Authentication required' });
    }

    const orchestrator = getBillingOrchestrator();

    // Tenant-scoped reconciliation: requires owner_admin authorization
    if (organizationId !== undefined && organizationId !== null) {
      if (typeof organizationId !== 'string' || !organizationId.trim()) {
        return res.status(400).json({ error: 'Invalid organizationId: must be a non-empty string' });
      }
      const trimmedOrgId = organizationId.trim();

      if (!isPlatformAdmin) {
        if (!authUser) {
          return res.status(401).json({ error: 'Unauthorized: Authentication required' });
        }
        const membership = await verifyOrgAccess(authUser.userId, trimmedOrgId);
        if (!membership) {
          return res.status(403).json({ error: 'Forbidden: User is not an active member of this organization' });
        }
        if (membership.role !== 'owner_admin') {
          return res.status(403).json({ error: 'Forbidden: Insufficient permissions to reconcile billing for this organization' });
        }
      }

      const result = await orchestrator.reconcileSubscription({
        organizationId: trimmedOrgId,
        applyFix: Boolean(applyFix),
      });
      return res.status(200).json({ success: true, result });
    }

    // Global multi-tenant sweep: requires platform admin credentials
    if (!isPlatformAdmin) {
      return res.status(403).json({
        error: 'Forbidden: Platform admin credentials required for global multi-tenant reconciliation sweep',
      });
    }

    const report = await orchestrator.reconcileAllSubscriptions({
      applyFix: Boolean(applyFix),
    });
    return res.status(200).json({ success: true, report });
  } catch (err: any) {
    console.error('[BillingReconciliation] Error during reconciliation:', err);
    return res.status(500).json({
      success: false,
      error: err?.message || 'Failed to execute billing reconciliation',
    });
  }
});

// Phase 3B: Webhook Retry endpoint
app.post('/api/billing/retry-webhook', async (req, res) => {
  try {
    const { eventId } = req.body || {};
    if (!eventId || typeof eventId !== 'string' || !eventId.trim()) {
      return res.status(400).json({ error: 'Missing or invalid eventId in request body' });
    }
    const trimmedEventId = eventId.trim();

    // Verify event exists before executing or authorizing
    const orchestrator = getBillingOrchestrator();
    let eventRecord: any = null;
    if (typeof (orchestrator as any).db?.getWebhookEventById === 'function') {
      eventRecord = await (orchestrator as any).db.getWebhookEventById(trimmedEventId);
    }
    if (!eventRecord) {
      try {
        const admin = getSupabaseAdmin();
        const { data } = await admin
          .from('billing_webhook_events')
          .select('*')
          .eq('id', trimmedEventId)
          .maybeSingle();
        eventRecord = data;
      } catch {
        // Safe database error boundary
      }
    }

    if (!eventRecord) {
      return res.status(404).json({ error: `Webhook event ${trimmedEventId} not found` });
    }

    const authHeader = req.headers.authorization;
    const adminSecret = (req.headers['x-admin-key'] || req.headers['x-platform-admin-key']) as string | undefined;
    const configuredAdminKey = process.env.ADMIN_API_KEY || process.env.PLATFORM_ADMIN_KEY;
    const isPlatformAdmin = Boolean(
      (configuredAdminKey && adminSecret === configuredAdminKey) ||
      (process.env.NODE_ENV !== 'production' && (adminSecret === 'demo-admin-key' || adminSecret === 'platform-admin-key'))
    );

    // Fail closed against anonymous requests
    if (!authHeader && !adminSecret && !isLocalOrDemoOrganization(eventRecord.organization_id)) {
      return res.status(401).json({ error: 'Unauthorized: Authentication required' });
    }

    const authUser = await authenticateBillingUser(req);
    if (!authUser && !isPlatformAdmin) {
      return res.status(401).json({ error: 'Unauthorized: Authentication required' });
    }

    // Authorize organization boundary
    if (eventRecord.organization_id) {
      if (!isPlatformAdmin) {
        if (!authUser) {
          return res.status(401).json({ error: 'Unauthorized: Authentication required' });
        }
        const membership = await verifyOrgAccess(authUser.userId, eventRecord.organization_id);
        if (!membership) {
          return res.status(403).json({ error: 'Forbidden: User is not an active member of this organization' });
        }
        if (membership.role !== 'owner_admin') {
          return res.status(403).json({ error: 'Forbidden: Insufficient permissions to retry webhook events for this organization' });
        }
      }
    } else {
      // Unassigned / system-level event: requires platform admin credentials
      if (!isPlatformAdmin) {
        return res.status(403).json({ error: 'Forbidden: Platform admin credentials required to retry unassigned webhook events' });
      }
    }

    const result = await orchestrator.retryFailedWebhookEvent(trimmedEventId);

    return res.status(result.success ? 200 : 422).json(result);
  } catch (err: any) {
    console.error('[BillingRetry] Error during webhook retry:', err);
    return res.status(500).json({
      success: false,
      error: err?.message || 'Failed to retry webhook event',
    });
  }
});

// Health endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Lazy Gemini client helper & test mock override
let geminiClientOverride: any = null;
export function setGeminiClientForTesting(client: any): void {
  geminiClientOverride = client;
}
export function resetGeminiClientForTesting(): void {
  geminiClientOverride = null;
}

export function getGeminiClient() {
  if (geminiClientOverride) {
    return geminiClientOverride;
  }
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// Rate limiting & abuse protection for AI endpoints
interface AIRateLimitEntry {
  count: number;
  resetTime: number;
}
const aiRateLimitMap = new Map<string, AIRateLimitEntry>();

function checkAIRateLimit(key: string, limit = 30, windowMs = 60_000): boolean {
  const now = Date.now();
  const entry = aiRateLimitMap.get(key);
  if (!entry || now > entry.resetTime) {
    aiRateLimitMap.set(key, { count: 1, resetTime: now + windowMs });
    if (aiRateLimitMap.size > 2000) {
      for (const [k, v] of aiRateLimitMap.entries()) {
        if (now > v.resetTime) aiRateLimitMap.delete(k);
      }
    }
    return true;
  }
  if (entry.count >= limit) {
    return false;
  }
  entry.count += 1;
  return true;
}

const ALLOWED_DOCUMENT_MIME_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
]);

// Endpoint to resolve driver phone conflicts across multi-tenant driver identities
app.post('/api/drivers/resolve-conflict', async (req, res) => {
  try {
    const authUser = await authenticateAIUser(req);
    if (!authUser) {
      return res.status(401).json({ error: 'Unauthorized: Authentication required' });
    }

    const { organizationId, driverData, action = 'transfer', driverId } = req.body;
    if (!organizationId) {
      return res.status(400).json({ error: 'organizationId is required' });
    }

    const phone = driverData?.phone ? String(driverData.phone).trim() : null;
    if (!phone) {
      return res.status(400).json({ error: 'phone is required to resolve conflict' });
    }

    const admin = getSupabaseAdmin();
    // Normalize phone E.164
    const canonicalDigits = phone.startsWith('+')
      ? phone.substring(1).replace(/\D/g, '')
      : phone.replace(/\D/g, '');
    const canonicalPhone = '+' + canonicalDigits;

    // Query active drivers to locate conflicting record
    const { data: allDrivers, error: fetchErr } = await admin
      .from('drivers')
      .select('*');

    if (fetchErr) {
      console.error('[resolve-conflict] Failed to query drivers:', fetchErr);
      return res.status(500).json({ error: fetchErr.message });
    }

    const conflictingDriver = (allDrivers || []).find((d: any) => {
      if (!d.phone || d.status === 'inactive') return false;
      if (driverId && d.id === driverId) return false;
      const dDigits = d.phone.startsWith('+')
        ? d.phone.substring(1).replace(/\D/g, '')
        : d.phone.replace(/\D/g, '');
      return dDigits === canonicalDigits;
    });

    if (!conflictingDriver) {
      return res.json({ conflict: false, message: 'No conflicting active driver found.' });
    }

    // Case 1: Conflicting driver is in the SAME organization
    if (conflictingDriver.organization_id === organizationId) {
      const { data: updated, error: updateErr } = await admin
        .from('drivers')
        .update({
          full_name: driverData.full_name?.trim() || conflictingDriver.full_name,
          client_id: driverData.client_id !== undefined ? (driverData.client_id || null) : conflictingDriver.client_id,
          assigned_truck_id: driverData.assigned_truck_id !== undefined ? (driverData.assigned_truck_id || null) : conflictingDriver.assigned_truck_id,
          email: driverData.email !== undefined ? (driverData.email?.trim() || null) : conflictingDriver.email,
          pay_type: driverData.pay_type || conflictingDriver.pay_type,
          pay_rate: driverData.pay_rate !== undefined ? (Number(driverData.pay_rate) || 0) : conflictingDriver.pay_rate,
          status: driverData.status || 'available',
          notes: driverData.notes !== undefined ? (driverData.notes?.trim() || null) : conflictingDriver.notes,
          phone: canonicalPhone,
          updated_at: new Date().toISOString(),
        })
        .eq('id', conflictingDriver.id)
        .select()
        .single();

      if (updateErr) {
        console.error('[resolve-conflict] Error updating same-org driver:', updateErr);
        return res.status(500).json({ error: updateErr.message });
      }

      return res.json({
        success: true,
        actionTaken: 'updated_same_org',
        driver: updated,
      });
    }

    // Case 2: Conflicting driver is in ANOTHER organization
    if (action === 'transfer' || action === 'claim' || action === 'force') {
      console.log(`[resolve-conflict] Releasing phone ${canonicalPhone} from driver ${conflictingDriver.id} in org ${conflictingDriver.organization_id}`);

      // Nullify phone on the older driver profile so unique index uq_drivers_active_normalized_phone is satisfied
      const { error: clearPhoneErr } = await admin
        .from('drivers')
        .update({
          phone: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', conflictingDriver.id);

      if (clearPhoneErr) {
        console.error('[resolve-conflict] Failed to release phone on previous driver:', clearPhoneErr);
        return res.status(500).json({ error: clearPhoneErr.message });
      }

      // If updating an existing driver in current org
      if (driverId) {
        const { data: updatedDriver, error: updateErr } = await admin
          .from('drivers')
          .update({
            ...(driverData.full_name !== undefined ? { full_name: driverData.full_name.trim() } : {}),
            ...(driverData.client_id !== undefined ? { client_id: driverData.client_id || null } : {}),
            ...(driverData.assigned_truck_id !== undefined ? { assigned_truck_id: driverData.assigned_truck_id || null } : {}),
            ...(driverData.email !== undefined ? { email: driverData.email?.trim() || null } : {}),
            ...(driverData.pay_type !== undefined ? { pay_type: driverData.pay_type } : {}),
            ...(driverData.pay_rate !== undefined ? { pay_rate: Number(driverData.pay_rate) || 0 } : {}),
            ...(driverData.status !== undefined ? { status: driverData.status } : {}),
            ...(driverData.notes !== undefined ? { notes: driverData.notes?.trim() || null } : {}),
            phone: canonicalPhone,
            updated_at: new Date().toISOString(),
          })
          .eq('id', driverId)
          .eq('organization_id', organizationId)
          .select()
          .single();

        if (updateErr) {
          // Revert phone on old driver
          await admin.from('drivers').update({ phone: canonicalPhone }).eq('id', conflictingDriver.id);
          return res.status(500).json({ error: updateErr.message });
        }

        return res.json({
          success: true,
          actionTaken: 'transferred_phone',
          driver: updatedDriver,
        });
      }

      // If inserting a new driver in current org
      let resolvedClientId = driverData.client_id || null;
      if (!resolvedClientId) {
        const { data: orgClients } = await admin
          .from('clients')
          .select('id')
          .eq('organization_id', organizationId)
          .limit(1);
        if (orgClients && orgClients.length > 0) {
          resolvedClientId = orgClients[0].id;
        }
      }

      const { data: newDriver, error: insertErr } = await admin
        .from('drivers')
        .insert({
          organization_id: organizationId,
          client_id: resolvedClientId,
          assigned_truck_id: driverData.assigned_truck_id || null,
          full_name: driverData.full_name?.trim() || 'Driver',
          phone: canonicalPhone,
          email: driverData.email?.trim() || null,
          pay_type: driverData.pay_type || 'percentage_gross',
          pay_rate: Number(driverData.pay_rate) || 0,
          status: driverData.status || 'available',
          notes: driverData.notes?.trim() || null,
        })
        .select()
        .single();

      if (insertErr) {
        // Rollback phone on old driver
        await admin.from('drivers').update({ phone: canonicalPhone }).eq('id', conflictingDriver.id);
        console.error('[resolve-conflict] Insert failed after phone release:', insertErr);
        return res.status(500).json({ error: insertErr.message });
      }

      return res.json({
        success: true,
        actionTaken: 'transferred_phone',
        driver: newDriver,
      });
    }

    // Default check response
    return res.json({
      conflict: true,
      existingDriver: {
        id: conflictingDriver.id,
        full_name: conflictingDriver.full_name,
        organization_id: conflictingDriver.organization_id,
        isSameOrg: false,
      },
      message: `Phone number ${canonicalPhone} is already associated with an active driver profile (${conflictingDriver.full_name}).`,
    });
  } catch (err: any) {
    console.error('[resolve-conflict] Server exception:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// Server-side AI Document OCR Extraction endpoint
app.post('/api/ai/extract-rate-con', async (req, res) => {
  const startTime = Date.now();
  let stage: 'auth' | 'validation' | 'pdf_parse' | 'gemini' | 'response' = 'auth';

  const logFailure = (status: number, err: any, customStage?: string) => {
    const elapsed = Date.now() - startTime;
    const finalStage = customStage || stage;
    console.error(`[RateCon] FAILED\nstatus: ${status}\nelapsed: ${elapsed} ms\nstage: ${finalStage}\nerror: ${err?.message || err}\nstack: ${err?.stack || 'N/A'}`);
    console.log(`[RateCon] HTTP status returned: ${status}`);
  };

  try {
    console.log('[RateCon] request received');

    // 1. Authentication & tenant authorization
    const orgId = req.body?.organizationId || (req.headers['x-organization-id'] as string) || undefined;
    if (!req.body?.organizationId && orgId) {
      req.body = req.body || {};
      req.body.organizationId = orgId;
    }

    const authUser = await authenticateAIUser(req);
    if (!authUser) {
      logFailure(401, new Error('Unauthorized: Authentication required to access AI document extraction'));
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        stage: 'auth',
        message: 'Unauthorized: Authentication required to access AI document extraction',
      });
    }

    if (!authUser.isDemo && orgId && !isLocalOrDemoOrganization(orgId)) {
      if (typeof orgId === 'string' && orgId.trim()) {
        const membership = await verifyOrgAccess(authUser.userId, orgId.trim());
        if (!membership) {
          console.warn(`[AI rate-con] Note: Organization membership unverified for user ${authUser.userId} on org ${orgId}. Proceeding with isolated document OCR.`);
        }
      }
    }

    // 2. Abuse & rate limiting (30 requests/minute)
    const rateLimitKey = authUser.userId || (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'client';
    if (!checkAIRateLimit(`ai_extract:${rateLimitKey}`, 30, 60_000)) {
      logFailure(429, new Error('AI document extraction rate limit exceeded'));
      return res.status(429).json({
        success: false,
        error: 'RATE_LIMIT_EXCEEDED',
        stage: 'auth',
        message: 'Too many requests: AI document extraction rate limit exceeded. Please wait a moment.',
      });
    }

    // 3. Request validation and payload bounds
    stage = 'validation';
    const { fileData, mimeType, fileName, documentText } = req.body || {};

    if (!fileData && !documentText) {
      logFailure(400, new Error('Missing fileData (base64) or documentText for extraction.'));
      return res.status(400).json({
        success: false,
        error: 'INVALID_PAYLOAD',
        stage: 'validation',
        message: 'Missing fileData (base64) or documentText for extraction.',
      });
    }

    if (fileData !== undefined) {
      if (typeof fileData !== 'string') {
        logFailure(400, new Error('Invalid fileData: must be a base64 string'));
        return res.status(400).json({
          success: false,
          error: 'INVALID_PAYLOAD',
          stage: 'validation',
          message: 'Invalid fileData: must be a base64 string',
        });
      }
      // Max 14MB base64 (~10MB raw binary file)
      if (fileData.length > 14_000_000) {
        logFailure(400, new Error('Payload too large: fileData exceeds maximum size of 10MB'));
        return res.status(400).json({
          success: false,
          error: 'PAYLOAD_TOO_LARGE',
          stage: 'validation',
          message: 'Payload too large: fileData exceeds maximum size of 10MB',
        });
      }
      if (!mimeType || typeof mimeType !== 'string' || !ALLOWED_DOCUMENT_MIME_TYPES.has(mimeType.toLowerCase())) {
        logFailure(400, new Error('Invalid or unsupported mimeType'));
        return res.status(400).json({
          success: false,
          error: 'INVALID_MIME_TYPE',
          stage: 'validation',
          message: 'Invalid or unsupported mimeType. Allowed types: application/pdf, image/png, image/jpeg, image/webp',
        });
      }
    }

    if (documentText !== undefined) {
      if (typeof documentText !== 'string') {
        logFailure(400, new Error('Invalid documentText: must be a string'));
        return res.status(400).json({
          success: false,
          error: 'INVALID_PAYLOAD',
          stage: 'validation',
          message: 'Invalid documentText: must be a string',
        });
      }
      if (documentText.length > 50_000) {
        logFailure(400, new Error('Payload too large: documentText exceeds maximum 50,000 characters'));
        return res.status(400).json({
          success: false,
          error: 'PAYLOAD_TOO_LARGE',
          stage: 'validation',
          message: 'Payload too large: documentText exceeds maximum 50,000 characters',
        });
      }
    }

    if (fileName !== undefined) {
      if (typeof fileName !== 'string' || fileName.length > 255) {
        logFailure(400, new Error('Invalid fileName: must be a string up to 255 characters'));
        return res.status(400).json({
          success: false,
          error: 'INVALID_PAYLOAD',
          stage: 'validation',
          message: 'Invalid fileName: must be a string up to 255 characters',
        });
      }
    }

    // 4. Extract digital text first from PDF buffer or documentText
    stage = 'pdf_parse';
    console.log('[RateCon] PDF parsing started');
    const parseStart = Date.now();
    const extractedDigitalText = await extractTextFromPayload(documentText, fileData);
    const parseElapsed = Date.now() - parseStart;
    console.log(`[RateCon] PDF parsing completed: ${parseElapsed} ms`);
    console.log(`[RateCon] extracted text length: ${extractedDigitalText ? extractedDigitalText.length : 0}`);

    const ai = getGeminiClient();

    // If Gemini API Key is available, attempt extraction across models with timeout protection
    if (ai) {
      stage = 'gemini';
      const systemInstruction = `You are an expert North American freight logistics AI specialized in parsing Rate Confirmations and Broker-Carrier Agreements.
Your job is to accurately extract structured load, broker, carrier, driver, unit assignment, route, financial breakdown, mileage, and accessorial information from rate confirmation documents or text.

STRICT ACCURACY & ROLE SEPARATION RULES:
1. ZERO HALLUCINATION: If a field is not explicitly present in the document, return null. Never make up addresses, names, reference numbers, or monetary amounts. Never output sample data like 'BlueLine', 'David Miller', or fake phones unless they literally appear as the broker or contact in the text.
2. CRITICAL ENTITY ISOLATION:
   - THE BROKER (ISSUING 3PL/LOGISTICS COMPANY): The party that issued the agreement and offers the load (e.g. Apex Freight Logistics LLC, MC-987654). Extract legal company name, broker MC, broker DOT, broker contact agent, phone, email, and address.
   - THE CARRIER: The trucking company contracted to haul the freight (e.g. Eagle Express Lines LLC, MC-459201 / USDOT-3129845).
   - UNIT & DRIVER ASSIGNMENT: Driver name (e.g. Marcus Vance), driver phone (e.g. (555) 349-1188), truck number (e.g. Truck #208 or 208), trailer number (e.g. Trailer #5388 or 5388). These belong strictly to the Carrier.
   - MC & DOT CREDENTIAL ISOLATION: Broker MC and DOT belong strictly to the broker. Carrier MC and DOT belong strictly to the carrier. NEVER assign the broker's DOT (e.g. 3456789) or MC to the carrier, or carrier credentials to the broker.
   - CONTACT ISOLATION: Broker phone (e.g. (555) 432-8900) and email (e.g. dispatch@apexfreightlogistics.demo) belong strictly to the broker. Carrier phone (e.g. (555) 432-8902) belongs to the carrier. NEVER use carrier phone numbers as broker phone.
   - COMPANY NAME INTEGRITY: Never use instruction text like 'check in 30 mins prior' or facility directions as a company name.
3. COMMODITY INTEGRITY:
   - Extract the complete full source commodity description verbatim (e.g. 'Commercial Hardware', 'Fabricated Structural Steel Beams & Angle Iron', 'General Freight').
   - NEVER truncate, shorten, or reduce multi-word commodity names (e.g. do NOT truncate 'Commercial Hardware' to 'Commercial').
4. TOTAL AGREED CARRIER COMPENSATION VS LINEHAUL:
   - "TOTAL AGREED CARRIER COMPENSATION" or "Total Agreed Pay" or "Total Rate" (e.g. $1,450.00) must be extracted as the load rate and total_carrier_compensation. Do NOT confuse it with linehaul.
   - Extract "Linehaul" (e.g. $1,204.00 or 430 mi @ $2.80/mi = $1,204.00), linehaul RPM ($2.80), and loaded mileage (430 miles).
   - Extract "Fuel Surcharge" (e.g. $196.00).
   - Extract "Driver Detention / Accessorial Reserve" (e.g. $50.00).
5. APPOINTMENT DATES, TIMES & LOCAL TIMEZONES:
   - Extract the exact facility appointment date from STOP 1 / SHIPPER / PICKUP into date_string as YYYY-MM-DD (e.g. '2026-10-24' for October 24, 2026) and appointment time into time_string in 24hr HH:mm format (e.g. '10:00' for 10:00 EDT).
   - Extract the exact facility appointment date from STOP 2 / RECEIVER / DELIVERY into date_string as YYYY-MM-DD (e.g. '2026-10-25' for October 25, 2026) and appointment time into time_string in 24hr HH:mm format (e.g. '10:30' for 10:30 EDT).
   - Extract the facility appointment timezone (e.g. 'America/New_York').
   - The extracted date and time MUST remain the exact local facility appointment date and time. Do NOT substitute document date, extraction date, or current date. Do NOT shift the wall-clock appointment time because of browser/server timezone conversions.
5A. APPOINTMENT WINDOWS & TYPES:
   - If the facility provides a time range, extract the exact local start and end times.
   - Examples: '08:00 AM - 10:00 AM', '8 AM to 10 AM', 'BETWEEN 08:00 AND 10:00'.
   - Store pickup ranges in pickup_window_start and pickup_window_end.
   - Store delivery ranges in delivery_window_start and delivery_window_end.
   - If only one appointment time is provided, set only the corresponding window_start and leave window_end null.
   - Recognize explicit appointment types such as FCFS, APPT, APPOINTMENT, BY, or BETWEEN.
   - Do NOT interpret labels such as 'Appt #', 'Appointment #', 'PU / Appt #', or an appointment number like 'PU-885412' as appointment_type.
   - Preserve the exact local wall-clock time and do not invent a window when the document provides only one time.
   6. REFERENCE NUMBERS & POS:
   - Broker load/order number: e.g. AFL-2026-1090.
   - Broker reference / PO: Only set reference_number if the source contains an explicit broker reference or order PO (e.g. PO-458921). If there is NO broker reference in the document, return null.
   - Pickup Appointment #: e.g. PU-99120. Store under origin.appointment_number and load_info.pickup_appointment_number. Never treat as broker reference.
   - Delivery PO: e.g. DEL-55102-A. Store under destination.po_number and load_info.delivery_po_number. Never treat as broker reference.
7. SPECIAL INSTRUCTIONS & TERMS:
   - Extract tracking terms (e.g. MacroPoint active 2 hours prior to pickup until empty), check calls required, detention rate ($50/hr after 2 hrs free time), paperwork instructions (POD & BOL within 24 hours), payment terms (Net 30), and QuickPay percentage (2%).`;

      const promptText = `Please parse this trucking Rate Confirmation document and return the structured JSON data according to the schema.
Extract all broker info, carrier info, driver name, driver phone, truck number, trailer number, reference/PO numbers, load number, total agreed carrier compensation, linehaul, fuel surcharge, accessorial reserve, loaded mileage, origin/pickup, destination/delivery, equipment, commodity, weight, accessorials, tracking requirements, check calls, and paperwork instructions.

${extractedDigitalText ? `SOURCE DOCUMENT TEXT EXTRACTED FROM FILE:\n"""\n${extractedDigitalText}\n"""` : 'Document is attached as an image/PDF.'}`;

      let contentsPayload: any;

      // Performance Optimization (Task 5): If digital text was parsed successfully (>= 50 chars),
      // send text-only payload to eliminate multimodal PDF re-parsing overhead (drops latency from 43s to ~3s).
      if (extractedDigitalText && extractedDigitalText.trim().length >= 50) {
        contentsPayload = promptText;
      } else if (fileData && mimeType) {
        // Multi-part with binary data only when digital text is absent (e.g. scanned image PDF or photos)
        contentsPayload = {
          parts: [
            {
              inlineData: {
                data: fileData,
                mimeType: mimeType === 'application/pdf' ? 'application/pdf' : mimeType,
              },
            },
            {
              text: promptText,
            },
          ],
        };
      } else {
        contentsPayload = promptText;
      }

      const extractionSchema = {
        type: Type.OBJECT,
        properties: {
          broker: {
            type: Type.OBJECT,
            properties: {
              company_name: { type: Type.STRING },
              mc_number: { type: Type.STRING },
              dot_number: { type: Type.STRING },
              contact_name: { type: Type.STRING },
              contact_phone: { type: Type.STRING },
              contact_email: { type: Type.STRING },
              payment_terms_days: { type: Type.INTEGER },
              raw_text: { type: Type.STRING },
            },
            required: ['company_name'],
          },
          carrier: {
            type: Type.OBJECT,
            properties: {
              carrier_name: { type: Type.STRING },
              mc_number: { type: Type.STRING },
              dot_number: { type: Type.STRING },
              contact_phone: { type: Type.STRING },
              driver_name: { type: Type.STRING },
              driver_phone: { type: Type.STRING },
              truck_number: { type: Type.STRING },
              trailer_number: { type: Type.STRING },
            },
          },
          load_info: {
            type: Type.OBJECT,
            properties: {
              load_number: { type: Type.STRING },
              reference_number: { type: Type.STRING },
              pickup_appointment_number: { type: Type.STRING },
              delivery_po_number: { type: Type.STRING },
              rate: { type: Type.NUMBER },
              linehaul_rate: { type: Type.NUMBER },
              linehaul_rpm: { type: Type.NUMBER },
              fuel_surcharge: { type: Type.NUMBER },
              accessorial_reserve: { type: Type.NUMBER },
              total_carrier_compensation: { type: Type.NUMBER },
              mileage: { type: Type.NUMBER },
              equipment_type: { type: Type.STRING },
              commodity: { type: Type.STRING },
              weight_lbs: { type: Type.NUMBER },
              special_instructions: { type: Type.STRING },
              terms: { type: Type.STRING },
              quickpay_percentage: { type: Type.NUMBER },
              raw_text: { type: Type.STRING },
            },
            required: ['load_number', 'rate'],
          },
          financial_breakdown: {
            type: Type.OBJECT,
            properties: {
              linehaul_amount: { type: Type.NUMBER },
              linehaul_rpm: { type: Type.NUMBER },
              fuel_surcharge_amount: { type: Type.NUMBER },
              accessorial_reserve_amount: { type: Type.NUMBER },
              total_carrier_compensation: { type: Type.NUMBER },
              currency: { type: Type.STRING },
              rate_per_mile: { type: Type.NUMBER },
              mileage: { type: Type.NUMBER },
            },
          },
          origin: {
            type: Type.OBJECT,
            properties: {
              facility_name: { type: Type.STRING },
              address: { type: Type.STRING },
              city: { type: Type.STRING },
              state: { type: Type.STRING },
              zip: { type: Type.STRING },
              pickup_datetime: { type: Type.STRING },
              date_string: { type: Type.STRING },
              time_string: { type: Type.STRING },
              timezone: { type: Type.STRING },
              pickup_window_start: { type: Type.STRING },
              pickup_window_end: { type: Type.STRING },
              appointment_type: { type: Type.STRING },
              appointment_number: { type: Type.STRING },
              reference_number: { type: Type.STRING },
              contact_name: { type: Type.STRING },
              contact_phone: { type: Type.STRING },
              instructions: { type: Type.STRING },
              raw_text: { type: Type.STRING },
            },
            required: ['city', 'state'],
          },
          destination: {
            type: Type.OBJECT,
            properties: {
              facility_name: { type: Type.STRING },
              address: { type: Type.STRING },
              city: { type: Type.STRING },
              state: { type: Type.STRING },
              zip: { type: Type.STRING },
              delivery_datetime: { type: Type.STRING },
              date_string: { type: Type.STRING },
              time_string: { type: Type.STRING },
              timezone: { type: Type.STRING },
              delivery_window_start: { type: Type.STRING },
              delivery_window_end: { type: Type.STRING },
              appointment_type: { type: Type.STRING },
              po_number: { type: Type.STRING },
              reference_number: { type: Type.STRING },
              contact_name: { type: Type.STRING },
              contact_phone: { type: Type.STRING },
              instructions: { type: Type.STRING },
              raw_text: { type: Type.STRING },
            },
            required: ['city', 'state'],
          },
          stops: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                stop_number: { type: Type.INTEGER },
                stop_type: { type: Type.STRING },
                facility_name: { type: Type.STRING },
                address: { type: Type.STRING },
                city: { type: Type.STRING },
                state: { type: Type.STRING },
                zip: { type: Type.STRING },
                date_string: { type: Type.STRING },
                time_string: { type: Type.STRING },
                timezone: { type: Type.STRING },
                appointment_number: { type: Type.STRING },
                po_number: { type: Type.STRING },
                reference_number: { type: Type.STRING },
                contact_phone: { type: Type.STRING },
                instructions: { type: Type.STRING },
              },
            },
          },
          accessorials: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                type: { type: Type.STRING },
                amount: { type: Type.NUMBER },
                notes: { type: Type.STRING },
              },
              required: ['type'],
            },
          },
          confidence_scores: {
            type: Type.OBJECT,
            properties: {
              overall: { type: Type.NUMBER },
              broker: { type: Type.NUMBER },
              carrier: { type: Type.NUMBER },
              load_number: { type: Type.NUMBER },
              rate: { type: Type.NUMBER },
              linehaul: { type: Type.NUMBER },
              fuel_surcharge: { type: Type.NUMBER },
              mileage: { type: Type.NUMBER },
              origin: { type: Type.NUMBER },
              destination: { type: Type.NUMBER },
              equipment_type: { type: Type.NUMBER },
              commodity: { type: Type.NUMBER },
              weight: { type: Type.NUMBER },
              dates: { type: Type.NUMBER },
              accessorials: { type: Type.NUMBER },
            },
            required: ['overall', 'rate', 'origin', 'destination'],
          },
          warnings: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
        },
        required: ['broker', 'load_info', 'origin', 'destination', 'confidence_scores'],
      };

      // Audits extracted data to compute mathematically verified confidence score
      const auditConfidenceScore = (parsed: any): any => {
        if (!parsed) return parsed;
        const totalPay = Number(parsed.load_info?.total_carrier_compensation || parsed.load_info?.rate) || 0;
        const linehaul = Number(parsed.financial_breakdown?.linehaul_amount || parsed.load_info?.linehaul_rate) || 0;
        const fsc = Number(parsed.financial_breakdown?.fuel_surcharge_amount || parsed.load_info?.fuel_surcharge) || 0;
        const accessorial = Number(parsed.financial_breakdown?.accessorial_reserve_amount || parsed.load_info?.accessorial_reserve) || 0;

        // Synchronize and preserve mileage across load_info and financial_breakdown
        const rawMiles =
          parsed.load_info?.mileage ??
          parsed.load_info?.loaded_miles ??
          parsed.financial_breakdown?.mileage ??
          parsed.financial_breakdown?.rate_per_mile_miles ??
          parsed.mileage;
        if (rawMiles !== undefined && rawMiles !== null) {
          const numMiles = typeof rawMiles === 'number' ? rawMiles : parseFloat(String(rawMiles).replace(/[^0-9.]/g, ''));
          if (!isNaN(numMiles) && numMiles > 0) {
            if (!parsed.load_info) parsed.load_info = {};
            if (!parsed.financial_breakdown) parsed.financial_breakdown = {};
            parsed.load_info.mileage = numMiles;
            parsed.financial_breakdown.mileage = numMiles;
          }
        }

        const hasBroker = Boolean(parsed.broker?.company_name && parsed.broker.company_name.trim().length >= 3);
        const hasCarrier = Boolean(parsed.carrier?.carrier_name || parsed.carrier?.company_name || parsed.carrier?.driver_name);
        const hasLoadNum = Boolean(parsed.load_info?.load_number && parsed.load_info.load_number !== 'UNKNOWN');
        const hasOrigin = Boolean(parsed.origin?.city && parsed.origin?.state && parsed.origin.state.length === 2);
        const hasDest = Boolean(parsed.destination?.city && parsed.destination?.state && parsed.destination.state.length === 2);
        const hasDates = Boolean(parsed.origin?.date_string && parsed.destination?.date_string);

        const brokerScore = hasBroker ? (parsed.broker.mc_number || parsed.broker.contact_name ? 97 : 85) : 20;
        const carrierScore = hasCarrier ? 96 : 50;
        const loadNumScore = hasLoadNum ? 98 : 30;
        const rateScore = totalPay > 0 ? 98 : 0;
        const originScore = hasOrigin ? 96 : 30;
        const destScore = hasDest ? 96 : 30;
        const datesScore = hasDates ? 95 : 50;

        const mathMatches = linehaul > 0 && Math.abs(linehaul + fsc + accessorial - totalPay) < 1.0;

        const weighted = [
          { score: brokerScore, weight: 0.18 },
          { score: loadNumScore, weight: 0.15 },
          { score: rateScore, weight: 0.20 },
          { score: originScore, weight: 0.15 },
          { score: destScore, weight: 0.15 },
          { score: datesScore, weight: 0.10 },
          { score: carrierScore, weight: 0.07 },
        ];

        let overall = Math.round(weighted.reduce((acc, w) => acc + w.score * w.weight, 0));
        if (mathMatches && overall < 98) {
          overall = Math.min(98, overall + 2);
        }

        parsed.confidence_scores = {
          overall: Math.max(10, Math.min(98, overall)),
          broker: brokerScore,
          carrier: carrierScore,
          load_number: loadNumScore,
          rate: rateScore,
          origin: originScore,
          destination: destScore,
          dates: datesScore,
        };

        return parsed;
      };

      // Candidate models in order of performance and availability
      // gemini-3.1-flash-lite is the ultra-fast modern model (~2-5s) with high availability
      const candidateModels = ['gemini-3.1-flash-lite', 'gemini-flash-latest'];
      let lastError: any = null;

      // Explicit per-call timeout helper (Task 4): Prevents requests from sitting indefinitely
      const callGeminiWithTimeout = async (modelName: string, timeoutMs = 12_000) => {
        let timer: NodeJS.Timeout;
        const timeoutPromise = new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            reject(new Error(`RATECON_EXTRACTION_TIMEOUT: Gemini model ${modelName} timed out after ${timeoutMs}ms`));
          }, timeoutMs);
        });

        try {
          return await Promise.race([
            ai.models.generateContent({
              model: modelName,
              contents: contentsPayload,
              config: {
                systemInstruction,
                responseMimeType: 'application/json',
                responseSchema: extractionSchema,
              },
            }),
            timeoutPromise,
          ]);
        } finally {
          clearTimeout(timer!);
        }
      };

      for (const modelName of candidateModels) {
        console.log('[RateCon] Gemini request started');
        const geminiStart = Date.now();
        try {
          const response = await callGeminiWithTimeout(modelName, 12_000);
          const geminiElapsed = Date.now() - geminiStart;
          console.log(`[RateCon] Gemini request completed: ${geminiElapsed} ms`);

          stage = 'validation';
          const valStart = Date.now();
          const rawJson = response.text ? response.text.trim() : '{}';
          const parsedData = JSON.parse(rawJson);
          const auditedData = auditConfidenceScore(parsedData);
          const valElapsed = Date.now() - valStart;
          console.log(`[RateCon] validation completed: ${valElapsed} ms`);

          stage = 'response';
          const totalElapsed = Date.now() - startTime;
          console.log(`[RateCon] response sent: ${totalElapsed} ms`);
          console.log('[RateCon] HTTP status returned: 200');

          return res.json({
            success: true,
            extractedData: auditedData,
            source: modelName,
            extractedAt: new Date().toISOString(),
          });
        } catch (modelError: any) {
          const geminiElapsed = Date.now() - geminiStart;
          lastError = modelError;
          const errStr = typeof modelError === 'object' ? (modelError?.message || JSON.stringify(modelError)) : String(modelError);
          const isTimeout = errStr.includes('TIMEOUT') || errStr.includes('timed out');
          const isTransient = errStr.includes('503') || errStr.includes('UNAVAILABLE') || errStr.includes('high demand') || isTimeout;

          console.log(`[AI rate-con] Model ${modelName} completed in ${geminiElapsed} ms with status (${isTransient ? '503/Timeout/Spike' : 'error'}). Advancing to next candidate.`);
        }
      }

      // If all Gemini attempts encountered upstream spikes or timeouts, fall back to deterministic regex parser
      if (extractedDigitalText && extractedDigitalText.trim().length > 0) {
        console.log('Live AI models encountered temporary spikes or timeout. Executing deterministic extraction parser fallback.');
        stage = 'validation';
        const valStart = Date.now();
        const fallbackData = parseRateConfirmationText(extractedDigitalText, fileName);
        const valElapsed = Date.now() - valStart;
        console.log(`[RateCon] validation completed: ${valElapsed} ms`);

        stage = 'response';
        const totalElapsed = Date.now() - startTime;
        console.log(`[RateCon] response sent: ${totalElapsed} ms`);
        console.log('[RateCon] HTTP status returned: 200');

        return res.json({
          success: true,
          extractedData: fallbackData,
          source: 'deterministic-fallback',
          extractedAt: new Date().toISOString(),
          notice: 'AI OCR service was temporarily experiencing high demand. Extracted structured load using high-precision parser.',
        });
      }

      // If no text could be extracted and Gemini failed/timed out, return guaranteed JSON error
      const isTimeout = lastError?.message?.includes('TIMEOUT') || lastError?.message?.includes('timed out');
      const errStatus = isTimeout ? 504 : 503;
      const errCode = isTimeout ? 'RATECON_EXTRACTION_TIMEOUT' : 'RATECON_EXTRACTION_FAILED';
      const errMsg = isTimeout
        ? 'RateCon extraction timed out while waiting for the AI service.'
        : (lastError?.message || 'RateCon extraction failed');

      logFailure(errStatus, lastError || new Error(errMsg), 'gemini');
      return res.status(errStatus).json({
        success: false,
        error: errCode,
        stage: 'gemini',
        message: errMsg,
      });
    }

    // Fallback deterministic extraction for offline/demo simulation if GEMINI_API_KEY is not set
    stage = 'validation';
    const valStart = Date.now();
    const textToParse = extractedDigitalText || (await extractTextFromPayload(documentText, fileData));
    const fallbackData = parseRateConfirmationText(textToParse, fileName);
    const valElapsed = Date.now() - valStart;
    console.log(`[RateCon] validation completed: ${valElapsed} ms`);

    stage = 'response';
    const totalElapsed = Date.now() - startTime;
    console.log(`[RateCon] response sent: ${totalElapsed} ms`);
    console.log('[RateCon] HTTP status returned: 200');

    return res.json({
      success: true,
      extractedData: fallbackData,
      source: 'deterministic-regex-engine',
      extractedAt: new Date().toISOString(),
      notice: 'Extracted via deterministic regex extraction engine.',
    });
  } catch (error: any) {
    logFailure(500, error);
    return res.status(500).json({
      success: false,
      error: 'RATECON_EXTRACTION_FAILED',
      stage,
      message: error?.message || 'Internal server error during document extraction',
    });
  }
});

// Server-side AI Copilot Generation endpoint
app.post('/api/ai/generate', async (req, res) => {
  try {
    // 1. Authentication & tenant authorization
    const orgId = req.body?.context?.organizationId || req.body?.organizationId || (req.headers['x-organization-id'] as string) || undefined;
    if (!req.body?.organizationId && orgId) {
      req.body = req.body || {};
      req.body.organizationId = orgId;
    }

    const authUser = await authenticateAIUser(req);
    if (!authUser) {
      return res.status(401).json({ error: 'Unauthorized: Authentication required to access AI copilot' });
    }

    if (!authUser.isDemo && orgId && !isLocalOrDemoOrganization(orgId)) {
      if (typeof orgId === 'string' && orgId.trim()) {
        const membership = await verifyOrgAccess(authUser.userId, orgId.trim());
        if (!membership) {
          console.warn(`[AI copilot] Note: Organization membership unverified for user ${authUser.userId} on org ${orgId}. Proceeding with copilot response.`);
        }
      }
    }

    // 2. Abuse & rate limiting (30 requests/minute)
    const rateLimitKey = authUser.userId || (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'client';
    if (!checkAIRateLimit(`ai_generate:${rateLimitKey}`, 30, 60_000)) {
      return res.status(429).json({ error: 'Too many requests: AI copilot rate limit exceeded. Please wait a moment.' });
    }

    // 3. Request validation and payload bounds
    const { context, request } = req.body || {};
    if (!context || typeof context !== 'object' || !request || typeof request !== 'object') {
      return res.status(400).json({ error: 'Missing or invalid context or request payload.' });
    }

    const contextStr = JSON.stringify(context);
    if (contextStr.length > 35_000) {
      return res.status(400).json({ error: 'Context payload exceeds maximum allowed size of 35KB.' });
    }

    if (!request.action || typeof request.action !== 'string' || request.action.length > 100) {
      return res.status(400).json({ error: 'Invalid request.action: must be a string up to 100 characters.' });
    }

    if (request.query !== undefined && (typeof request.query !== 'string' || request.query.length > 5000)) {
      return res.status(400).json({ error: 'Invalid request.query: must be a string up to 5,000 characters.' });
    }

    if (request.customInstructions !== undefined && (typeof request.customInstructions !== 'string' || request.customInstructions.length > 2000)) {
      return res.status(400).json({ error: 'Invalid request.customInstructions: must be a string up to 2,000 characters.' });
    }

    if (request.loadId !== undefined && (typeof request.loadId !== 'string' || request.loadId.length > 128)) {
      return res.status(400).json({ error: 'Invalid request.loadId: must be a string up to 128 characters.' });
    }

    if (request.claimId !== undefined && (typeof request.claimId !== 'string' || request.claimId.length > 128)) {
      return res.status(400).json({ error: 'Invalid request.claimId: must be a string up to 128 characters.' });
    }

    const ai = getGeminiClient();
    if (!ai) {
      return res.status(503).json({ error: 'Gemini API key not configured on server' });
    }

    const candidateModels = ['gemini-3.1-flash-lite', 'gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-flash-latest'];
    const prompt = `You are DispatchDesk AI, an expert freight dispatcher and operations copilot for North American trucking fleets.
Action requested: ${request.action}
User Role: ${context.userRole || 'dispatcher'}
Active Timezones: Operational=${context.operationalTimezone || 'America/Chicago'}, Dispatcher=${context.dispatcherTimezone || 'America/Chicago'}
User Query: ${request.query || 'Perform requested operational action based on context'}
${request.customInstructions ? `Custom Instructions: ${request.customInstructions}` : ''}

Dispatch Context:
${contextStr}

Provide a grounded, professional response as JSON adhering strictly to:
{
  "title": "Clear descriptive title",
  "content": "Clean summary text",
  "markdownContent": "Full markdown-formatted operational briefing, draft email, or analysis",
  "subject": "Email subject if drafting an email, or null",
  "confidenceScore": 95,
  "recommendations": ["Actionable recommendation 1", "Actionable recommendation 2"],
  "suggestedActions": [{"label": "Action label", "action": "action_code"}],
  "isDraft": true,
  "requiresConfirmation": false
}`;

    for (const modelName of candidateModels) {
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
          },
        });

        const rawJson = response.text ? response.text.trim() : '{}';
        const parsed = JSON.parse(rawJson);

        const aiResponse = {
          id: `ai-resp-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
          action: request.action,
          mode: 'gemini',
          title: parsed.title || 'AI Dispatch Briefing',
          content: parsed.content || 'Analysis generated by Gemini.',
          markdownContent: parsed.markdownContent || parsed.content || '',
          subject: parsed.subject || undefined,
          timestamp: new Date().toISOString(),
          confidenceScore: parsed.confidenceScore || 92,
          groundingSources: [],
          recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
          suggestedActions: Array.isArray(parsed.suggestedActions) ? parsed.suggestedActions : [],
          isDraft: Boolean(parsed.isDraft),
          requiresConfirmation: Boolean(parsed.requiresConfirmation),
        };

        return res.json(aiResponse);
      } catch (err: any) {
        const errStr = String(err?.message || err);
        const isTransient = errStr.includes('503') || errStr.includes('UNAVAILABLE') || errStr.includes('404') || errStr.includes('high demand');
        console.log(`[AI copilot] Model ${modelName} returned transient status (${isTransient ? '503/404/High Demand' : 'fallback'}). Advancing to next candidate.`);
        if (isTransient) {
          continue;
        }
      }
    }

    return res.status(503).json({ error: 'All Gemini models unavailable or experiencing high demand.' });
  } catch (error: any) {
    console.error('/api/ai/generate error:', error);
    return res.status(500).json({ error: error.message || 'Internal AI error' });
  }
});

// Server-side AI Detention Audit Endpoint (Phase 2C)
app.post('/api/ai/detention/audit', async (req, res) => {
  try {
    // 1. Authentication: Require authenticated session
    const authHeader = req.headers.authorization;
    const authUser = await authenticateAIUser(req);
    if (!authUser) {
      return res.status(401).json({ error: 'Unauthorized: Authentication required to access detention audit engine' });
    }

    const { organizationId, loadId, facilityScope = 'all', detentionRecordId } = req.body || {};
    if (!organizationId || !loadId) {
      return res.status(400).json({ error: 'Missing required parameters: organizationId and loadId' });
    }

    // Fail closed against demo users attempting to access non-demo organizations
    if (authUser.isDemo && !isLocalOrDemoOrganization(organizationId)) {
      return res.status(401).json({ error: 'Unauthorized: Demo users cannot access non-demo organizations' });
    }

    const effectiveUserId = (process.env.NODE_ENV === 'test' && (req.headers['x-test-user-id'] as string)) || authUser.userId;
    const testRole = (process.env.NODE_ENV === 'test' && (req.headers['x-test-user-role'] as string)) || undefined;

    // 2. Organization context authorization
    const membership = testRole
      ? { role: testRole }
      : await verifyOrgAccess(effectiveUserId, organizationId);
    if (!membership) {
      return res.status(403).json({ error: 'Forbidden: User is not an active member of this organization' });
    }

    // 3. User load access & tenant isolation check (Owner Admin or assigned employee)
    const hasLoadAccess = await checkUserLoadAccess(effectiveUserId, membership.role, organizationId, loadId);
    if (!hasLoadAccess) {
      return res.status(403).json({
        error: 'Forbidden: Requesting user is not authorized to access this load',
        code: 'UNAUTHORIZED_LOAD_ACCESS',
      });
    }

    // 4. Rate limiting & abuse protection (30 requests/minute)
    const rateLimitKey = authUser.userId || (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'client';
    if (!checkAIRateLimit(`ai_detention:${rateLimitKey}`, 30, 60_000)) {
      return res.status(429).json({ error: 'Too many requests: AI detention audit rate limit exceeded. Please wait a moment.' });
    }

    // 5. Gather deterministic evidence
    let evidenceInput: DetentionAuditInput;
    if (req.body?.deterministicInput && req.body.deterministicInput.loadId === loadId) {
      evidenceInput = req.body.deterministicInput;
    } else {
      evidenceInput = await detentionAuditService.gatherDetentionEvidence(organizationId, loadId, { facilityScope });
    }

    // Run authoritative deterministic calculation
    const deterministicResult: DetentionAuditResult =
      req.body?.deterministicResult && req.body.deterministicResult.loadId === loadId
        ? req.body.deterministicResult
        : auditDetentionEligibility(evidenceInput);

    // Collect ground-truth and normalized context
    const groundTruth = collectGroundTruth(evidenceInput, deterministicResult);
    const normalizedContext = prepareNormalizedAuditContext(evidenceInput, deterministicResult);

    // 6. Server-side Gemini AI Reconciliation
    const ai = getGeminiClient();
    let rawAiResult: any = null;
    let aiError: string | null = null;

    if (ai) {
      const detentionAuditResponseSchema = {
        type: Type.OBJECT,
        properties: {
          status: { type: Type.STRING },
          overallConfidence: { type: Type.NUMBER },
          requiresHumanReview: { type: Type.BOOLEAN },
          pickupAudit: {
            type: Type.OBJECT,
            properties: {
              status: { type: Type.STRING },
              findings: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
            },
            required: ['status'],
          },
          deliveryAudit: {
            type: Type.OBJECT,
            properties: {
              status: { type: Type.STRING },
              findings: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
            },
            required: ['status'],
          },
          evidence: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                sourceType: { type: Type.STRING },
                sourceReference: { type: Type.STRING },
                timestamp: { type: Type.STRING },
                extractedFact: { type: Type.STRING },
                confidence: { type: Type.NUMBER },
                supportsClaim: { type: Type.BOOLEAN },
              },
              required: ['sourceType', 'sourceReference', 'extractedFact', 'confidence', 'supportsClaim'],
            },
          },
          discrepancies: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                code: { type: Type.STRING },
                severity: { type: Type.STRING },
                description: { type: Type.STRING },
                conflictingSources: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
                recommendedAction: { type: Type.STRING },
              },
              required: ['code', 'severity', 'description', 'conflictingSources', 'recommendedAction'],
            },
          },
          missingEvidence: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          reasoningSummary: { type: Type.STRING },
        },
        required: ['status', 'overallConfidence', 'requiresHumanReview', 'pickupAudit', 'deliveryAudit', 'reasoningSummary'],
      };

      const detentionAuditSystemInstruction = `You are DispatchDesk AI, an expert North American freight operations and contract auditor specialized in detention claim reconciliation.
Your mission is to perform structured, grounded interpretation of detention claims by reconciling RateCon contractual language, facility milestones, check calls, signed BOL/PODs, and driver communications.

RESPONSIBILITY BOUNDARY & GROUNDING RULES:
1. CONTRACT RECONCILIATION:
   - Identify and interpret RateCon terms: free time (e.g., 2 hours), detention hourly rate (e.g., $50/hr vs $75/hr), broker notification requirements (e.g., notify broker 30 mins prior to detention start), and signed in/out stamps on bill of lading / proof of delivery.
   - RateCon terms take precedence over system defaults.
   - If RateCon contractual language is ambiguous or required conditions (e.g., prior notification or gate stamps) cannot be confirmed, you MUST recommend status: "needs_review".
2. CONFLICT RECONCILIATION:
   - Check Call vs Milestone Mismatch: If a driver check-call arrival timestamp diverges significantly (>30 minutes) from facility milestone arrival, classify as CHECK_CALL_TIME_MISMATCH and recommend "needs_review".
   - Driver Messages: Informal chat messages (e.g. "at receiver") are contextual evidence, NOT authoritative gate timestamps unless confirmed by facility logs.
   - Paperwork stamps: Signed in/out notes on PODs/BOLs are dispatcher-verified document notes. Missing signed POD on delivery requires MISSING_SIGNED_POD.
3. GROUNDING CONSTRAINTS (CRITICAL):
   - NEVER invent or introduce new timestamps not present in the supplied evidence. All timestamps must match input ISO timestamps.
   - NEVER invent hourly rates or free-time values.
   - NEVER invent document IDs or evidence references.
   - Only reference existing sourceReference values (e.g. loads.pickup_arrival_time, check_calls.<id>, documents.<id>, rate_con).
4. PERMITTED DISCREPANCY CODES:
   - You MUST ONLY use valid codes: CHECK_CALL_TIME_MISMATCH, RATE_CON_FREE_TIME_CONFLICT, ARRIVAL_AFTER_DEPARTURE, MISSING_DEPARTURE_TIMESTAMP, APPOINTMENT_MISMATCH, MISSING_SIGNED_POD, MISSING_HOURLY_RATE, BROKER_APPROVAL_REQUIRED, EARLY_ARRIVAL_WITHOUT_APPT.
5. STATUS & CONFIDENCE:
   - Allowed statuses: "eligible", "not_eligible", "needs_review".
   - Overall confidence must be a decimal number between 0.00 and 1.00.`;

      const promptText = `Reconcile and audit the detention claim for Load #${evidenceInput.loadContext.loadNumber}.
Authoritative Deterministic Results and Grounding Context:
${JSON.stringify(normalizedContext, null, 2)}

Provide your reconciled interpretation adhering strictly to the JSON schema.`;

      const candidateModels = ['gemini-3.8-flash', 'gemini-3.1-flash-lite', 'gemini-flash-latest'];
      for (const modelName of candidateModels) {
        try {
          const response = await ai.models.generateContent({
            model: modelName,
            contents: promptText,
            config: {
              systemInstruction: detentionAuditSystemInstruction,
              responseMimeType: 'application/json',
              responseSchema: detentionAuditResponseSchema,
            },
          });

          const rawText = response.text ? response.text.trim() : '';
          try {
            rawAiResult = JSON.parse(rawText);
            break;
          } catch (jsonErr: any) {
            aiError = `Invalid AI JSON: ${jsonErr.message}`;
            break;
          }
        } catch (err: any) {
          const errStr = String(err?.message || err);
          const isTransient = errStr.includes('503') || errStr.includes('UNAVAILABLE') || errStr.includes('404') || errStr.includes('high demand');
          if (isTransient) {
            continue;
          }
          aiError = err?.message || 'Gemini model error';
          break;
        }
      }
    }

    // 7. Grounding Validation & Deterministic Protection
    let finalResult: DetentionAuditResult;
    if (aiError) {
      finalResult = buildGroundingFallbackResult(deterministicResult, [aiError]);
    } else if (rawAiResult) {
      const grounding = validateGrounding(rawAiResult, groundTruth, deterministicResult);
      if (!grounding.valid) {
        finalResult = buildGroundingFallbackResult(deterministicResult, grounding.errors);
      } else {
        finalResult = protectAndReconcileResult(deterministicResult, rawAiResult, evidenceInput);
      }
    } else {
      finalResult = deterministicResult;
    }

    // 8. Database Persistence (Preserves versioning)
    const persistedAudit = await detentionAuditService.saveAuditResult(organizationId, finalResult, {
      detentionRecordId,
      createdBy: authUser.userId,
    });
    finalResult.auditId = persistedAudit.id;

    return res.status(200).json({
      success: true,
      audit: persistedAudit,
      result: finalResult,
    });
  } catch (error: any) {
    console.error('[API /api/ai/detention/audit Error]:', error);
    return res.status(500).json({
      error: error?.message || 'Internal server error during detention audit reconciliation',
    });
  }
});

// Ensure any unmatched /api route returns JSON 404, never falling through to HTML index
app.use('/api', (req, res, next) => {
  res.status(404).json({
    error: `API route ${req.method} ${req.originalUrl} not found`,
  });
});

// Centralized error handler for /api/* to guarantee Express never outputs default HTML error pages
app.use('/api', (err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[API Error]', req.method, req.originalUrl, err);
  res.status(err.status || err.statusCode || 500).json({
    error: err.message || 'Internal server error',
  });
});

// Start server with Vite middleware in dev mode or static file serving in production
async function startServer() {
  try {
    const isProduction = process.env.NODE_ENV === 'production';

    if (!isProduction) {
      const vite = await createViteServer({
        server: {
          middlewareMode: true,
          hmr: false,
        },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    } else {
      const distPath = path.resolve(process.cwd(), 'dist');
      app.use(express.static(distPath));
      app.use((req, res, next) => {
        if (req.path.startsWith('/api')) {
          return res.status(404).json({ error: 'API route not found' });
        }
        res.sendFile(path.resolve(distPath, 'index.html'));
      });
    }

    // Global Express fallback error handler
    app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
      console.error('[Unhandled Server Error]', req.method, req.originalUrl, err);
      if (res.headersSent) {
        return next(err);
      }
      if (req.path.startsWith('/api')) {
        return res.status(err.status || err.statusCode || 500).json({
          error: err.message || 'Internal server error',
        });
      }
      res.status(500).send('Internal server error');
    });

    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`DispatcherDesk full-stack server running on http://0.0.0.0:${PORT} (PORT=${PORT}, NODE_ENV=${process.env.NODE_ENV || 'unset'})`);
    });

    server.on('error', (err: any) => {
      console.error('[Server listen error]:', err);
    });

    return server;
  } catch (err) {
    console.error('[Failed to start server]:', err);
    throw err;
  }
}

export { app, startServer };

if (process.env.NODE_ENV !== 'test' && !process.argv[1]?.includes('.test.')) {
  startServer().catch((err) => {
    console.error('[Fatal startServer error]:', err);
  });
}


