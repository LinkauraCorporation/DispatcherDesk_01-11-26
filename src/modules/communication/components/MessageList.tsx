import React, { useEffect, useRef } from 'react';
import {
  AlertCircle,
  HelpCircle,
  CheckCircle2,
  AlertTriangle,
  Check,
  CheckCheck,
  Clock,
  User,
  Shield,
  Radio,
  MapPin,
  FileText,
  ExternalLink,
  Paperclip,
} from 'lucide-react';
import { ConversationMessage, MessageType } from '../types.ts';
import { ChatAttachmentView } from './ChatAttachmentView.tsx';

interface MessageListProps {
  messages: ConversationMessage[];
  isLoading: boolean;
  currentUserId?: string;
  driverName?: string;
  onAcknowledgeMessage?: (messageId: string) => Promise<void>;
  onLogCheckCall?: (message: ConversationMessage) => void;
  loggedCheckCallMessageIds?: Set<string>;
}

function formatMessageTime(isoString: string): string {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '';
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (isToday) {
      return timeStr;
    }
    const isThisYear = d.getFullYear() === now.getFullYear();
    const dateStr = d.toLocaleDateString([], {
      month: 'short',
      day: 'numeric',
      ...(isThisYear ? {} : { year: 'numeric' }),
    });
    return `${dateStr} • ${timeStr}`;
  } catch {
    return isoString;
  }
}

function getMessageTypeBadge(type: MessageType) {
  switch (type) {
    case 'instruction':
      return {
        label: 'Instruction',
        icon: AlertCircle,
        badgeClass: 'bg-amber-950/80 text-amber-300 border-amber-800/80',
        iconColor: 'text-amber-400',
        borderAccent: 'border-l-4 border-l-amber-500',
      };
    case 'question':
      return {
        label: 'Question',
        icon: HelpCircle,
        badgeClass: 'bg-sky-950/80 text-sky-300 border-sky-800/80',
        iconColor: 'text-sky-400',
        borderAccent: 'border-l-4 border-l-sky-500',
      };
    case 'status_update':
      return {
        label: 'Status Update',
        icon: CheckCircle2,
        badgeClass: 'bg-emerald-950/80 text-emerald-300 border-emerald-800/80',
        iconColor: 'text-emerald-400',
        borderAccent: 'border-l-4 border-l-emerald-500',
      };
    case 'exception_update':
      return {
        label: 'Exception / Urgent',
        icon: AlertTriangle,
        badgeClass: 'bg-rose-950/80 text-rose-300 border-rose-800/80',
        iconColor: 'text-rose-400',
        borderAccent: 'border-l-4 border-l-rose-500',
      };
    case 'system_notice':
      return {
        label: 'System',
        icon: Shield,
        badgeClass: 'bg-slate-800 text-slate-300 border-slate-700',
        iconColor: 'text-slate-400',
        borderAccent: '',
      };
    case 'document_message':
      return {
        label: 'Document / Photo',
        icon: Paperclip,
        badgeClass: 'bg-indigo-950/80 text-indigo-300 border-indigo-800/80',
        iconColor: 'text-indigo-400',
        borderAccent: 'border-l-4 border-l-indigo-500',
      };
    default:
      return null;
  }
}

export const MessageList: React.FC<MessageListProps> = ({
  messages,
  isLoading,
  currentUserId,
  driverName = 'Driver',
  onAcknowledgeMessage,
  onLogCheckCall,
  loggedCheckCallMessageIds,
}) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on message updates
  useEffect(() => {
    if (!isLoading && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isLoading]);

  if (isLoading) {
    return (
      <div
        id="message-list-loading"
        className="flex-1 flex flex-col items-center justify-center p-8 text-slate-500 gap-2"
      >
        <div className="w-7 h-7 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-xs">Loading message history...</span>
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div
        id="message-list-empty"
        className="flex-1 flex flex-col items-center justify-center p-8 text-center"
      >
        <div className="w-12 h-12 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-600 mb-3">
          <Clock className="w-6 h-6" />
        </div>
        <h4 className="text-sm font-semibold text-slate-300">No Messages Yet</h4>
        <p className="text-xs text-slate-500 max-w-sm mt-1 leading-relaxed">
          Start the conversation with {driverName}. You can send standard messages, dock
          instructions, status inquiries, or critical alerts.
        </p>
      </div>
    );
  }

  return (
    <div
      id="message-list-container"
      className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 overscroll-contain"
    >
      {messages.map((msg) => {
        // Distinguish outgoing (dispatcher / current user) vs incoming (driver)
        // If sender_id matches currentUserId, or if sender role is not driver, outgoing from office
        const isOutgoing =
          Boolean(currentUserId && msg.sender_id === currentUserId) ||
          msg.sender?.role === 'owner_admin' ||
          msg.sender?.role === 'dispatcher';

        const typeBadge = getMessageTypeBadge(msg.message_type);
        const timeFormatted = formatMessageTime(msg.created_at);

        const isDelayCheckCallCandidate =
          !isOutgoing &&
          msg.message_type === 'exception_update' &&
          Boolean(msg.context?.load_id);

        const isCheckCallLogged =
          Boolean(msg.context?.check_call_id) ||
          (loggedCheckCallMessageIds ? loggedCheckCallMessageIds.has(msg.id) : false);

        if (msg.message_type === 'system_notice') {
          return (
            <div key={msg.id} className="flex justify-center my-3 px-2">
              <div className="max-w-full px-3 py-1 rounded-xl sm:rounded-full bg-slate-900 border border-slate-800 text-[11px] text-slate-400 flex flex-wrap items-center justify-center gap-1.5 shadow-xs text-center break-words">
                <Shield className="w-3 h-3 text-slate-500 shrink-0" />
                <span className="break-words">{msg.content}</span>
                <span className="text-slate-600 text-[10px] whitespace-nowrap">• {timeFormatted}</span>
              </div>
            </div>
          );
        }

        return (
          <div
            key={msg.id}
            id={`message-row-${msg.id}`}
            className={`flex flex-col ${isOutgoing ? 'items-end' : 'items-start'}`}
          >
            {/* Sender attribution */}
            <div className="flex items-center gap-1.5 mb-1 px-1 text-[11px] text-slate-400">
              <span className="font-medium text-slate-300">
                {isOutgoing
                  ? msg.sender?.full_name || 'Dispatcher (You)'
                  : msg.sender?.full_name || driverName}
              </span>
              <span className="text-slate-500">•</span>
              <span className="text-slate-500 font-mono text-[10px]">{timeFormatted}</span>
            </div>

            {/* Bubble Card */}
            <div
              className={`max-w-[85%] sm:max-w-xl rounded-2xl p-3 sm:p-3.5 shadow-xs transition-all ${
                isOutgoing
                  ? 'bg-indigo-600/15 border border-indigo-500/30 text-slate-100 rounded-br-xs'
                  : 'bg-slate-900 border border-slate-800 text-slate-100 rounded-bl-xs'
              } ${typeBadge?.borderAccent || ''}`}
            >
              {/* Type Chip Header if not standard text */}
              {typeBadge && (
                <div className="flex items-center gap-1.5 mb-2">
                  <span
                    className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md font-semibold border ${typeBadge.badgeClass}`}
                  >
                    <typeBadge.icon className={`w-3 h-3 ${typeBadge.iconColor}`} />
                    <span>{typeBadge.label}</span>
                  </span>
                </div>
              )}

              {/* Message Content */}
              {msg.content && (
                <div className="text-xs sm:text-sm whitespace-pre-wrap break-words leading-relaxed text-slate-200">
                  {msg.content}
                </div>
              )}

              {/* Attachment Display (Photo or Document) */}
              {msg.context?.attachment && (
                <div className={`${msg.content ? 'mt-2.5' : ''} space-y-1.5`}>
                  <ChatAttachmentView
                    attachment={msg.context.attachment}
                    isOutbound={isOutgoing}
                  />
                </div>
              )}

              {/* Driver Delay Action: Log Check Call */}
              {isDelayCheckCallCandidate && (
                <div className="mt-2.5 pt-2 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2">
                  {isCheckCallLogged ? (
                    <span
                      id={`check-call-logged-badge-${msg.id}`}
                      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-950/80 text-emerald-300 border border-emerald-800/80 shadow-xs"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span>✓ Check Call Logged</span>
                    </span>
                  ) : (
                    <button
                      id={`btn-log-check-call-${msg.id}`}
                      type="button"
                      onClick={() => onLogCheckCall?.(msg)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-rose-950/90 hover:bg-rose-900 text-rose-200 border border-rose-700/80 hover:border-rose-600 transition-colors cursor-pointer shadow-xs"
                      title="Log an operational check call for this driver delay notice"
                    >
                      <Radio className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                      <span>Log Check Call</span>
                    </button>
                  )}
                  <div className="flex items-center gap-2">
                    {typeof msg.context?.latitude === 'number' && typeof msg.context?.longitude === 'number' && (
                      <span
                        id={`msg-gps-badge-${msg.id}`}
                        className="inline-flex items-center gap-1 text-[10px] text-emerald-400 font-mono bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-800/60"
                        title={`Driver GPS: ${msg.context.latitude.toFixed(4)}, ${msg.context.longitude.toFixed(4)}`}
                      >
                        <MapPin className="w-2.5 h-2.5 shrink-0" />
                        <span>GPS</span>
                      </span>
                    )}
                    {msg.context?.load_number && (
                      <span className="text-[10px] text-slate-400 font-mono">
                        Load #{msg.context.load_number}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Acknowledged / Read State Footer */}
              <div className="mt-2.5 pt-1.5 border-t border-slate-800/60 flex flex-wrap items-center justify-between gap-2 text-[10px]">
                {/* Left status: Acknowledged State */}
                <div>
                  {msg.acknowledged_at ? (
                    <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold">
                      <CheckCheck className="w-3.5 h-3.5" />
                      <span>
                        Acknowledged at {formatMessageTime(msg.acknowledged_at)}
                      </span>
                    </span>
                  ) : msg.message_type === 'instruction' && !isOutgoing && onAcknowledgeMessage ? (
                    <button
                      type="button"
                      onClick={() => onAcknowledgeMessage(msg.id)}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-800/80 hover:bg-emerald-900 font-medium transition-colors cursor-pointer"
                    >
                      <Check className="w-3 h-3" />
                      <span>Acknowledge</span>
                    </button>
                  ) : null}
                </div>

                {/* Right status: Read State for Outgoing messages */}
                <div className="flex items-center gap-1 ml-auto font-mono text-[10px]">
                  {isOutgoing && (
                    <>
                      {msg.read_at ? (
                        <span
                          className="inline-flex items-center gap-1 text-indigo-400"
                          title={`Read by driver at ${formatMessageTime(msg.read_at)}`}
                        >
                          <CheckCheck className="w-3.5 h-3.5 text-indigo-400" />
                          <span className="text-[10px] text-slate-400">Read</span>
                        </span>
                      ) : (
                        <span
                          className="inline-flex items-center gap-1 text-slate-500"
                          title="Sent (Unread)"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span className="text-[10px]">Sent</span>
                        </span>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
};
