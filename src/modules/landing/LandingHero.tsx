import React from 'react';
import heroTruckImage from '../../assets/trucking-hero.jpg';
import {
  ArrowRight,
  ShieldCheck,
  Truck,
  Sparkles,
  Kanban,
  Radio,
  FileCheck2,
  Calendar,
  Clock,
  DollarSign,
  TrendingUp,
  MapPin,
  CheckCircle2,
  Users,
} from 'lucide-react';

interface LandingHeroProps {
  onGetStartedClick: () => void;
  onSeeHowItWorksClick: () => void;
  onLaunchWorkspaceClick?: () => void;
}

export const LandingHero: React.FC<LandingHeroProps> = ({
  onGetStartedClick,
  onSeeHowItWorksClick,
}) => {
  return (
    <section className="relative isolate pt-8 pb-16 sm:pt-12 sm:pb-20 md:pt-20 md:pb-28 overflow-hidden">
      {/* Cinematic Trucking Highway Visual Background Treatment */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none select-none">
        <img
          src={heroTruckImage}
          alt="Commercial freight truck moving along highway at dusk"
          className="w-full h-full object-cover -scale-x-100 object-[15%_35%] sm:object-[10%_35%] md:object-[left_35%] opacity-35 sm:opacity-45 brightness-[0.7] contrast-110"
        />
        {/* Dark navy/slate gradients ensuring clear visibility of the truck while maintaining 100% typography contrast */}
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950/80 via-slate-950/50 to-slate-950" />
        <div className="absolute inset-0 bg-gradient-to-r from-slate-950/70 via-transparent to-slate-950/70" />
      </div>

      {/* Background ambient lighting */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[800px] h-[350px] bg-indigo-600/15 blur-[140px] z-0 pointer-events-none rounded-full max-w-[100vw]" />
      <div className="absolute top-10 right-0 w-[400px] h-[250px] bg-sky-600/10 blur-[120px] z-0 pointer-events-none rounded-full max-w-[100vw]" />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Hero Copy */}
        <div className="text-center max-w-3xl mx-auto mb-10 sm:mb-14 md:mb-16">
          <div className="inline-flex items-center gap-2 px-3 sm:px-3.5 py-1.5 rounded-full bg-indigo-950/70 border border-indigo-700/50 text-indigo-300 text-[11px] sm:text-xs font-semibold mb-5 sm:mb-6 max-w-full">
            <Truck className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            <span className="truncate">Built for Multi-Client Dispatch Operations</span>
          </div>

          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black text-slate-100 tracking-tight leading-[1.15] sm:leading-[1.1] mb-5 sm:mb-6">
            The Operating System for{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-sky-300 to-indigo-300">
              Trucking Dispatch Teams
            </span>
          </h1>

          <p className="text-base sm:text-xl text-slate-300 font-normal leading-relaxed mb-3 sm:mb-4">
            Manage multiple carrier clients, trucks, drivers, loads, documents and operational workflows from one workspace.
          </p>

          <p className="text-xs sm:text-base text-slate-400 leading-relaxed font-medium mb-6 sm:mb-8">
            Built specifically for dispatch companies, dispatch agencies, and teams coordinating multiple trucks and drivers across independent carrier authorities.
          </p>

          {/* Primary Action Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-3.5 max-w-md mx-auto w-full">
            <button
              id="hero-primary-cta"
              type="button"
              onClick={onGetStartedClick}
              className="w-full sm:w-auto px-7 py-3.5 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl shadow-lg shadow-indigo-600/25 transition-all flex items-center justify-center gap-2 cursor-pointer group min-h-[44px]"
            >
              <span>Start Free Trial</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </button>

            <button
              id="hero-secondary-cta"
              type="button"
              onClick={onSeeHowItWorksClick}
              className="w-full sm:w-auto px-6 py-3.5 text-sm font-semibold text-slate-300 bg-slate-900/90 hover:bg-slate-800/90 border border-slate-700/80 rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer min-h-[44px]"
            >
              <span>See How It Works</span>
            </button>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3 sm:gap-6 text-[11px] sm:text-xs text-slate-400 font-medium">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              Multi-Client Dispatch
            </span>
            <span className="flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-indigo-400 shrink-0" />
              AI-Assisted Rate Con Extraction
            </span>
            <span className="flex items-center gap-1.5">
              <Users className="w-4 h-4 text-sky-400 shrink-0" />
              Team & Workload Coordination
            </span>
          </div>
        </div>

        {/* DispatcherDesk Interactive Product Mockup Representation */}
        <div className="relative mx-auto max-w-6xl rounded-2xl border border-slate-800 bg-slate-950 shadow-2xl overflow-hidden">
          {/* Top Browser / Window Frame */}
          <div className="h-10 px-3 sm:px-4 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between select-none min-w-0">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <div className="flex items-center gap-1.5 shrink-0">
                <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-rose-500/80" />
                <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-amber-500/80" />
                <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-emerald-500/80" />
              </div>
              <span className="ml-1 sm:ml-3 text-[10px] sm:text-[11px] font-mono text-slate-400 flex items-center gap-1.5 truncate">
                <Truck className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                <span className="truncate">app.dispatcherdesk.com / workspace</span>
              </span>
            </div>
            <div className="hidden sm:flex items-center gap-3 text-[11px] font-medium text-slate-400 shrink-0">
              <span className="px-2.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                Illustrative Demo Workspace
              </span>
            </div>
          </div>

          {/* Product UI Cockpit Simulation */}
          <div className="p-3 sm:p-6 bg-slate-950 space-y-3 sm:space-y-4">
            {/* Demo Notice Banner */}
            <div className="px-2.5 sm:px-3 py-1.5 rounded-lg bg-slate-900/80 border border-slate-800 text-[10px] sm:text-[11px] text-slate-400 flex flex-wrap items-center justify-between gap-1.5">
              <span>Product Preview — Illustrative sample data demonstrating multi-client dispatch operations</span>
              <span className="text-indigo-400 font-medium">Demo Simulation</span>
            </div>

            {/* Cockpit Sub-Header: Metrics Strip */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
              <div className="p-2.5 sm:p-3 rounded-xl bg-slate-900/70 border border-slate-800/80">
                <div className="flex items-center justify-between text-slate-400 text-[11px] sm:text-xs mb-1">
                  <span className="truncate">Active Managed Trucks</span>
                  <Truck className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                </div>
                <div className="text-base sm:text-lg md:text-xl font-bold text-slate-100">14 Units</div>
                <div className="text-[10px] sm:text-[11px] text-slate-400 font-medium mt-0.5 truncate">Sample fleet roster</div>
              </div>

              <div className="p-2.5 sm:p-3 rounded-xl bg-slate-900/70 border border-slate-800/80">
                <div className="flex items-center justify-between text-slate-400 text-[11px] sm:text-xs mb-1">
                  <span className="truncate">Week Linehaul Gross</span>
                  <DollarSign className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                </div>
                <div className="text-base sm:text-lg md:text-xl font-bold text-slate-100">$48,250.00</div>
                <div className="text-[10px] sm:text-[11px] text-slate-400 font-medium mt-0.5 truncate">Sample freight volume</div>
              </div>

              <div className="p-2.5 sm:p-3 rounded-xl bg-slate-900/70 border border-slate-800/80">
                <div className="flex items-center justify-between text-slate-400 text-[11px] sm:text-xs mb-1">
                  <span className="truncate">Check Call Status</span>
                  <Radio className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                </div>
                <div className="text-base sm:text-lg md:text-xl font-bold text-slate-100">98.4%</div>
                <div className="text-[10px] sm:text-[11px] text-sky-400 font-medium mt-0.5 truncate">Sample transit updates</div>
              </div>

              <div className="p-2.5 sm:p-3 rounded-xl bg-slate-900/70 border border-slate-800/80">
                <div className="flex items-center justify-between text-slate-400 text-[11px] sm:text-xs mb-1">
                  <span className="truncate">Dispatch Fee Yield</span>
                  <TrendingUp className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                </div>
                <div className="text-base sm:text-lg md:text-xl font-bold text-slate-100">$4,101.25</div>
                <div className="text-[10px] sm:text-[11px] text-indigo-400 font-medium mt-0.5 truncate">Sample agency fee yield</div>
              </div>
            </div>

            {/* Split Screen: Active Load Board & AI Rate Con Extraction */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-4">
              {/* Left Column: Sample Load Board & Pipeline */}
              <div className="lg:col-span-8 space-y-3">
                <div className="flex items-center justify-between pb-1 border-b border-slate-800 text-xs font-semibold text-slate-300">
                  <div className="flex items-center gap-2">
                    <Kanban className="w-4 h-4 text-indigo-400" />
                    <span>Active Dispatches (Sample Pipeline)</span>
                  </div>
                  <span className="text-[11px] text-slate-400 font-normal">Sample Multi-Client View</span>
                </div>

                {/* Load Card 1 */}
                <div className="p-3 sm:p-3.5 rounded-xl bg-slate-900/90 border border-slate-800/80 hover:border-indigo-500/40 transition-colors">
                  <div className="flex flex-wrap items-center justify-between gap-1.5 sm:gap-2 mb-2">
                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 min-w-0">
                      <span className="font-mono text-xs font-bold text-indigo-300 shrink-0">LD-2026-884</span>
                      <span className="px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-bold uppercase tracking-wider bg-emerald-950/80 text-emerald-300 border border-emerald-800/60 shrink-0">
                        In Transit
                      </span>
                      <span className="text-[10px] sm:text-[11px] text-slate-400 font-medium">Apex Freight Carrier (Sample Client)</span>
                    </div>
                    <span className="font-mono text-xs sm:text-sm font-bold text-slate-100 shrink-0">$3,850.00</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                    <div>
                      <span className="text-[10px] uppercase text-slate-400 font-bold block">Route</span>
                      <p className="font-medium text-slate-200">Chicago, IL → Dallas, TX</p>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase text-slate-400 font-bold block">Truck & Driver</span>
                      <p className="font-medium text-slate-200">Trk #104 • Carlos Mendez (Demo)</p>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase text-slate-400 font-bold block">Transit Update</span>
                      <p className="font-medium text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                        Little Rock, AR (On Schedule)
                      </p>
                    </div>
                  </div>
                </div>

                {/* Load Card 2 */}
                <div className="p-3 sm:p-3.5 rounded-xl bg-slate-900/90 border border-slate-800/80 hover:border-indigo-500/40 transition-colors">
                  <div className="flex flex-wrap items-center justify-between gap-1.5 sm:gap-2 mb-2">
                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 min-w-0">
                      <span className="font-mono text-xs font-bold text-indigo-300 shrink-0">LD-2026-885</span>
                      <span className="px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-bold uppercase tracking-wider bg-blue-950/80 text-blue-300 border border-blue-800/60 shrink-0">
                        Loading at Shipper
                      </span>
                      <span className="text-[10px] sm:text-[11px] text-slate-400 font-medium">Blue Ridge Express (Sample Client)</span>
                    </div>
                    <span className="font-mono text-xs sm:text-sm font-bold text-slate-100 shrink-0">$4,400.00</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                    <div>
                      <span className="text-[10px] uppercase text-slate-400 font-bold block">Route</span>
                      <p className="font-medium text-slate-200">Atlanta, GA → Philadelphia, PA</p>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase text-slate-400 font-bold block">Truck & Driver</span>
                      <p className="font-medium text-slate-200">Trk #208 • James Wilson (Demo)</p>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase text-slate-400 font-bold block">Detention Clock</span>
                      <p className="font-medium text-amber-400 flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 shrink-0" />
                        Dock 14 • 1h 15m elapsed
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column: AI Extraction & Check Call Log Preview */}
              <div className="lg:col-span-4 space-y-3">
                <div className="p-3 sm:p-3.5 rounded-xl bg-slate-900/90 border border-indigo-500/30">
                  <div className="flex items-center gap-2 text-xs font-bold text-indigo-300 mb-2">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                    <span>AI Rate Con Extraction (Sample)</span>
                  </div>
                  <p className="text-[11px] text-slate-300 leading-snug mb-2.5">
                    Upload Rate Confirmation PDFs to extract broker, rate, stop, and detention terms for dispatcher verification.
                  </p>
                  <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800 text-[11px] space-y-1">
                    <div className="flex justify-between gap-2">
                      <span className="text-slate-400 shrink-0">Broker:</span>
                      <span className="text-slate-200 font-semibold truncate text-right">C.H. Robinson (Sample)</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-slate-400 shrink-0">Linehaul:</span>
                      <span className="text-emerald-400 font-bold font-mono">$3,850.00</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-slate-400 shrink-0">Detention:</span>
                      <span className="text-slate-200 text-right">$75.00/hr after 2 hrs</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-slate-400 shrink-0">Review Status:</span>
                      <span className="text-indigo-400 font-bold">Extracted for Review</span>
                    </div>
                  </div>
                </div>

                <div className="p-3 sm:p-3.5 rounded-xl bg-slate-900/90 border border-slate-800/80">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-300 mb-2">
                    <div className="flex items-center gap-2">
                      <Radio className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                      <span>Sample Check Call Timeline</span>
                    </div>
                    <span className="text-[10px] text-slate-400 font-normal">Dispatcher Ops</span>
                  </div>
                  <div className="space-y-2 text-[11px]">
                    <div className="p-2 rounded bg-slate-950 border border-slate-800/70">
                      <div className="flex justify-between text-slate-400 mb-0.5">
                        <span className="font-semibold text-slate-200">Trk #104 (LD-884)</span>
                        <span>12m ago</span>
                      </div>
                      <p className="text-slate-300">Passing Memphis, TN. Weather clear, ETA on schedule for 08:00 CT dock.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
