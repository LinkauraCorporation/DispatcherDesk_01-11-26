import React, { useState, useEffect } from 'react';
import { Truck, EquipmentType, TruckStatus, Client } from '../../types/domain.types.ts';
import { Modal } from '../../components/common/Modal.tsx';
import { truckService } from './truckService.ts';
import { AlertCircle, CheckCircle2 } from 'lucide-react';

export interface TruckModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (truck: Truck, isEdit: boolean) => void;
  truckToEdit?: Truck | null;
  organizationId: string;
  clients: Client[];
  initialValues?: Partial<Truck> | null;
  zIndex?: string;
}

export const EQUIPMENT_TYPE_OPTIONS: { value: EquipmentType; label: string }[] = [
  { value: 'dry_van', label: "53' Dry Van" },
  { value: 'reefer', label: "53' Reefer (Refrigerated)" },
  { value: 'flatbed', label: "48'/53' Flatbed" },
  { value: 'step_deck', label: 'Step Deck / Drop Deck' },
  { value: 'power_only', label: 'Power Only (Tractor Unit)' },
  { value: 'box_truck', label: "26' Box Truck (Straight)" },
  { value: 'hotshot', label: "40' Hotshot (Gooseneck)" },
];

export const TruckModal: React.FC<TruckModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  truckToEdit,
  organizationId,
  clients,
  initialValues,
  zIndex,
}) => {
  const isEdit = Boolean(truckToEdit);

  // Form Fields
  const [truckNumber, setTruckNumber] = useState('');
  const [clientId, setClientId] = useState('');
  const [equipmentType, setEquipmentType] = useState<EquipmentType>('dry_van');
  const [vin, setVin] = useState('');
  const [maxWeightLbs, setMaxWeightLbs] = useState('');
  const [currentCity, setCurrentCity] = useState('');
  const [currentState, setCurrentState] = useState('');
  const [status, setStatus] = useState<TruckStatus>('active');
  const [notes, setNotes] = useState('');

  // Submission & Validation States
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (isOpen) {
      setFormError(null);
      setFieldErrors({});

      if (truckToEdit) {
        setTruckNumber(truckToEdit.truck_number || '');
        setClientId(truckToEdit.client_id || '');
        setEquipmentType(truckToEdit.equipment_type || 'dry_van');
        setVin(truckToEdit.vin || '');
        setMaxWeightLbs(
          truckToEdit.max_weight_lbs !== null && truckToEdit.max_weight_lbs !== undefined
            ? truckToEdit.max_weight_lbs.toString()
            : ''
        );
        setCurrentCity(truckToEdit.current_location_city || '');
        setCurrentState(truckToEdit.current_location_state || '');
        setStatus(truckToEdit.status || 'active');
        setNotes(truckToEdit.notes || '');
      } else {
        setTruckNumber(initialValues?.truck_number || '');
        // Default to provided client_id or first active client if available
        setClientId(initialValues?.client_id || (clients.length > 0 ? clients[0].id : ''));
        setEquipmentType(initialValues?.equipment_type || 'dry_van');
        setVin(initialValues?.vin || '');
        setMaxWeightLbs(
          initialValues?.max_weight_lbs !== null && initialValues?.max_weight_lbs !== undefined
            ? String(initialValues.max_weight_lbs)
            : '45000'
        );
        setCurrentCity(initialValues?.current_location_city || '');
        setCurrentState(initialValues?.current_location_state || '');
        setStatus(initialValues?.status || 'active');
        setNotes(initialValues?.notes || '');
      }
    }
  }, [isOpen, truckToEdit, clients, initialValues]);

  const validate = (): boolean => {
    const errors: Record<string, string> = {};

    if (!truckNumber.trim()) {
      errors.truckNumber = 'Truck / Unit number is required';
    }

    if (!clientId) {
      errors.clientId = 'Carrier client selection is required';
    }

    if (!equipmentType) {
      errors.equipmentType = 'Equipment type is required';
    }

    if (maxWeightLbs.trim() !== '') {
      const weight = parseInt(maxWeightLbs, 10);
      if (isNaN(weight) || weight < 0) {
        errors.maxWeightLbs = 'Maximum payload capacity must be a non-negative number';
      }
    }

    if (currentState.trim() && currentState.trim().length > 2) {
      errors.currentState = 'State must be a 2-letter abbreviation (e.g. TX, IL, CA)';
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

    if (!organizationId) {
      setFormError('Active organization context missing. Please re-authenticate.');
      return;
    }

    setIsSubmitting(true);

    try {
      const parsedWeight = maxWeightLbs.trim() !== '' ? parseInt(maxWeightLbs, 10) : null;
      const cleanCity = currentCity.trim() || null;
      const cleanState = currentState.trim().toUpperCase() || null;
      const cleanVin = vin.trim() || null;
      const cleanNotes = notes.trim() || null;

      const payload = {
        client_id: clientId,
        truck_number: truckNumber.trim(),
        equipment_type: equipmentType,
        vin: cleanVin,
        max_weight_lbs: parsedWeight,
        current_location_city: cleanCity,
        current_location_state: cleanState,
        status,
        notes: cleanNotes,
      };

      if (isEdit && truckToEdit) {
        const data = await truckService.updateTruck(organizationId, truckToEdit.id, payload);
        onSuccess(data, true);
        onClose();
      } else {
        const data = await truckService.createTruck(organizationId, payload);
        onSuccess(data, false);
        onClose();
      }
    } catch (err: unknown) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : typeof err === 'object' && err !== null && 'message' in err
          ? String((err as { message: unknown }).message)
          : 'Failed to save truck unit. Please check permissions and try again.';
      setFormError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      id="truck-modal"
      isOpen={isOpen}
      onClose={onClose}
      title={isEdit ? `Edit Truck Unit #${truckToEdit?.truck_number}` : 'Add Truck Unit / Power Unit'}
      subtitle={
        isEdit
          ? 'Update equipment specs, assigned carrier client, and staging location'
          : 'Register a power unit or trailer under your dispatch organization'
      }
      maxWidth="lg"
      zIndex={zIndex}
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        {formError && (
          <div
            id="truck-form-error"
            className="p-3 bg-rose-950/50 border border-rose-800/80 rounded-lg text-rose-200 flex items-start gap-2"
          >
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-xs">Error Saving Truck</p>
              <p className="text-[11px] text-rose-300 mt-0.5">{formError}</p>
            </div>
          </div>
        )}

        {/* Carrier Client & Unit Number */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-slate-300 font-medium mb-1">
              Carrier Client (Owner / Fleet) <span className="text-rose-400">*</span>
            </label>
            {clients.length === 0 ? (
              <div className="p-2 bg-amber-950/40 border border-amber-800/60 rounded-lg text-[11px] text-amber-300">
                No carrier clients found in this organization. Please add a Carrier Client first.
              </div>
            ) : (
              <select
                id="truck-client-select"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                className={`w-full px-3 py-2 bg-slate-950 border rounded-lg text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer ${
                  fieldErrors.clientId ? 'border-rose-500' : 'border-slate-800'
                }`}
              >
                <option value="" disabled>
                  -- Select Carrier Client --
                </option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id} className="bg-slate-900 text-slate-200">
                    {c.company_name} ({c.client_type === 'owner_operator' ? 'Owner-Op' : 'Fleet'})
                  </option>
                ))}
              </select>
            )}
            {fieldErrors.clientId && (
              <p className="text-[11px] text-rose-400 mt-1">{fieldErrors.clientId}</p>
            )}
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1">
              Truck / Unit Number <span className="text-rose-400">*</span>
            </label>
            <input
              id="truck-number-input"
              type="text"
              placeholder="e.g. 101, T-500, UNIT-7"
              value={truckNumber}
              onChange={(e) => setTruckNumber(e.target.value)}
              className={`w-full px-3 py-2 bg-slate-950 border rounded-lg text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 font-mono ${
                fieldErrors.truckNumber ? 'border-rose-500' : 'border-slate-800'
              }`}
            />
            {fieldErrors.truckNumber && (
              <p className="text-[11px] text-rose-400 mt-1">{fieldErrors.truckNumber}</p>
            )}
          </div>
        </div>

        {/* Equipment Type & Status */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-slate-300 font-medium mb-1">
              Equipment Type <span className="text-rose-400">*</span>
            </label>
            <select
              id="truck-equipment-select"
              value={equipmentType}
              onChange={(e) => setEquipmentType(e.target.value as EquipmentType)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer"
            >
              {EQUIPMENT_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value} className="bg-slate-900 text-slate-200">
                  {opt.label}
                </option>
              ))}
            </select>
            {fieldErrors.equipmentType && (
              <p className="text-[11px] text-rose-400 mt-1">{fieldErrors.equipmentType}</p>
            )}
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1">
              Operational Status <span className="text-rose-400">*</span>
            </label>
            <select
              id="truck-status-select"
              value={status}
              onChange={(e) => setStatus(e.target.value as TruckStatus)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer"
            >
              <option value="active" className="bg-slate-900 text-slate-200">
                Active / Ready for Dispatch
              </option>
              <option value="maintenance" className="bg-slate-900 text-slate-200">
                In Shop / Scheduled Maintenance
              </option>
              <option value="inactive" className="bg-slate-900 text-slate-200">
                Inactive / Parked
              </option>
            </select>
          </div>
        </div>

        {/* VIN & Max Payload Capacity */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-slate-300 font-medium mb-1">
              VIN (Vehicle Identification Number)
            </label>
            <input
              id="truck-vin-input"
              type="text"
              placeholder="17-character VIN"
              value={vin}
              onChange={(e) => setVin(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 font-mono uppercase"
            />
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1">
              Max Payload Capacity (lbs)
            </label>
            <input
              id="truck-max-weight-input"
              type="number"
              min="0"
              step="100"
              placeholder="e.g. 45000"
              value={maxWeightLbs}
              onChange={(e) => setMaxWeightLbs(e.target.value)}
              className={`w-full px-3 py-2 bg-slate-950 border rounded-lg text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 font-mono ${
                fieldErrors.maxWeightLbs ? 'border-rose-500' : 'border-slate-800'
              }`}
            />
            {fieldErrors.maxWeightLbs && (
              <p className="text-[11px] text-rose-400 mt-1">{fieldErrors.maxWeightLbs}</p>
            )}
          </div>
        </div>

        {/* Staging Location (City & State) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2">
            <label className="block text-slate-300 font-medium mb-1">
              Current Staging City
            </label>
            <input
              id="truck-city-input"
              type="text"
              placeholder="e.g. Dallas, Chicago, Atlanta"
              value={currentCity}
              onChange={(e) => setCurrentCity(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1">
              State Code (2-letter)
            </label>
            <input
              id="truck-state-input"
              type="text"
              maxLength={2}
              placeholder="TX"
              value={currentState}
              onChange={(e) => setCurrentState(e.target.value)}
              className={`w-full px-3 py-2 bg-slate-950 border rounded-lg text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 font-mono uppercase ${
                fieldErrors.currentState ? 'border-rose-500' : 'border-slate-800'
              }`}
            />
            {fieldErrors.currentState && (
              <p className="text-[11px] text-rose-400 mt-1">{fieldErrors.currentState}</p>
            )}
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-slate-300 font-medium mb-1">
            Equipment & Dispatch Notes
          </label>
          <textarea
            id="truck-notes-textarea"
            rows={3}
            placeholder="Special trailer dimensions (e.g. 102in wide, vented), liftgate equipped, inspection due dates..."
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
            id="truck-submit-btn"
            type="submit"
            disabled={isSubmitting || (clients.length === 0 && !isEdit)}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors cursor-pointer disabled:opacity-50 shadow-sm"
          >
            {isSubmitting ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                <span>{isEdit ? 'Updating Unit...' : 'Saving Unit...'}</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>{isEdit ? 'Update Truck Unit' : 'Save Truck Unit'}</span>
              </>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
};
