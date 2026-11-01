/**
 * DispatcherDesk Communication Foundation Types
 * File: src/modules/communication/types.ts
 *
 * Domain types and interfaces for driver-dispatcher communication.
 * Preserves full database semantics from migrations:
 * - 20260905000004_communication_foundation.sql
 * - 20260905000005_communication_messages_foundation.sql
 * - 20260905000006_driver_identity_foundation.sql
 */

export type ConversationType = 'general' | 'load' | 'check_in' | 'emergency';
export type DbConversationType = 'general' | 'load';
export type ConversationStatus = 'active' | 'resolved' | 'escalated';

export type MessageType =
  | 'text'
  | 'instruction'
  | 'question'
  | 'confirmation'
  | 'quick_action'
  | 'status_update'
  | 'exception_update'
  | 'document_message'
  | 'system_notice';

export type MessageChannel =
  | 'in_app'
  | 'phone'
  | 'sms'
  | 'email'
  | 'whatsapp'
  | 'in_person'
  | 'other';

export interface Conversation {
  id: string;
  organization_id: string;
  driver_id: string;
  type: ConversationType;
  load_id: string | null;
  status: ConversationStatus;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  deleted_at: string | null;

  // Augmented relations (optional, populated when requested)
  driver?: {
    id: string;
    full_name: string;
    phone?: string | null;
    status?: string | null;
  } | null;
  load?: {
    id: string;
    load_number: string;
    origin_city?: string | null;
    origin_state?: string | null;
    dest_city?: string | null;
    dest_state?: string | null;
    pipeline_status?: string | null;
  } | null;
  last_message?: ConversationMessage | null;
  unread_count?: number;
}

export interface ConversationMessage {
  id: string;
  organization_id: string;
  conversation_id: string;
  sender_id: string;
  message_type: MessageType;
  channel: MessageChannel;
  content: string | null;
  created_at: string;
  updated_at: string;
  read_at: string | null;
  acknowledged_at: string | null;
  attachment_id: string | null;
  context: Record<string, any> | null;
  metadata?: Record<string, any> | null; // Semantic alias for context
  client_message_id: string;
  deleted_at: string | null;

  // Augmented relations
  sender?: {
    id: string;
    full_name?: string | null;
    role?: string | null;
  } | null;
}

export interface ListConversationsOptions {
  driverId?: string;
  loadId?: string;
  status?: ConversationStatus;
  type?: ConversationType;
  limit?: number;
  offset?: number;
}

export interface ListMessagesOptions {
  limit?: number;
  offset?: number;
}

export interface SendMessageInput {
  conversationId: string;
  content: string;
  messageType?: MessageType;
  channel?: MessageChannel;
  clientMessageId?: string;
  client_message_id?: string;
  attachmentId?: string | null;
  attachment_id?: string | null;
  context?: Record<string, any> | null;
  metadata?: Record<string, any> | null;
}

export interface CreateLoadConversationOptions {
  initialStatus?: ConversationStatus;
  type?: 'load' | 'emergency';
}

export interface MessageAttachmentContext {
  storage_path: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  media_type: 'image' | 'document' | 'audio';
  signed_url?: string | null;
}
