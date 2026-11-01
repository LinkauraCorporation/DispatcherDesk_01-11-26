import React from 'react';
import { MapStopPoint } from '../mapTypes.ts';
import { CHECK_CALL_TYPE_SHORT_LABELS, CHECK_CALL_STATUS_BADGES, isOperationalException, formatTimeSince } from '../../checkcalls/checkCallTypes.ts';
import { formatInTimezone, DEFAULT_OPERATIONAL_TIMEZONE } from '../../../lib/timezones.ts';
import { MapPin, Navigation, Clock, Building2, UserCheck, Radio, AlertTriangle } from 'lucide-react';

/**
 * Generates clean HTML string for Leaflet DivIcon representation.
 */
export function createStopMarkerIconHtml(stop: MapStopPoint, isSelected: boolean): string {
  const isPickup = stop.type === 'pickup';
  const isDelivery = stop.type === 'delivery';
  const isCheckCall = stop.type === 'checkcall';

  if (isCheckCall) {
    const isException = stop.checkCall && isOperationalException(stop.checkCall.call_type, stop.checkCall.status);
    const bgClass = isException ? 'bg-rose-600' : 'bg-amber-500';
    const ringClass = isSelected ? 'ring-4 ring-amber-300 shadow-xl' : 'ring-2 ring-slate-900 shadow-md';
    const label = stop.checkCall ? CHECK_CALL_TYPE_SHORT_LABELS[stop.checkCall.call_type] || 'Check-In' : 'Check-In';

    return `
      <div class="group relative cursor-pointer flex flex-col items-center select-none" style="transform: translate(-50%, -100%);">
        <div class="flex items-center gap-1.5 px-2 py-0.5 rounded-full ${bgClass} text-slate-950 font-bold text-[11px] shadow-lg ${ringClass} transition-transform group-hover:scale-110">
          <svg class="w-3 h-3 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          <span>${label}</span>
        </div>
        <div class="w-0.5 h-2 ${bgClass}"></div>
        <div class="w-1.5 h-1.5 rounded-full ${bgClass}"></div>
      </div>
    `;
  }

  if (isPickup) {
    const bgClass = 'bg-emerald-600';
    const borderClass = isSelected ? 'ring-4 ring-emerald-400/90 shadow-xl scale-110' : 'ring-2 ring-slate-950 shadow-md';
    return `
      <div class="group relative cursor-pointer flex flex-col items-center select-none" style="transform: translate(-50%, -100%);">
        <div class="flex items-center gap-1.5 px-2 py-0.5 rounded-full ${bgClass} text-white font-bold text-[11px] ${borderClass} transition-transform group-hover:scale-110">
          <span class="w-4 h-4 rounded-full bg-emerald-950/80 text-emerald-300 flex items-center justify-center text-[10px] font-mono">1</span>
          <span class="tracking-tight uppercase">PU: ${stop.city}</span>
        </div>
        <div class="w-0.5 h-2 bg-emerald-500"></div>
        <div class="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
      </div>
    `;
  }

  if (isDelivery) {
    const bgClass = 'bg-indigo-600';
    const borderClass = isSelected ? 'ring-4 ring-indigo-400/90 shadow-xl scale-110' : 'ring-2 ring-slate-950 shadow-md';
    return `
      <div class="group relative cursor-pointer flex flex-col items-center select-none" style="transform: translate(-50%, -100%);">
        <div class="flex items-center gap-1.5 px-2 py-0.5 rounded-full ${bgClass} text-white font-bold text-[11px] ${borderClass} transition-transform group-hover:scale-110">
          <span class="w-4 h-4 rounded-full bg-indigo-950/80 text-indigo-300 flex items-center justify-center text-[10px] font-mono">${stop.sequenceNumber}</span>
          <span class="tracking-tight uppercase">DEL: ${stop.city}</span>
        </div>
        <div class="w-0.5 h-2 bg-indigo-500"></div>
        <div class="w-1.5 h-1.5 rounded-full bg-indigo-500"></div>
      </div>
    `;
  }

  // Intermediate Stop
  return `
    <div class="group relative cursor-pointer flex flex-col items-center select-none" style="transform: translate(-50%, -100%);">
      <div class="flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-700 text-white font-semibold text-[10px] shadow-sm">
        <span>#${stop.sequenceNumber}</span>
        <span>${stop.city}</span>
      </div>
      <div class="w-0.5 h-2 bg-slate-600"></div>
    </div>
  `;
}

/**
 * Formats the popup content for a stop or checkcall pin.
 */
export function createStopPopupHtml(stop: MapStopPoint, loadNumber: string): string {
  const isCheckCall = stop.type === 'checkcall';

  if (isCheckCall && stop.checkCall) {
    const checkCall = stop.checkCall;
    const timeAgo = formatTimeSince(checkCall.created_at);
    const locText = checkCall.location_city && checkCall.location_state 
      ? `${checkCall.location_city}, ${checkCall.location_state}` 
      : stop.locationName;
    const callLabel = CHECK_CALL_TYPE_SHORT_LABELS[checkCall.call_type] || 'Status Update';
    const statusBadge =
      CHECK_CALL_STATUS_BADGES[checkCall.status] ||
      CHECK_CALL_STATUS_BADGES.on_time;
    const precisionLabel =
      stop.precision === 'exact'
        ? 'Exact GPS Fix'
        : stop.precision === 'city'
        ? 'City Centroid'
        : 'State/other fallback';

    return `
      <div class="p-3 min-w-[240px] max-w-[280px] text-slate-100 font-sans text-xs">
        <div class="flex items-center justify-between gap-2 pb-2 border-b border-slate-700">
          <div class="flex items-center gap-1.5">
            <span class="w-2 h-2 rounded-full bg-amber-400"></span>
            <span class="font-bold text-amber-300">Last Reported Location</span>
          </div>
          <span class="font-mono text-[10px] text-slate-400">${loadNumber}</span>
        </div>

        <div class="py-2 space-y-1.5">
          <div class="text-sm font-semibold text-slate-200">
            ${locText}
          </div>
          <div class="text-[10px] text-slate-400">
            GPS: <span class="font-mono text-slate-300">${stop.lat.toFixed(4)}, ${stop.lng.toFixed(4)}</span>
            <span class="text-slate-500">(${precisionLabel})</span>
          </div>
          <div class="flex items-center justify-between text-[11px] text-slate-300">
            <span class="text-slate-400">Status:</span>
            <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border ${statusBadge.bg} ${statusBadge.text} ${statusBadge.border}">
              <span class="w-1.5 h-1.5 rounded-full ${statusBadge.dot}"></span>
              <span>${statusBadge.label}</span>
            </span>
          </div>
          <div class="flex items-center justify-between text-[11px] text-slate-300">
            <span class="text-slate-400">Call Type:</span>
            <span class="font-medium text-amber-300">${callLabel}</span>
          </div>
          <div class="flex items-center justify-between text-[11px] text-slate-300">
            <span class="text-slate-400">Recorded:</span>
            <span>${timeAgo}</span>
          </div>
          ${
            checkCall.notes
              ? `<div class="p-1.5 bg-slate-800/90 rounded border border-slate-700/60 text-[10px] text-slate-300 italic max-h-16 overflow-y-auto">
                  "${escapeHtml(checkCall.notes)}"
                </div>`
              : ''
          }
        </div>

        <div class="pt-2 border-t border-slate-800 flex items-center justify-between">
          <span class="text-[9px] text-slate-400">Dispatcher Log</span>
          <button 
            data-load-id="${stop.loadId}"
            class="map-view-load-btn cursor-pointer font-semibold text-indigo-400 hover:text-indigo-300 text-[11px] inline-flex items-center gap-1"
          >
            Open Load →
          </button>
        </div>
      </div>
    `;
  }

  // Pickup or Delivery Stop
  const stopTypeLabel = stop.type === 'pickup' ? 'Stop 1: Origin Pickup' : `Stop ${stop.sequenceNumber}: Final Delivery`;
  const timeFormatted = stop.scheduledTime
    ? formatInTimezone(stop.scheduledTime, DEFAULT_OPERATIONAL_TIMEZONE, {
        includeDate: true,
        includeTime: true,
        includeTimezoneCode: true,
      })
    : 'Scheduled dock window';

  return `
    <div class="p-3 min-w-[240px] max-w-[280px] text-slate-100 font-sans text-xs">
      <div class="flex items-center justify-between gap-2 pb-2 border-b border-slate-700">
        <span class="font-bold ${stop.type === 'pickup' ? 'text-emerald-400' : 'text-indigo-400'}">
          ${stopTypeLabel}
        </span>
        <span class="font-mono text-[10px] text-slate-400">${loadNumber}</span>
      </div>

      <div class="py-2 space-y-1.5">
        <div class="text-sm font-semibold text-slate-200">
          ${stop.locationName}
        </div>
        <div class="flex items-center justify-between text-[11px] text-slate-300">
          <span class="text-slate-400">Schedule:</span>
          <span>${timeFormatted}</span>
        </div>
        <div class="text-[10px] text-slate-400 italic">
          Location: ${stop.precision === 'city' ? 'City Centroid Reference' : 'State / Region Centroid'}
        </div>
      </div>

      <div class="pt-2 border-t border-slate-800 flex items-center justify-between">
        <span class="text-[9px] text-slate-400">Sequence #${stop.sequenceNumber}</span>
        <button 
          data-load-id="${stop.loadId}"
          class="map-view-load-btn cursor-pointer font-semibold text-indigo-400 hover:text-indigo-300 text-[11px] inline-flex items-center gap-1"
        >
          Open Load →
        </button>
      </div>
    </div>
  `;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Visual Stop Badge for UI Cards
 */
export const MapStopBadge: React.FC<{
  sequence: number;
  type: 'pickup' | 'delivery' | 'checkcall';
  city: string;
  state: string;
}> = ({ sequence, type, city, state }) => {
  if (type === 'pickup') {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-950/80 border border-emerald-800/60 text-emerald-300 text-[11px] font-medium">
        <span className="w-3.5 h-3.5 rounded-full bg-emerald-800 flex items-center justify-center text-[9px] font-bold text-white">
          {sequence}
        </span>
        <span>PU: {city}, {state}</span>
      </span>
    );
  }
  if (type === 'delivery') {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-indigo-950/80 border border-indigo-800/60 text-indigo-300 text-[11px] font-medium">
        <span className="w-3.5 h-3.5 rounded-full bg-indigo-800 flex items-center justify-center text-[9px] font-bold text-white">
          {sequence}
        </span>
        <span>DEL: {city}, {state}</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-950/80 border border-amber-800/60 text-amber-300 text-[11px] font-medium">
      <Radio className="w-3 h-3 text-amber-400 animate-pulse" />
      <span>Last reported: {city}, {state}</span>
    </span>
  );
};
