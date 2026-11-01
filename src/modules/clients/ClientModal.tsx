import React, { useState, useEffect } from 'react';
import { Client, ClientType } from '../../types/domain.types.ts';
import { Modal } from '../../components/common/Modal.tsx';
import { clientService } from './clientService.ts';
import { AlertCircle, CheckCircle2, Building2, Users, Truck, FileText, Check } from 'lucide-react';

interface ClientModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (client: Client, isEdit: boolean) => void;
  clientToEdit?: Client | null;
  organizationId: string;
  initialValues?: Partial<Client> | null;
  zIndex?: string;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const ClientModal: React.FC<ClientModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  clientToEdit,
  organizationId,
  initialValues,
  zIndex,
}) => {
  const isEdit = Boolean(clientToEdit);

  // Form fields
  const [companyName, setCompanyName] = useState('');
  const [clientType, setClientType] = useState<ClientType>('owner_operator');
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [billingEmail, setBillingEmail] = useState('');
  const [preferredEquipment, setPreferredEquipment] = useState('');
  const [preferredLanes, setPreferredLanes] = useState('');
  const [minRpm, setMinRpm] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<'active' | 'inactive'>('active');

  // Form submission state & errors
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Reset or populate fields when modal opens or clientToEdit changes
  useEffect(() => {
    if (isOpen) {
      setFormError(null);
      setFieldErrors({});

      if (clientToEdit) {
        setCompanyName(clientToEdit.company_name || '');
        setClientType(clientToEdit.client_type || 'owner_operator');
        setContactName(clientToEdit.contact_name || '');
        setContactEmail(clientToEdit.contact_email || '');
        setContactPhone(clientToEdit.contact_phone || '');
        setBillingEmail(clientToEdit.billing_email || '');
        setPreferredEquipment(clientToEdit.preferred_equipment || '');
        setPreferredLanes(clientToEdit.preferred_lanes || '');
        setMinRpm(
          clientToEdit.minimum_rate_per_mile !== null && clientToEdit.minimum_rate_per_mile !== undefined
            ? clientToEdit.minimum_rate_per_mile.toString()
            : ''
        );
        setNotes(clientToEdit.notes || '');
        setStatus(clientToEdit.status || 'active');
      } else {
        setCompanyName(initialValues?.company_name || '');
        setClientType(initialValues?.client_type || 'owner_operator');
        setContactName(initialValues?.contact_name || '');
        setContactEmail(initialValues?.contact_email || '');
        setContactPhone(initialValues?.contact_phone || '');
        setBillingEmail(initialValues?.billing_email || '');
        setPreferredEquipment(initialValues?.preferred_equipment || '');
        setPreferredLanes(initialValues?.preferred_lanes || '');
        setMinRpm(
          initialValues?.minimum_rate_per_mile !== null && initialValues?.minimum_rate_per_mile !== undefined
            ? initialValues.minimum_rate_per_mile.toString()
            : ''
        );
        setNotes(initialValues?.notes || '');
        setStatus(initialValues?.status || 'active');
      }
    }
  }, [isOpen, clientToEdit, initialValues]);

  const validate = (): boolean => {
    const errors: Record<string, string> = {};

    if (!companyName.trim()) {
      errors.companyName = 'Company name is required';
    }

    if (contactEmail.trim() && !EMAIL_REGEX.test(contactEmail.trim())) {
      errors.contactEmail = 'Please enter a valid email address';
    }

    if (billingEmail.trim() && !EMAIL_REGEX.test(billingEmail.trim())) {
      errors.billingEmail = 'Please enter a valid billing email address';
    }

    if (minRpm.trim() !== '') {
      const parsed = parseFloat(minRpm);
      if (isNaN(parsed) || parsed < 0) {
        errors.minRpm = 'Minimum rate per mile must be a non-negative number';
      }
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
      setFormError('Organization context missing. Please re-authenticate.');
      return;
    }

    setIsSubmitting(true);

    try {
      const parsedRpm = minRpm.trim() !== '' ? parseFloat(minRpm) : null;

      const payload = {
        company_name: companyName.trim(),
        client_type: clientType,
        contact_name: contactName.trim() || null,
        contact_email: contactEmail.trim() || null,
        contact_phone: contactPhone.trim() || null,
        billing_email: billingEmail.trim() || null,
        preferred_equipment: preferredEquipment.trim() || null,
        preferred_lanes: preferredLanes.trim() || null,
        minimum_rate_per_mile: parsedRpm !== null && !isNaN(parsedRpm) ? parsedRpm : null,
        notes: notes.trim() || null,
        status,
      };

      if (isEdit && clientToEdit) {
        const data = await clientService.updateClient(organizationId, clientToEdit.id, payload);
        onSuccess(data, true);
        onClose();
      } else {
        const data = await clientService.createClient(organizationId, payload);
        onSuccess(data, false);
        onClose();
      }
    } catch (err: unknown) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : typeof err === 'object' && err !== null && 'message' in err
          ? String((err as { message: unknown }).message)
          : 'Failed to save carrier client. Please try again.';
      setFormError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      id="client-modal"
      isOpen={isOpen}
      onClose={onClose}
      title={isEdit ? 'Edit Carrier Client' : 'Add Carrier Client (Trucking Customer)'}
      subtitle={
        isEdit
          ? `Update details and operational preferences for ${clientToEdit?.company_name}`
          : 'Register an Owner-Operator or Fleet client under your dispatch organization'
      }
      maxWidth="lg"
      zIndex={zIndex}
    >
      <form onSubmit={handleSubmit} className="space-y-5 text-xs">
        {formError && (
          <div
            id="client-form-error"
            className="p-3.5 bg-rose-950/50 border border-rose-800/80 rounded-xl text-rose-200 flex items-start gap-2.5 shadow-xs"
          >
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-xs">Error Saving Client</p>
              <p className="text-[11px] text-rose-300 mt-0.5">{formError}</p>
            </div>
          </div>
        )}

        {/* Section 1: Carrier Identity & Classification */}
        <div className="space-y-3 p-4 bg-slate-950/40 border border-slate-800/80 rounded-xl">
          <div className="flex items-center gap-1.5 text-slate-300 font-semibold uppercase tracking-wider text-[11px] border-b border-slate-800/60 pb-2">
            <Building2 className="w-3.5 h-3.5 text-indigo-400" />
            <span>Carrier Identity & Classification</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-slate-300 font-medium mb-1">
                Carrier / Company Name <span className="text-rose-400">*</span>
              </label>
              <input
                id="client-company-name-input"
                type="text"
                placeholder="e.g. Apex Hauling LLC / John Smith Trucking"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className={`w-full h-9 px-3 bg-slate-950 border rounded-xl text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 transition-colors ${
                  fieldErrors.companyName ? 'border-rose-500' : 'border-slate-800'
                }`}
              />
              {fieldErrors.companyName && (
                <p className="text-[11px] text-rose-400 mt-1">{fieldErrors.companyName}</p>
              )}
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1">
                Account Type <span className="text-rose-400">*</span>
              </label>
              <select
                id="client-type-select"
                value={clientType}
                onChange={(e) => setClientType(e.target.value as ClientType)}
                className="w-full h-9 px-3 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 cursor-pointer"
              >
                <option value="owner_operator">Owner-Operator (1 Truck)</option>
                <option value="fleet">Small Fleet (Multi-Truck)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Section 2: Contact & Factoring Roster */}
        <div className="space-y-3 p-4 bg-slate-950/40 border border-slate-800/80 rounded-xl">
          <div className="flex items-center gap-1.5 text-slate-300 font-semibold uppercase tracking-wider text-[11px] border-b border-slate-800/60 pb-2">
            <Users className="w-3.5 h-3.5 text-indigo-400" />
            <span>Contact & Billing Roster</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 font-medium mb-1">Primary Contact Name</label>
              <input
                id="client-contact-name-input"
                type="text"
                placeholder="e.g. John Smith"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                className="w-full h-9 px-3 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1">Contact Phone</label>
              <input
                id="client-contact-phone-input"
                type="tel"
                placeholder="+1 (555) 123-4567"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                className="w-full h-9 px-3 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 font-mono tabular-nums"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1">Contact Email</label>
              <input
                id="client-contact-email-input"
                type="email"
                placeholder="dispatch@carrier.com"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                className={`w-full h-9 px-3 bg-slate-950 border rounded-xl text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 ${
                  fieldErrors.contactEmail ? 'border-rose-500' : 'border-slate-800'
                }`}
              />
              {fieldErrors.contactEmail && (
                <p className="text-[11px] text-rose-400 mt-1">{fieldErrors.contactEmail}</p>
              )}
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1">Billing / Factoring Email</label>
              <input
                id="client-billing-email-input"
                type="email"
                placeholder="invoicing@carrier.com"
                value={billingEmail}
                onChange={(e) => setBillingEmail(e.target.value)}
                className={`w-full h-9 px-3 bg-slate-950 border rounded-xl text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 font-mono ${
                  fieldErrors.billingEmail ? 'border-rose-500' : 'border-slate-800'
                }`}
              />
              {fieldErrors.billingEmail && (
                <p className="text-[11px] text-rose-400 mt-1">{fieldErrors.billingEmail}</p>
              )}
            </div>
          </div>
        </div>

        {/* Section 3: Dispatch & Rate Preferences */}
        <div className="space-y-3 p-4 bg-slate-950/40 border border-slate-800/80 rounded-xl">
          <div className="flex items-center gap-1.5 text-slate-300 font-semibold uppercase tracking-wider text-[11px] border-b border-slate-800/60 pb-2">
            <Truck className="w-3.5 h-3.5 text-indigo-400" />
            <span>Dispatch & Rate Preferences</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-slate-300 font-medium mb-1">Preferred Equipment</label>
              <input
                id="client-equipment-input"
                type="text"
                placeholder="53' Dry Van, Reefer"
                value={preferredEquipment}
                onChange={(e) => setPreferredEquipment(e.target.value)}
                className="w-full h-9 px-3 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1">Preferred Lanes</label>
              <input
                id="client-lanes-input"
                type="text"
                placeholder="IL -> TX, Midwest Regional"
                value={preferredLanes}
                onChange={(e) => setPreferredLanes(e.target.value)}
                className="w-full h-9 px-3 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1">Target Min RPM ($/mi)</label>
              <input
                id="client-min-rpm-input"
                type="number"
                step="0.01"
                min="0"
                placeholder="2.50"
                value={minRpm}
                onChange={(e) => setMinRpm(e.target.value)}
                className={`w-full h-9 px-3 bg-slate-950 border rounded-xl text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 font-mono tabular-nums ${
                  fieldErrors.minRpm ? 'border-rose-500' : 'border-slate-800'
                }`}
              />
              {fieldErrors.minRpm && (
                <p className="text-[11px] text-rose-400 mt-1">{fieldErrors.minRpm}</p>
              )}
            </div>
          </div>
        </div>

        {/* Section 4: Operational Status & Dispatcher Notes */}
        <div className="space-y-3 p-4 bg-slate-950/40 border border-slate-800/80 rounded-xl">
          <div className="flex items-center gap-1.5 text-slate-300 font-semibold uppercase tracking-wider text-[11px] border-b border-slate-800/60 pb-2">
            <FileText className="w-3.5 h-3.5 text-indigo-400" />
            <span>Dispatcher Notes & Account Status</span>
          </div>

          {/* Polished Segmented Status Controls */}
          <div>
            <label className="block text-slate-300 font-medium mb-1.5">Client Account Status</label>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setStatus('active')}
                className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between ${
                  status === 'active'
                    ? 'bg-emerald-950/40 border-emerald-700/80 text-emerald-200'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div>
                  <div className="font-semibold text-xs flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    Active Client
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">Available for load dispatch</div>
                </div>
                {status === 'active' && <Check className="w-4 h-4 text-emerald-400" />}
              </button>

              <button
                type="button"
                onClick={() => setStatus('inactive')}
                className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between ${
                  status === 'inactive'
                    ? 'bg-amber-950/40 border-amber-700/80 text-amber-200'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div>
                  <div className="font-semibold text-xs flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-400" />
                    Inactive Client
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">Suspended / Off-duty</div>
                </div>
                {status === 'inactive' && <Check className="w-4 h-4 text-amber-400" />}
              </button>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-slate-300 font-medium mb-1">Dispatcher Operational Notes</label>
            <textarea
              id="client-notes-textarea"
              rows={3}
              placeholder="Driver home time requirements, factoring company terms, special freight preferences, etc."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50"
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            id="client-submit-btn"
            type="submit"
            disabled={isSubmitting}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl transition-colors cursor-pointer disabled:opacity-50 shadow-xs"
          >
            {isSubmitting ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                <span>{isEdit ? 'Updating...' : 'Saving...'}</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>{isEdit ? 'Update Carrier Client' : 'Save Carrier Client'}</span>
              </>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
};

