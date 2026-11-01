import { TeamMember, TeamInvitation, UserRole, InvitationStatus } from '../../types/domain.types.ts';
import { supabase, isSupabaseConfigured } from '../../lib/supabase.ts';

const TEAM_STORAGE_PREFIX = 'dispatchdesk_demo_team_members_';
const INVITATION_STORAGE_PREFIX = 'dispatchdesk_demo_team_invitations_';
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const DEMO_ORGANIZATION_ID = 'demo-org-1';

function isUUID(str?: string | null): boolean {
  return Boolean(str && UUID_REGEX.test(str.trim()));
}

export function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

/**
 * Generate a cryptographically secure 256-bit random hex token.
 */
export function generateSecureToken(): string {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  }
  // Fallback for non-browser/non-crypto edge cases
  return `${Date.now().toString(36)}-${Math.random().toString(36).substring(2)}${Math.random().toString(36).substring(2)}`;
}

/**
 * Hash raw token using SHA-256 for secure database storage and comparison.
 */
export async function hashToken(rawToken: string): Promise<string> {
  const clean = rawToken.trim();
  if (typeof crypto !== 'undefined' && crypto.subtle && crypto.subtle.digest) {
    const msgUint8 = new TextEncoder().encode(clean);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  // Pure JavaScript SHA-256 fallback if subtle crypto is unavailable
  let hash = 0;
  for (let i = 0; i < clean.length; i++) {
    const char = clean.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return `sha256_mock_${Math.abs(hash).toString(16)}`;
}

export const SEED_DEMO_TEAM_MEMBERS: Omit<TeamMember, 'organization_id'>[] = [
  {
    id: 'demo-member-1',
    user_id: 'usr-alex-1',
    role: 'owner_admin',
    full_name: 'Alex Rivera',
    phone: '(312) 555-0199',
    preferred_timezone: 'America/Chicago',
    email: 'alex.rivera@dispatchdesk.demo',
    created_at: new Date(Date.now() - 60 * 86400000).toISOString(),
    updated_at: new Date(Date.now() - 10 * 86400000).toISOString(),
  },
  {
    id: 'demo-member-2',
    user_id: 'usr-sarah-2',
    role: 'dispatcher',
    full_name: 'Sarah Chen',
    phone: '(312) 555-0145',
    preferred_timezone: 'America/Chicago',
    email: 'sarah.chen@dispatchdesk.demo',
    created_at: new Date(Date.now() - 45 * 86400000).toISOString(),
    updated_at: new Date(Date.now() - 5 * 86400000).toISOString(),
  },
  {
    id: 'demo-member-3',
    user_id: 'usr-marcus-3',
    role: 'dispatcher',
    full_name: 'Marcus Johnson',
    phone: '(214) 555-0188',
    preferred_timezone: 'America/Chicago',
    email: 'marcus.j@dispatchdesk.demo',
    created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
    updated_at: new Date(Date.now() - 2 * 86400000).toISOString(),
  },
  {
    id: 'demo-member-4',
    user_id: 'usr-elena-4',
    role: 'staff',
    full_name: 'Elena Rostova',
    phone: '+91 98765 43210',
    preferred_timezone: 'Asia/Kolkata',
    email: 'elena.rostova@dispatchdesk.demo',
    created_at: new Date(Date.now() - 20 * 86400000).toISOString(),
    updated_at: new Date(Date.now() - 1 * 86400000).toISOString(),
  },
  {
    id: 'demo-member-rahul',
    user_id: 'usr-rahul-concrete',
    role: 'dispatcher',
    full_name: 'Rahul Sharma',
    phone: '+91 98765 12345',
    preferred_timezone: 'Asia/Kolkata',
    email: 'rahul.dispatcher@dispatchdesk.demo',
    created_at: new Date(Date.now() - 15 * 86400000).toISOString(),
    updated_at: new Date(Date.now() - 1 * 86400000).toISOString(),
  },
  {
    id: 'demo-member-amit',
    user_id: 'usr-amit-dispatcher',
    role: 'dispatcher',
    full_name: 'Amit Patel',
    phone: '+91 98765 12346',
    preferred_timezone: 'Asia/Kolkata',
    email: 'amit.dispatcher@dispatchdesk.demo',
    created_at: new Date(Date.now() - 12 * 86400000).toISOString(),
    updated_at: new Date(Date.now() - 1 * 86400000).toISOString(),
  },
  {
    id: 'demo-member-manoj',
    user_id: 'usr-manoj-dispatcher',
    role: 'dispatcher',
    full_name: 'Manoj Kumar',
    phone: '+91 98765 12347',
    preferred_timezone: 'Asia/Kolkata',
    email: 'manoj.dispatcher@dispatchdesk.demo',
    created_at: new Date(Date.now() - 10 * 86400000).toISOString(),
    updated_at: new Date(Date.now() - 1 * 86400000).toISOString(),
  },
];

export const SEED_DEMO_INVITATIONS: Omit<TeamInvitation, 'organization_id'>[] = [
  {
    id: 'demo-inv-1',
    email: 'david.miller@dispatchdesk.demo',
    role: 'dispatcher',
    invited_by_user_id: 'usr-alex-1',
    invited_by_name: 'Alex Rivera',
    token_hash: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08', // SHA256 of 'test'
    expires_at: new Date(Date.now() + 5 * 86400000).toISOString(),
    accepted_at: null,
    cancelled_at: null,
    created_at: new Date(Date.now() - 2 * 86400000).toISOString(),
    status: 'pending',
  },
  {
    id: 'demo-inv-2',
    email: 'compliance.auditor@dispatchdesk.demo',
    role: 'staff',
    invited_by_user_id: 'usr-alex-1',
    invited_by_name: 'Alex Rivera',
    token_hash: '5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8', // SHA256 of 'password'
    expires_at: new Date(Date.now() + 3 * 86400000).toISOString(),
    accepted_at: null,
    cancelled_at: null,
    created_at: new Date(Date.now() - 1 * 86400000).toISOString(),
    status: 'pending',
  },
];

export interface ITeamService {
  getTeamMembers(organizationId: string): Promise<TeamMember[]>;
  updateMemberRole(
    organizationId: string,
    memberId: string,
    newRole: UserRole,
    actorRole?: UserRole | null
  ): Promise<TeamMember>;
  removeMember(
    organizationId: string,
    memberId: string,
    actorRole?: UserRole | null
  ): Promise<void>;

  // S5.2 Invitations
  createInvitation(
    organizationId: string,
    email: string,
    role: UserRole,
    invitedByUserId?: string,
    actorRole?: UserRole | null,
    driverId?: string | null
  ): Promise<{ invitation: TeamInvitation; rawToken: string; inviteUrl: string }>;
  listInvitations(
    organizationId: string,
    actorRole?: UserRole | null
  ): Promise<TeamInvitation[]>;
  cancelInvitation(
    organizationId: string,
    invitationId: string,
    actorRole?: UserRole | null
  ): Promise<void>;
  getInvitationByToken(rawToken: string): Promise<TeamInvitation | null>;
  acceptInvitation(
    rawToken: string,
    user: { id: string; email?: string; full_name?: string }
  ): Promise<{
    organizationId: string;
    organizationName: string;
    role: UserRole;
    driverId?: string | null;
    driverName?: string | null;
  }>;

  // Real-time synchronization & event listeners
  onTeamUpdated(callback: () => void): () => void;
  notifyTeamUpdated(data?: { organizationId?: string; type?: string; [key: string]: any }): void;
}

class TeamService implements ITeamService {
  private memoryMembers: Map<string, string> = new Map();
  private memoryInvitations: Map<string, string> = new Map();
  private inFlightGetTeamMembers = new Map<string, Promise<TeamMember[]>>();
  private updateListeners: Set<() => void> = new Set();
  private broadcastChannel: BroadcastChannel | null = null;

  constructor() {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        this.broadcastChannel = new BroadcastChannel('dispatchdesk_team_sync');
        this.broadcastChannel.onmessage = (event) => {
          if (event.data?.type === 'dispatchdesk_team_updated') {
            const orgId = event.data?.organizationId;
            if (orgId) {
              this.inFlightGetTeamMembers.delete(orgId);
            }
            this.updateListeners.forEach((cb) => {
              try {
                cb();
              } catch (e) {
                console.error('[TeamService] Listener callback error:', e);
              }
            });
          }
        };
      } catch {
        this.broadcastChannel = null;
      }
    }
  }

  onTeamUpdated(callback: () => void): () => void {
    this.updateListeners.add(callback);
    return () => {
      this.updateListeners.delete(callback);
    };
  }

  notifyTeamUpdated(data?: { organizationId?: string; type?: string; [key: string]: any }): void {
    if (data?.organizationId) {
      this.inFlightGetTeamMembers.delete(data.organizationId);
    }

    this.updateListeners.forEach((cb) => {
      try {
        cb();
      } catch (e) {
        console.error('[TeamService] Listener callback error:', e);
      }
    });

    if (typeof window !== 'undefined') {
      try {
        window.dispatchEvent(
          new CustomEvent('dispatchdesk_team_updated', { detail: data })
        );
      } catch {}

      if (this.broadcastChannel) {
        try {
          this.broadcastChannel.postMessage({
            type: 'dispatchdesk_team_updated',
            ...data,
            timestamp: Date.now(),
          });
        } catch {}
      }

      try {
        localStorage.setItem(
          'dispatchdesk_team_last_updated',
          JSON.stringify({ timestamp: Date.now(), ...data })
        );
      } catch {}
    }
  }

  private getMemberStorageKey(organizationId: string): string {
    return `${TEAM_STORAGE_PREFIX}${organizationId}`;
  }

  private getInvitationStorageKey(organizationId: string): string {
    return `${INVITATION_STORAGE_PREFIX}${organizationId}`;
  }

  private loadMembersFromStorage(organizationId: string): TeamMember[] {
    const key = this.getMemberStorageKey(organizationId);
    try {
      let raw: string | null = null;
      if (typeof localStorage !== 'undefined') {
        raw = localStorage.getItem(key);
      } else {
        raw = this.memoryMembers.get(key) || null;
      }
      if (!raw) return [];
      return JSON.parse(raw) as TeamMember[];
    } catch (err) {
      console.error(`[TeamService] Error loading member storage for org ${organizationId}:`, err);
      return [];
    }
  }

  private saveMembersToStorage(organizationId: string, members: TeamMember[]): void {
    const key = this.getMemberStorageKey(organizationId);
    try {
      const serialized = JSON.stringify(members);
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(key, serialized);
      } else {
        this.memoryMembers.set(key, serialized);
      }
    } catch (err) {
      console.error(`[TeamService] Error saving member storage for org ${organizationId}:`, err);
    }
  }

  private ensureMembersInitialized(organizationId: string): TeamMember[] {
    let members = this.loadMembersFromStorage(organizationId);
    if (isUUID(organizationId) && organizationId !== DEMO_ORGANIZATION_ID) {
      return members.filter((m) => !m.id.startsWith('demo-member-'));
    }
    if (members.length === 0) {
      members = SEED_DEMO_TEAM_MEMBERS.map((m) => ({
        ...m,
        organization_id: organizationId,
      }));
      this.saveMembersToStorage(organizationId, members);
    } else {
      let hasAdded = false;
      for (const seed of SEED_DEMO_TEAM_MEMBERS) {
        if (!members.some((m) => m.user_id === seed.user_id)) {
          members.push({
            ...seed,
            organization_id: organizationId,
          });
          hasAdded = true;
        }
      }
      if (hasAdded) {
        this.saveMembersToStorage(organizationId, members);
      }
    }
    return members;
  }

  private loadInvitationsFromStorage(organizationId: string): TeamInvitation[] {
    const key = this.getInvitationStorageKey(organizationId);
    try {
      let raw: string | null = null;
      if (typeof localStorage !== 'undefined') {
        raw = localStorage.getItem(key);
      } else {
        raw = this.memoryInvitations.get(key) || null;
      }
      if (!raw) return [];
      return JSON.parse(raw) as TeamInvitation[];
    } catch (err) {
      console.error(`[TeamService] Error loading invitation storage for org ${organizationId}:`, err);
      return [];
    }
  }

  private saveInvitationsToStorage(organizationId: string, invitations: TeamInvitation[]): void {
    const key = this.getInvitationStorageKey(organizationId);
    try {
      const serialized = JSON.stringify(invitations);
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(key, serialized);
      } else {
        this.memoryInvitations.set(key, serialized);
      }
    } catch (err) {
      console.error(`[TeamService] Error saving invitation storage for org ${organizationId}:`, err);
    }
  }

  private ensureInvitationsInitialized(organizationId: string): TeamInvitation[] {
    let invitations = this.loadInvitationsFromStorage(organizationId);
    if (isUUID(organizationId) && organizationId !== DEMO_ORGANIZATION_ID) {
      return invitations.filter((inv) => !inv.id.startsWith('demo-inv-'));
    }
    if (invitations.length === 0) {
      invitations = SEED_DEMO_INVITATIONS.map((inv) => ({
        ...inv,
        organization_id: organizationId,
        organization_name: 'DispatchDesk Logistics (Demo Fleet)',
      }));
      this.saveInvitationsToStorage(organizationId, invitations);
    }
    return invitations;
  }

  private computeInvitationStatus(inv: {
    accepted_at?: string | null;
    cancelled_at?: string | null;
    expires_at: string;
  }): InvitationStatus {
    if (inv.cancelled_at) return 'cancelled';
    if (inv.accepted_at) return 'accepted';
    if (new Date(inv.expires_at).getTime() <= Date.now()) return 'expired';
    return 'pending';
  }

  private sortMembers(members: TeamMember[]): TeamMember[] {
    const roleRank: Record<UserRole, number> = {
      owner_admin: 1,
      dispatcher: 2,
      staff: 3,
      driver: 4,
    };

    return [...members].sort((a, b) => {
      const rankDiff = (roleRank[a.role] || 99) - (roleRank[b.role] || 99);
      if (rankDiff !== 0) return rankDiff;
      const nameA = a.full_name || '';
      const nameB = b.full_name || '';
      return nameA.localeCompare(nameB);
    });
  }

  /**
   * Fetch all team members in an organization with hydrated profiles.
   */
  getTeamMembers(organizationId: string): Promise<TeamMember[]> {
    if (!organizationId) return Promise.resolve([]);

    const inFlight = this.inFlightGetTeamMembers.get(organizationId);
    if (inFlight) {
      return inFlight;
    }

    const request = (async () => {
      if (isSupabaseConfigured && isUUID(organizationId)) {
        if (organizationId !== DEMO_ORGANIZATION_ID) {
          try {
            let { data: memberRows, error: memberErr } = await supabase
              .from('organization_members')
              .select('*')
              .eq('organization_id', organizationId)
              .order('created_at', { ascending: true });

            // If a transient network glitch or gateway error occurred, retry once before reporting failure
            if (memberErr && (memberErr.message?.includes('500') || memberErr.message?.includes('<html') || memberErr.message?.includes('Failed to fetch') || !(memberErr as any).code)) {
              console.warn('[TeamService] Transient error on organization_members query, retrying in 300ms...');
              await new Promise((r) => setTimeout(r, 300));
              const retryRes = await supabase
                .from('organization_members')
                .select('*')
                .eq('organization_id', organizationId)
                .order('created_at', { ascending: true });
              memberRows = retryRes.data;
              memberErr = retryRes.error;
            }

            if (memberErr) {
              console.error('[TeamService] Error querying organization_members for real org:', memberErr);
              return [];
            }

            if (memberRows && memberRows.length > 0) {
              const userIds = memberRows.map((m) => m.user_id).filter(Boolean);

              const { data: profileRows, error: profileErr } = await supabase
                .from('profiles')
                .select('id, full_name, phone, preferred_timezone')
                .in('id', userIds);

              if (profileErr) {
                console.warn('[TeamService] Profile fetch warning:', profileErr);
              }

              const profileMap = new Map<
                string,
                { full_name: string | null; phone: string | null; preferred_timezone: string | null }
              >();

              if (profileRows) {
                for (const p of profileRows) {
                  profileMap.set(p.id, p);
                }
              }

              const result: TeamMember[] = memberRows.map((m) => {
                const profile = profileMap.get(m.user_id);
                return {
                  id: m.id,
                  user_id: m.user_id,
                  organization_id: m.organization_id,
                  role: m.role as UserRole,
                  created_at: m.created_at,
                  updated_at: m.updated_at,
                  full_name: profile?.full_name || 'Team Member',
                  phone: profile?.phone || null,
                  preferred_timezone: profile?.preferred_timezone || null,
                  email: null,
                };
              });

              return this.sortMembers(result);
            }
            return [];
          } catch (fetchErr) {
            console.error('[TeamService] Supabase getTeamMembers network error for real org:', fetchErr);
            return [];
          }
        }

        // Demo org flow
        try {
          const { data: memberRows, error: memberErr } = await supabase
            .from('organization_members')
            .select('*')
            .eq('organization_id', organizationId)
            .order('created_at', { ascending: true });

          if (memberErr) {
            console.warn('[TeamService] Error querying organization_members, using fallback:', memberErr);
            const members = this.ensureMembersInitialized(organizationId);
            return this.sortMembers(members);
          }

          if (memberRows && memberRows.length > 0) {
            const userIds = memberRows.map((m) => m.user_id).filter(Boolean);

            const { data: profileRows, error: profileErr } = await supabase
              .from('profiles')
              .select('id, full_name, phone, preferred_timezone')
              .in('id', userIds);

            if (profileErr) {
              console.warn('[TeamService] Profile fetch warning:', profileErr);
            }

            const profileMap = new Map<
              string,
              { full_name: string | null; phone: string | null; preferred_timezone: string | null }
            >();

            if (profileRows) {
              for (const p of profileRows) {
                profileMap.set(p.id, p);
              }
            }

            const result: TeamMember[] = memberRows.map((m) => {
              const profile = profileMap.get(m.user_id);
              return {
                id: m.id,
                user_id: m.user_id,
                organization_id: m.organization_id,
                role: m.role as UserRole,
                created_at: m.created_at,
                updated_at: m.updated_at,
                full_name: profile?.full_name || 'Team Member',
                phone: profile?.phone || null,
                preferred_timezone: profile?.preferred_timezone || null,
                email: null,
              };
            });

            return this.sortMembers(result);
          }
        } catch (fetchErr) {
          console.warn('[TeamService] Supabase getTeamMembers network error, using fallback:', fetchErr);
          const members = this.ensureMembersInitialized(organizationId);
          return this.sortMembers(members);
        }

        const members = this.ensureMembersInitialized(organizationId);
        return this.sortMembers(members);
      }

      if (isUUID(organizationId) && organizationId !== DEMO_ORGANIZATION_ID) {
        return [];
      }

      const members = this.ensureMembersInitialized(organizationId);
      return this.sortMembers(members);
    })().finally(() => {
      this.inFlightGetTeamMembers.delete(organizationId);
    });

    this.inFlightGetTeamMembers.set(organizationId, request);
    return request;
  }

  /**
   * Update a member's role (owner_admin only).
   * Guards against demoting the sole owner_admin of an organization.
   */
  async updateMemberRole(
    organizationId: string,
    memberId: string,
    newRole: UserRole,
    actorRole?: UserRole | null
  ): Promise<TeamMember> {
    if (!organizationId || !memberId) {
      throw new Error('Organization ID and Member ID are required.');
    }

    if (actorRole && actorRole !== 'owner_admin') {
      throw new Error('Unauthorized: Only Owner/Admins can modify team member roles.');
    }

    const validRoles: UserRole[] = ['owner_admin', 'dispatcher', 'staff'];
    if (!validRoles.includes(newRole)) {
      throw new Error(`Invalid role "${newRole}". Allowed roles: owner_admin, dispatcher, staff.`);
    }

    if (isSupabaseConfigured && isUUID(organizationId) && isUUID(memberId)) {
      const { data, error } = await (supabase.rpc as unknown as (fn: string, params: Record<string, unknown>) => Promise<{ data: any; error: any }>)(
        'update_team_member_role',
        {
          p_organization_id: organizationId,
          p_member_id: memberId,
          p_new_role: newRole,
        }
      );

      if (error) {
        console.error('[TeamService] Supabase update_team_member_role error:', error);
        throw new Error(error.message || 'Failed to update member role in Supabase.');
      }

      if (data) {
        this.notifyTeamUpdated({
          organizationId,
          type: 'member_role_updated',
          memberId,
          newRole,
        });
        return {
          id: data.id,
          user_id: data.user_id,
          organization_id: data.organization_id,
          role: data.role as UserRole,
          created_at: data.created_at,
          updated_at: data.updated_at,
          full_name: data.full_name || 'Team Member',
          phone: data.phone || null,
          preferred_timezone: data.preferred_timezone || 'America/Chicago',
          email: data.email || null,
        };
      }

      throw new Error('Unexpected empty response from update_team_member_role RPC.');
    }

    // Local / Demo Mode execution
    const currentMembers = await this.getTeamMembers(organizationId);
    const targetMember = currentMembers.find((m) => m.id === memberId);
    if (!targetMember) {
      throw new Error(`Team member with ID "${memberId}" was not found in organization.`);
    }

    if (targetMember.role === 'owner_admin' && newRole !== 'owner_admin') {
      const ownerAdminCount = currentMembers.filter((m) => m.role === 'owner_admin').length;
      if (ownerAdminCount <= 1) {
        throw new Error('Cannot demote the last Owner/Admin. Every organization must maintain at least one Owner/Admin.');
      }
    }

    const localMembers = this.ensureMembersInitialized(organizationId);
    const idx = localMembers.findIndex((m) => m.id === memberId);
    if (idx === -1) {
      throw new Error(`Team member with ID "${memberId}" was not found.`);
    }

    const updated: TeamMember = {
      ...localMembers[idx],
      role: newRole,
      updated_at: new Date().toISOString(),
    };

    localMembers[idx] = updated;
    this.saveMembersToStorage(organizationId, localMembers);
    this.notifyTeamUpdated({
      organizationId,
      type: 'member_role_updated',
      memberId,
      newRole,
    });
    return updated;
  }

  /**
   * Remove a member from an organization (owner_admin only).
   * Guards against deleting the sole owner_admin of an organization.
   */
  async removeMember(
    organizationId: string,
    memberId: string,
    actorRole?: UserRole | null
  ): Promise<void> {
    if (!organizationId || !memberId) {
      throw new Error('Organization ID and Member ID are required.');
    }

    if (actorRole && actorRole !== 'owner_admin') {
      throw new Error('Unauthorized: Only Owner/Admins can remove team members.');
    }

    if (isSupabaseConfigured && isUUID(organizationId) && isUUID(memberId)) {
      const { data, error } = await (supabase.rpc as unknown as (fn: string, params: Record<string, unknown>) => Promise<{ data: any; error: any }>)(
        'remove_team_member',
        {
          p_organization_id: organizationId,
          p_member_id: memberId,
        }
      );

      if (error) {
        console.error('[TeamService] Supabase remove_team_member error:', error);
        throw new Error(error.message || 'Failed to remove team member in Supabase.');
      }

      if (data && data.success) {
        this.notifyTeamUpdated({
          organizationId,
          type: 'member_removed',
          memberId,
        });
        return;
      }
      throw new Error('Unexpected response during member removal.');
    }

    // Local / Demo Mode removal
    const currentMembers = await this.getTeamMembers(organizationId);
    const targetMember = currentMembers.find((m) => m.id === memberId);
    if (!targetMember) {
      throw new Error(`Team member with ID "${memberId}" was not found in organization.`);
    }

    if (targetMember.role === 'owner_admin') {
      const ownerAdminCount = currentMembers.filter((m) => m.role === 'owner_admin').length;
      if (ownerAdminCount <= 1) {
        throw new Error('Cannot remove the last Owner/Admin. Every organization must maintain at least one Owner/Admin.');
      }
    }

    const localMembers = this.ensureMembersInitialized(organizationId);
    const filtered = localMembers.filter((m) => m.id !== memberId);
    this.saveMembersToStorage(organizationId, filtered);
    this.notifyTeamUpdated({
      organizationId,
      type: 'member_removed',
      memberId,
    });
  }

  /**
   * S5.2 & S6.9: Create and dispatch a new team invitation.
   * Generates a cryptographic token, computes SHA-256 hash, and calls the secure
   * create_team_invitation RPC which performs authoritative member & duplicate checks.
   * Supports operational write access for driver role invitations.
   */
  async createInvitation(
    organizationId: string,
    email: string,
    role: UserRole,
    invitedByUserId?: string,
    actorRole?: UserRole | null,
    driverId?: string | null
  ): Promise<{ invitation: TeamInvitation; rawToken: string; inviteUrl: string }> {
    if (role === 'driver') {
      if (actorRole && actorRole !== 'owner_admin' && actorRole !== 'dispatcher') {
        throw new Error('Unauthorized: Operational write access required to invite drivers.');
      }
      if (!driverId) {
        throw new Error('Driver profile selection is required when inviting a driver.');
      }
    } else {
      if (actorRole && actorRole !== 'owner_admin') {
        throw new Error('Unauthorized: Only Owner/Admins can invite team members.');
      }
      if (driverId) {
        throw new Error('Driver ID cannot be specified for office role invitations.');
      }
    }

    const normalizedEmail = normalizeEmail(email);
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!normalizedEmail || !emailRegex.test(normalizedEmail)) {
      throw new Error('Please provide a valid email address.');
    }

    const validRoles: UserRole[] = ['owner_admin', 'dispatcher', 'staff', 'driver'];
    if (!validRoles.includes(role)) {
      throw new Error(`Invalid role "${role}". Allowed roles: owner_admin, dispatcher, staff, driver.`);
    }

    // Generate cryptographic token & SHA-256 hash
    const rawToken = generateSecureToken();
    const tokenHash = await hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 7 * 86400000).toISOString(); // 7 days expiry

    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://dispatchdesk.app';
    const inviteUrl = `${origin}/?invitation_token=${encodeURIComponent(rawToken)}`;

    // Production path: Authoritative RPC
    if (isSupabaseConfigured && isUUID(organizationId)) {
      const { data, error } = await (supabase.rpc as unknown as (fn: string, params: Record<string, unknown>) => Promise<{ data: any; error: any }>)(
        'create_team_invitation',
        {
          p_organization_id: organizationId,
          p_email: normalizedEmail,
          p_role: role,
          p_token_hash: tokenHash,
          p_expires_at: expiresAt,
          p_driver_id: driverId || null,
        }
      );

      if (error) {
        throw new Error(error.message || 'Failed to create team invitation in Supabase.');
      }

      if (data) {
        const inv: TeamInvitation = {
          id: data.id,
          organization_id: data.organization_id,
          organization_name: data.organization_name,
          email: data.email,
          role: data.role as UserRole,
          driver_id: data.driver_id || null,
          driver_name: data.driver_name || null,
          invited_by_user_id: data.invited_by_user_id,
          invited_by_name: data.invited_by_name,
          expires_at: data.expires_at,
          accepted_at: data.accepted_at,
          cancelled_at: data.cancelled_at,
          created_at: data.created_at,
          updated_at: data.updated_at,
          status: 'pending',
          is_valid: true,
          invalid_reason: null,
        };

        this.notifyTeamUpdated({
          organizationId,
          type: 'invitation_created',
          invitationId: inv.id,
        });

        return { invitation: inv, rawToken, inviteUrl };
      }

      throw new Error('Unexpected empty response from create_team_invitation RPC.');
    }

    if (isUUID(organizationId) && organizationId !== DEMO_ORGANIZATION_ID) {
      throw new Error('Database connection is required to create team invitations for this organization.');
    }

    // Local / Demo Mode execution
    const existingMembers = await this.getTeamMembers(organizationId);
    const alreadyMember = existingMembers.some(
      (m) => m.email && normalizeEmail(m.email) === normalizedEmail
    );
    if (alreadyMember) {
      throw new Error(`User with email "${normalizedEmail}" is already an active member of this organization.`);
    }

    let resolvedDriverName: string | null = null;
    if (role === 'driver' && driverId) {
      const DRIVERS_STORAGE_PREFIX = 'dispatchdesk_demo_drivers_';
      let localDrivers: any[] = [];
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(`${DRIVERS_STORAGE_PREFIX}${organizationId}`);
        if (raw) {
          try {
            localDrivers = JSON.parse(raw);
          } catch (e) {
            localDrivers = [];
          }
        }
      }
      const matchedDriver = localDrivers.find((d) => d.id === driverId);
      if (matchedDriver) {
        if (matchedDriver.user_id) {
          throw new Error(`Driver profile "${matchedDriver.full_name}" is already linked to a user account.`);
        }
        resolvedDriverName = matchedDriver.full_name;
      }
    }

    const localInvitations = this.ensureInvitationsInitialized(organizationId);
    const activeInv = localInvitations.find(
      (inv) =>
        normalizeEmail(inv.email) === normalizedEmail &&
        this.computeInvitationStatus(inv) === 'pending'
    );
    if (activeInv) {
      throw new Error(`An active pending invitation already exists for "${normalizedEmail}".`);
    }

    if (role === 'driver' && driverId) {
      const activeDriverInv = localInvitations.find(
        (inv) =>
          inv.driver_id === driverId &&
          this.computeInvitationStatus(inv) === 'pending'
      );
      if (activeDriverInv) {
        throw new Error('An active pending invitation already exists for this driver profile.');
      }
    }

    const newInvitation: TeamInvitation = {
      id: `inv-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      organization_id: organizationId,
      organization_name: 'DispatchDesk Logistics (Demo Fleet)',
      email: normalizedEmail,
      role,
      driver_id: driverId || null,
      driver_name: resolvedDriverName,
      invited_by_user_id: invitedByUserId || 'usr-alex-1',
      invited_by_name: 'Alex Rivera (Owner/Admin)',
      token_hash: tokenHash,
      expires_at: expiresAt,
      accepted_at: null,
      cancelled_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      status: 'pending',
      is_valid: true,
      invalid_reason: null,
    };

    localInvitations.unshift(newInvitation);
    this.saveInvitationsToStorage(organizationId, localInvitations);

    this.notifyTeamUpdated({
      organizationId,
      type: 'invitation_created',
      invitationId: newInvitation.id,
    });

    return {
      invitation: newInvitation,
      rawToken,
      inviteUrl,
    };
  }

  /**
   * S5.2: List invitations for an organization with calculated status.
   */
  async listInvitations(
    organizationId: string,
    actorRole?: UserRole | null
  ): Promise<TeamInvitation[]> {
    if (!organizationId) return [];

    if (isSupabaseConfigured && isUUID(organizationId)) {
      const { data, error } = await supabase
        .from('organization_invitations')
        .select('*')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[TeamService] Error fetching organization_invitations:', error);
        throw new Error(error.message || 'Failed to list team invitations.');
      }

      if (data) {
        // Fetch inviter profiles
        const inviterIds = data.map((d) => d.invited_by_user_id).filter(Boolean) as string[];
        const inviterMap = new Map<string, string>();

        if (inviterIds.length > 0) {
          const { data: profs } = await supabase
            .from('profiles')
            .select('id, full_name')
            .in('id', inviterIds);

          if (profs) {
            for (const p of profs) {
              if (p.full_name) inviterMap.set(p.id, p.full_name);
            }
          }
        }

        // Fetch driver profiles if any
        const driverIds = data.map((d) => (d as any).driver_id).filter(Boolean) as string[];
        const driverMap = new Map<string, string>();

        if (driverIds.length > 0) {
          const { data: driverRows } = await supabase
            .from('drivers')
            .select('id, full_name')
            .in('id', driverIds);

          if (driverRows) {
            for (const d of driverRows) {
              if (d.full_name) driverMap.set(d.id, d.full_name);
            }
          }
        }

        return data.map((row) => ({
          id: row.id,
          organization_id: row.organization_id,
          email: row.email,
          role: row.role as UserRole,
          driver_id: (row as any).driver_id || null,
          driver_name: (row as any).driver_id ? driverMap.get((row as any).driver_id) || null : null,
          invited_by_user_id: row.invited_by_user_id,
          invited_by_name: row.invited_by_user_id ? inviterMap.get(row.invited_by_user_id) || 'Administrator' : null,
          expires_at: row.expires_at,
          accepted_at: row.accepted_at,
          cancelled_at: row.cancelled_at,
          created_at: row.created_at,
          updated_at: row.updated_at,
          status: this.computeInvitationStatus(row),
        }));
      }
      return [];
    }

    if (isUUID(organizationId) && organizationId !== DEMO_ORGANIZATION_ID) {
      return [];
    }

    // Local / Demo Mode
    const local = this.ensureInvitationsInitialized(organizationId);
    return local
      .map((inv) => ({
        ...inv,
        status: this.computeInvitationStatus(inv),
      }))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  /**
   * S5.2 & S6.9: Cancel an active pending invitation.
   * Operational write access (owner_admin or dispatcher) can cancel driver invitations.
   * Office role invitations require owner_admin.
   */
  async cancelInvitation(
    organizationId: string,
    invitationId: string,
    actorRole?: UserRole | null
  ): Promise<void> {
    if (actorRole && actorRole !== 'owner_admin' && actorRole !== 'dispatcher') {
      throw new Error('Unauthorized: Operational write access required to cancel invitations.');
    }

    if (isSupabaseConfigured && isUUID(organizationId) && isUUID(invitationId)) {
      const { error } = await (supabase.rpc as unknown as (fn: string, params: Record<string, unknown>) => Promise<{ data: any; error: any }>)(
        'cancel_team_invitation',
        { p_invitation_id: invitationId }
      );

      if (error) {
        throw new Error(error.message || 'Failed to cancel invitation in Supabase.');
      }
      this.notifyTeamUpdated({
        organizationId,
        type: 'invitation_cancelled',
        invitationId,
      });
      return;
    }

    if (isUUID(organizationId) && organizationId !== DEMO_ORGANIZATION_ID) {
      throw new Error('Database connection is required to cancel invitations for this organization.');
    }

    // Local / Demo Mode
    const local = this.ensureInvitationsInitialized(organizationId);
    const idx = local.findIndex((i) => i.id === invitationId);
    if (idx === -1) {
      throw new Error(`Invitation with ID "${invitationId}" not found.`);
    }

    if (local[idx].role !== 'driver' && actorRole && actorRole !== 'owner_admin') {
      throw new Error('Unauthorized: Only Owner/Admins can cancel office team invitations.');
    }

    if (local[idx].accepted_at) {
      throw new Error('Cannot cancel an invitation that has already been accepted.');
    }
    if (local[idx].cancelled_at) {
      throw new Error('Invitation is already cancelled.');
    }
    if (new Date(local[idx].expires_at).getTime() <= Date.now()) {
      throw new Error('Invitation has already expired.');
    }

    local[idx].cancelled_at = new Date().toISOString();
    local[idx].status = 'cancelled';
    local[idx].updated_at = new Date().toISOString();
    this.saveInvitationsToStorage(organizationId, local);
    this.notifyTeamUpdated({
      organizationId,
      type: 'invitation_cancelled',
      invitationId,
    });
  }

  /**
   * S5.2 & S6.9: Look up invitation details by raw URL token.
   * Hashes the raw token to find the invitation without exposing table permissions.
   * Returns linked driver profile information if applicable.
   */
  async getInvitationByToken(rawToken: string): Promise<TeamInvitation | null> {
    if (!rawToken || !rawToken.trim()) return null;

    const tokenHash = await hashToken(rawToken.trim());

    if (isSupabaseConfigured) {
      try {
        const { data } = await (supabase.rpc as unknown as (fn: string, params: Record<string, unknown>) => Promise<{ data: any; error: unknown }>)(
          'get_invitation_details',
          { p_token_hash: tokenHash }
        );

        if (data && data.id) {
          return {
            id: data.id,
            organization_id: data.organization_id,
            organization_name: data.organization_name || 'DispatchDesk Organization',
            email: data.email,
            role: data.role as UserRole,
            driver_id: data.driver_id || null,
            driver_name: data.driver_name || null,
            invited_by_user_id: data.invited_by_user_id,
            invited_by_name: data.invited_by_name,
            expires_at: data.expires_at,
            accepted_at: data.accepted_at,
            cancelled_at: data.cancelled_at,
            created_at: data.created_at,
            status: data.status as InvitationStatus,
            is_valid: data.is_valid,
            invalid_reason: data.invalid_reason,
          };
        }
      } catch (err: any) {
        console.warn('[TeamService] get_invitation_details check:', err?.message || err);
      }
    }

    // Local / Demo Mode search (strictly compares SHA-256 token_hash)
    if (typeof localStorage !== 'undefined') {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(INVITATION_STORAGE_PREFIX)) {
          const raw = localStorage.getItem(key);
          if (raw) {
            try {
              const list: TeamInvitation[] = JSON.parse(raw);
              const matched = list.find((inv) => inv.token_hash === tokenHash);
              if (matched) {
                const status = this.computeInvitationStatus(matched);
                const isValid = status === 'pending';
                let invalidReason: string | null = null;
                if (status === 'cancelled') invalidReason = 'This invitation was cancelled by an organization administrator.';
                else if (status === 'accepted') invalidReason = 'This invitation has already been accepted.';
                else if (status === 'expired') invalidReason = 'This invitation has expired.';

                return {
                  ...matched,
                  status,
                  is_valid: isValid,
                  invalid_reason: invalidReason,
                };
              }
            } catch (e) {
              // ignore parse errors
            }
          }
        }
      }
    }

    // Check memory storage fallback
    for (const [key, raw] of this.memoryInvitations.entries()) {
      if (key && key.startsWith(INVITATION_STORAGE_PREFIX)) {
        try {
          const list: TeamInvitation[] = JSON.parse(raw);
          const matched = list.find((inv) => inv.token_hash === tokenHash);
          if (matched) {
            const status = this.computeInvitationStatus(matched);
            const isValid = status === 'pending';
            let invalidReason: string | null = null;
            if (status === 'cancelled') invalidReason = 'This invitation was cancelled by an organization administrator.';
            else if (status === 'accepted') invalidReason = 'This invitation has already been accepted.';
            else if (status === 'expired') invalidReason = 'This invitation has expired.';

            return {
              ...matched,
              status,
              is_valid: isValid,
              invalid_reason: invalidReason,
            };
          }
        } catch {
          // ignore
        }
      }
    }

    // Check seed invitations fallback (strictly compares SHA-256 token_hash)
    const seedMatch = SEED_DEMO_INVITATIONS.find((inv) => inv.token_hash === tokenHash);
    if (seedMatch) {
      const status = this.computeInvitationStatus(seedMatch);
      return {
        ...seedMatch,
        organization_id: 'demo-org-1',
        organization_name: 'DispatchDesk Logistics (Demo Fleet)',
        status,
        is_valid: status === 'pending',
        invalid_reason: status !== 'pending' ? `Invitation is ${status}.` : null,
      };
    }

    return null;
  }

  /**
   * S5.2 & S6.9: Accept invitation and provision organization membership.
   * Atomically binds driver profile if role is 'driver'.
   */
  async acceptInvitation(
    rawToken: string,
    user: { id: string; email?: string; full_name?: string }
  ): Promise<{
    organizationId: string;
    organizationName: string;
    role: UserRole;
    driverId?: string | null;
    driverName?: string | null;
  }> {
    if (!rawToken || !rawToken.trim()) {
      throw new Error('Invitation token is required.');
    }
    if (!user || !user.id || !user.email) {
      throw new Error('Authenticated user details are required.');
    }

    const tokenHash = await hashToken(rawToken.trim());
    const invitation = await this.getInvitationByToken(rawToken);
    if (!invitation) {
      throw new Error('Invitation not found or link has expired.');
    }

    if (
      isSupabaseConfigured &&
      isUUID(invitation.organization_id) &&
      invitation.organization_id !== DEMO_ORGANIZATION_ID
    ) {
      const { data, error } = await (supabase.rpc as unknown as (fn: string, params: Record<string, unknown>) => Promise<{ data: any; error: any }>)(
        'accept_team_invitation',
        { p_token_hash: tokenHash }
      );

      if (error) {
        throw new Error(error.message || 'Failed to accept invitation.');
      }

      if (data && data.success) {
        this.notifyTeamUpdated({
          organizationId: data.organization_id,
          type: 'invitation_accepted',
          role: data.role as UserRole,
        });
        return {
          organizationId: data.organization_id,
          organizationName: data.organization_name || 'Organization',
          role: data.role as UserRole,
          driverId: data.driver_id || null,
          driverName: data.driver_name || null,
        };
      }
      throw new Error('Unexpected response during invitation acceptance.');
    }

    // Local / Demo Mode acceptance
    if (!invitation) {
      throw new Error('Invitation not found or link has expired.');
    }

    if (invitation.cancelled_at) {
      throw new Error('This invitation has been cancelled by an administrator.');
    }
    if (invitation.accepted_at) {
      throw new Error('This invitation has already been accepted.');
    }
    if (new Date(invitation.expires_at).getTime() <= Date.now()) {
      throw new Error('This invitation has expired.');
    }

    // Verify email match (case-insensitive)
    if (normalizeEmail(user.email) !== normalizeEmail(invitation.email)) {
      throw new Error(
        `This invitation was sent to ${invitation.email}. You are signed in as ${user.email}. Please sign in with the invited email address to accept.`
      );
    }

    // Privilege escalation guard: Verify not already a member
    const orgId = invitation.organization_id || 'demo-org-1';
    const currentMembers = this.ensureMembersInitialized(orgId);
    const existingMember = currentMembers.find((m) => m.user_id === user.id);
    if (existingMember) {
      throw new Error('You are already a member of this organization.');
    }

    // S6.9 Atomic Driver Profile Binding in Demo Mode
    if (invitation.role === 'driver') {
      if (!invitation.driver_id) {
        throw new Error('Driver invitation is missing linked driver profile.');
      }

      const DRIVERS_STORAGE_PREFIX = 'dispatchdesk_demo_drivers_';
      let localDrivers: any[] = [];
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(`${DRIVERS_STORAGE_PREFIX}${orgId}`);
        if (raw) {
          try {
            localDrivers = JSON.parse(raw);
          } catch (e) {
            localDrivers = [];
          }
        }
      }

      const driverIdx = localDrivers.findIndex((d) => d.id === invitation.driver_id);
      if (driverIdx !== -1) {
        if (localDrivers[driverIdx].user_id) {
          throw new Error('Target driver profile is already linked to another user account.');
        }
        localDrivers[driverIdx].user_id = user.id;
        if (!localDrivers[driverIdx].email) {
          localDrivers[driverIdx].email = user.email;
        }
        localDrivers[driverIdx].updated_at = new Date().toISOString();
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(`${DRIVERS_STORAGE_PREFIX}${orgId}`, JSON.stringify(localDrivers));
        }
      }
    }

    const newMember: TeamMember = {
      id: `mem-${Date.now()}`,
      user_id: user.id,
      organization_id: orgId,
      role: invitation.role,
      full_name: user.full_name || 'New Team Member',
      phone: null,
      preferred_timezone: 'America/Chicago',
      email: invitation.email,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    currentMembers.push(newMember);
    this.saveMembersToStorage(orgId, currentMembers);

    // Mark invitation as accepted
    const localInvitations = this.ensureInvitationsInitialized(orgId);
    const invIdx = localInvitations.findIndex((i) => i.id === invitation.id);
    if (invIdx !== -1) {
      localInvitations[invIdx].accepted_at = new Date().toISOString();
      localInvitations[invIdx].status = 'accepted';
      this.saveInvitationsToStorage(orgId, localInvitations);
    }

    this.notifyTeamUpdated({
      organizationId: orgId,
      type: 'invitation_accepted',
      role: invitation.role,
    });

    return {
      organizationId: orgId,
      organizationName: invitation.organization_name || 'DispatchDesk Logistics (Demo Fleet)',
      role: invitation.role,
      driverId: invitation.driver_id || null,
      driverName: invitation.driver_name || null,
    };
  }
}

export const teamService: ITeamService = new TeamService();
