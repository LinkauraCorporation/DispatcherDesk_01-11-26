import { LeadFinderView } from './modules/lead-finder/LeadFinderView.tsx';
import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext.tsx';
import { TimezoneProvider } from './contexts/TimezoneContext.tsx';
import { AppShell } from './components/layout/AppShell.tsx';

// Modules
import { DashboardView } from './modules/dashboard/DashboardView.tsx';
import { ClientsView } from './modules/clients/ClientsView.tsx';
import { BrokersView } from './modules/brokers/BrokersView.tsx';
import { TrucksView } from './modules/trucks/TrucksView.tsx';
import { DriversView } from './modules/drivers/DriversView.tsx';
import { LoadsView } from './modules/loads/LoadsView.tsx';
import { PipelineView } from './modules/pipeline/PipelineView.tsx';
import { ProfitabilityView } from './modules/profitability/ProfitabilityView.tsx';
import { DocumentsView } from './modules/documents/DocumentsView.tsx';
import { NotesView } from './modules/notes/NotesView.tsx';
import { AIAssistantView } from './modules/ai/AIAssistantView.tsx';
import { SettingsView } from './modules/settings/SettingsView.tsx';
import { BillingView } from './modules/billing/BillingView.tsx';
import { CheckCallsView } from './modules/checkcalls/CheckCallsView.tsx';
import { AccessorialsView } from './modules/accessorials/AccessorialsView.tsx';
import { TasksView } from './modules/tasks/TasksView.tsx';
import { CalendarView } from './modules/calendar/CalendarView.tsx';
import { DispatchMapView } from './modules/map/DispatchMapView.tsx';
import { WorkloadView } from './modules/workload/WorkloadView.tsx';
import { CommunicationView } from './modules/communication/CommunicationView.tsx';

import { NavModule } from './components/layout/Sidebar.tsx';

// Modals & Onboarding
import { AuthModal } from './modules/auth/AuthModal.tsx';
import { DriverPhoneLoginModal } from './modules/auth/DriverPhoneLoginModal.tsx';
import { OnboardingOrgModal } from './modules/auth/OnboardingOrgModal.tsx';
import { InvitationAcceptView } from './modules/team/InvitationAcceptView.tsx';
import { ResetPasswordView } from './modules/auth/ResetPasswordView.tsx';
import { FirstTimeOnboardingView } from './modules/onboarding/FirstTimeOnboardingView.tsx';
import { DriverPortalView } from './modules/drivers/DriverPortalView.tsx';
import { LandingPage } from './modules/landing/LandingPage.tsx';
import { Load } from './types/domain.types.ts';
import { CheckCircle2 } from 'lucide-react';

const getOnboardingStorageKey = (userId?: string | null) =>
  `dispatchdesk_first_time_setup_${userId || 'guest'}`;

const MainApp: React.FC = () => {
  const {
    user,
    activeOrganization,
    memberships,
    userRole,
    isDriver,
    isLoading,
    isResolvingUserData,
    isPasswordRecovery,
    recoveryError,
    clearPasswordRecovery,
    signOut,
  } = useAuth();

  const isEmailVerified = !user?.email || Boolean(user?.email_confirmed_at || (user as any)?.confirmed_at);
  const isAuthenticated = Boolean(user && isEmailVerified && !isPasswordRecovery);

  const [activeModule, setActiveModule] =
    useState<NavModule>('dashboard');

  const [isBookLoadModalOpen, setIsBookLoadModalOpen] =
    useState(false);

  const [isAuthModalOpen, setIsAuthModalOpen] =
    useState(false);

  const [authModalInitialEmail, setAuthModalInitialEmail] =
    useState<string | undefined>(undefined);

  const [isDriverPhoneModalOpen, setIsDriverPhoneModalOpen] =
    useState(false);

  const [isOnboardingModalOpen, setIsOnboardingModalOpen] =
    useState(false);

  const [isFirstOrgModal, setIsFirstOrgModal] =
    useState(false);

  const [isInFirstTimeOnboarding, setIsInFirstTimeOnboarding] =
    useState(false);

  const [toastMessage, setToastMessage] =
    useState<string | null>(null);

  const [invitationToken, setInvitationToken] =
    useState<string | null>(null);

  /*
   * IMPORTANT:
   * View state is intentionally NOT restored from localStorage/URL
   * on initial render.
   *
   * Authentication is the source of truth:
   * - Logged out  -> LandingPage
   * - Logged in   -> AppShell
   *
   * This prevents a stale "app" preference from hiding the
   * public landing page after logout or on a fresh visit.
   */
  const [currentView, setCurrentView] =
    useState<'landing' | 'app'>('landing');

  const prevUserRef = React.useRef(user);

  // If recovery link had an expired/invalid token error, alert the user and open login modal
  useEffect(() => {
    if (recoveryError) {
      setToastMessage(recoveryError);
      setIsAuthModalOpen(true);
    }
  }, [recoveryError]);

  useEffect(() => {
    /*
     * If user is in password recovery mode, DO NOT route into normal application.
     */
    if (isPasswordRecovery) {
      return;
    }

    /*
     * Authenticated users always enter the application shell.
     */
    if (user && isEmailVerified) {
      setCurrentView('app');

      try {
        localStorage.setItem(
          'dispatcherdesk_view_preference',
          'app'
        );
      } catch {
        // ignore
      }
    } else if (prevUserRef.current && (!user || !isEmailVerified)) {
      /*
       * User logged out or unverified:
       * return to public landing page and clear stale app preference.
       */
      setCurrentView('landing');

      try {
        localStorage.removeItem(
          'dispatcherdesk_view_preference'
        );

        if (
          window.location.pathname === '/app' ||
          window.location.search.includes('view=app') ||
          window.location.hash === '#app'
        ) {
          window.history.pushState(
            {},
            document.title,
            '/'
          );
        }
      } catch {
        // ignore
      }
    }

    prevUserRef.current = user;
  }, [user, isEmailVerified]);

  /*
   * Launch Workspace:
   * Logged-out visitors must authenticate first.
   * Authenticated users can enter the workspace normally.
   */
  const handleLaunchWorkspace = () => {
    if (!user) {
      setIsAuthModalOpen(true);
      return;
    }

    setCurrentView('app');

    try {
      localStorage.setItem(
        'dispatcherdesk_view_preference',
        'app'
      );

      if (
        window.history &&
        window.history.pushState
      ) {
        window.history.pushState(
          {},
          document.title,
          '/app'
        );
      }
    } catch {
      // ignore
    }
  };

  // Derive whether an invitation flow is active in state or persisted session storage
  const hasActiveInvitationFlow = Boolean(
    invitationToken ||
    (typeof window !== 'undefined' && (
      sessionStorage.getItem('dispatchdesk_invitation_token') ||
      sessionStorage.getItem('dispatchdesk_invite_pending_otp') ||
      window.location.search.includes('invitation_token') ||
      window.location.search.includes('token') ||
      window.location.hash.includes('invitation_token')
    ))
  );

  // Auto-present organization onboarding when an authenticated user has zero organizations (office roles only)
  useEffect(() => {
    if (
      !hasActiveInvitationFlow &&
      user &&
      isEmailVerified &&
      !isLoading &&
      !isResolvingUserData &&
      !isDriver &&
      userRole !== 'driver' &&
      memberships.length === 0 &&
      !activeOrganization &&
      !user.phone
    ) {
      handleOpenCreateOrg(true);
    }
  }, [
    hasActiveInvitationFlow,
    user,
    isEmailVerified,
    isLoading,
    isResolvingUserData,
    isDriver,
    userRole,
    memberships.length,
    activeOrganization,
  ]);

  // Resume support: Check if the user is in an active, uncompleted first-time onboarding for this org
  useEffect(() => {
    if (!activeOrganization || !isEmailVerified) {
      setIsInFirstTimeOnboarding(false);
      return;
    }

    const storageKey =
      getOnboardingStorageKey(user?.id);

    try {
      const savedRaw =
        localStorage.getItem(storageKey);

      if (savedRaw) {
        const parsed = JSON.parse(savedRaw);

        if (
          parsed &&
          parsed.orgId === activeOrganization.id &&
          !parsed.isComplete
        ) {
          setIsInFirstTimeOnboarding(true);
          return;
        }
      }
    } catch {
      // ignore
    }

    setIsInFirstTimeOnboarding(false);
  }, [
    user?.id,
    activeOrganization?.id,
    isEmailVerified,
  ]);

  // Auto-dismiss toast after 6 seconds
  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(
        () => setToastMessage(null),
        6000
      );

      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  const handleOpenCreateOrg = (
    isFirst: boolean = false
  ) => {
    // Prevent opening organization creation modal during an active/pending invitation onboarding flow
    if (isFirst && hasActiveInvitationFlow) {
      return;
    }

    if (isFirst && !isEmailVerified) {
      setIsAuthModalOpen(true);
      return;
    }
    setIsFirstOrgModal(isFirst);
    setIsOnboardingModalOpen(true);
  };

  const handleOrgCreated = (
    newOrgId: string,
    isFirst: boolean
  ) => {
    if (isFirst) {
      if (!isEmailVerified) {
        console.warn('Blocked organization onboarding: Email is not verified.');
        return;
      }
      // First-time onboarding: Start FirstTimeOnboardingView, do NOT show Dashboard
      setIsInFirstTimeOnboarding(true);

      const storageKey =
        getOnboardingStorageKey(user?.id);

      try {
        localStorage.setItem(
          storageKey,
          JSON.stringify({
            orgId: newOrgId,
            step: 1,
            client: null,
            truck: null,
            driver: null,
            broker: null,
            isComplete: false,
            lastUpdated:
              new Date().toISOString(),
          })
        );
      } catch (err) {
        console.warn(
          'Failed to save onboarding initial state:',
          err
        );
      }
    } else {
      // Additional organization: activate new organization, open normal Dashboard shell,
      // automatically activate clients module/view, do NOT show linear first-time onboarding.
      setIsInFirstTimeOnboarding(false);
      setActiveModule('clients');

      const storageKey =
        getOnboardingStorageKey(user?.id);

      try {
        localStorage.removeItem(storageKey);
      } catch {
        // ignore
      }
    }
  };

  const handleOnboardingComplete = (
    createdLoad: Load
  ) => {
    const storageKey =
      getOnboardingStorageKey(user?.id);

    try {
      localStorage.removeItem(storageKey);
    } catch {
      // ignore
    }

    setIsInFirstTimeOnboarding(false);
    setActiveModule('dashboard');

    const loadRef =
      createdLoad.load_number.startsWith('#')
        ? createdLoad.load_number
        : `#${createdLoad.load_number}`;

    setToastMessage(
      `Setup complete! Load ${loadRef} is now active in your dispatch pipeline.`
    );
  };

  // Detect invitation token in URL query params, hash, or sessionStorage to ensure token survives reload
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const url = new URL(
        window.location.href
      );

      const queryToken =
        url.searchParams.get(
          'invitation_token'
        ) ||
        url.searchParams.get('token');

      let extractedToken: string | null = null;

      if (queryToken) {
        extractedToken = queryToken;
      } else if (
        window.location.hash.includes(
          'invitation_token='
        )
      ) {
        const hashMatch =
          window.location.hash.match(
            /invitation_token=([^&]+)/
          );

        if (
          hashMatch &&
          hashMatch[1]
        ) {
          extractedToken =
            decodeURIComponent(
              hashMatch[1]
            );
        }
      }

      // Check sessionStorage if token not present in current URL (e.g. page refresh)
      if (!extractedToken) {
        try {
          const stored = sessionStorage.getItem('dispatchdesk_invitation_token');
          if (stored && stored.trim()) {
            extractedToken = stored.trim();
          }
        } catch {
          // ignore
        }
      }

      if (extractedToken) {
        try {
          sessionStorage.setItem('dispatchdesk_invitation_token', extractedToken);
        } catch {
          // ignore
        }

        setInvitationToken(
          extractedToken
        );

        // Clean URL immediately so raw token does not linger in address bar or history
        if (
          window.history &&
          window.history.replaceState
        ) {
          url.searchParams.delete(
            'invitation_token'
          );

          url.searchParams.delete(
            'token'
          );

          if (
            url.hash.includes(
              'invitation_token='
            )
          ) {
            url.hash =
              url.hash
                .replace(
                  /invitation_token=[^&]+&?/,
                  ''
                )
                .replace(
                  /[?&]$/,
                  ''
                )
                .replace(
                  /#$/,
                  ''
                );
          }

          const cleanPath =
            url.pathname +
            (url.search
              ? url.search
              : '') +
            (url.hash
              ? url.hash
              : '');

          window.history.replaceState(
            {},
            document.title,
            cleanPath || '/'
          );
        }
      }
    }
  }, []);

  const handleDismissInvitation = () => {
    try {
      sessionStorage.removeItem('dispatchdesk_invitation_token');
      sessionStorage.removeItem('dispatchdesk_invite_pending_otp');
    } catch {
      // ignore
    }

    setInvitationToken(null);

    if (
      typeof window !== 'undefined' &&
      window.history &&
      window.history.replaceState
    ) {
      window.history.replaceState(
        {},
        document.title,
        window.location.pathname
      );
    }
  };

  const handleInvitationAccepted = (
    joinedOrgId: string
  ) => {
    try {
      sessionStorage.removeItem('dispatchdesk_invitation_token');
      sessionStorage.removeItem('dispatchdesk_invite_pending_otp');
    } catch {
      // ignore
    }

    setInvitationToken(null);
    setCurrentView('app');
    setActiveModule('dashboard');
  };

  // If viewing an invitation link, render the dedicated invitation acceptance page
  if (invitationToken) {
    return (
      <InvitationAcceptView
        rawToken={invitationToken}
        onAccepted={
          handleInvitationAccepted
        }
        onDismiss={
          handleDismissInvitation
        }
      />
    );
  }

  // Standalone FMCSA Lead Finder page
  if (window.location.pathname === '/lead-finder') {
    return <LeadFinderView />;
  }
  const renderModuleContent = () => {
    switch (activeModule) {
      case 'dashboard':
        return (
          <DashboardView
            onNavigate={(mod: string) =>
              setActiveModule(
                mod as NavModule
              )
            }
            onNewLoadClick={() => {
              setActiveModule('loads');
              setIsBookLoadModalOpen(true);
            }}
          />
        );

      case 'calendar':
        return (
          <CalendarView
            onNewLoadClick={() => {
              setActiveModule('loads');
              setIsBookLoadModalOpen(true);
            }}
          />
        );

      case 'map':
        return (
          <DispatchMapView
            onNewLoadClick={() => {
              setActiveModule('loads');
              setIsBookLoadModalOpen(true);
            }}
          />
        );

      case 'clients':
        return <ClientsView />;

      case 'brokers':
        return <BrokersView />;

      case 'trucks':
        return (
          <TrucksView
            onNavigate={setActiveModule}
          />
        );

      case 'drivers':
        return (
          <DriversView
            onNavigate={setActiveModule}
          />
        );

      case 'loads':
        return (
          <LoadsView
            isModalOpenExternal={
              isBookLoadModalOpen
            }
            onCloseModalExternal={() =>
              setIsBookLoadModalOpen(false)
            }
            onNavigate={
              setActiveModule
            }
          />
        );

      case 'pipeline':
        return (
          <PipelineView
            onNavigate={(mod: string) =>
              setActiveModule(
                mod as NavModule
              )
            }
            onNewLoadClick={() => {
              setActiveModule('loads');
              setIsBookLoadModalOpen(true);
            }}
          />
        );

      case 'workload':
        return (
          <WorkloadView
            onNavigateToLoads={(
              filterKey,
              filterVal
            ) => {
              setActiveModule('loads');
            }}
            onNavigateToDashboard={() =>
              setActiveModule('dashboard')
            }
          />
        );

      case 'communication':
        return <CommunicationView />;

      case 'checkcalls':
        return <CheckCallsView />;

      case 'accessorials':
        return <AccessorialsView />;

      case 'tasks':
        return <TasksView />;

      case 'profitability':
        return (
          <ProfitabilityView />
        );

      case 'documents':
        return (
          <DocumentsView
            onNavigate={
              setActiveModule
            }
          />
        );

      case 'notes':
        return <NotesView />;

      case 'ai':
        return <AIAssistantView />;

      case 'billing':
        return <BillingView />;

      case 'settings':
        return (
          <SettingsView
            onNavigateToBilling={() =>
              setActiveModule(
                'billing'
              )
            }
          />
        );

      default:
        return (
          <DashboardView
            onNavigate={(mod: string) =>
              setActiveModule(
                mod as NavModule
              )
            }
            onNewLoadClick={() => {
              setActiveModule('loads');
              setIsBookLoadModalOpen(true);
            }}
          />
        );
    }
  };

  // Dedicated Password Recovery / Reset View
  if (isPasswordRecovery) {
    return (
      <ResetPasswordView
        userEmail={user?.email}
        onSuccess={(email) => {
          clearPasswordRecovery();
          setCurrentView('landing');
          if (email) {
            setAuthModalInitialEmail(email);
          }
          setIsAuthModalOpen(true);
          setToastMessage('Password updated successfully. Please sign in with your new password.');
        }}
        onCancel={() => {
          clearPasswordRecovery();
          try {
            signOut().catch(() => {});
          } catch {}
          setCurrentView('landing');
          setIsAuthModalOpen(true);
        }}
      />
    );
  }

  // Dedicated Driver Mobile Portal (Persistent Carrier Driver Identity)
  // Drivers NEVER see office navigation or internal organizational sidebars
  if (
    isDriver ||
    userRole === 'driver'
  ) {
    return <DriverPortalView />;
  }

  // Loading state while restoring session authentication
  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-400">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-sm font-medium">
          Loading DispatchDesk...
        </p>
      </div>
    );
  }

  // Dedicated linear first-time onboarding wizard for brand-new organization
  if (
    isInFirstTimeOnboarding &&
    activeOrganization
  ) {
    return (
      <>
        <FirstTimeOnboardingView
          organization={
            activeOrganization
          }
          onComplete={
            handleOnboardingComplete
          }
        />

        {toastMessage && (
          <div
            id="onboarding-success-toast"
            className="fixed bottom-6 right-6 z-50 flex items-center gap-3 bg-emerald-950/95 border border-emerald-500/80 text-emerald-200 px-4 py-3 rounded-xl shadow-2xl text-xs sm:text-sm animate-in fade-in slide-in-from-bottom-4 duration-300"
          >
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />

            <span className="font-medium">
              {toastMessage}
            </span>

            <button
              type="button"
              onClick={() =>
                setToastMessage(
                  null
                )
              }
              className="ml-2 text-emerald-400 hover:text-emerald-200 text-xs font-bold cursor-pointer"
            >
              âœ•
            </button>
          </div>
        )}
      </>
    );
  }

  /*
   * PUBLIC LANDING PAGE
   *
   * Authentication is the source of truth.
   * Any unauthenticated visitor sees the landing page,
   * regardless of stale localStorage or previous /app state.
   */
  if (!isAuthenticated) {
    return (
      <>
        <LandingPage
          onLoginClick={() =>
            setIsAuthModalOpen(true)
          }
          onGetStartedClick={() =>
            setIsAuthModalOpen(true)
          }
          onLaunchWorkspaceClick={
            handleLaunchWorkspace
          }
          onDriverLoginClick={() =>
            setIsDriverPhoneModalOpen(true)
          }
        />

        {/* Global Modals for Sign In / Sign Up from Landing */}
        <AuthModal
          isOpen={
            isAuthModalOpen
          }
          onClose={() =>
            setIsAuthModalOpen(false)
          }
          initialEmail={authModalInitialEmail || (user && !isEmailVerified ? user.email : undefined)}
          initialStep={user && !isEmailVerified ? 'verify_email' : 'auth'}
          onSuccessSignUp={() => {
            setCurrentView('app');
            handleOpenCreateOrg(
              true
            );
          }}
          onSuccessSignIn={() => {
            setCurrentView('app');
          }}
        />

        {/* Dedicated Driver Phone OTP Login Modal */}
        <DriverPhoneLoginModal
          isOpen={isDriverPhoneModalOpen}
          onClose={() => setIsDriverPhoneModalOpen(false)}
        />
      </>
    );
  }

  return (
    <>
      <AppShell
        activeModule={
          activeModule
        }
        onSelectModule={(
          mod: NavModule
        ) =>
          setActiveModule(mod)
        }
        onCreateOrgClick={(
          isFirst
        ) =>
          handleOpenCreateOrg(
            isFirst ?? false
          )
        }
        onOpenAuthModal={() =>
          setIsAuthModalOpen(true)
        }
      >
        {renderModuleContent()}
      </AppShell>

      {/* Global Toast Notification */}
      {toastMessage && (
        <div
          id="global-success-toast"
          className="fixed bottom-6 right-6 z-50 flex items-center gap-3 bg-emerald-950/95 border border-emerald-500/80 text-emerald-200 px-4 py-3 rounded-xl shadow-2xl text-xs sm:text-sm animate-in fade-in slide-in-from-bottom-4 duration-300"
        >
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />

          <span className="font-medium">
            {toastMessage}
          </span>

          <button
            type="button"
            onClick={() =>
              setToastMessage(null)
            }
            className="ml-2 text-emerald-400 hover:text-emerald-200 text-xs font-bold cursor-pointer"
          >
            âœ•
          </button>
        </div>
      )}

      {/* Global Modals */}
      <AuthModal
        isOpen={
          isAuthModalOpen
        }
        onClose={() =>
          setIsAuthModalOpen(false)
        }
        onSuccessSignUp={() => {
          setCurrentView('app');
          handleOpenCreateOrg(
            true
          );
        }}
        onSuccessSignIn={() => {
          setCurrentView('app');
        }}
      />

      <OnboardingOrgModal
        isOpen={
          isOnboardingModalOpen
        }
        onClose={() =>
          setIsOnboardingModalOpen(
            false
          )
        }
        isFirstOrg={
          isFirstOrgModal
        }
        onSuccess={
          handleOrgCreated
        }
      />

      <DriverPhoneLoginModal
        isOpen={isDriverPhoneModalOpen}
        onClose={() => setIsDriverPhoneModalOpen(false)}
      />
    </>
  );
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <TimezoneProvider>
        <MainApp />
      </TimezoneProvider>
    </AuthProvider>
  );
};

export default App;


