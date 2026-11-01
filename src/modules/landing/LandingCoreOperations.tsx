import React from 'react';
import {
  Truck,
  PackageCheck,
  FileText,
  Sparkles,
  Calendar,
  Clock,
  DollarSign,
  Users,
  CheckCircle2,
} from 'lucide-react';

export const LandingCoreOperations: React.FC = () => {
  const capabilityGroups = [
    {
      icon: Truck,
      title: 'Client & Fleet Management',
      desc: 'Onboard carrier clients, configure fee terms, and manage trucks, trailers, and drivers in one roster.',
      chips: [
        'Carrier profiles & fee terms',
        'Truck & trailer equipment roster',
        'Driver contact & assignment info',
      ],
    },
    {
      icon: PackageCheck,
      title: 'Load & Dispatch Management',
      desc: 'Manage loads, stops, rates, assignments, trucks, and drivers throughout the entire dispatch lifecycle.',
      chips: [
        'Multi-stop freight load creation',
        'Truck & driver assignment',
        'Dispatch lifecycle tracking',
      ],
    },
    {
      icon: FileText,
      title: 'Documents',
      desc: 'Keep Rate Confirmations, BOLs, PODs, and other operational paperwork organized with their associated loads.',
      chips: [
        'Rate Confirmation & BOL storage',
        'Signed Proof of Delivery (POD)',
        'Organized by load & carrier client',
      ],
    },
    {
      icon: Sparkles,
      title: 'AI Rate Confirmation Extraction',
      desc: 'Upload a Rate Confirmation PDF and extract relevant broker, rate, stop, and detention terms for dispatcher review.',
      chips: [
        'PDF rate confirmation ingestion',
        'Extracts broker, rates & stops',
        'Review before saving to dispatch',
      ],
    },
    {
      icon: Calendar,
      title: 'Calendar & Check Calls',
      desc: 'Manage pickup and delivery appointments, transit updates, and driver check calls from one operational timeline.',
      chips: [
        'Pickup & delivery schedule calendar',
        'Driver transit check call logs',
        'Location & milestone updates',
      ],
    },
    {
      icon: Clock,
      title: 'Tasks & Detention',
      desc: 'Track operational follow-ups, appointment scheduling tasks, detention clocks, and time-sensitive activities.',
      chips: [
        'Dispatcher task & reminder queues',
        'Detention clock & detention tracking',
        'Overdue follow-up tracking',
      ],
    },
    {
      icon: DollarSign,
      title: 'Profitability & Reporting',
      desc: 'Track freight revenue, dispatch fee earnings, load profitability, and operational performance.',
      chips: [
        'Freight revenue & fee earnings',
        'Load profitability metrics',
        'Operational performance reporting',
      ],
    },
    {
      icon: Users,
      title: 'Team Operations',
      desc: 'Coordinate multiple dispatchers, team workload distribution, load assignments, and shift handovers.',
      chips: [
        'Multi-dispatcher coordination',
        'Workload & client assignment',
        'Shift handover operational notes',
      ],
    },
  ];

  return (
    <section id="features" className="py-12 sm:py-16 md:py-20 bg-slate-900/30 border-t border-slate-800/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto text-center mb-10 sm:mb-14 md:mb-16">
          <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-indigo-400 bg-indigo-950/60 border border-indigo-700/50 px-3 py-1 rounded-full inline-block mb-3">
            Core Capabilities
          </span>
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-slate-100 tracking-tight leading-tight mb-3 sm:mb-4">
            Everything Required to Run Your Dispatch Desk
          </h2>
          <p className="text-sm sm:text-base text-slate-400 leading-relaxed">
            Eight focused operational modules built to organize clients, fleets, freight loads, and team dispatchers in one place.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-5">
          {capabilityGroups.map((feat, idx) => {
            const Icon = feat.icon;
            return (
              <div
                key={idx}
                className="p-4 sm:p-5 rounded-2xl bg-slate-950/80 border border-slate-800/90 hover:border-indigo-500/40 hover:bg-slate-900/50 transition-all group flex flex-col justify-between"
              >
                <div>
                  <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-indigo-950/60 border border-indigo-800/40 text-indigo-400 flex items-center justify-center mb-3 sm:mb-4 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                    <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
                  </div>

                  <h3 className="text-sm sm:text-base font-bold text-slate-100 mb-1.5 sm:mb-2 group-hover:text-indigo-300 transition-colors leading-snug">
                    {feat.title}
                  </h3>

                  <p className="text-[11px] sm:text-xs text-slate-400 leading-relaxed mb-3 sm:mb-4">
                    {feat.desc}
                  </p>
                </div>

                <div className="pt-3 border-t border-slate-900 space-y-1.5">
                  {feat.chips.map((chip, cIdx) => (
                    <div
                      key={cIdx}
                      className="flex items-center gap-2 text-[10px] sm:text-[11px] text-slate-300 font-medium"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                      <span className="truncate">{chip}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
