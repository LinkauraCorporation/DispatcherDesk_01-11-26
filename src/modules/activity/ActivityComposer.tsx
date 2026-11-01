import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext.tsx';
import {
  ActivityType,
  CreateActivityInput,
  ACTIVITY_TYPE_CONFIG,
} from './activityTypes.ts';
import { activityService } from './activityService.ts';
import {
  MessageSquare,
  Send,
  User,
  Shield,
  Truck,
  AlertCircle,
  Sparkles,
  Lock,
  Tag,
  CheckCircle2,
} from 'lucide-react';

interface ActivityComposerProps {
  loadId: string;
  organizationId?: string;
  onActivityCreated: () => void;
  defaultType?: ActivityType;
  className?: string;
}

const QUICK_TAGS: { label: string; type: ActivityType; title: string; defaultText: string }[] = [
  {
    label: 'Rate & Accessorials',
    type: 'broker_update',
    title: 'Broker Rate & Accessorial Agreement',
    defaultText: 'Confirmed detention rate of $75/hr after 2 hrs free time. Layover agreement $300/day if required.',
  },
  {
    label: 'Driver ETA Update',
    type: 'driver_update',
    title: 'Driver Transit Update & ETA',
    defaultText: 'Driver confirmed steady highway progress with clean pre-trip inspection. ETA to receiver is on schedule.',
  },
  {
    label: 'Gate / Dock Protocol',
    type: 'dispatcher_note',
    title: 'Receiver Gate & Check-In Protocol',
    defaultText: 'Driver must check in at Security Gate 2 with Broker PO Number and trailer seal intact.',
  },
  {
    label: 'Detention Notice',
    type: 'broker_update',
    title: 'Detention Warning Sent to Broker',
    defaultText: 'Notified broker rep that driver has been in dock queue for over 90 minutes. Awaiting loading bay assignment.',
  },
  {
    label: 'Operational Alert',
    type: 'system_event',
    title: 'Operational Caution Flagged',
    defaultText: 'Weather advisory along transit corridor. Advised driver to reduce speed and monitor road conditions.',
  },
];

export const ActivityComposer: React.FC<ActivityComposerProps> = ({
  loadId,
  organizationId,
  onActivityCreated,
  defaultType = 'dispatcher_note',
  className = '',
}) => {
  const { activeOrganization, userRole, profile, user } = useAuth();
  const [type, setType] = useState<ActivityType>(defaultType);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  // Broker / Driver metadata state
  const [contactName, setContactName] = useState('');

  const isReadOnly = userRole === 'staff';

  const handleApplyQuickTag = (tag: typeof QUICK_TAGS[0]) => {
    setType(tag.type);
    setTitle(tag.title);
    setDescription(tag.defaultText);
    setIsExpanded(true);
    setError(null);
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isReadOnly || isSubmitting) return;

    if (!description.trim()) {
      setError('Please provide event details or operational notes.');
      return;
    }

    const finalTitle = title.trim() || getDefaultTitleForType(type);
    const actorName = profile?.full_name || user?.email?.split('@')[0] || (userRole === 'owner_admin' ? 'Owner / Admin' : 'Dispatcher');

    setIsSubmitting(true);
    setError(null);

    try {
      const orgId = organizationId || activeOrganization?.id || localStorage.getItem('dispatchdesk_active_org_id') || 'demo-org-1';

      const metadata: Record<string, any> = {};
      if (contactName.trim()) {
        if (type === 'broker_update') metadata.contactPerson = contactName.trim();
        if (type === 'driver_update') metadata.driverPhone = contactName.trim();
      }

      await activityService.logActivity(orgId, {
        loadId,
        type,
        title: finalTitle,
        description: description.trim(),
        actorName,
        actorId: user?.id || 'usr-local',
        metadata: Object.keys(metadata).length > 0 ? metadata : null,
      });

      setTitle('');
      setDescription('');
      setContactName('');
      setIsExpanded(false);
      setSuccessNotice(true);
      setTimeout(() => setSuccessNotice(false), 3000);
      onActivityCreated();
    } catch (err: any) {
      console.error('Error logging activity event:', err);
      setError(err.message || 'Failed to append activity note.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  };

  function getDefaultTitleForType(t: ActivityType): string {
    switch (t) {
      case 'dispatcher_note':
        return 'Dispatcher Operational Note';
      case 'driver_update':
        return 'Driver Communication Update';
      case 'broker_update':
        return 'Broker Communication Record';
      case 'system_event':
        return 'Operational Audit Flag';
      default:
        return 'Operational Activity';
    }
  }

  if (isReadOnly) {
    return (
      <div className={`p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80 text-slate-400 flex items-center gap-3 ${className}`}>
        <Lock className="w-4 h-4 text-slate-500 shrink-0" />
        <div className="text-xs">
          <span className="font-semibold text-slate-300">Read-Only Timeline:</span> Staff accounts have view permissions only. Dispatchers and Admins can append activity entries.
        </div>
      </div>
    );
  }

  return (
    <div className={`p-4 rounded-xl border border-slate-800 bg-slate-950/90 space-y-3 ${className}`}>
      {/* Header & Category Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-3 border-b border-slate-800/80">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-indigo-400" />
          <span className="font-bold text-slate-200 uppercase tracking-wider text-xs">
            Append Activity or Operational Note
          </span>
        </div>

        {/* Note Type Selector */}
        <div className="flex flex-wrap gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800">
          <button
            type="button"
            onClick={() => setType('dispatcher_note')}
            className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer flex items-center gap-1.5 ${
              type === 'dispatcher_note'
                ? 'bg-amber-950 text-amber-300 border border-amber-800/60 shadow-xs'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <MessageSquare className="w-3 h-3" />
            <span>Dispatcher Note</span>
          </button>

          <button
            type="button"
            onClick={() => setType('driver_update')}
            className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer flex items-center gap-1.5 ${
              type === 'driver_update'
                ? 'bg-purple-950 text-purple-300 border border-purple-800/60 shadow-xs'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Truck className="w-3 h-3" />
            <span>Driver Update</span>
          </button>

          <button
            type="button"
            onClick={() => setType('broker_update')}
            className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer flex items-center gap-1.5 ${
              type === 'broker_update'
                ? 'bg-sky-950 text-sky-300 border border-sky-800/60 shadow-xs'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Shield className="w-3 h-3" />
            <span>Broker Comms</span>
          </button>

          <button
            type="button"
            onClick={() => setType('system_event')}
            className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer flex items-center gap-1.5 ${
              type === 'system_event'
                ? 'bg-slate-800 text-slate-200 border border-slate-700 shadow-xs'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <AlertCircle className="w-3 h-3" />
            <span>Alert / Flag</span>
          </button>
        </div>
      </div>

      {/* Quick Tag Templates */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider flex items-center gap-1">
          <Tag className="w-2.5 h-2.5" /> Quick Presets:
        </span>
        {QUICK_TAGS.map((tag) => (
          <button
            key={tag.label}
            type="button"
            onClick={() => handleApplyQuickTag(tag)}
            className="px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white text-[10px] transition-colors cursor-pointer"
          >
            + {tag.label}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="space-y-2.5">
        {/* Title Input (Optional / Expandable) */}
        <div>
          <input
            type="text"
            placeholder={`Subject / Summary (default: ${getDefaultTitleForType(type)})`}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-slate-200 text-xs placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>

        {/* Contextual Contact / Ref input */}
        {(type === 'broker_update' || type === 'driver_update') && (
          <div>
            <input
              type="text"
              placeholder={type === 'broker_update' ? 'Broker Contact Person / Phone (optional)' : 'Driver Contact / Current Mile Marker (optional)'}
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              className="w-full px-3 py-1.5 bg-slate-900/80 border border-slate-800/80 rounded-lg text-slate-300 text-xs placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>
        )}

        {/* Text Area */}
        <div>
          <textarea
            rows={isExpanded ? 3 : 2}
            onFocus={() => setIsExpanded(true)}
            placeholder="Log operational updates, rate agreements, driver instructions, detention alerts, or dispatch notes..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-slate-200 text-xs placeholder-slate-500 focus:outline-none focus:border-indigo-500 resize-none font-sans leading-relaxed"
          />
        </div>

        {/* Error Notice */}
        {error && (
          <div className="p-2 rounded-lg bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Success Notice */}
        {successNotice && (
          <div className="p-2 rounded-lg bg-emerald-950/40 border border-emerald-800/60 text-emerald-300 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
            <span>Activity logged successfully to append-only timeline!</span>
          </div>
        )}

        {/* Action Footer */}
        <div className="flex items-center justify-between pt-1">
          <span className="text-[10px] text-slate-500 hidden sm:inline">
            Press <kbd className="px-1 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400 font-mono">⌘/Ctrl+Enter</kbd> to submit
          </span>

          <div className="flex items-center gap-2 ml-auto">
            {isExpanded && (
              <button
                type="button"
                onClick={() => {
                  setTitle('');
                  setDescription('');
                  setContactName('');
                  setIsExpanded(false);
                  setError(null);
                }}
                className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
              >
                Clear
              </button>
            )}

            <button
              type="submit"
              disabled={isSubmitting || !description.trim()}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer disabled:cursor-not-allowed"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{isSubmitting ? 'Logging...' : 'Append Activity'}</span>
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
