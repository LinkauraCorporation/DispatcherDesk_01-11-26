import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuth } from '../../../contexts/AuthContext.tsx';
import { communicationService, UnreadMessageSummary } from '../../communication/communicationService.ts';
import { Conversation, ConversationMessage, MessageType } from '../../communication/types.ts';
import { DriverAssignedLoad } from '../DriverPortalView.tsx';
import { DriverConversationList } from './DriverConversationList.tsx';
import { DriverMessageThread } from './DriverMessageThread.tsx';
import { MessageSquare, AlertCircle, ArrowLeft, ShieldCheck } from 'lucide-react';

interface DriverChatViewProps {
  loads: DriverAssignedLoad[];
  initialConversationId?: string | null;
  onClearInitialConversation?: () => void;
  onBackToDispatches?: () => void;
}

export const DriverChatView: React.FC<DriverChatViewProps> = ({
  loads,
  initialConversationId,
  onClearInitialConversation,
  onBackToDispatches,
}) => {
  const { user, activeOrganization, driverProfile } = useAuth();

  const driverOrgId =
    driverProfile?.organization_id ||
    (activeOrganization?.id && activeOrganization.id !== 'demo-org-1'
      ? activeOrganization.id
      : null);

  const [authoritativeDriverId, setAuthoritativeDriverId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(
    initialConversationId || null
  );
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [isLoadingConvs, setIsLoadingConvs] = useState<boolean>(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState<boolean>(false);
  const [isSending, setIsSending] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'resolved'>('all');
  const [mobileView, setMobileView] = useState<'list' | 'thread'>('list');

  // Build dictionary of loads for fast metadata resolution without database queries
  const loadsMap = useMemo(() => {
    const map: Record<string, DriverAssignedLoad> = {};
    loads.forEach((l) => {
      map[l.id] = l;
    });
    return map;
  }, [loads]);

  // Load conversations and resolve authoritative driver identity
  const fetchConversations = useCallback(
    async (isBackground = false) => {
      if (!driverOrgId) {
        if (!isBackground) setIsLoadingConvs(false);
        return;
      }

      if (!isBackground) {
        setIsLoadingConvs(true);
        setErrorMessage(null);
      }

      try {
        // Step 1: Authoritative driver resolution (Never from arbitrary user input)
        const resolvedDriverId = await communicationService.resolveCurrentDriverId(driverOrgId);
        if (!resolvedDriverId) {
          throw new Error('Unable to resolve authoritative driver profile for active session.');
        }
        setAuthoritativeDriverId(resolvedDriverId);

        // Step 2 & 3: Concurrently fetch general conversation, driver conversations, and unread counts
        const [, driverConvs, unreadSummary] = await Promise.all([
          communicationService.getOrCreateCurrentDriverConversation(driverOrgId),
          communicationService.listConversations(driverOrgId, {
            driverId: resolvedDriverId,
          }),
          user?.id
            ? communicationService.getUnreadMessageCountForDriver(
                driverOrgId,
                resolvedDriverId,
                user.id
              )
            : Promise.resolve<UnreadMessageSummary>({ total: 0, byConversation: {} }),
        ]);

        // Keep only load-specific operational conversations for the Driver Portal
        const loadOnlyConvs = driverConvs.filter(
          (c) => c.type === 'load' || Boolean(c.load_id)
        );
        const combined = loadOnlyConvs.map((c) => ({
          ...c,
          unread_count: unreadSummary.byConversation[c.id] || 0,
        }));

        setConversations(combined);

        // Selection handling: Never fall back to General Dispatch
        if (!isBackground) {
          if (initialConversationId) {
            const found = combined.find((c) => c.id === initialConversationId);
            if (found) {
              setSelectedConversationId(found.id);
              setMobileView('thread');
            } else {
              setSelectedConversationId(null);
              setMobileView('list');
            }
          }
        }
      } catch (err: any) {
        console.error('[DriverChatView] Failed to fetch conversations:', err);
        if (!isBackground) {
          setErrorMessage(err.message || 'Failed to initialize driver communications.');
        }
      } finally {
        if (!isBackground) {
          setIsLoadingConvs(false);
        }
      }
    },
    [driverOrgId, initialConversationId, user?.id]
  );

  useEffect(() => {
    fetchConversations();
    const intervalId = setInterval(() => {
      fetchConversations(true);
    }, 20000);
    return () => clearInterval(intervalId);
  }, [fetchConversations]);

  const messagesLoadedForConvRef = useRef<string | null>(null);

  // Fetch messages when selected conversation changes
  const fetchMessages = useCallback(
    async (conversationId: string) => {
      if (!driverOrgId || !conversationId) return;

      const isInitial = messagesLoadedForConvRef.current !== conversationId;
      if (isInitial) {
        setIsLoadingMessages(true);
      }
      try {
        const msgs = await communicationService.listMessages(driverOrgId, conversationId);
        setMessages(msgs);
        messagesLoadedForConvRef.current = conversationId;

        // Auto-mark incoming unread messages as read
        const unreadIncoming = msgs.filter(
          (m) => !m.read_at && m.sender_id !== user?.id
        );
        if (unreadIncoming.length > 0) {
          Promise.all(
            unreadIncoming.map((m) =>
              communicationService.markMessageRead(driverOrgId, m.id).catch(() => null)
            )
          ).catch(() => null);

          // Optimistically clear ONLY the selected conversation's local unread count
          setConversations((prev) =>
            prev.map((c) =>
              c.id === conversationId ? { ...c, unread_count: 0 } : c
            )
          );
        }
      } catch (err: any) {
        console.error('[DriverChatView] Error loading messages:', err);
        if (isInitial) {
          setErrorMessage(err.message || 'Failed to load messages.');
        }
      } finally {
        if (isInitial) {
          setIsLoadingMessages(false);
        }
      }
    },
    [driverOrgId, user?.id]
  );

  useEffect(() => {
    if (selectedConversationId) {
      fetchMessages(selectedConversationId);
      const intervalId = setInterval(() => {
        fetchMessages(selectedConversationId);
      }, 10000);

      const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible') {
          fetchMessages(selectedConversationId);
        }
      };

      const handleFocus = () => {
        fetchMessages(selectedConversationId);
      };

      document.addEventListener('visibilitychange', handleVisibilityChange);
      window.addEventListener('focus', handleFocus);

      return () => {
        clearInterval(intervalId);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        window.removeEventListener('focus', handleFocus);
      };
    } else {
      setMessages([]);
    }
  }, [selectedConversationId, fetchMessages]);

  // Handle conversation selection
  const handleSelectConversation = (conv: Conversation) => {
    setSelectedConversationId(conv.id);
    setMobileView('thread');
    if (onClearInitialConversation) {
      onClearInitialConversation();
    }
  };

  // Handle message sending
  const handleSendMessage = async (
    content: string,
    messageType: MessageType,
    context?: Record<string, any>
  ) => {
    if (!driverOrgId || !selectedConversationId) return;

    setIsSending(true);
    setErrorMessage(null);

    try {
      await communicationService.sendMessage(driverOrgId, {
        conversationId: selectedConversationId,
        content,
        messageType,
        channel: 'in_app',
        context,
      });

      // Refresh message feed after persisted save (No optimistic stubbing)
      await fetchMessages(selectedConversationId);

      // Refresh conversations list to update latest preview/timestamp
      await fetchConversations(true);
    } catch (err: any) {
      console.error('[DriverChatView] Error sending message:', err);
      setErrorMessage(err.message || 'Failed to send message.');
      throw err;
    } finally {
      setIsSending(false);
    }
  };

  // Handle message acknowledgement
  const handleAcknowledgeMessage = async (messageId: string) => {
    if (!driverOrgId) return;

    try {
      await communicationService.markMessageAcknowledged(driverOrgId, messageId);
      if (selectedConversationId) {
        await fetchMessages(selectedConversationId);
      }
    } catch (err: any) {
      console.error('[DriverChatView] Failed to acknowledge message:', err);
      setErrorMessage(err.message || 'Failed to acknowledge message.');
    }
  };

  // Handle reopening a resolved conversation
  const handleReopenConversation = async () => {
    if (!driverOrgId || !selectedConversationId) return;

    try {
      await communicationService.updateConversationStatus(
        driverOrgId,
        selectedConversationId,
        'active'
      );
      // Refresh local conversations
      setConversations((prev) =>
        prev.map((c) =>
          c.id === selectedConversationId ? { ...c, status: 'active', resolved_at: null } : c
        )
      );
    } catch (err: any) {
      console.error('[DriverChatView] Failed to reopen conversation:', err);
      setErrorMessage(err.message || 'Failed to reopen conversation.');
    }
  };

  // Selected conversation object
  const selectedConversation = useMemo(() => {
    return conversations.find((c) => c.id === selectedConversationId) || null;
  }, [conversations, selectedConversationId]);

  // Load context for selected conversation (if it's a load conversation)
  const selectedLoadContext = useMemo(() => {
    if (!selectedConversation?.load_id) return null;
    return loadsMap[selectedConversation.load_id] || null;
  }, [selectedConversation, loadsMap]);

  // Filtered conversations based on Active/Resolved toggle
  const filteredConversations = useMemo(() => {
    if (activeFilter === 'all') return conversations;
    return conversations.filter((c) => c.status === activeFilter);
  }, [conversations, activeFilter]);

  // Back to conversation list handler
  const handleBackToList = () => {
    setSelectedConversationId(null);
    setMobileView('list');

    if (onClearInitialConversation) {
      onClearInitialConversation();
    }
  };

  // Fallback state: Missing organization
  if (!driverOrgId) {
    return (
      <div id="driver-chat-no-org" className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center space-y-4">
        <AlertCircle className="w-10 h-10 text-amber-400 mx-auto" />
        <h3 className="text-base font-bold text-white">Active Organization Required</h3>
        <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
          Please connect to an active carrier or dispatch organization to access dispatcher communications.
        </p>
        {onBackToDispatches && (
          <button
            type="button"
            onClick={onBackToDispatches}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold"
          >
            Return to Dispatches
          </button>
        )}
      </div>
    );
  }

  return (
    <div id="driver-chat-container" className="flex-1 min-h-0 h-full flex flex-col gap-2 sm:gap-4 w-full min-w-0">
      {/* Top Breadcrumb & Security Indicator - Hidden on mobile when viewing thread to prevent redundant back controls */}
      <div className={`${mobileView === 'thread' ? 'hidden md:flex' : 'flex'} items-center justify-between gap-2 bg-slate-900/60 border border-slate-800 px-3 sm:px-4 py-1.5 sm:py-3 rounded-xl w-full min-w-0 shrink-0`}>
        <div className="flex items-center gap-2 min-w-0 flex-1 flex-nowrap">
          {onBackToDispatches && (
            <button
              id="driver-chat-back-dispatches-btn"
              type="button"
              onClick={onBackToDispatches}
              className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1 min-h-[32px] transition cursor-pointer shrink-0"
            >
              <ArrowLeft className="w-3.5 h-3.5 shrink-0" />
              <span>Back to Dispatches</span>
            </button>
          )}
          {onBackToDispatches && <span className="text-slate-600 hidden sm:inline">•</span>}
          <div className="flex items-center gap-1.5 text-xs text-slate-300 min-w-0 shrink-0">
            <MessageSquare className="w-4 h-4 text-indigo-400 shrink-0" />
            <span className="font-bold text-white truncate">
              <span className="hidden sm:inline">Dispatcher Communication </span>Portal
            </span>
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-1 text-[11px] text-emerald-400 bg-emerald-950/80 px-2.5 py-1 rounded-md border border-emerald-800/80 shrink-0">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Authoritative Identity Verified</span>
        </div>
      </div>

      {/* Error Alert */}
      {errorMessage && (
        <div className="bg-red-950/60 border border-red-800 text-red-200 p-3.5 rounded-xl text-xs flex items-center gap-3 w-full min-w-0">
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
          <span className="min-w-0 break-words">{errorMessage}</span>
        </div>
      )}

      {/* Responsive Viewport (Desktop split, Mobile single-pane) */}
      <div className="flex-1 min-h-0 h-full md:h-[calc(100vh-10rem)] md:min-h-[500px] md:max-h-[850px] flex rounded-xl overflow-hidden w-full min-w-0">
        {/* Desktop Left / Mobile List Pane */}
        <div
          className={`${
            mobileView === 'thread' ? 'hidden md:flex' : 'flex'
          } w-full min-w-0 md:w-80 lg:w-96 flex-col shrink-0 md:mr-3`}
        >
          <DriverConversationList
            conversations={filteredConversations}
            selectedConversationId={selectedConversationId}
            onSelectConversation={handleSelectConversation}
            loadsMap={loadsMap}
            activeFilter={activeFilter}
            onChangeFilter={setActiveFilter}
            isLoading={isLoadingConvs}
            onRefresh={fetchConversations}
          />
        </div>

        {/* Desktop Right / Mobile Thread Pane */}
        <div
          className={`${
            mobileView === 'list' ? 'hidden md:flex' : 'flex'
          } flex-1 min-w-0 w-full flex-col h-full`}
        >
          {selectedConversation ? (
            <DriverMessageThread
              conversation={selectedConversation}
              messages={messages}
              isLoadingMessages={isLoadingMessages}
              loadContext={selectedLoadContext}
              onSendMessage={handleSendMessage}
              onAcknowledgeMessage={handleAcknowledgeMessage}
              onReopenConversation={handleReopenConversation}
              onBackToList={handleBackToList}
              currentUserId={user?.id}
              isSending={isSending}
            />
          ) : (
            <div className="flex-1 bg-slate-900 border border-slate-800 rounded-xl flex items-center justify-center p-6 text-center text-slate-400 space-y-3 flex-col">
              <MessageSquare className="w-12 h-12 text-slate-700" />
              <h4 className="text-sm font-semibold text-slate-200">No Conversation Selected</h4>
              <p className="text-xs text-slate-500 max-w-xs">
                Select a channel from the list to start messaging your dispatch coordinator.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
