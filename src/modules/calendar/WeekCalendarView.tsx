import React from 'react';
import {
  OperationsCalendarEvent,
  CALENDAR_EVENT_CONFIG,
} from './calendarTypes.ts';
import { getDaysInWeek, getLocalDateString } from './calendarService.ts';
import { formatDualTime, formatInTimezone } from '../../lib/timezones.ts';
import { formatCurrency } from '../../lib/calculations.ts';
import {
  MapPin,
  Clock,
  Truck,
  User,
  AlertTriangle,
  CheckCircle2,
  Package,
  Calendar as CalendarIcon,
  ChevronRight,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';

interface WeekCalendarViewProps {
  currentDate: Date;
  events: OperationsCalendarEvent[];
  operationalTimezone: string;
  dispatcherTimezone: string;
  onSelectEvent: (event: OperationsCalendarEvent) => void;
  onQuickBookLoadForDay?: (date: Date) => void;
}

export const WeekCalendarView: React.FC<WeekCalendarViewProps> = ({
  currentDate,
  events,
  operationalTimezone,
  dispatcherTimezone,
  onSelectEvent,
}) => {
  const days = getDaysInWeek(currentDate, false); // Sunday to Saturday
  const todayStr = getLocalDateString(new Date(), operationalTimezone);

  // Group events by local date string YYYY-MM-DD
  const eventsByDay = React.useMemo(() => {
    const map = new Map<string, OperationsCalendarEvent[]>();
    days.forEach((d) => {
      const dStr = getLocalDateString(d, operationalTimezone);
      map.set(dStr, []);
    });

    events.forEach((ev) => {
      const evDateStr = getLocalDateString(ev.datetime, operationalTimezone);
      if (map.has(evDateStr)) {
        map.get(evDateStr)!.push(ev);
      }
    });

    return map;
  }, [days, events, operationalTimezone]);

  return (
    <div className="overflow-x-auto pb-2">
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2.5 min-h-[620px] lg:min-w-[1050px]">
        {days.map((day) => {
          const dayStr = getLocalDateString(day, operationalTimezone);
          const dayEvents = eventsByDay.get(dayStr) || [];
          const isToday = dayStr === todayStr;
          const dayName = new Intl.DateTimeFormat('en-US', {
            weekday: 'short',
            timeZone: operationalTimezone,
          }).format(day);
          const dayMonth = new Intl.DateTimeFormat('en-US', {
            month: 'short',
            day: 'numeric',
            timeZone: operationalTimezone,
          }).format(day);

          const overdueCount = dayEvents.filter((e) => e.isOverdue).length;

          return (
            <div
              key={dayStr}
              className={`flex flex-col rounded-xl border transition-all lg:min-w-[145px] ${
                isToday
                  ? 'bg-slate-900/90 border-indigo-500/50 shadow-md shadow-indigo-950/40 ring-1 ring-indigo-500/30'
                  : 'bg-slate-900/40 border-slate-800/80 hover:border-slate-700/80'
              }`}
            >
              {/* Day Header */}
              <div
                className={`p-2.5 border-b flex items-center justify-between ${
                  isToday
                    ? 'bg-indigo-950/40 border-indigo-500/30'
                    : 'bg-slate-950/40 border-slate-800/60'
                }`}
              >
                <div>
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`text-xs font-bold uppercase tracking-wider ${
                        isToday ? 'text-indigo-400' : 'text-slate-400'
                      }`}
                    >
                      {dayName}
                    </span>
                    {isToday && (
                      <span className="px-1.5 py-0.2 text-[9px] font-bold bg-indigo-500 text-white rounded-sm uppercase tracking-tight">
                        Today
                      </span>
                    )}
                  </div>
                  <span className="text-xs font-semibold text-slate-200">
                    {dayMonth}
                  </span>
                </div>

                {/* Event count badge */}
                <div className="flex items-center gap-1">
                  {overdueCount > 0 && (
                    <span
                      title={`${overdueCount} overdue item(s)`}
                      className="flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30 rounded-md animate-pulse"
                    >
                      <AlertTriangle className="w-2.5 h-2.5" />
                      <span>{overdueCount}</span>
                    </span>
                  )}
                  <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-slate-800 text-slate-300 rounded-md">
                    {dayEvents.length}
                  </span>
                </div>
              </div>

              {/* Event List Container */}
              <div className="p-2 space-y-2 flex-1 overflow-y-auto max-h-[700px]">
                {dayEvents.length === 0 ? (
                  <div className="py-8 text-center text-[11px] text-slate-600">
                    <span>No scheduled items</span>
                  </div>
                ) : (
                  dayEvents.map((event) => {
                    const config = CALENDAR_EVENT_CONFIG[event.eventType];
                    const timeFormatted = formatInTimezone(
                      event.datetime,
                      operationalTimezone,
                      { includeDate: false, includeTime: true, includeTimezoneCode: true }
                    );
                    const dualTime = formatDualTime(
                      event.datetime,
                      operationalTimezone,
                      dispatcherTimezone
                    );

                    return (
                      <div
                        key={event.id}
                        onClick={() => onSelectEvent(event)}
                        title={`Operational: ${dualTime.primary}\nDispatcher: ${dualTime.secondary}`}
                        className={`p-2.5 rounded-lg border text-xs cursor-pointer transition-all hover:scale-[1.01] hover:shadow-md ${config.bgClass} ${config.borderClass} ${
                          event.isOverdue
                            ? 'border-rose-500/60 ring-1 ring-rose-500/30 bg-rose-950/20'
                            : ''
                        }`}
                      >
                        {/* Top status & timing pill */}
                        <div className="flex items-center justify-between gap-1 flex-wrap mb-1.5">
                          <span
                            className={`text-[10px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wider shrink-0 ${config.badgeClass}`}
                          >
                            {config.shortLabel}
                          </span>

                          <div className="flex items-center gap-1 text-[10px] sm:text-[11px] font-semibold text-slate-300 shrink-0">
                            <Clock className="w-3 h-3 text-slate-400 shrink-0" />
                            <span className="whitespace-nowrap">{timeFormatted}</span>
                          </div>
                        </div>

                        {/* Event Title / Load Reference */}
                        {event.sourceType === 'load' ? (
                          <div className="space-y-1">
                            <div className="flex items-center justify-between gap-1.5 min-w-0">
                              <span
                                className="font-bold text-white text-[12px] tracking-tight truncate min-w-0"
                                title={`#${event.loadNumber}`}
                              >
                                #{event.loadNumber}
                              </span>
                              {event.rate ? (
                                <span className="text-[11px] font-mono font-bold text-emerald-400 shrink-0">
                                  {formatCurrency(event.rate)}
                                </span>
                              ) : null}
                            </div>

                            {/* Lane summary */}
                            <div className="flex items-center gap-1 text-[11px] text-slate-300 font-medium truncate">
                              <MapPin className="w-3 h-3 text-indigo-400 shrink-0" />
                              <span className="truncate">
                                {event.eventType === 'pickup' ? event.origin : event.destination}
                              </span>
                            </div>

                            {/* Driver / Truck assignment */}
                            {(event.driverName || event.truckUnit) && (
                              <div className="flex items-center justify-between gap-1 text-[10px] text-slate-400 pt-1 border-t border-slate-800/40 min-w-0">
                                <span
                                  className="truncate font-medium min-w-0"
                                  title={event.driverName || 'Unassigned Driver'}
                                >
                                  {event.driverName || 'Unassigned Driver'}
                                </span>
                                {event.truckUnit && (
                                  <span className="font-mono text-slate-300 shrink-0">
                                    #{event.truckUnit}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <p className="font-medium text-slate-100 line-clamp-2 text-[11px]">
                              {event.title.replace(/^Task:\s*/, '')}
                            </p>
                            {event.loadNumber && (
                              <div className="flex items-center gap-1 text-[10px] text-slate-400">
                                <Package className="w-2.5 h-2.5 text-indigo-400" />
                                <span>Load #{event.loadNumber}</span>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Overdue alert banner inside card */}
                        {event.isOverdue && (
                          <div className="mt-1.5 flex items-center gap-1 px-1.5 py-0.5 bg-rose-950/80 text-rose-100 border border-rose-500/50 rounded text-[10px] font-bold min-w-0">
                            <AlertTriangle className="w-3 h-3 shrink-0 text-rose-200" />
                            <span className="truncate min-w-0">Action Overdue</span>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
