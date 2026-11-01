import React, { useState, useEffect, useRef } from 'react';
import {
  Load,
  Client,
  Broker,
  Truck,
  Driver,
  EquipmentType,
} from '../../types/domain.types.ts';
import { LoadWithRelations } from '../loads/loadTypes.ts';
import {
  RateConfirmationExtraction,
  ExtractedBrokerInfo,
} from './extractionTypes.ts';
import { normalizeEquipmentType } from './rateConParser.ts';
import { extractionService } from './extractionService.ts';
import { brokerService } from '../brokers/brokerService.ts';
import { calculateProfitability, formatCurrency, formatRPM, formatMiles } from '../../lib/calculations.ts';
import { Modal } from '../../components/common/Modal.tsx';
import {
  Sparkles,
  Upload,
  FileText,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  ArrowRight,
  Building2,
  Truck as TruckIcon,
  User,
  DollarSign,
  MapPin,
  Calendar,
  Layers,
  ShieldCheck,
  RefreshCw,
  FileSpreadsheet,
  HelpCircle,
  Eye,
  Info,
  X,
  FileCheck,
} from 'lucide-react';

interface RateConExtractionModalProps {
  isOpen: boolean;
  onClose: () => void;
  organizationId: string;
  loads: Load[];
  clients: Client[];
  brokers: Broker[];
  trucks: Truck[];
  drivers: Driver[];
  initialLoadId?: string;
  onExtractionApplied: (load: LoadWithRelations) => void;
}

export const RateConExtractionModal: React.FC<RateConExtractionModalProps> = ({
  isOpen,
  onClose,
  organizationId,
  loads,
  clients,
  brokers,
  trucks,
  drivers,
  initialLoadId,
  onExtractionApplied,
}) => {
  // Processing States
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [pastedText, setPastedText] = useState<string>('');
  const [inputTab, setInputTab] = useState<'upload' | 'text'>('upload');
  const [isExtracting, setIsExtracting] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Extracted Result State
  const [extraction, setExtraction] = useState<RateConfirmationExtraction | null>(null);
  const [showRawText, setShowRawText] = useState(false);

  // Application / Form State
  const [targetMode, setTargetMode] = useState<'existing' | 'new'>(initialLoadId ? 'existing' : 'new');
  const [targetLoadId, setTargetLoadId] = useState<string>(initialLoadId || (loads[0]?.id || ''));
  const [selectedClientId, setSelectedClientId] = useState<string>(clients[0]?.id || '');
  const [selectedBrokerId, setSelectedBrokerId] = useState<string>('');
  const [selectedTruckId, setSelectedTruckId] = useState<string>('');
  const [selectedDriverId, setSelectedDriverId] = useState<string>('');

  // Broker States for Extraction Review
  const [localBrokers, setLocalBrokers] = useState<Broker[]>(brokers);
  const [unmatchedBroker, setUnmatchedBroker] = useState<ExtractedBrokerInfo | null>(null);
  const [isCreatingBroker, setIsCreatingBroker] = useState(false);

  useEffect(() => {
    setLocalBrokers(brokers);
  }, [brokers]);

  useEffect(() => {
    if (!isOpen) {
      setUnmatchedBroker(null);
      setErrorMessage(null);
    }
  }, [isOpen]);

  // Editable Overrides State
  const [formFields, setFormFields] = useState<{
    load_number: string;
    rate: number;
    loaded_miles: number;
    deadhead_miles: number;
    origin_facility_name: string;
    origin_address: string;
    origin_city: string;
    origin_state: string;
    origin_zip: string;
    pickup_datetime: string;
    dest_facility_name: string;
    dest_address: string;
    dest_city: string;
    dest_state: string;
    dest_zip: string;
    delivery_datetime: string;
    equipment_type: EquipmentType;
    commodity: string;
    weight_lbs: number;
    special_instructions: string;
  }>({
    load_number: '',
    rate: 0,
    loaded_miles: 0,
    deadhead_miles: 0,
    origin_facility_name: '',
    origin_address: '',
    origin_city: '',
    origin_state: '',
    origin_zip: '',
    pickup_datetime: '',
    dest_facility_name: '',
    dest_address: '',
    dest_city: '',
    dest_state: '',
    dest_zip: '',
    delivery_datetime: '',
    equipment_type: 'dry_van',
    commodity: '',
    weight_lbs: 0,
    special_instructions: '',
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync initial load if passed
  useEffect(() => {
    if (initialLoadId) {
      setTargetLoadId(initialLoadId);
      setTargetMode('existing');
    }
  }, [initialLoadId]);

  // Add & Link newly extracted broker to CRM and current load
  const handleAddAndLinkBroker = async () => {
    if (!unmatchedBroker || isCreatingBroker) return;
    setIsCreatingBroker(true);
    setErrorMessage(null);

    try {
      const targetOrgId = organizationId || 'demo-organization-default';
      const createdBroker = await brokerService.createBroker(targetOrgId, {
        company_name: unmatchedBroker.company_name?.trim() || 'Extracted Broker',
        mc_number: unmatchedBroker.mc_number || null,
        dot_number: unmatchedBroker.dot_number || null,
        contact_name: unmatchedBroker.contact_name || null,
        contact_email: unmatchedBroker.contact_email || null,
        contact_phone: unmatchedBroker.contact_phone || null,
        payment_terms_days: unmatchedBroker.payment_terms_days || 30,
        credit_status: 'approved',
        notes: 'Created via RateCon extraction auto-link',
      });

      // Add to local brokers list so it is immediately available in dropdown
      setLocalBrokers((prev) => [...prev, createdBroker]);
      // Link the new broker ID to this load form
      setSelectedBrokerId(createdBroker.id);
      // Clear unmatched state
      setUnmatchedBroker(null);
    } catch (err: unknown) {
      console.error('Failed to create and link broker:', err);
      const msg = err instanceof Error ? err.message : 'Failed to add broker. Please select an existing broker or try again.';
      setErrorMessage(msg);
    } finally {
      setIsCreatingBroker(false);
    }
  };

  // Dismiss unmatched broker warning and allow manual selection of existing broker
  const handleSelectExistingBroker = () => {
    setUnmatchedBroker(null);
  };

  // Handle extraction trigger
  const handleRunExtraction = async () => {
    setIsExtracting(true);
    setErrorMessage(null);

    try {
      let result: RateConfirmationExtraction;

      if (inputTab === 'upload' && selectedFile) {
        result = await extractionService.extractRateConfirmation({
          file: selectedFile,
          fileName: selectedFile.name,
          organizationId,
        });
      } else if (inputTab === 'text' && pastedText.trim()) {
        result = await extractionService.extractRateConfirmation({
          documentText: pastedText.trim(),
          fileName: 'Pasted_RateCon.txt',
          organizationId,
        });
      } else {
        throw new Error(
          inputTab === 'upload'
            ? 'Please upload a rate confirmation file to extract.'
            : 'Please paste rate confirmation text to extract.'
        );
      }

      setExtraction(result);

      // Auto-match broker if matching name or MC number exists
      if (result.broker && (result.broker.company_name || result.broker.mc_number)) {
        const extractedMC = result.broker.mc_number?.replace(/\D/g, '');
        const extractedName = result.broker.company_name?.toLowerCase().trim();

        const match = localBrokers.find((b) => {
          if (extractedMC && b.mc_number && b.mc_number.replace(/\D/g, '') === extractedMC) {
            return true;
          }
          if (extractedName && b.company_name) {
            const bName = b.company_name.toLowerCase().trim();
            return bName.includes(extractedName) || extractedName.includes(bName);
          }
          return false;
        });

        if (match) {
          setSelectedBrokerId(match.id);
          setUnmatchedBroker(null);
        } else {
          setSelectedBrokerId('');
          setUnmatchedBroker(result.broker);
        }
      } else {
        setSelectedBrokerId('');
        setUnmatchedBroker(null);
      }

      // Auto-match carrier/client, truck, and driver if present in result.carrier
      if (result.carrier) {
        const rawCarrierName = (result.carrier.carrier_name || result.carrier.company_name || '').toLowerCase().trim();
        const rawCarrierMC = (result.carrier.mc_number || '').replace(/\D/g, '');
        const rawCarrierDOT = (result.carrier.dot_number || '').replace(/\D/g, '');

        const matchedClient = clients.find((c) => {
          if (rawCarrierMC && (c as any).mc_number && String((c as any).mc_number).replace(/\D/g, '') === rawCarrierMC) return true;
          if (rawCarrierDOT && (c as any).dot_number && String((c as any).dot_number).replace(/\D/g, '') === rawCarrierDOT) return true;
          if (rawCarrierName.length >= 3 && (c.company_name.toLowerCase().includes(rawCarrierName) || rawCarrierName.includes(c.company_name.toLowerCase()))) return true;
          return false;
        });

        if (matchedClient) {
          setSelectedClientId(matchedClient.id);
        }

        const rawTruckNum = (result.carrier.truck_number || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase().trim();
        if (rawTruckNum) {
          const matchedTruck = trucks.find((t) => {
            const tNum = (t.truck_number || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase().trim();
            return tNum === rawTruckNum || (tNum.length >= 3 && rawTruckNum.includes(tNum));
          });
          if (matchedTruck) setSelectedTruckId(matchedTruck.id);
        }

        const rawDriverName = (result.carrier.driver_name || '').toLowerCase().trim();
        const rawDriverPhone = (result.carrier.driver_phone || '').replace(/\D/g, '');
        if (rawDriverName || rawDriverPhone) {
          const matchedDriver = drivers.find((d) => {
            const dName = (d.full_name || '').toLowerCase().trim();
            const dPhone = (d.phone || '').replace(/\D/g, '');
            if (rawDriverPhone.length >= 7 && dPhone.includes(rawDriverPhone.slice(-7))) return true;
            if (rawDriverName.length >= 3 && (dName.includes(rawDriverName) || rawDriverName.includes(dName))) return true;
            return false;
          });
          if (matchedDriver) setSelectedDriverId(matchedDriver.id);
        }
      }

      // Initialize form fields with fully normalized extracted data
      const extractedLoadNum =
        result.load_info?.load_number ||
        (result as any).load_number ||
        (result as any).order_number ||
        '';

      const extractedTotalPay =
        result.load_info?.total_carrier_compensation ||
        result.financial_breakdown?.total_carrier_compensation ||
        result.load_info?.rate ||
        (result as any).rate ||
        (result as any).total_carrier_compensation ||
        ((result.financial_breakdown?.linehaul_rate || (result.financial_breakdown as any)?.linehaul_amount || 0) +
          (result.financial_breakdown?.fuel_surcharge_amount || result.load_info?.fuel_surcharge || 0)) ||
        0;

      const extractedMiles =
        result.load_info?.mileage ||
        (result as any).mileage ||
        (result as any).loaded_miles ||
        (result.financial_breakdown as any)?.mileage ||
        0;

      const originFacility = result.origin?.facility_name || result.stops?.[0]?.facility_name || '';
      const originAddress = result.origin?.address || result.stops?.[0]?.address || '';
      const originCity = result.origin?.city || result.stops?.[0]?.city || '';
      const originState = (result.origin?.state || result.stops?.[0]?.state || '').toUpperCase();
      const originZip = result.origin?.zip || result.stops?.[0]?.zip || '';
      const pickupDateTime =
        result.origin?.pickup_datetime ||
        result.origin?.date_string ||
        result.stops?.[0]?.datetime_iso ||
        result.stops?.[0]?.date_string ||
        '';

      const destFacility = result.destination?.facility_name || result.stops?.[1]?.facility_name || '';
      const destAddress = result.destination?.address || result.stops?.[1]?.address || '';
      const destCity = result.destination?.city || result.stops?.[1]?.city || '';
      const destState = (result.destination?.state || result.stops?.[1]?.state || '').toUpperCase();
      const destZip = result.destination?.zip || result.stops?.[1]?.zip || '';
      const deliveryDateTime =
        result.destination?.delivery_datetime ||
        result.destination?.date_string ||
        result.stops?.[1]?.datetime_iso ||
        result.stops?.[1]?.date_string ||
        '';

      const eqType = normalizeEquipmentType(result.load_info?.equipment_type || (result as any).equipment_type);
      const commodity = result.load_info?.commodity || (result as any).commodity || '';
      const weight = result.load_info?.weight_lbs || (result as any).weight_lbs || (result as any).weight || 0;

      // Aggregate ONLY actual extracted instruction fields into special_instructions
      const instructionParts: string[] = [];
      const loadSpecialInstructions = (
        result.load_info?.special_instructions ||
        (result as any).special_instructions ||
        ''
      ).trim();

      if (loadSpecialInstructions) {
        instructionParts.push(loadSpecialInstructions);
      }

      const pickupInstructions = (result.origin?.instructions || '').trim();
      if (pickupInstructions && !loadSpecialInstructions.includes(pickupInstructions)) {
        instructionParts.push(`Pickup: ${pickupInstructions}`);
      }

      const deliveryInstructions = (result.destination?.instructions || '').trim();
      if (deliveryInstructions && !loadSpecialInstructions.includes(deliveryInstructions)) {
        instructionParts.push(`Delivery: ${deliveryInstructions}`);
      }

      // Include stop-level instructions if present in result.stops
      if (Array.isArray(result.stops)) {
        result.stops.forEach((stop, idx) => {
          const stopInst = (stop.instructions || '').trim();
          if (
            stopInst &&
            !loadSpecialInstructions.includes(stopInst) &&
            stopInst !== pickupInstructions &&
            stopInst !== deliveryInstructions
          ) {
            const stopLabel = stop.stop_type === 'pickup'
              ? `Stop ${idx + 1} (Pickup)`
              : stop.stop_type === 'delivery'
              ? `Stop ${idx + 1} (Delivery)`
              : `Stop ${idx + 1}`;
            instructionParts.push(`${stopLabel}: ${stopInst}`);
          }
        });
      }

      const specialInstructions = instructionParts.join('\n\n');

      setFormFields({
        load_number: extractedLoadNum,
        rate: extractedTotalPay,
        loaded_miles: extractedMiles,
        deadhead_miles: 0,
        origin_facility_name: originFacility,
        origin_address: originAddress,
        origin_city: originCity,
        origin_state: originState,
        origin_zip: originZip,
        pickup_datetime: pickupDateTime,
        dest_facility_name: destFacility,
        dest_address: destAddress,
        dest_city: destCity,
        dest_state: destState,
        dest_zip: destZip,
        delivery_datetime: deliveryDateTime,
        equipment_type: eqType,
        commodity: commodity,
        weight_lbs: weight,
        special_instructions: specialInstructions,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to extract rate confirmation.';
      setErrorMessage(msg);
    } finally {
      setIsExtracting(false);
    }
  };

  // Calculate live financial profitability based on current rate and miles
  const currentProfitability = calculateProfitability({
    rate: formFields.rate,
    loadedMiles: formFields.loaded_miles,
    deadheadMiles: formFields.deadhead_miles,
    fuelExpense: formFields.rate * 0.19, // ~19% standard fuel benchmark
    driverPay: formFields.rate * 0.27, // 27% gross benchmark
    otherExpenses: 50,
  });

  // Apply extraction to load
  const handleApplyToLoad = async () => {
    if (!extraction) return;
    setIsApplying(true);
    setErrorMessage(null);

    try {
      if (targetMode === 'new' && !selectedClientId) {
        throw new Error('Please select a Carrier Client to assign this new load to.');
      }

      if (targetMode === 'existing' && !targetLoadId) {
        throw new Error('Please select an existing load to update.');
      }

      if (!formFields.origin_city || !formFields.origin_state) {
        throw new Error('Origin City and State are required.');
      }

      if (!formFields.dest_city || !formFields.dest_state) {
        throw new Error('Destination City and State are required.');
      }

      const result = await extractionService.applyExtractionToLoad({
        targetLoadId: targetMode === 'existing' ? targetLoadId : undefined,
        createNewLoad: targetMode === 'new',
        organizationId,
        clientId: selectedClientId,
        brokerId: selectedBrokerId || null,
        truckId: selectedTruckId || null,
        driverId: selectedDriverId || null,
        extractedData: extraction,
        overriddenFields: {
          load_number: formFields.load_number,
          rate: formFields.rate,
          origin_facility_name: formFields.origin_facility_name,
          origin_address: formFields.origin_address,
          origin_city: formFields.origin_city,
          origin_state: formFields.origin_state,
          origin_zip: formFields.origin_zip,
          pickup_datetime: formFields.pickup_datetime,
          dest_facility_name: formFields.dest_facility_name,
          dest_address: formFields.dest_address,
          dest_city: formFields.dest_city,
          dest_state: formFields.dest_state,
          dest_zip: formFields.dest_zip,
          delivery_datetime: formFields.delivery_datetime,
          equipment_type: formFields.equipment_type,
          commodity: formFields.commodity,
          weight_lbs: formFields.weight_lbs,
          loaded_miles: formFields.loaded_miles,
          deadhead_miles: formFields.deadhead_miles,
          special_instructions: formFields.special_instructions,
        },
        attachDocument: {
          file_name: extraction.provenance?.fileName || 'Rate_Confirmation.pdf',
          file_size_bytes: extraction.provenance?.fileSize || 180000,
          mime_type: extraction.provenance?.mimeType || 'application/pdf',
        },
      });

      onExtractionApplied(result.load);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to apply extraction to load.';
      setErrorMessage(msg);
    } finally {
      setIsApplying(false);
    }
  };

  const selectedLoad = loads.find((l) => l.id === targetLoadId);

  // Render confidence pill helper
  const renderConfidenceBadge = (score?: number) => {
    const val = score || 0;
    let color = 'bg-emerald-950/80 text-emerald-300 border-emerald-800/60';
    if (val < 75) {
      color = 'bg-rose-950/80 text-rose-300 border-rose-800/60';
    } else if (val < 90) {
      color = 'bg-amber-950/80 text-amber-300 border-amber-800/60';
    }

    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono tabular-nums border ${color}`}>
        <Sparkles className="w-3 h-3" />
        <span>{val}% Conf</span>
      </span>
    );
  };

  return (
    <Modal
      id="rate-con-extraction-modal"
      isOpen={isOpen}
      onClose={onClose}
      title="AI Rate Confirmation OCR & Extraction"
      subtitle="Extract broker agreements, lanes, rates, and accessorials with mandatory dispatcher review and approval"
      maxWidth="3xl"
    >
      <div className="space-y-4 p-1 text-xs text-slate-200">
        {errorMessage && (
          <div className="p-3 rounded-xl bg-rose-950/80 border border-rose-800 text-rose-200 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
            <div className="space-y-0.5">
              <p className="font-semibold">Extraction Notice</p>
              <p className="text-xs text-rose-300">{errorMessage}</p>
            </div>
          </div>
        )}

        {/* STEP 1: DOCUMENT INPUT STAGE (if not yet extracted or user wants to change) */}
        {!extraction ? (
          <div className="space-y-4">
            {/* Input Selection Tabs */}
            <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
              <button
                type="button"
                onClick={() => setInputTab('upload')}
                className={`h-8 px-3 rounded-xl font-semibold text-xs transition-colors cursor-pointer ${
                  inputTab === 'upload'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-slate-900 text-slate-400 hover:text-slate-200'
                }`}
              >
                Upload Document (PDF / Image)
              </button>
              <button
                type="button"
                onClick={() => setInputTab('text')}
                className={`h-8 px-3 rounded-xl font-semibold text-xs transition-colors cursor-pointer ${
                  inputTab === 'text'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-slate-900 text-slate-400 hover:text-slate-200'
                }`}
              >
                Paste Rate Con Text
              </button>
            </div>

            {/* TAB: File Upload */}
            {inputTab === 'upload' && (
              <div className="space-y-2">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      setSelectedFile(e.target.files[0]);
                    }
                  }}
                  accept=".pdf,.png,.jpg,.jpeg,.webp"
                  className="hidden"
                />

                {!selectedFile ? (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="p-8 border-2 border-dashed border-slate-800 hover:border-indigo-500 bg-slate-950/60 hover:bg-slate-950 rounded-xl flex flex-col items-center justify-center text-center cursor-pointer transition-colors"
                  >
                    <div className="p-3 rounded-full bg-slate-900 border border-slate-800 mb-2">
                      <Upload className="w-6 h-6 text-indigo-400" />
                    </div>
                    <p className="font-semibold text-slate-200 text-xs">
                      Click to upload Rate Confirmation PDF or scanned paperwork
                    </p>
                    <p className="text-[11px] text-slate-500 font-mono tabular-nums mt-1">
                      PDF, JPG, PNG, WEBP (Max 15 MB)
                    </p>
                  </div>
                ) : (
                  <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="p-2 rounded-xl bg-indigo-950 text-indigo-400 border border-indigo-800/50 shrink-0">
                        <FileCheck className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-100 truncate" title={selectedFile.name}>{selectedFile.name}</p>
                        <p className="text-[11px] text-slate-400 font-mono tabular-nums">
                          {(selectedFile.size / 1024).toFixed(1)} KB • {selectedFile.type || 'Document'}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedFile(null)}
                      className="p-1.5 text-slate-400 hover:text-rose-400 rounded-lg hover:bg-slate-900 transition-colors cursor-pointer shrink-0"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* TAB: Text Paste */}
            {inputTab === 'text' && (
              <div className="space-y-1.5">
                <label className="block text-slate-300 font-semibold">
                  Paste Rate Confirmation Text from Email or Broker Portal
                </label>
                <textarea
                  rows={6}
                  value={pastedText}
                  onChange={(e) => setPastedText(e.target.value)}
                  placeholder="Paste load confirmation text here (e.g. Apex Freight, Rate: $2,450, Dallas TX to Atlanta GA...)"
                  className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 placeholder-slate-600 resize-none"
                />
              </div>
            )}

            {/* Run Button */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-800">
              <div className="flex items-center gap-2 text-[11px] text-slate-400">
                <ShieldCheck className="w-4 h-4 text-sky-400" />
                <span>Zero Autonomous Mutations • Dispatcher Verification Required</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="h-9 px-4 text-xs font-semibold text-slate-400 hover:text-slate-200 bg-slate-900 rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleRunExtraction}
                  disabled={isExtracting}
                  className="h-9 inline-flex items-center gap-2 px-5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-xl shadow-xs transition-colors cursor-pointer"
                >
                  <Sparkles className={`w-4 h-4 ${isExtracting ? 'animate-spin' : ''}`} />
                  <span>{isExtracting ? 'Running AI OCR Extraction...' : 'Extract Rate Con Details'}</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* STEP 2: EXTRACTION AUDIT & APPROVAL STAGE */
          <div className="space-y-4">
            {/* Header & Confidence Strip */}
            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex flex-wrap items-center justify-between gap-3 shadow-xs">
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-2 rounded-xl bg-indigo-950/70 border border-indigo-800/60 text-indigo-400 shrink-0">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-slate-100 text-sm truncate">
                      {extraction.broker.company_name || 'Extracted Rate Confirmation'}
                    </span>
                    {renderConfidenceBadge(extraction.confidence_scores.overall)}
                  </div>
                  <p className="text-[11px] text-slate-400 font-mono tabular-nums mt-0.5 truncate">
                    Source: {extraction.provenance?.fileName} • Model: {extraction.provenance?.model || 'Gemini 3.7 Flash'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowRawText(!showRawText)}
                  className="h-8 px-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 text-[11px] font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>{showRawText ? 'Hide Source' : 'View Source Text'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setExtraction(null);
                    setUnmatchedBroker(null);
                  }}
                  className="h-8 px-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-amber-300 border border-slate-800 text-[11px] font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Re-scan / Change</span>
                </button>
              </div>
            </div>

            {/* Optional Raw Source Text Collapsible */}
            {showRawText && (
              <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800 space-y-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Raw Document Text</span>
                <pre className="text-[11px] text-slate-300 font-mono max-h-36 overflow-y-auto whitespace-pre-wrap bg-slate-900/80 p-2.5 rounded-lg border border-slate-800">
                  {pastedText.trim() || extraction.load_info.raw_text || 'Document binary analyzed directly by Gemini Vision.'}
                </pre>
              </div>
            )}

            {/* Warnings Box if any */}
            {extraction.warnings && extraction.warnings.length > 0 && (
              <div className="p-3.5 rounded-xl bg-amber-950/40 border border-amber-800/60 text-amber-200 space-y-1">
                <div className="flex items-center gap-1.5 font-semibold text-xs">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  <span>Verification Warnings & Discrepancies</span>
                </div>
                <ul className="list-disc list-inside text-[11px] text-amber-300/90 space-y-0.5 font-sans">
                  {extraction.warnings.map((w, idx) => (
                    <li key={idx}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Target Mode Selector: Update Existing Load vs Create New Load */}
            <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                  Target Dispatch Assignment
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setTargetMode('new')}
                    className={`h-7 px-3 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                      targetMode === 'new'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-slate-900 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    + Create New Load
                  </button>
                  <button
                    type="button"
                    onClick={() => setTargetMode('existing')}
                    className={`h-7 px-3 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                      targetMode === 'existing'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-slate-900 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Update Existing Load
                  </button>
                </div>
              </div>

              {targetMode === 'existing' ? (
                <div className="space-y-1.5">
                  <label className="block text-slate-300 font-semibold">Select Load to Update</label>
                  <select
                    value={targetLoadId}
                    onChange={(e) => setTargetLoadId(e.target.value)}
                    className="w-full h-9 px-3 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 font-mono text-xs focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 cursor-pointer"
                  >
                    {loads.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.load_number} ({l.origin_state} &rarr; {l.dest_state}) • Rate: {formatCurrency(l.rate)} • {l.pipeline_status.toUpperCase()}
                      </option>
                    ))}
                  </select>
                  {selectedLoad && (
                    <p className="text-[11px] text-slate-400 font-mono tabular-nums">
                      Current: {selectedLoad.origin_city}, {selectedLoad.origin_state} &rarr; {selectedLoad.dest_city}, {selectedLoad.dest_state} ({formatCurrency(selectedLoad.rate)})
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Unmatched Broker Inline Confirmation Area */}
                  {unmatchedBroker && (
                    <div
                      id="unmatched-broker-card"
                      className="p-3 bg-amber-950/40 border border-amber-800/60 rounded-xl text-amber-200 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in"
                    >
                      <div className="flex items-start gap-2.5">
                        <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                        <div>
                          <div className="font-semibold text-amber-300">Broker not found in CRM</div>
                          <div className="font-bold text-slate-100 text-sm mt-0.5">{unmatchedBroker.company_name}</div>
                          <div className="text-[11px] text-amber-200/80 mt-0.5">
                            MC: {unmatchedBroker.mc_number || 'N/A'}{unmatchedBroker.dot_number ? ` • DOT: ${unmatchedBroker.dot_number}` : ''}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          id="add-and-link-broker-btn"
                          type="button"
                          disabled={isCreatingBroker}
                          onClick={handleAddAndLinkBroker}
                          className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors cursor-pointer flex items-center gap-1.5"
                        >
                          {isCreatingBroker ? (
                            <>
                              <RefreshCw className="w-3.5 h-3.5 animate-spin text-white" />
                              <span>Adding Broker...</span>
                            </>
                          ) : (
                            <span>Add & Link Broker</span>
                          )}
                        </button>
                        <button
                          id="select-existing-broker-btn"
                          type="button"
                          disabled={isCreatingBroker}
                          onClick={handleSelectExistingBroker}
                          className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 active:bg-slate-900 text-slate-300 hover:text-white text-xs font-medium rounded-lg border border-slate-700 transition-colors cursor-pointer"
                        >
                          Select Existing
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="block text-slate-300 font-semibold">
                        Carrier Client <span className="text-rose-400">*</span>
                      </label>
                      <select
                        value={selectedClientId}
                        onChange={(e) => setSelectedClientId(e.target.value)}
                        required
                        className="w-full h-9 px-3 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 text-xs focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 cursor-pointer"
                      >
                        {clients.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.company_name} ({c.client_type})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-slate-300 font-semibold">Matched Broker</label>
                      <select
                        value={selectedBrokerId}
                        onChange={(e) => {
                          setSelectedBrokerId(e.target.value);
                          if (e.target.value) {
                            setUnmatchedBroker(null);
                          }
                        }}
                        className="w-full h-9 px-3 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 text-xs focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 cursor-pointer"
                      >
                        <option value="">-- Select or Match Broker --</option>
                        {localBrokers.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.company_name} (MC: {b.mc_number || 'N/A'})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* EDITABLE EXTRACTED FIELDS & FINANCIAL CARD */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-start">
              {/* Left 2 Cols: Form Fields */}
              <div className="sm:col-span-2 space-y-4">
                {/* Broker & Carrier Identification Header */}
                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2.5">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
                      <Building2 className="w-4 h-4 text-sky-400" />
                      <span>Agreed Parties & Reference Numbers</span>
                    </div>
                    {renderConfidenceBadge(extraction.confidence_scores.broker)}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800 space-y-1">
                      <p className="text-[10px] uppercase font-semibold text-slate-400">Brokerage Firm</p>
                      <p className="font-bold text-slate-100">{extraction.broker.company_name}</p>
                      <p className="text-[11px] text-slate-400 font-mono">
                        MC: {extraction.broker.mc_number || 'N/A'} • DOT: {extraction.broker.dot_number || 'N/A'}
                      </p>
                      {extraction.broker.contact_name && (
                        <p className="text-[11px] text-slate-400">Agent: {extraction.broker.contact_name} {extraction.broker.contact_phone ? `(${extraction.broker.contact_phone})` : ''}</p>
                      )}
                    </div>

                    <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800 space-y-1">
                      <p className="text-[10px] uppercase font-semibold text-slate-400">Assigned Carrier</p>
                      <p className="font-bold text-slate-100">{extraction.carrier?.company_name || extraction.carrier?.carrier_name || 'N/A'}</p>
                      <p className="text-[11px] text-slate-400 font-mono">
                        MC: {extraction.carrier?.mc_number || 'N/A'} • DOT: {extraction.carrier?.dot_number || 'N/A'}
                      </p>
                      <p className="text-[11px] text-indigo-300 font-mono">
                        Ref / PO: {extraction.load_info.reference_number || 'N/A'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Financials & Load ID */}
                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
                      <DollarSign className="w-4 h-4 text-emerald-400" />
                      <span>Agreed Financial Compensation & Itemization</span>
                    </div>
                    {renderConfidenceBadge(extraction.confidence_scores.rate)}
                  </div>

                  {/* Itemized Linehaul vs FSC vs Total banner */}
                  {extraction.financial_breakdown && (
                    <div className="grid grid-cols-3 gap-2 p-2 rounded-lg bg-slate-900/70 border border-slate-800 text-center font-mono text-[11px]">
                      <div>
                        <p className="text-[10px] text-slate-400 uppercase font-sans">Linehaul</p>
                        <p className="font-bold text-slate-200">
                          {extraction.financial_breakdown.linehaul_rate
                            ? formatCurrency(extraction.financial_breakdown.linehaul_rate)
                            : (extraction.financial_breakdown as any).linehaul_amount
                            ? formatCurrency((extraction.financial_breakdown as any).linehaul_amount)
                            : extraction.load_info.linehaul_rate
                            ? formatCurrency(extraction.load_info.linehaul_rate)
                            : 'N/A'}
                        </p>
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] text-amber-400 uppercase font-sans truncate">Fuel Surcharge</p>
                        <p className="font-bold text-amber-300 whitespace-nowrap">
                          {extraction.financial_breakdown.fuel_surcharge_amount !== null && extraction.financial_breakdown.fuel_surcharge_amount !== undefined
                            ? formatCurrency(extraction.financial_breakdown.fuel_surcharge_amount)
                            : extraction.load_info.fuel_surcharge !== null && extraction.load_info.fuel_surcharge !== undefined
                            ? formatCurrency(extraction.load_info.fuel_surcharge)
                            : 'N/A'}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-emerald-400 uppercase font-sans">Total Agreed Pay</p>
                        <p className="font-bold text-emerald-300">
                          {formatCurrency(extraction.load_info.total_carrier_compensation || extraction.load_info.rate || extraction.financial_breakdown.total_carrier_compensation || formFields.rate || 0)}
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-[11px] text-slate-400 font-semibold">Load / Order #</label>
                      <input
                        type="text"
                        value={formFields.load_number}
                        onChange={(e) => setFormFields({ ...formFields, load_number: e.target.value })}
                        className="w-full h-9 px-3 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 font-mono text-xs focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[11px] text-slate-400 font-semibold">Total Gross Rate ($)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={formFields.rate}
                        onChange={(e) => setFormFields({ ...formFields, rate: parseFloat(e.target.value) || 0 })}
                        className="w-full h-9 px-3 bg-slate-900 border border-slate-800 rounded-xl text-emerald-300 font-mono font-bold tabular-nums text-xs focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[11px] text-slate-400 font-semibold">Loaded Miles</label>
                      <input
                        type="number"
                        value={formFields.loaded_miles}
                        onChange={(e) => setFormFields({ ...formFields, loaded_miles: parseFloat(e.target.value) || 0 })}
                        className="w-full h-9 px-3 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 font-mono tabular-nums text-xs focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500"
                      />
                    </div>
                  </div>
                </div>

                {/* Route: Origin & Destination */}
                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
                      <MapPin className="w-4 h-4 text-sky-400" />
                      <span>Route & Appointment Schedule</span>
                    </div>
                    {renderConfidenceBadge(extraction.confidence_scores.origin)}
                  </div>

                  {/* Origin */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase font-semibold text-sky-400">
                        Stop 1 — Pickup: {extraction.origin.facility_name || 'Pickup Location'}
                      </span>
                      {extraction.origin.date_string && (
                        <span className="text-[11px] font-mono text-sky-300 font-semibold">
                          {extraction.origin.date_string} {extraction.origin.time_string || ''} {extraction.origin.timezone || ''}
                        </span>
                      )}
                    </div>
                    {extraction.origin.address && (
                      <p className="text-[11px] text-slate-400 font-mono">
                        {extraction.origin.address}, {extraction.origin.city}, {extraction.origin.state} {extraction.origin.zip}
                      </p>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                      <input
                        type="text"
                        placeholder="Origin City"
                        value={formFields.origin_city}
                        onChange={(e) => setFormFields({ ...formFields, origin_city: e.target.value })}
                        className="h-9 px-3 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 text-xs focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500"
                      />
                      <input
                        type="text"
                        placeholder="State (e.g. IL)"
                        maxLength={2}
                        value={formFields.origin_state}
                        onChange={(e) => setFormFields({ ...formFields, origin_state: e.target.value.toUpperCase() })}
                        className="h-9 px-3 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 font-mono text-xs uppercase focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500"
                      />
                      <input
                        type="text"
                        placeholder="Zip"
                        value={formFields.origin_zip}
                        onChange={(e) => setFormFields({ ...formFields, origin_zip: e.target.value })}
                        className="h-9 px-3 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 font-mono text-xs focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500"
                      />
                      <input
                        type="text"
                        placeholder="Pickup Appt Date/Time"
                        value={formFields.pickup_datetime}
                        onChange={(e) => setFormFields({ ...formFields, pickup_datetime: e.target.value })}
                        className="h-9 px-3 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 text-xs focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500"
                      />
                    </div>
                  </div>

                  {/* Destination */}
                  <div className="space-y-2 pt-2 border-t border-slate-900">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase font-semibold text-emerald-400">
                        Stop 2 — Delivery: {extraction.destination.facility_name || 'Delivery Location'}
                      </span>
                      {extraction.destination.date_string && (
                        <span className="text-[11px] font-mono text-emerald-300 font-semibold">
                          {extraction.destination.date_string} {extraction.destination.time_string || ''} {extraction.destination.timezone || ''}
                        </span>
                      )}
                    </div>
                    {extraction.destination.address && (
                      <p className="text-[11px] text-slate-400 font-mono">
                        {extraction.destination.address}, {extraction.destination.city}, {extraction.destination.state} {extraction.destination.zip}
                      </p>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                      <input
                        type="text"
                        placeholder="Dest City"
                        value={formFields.dest_city}
                        onChange={(e) => setFormFields({ ...formFields, dest_city: e.target.value })}
                        className="h-9 px-3 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 text-xs focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500"
                      />
                      <input
                        type="text"
                        placeholder="State (e.g. TX)"
                        maxLength={2}
                        value={formFields.dest_state}
                        onChange={(e) => setFormFields({ ...formFields, dest_state: e.target.value.toUpperCase() })}
                        className="h-9 px-3 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 font-mono text-xs uppercase focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500"
                      />
                      <input
                        type="text"
                        placeholder="Zip"
                        value={formFields.dest_zip}
                        onChange={(e) => setFormFields({ ...formFields, dest_zip: e.target.value })}
                        className="h-9 px-3 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 font-mono text-xs focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500"
                      />
                      <input
                        type="text"
                        placeholder="Delivery Appt Date/Time"
                        value={formFields.delivery_datetime}
                        onChange={(e) => setFormFields({ ...formFields, delivery_datetime: e.target.value })}
                        className="h-9 px-3 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 text-xs focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500"
                      />
                    </div>
                  </div>
                </div>

                {/* Equipment, Commodity & Special Instructions */}
                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
                      <Layers className="w-4 h-4 text-purple-400" />
                      <span>Shipment Specifications & Special Instructions</span>
                    </div>
                    {renderConfidenceBadge(extraction.confidence_scores.equipment_type)}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-[11px] text-slate-400 font-semibold">Equipment</label>
                      <select
                        value={formFields.equipment_type}
                        onChange={(e) => setFormFields({ ...formFields, equipment_type: e.target.value as EquipmentType })}
                        className="w-full h-9 px-3 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 text-xs cursor-pointer focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500"
                      >
                        <option value="dry_van">Dry Van</option>
                        <option value="reefer">Reefer</option>
                        <option value="flatbed">Flatbed</option>
                        <option value="step_deck">Step Deck</option>
                        <option value="power_only">Power Only</option>
                        <option value="box_truck">Box Truck</option>
                        <option value="hotshot">Hotshot</option>
                        <option value="other">Other</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[11px] text-slate-400 font-semibold">Commodity</label>
                      <input
                        type="text"
                        value={formFields.commodity}
                        onChange={(e) => setFormFields({ ...formFields, commodity: e.target.value })}
                        className="w-full h-9 px-3 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 text-xs focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[11px] text-slate-400 font-semibold">Weight (lbs)</label>
                      <input
                        type="number"
                        value={formFields.weight_lbs || ''}
                        onChange={(e) => setFormFields({ ...formFields, weight_lbs: parseInt(e.target.value, 10) || 0 })}
                        className="w-full h-9 px-3 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 text-xs focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5 min-w-0">
                    <label className="text-[11px] text-slate-400 font-semibold block">Special Instructions & Check Call Rules</label>
                    <textarea
                      id="ratecon-special-instructions"
                      rows={3}
                      value={formFields.special_instructions}
                      onChange={(e) => setFormFields({ ...formFields, special_instructions: e.target.value })}
                      placeholder="Special instructions, check-call intervals, pickup/delivery procedures..."
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 text-xs resize-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 placeholder-slate-600 font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Right 1 Col: Real-time Profitability & Accessorials */}
              <div className="sm:col-span-1 space-y-4">
                {/* Financial Benchmark Engine */}
                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
                    <Sparkles className="w-4 h-4" />
                    <span>Financial Sanity Engine</span>
                  </div>

                  <div className="space-y-2 font-mono tabular-nums text-xs">
                    <div className="flex items-center justify-between py-1 border-b border-slate-900 whitespace-nowrap">
                      <span className="text-slate-400 font-sans truncate pr-2">Gross Revenue</span>
                      <span className="font-bold text-emerald-300 shrink-0">{formatCurrency(currentProfitability.grossRate)}</span>
                    </div>
                    <div className="flex items-center justify-between py-1 border-b border-slate-900 whitespace-nowrap">
                      <span className="text-slate-400 font-sans truncate pr-2">Rate Per Mile (RPM)</span>
                      <span className="font-bold text-slate-100 shrink-0">{formatRPM(currentProfitability.rpm)}</span>
                    </div>
                    <div className="flex items-center justify-between py-1 border-b border-slate-900 whitespace-nowrap">
                      <span className="text-slate-400 font-sans truncate pr-2">Est. Fuel Cost</span>
                      <span className="text-slate-300 shrink-0">{formatCurrency(currentProfitability.fuelExpense)}</span>
                    </div>
                    <div className="flex items-center justify-between py-1 border-b border-slate-900 whitespace-nowrap">
                      <span className="text-slate-400 font-sans truncate pr-2">Est. Driver Pay</span>
                      <span className="text-slate-300 shrink-0">{formatCurrency(currentProfitability.driverPay)}</span>
                    </div>
                    <div className="flex items-center justify-between py-1.5 bg-slate-900/60 px-2 rounded-lg font-bold whitespace-nowrap">
                      <span className="text-indigo-300 font-sans truncate pr-2">Net Estimated Profit</span>
                      <span className="text-indigo-200 shrink-0">{formatCurrency(currentProfitability.estimatedProfit)} ({currentProfitability.profitMargin}%)</span>
                    </div>
                  </div>
                </div>

                {/* Accessorial Clauses */}
                {extraction.accessorials && extraction.accessorials.length > 0 && (
                  <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                    <span className="text-[10px] uppercase font-semibold text-slate-400">Extracted Accessorials</span>
                    <div className="space-y-1.5">
                      {extraction.accessorials.map((acc, idx) => (
                        <div key={idx} className="p-2.5 rounded-lg bg-slate-900/70 border border-slate-800 text-[11px]">
                          <div className="flex items-center justify-between font-semibold text-slate-200 font-mono tabular-nums whitespace-nowrap">
                            <span className="capitalize font-sans truncate pr-2">{acc.type.replace(/_/g, ' ')}</span>
                            {acc.amount ? <span className="shrink-0">{formatCurrency(acc.amount)}</span> : null}
                          </div>
                          {acc.notes && <p className="text-slate-400 mt-0.5 text-[10px]">{acc.notes}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Approval Action Bar */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={onClose}
                className="h-9 px-4 text-xs font-semibold text-slate-400 hover:text-slate-200 bg-slate-900 rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleApplyToLoad}
                disabled={isApplying}
                className="h-9 inline-flex items-center gap-2 px-6 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>
                  {isApplying
                    ? 'Applying & Auditing...'
                    : targetMode === 'new'
                    ? 'Approve & Create Load'
                    : 'Approve & Update Load'}
                </span>
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};
