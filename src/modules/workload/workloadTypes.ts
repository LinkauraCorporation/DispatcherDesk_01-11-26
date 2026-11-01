import { TeamMember, UserRole, PipelineStatus } from '../../types/domain.types.ts';
import { LoadWithRelations } from '../loads/loadTypes.ts';

export type WorkloadLevel = 'low' | 'medium' | 'high' | 'very_high';

export interface WorkloadThresholdConfig {
  lowMax: number;      // 1 - 3
  mediumMax: number;   // 4 - 7
  highMax: number;     // 8 - 11
  // 12+ is very_high (overloaded)
}

export const DEFAULT_WORKLOAD_THRESHOLDS: WorkloadThresholdConfig = {
  lowMax: 3,
  mediumMax: 7,
  highMax: 11,
};

export interface TeamMemberWorkloadSummary {
  member: TeamMember;
  activeLoadsCount: number;
  pendingLoadsCount: number;
  inProgressLoadsCount: number;
  deliveredLoadsCount: number;
  invoicedLoadsCount: number;
  paidLoadsCount: number;
  totalAssignedLoadsCount: number;
  workloadLevel: WorkloadLevel;
  workloadPercentage: number; // 0 to 100% (based on standard capacity of 12 loads)
  lastActivityAt: string | null;
  assignedLoads: LoadWithRelations[];
}

export interface OrganizationWorkloadStats {
  totalEligibleMembers: number;
  totalUniqueActiveLoads: number;
  assignedActiveLoadsCount: number;
  unassignedActiveLoadsCount: number;
  totalActiveAssignmentsCount: number;
  averageActiveLoadsPerMember: number;
  overloadedMembersCount: number;
}

export interface WorkloadOverviewResponse {
  stats: OrganizationWorkloadStats;
  summaries: TeamMemberWorkloadSummary[];
  unassignedLoads: LoadWithRelations[];
}

export interface WorkloadFilterCriteria {
  search?: string;
  role?: 'all' | UserRole;
  workloadLevel?: 'all' | WorkloadLevel;
  assignmentStatus?: 'all' | 'has_active' | 'no_active';
  loadStatus?: 'all' | PipelineStatus;
  sortBy?:
    | 'name'
    | 'role'
    | 'active_loads'
    | 'pending'
    | 'in_progress'
    | 'delivered'
    | 'workload'
    | 'last_activity';
  sortOrder?: 'asc' | 'desc';
}

export function calculateWorkloadLevel(
  activeCount: number,
  thresholds: WorkloadThresholdConfig = DEFAULT_WORKLOAD_THRESHOLDS
): WorkloadLevel {
  if (activeCount <= thresholds.lowMax) {
    return 'low';
  }
  if (activeCount <= thresholds.mediumMax) {
    return 'medium';
  }
  if (activeCount <= thresholds.highMax) {
    return 'high';
  }
  return 'very_high';
}

export function getWorkloadBadgeConfig(level: WorkloadLevel): {
  label: string;
  bgClass: string;
  textClass: string;
  borderClass: string;
  barColor: string;
} {
  switch (level) {
    case 'low':
      return {
        label: 'Low',
        bgClass: 'bg-emerald-950/60',
        textClass: 'text-emerald-300',
        borderClass: 'border-emerald-800/40',
        barColor: 'bg-emerald-500',
      };
    case 'medium':
      return {
        label: 'Medium',
        bgClass: 'bg-sky-950/60',
        textClass: 'text-sky-300',
        borderClass: 'border-sky-800/40',
        barColor: 'bg-sky-500',
      };
    case 'high':
      return {
        label: 'High',
        bgClass: 'bg-amber-950/60',
        textClass: 'text-amber-300',
        borderClass: 'border-amber-800/40',
        barColor: 'bg-amber-500',
      };
    case 'very_high':
      return {
        label: 'Very High',
        bgClass: 'bg-rose-950/60',
        textClass: 'text-rose-300',
        borderClass: 'border-rose-800/40',
        barColor: 'bg-rose-500',
      };
  }
}
