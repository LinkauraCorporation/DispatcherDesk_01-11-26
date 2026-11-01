import React from 'react';
import {
  CheckCallWithRelations,
  CHECK_CALL_TYPE_LABELS,
  CHECK_CALL_STATUS_BADGES,
  isOperationalException,
  isDeliveryEtaDelayed,
} from './checkCallTypes.ts';
import { useTimezone } from '../../contexts/TimezoneContext.tsx';
import { formatDualTime } from '../../lib/timezones.ts';
import {
  Radio,
  MapPin,
  Clock,
  Truck,
  Building2,
  User,
  ShieldAlert,
  Edit2,
  Trash2,
  Eye,
  Calendar,
  Bell,
  CheckSquare,
} from 'lucide-react';

interface CheckCallListProps {
  checkCalls: CheckCallWithRelations[];
  canEdit?: boolean;
  onViewLoad?: (loadId: string) => void;
  onEdit?: (checkCall: CheckCallWithRelations) => void;
  onDelete?: (checkCall: CheckCallWithRelations) => void;
  onCreateTask?: (checkCall: CheckCallWithRelations) => void;
}

export const CheckCallList: React.FC<CheckCallListProps> = ({
  checkCalls,
  canEdit = false,
  onViewLoad,
  onEdit,
  onDelete,
  onCreateTask,
}) => {
  const { operationalTimezone, dispatcherTimezone } = useTimezone();

  if (checkCalls.length === 0) {
    return (
      <div className="p-8 text-center rounded-xl bg-slate-900 border border-slate-800 space-y-3">
        <Radio className="w-8 h-8 text-slate-600 mx-auto" />
        <h3 className="text-sm font-semibold text-slate-200">No Check Calls Match Query</h3>
        <p className="text-xs text-slate-400 max-w-md mx-auto">
          Adjust your filters or record a new check call for active dispatches in transit.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {checkCalls.map((call) => {
        const isEtaLate = isDeliveryEtaDelayed(
          call.load?.delivery_datetime,
          call.eta_delivery
        );

        const effectiveStatus =
          isEtaLate && call.status === 'on_time'
            ? 'delayed'
            : call.status;

        const isException = isOperationalException(
          call.call_type,
          call.status,
          call.load?.delivery_datetime,
          call.eta_delivery
        );

        const statusBadge =
          CHECK_CALL_STATUS_BADGES[effectiveStatus] ||
          CHECK_CALL_STATUS_BADGES.on_time;
        const callTimeDual = formatDualTime(call.created_at, operationalTimezone, dispatcherTimezone);

        return (
          <div
            key={call.id}
            className={`p-4 rounded-xl border transition-all ${
              isException
                ? 'bg-rose-950/20 border-rose-900/60 hover:border-rose-800'
                : 'bg-slate-900/90 border-slate-800 hover:border-slate-700'
            }`}
          >
            {/* Header: Load #, Call Type, Status, Timestamp */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-slate-800/80">
              <div className="flex items-center gap-2.5 flex-wrap">
                {call.load && (
                  <button
                    type="button"
                    onClick={() => onViewLoad?.(call.load_id)}
                    className="font-mono font-bold text-sky-400 hover:text-sky-300 text-xs flex items-center gap-1 cursor-pointer"
                  >
                    <span>{call.load.load_number}</span>
                  </button>
                )}

                <span className="font-semibold text-slate-200 text-xs">
                  {CHECK_CALL_TYPE_LABELS[call.call_type] || call.call_type}
                </span>

                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold border ${statusBadge.bg} ${statusBadge.text} ${statusBadge.border}`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${statusBadge.dot}`} />
                  {statusBadge.label}
                </span>

                {isException && (
                  <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-800/60 font-mono font-semibold">
                    <ShieldAlert className="w-3 h-3 text-rose-400" />
                    EXCEPTION
                  </span>
                )}
              </div>

              {/* Timestamp & Actions */}
              <div className="flex items-center gap-3 self-start sm:self-auto">
                <div className="text-[11px] text-slate-400 font-mono text-right">
                  <span>{callTimeDual.primary}</span>
                  {callTimeDual.secondary !== '—' && (
                    <span className="hidden md:inline text-slate-500 ml-1">
                      ({callTimeDual.secondary})
                    </span>
                  )}
                </div>

                {canEdit && (
                  <div className="flex items-center gap-1">
                    {onEdit && (
                      <button
                        type="button"
                        onClick={() => onEdit(call)}
                        className="p-1.5 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
                        title="Edit Check Call"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {onDelete && (
                      <button
                        type="button"
                        onClick={() => onDelete(call)}
                        className="p-1.5 rounded text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 transition-colors cursor-pointer"
                        title="Delete Check Call"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Middle Grid: Location, Load Lane & Roster */}
            <div className="py-2.5 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              {/* Location ping */}
              <div className="space-y-1">
                <span className="text-[10px] uppercase font-semibold text-slate-400">Location Ping</span>
                <div className="flex items-center gap-1.5 text-slate-200 font-medium">
                  <MapPin className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                  <span>
                    {call.location_city && call.location_state
                      ? `${call.location_city}, ${call.location_state}`
                      : 'No GPS City Logged'}
                  </span>
                </div>
              </div>

              {/* Load Route */}
              {call.load && (
                <div className="space-y-1">
                  <span className="text-[10px] uppercase font-semibold text-slate-400">Load Route</span>
                  <div className="text-slate-300 font-medium truncate">
                    {call.load.origin_city}, {call.load.origin_state} &rarr; {call.load.dest_city}, {call.load.dest_state}
                  </div>
                </div>
              )}

              {/* Truck & Driver */}
              {call.load && (
                <div className="space-y-1">
                  <span className="text-[10px] uppercase font-semibold text-slate-400">Assigned Roster</span>
                  <div className="flex items-center gap-2 text-slate-300 truncate">
                    <span className="font-mono text-purple-300">
                      {call.load.truck ? `Unit #${call.load.truck.truck_number}` : 'No Unit'}
                    </span>
                    <span className="text-slate-600">•</span>
                    <span className="truncate">{call.load.driver?.full_name || 'No Driver'}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Notes Section */}
            {call.notes && (
              <div className="mt-1 p-2.5 rounded-lg bg-slate-950/80 border border-slate-800/80 text-xs text-slate-300 leading-relaxed font-sans whitespace-pre-wrap">
                {call.notes}
              </div>
            )}

            {/* Footer: Logged By & Details & Task Creation */}
            <div className="mt-2 pt-2 border-t border-slate-800/40 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] text-slate-400">
              <span className="flex items-center gap-1">
                <User className="w-3 h-3 text-slate-500" />
                <span>Logged by: <strong className="text-slate-300 font-medium">{call.created_by}</strong></span>
              </span>

              <div className="flex items-center gap-2">
                {canEdit && onCreateTask && (
                  <button
                    type="button"
                    onClick={() => onCreateTask(call)}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-semibold transition-colors cursor-pointer border ${
                      isException
                        ? 'bg-rose-950/80 hover:bg-rose-900 text-rose-200 border-rose-800/60'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                    }`}
                    title={isException ? 'Create urgent mitigation task for this exception' : 'Create operational follow-up task'}
                  >
                    <Bell className="w-3 h-3 text-amber-400" />
                    <span>{isException ? 'Create Exception Task' : 'Follow-up Task'}</span>
                  </button>
                )}

                {call.load && (
                  <button
                    type="button"
                    onClick={() => onViewLoad?.(call.load_id)}
                    className="text-indigo-400 hover:text-indigo-300 font-semibold text-[11px] flex items-center gap-1 cursor-pointer"
                  >
                    <Eye className="w-3 h-3" />
                    <span>Open Load Details</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
