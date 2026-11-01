import { Driver, Client, Truck, DriverStatus, DriverPayType } from '../../types/domain.types.ts';
import { supabase, isSupabaseConfigured } from '../../lib/supabase.ts';
import { clientService } from '../clients/clientService.ts';
import { truckService } from '../trucks/truckService.ts';
import { DriverWithRelations, CreateDriverInput, UpdateDriverInput } from './driverTypes.ts';

function isUUID(str?: string | null): boolean {
  if (!str) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

export const DEMO_ORGANIZATION_ID = 'demo-org-1';

// Storage keys
const DRIVERS_STORAGE_PREFIX = 'dispatchdesk_demo_drivers_';
const CLIENTS_STORAGE_PREFIX = 'dispatchdesk_demo_clients_';
const TRUCKS_STORAGE_PREFIX = 'dispatchdesk_demo_trucks_';

// Initial seed data for demo organizations
const SEED_CLIENTS: Omit<Client, 'organization_id'>[] = [
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

const SEED_TRUCKS: Omit<Truck, 'organization_id'>[] = [
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

const SEED_DRIVERS: Omit<Driver, 'organization_id'>[] = [
  {
    id: 'demo-driver-1',
    client_id: 'demo-client-1',
    assigned_truck_id: 'demo-truck-101',
    full_name: 'Marcus Sterling-Vance',
    phone: '(214) 555-8910',
    email: 'marcus.sterling@apexlogistics.com',
    pay_type: 'percentage_gross',
    pay_rate: 27,
    status: 'available',
    notes: 'CDL-A 8 yrs experience, HazMat & Tanker endorsements. Preferred lane: I-35 / I-20 corridor.',
    created_at: new Date(Date.now() - 25 * 86400000).toISOString(),
    updated_at: new Date(Date.now() - 1 * 86400000).toISOString(),
  },
  {
    id: 'demo-driver-2',
    client_id: 'demo-client-1',
    assigned_truck_id: 'demo-truck-102',
    full_name: 'Elena Rodriguez',
    phone: '(901) 555-3211',
    email: 'elena.r@apexlogistics.com',
    pay_type: 'per_mile',
    pay_rate: 0.68,
    status: 'on_load',
    notes: 'Reefer specialist with spotless safety record. High priority for refrigerated produce loads.',
    created_at: new Date(Date.now() - 22 * 86400000).toISOString(),
    updated_at: new Date(Date.now() - 2 * 86400000).toISOString(),
  },
  {
    id: 'demo-driver-3',
    client_id: 'demo-client-2',
    assigned_truck_id: 'demo-truck-201',
    full_name: 'Darius Thorne',
    phone: '(312) 555-7764',
    email: 'darius@ironcladtrans.com',
    pay_type: 'percentage_gross',
    pay_rate: 30,
    status: 'available',
    notes: 'Heavy haul and steel coil certified flatbed operator.',
    created_at: new Date(Date.now() - 20 * 86400000).toISOString(),
    updated_at: new Date(Date.now() - 3 * 86400000).toISOString(),
  },
  {
    id: 'demo-driver-4',
    client_id: 'demo-client-3',
    assigned_truck_id: 'demo-truck-301',
    full_name: 'Jackson Miller',
    phone: '(713) 555-4498',
    email: 'jackson.m@lonestarexpress.com',
    pay_type: 'flat_rate',
    pay_rate: 1450,
    status: 'off_duty',
    notes: '34-hour restart reset in Houston staging yard. Ready for dispatch tomorrow 06:00 CST.',
    created_at: new Date(Date.now() - 14 * 86400000).toISOString(),
    updated_at: new Date(Date.now() - 1 * 86400000).toISOString(),
  },
  {
    id: 'demo-driver-5',
    client_id: 'demo-client-3',
    assigned_truck_id: null,
    full_name: 'Sarah Chen-Jenkins',
    phone: '(602) 555-9012',
    email: 'sarah.chen@lonestarexpress.com',
    pay_type: 'per_mile',
    pay_rate: 0.65,
    status: 'available',
    notes: 'Relief driver on standby; truck #302 is in scheduled shop maintenance.',
    created_at: new Date(Date.now() - 10 * 86400000).toISOString(),
    updated_at: new Date(Date.now() - 1 * 86400000).toISOString(),
  },
];

// Helper functions for local storage
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

/**
 * Driver Service Interface
 * Defines the clean repository contracts for Driver Management.
 * Future Supabase implementation will implement this same interface.
 */
export interface IDriverService {
  getDrivers(organizationId: string): Promise<DriverWithRelations[]>;
  getDriverById(organizationId: string, id: string): Promise<DriverWithRelations | null>;
  createDriver(organizationId: string, input: CreateDriverInput): Promise<DriverWithRelations>;
  updateDriver(organizationId: string, id: string, input: UpdateDriverInput): Promise<DriverWithRelations>;
  deleteDriver(organizationId: string, id: string): Promise<void>;
  updateDriverStatus(organizationId: string, id: string, status: DriverStatus): Promise<DriverWithRelations>;
  getClients(organizationId: string): Promise<Client[]>;
  getTrucks(organizationId: string): Promise<Truck[]>;
  getAssignedDriverForTruck(organizationId: string, truckId: string, excludeDriverId?: string): Promise<Driver | null>;
}

/**
 * Local / Demo Implementation of IDriverService
 * Operates in-memory and persists per-organization in localStorage.
 * Guarantees relationship integrity:
 * (Driver Client -> Assigned Truck -> Truck belongs to same Client).
 */
class LocalDriverService implements IDriverService {
  private inFlightGetDrivers = new Map<string, Promise<DriverWithRelations[]>>();

  private ensureInitialized(organizationId: string): {
    drivers: Driver[];
    clients: Client[];
    trucks: Truck[];
  } {
    const clientsKey = `${CLIENTS_STORAGE_PREFIX}${organizationId}`;
    const trucksKey = `${TRUCKS_STORAGE_PREFIX}${organizationId}`;
    const driversKey = `${DRIVERS_STORAGE_PREFIX}${organizationId}`;

    let clients = loadFromStorage<Client[]>(clientsKey, []);
    let trucks = loadFromStorage<Truck[]>(trucksKey, []);
    let drivers = loadFromStorage<Driver[]>(driversKey, []);

    if (isUUID(organizationId) && organizationId !== DEMO_ORGANIZATION_ID) {
      return { drivers, clients, trucks };
    }

    if (clients.length === 0) {
      clients = SEED_CLIENTS.map((c) => ({
        ...c,
        organization_id: organizationId,
      }));
      saveToStorage(clientsKey, clients);
    }

    if (trucks.length === 0) {
      trucks = SEED_TRUCKS.map((t) => ({
        ...t,
        organization_id: organizationId,
      }));
      saveToStorage(trucksKey, trucks);
    }

    if (drivers.length === 0) {
      drivers = SEED_DRIVERS.map((d) => ({
        ...d,
        organization_id: organizationId,
      }));
      saveToStorage(driversKey, drivers);
    }

    return { drivers, clients, trucks };
  }

  private joinRelations(
    driver: Driver,
    clients: Client[],
    trucks: Truck[]
  ): DriverWithRelations {
    const client = driver.client_id
      ? clients.find((c) => c.id === driver.client_id) || null
      : null;

    const assigned_truck = driver.assigned_truck_id
      ? trucks.find((t) => t.id === driver.assigned_truck_id) || null
      : null;

    return {
      ...driver,
      client: client
        ? {
            id: client.id,
            company_name: client.company_name,
            client_type: client.client_type,
            contact_name: client.contact_name,
            contact_phone: client.contact_phone,
            contact_email: client.contact_email,
          }
        : null,
      assigned_truck: assigned_truck
        ? {
            id: assigned_truck.id,
            truck_number: assigned_truck.truck_number,
            equipment_type: assigned_truck.equipment_type,
            current_location_city: assigned_truck.current_location_city,
            current_location_state: assigned_truck.current_location_state,
            status: assigned_truck.status,
            vin: assigned_truck.vin,
          }
        : null,
    };
  }

  async getClients(organizationId: string): Promise<Client[]> {
    return clientService.getClients(organizationId);
  }

  async getTrucks(organizationId: string): Promise<Truck[]> {
    const trucks = await truckService.getTrucks(organizationId);
    return trucks.map((t) => ({
      id: t.id,
      organization_id: t.organization_id,
      client_id: t.client_id,
      truck_number: t.truck_number,
      vin: t.vin,
      equipment_type: t.equipment_type,
      max_weight_lbs: t.max_weight_lbs,
      status: t.status,
      current_location_city: t.current_location_city,
      current_location_state: t.current_location_state,
      notes: t.notes,
      created_at: t.created_at,
      updated_at: t.updated_at,
    }));
  }

  async getAssignedDriverForTruck(
    organizationId: string,
    truckId: string,
    excludeDriverId?: string
  ): Promise<Driver | null> {
    if (isSupabaseConfigured && isUUID(organizationId)) {
      if (organizationId !== DEMO_ORGANIZATION_ID) {
        if (!isUUID(truckId)) return null;
        let query = supabase
          .from('drivers')
          .select('*')
          .eq('organization_id', organizationId)
          .eq('assigned_truck_id', truckId);

        if (excludeDriverId && isUUID(excludeDriverId)) {
          query = query.neq('id', excludeDriverId);
        }

        const { data, error } = await query.maybeSingle();
        if (error) {
          console.error('[DriverService] Supabase getAssignedDriverForTruck error:', error);
          throw new Error(error.message || 'Failed to fetch assigned driver for truck.');
        }
        return (data as Driver) || null;
      }

      if (isUUID(truckId)) {
        let query = supabase
          .from('drivers')
          .select('*')
          .eq('organization_id', organizationId)
          .eq('assigned_truck_id', truckId);

        if (excludeDriverId && isUUID(excludeDriverId)) {
          query = query.neq('id', excludeDriverId);
        }

        const { data, error } = await query.maybeSingle();
        if (error) {
          console.error('[DriverService] Supabase getAssignedDriverForTruck error:', error);
          throw new Error(error.message || 'Failed to fetch assigned driver for truck.');
        }
        return (data as Driver) || null;
      }
    }

    if (isSupabaseConfigured) {
      try {
        let query = supabase
          .from('drivers')
          .select('*')
          .eq('organization_id', organizationId)
          .eq('assigned_truck_id', truckId);

        if (excludeDriverId) {
          query = query.neq('id', excludeDriverId);
        }

        const { data, error } = await query.maybeSingle();
        if (!error && data) return data as Driver;
      } catch (err) {
        console.warn('Supabase getAssignedDriverForTruck failed, falling back:', err);
      }
    }

    if (isUUID(organizationId) && organizationId !== DEMO_ORGANIZATION_ID) {
      return null;
    }

    const { drivers } = this.ensureInitialized(organizationId);
    const found = drivers.find(
      (d) => d.assigned_truck_id === truckId && d.id !== excludeDriverId
    );
    return found || null;
  }

  getDrivers(organizationId: string): Promise<DriverWithRelations[]> {
    if (!organizationId) return Promise.resolve([]);

    const inFlight = this.inFlightGetDrivers.get(organizationId);
    if (inFlight) {
      return inFlight;
    }

    const request = (async () => {
      let rawDrivers: Driver[] = [];

      if (isSupabaseConfigured && isUUID(organizationId)) {
        if (organizationId !== DEMO_ORGANIZATION_ID) {
          try {
            let { data, error } = await supabase
              .from('drivers')
              .select('*')
              .eq('organization_id', organizationId)
              .order('created_at', { ascending: false });

            // If a transient network glitch or gateway error occurred, retry once before reporting failure
            if (error && (error.message?.includes('500') || error.message?.includes('<html') || error.message?.includes('Failed to fetch') || !(error as any).code)) {
              console.warn('[DriverService] Transient error on getDrivers, retrying in 300ms...');
              await new Promise((r) => setTimeout(r, 300));
              const retryRes = await supabase
                .from('drivers')
                .select('*')
                .eq('organization_id', organizationId)
                .order('created_at', { ascending: false });
              data = retryRes.data;
              error = retryRes.error;
            }

            if (error) {
              console.error('[DriverService] Supabase getDrivers error for real org:', error);
              rawDrivers = [];
            } else {
              rawDrivers = (data || []) as Driver[];
            }
          } catch (fetchErr) {
            console.error('[DriverService] Supabase getDrivers network error for real org:', fetchErr);
            rawDrivers = [];
          }
        } else {
          // Demo org flow
          try {
            const { data, error } = await supabase
              .from('drivers')
              .select('*')
              .eq('organization_id', organizationId)
              .order('created_at', { ascending: false });

            if (error) {
              console.warn('[DriverService] Supabase getDrivers error, using fallback:', error);
              const { drivers } = this.ensureInitialized(organizationId);
              rawDrivers = drivers;
            } else {
              rawDrivers = (data || []) as Driver[];
              if (rawDrivers.length === 0) {
                const { drivers } = this.ensureInitialized(organizationId);
                rawDrivers = drivers;
              }
            }
          } catch (fetchErr) {
            console.warn('[DriverService] Supabase getDrivers network error, using fallback:', fetchErr);
            const { drivers } = this.ensureInitialized(organizationId);
            rawDrivers = drivers;
          }
        }
      } else if (isSupabaseConfigured) {
        try {
          const { data, error } = await supabase
            .from('drivers')
            .select('*')
            .eq('organization_id', organizationId)
            .order('created_at', { ascending: false });

          if (!error && data) {
            rawDrivers = data as Driver[];
          }
        } catch (err) {
          console.warn('Supabase getDrivers failed, falling back to local storage:', err);
        }
      }

      if (rawDrivers.length === 0 && (!isUUID(organizationId) || organizationId === DEMO_ORGANIZATION_ID)) {
        const { drivers } = this.ensureInitialized(organizationId);
        rawDrivers = drivers;
      }

      const [clients, trucks] = await Promise.all([
        this.getClients(organizationId),
        this.getTrucks(organizationId),
      ]);

      return rawDrivers
        .map((d) => this.joinRelations(d, clients, trucks))
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    })().finally(() => {
      this.inFlightGetDrivers.delete(organizationId);
    });

    this.inFlightGetDrivers.set(organizationId, request);
    return request;
  }

  async getDriverById(organizationId: string, id: string): Promise<DriverWithRelations | null> {
    let rawDriver: Driver | null = null;

    if (isSupabaseConfigured && isUUID(organizationId)) {
      if (organizationId !== DEMO_ORGANIZATION_ID) {
        if (!isUUID(id)) return null;
        const { data, error } = await supabase
          .from('drivers')
          .select('*')
          .eq('id', id)
          .eq('organization_id', organizationId)
          .maybeSingle();

        if (error) {
          console.error('[DriverService] Supabase getDriverById error:', error);
          throw new Error(error.message || 'Failed to fetch driver from database.');
        }
        if (!data) return null;
        rawDriver = data as Driver;
      } else if (isUUID(id)) {
        const { data, error } = await supabase
          .from('drivers')
          .select('*')
          .eq('id', id)
          .eq('organization_id', organizationId)
          .maybeSingle();

        if (error) {
          console.error('[DriverService] Supabase getDriverById error:', error);
          throw new Error(error.message || 'Failed to fetch driver from database.');
        }
        if (data) {
          rawDriver = data as Driver;
        }
      }
    } else if (isSupabaseConfigured) {
      try {
        const { data, error } = await supabase
          .from('drivers')
          .select('*')
          .eq('id', id)
          .eq('organization_id', organizationId)
          .maybeSingle();

        if (!error && data) {
          rawDriver = data as Driver;
        }
      } catch (err) {
        console.warn('Supabase getDriverById failed, falling back to local storage:', err);
      }
    }

    if (!rawDriver && (!isUUID(organizationId) || organizationId === DEMO_ORGANIZATION_ID)) {
      const { drivers } = this.ensureInitialized(organizationId);
      rawDriver = drivers.find((d) => d.id === id) || null;
    }

    if (!rawDriver) return null;

    const [clients, trucks] = await Promise.all([
      this.getClients(organizationId),
      this.getTrucks(organizationId),
    ]);

    return this.joinRelations(rawDriver, clients, trucks);
  }

  private async attemptResolvePhoneConflict(
    organizationId: string,
    phone: string,
    driverData: Record<string, any>,
    driverId?: string
  ): Promise<Driver | null> {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      const res = await fetch('/api/drivers/resolve-conflict', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          'x-organization-id': organizationId,
        },
        body: JSON.stringify({
          organizationId,
          phone,
          driverData,
          driverId,
          action: 'transfer',
        }),
      });
      if (res.ok) {
        const result = await res.json();
        if (result.success && result.driver) {
          return result.driver as Driver;
        }
      }
    } catch (resolveErr) {
      console.warn('[DriverService] Phone conflict resolution attempt failed:', resolveErr);
    }
    return null;
  }

  async createDriver(organizationId: string, input: CreateDriverInput): Promise<DriverWithRelations> {
    const [clients, trucks] = await Promise.all([
      this.getClients(organizationId),
      this.getTrucks(organizationId),
    ]);

    // Business integrity verification:
    // If assigned_truck_id is supplied, it MUST belong to the specified client_id
    if (input.assigned_truck_id) {
      const truck = trucks.find((t) => t.id === input.assigned_truck_id);
      if (!truck) {
        throw new Error('Assigned truck not found in organization fleet.');
      }
      if (input.client_id && truck.client_id !== input.client_id) {
        throw new Error('Integrity Violation: Assigned truck must belong to the selected Carrier Client.');
      }
    }

    const payRateNum = Number(input.pay_rate) || 0;

    if (isSupabaseConfigured && isUUID(organizationId)) {
      // If assigned truck is specified, clear it from any driver who currently has it
      if (input.assigned_truck_id) {
        await supabase
          .from('drivers')
          .update({ assigned_truck_id: null, updated_at: new Date().toISOString() })
          .eq('organization_id', organizationId)
          .eq('assigned_truck_id', input.assigned_truck_id);
      }

      const { data, error } = await supabase
        .from('drivers')
        .insert({
          organization_id: organizationId,
          client_id: input.client_id || null,
          assigned_truck_id: input.assigned_truck_id || null,
          full_name: input.full_name.trim(),
          phone: input.phone?.trim() || null,
          email: input.email?.trim() || null,
          pay_type: input.pay_type,
          pay_rate: payRateNum,
          status: input.status || 'available',
          notes: input.notes?.trim() || null,
        })
        .select()
        .single();

      if (error) {
        const isDuplicatePhone =
          error.code === '23505' &&
          (error.message?.includes('uq_drivers_active_normalized_phone') ||
            (error as any).details?.includes('uq_drivers_active_normalized_phone'));

        if (isDuplicatePhone && input.phone?.trim()) {
          console.warn('[DriverService] Active driver phone collision detected, attempting automated conflict resolution...');
          const resolvedDriver = await this.attemptResolvePhoneConflict(
            organizationId,
            input.phone.trim(),
            {
              ...input,
              pay_rate: payRateNum,
            }
          );

          if (resolvedDriver) {
            return this.joinRelations(resolvedDriver, clients, trucks);
          }

          const friendlyError = new Error(
            `Phone number "${input.phone}" is already registered to an active driver profile. Please use a different phone number or leave the phone field blank.`
          );
          (friendlyError as any).code = '23505';
          (friendlyError as any).field = 'phone';
          throw friendlyError;
        }

        console.error('[DriverService] Supabase createDriver error:', error);
        throw new Error(error.message || 'Failed to create driver in database.');
      }

      if (data) {
        return this.joinRelations(data as Driver, clients, trucks);
      }
      throw new Error('Unexpected empty response while creating driver.');
    }

    if (isSupabaseConfigured) {
      try {
        // If assigned truck is specified, clear it from any driver who currently has it
        if (input.assigned_truck_id) {
          await supabase
            .from('drivers')
            .update({ assigned_truck_id: null, updated_at: new Date().toISOString() })
            .eq('organization_id', organizationId)
            .eq('assigned_truck_id', input.assigned_truck_id);
        }

        const { data, error } = await supabase
          .from('drivers')
          .insert({
            organization_id: organizationId,
            client_id: input.client_id || null,
            assigned_truck_id: input.assigned_truck_id || null,
            full_name: input.full_name.trim(),
            phone: input.phone?.trim() || null,
            email: input.email?.trim() || null,
            pay_type: input.pay_type,
            pay_rate: payRateNum,
            status: input.status || 'available',
            notes: input.notes?.trim() || null,
          })
          .select()
          .single();

        if (!error && data) {
          return this.joinRelations(data as Driver, clients, trucks);
        }
      } catch (err) {
        console.warn('Supabase createDriver failed, saving locally:', err);
      }
    }

    const { drivers } = this.ensureInitialized(organizationId);
    const now = new Date().toISOString();
    const newDriverId = `driver-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;

    // If this truck was assigned to someone else, disassociate it from the previous driver
    const updatedDrivers = drivers.map((d) => {
      if (input.assigned_truck_id && d.assigned_truck_id === input.assigned_truck_id) {
        return { ...d, assigned_truck_id: null, updated_at: now };
      }
      return d;
    });

    const newDriver: Driver = {
      id: newDriverId,
      organization_id: organizationId,
      client_id: input.client_id || null,
      assigned_truck_id: input.assigned_truck_id || null,
      full_name: input.full_name.trim(),
      phone: input.phone?.trim() || null,
      email: input.email?.trim() || null,
      pay_type: input.pay_type,
      pay_rate: payRateNum,
      status: input.status || 'available',
      notes: input.notes?.trim() || null,
      created_at: now,
      updated_at: now,
    };

    const finalDrivers = [newDriver, ...updatedDrivers];
    saveToStorage(`${DRIVERS_STORAGE_PREFIX}${organizationId}`, finalDrivers);

    return this.joinRelations(newDriver, clients, trucks);
  }

  async updateDriver(
    organizationId: string,
    id: string,
    input: UpdateDriverInput
  ): Promise<DriverWithRelations> {
    const [clients, trucks] = await Promise.all([
      this.getClients(organizationId),
      this.getTrucks(organizationId),
    ]);

    const targetClientId = input.client_id !== undefined ? input.client_id : undefined;
    const targetTruckId = input.assigned_truck_id !== undefined ? input.assigned_truck_id : undefined;

    // Business integrity check
    if (targetTruckId) {
      const truck = trucks.find((t) => t.id === targetTruckId);
      if (!truck) {
        throw new Error('Assigned truck not found in organization fleet.');
      }
      if (targetClientId && truck.client_id !== targetClientId) {
        throw new Error('Integrity Violation: Assigned truck must belong to the selected Carrier Client.');
      }
    }

    if (isSupabaseConfigured && isUUID(organizationId) && isUUID(id)) {
      // If assigning truck, clear any other driver occupying this truck
      if (targetTruckId) {
        await supabase
          .from('drivers')
          .update({ assigned_truck_id: null, updated_at: new Date().toISOString() })
          .eq('organization_id', organizationId)
          .eq('assigned_truck_id', targetTruckId)
          .neq('id', id);
      }

      const { data, error } = await supabase
        .from('drivers')
        .update({
          ...(input.client_id !== undefined ? { client_id: input.client_id || null } : {}),
          ...(input.assigned_truck_id !== undefined ? { assigned_truck_id: input.assigned_truck_id || null } : {}),
          ...(input.full_name !== undefined ? { full_name: input.full_name.trim() } : {}),
          ...(input.phone !== undefined ? { phone: input.phone?.trim() || null } : {}),
          ...(input.email !== undefined ? { email: input.email?.trim() || null } : {}),
          ...(input.pay_type !== undefined ? { pay_type: input.pay_type } : {}),
          ...(input.pay_rate !== undefined ? { pay_rate: Number(input.pay_rate) || 0 } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          ...(input.notes !== undefined ? { notes: input.notes?.trim() || null } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('organization_id', organizationId)
        .select()
        .single();

      if (error) {
        const isDuplicatePhone =
          error.code === '23505' &&
          (error.message?.includes('uq_drivers_active_normalized_phone') ||
            (error as any).details?.includes('uq_drivers_active_normalized_phone'));

        if (isDuplicatePhone && input.phone?.trim()) {
          console.warn('[DriverService] Active driver phone collision detected on update, attempting automated conflict resolution...');
          const resolvedDriver = await this.attemptResolvePhoneConflict(
            organizationId,
            input.phone.trim(),
            {
              ...input,
              pay_rate: input.pay_rate !== undefined ? Number(input.pay_rate) : undefined,
            },
            id
          );

          if (resolvedDriver) {
            return this.joinRelations(resolvedDriver, clients, trucks);
          }

          const friendlyError = new Error(
            `Phone number "${input.phone}" is already registered to an active driver profile. Please use a different phone number or leave the phone field blank.`
          );
          (friendlyError as any).code = '23505';
          (friendlyError as any).field = 'phone';
          throw friendlyError;
        }

        console.error('[DriverService] Supabase updateDriver error:', error);
        throw new Error(error.message || 'Failed to update driver in database.');
      }

      if (data) {
        return this.joinRelations(data as Driver, clients, trucks);
      }
      throw new Error('Driver not found or update failed.');
    }

    if (isSupabaseConfigured) {
      try {
        // If assigning truck, clear any other driver occupying this truck
        if (targetTruckId) {
          await supabase
            .from('drivers')
            .update({ assigned_truck_id: null, updated_at: new Date().toISOString() })
            .eq('organization_id', organizationId)
            .eq('assigned_truck_id', targetTruckId)
            .neq('id', id);
        }

        const { data, error } = await supabase
          .from('drivers')
          .update({
            ...(input.client_id !== undefined ? { client_id: input.client_id || null } : {}),
            ...(input.assigned_truck_id !== undefined ? { assigned_truck_id: input.assigned_truck_id || null } : {}),
            ...(input.full_name !== undefined ? { full_name: input.full_name.trim() } : {}),
            ...(input.phone !== undefined ? { phone: input.phone?.trim() || null } : {}),
            ...(input.email !== undefined ? { email: input.email?.trim() || null } : {}),
            ...(input.pay_type !== undefined ? { pay_type: input.pay_type } : {}),
            ...(input.pay_rate !== undefined ? { pay_rate: Number(input.pay_rate) || 0 } : {}),
            ...(input.status !== undefined ? { status: input.status } : {}),
            ...(input.notes !== undefined ? { notes: input.notes?.trim() || null } : {}),
            updated_at: new Date().toISOString(),
          })
          .eq('id', id)
          .eq('organization_id', organizationId)
          .select()
          .single();

        if (!error && data) {
          return this.joinRelations(data as Driver, clients, trucks);
        }
      } catch (err) {
        console.warn('Supabase updateDriver failed, updating locally:', err);
      }
    }

    const { drivers } = this.ensureInitialized(organizationId);
    const existingIndex = drivers.findIndex((d) => d.id === id);

    if (existingIndex === -1) {
      throw new Error(`Driver with ID ${id} not found.`);
    }

    const existing = drivers[existingIndex];
    const resolvedClientId = input.client_id !== undefined ? input.client_id : existing.client_id;
    const resolvedTruckId = input.assigned_truck_id !== undefined ? input.assigned_truck_id : existing.assigned_truck_id;

    const now = new Date().toISOString();

    // If reassigning a truck from another driver to this driver
    const updatedDrivers = drivers.map((d) => {
      if (resolvedTruckId && d.id !== id && d.assigned_truck_id === resolvedTruckId) {
        return { ...d, assigned_truck_id: null, updated_at: now };
      }
      return d;
    });

    const updatedDriver: Driver = {
      ...existing,
      client_id: resolvedClientId || null,
      assigned_truck_id: resolvedTruckId || null,
      full_name: input.full_name !== undefined ? input.full_name.trim() : existing.full_name,
      phone: input.phone !== undefined ? (input.phone?.trim() || null) : existing.phone,
      email: input.email !== undefined ? (input.email?.trim() || null) : existing.email,
      pay_type: input.pay_type !== undefined ? input.pay_type : existing.pay_type,
      pay_rate: input.pay_rate !== undefined ? Number(input.pay_rate) : existing.pay_rate,
      status: input.status !== undefined ? input.status : existing.status,
      notes: input.notes !== undefined ? (input.notes?.trim() || null) : existing.notes,
      updated_at: now,
    };

    updatedDrivers[existingIndex] = updatedDriver;
    saveToStorage(`${DRIVERS_STORAGE_PREFIX}${organizationId}`, updatedDrivers);

    return this.joinRelations(updatedDriver, clients, trucks);
  }

  async updateDriverStatus(
    organizationId: string,
    id: string,
    status: DriverStatus
  ): Promise<DriverWithRelations> {
    return this.updateDriver(organizationId, id, { status });
  }

  async deleteDriver(organizationId: string, id: string): Promise<void> {
    if (isSupabaseConfigured && isUUID(organizationId) && isUUID(id)) {
      const { error } = await supabase
        .from('drivers')
        .delete()
        .eq('id', id)
        .eq('organization_id', organizationId);
      if (error) {
        console.error('[DriverService] Supabase deleteDriver error:', error);
        throw new Error(error.message || 'Failed to delete driver from database.');
      }
      return;
    }

    if (isSupabaseConfigured) {
      try {
        const { error } = await supabase
          .from('drivers')
          .delete()
          .eq('id', id)
          .eq('organization_id', organizationId);
        if (!error) {
          const { drivers } = this.ensureInitialized(organizationId);
          const filtered = drivers.filter((d) => d.id !== id);
          saveToStorage(`${DRIVERS_STORAGE_PREFIX}${organizationId}`, filtered);
          return;
        }
      } catch (err) {
        console.warn('Supabase deleteDriver failed, deleting locally:', err);
      }
    }

    const { drivers } = this.ensureInitialized(organizationId);
    const filtered = drivers.filter((d) => d.id !== id);
    saveToStorage(`${DRIVERS_STORAGE_PREFIX}${organizationId}`, filtered);
  }
}

// Singleton export of driverService
export const driverService: IDriverService = new LocalDriverService();
