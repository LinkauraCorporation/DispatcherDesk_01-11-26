import React from 'react';
import { DriverStatus } from '../../types/domain.types.ts';
import { DriverWithRelations, formatDriverPayRate, DRIVER_PAY_TYPE_OPTIONS } from './driverTypes.ts';
import { Modal } from '../../components/common/Modal.tsx';
import { StatusBadge } from '../../components/common/StatusBadge.tsx';
import { formatInTimezone, DEFAULT_OPERATIONAL_TIMEZONE } from '../../lib/timezones.ts';
import { useAuth } from '../../contexts/AuthContext.tsx';
import {
  User,
  Building2,
  Truck as TruckIcon,
  Phone,
  Mail,
  DollarSign,
  Calendar,
  Clock,
  Edit2,
  Trash2,
  FileText,
  CheckCircle2,
  Package,
  Radio,
  Activity,
  AlertCircle,
  Power,
  MapPin,
} from 'lucide-react';

interface DriverDetailModalProps {
  driver: DriverWithRelations | null;
  isOpen: boolean;
  onClose: () => void;
  onEdit: (driver: DriverWithRelations) => void;
  onChangeStatus: (driver: DriverWithRelations, newStatus: DriverStatus) => void;
  onDelete?: (driver: DriverWithRelations) => void;
  canEdit: boolean;
  canDelete: boolean;
  isUpdatingStatus?: boolean;
}

export const DriverDetailModal: React.FC<DriverDetailModalProps> = ({
  driver,
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

  if (!driver) return null;

  const timezone = activeOrganization?.primary_timezone || DEFAULT_OPERATIONAL_TIMEZONE;
  const payTypeOption = DRIVER_PAY_TYPE_OPTIONS.find((opt) => opt.value === driver.pay_type);

  return (
    <Modal
      id={`driver-detail-modal-${driver.id}`}
      isOpen={isOpen}
      onClose={onClose}
      title={driver.full_name}
      subtitle={`Fleet Driver Profile • ${payTypeOption?.label || driver.pay_type}`}
      maxWidth="2xl"
    >
      <div className="space-y-6 text-xs text-slate-300">
        {/* Top Header Card */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl bg-slate-950/70 border border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-950/60 border border-indigo-800/50 flex items-center justify-center text-indigo-400 shrink-0">
              <User className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-slate-100">
                  {driver.full_name}
                </span>
                <StatusBadge status={driver.status} type="driver" size="sm" />
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {driver.client ? driver.client.company_name : 'Unassigned / Independent Carrier'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
            {canEdit && (
              <>
                <button
                  id="driver-detail-edit-btn"
                  onClick={() => onEdit(driver)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold border border-slate-700 transition-colors cursor-pointer"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  <span>Edit Profile</span>
                </button>

                {/* Status Switchers */}
                {driver.status !== 'available' && (
                  <button
                    onClick={() => onChangeStatus(driver, 'available')}
                    disabled={isUpdatingStatus}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-950/40 hover:bg-emerald-900/50 text-emerald-300 font-semibold border border-emerald-800/60 transition-colors cursor-pointer disabled:opacity-50 text-[11px]"
                  >
                    <CheckCircle2 className="w-3 h-3" />
                    <span>Set Available</span>
                  </button>
                )}
                {driver.status !== 'on_load' && (
                  <button
                    onClick={() => onChangeStatus(driver, 'on_load')}
                    disabled={isUpdatingStatus}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-purple-950/40 hover:bg-purple-900/50 text-purple-300 font-semibold border border-purple-800/60 transition-colors cursor-pointer disabled:opacity-50 text-[11px]"
                  >
                    <Package className="w-3 h-3" />
                    <span>Set On Load</span>
                  </button>
                )}
                {driver.status !== 'off_duty' && (
                  <button
                    onClick={() => onChangeStatus(driver, 'off_duty')}
                    disabled={isUpdatingStatus}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-950/40 hover:bg-amber-900/50 text-amber-300 font-semibold border border-amber-800/60 transition-colors cursor-pointer disabled:opacity-50 text-[11px]"
                  >
                    <Power className="w-3 h-3" />
                    <span>Set Off Duty</span>
                  </button>
                )}
              </>
            )}

            {canDelete && onDelete && (
              <button
                id="driver-detail-delete-btn"
                onClick={() => onDelete(driver)}
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
          {/* Driver Contact & Identity */}
          <div className="p-4 rounded-xl bg-slate-950/40 border border-slate-800/80 space-y-3">
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 border-b border-slate-800/60 pb-2">
              <User className="w-3.5 h-3.5 text-indigo-400" />
              Contact & Identity
            </h4>

            <div className="space-y-2">
              <div>
                <span className="text-slate-500 block text-[11px]">Primary Phone</span>
                {driver.phone ? (
                  <div className="inline-flex items-center gap-1.5 text-slate-200 font-mono mt-0.5">
                    <Phone className="w-3.5 h-3.5 text-slate-400" />
                    <a href={`tel:${driver.phone}`} className="hover:text-indigo-400 hover:underline">
                      {driver.phone}
                    </a>
                  </div>
                ) : (
                  <span className="text-slate-500">No phone provided</span>
                )}
              </div>

              <div>
                <span className="text-slate-500 block text-[11px]">Email Address</span>
                {driver.email ? (
                  <div className="inline-flex items-center gap-1.5 text-slate-200 mt-0.5 break-all">
                    <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <a href={`mailto:${driver.email}`} className="hover:text-indigo-400 hover:underline">
                      {driver.email}
                    </a>
                  </div>
                ) : (
                  <span className="text-slate-500">No email on file</span>
                )}
              </div>

              <div>
                <span className="text-slate-500 block text-[11px]">Duty Status</span>
                <div className="mt-1">
                  <StatusBadge status={driver.status} type="driver" size="sm" />
                </div>
              </div>

              <div>
                <span className="text-slate-500 block text-[11px]">Mobile Portal Account</span>
                <div className="mt-1">
                  {driver.user_id ? (
                    <div>
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-950/50 border border-emerald-800/40 px-2 py-0.5 rounded">
                        <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                        Active & Linked (Phone OTP Verified)
                      </span>
                    </div>
                  ) : driver.phone ? (
                    <div className="space-y-1">
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-400 bg-indigo-950/40 border border-indigo-800/40 px-2 py-0.5 rounded">
                        <Phone className="w-3 h-3 text-indigo-400" />
                        Awaiting Phone Login (Driver authenticates with mobile phone)
                      </span>
                      <p className="text-[10px] text-slate-400">
                        Driver authenticates using mobile number {driver.phone}.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-400 bg-amber-950/40 border border-amber-800/40 px-2 py-0.5 rounded">
                        <AlertCircle className="w-3 h-3 text-amber-400" />
                        Phone Required (Add phone number to enable Driver Portal access)
                      </span>
                      <p className="text-[10px] text-slate-400">
                        Add a phone number to enable Driver Portal access.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Carrier & Assigned Power Unit */}
          <div className="p-4 rounded-xl bg-slate-950/40 border border-slate-800/80 space-y-3">
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 border-b border-slate-800/60 pb-2">
              <TruckIcon className="w-3.5 h-3.5 text-indigo-400" />
              Carrier & Assigned Power Unit
            </h4>

            <div className="space-y-2">
              {/* Carrier */}
              <div>
                <span className="text-slate-500 block text-[11px]">Carrier Client</span>
                {driver.client ? (
                  <div className="flex items-center gap-2 mt-0.5">
                    <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="font-semibold text-slate-200">{driver.client.company_name}</span>
                    <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px] uppercase font-mono">
                      {driver.client.client_type === 'owner_operator' ? 'Owner-Op' : 'Fleet'}
                    </span>
                  </div>
                ) : (
                  <span className="text-slate-500">Unassigned to carrier</span>
                )}
              </div>

              {/* Assigned Truck */}
              <div>
                <span className="text-slate-500 block text-[11px]">Assigned Power Unit</span>
                {driver.assigned_truck ? (
                  <div className="mt-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-slate-100">
                        Unit #{driver.assigned_truck.truck_number}
                      </span>
                      <StatusBadge status={driver.assigned_truck.status} type="truck" size="sm" />
                    </div>
                    <p className="text-[11px] text-slate-400 capitalize">
                      {driver.assigned_truck.equipment_type.replace(/_/g, ' ')}
                    </p>
                    {(driver.assigned_truck.current_location_city || driver.assigned_truck.current_location_state) && (
                      <div className="inline-flex items-center gap-1 text-slate-400 text-[11px]">
                        <MapPin className="w-3 h-3 text-indigo-400" />
                        <span>
                          {[driver.assigned_truck.current_location_city, driver.assigned_truck.current_location_state]
                            .filter(Boolean)
                            .join(', ')}
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="mt-1 p-2 bg-slate-900 border border-slate-800 rounded-lg text-slate-400 text-[11px]">
                    No truck currently assigned (Standby / Relief)
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Compensation / Pay Agreement Card */}
        <div className="p-4 rounded-xl bg-slate-950/40 border border-slate-800/80 space-y-3">
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 border-b border-slate-800/60 pb-2">
            <DollarSign className="w-3.5 h-3.5 text-indigo-400" />
            Compensation & Pay Agreement
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <span className="text-slate-500 block text-[11px]">Pay Structure</span>
              <span className="font-medium text-slate-200 mt-0.5 block">
                {payTypeOption?.label || driver.pay_type}
              </span>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {payTypeOption?.description}
              </p>
            </div>

            <div>
              <span className="text-slate-500 block text-[11px]">Contract Rate</span>
              <div className="text-base font-bold font-mono text-indigo-400 mt-0.5">
                {formatDriverPayRate(driver.pay_type, driver.pay_rate)}
              </div>
              <p className="text-[10px] text-slate-500 mt-0.5">
                Applied automatically in future load financial settlement calculations
              </p>
            </div>
          </div>
        </div>

        {/* Operational & Dispatcher Notes */}
        {driver.notes && (
          <div className="p-4 rounded-xl bg-slate-950/40 border border-slate-800/80 space-y-2">
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 border-b border-slate-800/60 pb-2">
              <FileText className="w-3.5 h-3.5 text-indigo-400" />
              Operational & Dispatcher Notes
            </h4>
            <p className="text-slate-300 leading-relaxed whitespace-pre-wrap">
              {driver.notes}
            </p>
          </div>
        )}

        {/* Structural Placeholders for Subsequent Pipeline Phases (No Mock Data Generated) */}
        <div className="space-y-3">
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Pipeline & Operational Tracking
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Current Load Section */}
            <div className="p-3 rounded-lg bg-slate-950/40 border border-slate-800/60 flex flex-col justify-between">
              <div className="flex items-center gap-2 text-slate-300 font-medium">
                <Package className="w-4 h-4 text-slate-500" />
                <span>Current Dispatched Load</span>
              </div>
              <div className="mt-2 text-[11px] text-slate-500">
                Active load booking & tracking connects in <span className="text-indigo-400 font-semibold">Phase 2D</span>
              </div>
            </div>

            {/* Check Calls Section */}
            <div className="p-3 rounded-lg bg-slate-950/40 border border-slate-800/60 flex flex-col justify-between">
              <div className="flex items-center gap-2 text-slate-300 font-medium">
                <Radio className="w-4 h-4 text-slate-500" />
                <span>Recent Check Calls</span>
              </div>
              <div className="mt-2 text-[11px] text-slate-500">
                Geofence GPS & phone check calls connect in subsequent phase
              </div>
            </div>

            {/* Activity Logs Section */}
            <div className="p-3 rounded-lg bg-slate-950/40 border border-slate-800/60 flex flex-col justify-between">
              <div className="flex items-center gap-2 text-slate-300 font-medium">
                <Activity className="w-4 h-4 text-slate-500" />
                <span>Activity & Audit</span>
              </div>
              <div className="mt-2 text-[11px] text-slate-500">
                Change log & compliance audit records connect in Phase 3
              </div>
            </div>
          </div>
        </div>

        {/* Audit Timestamps */}
        <div className="pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between text-[11px] text-slate-500">
          <div className="flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5" />
            <span>Created: {formatInTimezone(driver.created_at, timezone)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            <span>Last Updated: {formatInTimezone(driver.updated_at, timezone)}</span>
          </div>
        </div>
      </div>
    </Modal>
  );
};
