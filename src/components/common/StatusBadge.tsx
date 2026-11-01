import React from 'react';
import {
  PipelineStatus,
  DocumentStatus,
  TruckStatus,
  DriverStatus,
  CreditStatus,
  UserRole,
} from '../../types/domain.types.ts';

interface StatusBadgeProps {
  status: PipelineStatus | DocumentStatus | TruckStatus | DriverStatus | CreditStatus | UserRole | string;
  type?: 'pipeline' | 'document' | 'truck' | 'driver' | 'credit' | 'role' | 'status' | 'profitability';
  size?: 'sm' | 'md';
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, type = 'pipeline', size = 'md' }) => {
  const sizeClasses =
    size === 'sm'
      ? 'px-2 py-0.5 text-[11px] font-medium leading-none'
      : 'px-2.5 py-1 text-xs font-semibold leading-tight';

  let colorClasses = 'bg-slate-800/80 text-slate-300 border-slate-700/80';
  let dotColor = 'bg-slate-400';
  let label = status ? status.replace(/_/g, ' ') : '';

  if (type === 'credit') {
    switch (status as CreditStatus) {
      case 'approved':
        colorClasses = 'bg-emerald-950/70 text-emerald-300 border-emerald-700/50';
        dotColor = 'bg-emerald-400';
        label = 'Approved';
        break;
      case 'caution':
        colorClasses = 'bg-amber-950/70 text-amber-300 border-amber-700/50';
        dotColor = 'bg-amber-400';
        label = 'Caution';
        break;
      case 'factoring_only':
        colorClasses = 'bg-sky-950/70 text-sky-300 border-sky-700/50';
        dotColor = 'bg-sky-400';
        label = 'Factoring Only';
        break;
      case 'blocked':
        colorClasses = 'bg-rose-950/80 text-rose-300 border-rose-700/60';
        dotColor = 'bg-rose-400';
        label = 'Blocked / DNU';
        break;
    }
  } else if (type === 'status') {
    if (status === 'active') {
      colorClasses = 'bg-emerald-950/70 text-emerald-300 border-emerald-700/50';
      dotColor = 'bg-emerald-400';
      label = 'Active';
    } else {
      colorClasses = 'bg-slate-850 text-slate-400 border-slate-750';
      dotColor = 'bg-slate-500';
      label = 'Inactive';
    }
  } else if (type === 'pipeline') {
    switch (status as PipelineStatus) {
      case 'sourced':
        colorClasses = 'bg-slate-800/90 text-slate-300 border-slate-700';
        dotColor = 'bg-slate-400';
        label = 'Sourced';
        break;
      case 'negotiating':
        colorClasses = 'bg-amber-950/70 text-amber-300 border-amber-700/50';
        dotColor = 'bg-amber-400';
        label = 'Negotiating';
        break;
      case 'booked':
        colorClasses = 'bg-sky-950/70 text-sky-300 border-sky-700/50';
        dotColor = 'bg-sky-400';
        label = 'Booked';
        break;
      case 'in_transit':
        colorClasses = 'bg-purple-950/70 text-purple-300 border-purple-700/50';
        dotColor = 'bg-purple-400';
        label = 'In Transit';
        break;
      case 'delivered':
        colorClasses = 'bg-teal-950/70 text-teal-300 border-teal-700/50';
        dotColor = 'bg-teal-400';
        label = 'Delivered';
        break;
      case 'invoiced':
        colorClasses = 'bg-indigo-950/70 text-indigo-300 border-indigo-700/50';
        dotColor = 'bg-indigo-400';
        label = 'Invoiced';
        break;
      case 'paid':
        colorClasses = 'bg-emerald-950/80 text-emerald-300 border-emerald-700/60';
        dotColor = 'bg-emerald-400';
        label = 'Paid';
        break;
    }
  } else if (type === 'document') {
    switch (status as DocumentStatus) {
      case 'missing':
        colorClasses = 'bg-rose-950/70 text-rose-300 border-rose-700/50';
        dotColor = 'bg-rose-400';
        label = 'Missing';
        break;
      case 'pending':
        colorClasses = 'bg-amber-950/70 text-amber-300 border-amber-700/50';
        dotColor = 'bg-amber-400';
        label = 'Pending';
        break;
      case 'received':
        colorClasses = 'bg-blue-950/70 text-blue-300 border-blue-700/50';
        dotColor = 'bg-blue-400';
        label = 'Received';
        break;
      case 'verified':
        colorClasses = 'bg-emerald-950/70 text-emerald-300 border-emerald-700/50';
        dotColor = 'bg-emerald-400';
        label = 'Verified';
        break;
    }
  } else if (type === 'role') {
    switch (status as UserRole) {
      case 'owner_admin':
        colorClasses = 'bg-indigo-950/70 text-indigo-300 border-indigo-700/50';
        dotColor = 'bg-indigo-400';
        label = 'Owner / Admin';
        break;
      case 'dispatcher':
        colorClasses = 'bg-blue-950/70 text-blue-300 border-blue-700/50';
        dotColor = 'bg-blue-400';
        label = 'Dispatcher';
        break;
      case 'staff':
        colorClasses = 'bg-slate-800/80 text-slate-300 border-slate-700';
        dotColor = 'bg-slate-400';
        label = 'Staff';
        break;
    }
  } else if (type === 'profitability') {
    switch (status) {
      case 'healthy':
        colorClasses = 'bg-emerald-950/70 text-emerald-300 border-emerald-700/50';
        dotColor = 'bg-emerald-400';
        label = 'Healthy (≥15%)';
        break;
      case 'review':
        colorClasses = 'bg-amber-950/70 text-amber-300 border-amber-700/50';
        dotColor = 'bg-amber-400';
        label = 'Review (<15%)';
        break;
      case 'loss':
        colorClasses = 'bg-rose-950/70 text-rose-300 border-rose-700/50';
        dotColor = 'bg-rose-400';
        label = 'Loss (<0%)';
        break;
      default:
        colorClasses = 'bg-slate-800/80 text-slate-400 border-slate-700';
        dotColor = 'bg-slate-500';
        label = status ? status.replace(/_/g, ' ') : '';
        break;
    }
  } else if (type === 'truck' || type === 'driver') {
    if (status === 'active' || status === 'available') {
      colorClasses = 'bg-emerald-950/70 text-emerald-300 border-emerald-700/50';
      dotColor = 'bg-emerald-400';
    } else if (status === 'on_load') {
      colorClasses = 'bg-purple-950/70 text-purple-300 border-purple-700/50';
      dotColor = 'bg-purple-400';
    } else if (status === 'maintenance' || status === 'off_duty') {
      colorClasses = 'bg-amber-950/70 text-amber-300 border-amber-700/50';
      dotColor = 'bg-amber-400';
    } else {
      colorClasses = 'bg-slate-800/80 text-slate-400 border-slate-700';
      dotColor = 'bg-slate-500';
    }
  }

  return (
    <span
      id={`status-badge-${status}`}
      className={`inline-flex items-center gap-1.5 rounded-full border whitespace-nowrap tracking-normal select-none ${sizeClasses} ${colorClasses}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`} />
      <span className="font-medium">{label}</span>
    </span>
  );
};
