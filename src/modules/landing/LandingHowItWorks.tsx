import React from 'react';
import {
  Building2,
  Truck,
  LayoutDashboard,
  CheckCircle2,
  ArrowRight,
} from 'lucide-react';

interface LandingHowItWorksProps {
  onGetStartedClick: () => void;
}

export const LandingHowItWorks: React.FC<LandingHowItWorksProps> = ({ onGetStartedClick }) => {
  const steps = [
    {
      number: '01',
      icon: Building2,
      title: 'Set up your dispatch operation',
      desc: 'Create your dispatch organization workspace, configure your operational timezones, set up your dispatch fee structures, and invite your team dispatchers.',
      highlights: [
        'Dedicated agency workspace',
        'Team dispatcher invitations',
        'Agency profile & carrier documentation',
      ],
    },
    {
      number: '02',
      icon: Truck,
      title: 'Manage trucks, drivers, clients and loads',
      desc: 'Register your carrier clients, catalog active trucks and equipment types, maintain driver contact and assignment info, and intake broker rate confirmations with AI-assisted extraction.',
      highlights: [
        'Dedicated carrier client profiles',
        'Organized truck and driver roster',
        'AI-assisted rate confirmation extraction',
      ],
    },
    {
      number: '03',
      icon: LayoutDashboard,
      title: 'Run daily dispatch operations from one workspace',
      desc: 'Assign dispatches, track dock appointments on the operations calendar, record check calls, monitor detention clocks, store verified PODs, and review profitability.',
      highlights: [
        'Centralized load pipeline & timeline',
        'Check call log & transit updates',
        'Profitability tracking & dispatch fee calculation',
      ],
    },
  ];

  return (
    <section id="how-it-works" className="py-12 sm:py-16 md:py-20 bg-slate-900/30 border-t border-slate-800/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto text-center mb-10 sm:mb-14 md:mb-16">
          <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-indigo-400 bg-indigo-950/60 border border-indigo-700/50 px-3 py-1 rounded-full inline-block mb-3">
            Clear 3-Step Setup
          </span>
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-slate-100 tracking-tight leading-tight mb-3 sm:mb-4">
            How DispatcherDesk Works
          </h2>
          <p className="text-sm sm:text-base text-slate-400 leading-relaxed">
            Get your entire dispatch operation configured and operating efficiently in three straightforward steps.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 sm:gap-8 mb-8 sm:mb-12">
          {steps.map((step, idx) => {
            const Icon = step.icon;
            return (
              <div
                key={idx}
                className="p-5 sm:p-7 rounded-2xl bg-slate-950/80 border border-slate-800/90 hover:border-indigo-500/40 transition-all flex flex-col justify-between relative group"
              >
                <div>
                  <div className="flex items-center justify-between mb-4 sm:mb-5">
                    <span className="text-xl sm:text-2xl font-black font-mono text-indigo-400 group-hover:text-indigo-300">
                      {step.number}
                    </span>
                    <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-indigo-950/60 border border-indigo-800/40 text-indigo-400 flex items-center justify-center">
                      <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
                    </div>
                  </div>

                  <h3 className="text-base sm:text-lg font-bold text-slate-100 mb-2 sm:mb-3">
                    {step.title}
                  </h3>

                  <p className="text-xs sm:text-sm text-slate-400 leading-relaxed mb-4 sm:mb-6">
                    {step.desc}
                  </p>
                </div>

                <div className="pt-3 sm:pt-4 border-t border-slate-800/80 space-y-1.5 sm:space-y-2">
                  {step.highlights.map((item, hIdx) => (
                    <div key={hIdx} className="flex items-center gap-2 text-[11px] sm:text-xs text-slate-300">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="text-center">
          <button
            type="button"
            onClick={onGetStartedClick}
            className="w-full sm:w-auto px-7 py-3.5 text-xs sm:text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl shadow-md shadow-indigo-600/30 transition-all inline-flex items-center justify-center gap-2 cursor-pointer min-h-[44px]"
          >
            <span>Start Free Trial</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </section>
  );
};
