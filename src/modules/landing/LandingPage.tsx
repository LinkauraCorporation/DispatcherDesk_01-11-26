import React, { useState, useEffect } from 'react';
import { LandingHeader } from './LandingHeader.tsx';
import { LandingHero } from './LandingHero.tsx';
import { LandingProblem } from './LandingProblem.tsx';
import { LandingCoreOperations } from './LandingCoreOperations.tsx';
import { LandingWorkflow } from './LandingWorkflow.tsx';
import { LandingBuiltForAgencies } from './LandingBuiltForAgencies.tsx';
import { LandingPricing } from './LandingPricing.tsx';
import { LandingHowItWorks } from './LandingHowItWorks.tsx';
import { LandingFinalCta } from './LandingFinalCta.tsx';
import { LandingFooter } from './LandingFooter.tsx';
import { LandingPolicyModal, PolicyType } from './LandingPolicyModal.tsx';
import { LandingContactModal } from './LandingContactModal.tsx';

interface LandingPageProps {
  onLoginClick: () => void;
  onGetStartedClick: () => void;
  onLaunchWorkspaceClick: () => void;
  onDriverLoginClick?: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  onLoginClick,
  onGetStartedClick,
  onLaunchWorkspaceClick,
  onDriverLoginClick,
}) => {
  const [activePolicy, setActivePolicy] = useState<PolicyType | null>(null);
  const [isContactModalOpen, setIsContactModalOpen] = useState(false);
  const [contactTopic, setContactTopic] = useState<string>('General Inquiry');

  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash.toLowerCase().replace(/^#/, '');
      if (
        hash === 'terms' ||
        hash === 'privacy' ||
        hash === 'refund' ||
        hash === 'delivery' ||
        hash === 'about'
      ) {
        setActivePolicy(hash as PolicyType);
      }
    };

    handleHash();
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  const handleClosePolicy = () => {
    setActivePolicy(null);
    const hash = window.location.hash.toLowerCase().replace(/^#/, '');
    if (
      hash === 'terms' ||
      hash === 'privacy' ||
      hash === 'refund' ||
      hash === 'delivery' ||
      hash === 'about'
    ) {
      if (window.history && window.history.replaceState) {
        window.history.replaceState(null, document.title, window.location.pathname + window.location.search);
      }
    }
  };

  const handleOpenContact = (topic: string = 'General Inquiry') => {
    setContactTopic(topic);
    setIsContactModalOpen(true);
  };

  const handleSeeHowItWorks = () => {
    const el = document.getElementById('how-it-works');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-indigo-600 selection:text-white overflow-x-hidden w-full">
      {/* Driver Mobile Portal Quick Access */}
      {onDriverLoginClick && (
        <div
          id="driver-portal-quick-banner"
          className="bg-slate-900 border-b border-slate-800 px-4 py-2 text-xs flex flex-wrap items-center justify-between gap-2 z-40 relative"
        >
          <div className="flex items-center gap-2 text-slate-300">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-semibold text-emerald-400">Carrier Driver?</span>
            <span className="text-slate-400 text-[11px] sm:text-xs">
              Log in with your mobile phone number to access your assigned dispatches & documents.
            </span>
          </div>
          <button
            type="button"
            id="btn-landing-driver-portal"
            onClick={onDriverLoginClick}
            className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-lg transition-colors text-xs flex items-center gap-1.5 cursor-pointer shadow-sm shadow-emerald-950"
          >
            <span>Driver Portal Login</span>
            <span>→</span>
          </button>
        </div>
      )}

      {/* 1. Sticky Navigation Header */}
      <LandingHeader
        onLoginClick={onLoginClick}
        onGetStartedClick={onGetStartedClick}
        onLaunchWorkspaceClick={onLaunchWorkspaceClick}
        onOpenContactClick={() => handleOpenContact('General Inquiry')}
      />

      <main className="flex-1">
        {/* 2. Hero Section */}
        <LandingHero
          onGetStartedClick={onGetStartedClick}
          onSeeHowItWorksClick={handleSeeHowItWorks}
          onLaunchWorkspaceClick={onLaunchWorkspaceClick}
        />

        {/* 3. Problem / Value Proposition Section */}
        <LandingProblem onGetStartedClick={onGetStartedClick} />

        {/* 4. Core Operations Feature Section */}
        <LandingCoreOperations />

        {/* 5. 10-Step Operational Workflow Section */}
        <LandingWorkflow />

        {/* 6. Built for Dispatch Companies Section */}
        <LandingBuiltForAgencies />

        {/* 7. Pricing Philosophy Section */}
        <LandingPricing
          onGetStartedClick={onGetStartedClick}
          onViewPricingClick={() => handleOpenContact('pricing')}
        />

        {/* 8. 3-Step How It Works Section */}
        <LandingHowItWorks onGetStartedClick={onGetStartedClick} />

        {/* 9. Final Closing CTA Section */}
        <LandingFinalCta
          onGetStartedClick={onGetStartedClick}
          onContactClick={() => handleOpenContact('General Inquiry')}
        />
      </main>

      {/* Dedicated Driver Portal Footer Access */}
      {onDriverLoginClick && (
        <div className="bg-slate-950 border-t border-slate-900 py-3 px-4 text-center">
          <p className="text-xs text-slate-400">
            Carrier driver looking for your active dispatch?{' '}
            <button
              type="button"
              id="btn-footer-driver-portal"
              onClick={onDriverLoginClick}
              className="text-emerald-400 hover:text-emerald-300 font-semibold underline underline-offset-2 ml-1 cursor-pointer transition-colors"
            >
              Log in to Driver Mobile Portal with SMS Code →
            </button>
          </p>
        </div>
      )}

      {/* 10. Professional SaaS Footer */}
      <LandingFooter
        onLoginClick={onLoginClick}
        onGetStartedClick={onGetStartedClick}
        onOpenPolicy={(policy) => setActivePolicy(policy)}
        onOpenContactClick={() => handleOpenContact('General Inquiry')}
      />

      {/* Legal & Policy Modals */}
      <LandingPolicyModal
        policyType={activePolicy}
        onClose={handleClosePolicy}
      />

      {/* Contact & Custom Pricing Request Modal */}
      <LandingContactModal
        isOpen={isContactModalOpen}
        onClose={() => setIsContactModalOpen(false)}
        defaultTopic={contactTopic}
      />
    </div>
  );
};
