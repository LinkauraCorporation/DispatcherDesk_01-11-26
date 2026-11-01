import React from 'react';
import {
  Layers,
  PhoneCall,
  FileSpreadsheet,
  AlertOctagon,
  Clock,
  Coins,
  Users2,
  FolderGit2,
  CheckCircle2,
  ArrowRight,
} from 'lucide-react';

interface LandingProblemProps {
  onGetStartedClick: () => void;
}

export const LandingProblem: React.FC<LandingProblemProps> = ({ onGetStartedClick }) => {
  const painPoints = [
    {
      icon: Layers,
      title: 'Too Many Loads Across Multiple Clients',
      desc: 'Juggling dozens of active shipments across multiple carrier clients in disparate spreadsheets causes confusion, double-booking, and missed deadlines.',
    },
    {
      icon: PhoneCall,
      title: 'Driver & Truck Coordination Chaos',
      desc: 'Constant phone tags, disjointed WhatsApp group chats, and unverified driver availability lead to costly deadhead miles and delayed pickups.',
    },
    {
      icon: FolderGit2,
      title: 'Documents Scattered Across Systems',
      desc: 'Rate confirmations, BOLs, PODs, and lumper receipts trapped in email inboxes, local desktop downloads, and texting apps delay billing cycles.',
    },
    {
      icon: AlertOctagon,
      title: 'Missed Follow-Ups & Task Drops',
      desc: 'Critical operational tasks like scheduling appointments, ordering lumpers, or submitting accessorial detention slip through the cracks without reminders.',
    },
    {
      icon: Clock,
      title: 'Unreliable Check-Call Tracking',
      desc: 'Brokers demand constant location updates. Manual tracking leaves dispatchers scrambling during transit emergencies and facility delays.',
    },
    {
      icon: FileSpreadsheet,
      title: 'Appointment Window Management',
      desc: 'Dock appointments, delivery windows, and receiver detention thresholds easily clash without a unified dispatcher operations calendar.',
    },
    {
      icon: Coins,
      title: 'Limited Profitability Visibility',
      desc: 'Dispatch agency owners often wait weeks to calculate true dispatch fee yields, carrier client revenue, and per-truck operating profitability.',
    },
    {
      icon: Users2,
      title: 'Growing Dispatch Teams Lose Sync',
      desc: 'As your dispatch agency hires more dispatchers, lack of centralized handover, load assignment, and team visibility creates internal operational chaos.',
    },
  ];

  return (
    <section id="problem" className="py-12 sm:py-16 md:py-20 bg-slate-950 border-t border-slate-800/80 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="max-w-3xl mx-auto text-center mb-10 sm:mb-14 md:mb-16">
          <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-rose-400 bg-rose-950/60 border border-rose-800/60 px-3 py-1 rounded-full inline-block mb-3">
            The Reality of Running a Dispatch Agency
          </span>
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-slate-100 tracking-tight leading-tight mb-3 sm:mb-4">
            Freight Moves Fast. Disorganized Dispatch Operations Slow You Down.
          </h2>
          <p className="text-sm sm:text-base text-slate-400 leading-relaxed">
            Dispatching multiple owner-operators and carrier fleets without a dedicated operating system wastes hours every day on repetitive manual back-and-forth.
          </p>
        </div>

        {/* 8 Pain Points Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-10 sm:mb-14">
          {painPoints.map((item, index) => {
            const Icon = item.icon;
            return (
              <div
                key={index}
                className="p-4 sm:p-5 rounded-xl bg-slate-900/50 border border-slate-800/80 hover:border-slate-700/80 transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-rose-950/40 border border-rose-800/40 text-rose-400 flex items-center justify-center mb-3 sm:mb-3.5">
                    <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
                  </div>
                  <h3 className="text-xs sm:text-sm font-bold text-slate-200 mb-1.5 sm:mb-2 leading-snug">
                    {item.title}
                  </h3>
                  <p className="text-[11px] sm:text-xs text-slate-400 leading-relaxed">
                    {item.desc}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* The DispatcherDesk Solution Banner */}
        <div className="p-5 sm:p-8 rounded-2xl bg-gradient-to-r from-indigo-950/80 via-slate-900 to-indigo-950/80 border border-indigo-500/30 text-center max-w-4xl mx-auto shadow-xl">
          <div className="inline-flex items-center gap-2 text-indigo-300 text-xs font-bold uppercase tracking-wider mb-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>The Centralized Solution</span>
          </div>
          <h3 className="text-xl sm:text-2xl lg:text-3xl font-bold text-slate-100 mb-2.5 sm:mb-3 tracking-tight">
            One Unified Workspace for Your Entire Dispatch Business
          </h3>
          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-2xl mx-auto mb-5 sm:mb-6">
            DispatcherDesk replaces disconnected spreadsheets, chaotic group chats, and lost paperwork with a dedicated operating system designed from the ground up for professional dispatch companies.
          </p>
          <button
            type="button"
            onClick={onGetStartedClick}
            className="w-full sm:w-auto px-6 py-3 text-xs sm:text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl shadow-md shadow-indigo-600/30 transition-all inline-flex items-center justify-center gap-2 cursor-pointer min-h-[44px]"
          >
            <span>Start Free Trial</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </section>
  );
};
