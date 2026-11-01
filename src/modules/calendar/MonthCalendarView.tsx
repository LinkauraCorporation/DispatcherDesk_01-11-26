import React, { useState } from 'react';
import {
  OperationsCalendarEvent,
  CALENDAR_EVENT_CONFIG,
} from './calendarTypes.ts';
import { getDaysInMonthGrid, getLocalDateString } from './calendarService.ts';
import { formatDualTime, formatInTimezone } from '../../lib/timezones.ts';
import {
  Clock,
  AlertTriangle,
  MapPin,
  Package,
  Calendar as CalendarIcon,
  ChevronRight,
} from 'lucide-react';

interface MonthCalendarViewProps {
  currentDate: Date;
  events: OperationsCalendarEvent[];
  operationalTimezone: string;
  dispatcherTimezone: string;
  onSelectEvent: (event: OperationsCalendarEvent) => void;
  onDayClick?: (date: Date) => void;
}

export const MonthCalendarView: React.FC<MonthCalendarViewProps> = ({
  currentDate,
  events,
  operationalTimezone,
  dispatcherTimezone,
  onSelectEvent,
  onDayClick,
}) => {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const gridCells = getDaysInMonthGrid(year, month);
  const todayStr = getLocalDateString(new Date(), operationalTimezone);

  // Group events by YYYY-MM-DD
  const eventsByDay = React.useMemo(() => {
    const map = new Map<string, OperationsCalendarEvent[]>();

    events.forEach((ev) => {
      const evDate = new Date(ev.datetime);
      const evDateStr = getLocalDateString(evDate, operationalTimezone);
      if (!map.has(evDateStr)) {
        map.set(evDateStr, []);
      }
      map.get(evDateStr)!.push(ev);
    });

    return map;
  }, [events, operationalTimezone]);

  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden shadow-xs">
      {/* Weekday Headers */}
      <div className="grid grid-cols-7 border-b border-slate-800 bg-slate-950/80 text-center py-2">
        {weekdays.map((day, idx) => (
          <span
            key={day}
            className={`text-[11px] font-bold uppercase tracking-wider ${
              idx === 0 || idx === 6 ? 'text-slate-500' : 'text-slate-400'
            }`}
          >
            {day}
          </span>
        ))}
      </div>

      {/* Days Grid */}
      <div className="grid grid-cols-7 auto-rows-fr divide-x divide-y divide-slate-800/60 bg-slate-950/30 min-h-[640px]">
        {gridCells.map(({ date, isCurrentMonth }, cellIdx) => {
          const dateStr = getLocalDateString(date, operationalTimezone);
          const dayEvents = eventsByDay.get(dateStr) || [];
          const isToday = dateStr === todayStr;
          const dayNum = date.getDate();
          const overdueCount = dayEvents.filter((e) => e.isOverdue).length;

          // Limit displayed events per cell
          const MAX_DISPLAY = 3;
          const visibleEvents = dayEvents.slice(0, MAX_DISPLAY);
          const hiddenCount = dayEvents.length - MAX_DISPLAY;

          return (
            <div
              key={cellIdx}
              onClick={() => onDayClick && onDayClick(date)}
              className={`p-1.5 min-h-[110px] flex flex-col transition-colors ${
                isCurrentMonth ? 'bg-slate-900/40' : 'bg-slate-950/70 opacity-40'
              } ${isToday ? 'bg-indigo-950/20 ring-1 ring-inset ring-indigo-500/40' : 'hover:bg-slate-900/80'}`}
            >
              {/* Day cell top bar */}
              <div className="flex items-center justify-between mb-1">
                <span
                  className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full ${
                    isToday
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : isCurrentMonth
                      ? 'text-slate-200'
                      : 'text-slate-500'
                  }`}
                >
                  {dayNum}
                </span>

                <div className="flex items-center gap-1">
                  {overdueCount > 0 && (
                    <span
                      title={`${overdueCount} overdue item(s)`}
                      className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"
                    />
                  )}
                  {dayEvents.length > 0 && (
                    <span className="text-[10px] font-semibold text-slate-500">
                      {dayEvents.length}
                    </span>
                  )}
                </div>
              </div>

              {/* Event Chips */}
              <div className="space-y-1 flex-1 overflow-hidden">
                {visibleEvents.map((event) => {
                  const config = CALENDAR_EVENT_CONFIG[event.eventType];
                  const timeFormatted = formatInTimezone(
                    event.datetime,
                    operationalTimezone,
                    { includeDate: false, includeTime: true, includeTimezoneCode: false }
                  );
                  const dual = formatDualTime(event.datetime, operationalTimezone, dispatcherTimezone);

                  return (
                    <button
                      key={event.id}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectEvent(event);
                      }}
                      title={`${event.title}\nOps: ${dual.primary}\nLocal: ${dual.secondary}`}
                      className={`w-full text-left px-1.5 py-0.5 rounded text-[10px] font-medium truncate flex items-center gap-1 border transition-all hover:scale-[1.02] cursor-pointer ${
                        config.bgClass
                      } ${config.borderClass} ${config.colorClass} ${
                        event.isOverdue ? 'ring-1 ring-rose-500/60 font-bold' : ''
                      }`}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-current shrink-0" />
                      <span className="truncate">
                        {event.loadNumber ? `#${event.loadNumber}` : event.title.replace(/^Task:\s*/, '')}
                      </span>
                      <span className="text-[9px] opacity-75 shrink-0 ml-auto font-mono">
                        {timeFormatted}
                      </span>
                    </button>
                  );
                })}

                {hiddenCount > 0 && (
                  <div className="text-[10px] font-semibold text-slate-400 pl-1 hover:text-indigo-400 cursor-pointer">
                    +{hiddenCount} more
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
