import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { MessageSquare, Plus, AlertCircle, X, Package, User } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext.tsx';
import {
  Conversation,
  ConversationMessage,
  MessageType,
  ConversationStatus,
} from './types.ts';
import { communicationService } from './communicationService.ts';
import { driverService } from '../drivers/driverService.ts';
import { loadService } from '../loads/loadService.ts';
import { DriverWithRelations } from '../drivers/driverTypes.ts';
import { LoadWithRelations } from '../loads/loadTypes.ts';
import { ConversationList } from './components/ConversationList.tsx';
import { ConversationThread } from './components/ConversationThread.tsx';
import { Modal } from '../../components/common/Modal.tsx';
import { EmptyState } from '../../components/common/EmptyState.tsx';
import { CheckCallModal } from '../checkcalls/CheckCallModal.tsx';
import { checkCallService } from '../checkcalls/checkCallService.ts';
import { CheckCall, CreateCheckCallInput, UpdateCheckCallInput } from '../checkcalls/checkCallTypes.ts';

export const CommunicationView: React.FC = () => {
  const { activeOrganization, user } = useAuth();
  const orgId = activeOrganization?.id;

  // Conversations state
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [isLoadingConversations, setIsLoadingConversations] = useState(true);

  // Active Thread Messages state
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  // Check Call Modal state for driver delay notices
  const [isCheckCallModalOpen, setIsCheckCallModalOpen] = useState(false);
  const [checkCallLoad, setCheckCallLoad] = useState<LoadWithRelations | null>(null);
  const [checkCallNotes, setCheckCallNotes] = useState('');
  const [checkCallSourceMessageId, setCheckCallSourceMessageId] = useState<string | null>(null);
  const [checkCallLatitude, setCheckCallLatitude] = useState<number | null>(null);
  const [checkCallLongitude, setCheckCallLongitude] = useState<number | null>(null);

  // Check call tracking state for selected conversation's load
  const [sessionLoggedMessageIds, setSessionLoggedMessageIds] = useState<Set<string>>(new Set());
  const [loadCheckCalls, setLoadCheckCalls] = useState<CheckCall[]>([]);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'resolved'>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'general' | 'load'>('all');

  // Error state
  const [error, setError] = useState<string | null>(null);

  // Cache of drivers & loads for enrichment and new conversation dialog
  const [drivers, setDrivers] = useState<DriverWithRelations[]>([]);
  const [loads, setLoads] = useState<LoadWithRelations[]>([]);

  // New Conversation Modal state
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [newDriverId, setNewDriverId] = useState('');
  const [newConvType, setNewConvType] = useState<'general' | 'load'>('general');
  const [newLoadId, setNewLoadId] = useState('');
  const [newInitialMessage, setNewInitialMessage] = useState('');
  const [newMessageType, setNewMessageType] = useState<MessageType>('text');
  const [isCreatingNewConv, setIsCreatingNewConv] = useState(false);

  // ---------------------------------------------------------------------------
  // 1. Fetch Drivers & Loads for metadata enrichment
  // ---------------------------------------------------------------------------
  const loadMetadata = useCallback(async () => {
    if (!orgId) return;
    try {
      const [fetchedDrivers, fetchedLoads] = await Promise.all([
        driverService.getDrivers(orgId).catch(() => []),
        loadService.getLoads(orgId).catch(() => []),
      ]);
      setDrivers(fetchedDrivers);
      setLoads(fetchedLoads);
    } catch (err) {
      console.warn('[CommunicationView] Failed loading driver/load relations:', err);
    }
  }, [orgId]);

  useEffect(() => {
    loadMetadata();
  }, [loadMetadata]);

  // Lookup maps
  const driverMap = useMemo(() => {
    const map = new Map<string, DriverWithRelations>();
    for (const d of drivers) {
      map.set(d.id, d);
    }
    return map;
  }, [drivers]);

  const loadMap = useMemo(() => {
    const map = new Map<string, LoadWithRelations>();
    for (const l of loads) {
      map.set(l.id, l);
    }
    return map;
  }, [loads]);

  // ---------------------------------------------------------------------------
  // 2. Fetch Conversations
  // ---------------------------------------------------------------------------
  const fetchConversations = useCallback(
    async (preserveSelected = true) => {
      if (!orgId) {
        setConversations([]);
        setIsLoadingConversations(false);
        return;
      }

      setIsLoadingConversations(true);
      setError(null);

      try {
        const [rawConversations, unreadSummary] = await Promise.all([
          communicationService.listConversations(orgId, {
            limit: 100,
          }),
          communicationService.getUnreadMessageCountForOrg(
            orgId,
            user?.id || ''
          ),
        ]);

        // Enrich with driver and load relations + fetch last message + unread count
        const enriched = await Promise.all(
          rawConversations.map(async (c) => {
            const enrichedConv = {
              ...c,
              unread_count: unreadSummary.byConversation[c.id] || 0,
            };

            // Driver enrichment
            const driverObj = driverMap.get(c.driver_id);
            if (driverObj) {
              enrichedConv.driver = {
                id: driverObj.id,
                full_name: driverObj.full_name,
                phone: driverObj.phone,
                status: driverObj.status,
              };
            } else if (!enrichedConv.driver) {
              enrichedConv.driver = {
                id: c.driver_id,
                full_name: `Driver (${c.driver_id.slice(0, 8)})`,
              };
            }

            // Load enrichment
            if (c.load_id) {
              const loadObj = loadMap.get(c.load_id);
              if (loadObj) {
                enrichedConv.load = {
                  id: loadObj.id,
                  load_number: loadObj.load_number,
                  origin_city: loadObj.origin_city,
                  origin_state: loadObj.origin_state,
                  dest_city: loadObj.dest_city,
                  dest_state: loadObj.dest_state,
                  pipeline_status: loadObj.pipeline_status,
                };
              }
            }

            // Fetch latest message snippet if not yet populated
            if (!enrichedConv.last_message) {
              try {
                const latestMsgs = await communicationService.listMessages(orgId, c.id, {
                  limit: 1,
                });
                if (latestMsgs.length > 0) {
                  enrichedConv.last_message = latestMsgs[latestMsgs.length - 1];
                }
              } catch {
                // Non-critical preview failure
              }
            }

            return enrichedConv;
          })
        );

        setConversations(enriched);

        // Maintain selection or select first
        setSelectedConversationId((prev) => {
          if (preserveSelected && prev && enriched.some((c) => c.id === prev)) {
            return prev;
          }
          return enriched.length > 0 ? enriched[0].id : null;
        });
      } catch (err: any) {
        console.error('[CommunicationView] Error fetching conversations:', err);
        setError(err.message || 'Failed to load conversations.');
      } finally {
        setIsLoadingConversations(false);
      }
    },
    [orgId, driverMap, loadMap, user?.id]
  );

  useEffect(() => {
    fetchConversations(false);
    const interval = setInterval(() => {
      fetchConversations(true);
    }, 20000);
    return () => clearInterval(interval);
  }, [fetchConversations]);

  // Currently selected conversation object
  const selectedConversation = useMemo(() => {
    return conversations.find((c) => c.id === selectedConversationId) || null;
  }, [conversations, selectedConversationId]);

  const messagesLoadedForConvRef = useRef<string | null>(null);

  // ---------------------------------------------------------------------------
  // 3. Fetch Messages for Selected Conversation
  // ---------------------------------------------------------------------------
  const fetchMessages = useCallback(
    async (conversationId: string) => {
      if (!orgId || !conversationId) return;

      const isInitial = messagesLoadedForConvRef.current !== conversationId;
      if (isInitial) {
        setIsLoadingMessages(true);
        setError(null);
      }

      try {
        const msgs = await communicationService.listMessages(orgId, conversationId, {
          limit: 100,
        });
        setMessages(msgs);
        messagesLoadedForConvRef.current = conversationId;

        // Auto-mark incoming unread messages as read
        const unreadIncoming = msgs.filter(
          (m) => !m.read_at && m.sender_id !== user?.id
        );
        if (unreadIncoming.length > 0) {
          Promise.all(
            unreadIncoming.map((m) => communicationService.markMessageRead(orgId, m.id).catch(() => null))
          ).catch(() => null);

          // Optimistically update ONLY the selected conversation's local unread_count to 0
          setConversations((prev) =>
            prev.map((c) =>
              c.id === conversationId
                ? { ...c, unread_count: 0 }
                : c
            )
          );
        }
      } catch (err: any) {
        console.error('[CommunicationView] Error fetching messages:', err);
        if (isInitial) {
          setError(err.message || 'Failed to load messages.');
        }
      } finally {
        if (isInitial) {
          setIsLoadingMessages(false);
        }
      }
    },
    [orgId, user?.id]
  );

  useEffect(() => {
    if (selectedConversationId) {
      fetchMessages(selectedConversationId);
      const intervalId = setInterval(() => {
        fetchMessages(selectedConversationId);
      }, 10000);
      return () => clearInterval(intervalId);
    } else {
      setMessages([]);
    }
  }, [selectedConversationId, fetchMessages]);

  // ---------------------------------------------------------------------------
  // 3b. Fetch Check Calls for Selected Conversation's Load
  // ---------------------------------------------------------------------------
  useEffect(() => {
    let isCurrent = true;
    const conversationLoadId = selectedConversation?.load_id;

    // Clear previous conversation's check calls and session IDs immediately upon switching
    setLoadCheckCalls([]);
    setSessionLoggedMessageIds(new Set());

    if (orgId && conversationLoadId) {
      checkCallService
        .getCheckCalls(orgId, conversationLoadId)
        .then((calls) => {
          if (isCurrent) {
            setLoadCheckCalls(calls);
          }
        })
        .catch((err) => {
          console.warn('[CommunicationView] Failed to fetch check calls for load:', err);
          if (isCurrent) {
            setLoadCheckCalls([]);
          }
        });
    }

    return () => {
      isCurrent = false;
    };
  }, [orgId, selectedConversation?.load_id, selectedConversationId]);

  // ---------------------------------------------------------------------------
  // 3c. Derive Logged Check Call Message IDs
  // ---------------------------------------------------------------------------
  const loggedCheckCallMessageIds = useMemo(() => {
    const loggedIds = new Set<string>(sessionLoggedMessageIds);

    for (const msg of messages) {
      const msgLoadId = msg.context?.load_id;
      if (msg.message_type === 'exception_update' && msgLoadId) {
        // Condition: cc.load_id === msg.context.load_id
        //            cc.call_type === 'delay'
        //            cc.created_at >= msg.created_at minus 60 seconds
        const msgTime = new Date(msg.created_at).getTime() - 60000;

        const isLogged = loadCheckCalls.some((cc) => {
          if (cc.load_id !== msgLoadId) return false;
          if (cc.call_type !== 'delay') return false;
          const ccTime = new Date(cc.created_at).getTime();
          return !isNaN(ccTime) && ccTime >= msgTime;
        });

        if (isLogged) {
          loggedIds.add(msg.id);
        }
      }
    }

    return loggedIds;
  }, [messages, loadCheckCalls, sessionLoggedMessageIds]);

  // ---------------------------------------------------------------------------
  // 4. Send Message
  // ---------------------------------------------------------------------------
  const handleSendMessage = async (content: string, messageType: MessageType) => {
    if (!orgId || !selectedConversationId) return;

    setIsSending(true);
    setError(null);

    try {
      const newMsg = await communicationService.sendMessage(orgId, {
        conversationId: selectedConversationId,
        content,
        messageType,
        channel: 'in_app',
      });

      // Append to message feed
      setMessages((prev) => [...prev, newMsg]);

      // Update conversation snippet in local list
      setConversations((prev) =>
        prev.map((c) => {
          if (c.id === selectedConversationId) {
            return {
              ...c,
              last_message: newMsg,
              updated_at: newMsg.created_at,
            };
          }
          return c;
        })
      );
    } catch (err: any) {
      console.error('[CommunicationView] Failed to send message:', err);
      setError(err.message || 'Failed to send message.');
      throw err;
    } finally {
      setIsSending(false);
    }
  };

  // ---------------------------------------------------------------------------
  // 5. Toggle Status (Resolve / Reopen)
  // ---------------------------------------------------------------------------
  const handleToggleStatus = async () => {
    if (!orgId || !selectedConversation) return;

    setIsUpdatingStatus(true);
    setError(null);

    try {
      const nextStatus: ConversationStatus =
        selectedConversation.status === 'resolved' ? 'active' : 'resolved';

      const updated = await communicationService.updateConversationStatus(
        orgId,
        selectedConversation.id,
        nextStatus
      );

      // Update local state
      setConversations((prev) =>
        prev.map((c) => (c.id === updated.id ? { ...c, status: updated.status } : c))
      );
    } catch (err: any) {
      console.error('[CommunicationView] Failed to toggle conversation status:', err);
      setError(err.message || 'Failed to update conversation status.');
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  // ---------------------------------------------------------------------------
  // 6. Acknowledge Message
  // ---------------------------------------------------------------------------
  const handleAcknowledgeMessage = async (messageId: string) => {
    if (!orgId) return;
    try {
      const acknowledged = await communicationService.markMessageAcknowledged(orgId, messageId);
      setMessages((prev) =>
        prev.map((m) => (m.id === acknowledged.id ? acknowledged : m))
      );
    } catch (err: any) {
      console.error('[CommunicationView] Failed to acknowledge message:', err);
      setError(err.message || 'Failed to acknowledge message.');
    }
  };

  // ---------------------------------------------------------------------------
  // 6b. Log Check Call from Driver Delay Exception Message
  // ---------------------------------------------------------------------------
  const handleOpenCheckCallModal = useCallback(
    async (msg: ConversationMessage) => {
      if (!msg.context?.load_id || !orgId) return;
      setError(null);

      // Resolve load using existing memoized loadMap or fallback to loadService.getLoad
      let targetLoad = loadMap.get(msg.context.load_id) || null;
      if (!targetLoad) {
        try {
          targetLoad = await loadService.getLoad(orgId, msg.context.load_id);
        } catch (err) {
          console.warn('[CommunicationView] Failed to fetch load for check call:', err);
        }
      }

      if (!targetLoad) {
        setError(
          `Cannot log check call: Load #${msg.context.load_number || msg.context.load_id} could not be resolved.`
        );
        return;
      }

      // Validate latitude and longitude from message context if present
      const rawLat = msg.context?.latitude;
      const rawLng = msg.context?.longitude;
      const validLat =
        typeof rawLat === 'number' && Number.isFinite(rawLat) && rawLat >= -90 && rawLat <= 90
          ? rawLat
          : null;
      const validLng =
        typeof rawLng === 'number' && Number.isFinite(rawLng) && rawLng >= -180 && rawLng <= 180
          ? rawLng
          : null;

      setCheckCallLatitude(validLat);
      setCheckCallLongitude(validLng);
      setCheckCallLoad(targetLoad);
      setCheckCallNotes(msg.content || '');
      setCheckCallSourceMessageId(msg.id);
      setIsCheckCallModalOpen(true);
    },
    [loadMap, orgId]
  );

  const handleCheckCallSubmit = async (data: CreateCheckCallInput | UpdateCheckCallInput) => {
    if (!orgId) return;
    try {
      const createdCall = await checkCallService.createCheckCall(orgId, data as CreateCheckCallInput);
      if (createdCall) {
        setLoadCheckCalls((prev) => [createdCall, ...prev.filter((c) => c.id !== createdCall.id)]);
      }
      if (checkCallSourceMessageId) {
        setSessionLoggedMessageIds((prev) => new Set(prev).add(checkCallSourceMessageId));
      }
      setIsCheckCallModalOpen(false);
      setCheckCallSourceMessageId(null);
      setCheckCallLatitude(null);
      setCheckCallLongitude(null);
    } catch (err: any) {
      console.error('[CommunicationView] Failed to create check call from driver delay message:', err);
      setError(err?.message || 'Failed to create check call.');
      throw err;
    }
  };

  // ---------------------------------------------------------------------------
  // 7. Create New Conversation
  // ---------------------------------------------------------------------------
  const handleCreateNewConversation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgId || !newDriverId) return;

    setIsCreatingNewConv(true);
    setError(null);

    try {
      let createdConv: Conversation;

      if (newConvType === 'load') {
        if (!newLoadId) {
          setError('Please select an active load to create a load-specific thread.');
          setIsCreatingNewConv(false);
          return;
        }
        createdConv = await communicationService.createLoadConversation(
          orgId,
          newDriverId,
          newLoadId
        );
      } else {
        createdConv = await communicationService.getOrCreateDriverConversation(
          orgId,
          newDriverId
        );
      }

      // If initial message provided, send it immediately
      if (newInitialMessage.trim()) {
        await communicationService.sendMessage(orgId, {
          conversationId: createdConv.id,
          content: newInitialMessage.trim(),
          messageType: newMessageType,
          channel: 'in_app',
        });
      }

      // Reset modal fields
      setIsNewModalOpen(false);
      setNewDriverId('');
      setNewLoadId('');
      setNewInitialMessage('');
      setNewMessageType('text');

      // Refresh conversations list and select new thread
      await fetchConversations(false);
      setSelectedConversationId(createdConv.id);
    } catch (err: any) {
      console.error('[CommunicationView] Failed to create new conversation:', err);
      setError(err.message || 'Failed to create conversation.');
    } finally {
      setIsCreatingNewConv(false);
    }
  };

  // No active organization state
  if (!orgId) {
    return (
      <div className="p-8 text-center text-slate-400">
        <AlertCircle className="w-8 h-8 mx-auto mb-2 text-amber-500" />
        <h3 className="text-sm font-semibold text-slate-200">No Active Organization</h3>
        <p className="text-xs text-slate-500 mt-1">
          Select or create an organization to access Driver Communications.
        </p>
      </div>
    );
  }

  return (
    <div
      id="communication-view-root"
      className="flex-1 flex flex-col h-[calc(100dvh-6.5rem)] lg:h-[calc(100dvh-8rem)] min-h-[480px] bg-slate-950 rounded-2xl border border-slate-800 shadow-xl overflow-hidden"
    >
      {/* Responsive Master / Detail Layout */}
      <div className="flex-1 flex min-h-0 relative overflow-hidden">
        {/* Left Side: Conversation List
            Hidden on mobile if a conversation is actively selected */}
        <div
          className={`h-full min-h-0 shrink-0 ${
            selectedConversationId ? 'hidden lg:flex' : 'flex w-full lg:w-96'
          }`}
        >
          <ConversationList
            conversations={conversations}
            selectedId={selectedConversationId}
            onSelectConversation={(id) => setSelectedConversationId(id)}
            onNewConversation={() => setIsNewModalOpen(true)}
            isLoading={isLoadingConversations}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            typeFilter={typeFilter}
            onTypeFilterChange={setTypeFilter}
            onRefresh={() => fetchConversations(true)}
          />
        </div>

        {/* Right Side: Conversation Thread
            On mobile, full width when conversation selected, hidden otherwise */}
        <div
          className={`flex-1 h-full min-h-0 w-full ${
            !selectedConversationId ? 'hidden lg:flex' : 'flex'
          }`}
        >
          <ConversationThread
            conversation={selectedConversation}
            messages={messages}
            isLoadingMessages={isLoadingMessages}
            isSending={isSending}
            isUpdatingStatus={isUpdatingStatus}
            error={error}
            onClearError={() => setError(null)}
            onSendMessage={handleSendMessage}
            onToggleStatus={handleToggleStatus}
            onRefresh={() => {
              if (selectedConversationId) {
                fetchMessages(selectedConversationId);
                if (selectedConversation?.load_id && orgId) {
                  checkCallService
                    .getCheckCalls(orgId, selectedConversation.load_id)
                    .then(setLoadCheckCalls)
                    .catch(() => null);
                }
              }
              return Promise.resolve();
            }}
            onBack={() => setSelectedConversationId(null)}
            onAcknowledgeMessage={handleAcknowledgeMessage}
            onLogCheckCall={handleOpenCheckCallModal}
            loggedCheckCallMessageIds={loggedCheckCallMessageIds}
            currentUserId={user?.id}
          />
        </div>
      </div>

      {/* Check Call Modal for Driver Delay Notifications */}
      <CheckCallModal
        isOpen={isCheckCallModalOpen}
        onClose={() => {
          setIsCheckCallModalOpen(false);
          setCheckCallSourceMessageId(null);
          setCheckCallLatitude(null);
          setCheckCallLongitude(null);
        }}
        load={checkCallLoad}
        initialCallType="delay"
        initialStatus="delayed"
        initialNotes={checkCallNotes}
        initialLatitude={checkCallLatitude}
        initialLongitude={checkCallLongitude}
        onSubmit={handleCheckCallSubmit}
      />

      {/* New Conversation Modal */}
      <Modal
        id="modal-new-conversation"
        isOpen={isNewModalOpen}
        onClose={() => setIsNewModalOpen(false)}
        title="Start Driver Conversation"
        subtitle="Open an in-app messaging thread with a fleet or owner-operator driver"
        maxWidth="lg"
      >
        <form onSubmit={handleCreateNewConversation} className="space-y-4 text-xs">
          {error && (
            <div className="p-3 bg-rose-950/60 border border-rose-800 text-rose-300 rounded-lg flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Driver Selection */}
          <div>
            <label className="block text-slate-300 font-semibold mb-1">
              Select Driver <span className="text-rose-400">*</span>
            </label>
            <select
              id="select-driver-conversation"
              value={newDriverId}
              onChange={(e) => setNewDriverId(e.target.value)}
              required
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer"
            >
              <option value="">-- Choose a Driver --</option>
              {drivers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.full_name} ({d.phone || 'No phone'}) -{' '}
                  {d.status?.replace(/_/g, ' ') || 'active'}
                </option>
              ))}
            </select>
            {drivers.length === 0 && (
              <p className="text-[11px] text-amber-400 mt-1">
                No drivers registered yet. Add drivers under the Drivers menu first.
              </p>
            )}
          </div>

          {/* Conversation Type */}
          <div>
            <label className="block text-slate-300 font-semibold mb-1">Thread Type</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setNewConvType('general')}
                className={`p-3 rounded-lg border text-left transition-all cursor-pointer ${
                  newConvType === 'general'
                    ? 'bg-indigo-600/20 text-indigo-300 border-indigo-500/50 shadow-xs'
                    : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
                }`}
              >
                <div className="flex items-center gap-1.5 font-bold mb-0.5">
                  <User className="w-3.5 h-3.5" />
                  <span>General Thread</span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Continuous day-to-day dispatcher & driver communications.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setNewConvType('load')}
                className={`p-3 rounded-lg border text-left transition-all cursor-pointer ${
                  newConvType === 'load'
                    ? 'bg-indigo-600/20 text-indigo-300 border-indigo-500/50 shadow-xs'
                    : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
                }`}
              >
                <div className="flex items-center gap-1.5 font-bold mb-0.5">
                  <Package className="w-3.5 h-3.5" />
                  <span>Load-Specific</span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Directly attached to an active shipment with route context.
                </p>
              </button>
            </div>
          </div>

          {/* Load Selector if type is load */}
          {newConvType === 'load' && (
            <div>
              <label className="block text-slate-300 font-semibold mb-1">
                Select Load <span className="text-rose-400">*</span>
              </label>
              <select
                id="select-load-conversation"
                value={newLoadId}
                onChange={(e) => setNewLoadId(e.target.value)}
                required={newConvType === 'load'}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer"
              >
                <option value="">-- Choose Shipment --</option>
                {loads.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.load_number} ({l.origin_city}, {l.origin_state} ➔ {l.dest_city},{' '}
                    {l.dest_state}) - {l.pipeline_status?.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Initial Message (Optional) */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-slate-300 font-semibold">Initial Message (Optional)</label>
              <div className="flex items-center gap-1 text-[11px]">
                <button
                  type="button"
                  onClick={() => setNewMessageType('text')}
                  className={`px-1.5 py-0.5 rounded ${
                    newMessageType === 'text'
                      ? 'bg-slate-800 text-slate-200 font-semibold'
                      : 'text-slate-500'
                  }`}
                >
                  Text
                </button>
                <button
                  type="button"
                  onClick={() => setNewMessageType('instruction')}
                  className={`px-1.5 py-0.5 rounded ${
                    newMessageType === 'instruction'
                      ? 'bg-amber-950 text-amber-300 font-semibold'
                      : 'text-slate-500'
                  }`}
                >
                  Instruction
                </button>
                <button
                  type="button"
                  onClick={() => setNewMessageType('question')}
                  className={`px-1.5 py-0.5 rounded ${
                    newMessageType === 'question'
                      ? 'bg-sky-950 text-sky-300 font-semibold'
                      : 'text-slate-500'
                  }`}
                >
                  Question
                </button>
              </div>
            </div>
            <textarea
              rows={3}
              value={newInitialMessage}
              onChange={(e) => setNewInitialMessage(e.target.value)}
              placeholder="Type your first message to the driver..."
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-indigo-500 placeholder:text-slate-600 resize-none"
            />
          </div>

          {/* Modal Actions */}
          <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsNewModalOpen(false)}
              className="px-4 py-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              id="btn-confirm-create-conversation"
              type="submit"
              disabled={isCreatingNewConv || !newDriverId || (newConvType === 'load' && !newLoadId)}
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition-colors disabled:opacity-50 cursor-pointer inline-flex items-center gap-1.5 shadow-sm"
            >
              {isCreatingNewConv ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  <span>Start Thread</span>
                </>
              )}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
