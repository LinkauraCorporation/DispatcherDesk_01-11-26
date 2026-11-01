import { TeamMember, UserRole, PipelineStatus } from '../../types/domain.types.ts';
import { LoadWithRelations } from '../loads/loadTypes.ts';
import { loadService } from '../loads/loadService.ts';
import { teamService } from '../team/teamService.ts';
import { supabase, isSupabaseConfigured } from '../../lib/supabase.ts';
import {
  TeamMemberWorkloadSummary,
  OrganizationWorkloadStats,
  WorkloadOverviewResponse,
  WorkloadFilterCriteria,
  calculateWorkloadLevel,
  DEFAULT_WORKLOAD_THRESHOLDS,
} from './workloadTypes.ts';

const ACTIVE_PIPELINE_STATUSES: PipelineStatus[] = ['sourced', 'negotiating', 'booked', 'in_transit'];
const PENDING_PIPELINE_STATUSES: PipelineStatus[] = ['sourced', 'negotiating', 'booked'];
const IN_PROGRESS_PIPELINE_STATUSES: PipelineStatus[] = ['in_transit'];
const CAPACITY_BASELINE_LOADS = 12; // 12 loads represents standard high capacity limit

export class WorkloadService {
  /**
   * Fetches the complete organization team workload overview,
   * calculating unique active loads, relationship assignment totals, and individual member metrics.
   */
  async getWorkloadOverview(
    organizationId: string,
    filters?: WorkloadFilterCriteria
  ): Promise<WorkloadOverviewResponse> {
    if (!organizationId) {
      return {
        stats: {
          totalEligibleMembers: 0,
          totalUniqueActiveLoads: 0,
          assignedActiveLoadsCount: 0,
          unassignedActiveLoadsCount: 0,
          totalActiveAssignmentsCount: 0,
          averageActiveLoadsPerMember: 0,
          overloadedMembersCount: 0,
        },
        summaries: [],
        unassignedLoads: [],
      };
    }

    // Role check: Only owner_admin can access organization-wide workload overview
    const effectiveRole =
      typeof localStorage !== 'undefined' ? localStorage.getItem('dispatchdesk_current_role') : null;
    if (effectiveRole === 'dispatcher' || effectiveRole === 'staff') {
      return {
        stats: {
          totalEligibleMembers: 0,
          totalUniqueActiveLoads: 0,
          assignedActiveLoadsCount: 0,
          unassignedActiveLoadsCount: 0,
          totalActiveAssignmentsCount: 0,
          averageActiveLoadsPerMember: 0,
          overloadedMembersCount: 0,
        },
        summaries: [],
        unassignedLoads: [],
      };
    }

    // Attempt RPC optimization on configured Supabase first if available
    if (isSupabaseConfigured) {
      try {
        const { data: rpcData, error: rpcError } = await (supabase.rpc as any)(
          'get_team_workload_overview',
          { p_organization_id: organizationId }
        );

        if (!rpcError && rpcData && Array.isArray(rpcData.members)) {
          const allLoads = await loadService.getLoads(organizationId);
          return this.processWorkloadFromRpcData(organizationId, rpcData, allLoads, filters);
        }
      } catch (err) {
        console.warn('[WorkloadService] RPC fallback to client aggregation:', err);
      }
    }

    // Standard high-performance aggregation across team members and loads
    const [teamMembers, allLoads] = await Promise.all([
      teamService.getTeamMembers(organizationId),
      loadService.getLoads(organizationId),
    ]);

    return this.processWorkloadFromRawData(organizationId, teamMembers, allLoads, filters);
  }

  /**
   * Processes workload overview directly from the database RPC output.
   */
  private processWorkloadFromRpcData(
    organizationId: string,
    rpcData: any,
    allLoads: LoadWithRelations[],
    filters?: WorkloadFilterCriteria
  ): WorkloadOverviewResponse {
    const rawMembers: any[] = Array.isArray(rpcData.members) ? rpcData.members : [];

    const summaries: TeamMemberWorkloadSummary[] = rawMembers.map((m: any) => {
      const member: TeamMember = {
        id: m.member_id,
        user_id: m.user_id,
        organization_id: organizationId,
        role: m.role as UserRole,
        full_name: m.full_name || 'Team Member',
        phone: m.phone || null,
        preferred_timezone: m.preferred_timezone || null,
        email: m.email || null,
        created_at: m.member_joined_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const activeLoadsCount = Number(m.active_loads_count) || 0;
      const workloadLevel = calculateWorkloadLevel(activeLoadsCount, DEFAULT_WORKLOAD_THRESHOLDS);
      const workloadPercentage = Math.min(
        100,
        Math.round((activeLoadsCount / CAPACITY_BASELINE_LOADS) * 100)
      );

      // Hydrate drilldown loads matching strictly on member.user_id
      const assignedLoads = allLoads.filter((l) => {
        if (l.assigned_team_assignments && l.assigned_team_assignments.length > 0) {
          return l.assigned_team_assignments.some((a) => a.user_id === m.user_id);
        }
        if (l.assigned_team && l.assigned_team.length > 0) {
          return l.assigned_team.some((tm) => tm.user_id === m.user_id);
        }
        return false;
      });

      return {
        member,
        activeLoadsCount,
        pendingLoadsCount: Number(m.pending_loads_count) || 0,
        inProgressLoadsCount: Number(m.in_progress_loads_count) || 0,
        deliveredLoadsCount: Number(m.delivered_loads_count) || 0,
        invoicedLoadsCount: Number(m.invoiced_loads_count) || 0,
        paidLoadsCount: Number(m.paid_loads_count) || 0,
        totalAssignedLoadsCount: Number(m.total_assigned_loads_count) || 0,
        workloadLevel,
        workloadPercentage,
        lastActivityAt: m.last_activity_at || null,
        assignedLoads,
      };
    });

    const activeLoads = allLoads.filter((l) =>
      ACTIVE_PIPELINE_STATUSES.includes(l.pipeline_status as PipelineStatus)
    );

    const unassignedLoads = activeLoads.filter((l) => {
      const count = l.assigned_team_assignments?.length ?? (l.assigned_team ? l.assigned_team.length : 0);
      return count === 0;
    });

    const overloadedMembersCount = summaries.filter(
      (s) => s.workloadLevel === 'very_high' || s.workloadLevel === 'high'
    ).length;

    const totalActiveAssignmentsCount = Number(rpcData.total_active_assignments_count) || 0;
    const totalEligibleMembers = Number(rpcData.total_eligible_members) || summaries.length;

    const stats: OrganizationWorkloadStats = {
      totalEligibleMembers,
      totalUniqueActiveLoads: Number(rpcData.total_unique_active_loads) || 0,
      assignedActiveLoadsCount: Number(rpcData.assigned_active_loads_count) || 0,
      unassignedActiveLoadsCount: Number(rpcData.unassigned_active_loads_count) || unassignedLoads.length,
      totalActiveAssignmentsCount,
      averageActiveLoadsPerMember:
        totalEligibleMembers > 0
          ? Math.round((totalActiveAssignmentsCount / totalEligibleMembers) * 10) / 10
          : 0,
      overloadedMembersCount,
    };

    const filteredSummaries = this.applyFiltersAndSorting(summaries, filters);

    return {
      stats,
      summaries: filteredSummaries,
      unassignedLoads,
    };
  }

  /**
   * Aggregates member metrics and organization-wide stats from hydrated entities.
   */
  private processWorkloadFromRawData(
    organizationId: string,
    teamMembers: TeamMember[],
    allLoads: LoadWithRelations[],
    filters?: WorkloadFilterCriteria
  ): WorkloadOverviewResponse {
    // 1. Identify active loads
    const activeLoads = allLoads.filter((l) =>
      ACTIVE_PIPELINE_STATUSES.includes(l.pipeline_status as PipelineStatus)
    );

    // 2. Identify unassigned active loads
    const unassignedLoads = activeLoads.filter((l) => {
      const count = l.assigned_team_assignments?.length ?? (l.assigned_team ? l.assigned_team.length : 0);
      return count === 0;
    });

    // 3. Compute unique active loads vs active assignment relationships
    const totalUniqueActiveLoads = activeLoads.length;
    const unassignedActiveLoadsCount = unassignedLoads.length;
    const assignedActiveLoads = activeLoads.filter((l) => {
      const count = l.assigned_team_assignments?.length ?? (l.assigned_team ? l.assigned_team.length : 0);
      return count > 0;
    });
    const assignedActiveLoadsCount = assignedActiveLoads.length;

    // Total relationship assignments = sum of all team member assignments on active loads
    const totalActiveAssignmentsCount = activeLoads.reduce((sum, l) => {
      const count = l.assigned_team_assignments?.length ?? (l.assigned_team ? l.assigned_team.length : 0);
      return sum + count;
    }, 0);

    // 4. Calculate member-specific workload summaries
    const summaries: TeamMemberWorkloadSummary[] = teamMembers.map((member) => {
      const memberUserId = member.user_id;

      // Filter all unique loads assigned to this specific member:
      // STRICTLY match on user_id = load_team_assignments.user_id
      const memberAssignedLoads = allLoads.filter((l) => {
        if (l.assigned_team_assignments && l.assigned_team_assignments.length > 0) {
          return l.assigned_team_assignments.some((a) => a.user_id === memberUserId);
        }
        if (l.assigned_team && l.assigned_team.length > 0) {
          return l.assigned_team.some((tm) => tm.user_id === memberUserId);
        }
        return false;
      });

      // Break down by statuses for this member
      const memberActiveLoads = memberAssignedLoads.filter((l) =>
        ACTIVE_PIPELINE_STATUSES.includes(l.pipeline_status as PipelineStatus)
      );

      const pendingLoadsCount = memberAssignedLoads.filter((l) =>
        PENDING_PIPELINE_STATUSES.includes(l.pipeline_status as PipelineStatus)
      ).length;

      const inProgressLoadsCount = memberAssignedLoads.filter((l) =>
        IN_PROGRESS_PIPELINE_STATUSES.includes(l.pipeline_status as PipelineStatus)
      ).length;

      const deliveredLoadsCount = memberAssignedLoads.filter(
        (l) => l.pipeline_status === 'delivered'
      ).length;

      const invoicedLoadsCount = memberAssignedLoads.filter(
        (l) => l.pipeline_status === 'invoiced'
      ).length;

      const paidLoadsCount = memberAssignedLoads.filter(
        (l) => l.pipeline_status === 'paid'
      ).length;

      // Active Assigned Loads = UNIQUE active load IDs assigned to the team member
      const activeLoadsCount = memberActiveLoads.length;
      const totalAssignedLoadsCount = memberAssignedLoads.length;

      const workloadLevel = calculateWorkloadLevel(activeLoadsCount, DEFAULT_WORKLOAD_THRESHOLDS);
      const workloadPercentage = Math.min(
        100,
        Math.round((activeLoadsCount / CAPACITY_BASELINE_LOADS) * 100)
      );

      // Derive last activity timestamp from member's loads
      let lastActivityAt: string | null = null;
      if (memberAssignedLoads.length > 0) {
        const sortedByDate = [...memberAssignedLoads].sort((a, b) => {
          const tA = new Date(a.updated_at || a.created_at).getTime();
          const tB = new Date(b.updated_at || b.created_at).getTime();
          return tB - tA;
        });
        lastActivityAt = sortedByDate[0].updated_at || sortedByDate[0].created_at;
      }

      return {
        member,
        activeLoadsCount,
        pendingLoadsCount,
        inProgressLoadsCount,
        deliveredLoadsCount,
        invoicedLoadsCount,
        paidLoadsCount,
        totalAssignedLoadsCount,
        workloadLevel,
        workloadPercentage,
        lastActivityAt,
        assignedLoads: memberAssignedLoads,
      };
    });

    // 5. Overloaded count (Very High workload >= 12 active loads)
    const overloadedMembersCount = summaries.filter(
      (s) => s.workloadLevel === 'very_high' || s.workloadLevel === 'high'
    ).length;

    const averageActiveLoadsPerMember =
      teamMembers.length > 0
        ? Math.round((totalActiveAssignmentsCount / teamMembers.length) * 10) / 10
        : 0;

    const stats: OrganizationWorkloadStats = {
      totalEligibleMembers: teamMembers.length,
      totalUniqueActiveLoads,
      assignedActiveLoadsCount,
      unassignedActiveLoadsCount,
      totalActiveAssignmentsCount,
      averageActiveLoadsPerMember,
      overloadedMembersCount,
    };

    const filteredSummaries = this.applyFiltersAndSorting(summaries, filters);

    return {
      stats,
      summaries: filteredSummaries,
      unassignedLoads,
    };
  }

  /**
   * Applies filtering and sorting criteria across team member workload summaries.
   */
  private applyFiltersAndSorting(
    summaries: TeamMemberWorkloadSummary[],
    filters?: WorkloadFilterCriteria
  ): TeamMemberWorkloadSummary[] {
    let filteredSummaries = [...summaries];

    if (filters) {
      if (filters.search && filters.search.trim()) {
        const query = filters.search.toLowerCase().trim();
        filteredSummaries = filteredSummaries.filter((s) => {
          const name = (s.member.full_name || '').toLowerCase();
          const email = (s.member.email || '').toLowerCase();
          const phone = (s.member.phone || '').toLowerCase();
          const role = s.member.role.toLowerCase();
          return (
            name.includes(query) ||
            email.includes(query) ||
            phone.includes(query) ||
            role.includes(query)
          );
        });
      }

      if (filters.role && filters.role !== 'all') {
        filteredSummaries = filteredSummaries.filter(
          (s) => s.member.role === filters.role
        );
      }

      if (filters.workloadLevel && filters.workloadLevel !== 'all') {
        filteredSummaries = filteredSummaries.filter(
          (s) => s.workloadLevel === filters.workloadLevel
        );
      }

      if (filters.assignmentStatus && filters.assignmentStatus !== 'all') {
        if (filters.assignmentStatus === 'has_active') {
          filteredSummaries = filteredSummaries.filter((s) => s.activeLoadsCount > 0);
        } else if (filters.assignmentStatus === 'no_active') {
          filteredSummaries = filteredSummaries.filter((s) => s.activeLoadsCount === 0);
        }
      }

      if (filters.loadStatus && filters.loadStatus !== 'all') {
        filteredSummaries = filteredSummaries.filter((s) =>
          s.assignedLoads.some((l) => l.pipeline_status === filters.loadStatus)
        );
      }

      // Sorting
      const sortBy = filters.sortBy || 'active_loads';
      const isAsc = filters.sortOrder === 'asc';

      filteredSummaries.sort((a, b) => {
        let cmp = 0;
        switch (sortBy) {
          case 'name':
            cmp = (a.member.full_name || '').localeCompare(b.member.full_name || '');
            break;
          case 'role':
            cmp = a.member.role.localeCompare(b.member.role);
            break;
          case 'active_loads':
            cmp = a.activeLoadsCount - b.activeLoadsCount;
            break;
          case 'pending':
            cmp = a.pendingLoadsCount - b.pendingLoadsCount;
            break;
          case 'in_progress':
            cmp = a.inProgressLoadsCount - b.inProgressLoadsCount;
            break;
          case 'delivered':
            cmp = a.deliveredLoadsCount - b.deliveredLoadsCount;
            break;
          case 'workload':
            cmp = a.activeLoadsCount - b.activeLoadsCount;
            break;
          case 'last_activity':
            const timeA = a.lastActivityAt ? new Date(a.lastActivityAt).getTime() : 0;
            const timeB = b.lastActivityAt ? new Date(b.lastActivityAt).getTime() : 0;
            cmp = timeA - timeB;
            break;
          default:
            cmp = a.activeLoadsCount - b.activeLoadsCount;
        }
        return isAsc ? cmp : -cmp;
      });
    } else {
      // Default sort by active_loads DESC so highest workload appears first
      filteredSummaries.sort((a, b) => b.activeLoadsCount - a.activeLoadsCount);
    }

    return filteredSummaries;
  }

  /**
   * Retrieves all loads assigned to a specific member with full relations.
   */
  async getMemberLoads(
    organizationId: string,
    userId: string
  ): Promise<LoadWithRelations[]> {
    return loadService.getLoads(organizationId, {
      assignedMemberId: userId,
    });
  }

  /**
   * Retrieves all unassigned active loads for quick bulk assignment.
   */
  async getUnassignedLoads(organizationId: string): Promise<LoadWithRelations[]> {
    const allLoads = await loadService.getLoads(organizationId, {
      assignedMemberId: 'unassigned',
    });
    return allLoads.filter((l) =>
      ACTIVE_PIPELINE_STATUSES.includes(l.pipeline_status as PipelineStatus)
    );
  }
}

export const workloadService = new WorkloadService();
