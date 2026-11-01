import React from 'react';
import {
  OperationsCalendarEvent,
  CALENDAR_EVENT_CONFIG,
} from './calendarTypes.ts';
import { getLocalDateString } from './calendarService.ts';
import { formatDualTime, formatInTimezone } from '../../lib/timezones.ts';
import { formatCurrency } from '../../lib/calculations.ts';
import {
  Clock,
  MapPin,
  Truck,
  User,
  AlertTriangle,
  Package,
  Calendar as CalendarIcon,
  ChevronRight,
  ArrowRight,
  ExternalLink,
} from 'lucide-react';

interface AgendaCalendarViewProps {
  events: OperationsCalendarEvent[];
  operationalTimezone: string;
  dispatcherTimezone: string;
  onSelectEvent: (event: OperationsCalendarEvent) => void;
}

export const AgendaCalendarView: React.FC<AgendaCalendarViewProps> = ({
  events,
  operationalTimezone,
  dispatcherTimezone,
  onSelectEvent,
}) => {
  const todayStr = getLocalDateString(new Date(), operationalTimezone);

  // Group events by date string
  const groupedEvents = React.useMemo(() => {
    const map = new Map<string, OperationsCalendarEvent[]>();

    events.forEach((ev) => {
      const evDate = new Date(ev.datetime);
      const dateKey = getLocalDateString(evDate, operationalTimezone);
      if (!map.has(dateKey)) {
        map.set(dateKey, []);
      }
      map.get(dateKey)!.push(ev);
    });

    // Sort group keys chronologically
    const sortedKeys = Array.from(map.keys()).sort();
    return sortedKeys.map((key) => ({
      dateKey: key,
      events: map.get(key)!,
    }));
  }, [events, operationalTimezone]);

  if (events.length === 0) {
    return (
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-12 text-center text-slate-400">
        <CalendarIcon className="w-10 h-10 mx-auto text-slate-600 mb-3" />
        <h4 className="text-sm font-bold text-slate-300">No scheduled operations match your filters</h4>
        <p className="text-xs text-slate-500 mt-1">
          Adjust your search terms or filter parameters above to view calendar events.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {groupedEvents.map(({ dateKey, events: dayEvents }) => {
        const isToday = dateKey === todayStr;
        const sampleDate = new Date(dayEvents[0].datetime);

        const dateHeader = new Intl.DateTimeFormat('en-US', {
          weekday: 'long',
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          timeZone: operationalTimezone,
        }).format(sampleDate);

        return (
          <div
            key={dateKey}
            className={`bg-slate-900/70 border rounded-xl overflow-hidden shadow-xs ${
              isToday ? 'border-indigo-500/40 ring-1 ring-indigo-500/20' : 'border-slate-800'
            }`}
          >
            {/* Group Header */}
            <div
              className={`px-4 py-2.5 border-b flex items-center justify-between ${
                isToday
                  ? 'bg-indigo-950/50 border-indigo-500/30'
                  : 'bg-slate-950/60 border-slate-800/80'
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`text-xs font-bold ${
                    isToday ? 'text-indigo-400' : 'text-slate-200'
                  }`}
                >
                  {dateHeader}
                </span>
                {isToday && (
                  <span className="px-2 py-0.5 text-[10px] font-bold bg-indigo-500 text-white rounded-full uppercase tracking-wider">
                    Today
                  </span>
                )}
              </div>

              <span className="text-xs font-medium text-slate-400">
                {dayEvents.length} Item{dayEvents.length !== 1 ? 's' : ''}
              </span>
            </div>

            {/* Event Items */}
            <div className="divide-y divide-slate-800/50">
              {dayEvents.map((event) => {
                const config = CALENDAR_EVENT_CONFIG[event.eventType];
                const dualTime = formatDualTime(
                  event.datetime,
                  operationalTimezone,
                  dispatcherTimezone
                );

                return (
                  <div
                    key={event.id}
                    onClick={() => onSelectEvent(event)}
                    className={`p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-800/40 cursor-pointer transition-colors ${
                      event.isOverdue ? 'bg-rose-950/10' : ''
                    }`}
                  >
                    {/* Left: Event Type, Time, Title */}
                    <div className="space-y-1.5 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`px-2 py-0.5 text-[10px] font-bold rounded border uppercase tracking-wider ${config.badgeClass}`}
                        >
                          {config.label}
                        </span>

                        <div className="flex items-center gap-1 text-xs font-mono font-bold text-white">
                          <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{dualTime.primary}</span>
                        </div>

                        <span className="text-xs font-mono text-slate-400 hidden md:inline">
                          ({dualTime.secondary})
                        </span>

                        {event.isOverdue && (
                          <span className="flex items-center gap-1 px-1.5 py-0.2 text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40 rounded animate-pulse">
                            <AlertTriangle className="w-3 h-3" />
                            <span>Overdue</span>
                          </span>
                        )}
                      </div>

                      {event.sourceType === 'load' ? (
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                          <span className="font-bold text-white">
                            Load #{event.loadNumber}
                          </span>
                          <div className="flex items-center gap-1 text-slate-300">
                            <MapPin className="w-3 h-3 text-indigo-400 shrink-0" />
                            <span>{event.origin}</span>
                            <ArrowRight className="w-2.5 h-2.5 text-slate-500" />
                            <span>{event.destination}</span>
                          </div>
                          {event.driverName && (
                            <span className="text-slate-400 text-[11px]">
                              Driver: <strong className="text-slate-300">{event.driverName}</strong>
                            </span>
                          )}
                          {event.truckUnit && (
                            <span className="text-slate-400 text-[11px]">
                              Unit #{event.truckUnit}
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className="text-xs text-slate-200 font-medium">
                          {event.title}
                          {event.loadNumber && (
                            <span className="ml-2 text-slate-400 font-mono text-[11px]">
                              (Load #{event.loadNumber})
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Right: Rate, Status, Action Button */}
                    <div className="flex items-center gap-3 self-end sm:self-center shrink-0">
                      {event.rate ? (
                        <span className="text-xs font-mono font-bold text-emerald-400">
                          {formatCurrency(event.rate)}
                        </span>
                      ) : null}

                      <button
                        type="button"
                        className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700/50 rounded-lg transition-colors"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};
