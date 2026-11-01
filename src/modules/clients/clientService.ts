import { Client, ClientType } from '../../types/domain.types.ts';
import { supabase, isSupabaseConfigured } from '../../lib/supabase.ts';

function isUUID(str?: string | null): boolean {
  if (!str) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

export const DEMO_ORGANIZATION_ID = 'demo-org-1';

// Storage keys
const CLIENTS_STORAGE_PREFIX = 'dispatchdesk_demo_clients_';

// Initial seed data for demo organizations
export const SEED_CLIENTS: Omit<Client, 'organization_id'>[] = [
  {
    id: 'demo-client-1',
    company_name: 'Apex Logistics Fleet LLC',
    client_type: 'fleet',
    contact_name: 'Robert Sterling',
    contact_phone: '(214) 555-0182',
    contact_email: 'robert@apexlogistics.com',
    billing_email: 'billing@apexlogistics.com',
    preferred_equipment: 'Dry Van, Reefer',
    preferred_lanes: 'Dallas, TX -> Atlanta, GA',
    minimum_rate_per_mile: 2.20,
    status: 'active',
    notes: 'Primary dry van and reefer regional fleet partner',
    created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
    updated_at: new Date(Date.now() - 5 * 86400000).toISOString(),
  },
  {
    id: 'demo-client-2',
    company_name: 'IronClad Transport LLC',
    client_type: 'owner_operator',
    contact_name: 'Marcus Vance',
    contact_phone: '(312) 555-0144',
    contact_email: 'marcus@ironcladtrans.com',
    billing_email: 'marcus@ironcladtrans.com',
    preferred_equipment: 'Flatbed',
    preferred_lanes: 'Chicago, IL -> Dallas, TX',
    minimum_rate_per_mile: 2.50,
    status: 'active',
    notes: 'Single-unit owner operator running Midwest to Texas',
    created_at: new Date(Date.now() - 25 * 86400000).toISOString(),
    updated_at: new Date(Date.now() - 3 * 86400000).toISOString(),
  },
  {
    id: 'demo-client-3',
    company_name: 'LoneStar Express LLC',
    client_type: 'fleet',
    contact_name: 'Carmen Delgado',
    contact_phone: '(713) 555-0199',
    contact_email: 'carmen@lonestarexpress.com',
    billing_email: 'ap@lonestarexpress.com',
    preferred_equipment: 'Reefer, Step Deck',
    preferred_lanes: 'Houston, TX -> Phoenix, AZ',
    minimum_rate_per_mile: 2.40,
    status: 'active',
    notes: 'Reefer and flatbed fleet specializing in Southern corridors',
    created_at: new Date(Date.now() - 20 * 86400000).toISOString(),
    updated_at: new Date(Date.now() - 2 * 86400000).toISOString(),
  },
];

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch (err) {
    console.error(`Error loading storage for key ${key}:`, err);
    return fallback;
  }
}

function saveToStorage<T>(key: string, data: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (err) {
    console.error(`Error saving storage for key ${key}:`, err);
  }
}

export interface CreateClientInput {
  company_name: string;
  client_type: ClientType;
  contact_name?: string | null;
  contact_phone?: string | null;
  contact_email?: string | null;
  billing_email?: string | null;
  preferred_equipment?: string | null;
  preferred_lanes?: string | null;
  minimum_rate_per_mile?: number | null;
  status?: 'active' | 'inactive';
  notes?: string | null;
}

export interface UpdateClientInput {
  company_name?: string;
  client_type?: ClientType;
  contact_name?: string | null;
  contact_phone?: string | null;
  contact_email?: string | null;
  billing_email?: string | null;
  preferred_equipment?: string | null;
  preferred_lanes?: string | null;
  minimum_rate_per_mile?: number | null;
  status?: 'active' | 'inactive';
  notes?: string | null;
}

export interface IClientService {
  getClients(organizationId: string): Promise<Client[]>;
  getClientById(organizationId: string, id: string): Promise<Client | null>;
  createClient(organizationId: string, input: CreateClientInput): Promise<Client>;
  updateClient(organizationId: string, id: string, input: UpdateClientInput): Promise<Client>;
  updateClientStatus(organizationId: string, id: string, status: 'active' | 'inactive'): Promise<Client>;
  deleteClient(organizationId: string, id: string): Promise<void>;
}

class ClientService implements IClientService {
  private inFlightGetClients = new Map<string, Promise<Client[]>>();

  private ensureInitialized(organizationId: string): Client[] {
    const key = `${CLIENTS_STORAGE_PREFIX}${organizationId}`;
    let clients = loadFromStorage<Client[]>(key, []);
    if (clients.length === 0) {
      if (isUUID(organizationId) && organizationId !== DEMO_ORGANIZATION_ID) {
        return [];
      }
      clients = SEED_CLIENTS.map((c) => ({
        ...c,
        organization_id: organizationId,
      }));
      saveToStorage(key, clients);
    }
    return clients;
  }

  getClients(organizationId: string): Promise<Client[]> {
    if (!organizationId) return Promise.resolve([]);

    const inFlight = this.inFlightGetClients.get(organizationId);
    if (inFlight) {
      return inFlight;
    }

    const request = (async () => {
      if (isSupabaseConfigured && isUUID(organizationId)) {
        if (organizationId !== DEMO_ORGANIZATION_ID) {
          try {
            let { data, error } = await supabase
              .from('clients')
              .select('*')
              .eq('organization_id', organizationId)
              .order('company_name', { ascending: true });

            // If a transient network glitch or gateway error occurred, retry once before reporting failure
            if (error && (error.message?.includes('500') || error.message?.includes('<html') || error.message?.includes('Failed to fetch') || !(error as any).code)) {
              console.warn('[ClientService] Transient error on getClients, retrying in 300ms...');
              await new Promise((r) => setTimeout(r, 300));
              const retryRes = await supabase
                .from('clients')
                .select('*')
                .eq('organization_id', organizationId)
                .order('company_name', { ascending: true });
              data = retryRes.data;
              error = retryRes.error;
            }

            if (error) {
              console.error('[ClientService] Supabase getClients error for real org:', error);
              return [];
            }
            return (data || []) as Client[];
          } catch (fetchErr) {
            console.error('[ClientService] Supabase getClients network error for real org:', fetchErr);
            return [];
          }
        }

        // Demo org flow
        try {
          const { data, error } = await supabase
            .from('clients')
            .select('*')
            .eq('organization_id', organizationId)
            .order('company_name', { ascending: true });
          if (error) {
            console.warn('[ClientService] Supabase getClients error, using fallback:', error);
            const clients = this.ensureInitialized(organizationId);
            return [...clients].sort((a, b) => a.company_name.localeCompare(b.company_name));
          }
          const result = (data || []) as Client[];
          if (result.length === 0) {
            const clients = this.ensureInitialized(organizationId);
            return [...clients].sort((a, b) => a.company_name.localeCompare(b.company_name));
          }
          return result;
        } catch (fetchErr) {
          console.warn('[ClientService] Supabase getClients network error, using fallback:', fetchErr);
          const clients = this.ensureInitialized(organizationId);
          return [...clients].sort((a, b) => a.company_name.localeCompare(b.company_name));
        }
      }

      if (isSupabaseConfigured) {
        try {
          const { data, error } = await supabase
            .from('clients')
            .select('*')
            .eq('organization_id', organizationId)
            .order('company_name', { ascending: true });
          if (!error && data) return data as Client[];
        } catch (err) {
          console.warn('Supabase getClients failed, falling back to local storage:', err);
        }
      }

      const clients = this.ensureInitialized(organizationId);
      return [...clients].sort((a, b) => a.company_name.localeCompare(b.company_name));
    })().finally(() => {
      this.inFlightGetClients.delete(organizationId);
    });

    this.inFlightGetClients.set(organizationId, request);
    return request;
  }

  async getClientById(organizationId: string, id: string): Promise<Client | null> {
    if (isSupabaseConfigured && isUUID(organizationId)) {
      if (organizationId !== DEMO_ORGANIZATION_ID) {
        if (!isUUID(id)) return null;
        const { data, error } = await supabase
          .from('clients')
          .select('*')
          .eq('id', id)
          .eq('organization_id', organizationId)
          .maybeSingle();
        if (error) {
          console.error('[ClientService] Supabase getClientById error:', error);
          throw new Error(error.message || 'Failed to fetch client from database.');
        }
        return (data as Client) || null;
      }

      if (isUUID(id)) {
        const { data, error } = await supabase
          .from('clients')
          .select('*')
          .eq('id', id)
          .eq('organization_id', organizationId)
          .maybeSingle();
        if (error) {
          console.error('[ClientService] Supabase getClientById error:', error);
          throw new Error(error.message || 'Failed to fetch client from database.');
        }
        return (data as Client) || null;
      }
    }

    if (isSupabaseConfigured) {
      try {
        const { data, error } = await supabase
          .from('clients')
          .select('*')
          .eq('id', id)
          .eq('organization_id', organizationId)
          .maybeSingle();
        if (!error && data) return data as Client;
      } catch (err) {
        console.warn('Supabase getClientById failed, falling back to local storage:', err);
      }
    }

    if (isUUID(organizationId) && organizationId !== DEMO_ORGANIZATION_ID) {
      return null;
    }

    const clients = this.ensureInitialized(organizationId);
    return clients.find((c) => c.id === id) || null;
  }

  async createClient(organizationId: string, input: CreateClientInput): Promise<Client> {
    if (!input.company_name?.trim()) {
      throw new Error('Company name is required.');
    }

    if (isSupabaseConfigured && isUUID(organizationId)) {
      const { data, error } = await supabase
        .from('clients')
        .insert({
          organization_id: organizationId,
          company_name: input.company_name.trim(),
          client_type: input.client_type || 'owner_operator',
          contact_name: input.contact_name?.trim() || null,
          contact_phone: input.contact_phone?.trim() || null,
          contact_email: input.contact_email?.trim() || null,
          billing_email: input.billing_email?.trim() || null,
          preferred_equipment: input.preferred_equipment?.trim() || null,
          preferred_lanes: input.preferred_lanes?.trim() || null,
          minimum_rate_per_mile: input.minimum_rate_per_mile ?? null,
          status: input.status || 'active',
          notes: input.notes?.trim() || null,
        })
        .select()
        .single();
      if (error) {
        console.error('[ClientService] Supabase createClient error:', error);
        throw new Error(error.message || 'Failed to create client in database.');
      }
      if (data) return data as Client;
      throw new Error('Unexpected empty response while creating client.');
    }

    if (isSupabaseConfigured) {
      try {
        const { data, error } = await supabase
          .from('clients')
          .insert({
            organization_id: organizationId,
            company_name: input.company_name.trim(),
            client_type: input.client_type || 'owner_operator',
            contact_name: input.contact_name?.trim() || null,
            contact_phone: input.contact_phone?.trim() || null,
            contact_email: input.contact_email?.trim() || null,
            billing_email: input.billing_email?.trim() || null,
            preferred_equipment: input.preferred_equipment?.trim() || null,
            preferred_lanes: input.preferred_lanes?.trim() || null,
            minimum_rate_per_mile: input.minimum_rate_per_mile ?? null,
            status: input.status || 'active',
            notes: input.notes?.trim() || null,
          })
          .select()
          .single();
        if (!error && data) return data as Client;
      } catch (err) {
        console.warn('Supabase createClient failed, saving locally:', err);
      }
    }

    const clients = this.ensureInitialized(organizationId);
    const newClient: Client = {
      id: `client-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      organization_id: organizationId,
      company_name: input.company_name.trim(),
      client_type: input.client_type || 'owner_operator',
      contact_name: input.contact_name?.trim() || null,
      contact_phone: input.contact_phone?.trim() || null,
      contact_email: input.contact_email?.trim() || null,
      billing_email: input.billing_email?.trim() || null,
      preferred_equipment: input.preferred_equipment?.trim() || null,
      preferred_lanes: input.preferred_lanes?.trim() || null,
      minimum_rate_per_mile: input.minimum_rate_per_mile ?? null,
      status: input.status || 'active',
      notes: input.notes?.trim() || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    clients.push(newClient);
    saveToStorage(`${CLIENTS_STORAGE_PREFIX}${organizationId}`, clients);
    return newClient;
  }

  async updateClient(organizationId: string, id: string, input: UpdateClientInput): Promise<Client> {
    if (isSupabaseConfigured && isUUID(organizationId) && isUUID(id)) {
      const { data, error } = await supabase
        .from('clients')
        .update({
          ...(input.company_name !== undefined ? { company_name: input.company_name.trim() } : {}),
          ...(input.client_type !== undefined ? { client_type: input.client_type } : {}),
          ...(input.contact_name !== undefined ? { contact_name: input.contact_name?.trim() || null } : {}),
          ...(input.contact_phone !== undefined ? { contact_phone: input.contact_phone?.trim() || null } : {}),
          ...(input.contact_email !== undefined ? { contact_email: input.contact_email?.trim() || null } : {}),
          ...(input.billing_email !== undefined ? { billing_email: input.billing_email?.trim() || null } : {}),
          ...(input.preferred_equipment !== undefined ? { preferred_equipment: input.preferred_equipment?.trim() || null } : {}),
          ...(input.preferred_lanes !== undefined ? { preferred_lanes: input.preferred_lanes?.trim() || null } : {}),
          ...(input.minimum_rate_per_mile !== undefined ? { minimum_rate_per_mile: input.minimum_rate_per_mile } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          ...(input.notes !== undefined ? { notes: input.notes?.trim() || null } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('organization_id', organizationId)
        .select()
        .single();
      if (error) {
        console.error('[ClientService] Supabase updateClient error:', error);
        throw new Error(error.message || 'Failed to update client in database.');
      }
      if (data) return data as Client;
      throw new Error('Client not found or update failed.');
    }

    if (isSupabaseConfigured) {
      try {
        const { data, error } = await supabase
          .from('clients')
          .update({
            ...(input.company_name !== undefined ? { company_name: input.company_name.trim() } : {}),
            ...(input.client_type !== undefined ? { client_type: input.client_type } : {}),
            ...(input.contact_name !== undefined ? { contact_name: input.contact_name?.trim() || null } : {}),
            ...(input.contact_phone !== undefined ? { contact_phone: input.contact_phone?.trim() || null } : {}),
            ...(input.contact_email !== undefined ? { contact_email: input.contact_email?.trim() || null } : {}),
            ...(input.billing_email !== undefined ? { billing_email: input.billing_email?.trim() || null } : {}),
            ...(input.preferred_equipment !== undefined ? { preferred_equipment: input.preferred_equipment?.trim() || null } : {}),
            ...(input.preferred_lanes !== undefined ? { preferred_lanes: input.preferred_lanes?.trim() || null } : {}),
            ...(input.minimum_rate_per_mile !== undefined ? { minimum_rate_per_mile: input.minimum_rate_per_mile } : {}),
            ...(input.status !== undefined ? { status: input.status } : {}),
            ...(input.notes !== undefined ? { notes: input.notes?.trim() || null } : {}),
            updated_at: new Date().toISOString(),
          })
          .eq('id', id)
          .eq('organization_id', organizationId)
          .select()
          .single();
        if (!error && data) return data as Client;
      } catch (err) {
        console.warn('Supabase updateClient failed, saving locally:', err);
      }
    }

    const clients = this.ensureInitialized(organizationId);
    const index = clients.findIndex((c) => c.id === id);
    if (index === -1) {
      throw new Error(`Client with ID "${id}" was not found.`);
    }

    const current = clients[index];
    const updated: Client = {
      ...current,
      ...(input.company_name !== undefined ? { company_name: input.company_name.trim() } : {}),
      ...(input.client_type !== undefined ? { client_type: input.client_type } : {}),
      ...(input.contact_name !== undefined ? { contact_name: input.contact_name?.trim() || null } : {}),
      ...(input.contact_phone !== undefined ? { contact_phone: input.contact_phone?.trim() || null } : {}),
      ...(input.contact_email !== undefined ? { contact_email: input.contact_email?.trim() || null } : {}),
      ...(input.billing_email !== undefined ? { billing_email: input.billing_email?.trim() || null } : {}),
      ...(input.preferred_equipment !== undefined ? { preferred_equipment: input.preferred_equipment?.trim() || null } : {}),
      ...(input.preferred_lanes !== undefined ? { preferred_lanes: input.preferred_lanes?.trim() || null } : {}),
      ...(input.minimum_rate_per_mile !== undefined ? { minimum_rate_per_mile: input.minimum_rate_per_mile } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.notes !== undefined ? { notes: input.notes?.trim() || null } : {}),
      updated_at: new Date().toISOString(),
    };

    clients[index] = updated;
    saveToStorage(`${CLIENTS_STORAGE_PREFIX}${organizationId}`, clients);
    return updated;
  }

  async updateClientStatus(organizationId: string, id: string, status: 'active' | 'inactive'): Promise<Client> {
    return this.updateClient(organizationId, id, { status });
  }

  async deleteClient(organizationId: string, id: string): Promise<void> {
    if (isSupabaseConfigured && isUUID(organizationId) && isUUID(id)) {
      // Preflight check: Prevent client deletion if drivers are still associated with it
      const { count: driverCount, error: countErr } = await supabase
        .from('drivers')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .eq('client_id', id);

      if (!countErr && typeof driverCount === 'number' && driverCount > 0) {
        throw new Error(
          'This client cannot be deleted because one or more drivers are still assigned to it. Reassign or remove the drivers first.'
        );
      }

      const { error } = await supabase
        .from('clients')
        .delete()
        .eq('id', id)
        .eq('organization_id', organizationId);
      if (error) {
        console.error('[ClientService] Supabase deleteClient error:', error);
        // Map database FK RESTRICT violation or integrity errors to actionable message
        if (
          error.code === '23503' ||
          error.message?.includes('fk_drivers_client') ||
          error.message?.includes('violates foreign key constraint') ||
          error.message?.includes('is still referenced from table "drivers"') ||
          error.message?.includes('organization_id is immutable')
        ) {
          throw new Error(
            'This client cannot be deleted because one or more drivers are still assigned to it. Reassign or remove the drivers first.'
          );
        }
        throw new Error(error.message || 'Failed to delete client from database.');
      }
      return;
    }

    if (isSupabaseConfigured) {
      try {
        const { error } = await supabase
          .from('clients')
          .delete()
          .eq('id', id)
          .eq('organization_id', organizationId);
        if (!error) return;
      } catch (err) {
        console.warn('Supabase deleteClient failed, deleting locally:', err);
      }
    }

    // Local / demo storage preflight: check associated drivers in demo storage
    const demoDriversKey = `dispatchdesk_demo_drivers_${organizationId}`;
    const localDrivers = loadFromStorage<Array<{ client_id?: string | null }>>(demoDriversKey, []);
    if (localDrivers.some((d) => d.client_id === id)) {
      throw new Error(
        'This client cannot be deleted because one or more drivers are still assigned to it. Reassign or remove the drivers first.'
      );
    }

    const clients = this.ensureInitialized(organizationId);
    const filtered = clients.filter((c) => c.id !== id);
    if (filtered.length === clients.length) {
      throw new Error(`Client with ID "${id}" was not found.`);
    }
    saveToStorage(`${CLIENTS_STORAGE_PREFIX}${organizationId}`, filtered);
  }
}

export const clientService: IClientService = new ClientService();
