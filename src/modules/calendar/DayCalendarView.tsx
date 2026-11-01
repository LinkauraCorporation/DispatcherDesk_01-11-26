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
  Building2,
  Phone,
  ArrowRight,
  CheckCircle2,
  ExternalLink,
} from 'lucide-react';

interface DayCalendarViewProps {
  currentDate: Date;
  events: OperationsCalendarEvent[];
  operationalTimezone: string;
  dispatcherTimezone: string;
  onSelectEvent: (event: OperationsCalendarEvent) => void;
}

export const DayCalendarView: React.FC<DayCalendarViewProps> = ({
  currentDate,
  events,
  operationalTimezone,
  dispatcherTimezone,
  onSelectEvent,
}) => {
  const currentDayStr = getLocalDateString(currentDate, operationalTimezone);
  const todayStr = getLocalDateString(new Date(), operationalTimezone);
  const isToday = currentDayStr === todayStr;

  // Filter events for this specific day
  const dayEvents = events.filter((ev) => {
    const evDate = new Date(ev.datetime);
    return getLocalDateString(evDate, operationalTimezone) === currentDayStr;
  });

  const hours = Array.from({ length: 24 }, (_, i) => i);

  return (
    <div className="bg-slate-900/70 border border-slate-800 rounded-xl overflow-hidden shadow-xs">
      {/* Day Top Summary Header */}
      <div className="p-4 border-b border-slate-800 bg-slate-950/60 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-white">
              {new Intl.DateTimeFormat('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
                year: 'numeric',
                timeZone: operationalTimezone,
              }).format(currentDate)}
            </h3>
            {isToday && (
              <span className="px-2 py-0.5 text-xs font-bold bg-indigo-500 text-white rounded-full uppercase tracking-wider">
                Today
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Operational Zone: <span className="text-slate-200 font-mono">{operationalTimezone}</span> &bull; Dispatcher Zone: <span className="text-slate-200 font-mono">{dispatcherTimezone}</span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-3 py-1 bg-slate-800 border border-slate-700 text-slate-200 rounded-lg text-xs font-semibold">
            {dayEvents.length} Scheduled Event{dayEvents.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Hourly Timeline */}
      <div className="divide-y divide-slate-800/60 max-h-[750px] overflow-y-auto">
        {hours.map((hour) => {
          const hourLabel = `${hour.toString().padStart(2, '0')}:00`;
          const hourEvents = dayEvents.filter((ev) => {
            const date = new Date(ev.datetime);
            // Convert to operational hour
            const evHour = parseInt(
              new Intl.DateTimeFormat('en-US', {
                hour: 'numeric',
                hour12: false,
                timeZone: operationalTimezone,
              }).format(date),
              10
            );
            return evHour === hour;
          });

          return (
            <div
              key={hour}
              className={`flex items-start min-h-[64px] transition-colors ${
                hourEvents.length > 0 ? 'bg-slate-900/30' : 'hover:bg-slate-900/20'
              }`}
            >
              {/* Hour Column */}
              <div className="w-20 sm:w-24 p-3 border-r border-slate-800/80 text-right shrink-0">
                <span className="text-xs font-mono font-bold text-slate-400">
                  {hourLabel}
                </span>
              </div>

              {/* Event slot column */}
              <div className="flex-1 p-2 space-y-2">
                {hourEvents.map((event) => {
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
                      className={`p-3 rounded-lg border transition-all hover:shadow-lg cursor-pointer ${
                        config.bgClass
                      } ${config.borderClass} ${
                        event.isOverdue ? 'ring-1 ring-rose-500/60' : ''
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        {/* Event Category Badge & Time */}
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2 py-0.5 text-xs font-bold rounded border uppercase tracking-wider ${config.badgeClass}`}
                          >
                            {config.label}
                          </span>
                          <span className="text-xs font-mono font-bold text-white">
                            {dualTime.primary}
                          </span>
                          <span className="text-[11px] font-mono text-slate-400">
                            ({dualTime.secondary})
                          </span>
                        </div>

                        {/* Financial or Priority Badge */}
                        <div className="flex items-center gap-2">
                          {event.rate ? (
                            <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-500/30">
                              {formatCurrency(event.rate)}
                            </span>
                          ) : null}
                          {event.isOverdue && (
                            <span className="flex items-center gap-1 px-2 py-0.5 text-xs font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40 rounded animate-pulse">
                              <AlertTriangle className="w-3 h-3" />
                              <span>Overdue</span>
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Main Content Details */}
                      {event.sourceType === 'load' && event.rawLoad ? (
                        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 pt-2 border-t border-slate-800/40 text-xs">
                          <div>
                            <span className="text-[10px] uppercase font-bold text-slate-400 block">
                              Load & Pipeline
                            </span>
                            <span className="font-bold text-white">
                              #{event.loadNumber}
                            </span>
                            <span className="text-slate-400 block text-[11px] capitalize">
                              {event.rawLoad.pipeline_status.replace(/_/g, ' ')}
                            </span>
                          </div>

                          <div>
                            <span className="text-[10px] uppercase font-bold text-slate-400 block">
                              Lane & Facility
                            </span>
                            <div className="flex items-center gap-1 text-slate-200 font-medium">
                              <MapPin className="w-3 h-3 text-indigo-400 shrink-0" />
                              <span>
                                {event.rawLoad.origin_city}, {event.rawLoad.origin_state} &rarr; {event.rawLoad.dest_city}, {event.rawLoad.dest_state}
                              </span>
                            </div>
                          </div>

                          <div>
                            <span className="text-[10px] uppercase font-bold text-slate-400 block">
                              Driver & Equipment
                            </span>
                            <span className="text-slate-200 font-medium block">
                              {event.driverName || 'Unassigned'}
                            </span>
                            <span className="text-slate-400 text-[11px]">
                              Truck #{event.truckUnit || '—'} &bull; {event.equipmentType || 'Dry Van'}
                            </span>
                          </div>

                          <div>
                            <span className="text-[10px] uppercase font-bold text-slate-400 block">
                              Broker / Customer
                            </span>
                            <span className="text-slate-200 font-medium block">
                              {event.brokerName || event.clientName || 'Direct'}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-2 pt-2 border-t border-slate-800/40 text-xs">
                          <p className="font-semibold text-slate-100">
                            {event.title}
                          </p>
                          {event.rawTask?.description && (
                            <p className="text-slate-400 text-[11px] mt-0.5">
                              {event.rawTask.description}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
