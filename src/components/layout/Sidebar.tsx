import React from 'react';
import {
  LayoutDashboard,
  Users,
  Truck,
  UserCheck,
  Building2,
  PackageCheck,
  Kanban,
  DollarSign,
  FileText,
  MessageSquare,
  MessageSquareText,
  Bot,
  Settings,
  ShieldCheck,
  Radio,
  Timer,
  CheckSquare,
  Calendar,
  MapPin,
  LogOut,
  LogIn,
  CreditCard,
  Search,
} from 'lucide-react';
import { UserRole } from '../../types/domain.types.ts';
import { useAuth } from '../../contexts/AuthContext.tsx';

export type NavModule =
  | 'dashboard'
  | 'calendar'
  | 'map'
  | 'clients'
  | 'trucks'
  | 'drivers'
  | 'brokers'
  | 'loads'
  | 'pipeline'
  | 'workload'
  | 'communication'
  | 'checkcalls'
  | 'accessorials'
  | 'tasks'
  | 'profitability'
  | 'lead-finder'
  | 'documents'
  | 'notes'
  | 'ai'
  | 'billing'
  | 'settings';

interface NavItem {
  id: NavModule;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  sub?: string;
  badge?: string;
}

interface SidebarProps {
  activeModule: NavModule;
  onSelectModule: (module: NavModule) => void;
  userRole: UserRole | null;
  isOpen: boolean;
  onCloseMobile: () => void;
  onOpenAuthModal?: () => void;
  unreadCommunicationCount?: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeModule,
  onSelectModule,
  userRole,
  isOpen,
  onCloseMobile,
  onOpenAuthModal,
  unreadCommunicationCount,
}) => {
  const { user, signOut } = useAuth();
  const isOwnerAdmin = userRole === 'owner_admin';

  const mainNavItems = [
    { id: 'dashboard' as NavModule, label: 'Dashboard', icon: LayoutDashboard },
    { id: 'calendar' as NavModule, label: 'Operations Calendar', icon: Calendar, sub: 'Timeline & Docks' },
    { id: 'map' as NavModule, label: 'Dispatch Map', icon: MapPin, sub: 'Stop Sequence Viz', badge: 'V1' },
    { id: 'pipeline' as NavModule, label: 'Load Pipeline', icon: Kanban, badge: '7 Stages' },
    { id: 'loads' as NavModule, label: 'Loads & Dispatches', icon: PackageCheck },
    ...(isOwnerAdmin || userRole === null
      ? [{ id: 'workload' as NavModule, label: 'Team Workload', icon: Users, sub: 'Assignment Overview', badge: 'Admin' }]
      : []),
    {
      id: 'communication' as NavModule,
      label: 'Driver Comms',
      icon: MessageSquare,
      sub: 'In-App Dispatch Chat',
      badge:
        unreadCommunicationCount && unreadCommunicationCount > 0
          ? String(unreadCommunicationCount)
          : undefined,
    },
    { id: 'checkcalls' as NavModule, label: 'Load Tracking', icon: Radio, sub: 'Live Check Calls' },
    { id: 'accessorials' as NavModule, label: 'Accessorials & Detention', icon: Timer, sub: 'Detention Clocks' },
    { id: 'tasks' as NavModule, label: 'Tasks & Reminders', icon: CheckSquare, sub: 'Action Reminders' },
    { id: 'profitability' as NavModule, label: 'Profitability', icon: DollarSign },
    { id: 'lead-finder' as NavModule, label: 'Lead Finder', icon: Search },
  ];

  const fleetNavItems = [
    { id: 'clients' as NavModule, label: 'Carrier Clients', icon: Users, sub: 'Owner-Ops & Fleets' },
    { id: 'trucks' as NavModule, label: 'Truck Roster', icon: Truck },
    { id: 'drivers' as NavModule, label: 'Drivers', icon: UserCheck },
    { id: 'brokers' as NavModule, label: 'Brokers / Shippers', icon: Building2 },
  ];

  const backOfficeItems: NavItem[] = [
    { id: 'billing' as NavModule, label: 'Billing & Plans', icon: CreditCard, sub: 'Capacity & Invoices' },
    { id: 'documents' as NavModule, label: 'Documents', icon: FileText, sub: 'Rate Con / BOL / POD' },
    { id: 'notes' as NavModule, label: 'Activity & Notes', icon: MessageSquareText, sub: 'Audit & Shift Handover' },
    { id: 'ai' as NavModule, label: 'AI Assistant', icon: Bot },
    { id: 'settings' as NavModule, label: 'Settings & Security', icon: Settings },
  ];

  const handleNavClick = (id: NavModule) => {
    if (id === 'lead-finder') {
      window.open('/lead-finder', '_blank', 'noopener,noreferrer');
      onCloseMobile();
      return;
    }

    onSelectModule(id);
    onCloseMobile();
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/80 backdrop-blur-xs lg:hidden"
          onClick={onCloseMobile}
        />
      )}

      <aside
        id="app-sidebar"
        className={`fixed top-0 bottom-0 left-0 z-40 w-64 bg-slate-950 border-r border-slate-800/80 flex flex-col transition-transform duration-200 ease-in-out lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div className="h-16 flex items-center px-5 border-b border-slate-800/80 bg-slate-950 shrink-0">
          <div className="flex items-center min-w-0">
            <img
              src="/images/brand/dispatcherdesk-logo.png"
              alt="DispatcherDesk"
              className="h-8 w-auto max-w-[190px] object-contain"
            />
          </div>
        </div>

        {/* Scrollable Navigation */}
        <div className="flex-1 min-h-0 overflow-y-auto px-3 py-4 space-y-6 overscroll-contain">
          {/* Section 1: Operations */}
          <div>
            <p className="px-3 text-[10px] font-bold tracking-wider text-slate-400 uppercase">
              Operations
            </p>
            <nav className="mt-1.5 space-y-0.5">
              {mainNavItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeModule === item.id;
                return (
                  <button
                    key={item.id}
                    id={`nav-item-${item.id}`}
                    onClick={() => handleNavClick(item.id)}
                    className={`w-full flex items-center justify-between px-3 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                      isActive
                        ? 'bg-indigo-600/15 text-indigo-300 border border-indigo-500/30 shadow-xs'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/80'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-indigo-400' : 'text-slate-400'}`} />
                      <span className="truncate">{item.label}</span>
                    </div>
                    {item.badge && (
                      <span
                        id={`sidebar-badge-${item.id}`}
                        className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                          item.id === 'communication'
                            ? 'bg-indigo-600 text-white animate-pulse'
                            : 'bg-slate-800/80 text-slate-400 border border-slate-700/60'
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Section 2: Fleet & Partners */}
          <div>
            <p className="px-3 text-[10px] font-bold tracking-wider text-slate-400 uppercase">
              Fleet & Partners
            </p>
            <nav className="mt-1.5 space-y-0.5">
              {fleetNavItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeModule === item.id;
                return (
                  <button
                    key={item.id}
                    id={`nav-item-${item.id}`}
                    onClick={() => handleNavClick(item.id)}
                    className={`w-full flex items-center justify-between px-3 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                      isActive
                        ? 'bg-indigo-600/15 text-indigo-300 border border-indigo-500/30 shadow-xs'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/80'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-indigo-400' : 'text-slate-400'}`} />
                      <span className="truncate">{item.label}</span>
                    </div>
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Section 3: Back Office & Intelligence */}
          <div>
            <p className="px-3 text-[10px] font-bold tracking-wider text-slate-400 uppercase">
              Back Office & Intel
            </p>
            <nav className="mt-1.5 space-y-0.5">
              {backOfficeItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeModule === item.id;
                return (
                  <button
                    key={item.id}
                    id={`nav-item-${item.id}`}
                    onClick={() => handleNavClick(item.id)}
                    className={`w-full flex items-center justify-between px-3 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                      isActive
                        ? 'bg-indigo-600/15 text-indigo-300 border border-indigo-500/30 shadow-xs'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/80'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-indigo-400' : 'text-slate-400'}`} />
                      <span className="truncate">{item.label}</span>
                    </div>
                    {item.badge && (
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-indigo-950/60 text-indigo-300 border border-indigo-800/40">
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          </div>
        </div>

        {/* Multi-Tenant Security Footnote & Auth status */}
        <div className="p-3 border-t border-slate-800/80 bg-slate-950/90 text-xs space-y-2 shrink-0">
          <div className="flex items-center gap-2 text-slate-400">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span className="truncate">RLS Tenant Isolation Active</span>
          </div>
          {userRole && (
            <div className="text-[11px] text-slate-400">
              Role: <span className="text-slate-300 font-medium uppercase">{userRole.replace('_', ' ')}</span>
            </div>
          )}

          {user ? (
            <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between">
              <span className="text-[11px] text-slate-400 truncate max-w-[130px]" title={user.email}>
                {user.email}
              </span>
              <button
                id="sidebar-signout-btn"
                onClick={() => signOut()}
                className="inline-flex items-center gap-1 text-[11px] text-rose-400 hover:text-rose-300 transition-colors cursor-pointer font-medium"
              >
                <LogOut className="w-3 h-3" />
                <span>Sign Out</span>
              </button>
            </div>
          ) : (
            <div className="pt-2 border-t border-slate-800/60">
              <button
                id="sidebar-login-btn"
                onClick={onOpenAuthModal}
                className="w-full py-1.5 px-2.5 text-xs font-semibold text-indigo-300 hover:text-white bg-indigo-950/60 hover:bg-indigo-900 border border-indigo-800/50 rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1.5"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Log In / Sign Up</span>
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
};


