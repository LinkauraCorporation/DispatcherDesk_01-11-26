import React from 'react';
import { Menu, X, ArrowRight, LogIn } from 'lucide-react';

interface LandingHeaderProps {
  onLoginClick: () => void;
  onGetStartedClick: () => void;
  onLaunchWorkspaceClick?: () => void;
  onOpenContactClick: () => void;
}

export const LandingHeader: React.FC<LandingHeaderProps> = ({
  onLoginClick,
  onGetStartedClick,
  onOpenContactClick,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

  const scrollToSection = (id: string) => {
    setMobileMenuOpen(false);
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-800/80 bg-slate-950/90 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand Logo */}
        <div className="flex items-center min-w-0">
          <img
            src="/images/brand/dispatcherdesk-logo.png"
            alt="DispatcherDesk"
            className="h-8 sm:h-9 w-auto max-w-[190px] sm:max-w-[220px] object-contain"
          />
        </div>

        {/* Desktop Navigation Links */}
        <nav className="hidden lg:flex items-center gap-4 xl:gap-7 text-sm font-medium text-slate-300">
          <button
            onClick={() => scrollToSection('features')}
            className="hover:text-white transition-colors cursor-pointer"
          >
            Features
          </button>
          <button
            onClick={() => scrollToSection('workflow')}
            className="hover:text-white transition-colors cursor-pointer"
          >
            Workflow
          </button>
          <button
            onClick={() => scrollToSection('for-agencies')}
            className="hover:text-white transition-colors cursor-pointer"
          >
            Built for Agencies
          </button>
          <button
            onClick={() => scrollToSection('pricing')}
            className="hover:text-white transition-colors cursor-pointer"
          >
            Pricing
          </button>
          <button
            onClick={() => scrollToSection('how-it-works')}
            className="hover:text-white transition-colors cursor-pointer"
          >
            How It Works
          </button>
          <button
            onClick={onOpenContactClick}
            className="hover:text-white transition-colors cursor-pointer"
          >
            Contact
          </button>
        </nav>

        {/* Desktop CTA Action Buttons */}
        <div className="hidden lg:flex items-center gap-3">
          <button
            id="landing-header-login-btn"
            type="button"
            onClick={onLoginClick}
            className="px-3.5 py-2 text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800/80 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>Login</span>
          </button>

          <button
            id="landing-header-getstarted-btn"
            type="button"
            onClick={onGetStartedClick}
            className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-sm shadow-indigo-600/30 transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <span>Start Free Trial</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Mobile / Tablet Hamburger Toggle */}
        <div className="flex lg:hidden items-center gap-2 shrink-0">
          <button
            id="landing-mobile-menu-toggle"
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile / Tablet Drawer Menu */}
      {mobileMenuOpen && (
        <div className="lg:hidden border-b border-slate-800 bg-slate-950 px-4 pt-3 pb-6 space-y-4">
          <nav className="flex flex-col space-y-2.5 text-sm font-medium text-slate-300">
            <button
              onClick={() => scrollToSection('features')}
              className="text-left py-2 px-3 rounded-lg hover:bg-slate-900 hover:text-white cursor-pointer"
            >
              Features
            </button>
            <button
              onClick={() => scrollToSection('workflow')}
              className="text-left py-2 px-3 rounded-lg hover:bg-slate-900 hover:text-white cursor-pointer"
            >
              Workflow
            </button>
            <button
              onClick={() => scrollToSection('for-agencies')}
              className="text-left py-2 px-3 rounded-lg hover:bg-slate-900 hover:text-white cursor-pointer"
            >
              Built for Agencies
            </button>
            <button
              onClick={() => scrollToSection('pricing')}
              className="text-left py-2 px-3 rounded-lg hover:bg-slate-900 hover:text-white cursor-pointer"
            >
              Pricing
            </button>
            <button
              onClick={() => scrollToSection('how-it-works')}
              className="text-left py-2 px-3 rounded-lg hover:bg-slate-900 hover:text-white cursor-pointer"
            >
              How It Works
            </button>
            <button
              onClick={() => {
                setMobileMenuOpen(false);
                onOpenContactClick();
              }}
              className="text-left py-2 px-3 rounded-lg hover:bg-slate-900 hover:text-white cursor-pointer"
            >
              Contact
            </button>
          </nav>

          <div className="pt-3 border-t border-slate-800 flex flex-col gap-2.5">
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                onLoginClick();
              }}
              className="w-full py-2.5 text-xs font-semibold text-slate-200 bg-slate-900 hover:bg-slate-800 rounded-lg flex items-center justify-center gap-2 border border-slate-800 cursor-pointer"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Login</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                onGetStartedClick();
              }}
              className="w-full py-2.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg flex items-center justify-center gap-2 shadow-sm shadow-indigo-600/30 cursor-pointer"
            >
              <span>Start Free Trial</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
