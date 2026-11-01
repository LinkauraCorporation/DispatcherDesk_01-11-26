import React from 'react';
import { LucideIcon } from 'lucide-react';

interface MetricCardProps {
  id: string;
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  trend?: {
    value: string;
    isPositive?: boolean;
  };
  accentColor?: 'purple' | 'blue' | 'emerald' | 'amber' | 'slate';
  className?: string;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  id,
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  accentColor = 'slate',
  className = '',
}) => {
  const colorMap = {
    purple: 'text-indigo-400 bg-indigo-950/40 border-indigo-800/40',
    blue: 'text-sky-400 bg-sky-950/40 border-sky-800/40',
    emerald: 'text-emerald-400 bg-emerald-950/40 border-emerald-800/40',
    amber: 'text-amber-400 bg-amber-950/40 border-amber-800/40',
    slate: 'text-slate-400 bg-slate-800/50 border-slate-700/50',
  };

  return (
    <div
      id={id}
      className={`bg-slate-900/90 border border-slate-800/80 rounded-xl p-3.5 sm:p-4 flex flex-col justify-between hover:border-slate-700/80 transition-colors shadow-xs relative overflow-hidden min-w-0 ${className}`}
    >
      <div>
        {/* Top row: Section Label + Self-Contained Accent Icon */}
        <div className="flex items-center justify-between gap-2 min-w-0">
          <p className="text-[11px] font-bold text-slate-400 tracking-wider uppercase truncate" title={title}>
            {title}
          </p>
          <div className={`p-1.5 rounded-lg border shrink-0 ${colorMap[accentColor]}`}>
            <Icon className="w-3.5 h-3.5" />
          </div>
        </div>

        {/* Primary Metric Value: Full width dedicated row, tabular numeric precision, never truncated or clipped */}
        <div className="mt-1.5 sm:mt-2">
          <p
            className="text-lg sm:text-xl xl:text-[22px] font-bold text-slate-100 tracking-tight font-mono tabular-nums whitespace-nowrap"
            title={typeof value === 'string' ? value : String(value)}
          >
            {value}
          </p>
        </div>
      </div>

      {/* Contextual Subtitle & Trend Footer */}
      {(subtitle || trend) && (
        <div className="mt-2.5 sm:mt-3 pt-2 border-t border-slate-800/60 flex items-center justify-between gap-1.5 text-[11px] min-w-0">
          {subtitle && (
            <span className="text-slate-400 font-medium truncate min-w-0" title={subtitle}>
              {subtitle}
            </span>
          )}
          {trend && (
            <span
              className={`font-semibold font-mono tabular-nums shrink-0 ml-auto pl-1 ${
                trend.isPositive ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {trend.value}
            </span>
          )}
        </div>
      )}
    </div>
  );
};

