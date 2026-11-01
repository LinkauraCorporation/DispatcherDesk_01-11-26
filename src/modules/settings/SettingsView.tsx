import React, { useState } from 'react';
import {
  Settings as SettingsIcon,
  Shield,
  Users,
  Building,
  Key,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext.tsx';
import { StatusBadge } from '../../components/common/StatusBadge.tsx';
import { TeamMembersSection } from './TeamMembersSection.tsx';
import { CreditCard, ArrowRight } from 'lucide-react';

interface SettingsViewProps {
  onNavigateToBilling?: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ onNavigateToBilling }) => {
  const { activeOrganization, userRole, memberships, isConfigured } = useAuth();
  const [copiedSql, setCopiedSql] = useState(false);

  const handleCopySql = () => {
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2000);
  };

  return (
    <div id="settings-view" className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-xl sm:text-2xl font-bold text-slate-100 tracking-tight">
            Organization Settings & Security
          </h1>
          <span className="text-xs px-2.5 py-0.5 rounded-md bg-indigo-950/60 text-indigo-300 border border-indigo-800/40 font-semibold">
            Tenant ID: {activeOrganization?.id ? `${activeOrganization.id.substring(0, 8)}...` : 'Not connected'}
          </span>
        </div>
        <p className="text-xs sm:text-sm text-slate-400 mt-1">
          Manage company profile, team member access roles, and database isolation security policies.
        </p>
      </div>

      {/* Supabase Connection Status Card */}
      <div className="bg-slate-900 border border-slate-800/80 rounded-xl p-5 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Key className="w-5 h-5 text-indigo-400" />
            <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wider">
              Supabase Infrastructure Status
            </h2>
          </div>
          {isConfigured ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-950/50 text-emerald-300 border border-emerald-800/50">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Connected
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-950/50 text-amber-300 border border-amber-800/50">
              <AlertCircle className="w-3.5 h-3.5" />
              Env Setup Required
            </span>
          )}
        </div>

        <p className="text-xs text-slate-400 leading-relaxed">
          {isConfigured
            ? 'Supabase client is configured via VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.'
            : 'To connect your real Supabase PostgreSQL instance, define VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your environment, and execute the migrations in /supabase/migrations/.'}
        </p>
      </div>

      {/* Subscription & Fleet Billing Card */}
      <div id="settings-billing-card" className="bg-slate-900 border border-slate-800/80 rounded-xl p-5 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-indigo-400" />
            <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wider">
              Subscription & Fleet Capacity
            </h2>
          </div>
          {onNavigateToBilling && (
            <button
              id="btn-settings-view-billing"
              onClick={onNavigateToBilling}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
            >
              Manage Plans & Invoices <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <p className="text-xs text-slate-400 leading-relaxed">
          Review Active Managed Truck (AMT) entitlement limits, subscribe to Starter (10 AMT), Growth (25 AMT), or Agency (50 AMT) plans, cancel subscriptions, and access payment transaction receipts.
        </p>
      </div>

      {/* Organization Details */}
      <div className="bg-slate-900 border border-slate-800/80 rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex items-center gap-2 pb-3 border-b border-slate-800">
          <Building className="w-5 h-5 text-indigo-400" />
          <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wider">
            Dispatch Company Profile
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div>
            <span className="text-slate-400 block font-medium mb-1">Company / Fleet Name</span>
            <div className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 font-semibold">
              {activeOrganization?.name || 'DispatchDesk Tenant'}
            </div>
          </div>
          <div>
            <span className="text-slate-400 block font-medium mb-1">Primary Operational Timezone</span>
            <div className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 font-mono">
              {activeOrganization?.primary_timezone || 'America/Chicago (Central)'}
            </div>
          </div>
          <div>
            <span className="text-slate-400 block font-medium mb-1">MC Number</span>
            <div className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 font-mono">
              {activeOrganization?.mc_number ? `MC-${activeOrganization.mc_number}` : 'Optional'}
            </div>
          </div>
          <div>
            <span className="text-slate-400 block font-medium mb-1">US DOT Number</span>
            <div className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 font-mono">
              {activeOrganization?.dot_number || 'Optional'}
            </div>
          </div>
        </div>
      </div>

      {/* Team Members Section */}
      <TeamMembersSection />

      {/* Role-Based Access Control (RBAC) Matrix */}
      <div className="bg-slate-900 border border-slate-800/80 rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex items-center gap-2 pb-3 border-b border-slate-800">
          <Shield className="w-5 h-5 text-purple-400" />
          <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wider">
            Role-Based Access Control (RBAC) Permissions Matrix
          </h2>
        </div>

        <div className="overflow-x-auto text-xs">
          <table className="w-full text-left text-slate-300">
            <thead className="bg-slate-950/80 text-slate-400 uppercase font-semibold border-b border-slate-800 text-[11px]">
              <tr>
                <th className="px-4 py-2.5">Role</th>
                <th className="px-4 py-2.5">Scope & Capabilities</th>
                <th className="px-4 py-2.5">Financial & Settings Permissions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-sans">
              <tr>
                <td className="px-4 py-3">
                  <StatusBadge status="owner_admin" type="role" size="sm" />
                </td>
                <td className="px-4 py-3 text-slate-200">
                  Full multi-tenant owner access. Manage company settings, team members, and all fleet operations.
                </td>
                <td className="px-4 py-3 font-semibold text-emerald-400">
                  Full Read + Write
                </td>
              </tr>
              <tr>
                <td className="px-4 py-3">
                  <StatusBadge status="dispatcher" type="role" size="sm" />
                </td>
                <td className="px-4 py-3 text-slate-200">
                  Full operational dispatch access (Clients, Trucks, Drivers, Loads, Pipeline, Documents, Notes).
                </td>
                <td className="px-4 py-3 font-semibold text-sky-400">
                  Profitability View Only
                </td>
              </tr>
              <tr>
                <td className="px-4 py-3">
                  <StatusBadge status="staff" type="role" size="sm" />
                </td>
                <td className="px-4 py-3 text-slate-200">
                  Operational read, document uploads (BOL/POD), and check-call notes.
                </td>
                <td className="px-4 py-3 font-semibold text-slate-400">
                  Restricted
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
