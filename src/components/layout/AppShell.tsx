import React, { useState, useEffect } from 'react';
import { Sidebar, NavModule } from './Sidebar.tsx';
import { Header } from './Header.tsx';
import { useAuth } from '../../contexts/AuthContext.tsx';
import { EmptyState } from '../common/EmptyState.tsx';
import { Building, Plus } from 'lucide-react';
import { BillingAlertBanner } from '../../modules/billing/components/BillingAlertBanner.tsx';
import { subscriptionService } from '../../modules/billing/subscriptionService.ts';
import { SubscriptionUsageSummary } from '../../types/domain.types.ts';
import { communicationService } from '../../modules/communication/communicationService.ts';

interface AppShellProps {
  activeModule: NavModule;
  onSelectModule: (module: NavModule) => void;
  children: React.ReactNode;
  onCreateOrgClick?: (isFirstOrg?: boolean) => void;
  onOpenAuthModal?: () => void;
}

export const AppShell: React.FC<AppShellProps> = ({
  activeModule,
  onSelectModule,
  children,
  onCreateOrgClick,
  onOpenAuthModal,
}) => {
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [globalUsage, setGlobalUsage] = useState<SubscriptionUsageSummary | null>(null);
  const [unreadCommsCount, setUnreadCommsCount] = useState<number>(0);
  const { user, activeOrganization, memberships, isLoading } = useAuth();

  useEffect(() => {
    if (activeOrganization?.id) {
      subscriptionService
        .getSubscriptionUsage(activeOrganization.id)
        .then((u) => setGlobalUsage(u))
        .catch(() => {});
    }
  }, [activeOrganization?.id, activeModule]);

  // Global unread communication badge polling (every 20 seconds)
  useEffect(() => {
    if (!activeOrganization?.id || !user?.id) {
      setUnreadCommsCount(0);
      return;
    }

    let isMounted = true;

    const fetchUnread = async () => {
      try {
        const summary = await communicationService.getUnreadMessageCountForOrg(
          activeOrganization.id,
          user.id
        );
        if (isMounted) {
          setUnreadCommsCount(summary.total);
        }
      } catch (err) {
        console.warn('[AppShell] Failed to fetch unread communication count:', err);
      }
    };

    fetchUnread();
    const interval = setInterval(fetchUnread, 20000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [activeOrganization?.id, user?.id]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-400">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-sm font-medium">Loading DispatchDesk...</p>
      </div>
    );
  }

  // If user has zero organizations yet, show onboarding bootstrap state
  if (!activeOrganization && memberships.length === 0) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center px-4">
        <div className="max-w-md w-full space-y-4">
          <EmptyState
            id="empty-org-state"
            icon={Building}
            title={user ? 'Create Your Dispatch Organization' : 'Welcome to DispatchDesk'}
            description={
              user
                ? 'To begin managing clients, owner-operators, trucks, and loads with multi-tenant isolation, create your dispatch company workspace.'
                : 'Sign in to access your fleet operations workspace or create a new account to get started.'
            }
            actionLabel={user ? 'Create Dispatch Company' : 'Log In / Sign Up'}
            onAction={user ? () => onCreateOrgClick?.(true) : onOpenAuthModal}
          />
          {!user && onCreateOrgClick && (
            <div className="text-center">
              <button
                type="button"
                onClick={() => onCreateOrgClick?.(true)}
                className="text-xs text-slate-400 hover:text-slate-200 underline cursor-pointer"
              >
                Or create a local demo workspace
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Sidebar Navigation */}
      <Sidebar
        activeModule={activeModule}
        onSelectModule={onSelectModule}
        userRole={memberships.find(m => m.organization.id === activeOrganization?.id)?.role || null}
        isOpen={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
        onOpenAuthModal={onOpenAuthModal}
        unreadCommunicationCount={unreadCommsCount}
      />

      {/* Main Content Area */}
      <div className="lg:pl-64 flex flex-col min-h-screen w-full min-w-0">
        <Header
          onToggleSidebar={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
          onSelectModule={onSelectModule}
          onOpenAuthModal={onOpenAuthModal}
          onCreateOrgClick={onCreateOrgClick}
        />
        
        <main className="flex-1 p-4 sm:p-6 lg:p-7 max-w-[1600px] w-full min-w-0 mx-auto space-y-4">
          {activeModule !== 'billing' && globalUsage && (
            <BillingAlertBanner
              usage={globalUsage}
              onNavigateToBilling={() => onSelectModule('billing')}
            />
          )}
          {children}
        </main>
      </div>
    </div>
  );
};
