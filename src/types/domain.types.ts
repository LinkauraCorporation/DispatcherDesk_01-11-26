import {
  Database,
  UserRole,
  ClientType,
  CreditStatus,
  EquipmentType,
  TruckStatus,
  DriverStatus,
  DriverPayType,
  PipelineStatus,
  DocumentType,
  DocumentStatus,
  NoteType,
  PlanType,
  BillingState,
} from './database.types.ts';

export type Organization = Database['public']['Tables']['organizations']['Row'];
export type Profile = Database['public']['Tables']['profiles']['Row'];
export type OrganizationMember = Database['public']['Tables']['organization_members']['Row'];
export type Client = Database['public']['Tables']['clients']['Row'];
export type Broker = Database['public']['Tables']['brokers']['Row'];
export type Truck = Database['public']['Tables']['trucks']['Row'];
export type Driver = Database['public']['Tables']['drivers']['Row'];
export type Load = Database['public']['Tables']['loads']['Row'];
export type Document = Database['public']['Tables']['documents']['Row'];
export type ActivityNote = Database['public']['Tables']['activity_notes']['Row'];
export type Subscription = Database['public']['Tables']['subscriptions']['Row'];
export type TruckActivationHistory = Database['public']['Tables']['truck_activation_history']['Row'];
export type BillingPaymentTransaction = Database['public']['Tables']['billing_payment_transactions']['Row'];
export type CheckCallRecord = Database['public']['Tables']['check_calls']['Row'];
export type LoadDetentionRecord = Database['public']['Tables']['load_detention_records']['Row'];
export type LoadDetentionRecordInsert = Database['public']['Tables']['load_detention_records']['Insert'];
export type LoadDetentionRecordUpdate = Database['public']['Tables']['load_detention_records']['Update'];
export type LoadDetentionAudit = Database['public']['Tables']['load_detention_audits']['Row'];
export type LoadDetentionAuditInsert = Database['public']['Tables']['load_detention_audits']['Insert'];
export type LoadDetentionAuditUpdate = Database['public']['Tables']['load_detention_audits']['Update'];

export type {
  AuditStatus,
  FacilityAuditStatus,
  HumanReviewStatus,
  DiscrepancyCode,
  EvidenceSourceType,
  AuditFacilityReport,
  AuditEvidenceItem,
  AuditDiscrepancy,
  DetentionAuditInput,
  DetentionAuditResult,
} from '../modules/accessorials/detentionAuditTypes.ts';

export type {
  UserRole,
  ClientType,
  CreditStatus,
  EquipmentType,
  TruckStatus,
  DriverStatus,
  DriverPayType,
  PipelineStatus,
  DocumentType,
  DocumentStatus,
  NoteType,
  PlanType,
  BillingState,
};

// Rich Joined Load for UI grids & pipeline
export interface LoadWithRelations extends Load {
  client?: Client | null;
  broker?: Broker | null;
  truck?: Truck | null;
  driver?: Driver | null;
  dispatcher_profile?: Profile | null;
  documents?: Document[];
  activity_notes?: ActivityNote[];
}

// Deterministic Financial Output
export interface ProfitabilityMetrics {
  grossRate: number;
  loadedMiles: number;
  deadheadMiles: number;
  totalMiles: number;
  rpm: number; // Rate per total mile ($/mi)
  fuelExpense: number;
  driverPay: number;
  otherExpenses: number;
  totalEstimatedCost: number;
  estimatedProfit: number;
  profitMargin: number; // percentage, e.g. 24.5%
}

// User Profile with Org context
export interface ActiveUserSession {
  user: {
    id: string;
    email?: string;
  };
  profile: Profile | null;
  activeOrganization: Organization | null;
  userRole: UserRole | null;
  userOrganizations: {
    organization: Organization;
    role: UserRole;
  }[];
}

// Organization Team Member with Hydrated Profile
export interface TeamMember {
  id: string; // organization_members.id
  user_id: string;
  organization_id: string;
  role: UserRole;
  created_at: string;
  updated_at?: string;
  full_name: string | null;
  phone: string | null;
  preferred_timezone: string | null;
  email?: string | null;
}

// Team Member Invitation Status & Model
export type InvitationStatus = 'pending' | 'accepted' | 'cancelled' | 'expired';

export interface TeamInvitation {
  id: string;
  organization_id: string;
  organization_name?: string;
  email: string;
  role: UserRole;
  driver_id?: string | null;
  driver_name?: string | null;
  invited_by_user_id?: string | null;
  invited_by_name?: string | null;
  token_hash?: string;
  expires_at: string;
  accepted_at?: string | null;
  cancelled_at?: string | null;
  created_at: string;
  updated_at?: string;
  status: InvitationStatus;
  is_valid?: boolean;
  invalid_reason?: string | null;
}

// Supported IANA Timezone definitions
export interface SupportedTimezone {
  id: string; // e.g. 'America/Chicago'
  label: string; // e.g. 'Central Time (CST/CDT)'
  code: string; // e.g. 'CT'
  region: 'US' | 'Canada' | 'India' | 'Pakistan';
}

export interface SubscriptionUsageSummary {
  organization_id: string;
  plan: PlanType;
  billing_state: BillingState;
  billing_period_key: string;
  current_period_start: string | null;
  current_period_end: string | null;
  trial_starts_at: string | null;
  trial_ends_at: string | null;
  is_trial: boolean;
  is_trial_expired: boolean;
  amt_usage: number;
  amt_capacity: number;
  remaining_amt_slots: number;
}
