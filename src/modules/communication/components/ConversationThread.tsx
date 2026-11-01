import React from 'react';
import { MessageSquare, AlertCircle, X } from 'lucide-react';
import { Conversation, ConversationMessage, MessageType } from '../types.ts';
import { ConversationHeader } from './ConversationHeader.tsx';
import { MessageList } from './MessageList.tsx';
import { MessageComposer } from './MessageComposer.tsx';

interface ConversationThreadProps {
  conversation: Conversation | null;
  messages: ConversationMessage[];
  isLoadingMessages: boolean;
  isSending: boolean;
  isUpdatingStatus: boolean;
  error: string | null;
  onClearError?: () => void;
  onSendMessage: (content: string, messageType: MessageType) => Promise<void>;
  onToggleStatus: () => Promise<void>;
  onRefresh: () => Promise<void>;
  onBack?: () => void;
  onAcknowledgeMessage?: (messageId: string) => Promise<void>;
  onLogCheckCall?: (message: ConversationMessage) => void;
  loggedCheckCallMessageIds?: Set<string>;
  currentUserId?: string;
}

export const ConversationThread: React.FC<ConversationThreadProps> = ({
  conversation,
  messages,
  isLoadingMessages,
  isSending,
  isUpdatingStatus,
  error,
  onClearError,
  onSendMessage,
  onToggleStatus,
  onRefresh,
  onBack,
  onAcknowledgeMessage,
  onLogCheckCall,
  loggedCheckCallMessageIds,
  currentUserId,
}) => {
  if (!conversation) {
    return (
      <div
        id="conversation-thread-placeholder"
        className="flex-1 h-full flex flex-col items-center justify-center p-8 text-center bg-slate-950/60"
      >
        <div className="w-16 h-16 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-600 mb-4 shadow-sm">
          <MessageSquare className="w-8 h-8 text-indigo-500/60" />
        </div>
        <h3 className="text-base font-bold text-slate-200 tracking-tight">
          Select a Driver Conversation
        </h3>
        <p className="text-xs text-slate-400 max-w-sm mt-1.5 leading-relaxed">
          Choose a driver thread from the list or start a new conversation to dispatch instructions,
          check status, or resolve load issues.
        </p>
      </div>
    );
  }

  return (
    <div
      id="conversation-thread"
      className="flex-1 h-full flex flex-col bg-slate-950 min-h-0 relative overflow-hidden"
    >
      {/* Thread Header */}
      <ConversationHeader
        conversation={conversation}
        onBack={onBack}
        onToggleStatus={onToggleStatus}
        onRefresh={onRefresh}
        isUpdatingStatus={isUpdatingStatus}
        isLoadingMessages={isLoadingMessages}
      />

      {/* Error Alert Banner if present */}
      {error && (
        <div
          id="thread-error-banner"
          className="px-4 py-2.5 bg-rose-950/90 border-b border-rose-800/80 text-rose-200 text-xs flex items-center justify-between gap-2 shrink-0 animate-in fade-in duration-150"
        >
          <div className="flex items-center gap-2 min-w-0">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span className="truncate">{error}</span>
          </div>
          {onClearError && (
            <button
              type="button"
              onClick={onClearError}
              className="p-1 rounded text-rose-400 hover:text-rose-200 hover:bg-rose-900/50 transition-colors cursor-pointer shrink-0"
              aria-label="Dismiss error"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {/* Message Feed */}
      <MessageList
        messages={messages}
        isLoading={isLoadingMessages}
        currentUserId={currentUserId}
        driverName={conversation.driver?.full_name || 'Driver'}
        onAcknowledgeMessage={onAcknowledgeMessage}
        onLogCheckCall={onLogCheckCall}
        loggedCheckCallMessageIds={loggedCheckCallMessageIds}
      />

      {/* Message Input Composer */}
      <MessageComposer
        onSendMessage={onSendMessage}
        isSending={isSending}
        conversationStatus={conversation.status}
        onReopenConversation={conversation.status === 'resolved' ? onToggleStatus : undefined}
      />
    </div>
  );
};
