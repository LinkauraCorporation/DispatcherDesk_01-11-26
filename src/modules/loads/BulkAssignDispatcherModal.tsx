import React, { useState, useEffect } from 'react';
import {
  Users,
  UserCheck,
  AlertCircle,
  Loader2,
  Shield,
  UserX,
  CheckCircle2,
  Plus,
  RefreshCw,
  Check,
} from 'lucide-react';
import { Modal } from '../../components/common/Modal.tsx';
import { LoadWithRelations } from './loadTypes.ts';
import { TeamMember } from '../../types/domain.types.ts';
import { teamService } from '../team/teamService.ts';
import { loadService } from './loadService.ts';
import { useAuth } from '../../contexts/AuthContext.tsx';

function formatRoleLabel(role: string): string {
  switch (role) {
    case 'owner_admin':
      return 'Admin';
    case 'dispatcher':
      return 'Dispatcher';
    case 'staff':
      return 'Staff';
    default:
      return role.charAt(0).toUpperCase() + role.slice(1);
  }
}

interface BulkAssignTeamMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedLoads: LoadWithRelations[];
  selectedLoadIds?: string[];
  organizationId?: string;
  onAssigned: (count: number, assigneeName: string | null) => void;
}

export const BulkAssignTeamMemberModal: React.FC<BulkAssignTeamMemberModalProps> = ({
  isOpen,
  onClose,
  selectedLoads,
  onAssigned,
}) => {
  const { activeOrganization, user, profile } = useAuth();
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [assignmentMode, setAssignmentMode] = useState<'add' | 'replace'>('add');
  const [isUnassignAll, setIsUnassignAll] = useState<boolean>(false);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const orgId = activeOrganization?.id || 'demo-org-1';

  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    setIsLoadingMembers(true);
    setError(null);
    setSelectedMemberIds([]);
    setAssignmentMode('add');
    setIsUnassignAll(false);

    teamService
      .getTeamMembers(orgId)
      .then((members) => {
        if (!isMounted) return;
        // Eligible operational team members: owner_admin, dispatcher, staff
        const eligible = members.filter(
          (m) =>
            (m.role === 'owner_admin' || m.role === 'dispatcher' || m.role === 'staff') &&
            (m as any).status !== 'inactive'
        );
        // Sort by role precedence (Admin, Dispatcher, Staff) then name
        const roleWeight: Record<string, number> = {
          owner_admin: 1,
          dispatcher: 2,
          staff: 3,
        };
        eligible.sort((a, b) => {
          const wDiff = (roleWeight[a.role] || 99) - (roleWeight[b.role] || 99);
          if (wDiff !== 0) return wDiff;
          return (a.full_name || '').localeCompare(b.full_name || '');
        });

        setTeamMembers(eligible);
      })
      .catch((err) => {
        if (!isMounted) return;
        console.error('[BulkAssignTeamMemberModal] Error loading team members:', err);
        setError('Failed to load operational team members. Please try again.');
      })
      .finally(() => {
        if (isMounted) setIsLoadingMembers(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, orgId]);

  if (!isOpen) return null;

  const toggleMemberSelection = (id: string) => {
    setIsUnassignAll(false);
    setSelectedMemberIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    setIsUnassignAll(false);
    setSelectedMemberIds(teamMembers.map((m) => m.user_id || m.id));
  };

  const handleClearSelection = () => {
    setSelectedMemberIds([]);
  };

  const handleToggleUnassignAll = () => {
    if (!isUnassignAll) {
      setIsUnassignAll(true);
      setSelectedMemberIds([]);
      setAssignmentMode('replace');
    } else {
      setIsUnassignAll(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedLoads.length === 0) return;
    if (!isUnassignAll && selectedMemberIds.length === 0) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const loadIds = selectedLoads.map((l) => l.id);
      const actorName = profile?.full_name || user?.email || 'Admin';
      const actorId = user?.id || 'usr-admin';

      const targetIds = isUnassignAll ? [] : selectedMemberIds;
      const targetMode = isUnassignAll ? 'replace' : assignmentMode;

      const result = await loadService.bulkAssignLoadsToTeamMembers(
        orgId,
        loadIds,
        targetIds,
        targetMode,
        actorName,
        actorId
      );

      const assignedNames = result.assignedMembers?.map((m) => m.full_name) || [];
      const summaryName =
        assignedNames.length === 0
          ? null
          : assignedNames.length === 1
          ? assignedNames[0]
          : `${assignedNames[0]} +${assignedNames.length - 1} team members`;

      const updatedTotal = result.updatedCount ?? result.updatedLoadsCount ?? selectedLoads.length;
      onAssigned(updatedTotal, summaryName);
      onClose();
    } catch (err: any) {
      console.error('[BulkAssignTeamMemberModal] Bulk assignment failed:', err);
      setError(err.message || 'Failed to complete team assignment.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedTeamMembers = teamMembers.filter((m) =>
    selectedMemberIds.includes(m.user_id)
  );

  return (
    <Modal
      id="bulk-assign-team-member-modal"
      isOpen={isOpen}
      onClose={onClose}
      title="Assign Loads to Team"
      subtitle={`Configure operational team assignment for ${selectedLoads.length} selected ${
        selectedLoads.length === 1 ? 'load' : 'loads'
      }`}
      maxWidth="xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        {error && (
          <div
            id="bulk-assign-error-alert"
            className="p-3.5 rounded-lg bg-rose-950/40 border border-rose-800/50 text-rose-300 flex items-start gap-2"
          >
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {/* Selected Loads Preview */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-400">
            <span>Selected Loads ({selectedLoads.length})</span>
            <span>Route & Current Assignees</span>
          </div>
          <div className="max-h-32 overflow-y-auto divide-y divide-slate-800/60 rounded-lg border border-slate-800 bg-slate-950/70 font-sans">
            {selectedLoads.map((load) => {
              const currentTeam = load.assigned_team || [];
              return (
                <div
                  key={load.id}
                  id={`bulk-preview-load-${load.id}`}
                  className="flex items-center justify-between p-2.5 text-xs text-slate-300"
                >
                  <div className="flex items-center space-x-2">
                    <span className="font-mono font-bold text-slate-100">
                      {load.load_number}
                    </span>
                    <span className="text-slate-500">•</span>
                    <span className="text-slate-400 text-[11px]">
                      {load.origin_city}, {load.origin_state} → {load.dest_city}, {load.dest_state}
                    </span>
                  </div>
                  <div className="flex items-center space-x-1.5 text-right">
                    {currentTeam.length > 0 ? (
                      <span className="inline-flex items-center gap-1 rounded bg-indigo-950/80 px-2 py-0.5 text-[11px] font-medium text-indigo-300 border border-indigo-800/60">
                        <UserCheck className="h-3 w-3 text-indigo-400" />
                        {currentTeam.map((m) => m.full_name).slice(0, 2).join(', ')}
                        {currentTeam.length > 2 && ` +${currentTeam.length - 2}`}
                      </span>
                    ) : load.dispatcher_profile ? (
                      <span className="inline-flex items-center gap-1 rounded bg-indigo-950/80 px-2 py-0.5 text-[11px] font-medium text-indigo-300 border border-indigo-800/60">
                        <UserCheck className="h-3 w-3 text-indigo-400" />
                        {load.dispatcher_profile.full_name}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded bg-slate-800/80 px-2 py-0.5 text-[11px] font-medium text-slate-400 border border-slate-700/60">
                        <UserX className="h-3 w-3 text-slate-500" />
                        Unassigned
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Assignment Mode Toggle */}
        <div className="space-y-1.5">
          <label className="block text-slate-300 font-medium text-xs">
            Assignment Action
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              id="btn-mode-add"
              onClick={() => {
                setAssignmentMode('add');
                setIsUnassignAll(false);
              }}
              className={`flex items-start gap-2.5 p-2.5 rounded-lg border text-left transition cursor-pointer ${
                assignmentMode === 'add' && !isUnassignAll
                  ? 'bg-indigo-950/40 border-indigo-500 text-indigo-200'
                  : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700'
              }`}
            >
              <div className={`mt-0.5 p-1 rounded ${assignmentMode === 'add' && !isUnassignAll ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
                <Plus className="w-3.5 h-3.5" />
              </div>
              <div>
                <div className="font-semibold text-slate-100 text-xs">Add Team Members</div>
                <div className="text-[11px] text-slate-400">Append chosen members alongside existing assignees</div>
              </div>
            </button>

            <button
              type="button"
              id="btn-mode-replace"
              onClick={() => setAssignmentMode('replace')}
              className={`flex items-start gap-2.5 p-2.5 rounded-lg border text-left transition cursor-pointer ${
                assignmentMode === 'replace'
                  ? 'bg-indigo-950/40 border-indigo-500 text-indigo-200'
                  : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700'
              }`}
            >
              <div className={`mt-0.5 p-1 rounded ${assignmentMode === 'replace' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
                <RefreshCw className="w-3.5 h-3.5" />
              </div>
              <div>
                <div className="font-semibold text-slate-100 text-xs">Replace Team</div>
                <div className="text-[11px] text-slate-400">Overwrite current assignees with the selected members</div>
              </div>
            </button>
          </div>
        </div>

        {/* Operational Team Member Selection (Multi-select) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-slate-300 font-medium flex items-center gap-1.5 text-xs">
              <Users className="w-3.5 h-3.5 text-slate-400" />
              <span>Select Team Members to Assign ({selectedMemberIds.length} selected)</span>
            </label>
            <div className="flex items-center space-x-2 text-[11px]">
              <button
                type="button"
                onClick={handleSelectAll}
                className="text-indigo-400 hover:text-indigo-300 font-medium transition cursor-pointer"
              >
                Select All
              </button>
              <span className="text-slate-600">•</span>
              <button
                type="button"
                onClick={handleClearSelection}
                className="text-slate-400 hover:text-slate-300 font-medium transition cursor-pointer"
              >
                Clear
              </button>
            </div>
          </div>

          {isLoadingMembers ? (
            <div className="flex items-center justify-center space-x-2 rounded-lg border border-slate-800 bg-slate-950 p-4 text-xs text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin text-indigo-400" />
              <span>Loading operational team members...</span>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="max-h-48 overflow-y-auto divide-y divide-slate-800/50 rounded-lg border border-slate-800 bg-slate-950/70 p-1">
                {teamMembers.map((member) => {
                  const mId = member.user_id;
                  const isSelected = selectedMemberIds.includes(mId);
                  return (
                    <div
                      key={mId}
                      onClick={() => toggleMemberSelection(mId)}
                      className={`flex items-center justify-between p-2 rounded cursor-pointer transition select-none ${
                        isSelected
                          ? 'bg-indigo-950/40 border border-indigo-500/40 text-slate-100'
                          : 'hover:bg-slate-900/60 text-slate-300'
                      }`}
                    >
                      <div className="flex items-center space-x-2.5">
                        <div
                          className={`w-4 h-4 rounded border flex items-center justify-center transition shrink-0 ${
                            isSelected
                              ? 'bg-indigo-600 border-indigo-500 text-white'
                              : 'border-slate-600 bg-slate-900'
                          }`}
                        >
                          {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                        </div>
                        <div>
                          <div className="font-semibold text-xs text-slate-100">
                            {member.full_name}
                          </div>
                          <div className="text-[11px] text-slate-400">
                            {member.email} {member.phone ? `• ${member.phone}` : ''}
                          </div>
                        </div>
                      </div>

                      <span className="inline-flex items-center gap-1 rounded bg-slate-800/80 px-2 py-0.5 text-[10px] font-medium text-slate-300 border border-slate-700/60 shrink-0">
                        <Shield className="h-2.5 w-2.5" />
                        {formatRoleLabel(member.role)}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Clear / Unassign Option */}
              <button
                type="button"
                id="btn-toggle-unassign-all"
                onClick={handleToggleUnassignAll}
                className={`w-full p-2 rounded-lg border text-left text-xs transition cursor-pointer flex items-center justify-between ${
                  isUnassignAll
                    ? 'bg-amber-950/40 border-amber-500/60 text-amber-200'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-2">
                  <UserX className={`w-4 h-4 ${isUnassignAll ? 'text-amber-400' : 'text-slate-500'}`} />
                  <span className="font-medium">
                    {isUnassignAll ? '⚠️ Selected: Unassign all team members from chosen loads' : 'Remove all team members from chosen loads (Unassign)'}
                  </span>
                </div>
                {isUnassignAll && (
                  <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wider">
                    Active
                  </span>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Selected Summary Card */}
        {selectedTeamMembers.length > 0 && !isUnassignAll && (
          <div className="p-3 rounded-lg border border-indigo-500/30 bg-indigo-950/20 space-y-1.5">
            <div className="flex items-center gap-1.5 text-emerald-300 text-xs font-semibold">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>
                {selectedLoads.length} {selectedLoads.length === 1 ? 'load' : 'loads'} will {assignmentMode === 'add' ? 'have' : 'be assigned to'}:
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {selectedTeamMembers.map((m) => (
                <span
                  key={m.user_id || m.id}
                  className="inline-flex items-center gap-1 rounded bg-indigo-900/70 border border-indigo-700/60 px-2 py-0.5 text-[11px] font-medium text-indigo-200"
                >
                  <Shield className="w-2.5 h-2.5 text-indigo-400" />
                  {m.full_name} ({formatRoleLabel(m.role)})
                </span>
              ))}
            </div>
            <div className="text-[11px] text-slate-400 italic pt-0.5">
              {assignmentMode === 'add'
                ? 'These members will be added alongside any currently assigned team members.'
                : 'All existing team assignments on the selected loads will be replaced by these members.'}
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-800">
          <button
            id="btn-cancel-bulk-assign"
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer border border-slate-700/50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            id="btn-confirm-bulk-assign"
            type="submit"
            disabled={
              isSubmitting ||
              selectedLoads.length === 0 ||
              (!isUnassignAll && selectedMemberIds.length === 0)
            }
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition disabled:opacity-50 cursor-pointer shadow-sm ${
              isUnassignAll
                ? 'bg-amber-600 hover:bg-amber-500 text-white'
                : 'bg-indigo-600 hover:bg-indigo-500 text-white'
            }`}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Assigning Team...</span>
              </>
            ) : isUnassignAll ? (
              <>
                <UserX className="w-3.5 h-3.5" />
                <span>Unassign {selectedLoads.length} {selectedLoads.length === 1 ? 'Load' : 'Loads'}</span>
              </>
            ) : (
              <>
                <UserCheck className="w-3.5 h-3.5" />
                <span>
                  {assignmentMode === 'add' ? 'Add' : 'Set'} {selectedMemberIds.length} {selectedMemberIds.length === 1 ? 'Member' : 'Members'} on {selectedLoads.length} {selectedLoads.length === 1 ? 'Load' : 'Loads'}
                </span>
              </>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
};

// Backward-compatible alias
export const BulkAssignDispatcherModal = BulkAssignTeamMemberModal;
export type BulkAssignDispatcherModalProps = BulkAssignTeamMemberModalProps;


