import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Users,
  Shield,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Crown,
  Phone,
  Clock,
  UserPlus,
  Copy,
  Check,
  AlertTriangle,
  RefreshCw,
  Mail,
  XCircle,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext.tsx';
import { TeamMember, TeamInvitation, UserRole } from '../../types/domain.types.ts';
import { teamService } from './teamService.ts';
import { supabase, isSupabaseConfigured } from '../../lib/supabase.ts';
import { StatusBadge } from '../../components/common/StatusBadge.tsx';
import { Modal } from '../../components/common/Modal.tsx';
import { InviteMemberModal } from './InviteMemberModal.tsx';

export const TeamMembersSection: React.FC = () => {
  const { activeOrganization, user, userRole, refreshUserData } = useAuth();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [invitations, setInvitations] = useState<TeamInvitation[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [updatingMemberId, setUpdatingMemberId] = useState<string | null>(null);
  const [memberToRemove, setMemberToRemove] = useState<TeamMember | null>(null);
  const [isRemoving, setIsRemoving] = useState<boolean>(false);

  // Invitation modals & actions
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [invitationToCancel, setInvitationToCancel] = useState<TeamInvitation | null>(null);
  const [isCancellingInvite, setIsCancellingInvite] = useState(false);
  const [resendingInviteId, setResendingInviteId] = useState<string | null>(null);
  const [freshInviteLink, setFreshInviteLink] = useState<{
    invitation: TeamInvitation;
    inviteUrl: string;
  } | null>(null);
  const [copiedFreshLink, setCopiedFreshLink] = useState(false);

  const isOwnerAdmin = userRole === 'owner_admin';
  const orgId = activeOrganization?.id;

  const latestRequestIdRef = useRef<number>(0);
  const lastFetchTimeRef = useRef<number>(0);

  const loadData = useCallback(async (isSilent = false) => {
    if (!orgId) {
      setMembers([]);
      setInvitations([]);
      if (!isSilent) setIsLoading(false);
      return;
    }
    const currentRequestId = ++latestRequestIdRef.current;
    if (!isSilent) setIsLoading(true);
    try {
      const [membersData, invitationsData] = await Promise.all([
        teamService.getTeamMembers(orgId),
        teamService.listInvitations(orgId, userRole),
      ]);
      // Discard stale out-of-order response
      if (currentRequestId !== latestRequestIdRef.current) {
        return;
      }
      setMembers(membersData);
      // Anti-stale state reconciliation: never allow a stale 'pending' response to overwrite an already 'accepted' invitation
      setInvitations((prev) => {
        const prevAcceptedIds = new Set(
          prev.filter((inv) => inv.status === 'accepted').map((inv) => inv.id)
        );
        return invitationsData.map((inv) => {
          if (prevAcceptedIds.has(inv.id) && inv.status === 'pending') {
            return { ...inv, status: 'accepted' as const };
          }
          return inv;
        });
      });
      lastFetchTimeRef.current = Date.now();
    } catch (err: any) {
      if (currentRequestId === latestRequestIdRef.current) {
        console.error('Error fetching team data:', err);
        if (!isSilent) {
          setActionError(err.message || 'Failed to load team data.');
        }
      }
    } finally {
      if (currentRequestId === latestRequestIdRef.current && !isSilent) {
        setIsLoading(false);
      }
    }
  }, [orgId, userRole]);

  useEffect(() => {
    // Initial fetch
    loadData(false);

    // 1. In-app TeamService event listener
    const unsubscribeService = teamService.onTeamUpdated(() => {
      loadData(true);
    });

    // 2. Window CustomEvent listener
    const handleCustomEvent = (event: Event) => {
      const customEvent = event as CustomEvent;
      if (!customEvent.detail?.organizationId || customEvent.detail.organizationId === orgId) {
        loadData(true);
      }
    };
    window.addEventListener('dispatchdesk_team_updated', handleCustomEvent);

    // 3. Storage event for cross-tab synchronization
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'dispatchdesk_team_last_updated') {
        loadData(true);
      }
    };
    window.addEventListener('storage', handleStorage);

    // 4. Window focus & Page visibility change (e.g. admin switches back after remote acceptance)
    const handleFocusOrVisibility = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        const elapsed = Date.now() - lastFetchTimeRef.current;
        // Throttle to at most once every 2 seconds to avoid aggressive polling
        if (elapsed >= 2000) {
          loadData(true);
        }
      }
    };
    window.addEventListener('focus', handleFocusOrVisibility);
    document.addEventListener('visibilitychange', handleFocusOrVisibility);

    // 5. Supabase Realtime channel (if supabase is configured and orgId is a real UUID)
    let realtimeChannel: any = null;
    if (isSupabaseConfigured && orgId && orgId !== 'demo-org-1') {
      try {
        realtimeChannel = supabase
          .channel(`org-team-sync-${orgId}`)
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'organization_invitations',
              filter: `organization_id=eq.${orgId}`,
            },
            () => {
              loadData(true);
            }
          )
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'organization_members',
              filter: `organization_id=eq.${orgId}`,
            },
            () => {
              loadData(true);
            }
          )
          .subscribe();
      } catch (rtErr) {
        console.warn('[TeamMembersSection] Realtime subscription note:', rtErr);
      }
    }

    return () => {
      unsubscribeService();
      window.removeEventListener('dispatchdesk_team_updated', handleCustomEvent);
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('focus', handleFocusOrVisibility);
      document.removeEventListener('visibilitychange', handleFocusOrVisibility);
      if (realtimeChannel) {
        try {
          supabase.removeChannel(realtimeChannel);
        } catch {}
      }
    };
  }, [loadData, orgId]);

  const ownerAdminCount = members.filter((m) => m.role === 'owner_admin').length;
  const pendingInvitations = invitations.filter((inv) => inv.status === 'pending');

  const handleRoleChange = async (member: TeamMember, newRole: UserRole) => {
    if (!orgId || !isOwnerAdmin || isRemoving) return;
    if (member.role === newRole) return;

    setActionError(null);
    setActionSuccess(null);
    setUpdatingMemberId(member.id);

    try {
      const updated = await teamService.updateMemberRole(orgId, member.id, newRole, userRole);
      setMembers((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
      setActionSuccess(`Updated role for ${member.full_name || 'member'} to ${formatRoleName(newRole)}.`);
      if (member.user_id === user?.id) {
        await refreshUserData();
      }
      setTimeout(() => setActionSuccess(null), 4000);
    } catch (err: any) {
      console.error('Role update failed:', err);
      setActionError(err.message || 'Failed to update member role.');
    } finally {
      setUpdatingMemberId(null);
    }
  };

  const handleConfirmRemove = async () => {
    if (!orgId || !isOwnerAdmin || !memberToRemove || isRemoving) return;

    // Strict Last-Admin Invariant Protection
    if (memberToRemove.role === 'owner_admin') {
      const currentAdminCount = members.filter((m) => m.role === 'owner_admin').length;
      if (currentAdminCount <= 1) {
        setActionError('Cannot remove the last Owner/Admin. Every organization must maintain at least one Owner/Admin.');
        setMemberToRemove(null);
        return;
      }
    }

    setActionError(null);
    setActionSuccess(null);
    setIsRemoving(true);

    try {
      const isSelf = memberToRemove.user_id === user?.id;
      const targetName = memberToRemove.full_name || memberToRemove.email || 'Team Member';
      const targetId = memberToRemove.id;

      // Canonical RPC invocation via teamService
      await teamService.removeMember(orgId, targetId, userRole);

      // Successfully removed: update state and refresh
      setMembers((prev) => prev.filter((m) => m.id !== targetId));
      setActionSuccess(`Removed ${targetName} from organization.`);
      setMemberToRemove(null);

      if (isSelf) {
        await refreshUserData();
      } else {
        loadData().catch(console.error);
      }
      setTimeout(() => setActionSuccess(null), 4000);
    } catch (err: any) {
      console.error('Remove member failed:', err);
      setActionError(err.message || 'Failed to remove member.');
    } finally {
      setIsRemoving(false);
    }
  };

  const handleConfirmCancelInvite = async () => {
    const canCancel =
      isOwnerAdmin ||
      (userRole === 'dispatcher' && invitationToCancel?.role === 'driver');

    if (!orgId || !canCancel || !invitationToCancel || isCancellingInvite) return;

    setActionError(null);
    setActionSuccess(null);
    setIsCancellingInvite(true);

    try {
      await teamService.cancelInvitation(orgId, invitationToCancel.id, userRole);
      setInvitations((prev) =>
        prev.map((inv) =>
          inv.id === invitationToCancel.id ? { ...inv, status: 'cancelled', cancelled_at: new Date().toISOString() } : inv
        )
      );
      setActionSuccess(`Cancelled invitation for ${invitationToCancel.email}.`);
      setInvitationToCancel(null);
      setTimeout(() => setActionSuccess(null), 4000);
    } catch (err: any) {
      console.error('Cancel invitation failed:', err);
      setActionError(err.message || 'Failed to cancel invitation.');
    } finally {
      setIsCancellingInvite(false);
    }
  };

  const handleResendInvite = async (inv: TeamInvitation) => {
    if (!orgId || !isOwnerAdmin || resendingInviteId || inv.role === 'driver') return;

    setActionError(null);
    setActionSuccess(null);
    setResendingInviteId(inv.id);

    try {
      // If invitation is active pending, cancel old invitation first to clear active unique slot
      if (inv.status === 'pending') {
        await teamService.cancelInvitation(orgId, inv.id, userRole);
      }

      // Generate a fresh cryptographically secure invitation
      const result = await teamService.createInvitation(
        orgId,
        inv.email,
        inv.role,
        user?.id,
        userRole,
        inv.driver_id || null
      );

      // Update state: replace previous invitation record with fresh one
      setInvitations((prev) => [
        result.invitation,
        ...prev.filter((i) => i.id !== inv.id && i.id !== result.invitation.id),
      ]);

      setFreshInviteLink({
        invitation: result.invitation,
        inviteUrl: result.inviteUrl,
      });
      setActionSuccess(`Generated fresh secure invitation link for ${inv.email}.`);
      setTimeout(() => setActionSuccess(null), 4000);
    } catch (err: any) {
      console.error('Failed to resend invitation:', err);
      setActionError(err.message || 'Failed to generate fresh invitation.');
    } finally {
      setResendingInviteId(null);
    }
  };

  const handleCopyFreshLink = async () => {
    if (!freshInviteLink?.inviteUrl) return;
    try {
      await navigator.clipboard.writeText(freshInviteLink.inviteUrl);
      setCopiedFreshLink(true);
      setTimeout(() => setCopiedFreshLink(false), 3000);
    } catch (err) {
      console.error('Failed to copy fresh link:', err);
    }
  };

  const formatRoleName = (role: UserRole): string => {
    switch (role) {
      case 'owner_admin':
        return 'Owner / Admin';
      case 'dispatcher':
        return 'Dispatcher';
      case 'staff':
        return 'Staff';
      case 'driver':
        return 'Driver';
      default:
        return role;
    }
  };

  const getInitials = (name?: string | null): string => {
    if (!name) return 'TM';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const getTimeRemaining = (expiresAt: string): string => {
    const ms = new Date(expiresAt).getTime() - Date.now();
    if (ms <= 0) return 'Expired';
    const days = Math.floor(ms / (1000 * 60 * 60 * 24));
    const hours = Math.floor((ms % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    if (days > 0) return `${days}d ${hours}h left`;
    return `${hours}h left`;
  };

  return (
    <div id="team-members-section" className="space-y-6">
      {/* 1. Main Members Panel */}
      <div className="bg-slate-900 border border-slate-800/80 rounded-xl p-5 shadow-sm space-y-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-indigo-950/60 text-indigo-400 border border-indigo-800/40">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wider">
                  Team Members & Access
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-800 text-slate-300 border border-slate-700">
                  {members.length} {members.length === 1 ? 'Member' : 'Members'}
                </span>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-purple-950/60 text-purple-300 border border-purple-800/50">
                  {ownerAdminCount} {ownerAdminCount === 1 ? 'Owner/Admin' : 'Owner/Admins'}
                </span>
                {pendingInvitations.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-950/60 text-amber-300 border border-amber-800/50">
                    {pendingInvitations.length} Pending {pendingInvitations.length === 1 ? 'Invite' : 'Invites'}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Manage organization members, role permissions, and user onboarding.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            {(isOwnerAdmin || userRole === 'dispatcher') && (
              <button
                id="btn-open-invite-modal"
                type="button"
                onClick={() => setIsInviteModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm transition cursor-pointer"
              >
                <UserPlus className="w-3.5 h-3.5" />
                {userRole === 'dispatcher' ? 'Invite Driver' : 'Invite Member'}
              </button>
            )}
            <button
              id="btn-refresh-team"
              type="button"
              onClick={() => loadData(false)}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700 transition cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Role Alert / Notice for non-admins */}
        {!isOwnerAdmin && (
          <div className="flex items-start gap-2.5 p-3 rounded-lg bg-slate-950/80 border border-slate-800 text-xs text-slate-400">
            <Shield className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-slate-300">Read-Only View: </span>
              You are signed in with the <strong className="text-sky-300">{formatRoleName(userRole || 'staff')}</strong> role. Role modifications, team invitations, and member removals are restricted to Owner / Admins.
            </div>
          </div>
        )}

        {/* Error / Success Banners */}
        {actionError && (
          <div className="flex items-center justify-between p-3 rounded-lg bg-rose-950/40 border border-rose-800/60 text-xs text-rose-300">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{actionError}</span>
            </div>
            <button
              type="button"
              onClick={() => setActionError(null)}
              className="text-rose-400 hover:text-rose-200 font-bold ml-3 cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {actionSuccess && (
          <div className="flex items-center justify-between p-3 rounded-lg bg-emerald-950/40 border border-emerald-800/60 text-xs text-emerald-300">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{actionSuccess}</span>
            </div>
            <button
              type="button"
              onClick={() => setActionSuccess(null)}
              className="text-emerald-400 hover:text-emerald-200 font-bold ml-3 cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* Active Members Table */}
        <div className="overflow-x-auto rounded-lg border border-slate-800/80">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/90 text-slate-400 uppercase font-semibold border-b border-slate-800 text-[11px]">
              <tr>
                <th className="px-4 py-3">Member</th>
                <th className="px-4 py-3">Contact & Timezone</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Joined</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 bg-slate-900/60">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                    <div className="inline-flex items-center gap-2 text-xs">
                      <RefreshCw className="w-4 h-4 animate-spin text-indigo-400" />
                      Loading team members...
                    </div>
                  </td>
                </tr>
              ) : members.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                    No team members found for this organization.
                  </td>
                </tr>
              ) : (
                members.map((member) => {
                  const isLastAdmin = member.role === 'owner_admin' && ownerAdminCount <= 1;
                  const isUpdating = updatingMemberId === member.id;

                  return (
                    <tr key={member.id} className="hover:bg-slate-850/40 transition">
                      {/* Member Name + Avatar */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-slate-200 text-xs shrink-0">
                            {getInitials(member.full_name)}
                          </div>
                          <div>
                            <div className="font-semibold text-slate-100 flex items-center gap-1.5">
                              {member.full_name || 'Team Member'}
                              {member.role === 'owner_admin' && (
                                <Crown className="w-3.5 h-3.5 text-amber-400" />
                              )}
                            </div>
                            {member.email && (
                              <div className="text-[11px] text-slate-400">{member.email}</div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Contact & Timezone */}
                      <td className="px-4 py-3.5 text-slate-400">
                        <div className="space-y-0.5 text-[11px]">
                          {member.phone ? (
                            <div className="flex items-center gap-1 text-slate-300">
                              <Phone className="w-3 h-3 text-slate-500 shrink-0" />
                              <span>{member.phone}</span>
                            </div>
                          ) : (
                            <span className="text-slate-500">No phone listed</span>
                          )}
                          <div className="flex items-center gap-1 text-slate-400">
                            <Clock className="w-3 h-3 text-slate-500 shrink-0" />
                            <span>{member.preferred_timezone || 'America/Chicago'}</span>
                          </div>
                        </div>
                      </td>

                      {/* Role / Role Selector */}
                      <td className="px-4 py-3.5">
                        {isOwnerAdmin ? (
                          <div className="flex items-center gap-2">
                            <select
                              id={`role-select-${member.id}`}
                              value={member.role}
                              disabled={isUpdating || isRemoving}
                              onChange={(e) => handleRoleChange(member, e.target.value as UserRole)}
                              className={`px-2.5 py-1 text-xs rounded-md bg-slate-950 border border-slate-700 text-slate-200 focus:outline-none focus:border-indigo-500 transition font-medium ${
                                isUpdating || isRemoving ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                              }`}
                            >
                              <option value="owner_admin">Owner / Admin</option>
                              <option value="dispatcher" disabled={isLastAdmin}>
                                Dispatcher {isLastAdmin ? '(Disabled - Sole Admin)' : ''}
                              </option>
                              <option value="staff" disabled={isLastAdmin}>
                                Staff {isLastAdmin ? '(Disabled - Sole Admin)' : ''}
                              </option>
                            </select>
                            {isLastAdmin && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-950/60 text-amber-300 border border-amber-800/50 font-medium whitespace-nowrap">
                                Sole Admin
                              </span>
                            )}
                          </div>
                        ) : (
                          <StatusBadge status={member.role} type="role" size="sm" />
                        )}
                      </td>

                      {/* Joined Date */}
                      <td className="px-4 py-3.5 text-slate-400 text-[11px] whitespace-nowrap">
                        {new Date(member.created_at).toLocaleDateString(undefined, {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3.5 text-right whitespace-nowrap">
                        {isOwnerAdmin ? (
                          <button
                            id={`btn-remove-member-${member.id}`}
                            type="button"
                            disabled={isLastAdmin || isUpdating || isRemoving}
                            onClick={() => {
                              if (!isRemoving) {
                                setMemberToRemove(member);
                              }
                            }}
                            title={
                              isLastAdmin
                                ? 'Cannot remove the only Owner/Admin of the organization'
                                : `Remove ${member.full_name || 'member'}`
                            }
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs transition font-medium cursor-pointer ${
                              isLastAdmin || isRemoving
                                ? 'text-slate-600 bg-slate-950 border border-slate-800 cursor-not-allowed opacity-50'
                                : 'text-rose-300 hover:text-rose-100 bg-rose-950/30 hover:bg-rose-900/50 border border-rose-800/40 hover:border-rose-700'
                            }`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Remove</span>
                          </button>
                        ) : (
                          <span className="text-[11px] text-slate-500 italic">Read-only</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 2. Pending Invitations Panel */}
      <div className="bg-slate-900 border border-slate-800/80 rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-indigo-950/60 text-indigo-400 border border-indigo-800/40">
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider">
                  Pending & Recent Invitations
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-800 text-slate-300 border border-slate-700">
                  {invitations.length}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Track sent invitations, copy onboarding links, or revoke pending access.
              </p>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border border-slate-800/80">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/90 text-slate-400 uppercase font-semibold border-b border-slate-800 text-[11px]">
              <tr>
                <th className="px-4 py-3">Invited Email</th>
                <th className="px-4 py-3">Assigned Role</th>
                <th className="px-4 py-3">Invited By</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Expiration</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 bg-slate-900/60">
              {invitations.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    No invitations found. Use the "Invite Member" button above to onboard teammates.
                  </td>
                </tr>
              ) : (
                invitations.map((inv) => {
                  const isPending = inv.status === 'pending';

                  return (
                    <tr key={inv.id} className="hover:bg-slate-850/40 transition">
                      {/* Email */}
                      <td className="px-4 py-3.5">
                        <div className="font-semibold text-slate-100 font-mono">
                          {inv.email}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          Sent on {new Date(inv.created_at).toLocaleDateString()}
                        </div>
                      </td>

                      {/* Role */}
                      <td className="px-4 py-3.5">
                        <StatusBadge status={inv.role} type="role" size="sm" />
                        {inv.role === 'driver' && inv.driver_name && (
                          <div className="text-[11px] text-indigo-400 mt-0.5 font-medium">
                            Linked: {inv.driver_name}
                          </div>
                        )}
                      </td>

                      {/* Invited By */}
                      <td className="px-4 py-3.5 text-slate-400 text-[11px]">
                        {inv.invited_by_name || 'Organization Admin'}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3.5">
                        {inv.status === 'pending' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-950/60 text-amber-300 border border-amber-800/50">
                            <Clock className="w-3 h-3" />
                            Pending
                          </span>
                        )}
                        {inv.status === 'accepted' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-950/60 text-emerald-300 border border-emerald-800/50">
                            <CheckCircle2 className="w-3 h-3" />
                            Accepted
                          </span>
                        )}
                        {inv.status === 'cancelled' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-800 text-slate-400 border border-slate-700">
                            <XCircle className="w-3 h-3" />
                            Cancelled
                          </span>
                        )}
                        {inv.status === 'expired' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-950/60 text-rose-300 border border-rose-800/50">
                            <AlertCircle className="w-3 h-3" />
                            Expired
                          </span>
                        )}
                      </td>

                      {/* Expiration */}
                      <td className="px-4 py-3.5 text-[11px] text-slate-400">
                        {isPending ? (
                          <span className="text-amber-400 font-medium">
                            {getTimeRemaining(inv.expires_at)}
                          </span>
                        ) : (
                          <span>{new Date(inv.expires_at).toLocaleDateString()}</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3.5 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-2">
                          {isPending && (
                            <>
                              {inv.role !== 'driver' && isOwnerAdmin && (
                                <button
                                  id={`btn-resend-invite-${inv.id}`}
                                  type="button"
                                  onClick={() => handleResendInvite(inv)}
                                  disabled={resendingInviteId === inv.id}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium text-indigo-300 hover:text-white bg-indigo-950/40 hover:bg-indigo-900/60 border border-indigo-800/40 transition cursor-pointer disabled:opacity-50"
                                  title="Generate a fresh cryptographic invitation link"
                                >
                                  {resendingInviteId === inv.id ? (
                                    <>
                                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                      <span>Generating...</span>
                                    </>
                                  ) : (
                                    <>
                                      <RefreshCw className="w-3.5 h-3.5" />
                                      <span>Resend</span>
                                    </>
                                  )}
                                </button>
                              )}

                              {inv.role === 'driver' && (
                                <span className="text-[11px] text-slate-400 font-medium px-1">
                                  Phone OTP Only
                                </span>
                              )}

                              {(isOwnerAdmin || (userRole === 'dispatcher' && inv.role === 'driver')) && (
                                <button
                                  id={`btn-cancel-invite-${inv.id}`}
                                  type="button"
                                  onClick={() => setInvitationToCancel(inv)}
                                  disabled={resendingInviteId === inv.id || isCancellingInvite}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-rose-300 hover:text-rose-100 bg-rose-950/30 hover:bg-rose-900/50 border border-rose-800/40 transition cursor-pointer disabled:opacity-50"
                                >
                                  <XCircle className="w-3.5 h-3.5" />
                                  <span>Cancel</span>
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal for displaying freshly created or resent link */}
      {freshInviteLink && (
        <Modal
          id="modal-fresh-invite-link"
          isOpen={true}
          onClose={() => setFreshInviteLink(null)}
          title="Invitation Link Ready"
        >
          <div className="space-y-4 text-xs">
            <div className="p-3 bg-indigo-950/40 border border-indigo-800/60 rounded-lg text-indigo-200">
              <p className="font-semibold text-indigo-100">
                Fresh secure invitation link generated for {freshInviteLink.invitation.email}!
              </p>
              <p className="text-indigo-300/80 mt-1">
                Share this unique onboarding link with the invitee. It will expire in 7 days.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Invitation URL
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="input-fresh-invite-url"
                  type="text"
                  readOnly
                  value={freshInviteLink.inviteUrl}
                  className="flex-1 px-3 py-2 text-xs bg-slate-950 border border-slate-700 rounded-lg font-mono text-slate-200 select-all"
                />
                <button
                  id="btn-copy-fresh-invite-link"
                  type="button"
                  onClick={handleCopyFreshLink}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition cursor-pointer"
                >
                  {copiedFreshLink ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-300" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      Copy
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-end pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setFreshInviteLink(null)}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Invite Member Modal */}
      <InviteMemberModal
        isOpen={isInviteModalOpen}
        onClose={() => setIsInviteModalOpen(false)}
        onInvitationCreated={(newInv) => {
          setInvitations((prev) => [newInv, ...prev.filter((i) => i.id !== newInv.id)]);
        }}
      />

      {/* Confirmation Modal for Member Removal */}
      {memberToRemove && (
        <Modal
          id="modal-remove-team-member"
          isOpen={true}
          onClose={() => {
            if (!isRemoving) setMemberToRemove(null);
          }}
          title="Confirm Team Member Removal"
        >
          <div className="space-y-4 text-xs">
            <div className="flex items-start gap-3 p-3.5 rounded-lg bg-rose-950/40 border border-rose-800/60 text-rose-200">
              <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-rose-100 text-sm">
                  Remove {memberToRemove.full_name || memberToRemove.email || 'Team Member'}?
                </p>
                <p className="text-rose-300/90 mt-1 leading-relaxed">
                  This user will immediately lose access to this organization and all associated loads, trucks, drivers, documents, and reports.
                </p>
              </div>
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-400">Name:</span>
                <span className="font-semibold text-slate-200">{memberToRemove.full_name || 'N/A'}</span>
              </div>
              {memberToRemove.email && (
                <div className="flex justify-between">
                  <span className="text-slate-400">Email:</span>
                  <span className="font-mono text-slate-200">{memberToRemove.email}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-400">Current Role:</span>
                <StatusBadge status={memberToRemove.role} type="role" size="sm" />
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Organization:</span>
                <span className="text-slate-200">{activeOrganization?.name || 'Current Organization'}</span>
              </div>
            </div>

            {actionError && (
              <div className="p-2.5 rounded bg-rose-950/60 border border-rose-800/80 text-rose-200 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{actionError}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setMemberToRemove(null)}
                disabled={isRemoving}
                className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                id="btn-confirm-remove-member"
                type="button"
                onClick={handleConfirmRemove}
                disabled={isRemoving}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {isRemoving ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Removing...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Remove Member</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Confirmation Modal for Invitation Cancellation */}
      {invitationToCancel && (
        <Modal
          id="modal-cancel-invitation"
          isOpen={true}
          onClose={() => {
            if (!isCancellingInvite) setInvitationToCancel(null);
          }}
          title="Cancel Team Invitation"
        >
          <div className="space-y-4 text-xs">
            <div className="flex items-start gap-3 p-3.5 rounded-lg bg-amber-950/40 border border-amber-800/60 text-amber-200">
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-amber-100 text-sm">
                  Revoke invitation for {invitationToCancel.email}?
                </p>
                <p className="text-amber-300/90 mt-1 leading-relaxed">
                  The invitation link will immediately become invalid. The recipient will not be able to join using this link.
                </p>
              </div>
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-400">Recipient Email:</span>
                <span className="font-mono text-slate-200">{invitationToCancel.email}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Assigned Role:</span>
                <StatusBadge status={invitationToCancel.role} type="role" size="sm" />
              </div>
            </div>

            {actionError && (
              <div className="p-2.5 rounded bg-rose-950/60 border border-rose-800/80 text-rose-200 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{actionError}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setInvitationToCancel(null)}
                disabled={isCancellingInvite}
                className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer disabled:opacity-50"
              >
                Keep Active
              </button>
              <button
                id="btn-confirm-cancel-invite"
                type="button"
                onClick={handleConfirmCancelInvite}
                disabled={isCancellingInvite}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white transition disabled:opacity-50 cursor-pointer"
              >
                {isCancellingInvite ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Revoking...
                  </>
                ) : (
                  <>
                    <XCircle className="w-3.5 h-3.5" />
                    Cancel Invitation
                  </>
                )}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
