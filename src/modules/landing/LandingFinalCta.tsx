import React from 'react';
import { ArrowRight, MessageSquare, ShieldCheck, Truck } from 'lucide-react';

interface LandingFinalCtaProps {
  onGetStartedClick: () => void;
  onContactClick: () => void;
}

export const LandingFinalCta: React.FC<LandingFinalCtaProps> = ({
  onGetStartedClick,
  onContactClick,
}) => {
  return (
    <section className="py-12 sm:py-16 md:py-20 bg-slate-950 border-t border-slate-800/80 relative overflow-hidden">
      {/* Subtle ambient gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-indigo-950/20 via-transparent to-slate-950 pointer-events-none" />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="p-6 sm:p-10 md:p-14 rounded-2xl sm:rounded-3xl bg-gradient-to-br from-indigo-950/90 via-slate-900 to-indigo-950/80 border border-indigo-500/40 shadow-2xl text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-900/60 border border-indigo-700/50 text-indigo-300 text-[11px] sm:text-xs font-semibold mb-4 sm:mb-6">
            <Truck className="w-3.5 h-3.5 shrink-0" />
            <span>Built for Modern Freight Dispatch Agencies</span>
          </div>

          <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-black text-slate-100 tracking-tight leading-tight mb-3 sm:mb-5">
            Run Your Dispatch Operation from One Place.
          </h2>

          <p className="text-xs sm:text-sm md:text-base text-slate-300 max-w-2xl mx-auto leading-relaxed mb-6 sm:mb-8">
            Stop losing track of loads, missing check calls, and scrambling through scattered email threads. Bring your carrier clients, trucks, drivers, documents, and dispatch team together under one unified operating system.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-3.5 max-w-md mx-auto mb-6 sm:mb-8">
            <button
              id="final-cta-getstarted-btn"
              type="button"
              onClick={onGetStartedClick}
              className="w-full sm:w-auto px-8 py-3.5 text-xs sm:text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl shadow-lg shadow-indigo-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer min-h-[44px]"
            >
              <span>Start Free Trial</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <button
              id="final-cta-contact-btn"
              type="button"
              onClick={onContactClick}
              className="w-full sm:w-auto px-7 py-3.5 text-xs sm:text-sm font-semibold text-slate-200 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer min-h-[44px]"
            >
              <MessageSquare className="w-4 h-4 text-indigo-400" />
              <span>Contact Us</span>
            </button>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-6 text-[11px] sm:text-xs text-slate-400 font-medium pt-4 border-t border-slate-800/80">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              Dedicated Agency Workspace
            </span>
            <span className="hidden sm:inline">•</span>
            <span>No Per-Seat Team Complexity</span>
            <span className="hidden sm:inline">•</span>
            <span>Active Truck Billing Model</span>
          </div>
        </div>
      </div>
    </section>
  );
};
