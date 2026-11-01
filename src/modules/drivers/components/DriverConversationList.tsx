import React from 'react';
import { Conversation } from '../../communication/types.ts';
import { DriverAssignedLoad } from '../DriverPortalView.tsx';
import { MessageSquare, Package, Clock, RefreshCw, Filter } from 'lucide-react';

interface DriverConversationListProps {
  conversations: Conversation[];
  selectedConversationId: string | null;
  onSelectConversation: (conv: Conversation) => void;
  loadsMap: Record<string, DriverAssignedLoad>;
  activeFilter: 'all' | 'active' | 'resolved';
  onChangeFilter: (filter: 'all' | 'active' | 'resolved') => void;
  isLoading: boolean;
  onRefresh: () => void;
}

export const DriverConversationList: React.FC<DriverConversationListProps> = ({
  conversations,
  selectedConversationId,
  onSelectConversation,
  loadsMap,
  activeFilter,
  onChangeFilter,
  isLoading,
  onRefresh,
}) => {
  // Load-specific operational conversations only
  const loadConvs = conversations.filter((c) => c.type === 'load' || Boolean(c.load_id));

  const formatTimestamp = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      const now = new Date();
      const isToday =
        date.getDate() === now.getDate() &&
        date.getMonth() === now.getMonth() &&
        date.getFullYear() === now.getFullYear();

      if (isToday) {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    } catch {
      return '';
    }
  };

  return (
    <div id="driver-conversation-list" className="flex flex-col h-full w-full min-w-0 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
      {/* List Header */}
      <div className="p-3.5 sm:p-4 border-b border-slate-800 bg-slate-900/90 flex items-center justify-between w-full min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <MessageSquare className="w-4 h-4 text-indigo-400 shrink-0" />
          <h3 className="text-sm font-bold text-white tracking-wide uppercase truncate">
            Conversations
          </h3>
          <span className="text-xs bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full font-semibold shrink-0">
            {loadConvs.length}
          </span>
        </div>
        <button
          id="driver-conv-refresh-btn"
          type="button"
          onClick={onRefresh}
          disabled={isLoading}
          className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer min-h-[40px] min-w-[40px] flex items-center justify-center shrink-0"
          title="Refresh conversations"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="p-2.5 bg-slate-950/60 border-b border-slate-800 flex items-center gap-1.5 overflow-x-auto w-full min-w-0">
        <Filter className="w-3.5 h-3.5 text-slate-500 ml-1 shrink-0" />
        {(['all', 'active', 'resolved'] as const).map((filter) => (
          <button
            key={filter}
            id={`driver-conv-filter-${filter}`}
            type="button"
            onClick={() => onChangeFilter(filter)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer capitalize shrink-0 min-h-[36px] ${
              activeFilter === filter
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700 hover:text-white'
            }`}
          >
            {filter}
          </button>
        ))}
      </div>

      {/* Conversations Scrollable List */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-800/70 p-2 space-y-1 w-full min-w-0">
        {isLoading && loadConvs.length === 0 ? (
          <div className="py-12 text-center space-y-2">
            <RefreshCw className="w-6 h-6 text-indigo-400 animate-spin mx-auto" />
            <p className="text-xs text-slate-400">Loading conversation channels...</p>
          </div>
        ) : loadConvs.length === 0 ? (
          <div className="py-12 text-center px-4 space-y-2">
            <MessageSquare className="w-8 h-8 text-slate-600 mx-auto" />
            <p className="text-xs font-medium text-slate-300">No {activeFilter !== 'all' ? activeFilter : ''} conversations</p>
            <p className="text-[11px] text-slate-500">
              Assigned load communication threads will appear here.
            </p>
          </div>
        ) : (
          loadConvs.map((conv) => {
            const isSelected = selectedConversationId === conv.id;
            const isResolved = conv.status === 'resolved';
            const loadData = conv.load_id ? loadsMap[conv.load_id] || conv.load : null;
            const loadNumber = loadData?.load_number || conv.load?.load_number || (conv.load_id ? `Load #${conv.load_id.slice(0, 8)}` : 'Load Dispatch');

            const routeSummary = loadData?.origin_city && loadData?.dest_city
              ? `${loadData.origin_city}, ${loadData.origin_state || ''} → ${loadData.dest_city}, ${loadData.dest_state || ''}`
              : null;

            return (
              <div
                key={conv.id}
                id={`driver-conv-item-${conv.id}`}
                onClick={() => onSelectConversation(conv)}
                className={`p-3 rounded-xl transition cursor-pointer border ${
                  isSelected
                    ? 'bg-indigo-950/50 border-indigo-500/70 shadow-sm'
                    : 'bg-slate-900/60 hover:bg-slate-800/60 border-slate-800/60'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-emerald-950/60 text-emerald-400 border border-emerald-800/60 flex items-center justify-center shrink-0">
                      <Package className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-white">{loadNumber}</span>
                        {isResolved ? (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                            Resolved
                          </span>
                        ) : (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-800/70">
                            Active
                          </span>
                        )}
                      </div>
                      {routeSummary && (
                        <p className="text-[11px] text-slate-300 font-medium truncate max-w-[200px]">
                          {routeSummary}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0 flex flex-col items-end gap-1">
                    <span className="text-[10px] text-slate-500 flex items-center gap-0.5 justify-end">
                      <Clock className="w-2.5 h-2.5" />
                      {formatTimestamp(conv.updated_at || conv.created_at)}
                    </span>
                    {conv.unread_count && conv.unread_count > 0 ? (
                      <span
                        id={`driver-conv-unread-${conv.id}`}
                        className="px-1.5 py-0.5 text-[10px] font-bold font-mono rounded-full bg-indigo-600 text-white min-w-[1.125rem] text-center leading-none"
                      >
                        {conv.unread_count}
                      </span>
                    ) : null}
                  </div>
                </div>

                {conv.last_message?.content && (
                  <div className="mt-2 text-[11px] text-slate-300 truncate bg-slate-950/40 p-1.5 rounded border border-slate-800/40">
                    <span className="text-slate-500 font-medium mr-1">Latest:</span>
                    {conv.last_message.content}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
