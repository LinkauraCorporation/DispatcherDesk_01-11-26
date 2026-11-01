import React, { useState } from 'react';
import {
  Users,
  Truck,
  PackageCheck,
  UserCheck,
  Calendar,
  Radio,
  FileText,
  DollarSign,
  BarChart3,
  ArrowRight,
} from 'lucide-react';

export const LandingWorkflow: React.FC = () => {
  const workflowSteps = [
    {
      step: '01',
      title: 'Client',
      icon: Users,
      summary: 'Register Carrier Client',
      detail: 'Onboard carrier clients and configure their dispatch service and fee terms.',
    },
    {
      step: '02',
      title: 'Fleet',
      icon: Truck,
      summary: 'Configure Trucks & Drivers',
      detail: 'Add power units, equipment types (Dry Van, Reefer, Flatbed), and driver contact and assignment information.',
    },
    {
      step: '03',
      title: 'Load',
      icon: PackageCheck,
      summary: 'Book Freight Loads',
      detail: 'Capture broker details, linehaul rate, fuel terms, pickup and delivery stops, and commodity specifications.',
    },
    {
      step: '04',
      title: 'Assignment',
      icon: UserCheck,
      summary: 'Assign Truck & Driver',
      detail: 'Assign the booked load to an available client truck and driver, matching capacity and equipment specifications.',
    },
    {
      step: '05',
      title: 'Scheduling',
      icon: Calendar,
      summary: 'Coordinate Appointments',
      detail: 'Organize shipper pickup and receiver delivery dock appointments on the centralized dispatcher calendar.',
    },
    {
      step: '06',
      title: 'Tracking',
      icon: Radio,
      summary: 'Check Calls & Updates',
      detail: 'Log transit checkpoints, facility arrivals, detention alerts, and status updates directly on the load timeline.',
    },
    {
      step: '07',
      title: 'Documents',
      icon: FileText,
      summary: 'Manage Load Paperwork',
      detail: 'Upload and organize broker Rate Confirmations, Bills of Lading (BOL), and signed Proof of Delivery (POD) records.',
    },
    {
      step: '08',
      title: 'Profitability',
      icon: DollarSign,
      summary: 'Calculate Financials & Fees',
      detail: 'Track freight revenue, dispatch fee earnings, load profitability, and operational performance once deliveries complete.',
    },
    {
      step: '09',
      title: 'Reporting',
      icon: BarChart3,
      summary: 'Review Performance',
      detail: 'Review freight volume trends, carrier revenue summaries, and team dispatch activity across your organization.',
    },
  ];

  const [activeStepIndex, setActiveStepIndex] = useState(0);

  return (
    <section id="workflow" className="py-12 sm:py-16 md:py-20 bg-slate-950 border-t border-slate-800/80 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto text-center mb-10 sm:mb-14 md:mb-16">
          <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-sky-400 bg-sky-950/60 border border-sky-800/60 px-3 py-1 rounded-full inline-block mb-3">
            Operational Progression
          </span>
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-slate-100 tracking-tight leading-tight mb-3 sm:mb-4">
            The DispatcherDesk Operational Workflow
          </h2>
          <p className="text-sm sm:text-base text-slate-400 leading-relaxed mb-5 sm:mb-6">
            A structured workflow designed around how professional dispatch desks actually book, dispatch, track, and close freight.
          </p>

          {/* Quick Flow Summary Ribbon */}
          <div className="inline-flex flex-wrap items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-xl bg-slate-900/80 border border-slate-800 text-[11px] sm:text-xs text-slate-300 font-medium max-w-full">
            <span>Manage Clients</span>
            <ArrowRight className="w-3 h-3 text-indigo-400 shrink-0" />
            <span>Manage Fleet</span>
            <ArrowRight className="w-3 h-3 text-indigo-400 shrink-0" />
            <span>Book & Assign</span>
            <ArrowRight className="w-3 h-3 text-indigo-400 shrink-0" />
            <span>Track Operations</span>
            <ArrowRight className="w-3 h-3 text-indigo-400 shrink-0" />
            <span>Documents</span>
            <ArrowRight className="w-3 h-3 text-indigo-400 shrink-0" />
            <span>Profitability</span>
          </div>
        </div>

        {/* Interactive Step Selector Grid (Desktop) */}
        <div className="hidden lg:grid grid-cols-3 gap-3.5 mb-8">
          {workflowSteps.map((step, idx) => {
            const Icon = step.icon;
            const isSelected = activeStepIndex === idx;
            return (
              <div
                key={idx}
                onClick={() => setActiveStepIndex(idx)}
                className={`p-4 rounded-xl border transition-all cursor-pointer text-left ${
                  isSelected
                    ? 'bg-indigo-950/70 border-indigo-500/80 shadow-lg shadow-indigo-600/10'
                    : 'bg-slate-900/60 border-slate-800/80 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-[10px] font-mono font-bold ${isSelected ? 'text-indigo-300' : 'text-slate-400'}`}>
                    PHASE {step.step}
                  </span>
                  <Icon className={`w-4 h-4 ${isSelected ? 'text-indigo-400' : 'text-slate-400'}`} />
                </div>
                <h4 className="text-sm font-bold text-slate-100 mb-1">{step.title}: {step.summary}</h4>
                <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">{step.detail}</p>
              </div>
            );
          })}
        </div>

        {/* Selected Step Spotlight Focus Box */}
        <div className="p-4 sm:p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-indigo-500/30 max-w-3xl mx-auto shadow-xl">
          <div className="flex flex-wrap sm:flex-nowrap items-center gap-2.5 sm:gap-3 mb-2 sm:mb-3">
            <span className="text-[11px] sm:text-xs font-mono font-bold px-2.5 py-1 rounded bg-indigo-600 text-white shrink-0">
              Phase {workflowSteps[activeStepIndex].step}
            </span>
            <h3 className="text-base sm:text-lg md:text-xl font-bold text-slate-100">
              {workflowSteps[activeStepIndex].title}: {workflowSteps[activeStepIndex].summary}
            </h3>
          </div>
          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
            {workflowSteps[activeStepIndex].detail}
          </p>
        </div>

        {/* Mobile / Tablet Scannable Step Flow */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:hidden gap-3 mt-6 sm:mt-8">
          {workflowSteps.map((step, idx) => {
            const Icon = step.icon;
            return (
              <div
                key={idx}
                className="p-3.5 sm:p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 flex items-start gap-3"
              >
                <div className="w-8 h-8 rounded-lg bg-indigo-950 border border-indigo-700/50 text-indigo-400 flex items-center justify-center shrink-0 mt-0.5">
                  <Icon className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-indigo-400 font-bold shrink-0">
                      {step.step}
                    </span>
                    <h4 className="text-xs sm:text-sm font-bold text-slate-100 truncate">{step.title}</h4>
                  </div>
                  <p className="text-[11px] sm:text-xs font-medium text-slate-300 mt-0.5">{step.summary}</p>
                  <p className="text-[11px] sm:text-xs text-slate-400 mt-1 leading-relaxed">{step.detail}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
