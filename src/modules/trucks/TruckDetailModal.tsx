import React from 'react';
import { Truck, EquipmentType, TruckStatus, Client } from '../../types/domain.types.ts';
import { Modal } from '../../components/common/Modal.tsx';
import { StatusBadge } from '../../components/common/StatusBadge.tsx';
import { formatInTimezone, DEFAULT_OPERATIONAL_TIMEZONE } from '../../lib/timezones.ts';
import { useAuth } from '../../contexts/AuthContext.tsx';
import { EQUIPMENT_TYPE_OPTIONS } from './TruckModal.tsx';
import {
  Truck as TruckIcon,
  Building2,
  MapPin,
  Scale,
  Hash,
  Users,
  Package,
  Activity,
  Calendar,
  Clock,
  Edit2,
  Trash2,
  FileText,
  Wrench,
  CheckCircle2,
  AlertCircle,
  Power,
} from 'lucide-react';

export interface TruckWithClient extends Truck {
  client?: Pick<Client, 'id' | 'company_name' | 'client_type' | 'contact_name' | 'contact_phone' | 'contact_email'> | null;
}

interface TruckDetailModalProps {
  truck: TruckWithClient | null;
  isOpen: boolean;
  onClose: () => void;
  onEdit: (truck: TruckWithClient) => void;
  onChangeStatus: (truck: TruckWithClient, newStatus: TruckStatus) => void;
  onDelete?: (truck: TruckWithClient) => void;
  canEdit: boolean;
  canDelete: boolean;
  isUpdatingStatus?: boolean;
}

export const TruckDetailModal: React.FC<TruckDetailModalProps> = ({
  truck,
  isOpen,
  onClose,
  onEdit,
  onChangeStatus,
  onDelete,
  canEdit,
  canDelete,
  isUpdatingStatus = false,
}) => {
  const { activeOrganization } = useAuth();

  if (!truck) return null;

  const timezone = activeOrganization?.primary_timezone || DEFAULT_OPERATIONAL_TIMEZONE;
  const equipmentLabel =
    EQUIPMENT_TYPE_OPTIONS.find((opt) => opt.value === truck.equipment_type)?.label ||
    truck.equipment_type.replace(/_/g, ' ');

  return (
    <Modal
      id={`truck-detail-modal-${truck.id}`}
      isOpen={isOpen}
      onClose={onClose}
      title={`Truck Unit #${truck.truck_number}`}
      subtitle={`Fleet Equipment Profile • ${equipmentLabel}`}
      maxWidth="2xl"
    >
      <div className="space-y-6 text-xs text-slate-300">
        {/* Top Header Card */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl bg-slate-950/70 border border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-950/60 border border-indigo-800/50 flex items-center justify-center text-indigo-400 shrink-0">
              <TruckIcon className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-slate-100 font-mono">
                  #{truck.truck_number}
                </span>
                <StatusBadge status={truck.status} type="truck" size="sm" />
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {equipmentLabel}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
            {canEdit && (
              <>
                <button
                  id="truck-detail-edit-btn"
                  onClick={() => onEdit(truck)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold border border-slate-700 transition-colors cursor-pointer"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  <span>Edit Unit</span>
                </button>

                {/* Status Switcher */}
                {truck.status !== 'active' && (
                  <button
                    onClick={() => onChangeStatus(truck, 'active')}
                    disabled={isUpdatingStatus}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-950/40 hover:bg-emerald-900/50 text-emerald-300 font-semibold border border-emerald-800/60 transition-colors cursor-pointer disabled:opacity-50 text-[11px]"
                  >
                    <CheckCircle2 className="w-3 h-3" />
                    <span>Set Active</span>
                  </button>
                )}
                {truck.status !== 'maintenance' && (
                  <button
                    onClick={() => onChangeStatus(truck, 'maintenance')}
                    disabled={isUpdatingStatus}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-950/40 hover:bg-amber-900/50 text-amber-300 font-semibold border border-amber-800/60 transition-colors cursor-pointer disabled:opacity-50 text-[11px]"
                  >
                    <Wrench className="w-3 h-3" />
                    <span>Set Maintenance</span>
                  </button>
                )}
                {truck.status !== 'inactive' && (
                  <button
                    onClick={() => onChangeStatus(truck, 'inactive')}
                    disabled={isUpdatingStatus}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold border border-slate-700 transition-colors cursor-pointer disabled:opacity-50 text-[11px]"
                  >
                    <Power className="w-3 h-3" />
                    <span>Set Inactive</span>
                  </button>
                )}
              </>
            )}

            {canDelete && onDelete && (
              <button
                id="truck-detail-delete-btn"
                onClick={() => onDelete(truck)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-950/40 hover:bg-rose-900/50 text-rose-300 font-semibold border border-rose-800/60 transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete</span>
              </button>
            )}
          </div>
        </div>

        {/* 2-Column Info Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Carrier Client Assignment */}
          <div className="p-4 rounded-xl bg-slate-950/40 border border-slate-800/80 space-y-3">
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 border-b border-slate-800/60 pb-2">
              <Building2 className="w-3.5 h-3.5 text-indigo-400" />
              Carrier Client Assignment
            </h4>

            {truck.client ? (
              <div className="space-y-2">
                <div>
                  <span className="text-slate-500 block text-[11px]">Carrier / Fleet Customer</span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="font-semibold text-slate-200">
                      {truck.client.company_name}
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px] uppercase font-mono">
                      {truck.client.client_type === 'owner_operator' ? 'Owner-Op' : 'Fleet'}
                    </span>
                  </div>
                </div>

                {truck.client.contact_name && (
                  <div>
                    <span className="text-slate-500 block text-[11px]">Primary Contact</span>
                    <span className="text-slate-300">{truck.client.contact_name}</span>
                  </div>
                )}

                {truck.client.contact_phone && (
                  <div>
                    <span className="text-slate-500 block text-[11px]">Phone</span>
                    <span className="text-slate-300 font-mono">{truck.client.contact_phone}</span>
                  </div>
                )}

                {truck.client.contact_email && (
                  <div>
                    <span className="text-slate-500 block text-[11px]">Email</span>
                    <span className="text-slate-300 break-all">{truck.client.contact_email}</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-3 bg-amber-950/30 border border-amber-800/50 rounded-lg text-amber-300 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Unassigned</p>
                  <p className="text-[11px] text-amber-400/80 mt-0.5">
                    This power unit is not currently linked to an active carrier client.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Equipment Specifications & Staging */}
          <div className="p-4 rounded-xl bg-slate-950/40 border border-slate-800/80 space-y-3">
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 border-b border-slate-800/60 pb-2">
              <Scale className="w-3.5 h-3.5 text-indigo-400" />
              Equipment & Staging Specs
            </h4>

            <div className="space-y-2">
              <div>
                <span className="text-slate-500 block text-[11px]">Equipment Type</span>
                <span className="font-medium text-slate-200">{equipmentLabel}</span>
              </div>

              <div>
                <span className="text-slate-500 block text-[11px]">Max Payload Capacity</span>
                {truck.max_weight_lbs ? (
                  <span className="font-mono text-slate-200 font-bold">
                    {truck.max_weight_lbs.toLocaleString()} lbs
                  </span>
                ) : (
                  <span className="text-slate-500 font-mono">—</span>
                )}
              </div>

              <div>
                <span className="text-slate-500 block text-[11px]">Current Staging Location</span>
                {truck.current_location_city || truck.current_location_state ? (
                  <div className="inline-flex items-center gap-1 text-slate-200 font-medium mt-0.5">
                    <MapPin className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                    <span>
                      {truck.current_location_city || 'Unknown City'}
                      {truck.current_location_state ? `, ${truck.current_location_state}` : ''}
                    </span>
                  </div>
                ) : (
                  <span className="text-slate-500">No staging location recorded</span>
                )}
              </div>

              <div>
                <span className="text-slate-500 block text-[11px]">VIN Number</span>
                {truck.vin ? (
                  <span className="font-mono text-slate-300 uppercase tracking-wider text-[11px]">
                    {truck.vin}
                  </span>
                ) : (
                  <span className="text-slate-500 font-mono">—</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Dispatcher Notes */}
        {truck.notes && (
          <div className="p-4 rounded-xl bg-slate-950/40 border border-slate-800/80 space-y-2">
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 border-b border-slate-800/60 pb-2">
              <FileText className="w-3.5 h-3.5 text-indigo-400" />
              Dispatcher & Equipment Notes
            </h4>
            <p className="text-slate-300 leading-relaxed whitespace-pre-wrap">
              {truck.notes}
            </p>
          </div>
        )}

        {/* Phase 2 Relational Structural Placeholders (Explicitly Not Mock Data) */}
        <div className="space-y-3">
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Associated Operations & Pipeline
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Driver Section */}
            <div className="p-3 rounded-lg bg-slate-950/40 border border-slate-800/60 flex flex-col justify-between">
              <div className="flex items-center gap-2 text-slate-300 font-medium">
                <Users className="w-4 h-4 text-slate-500" />
                <span>Assigned Driver</span>
              </div>
              <div className="mt-2 text-[11px] text-slate-500">
                Driver roster & HOS tracking connects in <span className="text-indigo-400 font-semibold">Phase 2C</span>
              </div>
            </div>

            {/* Current Load Section */}
            <div className="p-3 rounded-lg bg-slate-950/40 border border-slate-800/60 flex flex-col justify-between">
              <div className="flex items-center gap-2 text-slate-300 font-medium">
                <Package className="w-4 h-4 text-slate-500" />
                <span>Current Dispatched Load</span>
              </div>
              <div className="mt-2 text-[11px] text-slate-500">
                Active load tracking connects in <span className="text-indigo-400 font-semibold">Phase 2D</span>
              </div>
            </div>

            {/* Maintenance Log Section */}
            <div className="p-3 rounded-lg bg-slate-950/40 border border-slate-800/60 flex flex-col justify-between">
              <div className="flex items-center gap-2 text-slate-300 font-medium">
                <Activity className="w-4 h-4 text-slate-500" />
                <span>Recent Activity</span>
              </div>
              <div className="mt-2 text-[11px] text-slate-500">
                Maintenance logs & check calls connect in subsequent phase
              </div>
            </div>
          </div>
        </div>

        {/* Audit Timestamps */}
        <div className="pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between text-[11px] text-slate-500">
          <div className="flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5" />
            <span>Created: {formatInTimezone(truck.created_at, timezone)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            <span>Last Updated: {formatInTimezone(truck.updated_at, timezone)}</span>
          </div>
        </div>
      </div>
    </Modal>
  );
};
