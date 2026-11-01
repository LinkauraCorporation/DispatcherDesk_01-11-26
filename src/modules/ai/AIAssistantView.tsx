import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Sparkles,
  Bot,
  FileText,
  AlertTriangle,
  Clock,
  MessageSquare,
  FolderCheck,
  Mail,
  Send,
  Copy,
  Check,
  RefreshCw,
  Trash2,
  ExternalLink,
  ShieldCheck,
  Layers,
  ChevronDown,
  Info,
  SlidersHorizontal,
  CheckCircle2,
  Globe,
  Radio,
  FileSearch,
  CheckSquare,
  Plus,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext.tsx';
import { useTimezone } from '../../contexts/TimezoneContext.tsx';
import { aiService } from './aiService.ts';
import {
  AIRequest,
  AIResponse,
  QuickPrompt,
  CopilotAction,
  CopilotMode,
  GroundingSource,
} from './aiTypes.ts';
import { loadService } from '../loads/loadService.ts';
import { LoadWithRelations } from '../loads/loadTypes.ts';
import { LoadDetailModal } from '../loads/LoadDetailModal.tsx';
import { TaskModal } from '../tasks/TaskModal.tsx';
import { TaskCategory, TaskPriority } from '../tasks/taskTypes.ts';
import { MarkdownContent } from './MarkdownContent.tsx';

// Mapping string icon names from QuickPrompts to Lucide components
const PROMPT_ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  FileText,
  AlertTriangle,
  Clock,
  MessageSquare,
  FolderCheck,
  Mail,
  Sparkles,
  CheckSquare,
};

export const AIAssistantView: React.FC = () => {
  const { activeOrganization, userRole } = useAuth();
  const { operationalTimezone, dispatcherTimezone, liveOpsTime, liveDispatcherTime } = useTimezone();

  const orgId = activeOrganization?.id || 'demo-organization-default';
  const orgName = activeOrganization?.name || 'Carrier Fleet';

  // Loads for target selection & modal viewing
  const [allLoads, setAllLoads] = useState<LoadWithRelations[]>([]);
  const [selectedLoadId, setSelectedLoadId] = useState<string>('all');
  const [selectedLoadForModal, setSelectedLoadForModal] = useState<LoadWithRelations | null>(null);
  const [isLoadModalOpen, setIsLoadModalOpen] = useState(false);

  // Copilot State
  const [quickPrompts, setQuickPrompts] = useState<QuickPrompt[]>([]);
  const [queryInput, setQueryInput] = useState<string>('');
  const [copilotMode, setCopilotMode] = useState<CopilotMode>('local');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [activeResponse, setActiveResponse] = useState<AIResponse | null>(null);

  // Editable draft state for generated emails / messages
  const [editableDraftContent, setEditableDraftContent] = useState<string>('');
  const [isEditingDraft, setIsEditingDraft] = useState<boolean>(false);

  // Clipboard feedback state
  const [copiedFull, setCopiedFull] = useState<boolean>(false);
  const [copiedSubject, setCopiedSubject] = useState<boolean>(false);
  const [copiedDraft, setCopiedDraft] = useState<boolean>(false);
  const [copiedActionIndex, setCopiedActionIndex] = useState<number | null>(null);

  // Safe clipboard helper for cross-browser and iframe compatibility
  const safeCopyToClipboard = async (text: string, onSuccess: () => void) => {
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
      onSuccess();
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
    }
  };

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

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Fetch quick prompts and tenant loads on mount
  useEffect(() => {
    const prompts = aiService.getQuickPrompts();
    setQuickPrompts(prompts);

    loadService
      .getLoads(orgId)
      .then((loads) => setAllLoads(loads))
      .catch((err) => console.error('Failed to preload loads for copilot:', err));
  }, [orgId]);

  // Sync editable draft when response changes
  useEffect(() => {
    if (activeResponse) {
      setEditableDraftContent(activeResponse.content || activeResponse.markdownContent);
      setIsEditingDraft(false);
    }
  }, [activeResponse]);

  // Execute a Copilot Request
  const handleExecuteRequest = useCallback(
    async (action: CopilotAction, queryText?: string, targetLoadIdOverride?: string) => {
      if (!orgId) return;

      setIsLoading(true);
      setError(null);

      const targetLoad = targetLoadIdOverride !== undefined ? targetLoadIdOverride : selectedLoadId;
      const loadIdParam = targetLoad !== 'all' ? targetLoad : undefined;

      const request: AIRequest = {
        action,
        query: queryText || queryInput.trim() || undefined,
        loadId: loadIdParam,
        mode: copilotMode,
      };

      try {
        const response = await aiService.generateCopilotResponse(
          orgId,
          userRole || 'dispatcher',
          request,
          { operationalTimezone, dispatcherTimezone }
        );

        setActiveResponse(response);
      } catch (err: any) {
        console.error('Error generating AI Copilot response:', err);
        setError(
          'Unable to complete dispatch copilot generation. Please check active dispatches and try again.'
        );
      } finally {
        setIsLoading(false);
      }
    },
    [orgId, userRole, selectedLoadId, queryInput, copilotMode, operationalTimezone, dispatcherTimezone]
  );

  // Handle Quick Prompt Trigger
  const handleQuickPromptClick = (prompt: QuickPrompt) => {
    setQueryInput(prompt.defaultQuery || '');
    handleExecuteRequest(prompt.action, prompt.defaultQuery);
  };

  // Handle Manual Form Submit
  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!queryInput.trim() || isLoading) return;
    handleExecuteRequest('general_query', queryInput.trim());
  };

  // Handle Textarea Keyboard Shortcuts (Ctrl+Enter or Cmd+Enter)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      if (queryInput.trim() && !isLoading) {
        handleExecuteRequest('general_query', queryInput.trim());
      }
    }
  };

  // Open Load Details from referenced load number
  const handleOpenLoadByNumber = (loadNumber: string) => {
    const matched = allLoads.find(
      (l) => l.load_number.toLowerCase() === loadNumber.toLowerCase()
    );
    if (matched) {
      setSelectedLoadForModal(matched);
      setIsLoadModalOpen(true);
    }
  };

  // Open Load Details from grounding source ID
  const handleOpenGroundingLoad = (loadId: string) => {
    const matched = allLoads.find((l) => l.id === loadId);
    if (matched) {
      setSelectedLoadForModal(matched);
      setIsLoadModalOpen(true);
    }
  };

  // Copy Full Response Markdown
  const handleCopyFullText = () => {
    if (!activeResponse) return;
    const textToCopy = isEditingDraft
      ? editableDraftContent
      : activeResponse.markdownContent || activeResponse.content;
    safeCopyToClipboard(textToCopy, () => {
      setCopiedFull(true);
      setTimeout(() => setCopiedFull(false), 2000);
    });
  };

  // Copy Subject
  const handleCopySubject = () => {
    if (!activeResponse?.subject) return;
    safeCopyToClipboard(activeResponse.subject, () => {
      setCopiedSubject(true);
      setTimeout(() => setCopiedSubject(false), 2000);
    });
  };

  // Copy Draft Body
  const handleCopyDraft = () => {
    safeCopyToClipboard(editableDraftContent, () => {
      setCopiedDraft(true);
      setTimeout(() => setCopiedDraft(false), 2000);
    });
  };

  // Handle Suggested Action Click
  const handleSuggestedAction = (
    actionItem: { label: string; action: string; payload?: any },
    actionIndex?: number
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
      handleExecuteRequest(
        actionItem.payload?.action as CopilotAction,
        undefined,
        actionItem.payload?.loadId
      );
    } else if (actionItem.action === 'copy_clipboard') {
      const isBody =
        actionItem.label?.toLowerCase().includes('body') ||
        actionItem.label?.toLowerCase().includes('draft') ||
        actionItem.label?.toLowerCase().includes('message');
      const isSubject = actionItem.label?.toLowerCase().includes('subject');

      let textToCopy = actionItem.payload?.text;
      if (!textToCopy) {
        if (isSubject && activeResponse?.subject) {
          textToCopy = activeResponse.subject;
        } else if (isBody && (editableDraftContent || activeResponse?.content)) {
          textToCopy = editableDraftContent || activeResponse?.content || '';
        } else {
          textToCopy = activeResponse?.markdownContent || activeResponse?.content || '';
        }
      }
      safeCopyToClipboard(textToCopy, () => {
        if (actionIndex !== undefined) {
          setCopiedActionIndex(actionIndex);
          setTimeout(() => setCopiedActionIndex(null), 2500);
        }
        setCopiedFull(true);
        setTimeout(() => setCopiedFull(false), 2000);
      });
    }
  };

  // Clear / Reset
  const handleReset = () => {
    setQueryInput('');
    setActiveResponse(null);
    setError(null);
  };

  return (
    <div id="ai-assistant-view" className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* 1. COPILOT HEADER */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="p-2 rounded-lg bg-indigo-950/70 border border-indigo-800/60 text-indigo-400">
                <Bot className="w-5 h-5" />
              </div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-100 tracking-tight">
                AI Dispatch Copilot
              </h1>
              {/* Engine Mode Badge */}
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-950/50 text-emerald-300 border border-emerald-800/60">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                {copilotMode === 'gemini' ? 'Gemini Mode (Server Proxy)' : 'Local Template Engine'}
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-400 mt-1.5">
              Operational briefings, risk detection, cross-timezone handovers, and communications drafting for {orgName}.
            </p>
          </div>

          {/* Context & Role Badges */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <div className="px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700 text-slate-300 flex items-center gap-2">
              <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
              <span>
                Role:{' '}
                <strong className="text-slate-100 uppercase tracking-wider font-semibold">
                  {userRole === 'owner_admin'
                    ? 'Owner / Admin'
                    : userRole === 'dispatcher'
                    ? 'Dispatcher'
                    : 'Staff'}
                </strong>
              </span>
            </div>

            {/* Timezone Indicator */}
            <div className="px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700 text-slate-300 flex items-center gap-2 font-mono text-[11px]">
              <Globe className="w-3.5 h-3.5 text-sky-400" />
              <span>Ops: {liveOpsTime || operationalTimezone}</span>
              <span className="text-slate-600">|</span>
              <span>Local: {liveDispatcherTime || dispatcherTimezone}</span>
            </div>
          </div>
        </div>

        {/* Dispatcher Safety Banner */}
        <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-lg flex items-start gap-2.5 text-xs text-slate-400">
          <Info className="w-4 h-4 text-indigo-400 mt-0.5 shrink-0" />
          <p className="leading-relaxed">
            <strong className="text-slate-200">Dispatcher Review Required:</strong> AI-generated
            summaries and communication drafts must be verified by a licensed dispatcher prior to
            transmitting to brokers or drivers. Financial and accessorial calculations remain strictly
            deterministic.
          </p>
        </div>
      </div>

      {/* 2. QUICK ACTIONS CATALOG */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            <span>Instant Dispatch Workflows</span>
          </h2>
          <span className="text-[11px] text-slate-500">1-Click Grounded Generation</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {quickPrompts.map((prompt) => {
            const IconComponent = PROMPT_ICON_MAP[prompt.icon] || Sparkles;
            const isSelected = activeResponse?.action === prompt.action;

            return (
              <button
                key={prompt.id}
                id={`quick-prompt-${prompt.id}`}
                type="button"
                onClick={() => handleQuickPromptClick(prompt)}
                disabled={isLoading}
                className={`p-3.5 text-left rounded-xl border transition-all duration-150 flex flex-col justify-between gap-2.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                  isSelected
                    ? 'bg-indigo-950/40 border-indigo-600/80 shadow-sm ring-1 ring-indigo-500/50'
                    : 'bg-slate-900 hover:bg-slate-800/80 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="p-2 rounded-lg bg-slate-800/90 text-indigo-400 border border-slate-700/60">
                    <IconComponent className="w-4 h-4" />
                  </div>
                  <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                    {prompt.category}
                  </span>
                </div>

                <div>
                  <h3 className="text-xs font-semibold text-slate-100">{prompt.label}</h3>
                  <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-2 leading-relaxed">
                    {prompt.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. QUERY COMPOSER & TARGET SCOPE */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-indigo-400" />
            <h2 className="text-sm font-semibold text-slate-200">Query & Scope Selection</h2>
          </div>

          {/* Scope target dropdown */}
          <div className="flex items-center gap-2">
            <label htmlFor="target-load-select" className="text-xs text-slate-400 whitespace-nowrap">
              Target Dispatch:
            </label>
            <select
              id="target-load-select"
              value={selectedLoadId}
              onChange={(e) => setSelectedLoadId(e.target.value)}
              className="bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-lg px-2.5 py-1.5 focus:ring-1 focus:ring-indigo-500 focus:outline-none cursor-pointer"
            >
              <option value="all">All Active Freight (Global Handover)</option>
              {allLoads.map((load) => (
                <option key={load.id} value={load.id}>
                  {load.load_number} • {load.client?.company_name || 'Carrier'} • {load.origin_city},{' '}
                  {load.origin_state} ➔ {load.dest_city}, {load.dest_state}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Composer Form */}
        <form onSubmit={handleFormSubmit} className="space-y-3">
          <div className="relative">
            <textarea
              ref={textareaRef}
              id="ai-query-input"
              rows={3}
              value={queryInput}
              onChange={(e) => setQueryInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about active loads, check calls, detention, paperwork, or handover... (e.g. 'Draft detention email for active load' or 'Summarize shift handover')"
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none leading-relaxed resize-y"
            />
            {queryInput && (
              <button
                type="button"
                onClick={() => setQueryInput('')}
                className="absolute right-3 top-3 text-slate-500 hover:text-slate-300 text-xs px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 cursor-pointer"
                title="Clear Query"
              >
                Clear
              </button>
            )}
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
            <div className="flex flex-wrap items-center gap-1.5 text-slate-400 text-[11px]">
              <span>Suggestions:</span>
              <button
                type="button"
                onClick={() => setQueryInput('Generate a cross-timezone shift handover briefing for the incoming dispatcher.')}
                className="px-2 py-0.5 rounded-md bg-slate-800 hover:bg-slate-700 text-indigo-300 border border-slate-700 transition-colors cursor-pointer"
              >
                Shift Handover
              </button>
              <button
                type="button"
                onClick={() => setQueryInput('Identify all active loads with delayed check calls or breakdown exceptions.')}
                className="px-2 py-0.5 rounded-md bg-slate-800 hover:bg-slate-700 text-indigo-300 border border-slate-700 transition-colors cursor-pointer"
              >
                Delayed Trucks
              </button>
              <button
                type="button"
                onClick={() => setQueryInput('Draft a formal broker detention claim notice for the active detention load.')}
                className="px-2 py-0.5 rounded-md bg-slate-800 hover:bg-slate-700 text-indigo-300 border border-slate-700 transition-colors cursor-pointer"
              >
                Detention Notice
              </button>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              {activeResponse && (
                <button
                  type="button"
                  onClick={handleReset}
                  className="px-3 py-2 text-xs font-medium text-slate-400 hover:text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors cursor-pointer"
                >
                  Reset Workspace
                </button>
              )}

              <button
                id="ai-submit-btn"
                type="submit"
                disabled={isLoading || !queryInput.trim()}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 disabled:border-slate-700 rounded-lg shadow-sm transition-all cursor-pointer disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Analyzing Freight Data...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 text-indigo-200" />
                    <span>Generate Copilot Digest</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>

        {/* Keyboard shortcut hint */}
        <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
          <span>
            Shortcut: <kbd className="px-1 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-400 font-mono">Ctrl</kbd> + <kbd className="px-1 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-400 font-mono">Enter</kbd> to submit
          </span>
          <span>Role-Gated RBAC Enabled</span>
        </div>
      </div>

      {/* ERROR BANNER */}
      {error && (
        <div className="p-4 bg-rose-950/40 border border-rose-800/60 rounded-xl flex items-start gap-3 text-xs sm:text-sm text-rose-200">
          <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold">Operational Error</p>
            <p className="mt-0.5 text-rose-300">{error}</p>
          </div>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-rose-400 hover:text-rose-200 text-xs px-2 py-1 rounded bg-rose-900/40 border border-rose-800 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* 4. RESPONSE WORKSPACE */}
      {activeResponse ? (
        <div
          id="ai-response-panel"
          className="bg-slate-900 border border-slate-800 rounded-xl shadow-md overflow-hidden space-y-0"
        >
          {/* Response Top Bar */}
          <div className="p-4 sm:p-5 bg-slate-900 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-slate-100 tracking-tight">
                  {activeResponse.title}
                </h2>
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800/60 font-semibold">
                  {activeResponse.action.replace('_', ' ')}
                </span>
                {activeResponse.isDraft && (
                  <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-amber-950/70 text-amber-300 border border-amber-800/60 font-semibold">
                    AI Draft — Review Required
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Generated at {new Date(activeResponse.timestamp).toLocaleTimeString()} • Engine:{' '}
                <span className="text-slate-300 font-mono">
                  {activeResponse.mode === 'gemini' ? 'Gemini 3.8 Server Proxy' : 'Local Deterministic Template'}
                </span>
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                id="ai-copy-full-btn"
                onClick={handleCopyFullText}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium transition-colors cursor-pointer"
              >
                {copiedFull ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-400 font-semibold">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-slate-400" />
                    <span>Copy Full Output</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => handleExecuteRequest(activeResponse.action)}
                disabled={isLoading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium transition-colors cursor-pointer"
                title="Regenerate with fresh freight data"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-slate-400 ${isLoading ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
            </div>
          </div>

          {/* DRAFT COMMUNICATION EDITOR / VIEWER (for external emails & WhatsApp messages) */}
          {activeResponse.isDraft && (
            <div className="p-4 sm:p-5 bg-slate-950/70 border-b border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-indigo-400" />
                  <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider">
                    Draft Communications Editor
                  </h3>
                </div>

                <div className="flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setIsEditingDraft(!isEditingDraft)}
                    className="text-indigo-400 hover:text-indigo-300 transition-colors cursor-pointer underline"
                  >
                    {isEditingDraft ? 'Switch to Formatted View' : 'Edit Text'}
                  </button>
                  <span className="text-slate-600">|</span>
                  <button
                    type="button"
                    onClick={handleCopyDraft}
                    className="inline-flex items-center gap-1 text-slate-300 hover:text-white transition-colors cursor-pointer font-medium"
                  >
                    {copiedDraft ? (
                      <span className="text-emerald-400 font-semibold flex items-center gap-1">
                        <Check className="w-3 h-3" /> Copied Draft!
                      </span>
                    ) : (
                      <span className="flex items-center gap-1">
                        <Copy className="w-3 h-3" /> Copy Message Body
                      </span>
                    )}
                  </button>
                </div>
              </div>

              {/* Subject line field if provided */}
              {activeResponse.subject && (
                <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs">
                  <span className="font-semibold text-slate-400 shrink-0">Subject:</span>
                  <input
                    type="text"
                    readOnly
                    value={activeResponse.subject}
                    className="bg-transparent text-slate-100 font-mono text-xs flex-1 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleCopySubject}
                    className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
                    title="Copy Subject"
                  >
                    {copiedSubject ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              )}

              {/* Editable Textarea or Live Preview */}
              {isEditingDraft ? (
                <div className="space-y-1.5">
                  <textarea
                    rows={8}
                    value={editableDraftContent}
                    onChange={(e) => setEditableDraftContent(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-xs font-mono text-slate-100 focus:ring-1 focus:ring-indigo-500 focus:outline-none leading-relaxed resize-y"
                  />
                  <p className="text-[11px] text-slate-500 italic">
                    Edit above before copying into your email client or WhatsApp desktop.
                  </p>
                </div>
              ) : null}
            </div>
          )}

          {/* MAIN STRUCTURED MARKDOWN CONTENT */}
          <div className="p-5 sm:p-6 space-y-4">
            <MarkdownContent
              content={activeResponse.markdownContent || activeResponse.content}
              onLoadClick={handleOpenLoadByNumber}
            />
          </div>

          {/* RECOMMENDATIONS STRIP */}
          {activeResponse.recommendations && activeResponse.recommendations.length > 0 && (
            <div className="p-4 sm:p-5 bg-slate-950/50 border-t border-slate-800 space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Actionable Recommendations</span>
              </h3>
              <ul className="space-y-1 text-xs sm:text-sm text-slate-300">
                {activeResponse.recommendations.map((rec, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-indigo-400 mt-0.5 shrink-0 font-bold">•</span>
                    <span className="leading-relaxed">{rec}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* SUGGESTED ACTIONS BAR (e.g. AI Suggested Tasks, Prompt Triggers) */}
          {activeResponse.suggestedActions && activeResponse.suggestedActions.length > 0 && (
            <div className="p-4 sm:p-5 bg-slate-950/70 border-t border-slate-800 space-y-2.5">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-violet-400" />
                  <span>Suggested Follow-up Actions (Human Review Required)</span>
                </h3>
                <span className="text-[11px] text-slate-500">
                  {activeResponse.suggestedActions.length} action(s) available
                </span>
              </div>

              <div className="flex items-center gap-2 overflow-x-auto pb-1.5 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-slate-900/40 flex-nowrap w-full pt-1">
                {activeResponse.suggestedActions.map((actionItem, idx) => {
                  const isCreateTask = actionItem.action === 'create_task';
                  const isCopied = copiedActionIndex === idx;
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleSuggestedAction(actionItem, idx)}
                      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-all cursor-pointer shadow-xs ${
                        isCreateTask
                          ? 'bg-violet-600/90 hover:bg-violet-600 text-white border border-violet-500/50 hover:border-violet-400'
                          : isCopied
                          ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-700/80'
                          : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 hover:border-slate-600'
                      }`}
                    >
                      {isCreateTask ? (
                        <Plus className="w-3.5 h-3.5 text-violet-200" />
                      ) : isCopied ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
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

          {/* GROUNDING & OPERATIONAL SOURCES PANEL */}
          {activeResponse.groundingSources && activeResponse.groundingSources.length > 0 && (
            <div className="p-4 sm:p-5 bg-slate-900/90 border-t border-slate-800 space-y-2.5">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-sky-400" />
                  <span>Grounding Sources & Traceability</span>
                </h3>
                <span className="text-[11px] text-slate-500">
                  {activeResponse.groundingSources.length} records referenced
                </span>
              </div>

              <div className="flex flex-wrap gap-2">
                {activeResponse.groundingSources.map((source: GroundingSource, idx: number) => {
                  const isLoad = source.type === 'load';
                  return (
                    <div
                      key={idx}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700/80 text-xs text-slate-300"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
                      <span className="font-medium text-slate-200">{source.label}</span>
                      {isLoad && (
                        <button
                          type="button"
                          onClick={() => handleOpenGroundingLoad(source.id)}
                          className="ml-1 text-indigo-400 hover:text-indigo-300 transition-colors cursor-pointer flex items-center gap-0.5 text-[11px] font-semibold"
                          title="Open Load Detail Modal"
                        >
                          <span>Open</span>
                          <ExternalLink className="w-2.5 h-2.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* 5. EMPTY STATE: WELCOME & FEATURE GUIDE */
        <div className="bg-slate-900 border border-dashed border-slate-800 rounded-xl p-8 sm:p-12 text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-indigo-950/60 border border-indigo-800/50 flex items-center justify-center text-indigo-400 mx-auto shadow-inner">
            <Sparkles className="w-7 h-7" />
          </div>

          <div className="max-w-xl mx-auto space-y-2">
            <h2 className="text-base sm:text-lg font-bold text-slate-100 tracking-tight">
              Interactive AI Dispatch Workspace
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
              Select any of the Quick Workflows above or type a natural language prompt to generate
              grounded handover digests, broker status communications, driver instructions, and missing
              paperwork audits.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-3xl mx-auto pt-4 text-left">
            <div className="p-3.5 rounded-lg bg-slate-950/60 border border-slate-800 space-y-1">
              <span className="text-[10px] uppercase font-mono font-bold text-indigo-400">
                1. Dual Timezone Safety
              </span>
              <p className="text-xs text-slate-300 font-semibold">Automatic Offset Translation</p>
              <p className="text-[11px] text-slate-400">
                Aligns US facility operational windows with India/dispatcher local shift times.
              </p>
            </div>

            <div className="p-3.5 rounded-lg bg-slate-950/60 border border-slate-800 space-y-1">
              <span className="text-[10px] uppercase font-mono font-bold text-emerald-400">
                2. Deterministic Core
              </span>
              <p className="text-xs text-slate-300 font-semibold">Zero Math Hallucination</p>
              <p className="text-[11px] text-slate-400">
                Detention bills ($75/hr in 15-min increments) and RPM calculations run on exact TypeScript math.
              </p>
            </div>

            <div className="p-3.5 rounded-lg bg-slate-950/60 border border-slate-800 space-y-1">
              <span className="text-[10px] uppercase font-mono font-bold text-sky-400">
                3. Grounded Dispatch
              </span>
              <p className="text-xs text-slate-300 font-semibold">Traceable Source Links</p>
              <p className="text-[11px] text-slate-400">
                Every generated alert, delay warning, and draft is anchored directly to live tenant records.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 6. EMBEDDED LOAD DETAIL MODAL FOR LOAD CLICK NAVIGATION */}
      {selectedLoadForModal && (
        <LoadDetailModal
          isOpen={isLoadModalOpen}
          onClose={() => {
            setIsLoadModalOpen(false);
            setSelectedLoadForModal(null);
          }}
          load={selectedLoadForModal}
          canEdit={userRole === 'owner_admin' || userRole === 'dispatcher'}
        />
      )}

      {/* 7. TASK CREATION MODAL FOR AI SUGGESTED TASKS (HUMAN CONFIRMATION) */}
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
        preselectedLoadId={taskModalData.load_id}
        triggerSource="ai_extracted"
        onSuccess={() => {
          setIsTaskModalOpen(false);
          setTaskModalData({});
        }}
      />
    </div>
  );
};
