import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext.tsx';
import { useTimezone } from '../../contexts/TimezoneContext.tsx';
import { Modal } from '../../components/common/Modal.tsx';
import { aiService } from './aiService.ts';
import {
  AIRequest,
  AIResponse,
  CopilotAction,
  CopilotMode,
  GroundingSource,
} from './aiTypes.ts';
import { MarkdownContent } from './MarkdownContent.tsx';
import { LoadWithRelations } from '../loads/loadTypes.ts';
import { TaskModal } from '../tasks/TaskModal.tsx';
import { TaskCategory, TaskPriority } from '../tasks/taskTypes.ts';
import {
  Sparkles,
  Brain,
  Cpu,
  Send,
  Copy,
  Check,
  AlertTriangle,
  FileText,
  Clock,
  Mail,
  MessageSquare,
  ShieldAlert,
  RefreshCw,
  Info,
  CheckCircle2,
  Sliders,
  ExternalLink,
  Edit3,
  Plus,
} from 'lucide-react';

export interface ContextualCopilotModalProps {
  isOpen: boolean;
  onClose: () => void;
  load?: LoadWithRelations | null;
  loadId?: string;
  claimId?: string;
  initialAction?: CopilotAction;
  initialQuery?: string;
  titleContext?: string;
  onOpenLoadDetail?: (load: LoadWithRelations | any) => void;
}

interface ContextActionTab {
  action: CopilotAction;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
}

const CONTEXT_ACTION_TABS: ContextActionTab[] = [
  {
    action: 'analyze_load',
    label: 'Analyze Load',
    icon: FileText,
    description: 'Comprehensive operational overview of transit status, paperwork, and financials.',
  },
  {
    action: 'explain_load_risk',
    label: 'Explain Risk',
    icon: AlertTriangle,
    description: 'Pinpoint transit delays, breakdown flags, stale check-ins, and missing critical docs.',
  },
  {
    action: 'summarize_load',
    label: 'Summarize',
    icon: Info,
    description: 'Concise 3-bullet dispatch summary for handover or executive briefing.',
  },
  {
    action: 'broker_email',
    label: 'Broker Update',
    icon: Mail,
    description: 'Draft polite, professional transit update or delay notice to broker representative.',
  },
  {
    action: 'driver_instructions',
    label: 'Driver WhatsApp',
    icon: MessageSquare,
    description: 'Format WhatsApp guidelines, appointments, dock info, and BOL instructions.',
  },
  {
    action: 'detention_escalation',
    label: 'Broker Detention Claim',
    icon: Clock,
    description: 'Draft formal detention claim email with dual timestamps and 15-min billing.',
  },
];

export const ContextualCopilotModal: React.FC<ContextualCopilotModalProps> = ({
  isOpen,
  onClose,
  load,
  loadId,
  claimId,
  initialAction = 'analyze_load',
  initialQuery = '',
  titleContext,
  onOpenLoadDetail,
}) => {
  const { activeOrganization, userRole, profile, user } = useAuth();
  const { operationalTimezone, dispatcherTimezone } = useTimezone();

  const orgId = activeOrganization?.id || '';
  const effectiveLoadId = load?.id || loadId;
  const loadNumber = load?.load_number;

  const [activeAction, setActiveAction] = useState<CopilotAction>(initialAction);
  const [customQuery, setCustomQuery] = useState(initialQuery);
  const [copilotMode, setCopilotMode] = useState<CopilotMode>('local');
  const [isLoading, setIsLoading] = useState(false);
  const [response, setResponse] = useState<AIResponse | null>(null);
  const [editableDraft, setEditableDraft] = useState<string>('');
  const [copiedTarget, setCopiedTarget] = useState<string | null>(null);

  // Task Creation Modal for AI suggested tasks (human confirmation)
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [taskModalData, setTaskModalData] = useState<{
    title?: string;
    category?: TaskCategory;
    priority?: TaskPriority;
    due_at?: string;
    description?: string;
    load_id?: string;
    load_number?: string;
  }>({});

  // Sync initial action when modal opens
  useEffect(() => {
    if (isOpen) {
      setActiveAction(initialAction || 'analyze_load');
      setCustomQuery(initialQuery || '');
      setCopiedTarget(null);
    }
  }, [isOpen, initialAction, initialQuery]);

  const executeAction = useCallback(
    async (actionToRun: CopilotAction, queryText?: string) => {
      if (!orgId) return;

      setIsLoading(true);
      setCopiedTarget(null);

      try {
        const req: AIRequest = {
          action: actionToRun,
          query: queryText || undefined,
          loadId: effectiveLoadId,
          claimId: claimId,
          mode: copilotMode,
        };

        const res = await aiService.generateCopilotResponse(
          orgId,
          userRole || 'dispatcher',
          req,
          { operationalTimezone, dispatcherTimezone }
        );

        setResponse(res);
        setEditableDraft(res.content || '');

        // Non-blocking activity audit log
        const actorName = profile?.full_name || user?.email?.split('@')[0] || 'Dispatcher';
        const actorId = user?.id || 'usr-dispatcher';

        aiService.logAIOperationActivity(orgId, {
          actorId,
          actorName,
          loadId: effectiveLoadId,
          action: actionToRun,
          mode: res.mode,
          title: res.title,
          isDraft: res.isDraft,
        });
      } catch (err) {
        console.error('Error generating contextual copilot response:', err);
      } finally {
        setIsLoading(false);
      }
    },
    [orgId, userRole, effectiveLoadId, claimId, copilotMode, operationalTimezone, dispatcherTimezone, profile, user]
  );

  const [copiedActionIndex, setCopiedActionIndex] = useState<number | null>(null);

  // Auto-run active action when modal opens
  useEffect(() => {
    if (isOpen && orgId) {
      executeAction(activeAction, customQuery);
    }
  }, [isOpen, activeAction]);

  const handleCopy = async (text: string, targetKey: string, actionIndex?: number) => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      setCopiedTarget(targetKey);
      if (actionIndex !== undefined) {
        setCopiedActionIndex(actionIndex);
        setTimeout(() => setCopiedActionIndex(null), 2500);
      }
      setTimeout(() => setCopiedTarget(null), 2500);
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
    }
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customQuery.trim()) return;
    executeAction(activeAction, customQuery);
  };

  const handleSuggestedAction = (
    actionItem: { label: string; action: string; payload?: any },
    index?: number
  ) => {
    if (actionItem.action === 'create_task') {
      setTaskModalData({
        title: actionItem.payload?.title,
        category: actionItem.payload?.category,
        priority: actionItem.payload?.priority,
        due_at: actionItem.payload?.due_at,
        description: actionItem.payload?.description,
        load_id: actionItem.payload?.load_id,
        load_number: actionItem.payload?.load_number,
      });
      setIsTaskModalOpen(true);
    } else if (actionItem.action === 'quick_prompt') {
      const nextAction = (actionItem.payload?.action || 'analyze_load') as CopilotAction;
      setActiveAction(nextAction);
      setCustomQuery('');
      executeAction(nextAction);
    } else if (actionItem.action === 'copy_clipboard') {
      const isBody =
        actionItem.label?.toLowerCase().includes('body') ||
        actionItem.label?.toLowerCase().includes('draft') ||
        actionItem.label?.toLowerCase().includes('message');
      const isSubject = actionItem.label?.toLowerCase().includes('subject');

      let textToCopy = actionItem.payload?.text;
      if (!textToCopy) {
        if (isSubject && response?.subject) {
          textToCopy = response.subject;
        } else if (isBody && editableDraft) {
          textToCopy = editableDraft;
        } else {
          textToCopy = response?.content || response?.markdownContent || '';
        }
      }
      handleCopy(textToCopy, actionItem.label, index);
    }
  };

  return (
    <Modal
      id="contextual-copilot-modal"
      isOpen={isOpen}
      onClose={onClose}
      title=""
      maxWidth="3xl"
    >
      <div className="space-y-4">
        {/* Custom Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center text-violet-400 shrink-0 shadow-xs">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-100">AI Dispatch Copilot</h3>
                {loadNumber && (
                  <span className="px-2 py-0.5 rounded-md bg-indigo-950/80 border border-indigo-800/60 text-indigo-300 font-mono text-[11px] font-bold">
                    Load #{loadNumber}
                  </span>
                )}
                {titleContext && (
                  <span className="text-xs text-slate-400">({titleContext})</span>
                )}
              </div>
              <p className="text-xs text-slate-400">
                Tenant-isolated operational assistant & draft generator with dual-timezone awareness.
              </p>
            </div>
          </div>

          {/* Engine Mode Toggle */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-900 rounded-lg border border-slate-800 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setCopilotMode('local')}
              className={`px-2.5 py-1 rounded text-[11px] font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                copilotMode === 'local'
                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-800/60'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Deterministic Local Template Engine (Offline-ready & fast)"
            >
              <Cpu className="w-3 h-3 text-emerald-400" />
              <span>Local Engine</span>
            </button>
            <button
              type="button"
              onClick={() => setCopilotMode('gemini')}
              className={`px-2.5 py-1 rounded text-[11px] font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                copilotMode === 'gemini'
                  ? 'bg-violet-950 text-violet-300 border border-violet-800/60'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Gemini 2.5 Flash Cloud Proxy"
            >
              <Brain className="w-3 h-3 text-violet-400" />
              <span>Gemini Cloud</span>
            </button>
          </div>
        </div>

        {/* Quick Action Navigation Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-slate-900/40 flex-nowrap w-full">
          {CONTEXT_ACTION_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeAction === tab.action;
            return (
              <button
                key={tab.action}
                type="button"
                onClick={() => {
                  setActiveAction(tab.action);
                  setCustomQuery('');
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
                  isActive
                    ? 'bg-violet-600 text-white shadow-xs shadow-violet-600/30'
                    : 'bg-slate-900/90 text-slate-300 hover:text-white hover:bg-slate-800 border border-slate-800'
                }`}
                title={tab.description}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Search / Custom Question Bar */}
        <form onSubmit={handleCustomSubmit} className="flex items-center gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder={`Ask Copilot specific questions about ${loadNumber ? `Load #${loadNumber}` : 'operations'} (e.g. Check ETA, missing docs, rate con)...`}
              value={customQuery}
              onChange={(e) => setCustomQuery(e.target.value)}
              className="w-full pl-3.5 pr-20 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-violet-500"
            />
            {customQuery && (
              <button
                type="button"
                onClick={() => setCustomQuery('')}
                className="absolute right-12 top-1/2 -translate-y-1/2 text-[10px] text-slate-500 hover:text-slate-300"
              >
                Clear
              </button>
            )}
            <button
              type="submit"
              disabled={isLoading || !customQuery.trim()}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 px-2.5 py-1 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
            >
              <Send className="w-3 h-3" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => executeAction(activeAction, customQuery)}
            disabled={isLoading}
            className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
            title="Refresh Copilot Response"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-violet-400' : ''}`} />
          </button>
        </form>

        {/* Loading Spinner */}
        {isLoading && (
          <div className="p-12 text-center text-slate-400 bg-slate-950/40 rounded-xl border border-slate-900 space-y-3">
            <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <div className="space-y-1">
              <p className="text-xs font-semibold text-slate-300">
                Building tenant context & generating operational insights...
              </p>
              <p className="text-[11px] text-slate-500">
                Evaluating load parameters, check calls, accessorials, and paperwork rules.
              </p>
            </div>
          </div>
        )}

        {/* Content Area */}
        {!isLoading && response && (
          <div className="space-y-4">
            {/* Draft Warning Banner (Human-in-the-Loop Safeguard) */}
            {response.isDraft && (
              <div className="p-3 bg-amber-950/30 border border-amber-800/60 rounded-xl flex items-start gap-3">
                <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-1 flex-1">
                  <div className="flex items-center justify-between">
                    <h5 className="text-xs font-bold text-amber-300">
                      AI Draft — Dispatcher Review Required
                    </h5>
                    <span className="text-[10px] text-amber-400/80 font-mono">
                      Not automatically sent
                    </span>
                  </div>
                  <p className="text-[11px] text-amber-200/80 leading-relaxed">
                    Review and customize this communication before copying into your email client or WhatsApp. Always confirm recipient address and equipment numbers.
                  </p>
                </div>
              </div>
            )}

            {/* Editable Draft Preview for Comms */}
            {response.isDraft ? (
              <div className="space-y-3 bg-slate-950 p-4 rounded-xl border border-slate-800">
                {/* Subject Line if available */}
                {response.subject && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-slate-400">Email Subject:</span>
                      <button
                        type="button"
                        onClick={() => handleCopy(response.subject || '', 'subject')}
                        className="text-[11px] text-violet-400 hover:text-violet-300 flex items-center gap-1 font-medium cursor-pointer"
                      >
                        {copiedTarget === 'subject' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedTarget === 'subject' ? 'Copied Subject' : 'Copy Subject'}</span>
                      </button>
                    </div>
                    <div className="p-2.5 bg-slate-900 rounded-lg border border-slate-800 text-xs font-mono text-slate-200 select-all">
                      {response.subject}
                    </div>
                  </div>
                )}

                {/* Editable Body */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Edit3 className="w-3.5 h-3.5 text-violet-400" />
                      <span className="text-[11px] font-semibold text-slate-300">Message Body (Editable):</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopy(editableDraft, 'body')}
                      className="px-3 py-1 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                    >
                      {copiedTarget === 'body' ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedTarget === 'body' ? 'Copied Body Text!' : 'Copy to Clipboard'}</span>
                    </button>
                  </div>
                  <textarea
                    value={editableDraft}
                    onChange={(e) => setEditableDraft(e.target.value)}
                    rows={10}
                    className="w-full p-3 bg-slate-900 border border-slate-800 rounded-lg text-xs font-mono text-slate-200 focus:outline-none focus:border-violet-500 leading-relaxed"
                  />
                </div>
              </div>
            ) : (
              /* Structured Markdown Render */
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800/90 shadow-xs space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-slate-900">
                  <h4 className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-violet-400" />
                    <span>{response.title}</span>
                  </h4>
                  <button
                    type="button"
                    onClick={() => handleCopy(response.content, 'markdown')}
                    className="text-[11px] text-slate-400 hover:text-slate-200 flex items-center gap-1 font-medium cursor-pointer"
                  >
                    {copiedTarget === 'markdown' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedTarget === 'markdown' ? 'Copied Content' : 'Copy Text'}</span>
                  </button>
                </div>

                <div className="prose prose-invert max-w-none text-xs">
                  <MarkdownContent
                    content={response.markdownContent || response.content}
                    onLoadClick={(loadNum) => {
                      if (onOpenLoadDetail) {
                        onOpenLoadDetail(loadNum);
                        onClose();
                      }
                    }}
                  />
                </div>
              </div>
            )}

            {/* Suggested Actions Strip (e.g. AI Suggested Tasks) */}
            {response.suggestedActions && response.suggestedActions.length > 0 && (
              <div className="p-3.5 bg-slate-900/90 rounded-xl border border-slate-800 space-y-2">
                <h5 className="text-[11px] font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-violet-400" />
                  <span>Suggested Follow-up Actions (Human Review Required)</span>
                </h5>
                <div className="flex items-center gap-2 overflow-x-auto pb-1.5 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-slate-900/40 flex-nowrap w-full pt-0.5">
                  {response.suggestedActions.map((actionItem, i) => {
                    const isCreate = actionItem.action === 'create_task';
                    const isCopied = copiedActionIndex === i;
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => handleSuggestedAction(actionItem, i)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-all cursor-pointer shadow-xs ${
                          isCreate
                            ? 'bg-violet-600/90 hover:bg-violet-600 text-white border border-violet-500/50'
                            : isCopied
                            ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-700/80'
                            : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                        }`}
                      >
                        {isCreate ? (
                          <Plus className="w-3 h-3 text-violet-200" />
                        ) : isCopied ? (
                          <Check className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Sparkles className="w-3 h-3 text-indigo-400" />
                        )}
                        <span>{isCopied ? 'Copied to Clipboard!' : actionItem.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Recommendations Strip */}
            {response.recommendations && response.recommendations.length > 0 && (
              <div className="p-3.5 bg-slate-900/90 rounded-xl border border-slate-800 space-y-2">
                <h5 className="text-[11px] font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Dispatcher Action Recommendations</span>
                </h5>
                <ul className="space-y-1 text-xs text-slate-300">
                  {response.recommendations.map((rec, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-indigo-400 font-bold">•</span>
                      <span>{rec}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Grounding Sources */}
            {response.groundingSources && response.groundingSources.length > 0 && (
              <div className="pt-2 flex items-center gap-2 flex-wrap text-[11px] text-slate-400">
                <span className="font-semibold text-slate-500">Sources:</span>
                {response.groundingSources.map((source, i) => (
                  <span
                    key={i}
                    className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300 font-mono text-[10px]"
                  >
                    {source.label}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Modal Footer */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-800">
          <span className="text-[11px] text-slate-500">
            Enforces strict tenant isolation and role permissions.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold text-slate-300 hover:text-white bg-slate-900 hover:bg-slate-800 rounded-lg border border-slate-800 transition-colors cursor-pointer"
          >
            Close Copilot
          </button>
        </div>
      </div>

      {/* Task Creation Modal for AI suggested tasks (human confirmation) */}
      <TaskModal
        isOpen={isTaskModalOpen}
        onClose={() => {
          setIsTaskModalOpen(false);
          setTaskModalData({});
        }}
        initialTitle={taskModalData.title}
        initialCategory={taskModalData.category || 'general_operational'}
        initialPriority={taskModalData.priority || 'normal'}
        initialDueAt={taskModalData.due_at}
        initialDescription={taskModalData.description}
        preselectedLoadId={taskModalData.load_id || effectiveLoadId}
        triggerSource="ai_extracted"
        onSuccess={() => {
          setIsTaskModalOpen(false);
          setTaskModalData({});
        }}
      />
    </Modal>
  );
};
