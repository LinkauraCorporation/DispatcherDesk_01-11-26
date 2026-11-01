import {
  Load,
  Client,
  Broker,
  Truck,
  Driver,
  Profile,
  PipelineStatus,
  EquipmentType,
  ProfitabilityMetrics,
  TeamMember,
  UserRole,
} from '../../types/domain.types.ts';

export interface LoadTeamAssignment {
  id: string;
  organization_id: string;
  load_id: string;
  user_id: string;
  created_at: string;
  created_by?: string | null;
  user_profile?: (Pick<Profile, 'id' | 'full_name' | 'phone'> & { email?: string | null; role?: string | null }) | null;
}

export interface LoadWithRelations extends Load {
  client?: Pick<Client, 'id' | 'company_name' | 'client_type' | 'contact_name' | 'contact_phone' | 'contact_email'> | null;
  broker?: Pick<Broker, 'id' | 'company_name' | 'mc_number' | 'dot_number' | 'contact_name' | 'contact_phone' | 'contact_email' | 'credit_status' | 'payment_terms_days'> | null;
  truck?: Pick<Truck, 'id' | 'truck_number' | 'equipment_type' | 'current_location_city' | 'current_location_state' | 'status' | 'vin'> | null;
  driver?: Pick<Driver, 'id' | 'full_name' | 'phone' | 'email' | 'pay_type' | 'pay_rate' | 'status'> | null;
  dispatcher_profile?: (Pick<Profile, 'id' | 'full_name' | 'phone'> & { email?: string | null; role?: string | null }) | null;
  assigned_to_profile?: (Pick<Profile, 'id' | 'full_name' | 'phone'> & { email?: string | null; role?: string | null }) | null;
  assigned_team?: TeamMember[];
  assigned_team_assignments?: LoadTeamAssignment[];
}

export interface CreateLoadInput {
  load_number: string;
  client_id?: string | null;
  broker_id?: string | null;
  truck_id?: string | null;
  driver_id?: string | null;
  assigned_dispatcher_id?: string | null;
  assigned_team_member_ids?: string[];
  pipeline_status?: PipelineStatus;
  equipment_type: EquipmentType;
  commodity?: string | null;
  weight_lbs?: number | null;
  origin_facility_name?: string | null;
  origin_address?: string | null;
  origin_city: string;
  origin_state: string;
  origin_zip?: string | null;
  origin_timezone?: string;
  pickup_datetime?: string | null;
  dest_facility_name?: string | null;
  dest_address?: string | null;
  dest_city: string;
  dest_state: string;
  dest_zip?: string | null;
  dest_timezone?: string;
  operational_timezone?: string;
  delivery_datetime?: string | null;
  pickup_arrival_time?: string | null;
  pickup_loading_start_time?: string | null;
  pickup_loading_complete_time?: string | null;
  pickup_departure_time?: string | null;
  delivery_arrival_time?: string | null;
  delivery_unloading_start_time?: string | null;
  delivery_unloading_complete_time?: string | null;
  delivery_departure_time?: string | null;
  rate: number;
  loaded_miles: number;
  deadhead_miles?: number;
  fuel_expense?: number;
  driver_pay?: number;
  other_expenses?: number;
  special_instructions?: string | null;
}

export interface UpdateLoadInput {
  load_number?: string;
  client_id?: string | null;
  broker_id?: string | null;
  truck_id?: string | null;
  driver_id?: string | null;
  assigned_dispatcher_id?: string | null;
  assigned_team_member_ids?: string[];
  pipeline_status?: PipelineStatus;
  equipment_type?: EquipmentType;
  commodity?: string | null;
  weight_lbs?: number | null;
  origin_facility_name?: string | null;
  origin_address?: string | null;
  origin_city?: string;
  origin_state?: string;
  origin_zip?: string | null;
  origin_timezone?: string;
  pickup_datetime?: string | null;
  dest_facility_name?: string | null;
  dest_address?: string | null;
  dest_city?: string;
  dest_state?: string;
  dest_zip?: string | null;
  dest_timezone?: string;
  operational_timezone?: string;
  delivery_datetime?: string | null;
  pickup_arrival_time?: string | null;
  pickup_loading_start_time?: string | null;
  pickup_loading_complete_time?: string | null;
  pickup_departure_time?: string | null;
  delivery_arrival_time?: string | null;
  delivery_unloading_start_time?: string | null;
  delivery_unloading_complete_time?: string | null;
  delivery_departure_time?: string | null;
  rate?: number;
  loaded_miles?: number;
  deadhead_miles?: number;
  fuel_expense?: number;
  driver_pay?: number;
  other_expenses?: number;
  special_instructions?: string | null;
}

export interface LoadFilterCriteria {
  search?: string;
  clientId?: string;
  brokerId?: string;
  equipmentType?: string;
  status?: string;
  dispatcherId?: string; // 'all' | 'unassigned' | 'me' | user_id (backward-compatible)
  assignedMemberId?: string; // 'all' | 'unassigned' | 'me' | user_id
  currentUserId?: string; // For resolving 'me' in service queries
  userRole?: UserRole; // For access control enforcement
  dateRange?: 'all' | 'today' | 'upcoming' | 'past';
}

export interface BulkAssignTeamMembersResult {
  success: boolean;
  updatedLoadsCount: number;
  updatedCount?: number;
  totalAssignmentsCount?: number;
  loadIds: string[];
  teamMemberIds?: string[];
  assignedMemberIds?: string[];
  mode: 'add' | 'replace' | 'remove';
  assignedMembers?: TeamMember[];
}

export interface BulkAssignTeamMemberResult {
  success: boolean;
  updatedCount: number;
  loadIds: string[];
  assignedMemberId: string | null;
  assignedMemberName?: string | null;
  assignedMemberRole?: string | null;
  // Backward compatibility fields:
  dispatcherId?: string | null;
  dispatcherName?: string | null;
}

export type BulkAssignDispatcherResult = BulkAssignTeamMemberResult;

export const PIPELINE_STATUS_OPTIONS: {
  value: PipelineStatus;
  label: string;
  description: string;
}[] = [
  { value: 'sourced', label: 'Sourced', description: 'Load opportunity identified or posted on load board' },
  { value: 'negotiating', label: 'Negotiating', description: 'Rate and terms currently in negotiation with broker' },
  { value: 'booked', label: 'Booked', description: 'Rate confirmation signed and load locked in' },
  { value: 'in_transit', label: 'In Transit', description: 'Driver rolling under load with active tracking' },
  { value: 'delivered', label: 'Delivered', description: 'Consignee received freight; pending POD/paperwork' },
  { value: 'invoiced', label: 'Invoiced', description: 'Invoice submitted to broker or factoring company' },
  { value: 'paid', label: 'Paid', description: 'Payment settled and remittance received' },
];

export const EQUIPMENT_TYPE_OPTIONS: {
  value: EquipmentType;
  label: string;
  shortLabel: string;
}[] = [
  { value: 'dry_van', label: '53ft Dry Van', shortLabel: 'Dry Van' },
  { value: 'reefer', label: 'Refrigerated (Reefer)', shortLabel: 'Reefer' },
  { value: 'flatbed', label: 'Flatbed (48/53ft)', shortLabel: 'Flatbed' },
  { value: 'step_deck', label: 'Step Deck / Drop Deck', shortLabel: 'Step Deck' },
  { value: 'power_only', label: 'Power Only', shortLabel: 'Power Only' },
  { value: 'box_truck', label: 'Straight Box Truck (26ft)', shortLabel: 'Box Truck' },
  { value: 'hotshot', label: 'Hotshot 40ft Gooseneck', shortLabel: 'Hotshot' },
];

export const US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
  'DC', 'PR',
] as const;

export function isValidUsState(state: string): boolean {
  return US_STATES.includes(state.trim().toUpperCase() as (typeof US_STATES)[number]);
}
