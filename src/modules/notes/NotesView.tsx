import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  MessageSquareText,
  Plus,
  Search,
  Filter,
  PhoneCall,
  UserCheck,
  RotateCcw,
  Sparkles,
  Layers,
  Truck,
  Building2,
  FileCheck,
  AlertCircle,
  Clock,
  Shield,
  Tag,
  ArrowRight,
  Share2,
  FileText,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext.tsx';
import { useTimezone } from '../../contexts/TimezoneContext.tsx';
import { formatDualTime } from '../../lib/timezones.ts';
import { EmptyState } from '../../components/common/EmptyState.tsx';
import { Modal } from '../../components/common/Modal.tsx';
import { StatusBadge } from '../../components/common/StatusBadge.tsx';
import { activityService } from '../activity/activityService.ts';
import {
  ActivityType,
  ActivityFilterType,
  LoadActivityEvent,
  ACTIVITY_FILTER_OPTIONS,
  ACTIVITY_TYPE_CONFIG,
} from '../activity/activityTypes.ts';
import { ShiftHandoverWorkspace } from '../activity/ShiftHandoverWorkspace.tsx';
import { loadService } from '../loads/loadService.ts';
import { LoadWithRelations } from '../loads/loadTypes.ts';
import { LoadDetailModal } from '../loads/LoadDetailModal.tsx';

export const NotesView: React.FC = () => {
  const { activeOrganization, userRole, profile, user } = useAuth();
  const { operationalTimezone, dispatcherTimezone } = useTimezone();

  // Navigation tab: 'feed' | 'handover'
  const [activeTab, setActiveTab] = useState<'feed' | 'handover'>('feed');

  // Activity Feed state
  const [activities, setActivities] = useState<LoadActivityEvent[]>([]);
  const [loads, setLoads] = useState<LoadWithRelations[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<ActivityFilterType>('all');
  const [selectedLoadFilter, setSelectedLoadFilter] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(true);

  // Selected load for detail modal
  const [selectedLoad, setSelectedLoad] = useState<LoadWithRelations | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  // Create Note Modal state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [targetLoadId, setTargetLoadId] = useState('');
  const [noteType, setNoteType] = useState<ActivityType>('dispatcher_note');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [contactName, setContactName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const orgId = activeOrganization?.id || '';
  const canCreate = userRole === 'owner_admin' || userRole === 'dispatcher';

  const fetchActivities = useCallback(async () => {
    if (!orgId) return;
    setIsLoading(true);
    try {
      const [allActivities, allLoads] = await Promise.all([
        activityService.getAllActivities(orgId),
        loadService.getLoads(orgId),
      ]);
      setActivities(allActivities);
      setLoads(allLoads);
      if (allLoads.length > 0 && !targetLoadId) {
        setTargetLoadId(allLoads[0].id);
      }
    } catch (err) {
      console.error('Error loading operational activities:', err);
    } finally {
      setIsLoading(false);
    }
  }, [orgId, targetLoadId]);

  useEffect(() => {
    fetchActivities();
  }, [fetchActivities]);

  const handleSaveNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgId || !canCreate) return;

    if (!targetLoadId) {
      setFormError('Please select a load to associate with this operational note.');
      return;
    }
    if (!content.trim()) {
      setFormError('Please provide details for the note.');
      return;
    }

    setIsSaving(true);
    setFormError(null);

    try {
      const actorName =
        profile?.full_name ||
        user?.email?.split('@')[0] ||
        (userRole === 'owner_admin' ? 'Owner / Admin' : 'Dispatcher');

      const defaultTitle =
        title.trim() ||
        (noteType === 'dispatcher_note'
          ? 'Dispatcher Operational Note'
          : noteType === 'broker_update'
          ? 'Broker Communication'
          : noteType === 'driver_update'
          ? 'Driver Communication'
          : 'Operational Activity');

      const metadata: Record<string, any> = {};
      if (contactName.trim()) {
        if (noteType === 'broker_update') metadata.contactPerson = contactName.trim();
        if (noteType === 'driver_update') metadata.driverPhone = contactName.trim();
      }

      await activityService.logActivity(orgId, {
        loadId: targetLoadId,
        type: noteType,
        title: defaultTitle,
        description: content.trim(),
        actorName,
        actorId: user?.id || 'usr-local',
        metadata: Object.keys(metadata).length > 0 ? metadata : null,
      });

      setIsAddModalOpen(false);
      setTitle('');
      setContent('');
      setContactName('');
      fetchActivities();
    } catch (err: any) {
      console.error('Error saving activity note:', err);
      setFormError(err.message || 'Failed to record note.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenLoad = (load: LoadWithRelations) => {
    setSelectedLoad(load);
    setIsDetailModalOpen(true);
  };

  const handleOpenLoadById = async (loadId: string) => {
    if (!orgId) return;
    const found = loads.find((l) => l.id === loadId);
    if (found) {
      setSelectedLoad(found);
      setIsDetailModalOpen(true);
    } else {
      const fetched = await loadService.getLoadById(orgId, loadId);
      if (fetched) {
        setSelectedLoad(fetched);
        setIsDetailModalOpen(true);
      }
    }
  };

  // Map loadId to Load
  const loadMap = useMemo(() => {
    const map = new Map<string, LoadWithRelations>();
    loads.forEach((l) => map.set(l.id, l));
    return map;
  }, [loads]);

  // Filter activities
  const filteredActivities = useMemo(() => {
    let result = activities;

    if (typeFilter !== 'all') {
      result = result.filter((a) => a.type === typeFilter);
    }

    if (selectedLoadFilter !== 'all') {
      result = result.filter((a) => a.loadId === selectedLoadFilter || a.load_id === selectedLoadFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter((a) => {
        const linkedLoad = loadMap.get(a.loadId || a.load_id || '');
        const loadNum = linkedLoad?.load_number.toLowerCase() || '';
        return (
          a.title.toLowerCase().includes(q) ||
          a.description.toLowerCase().includes(q) ||
          a.actorName.toLowerCase().includes(q) ||
          loadNum.includes(q) ||
          (a.metadata?.brokerName && a.metadata.brokerName.toLowerCase().includes(q))
        );
      });
    }

    return result;
  }, [activities, typeFilter, selectedLoadFilter, searchQuery, loadMap]);

  const getActivityIcon = (type: ActivityType) => {
    switch (type) {
      case 'status_change':
        return <RotateCcw className="w-4 h-4 text-indigo-400" />;
      case 'dispatcher_note':
        return <MessageSquareText className="w-4 h-4 text-amber-400" />;
      case 'driver_update':
        return <Truck className="w-4 h-4 text-purple-400" />;
      case 'broker_update':
        return <Shield className="w-4 h-4 text-sky-400" />;
      case 'document_event':
        return <FileCheck className="w-4 h-4 text-emerald-400" />;
      case 'assignment_change':
        return <Layers className="w-4 h-4 text-orange-400" />;
      case 'system_event':
      default:
        return <AlertCircle className="w-4 h-4 text-slate-400" />;
    }
  };

  return (
    <div id="notes-view" className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-100 tracking-tight">
              Operational Activity & Notes
            </h1>
            <span className="text-xs px-2.5 py-0.5 rounded-md bg-indigo-950/60 text-indigo-300 border border-indigo-800/40 font-semibold">
              Phase 2D.2 Audit Trail
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Real-time audit log of pipeline status shifts, dispatcher phone calls, driver check-ins, rate negotiation history, and cross-shift handovers.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {canCreate && (
            <button
              id="add-note-btn"
              onClick={() => setIsAddModalOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-sm transition-colors cursor-pointer self-start sm:self-auto"
            >
              <Plus className="w-4 h-4" />
              <span>Record Dispatcher Note</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Tabs: Operational Feed vs Shift Handover Workspace */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
        <div className="flex gap-2">
          <button
            id="tab-activity-feed"
            onClick={() => setActiveTab('feed')}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer inline-flex items-center gap-2 ${
              activeTab === 'feed'
                ? 'bg-slate-800 text-slate-100 border border-slate-700 shadow-xs'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <MessageSquareText className="w-4 h-4 text-indigo-400" />
            <span>Operational Activity Feed ({activities.length})</span>
          </button>

          <button
            id="tab-shift-handover"
            onClick={() => setActiveTab('handover')}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer inline-flex items-center gap-2 ${
              activeTab === 'handover'
                ? 'bg-slate-800 text-slate-100 border border-slate-700 shadow-xs'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Share2 className="w-4 h-4 text-emerald-400" />
            <span>Shift Handover Workspace</span>
          </button>
        </div>

        <button
          onClick={fetchActivities}
          className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          title="Refresh Feed"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* View Content */}
      {activeTab === 'handover' ? (
        <ShiftHandoverWorkspace onOpenLoadDetail={handleOpenLoad} />
      ) : (
        <div className="space-y-4">
          {/* Search & Filters */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                id="notes-search-input"
                type="text"
                placeholder="Search audit trail, notes, brokers, actors, or load numbers..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              {/* Type filter */}
              <div className="flex items-center gap-1.5">
                <Filter className="w-3.5 h-3.5 text-slate-400" />
                <select
                  id="notes-type-filter"
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value as ActivityFilterType)}
                  className="px-3 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-300 focus:outline-none focus:border-indigo-500 cursor-pointer"
                >
                  {ACTIVITY_FILTER_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Load filter */}
              <select
                id="notes-load-filter"
                value={selectedLoadFilter}
                onChange={(e) => setSelectedLoadFilter(e.target.value)}
                className="px-3 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-300 focus:outline-none focus:border-indigo-500 cursor-pointer max-w-[200px]"
              >
                <option value="all">All Freight Loads</option>
                {loads.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.load_number} ({l.origin_state}➔{l.dest_state})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Activity Feed List */}
          {filteredActivities.length === 0 ? (
            <EmptyState
              id="empty-notes-state"
              icon={MessageSquareText}
              title="No Operational Activities Found"
              description="No activity logs match the selected filters. Change filters or record a new operational note."
              actionLabel={canCreate ? 'Record First Note' : undefined}
              onAction={canCreate ? () => setIsAddModalOpen(true) : undefined}
            />
          ) : (
            <div className="space-y-3">
              {filteredActivities.map((act) => {
                const config = ACTIVITY_TYPE_CONFIG[act.type] || ACTIVITY_TYPE_CONFIG.system_event;
                const dualTime = formatDualTime(act.timestamp, operationalTimezone, dispatcherTimezone);
                const linkedLoad = loadMap.get(act.loadId || act.load_id || '');

                return (
                  <div
                    key={act.id}
                    className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm hover:border-slate-700 transition-all space-y-2 text-xs"
                  >
                    {/* Top Row: Badge, Linked Load, Dual Time, Actor */}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className={`p-1.5 rounded-md ${config.iconBg} ${config.iconBorder} border`}>
                          {getActivityIcon(act.type)}
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${config.badgeBg} ${config.badgeText} border ${config.badgeBorder}`}
                        >
                          {config.label}
                        </span>

                        {linkedLoad && (
                          <button
                            onClick={() => handleOpenLoad(linkedLoad)}
                            className="inline-flex items-center gap-1 font-mono font-bold text-slate-200 hover:text-indigo-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800 transition-colors cursor-pointer"
                          >
                            <span>{linkedLoad.load_number}</span>
                            <ExternalLink className="w-2.5 h-2.5" />
                          </button>
                        )}
                      </div>

                      <div className="flex items-center gap-3 text-[11px] text-slate-400">
                        <span className="text-slate-300 font-medium">{act.actorName}</span>
                        <span className="font-mono text-slate-500">
                          {dualTime.primary} ({dualTime.secondary})
                        </span>
                      </div>
                    </div>

                    {/* Title & Description */}
                    <div className="space-y-1 pl-8">
                      <h4 className="font-bold text-slate-200 text-sm">{act.title}</h4>
                      <p className="text-slate-300 leading-relaxed">{act.description}</p>
                    </div>

                    {/* Metadata Pill Box */}
                    {act.metadata && (
                      <div className="pl-8 pt-1 flex flex-wrap gap-2 text-[11px]">
                        {act.metadata.previousStatus && act.metadata.newStatus && (
                          <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-950/40 border border-indigo-800/40 text-indigo-300">
                            <span>Stage:</span>
                            <StatusBadge status={act.metadata.previousStatus} type="pipeline" size="sm" />
                            <ArrowRight className="w-2.5 h-2.5" />
                            <StatusBadge status={act.metadata.newStatus} type="pipeline" size="sm" />
                          </div>
                        )}

                        {act.metadata.newTruckNumber && (
                          <span className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-300">
                            Truck: #{act.metadata.newTruckNumber}
                          </span>
                        )}

                        {act.metadata.newDriverName && (
                          <span className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-300">
                            Driver: {act.metadata.newDriverName}
                          </span>
                        )}

                        {act.metadata.brokerName && (
                          <span className="px-2 py-0.5 rounded bg-sky-950/50 border border-sky-800/40 text-sky-300">
                            Broker: {act.metadata.brokerName}
                          </span>
                        )}

                        {act.metadata.docName && (
                          <span className="px-2 py-0.5 rounded bg-emerald-950/50 border border-emerald-800/40 text-emerald-300">
                            Doc: {act.metadata.docName}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Record Note Modal */}
      <Modal
        id="add-note-modal"
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Record Dispatcher Note / Operational Event"
        subtitle="Appends to the immutable audit trail and shift handover log"
        maxWidth="lg"
      >
        <form onSubmit={handleSaveNote} className="space-y-4 text-xs">
          {formError && (
            <div className="p-3 rounded-lg bg-rose-950/60 border border-rose-800 text-rose-200">
              {formError}
            </div>
          )}

          <div>
            <label className="block text-slate-300 font-medium mb-1">Target Load *</label>
            <select
              required
              value={targetLoadId}
              onChange={(e) => setTargetLoadId(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:border-indigo-500"
            >
              <option value="" disabled>
                Select active freight load...
              </option>
              {loads.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.load_number} — {l.origin_city}, {l.origin_state} ➔ {l.dest_city}, {l.dest_state} ({l.client?.company_name || 'Fleet'})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1">Activity Category *</label>
            <select
              value={noteType}
              onChange={(e) => setNoteType(e.target.value as ActivityType)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:border-indigo-500"
            >
              <option value="dispatcher_note">Dispatcher Note (General / Dock protocol / Internal)</option>
              <option value="broker_update">Broker Communication (Rate negotiation, accessorials, detention)</option>
              <option value="driver_update">Driver Communication (Status check, pre-trip, inspection)</option>
              <option value="system_event">Operational Alert / Caution Flag</option>
            </select>
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1">Subject / Headline (Optional)</label>
            <input
              type="text"
              placeholder="e.g. Detention Rate Agreement / Security Gate Instructions"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {(noteType === 'broker_update' || noteType === 'driver_update') && (
            <div>
              <label className="block text-slate-300 font-medium mb-1">
                {noteType === 'broker_update' ? 'Broker Contact Person' : 'Driver Contact Phone / Name'}
              </label>
              <input
                type="text"
                placeholder={noteType === 'broker_update' ? 'e.g. Sarah Jenkins (Apex Logistics)' : 'e.g. (555) 392-8821'}
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:border-indigo-500"
              />
            </div>
          )}

          <div>
            <label className="block text-slate-300 font-medium mb-1">Operational Details & Notes *</label>
            <textarea
              required
              rows={4}
              placeholder="Enter precise operational notes, agreements, or handover instructions..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="pt-3 border-t border-slate-800 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setIsAddModalOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-lg cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg cursor-pointer disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : 'Record Activity'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Linked Load Detail Modal */}
      {selectedLoad && (
        <LoadDetailModal
          isOpen={isDetailModalOpen}
          onClose={() => {
            setIsDetailModalOpen(false);
            setSelectedLoad(null);
          }}
          load={selectedLoad}
          canEdit={canCreate}
        />
      )}
    </div>
  );
};
