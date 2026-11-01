import React from 'react';
import { Client } from '../../types/domain.types.ts';
import { Modal } from '../../components/common/Modal.tsx';
import { formatInTimezone, DEFAULT_OPERATIONAL_TIMEZONE } from '../../lib/timezones.ts';
import { useAuth } from '../../contexts/AuthContext.tsx';
import {
  Building2,
  Mail,
  Phone,
  DollarSign,
  MapPin,
  Truck,
  Users,
  Package,
  Calendar,
  Clock,
  Edit2,
  Power,
  Trash2,
  FileText,
  ShieldAlert,
  Activity,
  CheckCircle2,
  Info,
} from 'lucide-react';

interface ClientDetailModalProps {
  client: Client | null;
  isOpen: boolean;
  onClose: () => void;
  onEdit: (client: Client) => void;
  onToggleStatus: (client: Client) => void;
  onDelete?: (client: Client) => void;
  canEdit: boolean;
  canDelete: boolean;
  isUpdatingStatus?: boolean;
}

export const ClientDetailModal: React.FC<ClientDetailModalProps> = ({
  client,
  isOpen,
  onClose,
  onEdit,
  onToggleStatus,
  onDelete,
  canEdit,
  canDelete,
  isUpdatingStatus = false,
}) => {
  const { activeOrganization } = useAuth();

  if (!client) return null;

  const timezone = activeOrganization?.primary_timezone || DEFAULT_OPERATIONAL_TIMEZONE;
  const isInactive = client.status === 'inactive';
  const isFleet = client.client_type === 'fleet';

  return (
    <Modal
      id={`client-detail-modal-${client.id}`}
      isOpen={isOpen}
      onClose={onClose}
      title={client.company_name}
      subtitle={`Client Account Record • ${isFleet ? 'Small Fleet (Multi-Unit)' : 'Owner-Operator (Single Unit)'}`}
      maxWidth="2xl"
    >
      <div className="space-y-5 text-xs text-slate-300">
        {/* Top Header Card */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl bg-slate-950/80 border border-slate-800 shadow-xs">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${
                isFleet
                  ? 'bg-cyan-950/60 border-cyan-800/50 text-cyan-400'
                  : 'bg-indigo-950/60 border-indigo-800/50 text-indigo-400'
              }`}
            >
              {isFleet ? <Truck className="w-5 h-5" /> : <Building2 className="w-5 h-5" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-slate-100">{client.company_name}</span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${
                    isInactive
                      ? 'bg-slate-800 text-slate-400 border border-slate-700'
                      : 'bg-emerald-950/50 text-emerald-300 border border-emerald-800/60'
                  }`}
                >
                  {client.status}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5 font-mono tabular-nums">
                Account ID: {client.id}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
            {canEdit && (
              <>
                <button
                  id="client-detail-edit-btn"
                  onClick={() => {
                    onEdit(client);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold border border-slate-700 transition-colors cursor-pointer"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  <span>Edit</span>
                </button>

                <button
                  id="client-detail-toggle-status-btn"
                  onClick={() => onToggleStatus(client)}
                  disabled={isUpdatingStatus}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-semibold border transition-colors cursor-pointer disabled:opacity-50 ${
                    isInactive
                      ? 'bg-emerald-950/40 hover:bg-emerald-900/50 text-emerald-300 border-emerald-800/60'
                      : 'bg-amber-950/40 hover:bg-amber-900/50 text-amber-300 border-amber-800/60'
                  }`}
                >
                  <Power className="w-3.5 h-3.5" />
                  <span>{isInactive ? 'Reactivate' : 'Deactivate'}</span>
                </button>
              </>
            )}

            {canDelete && onDelete && (
              <button
                id="client-detail-delete-btn"
                onClick={() => onDelete(client)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-950/40 hover:bg-rose-900/50 text-rose-300 font-semibold border border-rose-800/60 transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete</span>
              </button>
            )}
          </div>
        </div>

        {/* 2-Column Operational Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Contact & Billing Roster */}
          <div className="p-4 rounded-xl bg-slate-950/40 border border-slate-800/80 space-y-3 shadow-xs">
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 border-b border-slate-800/60 pb-2">
              <Users className="w-3.5 h-3.5 text-indigo-400" />
              Contact & Invoicing Roster
            </h4>

            <div className="space-y-2.5">
              <div>
                <span className="text-slate-500 block text-[11px]">Primary Contact</span>
                <span className="font-medium text-slate-200">
                  {client.contact_name || '—'}
                </span>
              </div>

              <div>
                <span className="text-slate-500 block text-[11px]">Phone</span>
                {client.contact_phone ? (
                  <a
                    href={`tel:${client.contact_phone}`}
                    className="text-indigo-400 hover:text-indigo-300 font-mono tabular-nums inline-flex items-center gap-1.5 hover:underline bg-indigo-950/30 px-2 py-0.5 rounded-md border border-indigo-800/30"
                  >
                    <Phone className="w-3 h-3" />
                    {client.contact_phone}
                  </a>
                ) : (
                  <span className="text-slate-500 font-mono tabular-nums">—</span>
                )}
              </div>

              <div>
                <span className="text-slate-500 block text-[11px]">Contact Email</span>
                {client.contact_email ? (
                  <a
                    href={`mailto:${client.contact_email}`}
                    className="text-indigo-400 hover:text-indigo-300 inline-flex items-center gap-1.5 hover:underline break-all"
                  >
                    <Mail className="w-3 h-3 shrink-0" />
                    {client.contact_email}
                  </a>
                ) : (
                  <span className="text-slate-500">—</span>
                )}
              </div>

              <div>
                <span className="text-slate-500 block text-[11px]">Billing / Factoring Email</span>
                {client.billing_email ? (
                  <a
                    href={`mailto:${client.billing_email}`}
                    className="text-slate-200 hover:text-indigo-300 inline-flex items-center gap-1.5 hover:underline break-all font-mono"
                  >
                    <Mail className="w-3 h-3 shrink-0 text-slate-400" />
                    {client.billing_email}
                  </a>
                ) : (
                  <span className="text-slate-500 font-mono">—</span>
                )}
              </div>
            </div>
          </div>

          {/* Dispatch Operational Targets */}
          <div className="p-4 rounded-xl bg-slate-950/40 border border-slate-800/80 space-y-3 shadow-xs">
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 border-b border-slate-800/60 pb-2">
              <Truck className="w-3.5 h-3.5 text-indigo-400" />
              Dispatch Operational Targets
            </h4>

            <div className="space-y-2.5">
              <div>
                <span className="text-slate-500 block text-[11px]">Target Minimum RPM</span>
                {client.minimum_rate_per_mile !== null && client.minimum_rate_per_mile !== undefined ? (
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="font-mono tabular-nums text-emerald-400 font-bold text-base">
                      ${client.minimum_rate_per_mile.toFixed(2)}
                    </span>
                    <span className="text-[11px] text-slate-400">/ mile minimum baseline</span>
                  </div>
                ) : (
                  <span className="text-slate-500 font-mono">No target rate configured</span>
                )}
              </div>

              <div>
                <span className="text-slate-500 block text-[11px]">Preferred Equipment</span>
                <span className="text-slate-200 font-medium">
                  {client.preferred_equipment || 'Any standard equipment'}
                </span>
              </div>

              <div>
                <span className="text-slate-500 block text-[11px]">Preferred Regional Lanes</span>
                <span className="text-slate-200">
                  {client.preferred_lanes || 'Any regional / OTR lanes'}
                </span>
              </div>

              <div>
                <span className="text-slate-500 block text-[11px]">Account Classification</span>
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-mono font-semibold border ${
                    isFleet
                      ? 'bg-cyan-950/60 text-cyan-300 border-cyan-800/50'
                      : 'bg-indigo-950/60 text-indigo-300 border-indigo-800/50'
                  }`}
                >
                  {isFleet ? 'Small Fleet (Multi-Truck)' : 'Owner-Operator (1 Truck)'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Operational Overview & Notes */}
        <div className="p-4 rounded-xl bg-slate-950/40 border border-slate-800/80 space-y-2 shadow-xs">
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 border-b border-slate-800/60 pb-2">
            <FileText className="w-3.5 h-3.5 text-indigo-400" />
            Dispatcher Operational Notes
          </h4>
          {client.notes ? (
            <p className="text-slate-300 leading-relaxed whitespace-pre-wrap">
              {client.notes}
            </p>
          ) : (
            <p className="text-slate-500 italic">
              No special operational instructions, home-time requirements, or factoring notes recorded for this carrier client.
            </p>
          )}
        </div>

        {/* Operational Dispatch Status Summary */}
        <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800/80 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-2.5 h-2.5 rounded-full ${
                isInactive ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'
              }`}
            />
            <div>
              <span className="text-slate-200 font-semibold">
                {isInactive ? 'Client Account is Inactive' : 'Client Account is Active'}
              </span>
              <p className="text-[11px] text-slate-400">
                {isInactive
                  ? 'Carrier is currently suspended from new load assignments and rate bookings.'
                  : 'Carrier is actively eligible for rate matching, load assignments, and rate confirmation extraction.'}
              </p>
            </div>
          </div>
        </div>

        {/* Audit Timestamps */}
        <div className="pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between text-[11px] text-slate-500 font-mono tabular-nums">
          <div className="flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <span>Created: {formatInTimezone(client.created_at, timezone)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span>Last Updated: {formatInTimezone(client.updated_at, timezone)}</span>
          </div>
        </div>
      </div>
    </Modal>
  );
};

