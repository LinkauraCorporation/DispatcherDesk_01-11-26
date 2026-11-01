import React, { useState, useEffect, useCallback } from 'react';
import {
  Building2,
  Truck as TruckIcon,
  UserCheck,
  ShieldCheck,
  PackageCheck,
  ArrowRight,
  ArrowLeft,
  Plus,
  Edit2,
  Check,
  CheckCircle2,
  Phone,
  Mail,
  DollarSign,
  LogOut,
  MapPin,
  FileText,
  AlertCircle,
} from 'lucide-react';
import {
  Client,
  Truck,
  Driver,
  Broker,
  Load,
  Organization,
  DriverPayType,
  DriverStatus,
} from '../../types/domain.types.ts';
import { DriverWithRelations } from '../drivers/driverTypes.ts';
import { BrokerWithPerformance, CreateBrokerInput, UpdateBrokerInput } from '../brokers/brokerTypes.ts';
import { CreateLoadInput, UpdateLoadInput } from '../loads/loadTypes.ts';
import { clientService } from '../clients/clientService.ts';
import { truckService } from '../trucks/truckService.ts';
import { driverService } from '../drivers/driverService.ts';
import { brokerService } from '../brokers/brokerService.ts';
import { loadService } from '../loads/loadService.ts';
import { documentService } from '../documents/documentService.ts';
import { ClientModal } from '../clients/ClientModal.tsx';
import { TruckModal } from '../trucks/TruckModal.tsx';
import { DriverModal } from '../drivers/DriverModal.tsx';
import { BrokerModal } from '../brokers/BrokerModal.tsx';
import { LoadModal } from '../loads/LoadModal.tsx';
import { useAuth } from '../../contexts/AuthContext.tsx';
import {
  OnboardingStepNumber,
  OnboardingState,
  ONBOARDING_STEPS,
} from './onboardingTypes.ts';

interface FirstTimeOnboardingViewProps {
  organization: Organization;
  onComplete: (createdLoad: Load) => void;
}

export const FirstTimeOnboardingView: React.FC<FirstTimeOnboardingViewProps> = ({
  organization,
  onComplete,
}) => {
  const { user, signOut } = useAuth();
  const storageKey = `dispatchdesk_first_time_setup_${user?.id || 'guest'}`;

  // Current wizard step (1 to 5)
  const [currentStep, setCurrentStep] = useState<OnboardingStepNumber>(1);

  // Stored entities across wizard steps
  const [createdClient, setCreatedClient] = useState<Client | null>(null);
  const [createdTruck, setCreatedTruck] = useState<Truck | null>(null);
  const [createdDriver, setCreatedDriver] = useState<DriverWithRelations | Driver | null>(null);
  const [createdBroker, setCreatedBroker] = useState<BrokerWithPerformance | Broker | null>(null);

  // Modal open states
  const [isClientModalOpen, setIsClientModalOpen] = useState(false);
  const [isTruckModalOpen, setIsTruckModalOpen] = useState(false);
  const [isDriverModalOpen, setIsDriverModalOpen] = useState(false);
  const [isBrokerModalOpen, setIsBrokerModalOpen] = useState(false);
  const [isLoadModalOpen, setIsLoadModalOpen] = useState(false);

  // Modals edit tracking
  const [isEditingClient, setIsEditingClient] = useState(false);
  const [isEditingTruck, setIsEditingTruck] = useState(false);
  const [isEditingDriver, setIsEditingDriver] = useState(false);
  const [isEditingBroker, setIsEditingBroker] = useState(false);

  // Next load number pre-fetched for Step 5
  const [nextLoadNumber, setNextLoadNumber] = useState<string>('');
  const [isSavingLoad, setIsSavingLoad] = useState(false);
  const [stepError, setStepError] = useState<string | null>(null);

  // Helper to persist transient UI state to localStorage
  const saveTransientState = useCallback(
    (override?: Partial<OnboardingState>) => {
      const stateToSave: OnboardingState = {
        orgId: organization.id,
        step: override?.step ?? currentStep,
        client: override?.client !== undefined ? override.client : createdClient,
        truck: override?.truck !== undefined ? override.truck : createdTruck,
        driver: override?.driver !== undefined ? override.driver : createdDriver,
        broker: override?.broker !== undefined ? override.broker : createdBroker,
        isComplete: false,
        lastUpdated: new Date().toISOString(),
      };
      try {
        localStorage.setItem(storageKey, JSON.stringify(stateToSave));
      } catch (err) {
        console.warn('Unable to persist transient onboarding state:', err);
      }
    },
    [organization.id, currentStep, createdClient, createdTruck, createdDriver, createdBroker, storageKey]
  );

  // On mount: Restore existing progress if this org has a valid saved session
  useEffect(() => {
    try {
      const savedRaw = localStorage.getItem(storageKey);
      if (savedRaw) {
        const parsed: OnboardingState = JSON.parse(savedRaw);
        if (parsed && parsed.orgId === organization.id && !parsed.isComplete) {
          if (parsed.step && parsed.step >= 1 && parsed.step <= 5) {
            setCurrentStep(parsed.step);
          }
          if (parsed.client) setCreatedClient(parsed.client);
          if (parsed.truck) setCreatedTruck(parsed.truck);
          if (parsed.driver) setCreatedDriver(parsed.driver);
          if (parsed.broker) setCreatedBroker(parsed.broker);
        }
      }
    } catch (e) {
      console.warn('Failed to parse onboarding resume state:', e);
    }
  }, [organization.id, storageKey]);

  // Pre-fetch next load number for when the user reaches Step 5
  useEffect(() => {
    let isMounted = true;
    loadService
      .generateNextLoadNumber(organization.id)
      .then((num) => {
        if (isMounted && num) {
          setNextLoadNumber(num);
        }
      })
      .catch((e) => {
        console.warn('Failed to generate next load number:', e);
      });
    return () => {
      isMounted = false;
    };
  }, [organization.id]);

  // Step 1: Carrier Client handlers
  const handleClientSuccess = (client: Client, isEdit: boolean) => {
    setCreatedClient(client);
    setIsClientModalOpen(false);
    setIsEditingClient(false);
    setStepError(null);

    if (!isEdit) {
      // Advance to Truck step automatically
      setCurrentStep(2);
      saveTransientState({ client, step: 2 });
    } else {
      saveTransientState({ client });
    }
  };

  // Step 2: Truck handlers
  const handleTruckSuccess = (truck: Truck, isEdit: boolean) => {
    setCreatedTruck(truck);
    setIsTruckModalOpen(false);
    setIsEditingTruck(false);
    setStepError(null);

    if (!isEdit) {
      // Advance to Driver step automatically
      setCurrentStep(3);
      saveTransientState({ truck, step: 3 });
    } else {
      saveTransientState({ truck });
    }
  };

  // Step 3: Driver handlers
  const handleSaveDriver = async (payload: {
    client_id: string | null;
    assigned_truck_id: string | null;
    full_name: string;
    phone: string | null;
    email: string | null;
    pay_type: DriverPayType;
    pay_rate: number;
    status: DriverStatus;
    notes: string | null;
  }) => {
    setStepError(null);
    try {
      if (isEditingDriver && createdDriver) {
        const updated = await driverService.updateDriver(organization.id, createdDriver.id, payload);
        setCreatedDriver(updated);
        setIsDriverModalOpen(false);
        setIsEditingDriver(false);
        saveTransientState({ driver: updated });
      } else {
        const created = await driverService.createDriver(organization.id, payload);
        setCreatedDriver(created);
        setIsDriverModalOpen(false);
        setIsEditingDriver(false);
        // Advance to Broker step automatically
        setCurrentStep(4);
        saveTransientState({ driver: created, step: 4 });
      }
    } catch (err: any) {
      console.error('Error saving driver in onboarding:', err);
      throw err;
    }
  };

  const handleSkipDriver = () => {
    setStepError(null);
    setCreatedDriver(null);
    setCurrentStep(4);
    saveTransientState({ driver: null, step: 4 });
  };

  // Step 4: Broker handlers
  const handleSaveBroker = async (input: CreateBrokerInput | UpdateBrokerInput) => {
    setStepError(null);
    try {
      if (isEditingBroker && createdBroker) {
        const updated = await brokerService.updateBroker(organization.id, createdBroker.id, input);
        setCreatedBroker(updated);
        setIsBrokerModalOpen(false);
        setIsEditingBroker(false);
        saveTransientState({ broker: updated });
      } else {
        const created = await brokerService.createBroker(organization.id, input as CreateBrokerInput);
        setCreatedBroker(created);
        setIsBrokerModalOpen(false);
        setIsEditingBroker(false);
        // Advance to Book Load step automatically
        setCurrentStep(5);
        saveTransientState({ broker: created, step: 5 });
      }
    } catch (err: any) {
      console.error('Error saving broker in onboarding:', err);
      throw err;
    }
  };

  const handleSkipBroker = () => {
    setStepError(null);
    setCreatedBroker(null);
    setCurrentStep(5);
    saveTransientState({ broker: null, step: 5 });
  };

  // Step 5: First Load creation handler
  const handleSaveFirstLoad = async (
    input: CreateLoadInput | UpdateLoadInput,
    rateConFile?: File | null
  ) => {
    setIsSavingLoad(true);
    setStepError(null);
    try {
      const created = await loadService.createLoad(organization.id, input as CreateLoadInput);

      // Attach original Rate Con PDF if one was uploaded during Book Load
      if (rateConFile) {
        try {
          await documentService.createDocument(
            organization.id,
            {
              load_id: created.id,
              doc_type: 'rate_confirmation',
              doc_status: 'verified', // Dispatcher reviewed and confirmed during Load Booking
              file_name: rateConFile.name,
              file_size_bytes: rateConFile.size,
              mime_type: rateConFile.type || 'application/pdf',
            },
            rateConFile
          );
        } catch (docErr) {
          console.error('Failed to attach Rate Con document after load creation in onboarding:', docErr);
          // CRITICAL: Document attachment failure must NOT delete/rollback the successfully created load.
        }
      }

      setIsLoadModalOpen(false);

      // Mark complete and clear transient state
      try {
        localStorage.removeItem(storageKey);
      } catch {
        // ignore
      }

      onComplete(created);
    } catch (err: any) {
      console.error('Error booking first load in onboarding:', err);
      setStepError(err?.message || 'Failed to book first load. Please check lane and rate information.');
      throw err;
    } finally {
      setIsSavingLoad(false);
    }
  };

  return (
    <div id="first-time-onboarding-view" className="min-h-screen bg-slate-950 flex flex-col">
      {/* Header bar: Dedicated wizard branding with tenant context */}
      <header className="bg-slate-900/90 border-b border-slate-800/80 px-4 sm:px-8 py-3.5 sticky top-0 z-30 backdrop-blur-md">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center shadow-md shadow-indigo-600/30">
              <TruckIcon className="w-4 h-4 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-100 text-sm tracking-tight">DispatcherDesk</span>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-indigo-950 text-indigo-400 border border-indigo-800/50">
                  Initial Setup Wizard
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Workspace: <span className="text-slate-200 font-semibold">{organization.name}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {user && (
              <div className="hidden sm:flex flex-col items-end">
                <span className="text-xs font-medium text-slate-200">{user.email}</span>
                <span className="text-[10px] text-slate-400">Organization Administrator</span>
              </div>
            )}
            {signOut && (
              <button
                type="button"
                onClick={() => signOut()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 rounded-lg transition-colors cursor-pointer"
                title="Sign out of DispatcherDesk"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Sign Out</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main wizard body */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-8 sm:py-12 flex flex-col justify-center">
        {/* Step Progress Bar */}
        <div className="mb-8 sm:mb-12">
          <div className="flex items-center justify-between relative">
            {/* Connecting line */}
            <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-slate-800 -translate-y-1/2 z-0" />
            <div
              className="absolute top-1/2 left-0 h-0.5 bg-indigo-600 -translate-y-1/2 z-0 transition-all duration-300"
              style={{
                width: `${((currentStep - 1) / (ONBOARDING_STEPS.length - 1)) * 100}%`,
              }}
            />

            {ONBOARDING_STEPS.map((s) => {
              const isPast = s.step < currentStep;
              const isCurrent = s.step === currentStep;
              const isFinished =
                (s.step === 1 && !!createdClient) ||
                (s.step === 2 && !!createdTruck) ||
                (s.step === 3 && !!createdDriver) ||
                (s.step === 4 && (!!createdBroker || currentStep > 4));

              return (
                <div key={s.step} className="flex flex-col items-center relative z-10">
                  <div
                    className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                      isFinished || isPast
                        ? 'bg-emerald-600 text-white shadow-md shadow-emerald-950'
                        : isCurrent
                        ? 'bg-indigo-600 text-white ring-4 ring-indigo-950 shadow-md shadow-indigo-900/50'
                        : 'bg-slate-900 border border-slate-700 text-slate-400'
                    }`}
                  >
                    {isFinished || isPast ? (
                      <Check className="w-4 h-4 text-white stroke-[3]" />
                    ) : (
                      <span>{s.step}</span>
                    )}
                  </div>
                  <span
                    className={`text-[11px] font-medium mt-2 text-center hidden sm:block ${
                      isCurrent
                        ? 'text-indigo-400 font-semibold'
                        : isPast || isFinished
                        ? 'text-slate-300'
                        : 'text-slate-500'
                    }`}
                  >
                    {s.shortName}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Global Step Error alert */}
        {stepError && (
          <div
            id="onboarding-step-error"
            className="mb-6 p-4 bg-rose-950/60 border border-rose-800 rounded-xl text-rose-200 flex items-start gap-3 text-xs"
          >
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-xs text-rose-200">Unable to Proceed</p>
              <p className="text-[11px] text-rose-300 mt-0.5">{stepError}</p>
            </div>
          </div>
        )}

        {/* Step 1: Carrier Client */}
        {currentStep === 1 && (
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-xl">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 rounded-lg bg-indigo-950/80 border border-indigo-800/60 flex items-center justify-center text-indigo-400">
                <Building2 className="w-4 h-4" />
              </div>
              <h2 className="text-lg sm:text-xl font-bold text-slate-100">Step 1 — Carrier Client</h2>
            </div>
            <p className="text-xs sm:text-sm text-slate-400 mb-6 leading-relaxed">
              Every dispatch assignment starts with a carrier client — either an owner-operator or fleet company
              you manage dispatch operations for. Register your primary carrier client to get started.
            </p>

            {createdClient ? (
              <div className="space-y-6">
                <div className="bg-slate-950/60 border border-emerald-800/40 rounded-xl p-5 relative overflow-hidden">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                      <h3 className="font-bold text-slate-100 text-sm sm:text-base">
                        {createdClient.company_name}
                      </h3>
                    </div>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-950 text-emerald-300 border border-emerald-800/50">
                      Carrier Ready
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-slate-300">
                    <div>
                      <span className="text-slate-500 block text-[10px] uppercase font-semibold">Client Type</span>
                      <span className="capitalize">{createdClient.client_type.replace('_', ' ')}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px] uppercase font-semibold">Primary Contact</span>
                      <span>{createdClient.contact_name || 'None listed'}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px] uppercase font-semibold">Target Min RPM</span>
                      <span>
                        {createdClient.minimum_rate_per_mile
                          ? `$${Number(createdClient.minimum_rate_per_mile).toFixed(2)}/mi`
                          : 'Not specified'}
                      </span>
                    </div>
                  </div>

                  {createdClient.contact_phone && (
                    <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center gap-4 text-xs text-slate-400">
                      <span className="flex items-center gap-1.5">
                        <Phone className="w-3.5 h-3.5 text-slate-500" />
                        {createdClient.contact_phone}
                      </span>
                      {createdClient.contact_email && (
                        <span className="flex items-center gap-1.5">
                          <Mail className="w-3.5 h-3.5 text-slate-500" />
                          {createdClient.contact_email}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditingClient(true);
                      setIsClientModalOpen(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-300 hover:text-slate-100 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    <span>Edit Client Details</span>
                  </button>

                  <button
                    type="button"
                    id="onboarding-continue-to-truck-btn"
                    onClick={() => {
                      setCurrentStep(2);
                      saveTransientState({ step: 2 });
                    }}
                    className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-md shadow-indigo-900/40 transition-colors cursor-pointer"
                  >
                    <span>Continue to Truck & Equipment</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 border-2 border-dashed border-slate-800 rounded-xl bg-slate-950/40 space-y-4">
                <div className="w-12 h-12 rounded-full bg-slate-900 flex items-center justify-center mx-auto text-slate-500">
                  <Building2 className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-200">No Carrier Client Configured</h3>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
                    Add your first owner-operator or carrier client to establish dispatch rates, equipment preferences,
                    and contact details.
                  </p>
                </div>
                <button
                  type="button"
                  id="onboarding-create-client-btn"
                  onClick={() => {
                    setIsEditingClient(false);
                    setIsClientModalOpen(true);
                  }}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-md shadow-indigo-900/40 transition-colors cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Create Carrier Client</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* Step 2: Truck & Equipment */}
        {currentStep === 2 && (
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-xl">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 rounded-lg bg-indigo-950/80 border border-indigo-800/60 flex items-center justify-center text-indigo-400">
                <TruckIcon className="w-4 h-4" />
              </div>
              <h2 className="text-lg sm:text-xl font-bold text-slate-100">Step 2 — Truck & Equipment</h2>
            </div>
            <p className="text-xs sm:text-sm text-slate-400 mb-6 leading-relaxed">
              Register a power unit or trailer assigned to{' '}
              <strong className="text-slate-200">{createdClient?.company_name}</strong>. Equipment details ensure
              accurate weight and trailer matchings when booking loads.
            </p>

            {createdTruck ? (
              <div className="space-y-6">
                <div className="bg-slate-950/60 border border-emerald-800/40 rounded-xl p-5 relative overflow-hidden">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                      <h3 className="font-bold text-slate-100 text-sm sm:text-base">
                        Unit #{createdTruck.truck_number}
                      </h3>
                    </div>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-950 text-emerald-300 border border-emerald-800/50">
                      Truck Assigned
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-slate-300">
                    <div>
                      <span className="text-slate-500 block text-[10px] uppercase font-semibold">Equipment Type</span>
                      <span className="uppercase font-medium">{createdTruck.equipment_type.replace('_', ' ')}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px] uppercase font-semibold">Max Payload</span>
                      <span>
                        {createdTruck.max_weight_lbs
                          ? `${Number(createdTruck.max_weight_lbs).toLocaleString()} lbs`
                          : '45,000 lbs'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px] uppercase font-semibold">Carrier Owner</span>
                      <span>{createdClient?.company_name}</span>
                    </div>
                  </div>

                  {(createdTruck.vin || createdTruck.current_location_city) && (
                    <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center gap-4 text-xs text-slate-400">
                      {createdTruck.vin && <span>VIN: {createdTruck.vin}</span>}
                      {createdTruck.current_location_city && (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-slate-500" />
                          {createdTruck.current_location_city}
                          {createdTruck.current_location_state ? `, ${createdTruck.current_location_state}` : ''}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between pt-2">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setCurrentStep(1)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      <span>Back to Client</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsEditingTruck(true);
                        setIsTruckModalOpen(true);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-300 hover:text-slate-100 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                      <span>Edit Truck</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    id="onboarding-continue-to-driver-btn"
                    onClick={() => {
                      setCurrentStep(3);
                      saveTransientState({ step: 3 });
                    }}
                    className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-md shadow-indigo-900/40 transition-colors cursor-pointer"
                  >
                    <span>Continue to Driver Profile</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 border-2 border-dashed border-slate-800 rounded-xl bg-slate-950/40 space-y-4">
                <div className="w-12 h-12 rounded-full bg-slate-900 flex items-center justify-center mx-auto text-slate-500">
                  <TruckIcon className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-200">No Truck Assigned Yet</h3>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
                    Add a tractor unit, dry van, reefer, or flatbed assigned to{' '}
                    <span className="text-slate-300 font-medium">{createdClient?.company_name}</span>.
                  </p>
                </div>
                <div className="flex items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => setCurrentStep(1)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Back</span>
                  </button>
                  <button
                    type="button"
                    id="onboarding-create-truck-btn"
                    onClick={() => {
                      setIsEditingTruck(false);
                      setIsTruckModalOpen(true);
                    }}
                    className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-md shadow-indigo-900/40 transition-colors cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add Truck & Equipment</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 3: Driver */}
        {currentStep === 3 && (
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-xl">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 rounded-lg bg-indigo-950/80 border border-indigo-800/60 flex items-center justify-center text-indigo-400">
                <UserCheck className="w-4 h-4" />
              </div>
              <h2 className="text-lg sm:text-xl font-bold text-slate-100">Step 3 — Driver Profile</h2>
            </div>
            <p className="text-xs sm:text-sm text-slate-400 mb-6 leading-relaxed">
              Add the primary driver who operates Unit #{createdTruck?.truck_number}. Driver profiles power dispatch
              tracking, check calls, and driver settlement pay calculations.
            </p>

            {createdDriver ? (
              <div className="space-y-6">
                <div className="bg-slate-950/60 border border-emerald-800/40 rounded-xl p-5 relative overflow-hidden">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                      <h3 className="font-bold text-slate-100 text-sm sm:text-base">{createdDriver.full_name}</h3>
                    </div>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-950 text-emerald-300 border border-emerald-800/50">
                      Driver Ready
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-slate-300">
                    <div>
                      <span className="text-slate-500 block text-[10px] uppercase font-semibold">Pay Contract</span>
                      <span className="capitalize">
                        {createdDriver.pay_type === 'percentage_gross'
                          ? `${createdDriver.pay_rate}% of Gross`
                          : createdDriver.pay_type === 'per_mile'
                          ? `$${createdDriver.pay_rate}/mile`
                          : `$${createdDriver.pay_rate} Flat`}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px] uppercase font-semibold">Assigned Unit</span>
                      <span>Unit #{createdTruck?.truck_number}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px] uppercase font-semibold">Carrier Affiliation</span>
                      <span>{createdClient?.company_name}</span>
                    </div>
                  </div>

                  {createdDriver.phone && (
                    <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center gap-4 text-xs text-slate-400">
                      <span className="flex items-center gap-1.5">
                        <Phone className="w-3.5 h-3.5 text-slate-500" />
                        {createdDriver.phone}
                      </span>
                      {createdDriver.email && (
                        <span className="flex items-center gap-1.5">
                          <Mail className="w-3.5 h-3.5 text-slate-500" />
                          {createdDriver.email}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between pt-2">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setCurrentStep(2)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      <span>Back to Truck</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsEditingDriver(true);
                        setIsDriverModalOpen(true);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-300 hover:text-slate-100 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                      <span>Edit Driver</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    id="onboarding-continue-to-broker-btn"
                    onClick={() => {
                      setCurrentStep(4);
                      saveTransientState({ step: 4 });
                    }}
                    className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-md shadow-indigo-900/40 transition-colors cursor-pointer"
                  >
                    <span>Continue to Broker (Optional)</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 border-2 border-dashed border-slate-800 rounded-xl bg-slate-950/40 space-y-4">
                <div className="w-12 h-12 rounded-full bg-slate-900 flex items-center justify-center mx-auto text-slate-500">
                  <UserCheck className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-200">No Driver Profile Added</h3>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
                    Add a driver and assign them to Unit #{createdTruck?.truck_number} under{' '}
                    <span className="text-slate-300 font-medium">{createdClient?.company_name}</span>.
                  </p>
                </div>
                <div className="flex items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => setCurrentStep(2)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Back</span>
                  </button>
                  <button
                    type="button"
                    id="onboarding-skip-driver-btn"
                    onClick={handleSkipDriver}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                  >
                    <span>Skip for Now</span>
                  </button>
                  <button
                    type="button"
                    id="onboarding-create-driver-btn"
                    onClick={() => {
                      setIsEditingDriver(false);
                      setIsDriverModalOpen(true);
                    }}
                    className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-md shadow-indigo-900/40 transition-colors cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add Driver Profile</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 4: Freight Broker (Optional) */}
        {currentStep === 4 && (
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-xl">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 rounded-lg bg-indigo-950/80 border border-indigo-800/60 flex items-center justify-center text-indigo-400">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg sm:text-xl font-bold text-slate-100">Step 4 — Freight Broker</h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800 text-slate-300 border border-slate-700">
                  Optional
                </span>
              </div>
            </div>
            <p className="text-xs sm:text-sm text-slate-400 mb-6 leading-relaxed">
              Brokers issue rate confirmations and tender spot or contract loads. You can register a brokerage partner
              now (e.g. C.H. Robinson, TQL, Echo) or skip this step if dispatching direct shipper freight.
            </p>

            {createdBroker ? (
              <div className="space-y-6">
                <div className="bg-slate-950/60 border border-emerald-800/40 rounded-xl p-5 relative overflow-hidden">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                      <h3 className="font-bold text-slate-100 text-sm sm:text-base">{createdBroker.company_name}</h3>
                    </div>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-950 text-emerald-300 border border-emerald-800/50">
                      Broker Configured
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-slate-300">
                    <div>
                      <span className="text-slate-500 block text-[10px] uppercase font-semibold">MC Number</span>
                      <span>{createdBroker.mc_number ? `MC-${createdBroker.mc_number}` : 'None'}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px] uppercase font-semibold">Payment Terms</span>
                      <span className="uppercase">
                        {createdBroker.payment_terms_days
                          ? `Net ${createdBroker.payment_terms_days} Days`
                          : 'Net 30 Days'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px] uppercase font-semibold">Credit Status</span>
                      <span className="capitalize">{createdBroker.credit_status || 'Approved'}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setCurrentStep(3)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      <span>Back to Driver</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsEditingBroker(true);
                        setIsBrokerModalOpen(true);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-300 hover:text-slate-100 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                      <span>Edit Broker</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCreatedBroker(null);
                        saveTransientState({ broker: null });
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 rounded-lg transition-colors cursor-pointer"
                    >
                      <span>Remove & Skip</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    id="onboarding-continue-to-load-btn"
                    onClick={() => {
                      setCurrentStep(5);
                      saveTransientState({ step: 5 });
                    }}
                    className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-md shadow-indigo-900/40 transition-colors cursor-pointer"
                  >
                    <span>Continue to Book First Load</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 border-2 border-dashed border-slate-800 rounded-xl bg-slate-950/40 space-y-4">
                <div className="w-12 h-12 rounded-full bg-slate-900 flex items-center justify-center mx-auto text-slate-500">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-200">Freight Broker (Optional)</h3>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
                    Add a broker to link rate confirmations, or skip this step to book your load directly.
                  </p>
                </div>
                <div className="flex items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => setCurrentStep(3)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Back</span>
                  </button>
                  <button
                    type="button"
                    id="onboarding-skip-broker-btn"
                    onClick={handleSkipBroker}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800 border border-slate-700 rounded-lg transition-colors cursor-pointer"
                  >
                    <span>Skip for now</span>
                  </button>
                  <button
                    type="button"
                    id="onboarding-create-broker-btn"
                    onClick={() => {
                      setIsEditingBroker(false);
                      setIsBrokerModalOpen(true);
                    }}
                    className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-md shadow-indigo-900/40 transition-colors cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add Broker</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 5: Book First Load */}
        {currentStep === 5 && (
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-xl">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 rounded-lg bg-indigo-950/80 border border-indigo-800/60 flex items-center justify-center text-indigo-400">
                <PackageCheck className="w-4 h-4" />
              </div>
              <h2 className="text-lg sm:text-xl font-bold text-slate-100">Step 5 — Book First Load</h2>
            </div>
            <p className="text-xs sm:text-sm text-slate-400 mb-6 leading-relaxed">
              Your foundation is configured! Now create and book your maiden dispatch load. All your newly configured
              carrier, equipment, driver, and broker data are automatically preselected.
            </p>

            {/* Summary cards of preselected entities */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center text-indigo-400 shrink-0">
                  <Building2 className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-500 block">Carrier Client</span>
                  <span className="text-xs font-semibold text-slate-200">
                    {createdClient?.company_name || 'Not configured'}
                  </span>
                </div>
              </div>

              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center text-indigo-400 shrink-0">
                  <TruckIcon className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-500 block">Assigned Truck</span>
                  <span className="text-xs font-semibold text-slate-200">
                    Unit #{createdTruck?.truck_number} ({createdTruck?.equipment_type?.replace('_', ' ')})
                  </span>
                </div>
              </div>

              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center text-indigo-400 shrink-0">
                  <UserCheck className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-500 block">Assigned Driver</span>
                  <span className="text-xs font-semibold text-slate-200">
                    {createdDriver?.full_name || 'Not configured'}
                  </span>
                </div>
              </div>

              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center text-indigo-400 shrink-0">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-500 block">Freight Broker</span>
                  <span className="text-xs font-semibold text-slate-200">
                    {createdBroker ? createdBroker.company_name : 'Direct / Open Tender (No Broker)'}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => setCurrentStep(4)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to Broker Step</span>
              </button>

              <button
                type="button"
                id="onboarding-open-load-modal-btn"
                onClick={() => setIsLoadModalOpen(true)}
                className="inline-flex items-center gap-2 px-6 py-3 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl shadow-lg shadow-indigo-900/50 transition-all hover:scale-[1.02] cursor-pointer"
              >
                <DollarSign className="w-4 h-4" />
                <span>Book First Load</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Domain modals reused cleanly */}
      {/* 1. Client Modal */}
      <ClientModal
        isOpen={isClientModalOpen}
        onClose={() => {
          setIsClientModalOpen(false);
          setIsEditingClient(false);
        }}
        onSuccess={handleClientSuccess}
        clientToEdit={isEditingClient ? createdClient : null}
        organizationId={organization.id}
      />

      {/* 2. Truck Modal */}
      <TruckModal
        isOpen={isTruckModalOpen}
        onClose={() => {
          setIsTruckModalOpen(false);
          setIsEditingTruck(false);
        }}
        onSuccess={handleTruckSuccess}
        truckToEdit={isEditingTruck ? createdTruck : null}
        organizationId={organization.id}
        clients={createdClient ? [createdClient] : []}
      />

      {/* 3. Driver Modal */}
      <DriverModal
        isOpen={isDriverModalOpen}
        onClose={() => {
          setIsDriverModalOpen(false);
          setIsEditingDriver(false);
        }}
        onSuccess={() => {
          setIsDriverModalOpen(false);
          setIsEditingDriver(false);
        }}
        driverToEdit={isEditingDriver ? (createdDriver as DriverWithRelations) : null}
        clients={createdClient ? [createdClient] : []}
        trucks={createdTruck ? [createdTruck] : []}
        allDrivers={[]}
        onSaveDriver={handleSaveDriver}
      />

      {/* 4. Broker Modal */}
      <BrokerModal
        isOpen={isBrokerModalOpen}
        onClose={() => {
          setIsBrokerModalOpen(false);
          setIsEditingBroker(false);
        }}
        brokerToEdit={isEditingBroker ? (createdBroker as BrokerWithPerformance) : null}
        onSaveBroker={handleSaveBroker}
      />

      {/* 5. Load Modal */}
      <LoadModal
        isOpen={isLoadModalOpen}
        onClose={() => setIsLoadModalOpen(false)}
        onSave={handleSaveFirstLoad}
        clients={createdClient ? [createdClient] : []}
        trucks={createdTruck ? [createdTruck] : []}
        drivers={createdDriver ? [createdDriver as Driver] : []}
        brokers={createdBroker ? [createdBroker as Broker] : []}
        nextLoadNumber={nextLoadNumber}
        isSaving={isSavingLoad}
        organizationId={organization?.id}
      />
    </div>
  );
};
