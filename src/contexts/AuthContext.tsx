import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '../lib/supabase.ts';
import { Organization, Profile, UserRole } from '../types/domain.types.ts';

export interface UserOrgMembership {
  organization: Organization;
  role: UserRole;
}

export interface DriverIdentityProfile {
  id: string;
  organization_id: string;
  client_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  license_number: string | null;
  status: string;
  pay_type?: string | null;
  pay_rate?: number | null;
  client?: {
    id: string;
    name: string;
    status: string;
    organization?: Organization;
  } | null;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  activeOrganization: Organization | null;
  userRole: UserRole | null;
  memberships: UserOrgMembership[];
  isDriver: boolean;
  driverProfile: DriverIdentityProfile | null;
  isLoading: boolean;
  isResolvingUserData: boolean;
  isConfigured: boolean;
  isPasswordRecovery: boolean;
  recoveryError: string | null;
  clearPasswordRecovery: () => void;
  setActiveOrganizationId: (orgId: string) => void;
  createOrganization: (name: string, slug?: string, timezone?: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  refreshUserData: (targetUser?: User | null) => Promise<void>;
  claimDriverPortalByPhone: () => Promise<{ success: boolean; error?: string; data?: any }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const LOCAL_ORGS_KEY = 'dispatchdesk_local_orgs';
const LOCAL_ACTIVE_KEY = 'dispatchdesk_active_org_id';

const defaultDemoOrg: Organization = {
  id: 'demo-org-1',
  name: 'DispatchDesk Logistics (Demo Fleet)',
  slug: 'dispatchdesk-demo',
  dot_number: '1234567',
  mc_number: '987654',
  primary_timezone: 'America/Chicago',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const getLocalFallbackOrganizations = (): Organization[] => {
  const storedOrgsRaw = localStorage.getItem(LOCAL_ORGS_KEY);
  if (storedOrgsRaw) {
    try {
      const parsed = JSON.parse(storedOrgsRaw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    } catch {
      // ignore parse error
    }
  }
  return [defaultDemoOrg];
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [memberships, setMemberships] = useState<UserOrgMembership[]>([]);
  const [activeOrganization, setActiveOrganization] = useState<Organization | null>(null);
  const activeOrganizationRef = useRef<Organization | null>(null);
  activeOrganizationRef.current = activeOrganization;
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [isDriver, setIsDriver] = useState<boolean>(false);
  const [driverProfile, setDriverProfile] = useState<DriverIdentityProfile | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isResolvingUserData, setIsResolvingUserData] = useState<boolean>(false);

  // Sync role and user ID for service-level access control enforcement
  useEffect(() => {
    try {
      if (userRole) {
        localStorage.setItem('dispatchdesk_current_role', userRole);
      } else {
        localStorage.removeItem('dispatchdesk_current_role');
      }
      if (user?.id) {
        localStorage.setItem('dispatchdesk_current_user_id', user.id);
      } else {
        localStorage.removeItem('dispatchdesk_current_user_id');
      }
    } catch {
      // ignore in environments without localStorage
    }
  }, [userRole, user?.id]);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const h = window.location.hash || '';
    const s = window.location.search || '';
    return h.includes('type=recovery') || s.includes('type=recovery');
  });
  const [recoveryError, setRecoveryError] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    const h = window.location.hash || '';
    const s = window.location.search || '';
    if (
      h.includes('error_code=otp_expired') ||
      s.includes('error_code=otp_expired') ||
      h.includes('invalid+or+has+expired') ||
      h.includes('Email+link+is+invalid')
    ) {
      return 'This password reset link has expired or has already been used. Please request a new password reset link.';
    }
    if (h.includes('error=access_denied') || s.includes('error=access_denied')) {
      return 'Access denied or invalid reset link. Please request a new password reset link.';
    }
    return null;
  });

  const clearPasswordRecovery = useCallback(() => {
    setIsPasswordRecovery(false);
    setRecoveryError(null);
  }, []);

  const applyLocalFallback = useCallback(() => {
    // Check if demo driver is active
    const demoDriverRaw = localStorage.getItem('dispatchdesk_demo_active_driver');
    if (demoDriverRaw) {
      try {
        const parsedDriver = JSON.parse(demoDriverRaw);
        if (parsedDriver && parsedDriver.id) {
          setIsDriver(true);
          setDriverProfile(parsedDriver);
          setUserRole('driver');
          setMemberships([]);
          setActiveOrganization(parsedDriver.client?.organization || defaultDemoOrg);
          return;
        }
      } catch {
        // ignore
      }
    }

    const fallbackOrgs = getLocalFallbackOrganizations();
    const activeId = localStorage.getItem(LOCAL_ACTIVE_KEY) || fallbackOrgs[0].id;
    const matched = fallbackOrgs.find((o) => o.id === activeId) || fallbackOrgs[0];

    const demoMemberships: UserOrgMembership[] = fallbackOrgs.map((org) => ({
      organization: org,
      role: 'owner_admin',
    }));

    setIsDriver(false);
    setDriverProfile(null);
    setMemberships(demoMemberships);
    setActiveOrganization(matched);
    setUserRole('owner_admin');
  }, []);

  const fetchUserData = useCallback(async (currentUser: User) => {
    try {
      // 1. Fetch user profile
      try {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', currentUser.id)
          .maybeSingle();

        if (profileData) {
          setProfile(profileData as Profile);
        }
      } catch (profileErr) {
        console.warn('Profile fetch warning (using session defaults):', profileErr);
      }

      // 2. Fetch memberships for office roles (owner_admin, dispatcher, staff)
      let memberRows: unknown = null;
      let memberErr: { message?: string } | null = null;

      try {
        const queryRes = await supabase
          .from('organization_members')
          .select(`
            role,
            created_at,
            organization:organizations (
              id,
              name,
              slug,
              dot_number,
              mc_number,
              primary_timezone,
              created_at,
              updated_at
            )
          `)
          .eq('user_id', currentUser.id)
          .order('created_at', { ascending: false });

        memberRows = queryRes.data;
        memberErr = queryRes.error;
      } catch (fetchErr: any) {
        memberErr = { message: fetchErr?.message || String(fetchErr) };
      }

      if (memberErr) {
        console.warn('Notice fetching org memberships for authenticated user:', memberErr.message || memberErr);
        // Do NOT convert authenticated user to demo mode.
        // Preserve existing authenticated organization context if available.
        return;
      }

      const parsedMemberships: UserOrgMembership[] = [];
      if (memberRows) {
        const rows = memberRows as unknown as any[];
        for (const row of rows) {
          if (row.organization) {
            parsedMemberships.push({
              organization: (Array.isArray(row.organization) ? row.organization[0] : row.organization) as unknown as Organization,
              role: row.role as UserRole,
            });
          }
        }
      }

      // STEP 2: If office membership exists, user is an internal office team member
      if (parsedMemberships.length > 0) {
        setIsDriver(false);
        setDriverProfile(null);
        setMemberships(parsedMemberships);

        // Deterministic resolution order:
        // A. If saved organization ID matches one of the user's CURRENT valid memberships
        //    (and is not a demo ID like 'demo-org-1'):
        const savedOrgId = localStorage.getItem(LOCAL_ACTIVE_KEY);
        const isNotDemo = savedOrgId && !savedOrgId.startsWith('demo-');
        const matchedSaved = isNotDemo
          ? parsedMemberships.find((m) => m.organization.id === savedOrgId)
          : undefined;

        // B. If saved organization ID is missing, stale, or a demo ID:
        //    1. If current in-memory activeOrganization is valid in parsedMemberships, preserve it.
        //    2. Otherwise, choose a valid real membership deterministically using metadata
        //       (most recently created organization first).
        let resolvedMembership: UserOrgMembership;
        if (matchedSaved) {
          resolvedMembership = matchedSaved;
        } else {
          const currentActiveId = activeOrganizationRef.current?.id;
          const currentMatch = currentActiveId && !currentActiveId.startsWith('demo-')
            ? parsedMemberships.find((m) => m.organization.id === currentActiveId)
            : undefined;

          if (currentMatch) {
            resolvedMembership = currentMatch;
          } else {
            const sorted = [...parsedMemberships].sort((a, b) => {
              const timeA = new Date(a.organization.created_at || 0).getTime();
              const timeB = new Date(b.organization.created_at || 0).getTime();
              return timeB - timeA;
            });
            resolvedMembership = sorted[0] || parsedMemberships[0];
          }
        }

        setActiveOrganization(resolvedMembership.organization);
        setUserRole(resolvedMembership.role);

        // Only persist an ID that belongs to the authenticated user's current valid memberships
        if (resolvedMembership.organization.id && !resolvedMembership.organization.id.startsWith('demo-')) {
          localStorage.setItem(LOCAL_ACTIVE_KEY, resolvedMembership.organization.id);
        }
        return;
      }

      // STEP 3: If no office memberships, check canonical driver identity (drivers.user_id = auth.uid())
      let driverData: any = null;
      let driverErr: any = null;
      try {
        const driverRes = await supabase
          .from('drivers')
          .select(`
            id,
            organization_id,
            client_id,
            full_name,
            email,
            phone,
            status,
            pay_type,
            pay_rate,
            client:clients (
              id,
              company_name,
              status,
              organization:organizations (
                id,
                name,
                slug,
                dot_number,
                mc_number,
                primary_timezone,
                created_at,
                updated_at
              )
            )
          `)
          .eq('user_id', currentUser.id)
          .neq('status', 'inactive')
          .maybeSingle();
        driverData = driverRes.data;
        driverErr = driverRes.error;
      } catch (dErr) {
        driverErr = dErr;
      }

      if (!driverErr && driverData) {
        // Authenticated user is an external persistent Driver!
        const parsedDriver = driverData as unknown as DriverIdentityProfile;
        setIsDriver(true);
        setDriverProfile(parsedDriver);
        setUserRole('driver');
        setMemberships([]);

        // Resolve carrier client's organization
        let driverOrg: Organization | null = null;
        if (parsedDriver.client && parsedDriver.client.organization) {
          driverOrg = parsedDriver.client.organization;
        } else if (parsedDriver.organization_id) {
          // Fetch org details if not nested
          const { data: orgData } = await supabase
            .from('organizations')
            .select('*')
            .eq('id', parsedDriver.organization_id)
            .maybeSingle();
          if (orgData) {
            driverOrg = orgData as Organization;
          }
        }

        setActiveOrganization(driverOrg);
        if (driverOrg && !driverOrg.id.startsWith('demo-')) {
          localStorage.setItem(LOCAL_ACTIVE_KEY, driverOrg.id);
        }
        return;
      }

      // STEP 4: Authenticated user with NEITHER office membership nor driver identity
      // Do NOT assume driver solely because memberships.length === 0
      setIsDriver(false);
      setDriverProfile(null);
      setMemberships([]);
      setActiveOrganization(null);
      setUserRole(null);
      localStorage.removeItem(LOCAL_ACTIVE_KEY);
    } catch (err) {
      console.warn('Notice loading user data for authenticated user:', err);
      // For authenticated user, preserve existing authenticated state; do NOT call applyLocalFallback()
    }
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      applyLocalFallback();
      setIsResolvingUserData(false);
      setIsLoading(false);
      return;
    }

    const cleanRecoveryUrl = () => {
      if (typeof window === 'undefined' || !window.history?.replaceState) return;
      try {
        const url = new URL(window.location.href);
        if (
          url.hash &&
          (url.hash.includes('access_token=') ||
            url.hash.includes('type=recovery') ||
            url.hash.includes('error='))
        ) {
          url.hash = '';
        }
        url.searchParams.delete('error');
        url.searchParams.delete('error_code');
        url.searchParams.delete('error_description');
        url.searchParams.delete('type');
        const cleanPath = url.pathname + (url.search ? url.search : '') + (url.hash ? url.hash : '');
        window.history.replaceState({}, document.title, cleanPath || '/');
      } catch {
        // ignore
      }
    };

    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          // If in password recovery mode, do not route into the active workspace
          if (isPasswordRecovery) {
            cleanRecoveryUrl();
            setIsResolvingUserData(false);
            setIsLoading(false);
            return;
          }
          setIsResolvingUserData(true);
          fetchUserData(session.user).finally(() => {
            setIsResolvingUserData(false);
            setIsLoading(false);
          });
        } else {
          // Initialize default workspace for guest/demo browsing
          applyLocalFallback();
          setIsResolvingUserData(false);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        console.warn('Session check note:', err?.message || err);
        applyLocalFallback();
        setIsResolvingUserData(false);
        setIsLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsPasswordRecovery(true);
        setRecoveryError(null);
        setSession(session);
        setUser(session?.user ?? null);
        cleanRecoveryUrl();
        setIsResolvingUserData(false);
        setIsLoading(false);
        return;
      }

      if (event === 'SIGNED_OUT') {
        setIsPasswordRecovery(false);
        setSession(null);
        setUser(null);
        setProfile(null);
        applyLocalFallback();
        setIsResolvingUserData(false);
        setIsLoading(false);
        return;
      }

      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        // If recovery mode is currently active, preserve it without auto-entering the app
        if (isPasswordRecovery) {
          cleanRecoveryUrl();
          setIsResolvingUserData(false);
          setIsLoading(false);
          return;
        }
        setIsResolvingUserData(true);
        fetchUserData(session.user).finally(() => {
          setIsResolvingUserData(false);
          setIsLoading(false);
        });
      } else {
        setProfile(null);
        applyLocalFallback();
        setIsResolvingUserData(false);
        setIsLoading(false);
      }
    });

    const handleVisibilityOrFocus = async () => {
      if (document.visibilityState === 'visible' && isSupabaseConfigured) {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session) {
            const expiresAt = session.expires_at ? session.expires_at * 1000 : 0;
            if (expiresAt && (expiresAt - Date.now() < 120000)) {
              await supabase.auth.refreshSession();
            }
          }
        } catch (e) {
          console.warn('Proactive session refresh note:', e);
        }
      }
    };

    window.addEventListener('focus', handleVisibilityOrFocus);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);

    return () => {
      subscription.unsubscribe();
      window.removeEventListener('focus', handleVisibilityOrFocus);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
    };
  }, [fetchUserData, applyLocalFallback]);

  const setActiveOrganizationId = (orgId: string) => {
    const matched = memberships.find((m) => m.organization.id === orgId);
    if (matched) {
      if (user && matched.organization.id.startsWith('demo-')) {
        return;
      }
      setActiveOrganization(matched.organization);
      setUserRole(matched.role);
      if (!matched.organization.id.startsWith('demo-')) {
        localStorage.setItem(LOCAL_ACTIVE_KEY, matched.organization.id);
      }
    }
  };

  const createOrganization = async (name: string, slug?: string, timezone = 'America/Chicago'): Promise<string | null> => {
    const normalizedSlug = (slug || name)
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    const createLocalOrg = (): string => {
      const newOrg: Organization = {
        id: `org-${Date.now()}`,
        name: name.trim(),
        slug: normalizedSlug || `org-${Date.now()}`,
        dot_number: null,
        mc_number: null,
        primary_timezone: timezone,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const storedOrgsRaw = localStorage.getItem(LOCAL_ORGS_KEY);
      let localOrgs: Organization[] = [];
      if (storedOrgsRaw) {
        try {
          localOrgs = JSON.parse(storedOrgsRaw);
        } catch {
          localOrgs = [];
        }
      }
      localOrgs.push(newOrg);
      localStorage.setItem(LOCAL_ORGS_KEY, JSON.stringify(localOrgs));
      localStorage.setItem(LOCAL_ACTIVE_KEY, newOrg.id);

      const updatedMemberships: UserOrgMembership[] = localOrgs.map((org) => ({
        organization: org,
        role: 'owner_admin',
      }));

      setMemberships(updatedMemberships);
      setActiveOrganization(newOrg);
      setUserRole('owner_admin');
      return newOrg.id;
    };

    let currentUser = user;
    if (!currentUser && isSupabaseConfigured) {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        currentUser = session.user;
        setUser(session.user);
        setSession(session);
      }
    }

    if (!isSupabaseConfigured || !currentUser) {
      return createLocalOrg();
    }

    try {
      // Use the safe bootstrap RPC function
      const { data, error } = await (supabase.rpc as unknown as (fn: string, params: Record<string, unknown>) => Promise<{ data: string; error: unknown }>)(
        'create_organization_with_admin',
        {
          org_name: name.trim(),
          org_slug: normalizedSlug || undefined,
          org_primary_timezone: timezone,
        }
      );

      if (error) {
        console.warn('Supabase create org RPC note, falling back to local org:', error);
        return createLocalOrg();
      }

      if (data && typeof data === 'string' && !data.startsWith('demo-')) {
        localStorage.setItem(LOCAL_ACTIVE_KEY, data);
      }

      setIsResolvingUserData(true);
      try {
        await fetchUserData(currentUser);
      } finally {
        setIsResolvingUserData(false);
      }
      return (data as string) || createLocalOrg();
    } catch (err) {
      console.warn('Create organization notice, saving to local workspace:', err);
      return createLocalOrg();
    }
  };

  const signOut = async () => {
    setIsResolvingUserData(false);
    if (isSupabaseConfigured) {
      await supabase.auth.signOut();
    }
    setUser(null);
    setSession(null);
    setProfile(null);
    setActiveOrganization(null);
    setUserRole(null);
    setIsDriver(false);
    setDriverProfile(null);
    setMemberships([]);
    setIsResolvingUserData(false);
    localStorage.removeItem(LOCAL_ACTIVE_KEY);
    localStorage.removeItem('dispatchdesk_demo_active_driver');
  };

  const refreshUserData = async (targetUser?: User | null) => {
    let resolvedUser = targetUser ?? user;
    if (!resolvedUser && isSupabaseConfigured) {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        resolvedUser = session.user;
        setSession(session);
        setUser(session.user);
      }
    }
    if (resolvedUser) {
      setIsResolvingUserData(true);
      try {
        setUser(resolvedUser);
        await fetchUserData(resolvedUser);
      } finally {
        setIsResolvingUserData(false);
      }
    } else {
      setIsResolvingUserData(false);
    }
  };

  const claimDriverPortalByPhone = async (): Promise<{ success: boolean; error?: string; data?: any }> => {
    try {
      if (!isSupabaseConfigured) {
        return { success: true };
      }

      const { data, error } = await (supabase.rpc as any)('claim_driver_portal_by_phone');
      if (error) {
        return { success: false, error: error.message };
      }

      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData.session?.user) {
        setIsResolvingUserData(true);
        setUser(sessionData.session.user);
        setSession(sessionData.session);
        try {
          await fetchUserData(sessionData.session.user);
        } finally {
          setIsResolvingUserData(false);
        }
      } else {
        await refreshUserData();
      }

      return { success: true, data };
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === 'object' && err !== null && 'message' in err
          ? String((err as { message: unknown }).message)
          : 'Failed to claim driver portal identity.';
      return { success: false, error: msg };
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        activeOrganization,
        userRole,
        memberships,
        isDriver,
        driverProfile,
        isLoading,
        isResolvingUserData,
        isConfigured: isSupabaseConfigured,
        isPasswordRecovery,
        recoveryError,
        clearPasswordRecovery,
        setActiveOrganizationId,
        createOrganization,
        signOut,
        refreshUserData,
        claimDriverPortalByPhone,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
