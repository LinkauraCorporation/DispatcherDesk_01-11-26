import React from 'react';
import { ShieldCheck, Truck, Sparkles } from 'lucide-react';

interface HeaderProps {
  onLoadSample: () => void;
  isProcessing: boolean;
}

export const Header: React.FC<HeaderProps> = ({ onLoadSample, isProcessing }) => {
  return (
    <header className="border-b border-neutral-800 bg-neutral-900/60 backdrop-blur-md sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
        {/* Zone 1: Brand Wordmark */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <Truck className="w-5 h-5" />
          </div>
          <div>
            <div className="text-base font-bold text-white tracking-tight flex items-center gap-2">
              FMCSA Lead Extractor
            </div>
            <div className="text-xs text-neutral-400">
              U.S. Trucking Prospect Engine
            </div>
          </div>
        </div>

        {/* Zone 2: Informational trust metadata (zero pill discipline) */}
        <div className="hidden md:flex items-center gap-2 text-xs text-neutral-400">
          <span className="flex items-center gap-1.5 text-neutral-300">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            100% Local In-Browser Processing
          </span>
          <span aria-hidden="true" className="text-neutral-600">·</span>
          <span>Zero Server Uploads</span>
          <span aria-hidden="true" className="text-neutral-600">·</span>
          <span>Chunk-Streamed for 300MB+ Files</span>
        </div>

        {/* Zone 3: Quick Action */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={onLoadSample}
            disabled={isProcessing}
            type="button"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-neutral-300 bg-neutral-800/80 hover:bg-neutral-800 border border-neutral-700 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
            title="Generate a realistic 3,500-row FMCSA census file to test immediately"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            Load Sample Census
          </button>
        </div>
      </div>
    </header>
  );
};
