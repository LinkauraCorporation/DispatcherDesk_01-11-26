import React, { useState, useEffect, useMemo } from 'react';
import { DriverPayType, DriverStatus, Client, Truck } from '../../types/domain.types.ts';
import { DriverWithRelations, DRIVER_PAY_TYPE_OPTIONS, DRIVER_STATUS_OPTIONS } from './driverTypes.ts';
import { Modal } from '../../components/common/Modal.tsx';
import { AlertCircle, CheckCircle2, AlertTriangle, Truck as TruckIcon } from 'lucide-react';

export interface DriverInitialValues {
  full_name?: string;
  phone?: string;
  email?: string;
  client_id?: string;
  assigned_truck_id?: string;
  pay_type?: DriverPayType;
  pay_rate?: string | number;
  status?: DriverStatus;
  notes?: string;
}

export interface DriverModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (driver: DriverWithRelations, isEdit: boolean) => void;
  driverToEdit?: DriverWithRelations | null;
  clients: Client[];
  trucks: Truck[];
  allDrivers: DriverWithRelations[];
  onSaveDriver: (input: {
    client_id: string | null;
    assigned_truck_id: string | null;
    full_name: string;
    phone: string | null;
    email: string | null;
    pay_type: DriverPayType;
    pay_rate: number;
    status: DriverStatus;
    notes: string | null;
  }) => Promise<void>;
  initialValues?: DriverInitialValues | null;
  zIndex?: string;
}

export const DriverModal: React.FC<DriverModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  driverToEdit,
  clients,
  trucks,
  allDrivers,
  onSaveDriver,
  initialValues,
  zIndex,
}) => {
  const isEdit = Boolean(driverToEdit);

  // Form Fields
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [clientId, setClientId] = useState('');
  const [assignedTruckId, setAssignedTruckId] = useState('');
  const [payType, setPayType] = useState<DriverPayType>('percentage_gross');
  const [payRate, setPayRate] = useState('25');
  const [status, setStatus] = useState<DriverStatus>('available');
  const [notes, setNotes] = useState('');

  // Reassignment confirmation state
  const [confirmReassignment, setConfirmReassignment] = useState(false);

  // Submission & Validation States
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (isOpen) {
      setFormError(null);
      setFieldErrors({});
      setConfirmReassignment(false);

      if (driverToEdit) {
        setFullName(driverToEdit.full_name || '');
        setPhone(driverToEdit.phone || '');
        setEmail(driverToEdit.email || '');
        setClientId(driverToEdit.client_id || '');
        setAssignedTruckId(driverToEdit.assigned_truck_id || '');
        setPayType(driverToEdit.pay_type || 'percentage_gross');
        setPayRate(driverToEdit.pay_rate !== undefined ? String(driverToEdit.pay_rate) : '25');
        setStatus(driverToEdit.status || 'available');
        setNotes(driverToEdit.notes || '');
      } else {
        setFullName(initialValues?.full_name || '');
        setPhone(initialValues?.phone || '');
        setEmail(initialValues?.email || '');
        setClientId(initialValues?.client_id || (clients.length > 0 ? clients[0].id : ''));
        setAssignedTruckId(initialValues?.assigned_truck_id || '');
        setPayType(initialValues?.pay_type || 'percentage_gross');
        setPayRate(initialValues?.pay_rate !== undefined ? String(initialValues.pay_rate) : '25');
        setStatus(initialValues?.status || 'available');
        setNotes(initialValues?.notes || '');
      }
    }
  }, [isOpen, driverToEdit, clients, initialValues]);

  // Filter trucks by selected client
  const availableTrucksForClient = useMemo(() => {
    if (!clientId) {
      return trucks;
    }
    return trucks.filter((t) => t.client_id === clientId);
  }, [trucks, clientId]);

  // Check if currently selected truck has an existing driver assigned (conflict check)
  const truckConflictDriver = useMemo(() => {
    if (!assignedTruckId) return null;
    return allDrivers.find(
      (d) => d.assigned_truck_id === assignedTruckId && d.id !== driverToEdit?.id
    );
  }, [assignedTruckId, allDrivers, driverToEdit]);

  // Handle client change: automatically clear incompatible truck
  const handleClientChange = (newClientId: string) => {
    setClientId(newClientId);
    if (assignedTruckId) {
      const selectedTruckObj = trucks.find((t) => t.id === assignedTruckId);
      if (selectedTruckObj && newClientId && selectedTruckObj.client_id !== newClientId) {
        setAssignedTruckId('');
        setConfirmReassignment(false);
      }
    }
  };

  const handlePayTypeChange = (newType: DriverPayType) => {
    setPayType(newType);
    if (!driverToEdit) {
      if (newType === 'percentage_gross') {
        setPayRate('25');
      } else if (newType === 'per_mile') {
        setPayRate('0.65');
      } else if (newType === 'flat_rate') {
        setPayRate('1200');
      }
    }
  };

  const validate = (): boolean => {
    const errors: Record<string, string> = {};

    if (!fullName.trim()) {
      errors.fullName = 'Full driver name is required';
    }

    if (phone.trim()) {
      const trimmedPhone = phone.trim();
      if (!trimmedPhone.startsWith('+')) {
        errors.phone = 'Phone number must include country code in E.164 format (e.g. +12145550199)';
      } else {
        const digits = trimmedPhone.substring(1).replace(/\D/g, '');
        if (digits.length < 7 || digits.length > 15 || digits.startsWith('0')) {
          errors.phone = 'Please enter a valid international phone number (7-15 digits, e.g. +12145550199)';
        }
      }
    }

    if (email.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email.trim())) {
        errors.email = 'Please enter a valid email address';
      }
    }

    if (!payType) {
      errors.payType = 'Pay type contract is required';
    }

    if (payRate.trim() === '') {
      errors.payRate = 'Pay rate amount is required';
    } else {
      const rateNum = parseFloat(payRate);
      if (isNaN(rateNum) || rateNum < 0) {
        errors.payRate = 'Pay rate must be a non-negative number';
      } else if (payType === 'percentage_gross' && rateNum > 100) {
        errors.payRate = 'Gross percentage rate cannot exceed 100%';
      }
    }

    if (truckConflictDriver && !confirmReassignment) {
      errors.assignedTruck = `Truck is already assigned to ${truckConflictDriver.full_name}. Please check the reassignment confirmation box below.`;
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!validate()) {
      return;
    }

    setIsSubmitting(true);

    try {
      const canonicalPhone = phone.trim()
        ? '+' + phone.trim().substring(1).replace(/\D/g, '')
        : null;

      const payload = {
        client_id: clientId || null,
        assigned_truck_id: assignedTruckId || null,
        full_name: fullName.trim(),
        phone: canonicalPhone,
        email: email.trim() || null,
        pay_type: payType,
        pay_rate: parseFloat(payRate) || 0,
        status,
        notes: notes.trim() || null,
      };

      await onSaveDriver(payload);
    } catch (err: unknown) {
      const rawMsg =
        err instanceof Error
          ? err.message
          : typeof err === 'object' && err !== null && 'message' in err
          ? String((err as { message: unknown }).message)
          : 'Failed to save driver profile. Please try again.';

      const isPhoneDuplicate =
        (err as any)?.code === '23505' ||
        (err as any)?.field === 'phone' ||
        rawMsg.includes('uq_drivers_active_normalized_phone') ||
        rawMsg.toLowerCase().includes('already registered') ||
        rawMsg.toLowerCase().includes('phone number');

      if (isPhoneDuplicate) {
        setFieldErrors((prev) => ({
          ...prev,
          phone: 'This phone number is already registered to an active driver.',
        }));
        setFormError(
          `Phone number "${phone}" is already assigned to an active driver profile. You can remove the phone number to continue now, or provide a different phone number.`
        );
      } else {
        setFormError(rawMsg);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveWithoutPhone = async () => {
    setPhone('');
    setFieldErrors((prev) => {
      const copy = { ...prev };
      delete copy.phone;
      return copy;
    });
    setFormError(null);
    setIsSubmitting(true);

    try {
      const payload = {
        client_id: clientId || null,
        assigned_truck_id: assignedTruckId || null,
        full_name: fullName.trim(),
        phone: null,
        email: email.trim() || null,
        pay_type: payType,
        pay_rate: parseFloat(payRate) || 0,
        status,
        notes: notes.trim() || null,
      };

      await onSaveDriver(payload);
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === 'object' && err !== null && 'message' in err
          ? String((err as { message: unknown }).message)
          : 'Failed to save driver profile. Please try again.';
      setFormError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      id="driver-modal"
      isOpen={isOpen}
      onClose={onClose}
      title={isEdit ? `Edit Driver Profile: ${driverToEdit?.full_name}` : 'Add Driver Profile'}
      subtitle={
        isEdit
          ? 'Update driver contact info, carrier affiliation, assigned power unit, and pay contract'
          : 'Register a company driver or owner-operator under your dispatch organization'
      }
      maxWidth="lg"
      zIndex={zIndex}
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        {formError && (
          <div
            id="driver-form-error"
            className="p-3 bg-rose-950/50 border border-rose-800/80 rounded-lg text-rose-200 flex items-start gap-2"
          >
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold text-xs">Error Saving Driver</p>
              <p className="text-[11px] text-rose-300 mt-0.5">{formError}</p>
              {fieldErrors.phone && (
                <div className="mt-2.5 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSaveWithoutPhone}
                    disabled={isSubmitting}
                    className="px-2.5 py-1 text-[11px] font-semibold bg-rose-800 hover:bg-rose-700 text-white rounded border border-rose-600 transition-colors cursor-pointer"
                  >
                    Save Without Phone Number
                  </button>
                  <span className="text-[10px] text-rose-300">
                    You can add or update the phone number later.
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Full Name & Status */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-slate-300 font-medium mb-1">
              Full Driver Name <span className="text-rose-400">*</span>
            </label>
            <input
              id="driver-fullname-input"
              type="text"
              placeholder="e.g. Marcus Vance, Elena Rodriguez"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className={`w-full px-3 py-2 bg-slate-950 border rounded-lg text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 ${
                fieldErrors.fullName ? 'border-rose-500' : 'border-slate-800'
              }`}
            />
            {fieldErrors.fullName && (
              <p className="text-[11px] text-rose-400 mt-1">{fieldErrors.fullName}</p>
            )}
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1">
              Duty / Availability Status <span className="text-rose-400">*</span>
            </label>
            <select
              id="driver-status-select"
              value={status}
              onChange={(e) => setStatus(e.target.value as DriverStatus)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer"
            >
              {DRIVER_STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value} className="bg-slate-900 text-slate-200">
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Phone & Email */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-slate-300 font-medium mb-1">Phone Number (E.164)</label>
            <input
              id="driver-phone-input"
              type="tel"
              placeholder="e.g. +12145550199"
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                if (fieldErrors.phone) {
                  setFieldErrors((prev) => {
                    const copy = { ...prev };
                    delete copy.phone;
                    return copy;
                  });
                }
                if (formError && formError.toLowerCase().includes('phone')) {
                  setFormError(null);
                }
              }}
              className={`w-full px-3 py-2 bg-slate-950 border rounded-lg text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 font-mono ${
                fieldErrors.phone ? 'border-rose-500' : 'border-slate-800'
              }`}
            />
            {fieldErrors.phone ? (
              <p className="text-[11px] text-rose-400 mt-1">{fieldErrors.phone}</p>
            ) : (
              <p className="text-[10px] text-slate-400 mt-0.5">Required for Driver Portal SMS login. Include '+' and country code.</p>
            )}
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1">Email Address</label>
            <input
              id="driver-email-input"
              type="email"
              placeholder="e.g. driver@fleet.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={`w-full px-3 py-2 bg-slate-950 border rounded-lg text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 ${
                fieldErrors.email ? 'border-rose-500' : 'border-slate-800'
              }`}
            />
            {fieldErrors.email && (
              <p className="text-[11px] text-rose-400 mt-1">{fieldErrors.email}</p>
            )}
          </div>
        </div>

        {/* Carrier Client & Truck Assignment (Hierarchical / Cascading) */}
        <div className="p-3.5 bg-slate-950/60 border border-slate-800/80 rounded-xl space-y-3">
          <div className="flex items-center gap-1.5 text-slate-200 font-semibold text-xs border-b border-slate-800/60 pb-2">
            <TruckIcon className="w-4 h-4 text-indigo-400" />
            <span>Carrier & Power Unit Assignment</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Client Selector */}
            <div>
              <label className="block text-slate-300 font-medium mb-1">
                Carrier Client
              </label>
              <select
                id="driver-client-select"
                value={clientId}
                onChange={(e) => handleClientChange(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer"
              >
                <option value="" className="bg-slate-900 text-slate-400">
                  -- Unassigned / Independent --
                </option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id} className="bg-slate-900 text-slate-200">
                    {c.company_name} ({c.client_type === 'owner_operator' ? 'Owner-Op' : 'Fleet'})
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-slate-500 mt-1">
                Selecting a carrier filters available fleet trucks.
              </p>
            </div>

            {/* Assigned Truck Selector */}
            <div>
              <label className="block text-slate-300 font-medium mb-1">
                Assigned Truck Unit
              </label>
              <select
                id="driver-truck-select"
                value={assignedTruckId}
                onChange={(e) => {
                  setAssignedTruckId(e.target.value);
                  setConfirmReassignment(false);
                }}
                className={`w-full px-3 py-2 bg-slate-900 border rounded-lg text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer ${
                  fieldErrors.assignedTruck ? 'border-amber-500' : 'border-slate-800'
                }`}
              >
                <option value="" className="bg-slate-900 text-slate-400">
                  -- No Truck Assigned (Standby) --
                </option>
                {availableTrucksForClient.map((t) => {
                  const location =
                    t.current_location_city || t.current_location_state
                      ? ` (${[t.current_location_city, t.current_location_state].filter(Boolean).join(', ')})`
                      : '';
                  const statusNote = t.status !== 'active' ? ` [${t.status.toUpperCase()}]` : '';
                  return (
                    <option key={t.id} value={t.id} className="bg-slate-900 text-slate-200">
                      Unit #{t.truck_number} • {t.equipment_type.replace(/_/g, ' ')}
                      {location}
                      {statusNote}
                    </option>
                  );
                })}
              </select>

              {availableTrucksForClient.length === 0 && clientId && (
                <p className="text-[10px] text-amber-400 mt-1">
                  No trucks registered for this carrier yet.
                </p>
              )}
            </div>
          </div>

          {/* Conflict Warning & Reassignment Confirmation UX */}
          {truckConflictDriver && (
            <div
              id="driver-reassignment-warning"
              className="p-3 bg-amber-950/40 border border-amber-800/80 rounded-lg text-amber-200 text-xs space-y-2"
            >
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-amber-300">
                    Truck Unit Already Assigned
                  </p>
                  <p className="text-[11px] text-amber-200/90 mt-0.5 leading-relaxed">
                    This truck is currently assigned to{' '}
                    <span className="font-bold text-amber-100">{truckConflictDriver.full_name}</span>.
                    Saving this driver will reassign the truck and set{' '}
                    {truckConflictDriver.full_name}&apos;s assigned truck to Unassigned.
                  </p>
                </div>
              </div>

              <label className="flex items-center gap-2 pt-1 cursor-pointer select-none text-[11px] text-amber-100 font-medium">
                <input
                  id="driver-reassignment-confirm-checkbox"
                  type="checkbox"
                  checked={confirmReassignment}
                  onChange={(e) => setConfirmReassignment(e.target.checked)}
                  className="rounded border-amber-700 bg-amber-950 text-amber-500 focus:ring-amber-500 cursor-pointer"
                />
                <span>Confirm reassignment of this truck unit to this driver</span>
              </label>
              {fieldErrors.assignedTruck && (
                <p className="text-[11px] text-rose-400">{fieldErrors.assignedTruck}</p>
              )}
            </div>
          )}
        </div>

        {/* Pay Contract / Compensation Structure */}
        <div className="p-3.5 bg-slate-950/60 border border-slate-800/80 rounded-xl space-y-3">
          <div className="text-slate-200 font-semibold text-xs border-b border-slate-800/60 pb-2">
            Compensation & Pay Agreement
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 font-medium mb-1">
                Pay Structure Type <span className="text-rose-400">*</span>
              </label>
              <select
                id="driver-paytype-select"
                value={payType}
                onChange={(e) => handlePayTypeChange(e.target.value as DriverPayType)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer"
              >
                {DRIVER_PAY_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value} className="bg-slate-900 text-slate-200">
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1">
                Contract Rate{' '}
                <span className="text-slate-400 text-[11px]">
                  ({payType === 'percentage_gross' ? '%' : payType === 'per_mile' ? '$/mile' : '$ flat'})
                </span>{' '}
                <span className="text-rose-400">*</span>
              </label>
              <div className="relative">
                <input
                  id="driver-payrate-input"
                  type="number"
                  step={payType === 'per_mile' ? '0.01' : '0.5'}
                  min="0"
                  max={payType === 'percentage_gross' ? '100' : undefined}
                  placeholder={payType === 'percentage_gross' ? '25' : payType === 'per_mile' ? '0.65' : '1200'}
                  value={payRate}
                  onChange={(e) => setPayRate(e.target.value)}
                  className={`w-full pl-3 pr-10 py-2 bg-slate-900 border rounded-lg text-slate-200 font-mono focus:outline-none focus:border-indigo-500 ${
                    fieldErrors.payRate ? 'border-rose-500' : 'border-slate-800'
                  }`}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 font-mono text-[11px]">
                  {payType === 'percentage_gross' ? '%' : payType === 'per_mile' ? '$/mi' : 'USD'}
                </span>
              </div>
              {fieldErrors.payRate && (
                <p className="text-[11px] text-rose-400 mt-1">{fieldErrors.payRate}</p>
              )}
            </div>
          </div>
        </div>

        {/* Driver Notes */}
        <div>
          <label className="block text-slate-300 font-medium mb-1">
            Driver & Dispatch Operational Notes
          </label>
          <textarea
            id="driver-notes-textarea"
            rows={2}
            placeholder="CDL endorsements (HazMat, Tanker), preferred corridors, home-time schedule notes..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>

        {/* Action Buttons */}
        <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            id="driver-submit-btn"
            type="submit"
            disabled={isSubmitting}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors cursor-pointer disabled:opacity-50 shadow-sm"
          >
            {isSubmitting ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                <span>{isEdit ? 'Updating Profile...' : 'Saving Profile...'}</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>{isEdit ? 'Update Driver' : 'Save Driver'}</span>
              </>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
};
