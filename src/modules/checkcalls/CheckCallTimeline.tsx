import React from 'react';
import { CheckCall, CHECK_CALL_TYPE_LABELS, CHECK_CALL_STATUS_BADGES, isOperationalException } from './checkCallTypes.ts';
import { useTimezone } from '../../contexts/TimezoneContext.tsx';
import { formatDualTime, formatInTimezone } from '../../lib/timezones.ts';
import {
  Radio,
  MapPin,
  Clock,
  Calendar,
  AlertTriangle,
  FileText,
  User,
  CheckCircle2,
  Trash2,
  Edit2,
  Truck,
  ArrowRight,
  ShieldAlert,
  Navigation,
} from 'lucide-react';

interface CheckCallTimelineProps {
  checkCalls: CheckCall[];
  canEdit?: boolean;
  onEdit?: (checkCall: CheckCall) => void;
  onDelete?: (checkCall: CheckCall) => void;
}

export const CheckCallTimeline: React.FC<CheckCallTimelineProps> = ({
  checkCalls,
  canEdit = false,
  onEdit,
  onDelete,
}) => {
  const { operationalTimezone, dispatcherTimezone } = useTimezone();

  if (!checkCalls || checkCalls.length === 0) {
    return (
      <div className="p-6 text-center rounded-xl bg-slate-950/40 border border-dashed border-slate-800 space-y-2">
        <Radio className="w-6 h-6 text-slate-600 mx-auto" />
        <h4 className="text-xs font-semibold text-slate-300">No Check Calls Recorded</h4>
        <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
          Log initial dispatch, driver en-route location updates, and delivery confirmations to maintain real-time operational visibility.
        </p>
      </div>
    );
  }

  const getCallTypeIcon = (callType: string) => {
    switch (callType) {
      case 'dispatch':
        return <Navigation className="w-3.5 h-3.5 text-indigo-400" />;
      case 'en_route_pickup':
      case 'en_route_delivery':
        return <Truck className="w-3.5 h-3.5 text-sky-400" />;
      case 'arrived_pickup':
      case 'arrived_delivery':
        return <MapPin className="w-3.5 h-3.5 text-teal-400" />;
      case 'loaded':
        return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />;
      case 'delivered':
        return <CheckCircle2 className="w-3.5 h-3.5 text-indigo-400" />;
      case 'delay':
        return <Clock className="w-3.5 h-3.5 text-amber-400" />;
      case 'breakdown':
        return <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />;
      default:
        return <Radio className="w-3.5 h-3.5 text-purple-400" />;
    }
  };

  return (
    <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-3 before:bottom-3 before:w-0.5 before:bg-slate-800">
      {checkCalls.map((item, idx) => {
        const isException = isOperationalException(item.call_type, item.status);
        const statusBadge = CHECK_CALL_STATUS_BADGES[item.status] || CHECK_CALL_STATUS_BADGES.on_time;
        const callTimestampDual = formatDualTime(item.created_at, operationalTimezone, dispatcherTimezone);
        const etaPickupFormatted = item.eta_pickup
          ? formatInTimezone(item.eta_pickup, operationalTimezone, { includeDate: true, includeTime: true })
          : null;
        const etaDeliveryFormatted = item.eta_delivery
          ? formatInTimezone(item.eta_delivery, operationalTimezone, { includeDate: true, includeTime: true })
          : null;

        return (
          <div key={item.id || idx} className="relative group text-xs text-slate-200">
            {/* Timeline node icon */}
            <div
              className={`absolute -left-6 top-1.5 w-5 h-5 rounded-full flex items-center justify-center border transition-transform duration-150 group-hover:scale-110 ${
                isException
                  ? 'bg-rose-950 border-rose-600 text-rose-300 ring-4 ring-rose-950/40'
                  : idx === 0
                  ? 'bg-indigo-950 border-indigo-500 text-indigo-300 ring-4 ring-indigo-950/40'
                  : 'bg-slate-900 border-slate-700 text-slate-400'
              }`}
            >
              {getCallTypeIcon(item.call_type)}
            </div>

            {/* Check Call Card */}
            <div
              className={`p-3.5 rounded-xl border transition-all ${
                isException
                  ? 'bg-rose-950/20 border-rose-900/60 shadow-sm'
                  : idx === 0
                  ? 'bg-slate-900/90 border-slate-800 shadow-sm'
                  : 'bg-slate-950/70 border-slate-800/80'
              }`}
            >
              {/* Card Header: Type, Status, Timestamp, Actions */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-800/60">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-slate-100 text-xs">
                    {CHECK_CALL_TYPE_LABELS[item.call_type] || item.call_type}
                  </span>

                  {/* Status Badge */}
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold border ${statusBadge.bg} ${statusBadge.text} ${statusBadge.border}`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${statusBadge.dot}`} />
                    {statusBadge.label}
                  </span>

                  {idx === 0 && (
                    <span className="text-[9px] uppercase px-1.5 py-0.2 rounded bg-indigo-950 text-indigo-300 border border-indigo-800/60 font-mono">
                      Latest Check-In
                    </span>
                  )}
                </div>

                {/* Right Header: Timestamps and Edit/Delete Actions */}
                <div className="flex items-center gap-2 self-start sm:self-auto">
                  <div className="text-[10px] text-slate-400 font-mono text-right">
                    <span>{callTimestampDual.primary}</span>
                    {callTimestampDual.secondary !== '—' && (
                      <span className="hidden sm:inline text-slate-500 ml-1">
                        ({callTimestampDual.secondary})
                      </span>
                    )}
                  </div>

                  {canEdit && (
                    <div className="flex items-center gap-1 pl-1 border-l border-slate-800">
                      {onEdit && (
                        <button
                          type="button"
                          onClick={() => onEdit(item)}
                          className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors cursor-pointer"
                          title="Edit Check Call"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                      )}
                      {onDelete && (
                        <button
                          type="button"
                          onClick={() => onDelete(item)}
                          className="p-1 text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 rounded transition-colors cursor-pointer"
                          title="Delete Check Call"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Exception Warning Banner if Delay or Breakdown */}
              {isException && (
                <div className="mt-2 p-2.5 rounded-lg bg-rose-950/40 border border-rose-800/50 flex items-start gap-2 text-rose-300">
                  <ShieldAlert className="w-4 h-4 text-rose-400 mt-0.5 shrink-0" />
                  <div className="text-[11px] leading-relaxed">
                    <strong className="font-semibold text-rose-200">Operational Exception: </strong>
                    {item.call_type === 'breakdown'
                      ? 'Mechanical or equipment malfunction logged for this load.'
                      : 'Transit delay or schedule variance logged.'}
                  </div>
                </div>
              )}

              {/* Middle Section: Location and ETAs */}
              <div className="mt-2.5 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                {/* Location Ping */}
                {(item.location_city || item.location_state) && (
                  <div className="flex items-center gap-1.5 text-slate-300">
                    <MapPin className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                    <span>
                      Location:{' '}
                      <strong className="text-slate-100 font-medium">
                        {item.location_city ? `${item.location_city}, ` : ''}
                        {item.location_state || ''}
                      </strong>
                    </span>
                  </div>
                )}

                {/* ETAs */}
                <div className="flex flex-col sm:items-end justify-center space-y-0.5 text-slate-400 font-mono text-[10px]">
                  {etaPickupFormatted && (
                    <div className="flex items-center gap-1">
                      <Clock className="w-2.5 h-2.5 text-emerald-400" />
                      <span>PU ETA: {etaPickupFormatted}</span>
                    </div>
                  )}
                  {etaDeliveryFormatted && (
                    <div className="flex items-center gap-1">
                      <Clock className="w-2.5 h-2.5 text-teal-400" />
                      <span>DEL ETA: {etaDeliveryFormatted}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Notes */}
              {item.notes && (
                <div className="mt-2.5 p-2.5 rounded-lg bg-slate-950/80 border border-slate-800/80 text-slate-300 text-xs leading-relaxed font-sans whitespace-pre-wrap">
                  {item.notes}
                </div>
              )}

              {/* Footer: Logged by */}
              <div className="mt-2 pt-2 border-t border-slate-800/40 flex items-center justify-between text-[10px] text-slate-400">
                <span className="flex items-center gap-1">
                  <User className="w-3 h-3 text-slate-500" />
                  <span>Logged by: <strong className="text-slate-300 font-medium">{item.created_by || 'Dispatcher'}</strong></span>
                </span>
                <span className="font-mono text-slate-400">
                  {formatInTimezone(item.created_at, operationalTimezone, {
                    includeDate: false,
                    includeTime: true,
                    includeTimezoneCode: true,
                  })}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
