import React from 'react';
import {
  ArrowLeft,
  User,
  Phone,
  Package,
  CheckCircle2,
  RotateCcw,
  RefreshCw,
  AlertTriangle,
  Radio,
  MapPin,
} from 'lucide-react';
import { Conversation } from '../types.ts';

interface ConversationHeaderProps {
  conversation: Conversation;
  onBack?: () => void;
  onToggleStatus?: () => Promise<void>;
  onRefresh?: () => Promise<void>;
  isUpdatingStatus?: boolean;
  isLoadingMessages?: boolean;
}

export const ConversationHeader: React.FC<ConversationHeaderProps> = ({
  conversation,
  onBack,
  onToggleStatus,
  onRefresh,
  isUpdatingStatus = false,
  isLoadingMessages = false,
}) => {
  const driverName = conversation.driver?.full_name || 'Assigned Driver';
  const driverPhone = conversation.driver?.phone;
  const isResolved = conversation.status === 'resolved';
  const isEscalated = conversation.status === 'escalated';

  return (
    <div
      id="conversation-header"
      className="px-4 py-3.5 bg-slate-900 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0"
    >
      {/* Left section: Back button & Driver Identity */}
      <div className="flex items-center gap-3 min-w-0">
        {onBack && (
          <button
            id="btn-back-to-conversations"
            type="button"
            onClick={onBack}
            className="p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 lg:hidden transition-colors cursor-pointer shrink-0"
            title="Back to conversations"
            aria-label="Back to conversations"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
        )}

        <div className="relative">
          <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700/80 flex items-center justify-center text-indigo-400 font-bold shrink-0 shadow-xs">
            <User className="w-5 h-5" />
          </div>
          {conversation.type === 'load' && (
            <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-indigo-600 border-2 border-slate-900 flex items-center justify-center text-white">
              <Package className="w-2.5 h-2.5" />
            </div>
          )}
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-sm font-bold text-slate-100 truncate tracking-tight">
              {driverName}
            </h2>

            {/* Type badge */}
            <span
              className={`text-[10px] px-2 py-0.5 rounded-full font-medium border ${
                conversation.type === 'load'
                  ? 'bg-indigo-950/60 text-indigo-300 border-indigo-800/60'
                  : conversation.type === 'emergency'
                  ? 'bg-rose-950/60 text-rose-300 border-rose-800/60'
                  : 'bg-slate-800 text-slate-300 border-slate-700'
              }`}
            >
              {conversation.type === 'load'
                ? 'Load Specific'
                : conversation.type === 'emergency'
                ? 'Emergency'
                : 'General Thread'}
            </span>

            {/* Status pill */}
            <span
              className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-semibold border ${
                isResolved
                  ? 'bg-slate-800/80 text-slate-400 border-slate-700'
                  : isEscalated
                  ? 'bg-rose-950/60 text-rose-400 border-rose-800'
                  : 'bg-emerald-950/60 text-emerald-400 border-emerald-800'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  isResolved
                    ? 'bg-slate-500'
                    : isEscalated
                    ? 'bg-rose-500 animate-pulse'
                    : 'bg-emerald-400'
                }`}
              />
              {isResolved ? 'Resolved' : isEscalated ? 'Escalated' : 'Active'}
            </span>
          </div>

          {/* Subtitle / Driver Contact */}
          <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5">
            {driverPhone && (
              <span className="inline-flex items-center gap-1">
                <Phone className="w-3 h-3 text-slate-500" />
                <span>{driverPhone}</span>
              </span>
            )}
            {conversation.driver?.status && (
              <span className="text-slate-500 text-[11px] capitalize">
                • {conversation.driver.status.replace(/_/g, ' ')}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Center/Right: Load Context (if load-linked) & Action Buttons */}
      <div className="flex items-center gap-2.5 ml-auto">
        {/* Load Context Badge */}
        {conversation.load && (
          <div className="hidden sm:flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs">
            <Package className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            <span className="font-mono font-bold text-slate-200">
              {conversation.load.load_number}
            </span>
            {(conversation.load.origin_city || conversation.load.dest_city) && (
              <span className="text-slate-400 text-[11px] flex items-center gap-1 border-l border-slate-800 pl-2">
                <MapPin className="w-3 h-3 text-slate-500" />
                <span>
                  {conversation.load.origin_state || conversation.load.origin_city || '—'} ➔{' '}
                  {conversation.load.dest_state || conversation.load.dest_city || '—'}
                </span>
              </span>
            )}
            {conversation.load.pipeline_status && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300 uppercase tracking-wider font-mono font-medium">
                {conversation.load.pipeline_status.replace(/_/g, ' ')}
              </span>
            )}
          </div>
        )}

        {/* Refresh Button */}
        {onRefresh && (
          <button
            id="btn-refresh-thread"
            type="button"
            onClick={onRefresh}
            disabled={isLoadingMessages}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 transition-colors disabled:opacity-50 cursor-pointer"
            title="Refresh messages"
            aria-label="Refresh messages"
          >
            <RefreshCw
              className={`w-4 h-4 ${isLoadingMessages ? 'animate-spin text-indigo-400' : ''}`}
            />
          </button>
        )}

        {/* Resolve / Reopen Button */}
        {onToggleStatus && (
          <button
            id="btn-toggle-conversation-status"
            type="button"
            onClick={onToggleStatus}
            disabled={isUpdatingStatus}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all cursor-pointer ${
              isResolved
                ? 'bg-slate-800 text-slate-200 border-slate-700 hover:bg-slate-700 hover:text-white'
                : 'bg-emerald-950/40 text-emerald-300 border-emerald-800/60 hover:bg-emerald-900/60'
            } disabled:opacity-50`}
          >
            {isResolved ? (
              <>
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reopen</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Resolve</span>
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
};
