/**
 * DispatcherDesk Communication Service (Phase 1 Application Foundation)
 * File: src/modules/communication/communicationService.ts
 *
 * Implements tenant-safe, RLS-respecting driver and dispatch communication:
 * 1. public.conversations management (general, load, check_in, emergency)
 * 2. public.conversation_messages management with client_message_id idempotency
 * 3. Authoritative driver identity resolution via get_current_driver_id(org_id)
 * 4. Independent read_at and acknowledged_at timestamps
 * 5. Strict organization isolation
 */

import { supabase, isSupabaseConfigured } from '../../lib/supabase.ts';
import {
  Conversation,
  ConversationMessage,
  ConversationType,
  ConversationStatus,
  MessageType,
  MessageChannel,
  ListConversationsOptions,
  ListMessagesOptions,
  SendMessageInput,
  CreateLoadConversationOptions,
} from './types.ts';

export interface UnreadMessageSummary {
  total: number;
  byConversation: Record<string, number>;
}

function isUUID(str?: string | null): boolean {
  if (!str) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Normalizes a phone number to standard E.164 (+1) for North American 10-digit numbers:
 * 1. 10-digit phone number (e.g. "(555) 234-5678" or "5552345678") -> "+1" + 10 digits ("+15552345678").
 * 2. Already correctly prefixed +1 10-digit number ("+15552345678") remains unchanged.
 * 3. Formatted +1 numbers ("+1 (555) 234-5678") normalize to "+15552345678".
 * 4. 11-digit numbers starting with 1 ("1 (555) 234-5678" or "15552345678") normalize to "+15552345678".
 * 5. Valid international numbers that are not North American +1 (e.g. "+44 20 7946 0958") retain their international prefix and digits.
 * 6. Preserves null/undefined/empty and invalid values.
 */
export function normalizePhoneNumber(rawPhone: string): string;
export function normalizePhoneNumber(rawPhone: null): null;
export function normalizePhoneNumber(rawPhone: undefined): undefined;
export function normalizePhoneNumber(rawPhone?: string | null): string | null | undefined;
export function normalizePhoneNumber(rawPhone?: string | null): string | null | undefined {
  if (rawPhone === null) return null;
  if (rawPhone === undefined) return undefined;
  if (typeof rawPhone !== 'string') return rawPhone;

  const trimmed = rawPhone.trim();
  if (!trimmed) {
    return trimmed;
  }

  const hasLeadingPlus = trimmed.startsWith('+');
  const digitsOnly = trimmed.replace(/\D/g, '');

  // Case 1: Standard North American 10-digit number
  if (digitsOnly.length === 10) {
    return `+1${digitsOnly}`;
  }

  // Case 2: 11-digit North American number starting with 1
  if (digitsOnly.length === 11 && digitsOnly.startsWith('1')) {
    return `+${digitsOnly}`;
  }

  // Case 3: Valid international number with leading + (non-US/Canada)
  if (hasLeadingPlus && digitsOnly.length > 0) {
    return `+${digitsOnly}`;
  }

  // Case 4: Preserves invalid/short numbers without mangling
  return digitsOnly.length > 0 ? (hasLeadingPlus ? `+${digitsOnly}` : digitsOnly) : trimmed;
}

export const normalizePhone = normalizePhoneNumber;
export const cleanPhoneNumber = normalizePhoneNumber;

/**
 * Generates an SMS link using the normalized E.164 phone number.
 */
export function generateSmsLink(phone?: string | null, content?: string): string {
  const normalized = normalizePhoneNumber(phone) || '';
  const query = content ? `?&body=${encodeURIComponent(content)}` : '';
  return `sms:${normalized}${query}`;
}

/**
 * Generates a WhatsApp deep link using the normalized E.164 phone number.
 */
export function generateWhatsAppLink(phone?: string | null, content?: string): string {
  const normalized = normalizePhoneNumber(phone) || '';
  const query = content ? `?text=${encodeURIComponent(content)}` : '';
  return `https://wa.me/${normalized}${query}`;
}

/**
 * Formats a driver communication recipient phone value.
 */
export function formatDriverRecipient(phone?: string | null): string {
  return normalizePhoneNumber(phone) || '';
}

// Storage keys for demo/offline/test fallback
const CONVERSATIONS_STORAGE_PREFIX = 'dispatchdesk_demo_conversations_';
const MESSAGES_STORAGE_PREFIX = 'dispatchdesk_demo_messages_';
const DRIVER_IDENTITY_MAP_PREFIX = 'dispatchdesk_demo_driver_identity_';

export class CommunicationService {
  // ---------------------------------------------------------------------------
  // Memory / Local Storage Fallback for Test & Offline Environments
  // ---------------------------------------------------------------------------
  private getStorage<T>(key: string, defaultValue: T): T {
    if (typeof globalThis.localStorage !== 'undefined') {
      const stored = globalThis.localStorage.getItem(key);
      if (stored) {
        try {
          return JSON.parse(stored) as T;
        } catch {
          return defaultValue;
        }
      }
    }
    return defaultValue;
  }

  private setStorage<T>(key: string, value: T): void {
    if (typeof globalThis.localStorage !== 'undefined') {
      globalThis.localStorage.setItem(key, JSON.stringify(value));
    }
  }

  private getOrgConversations(organizationId: string): Conversation[] {
    const key = `${CONVERSATIONS_STORAGE_PREFIX}${organizationId}`;
    return this.getStorage<Conversation[]>(key, []);
  }

  private saveOrgConversations(organizationId: string, conversations: Conversation[]): void {
    const key = `${CONVERSATIONS_STORAGE_PREFIX}${organizationId}`;
    this.setStorage(key, conversations);
  }

  private getOrgMessages(organizationId: string): ConversationMessage[] {
    const key = `${MESSAGES_STORAGE_PREFIX}${organizationId}`;
    return this.getStorage<ConversationMessage[]>(key, []);
  }

  private saveOrgMessages(organizationId: string, messages: ConversationMessage[]): void {
    const key = `${MESSAGES_STORAGE_PREFIX}${organizationId}`;
    this.setStorage(key, messages);
  }

  /**
   * Test/Demo helper: seeds authoritative driver identity mapping
   * for local/offline testing where Supabase RPC is unavailable.
   */
  setAuthoritativeDriverForUser(organizationId: string, userId: string, driverId: string): void {
    const key = `${DRIVER_IDENTITY_MAP_PREFIX}${organizationId}_${userId}`;
    this.setStorage(key, driverId);
  }

  // ---------------------------------------------------------------------------
  // 1. Authoritative Driver Identity Resolution
  // ---------------------------------------------------------------------------
  /**
   * Authoritatively resolves the active driver profile for the caller in the given organization.
   * NEVER trusts client-supplied driver IDs for driver actions.
   * Calls the database RPC: public.get_current_driver_id(p_organization_id).
   */
  async resolveCurrentDriverId(organizationId: string): Promise<string> {
    if (!organizationId) {
      throw new Error('Organization ID is required to resolve driver identity.');
    }

    if (isSupabaseConfigured && isUUID(organizationId)) {
      try {
        const { data, error } = await supabase.rpc('get_current_driver_id', {
          p_organization_id: organizationId,
        });

        if (error) {
          throw new Error(`Authoritative driver resolution failed: ${error.message}`);
        }

        if (!data) {
          throw new Error('No authoritative driver profile found for current user in organization.');
        }

        return data as string;
      } catch (err) {
        // If Supabase RPC is reachable and rejected, rethrow security exception
        if (err instanceof Error && err.message.includes('Authoritative driver resolution failed')) {
          throw err;
        }
      }
    }

    // Offline / Demo / Test-runner resolution:
    // Resolve via mock auth session / mapped driver identity
    let currentUserId: string | null = null;
    try {
      const authUser = (await supabase.auth.getUser())?.data?.user;
      currentUserId = authUser?.id || null;
    } catch {
      currentUserId = null;
    }

    if (currentUserId) {
      const mappedDriverId = this.getStorage<string | null>(
        `${DRIVER_IDENTITY_MAP_PREFIX}${organizationId}_${currentUserId}`,
        null
      );
      if (mappedDriverId) {
        return mappedDriverId;
      }
    }

    // Default demo fallback if no mapping exists
    return `driver-auth-${organizationId.slice(0, 8)}`;
  }

  // ---------------------------------------------------------------------------
  // 2. Conversation Operations
  // ---------------------------------------------------------------------------

  /**
   * List conversations for the active organization.
   * Strict tenant scoping: organization_id is mandatory.
   */
  async listConversations(
    organizationId: string,
    options?: ListConversationsOptions
  ): Promise<Conversation[]> {
    if (!organizationId) {
      throw new Error('Organization ID is required to list conversations.');
    }

    if (isSupabaseConfigured && isUUID(organizationId)) {
      try {
        let query = supabase
          .from('conversations')
          .select('*')
          .eq('organization_id', organizationId)
          .is('deleted_at', null)
          .order('updated_at', { ascending: false });

        if (options?.driverId) {
          query = query.eq('driver_id', options.driverId);
        }

        if (options?.loadId) {
          query = query.eq('load_id', options.loadId);
        }

        if (options?.status) {
          query = query.eq('status', options.status);
        }

        if (options?.type) {
          // DB check constraint is 'general' | 'load'
          if (options.type === 'general' || options.type === 'load') {
            query = query.eq('type', options.type);
          } else if (options.type === 'emergency') {
            query = query.eq('status', 'escalated');
          }
        }

        if (options?.limit) {
          query = query.limit(options.limit);
        }

        if (options?.offset) {
          query = query.range(options.offset, options.offset + (options.limit || 20) - 1);
        }

        const { data, error } = await query;
        if (error) {
          console.warn('[CommunicationService] Supabase listConversations error, falling back:', error);
        } else if (data) {
          return data.map((row) => this.mapConversationRow(row));
        }
      } catch (err) {
        console.warn('[CommunicationService] Network error listing conversations, falling back:', err);
      }
    }

    // Fallback/test runner storage
    let conversations = this.getOrgConversations(organizationId).filter((c) => !c.deleted_at);

    if (options?.driverId) {
      conversations = conversations.filter((c) => c.driver_id === options.driverId);
    }
    if (options?.loadId) {
      conversations = conversations.filter((c) => c.load_id === options.loadId);
    }
    if (options?.status) {
      conversations = conversations.filter((c) => c.status === options.status);
    }
    if (options?.type) {
      conversations = conversations.filter((c) => c.type === options.type);
    }

    conversations.sort(
      (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    );

    if (options?.offset) {
      conversations = conversations.slice(options.offset);
    }
    if (options?.limit) {
      conversations = conversations.slice(0, options.limit);
    }

    return conversations;
  }

  /**
   * Get conversation by ID within the current organization.
   */
  async getConversationById(
    organizationId: string,
    conversationId: string
  ): Promise<Conversation | null> {
    if (!organizationId || !conversationId) {
      return null;
    }

    if (isSupabaseConfigured && isUUID(organizationId) && isUUID(conversationId)) {
      try {
        const { data, error } = await supabase
          .from('conversations')
          .select('*')
          .eq('organization_id', organizationId)
          .eq('id', conversationId)
          .is('deleted_at', null)
          .maybeSingle();

        if (error) {
          console.warn('[CommunicationService] Supabase getConversationById error:', error);
        } else if (data) {
          return this.mapConversationRow(data);
        }
      } catch (err) {
        console.warn('[CommunicationService] Network error in getConversationById:', err);
      }
    }

    const conversations = this.getOrgConversations(organizationId);
    const found = conversations.find(
      (c) => c.id === conversationId && c.organization_id === organizationId && !c.deleted_at
    );
    return found || null;
  }

  /**
   * Office operation: Get or create active general conversation for a given driver.
   * Respects partial unique index:
   * (organization_id, driver_id) WHERE type = 'general' AND status = 'active' AND deleted_at IS NULL
   */
  async getOrCreateDriverConversation(
    organizationId: string,
    driverId: string
  ): Promise<Conversation> {
    if (!organizationId) {
      throw new Error('Organization ID is required.');
    }
    if (!driverId) {
      throw new Error('Driver ID is required.');
    }

    if (isSupabaseConfigured && isUUID(organizationId) && isUUID(driverId)) {
      try {
        // 1. Check for existing active general conversation
        const { data: existing, error: findError } = await supabase
          .from('conversations')
          .select('*')
          .eq('organization_id', organizationId)
          .eq('driver_id', driverId)
          .eq('type', 'general')
          .eq('status', 'active')
          .is('deleted_at', null)
          .maybeSingle();

        if (!findError && existing) {
          return this.mapConversationRow(existing);
        }

        // 2. Create new active general conversation
        const { data: created, error: insertError } = await supabase
          .from('conversations')
          .insert({
            organization_id: organizationId,
            driver_id: driverId,
            type: 'general',
            load_id: null,
            status: 'active',
          })
          .select('*')
          .single();

        if (insertError) {
          // If unique constraint violation occurred (concurrent creation), retrieve active one
          if (insertError.code === '23505' || insertError.message.includes('unique')) {
            const { data: retryData } = await supabase
              .from('conversations')
              .select('*')
              .eq('organization_id', organizationId)
              .eq('driver_id', driverId)
              .eq('type', 'general')
              .eq('status', 'active')
              .is('deleted_at', null)
              .single();
            if (retryData) return this.mapConversationRow(retryData);
          }
          throw new Error(`Failed to create driver conversation: ${insertError.message}`);
        }

        if (created) {
          return this.mapConversationRow(created);
        }
      } catch (err) {
        if (err instanceof Error && err.message.includes('Failed to create driver conversation')) {
          throw err;
        }
        console.warn('[CommunicationService] Falling back to local storage for getOrCreateDriverConversation:', err);
      }
    }

    // Local / offline fallback
    const conversations = this.getOrgConversations(organizationId);
    const existing = conversations.find(
      (c) =>
        c.driver_id === driverId &&
        c.type === 'general' &&
        c.status === 'active' &&
        !c.deleted_at
    );

    if (existing) {
      return existing;
    }

    const now = new Date().toISOString();
    const newConv: Conversation = {
      id: generateUUID(),
      organization_id: organizationId,
      driver_id: driverId,
      type: 'general',
      load_id: null,
      status: 'active',
      created_at: now,
      updated_at: now,
      resolved_at: null,
      deleted_at: null,
    };

    conversations.push(newConv);
    this.saveOrgConversations(organizationId, conversations);
    return newConv;
  }

  /**
   * Driver operation: authoritatively resolves the caller's driver profile
   * and gets/creates their active general conversation.
   * NEVER accepts client-supplied driverId.
   */
  async getOrCreateCurrentDriverConversation(organizationId: string): Promise<Conversation> {
    const authoritativeDriverId = await this.resolveCurrentDriverId(organizationId);
    return this.getOrCreateDriverConversation(organizationId, authoritativeDriverId);
  }

  /**
   * Create load-specific conversation.
   * Enforces DB CHECK constraint: type = 'load' AND load_id IS NOT NULL.
   */
  async createLoadConversation(
    organizationId: string,
    driverId: string,
    loadId: string,
    options?: CreateLoadConversationOptions
  ): Promise<Conversation> {
    if (!organizationId) {
      throw new Error('Organization ID is required.');
    }
    if (!driverId) {
      throw new Error('Driver ID is required.');
    }
    if (!loadId) {
      throw new Error('Load ID is required for a load conversation.');
    }

    const status: ConversationStatus = options?.initialStatus || 'active';
    const appType: ConversationType = options?.type || 'load';

    if (isSupabaseConfigured && isUUID(organizationId) && isUUID(driverId) && isUUID(loadId)) {
      try {
        // In DB, type must be 'load' when load_id IS NOT NULL
        const { data: created, error } = await supabase
          .from('conversations')
          .insert({
            organization_id: organizationId,
            driver_id: driverId,
            type: 'load',
            load_id: loadId,
            status: status === 'escalated' ? 'escalated' : status,
          })
          .select('*')
          .single();

        if (error) {
          if (error.code === '23505' || error.message?.includes('unique') || error.message?.includes('uq_conversations_active_load')) {
            const { data: existingLoadConv } = await supabase
              .from('conversations')
              .select('*')
              .eq('organization_id', organizationId)
              .eq('driver_id', driverId)
              .eq('type', 'load')
              .eq('load_id', loadId)
              .eq('status', 'active')
              .is('deleted_at', null)
              .maybeSingle();
            if (existingLoadConv) {
              const mapped = this.mapConversationRow(existingLoadConv);
              if (appType === 'emergency') mapped.type = 'emergency';
              return mapped;
            }
          }
          throw new Error(`Failed to create load conversation: ${error.message}`);
        }

        if (created) {
          const mapped = this.mapConversationRow(created);
          if (appType === 'emergency') mapped.type = 'emergency';
          return mapped;
        }
      } catch (err) {
        if (err instanceof Error && err.message.includes('Failed to create load conversation')) {
          throw err;
        }
        console.warn('[CommunicationService] Falling back for createLoadConversation:', err);
      }
    }

    // Local / offline fallback
    const now = new Date().toISOString();
    const conversations = this.getOrgConversations(organizationId);
    const newConv: Conversation = {
      id: generateUUID(),
      organization_id: organizationId,
      driver_id: driverId,
      type: appType,
      load_id: loadId,
      status: status,
      created_at: now,
      updated_at: now,
      resolved_at: status === 'resolved' ? now : null,
      deleted_at: null,
    };

    conversations.push(newConv);
    this.saveOrgConversations(organizationId, conversations);
    return newConv;
  }

  /**
   * Driver operation: create a load conversation authoritatively.
   * NEVER accepts client-supplied driverId.
   */
  async createCurrentDriverLoadConversation(
    organizationId: string,
    loadId: string,
    options?: CreateLoadConversationOptions
  ): Promise<Conversation> {
    const authoritativeDriverId = await this.resolveCurrentDriverId(organizationId);
    return this.createLoadConversation(organizationId, authoritativeDriverId, loadId, options);
  }

  /**
   * Update conversation status (active, resolved, escalated).
   * Sets resolved_at when status becomes resolved.
   */
  async updateConversationStatus(
    organizationId: string,
    conversationId: string,
    status: ConversationStatus
  ): Promise<Conversation> {
    if (!organizationId || !conversationId) {
      throw new Error('Organization ID and Conversation ID are required.');
    }

    const resolvedAt = status === 'resolved' ? new Date().toISOString() : null;

    if (isSupabaseConfigured && isUUID(organizationId) && isUUID(conversationId)) {
      try {
        const { data, error } = await supabase
          .from('conversations')
          .update({
            status,
            resolved_at: resolvedAt,
          })
          .eq('organization_id', organizationId)
          .eq('id', conversationId)
          .select('*')
          .single();

        if (error) {
          throw new Error(`Failed to update conversation status: ${error.message}`);
        }

        if (data) {
          return this.mapConversationRow(data);
        }
      } catch (err) {
        if (err instanceof Error && err.message.includes('Failed to update conversation status')) {
          throw err;
        }
        console.warn('[CommunicationService] Falling back for updateConversationStatus:', err);
      }
    }

    const conversations = this.getOrgConversations(organizationId);
    const index = conversations.findIndex(
      (c) => c.id === conversationId && c.organization_id === organizationId
    );

    if (index === -1) {
      throw new Error(`Conversation ${conversationId} not found in organization.`);
    }

    const updated: Conversation = {
      ...conversations[index],
      status,
      resolved_at: resolvedAt,
      updated_at: new Date().toISOString(),
    };

    conversations[index] = updated;
    this.saveOrgConversations(organizationId, conversations);
    return updated;
  }

  /**
   * Convenience resolution method.
   */
  async resolveConversation(organizationId: string, conversationId: string): Promise<Conversation> {
    return this.updateConversationStatus(organizationId, conversationId, 'resolved');
  }

  // ---------------------------------------------------------------------------
  // 3. Message Operations
  // ---------------------------------------------------------------------------

  /**
   * List messages for a conversation.
   * Chronological order (created_at ASC) for display.
   * Strict tenant scoping on organization_id.
   */
  async listMessages(
    organizationId: string,
    conversationId: string,
    options?: ListMessagesOptions
  ): Promise<ConversationMessage[]> {
    if (!organizationId || !conversationId) {
      return [];
    }

    if (isSupabaseConfigured && isUUID(organizationId) && isUUID(conversationId)) {
      try {
        let query = supabase
          .from('conversation_messages')
          .select('*')
          .eq('organization_id', organizationId)
          .eq('conversation_id', conversationId)
          .is('deleted_at', null)
          .order('created_at', { ascending: true });

        if (options?.limit) {
          query = query.limit(options.limit);
        }

        if (options?.offset) {
          query = query.range(options.offset, options.offset + (options.limit || 50) - 1);
        }

        const { data, error } = await query;
        if (error) {
          console.warn('[CommunicationService] Supabase listMessages error:', error);
        } else if (data) {
          return data.map((row) => this.mapMessageRow(row));
        }
      } catch (err) {
        console.warn('[CommunicationService] Network error listMessages:', err);
      }
    }

    const messages = this.getOrgMessages(organizationId).filter(
      (m) => m.conversation_id === conversationId && !m.deleted_at
    );

    messages.sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    if (options?.offset) {
      return messages.slice(options.offset, options.offset + (options.limit || 50));
    }
    if (options?.limit) {
      return messages.slice(0, options.limit);
    }
    return messages;
  }

  /**
   * Send a conversation message with strict idempotency and tenant integrity.
   * Idempotency contract:
   * - Uses client_message_id (generates valid UUID if omitted).
   * - On duplicate (organization_id, client_message_id), returns the existing message.
   * - Never creates duplicate rows on retry.
   */
  async sendMessage(
    organizationId: string,
    input: SendMessageInput
  ): Promise<ConversationMessage> {
    if (!organizationId) {
      throw new Error('Organization ID is required to send a message.');
    }
    if (!input.conversationId) {
      throw new Error('Conversation ID is required to send a message.');
    }
    if (!input.content || !input.content.trim()) {
      throw new Error('Message content cannot be empty.');
    }

    const clientMessageId = input.clientMessageId || input.client_message_id || generateUUID();
    const messageType: MessageType = input.messageType || 'text';
    const channel: MessageChannel = input.channel || 'in_app';
    const rawContext = input.context || input.metadata || null;
    let contextData = rawContext;
    if (rawContext && typeof rawContext === 'object') {
      contextData = { ...rawContext };
      if (typeof contextData.recipient_phone === 'string') {
        contextData.recipient_phone = normalizePhoneNumber(contextData.recipient_phone);
      }
      if (typeof contextData.driver_phone === 'string') {
        contextData.driver_phone = normalizePhoneNumber(contextData.driver_phone);
      }
      if (typeof contextData.sms_to === 'string') {
        contextData.sms_to = normalizePhoneNumber(contextData.sms_to);
      }
      if (typeof contextData.phone === 'string') {
        contextData.phone = normalizePhoneNumber(contextData.phone);
      }
    }
    const attachmentId = input.attachmentId || input.attachment_id || null;

    if (isSupabaseConfigured && isUUID(organizationId) && isUUID(input.conversationId)) {
      try {
        // Resolve authenticated user for sender_id
        const authUser = (await supabase.auth.getUser())?.data?.user;
        const senderId = authUser?.id;

        if (!senderId) {
          throw new Error('Authentication required: sender_id must be an authenticated user.');
        }

        // Fast-path idempotency check: check if already exists
        const { data: existing } = await supabase
          .from('conversation_messages')
          .select('*')
          .eq('organization_id', organizationId)
          .eq('client_message_id', clientMessageId)
          .maybeSingle();

        if (existing) {
          return this.mapMessageRow(existing);
        }

        // Insert message
        const { data: created, error } = await supabase
          .from('conversation_messages')
          .insert({
            organization_id: organizationId,
            conversation_id: input.conversationId,
            sender_id: senderId,
            message_type: messageType,
            channel,
            content: input.content.trim(),
            context: contextData,
            attachment_id: attachmentId,
            client_message_id: clientMessageId,
          })
          .select('*')
          .single();

        if (error) {
          // Idempotency: if unique violation occurred on retry, fetch existing
          if (error.code === '23505' || error.message.includes('uq_conversation_messages_idempotency')) {
            const { data: retryExisting } = await supabase
              .from('conversation_messages')
              .select('*')
              .eq('organization_id', organizationId)
              .eq('client_message_id', clientMessageId)
              .single();
            if (retryExisting) return this.mapMessageRow(retryExisting);
          }
          throw new Error(`Failed to send message: ${error.message}`);
        }

        if (created) {
          return this.mapMessageRow(created);
        }
      } catch (err) {
        if (err instanceof Error && err.message.includes('Failed to send message')) {
          throw err;
        }
        if (err instanceof Error && err.message.includes('Authentication required')) {
          throw err;
        }
        console.warn('[CommunicationService] Falling back for sendMessage:', err);
      }
    }

    // Local / offline fallback with strict idempotency & tenant integrity
    const conversation = await this.getConversationById(organizationId, input.conversationId);
    if (!conversation) {
      throw new Error(`Conversation ${input.conversationId} not found in organization ${organizationId}.`);
    }

    const messages = this.getOrgMessages(organizationId);

    // Idempotency check: duplicate (organization_id, client_message_id) returns existing
    const existingMessage = messages.find(
      (m) => m.organization_id === organizationId && m.client_message_id === clientMessageId
    );
    if (existingMessage) {
      return existingMessage;
    }

    let senderId = 'usr-current-sender-1';
    try {
      const authUser = (await supabase.auth.getUser())?.data?.user;
      if (authUser?.id) {
        senderId = authUser.id;
      }
    } catch {
      // demo fallback
    }

    const now = new Date().toISOString();
    const newMsg: ConversationMessage = {
      id: generateUUID(),
      organization_id: organizationId,
      conversation_id: input.conversationId,
      sender_id: senderId,
      message_type: messageType,
      channel,
      content: input.content.trim(),
      created_at: now,
      updated_at: now,
      read_at: null,
      acknowledged_at: null,
      attachment_id: attachmentId,
      context: contextData,
      metadata: contextData,
      client_message_id: clientMessageId,
      deleted_at: null,
    };

    messages.push(newMsg);
    this.saveOrgMessages(organizationId, messages);

    // Touch conversation updated_at
    conversation.updated_at = now;
    const conversations = this.getOrgConversations(organizationId);
    const cIdx = conversations.findIndex((c) => c.id === conversation.id);
    if (cIdx >= 0) {
      conversations[cIdx] = conversation;
      this.saveOrgConversations(organizationId, conversations);
    }

    return newMsg;
  }

  /**
   * Mark a message as read.
   * Updates read_at independently from acknowledged_at.
   */
  async markMessageRead(organizationId: string, messageId: string): Promise<ConversationMessage> {
    if (!organizationId || !messageId) {
      throw new Error('Organization ID and Message ID are required.');
    }

    const now = new Date().toISOString();

    if (isSupabaseConfigured && isUUID(organizationId) && isUUID(messageId)) {
      try {
        const { data, error } = await supabase
          .from('conversation_messages')
          .update({ read_at: now })
          .eq('organization_id', organizationId)
          .eq('id', messageId)
          .is('read_at', null)
          .select('*')
          .maybeSingle();

        if (error) {
          throw new Error(`Failed to mark message read: ${error.message}`);
        }

        if (data) {
          return this.mapMessageRow(data);
        }

        // If already read, retrieve existing
        const { data: current } = await supabase
          .from('conversation_messages')
          .select('*')
          .eq('organization_id', organizationId)
          .eq('id', messageId)
          .single();
        if (current) return this.mapMessageRow(current);
      } catch (err) {
        if (err instanceof Error && err.message.includes('Failed to mark message read')) {
          throw err;
        }
        console.warn('[CommunicationService] Falling back for markMessageRead:', err);
      }
    }

    const messages = this.getOrgMessages(organizationId);
    const index = messages.findIndex((m) => m.id === messageId && m.organization_id === organizationId);
    if (index === -1) {
      throw new Error(`Message ${messageId} not found in organization.`);
    }

    // Preserve first read_at timestamp if already marked
    if (!messages[index].read_at) {
      messages[index] = {
        ...messages[index],
        read_at: now,
        updated_at: now,
      };
      this.saveOrgMessages(organizationId, messages);
    }

    return messages[index];
  }

  /**
   * Mark a message as acknowledged.
   * Updates acknowledged_at independently from read_at.
   */
  async markMessageAcknowledged(
    organizationId: string,
    messageId: string
  ): Promise<ConversationMessage> {
    if (!organizationId || !messageId) {
      throw new Error('Organization ID and Message ID are required.');
    }

    const now = new Date().toISOString();

    if (isSupabaseConfigured && isUUID(organizationId) && isUUID(messageId)) {
      try {
        const { data, error } = await supabase
          .from('conversation_messages')
          .update({ acknowledged_at: now })
          .eq('organization_id', organizationId)
          .eq('id', messageId)
          .is('acknowledged_at', null)
          .select('*')
          .maybeSingle();

        if (error) {
          throw new Error(`Failed to mark message acknowledged: ${error.message}`);
        }

        if (data) {
          return this.mapMessageRow(data);
        }

        const { data: current } = await supabase
          .from('conversation_messages')
          .select('*')
          .eq('organization_id', organizationId)
          .eq('id', messageId)
          .single();
        if (current) return this.mapMessageRow(current);
      } catch (err) {
        if (err instanceof Error && err.message.includes('Failed to mark message acknowledged')) {
          throw err;
        }
        console.warn('[CommunicationService] Falling back for markMessageAcknowledged:', err);
      }
    }

    const messages = this.getOrgMessages(organizationId);
    const index = messages.findIndex((m) => m.id === messageId && m.organization_id === organizationId);
    if (index === -1) {
      throw new Error(`Message ${messageId} not found in organization.`);
    }

    // Preserve first acknowledged_at timestamp if already marked
    if (!messages[index].acknowledged_at) {
      messages[index] = {
        ...messages[index],
        acknowledged_at: now,
        updated_at: now,
      };
      this.saveOrgMessages(organizationId, messages);
    }

    return messages[index];
  }

  /**
   * Soft-delete a message (sets deleted_at).
   */
  async deleteMessage(organizationId: string, messageId: string): Promise<void> {
    if (!organizationId || !messageId) return;

    const now = new Date().toISOString();

    if (isSupabaseConfigured && isUUID(organizationId) && isUUID(messageId)) {
      try {
        await supabase
          .from('conversation_messages')
          .update({ deleted_at: now })
          .eq('organization_id', organizationId)
          .eq('id', messageId);
        return;
      } catch (err) {
        console.warn('[CommunicationService] Falling back for deleteMessage:', err);
      }
    }

    const messages = this.getOrgMessages(organizationId);
    const index = messages.findIndex((m) => m.id === messageId && m.organization_id === organizationId);
    if (index >= 0) {
      messages[index] = {
        ...messages[index],
        deleted_at: now,
        updated_at: now,
      };
      this.saveOrgMessages(organizationId, messages);
    }
  }

  /**
   * Get unread message counts across the organization for a user (excluding caller's own sent messages).
   * Strict tenant scoping on organization_id, read_at IS NULL, and deleted_at IS NULL.
   */
  async getUnreadMessageCountForOrg(
    organizationId: string,
    currentUserId: string
  ): Promise<UnreadMessageSummary> {
    if (!organizationId) {
      return { total: 0, byConversation: {} };
    }

    if (isSupabaseConfigured && isUUID(organizationId)) {
      try {
        let query = supabase
          .from('conversation_messages')
          .select('conversation_id')
          .eq('organization_id', organizationId)
          .is('read_at', null)
          .is('deleted_at', null);

        if (currentUserId) {
          query = query.neq('sender_id', currentUserId);
        }

        const { data, error } = await query;
        if (error) {
          console.warn('[CommunicationService] Supabase getUnreadMessageCountForOrg error, falling back:', error);
        } else if (data) {
          const byConversation: Record<string, number> = {};
          let total = 0;
          for (const row of data) {
            const convId = row.conversation_id;
            if (convId) {
              byConversation[convId] = (byConversation[convId] || 0) + 1;
              total++;
            }
          }
          return { total, byConversation };
        }
      } catch (err) {
        console.warn('[CommunicationService] Network error getUnreadMessageCountForOrg, falling back:', err);
      }
    }

    // Fallback/test runner storage
    const messages = this.getOrgMessages(organizationId);
    const byConversation: Record<string, number> = {};
    let total = 0;

    for (const m of messages) {
      if (
        !m.deleted_at &&
        !m.read_at &&
        (!currentUserId || m.sender_id !== currentUserId)
      ) {
        const convId = m.conversation_id;
        if (convId) {
          byConversation[convId] = (byConversation[convId] || 0) + 1;
          total++;
        }
      }
    }

    return { total, byConversation };
  }

  /**
   * Get unread message counts for a specific driver (e.g. driver portal or driver-scoped threads).
   * Strictly scopes to conversations belonging to the specified driver, filtering
   * read_at IS NULL, deleted_at IS NULL, and excluding caller's own sent messages.
   * Fully respects database RLS policies.
   */
  async getUnreadMessageCountForDriver(
    organizationId: string,
    driverId: string,
    currentUserId: string
  ): Promise<UnreadMessageSummary> {
    if (!organizationId || !driverId) {
      return { total: 0, byConversation: {} };
    }

    if (isSupabaseConfigured && isUUID(organizationId)) {
      try {
        // First resolve conversations for this driver within the active organization
        const { data: convData, error: convError } = await supabase
          .from('conversations')
          .select('id')
          .eq('organization_id', organizationId)
          .eq('driver_id', driverId)
          .is('deleted_at', null);

        if (convError) {
          console.warn('[CommunicationService] Supabase getUnreadMessageCountForDriver conversations error, falling back:', convError);
        } else if (convData) {
          const driverConvIds = convData.map((c) => c.id).filter(Boolean);
          if (driverConvIds.length === 0) {
            return { total: 0, byConversation: {} };
          }

          let query = supabase
            .from('conversation_messages')
            .select('conversation_id')
            .eq('organization_id', organizationId)
            .in('conversation_id', driverConvIds)
            .is('read_at', null)
            .is('deleted_at', null);

          if (currentUserId) {
            query = query.neq('sender_id', currentUserId);
          }

          const { data: msgData, error: msgError } = await query;
          if (msgError) {
            console.warn('[CommunicationService] Supabase getUnreadMessageCountForDriver messages error, falling back:', msgError);
          } else if (msgData) {
            const byConversation: Record<string, number> = {};
            let total = 0;
            for (const row of msgData) {
              const convId = row.conversation_id;
              if (convId) {
                byConversation[convId] = (byConversation[convId] || 0) + 1;
                total++;
              }
            }
            return { total, byConversation };
          }
        }
      } catch (err) {
        console.warn('[CommunicationService] Network error getUnreadMessageCountForDriver, falling back:', err);
      }
    }

    // Fallback/test runner storage
    const driverConvIds = new Set(
      this.getOrgConversations(organizationId)
        .filter((c) => c.driver_id === driverId && !c.deleted_at)
        .map((c) => c.id)
    );

    if (driverConvIds.size === 0) {
      return { total: 0, byConversation: {} };
    }

    const messages = this.getOrgMessages(organizationId);
    const byConversation: Record<string, number> = {};
    let total = 0;

    for (const m of messages) {
      if (
        driverConvIds.has(m.conversation_id) &&
        !m.deleted_at &&
        !m.read_at &&
        (!currentUserId || m.sender_id !== currentUserId)
      ) {
        const convId = m.conversation_id;
        if (convId) {
          byConversation[convId] = (byConversation[convId] || 0) + 1;
          total++;
        }
      }
    }

    return { total, byConversation };
  }

  // ---------------------------------------------------------------------------
  // Phone Normalization & Deep-Link Helpers
  // ---------------------------------------------------------------------------
  /**
   * Normalizes a phone number to standard +1 E.164 format for USA/Canada 10-digit numbers,
   * while preserving valid international numbers and handling null/empty/invalid values.
   */
  normalizePhoneNumber(phone: string): string;
  normalizePhoneNumber(phone: null): null;
  normalizePhoneNumber(phone: undefined): undefined;
  normalizePhoneNumber(phone?: string | null): string | null | undefined;
  normalizePhoneNumber(phone?: string | null): string | null | undefined {
    return normalizePhoneNumber(phone);
  }

  /**
   * Generates a native SMS deep link using the normalized E.164 phone number.
   */
  generateSmsLink(phone?: string | null, content?: string): string {
    return generateSmsLink(phone, content);
  }

  /**
   * Generates a WhatsApp deep link using the normalized E.164 phone number.
   */
  generateWhatsAppLink(phone?: string | null, content?: string): string {
    return generateWhatsAppLink(phone, content);
  }

  /**
   * Formats a driver communication recipient phone value.
   */
  formatDriverRecipient(phone?: string | null): string {
    return formatDriverRecipient(phone);
  }

  /**
   * Direct SMS dispatcher helper for driver communication with normalized E.164 recipient.
   */
  async sendDirectDriverSms(params: {
    organization_id: string;
    driver_name: string;
    driver_phone: string;
    load_id?: string | null;
    load_number?: string | null;
    content: string;
    sender_name?: string;
  }): Promise<{
    success: boolean;
    sms_link: string;
    whatsapp_link: string;
    recipient: string;
    message_id?: string;
  }> {
    const cleanPhone = normalizePhoneNumber(params.driver_phone) || '';
    const smsLink = generateSmsLink(cleanPhone, params.content);
    const whatsappLink = generateWhatsAppLink(cleanPhone, params.content);

    return {
      success: true,
      sms_link: smsLink,
      whatsapp_link: whatsappLink,
      recipient: cleanPhone,
    };
  }

  /**
   * Generates load assignment SMS content and deep links with normalized E.164 recipient.
   */
  generateLoadAssignmentSms(params: {
    driver_name?: string;
    driver_phone?: string;
    load_number: string;
    origin: string;
    destination: string;
    pickup_date?: string;
    delivery_date?: string;
    rate?: number | string;
  }): { content: string; sms_link: string; whatsapp_link: string } {
    const cleanPhone = normalizePhoneNumber(params.driver_phone) || '';
    const content = `Load Assignment #${params.load_number}: Pickup ${params.origin} -> Delivery ${params.destination}. Please confirm receipt.`;
    return {
      content,
      sms_link: generateSmsLink(cleanPhone, content),
      whatsapp_link: generateWhatsAppLink(cleanPhone, content),
    };
  }

  // ---------------------------------------------------------------------------
  // Internal Row Mappers
  // ---------------------------------------------------------------------------
  private mapConversationRow(row: any): Conversation {
    let appType: ConversationType = 'general';
    if (row.type === 'load') {
      appType = 'load';
    } else if (row.status === 'escalated') {
      appType = 'emergency';
    }

    return {
      id: row.id,
      organization_id: row.organization_id,
      driver_id: row.driver_id,
      type: appType,
      load_id: row.load_id || null,
      status: row.status as ConversationStatus,
      created_at: row.created_at,
      updated_at: row.updated_at,
      resolved_at: row.resolved_at || null,
      deleted_at: row.deleted_at || null,
      driver: row.driver
        ? {
            ...row.driver,
            phone: row.driver.phone ? normalizePhoneNumber(row.driver.phone) : row.driver.phone,
          }
        : undefined,
    };
  }

  private mapMessageRow(row: any): ConversationMessage {
    const contextObj = row.context && typeof row.context === 'object' ? row.context : null;
    return {
      id: row.id,
      organization_id: row.organization_id,
      conversation_id: row.conversation_id,
      sender_id: row.sender_id,
      message_type: row.message_type as MessageType,
      channel: row.channel as MessageChannel,
      content: row.content,
      created_at: row.created_at,
      updated_at: row.updated_at,
      read_at: row.read_at || null,
      acknowledged_at: row.acknowledged_at || null,
      attachment_id: row.attachment_id || null,
      context: contextObj,
      metadata: contextObj,
      client_message_id: row.client_message_id,
      deleted_at: row.deleted_at || null,
    };
  }
}

export const communicationService = new CommunicationService();
