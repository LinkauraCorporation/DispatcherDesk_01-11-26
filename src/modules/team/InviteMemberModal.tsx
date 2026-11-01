import React, { useState, useEffect } from 'react';
import {
  UserPlus,
  Mail,
  Shield,
  AlertTriangle,
  CheckCircle2,
  Copy,
  Check,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { Modal } from '../../components/common/Modal.tsx';
import { UserRole, TeamInvitation } from '../../types/domain.types.ts';
import { teamService } from './teamService.ts';
import { useAuth } from '../../contexts/AuthContext.tsx';
import { supabase } from '../../lib/supabase.ts';

interface InviteMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInvitationCreated?: (invitation: TeamInvitation) => void;
  initialRole?: UserRole;
  initialDriverId?: string | null;
  initialEmail?: string | null;
}

export const InviteMemberModal: React.FC<InviteMemberModalProps> = ({
  isOpen,
  onClose,
  onInvitationCreated,
  initialRole,
  initialEmail,
}) => {
  const { activeOrganization, user, userRole } = useAuth();
  const isOwnerAdmin = userRole === 'owner_admin' || userRole === null;

  const defaultRole: UserRole = initialRole && initialRole !== 'driver' ? initialRole : 'dispatcher';
  const [email, setEmail] = useState(initialEmail || '');
  const [role, setRole] = useState<UserRole>(defaultRole);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [createdInvite, setCreatedInvite] = useState<{
    invitation: TeamInvitation;
    inviteUrl: string;
    rawToken: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  // Sync props when opening modal
  useEffect(() => {
    if (isOpen) {
      setEmail(initialEmail || '');
      setRole(initialRole && initialRole !== 'driver' ? initialRole : 'dispatcher');
      setErrorMessage(null);
      setCreatedInvite(null);
      setCopied(false);
      setIsLoading(false);
    }
  }, [isOpen, initialEmail, initialRole]);

  const resetForm = () => {
    setEmail('');
    setRole('dispatcher');
    setErrorMessage(null);
    setCreatedInvite(null);
    setCopied(false);
    setIsLoading(false);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeOrganization?.id) {
      setErrorMessage('Active organization not found.');
      return;
    }

    setErrorMessage(null);
    setIsLoading(true);

    try {
      const result = await teamService.createInvitation(
        activeOrganization.id,
        email.trim(),
        role,
        user?.id,
        userRole,
        null
      );

      setCreatedInvite(result);

      const { error: emailError } = await supabase.functions.invoke('send-team-invitation', {
        body: {
          email: result.invitation.email,
          organizationName: activeOrganization.name,
          role: result.invitation.role,
          inviteUrl: result.inviteUrl,
          expiresAt: result.invitation.expires_at,
        },
      });

      if (emailError) {
        console.error('Invitation created but email failed:', emailError);
        setErrorMessage('Invitation created, but the email could not be sent. You can still share the secure invitation link below.');
      }
      if (onInvitationCreated) {
        onInvitationCreated(result.invitation);
      }
    } catch (err: any) {
      console.error('Failed to create team invitation:', err);
      setErrorMessage(err.message || 'Failed to generate invitation.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyLink = async () => {
    if (!createdInvite?.inviteUrl) return;
    try {
      await navigator.clipboard.writeText(createdInvite.inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
    }
  };

  return (
    <Modal
      id="invite-team-member-modal"
      isOpen={isOpen}
      onClose={handleClose}
      title={createdInvite ? 'Team Invitation Ready' : 'Invite Team Member'}
      subtitle={
        createdInvite
          ? `Invitation link created for ${activeOrganization?.name || 'organization'}`
          : `Send secure onboarding link to join ${activeOrganization?.name || 'your organization'}`
      }
      maxWidth="md"
    >
      {createdInvite ? (
        /* Success & Link View */
        <div className="space-y-4 text-xs">
          <div className="p-3.5 rounded-lg bg-emerald-950/40 border border-emerald-800/60 text-emerald-200 flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-emerald-100 text-sm">
                Invitation Generated Successfully
              </p>
              <p className="text-emerald-300/90 mt-0.5 leading-relaxed">
                An invitation for <strong className="text-white">{createdInvite.invitation.email}</strong> with the <strong className="text-white">{createdInvite.invitation.role}</strong> role has been created.
              </p>
            </div>
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between text-slate-400">
              <span className="font-medium">Secure Invitation Link</span>
              <span className="text-[11px] text-amber-400 bg-amber-950/60 border border-amber-800/40 px-2 py-0.5 rounded">
                Expires in 7 days
              </span>
            </div>

            <div className="flex items-center gap-2">
              <input
                id="input-invitation-url"
                type="text"
                readOnly
                value={createdInvite.inviteUrl}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 font-mono text-[11px] select-all focus:outline-none"
              />
              <button
                id="btn-copy-invitation-link"
                type="button"
                onClick={handleCopyLink}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition shrink-0 cursor-pointer"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    Copy Link
                  </>
                )}
              </button>
            </div>

            <p className="text-[11px] text-slate-400 leading-relaxed">
              Share this single-use link with the invitee. When they open the link, they will authenticate with <span className="font-mono text-slate-300">{createdInvite.invitation.email}</span> to join the fleet workspace.
            </p>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-800">
            <button
              id="btn-invite-another"
              type="button"
              onClick={resetForm}
              className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
            >
              Invite Another Member
            </button>
            <button
              id="btn-done-inviting"
              type="button"
              onClick={handleClose}
              className="px-4 py-2 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      ) : (
        /* Invitation Creation Form */
        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {errorMessage && (
            <div className="p-3 bg-rose-950/40 border border-rose-800/50 rounded-lg text-rose-300 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Role Selection */}
          <div>
            <label className="block text-slate-300 font-medium mb-1 flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-slate-400" />
              <span>Assigned Organization Role *</span>
            </label>
            <select
              id="select-invite-role"
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:border-indigo-500 transition font-medium"
            >
              <option value="dispatcher">Dispatcher — Full Operational Dispatch & Paperwork</option>
              <option value="staff">Staff — Read-Only & Document Check-in</option>
              {isOwnerAdmin && (
                <option value="owner_admin">Owner / Admin — Full Org & Team Control</option>
              )}
            </select>
          </div>

          {/* Email Input */}
          <div>
            <label className="block text-slate-300 font-medium mb-1 flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-slate-400" />
              <span>Invitee Email Address *</span>
            </label>
            <input
              id="input-invite-email"
              type="email"
              required
              placeholder="e.g. colleague@logistics.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 transition"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              A single-use link will be generated. The recipient must authenticate with this email.
            </p>
          </div>

          {/* Warning for Owner/Admin */}
          {role === 'owner_admin' && (
            <div className="p-3 bg-amber-950/40 border border-amber-800/60 rounded-lg text-amber-200 text-xs flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <strong className="text-amber-100 block">Owner / Admin Warning:</strong>
                Assigning this role gives full administrative control, including inviting and removing team members, changing roles, and modifying company settings.
              </div>
            </div>
          )}

          <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-3 space-y-1 text-slate-400 text-[11px]">
            <div className="flex justify-between">
              <span>Organization:</span>
              <span className="text-slate-200 font-medium">{activeOrganization?.name || 'Current Organization'}</span>
            </div>
            <div className="flex justify-between">
              <span>Validity:</span>
              <span className="text-slate-200 font-medium">7 Days (Single Use)</span>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={handleClose}
              disabled={isLoading}
              className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              id="btn-submit-invitation"
              type="submit"
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition disabled:opacity-50 cursor-pointer"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Generating...</span>
                </>
              ) : (
                <>
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Send Invitation</span>
                </>
              )}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
};

