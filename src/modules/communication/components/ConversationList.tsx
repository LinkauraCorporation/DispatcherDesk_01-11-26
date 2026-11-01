import React from 'react';
import {
  Search,
  Plus,
  RefreshCw,
  User,
  Package,
  CheckCircle2,
  Clock,
  X,
  MessageSquare,
} from 'lucide-react';
import { Conversation, ConversationStatus, ConversationType } from '../types.ts';

interface ConversationListProps {
  conversations: Conversation[];
  selectedId: string | null;
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
  isLoading: boolean;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  statusFilter: 'all' | 'active' | 'resolved';
  onStatusFilterChange: (s: 'all' | 'active' | 'resolved') => void;
  typeFilter: 'all' | 'general' | 'load';
  onTypeFilterChange: (t: 'all' | 'general' | 'load') => void;
  onRefresh: () => void;
}

function formatRelativeTime(isoString?: string | null): string {
  if (!isoString) return '';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '';
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

export const ConversationList: React.FC<ConversationListProps> = ({
  conversations,
  selectedId,
  onSelectConversation,
  onNewConversation,
  isLoading,
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  typeFilter,
  onTypeFilterChange,
  onRefresh,
}) => {
  const filteredConversations = conversations.filter((c) => {
    // Status filter
    if (statusFilter === 'active' && c.status !== 'active' && c.status !== 'escalated') return false;
    if (statusFilter === 'resolved' && c.status !== 'resolved') return false;

    // Type filter
    if (typeFilter === 'general' && c.type !== 'general') return false;
    if (typeFilter === 'load' && c.type !== 'load') return false;

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const driverName = (c.driver?.full_name || '').toLowerCase();
      const driverPhone = (c.driver?.phone || '').toLowerCase();
      const loadNumber = (c.load?.load_number || '').toLowerCase();
      const lane = `${c.load?.origin_city || ''} ${c.load?.origin_state || ''} ${
        c.load?.dest_city || ''
      } ${c.load?.dest_state || ''}`.toLowerCase();
      const lastMsg = (c.last_message?.content || '').toLowerCase();

      const matches =
        driverName.includes(q) ||
        driverPhone.includes(q) ||
        loadNumber.includes(q) ||
        lane.includes(q) ||
        lastMsg.includes(q);

      if (!matches) return false;
    }

    return true;
  });

  return (
    <div
      id="conversation-list-panel"
      className="w-full lg:w-96 flex flex-col bg-slate-900 border-r border-slate-800 h-full min-h-0 shrink-0"
    >
      {/* Header bar */}
      <div className="p-4 border-b border-slate-800 shrink-0 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h1 className="text-base font-bold text-slate-100 tracking-tight">Driver Comms</h1>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
              {filteredConversations.length}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              id="btn-refresh-conversations"
              type="button"
              onClick={onRefresh}
              disabled={isLoading}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-slate-800 transition-colors cursor-pointer disabled:opacity-50"
              title="Refresh conversations"
              aria-label="Refresh conversations"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-indigo-400' : ''}`} />
            </button>

            <button
              id="btn-new-conversation"
              type="button"
              onClick={onNewConversation}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New</span>
            </button>
          </div>
        </div>

        {/* Search input */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            id="input-search-conversations"
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search driver, phone, load #..."
            className="w-full pl-8 pr-8 py-1.5 text-xs text-slate-100 bg-slate-950 border border-slate-800 rounded-lg focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/40 placeholder:text-slate-500"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 p-0.5"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Filter Pills */}
        <div className="space-y-1.5 pt-0.5">
          {/* Status Tabs */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800/80 text-[11px]">
            <button
              id="filter-status-all"
              type="button"
              onClick={() => onStatusFilterChange('all')}
              className={`flex-1 py-1 rounded-md font-semibold text-center transition-all cursor-pointer ${
                statusFilter === 'all'
                  ? 'bg-slate-800 text-slate-100 shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              All
            </button>
            <button
              id="filter-status-active"
              type="button"
              onClick={() => onStatusFilterChange('active')}
              className={`flex-1 py-1 rounded-md font-semibold text-center transition-all cursor-pointer ${
                statusFilter === 'active'
                  ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/60 shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Active
            </button>
            <button
              id="filter-status-resolved"
              type="button"
              onClick={() => onStatusFilterChange('resolved')}
              className={`flex-1 py-1 rounded-md font-semibold text-center transition-all cursor-pointer ${
                statusFilter === 'resolved'
                  ? 'bg-slate-800 text-slate-300 shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Resolved
            </button>
          </div>

          {/* Type Tabs */}
          <div className="flex items-center gap-1 text-[10px] overflow-x-auto scrollbar-none pb-0.5">
            <button
              id="filter-type-all"
              type="button"
              onClick={() => onTypeFilterChange('all')}
              className={`px-2 py-0.5 rounded-md font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer border ${
                typeFilter === 'all'
                  ? 'bg-indigo-950/60 text-indigo-300 border-indigo-800/60'
                  : 'text-slate-400 border-transparent hover:text-slate-200'
              }`}
            >
              All Types
            </button>
            <button
              id="filter-type-general"
              type="button"
              onClick={() => onTypeFilterChange('general')}
              className={`px-2 py-0.5 rounded-md font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer border ${
                typeFilter === 'general'
                  ? 'bg-indigo-950/60 text-indigo-300 border-indigo-800/60'
                  : 'text-slate-400 border-transparent hover:text-slate-200'
              }`}
            >
              General
            </button>
            <button
              id="filter-type-load"
              type="button"
              onClick={() => onTypeFilterChange('load')}
              className={`px-2 py-0.5 rounded-md font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer border ${
                typeFilter === 'load'
                  ? 'bg-indigo-950/60 text-indigo-300 border-indigo-800/60'
                  : 'text-slate-400 border-transparent hover:text-slate-200'
              }`}
            >
              Load Dispatches
            </button>
          </div>
        </div>
      </div>

      {/* List content */}
      <div
        id="conversation-items-scroll"
        className="flex-1 overflow-y-auto divide-y divide-slate-800/60 overscroll-contain"
      >
        {isLoading && conversations.length === 0 ? (
          <div className="p-8 text-center text-slate-500 space-y-2">
            <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-xs">Loading conversations...</p>
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="p-8 text-center space-y-2">
            <div className="w-10 h-10 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-center text-slate-600 mx-auto">
              <MessageSquare className="w-5 h-5" />
            </div>
            <p className="text-xs font-semibold text-slate-300">No conversations found</p>
            <p className="text-[11px] text-slate-500 max-w-xs mx-auto">
              {searchQuery
                ? 'Try adjusting your search query or filter criteria.'
                : 'No driver conversations yet. Click "New" to start communicating.'}
            </p>
            {!searchQuery && (
              <button
                type="button"
                onClick={onNewConversation}
                className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Start Conversation</span>
              </button>
            )}
          </div>
        ) : (
          filteredConversations.map((conv) => {
            const isSelected = conv.id === selectedId;
            const driverName = conv.driver?.full_name || 'Driver';
            const isResolved = conv.status === 'resolved';

            return (
              <button
                key={conv.id}
                id={`conv-card-${conv.id}`}
                type="button"
                onClick={() => onSelectConversation(conv.id)}
                className={`w-full text-left p-3.5 transition-all cursor-pointer flex gap-3 relative ${
                  isSelected
                    ? 'bg-slate-800/90 border-l-2 border-l-indigo-500 shadow-inner'
                    : 'hover:bg-slate-800/50'
                }`}
              >
                {/* Driver Avatar */}
                <div className="relative shrink-0">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-xs border ${
                      isSelected
                        ? 'bg-indigo-600 text-white border-indigo-500'
                        : 'bg-slate-950 text-slate-400 border-slate-800'
                    }`}
                  >
                    {conv.type === 'load' ? (
                      <Package className="w-4 h-4" />
                    ) : (
                      <User className="w-4 h-4" />
                    )}
                  </div>
                </div>

                {/* Card Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1 mb-0.5">
                    <span
                      className={`text-xs font-bold truncate ${
                        isSelected ? 'text-white' : 'text-slate-200'
                      }`}
                    >
                      {driverName}
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[10px] text-slate-500 font-mono">
                        {formatRelativeTime(conv.updated_at)}
                      </span>
                      {conv.unread_count && conv.unread_count > 0 ? (
                        <span
                          id={`conv-unread-badge-${conv.id}`}
                          className="px-1.5 py-0.2 text-[10px] font-bold font-mono rounded-full bg-indigo-600 text-white min-w-[1.125rem] text-center"
                        >
                          {conv.unread_count}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  {/* Load or General Tag */}
                  <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                    {conv.type === 'load' && conv.load ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.2 rounded bg-indigo-950/60 text-indigo-300 border border-indigo-800/60 font-semibold">
                        <span>{conv.load.load_number}</span>
                      </span>
                    ) : (
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-950 text-slate-400 border border-slate-800">
                        General
                      </span>
                    )}

                    {isResolved && (
                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 border border-slate-700">
                        Resolved
                      </span>
                    )}
                  </div>

                  {/* Message Preview */}
                  <p className="text-[11px] text-slate-400 truncate leading-relaxed">
                    {conv.last_message?.content ? (
                      conv.last_message.content
                    ) : (
                      <span className="italic text-slate-500">No messages yet</span>
                    )}
                  </p>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
};
