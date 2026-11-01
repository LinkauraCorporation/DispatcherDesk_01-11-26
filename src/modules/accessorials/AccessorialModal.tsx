import React, { useState, useEffect, useMemo } from 'react';
import {
  AccessorialClaim,
  AccessorialType,
  AccessorialStatus,
  FacilityStopType,
  CreateAccessorialInput,
  UpdateAccessorialInput,
  ACCESSORIAL_TYPE_CONFIG,
  ACCESSORIAL_STATUS_CONFIG,
} from './accessorialTypes.ts';
import { accessorialService, calculateDetention } from './accessorialService.ts';
import { LoadWithRelations } from '../loads/loadTypes.ts';
import { loadService } from '../loads/loadService.ts';
import { Modal } from '../../components/common/Modal.tsx';
import { useAuth } from '../../contexts/AuthContext.tsx';
import { useTimezone } from '../../contexts/TimezoneContext.tsx';
import { formatCurrency } from '../../lib/calculations.ts';
import { toLocalInputValue, parseInputToIso } from '../../lib/timezones.ts';
import {
  Clock,
  DollarSign,
  AlertCircle,
  CheckCircle2,
  FileText,
  Building2,
  Receipt,
  Truck,
  Timer,
  AlertTriangle,
} from 'lucide-react';

export interface AccessorialModalProps {
  isOpen: boolean;
  onClose: () => void;
  load?: LoadWithRelations | null;
  claimToEdit?: AccessorialClaim | null;
  onSuccess: (claim: AccessorialClaim, isEdit: boolean) => void;
}

export const AccessorialModal: React.FC<AccessorialModalProps> = ({
  isOpen,
  onClose,
  load: preselectedLoad,
  claimToEdit,
  onSuccess,
}) => {
  const { activeOrganization, user, profile, userRole } = useAuth();
  const { operationalTimezone } = useTimezone();
  const orgId = activeOrganization?.id || '';

  const isEdit = Boolean(claimToEdit);
  const canEdit = userRole === 'owner_admin' || userRole === 'dispatcher';

  // Loads list for selector if not preselected
  const [availableLoads, setAvailableLoads] = useState<LoadWithRelations[]>([]);
  const [selectedLoadId, setSelectedLoadId] = useState<string>('');

  // Core Form State
  const [type, setType] = useState<AccessorialType>('detention');
  const [status, setStatus] = useState<AccessorialStatus>('draft');
  const [description, setDescription] = useState<string>('');
  const [amount, setAmount] = useState<string>('75.00');

  // Detention Specific State
  const [facilityType, setFacilityType] = useState<FacilityStopType>('pickup');
  const [facilityName, setFacilityName] = useState<string>('');
  const [facilityAddress, setFacilityAddress] = useState<string>('');
  const [arrivalTime, setArrivalTime] = useState<string>('');
  const [isStillAtDock, setIsStillAtDock] = useState<boolean>(true);
  const [departureTime, setDepartureTime] = useState<string>('');
  const [loadingStartTime, setLoadingStartTime] = useState<string>('');
  const [loadingCompleteTime, setLoadingCompleteTime] = useState<string>('');
  const [unloadingStartTime, setUnloadingStartTime] = useState<string>('');
  const [unloadingCompleteTime, setUnloadingCompleteTime] = useState<string>('');
  const [freeTimeHours, setFreeTimeHours] = useState<string>('2.0');
  const [hourlyRate, setHourlyRate] = useState<string>('75.00');

  // Lumper / Receipt State
  const [paymentMethod, setPaymentMethod] = useState<
    'comchek' | 'efs' | 'credit_card' | 'driver_cash' | 'broker_direct' | 'other'
  >('comchek');
  const [receiptNumber, setReceiptNumber] = useState<string>('');
  const [receiptDocName, setReceiptDocName] = useState<string>('');

  // Broker & Resolution State
  const [brokerName, setBrokerName] = useState<string>('');
  const [brokerContactPerson, setBrokerContactPerson] = useState<string>('');
  const [brokerContactEmail, setBrokerContactEmail] = useState<string>('');
  const [brokerContactPhone, setBrokerContactPhone] = useState<string>('');
  const [rateConRevisionNumber, setRateConRevisionNumber] = useState<string>('');
  const [rejectionReason, setRejectionReason] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load available loads if needed
  useEffect(() => {
    if (isOpen && orgId && !preselectedLoad) {
      loadService
        .getLoads(orgId)
        .then((loads) => {
          setAvailableLoads(loads);
          if (loads.length > 0 && !selectedLoadId) {
            setSelectedLoadId(loads[0].id);
          }
        })
        .catch((err) => console.error('Error fetching loads:', err));
    }
  }, [isOpen, orgId, preselectedLoad, selectedLoadId]);

  // Current active load object
  const activeLoad = useMemo(() => {
    if (preselectedLoad) return preselectedLoad;
    return availableLoads.find((l) => l.id === selectedLoadId) || null;
  }, [preselectedLoad, availableLoads, selectedLoadId]);

  // Reset or populate form
  useEffect(() => {
    if (!isOpen) return;

    setError(null);
    if (claimToEdit) {
      setType(claimToEdit.type);
      setStatus(claimToEdit.status);
      setDescription(claimToEdit.description);
      setAmount(claimToEdit.amount.toString());
      setSelectedLoadId(claimToEdit.load_id);

      if (claimToEdit.detention_details) {
        const det = claimToEdit.detention_details;
        setFacilityType(det.facility_type);
        setFacilityName(det.facility_name || '');
        setArrivalTime(det.arrival_time ? toLocalInputValue(det.arrival_time, operationalTimezone) : '');
        setIsStillAtDock(!det.departure_time);
        setDepartureTime(det.departure_time ? toLocalInputValue(det.departure_time, operationalTimezone) : '');
        setLoadingStartTime(det.loading_start_time ? toLocalInputValue(det.loading_start_time, operationalTimezone) : '');
        setLoadingCompleteTime(det.loading_complete_time ? toLocalInputValue(det.loading_complete_time, operationalTimezone) : '');
        setUnloadingStartTime(det.unloading_start_time ? toLocalInputValue(det.unloading_start_time, operationalTimezone) : '');
        setUnloadingCompleteTime(det.unloading_complete_time ? toLocalInputValue(det.unloading_complete_time, operationalTimezone) : '');
        setFreeTimeHours(det.free_time_hours.toString());
        setHourlyRate(det.hourly_rate.toString());
      }

      setPaymentMethod(claimToEdit.payment_method || 'comchek');
      setReceiptNumber(claimToEdit.receipt_number || '');
      setReceiptDocName(claimToEdit.receipt_doc_name || '');
      setBrokerName(claimToEdit.broker_name || '');
      setBrokerContactPerson(claimToEdit.broker_contact_person || '');
      setBrokerContactEmail(claimToEdit.broker_contact_email || '');
      setBrokerContactPhone(claimToEdit.broker_contact_phone || '');
      setRateConRevisionNumber(claimToEdit.rate_con_revision_number || '');
      setRejectionReason(claimToEdit.rejection_reason || '');
      setNotes(claimToEdit.notes || '');
    } else {
      // New Claim defaults
      setType('detention');
      setStatus('draft');
      setDescription('Detention at receiver dock during unloading.');
      setAmount('75.00');
      setSelectedLoadId(preselectedLoad ? preselectedLoad.id : availableLoads[0]?.id || '');

      const nowLocal = toLocalInputValue(new Date().toISOString(), operationalTimezone);
      const twoHoursAgoLocal = toLocalInputValue(new Date(Date.now() - 3.5 * 3600000).toISOString(), operationalTimezone);
      setArrivalTime(twoHoursAgoLocal);
      setIsStillAtDock(true);
      setDepartureTime(nowLocal);
      setLoadingStartTime('');
      setLoadingCompleteTime('');
      setUnloadingStartTime('');
      setUnloadingCompleteTime('');
      setFreeTimeHours('2.0');
      setHourlyRate('75.00');

      if (preselectedLoad) {
        setFacilityType('pickup');
        setFacilityName(`${preselectedLoad.origin_city}, ${preselectedLoad.origin_state} (Shipper)`);
        setFacilityAddress(`${preselectedLoad.origin_city}, ${preselectedLoad.origin_state}`);
        setBrokerName(preselectedLoad.broker?.company_name || '');
        setBrokerContactPerson(preselectedLoad.broker?.contact_name || '');
        setBrokerContactEmail(preselectedLoad.broker?.contact_email || '');
        setBrokerContactPhone(preselectedLoad.broker?.contact_phone || '');
      } else {
        setFacilityType('pickup');
        setFacilityName('');
        setFacilityAddress('');
        setBrokerName('');
        setBrokerContactPerson('');
        setBrokerContactEmail('');
        setBrokerContactPhone('');
      }

      setPaymentMethod('comchek');
      setReceiptNumber('');
      setReceiptDocName('');
      setRateConRevisionNumber('');
      setRejectionReason('');
      setNotes('');
    }
  }, [isOpen, claimToEdit, preselectedLoad, availableLoads]);

  // Live detention calculation
  const liveDetentionCalc = useMemo(() => {
    if (type !== 'detention' || !arrivalTime) return null;
    try {
      const arrIso = new Date(arrivalTime).toISOString();
      const depIso = isStillAtDock ? null : departureTime ? new Date(departureTime).toISOString() : null;
      return calculateDetention({
        arrivalTime: arrIso,
        departureTime: depIso,
        freeTimeHours: parseFloat(freeTimeHours) || 2.0,
        hourlyRate: parseFloat(hourlyRate) || 75.0,
      });
    } catch {
      return null;
    }
  }, [type, arrivalTime, isStillAtDock, departureTime, freeTimeHours, hourlyRate]);

  // Auto-update amount when detention calculation changes
  useEffect(() => {
    if (type === 'detention' && liveDetentionCalc) {
      setAmount(liveDetentionCalc.totalAmount.toFixed(2));
    }
  }, [type, liveDetentionCalc]);

  // Handle Type Change
  const handleTypeChange = (newType: AccessorialType) => {
    setType(newType);
    const config = ACCESSORIAL_TYPE_CONFIG[newType];
    if (newType === 'detention') {
      setDescription(`Detention at ${facilityType} facility.`);
      if (liveDetentionCalc) {
        setAmount(liveDetentionCalc.totalAmount.toFixed(2));
      }
    } else {
      setAmount(config.defaultRate.toString());
      if (newType === 'layover') setDescription('Overnight layover at facility hold.');
      if (newType === 'tonu') setDescription('Truck Ordered Not Used (cancellation on site).');
      if (newType === 'lumper') setDescription('Lumper unloading service at receiver dock.');
      if (newType === 'extra_stop') setDescription('Additional stop-off drop requested by broker.');
      if (newType === 'scale_tickets') setDescription('Certified CAT Scale weighing receipt.');
      if (newType === 'tolls') setDescription('Reimbursable toll charges.');
      if (newType === 'pallet_jack') setDescription('Pallet jack rental / gate entry fee.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) {
      setError('Staff role is read-only. Only dispatchers and admins can modify accessorial claims.');
      return;
    }

    const loadIdToUse = preselectedLoad ? preselectedLoad.id : selectedLoadId;
    if (!loadIdToUse) {
      setError('Please select a load.');
      return;
    }

    if (!description.trim()) {
      setError('Please provide a description.');
      return;
    }

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount < 0) {
      setError('Please enter a valid non-negative dollar amount.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const actorName = profile?.full_name || user?.email?.split('@')[0] || 'Dispatcher';
      const actorId = user?.id || 'usr-alex-1';

      let detentionDetailsInput = undefined;
      if (type === 'detention') {
        if (!arrivalTime) {
          throw new Error('Facility arrival time is required for detention tracking.');
        }
        const arrIso = parseInputToIso(arrivalTime, operationalTimezone);
        if (!arrIso) {
          throw new Error('Valid facility arrival time is required for detention tracking.');
        }
        const depIso = isStillAtDock ? null : departureTime ? parseInputToIso(departureTime, operationalTimezone) : null;
        const loadStartIso = loadingStartTime ? parseInputToIso(loadingStartTime, operationalTimezone) : null;
        const loadCompIso = loadingCompleteTime ? parseInputToIso(loadingCompleteTime, operationalTimezone) : null;
        const unloadStartIso = unloadingStartTime ? parseInputToIso(unloadingStartTime, operationalTimezone) : null;
        const unloadCompIso = unloadingCompleteTime ? parseInputToIso(unloadingCompleteTime, operationalTimezone) : null;

        detentionDetailsInput = {
          facility_type: facilityType,
          facility_name: facilityName.trim() || undefined,
          facility_address: facilityAddress.trim() || undefined,
          facility_timezone: operationalTimezone,
          appointment_time: null,
          arrival_time: arrIso,
          loading_start_time: loadStartIso,
          loading_complete_time: loadCompIso,
          unloading_start_time: unloadStartIso,
          unloading_complete_time: unloadCompIso,
          departure_time: depIso,
          free_time_hours: parseFloat(freeTimeHours) || 2.0,
          hourly_rate: parseFloat(hourlyRate) || 75.0,
        };
      }

      if (isEdit && claimToEdit) {
        const updatePayload: UpdateAccessorialInput = {
          type,
          status,
          description: description.trim(),
          amount: parsedAmount,
          detention_details: detentionDetailsInput,
          receipt_doc_name: receiptDocName.trim() || null,
          receipt_number: receiptNumber.trim() || null,
          payment_method: type === 'lumper' ? paymentMethod : undefined,
          broker_name: brokerName.trim() || undefined,
          broker_contact_person: brokerContactPerson.trim() || undefined,
          broker_contact_email: brokerContactEmail.trim() || undefined,
          broker_contact_phone: brokerContactPhone.trim() || undefined,
          rate_con_revision_number: rateConRevisionNumber.trim() || null,
          rejection_reason: status === 'rejected' ? rejectionReason.trim() || null : null,
          notes: notes.trim() || null,
        };

        const updated = await accessorialService.updateAccessorial(
          orgId,
          claimToEdit.id,
          updatePayload,
          actorName,
          actorId
        );
        onSuccess(updated, true);
        onClose();
      } else {
        const createPayload: CreateAccessorialInput = {
          load_id: loadIdToUse,
          type,
          status,
          description: description.trim(),
          amount: parsedAmount,
          detention_details: detentionDetailsInput,
          receipt_doc_name: receiptDocName.trim() || null,
          receipt_number: receiptNumber.trim() || null,
          payment_method: type === 'lumper' ? paymentMethod : undefined,
          broker_name: brokerName.trim() || undefined,
          broker_contact_person: brokerContactPerson.trim() || undefined,
          broker_contact_email: brokerContactEmail.trim() || undefined,
          broker_contact_phone: brokerContactPhone.trim() || undefined,
          rate_con_revision_number: rateConRevisionNumber.trim() || null,
          notes: notes.trim() || null,
        };

        const created = await accessorialService.createAccessorial(
          orgId,
          createPayload,
          actorName,
          actorId
        );
        onSuccess(created, false);
        onClose();
      }
    } catch (err: unknown) {
      console.error('Error saving accessorial claim:', err);
      setError(err instanceof Error ? err.message : 'Failed to save accessorial claim.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      id="accessorial-claim-modal"
      isOpen={isOpen}
      onClose={onClose}
      title={isEdit ? `Edit Accessorial Claim: ${claimToEdit?.id}` : 'Log New Accessorial / Detention Claim'}
      maxWidth="2xl"
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg flex items-center gap-2.5 text-xs text-rose-400">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Load Selector if not preselected */}
        {!preselectedLoad && (
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-300">
              Associated Load <span className="text-rose-400">*</span>
            </label>
            <select
              value={selectedLoadId}
              onChange={(e) => {
                setSelectedLoadId(e.target.value);
                const found = availableLoads.find((l) => l.id === e.target.value);
                if (found?.broker) {
                  setBrokerName(found.broker.company_name);
                  setBrokerContactPerson(found.broker.contact_name || '');
                  setBrokerContactEmail(found.broker.contact_email || '');
                  setBrokerContactPhone(found.broker.contact_phone || '');
                }
              }}
              disabled={isEdit}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono disabled:opacity-60"
            >
              {availableLoads.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.load_number} — {l.origin_city}, {l.origin_state} ➔ {l.dest_city},{' '}
                  {l.dest_state} ({l.client?.company_name || 'Carrier'})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Accessorial Type Selection Grid */}
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-slate-300">Accessorial Category</label>
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(ACCESSORIAL_TYPE_CONFIG) as AccessorialType[]).map((t) => {
              const cfg = ACCESSORIAL_TYPE_CONFIG[t];
              const isSelected = type === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => handleTypeChange(t)}
                  className={`p-2 rounded-lg border text-left transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-indigo-600/20 border-indigo-500 text-indigo-200 ring-1 ring-indigo-500/50'
                      : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                  }`}
                >
                  <span className="block text-[11px] font-bold truncate">{cfg.label}</span>
                  <span className="block text-[10px] text-slate-400 mt-0.5">
                    {t === 'detention'
                      ? '$75/hr (past 2h)'
                      : t === 'lumper'
                      ? 'Receipt Required'
                      : `$${cfg.defaultRate} std`}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* DYNAMIC DETENTION FORM */}
        {type === 'detention' && (
          <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/5 space-y-4">
            <div className="flex items-center justify-between border-b border-amber-500/20 pb-2">
              <div className="flex items-center gap-2">
                <Timer className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-bold text-amber-300 uppercase tracking-wider">
                  Detention Clock & Facility Tracking
                </span>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono">
                15-Min Billing Intervals
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Facility Stop Type */}
              <div className="space-y-1">
                <label className="block text-[11px] font-medium text-slate-300">Stop Type</label>
                <select
                  value={facilityType}
                  onChange={(e) => setFacilityType(e.target.value as FacilityStopType)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                >
                  <option value="pickup">Shipper (Pickup)</option>
                  <option value="delivery">Receiver (Delivery)</option>
                  <option value="intermediate_stop">Extra Stop / Intermediate</option>
                </select>
              </div>

              {/* Facility Name */}
              <div className="sm:col-span-2 space-y-1">
                <label className="block text-[11px] font-medium text-slate-300">Facility / Warehouse Name</label>
                <input
                  type="text"
                  value={facilityName}
                  onChange={(e) => setFacilityName(e.target.value)}
                  placeholder="e.g. Memphis Cold Logistics Dock #4"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            {/* Arrival & Departure Timestamps */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="block text-[11px] font-medium text-slate-300">
                    Arrival Timestamp <span className="text-rose-400">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setArrivalTime(toLocalInputValue(new Date().toISOString(), operationalTimezone))}
                    className="text-[10px] text-indigo-400 hover:text-indigo-300 underline cursor-pointer"
                  >
                    Set to Now
                  </button>
                </div>
                <input
                  type="datetime-local"
                  value={arrivalTime}
                  onChange={(e) => setArrivalTime(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="block text-[11px] font-medium text-slate-300">Departure Timestamp</label>
                  <label className="flex items-center gap-1.5 text-[10px] text-amber-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isStillAtDock}
                      onChange={(e) => setIsStillAtDock(e.target.checked)}
                      className="rounded bg-slate-900 border-slate-700 text-indigo-600 focus:ring-0"
                    />
                    <span>Driver Still at Dock</span>
                  </label>
                </div>
                <input
                  type="datetime-local"
                  value={departureTime}
                  disabled={isStillAtDock}
                  onChange={(e) => setDepartureTime(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono disabled:opacity-40"
                />
              </div>
            </div>

            {/* Dock Milestones: Loading (Pickup) or Unloading (Delivery) */}
            {(facilityType === 'pickup' || facilityType === 'intermediate_stop') && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-2.5 bg-slate-950/60 rounded-lg border border-slate-800">
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="block text-[11px] font-medium text-slate-300">Loading Start Time</label>
                    <button
                      type="button"
                      onClick={() => setLoadingStartTime(toLocalInputValue(new Date().toISOString(), operationalTimezone))}
                      className="text-[10px] text-indigo-400 hover:text-indigo-300 underline cursor-pointer"
                    >
                      Now
                    </button>
                  </div>
                  <input
                    type="datetime-local"
                    value={loadingStartTime}
                    onChange={(e) => setLoadingStartTime(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="block text-[11px] font-medium text-slate-300">Loading Complete Time</label>
                    <button
                      type="button"
                      onClick={() => setLoadingCompleteTime(toLocalInputValue(new Date().toISOString(), operationalTimezone))}
                      className="text-[10px] text-indigo-400 hover:text-indigo-300 underline cursor-pointer"
                    >
                      Now
                    </button>
                  </div>
                  <input
                    type="datetime-local"
                    value={loadingCompleteTime}
                    onChange={(e) => setLoadingCompleteTime(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>
              </div>
            )}

            {(facilityType === 'delivery' || facilityType === 'intermediate_stop') && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-2.5 bg-slate-950/60 rounded-lg border border-slate-800">
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="block text-[11px] font-medium text-slate-300">Unloading Start Time</label>
                    <button
                      type="button"
                      onClick={() => setUnloadingStartTime(toLocalInputValue(new Date().toISOString(), operationalTimezone))}
                      className="text-[10px] text-indigo-400 hover:text-indigo-300 underline cursor-pointer"
                    >
                      Now
                    </button>
                  </div>
                  <input
                    type="datetime-local"
                    value={unloadingStartTime}
                    onChange={(e) => setUnloadingStartTime(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="block text-[11px] font-medium text-slate-300">Unloading Complete Time</label>
                    <button
                      type="button"
                      onClick={() => setUnloadingCompleteTime(toLocalInputValue(new Date().toISOString(), operationalTimezone))}
                      className="text-[10px] text-indigo-400 hover:text-indigo-300 underline cursor-pointer"
                    >
                      Now
                    </button>
                  </div>
                  <input
                    type="datetime-local"
                    value={unloadingCompleteTime}
                    onChange={(e) => setUnloadingCompleteTime(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>
              </div>
            )}

            {/* Rate & Free Time Params */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="block text-[11px] font-medium text-slate-300">Free Time (Hours)</label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  value={freeTimeHours}
                  onChange={(e) => setFreeTimeHours(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-[11px] font-medium text-slate-300">Hourly Rate ($/hr)</label>
                <div className="relative">
                  <span className="absolute left-2.5 top-1.5 text-slate-500 text-xs">$</span>
                  <input
                    type="number"
                    step="5"
                    min="0"
                    value={hourlyRate}
                    onChange={(e) => setHourlyRate(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-6 pr-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>
              </div>
            </div>

            {/* Live Calculation Preview Card */}
            {liveDetentionCalc && (
              <div className="p-3 bg-slate-950/80 rounded-lg border border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                <div>
                  <span className="block text-[10px] text-slate-400 uppercase">Total Time at Dock</span>
                  <span className="text-xs font-mono font-bold text-slate-200">
                    {liveDetentionCalc.formattedDuration}
                  </span>
                </div>
                <div>
                  <span className="block text-[10px] text-slate-400 uppercase">Status</span>
                  <span
                    className={`text-xs font-semibold ${
                      liveDetentionCalc.isWithinFreeTime ? 'text-emerald-400' : 'text-amber-400'
                    }`}
                  >
                    {liveDetentionCalc.isWithinFreeTime ? 'Within Free Time' : 'Accruing Detention'}
                  </span>
                </div>
                <div>
                  <span className="block text-[10px] text-slate-400 uppercase">Billable Hours</span>
                  <span className="text-xs font-mono font-bold text-indigo-300">
                    {liveDetentionCalc.billableHours.toFixed(2)} hrs
                  </span>
                </div>
                <div>
                  <span className="block text-[10px] text-slate-400 uppercase">Total Claim Amount</span>
                  <span className="text-xs font-mono font-bold text-emerald-400">
                    {formatCurrency(liveDetentionCalc.totalAmount)}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* LUMPER / RECEIPT SPECIFIC FIELDS */}
        {type === 'lumper' && (
          <div className="p-4 rounded-xl border border-blue-500/30 bg-blue-500/5 space-y-3">
            <div className="flex items-center gap-2 border-b border-blue-500/20 pb-2">
              <Receipt className="w-4 h-4 text-blue-400" />
              <span className="text-xs font-bold text-blue-300 uppercase tracking-wider">
                Lumper Payment Details
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="block text-[11px] font-medium text-slate-300">Payment Method</label>
                <select
                  value={paymentMethod}
                  onChange={(e) =>
                    setPaymentMethod(
                      e.target.value as 'comchek' | 'efs' | 'credit_card' | 'driver_cash' | 'broker_direct' | 'other'
                    )
                  }
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                >
                  <option value="comchek">Comchek Advance</option>
                  <option value="efs">EFS Check / Card</option>
                  <option value="driver_cash">Driver Paid (Reimbursement)</option>
                  <option value="credit_card">Company Card</option>
                  <option value="broker_direct">Direct Broker Billed</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="block text-[11px] font-medium text-slate-300">Receipt / Check #</label>
                <input
                  type="text"
                  value={receiptNumber}
                  onChange={(e) => setReceiptNumber(e.target.value)}
                  placeholder="e.g. CK-994812"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-[11px] font-medium text-slate-300">Receipt Doc Name</label>
                <input
                  type="text"
                  value={receiptDocName}
                  onChange={(e) => setReceiptDocName(e.target.value)}
                  placeholder="e.g. Lumper_Phoenix_8844.pdf"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 text-[11px]"
                />
              </div>
            </div>
          </div>
        )}

        {/* CLAIM DESCRIPTION & AMOUNT */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2 space-y-1">
            <label className="block text-xs font-semibold text-slate-300">
              Claim Description <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. 2 hours detention at receiver facility"
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-semibold text-slate-300">
              Claim Amount ($ USD) <span className="text-rose-400">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2 text-slate-500 text-xs">$</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-7 pr-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono font-bold"
              />
            </div>
          </div>
        </div>

        {/* BROKER & STATUS LIFECYCLE SECTION */}
        <div className="p-3.5 bg-slate-900/60 rounded-xl border border-slate-800 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <div className="flex items-center gap-2">
              <Building2 className="w-3.5 h-3.5 text-indigo-400" />
              <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                Broker Submission & Claim Status
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="block text-[11px] font-medium text-slate-400">Claim Lifecycle Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as AccessorialStatus)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-semibold"
              >
                {(Object.keys(ACCESSORIAL_STATUS_CONFIG) as AccessorialStatus[]).map((st) => (
                  <option key={st} value={st}>
                    {ACCESSORIAL_STATUS_CONFIG[st].label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="block text-[11px] font-medium text-slate-400">Broker Name</label>
              <input
                type="text"
                value={brokerName}
                onChange={(e) => setBrokerName(e.target.value)}
                placeholder="e.g. Apex Logistics Freight LLC"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-[11px] font-medium text-slate-400">Revised Rate Con #</label>
              <input
                type="text"
                value={rateConRevisionNumber}
                onChange={(e) => setRateConRevisionNumber(e.target.value)}
                placeholder="e.g. RC-8841-REV1"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
              />
            </div>
          </div>

          {status === 'rejected' && (
            <div className="space-y-1 pt-1">
              <label className="block text-[11px] font-medium text-rose-400">Rejection Reason</label>
              <input
                type="text"
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="e.g. Broker claimed driver arrived past appointment window."
                className="w-full bg-slate-900 border border-rose-500/40 rounded-lg px-2.5 py-1.5 text-xs text-rose-200 focus:outline-none focus:border-rose-500"
              />
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting || !canEdit}
            className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors shadow-sm cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
          >
            {isSubmitting ? (
              'Saving...'
            ) : isEdit ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" />
                Update Claim
              </>
            ) : (
              <>
                <DollarSign className="w-3.5 h-3.5" />
                Create Claim
              </>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
};
