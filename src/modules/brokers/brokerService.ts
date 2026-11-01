import { Broker, Load } from '../../types/domain.types.ts';
import { supabase, isSupabaseConfigured } from '../../lib/supabase.ts';

function isUUID(str?: string | null): boolean {
  if (!str) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

export const DEMO_ORGANIZATION_ID = 'demo-org-1';
import {
  BrokerWithPerformance,
  BrokerPerformanceMetrics,
  BrokerStatus,
  CreateBrokerInput,
  UpdateBrokerInput,
  BrokerFilterCriteria,
  cleanIdentifier,
} from './brokerTypes.ts';

// Storage keys
const BROKERS_STORAGE_PREFIX = 'dispatchdesk_demo_brokers_';
const LOADS_STORAGE_PREFIX = 'dispatchdesk_demo_loads_';

// Seed Brokers for demo organizations (strictly fictional mock entities)
const SEED_BROKERS: (Omit<Broker, 'organization_id'> & { status?: BrokerStatus })[] = [
  {
    id: 'demo-broker-1',
    company_name: 'Apex Freight Logistics [Demo]',
    mc_number: '084729',
    dot_number: '221458',
    contact_name: 'Sarah Jenkins (Midwest Fleet)',
    contact_phone: '(800) 555-0142',
    contact_email: 'dispatch@apex-demo-freight.test',
    payment_terms_days: 30,
    credit_status: 'approved',
    notes: 'Demo carrier Tier 1. QuickPay approved at 1.5% fee or 30 days standard Net. Requires standard 4-hour check call cadence.',
    status: 'active',
    created_at: new Date(Date.now() - 60 * 86400000).toISOString(),
    updated_at: new Date(Date.now() - 5 * 86400000).toISOString(),
  },
  {
    id: 'demo-broker-2',
    company_name: 'Blue Ridge Freight Brokerage [Demo]',
    mc_number: '347592',
    dot_number: '556102',
    contact_name: 'Brandon Cole (Team 204)',
    contact_phone: '(800) 555-0188',
    contact_email: 'ops@blueridge-demo.test',
    payment_terms_days: 30,
    credit_status: 'approved',
    notes: 'High volume dry van, flatbed and reefer spot freight demo partner. Requires tracking enabled via ELD link.',
    status: 'active',
    created_at: new Date(Date.now() - 50 * 86400000).toISOString(),
    updated_at: new Date(Date.now() - 4 * 86400000).toISOString(),
  },
  {
    id: 'demo-broker-3',
    company_name: 'Horizon Express Logistics [Demo]',
    mc_number: '561230',
    dot_number: '774109',
    contact_name: 'Amanda Cross',
    contact_phone: '(877) 555-0193',
    contact_email: 'loads@horizon-demo.test',
    payment_terms_days: 21,
    credit_status: 'approved',
    notes: 'Automated tracking required via MacroPoint / ELD link. Fast payment turnaround and reliable detention pay approval.',
    status: 'active',
    created_at: new Date(Date.now() - 45 * 86400000).toISOString(),
    updated_at: new Date(Date.now() - 3 * 86400000).toISOString(),
  },
  {
    id: 'demo-broker-4',
    company_name: 'Keystone Freight Partners [Demo]',
    mc_number: '143211',
    dot_number: '339812',
    contact_name: 'David Morrison (Agency JAX)',
    contact_phone: '(800) 555-0165',
    contact_email: 'agents@keystone-demo.test',
    payment_terms_days: 30,
    credit_status: 'approved',
    notes: 'Pre-vetted heavy haul and step-deck agent demo. Strict on on-time delivery and proof of insurance verification.',
    status: 'active',
    created_at: new Date(Date.now() - 40 * 86400000).toISOString(),
    updated_at: new Date(Date.now() - 2 * 86400000).toISOString(),
  },
  {
    id: 'demo-broker-5',
    company_name: 'Prairie Star Logistics [Demo]',
    mc_number: '445892',
    dot_number: '662301',
    contact_name: 'Rachel Sterling',
    contact_phone: '(800) 555-0177',
    contact_email: 'carrier-settlements@prairiestar-demo.test',
    payment_terms_days: 15,
    credit_status: 'factoring_only',
    notes: 'Requires factoring verification and notice of assignment before booking high-value freight.',
    status: 'active',
    created_at: new Date(Date.now() - 35 * 86400000).toISOString(),
    updated_at: new Date(Date.now() - 1 * 86400000).toISOString(),
  },
  {
    id: 'demo-broker-6',
    company_name: 'Great Lakes Cargo Exchange [Demo]',
    mc_number: '728104',
    dot_number: '912048',
    contact_name: 'Marcus Brody',
    contact_phone: '(844) 555-0133',
    contact_email: 'freight@greatlakes-demo.test',
    payment_terms_days: 28,
    credit_status: 'approved',
    notes: 'Digital freight marketplace demo partner. Instant booking available on preferred lane corridors.',
    status: 'active',
    created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
    updated_at: new Date(Date.now() - 1 * 86400000).toISOString(),
  },
  {
    id: 'demo-broker-7',
    company_name: 'Pacific Coast Freight Connect [Demo]',
    mc_number: '892110',
    dot_number: '258901',
    contact_name: 'Tyler Jensen',
    contact_phone: '(855) 555-0121',
    contact_email: 'dispatch@pacificcoast-demo.test',
    payment_terms_days: 45,
    credit_status: 'caution',
    notes: 'Demo test entity with extended payment terms (45+ days DSO). Recommend factoring submission on delivery day.',
    status: 'active',
    created_at: new Date(Date.now() - 25 * 86400000).toISOString(),
    updated_at: new Date(Date.now() - 3 * 86400000).toISOString(),
  },
  {
    id: 'demo-broker-8',
    company_name: 'Sample High-Risk Logistics LLC [Demo]',
    mc_number: '991204',
    dot_number: '312984',
    contact_name: 'Quality Review Desk',
    contact_phone: '(800) 555-0199',
    contact_email: 'review@sample-risk-demo.test',
    payment_terms_days: 60,
    credit_status: 'blocked',
    notes: 'DEMO TEST FIXTURE ONLY: Fictional entity illustrating credit status blockage with automated dispatch alert.',
    status: 'inactive',
    created_at: new Date(Date.now() - 75 * 86400000).toISOString(),
    updated_at: new Date(Date.now() - 10 * 86400000).toISOString(),
  },
];

function serializeBrokerFilters(filters?: BrokerFilterCriteria): string {
  if (!filters) return '';
  const parts: string[] = [];
  if (filters.search !== undefined) parts.push(`search:${filters.search.trim().toLowerCase()}`);
  if (filters.creditStatus !== undefined) parts.push(`credit:${filters.creditStatus}`);
  if (filters.status !== undefined) parts.push(`status:${filters.status}`);
  if (filters.sortBy !== undefined) parts.push(`sort:${filters.sortBy}`);
  return parts.join('|');
}

class BrokerService {
  private inFlightListBrokers = new Map<string, Promise<BrokerWithPerformance[]>>();

  /**
   * Helper to load raw brokers from localStorage or seed initial data
   */
  private getRawBrokers(orgId: string): (Broker & { status?: BrokerStatus })[] {
    const key = `${BROKERS_STORAGE_PREFIX}${orgId}`;
    const data = localStorage.getItem(key);
    if (!data) {
      if (isUUID(orgId) && orgId !== DEMO_ORGANIZATION_ID) {
        return [];
      }
      const seeded = SEED_BROKERS.map((b) => ({
        ...b,
        organization_id: orgId,
      }));
      localStorage.setItem(key, JSON.stringify(seeded));
      return seeded;
    }
    try {
      const parsed = JSON.parse(data);
      // Ensure all records belong strictly to orgId and have a status field
      return (Array.isArray(parsed) ? parsed : [])
        .filter((b: Broker) => !b.organization_id || b.organization_id === orgId)
        .filter((b: Broker) => !(isUUID(orgId) && orgId !== DEMO_ORGANIZATION_ID && typeof b.id === 'string' && b.id.startsWith('demo-broker-')))
        .map((b: Broker & { status?: BrokerStatus }) => ({
          ...b,
          organization_id: orgId,
          status: b.status || 'active',
        }));
    } catch {
      return [];
    }
  }

  /**
   * Helper to save raw brokers
   */
  private saveRawBrokers(orgId: string, brokers: (Broker & { status?: BrokerStatus })[]): void {
    const key = `${BROKERS_STORAGE_PREFIX}${orgId}`;
    // Force tenant organization_id on all persisted records
    const sanitized = brokers.map((b) => ({
      ...b,
      organization_id: orgId,
    }));
    localStorage.setItem(key, JSON.stringify(sanitized));
  }

  /**
   * Helper to load loads for calculating broker performance
   */
  private getRawLoads(orgId: string): Load[] {
    const key = `${LOADS_STORAGE_PREFIX}${orgId}`;
    const data = localStorage.getItem(key);
    if (!data) return [];
    try {
      const parsed = JSON.parse(data);
      return Array.isArray(parsed)
        ? parsed.filter((l: Load) => !l.organization_id || l.organization_id === orgId)
        : [];
    } catch {
      return [];
    }
  }

  /**
   * Calculates dynamic performance metrics from actual load history
   */
  public calculatePerformance(orgId: string, brokerId: string, paymentTermsDays: number): BrokerPerformanceMetrics {
    const loads = this.getRawLoads(orgId).filter(
      (l) => l.broker_id === brokerId && (!l.organization_id || l.organization_id === orgId)
    );

    const loads_count = loads.length;
    const total_gross = loads.reduce((sum, l) => sum + (l.rate || 0), 0);
    const total_miles = loads.reduce((sum, l) => sum + (l.loaded_miles || 0) + (l.deadhead_miles || 0), 0);
    const avg_rpm = total_miles > 0 ? total_gross / total_miles : 0;
    const active_loads_count = loads.filter((l) => l.pipeline_status === 'booked' || l.pipeline_status === 'in_transit').length;

    // Find latest load date
    let last_booked_at: string | null = null;
    if (loads.length > 0) {
      const sortedLoads = [...loads].sort((a, b) => {
        const dateA = new Date(a.pickup_datetime || a.created_at).getTime();
        const dateB = new Date(b.pickup_datetime || b.created_at).getTime();
        return dateB - dateA;
      });
      last_booked_at = sortedLoads[0].pickup_datetime || sortedLoads[0].created_at;
    }

    return {
      loads_count,
      total_gross,
      avg_rpm: Math.round(avg_rpm * 100) / 100,
      active_loads_count,
      last_booked_at,
      payment_terms_avg_days: paymentTermsDays,
    };
  }

  /**
   * List all brokers for an organization with optional filtering & sorting
   */
  listBrokers(orgId: string, filters?: BrokerFilterCriteria): Promise<BrokerWithPerformance[]> {
    if (!orgId) return Promise.resolve([]);

    const key = `${orgId}::${serializeBrokerFilters(filters)}`;
    const inFlight = this.inFlightListBrokers.get(key);
    if (inFlight) {
      return inFlight;
    }

    const request = (async () => {
      let brokers: Broker[] = [];

      if (isSupabaseConfigured && isUUID(orgId)) {
        if (orgId !== DEMO_ORGANIZATION_ID) {
          try {
            let { data, error } = await supabase
              .from('brokers')
              .select('*')
              .eq('organization_id', orgId)
              .order('company_name', { ascending: true });

            // If a transient network glitch or gateway error occurred, retry once before reporting failure
            if (error && (error.message?.includes('500') || error.message?.includes('<html') || error.message?.includes('Failed to fetch') || !(error as any).code)) {
              console.warn('[BrokerService] Transient error on listBrokers, retrying in 300ms...');
              await new Promise((r) => setTimeout(r, 300));
              const retryRes = await supabase
                .from('brokers')
                .select('*')
                .eq('organization_id', orgId)
                .order('company_name', { ascending: true });
              data = retryRes.data;
              error = retryRes.error;
            }

            if (error) {
              console.error('[BrokerService] Supabase listBrokers error for real org:', error);
              brokers = [];
            } else {
              brokers = (data || []) as Broker[];
            }
          } catch (fetchErr) {
            console.error('[BrokerService] Supabase listBrokers network error for real org:', fetchErr);
            brokers = [];
          }
        } else {
          // Demo org flow
          try {
            const { data, error } = await supabase
              .from('brokers')
              .select('*')
              .eq('organization_id', orgId)
              .order('company_name', { ascending: true });
            if (error) {
              console.warn('[BrokerService] Supabase listBrokers error, using fallback:', error);
              brokers = this.getRawBrokers(orgId);
            } else {
              brokers = (data || []) as Broker[];
              if (brokers.length === 0) {
                brokers = this.getRawBrokers(orgId);
              }
            }
          } catch (fetchErr) {
            console.warn('[BrokerService] Supabase listBrokers network error, using fallback:', fetchErr);
            brokers = this.getRawBrokers(orgId);
          }
        }
      } else if (isSupabaseConfigured) {
        try {
          const { data, error } = await supabase
            .from('brokers')
            .select('*')
            .eq('organization_id', orgId)
            .order('company_name', { ascending: true });
          if (!error && data) {
            brokers = data as Broker[];
          }
        } catch (err) {
          console.warn('Supabase listBrokers failed, falling back to local storage:', err);
        }
      }

      if (brokers.length === 0 && (!isUUID(orgId) || orgId === DEMO_ORGANIZATION_ID)) {
        // Artificial small delay for UI smoothness when fallback
        await new Promise((resolve) => setTimeout(resolve, 50));
        brokers = this.getRawBrokers(orgId);
      }

      if (filters) {
        // Search filter
        if (filters.search && filters.search.trim()) {
          const query = filters.search.toLowerCase().trim();
          brokers = brokers.filter((b) => {
            const company = (b.company_name || '').toLowerCase();
            const mc = (b.mc_number || '').toLowerCase();
            const dot = (b.dot_number || '').toLowerCase();
            const contact = (b.contact_name || '').toLowerCase();
            const email = (b.contact_email || '').toLowerCase();
            const phone = (b.contact_phone || '').toLowerCase();
            const notes = (b.notes || '').toLowerCase();

            return (
              company.includes(query) ||
              mc.includes(query) ||
              dot.includes(query) ||
              contact.includes(query) ||
              email.includes(query) ||
              phone.includes(query) ||
              notes.includes(query)
            );
          });
        }

        // Credit Status Filter
        if (filters.creditStatus && filters.creditStatus !== 'all') {
          brokers = brokers.filter((b) => b.credit_status === filters.creditStatus);
        }

        // Active/Inactive Status Filter
        if (filters.status && filters.status !== 'all') {
          brokers = brokers.filter((b) => ((b as Broker & { status?: BrokerStatus }).status || 'active') === filters.status);
        }
      }

      // Hydrate with performance metrics
      const hydratedBrokers: BrokerWithPerformance[] = brokers.map((b) => ({
        ...b,
        performance: this.calculatePerformance(orgId, b.id, b.payment_terms_days),
      }));

      // Sorting
      const sortBy = filters?.sortBy || 'newest';
      hydratedBrokers.sort((a, b) => {
        switch (sortBy) {
          case 'newest':
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
          case 'oldest':
            return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          case 'company_asc':
            return a.company_name.localeCompare(b.company_name);
          case 'company_desc':
            return b.company_name.localeCompare(a.company_name);
          case 'payment_terms':
            return a.payment_terms_days - b.payment_terms_days;
          case 'total_gross':
            return (b.performance?.total_gross || 0) - (a.performance?.total_gross || 0);
          default:
            return 0;
        }
      });

      return hydratedBrokers;
    })().finally(() => {
      this.inFlightListBrokers.delete(key);
    });

    this.inFlightListBrokers.set(key, request);
    return request;
  }

  /**
   * Get single broker with performance metrics
   */
  async getBroker(orgId: string, brokerId: string): Promise<BrokerWithPerformance | null> {
    if (isSupabaseConfigured && isUUID(orgId)) {
      if (orgId !== DEMO_ORGANIZATION_ID) {
        if (!isUUID(brokerId)) return null;
        const { data, error } = await supabase
          .from('brokers')
          .select('*')
          .eq('id', brokerId)
          .eq('organization_id', orgId)
          .maybeSingle();
        if (error) {
          console.error('[BrokerService] Supabase getBroker error:', error);
          throw new Error(error.message || 'Failed to fetch broker from database.');
        }
        if (data) {
          const broker = data as Broker;
          return {
            ...broker,
            performance: this.calculatePerformance(orgId, broker.id, broker.payment_terms_days),
          };
        }
        return null;
      }

      if (isUUID(brokerId)) {
        const { data, error } = await supabase
          .from('brokers')
          .select('*')
          .eq('id', brokerId)
          .eq('organization_id', orgId)
          .maybeSingle();
        if (error) {
          console.error('[BrokerService] Supabase getBroker error:', error);
          throw new Error(error.message || 'Failed to fetch broker from database.');
        }
        if (data) {
          const broker = data as Broker;
          return {
            ...broker,
            performance: this.calculatePerformance(orgId, broker.id, broker.payment_terms_days),
          };
        }
        return null;
      }
    }

    if (isSupabaseConfigured) {
      try {
        const { data, error } = await supabase
          .from('brokers')
          .select('*')
          .eq('id', brokerId)
          .eq('organization_id', orgId)
          .maybeSingle();
        if (!error && data) {
          const broker = data as Broker;
          return {
            ...broker,
            performance: this.calculatePerformance(orgId, broker.id, broker.payment_terms_days),
          };
        }
      } catch (err) {
        console.warn('Supabase getBroker failed, falling back to local storage:', err);
      }
    }

    if (isUUID(orgId) && orgId !== DEMO_ORGANIZATION_ID) {
      return null;
    }

    const brokers = this.getRawBrokers(orgId);
    const broker = brokers.find((b) => b.id === brokerId);
    if (!broker) return null;

    return {
      ...broker,
      performance: this.calculatePerformance(orgId, broker.id, broker.payment_terms_days),
    };
  }

  /**
   * Create new broker
   */
  async createBroker(orgId: string, input: CreateBrokerInput): Promise<BrokerWithPerformance> {
    const paymentTerms = Math.max(0, Math.min(120, Math.round(Number(input.payment_terms_days) || 30)));
    const cleanMc = input.mc_number ? cleanIdentifier(input.mc_number) || null : null;
    const cleanDot = input.dot_number ? cleanIdentifier(input.dot_number) || null : null;

    if (isSupabaseConfigured && isUUID(orgId)) {
      const { data, error } = await supabase
        .from('brokers')
        .insert({
          organization_id: orgId,
          company_name: input.company_name.trim(),
          mc_number: cleanMc,
          dot_number: cleanDot,
          contact_name: input.contact_name?.trim() || null,
          contact_email: input.contact_email?.trim() || null,
          contact_phone: input.contact_phone?.trim() || null,
          payment_terms_days: paymentTerms,
          credit_status: input.credit_status || 'approved',
          notes: input.notes?.trim() || null,
        })
        .select()
        .single();

      if (error) {
        if (error.code === 'PGRST303' || error.message?.includes('JWT expired')) {
          console.warn('[BrokerService] JWT expired during createBroker, attempting session refresh and retry...');
          const { error: refreshErr } = await supabase.auth.refreshSession();
          if (!refreshErr) {
            const retryRes = await supabase
              .from('brokers')
              .insert({
                organization_id: orgId,
                company_name: input.company_name.trim(),
                mc_number: cleanMc,
                dot_number: cleanDot,
                contact_name: input.contact_name?.trim() || null,
                contact_email: input.contact_email?.trim() || null,
                contact_phone: input.contact_phone?.trim() || null,
                payment_terms_days: paymentTerms,
                credit_status: input.credit_status || 'approved',
                notes: input.notes?.trim() || null,
              })
              .select()
              .single();

            if (!retryRes.error && retryRes.data) {
              const created = retryRes.data as Broker;
              return {
                ...created,
                performance: this.calculatePerformance(orgId, created.id, created.payment_terms_days),
              };
            }
          }
        }
        console.error('[BrokerService] Supabase createBroker error:', error);
        throw new Error(
          error.code === 'PGRST303' || error.message?.includes('JWT expired')
            ? 'Your authentication session has expired. Please refresh the page to sign in again.'
            : (error.message || 'Failed to create broker in database.')
        );
      }

      if (data) {
        const created = data as Broker;
        return {
          ...created,
          performance: this.calculatePerformance(orgId, created.id, created.payment_terms_days),
        };
      }
      throw new Error('Unexpected empty response while creating broker.');
    }

    if (isSupabaseConfigured) {
      try {
        const { data, error } = await supabase
          .from('brokers')
          .insert({
            organization_id: orgId,
            company_name: input.company_name.trim(),
            mc_number: cleanMc,
            dot_number: cleanDot,
            contact_name: input.contact_name?.trim() || null,
            contact_email: input.contact_email?.trim() || null,
            contact_phone: input.contact_phone?.trim() || null,
            payment_terms_days: paymentTerms,
            credit_status: input.credit_status || 'approved',
            notes: input.notes?.trim() || null,
          })
          .select()
          .single();

        if (error) {
          console.error('[BrokerService] Supabase createBroker error:', error);
          throw new Error(error.message || 'Failed to create broker in database.');
        }

        if (data) {
          const created = data as Broker;
          return {
            ...created,
            performance: this.calculatePerformance(orgId, created.id, created.payment_terms_days),
          };
        }
      } catch (err) {
        if (err instanceof Error && err.message.includes('Failed to create broker in database.')) {
          throw err;
        }
        console.warn('Supabase createBroker failed, saving locally:', err);
      }
    }

    const brokers = this.getRawBrokers(orgId);
    const now = new Date().toISOString();
    const newBroker: Broker & { status?: BrokerStatus } = {
      id: `broker-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      organization_id: orgId,
      company_name: input.company_name.trim(),
      mc_number: cleanMc,
      dot_number: cleanDot,
      contact_name: input.contact_name?.trim() || null,
      contact_email: input.contact_email?.trim() || null,
      contact_phone: input.contact_phone?.trim() || null,
      payment_terms_days: paymentTerms,
      credit_status: input.credit_status,
      notes: input.notes?.trim() || null,
      status: input.status || 'active',
      created_at: now,
      updated_at: now,
    };

    const updatedList = [newBroker, ...brokers];
    this.saveRawBrokers(orgId, updatedList);

    return {
      ...newBroker,
      performance: this.calculatePerformance(orgId, newBroker.id, newBroker.payment_terms_days),
    };
  }

  /**
   * Update existing broker
   */
  async updateBroker(orgId: string, brokerId: string, input: UpdateBrokerInput): Promise<BrokerWithPerformance> {
    if (isSupabaseConfigured && isUUID(orgId) && isUUID(brokerId)) {
      const { data, error } = await supabase
        .from('brokers')
        .update({
          ...(input.company_name !== undefined ? { company_name: input.company_name.trim() } : {}),
          ...(input.mc_number !== undefined ? { mc_number: input.mc_number ? cleanIdentifier(input.mc_number) || null : null } : {}),
          ...(input.dot_number !== undefined ? { dot_number: input.dot_number ? cleanIdentifier(input.dot_number) || null : null } : {}),
          ...(input.contact_name !== undefined ? { contact_name: input.contact_name?.trim() || null } : {}),
          ...(input.contact_email !== undefined ? { contact_email: input.contact_email?.trim() || null } : {}),
          ...(input.contact_phone !== undefined ? { contact_phone: input.contact_phone?.trim() || null } : {}),
          ...(input.payment_terms_days !== undefined
            ? { payment_terms_days: Math.max(0, Math.min(120, Math.round(Number(input.payment_terms_days) || 30))) }
            : {}),
          ...(input.credit_status !== undefined ? { credit_status: input.credit_status } : {}),
          ...(input.notes !== undefined ? { notes: input.notes?.trim() || null } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq('id', brokerId)
        .eq('organization_id', orgId)
        .select()
        .single();

      if (error) {
        if (error.code === 'PGRST303' || error.message?.includes('JWT expired')) {
          console.warn('[BrokerService] JWT expired during updateBroker, attempting session refresh and retry...');
          const { error: refreshErr } = await supabase.auth.refreshSession();
          if (!refreshErr) {
            const retryRes = await supabase
              .from('brokers')
              .update({
                ...(input.company_name !== undefined ? { company_name: input.company_name.trim() } : {}),
                ...(input.mc_number !== undefined ? { mc_number: input.mc_number ? cleanIdentifier(input.mc_number) || null : null } : {}),
                ...(input.dot_number !== undefined ? { dot_number: input.dot_number ? cleanIdentifier(input.dot_number) || null : null } : {}),
                ...(input.contact_name !== undefined ? { contact_name: input.contact_name?.trim() || null } : {}),
                ...(input.contact_email !== undefined ? { contact_email: input.contact_email?.trim() || null } : {}),
                ...(input.contact_phone !== undefined ? { contact_phone: input.contact_phone?.trim() || null } : {}),
                ...(input.payment_terms_days !== undefined
                  ? { payment_terms_days: Math.max(0, Math.min(120, Math.round(Number(input.payment_terms_days) || 30))) }
                  : {}),
                ...(input.credit_status !== undefined ? { credit_status: input.credit_status } : {}),
                ...(input.notes !== undefined ? { notes: input.notes?.trim() || null } : {}),
                updated_at: new Date().toISOString(),
              })
              .eq('id', brokerId)
              .eq('organization_id', orgId)
              .select()
              .single();

            if (!retryRes.error && retryRes.data) {
              const updated = retryRes.data as Broker;
              return {
                ...updated,
                performance: this.calculatePerformance(orgId, updated.id, updated.payment_terms_days),
              };
            }
          }
        }
        console.error('[BrokerService] Supabase updateBroker error:', error);
        throw new Error(
          error.code === 'PGRST303' || error.message?.includes('JWT expired')
            ? 'Your authentication session has expired. Please refresh the page to sign in again.'
            : (error.message || 'Failed to update broker in database.')
        );
      }

      if (data) {
        const updated = data as Broker;
        return {
          ...updated,
          performance: this.calculatePerformance(orgId, updated.id, updated.payment_terms_days),
        };
      }
      throw new Error('Broker not found or update failed.');
    }

    if (isSupabaseConfigured) {
      try {
        const { data, error } = await supabase
          .from('brokers')
          .update({
            ...(input.company_name !== undefined ? { company_name: input.company_name.trim() } : {}),
            ...(input.mc_number !== undefined ? { mc_number: input.mc_number ? cleanIdentifier(input.mc_number) || null : null } : {}),
            ...(input.dot_number !== undefined ? { dot_number: input.dot_number ? cleanIdentifier(input.dot_number) || null : null } : {}),
            ...(input.contact_name !== undefined ? { contact_name: input.contact_name?.trim() || null } : {}),
            ...(input.contact_email !== undefined ? { contact_email: input.contact_email?.trim() || null } : {}),
            ...(input.contact_phone !== undefined ? { contact_phone: input.contact_phone?.trim() || null } : {}),
            ...(input.payment_terms_days !== undefined
              ? { payment_terms_days: Math.max(0, Math.min(120, Math.round(Number(input.payment_terms_days) || 30))) }
              : {}),
            ...(input.credit_status !== undefined ? { credit_status: input.credit_status } : {}),
            ...(input.notes !== undefined ? { notes: input.notes?.trim() || null } : {}),
            updated_at: new Date().toISOString(),
          })
          .eq('id', brokerId)
          .eq('organization_id', orgId)
          .select()
          .single();

        if (error) {
          console.error('[BrokerService] Supabase updateBroker error:', error);
          throw new Error(error.message || 'Failed to update broker in database.');
        }

        if (!error && data) {
          const updated = data as Broker;
          return {
            ...updated,
            performance: this.calculatePerformance(orgId, updated.id, updated.payment_terms_days),
          };
        }
      } catch (err) {
        if (err instanceof Error && err.message.includes('Failed to update broker in database.')) {
          throw err;
        }
        console.warn('Supabase updateBroker failed, updating locally:', err);
      }
    }

    const brokers = this.getRawBrokers(orgId);
    const index = brokers.findIndex((b) => b.id === brokerId);
    if (index === -1) {
      throw new Error(`Broker with ID ${brokerId} not found in this organization.`);
    }

    const existing = brokers[index];
    const now = new Date().toISOString();

    const updatedBroker: Broker & { status?: BrokerStatus } = {
      ...existing,
      company_name: input.company_name !== undefined ? input.company_name.trim() : existing.company_name,
      mc_number: input.mc_number !== undefined ? (input.mc_number ? cleanIdentifier(input.mc_number) || null : null) : existing.mc_number,
      dot_number: input.dot_number !== undefined ? (input.dot_number ? cleanIdentifier(input.dot_number) || null : null) : existing.dot_number,
      contact_name: input.contact_name !== undefined ? (input.contact_name?.trim() || null) : existing.contact_name,
      contact_email: input.contact_email !== undefined ? (input.contact_email?.trim() || null) : existing.contact_email,
      contact_phone: input.contact_phone !== undefined ? (input.contact_phone?.trim() || null) : existing.contact_phone,
      payment_terms_days: input.payment_terms_days !== undefined
        ? Math.max(0, Math.min(120, Math.round(Number(input.payment_terms_days) || 30)))
        : existing.payment_terms_days,
      credit_status: input.credit_status !== undefined ? input.credit_status : existing.credit_status,
      notes: input.notes !== undefined ? (input.notes?.trim() || null) : existing.notes,
      status: input.status !== undefined ? input.status : (existing as { status?: BrokerStatus }).status,
      updated_at: now,
    };

    brokers[index] = updatedBroker;
    this.saveRawBrokers(orgId, brokers);

    return {
      ...updatedBroker,
      performance: this.calculatePerformance(orgId, updatedBroker.id, updatedBroker.payment_terms_days),
    };
  }

  /**
   * Toggle Active / Inactive Status
   */
  async toggleBrokerStatus(orgId: string, brokerId: string): Promise<BrokerWithPerformance> {
    if (isSupabaseConfigured && isUUID(orgId)) {
      throw new Error('Partnership status cannot be toggled because status is not a persistent column in the database schema.');
    }
    const broker = await this.getBroker(orgId, brokerId);
    if (!broker) {
      throw new Error(`Broker with ID ${brokerId} not found.`);
    }
    const currentStatus = (broker as BrokerWithPerformance).status || 'active';
    const newStatus: BrokerStatus = currentStatus === 'active' ? 'inactive' : 'active';
    return this.updateBroker(orgId, brokerId, { status: newStatus });
  }

  /**
   * Delete broker record (Owner Admin only)
   */
  async deleteBroker(orgId: string, brokerId: string): Promise<boolean> {
    if (isSupabaseConfigured && isUUID(orgId) && isUUID(brokerId)) {
      const { error } = await supabase
        .from('brokers')
        .delete()
        .eq('id', brokerId)
        .eq('organization_id', orgId);
      if (error) {
        console.error('[BrokerService] Supabase deleteBroker error:', error);
        throw new Error(error.message || 'Failed to delete broker from database.');
      }
      return true;
    }

    if (isSupabaseConfigured) {
      try {
        const { error } = await supabase
          .from('brokers')
          .delete()
          .eq('id', brokerId)
          .eq('organization_id', orgId);
        if (!error) {
          // Also cleanup local if present
          const brokers = this.getRawBrokers(orgId);
          const filtered = brokers.filter((b) => b.id !== brokerId);
          this.saveRawBrokers(orgId, filtered);
          return true;
        }
      } catch (err) {
        console.warn('Supabase deleteBroker failed, deleting locally:', err);
      }
    }

    const brokers = this.getRawBrokers(orgId);
    const filtered = brokers.filter((b) => b.id !== brokerId);
    this.saveRawBrokers(orgId, filtered);
    return true;
  }

  /**
   * Retrieve all loads linked to this broker for history view
   */
  async getBrokerLoads(orgId: string, brokerId: string): Promise<Load[]> {
    const loads = this.getRawLoads(orgId);
    return loads.filter((l) => l.broker_id === brokerId);
  }
}

export const brokerService = new BrokerService();
