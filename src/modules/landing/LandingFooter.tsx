import React from 'react';
import { ArrowUpRight, ShieldCheck, Mail, Globe } from 'lucide-react';
import { PolicyType } from './LandingPolicyModal.tsx';

interface LandingFooterProps {
  onLoginClick: () => void;
  onGetStartedClick: () => void;
  onOpenPolicy: (type: PolicyType) => void;
  onOpenContactClick: () => void;
}

export const LandingFooter: React.FC<LandingFooterProps> = ({
  onLoginClick,
  onGetStartedClick,
  onOpenPolicy,
  onOpenContactClick,
}) => {
  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <footer className="border-t border-slate-800/80 bg-slate-950 text-slate-400 text-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-8 sm:gap-10 mb-10 sm:mb-12">
          {/* Brand Column */}
          <div className="sm:col-span-2 lg:col-span-2 space-y-4">
            <div className="flex items-center">
              <img
                src="/images/brand/dispatcherdesk-logo.png"
                alt="DispatcherDesk"
                className="h-8 w-auto max-w-[200px] object-contain"
              />
            </div>

            <p className="text-xs text-slate-400 leading-relaxed max-w-sm">
              The unified cloud operating system designed specifically for trucking dispatch companies, independent dispatch agencies, and multi-dispatcher teams. Manage clients, trucks, drivers, loads, documents, check calls, and profitability from one workspace.
            </p>

            <div className="pt-2 text-[11px] text-slate-400 font-medium">
              Legal Business Entity: <span className="text-slate-300 font-semibold">LinkAura Corporation</span>
            </div>
          </div>

          {/* Column 2: Product & Operations */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200">
              Product
            </h4>
            <ul className="space-y-2 text-xs">
              <li>
                <button
                  type="button"
                  onClick={() => scrollToSection('features')}
                  className="hover:text-slate-200 transition-colors cursor-pointer text-left py-0.5 inline-block"
                >
                  Features & Core Operations
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => scrollToSection('workflow')}
                  className="hover:text-slate-200 transition-colors cursor-pointer text-left py-0.5 inline-block"
                >
                  Operational Workflow
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => scrollToSection('for-agencies')}
                  className="hover:text-slate-200 transition-colors cursor-pointer text-left py-0.5 inline-block"
                >
                  Built for Dispatch Agencies
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => scrollToSection('how-it-works')}
                  className="hover:text-slate-200 transition-colors cursor-pointer text-left py-0.5 inline-block"
                >
                  How It Works
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => scrollToSection('pricing')}
                  className="hover:text-slate-200 transition-colors cursor-pointer text-left py-0.5 inline-block"
                >
                  Pricing Philosophy
                </button>
              </li>
            </ul>
          </div>

          {/* Column 3: Company & Access */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200">
              Access & Company
            </h4>
            <ul className="space-y-2 text-xs">
              <li>
                <button
                  type="button"
                  onClick={() => onOpenPolicy('about')}
                  className="hover:text-slate-200 transition-colors cursor-pointer text-left py-0.5 inline-block"
                >
                  About DispatcherDesk
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={onLoginClick}
                  className="hover:text-slate-200 transition-colors cursor-pointer text-left py-0.5 inline-block"
                >
                  Login to Workspace
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={onGetStartedClick}
                  className="hover:text-slate-200 transition-colors cursor-pointer text-left text-indigo-400 font-semibold py-0.5 inline-block"
                >
                  Start Free Trial
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={onOpenContactClick}
                  className="hover:text-slate-200 transition-colors cursor-pointer text-left py-0.5 inline-block"
                >
                  Contact & Inquiries
                </button>
              </li>
            </ul>
          </div>

          {/* Column 4: Legal & Policies */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200">
              Legal & Policies
            </h4>
            <ul className="space-y-2 text-xs">
              <li>
                <button
                  type="button"
                  onClick={() => onOpenPolicy('terms')}
                  className="hover:text-slate-200 transition-colors cursor-pointer text-left py-0.5 inline-block"
                >
                  Terms & Conditions
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onOpenPolicy('privacy')}
                  className="hover:text-slate-200 transition-colors cursor-pointer text-left py-0.5 inline-block"
                >
                  Privacy Policy
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onOpenPolicy('refund')}
                  className="hover:text-slate-200 transition-colors cursor-pointer text-left py-0.5 inline-block"
                >
                  Cancellation & Refund Policy
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onOpenPolicy('delivery')}
                  className="hover:text-slate-200 transition-colors cursor-pointer text-left py-0.5 inline-block"
                >
                  Digital Services Delivery / Shipping Policy
                </button>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Sub-Footer */}
        <div className="pt-6 sm:pt-8 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4 text-slate-400 text-[11px] text-center sm:text-left">
          <div>
            © {new Date().getFullYear()} <span className="text-slate-400 font-medium">LinkAura Corporation</span>. All rights reserved.
          </div>

          <div className="flex items-center gap-4">
            <span className="inline-flex items-center gap-1.5 text-slate-400">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              Secure Cloud Dispatch Operations
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
};
