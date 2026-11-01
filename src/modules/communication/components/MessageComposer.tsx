import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  MessageSquare,
  AlertCircle,
  HelpCircle,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';
import { MessageType, ConversationStatus } from '../types.ts';

interface MessageComposerProps {
  onSendMessage: (content: string, messageType: MessageType) => Promise<void>;
  isSending: boolean;
  conversationStatus: ConversationStatus;
  onReopenConversation?: () => void;
}

interface TypeOption {
  type: MessageType;
  label: string;
  icon: React.FC<{ className?: string }>;
  accentColor: string;
  badgeBg: string;
  placeholder: string;
}

const MESSAGE_TYPE_OPTIONS: TypeOption[] = [
  {
    type: 'text',
    label: 'Standard',
    icon: MessageSquare,
    accentColor: 'text-slate-300',
    badgeBg: 'hover:bg-slate-800',
    placeholder: 'Type a message to driver... (Enter to send, Shift+Enter for newline)',
  },
  {
    type: 'instruction',
    label: 'Instruction',
    icon: AlertCircle,
    accentColor: 'text-amber-400',
    badgeBg: 'hover:bg-amber-950/40',
    placeholder: 'Enter driver instruction (e.g. check-in procedure, PPE requirement, dock gate)...',
  },
  {
    type: 'question',
    label: 'Question',
    icon: HelpCircle,
    accentColor: 'text-sky-400',
    badgeBg: 'hover:bg-sky-950/40',
    placeholder: 'Ask driver a question (e.g. current ETA, trailer temperature, fuel level)...',
  },
  {
    type: 'status_update',
    label: 'Status',
    icon: CheckCircle2,
    accentColor: 'text-emerald-400',
    badgeBg: 'hover:bg-emerald-950/40',
    placeholder: 'Record status update (e.g. appointment confirmed, paperwork cleared)...',
  },
  {
    type: 'exception_update',
    label: 'Exception',
    icon: AlertTriangle,
    accentColor: 'text-rose-400',
    badgeBg: 'hover:bg-rose-950/40',
    placeholder: 'Report critical issue / alert (e.g. delay, breakdown, detention, weather)...',
  },
];

export const MessageComposer: React.FC<MessageComposerProps> = ({
  onSendMessage,
  isSending,
  conversationStatus,
  onReopenConversation,
}) => {
  const [content, setContent] = useState('');
  const [selectedType, setSelectedType] = useState<MessageType>('text');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isResolved = conversationStatus === 'resolved';

  const currentOption =
    MESSAGE_TYPE_OPTIONS.find((opt) => opt.type === selectedType) || MESSAGE_TYPE_OPTIONS[0];

  useEffect(() => {
    if (!isResolved && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [selectedType, isResolved]);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!content.trim() || isSending || isResolved) return;

    const textToSend = content.trim();
    setContent('');
    try {
      await onSendMessage(textToSend, selectedType);
      // Reset to standard after non-standard message
      if (selectedType !== 'text') {
        setSelectedType('text');
      }
    } catch (err) {
      // Restore content on error
      setContent(textToSend);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  if (isResolved) {
    return (
      <div
        id="message-composer-resolved"
        className="p-3.5 sm:p-4 bg-slate-900 border-t border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 text-xs text-slate-400"
      >
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-slate-500" />
          <span>This conversation is marked as resolved.</span>
        </div>
        {onReopenConversation && (
          <button
            id="btn-reopen-composer"
            type="button"
            onClick={onReopenConversation}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 sm:py-1.5 rounded-lg bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-600/30 font-semibold transition-colors cursor-pointer shrink-0 min-h-[36px]"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reopen Conversation</span>
          </button>
        )}
      </div>
    );
  }

  return (
    <div id="message-composer" className="p-3.5 bg-slate-900 border-t border-slate-800 space-y-2.5">
      {/* Message Type Selector Pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mr-1 shrink-0">
          Type:
        </span>
        {MESSAGE_TYPE_OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const isSelected = selectedType === opt.type;
          return (
            <button
              key={opt.type}
              id={`msg-type-pill-${opt.type}`}
              type="button"
              onClick={() => setSelectedType(opt.type)}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-all cursor-pointer border ${
                isSelected
                  ? 'bg-slate-800 text-slate-100 border-slate-600 shadow-xs'
                  : 'bg-slate-950/60 text-slate-400 border-slate-800 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Icon className={`w-3 h-3 ${isSelected ? opt.accentColor : 'text-slate-400'}`} />
              <span>{opt.label}</span>
            </button>
          );
        })}
      </div>

      {/* Input Area */}
      <form onSubmit={handleSubmit} className="relative flex items-end gap-2">
        <div className="relative flex-1 min-w-0">
          <textarea
            ref={textareaRef}
            id="message-input-textarea"
            rows={2}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={currentOption.placeholder}
            disabled={isSending}
            className="w-full px-3.5 py-2.5 text-xs text-slate-100 bg-slate-950 border border-slate-800 rounded-xl focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/40 resize-none placeholder:text-slate-500 disabled:opacity-60 transition-colors"
          />
        </div>

        <button
          id="btn-send-message"
          type="submit"
          disabled={!content.trim() || isSending}
          className="h-11 min-w-[44px] px-4 rounded-xl bg-indigo-600 text-white font-semibold text-xs inline-flex items-center justify-center gap-1.5 shadow-sm hover:bg-indigo-500 active:bg-indigo-700 disabled:opacity-40 disabled:hover:bg-indigo-600 transition-all shrink-0 cursor-pointer"
          title="Send message (Enter)"
          aria-label="Send message"
        >
          {isSending ? (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <>
              <Send className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Send</span>
            </>
          )}
        </button>
      </form>
    </div>
  );
};
