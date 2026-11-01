import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useTimezone } from '../../contexts/TimezoneContext.tsx';
import { useAuth } from '../../contexts/AuthContext.tsx';
import { formatDualTime, formatInTimezone } from '../../lib/timezones.ts';
import {
  ActivityType,
  ActivityFilterType,
  LoadActivityEvent,
  ACTIVITY_FILTER_OPTIONS,
  ACTIVITY_TYPE_CONFIG,
} from './activityTypes.ts';
import { activityService } from './activityService.ts';
import { ActivityComposer } from './ActivityComposer.tsx';
import { StatusBadge } from '../../components/common/StatusBadge.tsx';
import {
  ArrowRight,
  Search,
  Filter,
  MessageSquare,
  Truck,
  Shield,
  FileCheck,
  RotateCcw,
  Clock,
  User,
  AlertCircle,
  ShieldAlert,
  Calendar,
  Layers,
  Sparkles,
  Phone,
  Paperclip,
  CheckCircle2,
  FileText,
  Building2,
  SlidersHorizontal,
  RefreshCw,
} from 'lucide-react';

interface ActivityTimelineProps {
  loadId: string;
  organizationId: string;
  showComposer?: boolean;
  className?: string;
  onActivityChanged?: () => void;
}

export const ActivityTimeline: React.FC<ActivityTimelineProps> = ({
  loadId,
  organizationId,
  showComposer = true,
  className = '',
  onActivityChanged,
}) => {
  const { operationalTimezone, dispatcherTimezone } = useTimezone();
  const { userRole } = useAuth();

  const [activities, setActivities] = useState<LoadActivityEvent[]>([]);
  const [filterType, setFilterType] = useState<ActivityFilterType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchActivities = useCallback(async () => {
    if (!loadId || !organizationId) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await activityService.getActivities(organizationId, loadId);
      setActivities(data);
    } catch (err: any) {
      console.error('Error loading load activity timeline:', err);
      setError(err.message || 'Failed to load activity events.');
    } finally {
      setIsLoading(false);
    }
  }, [loadId, organizationId]);

  useEffect(() => {
    fetchActivities();
  }, [fetchActivities]);

  const handleActivityAdded = () => {
    fetchActivities();
    if (onActivityChanged) onActivityChanged();
  };

  // Filtered & Searched activities
  const filteredActivities = useMemo(() => {
    let result = activities;

    if (filterType !== 'all') {
      result = result.filter((a) => a.type === filterType);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter((a) => {
        return (
          a.title.toLowerCase().includes(q) ||
          a.description.toLowerCase().includes(q) ||
          a.actorName.toLowerCase().includes(q) ||
          (a.metadata?.brokerName && a.metadata.brokerName.toLowerCase().includes(q)) ||
          (a.metadata?.docName && a.metadata.docName.toLowerCase().includes(q)) ||
          (a.metadata?.newTruckNumber && a.metadata.newTruckNumber.toLowerCase().includes(q)) ||
          (a.metadata?.newDriverName && a.metadata.newDriverName.toLowerCase().includes(q))
        );
      });
    }

    return result;
  }, [activities, filterType, searchQuery]);

  // Counts by type for badge indicators
  const countsByType = useMemo(() => {
    const counts: Record<string, number> = { all: activities.length };
    activities.forEach((a) => {
      counts[a.type] = (counts[a.type] || 0) + 1;
    });
    return counts;
  }, [activities]);

  const getActivityIcon = (type: ActivityType) => {
    switch (type) {
      case 'status_change':
        return <RotateCcw className="w-4 h-4 text-indigo-400" />;
      case 'dispatcher_note':
        return <MessageSquare className="w-4 h-4 text-amber-400" />;
      case 'driver_update':
        return <Truck className="w-4 h-4 text-purple-400" />;
      case 'broker_update':
        return <Shield className="w-4 h-4 text-sky-400" />;
      case 'document_event':
        return <FileCheck className="w-4 h-4 text-emerald-400" />;
      case 'assignment_change':
        return <Layers className="w-4 h-4 text-orange-400" />;
      case 'ai_assistant':
        return <Sparkles className="w-4 h-4 text-violet-400" />;
      case 'system_event':
      default:
        return <AlertCircle className="w-4 h-4 text-slate-400" />;
    }
  };

  const formatRelativeTime = (isoString: string) => {
    try {
      const diffMs = Date.now() - new Date(isoString).getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHours / 24);

      if (diffMins < 2) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays === 1) return 'Yesterday';
      if (diffDays < 7) return `${diffDays}d ago`;
      return formatInTimezone(isoString, operationalTimezone, { includeDate: true, includeTime: false, includeTimezoneCode: false });
    } catch {
      return '';
    }
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Activity Composer at Top */}
      {showComposer && (
        <ActivityComposer
          loadId={loadId}
          organizationId={organizationId}
          onActivityCreated={handleActivityAdded}
        />
      )}

      {/* Filter and Search Bar */}
      <div className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-indigo-400" />
            <h5 className="font-bold text-slate-200 uppercase tracking-wider text-xs">
              Load Activity & Audit Log
            </h5>
            <span className="text-[10px] px-2 py-0.5 rounded bg-slate-900 text-slate-300 border border-slate-800 font-mono">
              {filteredActivities.length} Events
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase font-bold text-slate-500 font-mono tracking-wider flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
              Append-Only History
            </span>

            <button
              type="button"
              onClick={fetchActivities}
              disabled={isLoading}
              title="Refresh timeline events"
              className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800 transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Search Input & Filter Pills */}
        <div className="space-y-2.5 pt-1">
          {/* Search */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Search timeline by keyword, note, actor, broker, or document..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-slate-900/90 border border-slate-800 rounded-lg text-slate-200 text-xs placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-500 hover:text-slate-300"
              >
                Clear
              </button>
            )}
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
            {ACTIVITY_FILTER_OPTIONS.map((opt) => {
              const count = countsByType[opt.value] || 0;
              const isActive = filterType === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setFilterType(opt.value)}
                  className={`px-2.5 py-1 rounded-lg font-medium text-[11px] whitespace-nowrap transition-colors cursor-pointer flex items-center gap-1.5 ${
                    isActive
                      ? 'bg-indigo-600 text-white font-semibold shadow-xs'
                      : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <span>{opt.label}</span>
                  <span
                    className={`text-[9px] px-1.5 py-0.2 rounded-full font-mono ${
                      isActive ? 'bg-indigo-700/80 text-white' : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Loading Skeleton */}
      {isLoading && (
        <div className="space-y-3 py-2">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className="p-4 rounded-xl border border-slate-800/60 bg-slate-950/40 animate-pulse flex gap-3"
            >
              <div className="w-8 h-8 rounded-lg bg-slate-800/80 shrink-0" />
              <div className="space-y-2 flex-1">
                <div className="h-3.5 bg-slate-800/80 rounded w-1/3" />
                <div className="h-3 bg-slate-800/60 rounded w-4/5" />
                <div className="h-2.5 bg-slate-800/40 rounded w-1/4 mt-2" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Error State */}
      {error && !isLoading && (
        <div className="p-4 rounded-xl bg-rose-950/30 border border-rose-800/60 text-rose-200 space-y-2">
          <div className="flex items-center gap-2 font-bold text-xs">
            <AlertCircle className="w-4 h-4 text-rose-400" />
            <span>Unable to Load Activity Timeline</span>
          </div>
          <p className="text-xs text-rose-200/90">{error}</p>
          <button
            type="button"
            onClick={fetchActivities}
            className="px-3 py-1.5 rounded-lg bg-rose-900/60 hover:bg-rose-900 border border-rose-700/60 text-xs font-semibold cursor-pointer text-white transition-colors"
          >
            Retry Loading
          </button>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !error && filteredActivities.length === 0 && (
        <div className="p-8 rounded-xl border border-slate-800 bg-slate-950/50 text-center space-y-3">
          <div className="w-10 h-10 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 mx-auto flex items-center justify-center">
            <MessageSquare className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h5 className="font-semibold text-slate-200 text-sm">
              {searchQuery || filterType !== 'all'
                ? 'No matching activity records'
                : 'No activity recorded yet'}
            </h5>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              {searchQuery || filterType !== 'all'
                ? 'Try adjusting your search terms or filter criteria to see other events.'
                : 'Operational events, status advances, rate agreements, and dispatcher notes will appear here in chronological order.'}
            </p>
          </div>
          {(searchQuery || filterType !== 'all') && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setFilterType('all');
              }}
              className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 text-xs font-medium transition-colors cursor-pointer"
            >
              Reset Filters
            </button>
          )}
        </div>
      )}

      {/* Vertical Timeline List */}
      {!isLoading && !error && filteredActivities.length > 0 && (
        <div className="relative pl-6 space-y-4 before:absolute before:left-3 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-800">
          {filteredActivities.map((event) => {
            const config = ACTIVITY_TYPE_CONFIG[event.type] || ACTIVITY_TYPE_CONFIG.system_event;
            const dualTime = formatDualTime(event.timestamp, operationalTimezone, dispatcherTimezone);
            const relTime = formatRelativeTime(event.timestamp);

            return (
              <div key={event.id} className="relative group">
                {/* Timeline node icon */}
                <div
                  className={`absolute -left-6 top-2 w-6 h-6 rounded-full border flex items-center justify-center -translate-x-1/2 shadow-xs transition-transform group-hover:scale-110 ${config.iconBg} ${config.iconBorder}`}
                  title={config.label}
                >
                  {getActivityIcon(event.type)}
                </div>

                {/* Event Card */}
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800/80 group-hover:border-slate-700 transition-colors space-y-2.5 shadow-xs">
                  {/* Card Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 pb-2 border-b border-slate-900">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border uppercase tracking-wider ${config.badgeBg} ${config.badgeBorder} ${config.badgeText}`}
                      >
                        {config.label}
                      </span>

                      <h4 className="font-bold text-slate-100 text-xs">
                        {event.title}
                      </h4>
                    </div>

                    {/* Dual Timestamps & Relative badge */}
                    <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono self-start sm:self-auto">
                      {relTime && (
                        <span className="text-slate-300 font-semibold bg-slate-900 px-1.5 py-0.2 rounded border border-slate-800">
                          {relTime}
                        </span>
                      )}
                      <span>{dualTime.primary}</span>
                      {dualTime.secondary !== '—' && (
                        <span className="text-slate-500 hidden md:inline">
                          ({dualTime.secondary})
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Main Event Content */}
                  <p className="text-slate-200 text-xs leading-relaxed whitespace-pre-wrap font-sans">
                    {event.description}
                  </p>

                  {/* Contextual Rich Metadata Strip */}
                  {event.metadata && Object.keys(event.metadata).length > 0 && (
                    <div className="pt-2 border-t border-slate-900 flex flex-wrap gap-2 text-[11px]">
                      {/* Status Shifts */}
                      {event.type === 'status_change' && (
                        <div className="flex items-center gap-1.5 bg-slate-900/90 px-2.5 py-1 rounded-lg border border-slate-800">
                          <span className="text-[10px] text-slate-400 font-semibold uppercase">Shift:</span>
                          {event.metadata.previousStatus && (
                            <StatusBadge status={event.metadata.previousStatus} type="pipeline" size="sm" />
                          )}
                          <ArrowRight className="w-3 h-3 text-slate-500" />
                          {event.metadata.newStatus && (
                            <StatusBadge status={event.metadata.newStatus} type="pipeline" size="sm" />
                          )}
                        </div>
                      )}

                      {/* Assignment Shifts */}
                      {event.type === 'assignment_change' && (
                        <>
                          {event.metadata.newTruckNumber && (
                            <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-950/60 text-amber-300 border border-amber-800/40">
                              <Truck className="w-3 h-3" />
                              <span>Truck #{event.metadata.newTruckNumber}</span>
                            </div>
                          )}
                          {event.metadata.newDriverName && (
                            <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-purple-950/60 text-purple-300 border border-purple-800/40">
                              <User className="w-3 h-3" />
                              <span>{event.metadata.newDriverName}</span>
                            </div>
                          )}
                        </>
                      )}

                      {/* Document Details */}
                      {event.type === 'document_event' && (
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-800/40 font-mono text-[10px]">
                          <Paperclip className="w-3 h-3" />
                          <span>{event.metadata.docName || event.metadata.docType}</span>
                          {event.metadata.docStatus && (
                            <span className="capitalize text-[9px] px-1 rounded bg-emerald-900 text-emerald-200">
                              {event.metadata.docStatus}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Broker details */}
                      {event.metadata.brokerName && event.type !== 'document_event' && (
                        <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-sky-950/60 text-sky-300 border border-sky-800/40 text-[10px]">
                          <Building2 className="w-3 h-3" />
                          <span>{event.metadata.brokerName}</span>
                        </div>
                      )}

                      {/* Contact person or phone */}
                      {event.metadata.contactPerson && (
                        <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-900 text-slate-300 border border-slate-800 text-[10px]">
                          <User className="w-3 h-3 text-slate-400" />
                          <span>Rep: {event.metadata.contactPerson}</span>
                        </div>
                      )}

                      {event.metadata.driverPhone && (
                        <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-900 text-slate-300 border border-slate-800 text-[10px]">
                          <Phone className="w-3 h-3 text-slate-400" />
                          <span>{event.metadata.driverPhone}</span>
                        </div>
                      )}

                      {/* Rate / Detention terms */}
                      {event.metadata.agreedRate && (
                        <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-950/60 text-indigo-300 border border-indigo-800/40 text-[10px] font-mono font-semibold">
                          <span>${Number(event.metadata.agreedRate).toLocaleString()} Agreed</span>
                        </div>
                      )}

                      {event.metadata.detentionRate && (
                        <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-800 text-[10px]">
                          <span>Detention: {event.metadata.detentionRate}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Card Footer with Actor info */}
                  <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1">
                    <div className="flex items-center gap-1.5">
                      <div className="w-4 h-4 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-[9px] text-slate-300">
                        <User className="w-2.5 h-2.5" />
                      </div>
                      <span className="font-semibold text-slate-300">
                        {event.actorName}
                      </span>
                    </div>

                    <span className="text-slate-500 font-mono text-[9px]">
                      ID: {event.id}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
