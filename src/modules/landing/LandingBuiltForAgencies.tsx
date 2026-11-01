import React from 'react';
import {
  Building2,
  Truck,
  Users2,
  DollarSign,
  ClipboardList,
  Layers,
  CheckCircle2,
} from 'lucide-react';

export const LandingBuiltForAgencies: React.FC = () => {
  const agencyPillars = [
    {
      icon: Building2,
      title: 'Multi-Client Carrier Segregation',
      desc: 'Seamlessly dispatch for multiple independent motor carrier authorities and owner-operators. Maintain complete separation of client documents, carrier documentation, and dispatch fee terms.',
    },
    {
      icon: Truck,
      title: 'Fleet & Equipment Coordination',
      desc: 'Coordinate diverse equipment types including Dry Vans, Reefers, and Flatbeds across multiple client fleets. Keep equipment specifications, trailer types, and capacities organized in one roster.',
    },
    {
      icon: Users2,
      title: 'Multi-Dispatcher Visibility',
      desc: 'Dispatchers can manage their assigned carrier fleets while agency owners and team leads maintain centralized visibility over all active shipments, loads, and dispatcher workloads.',
    },
    {
      icon: DollarSign,
      title: 'Agency Dispatch Fee Tracking',
      desc: 'Track earned percentage or flat dispatch service fees per load and per carrier client, making fee calculations and agency revenue reporting transparent and structured.',
    },
    {
      icon: ClipboardList,
      title: 'Operational Shift Handover',
      desc: 'Capture shift notes, active load updates, and pending check calls in structured handover logs so incoming dispatchers take over smoothly without dropped follow-ups.',
    },
    {
      icon: Layers,
      title: 'Centralized Operational Structure',
      desc: 'Standardize how your dispatch desk handles rate confirmation review, appointment scheduling, tracking updates, and document collection as your agency grows.',
    },
  ];

  return (
    <section id="for-agencies" className="py-12 sm:py-16 md:py-20 bg-slate-900/40 border-t border-slate-800/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto text-center mb-10 sm:mb-14 md:mb-16">
          <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-emerald-400 bg-emerald-950/60 border border-emerald-800/60 px-3 py-1 rounded-full inline-block mb-3">
            Designed for Multi-Client Dispatchers
          </span>
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-slate-100 tracking-tight leading-tight mb-3 sm:mb-4">
            Built for the Way Dispatch Companies Actually Work
          </h2>
          <p className="text-sm sm:text-base text-slate-400 leading-relaxed">
            DispatcherDesk is tailored specifically for independent dispatch businesses, dispatch agencies, and multi-dispatcher teams coordinating multiple carrier clients and fleets.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {agencyPillars.map((pillar, idx) => {
            const Icon = pillar.icon;
            return (
              <div
                key={idx}
                className="p-4 sm:p-6 rounded-2xl bg-slate-950/80 border border-slate-800/90 hover:border-emerald-500/40 hover:bg-slate-900/50 transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-emerald-950/60 border border-emerald-800/40 text-emerald-400 flex items-center justify-center mb-3 sm:mb-4">
                    <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
                  </div>
                  <h3 className="text-sm sm:text-base font-bold text-slate-100 mb-1.5 sm:mb-2">
                    {pillar.title}
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                    {pillar.desc}
                  </p>
                </div>
              </div>
            );
          })}

          {/* Quick Agency Value Summary Box */}
          <div className="p-4 sm:p-6 rounded-2xl bg-gradient-to-br from-indigo-950/80 to-slate-950 border border-indigo-700/50 flex flex-col justify-between md:col-span-2 lg:col-span-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-indigo-400 text-xs font-bold uppercase tracking-wider mb-2">
                  <CheckCircle2 className="w-4 h-4 text-indigo-400" />
                  <span>The Multi-Client Advantage</span>
                </div>
                <h3 className="text-base sm:text-lg font-bold text-slate-100 mb-1">
                  Scale Your Managed Truck Count with Operational Clarity
                </h3>
                <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-3xl">
                  Whether managing 3 owner-operators or coordinating 50+ carrier trucks across nationwide lanes, DispatcherDesk gives your dispatchers the structure to stay organized, responsive, and profitable.
                </p>
              </div>
              <div className="pt-3 sm:pt-0 sm:pl-4 border-t sm:border-t-0 sm:border-l border-slate-800 shrink-0 text-left sm:text-right">
                <span className="text-xs font-mono text-indigo-300 block">Organization Workspace</span>
                <span className="text-[11px] sm:text-xs text-slate-400 font-medium">Multi-Client • Multi-Truck • Multi-Dispatcher</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
