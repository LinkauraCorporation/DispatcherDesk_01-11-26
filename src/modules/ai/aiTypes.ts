import {
  UserRole,
  PipelineStatus,
  DocumentType,
  DocumentStatus,
  EquipmentType,
} from '../../types/domain.types.ts';
import { CheckCallType, CheckCallOperationalStatus } from '../checkcalls/checkCallTypes.ts';
import { AccessorialType, AccessorialStatus } from '../accessorials/accessorialTypes.ts';
import { ActivityType } from '../activity/activityTypes.ts';

export type CopilotMode = 'gemini' | 'local';

export type CopilotAction =
  | 'shift_handover_digest'
  | 'risk_analysis'
  | 'detention_escalation'
  | 'driver_instructions'
  | 'broker_email'
  | 'missing_paperwork'
  | 'analyze_load'
  | 'explain_load_risk'
  | 'summarize_load'
  | 'rate_negotiation_prep'
  | 'extract_tasks_from_notes'
  | 'general_query';

export type AIUserRole = UserRole; // 'owner_admin' | 'dispatcher' | 'staff'

// Compact context for active and overdue tasks
export interface AIContextTask {
  id: string;
  loadId?: string | null;
  loadNumber?: string | null;
  category: string;
  categoryLabel: string;
  title: string;
  description?: string;
  priority: string;
  dueAtFormatted: string;
  isOverdue: boolean;
  assignedToName?: string | null;
}

// Compact context for a single active or referenced load
export interface AIContextLoad {
  id: string;
  loadNumber: string;
  pipelineStatus: PipelineStatus;
  origin: string; // e.g. "Chicago, IL"
  destination: string; // e.g. "Atlanta, GA"
  pickupTimeFormatted: string;
  deliveryTimeFormatted: string;
  equipmentType: EquipmentType | string;
  carrierClientName: string;
  brokerCompanyName: string;
  brokerContact?: string;
  brokerEmail?: string;
  driverName: string;
  driverPhone?: string;
  truckNumber: string;
  specialInstructions?: string;
  // RBAC protected fields (omitted/masked for staff or restricted roles)
  rateFormatted?: string; // e.g. "$2,850.00"
  rpmFormatted?: string; // e.g. "$2.45/mi"
  isAtRisk?: boolean;
  activeDetentionHours?: number;
  isTracked?: boolean;
  isMissingRecentCheckIn?: boolean;
  totalCheckCalls?: number;
  timeSinceLastUpdate?: string;
}

// Compact context for recent check calls
export interface AIContextCheckCall {
  id: string;
  loadNumber: string;
  callType: CheckCallType;
  status: CheckCallOperationalStatus;
  location: string;
  etaPickupFormatted?: string;
  etaDeliveryFormatted?: string;
  notes?: string;
  loggedAtFormatted: string;
  isException: boolean; // true if delay, breakdown, or at_risk
}

// Compact context for accessorial and detention claims
export interface AIContextAccessorial {
  id: string;
  loadNumber: string;
  type: AccessorialType;
  status: AccessorialStatus;
  amountFormatted: string; // Pre-calculated deterministic currency string
  description: string;
  facilityName?: string;
  facilityType?: string;
  billableHours?: number;
  isActiveDetention?: boolean;
  hourlyRateFormatted?: string;
}

// Compact context for document and paperwork status
export interface AIContextDocument {
  loadId: string;
  loadNumber: string;
  docType: DocumentType;
  docStatus: DocumentStatus;
  fileName?: string;
  isMissingCritical: boolean; // true if BOL/POD is missing for delivered load
}

// Compact context for recent activity and dispatcher notes
export interface AIContextActivity {
  id: string;
  loadNumber?: string;
  type: ActivityType;
  title: string;
  description: string;
  actorName: string;
  timestampFormatted: string;
  isCriticalAlert: boolean;
}

// Deterministic financials summary (STRICTLY for owner_admin only)
export interface AIContextFinancials {
  totalActiveGrossRevenue: string;
  averageRpm: string;
  estimatedNetProfit: string;
  profitMargin: string;
  activeLoadsCount: number;
}

// Aggregated context passed into AI prompts or local templates
export interface AIContext {
  organizationId: string;
  userRole: AIUserRole;
  generatedAtIso: string;
  operationalTimezone: string;
  dispatcherTimezone: string;
  currentTimeOps: string;
  currentTimeDispatcher: string;
  
  loads: AIContextLoad[];
  recentCheckCalls: AIContextCheckCall[];
  pendingAccessorials: AIContextAccessorial[];
  missingDocuments: AIContextDocument[];
  recentActivities: AIContextActivity[];
  tasks: AIContextTask[];
  taskStats?: { totalActive: number; overdueCount: number; dueTodayCount: number };
  operationalAlerts: string[];
  
  // Role-gated financial stats (undefined if not authorized)
  financials?: AIContextFinancials;
}

// Request payload for the copilot
export interface AIRequest {
  action: CopilotAction;
  query?: string;
  loadId?: string;
  claimId?: string;
  mode?: CopilotMode;
  customInstructions?: string;
}

// Grounding source citation
export interface GroundingSource {
  type: 'load' | 'check_call' | 'accessorial' | 'document' | 'activity' | 'handover';
  id: string;
  label: string;
  detail?: string;
}

// Structured response payload from copilot
export interface AIResponse {
  id: string;
  action: CopilotAction;
  mode: CopilotMode;
  title: string;
  content: string;
  markdownContent: string;
  subject?: string; // Optional email subject line when drafting emails
  timestamp: string;
  confidenceScore?: number;
  groundingSources: GroundingSource[];
  recommendations: string[];
  suggestedActions: {
    label: string;
    action: string;
    payload?: Record<string, any>;
  }[];
  isDraft: boolean; // True for generated emails/texts requiring human dispatch confirmation
  requiresConfirmation: boolean;
}

// Quick prompt configuration for the UI
export interface QuickPrompt {
  id: string;
  action: CopilotAction;
  label: string;
  description: string;
  icon: string; // Lucide icon identifier
  category: 'operations' | 'comms' | 'detention' | 'handover';
  defaultQuery?: string;
}
