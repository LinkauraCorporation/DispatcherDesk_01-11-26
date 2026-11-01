import { Truck, TruckStatus, EquipmentType, Client } from '../../types/domain.types.ts';
import { TruckWithClient } from './TruckDetailModal.tsx';
import { supabase, isSupabaseConfigured } from '../../lib/supabase.ts';
import { clientService } from '../clients/clientService.ts';

function isUUID(str?: string | null): boolean {
  if (!str) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

export const DEMO_ORGANIZATION_ID = 'demo-org-1';

// Storage keys
const TRUCKS_STORAGE_PREFIX = 'dispatchdesk_demo_trucks_';
const CLIENTS_STORAGE_PREFIX = 'dispatchdesk_demo_clients_';

export const SEED_TRUCKS: Omit<Truck, 'organization_id'>[] = [
  {
    id: 'demo-truck-101',
    client_id: 'demo-client-1',
    truck_number: '101',
    equipment_type: 'dry_van',
    vin: '1FT8W3BT3KEC44901',
    max_weight_lbs: 45000,
    current_location_city: 'Dallas',
    current_location_state: 'TX',
    status: 'active',
    notes: '53ft dry van with air-ride suspension and e-track',
    created_at: new Date(Date.now() - 28 * 86400000).toISOString(),
    updated_at: new Date(Date.now() - 2 * 86400000).toISOString(),
  },
  {
    id: 'demo-truck-102',
    client_id: 'demo-client-1',
    truck_number: '102',
    equipment_type: 'reefer',
    vin: '3AKJHHDR5LSE99102',
    max_weight_lbs: 44000,
    current_location_city: 'Memphis',
    current_location_state: 'TN',
    status: 'active',
    notes: 'Carrier Transicold unit, pre-cooled certified',
    created_at: new Date(Date.now() - 26 * 86400000).toISOString(),
    updated_at: new Date(Date.now() - 1 * 86400000).toISOString(),
  },
  {
    id: 'demo-truck-201',
    client_id: 'demo-client-2',
    truck_number: '201',
    equipment_type: 'flatbed',
    vin: '1M2K189C6NM022014',
    max_weight_lbs: 48000,
    current_location_city: 'Chicago',
    current_location_state: 'IL',
    status: 'active',
    notes: '48ft aluminum combo flatbed with tarps and straps',
    created_at: new Date(Date.now() - 24 * 86400000).toISOString(),
    updated_at: new Date(Date.now() - 4 * 86400000).toISOString(),
  },
  {
    id: 'demo-truck-301',
    client_id: 'demo-client-3',
    truck_number: '301',
    equipment_type: 'reefer',
    vin: '2C4RDGBG1KR183011',
    max_weight_lbs: 43500,
    current_location_city: 'Houston',
    current_location_state: 'TX',
    status: 'active',
    notes: 'Thermo King multi-temp refrigerated trailer',
    created_at: new Date(Date.now() - 18 * 86400000).toISOString(),
    updated_at: new Date(Date.now() - 2 * 86400000).toISOString(),
  },
  {
    id: 'demo-truck-302',
    client_id: 'demo-client-3',
    truck_number: '302',
    equipment_type: 'step_deck',
    vin: '1FD8W3HT4REC77302',
    max_weight_lbs: 46000,
    current_location_city: 'Phoenix',
    current_location_state: 'AZ',
    status: 'maintenance',
    notes: 'Scheduled brake drum replacement at Phoenix shop',
    created_at: new Date(Date.now() - 15 * 86400000).toISOString(),
    updated_at: new Date(Date.now() - 1 * 86400000).toISOString(),
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

export interface CreateTruckInput {
  client_id: string;
  truck_number: string;
  equipment_type: EquipmentType;
  vin?: string | null;
  max_weight_lbs?: number | null;
  current_location_city?: string | null;
  current_location_state?: string | null;
  status?: TruckStatus;
  notes?: string | null;
}

export interface UpdateTruckInput {
  client_id?: string;
  truck_number?: string;
  equipment_type?: EquipmentType;
  vin?: string | null;
  max_weight_lbs?: number | null;
  current_location_city?: string | null;
  current_location_state?: string | null;
  status?: TruckStatus;
  notes?: string | null;
}

export interface ITruckService {
  getTrucks(organizationId: string): Promise<TruckWithClient[]>;
  getTruckById(organizationId: string, id: string): Promise<TruckWithClient | null>;
  createTruck(organizationId: string, input: CreateTruckInput): Promise<Truck>;
  updateTruck(organizationId: string, id: string, input: UpdateTruckInput): Promise<Truck>;
  updateTruckStatus(organizationId: string, id: string, status: TruckStatus): Promise<Truck>;
  deleteTruck(organizationId: string, id: string): Promise<void>;
  getClients(organizationId: string): Promise<Client[]>;
}

class TruckService implements ITruckService {
  private inFlightGetTrucks = new Map<string, Promise<TruckWithClient[]>>();

  private ensureInitialized(organizationId: string): Truck[] {
    const key = `${TRUCKS_STORAGE_PREFIX}${organizationId}`;
    let trucks = loadFromStorage<Truck[]>(key, []);
    if (trucks.length === 0) {
      if (isUUID(organizationId) && organizationId !== DEMO_ORGANIZATION_ID) {
        return [];
      }
      trucks = SEED_TRUCKS.map((t) => ({
        ...t,
        organization_id: organizationId,
      }));
      saveToStorage(key, trucks);
    }
    return trucks;
  }

  async getClients(organizationId: string): Promise<Client[]> {
    return clientService.getClients(organizationId);
  }

  getTrucks(organizationId: string): Promise<TruckWithClient[]> {
    if (!organizationId) return Promise.resolve([]);

    const inFlight = this.inFlightGetTrucks.get(organizationId);
    if (inFlight) {
      return inFlight;
    }

    const request = (async () => {
      let rawTrucks: Truck[] = [];

      if (isSupabaseConfigured && isUUID(organizationId)) {
        if (organizationId !== DEMO_ORGANIZATION_ID) {
          try {
            let { data, error } = await supabase
              .from('trucks')
              .select('*')
              .eq('organization_id', organizationId)
              .order('created_at', { ascending: false });

            // If a transient network glitch or gateway error occurred, retry once before reporting failure
            if (error && (error.message?.includes('500') || error.message?.includes('<html') || error.message?.includes('Failed to fetch') || !(error as any).code)) {
              console.warn('[TruckService] Transient error on getTrucks, retrying in 300ms...');
              await new Promise((r) => setTimeout(r, 300));
              const retryRes = await supabase
                .from('trucks')
                .select('*')
                .eq('organization_id', organizationId)
                .order('created_at', { ascending: false });
              data = retryRes.data;
              error = retryRes.error;
            }

            if (error) {
              console.error('[TruckService] Supabase getTrucks error for real org:', error);
              rawTrucks = [];
            } else {
              rawTrucks = (data || []) as Truck[];
            }
          } catch (fetchErr) {
            console.error('[TruckService] Supabase getTrucks network error for real org:', fetchErr);
            rawTrucks = [];
          }
        } else {
          // Demo org flow
          try {
            const { data, error } = await supabase
              .from('trucks')
              .select('*')
              .eq('organization_id', organizationId)
              .order('created_at', { ascending: false });
            if (error) {
              console.warn('[TruckService] Supabase getTrucks error, using fallback:', error);
              rawTrucks = this.ensureInitialized(organizationId);
            } else {
              rawTrucks = (data || []) as Truck[];
              if (rawTrucks.length === 0) {
                rawTrucks = this.ensureInitialized(organizationId);
              }
            }
          } catch (fetchErr) {
            console.warn('[TruckService] Supabase getTrucks network error, using fallback:', fetchErr);
            rawTrucks = this.ensureInitialized(organizationId);
          }
        }
      } else if (isSupabaseConfigured) {
        try {
          const { data, error } = await supabase
            .from('trucks')
            .select('*')
            .eq('organization_id', organizationId)
            .order('created_at', { ascending: false });
          if (!error && data) {
            rawTrucks = data as Truck[];
          }
        } catch (err) {
          console.warn('Supabase getTrucks failed, falling back to local storage:', err);
        }
      }

      if (rawTrucks.length === 0 && (!isUUID(organizationId) || organizationId === DEMO_ORGANIZATION_ID)) {
        rawTrucks = this.ensureInitialized(organizationId);
      }

      const clients = await this.getClients(organizationId);
      const clientMap = new Map<string, Client>();
      clients.forEach((c) => clientMap.set(c.id, c));

      return rawTrucks.map((t) => {
        const matchingClient = t.client_id ? clientMap.get(t.client_id) : null;
        return {
          ...t,
          client: matchingClient
            ? {
                id: matchingClient.id,
                company_name: matchingClient.company_name,
                client_type: matchingClient.client_type,
                contact_name: matchingClient.contact_name,
                contact_phone: matchingClient.contact_phone,
                contact_email: matchingClient.contact_email,
              }
            : null,
        } as TruckWithClient;
      });
    })().finally(() => {
      this.inFlightGetTrucks.delete(organizationId);
    });

    this.inFlightGetTrucks.set(organizationId, request);
    return request;
  }

  async getTruckById(organizationId: string, id: string): Promise<TruckWithClient | null> {
    if (isSupabaseConfigured && isUUID(organizationId)) {
      if (organizationId !== DEMO_ORGANIZATION_ID) {
        if (!isUUID(id)) return null;
        const { data, error } = await supabase
          .from('trucks')
          .select('*')
          .eq('id', id)
          .eq('organization_id', organizationId)
          .maybeSingle();
        if (error) {
          console.error('[TruckService] Supabase getTruckById error:', error);
          throw new Error(error.message || 'Failed to fetch truck from database.');
        }
        if (!data) return null;
        const t = data as Truck;
        const clients = await this.getClients(organizationId);
        const matchingClient = t.client_id ? clients.find((c) => c.id === t.client_id) : null;
        return {
          ...t,
          client: matchingClient
            ? {
                id: matchingClient.id,
                company_name: matchingClient.company_name,
                client_type: matchingClient.client_type,
                contact_name: matchingClient.contact_name,
                contact_phone: matchingClient.contact_phone,
                contact_email: matchingClient.contact_email,
              }
            : null,
        } as TruckWithClient;
      }

      if (isUUID(id)) {
        const { data, error } = await supabase
          .from('trucks')
          .select('*')
          .eq('id', id)
          .eq('organization_id', organizationId)
          .maybeSingle();
        if (error) {
          console.error('[TruckService] Supabase getTruckById error:', error);
          throw new Error(error.message || 'Failed to fetch truck from database.');
        }
        if (!data) return null;
        const t = data as Truck;
        const clients = await this.getClients(organizationId);
        const matchingClient = t.client_id ? clients.find((c) => c.id === t.client_id) : null;
        return {
          ...t,
          client: matchingClient
            ? {
                id: matchingClient.id,
                company_name: matchingClient.company_name,
                client_type: matchingClient.client_type,
                contact_name: matchingClient.contact_name,
                contact_phone: matchingClient.contact_phone,
                contact_email: matchingClient.contact_email,
              }
            : null,
        } as TruckWithClient;
      }
    }

    if (isUUID(organizationId) && organizationId !== DEMO_ORGANIZATION_ID) {
      return null;
    }

    const trucks = await this.getTrucks(organizationId);
    return trucks.find((t) => t.id === id) || null;
  }

  async createTruck(organizationId: string, input: CreateTruckInput): Promise<Truck> {
    if (!input.truck_number?.trim()) {
      throw new Error('Truck number is required.');
    }
    if (!input.client_id) {
      throw new Error('Carrier client selection is required.');
    }

    if (isSupabaseConfigured && isUUID(organizationId)) {
      const { data, error } = await supabase
        .from('trucks')
        .insert({
          organization_id: organizationId,
          client_id: input.client_id,
          truck_number: input.truck_number.trim(),
          equipment_type: input.equipment_type || 'dry_van',
          vin: input.vin?.trim() || null,
          max_weight_lbs: input.max_weight_lbs ?? null,
          current_location_city: input.current_location_city?.trim() || null,
          current_location_state: input.current_location_state?.trim().toUpperCase() || null,
          status: input.status || 'active',
          notes: input.notes?.trim() || null,
        })
        .select()
        .single();
      if (error) {
        console.error('[TruckService] Supabase createTruck error:', error);
        throw new Error(error.message || 'Failed to create truck in database.');
      }
      if (data) return data as Truck;
      throw new Error('Unexpected empty response while creating truck.');
    }

    if (isSupabaseConfigured) {
      try {
        const { data, error } = await supabase
          .from('trucks')
          .insert({
            organization_id: organizationId,
            client_id: input.client_id,
            truck_number: input.truck_number.trim(),
            equipment_type: input.equipment_type || 'dry_van',
            vin: input.vin?.trim() || null,
            max_weight_lbs: input.max_weight_lbs ?? null,
            current_location_city: input.current_location_city?.trim() || null,
            current_location_state: input.current_location_state?.trim().toUpperCase() || null,
            status: input.status || 'active',
            notes: input.notes?.trim() || null,
          })
          .select()
          .single();
        if (!error && data) return data as Truck;
      } catch (err) {
        console.warn('Supabase createTruck failed, saving locally:', err);
      }
    }

    const trucks = this.ensureInitialized(organizationId);
    const newTruck: Truck = {
      id: `truck-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      organization_id: organizationId,
      client_id: input.client_id,
      truck_number: input.truck_number.trim(),
      equipment_type: input.equipment_type || 'dry_van',
      vin: input.vin?.trim() || null,
      max_weight_lbs: input.max_weight_lbs ?? null,
      current_location_city: input.current_location_city?.trim() || null,
      current_location_state: input.current_location_state?.trim().toUpperCase() || null,
      status: input.status || 'active',
      notes: input.notes?.trim() || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    trucks.unshift(newTruck);
    saveToStorage(`${TRUCKS_STORAGE_PREFIX}${organizationId}`, trucks);
    return newTruck;
  }

  async updateTruck(organizationId: string, id: string, input: UpdateTruckInput): Promise<Truck> {
    if (isSupabaseConfigured && isUUID(organizationId) && isUUID(id)) {
      const { data, error } = await supabase
        .from('trucks')
        .update({
          ...(input.client_id !== undefined ? { client_id: input.client_id } : {}),
          ...(input.truck_number !== undefined ? { truck_number: input.truck_number.trim() } : {}),
          ...(input.equipment_type !== undefined ? { equipment_type: input.equipment_type } : {}),
          ...(input.vin !== undefined ? { vin: input.vin?.trim() || null } : {}),
          ...(input.max_weight_lbs !== undefined ? { max_weight_lbs: input.max_weight_lbs } : {}),
          ...(input.current_location_city !== undefined ? { current_location_city: input.current_location_city?.trim() || null } : {}),
          ...(input.current_location_state !== undefined ? { current_location_state: input.current_location_state?.trim().toUpperCase() || null } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          ...(input.notes !== undefined ? { notes: input.notes?.trim() || null } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('organization_id', organizationId)
        .select()
        .single();
      if (error) {
        console.error('[TruckService] Supabase updateTruck error:', error);
        throw new Error(error.message || 'Failed to update truck in database.');
      }
      if (data) return data as Truck;
      throw new Error('Truck not found or update failed.');
    }

    if (isSupabaseConfigured) {
      try {
        const { data, error } = await supabase
          .from('trucks')
          .update({
            ...(input.client_id !== undefined ? { client_id: input.client_id } : {}),
            ...(input.truck_number !== undefined ? { truck_number: input.truck_number.trim() } : {}),
            ...(input.equipment_type !== undefined ? { equipment_type: input.equipment_type } : {}),
            ...(input.vin !== undefined ? { vin: input.vin?.trim() || null } : {}),
            ...(input.max_weight_lbs !== undefined ? { max_weight_lbs: input.max_weight_lbs } : {}),
            ...(input.current_location_city !== undefined ? { current_location_city: input.current_location_city?.trim() || null } : {}),
            ...(input.current_location_state !== undefined ? { current_location_state: input.current_location_state?.trim().toUpperCase() || null } : {}),
            ...(input.status !== undefined ? { status: input.status } : {}),
            ...(input.notes !== undefined ? { notes: input.notes?.trim() || null } : {}),
            updated_at: new Date().toISOString(),
          })
          .eq('id', id)
          .eq('organization_id', organizationId)
          .select()
          .single();
        if (!error && data) return data as Truck;
      } catch (err) {
        console.warn('Supabase updateTruck failed, saving locally:', err);
      }
    }

    const trucks = this.ensureInitialized(organizationId);
    const index = trucks.findIndex((t) => t.id === id);
    if (index === -1) {
      throw new Error(`Truck with ID "${id}" was not found.`);
    }

    const current = trucks[index];
    const updated: Truck = {
      ...current,
      ...(input.client_id !== undefined ? { client_id: input.client_id } : {}),
      ...(input.truck_number !== undefined ? { truck_number: input.truck_number.trim() } : {}),
      ...(input.equipment_type !== undefined ? { equipment_type: input.equipment_type } : {}),
      ...(input.vin !== undefined ? { vin: input.vin?.trim() || null } : {}),
      ...(input.max_weight_lbs !== undefined ? { max_weight_lbs: input.max_weight_lbs } : {}),
      ...(input.current_location_city !== undefined ? { current_location_city: input.current_location_city?.trim() || null } : {}),
      ...(input.current_location_state !== undefined ? { current_location_state: input.current_location_state?.trim().toUpperCase() || null } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.notes !== undefined ? { notes: input.notes?.trim() || null } : {}),
      updated_at: new Date().toISOString(),
    };

    trucks[index] = updated;
    saveToStorage(`${TRUCKS_STORAGE_PREFIX}${organizationId}`, trucks);
    return updated;
  }

  async updateTruckStatus(organizationId: string, id: string, status: TruckStatus): Promise<Truck> {
    return this.updateTruck(organizationId, id, { status });
  }

  async deleteTruck(organizationId: string, id: string): Promise<void> {
    if (isSupabaseConfigured && isUUID(organizationId) && isUUID(id)) {
      const { error } = await supabase
        .from('trucks')
        .delete()
        .eq('id', id)
        .eq('organization_id', organizationId);
      if (error) {
        console.error('[TruckService] Supabase deleteTruck error:', error);
        throw new Error(error.message || 'Failed to delete truck from database.');
      }
      return;
    }

    if (isSupabaseConfigured) {
      try {
        const { error } = await supabase
          .from('trucks')
          .delete()
          .eq('id', id)
          .eq('organization_id', organizationId);
        if (!error) return;
      } catch (err) {
        console.warn('Supabase deleteTruck failed, deleting locally:', err);
      }
    }

    const trucks = this.ensureInitialized(organizationId);
    const filtered = trucks.filter((t) => t.id !== id);
    if (filtered.length === trucks.length) {
      throw new Error(`Truck with ID "${id}" was not found.`);
    }
    saveToStorage(`${TRUCKS_STORAGE_PREFIX}${organizationId}`, filtered);
  }
}

export const truckService: ITruckService = new TruckService();
