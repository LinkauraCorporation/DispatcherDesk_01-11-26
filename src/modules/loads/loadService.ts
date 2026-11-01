import { Load, Client, Broker, Truck, Driver, PipelineStatus, EquipmentType, TeamMember } from '../../types/domain.types.ts';
import {
  LoadWithRelations,
  CreateLoadInput,
  UpdateLoadInput,
  LoadFilterCriteria,
  BulkAssignDispatcherResult,
  BulkAssignTeamMemberResult,
  BulkAssignTeamMembersResult,
  LoadTeamAssignment,
  isValidUsState,
} from './loadTypes.ts';
import { validateStatusTransition } from '../pipeline/pipelineTypes.ts';
import { supabase, isSupabaseConfigured } from '../../lib/supabase.ts';
import { clientService } from '../clients/clientService.ts';
import { brokerService } from '../brokers/brokerService.ts';
import { truckService } from '../trucks/truckService.ts';
import { driverService } from '../drivers/driverService.ts';
import { activityService } from '../activity/activityService.ts';
import { teamService } from '../team/teamService.ts';
import { DEFAULT_OPERATIONAL_TIMEZONE, getStateTimezone } from '../../lib/timezones.ts';
import { getLocalDateString } from '../calendar/calendarService.ts';

function isUUID(str?: string | null): boolean {
  if (!str) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

function getEffectiveOperationalTimezone(filters?: LoadFilterCriteria & { operationalTimezone?: string }): string {
  if (filters?.operationalTimezone && filters.operationalTimezone.trim()) {
    return filters.operationalTimezone.trim();
  }
  if (typeof localStorage !== 'undefined') {
    const stored = localStorage.getItem('dispatchdesk_ops_tz');
    if (stored && stored.trim()) {
      return stored.trim();
    }
  }
  return DEFAULT_OPERATIONAL_TIMEZONE;
}

function toSafeLocalDateString(datetimeStr: string | null | undefined, timeZone: string): string | null {
  if (!datetimeStr) return null;
  const res = getLocalDateString(datetimeStr, timeZone);
  return res || null;
}

export const DEMO_ORGANIZATION_ID = 'demo-org-1';

// Storage keys
const LOADS_STORAGE_PREFIX = 'dispatchdesk_demo_loads_';
const CLIENTS_STORAGE_PREFIX = 'dispatchdesk_demo_clients_';
const TRUCKS_STORAGE_PREFIX = 'dispatchdesk_demo_trucks_';
const DRIVERS_STORAGE_PREFIX = 'dispatchdesk_demo_drivers_';
const BROKERS_STORAGE_PREFIX = 'dispatchdesk_demo_brokers_';
const LOAD_TEAM_ASSIGNMENTS_STORAGE_PREFIX = 'dispatchdesk_demo_load_team_assignments_';

// Seed Brokers for demo organization (strictly fictional mock entities)
const SEED_BROKERS: Omit<Broker, 'organization_id'>[] = [
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
    notes: 'Demo carrier tier 1, quick pay approved at 1.5% fee or 30 days standard net.',
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
    notes: 'High volume flatbed and reefer spot freight demo. Requires check call every 4 hours.',
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
    notes: 'Automated tracking required via MacroPoint / ELD link. Fast payment turnaround.',
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
    notes: 'Pre-vetted heavy haul and reefer broker agent. Strict on on-time delivery.',
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
    notes: 'Requires factoring verification and assignment before booking high-value freight.',
    created_at: new Date(Date.now() - 35 * 86400000).toISOString(),
    updated_at: new Date(Date.now() - 1 * 86400000).toISOString(),
  },
];

// Seed initial loads
const SEED_LOADS: Omit<Load, 'organization_id'>[] = [
  {
    id: 'demo-load-1',
    load_number: 'LD-2024-8841',
    client_id: 'demo-client-1',
    broker_id: 'demo-broker-1',
    truck_id: 'demo-truck-101',
    driver_id: 'demo-driver-1',
    assigned_dispatcher_id: 'usr-alex-1',
    pipeline_status: 'booked',
    equipment_type: 'dry_van',
    commodity: 'Packaged Consumer Electronics',
    weight_lbs: 38500,
    origin_facility_name: 'Lone Star Logistics Park',
    origin_address: '1420 W Mockingbird Ln',
    origin_city: 'Dallas',
    origin_state: 'TX',
    origin_zip: '75207',
    origin_timezone: 'America/Chicago',
    pickup_datetime: new Date(Date.now() + 18 * 3600000).toISOString(),
    dest_facility_name: 'Southeast Hub 4',
    dest_address: '2800 Fulton Industrial Blvd',
    dest_city: 'Atlanta',
    dest_state: 'GA',
    dest_zip: '30301',
    dest_timezone: 'America/New_York',
    operational_timezone: 'America/Chicago',
    delivery_datetime: new Date(Date.now() + 48 * 3600000).toISOString(),
    pickup_arrival_time: null,
    pickup_loading_start_time: null,
    pickup_loading_complete_time: null,
    pickup_departure_time: null,
    delivery_arrival_time: null,
    delivery_unloading_start_time: null,
    delivery_unloading_complete_time: null,
    delivery_departure_time: null,
    rate: 2450.00,
    loaded_miles: 780,
    deadhead_miles: 45,
    fuel_expense: 485.00,
    driver_pay: 661.50, // 27% of $2,450 gross
    other_expenses: 75.00,
    special_instructions: 'Driver must check in at Gate 4 with Broker PO #CH-88219. High-value freight; lock trailer with security seal #89921.',
    created_at: new Date(Date.now() - 3 * 86400000).toISOString(),
    updated_at: new Date(Date.now() - 1 * 86400000).toISOString(),
  },
  {
    id: 'demo-load-2',
    load_number: 'LD-2024-8842',
    client_id: 'demo-client-1',
    broker_id: 'demo-broker-3',
    truck_id: 'demo-truck-102',
    driver_id: 'demo-driver-2',
    assigned_dispatcher_id: 'usr-alex-1',
    pipeline_status: 'in_transit',
    equipment_type: 'reefer',
    commodity: 'Chilled Dairy & Specialty Yogurt (36°F Continuous)',
    weight_lbs: 41200,
    origin_facility_name: 'Mid-South Cold Logistics',
    origin_address: '890 Riverside Dr',
    origin_city: 'Memphis',
    origin_state: 'TN',
    origin_zip: '38103',
    origin_timezone: 'America/Chicago',
    pickup_datetime: new Date(Date.now() - 12 * 3600000).toISOString(),
    dest_facility_name: 'Carolina Food Express',
    dest_address: '4100 Statesville Rd',
    dest_city: 'Charlotte',
    dest_state: 'NC',
    dest_zip: '28202',
    dest_timezone: 'America/New_York',
    operational_timezone: 'America/Chicago',
    delivery_datetime: new Date(Date.now() + 14 * 3600000).toISOString(),
    pickup_arrival_time: new Date(Date.now() - 13 * 3600000).toISOString(),
    pickup_loading_start_time: new Date(Date.now() - 12.5 * 3600000).toISOString(),
    pickup_loading_complete_time: new Date(Date.now() - 11.5 * 3600000).toISOString(),
    pickup_departure_time: new Date(Date.now() - 11.2 * 3600000).toISOString(),
    delivery_arrival_time: null,
    delivery_unloading_start_time: null,
    delivery_unloading_complete_time: null,
    delivery_departure_time: null,
    rate: 2850.00,
    loaded_miles: 630,
    deadhead_miles: 20,
    fuel_expense: 410.00,
    driver_pay: 442.00, // $0.68/mi * 650 total miles
    other_expenses: 100.00,
    special_instructions: 'Maintain Reefer set point at 36°F Continuous mode. Download temperature log at destination receiver dock.',
    created_at: new Date(Date.now() - 4 * 86400000).toISOString(),
    updated_at: new Date(Date.now() - 4 * 3600000).toISOString(),
  },
  {
    id: 'demo-load-3',
    load_number: 'LD-2024-8843',
    client_id: 'demo-client-2',
    broker_id: 'demo-broker-2',
    truck_id: 'demo-truck-201',
    driver_id: 'demo-driver-3',
    assigned_dispatcher_id: 'usr-sarah-2',
    pipeline_status: 'sourced',
    equipment_type: 'flatbed',
    commodity: 'Fabricated Structural Steel Beams',
    weight_lbs: 46000,
    origin_facility_name: 'Midwest Steel Works',
    origin_address: '1000 E 87th St',
    origin_city: 'Chicago',
    origin_state: 'IL',
    origin_zip: '60611',
    origin_timezone: 'America/Chicago',
    pickup_datetime: new Date(Date.now() + 36 * 3600000).toISOString(),
    dest_facility_name: 'Trinity Heavy Yards',
    dest_address: '2200 Singleton Blvd',
    dest_city: 'Dallas',
    dest_state: 'TX',
    dest_zip: '75207',
    dest_timezone: 'America/Chicago',
    operational_timezone: 'America/Chicago',
    delivery_datetime: new Date(Date.now() + 84 * 3600000).toISOString(),
    pickup_arrival_time: null,
    pickup_loading_start_time: null,
    pickup_loading_complete_time: null,
    pickup_departure_time: null,
    delivery_arrival_time: null,
    delivery_unloading_start_time: null,
    delivery_unloading_complete_time: null,
    delivery_departure_time: null,
    rate: 3200.00,
    loaded_miles: 925,
    deadhead_miles: 60,
    fuel_expense: 615.00,
    driver_pay: 960.00, // 30% of $3,200 gross
    other_expenses: 50.00,
    special_instructions: 'Full 8ft tarps and minimum 8 grade-70 transport chains required. Hard hat & steel-toe boots mandatory at steel mill.',
    created_at: new Date(Date.now() - 2 * 86400000).toISOString(),
    updated_at: new Date(Date.now() - 12 * 3600000).toISOString(),
  },
  {
    id: 'demo-load-4',
    load_number: 'LD-2024-8844',
    client_id: 'demo-client-3',
    broker_id: 'demo-broker-4',
    truck_id: 'demo-truck-301',
    driver_id: 'demo-driver-4',
    assigned_dispatcher_id: null,
    pipeline_status: 'delivered',
    equipment_type: 'reefer',
    commodity: 'Fresh California Strawberries & Citrus (34°F)',
    weight_lbs: 42800,
    origin_facility_name: 'Gulf Cold Hub',
    origin_address: '7000 Clinton Dr',
    origin_city: 'Houston',
    origin_state: 'TX',
    origin_zip: '77002',
    origin_timezone: 'America/Chicago',
    pickup_datetime: new Date(Date.now() - 72 * 3600000).toISOString(),
    dest_facility_name: 'Desert Fresh Logistics',
    dest_address: '3500 W Buckeye Rd',
    dest_city: 'Phoenix',
    dest_state: 'AZ',
    dest_zip: '85001',
    dest_timezone: 'America/Denver',
    operational_timezone: 'America/Chicago',
    delivery_datetime: new Date(Date.now() - 10 * 3600000).toISOString(),
    pickup_arrival_time: new Date(Date.now() - 74 * 3600000).toISOString(),
    pickup_loading_start_time: new Date(Date.now() - 73.5 * 3600000).toISOString(),
    pickup_loading_complete_time: new Date(Date.now() - 71.5 * 3600000).toISOString(),
    pickup_departure_time: new Date(Date.now() - 71.2 * 3600000).toISOString(),
    delivery_arrival_time: new Date(Date.now() - 12 * 3600000).toISOString(),
    delivery_unloading_start_time: new Date(Date.now() - 11.5 * 3600000).toISOString(),
    delivery_unloading_complete_time: new Date(Date.now() - 10.2 * 3600000).toISOString(),
    delivery_departure_time: new Date(Date.now() - 10 * 3600000).toISOString(),
    rate: 3750.00,
    loaded_miles: 1175,
    deadhead_miles: 80,
    fuel_expense: 790.00,
    driver_pay: 1450.00, // Flat rate
    other_expenses: 120.00,
    special_instructions: 'Signed POD received with no OS&D claims. Lumper fee receipt approved by broker David Morrison.',
    created_at: new Date(Date.now() - 6 * 86400000).toISOString(),
    updated_at: new Date(Date.now() - 8 * 3600000).toISOString(),
  },
  {
    id: 'demo-load-5',
    load_number: 'LD-2024-8845',
    client_id: 'demo-client-1',
    broker_id: 'demo-broker-5',
    truck_id: 'demo-truck-101',
    driver_id: 'demo-driver-1',
    assigned_dispatcher_id: 'usr-marcus-3',
    pipeline_status: 'paid',
    equipment_type: 'dry_van',
    commodity: 'Automotive Component Racks',
    weight_lbs: 32000,
    origin_facility_name: 'Peachtree Freight Terminal',
    origin_address: '1500 Southland Circle NW',
    origin_city: 'Atlanta',
    origin_state: 'GA',
    origin_zip: '30301',
    origin_timezone: 'America/New_York',
    pickup_datetime: new Date(Date.now() - 120 * 3600000).toISOString(),
    dest_facility_name: 'Jax Port Distribution',
    dest_address: '2000 Port Central Dr',
    dest_city: 'Jacksonville',
    dest_state: 'FL',
    dest_zip: '32202',
    dest_timezone: 'America/New_York',
    operational_timezone: 'America/New_York',
    delivery_datetime: new Date(Date.now() - 96 * 3600000).toISOString(),
    pickup_arrival_time: new Date(Date.now() - 121 * 3600000).toISOString(),
    pickup_loading_start_time: new Date(Date.now() - 120.5 * 3600000).toISOString(),
    pickup_loading_complete_time: new Date(Date.now() - 119.5 * 3600000).toISOString(),
    pickup_departure_time: new Date(Date.now() - 119 * 3600000).toISOString(),
    delivery_arrival_time: new Date(Date.now() - 98 * 3600000).toISOString(),
    delivery_unloading_start_time: new Date(Date.now() - 97.5 * 3600000).toISOString(),
    delivery_unloading_complete_time: new Date(Date.now() - 96.2 * 3600000).toISOString(),
    delivery_departure_time: new Date(Date.now() - 96 * 3600000).toISOString(),
    rate: 1650.00,
    loaded_miles: 350,
    deadhead_miles: 30,
    fuel_expense: 230.00,
    driver_pay: 445.50,
    other_expenses: 30.00,
    special_instructions: 'Quick turnaround auto assembly delivery. Remittance paid direct via ACH.',
    created_at: new Date(Date.now() - 10 * 86400000).toISOString(),
    updated_at: new Date(Date.now() - 5 * 86400000).toISOString(),
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
 * Load Service Interface
 * Defines clean repository contracts for Load Management.
 * Compatible with public.loads schema for future Supabase RLS integration.
 */
export interface ILoadService {
  getLoads(organizationId: string, filters?: LoadFilterCriteria): Promise<LoadWithRelations[]>;
  getLoad(organizationId: string, id: string): Promise<LoadWithRelations | null>;
  getLoadById(organizationId: string, id: string): Promise<LoadWithRelations | null>;
  createLoad(organizationId: string, input: CreateLoadInput): Promise<LoadWithRelations>;
  updateLoad(
    organizationId: string,
    id: string,
    input: UpdateLoadInput,
    actorName?: string,
    actorId?: string
  ): Promise<LoadWithRelations>;
  deleteLoad(organizationId: string, id: string): Promise<void>;
  updateLoadStatus(organizationId: string, id: string, status: PipelineStatus): Promise<LoadWithRelations>;
  assignDispatchResources(
    organizationId: string,
    loadId: string,
    truckId?: string | null,
    driverId?: string | null,
    notes?: string
  ): Promise<LoadWithRelations>;
  assignDispatcher(
    organizationId: string,
    loadId: string,
    dispatcherId: string | null,
    actorName?: string,
    actorId?: string
  ): Promise<LoadWithRelations>;
  assignLoadToTeamMember(
    organizationId: string,
    loadId: string,
    memberId: string | null,
    actorName?: string,
    actorId?: string
  ): Promise<LoadWithRelations>;
  assignTeamMembersToLoad(
    organizationId: string,
    loadId: string,
    memberIds: string[],
    mode?: 'add' | 'replace',
    actorName?: string,
    actorId?: string
  ): Promise<LoadWithRelations>;
  removeTeamMemberFromLoad(
    organizationId: string,
    loadId: string,
    memberId: string,
    actorName?: string,
    actorId?: string
  ): Promise<LoadWithRelations>;
  bulkAssignDispatcher(
    organizationId: string,
    loadIds: string[],
    dispatcherId: string | null,
    actorName?: string,
    actorId?: string
  ): Promise<BulkAssignDispatcherResult>;
  bulkAssignLoadsToTeamMember(
    organizationId: string,
    loadIds: string[],
    memberId: string | null,
    actorName?: string,
    actorId?: string
  ): Promise<BulkAssignTeamMemberResult>;
  bulkAssignLoadsToTeamMembers(
    organizationId: string,
    loadIds: string[],
    memberIds: string[],
    mode?: 'add' | 'replace' | 'remove',
    actorName?: string,
    actorId?: string
  ): Promise<BulkAssignTeamMembersResult>;
  getClients(organizationId: string): Promise<Client[]>;
  getBrokers(organizationId: string): Promise<Broker[]>;
  getTrucks(organizationId: string, clientId?: string): Promise<Truck[]>;
  getDrivers(organizationId: string, clientId?: string): Promise<Driver[]>;
  getDependencies(organizationId: string): Promise<[Truck[], Driver[], Client[], Broker[], TeamMember[]]>;
  generateNextLoadNumber(organizationId: string): Promise<string>;
}

/**
 * Local / Demo Implementation of ILoadService
 * Persists per-organization in localStorage with full relational joins.
 * Guarantees operational hierarchy:
 * Organization -> Client -> Truck -> Driver -> Load & Broker -> Load
 */
class LocalLoadService implements ILoadService {
  private inFlightGetLoads = new Map<string, Promise<LoadWithRelations[]>>();
  private inFlightGetDependencies = new Map<string, Promise<[Truck[], Driver[], Client[], Broker[], TeamMember[]]>>();

  private ensureInitialized(organizationId: string): {
    loads: Load[];
    clients: Client[];
    brokers: Broker[];
    trucks: Truck[];
    drivers: Driver[];
    assignments: LoadTeamAssignment[];
  } {
    const loadsKey = `${LOADS_STORAGE_PREFIX}${organizationId}`;
    const clientsKey = `${CLIENTS_STORAGE_PREFIX}${organizationId}`;
    const brokersKey = `${BROKERS_STORAGE_PREFIX}${organizationId}`;
    const trucksKey = `${TRUCKS_STORAGE_PREFIX}${organizationId}`;
    const driversKey = `${DRIVERS_STORAGE_PREFIX}${organizationId}`;
    const assignmentsKey = `${LOAD_TEAM_ASSIGNMENTS_STORAGE_PREFIX}${organizationId}`;

    const clients = loadFromStorage<Client[]>(clientsKey, []);
    const trucks = loadFromStorage<Truck[]>(trucksKey, []);
    const drivers = loadFromStorage<Driver[]>(driversKey, []);
    let brokers = loadFromStorage<Broker[]>(brokersKey, []);
    let loads = loadFromStorage<Load[]>(loadsKey, []);
    let assignments = loadFromStorage<LoadTeamAssignment[]>(assignmentsKey, []);

    if (isUUID(organizationId) && organizationId !== DEMO_ORGANIZATION_ID) {
      return { loads: [], clients: [], brokers: [], trucks: [], drivers: [], assignments: [] };
    }

    if (brokers.length === 0) {
      brokers = SEED_BROKERS.map((b) => ({
        ...b,
        organization_id: organizationId,
      }));
      saveToStorage(brokersKey, brokers);
    }

    if (loads.length === 0) {
      loads = SEED_LOADS.map((l) => ({
        ...l,
        organization_id: organizationId,
      }));
      saveToStorage(loadsKey, loads);
    }

    let hasBackfilled = false;
    loads.forEach((l) => {
      if (!l.origin_timezone) {
        l.origin_timezone = getStateTimezone(l.origin_state);
        hasBackfilled = true;
      }
      if (!l.dest_timezone) {
        l.dest_timezone = getStateTimezone(l.dest_state);
        hasBackfilled = true;
      }
      if (!l.operational_timezone) {
        l.operational_timezone = l.origin_timezone || DEFAULT_OPERATIONAL_TIMEZONE;
        hasBackfilled = true;
      }
      if (l.assigned_dispatcher_id && !assignments.some((a) => a.load_id === l.id && a.user_id === l.assigned_dispatcher_id)) {
        assignments.push({
          id: `assign-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
          organization_id: organizationId,
          load_id: l.id,
          user_id: l.assigned_dispatcher_id,
          created_at: l.created_at || new Date().toISOString(),
        });
        hasBackfilled = true;
      }
    });
    if (hasBackfilled) {
      saveToStorage(loadsKey, loads);
      saveToStorage(assignmentsKey, assignments);
    }

    return { loads, clients, brokers, trucks, drivers, assignments };
  }

  private joinRelations(
    load: Load,
    clients: Client[],
    brokers: Broker[],
    trucks: Truck[],
    drivers: Driver[],
    teamMembers: TeamMember[] = [],
    teamAssignments: LoadTeamAssignment[] = []
  ): LoadWithRelations {
    const originTimezone = load.origin_timezone || getStateTimezone(load.origin_state);
    const destTimezone = load.dest_timezone || getStateTimezone(load.dest_state);
    const operationalTimezone = load.operational_timezone || originTimezone || DEFAULT_OPERATIONAL_TIMEZONE;

    const client = load.client_id
      ? clients.find((c) => c.id === load.client_id && (!c.organization_id || c.organization_id === load.organization_id)) || null
      : null;

    const broker = load.broker_id
      ? brokers.find((b) => b.id === load.broker_id && (!b.organization_id || b.organization_id === load.organization_id)) || null
      : null;

    const truck = load.truck_id
      ? trucks.find((t) => t.id === load.truck_id && (!t.organization_id || t.organization_id === load.organization_id)) || null
      : null;

    const driver = load.driver_id
      ? drivers.find((d) => d.id === load.driver_id && (!d.organization_id || d.organization_id === load.organization_id)) || null
      : null;

    // Find all relational assignments for this load
    const loadAssignments = teamAssignments.filter((a) => a.load_id === load.id);
    const assignedTeam: TeamMember[] = [];

    loadAssignments.forEach((a) => {
      const member = teamMembers.find((m) => m.user_id === a.user_id);
      if (member && !assignedTeam.some((m) => m.user_id === member.user_id)) {
        assignedTeam.push(member);
      }
    });

    // Fallback: If no relational assignments found yet but load.assigned_dispatcher_id exists, include that member
    if (assignedTeam.length === 0 && load.assigned_dispatcher_id) {
      const fallbackMember = teamMembers.find(
        (m) => m.user_id === load.assigned_dispatcher_id
      );
      if (fallbackMember) {
        assignedTeam.push(fallbackMember);
      }
    }

    const primaryAssignee = assignedTeam[0] || null;

    const dispatcherProfile = primaryAssignee
      ? {
          id: primaryAssignee.user_id,
          full_name: primaryAssignee.full_name,
          phone: primaryAssignee.phone,
          email: primaryAssignee.email,
          role: primaryAssignee.role,
        }
      : null;

    return {
      ...load,
      origin_timezone: originTimezone,
      dest_timezone: destTimezone,
      operational_timezone: operationalTimezone,
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
      broker: broker
        ? {
            id: broker.id,
            company_name: broker.company_name,
            mc_number: broker.mc_number,
            dot_number: broker.dot_number,
            contact_name: broker.contact_name,
            contact_phone: broker.contact_phone,
            contact_email: broker.contact_email,
            credit_status: broker.credit_status,
            payment_terms_days: broker.payment_terms_days,
          }
        : null,
      truck: truck
        ? {
            id: truck.id,
            truck_number: truck.truck_number,
            equipment_type: truck.equipment_type,
            current_location_city: truck.current_location_city,
            current_location_state: truck.current_location_state,
            status: truck.status,
            vin: truck.vin,
          }
        : null,
      driver: driver
        ? {
            id: driver.id,
            full_name: driver.full_name,
            phone: driver.phone,
            email: driver.email,
            pay_type: driver.pay_type,
            pay_rate: driver.pay_rate,
            status: driver.status,
          }
        : null,
      dispatcher_profile: dispatcherProfile,
      assigned_to_profile: dispatcherProfile,
      assigned_team: assignedTeam,
      assigned_team_assignments: loadAssignments,
    };
  }

  getLoads(organizationId: string, filters?: LoadFilterCriteria & { operationalTimezone?: string }): Promise<LoadWithRelations[]> {
    if (!organizationId) return Promise.resolve([]);

    const inFlightKey = `${organizationId}:${JSON.stringify(filters || {})}`;
    const inFlight = this.inFlightGetLoads.get(inFlightKey);
    if (inFlight) {
      return inFlight;
    }

    const request = (async () => {
      // Eagerly kick off dependencies concurrently so in-flight requests coalesce with external callers (e.g. PipelineView)
      const depPromise = this.getDependencies(organizationId);
      let rawLoads: Load[] = [];
      let rawAssignments: LoadTeamAssignment[] = [];

      if (isSupabaseConfigured && isUUID(organizationId)) {
        if (organizationId !== DEMO_ORGANIZATION_ID) {
          try {
            let { data, error } = await supabase
              .from('loads')
              .select('*')
              .eq('organization_id', organizationId)
              .order('created_at', { ascending: false });

            // If a transient network glitch or gateway error occurred, retry once before reporting failure
            if (error && (error.message?.includes('500') || error.message?.includes('<html') || error.message?.includes('Failed to fetch') || error.details?.includes('Failed to fetch') || !(error as any).code)) {
              console.warn('[LoadService] Transient network error on getLoads, retrying in 300ms...');
              await new Promise((r) => setTimeout(r, 300));
              const retryRes = await supabase
                .from('loads')
                .select('*')
                .eq('organization_id', organizationId)
                .order('created_at', { ascending: false });
              data = retryRes.data;
              error = retryRes.error;
            }

            if (error) {
              console.error('[LoadService] Supabase getLoads query error for real org:', error);
              // Fallback to locally cached loads for this org if available
              const cachedKey = `${LOADS_STORAGE_PREFIX}${organizationId}`;
              rawLoads = loadFromStorage<Load[]>(cachedKey, []);
            } else {
              rawLoads = (data || []) as Load[];
              if (rawLoads.length > 0) {
                saveToStorage(`${LOADS_STORAGE_PREFIX}${organizationId}`, rawLoads);
              }
            }
          } catch (fetchErr) {
            console.error('[LoadService] Supabase getLoads network error for real org:', fetchErr);
            const cachedKey = `${LOADS_STORAGE_PREFIX}${organizationId}`;
            rawLoads = loadFromStorage<Load[]>(cachedKey, []);
          }
        } else {
          // Demo organization flow
          try {
            const { data, error } = await supabase
              .from('loads')
              .select('*')
              .eq('organization_id', organizationId)
              .order('created_at', { ascending: false });

            if (error) {
              console.warn('[LoadService] Supabase getLoads query warning, using local fallback:', error);
              const init = this.ensureInitialized(organizationId);
              rawLoads = init.loads;
              rawAssignments = init.assignments;
            } else {
              rawLoads = (data || []) as Load[];
              // If Supabase returned zero records for demo org, backfill with local initialized records for demo continuity
              if (rawLoads.length === 0) {
                const init = this.ensureInitialized(organizationId);
                if (init.loads.length > 0) {
                  rawLoads = init.loads;
                  rawAssignments = init.assignments;
                }
              }
            }
          } catch (fetchErr) {
            console.warn('[LoadService] Supabase getLoads network warning, using local fallback:', fetchErr);
            const init = this.ensureInitialized(organizationId);
            rawLoads = init.loads;
            rawAssignments = init.assignments;
          }
        }

        // Attempt to fetch load_team_assignments from Supabase if we got loads from Supabase
        if (rawAssignments.length === 0) {
          try {
            const { data: assignData, error: assignError } = await supabase
              .from('load_team_assignments')
              .select('*')
              .eq('organization_id', organizationId);

            if (!assignError && assignData && assignData.length > 0) {
              rawAssignments = assignData as LoadTeamAssignment[];
            }
          } catch (err) {
            console.warn('[LoadService] Supabase load_team_assignments fetch skipped/failed, using fallback:', err);
          }
        }
      } else if (!isUUID(organizationId) || organizationId === DEMO_ORGANIZATION_ID) {
        const init = this.ensureInitialized(organizationId);
        rawLoads = init.loads;
        rawAssignments = init.assignments;
      }

      const [trucks, drivers, clients, brokers, teamMembers] = await depPromise;
      let result = rawLoads.map((l) => this.joinRelations(l, clients, brokers, trucks, drivers, teamMembers, rawAssignments));

      // --------------------------------------------------------------------
      // EMPLOYEE LOAD ACCESS CONTROL:
      // - Owner Admin: can see all loads belonging to the organization.
      // - Dispatcher / Staff / Employee: can see ONLY loads assigned to them.
      // - Non-assigned employees (ZERO assignments) see 0 loads.
      // --------------------------------------------------------------------
      const effectiveRole: string | null =
        filters?.userRole ||
        (typeof localStorage !== 'undefined' ? localStorage.getItem('dispatchdesk_current_role') : null);

      const effectiveUserId: string | null =
        filters?.currentUserId ||
        (typeof localStorage !== 'undefined' ? localStorage.getItem('dispatchdesk_current_user_id') : null);

      if (effectiveRole === 'dispatcher' || effectiveRole === 'staff') {
        result = result.filter((l) => {
          if (!effectiveUserId) return false;
          const isDirectlyAssigned = l.assigned_dispatcher_id === effectiveUserId;
          const isInTeam = l.assigned_team && l.assigned_team.some((m) => m.user_id === effectiveUserId);
          const isInAssignments =
            l.assigned_team_assignments && l.assigned_team_assignments.some((a) => a.user_id === effectiveUserId);
          return Boolean(isDirectlyAssigned || isInTeam || isInAssignments);
        });
      }

      if (filters) {
        if (filters.search && filters.search.trim()) {
          const query = filters.search.toLowerCase().trim();
          result = result.filter((l) => {
            const loadNum = l.load_number.toLowerCase();
            const origin = `${l.origin_city}, ${l.origin_state}`.toLowerCase();
            const dest = `${l.dest_city}, ${l.dest_state}`.toLowerCase();
            const commodity = (l.commodity || '').toLowerCase();
            const clientName = (l.client?.company_name || '').toLowerCase();
            const brokerName = (l.broker?.company_name || '').toLowerCase();
            const truckNum = (l.truck?.truck_number || '').toLowerCase();
            const driverName = (l.driver?.full_name || '').toLowerCase();
            const assigneeName = (l.dispatcher_profile?.full_name || '').toLowerCase();
            const assigneeRole = (l.dispatcher_profile?.role || '').toLowerCase();
            const teamMatches = (l.assigned_team || []).some(
              (m) =>
                (m.full_name || '').toLowerCase().includes(query) ||
                (m.role || '').toLowerCase().includes(query) ||
                (m.email && m.email.toLowerCase().includes(query))
            );

            return (
              loadNum.includes(query) ||
              origin.includes(query) ||
              dest.includes(query) ||
              commodity.includes(query) ||
              clientName.includes(query) ||
              brokerName.includes(query) ||
              truckNum.includes(query) ||
              driverName.includes(query) ||
              assigneeName.includes(query) ||
              assigneeRole.includes(query) ||
              teamMatches
            );
          });
        }

        if (filters.clientId && filters.clientId !== 'all') {
          result = result.filter((l) => l.client_id === filters.clientId);
        }

        if (filters.brokerId && filters.brokerId !== 'all') {
          result = result.filter((l) => l.broker_id === filters.brokerId);
        }

        const assignedFilter = filters.assignedMemberId || filters.dispatcherId;
        if (assignedFilter && assignedFilter !== 'all') {
          if (assignedFilter === 'unassigned') {
            result = result.filter(
              (l) => (!l.assigned_team || l.assigned_team.length === 0) &&
                     (!l.assigned_team_assignments || l.assigned_team_assignments.length === 0)
            );
          } else if (assignedFilter === 'me') {
            const targetUserId = filters.currentUserId;
            if (targetUserId) {
              result = result.filter(
                (l) =>
                  (l.assigned_team && l.assigned_team.some((m) => m.user_id === targetUserId)) ||
                  (l.assigned_team_assignments && l.assigned_team_assignments.some((a) => a.user_id === targetUserId))
              );
            }
          } else {
            result = result.filter(
              (l) =>
                (l.assigned_team && l.assigned_team.some((m) => m.user_id === assignedFilter)) ||
                (l.assigned_team_assignments && l.assigned_team_assignments.some((a) => a.user_id === assignedFilter))
            );
          }
        }

        if (filters.equipmentType && filters.equipmentType !== 'all') {
          result = result.filter((l) => l.equipment_type === filters.equipmentType);
        }

        if (filters.status && filters.status !== 'all') {
          result = result.filter((l) => l.pipeline_status === filters.status);
        }

        if (filters.dateRange && filters.dateRange !== 'all') {
          const opTimezone = getEffectiveOperationalTimezone(filters);
          const todayStr = getLocalDateString(new Date(), opTimezone);

          if (filters.dateRange === 'today') {
            result = result.filter((l) => {
              if (!l.pickup_datetime) return false;
              const pDate = toSafeLocalDateString(l.pickup_datetime, opTimezone);
              return pDate === todayStr;
            });
          } else if (filters.dateRange === 'upcoming') {
            result = result.filter((l) => {
              if (!l.pickup_datetime) return true;
              const pDate = toSafeLocalDateString(l.pickup_datetime, opTimezone);
              return pDate !== null && pDate >= todayStr;
            });
          } else if (filters.dateRange === 'past') {
            result = result.filter((l) => {
              if (!l.delivery_datetime) return false;
              const dDate = toSafeLocalDateString(l.delivery_datetime, opTimezone);
              return dDate !== null && dDate < todayStr;
            });
          }
        }
      }

      // Sort newest first by created_at or pickup_datetime
      return result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    })();

    this.inFlightGetLoads.set(inFlightKey, request);
    request.finally(() => {
      this.inFlightGetLoads.delete(inFlightKey);
    });
    return request;
  }

  async getLoad(organizationId: string, id: string): Promise<LoadWithRelations | null> {
    return this.getLoadById(organizationId, id);
  }

  async getLoadById(organizationId: string, id: string): Promise<LoadWithRelations | null> {
    let rawLoad: Load | null = null;
    let rawAssignments: LoadTeamAssignment[] = [];

    if (isSupabaseConfigured && isUUID(organizationId)) {
      if (organizationId !== DEMO_ORGANIZATION_ID) {
        if (!isUUID(id)) return null;
        try {
          let { data, error } = await supabase
            .from('loads')
            .select('*')
            .eq('id', id)
            .eq('organization_id', organizationId)
            .maybeSingle();

          if (error && (error.message?.includes('Failed to fetch') || error.details?.includes('Failed to fetch') || !error.code)) {
            console.warn('[LoadService] Transient network error on getLoadById, retrying in 300ms...');
            await new Promise((r) => setTimeout(r, 300));
            const retryRes = await supabase
              .from('loads')
              .select('*')
              .eq('id', id)
              .eq('organization_id', organizationId)
              .maybeSingle();
            data = retryRes.data;
            error = retryRes.error;
          }

          if (error) {
            console.error('[LoadService] Supabase getLoadById error for real org:', error);
            const cachedLoads = loadFromStorage<Load[]>(`${LOADS_STORAGE_PREFIX}${organizationId}`, []);
            const found = cachedLoads.find((l) => l.id === id);
            if (found) {
              rawLoad = found;
            } else {
              throw new Error(error.message || 'Failed to fetch load from database.');
            }
          }
          if (data) {
            rawLoad = data as Load;
            try {
              const { data: assignData } = await supabase
                .from('load_team_assignments')
                .select('*')
                .eq('load_id', id)
                .eq('organization_id', organizationId);
              if (assignData) {
                rawAssignments = assignData as LoadTeamAssignment[];
              }
            } catch (err) {
              console.warn('[LoadService] Supabase getLoadById assignments fetch error:', err);
            }
          }
        } catch (err) {
          console.error('[LoadService] Supabase getLoadById network error for real org:', err);
          throw err;
        }
      } else {
        // Demo org flow
        try {
          const { data, error } = await supabase
            .from('loads')
            .select('*')
            .eq('id', id)
            .eq('organization_id', organizationId)
            .maybeSingle();

          if (error) {
            console.warn('[LoadService] Supabase getLoadById warning, using local fallback:', error);
            const { loads, assignments } = this.ensureInitialized(organizationId);
            rawLoad = loads.find((l) => l.id === id) || null;
            rawAssignments = assignments.filter((a) => a.load_id === id);
          } else if (data) {
            rawLoad = data as Load;
            try {
              const { data: assignData } = await supabase
                .from('load_team_assignments')
                .select('*')
                .eq('load_id', id)
                .eq('organization_id', organizationId);
              if (assignData) {
                rawAssignments = assignData as LoadTeamAssignment[];
              }
            } catch (err) {
              console.warn('[LoadService] Supabase getLoadById assignments fetch error:', err);
            }
          } else {
            const { loads, assignments } = this.ensureInitialized(organizationId);
            rawLoad = loads.find((l) => l.id === id) || null;
            rawAssignments = assignments.filter((a) => a.load_id === id);
          }
        } catch (err) {
          console.warn('[LoadService] Supabase getLoadById network warning, using local fallback:', err);
          const { loads, assignments } = this.ensureInitialized(organizationId);
          rawLoad = loads.find((l) => l.id === id) || null;
          rawAssignments = assignments.filter((a) => a.load_id === id);
        }
      }
    } else if (!isUUID(organizationId) || organizationId === DEMO_ORGANIZATION_ID) {
      const { loads, assignments } = this.ensureInitialized(organizationId);
      rawLoad = loads.find((l) => l.id === id) || null;
      rawAssignments = assignments.filter((a) => a.load_id === id);
    }

    if (!rawLoad) return null;

    const [trucks, drivers, clients, brokers, teamMembers] = await this.getDependencies(organizationId);
    const joined = this.joinRelations(rawLoad, clients, brokers, trucks, drivers, teamMembers, rawAssignments);

    // Enforce employee load access control on direct detail lookup
    const effectiveRole: string | null =
      typeof localStorage !== 'undefined' ? localStorage.getItem('dispatchdesk_current_role') : null;
    const effectiveUserId: string | null =
      typeof localStorage !== 'undefined' ? localStorage.getItem('dispatchdesk_current_user_id') : null;

    if (effectiveRole === 'dispatcher' || effectiveRole === 'staff') {
      const isAssigned =
        effectiveUserId &&
        (joined.assigned_dispatcher_id === effectiveUserId ||
          (joined.assigned_team && joined.assigned_team.some((m) => m.user_id === effectiveUserId)) ||
          (joined.assigned_team_assignments &&
            joined.assigned_team_assignments.some((a) => a.user_id === effectiveUserId)));

      if (!isAssigned) {
        // Direct load-detail access is denied for unauthorized loads
        return null;
      }
    }

    return joined;
  }

  async createLoad(
    organizationId: string,
    input: CreateLoadInput,
    actorName: string = 'Dispatcher',
    actorId: string = 'usr-dispatcher'
  ): Promise<LoadWithRelations> {
    // 1. Mandatory Validations
    if (!input.load_number || !input.load_number.trim()) {
      throw new Error('Load number is required.');
    }
    if (!input.client_id) {
      throw new Error('Client assignment is required for creating a load.');
    }
    if (!input.origin_city || !input.origin_city.trim()) {
      throw new Error('Origin city is required.');
    }
    if (!input.origin_state || !isValidUsState(input.origin_state)) {
      throw new Error('Valid two-letter origin state code is required (e.g. TX, GA).');
    }
    if (!input.dest_city || !input.dest_city.trim()) {
      throw new Error('Destination city is required.');
    }
    if (!input.dest_state || !isValidUsState(input.dest_state)) {
      throw new Error('Valid two-letter destination state code is required (e.g. TX, GA).');
    }

    // Chronological validation
    if (input.pickup_datetime && input.delivery_datetime) {
      if (new Date(input.delivery_datetime).getTime() < new Date(input.pickup_datetime).getTime()) {
        throw new Error('Delivery date and time cannot be earlier than pickup date and time.');
      }
    }

    const [trucks, drivers, clients, brokers, teamMembers] = await this.getDependencies(organizationId);

    // Enforce owner_admin authorization upfront when assigning team members on load creation
    if (Array.isArray(input.assigned_team_member_ids) && input.assigned_team_member_ids.length > 0) {
      if (!actorId || !actorId.trim()) {
        throw new Error('Unauthorized: Valid actor ID is required to assign team members on load creation.');
      }

      let actorUserId = actorId.trim();
      if (isSupabaseConfigured && (!actorUserId || !isUUID(actorUserId) || actorUserId === 'usr-dispatcher' || actorUserId === 'usr-admin')) {
        const { data: authData } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));
        if (authData?.user?.id) {
          actorUserId = authData.user.id;
        }
      }

      let actorMember = teamMembers.find(
        (m) => (actorUserId && m.user_id === actorUserId) || (actorUserId && m.id === actorUserId)
      );

      if (!actorMember && (!isSupabaseConfigured || !isUUID(organizationId))) {
        if (actorUserId === 'usr-admin' || actorUserId === 'admin-1' || actorUserId === 'usr-admin-1') {
          actorMember = teamMembers.find((m) => m.role === 'owner_admin');
        }
      }

      if (!actorMember || actorMember.role !== 'owner_admin') {
        throw new Error('Unauthorized: Only organization owner/admins can manage load team assignments.');
      }
    }

    // 2. Validate Client / Truck / Driver consistency
    const client = clients.find((c) => c.id === input.client_id);
    if (!client) {
      throw new Error('Specified Client does not exist in this organization.');
    }

    let finalTruckId = input.truck_id || null;
    let finalDriverId = input.driver_id || null;

    if (finalTruckId) {
      const truck = trucks.find((t) => t.id === finalTruckId);
      if (!truck || truck.client_id !== input.client_id) {
        throw new Error('The selected Truck does not belong to the selected Client.');
      }
    }

    if (finalDriverId) {
      const driver = drivers.find((d) => d.id === finalDriverId);
      if (!driver || driver.client_id !== input.client_id) {
        throw new Error('The selected Driver does not belong to the selected Client.');
      }
    }

    if (input.broker_id) {
      const broker = brokers.find((b) => b.id === input.broker_id && (!b.organization_id || b.organization_id === organizationId));
      if (!broker) {
        throw new Error('Specified Broker does not exist in this organization.');
      }
    }

    if (isSupabaseConfigured && isUUID(organizationId)) {
      // Check duplicate load number in same org
      const { data: existingLoad, error: checkErr } = await supabase
        .from('loads')
        .select('id')
        .eq('organization_id', organizationId)
        .ilike('load_number', input.load_number.trim())
        .maybeSingle();

      if (checkErr) {
        console.error('[LoadService] Supabase check duplicate error:', checkErr);
        throw new Error(checkErr.message || 'Database error verifying load number uniqueness.');
      }

      if (existingLoad) {
        throw new Error(`Load number "${input.load_number.trim()}" already exists in this organization.`);
      }

      // Authoritative business rule defense-in-depth: A truck must never have more than ONE load IN TRANSIT simultaneously
      if (input.pipeline_status === 'in_transit' && finalTruckId) {
        const { data: conflictingTransitLoads } = await supabase
          .from('loads')
          .select('id, load_number')
          .eq('organization_id', organizationId)
          .eq('truck_id', finalTruckId)
          .eq('pipeline_status', 'in_transit')
          .limit(1);

        if (conflictingTransitLoads && conflictingTransitLoads.length > 0) {
          const conflictingLoad = conflictingTransitLoads[0];
          const truckObj = trucks.find((t) => t.id === finalTruckId);
          const truckNumber = truckObj?.truck_number || 'assigned truck';
          throw new Error(
            `Truck "${truckNumber}" already has Load ${conflictingLoad.load_number} IN TRANSIT. The new load cannot be set to IN TRANSIT until that load is delivered.`
          );
        }
      }

      const { data, error } = await supabase
        .from('loads')
        .insert({
          organization_id: organizationId,
          load_number: input.load_number.trim().toUpperCase(),
          client_id: input.client_id,
          broker_id: input.broker_id || null,
          truck_id: finalTruckId,
          driver_id: finalDriverId,
          assigned_dispatcher_id: input.assigned_dispatcher_id || null,
          pipeline_status: input.pipeline_status || 'sourced',
          equipment_type: input.equipment_type || 'dry_van',
          commodity: input.commodity?.trim() || null,
          weight_lbs: input.weight_lbs !== undefined && input.weight_lbs !== null ? Math.max(0, Number(input.weight_lbs)) : null,
          origin_facility_name: input.origin_facility_name?.trim() || null,
          origin_address: input.origin_address?.trim() || null,
          origin_city: input.origin_city.trim(),
          origin_state: input.origin_state.trim().toUpperCase(),
          origin_zip: input.origin_zip?.trim() || null,
          origin_timezone: input.origin_timezone || getStateTimezone(input.origin_state),
          pickup_datetime: input.pickup_datetime || null,
          dest_facility_name: input.dest_facility_name?.trim() || null,
          dest_address: input.dest_address?.trim() || null,
          dest_city: input.dest_city.trim(),
          dest_state: input.dest_state.trim().toUpperCase(),
          dest_zip: input.dest_zip?.trim() || null,
          dest_timezone: input.dest_timezone || getStateTimezone(input.dest_state),
          operational_timezone: input.operational_timezone || input.origin_timezone || getStateTimezone(input.origin_state),
          delivery_datetime: input.delivery_datetime || null,
          pickup_arrival_time: input.pickup_arrival_time || null,
          pickup_loading_start_time: input.pickup_loading_start_time || null,
          pickup_loading_complete_time: input.pickup_loading_complete_time || null,
          pickup_departure_time: input.pickup_departure_time || null,
          delivery_arrival_time: input.delivery_arrival_time || null,
          delivery_unloading_start_time: input.delivery_unloading_start_time || null,
          delivery_unloading_complete_time: input.delivery_unloading_complete_time || null,
          delivery_departure_time: input.delivery_departure_time || null,
          rate: Math.max(0, Number(input.rate) || 0),
          loaded_miles: Math.max(0, Number(input.loaded_miles) || 0),
          deadhead_miles: Math.max(0, Number(input.deadhead_miles) || 0),
          fuel_expense: Math.max(0, Number(input.fuel_expense) || 0),
          driver_pay: Math.max(0, Number(input.driver_pay) || 0),
          other_expenses: Math.max(0, Number(input.other_expenses) || 0),
          special_instructions: input.special_instructions?.trim() || null,
        })
        .select()
        .single();

      if (error) {
        if (
          error.message?.includes('idx_loads_one_in_transit_per_truck') ||
          (error as any).details?.includes('idx_loads_one_in_transit_per_truck')
        ) {
          const truckObj = trucks.find((t) => t.id === finalTruckId);
          const truckNumber = truckObj?.truck_number || 'assigned truck';
          throw new Error(
            `Truck "${truckNumber}" already has a load IN TRANSIT. The new load cannot be set to IN TRANSIT until that load is delivered.`
          );
        }
        if (error.code === '23505' || error.message?.includes('duplicate key') || error.message?.includes('unique constraint')) {
          throw new Error(`Load number "${input.load_number.trim()}" already exists in this organization.`);
        }
        console.error('[LoadService] Supabase createLoad error:', error);
        throw new Error(error.message || 'Failed to create load in database.');
      }

      if (data) {
        const createdLoad = data as Load;

        // Auto-record activity events for initial creation and assignment
        activityService.recordSystemEvent(
          organizationId,
          createdLoad.id,
          `Load ${createdLoad.load_number} Created`,
          `Load initialized from ${createdLoad.origin_city}, ${createdLoad.origin_state} to ${createdLoad.dest_city}, ${createdLoad.dest_state}. Status set to ${createdLoad.pipeline_status.toUpperCase()}.`,
          {
            initialStatus: createdLoad.pipeline_status,
            commodity: createdLoad.commodity,
            rate: createdLoad.rate,
            equipmentType: createdLoad.equipment_type,
          }
        ).catch(() => {});

        if (finalTruckId || finalDriverId) {
          const trk = trucks.find((t) => t.id === finalTruckId);
          const drv = drivers.find((d) => d.id === finalDriverId);
          activityService.recordAssignmentChange(
            organizationId,
            createdLoad.id,
            {
              newTruckId: finalTruckId,
              newTruckNumber: trk?.truck_number || null,
              newDriverId: finalDriverId,
              newDriverName: drv?.full_name || null,
            }
          ).catch(() => {});
        }

        const initialMemberIds = new Set<string>();
        if (Array.isArray(input.assigned_team_member_ids)) {
          input.assigned_team_member_ids.forEach((uid) => {
            if (uid && typeof uid === 'string') initialMemberIds.add(uid);
          });
        }
        if (input.assigned_dispatcher_id && typeof input.assigned_dispatcher_id === 'string') {
          initialMemberIds.add(input.assigned_dispatcher_id);
        }

        const createdAssignments: LoadTeamAssignment[] = [];
        if (initialMemberIds.size > 0) {
          const assignRows = Array.from(initialMemberIds)
            .filter(isUUID)
            .map((uId) => ({
              organization_id: organizationId,
              load_id: createdLoad.id,
              user_id: uId,
              created_by: isUUID(actorId) ? actorId : null,
            }));

          if (assignRows.length > 0) {
            const { data: insertedAssignments, error: assignErr } = await supabase
              .from('load_team_assignments')
              .insert(assignRows)
              .select();

            if (assignErr) {
              console.error('[LoadService] Error inserting load_team_assignments on createLoad:', assignErr);
              throw new Error(`Failed to insert team assignments: ${assignErr.message}`);
            }
            if (insertedAssignments) {
              createdAssignments.push(...(insertedAssignments as LoadTeamAssignment[]));
            }
          }
        }

        return this.joinRelations(createdLoad, clients, brokers, trucks, drivers, teamMembers, createdAssignments);
      }
      throw new Error('Unexpected empty response while creating load.');
    }

    const { loads } = this.ensureInitialized(organizationId);

    // Check duplicate load number in local storage
    const exists = loads.find(
      (l) => l.load_number.trim().toLowerCase() === input.load_number.trim().toLowerCase()
    );
    if (exists) {
      throw new Error(`Load number "${input.load_number.trim()}" already exists in this organization.`);
    }

    // Authoritative business rule: A truck must never have more than ONE load IN TRANSIT simultaneously
    if (input.pipeline_status === 'in_transit' && finalTruckId) {
      const activeTransitLoad = loads.find(
        (l) => l.truck_id === finalTruckId && l.pipeline_status === 'in_transit'
      );
      if (activeTransitLoad) {
        const truck = trucks.find((t) => t.id === finalTruckId);
        const truckNumber = truck?.truck_number || 'assigned truck';
        throw new Error(
          `Truck "${truckNumber}" already has Load ${activeTransitLoad.load_number} IN TRANSIT. The new load cannot be set to IN TRANSIT until that load is delivered.`
        );
      }
    }

    const now = new Date().toISOString();
    const newLoad: Load = {
      id: `load-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      organization_id: organizationId,
      load_number: input.load_number.trim().toUpperCase(),
      client_id: input.client_id,
      broker_id: input.broker_id || null,
      truck_id: finalTruckId,
      driver_id: finalDriverId,
      assigned_dispatcher_id: input.assigned_dispatcher_id || null,
      pipeline_status: input.pipeline_status || 'sourced',
      equipment_type: input.equipment_type || 'dry_van',
      commodity: input.commodity?.trim() || null,
      weight_lbs: input.weight_lbs !== undefined && input.weight_lbs !== null ? Math.max(0, Number(input.weight_lbs)) : null,
      origin_facility_name: input.origin_facility_name?.trim() || null,
      origin_address: input.origin_address?.trim() || null,
      origin_city: input.origin_city.trim(),
      origin_state: input.origin_state.trim().toUpperCase(),
      origin_zip: input.origin_zip?.trim() || null,
      origin_timezone: input.origin_timezone || getStateTimezone(input.origin_state),
      pickup_datetime: input.pickup_datetime || null,
      dest_facility_name: input.dest_facility_name?.trim() || null,
      dest_address: input.dest_address?.trim() || null,
      dest_city: input.dest_city.trim(),
      dest_state: input.dest_state.trim().toUpperCase(),
      dest_zip: input.dest_zip?.trim() || null,
      dest_timezone: input.dest_timezone || getStateTimezone(input.dest_state),
      operational_timezone: input.operational_timezone || input.origin_timezone || getStateTimezone(input.origin_state),
      delivery_datetime: input.delivery_datetime || null,
      pickup_arrival_time: input.pickup_arrival_time || null,
      pickup_loading_start_time: input.pickup_loading_start_time || null,
      pickup_loading_complete_time: input.pickup_loading_complete_time || null,
      pickup_departure_time: input.pickup_departure_time || null,
      delivery_arrival_time: input.delivery_arrival_time || null,
      delivery_unloading_start_time: input.delivery_unloading_start_time || null,
      delivery_unloading_complete_time: input.delivery_unloading_complete_time || null,
      delivery_departure_time: input.delivery_departure_time || null,
      rate: Math.max(0, Number(input.rate) || 0),
      loaded_miles: Math.max(0, Number(input.loaded_miles) || 0),
      deadhead_miles: Math.max(0, Number(input.deadhead_miles) || 0),
      fuel_expense: Math.max(0, Number(input.fuel_expense) || 0),
      driver_pay: Math.max(0, Number(input.driver_pay) || 0),
      other_expenses: Math.max(0, Number(input.other_expenses) || 0),
      special_instructions: input.special_instructions?.trim() || null,
      created_at: now,
      updated_at: now,
    };

    loads.unshift(newLoad);
    const loadsKey = `${LOADS_STORAGE_PREFIX}${organizationId}`;
    saveToStorage(loadsKey, loads);

    // Sync load_team_assignments in local storage
    const initialMemberIds = new Set<string>();
    if (Array.isArray(input.assigned_team_member_ids)) {
      input.assigned_team_member_ids.forEach((uid) => {
        if (uid && typeof uid === 'string') initialMemberIds.add(uid);
      });
    }
    if (newLoad.assigned_dispatcher_id) {
      initialMemberIds.add(newLoad.assigned_dispatcher_id);
    }

    const assignmentsKey = `${LOAD_TEAM_ASSIGNMENTS_STORAGE_PREFIX}${organizationId}`;
    const assignments = loadFromStorage<LoadTeamAssignment[]>(assignmentsKey, []);
    initialMemberIds.forEach((uId) => {
      if (!assignments.some((a) => a.load_id === newLoad.id && a.user_id === uId)) {
        assignments.push({
          id: `assign-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
          organization_id: organizationId,
          load_id: newLoad.id,
          user_id: uId,
          created_at: now,
        });
      }
    });
    saveToStorage(assignmentsKey, assignments);

    // Auto-record activity events for initial creation and assignment
    activityService.recordSystemEvent(
      organizationId,
      newLoad.id,
      `Load ${newLoad.load_number} Created`,
      `Load initialized from ${newLoad.origin_city}, ${newLoad.origin_state} to ${newLoad.dest_city}, ${newLoad.dest_state}. Status set to ${newLoad.pipeline_status.toUpperCase()}.`,
      {
        initialStatus: newLoad.pipeline_status,
        commodity: newLoad.commodity,
        rate: newLoad.rate,
        equipmentType: newLoad.equipment_type,
      }
    ).catch(() => {});

    if (finalTruckId || finalDriverId) {
      const trk = trucks.find((t) => t.id === finalTruckId);
      const drv = drivers.find((d) => d.id === finalDriverId);
      activityService.recordAssignmentChange(
        organizationId,
        newLoad.id,
        {
          newTruckId: finalTruckId,
          newTruckNumber: trk?.truck_number || null,
          newDriverId: finalDriverId,
          newDriverName: drv?.full_name || null,
        }
      ).catch(() => {});
    }

    return this.joinRelations(
      newLoad,
      clients,
      brokers,
      trucks,
      drivers,
      teamMembers,
      assignments.filter((a) => a.load_id === newLoad.id)
    );
  }

  async updateLoad(
    organizationId: string,
    id: string,
    input: UpdateLoadInput,
    actorName: string = 'Dispatcher',
    actorId: string = 'usr-dispatcher'
  ): Promise<LoadWithRelations> {
    const [trucks, drivers, clients, brokers, teamMembers] = await this.getDependencies(organizationId);

    // Pickup & Delivery validations
    if (input.origin_state !== undefined && !isValidUsState(input.origin_state)) {
      throw new Error('Valid two-letter origin state code is required (e.g. TX, GA).');
    }
    if (input.dest_state !== undefined && !isValidUsState(input.dest_state)) {
      throw new Error('Valid two-letter destination state code is required (e.g. TX, GA).');
    }

    if (input.broker_id) {
      const broker = brokers.find((b) => b.id === input.broker_id && (!b.organization_id || b.organization_id === organizationId));
      if (!broker) {
        throw new Error('Specified Broker does not exist in this organization.');
      }
    }

    if (isSupabaseConfigured && isUUID(organizationId)) {
      const { data: currentLoadData, error: fetchErr } = await supabase
        .from('loads')
        .select('*')
        .eq('id', id)
        .eq('organization_id', organizationId)
        .maybeSingle();

      if (fetchErr) {
        console.error('[LoadService] Supabase fetch current load error:', fetchErr);
        throw new Error(fetchErr.message || 'Database error fetching load.');
      }
      if (!currentLoadData) {
        throw new Error(`Load with ID "${id}" was not found.`);
      }

      const currentLoad = currentLoadData as Load;

      // State Transition Validation
      if (input.pipeline_status && input.pipeline_status !== currentLoad.pipeline_status) {
        const transitionCheck = validateStatusTransition(currentLoad.pipeline_status, input.pipeline_status);
        if (!transitionCheck.allowed) {
          throw new Error(transitionCheck.reason || `Invalid load status transition from "${currentLoad.pipeline_status}" to "${input.pipeline_status}".`);
        }
      }

      // Check duplicate load number if changed
      if (input.load_number && input.load_number.trim().toUpperCase() !== currentLoad.load_number) {
        const { data: duplicate, error: dupErr } = await supabase
          .from('loads')
          .select('id')
          .eq('organization_id', organizationId)
          .ilike('load_number', input.load_number.trim())
          .neq('id', id)
          .maybeSingle();

        if (dupErr) {
          console.error('[LoadService] Supabase check duplicate error:', dupErr);
          throw new Error(dupErr.message || 'Database error verifying load number uniqueness.');
        }

        if (duplicate) {
          throw new Error(`Load number "${input.load_number.trim()}" is already in use by another load.`);
        }
      }

      const targetClientId = input.client_id !== undefined ? input.client_id : currentLoad.client_id;
      if (!targetClientId) {
        throw new Error('Client assignment cannot be empty.');
      }

      const rawTruckId = input.truck_id !== undefined ? (input.truck_id ? input.truck_id : null) : currentLoad.truck_id;
      const rawDriverId = input.driver_id !== undefined ? (input.driver_id ? input.driver_id : null) : currentLoad.driver_id;

      const isTruckChanged = input.truck_id !== undefined && (input.truck_id || null) !== (currentLoad.truck_id || null);
      const isDriverChanged = input.driver_id !== undefined && (input.driver_id || null) !== (currentLoad.driver_id || null);
      const hasAssignmentChange = isTruckChanged || isDriverChanged;

      // Authoritative business rule defense-in-depth: A truck must never have more than ONE load IN TRANSIT simultaneously
      const targetStatus = input.pipeline_status !== undefined ? input.pipeline_status : currentLoad.pipeline_status;
      if (targetStatus === 'in_transit' && rawTruckId) {
        const { data: conflictingTransitLoads, error: conflictErr } = await supabase
          .from('loads')
          .select('id, load_number')
          .eq('organization_id', organizationId)
          .eq('truck_id', rawTruckId)
          .eq('pipeline_status', 'in_transit')
          .neq('id', id)
          .limit(1);

        if (!conflictErr && conflictingTransitLoads && conflictingTransitLoads.length > 0) {
          const conflictingLoad = conflictingTransitLoads[0];
          const truckObj = trucks.find((t) => t.id === rawTruckId);
          const truckNumber = truckObj?.truck_number || 'assigned truck';
          throw new Error(
            `Truck "${truckNumber}" already has Load ${conflictingLoad.load_number} IN TRANSIT. The current load cannot be moved to IN TRANSIT until that load is delivered.`
          );
        }
      }

      const pickupDt = input.pickup_datetime !== undefined ? input.pickup_datetime : currentLoad.pickup_datetime;
      const deliveryDt = input.delivery_datetime !== undefined ? input.delivery_datetime : currentLoad.delivery_datetime;
      if (pickupDt && deliveryDt && new Date(deliveryDt).getTime() < new Date(pickupDt).getTime()) {
        throw new Error('Delivery date and time cannot be earlier than pickup date and time.');
      }

      // Team assignment lifecycle and RBAC validation
      const isTeamAssignmentChanging =
        (input.assigned_dispatcher_id !== undefined && (input.assigned_dispatcher_id || null) !== (currentLoad.assigned_dispatcher_id || null)) ||
        (input.assigned_team_member_ids !== undefined && input.assigned_team_member_ids.length > 0);

      if (isTeamAssignmentChanging) {
        if (currentLoad.pipeline_status === 'invoiced' || currentLoad.pipeline_status === 'paid') {
          throw new Error(`Integrity Error: Cannot modify team assignments on an ${currentLoad.pipeline_status.toUpperCase()} load (ID: ${currentLoad.id}, Load Number: ${currentLoad.load_number}). Load must be reopened first.`);
        }
        const actorMember = teamMembers.find((m) => (actorId && m.user_id === actorId) || (actorId && m.id === actorId));
        if (actorMember && actorMember.role !== 'owner_admin') {
          throw new Error('Unauthorized: Only organization owner/admins can manage load team assignments.');
        }
      }

      // If assignment has changed, route through authoritative assignDispatchResources / assign_load_dispatch RPC
      if (hasAssignmentChange) {
        await this.assignDispatchResources(
          organizationId,
          id,
          rawTruckId,
          rawDriverId,
          input.special_instructions || undefined
        );
      }

      // Check if any non-assignment fields were updated
      const nonAssignmentFieldsPresent = (
        input.load_number !== undefined ||
        input.client_id !== undefined ||
        input.broker_id !== undefined ||
        input.assigned_dispatcher_id !== undefined ||
        input.pipeline_status !== undefined ||
        input.equipment_type !== undefined ||
        input.commodity !== undefined ||
        input.weight_lbs !== undefined ||
        input.origin_facility_name !== undefined ||
        input.origin_address !== undefined ||
        input.origin_city !== undefined ||
        input.origin_state !== undefined ||
        input.origin_zip !== undefined ||
        input.origin_timezone !== undefined ||
        input.pickup_datetime !== undefined ||
        input.dest_facility_name !== undefined ||
        input.dest_address !== undefined ||
        input.dest_city !== undefined ||
        input.dest_state !== undefined ||
        input.dest_zip !== undefined ||
        input.dest_timezone !== undefined ||
        input.operational_timezone !== undefined ||
        input.delivery_datetime !== undefined ||
        input.pickup_arrival_time !== undefined ||
        input.pickup_loading_start_time !== undefined ||
        input.pickup_loading_complete_time !== undefined ||
        input.pickup_departure_time !== undefined ||
        input.delivery_arrival_time !== undefined ||
        input.delivery_unloading_start_time !== undefined ||
        input.delivery_unloading_complete_time !== undefined ||
        input.delivery_departure_time !== undefined ||
        input.rate !== undefined ||
        input.loaded_miles !== undefined ||
        input.deadhead_miles !== undefined ||
        input.fuel_expense !== undefined ||
        input.driver_pay !== undefined ||
        input.other_expenses !== undefined ||
        input.special_instructions !== undefined
      );

      if (nonAssignmentFieldsPresent || !hasAssignmentChange) {
        const { data, error } = await supabase
          .from('loads')
          .update({
            ...(input.load_number !== undefined ? { load_number: input.load_number.trim().toUpperCase() } : {}),
            ...(input.client_id !== undefined ? { client_id: targetClientId } : {}),
            ...(input.broker_id !== undefined ? { broker_id: input.broker_id || null } : {}),
            ...(!hasAssignmentChange && input.truck_id !== undefined ? { truck_id: rawTruckId } : {}),
            ...(!hasAssignmentChange && input.driver_id !== undefined ? { driver_id: rawDriverId } : {}),
            ...(input.assigned_dispatcher_id !== undefined ? { assigned_dispatcher_id: input.assigned_dispatcher_id || null } : {}),
            ...(input.pipeline_status !== undefined ? { pipeline_status: input.pipeline_status } : {}),
            ...(input.equipment_type !== undefined ? { equipment_type: input.equipment_type } : {}),
            ...(input.commodity !== undefined ? { commodity: input.commodity?.trim() || null } : {}),
            ...(input.weight_lbs !== undefined ? { weight_lbs: input.weight_lbs !== null ? Math.max(0, Number(input.weight_lbs)) : null } : {}),
            ...(input.origin_facility_name !== undefined ? { origin_facility_name: input.origin_facility_name?.trim() || null } : {}),
            ...(input.origin_address !== undefined ? { origin_address: input.origin_address?.trim() || null } : {}),
            ...(input.origin_city !== undefined ? { origin_city: input.origin_city.trim() } : {}),
            ...(input.origin_state !== undefined ? { origin_state: input.origin_state.trim().toUpperCase() } : {}),
            ...(input.origin_zip !== undefined ? { origin_zip: input.origin_zip?.trim() || null } : {}),
            ...(input.origin_timezone !== undefined ? { origin_timezone: input.origin_timezone } : {}),
            ...(input.pickup_datetime !== undefined ? { pickup_datetime: pickupDt } : {}),
            ...(input.dest_facility_name !== undefined ? { dest_facility_name: input.dest_facility_name?.trim() || null } : {}),
            ...(input.dest_address !== undefined ? { dest_address: input.dest_address?.trim() || null } : {}),
            ...(input.dest_city !== undefined ? { dest_city: input.dest_city.trim() } : {}),
            ...(input.dest_state !== undefined ? { dest_state: input.dest_state.trim().toUpperCase() } : {}),
            ...(input.dest_zip !== undefined ? { dest_zip: input.dest_zip?.trim() || null } : {}),
            ...(input.dest_timezone !== undefined ? { dest_timezone: input.dest_timezone } : {}),
            ...(input.operational_timezone !== undefined ? { operational_timezone: input.operational_timezone } : {}),
            ...(input.delivery_datetime !== undefined ? { delivery_datetime: deliveryDt } : {}),
            ...(input.pickup_arrival_time !== undefined ? { pickup_arrival_time: input.pickup_arrival_time } : {}),
            ...(input.pickup_loading_start_time !== undefined ? { pickup_loading_start_time: input.pickup_loading_start_time } : {}),
            ...(input.pickup_loading_complete_time !== undefined ? { pickup_loading_complete_time: input.pickup_loading_complete_time } : {}),
            ...(input.pickup_departure_time !== undefined ? { pickup_departure_time: input.pickup_departure_time } : {}),
            ...(input.delivery_arrival_time !== undefined ? { delivery_arrival_time: input.delivery_arrival_time } : {}),
            ...(input.delivery_unloading_start_time !== undefined ? { delivery_unloading_start_time: input.delivery_unloading_start_time } : {}),
            ...(input.delivery_unloading_complete_time !== undefined ? { delivery_unloading_complete_time: input.delivery_unloading_complete_time } : {}),
            ...(input.delivery_departure_time !== undefined ? { delivery_departure_time: input.delivery_departure_time } : {}),
            ...(input.rate !== undefined ? { rate: Math.max(0, Number(input.rate) || 0) } : {}),
            ...(input.loaded_miles !== undefined ? { loaded_miles: Math.max(0, Number(input.loaded_miles) || 0) } : {}),
            ...(input.deadhead_miles !== undefined ? { deadhead_miles: Math.max(0, Number(input.deadhead_miles) || 0) } : {}),
            ...(input.fuel_expense !== undefined ? { fuel_expense: Math.max(0, Number(input.fuel_expense) || 0) } : {}),
            ...(input.driver_pay !== undefined ? { driver_pay: Math.max(0, Number(input.driver_pay) || 0) } : {}),
            ...(input.other_expenses !== undefined ? { other_expenses: Math.max(0, Number(input.other_expenses) || 0) } : {}),
            ...(input.special_instructions !== undefined ? { special_instructions: input.special_instructions?.trim() || null } : {}),
            updated_at: new Date().toISOString(),
          })
          .eq('id', id)
          .eq('organization_id', organizationId)
          .select()
          .single();

        if (error) {
          if (
            error.message?.includes('idx_loads_one_in_transit_per_truck') ||
            (error as any).details?.includes('idx_loads_one_in_transit_per_truck')
          ) {
            const truckObj = trucks.find((t) => t.id === rawTruckId);
            const truckNumber = truckObj?.truck_number || 'assigned truck';
            throw new Error(
              `Truck "${truckNumber}" already has a load IN TRANSIT. The current load cannot be moved to IN TRANSIT until that load is delivered.`
            );
          }
          if (error.code === '23505' || error.message?.includes('duplicate key') || error.message?.includes('unique constraint')) {
            throw new Error(`Load number "${input.load_number?.trim() || ''}" is already in use by another load.`);
          }
          console.error('[LoadService] Supabase updateLoad error:', error);
          throw new Error(error.message || 'Failed to update load in database.');
        }

        if (data) {
          const updatedLoad = data as Load;

          // Auto-record status shift
          if (input.pipeline_status && input.pipeline_status !== currentLoad.pipeline_status) {
            activityService.recordStatusChange(
              organizationId,
              id,
              currentLoad.pipeline_status,
              input.pipeline_status
            ).catch(() => {});
          }

          // Auto-record dispatcher assignment change
          if (
            input.assigned_dispatcher_id !== undefined &&
            (input.assigned_dispatcher_id || null) !== (currentLoad.assigned_dispatcher_id || null)
          ) {
            const prevMember = currentLoad.assigned_dispatcher_id
              ? teamMembers.find((m) => m.user_id === currentLoad.assigned_dispatcher_id || m.id === currentLoad.assigned_dispatcher_id)
              : null;
            const nextMember = input.assigned_dispatcher_id
              ? teamMembers.find((m) => m.user_id === input.assigned_dispatcher_id || m.id === input.assigned_dispatcher_id)
              : null;

            activityService
              .recordDispatcherAssignmentChange(
                organizationId,
                id,
                currentLoad.assigned_dispatcher_id || null,
                input.assigned_dispatcher_id || null,
                prevMember?.full_name || null,
                nextMember?.full_name || null,
                actorName,
                actorId
              )
              .catch(() => {});
          }

          // Sync load_team_assignments in Supabase additively (never delete all assignments)
          if (input.assigned_team_member_ids && input.assigned_team_member_ids.length > 0) {
            const memberRows = input.assigned_team_member_ids
              .filter(isUUID)
              .map((uId) => ({
                organization_id: organizationId,
                load_id: id,
                user_id: uId,
                created_by: isUUID(actorId) ? actorId : null,
              }));

            for (const row of memberRows) {
              await supabase
                .from('load_team_assignments')
                .upsert(row, { onConflict: 'load_id,user_id' });
            }
          }

          if (input.assigned_dispatcher_id !== undefined) {
            const newDispatcher = input.assigned_dispatcher_id && isUUID(input.assigned_dispatcher_id)
              ? input.assigned_dispatcher_id
              : null;
            const oldDispatcher = currentLoad.assigned_dispatcher_id && isUUID(currentLoad.assigned_dispatcher_id)
              ? currentLoad.assigned_dispatcher_id
              : null;

            if (newDispatcher) {
              await supabase
                .from('load_team_assignments')
                .upsert(
                  {
                    organization_id: organizationId,
                    load_id: id,
                    user_id: newDispatcher,
                    created_by: isUUID(actorId) ? actorId : null,
                  },
                  { onConflict: 'load_id,user_id' }
                );
            } else if (input.assigned_dispatcher_id === null && oldDispatcher) {
              // Legacy primary dispatcher unassigned: remove only that specific member, keeping all other assignments
              await supabase
                .from('load_team_assignments')
                .delete()
                .eq('load_id', id)
                .eq('organization_id', organizationId)
                .eq('user_id', oldDispatcher);
            }
          }

          // Fetch current assignments for this load to populate joinRelations accurately
          const { data: currentAssignments } = await supabase
            .from('load_team_assignments')
            .select('*')
            .eq('load_id', id)
            .eq('organization_id', organizationId);

          return this.joinRelations(
            updatedLoad,
            clients,
            brokers,
            trucks,
            drivers,
            teamMembers,
            (currentAssignments as LoadTeamAssignment[]) || []
          );
        }
        throw new Error('Unexpected empty response while updating load.');
      }

      // If only assignment changed and was processed via assignDispatchResources RPC
      const latestLoad = await this.getLoadById(organizationId, id);
      if (!latestLoad) {
        throw new Error('Load not found after dispatch assignment.');
      }
      return latestLoad;
    }

    const { loads } = this.ensureInitialized(organizationId);

    const index = loads.findIndex((l) => l.id === id);
    if (index === -1) {
      throw new Error(`Load with ID "${id}" was not found.`);
    }

    const currentLoad = loads[index];

    // State Transition Validation
    if (input.pipeline_status && input.pipeline_status !== currentLoad.pipeline_status) {
      const transitionCheck = validateStatusTransition(currentLoad.pipeline_status, input.pipeline_status);
      if (!transitionCheck.allowed) {
        throw new Error(transitionCheck.reason || `Invalid load status transition from "${currentLoad.pipeline_status}" to "${input.pipeline_status}".`);
      }
    }

    // Check duplicate load number if changed
    if (input.load_number && input.load_number.trim().toUpperCase() !== currentLoad.load_number) {
      const duplicate = loads.find(
        (l) => l.id !== id && l.load_number.trim().toLowerCase() === input.load_number!.trim().toLowerCase()
      );
      if (duplicate) {
        throw new Error(`Load number "${input.load_number.trim()}" is already in use by another load.`);
      }
    }

    // Determine target client_id
    const targetClientId = input.client_id !== undefined ? input.client_id : currentLoad.client_id;
    if (!targetClientId) {
      throw new Error('Client assignment cannot be empty.');
    }

    const targetTruckId = input.truck_id !== undefined ? (input.truck_id || null) : currentLoad.truck_id;
    const targetDriverId = input.driver_id !== undefined ? (input.driver_id || null) : currentLoad.driver_id;

    const isTruckChanged = input.truck_id !== undefined && (input.truck_id || null) !== (currentLoad.truck_id || null);
    const isDriverChanged = input.driver_id !== undefined && (input.driver_id || null) !== (currentLoad.driver_id || null);
    const hasAssignmentChange = isTruckChanged || isDriverChanged;

    const targetStatus = input.pipeline_status !== undefined ? input.pipeline_status : currentLoad.pipeline_status;

    // Authoritative business rule: A truck must never have more than ONE load IN TRANSIT simultaneously
    if (targetStatus === 'in_transit' && targetTruckId) {
      const activeTransitLoad = loads.find(
        (l) => l.id !== id && l.truck_id === targetTruckId && l.pipeline_status === 'in_transit'
      );
      if (activeTransitLoad) {
        const truck = trucks.find((t) => t.id === targetTruckId);
        const truckNumber = truck?.truck_number || 'assigned truck';
        throw new Error(
          `Truck "${truckNumber}" already has Load ${activeTransitLoad.load_number} IN TRANSIT. The current load cannot be moved to IN TRANSIT until that load is delivered.`
        );
      }
    }

    // S6.4 integrity enforcement in demo mode
    if (hasAssignmentChange) {
      if (['invoiced', 'paid'].includes(currentLoad.pipeline_status)) {
        throw new Error(`Integrity Error: Cannot modify dispatch assignment on an ${currentLoad.pipeline_status.toUpperCase()} load. Load must be reopened first.`);
      }

      if (targetTruckId) {
        const truck = trucks.find((t) => t.id === targetTruckId);
        if (!truck) {
          throw new Error('Specified Truck does not exist in this organization.');
        }
        if (truck.client_id !== targetClientId) {
          throw new Error('The selected Truck does not belong to the load’s assigned Client.');
        }
        if (['booked', 'in_transit'].includes(targetStatus) && ['maintenance', 'inactive'].includes(truck.status)) {
          throw new Error(`Integrity Error: Truck "${truck.truck_number}" cannot be assigned to an active load because its status is "${truck.status}".`);
        }
      }

      if (targetDriverId) {
        const driver = drivers.find((d) => d.id === targetDriverId);
        if (!driver) {
          throw new Error('Specified Driver does not exist in this organization.');
        }
        if (driver.client_id !== targetClientId) {
          throw new Error('The selected Driver does not belong to the load’s assigned Client.');
        }
        if (['booked', 'in_transit'].includes(targetStatus) && driver.status === 'off_duty') {
          throw new Error(`Integrity Error: Driver "${driver.full_name}" cannot be assigned to an active load because status is "off_duty".`);
        }
      }

      // Check temporal overlaps in demo mode
      const pDt = input.pickup_datetime !== undefined ? input.pickup_datetime : currentLoad.pickup_datetime;
      const dDt = input.delivery_datetime !== undefined ? input.delivery_datetime : currentLoad.delivery_datetime;
      if (['booked', 'in_transit'].includes(targetStatus) && pDt && dDt) {
        const pTime = new Date(pDt).getTime();
        const dTime = new Date(dDt).getTime();

        for (const other of loads) {
          if (other.id !== id && ['booked', 'in_transit'].includes(other.pipeline_status) && other.pickup_datetime && other.delivery_datetime) {
            const otherP = new Date(other.pickup_datetime).getTime();
            const otherD = new Date(other.delivery_datetime).getTime();
            const overlaps = (pTime < otherD && dTime > otherP);

            if (overlaps) {
              if (targetTruckId && other.truck_id === targetTruckId) {
                throw new Error(`Conflict Error: Truck is already assigned to active Load ${other.load_number} which overlaps with this schedule.`);
              }
              if (targetDriverId && other.driver_id === targetDriverId) {
                throw new Error(`Conflict Error: Driver is already assigned to active Load ${other.load_number} which overlaps with this schedule.`);
              }
            }
          }
        }
      }
    }

    const originState = input.origin_state !== undefined ? input.origin_state.trim().toUpperCase() : currentLoad.origin_state;
    const destState = input.dest_state !== undefined ? input.dest_state.trim().toUpperCase() : currentLoad.dest_state;

    const pickupDt = input.pickup_datetime !== undefined ? input.pickup_datetime : currentLoad.pickup_datetime;
    const deliveryDt = input.delivery_datetime !== undefined ? input.delivery_datetime : currentLoad.delivery_datetime;
    if (pickupDt && deliveryDt && new Date(deliveryDt).getTime() < new Date(pickupDt).getTime()) {
      throw new Error('Delivery date and time cannot be earlier than pickup date and time.');
    }

    // Team assignment lifecycle and RBAC validation in demo mode
    const isTeamAssignmentChanging =
      (input.assigned_dispatcher_id !== undefined && (input.assigned_dispatcher_id || null) !== (currentLoad.assigned_dispatcher_id || null)) ||
      (input.assigned_team_member_ids !== undefined && input.assigned_team_member_ids.length > 0);

    if (isTeamAssignmentChanging) {
      if (currentLoad.pipeline_status === 'invoiced' || currentLoad.pipeline_status === 'paid') {
        throw new Error(`Integrity Error: Cannot modify team assignments on an ${currentLoad.pipeline_status.toUpperCase()} load (ID: ${currentLoad.id}, Load Number: ${currentLoad.load_number}). Load must be reopened first.`);
      }
      const actorMember = teamMembers.find((m) => (actorId && m.user_id === actorId) || (actorId && m.id === actorId));
      if (actorMember && actorMember.role !== 'owner_admin') {
        throw new Error('Unauthorized: Only organization owner/admins can manage load team assignments.');
      }
    }

    const updatedLoad: Load = {
      ...currentLoad,
      load_number: input.load_number !== undefined ? input.load_number.trim().toUpperCase() : currentLoad.load_number,
      client_id: targetClientId,
      broker_id: input.broker_id !== undefined ? input.broker_id : currentLoad.broker_id,
      truck_id: targetTruckId,
      driver_id: targetDriverId,
      assigned_dispatcher_id: input.assigned_dispatcher_id !== undefined ? input.assigned_dispatcher_id : currentLoad.assigned_dispatcher_id,
      pipeline_status: input.pipeline_status !== undefined ? input.pipeline_status : currentLoad.pipeline_status,
      equipment_type: input.equipment_type !== undefined ? input.equipment_type : currentLoad.equipment_type,
      commodity: input.commodity !== undefined ? (input.commodity?.trim() || null) : currentLoad.commodity,
      weight_lbs: input.weight_lbs !== undefined ? (input.weight_lbs !== null ? Math.max(0, Number(input.weight_lbs)) : null) : currentLoad.weight_lbs,
      origin_facility_name: input.origin_facility_name !== undefined ? (input.origin_facility_name?.trim() || null) : (currentLoad.origin_facility_name || null),
      origin_address: input.origin_address !== undefined ? (input.origin_address?.trim() || null) : (currentLoad.origin_address || null),
      origin_city: input.origin_city !== undefined ? input.origin_city.trim() : currentLoad.origin_city,
      origin_state: originState,
      origin_zip: input.origin_zip !== undefined ? (input.origin_zip?.trim() || null) : currentLoad.origin_zip,
      origin_timezone: input.origin_timezone !== undefined ? input.origin_timezone : (currentLoad.origin_timezone || getStateTimezone(originState)),
      pickup_datetime: pickupDt,
      dest_facility_name: input.dest_facility_name !== undefined ? (input.dest_facility_name?.trim() || null) : (currentLoad.dest_facility_name || null),
      dest_address: input.dest_address !== undefined ? (input.dest_address?.trim() || null) : (currentLoad.dest_address || null),
      dest_city: input.dest_city !== undefined ? input.dest_city.trim() : currentLoad.dest_city,
      dest_state: destState,
      dest_zip: input.dest_zip !== undefined ? (input.dest_zip?.trim() || null) : currentLoad.dest_zip,
      dest_timezone: input.dest_timezone !== undefined ? input.dest_timezone : (currentLoad.dest_timezone || getStateTimezone(destState)),
      operational_timezone: input.operational_timezone !== undefined ? input.operational_timezone : (currentLoad.operational_timezone || currentLoad.origin_timezone || DEFAULT_OPERATIONAL_TIMEZONE),
      delivery_datetime: deliveryDt,
      pickup_arrival_time: input.pickup_arrival_time !== undefined ? input.pickup_arrival_time : currentLoad.pickup_arrival_time,
      pickup_loading_start_time: input.pickup_loading_start_time !== undefined ? input.pickup_loading_start_time : currentLoad.pickup_loading_start_time,
      pickup_loading_complete_time: input.pickup_loading_complete_time !== undefined ? input.pickup_loading_complete_time : currentLoad.pickup_loading_complete_time,
      pickup_departure_time: input.pickup_departure_time !== undefined ? input.pickup_departure_time : currentLoad.pickup_departure_time,
      delivery_arrival_time: input.delivery_arrival_time !== undefined ? input.delivery_arrival_time : currentLoad.delivery_arrival_time,
      delivery_unloading_start_time: input.delivery_unloading_start_time !== undefined ? input.delivery_unloading_start_time : currentLoad.delivery_unloading_start_time,
      delivery_unloading_complete_time: input.delivery_unloading_complete_time !== undefined ? input.delivery_unloading_complete_time : currentLoad.delivery_unloading_complete_time,
      delivery_departure_time: input.delivery_departure_time !== undefined ? input.delivery_departure_time : currentLoad.delivery_departure_time,
      rate: input.rate !== undefined ? Math.max(0, Number(input.rate) || 0) : currentLoad.rate,
      loaded_miles: input.loaded_miles !== undefined ? Math.max(0, Number(input.loaded_miles) || 0) : currentLoad.loaded_miles,
      deadhead_miles: input.deadhead_miles !== undefined ? Math.max(0, Number(input.deadhead_miles) || 0) : currentLoad.deadhead_miles,
      fuel_expense: input.fuel_expense !== undefined ? Math.max(0, Number(input.fuel_expense) || 0) : currentLoad.fuel_expense,
      driver_pay: input.driver_pay !== undefined ? Math.max(0, Number(input.driver_pay) || 0) : currentLoad.driver_pay,
      other_expenses: input.other_expenses !== undefined ? Math.max(0, Number(input.other_expenses) || 0) : currentLoad.other_expenses,
      special_instructions: input.special_instructions !== undefined ? (input.special_instructions?.trim() || null) : currentLoad.special_instructions,
      updated_at: new Date().toISOString(),
    };

    loads[index] = updatedLoad;
    const loadsKey = `${LOADS_STORAGE_PREFIX}${organizationId}`;
    saveToStorage(loadsKey, loads);

    // Sync load_team_assignments in local storage additively (never delete all assignments)
    const assignmentsKey = `${LOAD_TEAM_ASSIGNMENTS_STORAGE_PREFIX}${organizationId}`;
    let assignments = loadFromStorage<LoadTeamAssignment[]>(assignmentsKey, []);

    if (input.assigned_team_member_ids && input.assigned_team_member_ids.length > 0) {
      input.assigned_team_member_ids.forEach((uId) => {
        if (uId && !assignments.some((a) => a.load_id === id && a.user_id === uId)) {
          assignments.push({
            id: `assign-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
            organization_id: organizationId,
            load_id: id,
            user_id: uId,
            created_at: new Date().toISOString(),
          });
        }
      });
    }

    if (input.assigned_dispatcher_id !== undefined) {
      const newDispatcher = input.assigned_dispatcher_id || null;
      const oldDispatcher = currentLoad.assigned_dispatcher_id || null;

      if (newDispatcher) {
        if (!assignments.some((a) => a.load_id === id && a.user_id === newDispatcher)) {
          assignments.push({
            id: `assign-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
            organization_id: organizationId,
            load_id: id,
            user_id: newDispatcher,
            created_at: new Date().toISOString(),
          });
        }
      } else if (input.assigned_dispatcher_id === null && oldDispatcher) {
        // Only remove the unassigned dispatcher, preserving all other team assignments
        assignments = assignments.filter((a) => !(a.load_id === id && a.user_id === oldDispatcher));
      }
    }
    saveToStorage(assignmentsKey, assignments);

    // Auto-record status shift
    if (input.pipeline_status && input.pipeline_status !== currentLoad.pipeline_status) {
      await activityService.recordStatusChange(
        organizationId,
        id,
        currentLoad.pipeline_status,
        input.pipeline_status
      ).catch(() => {});
    }

    // Auto-record assignment change
    if (
      (targetTruckId !== currentLoad.truck_id) ||
      (targetDriverId !== currentLoad.driver_id)
    ) {
      const prevTruck = trucks.find((t) => t.id === currentLoad.truck_id);
      const nextTruck = trucks.find((t) => t.id === targetTruckId);
      const prevDriver = drivers.find((d) => d.id === currentLoad.driver_id);
      const nextDriver = drivers.find((d) => d.id === targetDriverId);

      await activityService.recordAssignmentChange(
        organizationId,
        id,
        {
          previousTruckId: currentLoad.truck_id,
          newTruckId: targetTruckId,
          previousTruckNumber: prevTruck?.truck_number || null,
          newTruckNumber: nextTruck?.truck_number || null,
          previousDriverId: currentLoad.driver_id,
          newDriverId: targetDriverId,
          previousDriverName: prevDriver?.full_name || null,
          newDriverName: nextDriver?.full_name || null,
        }
      ).catch(() => {});
    }

    // Auto-record dispatcher assignment change in demo mode
    if (
      input.assigned_dispatcher_id !== undefined &&
      (input.assigned_dispatcher_id || null) !== (currentLoad.assigned_dispatcher_id || null)
    ) {
      const prevMember = currentLoad.assigned_dispatcher_id
        ? teamMembers.find((m) => m.user_id === currentLoad.assigned_dispatcher_id || m.id === currentLoad.assigned_dispatcher_id)
        : null;
      const nextMember = input.assigned_dispatcher_id
        ? teamMembers.find((m) => m.user_id === input.assigned_dispatcher_id || m.id === input.assigned_dispatcher_id)
        : null;

      activityService
        .recordDispatcherAssignmentChange(
          organizationId,
          id,
          currentLoad.assigned_dispatcher_id || null,
          input.assigned_dispatcher_id || null,
          prevMember?.full_name || null,
          nextMember?.full_name || null,
          actorName,
          actorId
        )
        .catch(() => {});
    }

    return this.joinRelations(
      updatedLoad,
      clients,
      brokers,
      trucks,
      drivers,
      teamMembers,
      assignments.filter((a) => a.load_id === id)
    );
  }

  async updateLoadStatus(organizationId: string, id: string, status: PipelineStatus): Promise<LoadWithRelations> {
    return this.updateLoad(organizationId, id, { pipeline_status: status });
  }

  async assignLoadToTeamMember(
    organizationId: string,
    loadId: string,
    memberId: string | null,
    actorName: string = 'Admin',
    actorId: string = 'usr-admin',
    mode: 'add' | 'replace' = 'add'
  ): Promise<LoadWithRelations> {
    if (!memberId || memberId === 'unassigned') {
      await this.bulkAssignLoadsToTeamMembers(organizationId, [loadId], [], 'replace', actorName, actorId);
      const res = await this.getLoadById(organizationId, loadId);
      if (!res) throw new Error('Load not found');
      return res;
    }

    await this.assignTeamMembersToLoad(organizationId, loadId, [memberId], mode, actorName, actorId);
    const res = await this.getLoadById(organizationId, loadId);
    if (!res) throw new Error('Load not found');
    return res;
  }

  async assignTeamMembersToLoad(
    organizationId: string,
    loadId: string,
    memberIds: string[],
    mode: 'add' | 'replace' = 'add',
    actorName: string = 'Admin',
    actorId: string = 'usr-admin'
  ): Promise<LoadWithRelations> {
    await this.bulkAssignLoadsToTeamMembers(organizationId, [loadId], memberIds, mode, actorName, actorId);
    const updated = await this.getLoadById(organizationId, loadId);
    if (!updated) {
      throw new Error(`Load with ID "${loadId}" was not found.`);
    }
    return updated;
  }

  async removeTeamMemberFromLoad(
    organizationId: string,
    loadId: string,
    memberId: string,
    actorName: string = 'Admin',
    actorId: string = 'usr-admin'
  ): Promise<LoadWithRelations> {
    await this.bulkAssignLoadsToTeamMembers(organizationId, [loadId], [memberId], 'remove', actorName, actorId);
    const updated = await this.getLoadById(organizationId, loadId);
    if (!updated) {
      throw new Error(`Load with ID "${loadId}" was not found.`);
    }
    return updated;
  }

  async assignDispatcher(
    organizationId: string,
    loadId: string,
    dispatcherId: string | null,
    actorName: string = 'Dispatcher',
    actorId: string = 'usr-dispatcher'
  ): Promise<LoadWithRelations> {
    return this.assignLoadToTeamMember(organizationId, loadId, dispatcherId, actorName, actorId);
  }

  async bulkAssignLoadsToTeamMembers(
    organizationId: string,
    loadIds: string[],
    memberIds: string[],
    mode: 'add' | 'replace' | 'remove' = 'add',
    actorName: string = 'Admin',
    actorId: string = 'usr-admin'
  ): Promise<BulkAssignTeamMembersResult> {
    if (!loadIds || loadIds.length === 0) {
      return {
        success: true,
        updatedLoadsCount: 0,
        updatedCount: 0,
        loadIds: [],
        teamMemberIds: memberIds || [],
        assignedMemberIds: memberIds || [],
        mode,
      };
    }

    const teamMembers = await teamService.getTeamMembers(organizationId);

    // 1. Enforce owner_admin authorization upfront (Fail Closed)
    let actorUserId = actorId ? actorId.trim() : '';
    if (isSupabaseConfigured && (!actorUserId || !isUUID(actorUserId) || actorUserId === 'usr-admin')) {
      const { data: authData } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));
      if (authData?.user?.id) {
        actorUserId = authData.user.id;
      }
    }

    let actorMember = teamMembers.find(
      (m) => (actorUserId && m.user_id === actorUserId) || (actorUserId && m.id === actorUserId)
    );

    if (!actorMember && (!isSupabaseConfigured || !isUUID(organizationId))) {
      if (actorUserId === 'usr-admin' || actorUserId === 'admin-1' || actorUserId === 'usr-admin-1') {
        actorMember = teamMembers.find((m) => m.role === 'owner_admin');
      }
    }

    if (!actorMember || actorMember.role !== 'owner_admin') {
      throw new Error('Unauthorized: Only organization owner/admins can manage load team assignments.');
    }

    // 2. Lifecycle check: Invoiced and Paid loads cannot have team assignments modified
    if (isSupabaseConfigured && isUUID(organizationId)) {
      const validLoadIds = loadIds.filter(isUUID);
      if (validLoadIds.length > 0) {
        const { data: targetLoads, error: fetchErr } = await supabase
          .from('loads')
          .select('id, load_number, pipeline_status')
          .in('id', validLoadIds)
          .eq('organization_id', organizationId);

        if (fetchErr) {
          throw new Error(`Failed to verify load statuses: ${fetchErr.message}`);
        }

        const terminalLoad = targetLoads?.find((l) =>
          l.pipeline_status === 'invoiced' || l.pipeline_status === 'paid'
        );
        if (terminalLoad) {
          throw new Error(
            `Integrity Error: Cannot modify team assignments on an ${terminalLoad.pipeline_status.toUpperCase()} load (ID: ${terminalLoad.id}, Load Number: ${terminalLoad.load_number || 'N/A'}). Load must be reopened first.`
          );
        }
      }
    } else {
      const { loads } = this.ensureInitialized(organizationId);
      for (const loadId of loadIds) {
        const targetLoad = loads.find((l) => l.id === loadId);
        if (targetLoad && (targetLoad.pipeline_status === 'invoiced' || targetLoad.pipeline_status === 'paid')) {
          throw new Error(
            `Integrity Error: Cannot modify team assignments on an ${targetLoad.pipeline_status.toUpperCase()} load (ID: ${targetLoad.id}, Load Number: ${targetLoad.load_number || 'N/A'}). Load must be reopened first.`
          );
        }
      }
    }

    const validTargetMembers: TeamMember[] = [];
    const targetUserIds: string[] = [];

    for (const mId of memberIds) {
      if (!mId || mId === 'unassigned') continue;
      // Resolve member identity strictly to user_id (the authenticated user's UUID)
      const found = teamMembers.find(
        (m) =>
          (m.user_id === mId || m.id === mId) &&
          (m.role === 'owner_admin' || m.role === 'dispatcher' || m.role === 'staff') &&
          (m as any).status !== 'inactive'
      );
      if (found) {
        if (!validTargetMembers.some((vm) => vm.user_id === found.user_id)) {
          validTargetMembers.push(found);
        }
        if (!targetUserIds.includes(found.user_id)) {
          targetUserIds.push(found.user_id);
        }
      } else if (isUUID(mId) && !targetUserIds.includes(mId)) {
        targetUserIds.push(mId);
      }
    }

    if (isSupabaseConfigured && isUUID(organizationId)) {
      const validLoadIds = loadIds.filter(isUUID);
      if (validLoadIds.length > 0) {
        let rpcSucceeded = false;
        let rpcData: any = null;

        try {
          const { data, error } = await supabase.rpc('bulk_assign_load_team_members', {
            p_organization_id: organizationId,
            p_load_ids: validLoadIds,
            p_user_ids: targetUserIds.filter(isUUID),
            p_mode: mode,
            p_actor_id: actorUserId && isUUID(actorUserId) ? actorUserId : null,
          });

          if (!error) {
            rpcSucceeded = true;
            rpcData = data;
          } else {
            const isMissingFunction =
              error.code === 'PGRST202' ||
              error.code === '42883' ||
              error.message?.includes('could not find the function') ||
              error.message?.includes('schema cache');

            if (!isMissingFunction) {
              throw new Error(error.message || 'Database error during team assignment.');
            }
            console.warn('[LoadService] bulk_assign_load_team_members RPC not found in schema cache, using direct table fallback:', error.message);
          }
        } catch (rpcErr: any) {
          if (
            rpcErr.message &&
            !rpcErr.message.includes('PGRST202') &&
            !rpcErr.message.includes('42883') &&
            !rpcErr.message.includes('could not find the function') &&
            !rpcErr.message.includes('schema cache')
          ) {
            throw rpcErr;
          }
          console.warn('[LoadService] bulk_assign_load_team_members RPC call threw error, attempting direct table fallback:', rpcErr);
        }

        if (rpcSucceeded) {
          const resData = rpcData as any;
          return {
            success: true,
            updatedLoadsCount: resData?.updated_count ?? validLoadIds.length,
            updatedCount: resData?.updated_count ?? validLoadIds.length,
            loadIds: resData?.updated_ids ?? validLoadIds,
            teamMemberIds: targetUserIds,
            assignedMemberIds: targetUserIds,
            assignedMembers: validTargetMembers,
            mode,
          };
        }

        // Direct table update fallback for Supabase
        for (const loadId of validLoadIds) {
          if (mode === 'replace') {
            const { error: delErr } = await supabase
              .from('load_team_assignments')
              .delete()
              .eq('load_id', loadId)
              .eq('organization_id', organizationId);

            if (delErr) {
              throw new Error(`Failed to clear load team assignments: ${delErr.message}`);
            }

            if (targetUserIds.length > 0) {
              const rows = targetUserIds.filter(isUUID).map((uId) => ({
                organization_id: organizationId,
                load_id: loadId,
                user_id: uId,
                created_by: actorUserId && isUUID(actorUserId) ? actorUserId : null,
              }));
              const { error: insErr } = await supabase
                .from('load_team_assignments')
                .insert(rows);

              if (insErr) {
                throw new Error(`Failed to insert team assignments: ${insErr.message}`);
              }
            }

            // Sync loads.assigned_dispatcher_id
            const { error: updateLoadErr } = await supabase
              .from('loads')
              .update({
                assigned_dispatcher_id: targetUserIds[0] && isUUID(targetUserIds[0]) ? targetUserIds[0] : null,
                updated_at: new Date().toISOString(),
              })
              .eq('id', loadId)
              .eq('organization_id', organizationId);

            if (updateLoadErr) {
              throw new Error(`Failed to update load primary dispatcher: ${updateLoadErr.message}`);
            }
          } else if (mode === 'add') {
            for (const uId of targetUserIds.filter(isUUID)) {
              const { error: upsertErr } = await supabase
                .from('load_team_assignments')
                .upsert(
                  {
                    organization_id: organizationId,
                    load_id: loadId,
                    user_id: uId,
                    created_by: actorUserId && isUUID(actorUserId) ? actorUserId : null,
                  },
                  { onConflict: 'load_id,user_id' }
                );

              if (upsertErr) {
                throw new Error(`Failed to assign team member: ${upsertErr.message}`);
              }
            }

            // If load has no assigned_dispatcher_id, set to first added member
            const { data: currentLoadData } = await supabase
              .from('loads')
              .select('assigned_dispatcher_id')
              .eq('id', loadId)
              .eq('organization_id', organizationId)
              .single();

            if (currentLoadData && !currentLoadData.assigned_dispatcher_id && targetUserIds.length > 0) {
              const { error: updateLoadErr } = await supabase
                .from('loads')
                .update({
                  assigned_dispatcher_id: targetUserIds[0],
                  updated_at: new Date().toISOString(),
                })
                .eq('id', loadId)
                .eq('organization_id', organizationId);

              if (updateLoadErr) {
                throw new Error(`Failed to update load primary dispatcher: ${updateLoadErr.message}`);
              }
            }
          } else if (mode === 'remove') {
            if (targetUserIds.length > 0) {
              const { error: delErr } = await supabase
                .from('load_team_assignments')
                .delete()
                .eq('load_id', loadId)
                .eq('organization_id', organizationId)
                .in('user_id', targetUserIds.filter(isUUID));

              if (delErr) {
                throw new Error(`Failed to remove team assignment: ${delErr.message}`);
              }

              // Check if primary dispatcher was removed
              const { data: loadData } = await supabase
                .from('loads')
                .select('assigned_dispatcher_id')
                .eq('id', loadId)
                .eq('organization_id', organizationId)
                .single();

              if (loadData?.assigned_dispatcher_id && targetUserIds.includes(loadData.assigned_dispatcher_id)) {
                const { data: remainingAssignments } = await supabase
                  .from('load_team_assignments')
                  .select('user_id')
                  .eq('load_id', loadId)
                  .eq('organization_id', organizationId)
                  .order('created_at', { ascending: true })
                  .limit(1);

                const nextDispatcherId = remainingAssignments && remainingAssignments.length > 0
                  ? remainingAssignments[0].user_id
                  : null;

                const { error: updateLoadErr } = await supabase
                  .from('loads')
                  .update({
                    assigned_dispatcher_id: nextDispatcherId,
                    updated_at: new Date().toISOString(),
                  })
                  .eq('id', loadId)
                  .eq('organization_id', organizationId);

                if (updateLoadErr) {
                  throw new Error(`Failed to update load primary dispatcher: ${updateLoadErr.message}`);
                }
              }
            }
          }

          // Record audit log
          activityService
            .recordMultiTeamAssignmentChange(
              organizationId,
              loadId,
              targetUserIds,
              validTargetMembers.map((m) => m.full_name || 'Member'),
              mode,
              validLoadIds.length > 1,
              actorName,
              actorUserId || actorId
            )
            .catch(() => {});
        }

        return {
          success: true,
          updatedLoadsCount: validLoadIds.length,
          updatedCount: validLoadIds.length,
          loadIds: validLoadIds,
          teamMemberIds: targetUserIds,
          assignedMemberIds: targetUserIds,
          assignedMembers: validTargetMembers,
          mode,
        };
      }
    }

    // Local / Demo persistence & synchronization
    const { loads, assignments } = this.ensureInitialized(organizationId);
    let updatedCount = 0;
    const updatedIds: string[] = [];
    let updatedAssignments = [...assignments];

    for (const loadId of loadIds) {
      const loadExists = loads.some((l) => l.id === loadId);
      if (!loadExists) continue;

      updatedCount++;
      updatedIds.push(loadId);

      if (mode === 'replace') {
        // Remove all current assignments for this load
        updatedAssignments = updatedAssignments.filter((a) => a.load_id !== loadId);
        // Insert new ones
        targetUserIds.forEach((uId) => {
          updatedAssignments.push({
            id: `assign-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
            organization_id: organizationId,
            load_id: loadId,
            user_id: uId,
            created_at: new Date().toISOString(),
          });
        });
      } else if (mode === 'add') {
        targetUserIds.forEach((uId) => {
          const alreadyAssigned = updatedAssignments.some(
            (a) => a.load_id === loadId && a.user_id === uId
          );
          if (!alreadyAssigned) {
            updatedAssignments.push({
              id: `assign-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
              organization_id: organizationId,
              load_id: loadId,
              user_id: uId,
              created_at: new Date().toISOString(),
            });
          }
        });
      } else if (mode === 'remove') {
        updatedAssignments = updatedAssignments.filter(
          (a) => !(a.load_id === loadId && targetUserIds.includes(a.user_id))
        );
      }

      // Sync load's primary assigned_dispatcher_id in loads state
      const loadAssignmentsForThisLoad = updatedAssignments.filter((a) => a.load_id === loadId);
      const primaryAssigneeId = loadAssignmentsForThisLoad.length > 0 ? loadAssignmentsForThisLoad[0].user_id : null;
      const loadIdx = loads.findIndex((l) => l.id === loadId);
      if (loadIdx >= 0) {
        loads[loadIdx] = {
          ...loads[loadIdx],
          assigned_dispatcher_id: primaryAssigneeId,
          updated_at: new Date().toISOString(),
        };
      }

      // Record audit
      activityService
        .recordMultiTeamAssignmentChange(
          organizationId,
          loadId,
          targetUserIds,
          validTargetMembers.map((m) => m.full_name || 'Member'),
          mode,
          loadIds.length > 1,
          actorName,
          actorId
        )
        .catch(() => {});
    }

    const assignmentsKey = `${LOAD_TEAM_ASSIGNMENTS_STORAGE_PREFIX}${organizationId}`;
    saveToStorage(assignmentsKey, updatedAssignments);

    const loadsKey = `${LOADS_STORAGE_PREFIX}${organizationId}`;
    saveToStorage(loadsKey, loads);

    return {
      success: true,
      updatedLoadsCount: updatedCount,
      updatedCount,
      loadIds: updatedIds,
      teamMemberIds: targetUserIds,
      assignedMemberIds: targetUserIds,
      assignedMembers: validTargetMembers,
      mode,
    };
  }

  async bulkAssignLoadsToTeamMember(
    organizationId: string,
    loadIds: string[],
    memberId: string | null,
    actorName: string = 'Admin',
    actorId: string = 'usr-admin'
  ): Promise<BulkAssignTeamMemberResult> {
    if (!loadIds || loadIds.length === 0) {
      return {
        success: true,
        updatedCount: 0,
        loadIds: [],
        assignedMemberId: memberId || null,
        dispatcherId: memberId || null,
      };
    }

    const targetMemberIds = memberId && memberId !== 'unassigned' ? [memberId] : [];
    const res = await this.bulkAssignLoadsToTeamMembers(
      organizationId,
      loadIds,
      targetMemberIds,
      'replace',
      actorName,
      actorId
    );

    const firstMember = res.assignedMembers && res.assignedMembers[0];

    return {
      success: res.success,
      updatedCount: res.updatedCount ?? res.updatedLoadsCount ?? 0,
      loadIds: res.loadIds,
      assignedMemberId: firstMember ? (firstMember.user_id || firstMember.id) : null,
      assignedMemberName: firstMember ? firstMember.full_name : null,
      assignedMemberRole: firstMember ? firstMember.role : null,
      dispatcherId: firstMember ? (firstMember.user_id || firstMember.id) : null,
      dispatcherName: firstMember ? firstMember.full_name : null,
    };
  }

  async bulkAssignDispatcher(
    organizationId: string,
    loadIds: string[],
    dispatcherId: string | null,
    actorName: string = 'Dispatcher',
    actorId: string = 'usr-dispatcher'
  ): Promise<BulkAssignDispatcherResult> {
    return this.bulkAssignLoadsToTeamMember(organizationId, loadIds, dispatcherId, actorName, actorId);
  }

  async assignDispatchResources(
    organizationId: string,
    loadId: string,
    truckId?: string | null,
    driverId?: string | null,
    notes?: string
  ): Promise<LoadWithRelations> {
    if (isSupabaseConfigured && isUUID(organizationId) && isUUID(loadId)) {
      const { data, error } = await supabase.rpc('assign_load_dispatch', {
        p_organization_id: organizationId,
        p_load_id: loadId,
        p_truck_id: (truckId && isUUID(truckId)) ? truckId : null,
        p_driver_id: (driverId && isUUID(driverId)) ? driverId : null,
        p_notes: notes || null,
      });

      if (error) {
        if (
          error.message?.includes('idx_loads_one_in_transit_per_truck') ||
          (error as any).details?.includes('idx_loads_one_in_transit_per_truck')
        ) {
          throw new Error('The selected truck already has a load IN TRANSIT. A truck cannot have more than one load in transit simultaneously.');
        }
        console.error('[LoadService] Supabase assign_load_dispatch error:', error);
        throw new Error(error.message || 'Failed to update dispatch assignment.');
      }

      const updated = await this.getLoadById(organizationId, loadId);
      if (!updated) {
        throw new Error('Load not found after dispatch assignment.');
      }
      return updated;
    }

    // Demo Mode implementation routes through updateLoad with assignment fields
    return this.updateLoad(organizationId, loadId, {
      truck_id: truckId,
      driver_id: driverId,
      ...(notes ? { special_instructions: notes } : {}),
    });
  }

  async deleteLoad(organizationId: string, id: string): Promise<void> {
    if (isSupabaseConfigured && isUUID(organizationId) && isUUID(id)) {
      const { error } = await supabase
        .from('loads')
        .delete()
        .eq('id', id)
        .eq('organization_id', organizationId);

      if (error) {
        console.error('[LoadService] Supabase deleteLoad error:', error);
        throw new Error(error.message || 'Failed to delete load from database.');
      }
      return;
    }

    const { loads } = this.ensureInitialized(organizationId);
    const filtered = loads.filter((l) => l.id !== id);
    if (filtered.length === loads.length) {
      throw new Error(`Load with ID "${id}" was not found.`);
    }
    const loadsKey = `${LOADS_STORAGE_PREFIX}${organizationId}`;
    saveToStorage(loadsKey, filtered);
  }

  async getClients(organizationId: string): Promise<Client[]> {
    return clientService.getClients(organizationId);
  }

  async getBrokers(organizationId: string): Promise<Broker[]> {
    return brokerService.listBrokers(organizationId);
  }

  async getTrucks(organizationId: string, clientId?: string): Promise<Truck[]> {
    const trucks = await truckService.getTrucks(organizationId);
    let result: Truck[] = trucks.map((t) => ({
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
    if (clientId) {
      result = result.filter((t) => t.client_id === clientId);
    }
    return result.sort((a, b) => a.truck_number.localeCompare(b.truck_number));
  }

  async getDrivers(organizationId: string, clientId?: string): Promise<Driver[]> {
    const drivers = await driverService.getDrivers(organizationId);
    let result: Driver[] = drivers.map((d) => ({
      id: d.id,
      organization_id: d.organization_id,
      client_id: d.client_id,
      assigned_truck_id: d.assigned_truck_id,
      full_name: d.full_name,
      phone: d.phone,
      email: d.email,
      pay_type: d.pay_type,
      pay_rate: d.pay_rate,
      status: d.status,
      notes: d.notes,
      created_at: d.created_at,
      updated_at: d.updated_at,
    }));
    if (clientId) {
      result = result.filter((d) => d.client_id === clientId);
    }
    return result.sort((a, b) => a.full_name.localeCompare(b.full_name));
  }

  async getDependencies(organizationId: string): Promise<[Truck[], Driver[], Client[], Broker[], TeamMember[]]> {
    if (!organizationId) {
      return [[], [], [], [], []];
    }
    const inFlight = this.inFlightGetDependencies.get(organizationId);
    if (inFlight) {
      return inFlight;
    }

    const request = Promise.all([
      this.getTrucks(organizationId),
      this.getDrivers(organizationId),
      this.getClients(organizationId),
      this.getBrokers(organizationId),
      teamService.getTeamMembers(organizationId),
    ]);

    this.inFlightGetDependencies.set(organizationId, request);
    request.finally(() => {
      this.inFlightGetDependencies.delete(organizationId);
    });
    return request;
  }

  async generateNextLoadNumber(organizationId: string): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `LD-${year}-`;
    let maxSeq = 8840;

    if (isSupabaseConfigured && isUUID(organizationId)) {
      try {
        const { data, error } = await supabase
          .from('loads')
          .select('load_number')
          .eq('organization_id', organizationId);

        if (!error && data) {
          data.forEach((l) => {
            if (l.load_number.startsWith(prefix)) {
              const numPart = parseInt(l.load_number.replace(prefix, ''), 10);
              if (!isNaN(numPart) && numPart > maxSeq) {
                maxSeq = numPart;
              }
            }
          });
          return `${prefix}${maxSeq + 1}`;
        }
      } catch (seqErr) {
        console.warn('[LoadService] Supabase generateNextLoadNumber warning, using local sequence:', seqErr);
      }
    }

    const { loads } = this.ensureInitialized(organizationId);
    loads.forEach((l) => {
      if (l.load_number.startsWith(prefix)) {
        const numPart = parseInt(l.load_number.replace(prefix, ''), 10);
        if (!isNaN(numPart) && numPart > maxSeq) {
          maxSeq = numPart;
        }
      }
    });

    return `${prefix}${maxSeq + 1}`;
  }
}

// Export singleton instance
export const loadService: ILoadService = new LocalLoadService();
