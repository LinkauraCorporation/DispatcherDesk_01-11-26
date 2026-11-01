import React, { useState, useEffect } from 'react';
import { CreditStatus } from '../../types/domain.types.ts';
import {
  BrokerWithPerformance,
  BrokerStatus,
  CreateBrokerInput,
  UpdateBrokerInput,
  CREDIT_STATUS_OPTIONS,
  BROKER_STATUS_OPTIONS,
  isValidEmail,
} from './brokerTypes.ts';
import { Modal } from '../../components/common/Modal.tsx';
import {
  Building2,
  Phone,
  Mail,
  FileText,
  Clock,
  ShieldCheck,
  AlertCircle,
  Hash,
  UserCheck,
} from 'lucide-react';

export interface BrokerModalProps {
  isOpen: boolean;
  onClose: () => void;
  brokerToEdit?: BrokerWithPerformance | null;
  onSaveBroker: (input: CreateBrokerInput | UpdateBrokerInput) => Promise<void>;
  initialValues?: Partial<CreateBrokerInput> | null;
  zIndex?: string;
}

export const BrokerModal: React.FC<BrokerModalProps> = ({
  isOpen,
  onClose,
  brokerToEdit,
  onSaveBroker,
  initialValues,
  zIndex,
}) => {
  const isEdit = Boolean(brokerToEdit);

  // Form Fields
  const [companyName, setCompanyName] = useState('');
  const [mcNumber, setMcNumber] = useState('');
  const [dotNumber, setDotNumber] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [paymentTermsDays, setPaymentTermsDays] = useState('30');
  const [creditStatus, setCreditStatus] = useState<CreditStatus>('approved');
  const [status, setStatus] = useState<BrokerStatus>('active');
  const [notes, setNotes] = useState('');

  // Submission & Validation States
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (isOpen) {
      setFormError(null);
      setFieldErrors({});

      if (brokerToEdit) {
        setCompanyName(brokerToEdit.company_name || '');
        setMcNumber(brokerToEdit.mc_number || '');
        setDotNumber(brokerToEdit.dot_number || '');
        setContactName(brokerToEdit.contact_name || '');
        setContactEmail(brokerToEdit.contact_email || '');
        setContactPhone(brokerToEdit.contact_phone || '');
        setPaymentTermsDays(String(brokerToEdit.payment_terms_days ?? 30));
        setCreditStatus(brokerToEdit.credit_status || 'approved');
        setStatus((brokerToEdit.status as BrokerStatus) || 'active');
        setNotes(brokerToEdit.notes || '');
      } else {
        setCompanyName(initialValues?.company_name || '');
        setMcNumber(initialValues?.mc_number || '');
        setDotNumber(initialValues?.dot_number || '');
        setContactName(initialValues?.contact_name || '');
        setContactEmail(initialValues?.contact_email || '');
        setContactPhone(initialValues?.contact_phone || '');
        setPaymentTermsDays(initialValues?.payment_terms_days ? String(initialValues.payment_terms_days) : '30');
        setCreditStatus(initialValues?.credit_status || 'approved');
        setStatus((initialValues?.status as BrokerStatus) || 'active');
        setNotes(initialValues?.notes || '');
      }
    }
  }, [isOpen, brokerToEdit, initialValues]);

  const validate = (): boolean => {
    const errors: Record<string, string> = {};

    if (!companyName.trim()) {
      errors.companyName = 'Brokerage company name is required.';
    }

    if (contactEmail.trim() && !isValidEmail(contactEmail.trim())) {
      errors.contactEmail = 'Please provide a valid email address.';
    }

    const termsNum = Number(paymentTermsDays);
    if (isNaN(termsNum) || termsNum < 0 || termsNum > 120) {
      errors.paymentTermsDays = 'Payment terms must be between 0 and 120 days.';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);
    setFormError(null);

    try {
      const payload: CreateBrokerInput = {
        company_name: companyName.trim(),
        mc_number: mcNumber.trim() || null,
        dot_number: dotNumber.trim() || null,
        contact_name: contactName.trim() || null,
        contact_email: contactEmail.trim() || null,
        contact_phone: contactPhone.trim() || null,
        payment_terms_days: Math.round(Number(paymentTermsDays) || 30),
        credit_status: creditStatus,
        status,
        notes: notes.trim() || null,
      };

      await onSaveBroker(payload);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save broker record.';
      setFormError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedCreditOption = CREDIT_STATUS_OPTIONS.find((c) => c.value === creditStatus);

  return (
    <Modal
      id="broker-form-modal"
      isOpen={isOpen}
      onClose={onClose}
      title={isEdit ? `Edit Broker: ${brokerToEdit?.company_name}` : 'Add New Freight Broker / Shipper'}
      subtitle={
        isEdit
          ? 'Update contact details, credit rating, and payment terms for this brokerage'
          : 'Register a new freight broker or direct shipper into your CRM directory'
      }
      maxWidth="2xl"
      zIndex={zIndex}
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {formError && (
          <div className="flex items-start gap-3 p-3.5 rounded-lg bg-rose-950/60 border border-rose-800 text-rose-200 text-sm">
            <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div className="flex-1 font-medium">{formError}</div>
          </div>
        )}

        {/* Section 1: Broker Identity */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-800 text-xs font-semibold text-sky-400 uppercase tracking-wider">
            <Building2 className="w-4 h-4" />
            <span>Brokerage Identity & Authority</span>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Brokerage / Company Name <span className="text-rose-400">*</span>
            </label>
            <input
              id="broker-company-name-input"
              type="text"
              required
              placeholder="e.g. Apex Freight Logistics, Blue Ridge Transport"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className={`w-full px-3.5 py-2.5 rounded-lg bg-slate-950 border text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 transition-colors ${
                fieldErrors.companyName ? 'border-rose-500' : 'border-slate-800 hover:border-slate-700'
              }`}
            />
            {fieldErrors.companyName && (
              <p className="mt-1 text-xs text-rose-400">{fieldErrors.companyName}</p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5 flex items-center gap-1.5">
                <Hash className="w-3.5 h-3.5 text-slate-400" />
                Motor Carrier # (MC Number)
              </label>
              <input
                id="broker-mc-number-input"
                type="text"
                placeholder="e.g. 084729"
                value={mcNumber}
                onChange={(e) => setMcNumber(e.target.value)}
                className="w-full px-3.5 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 hover:border-slate-700 font-mono transition-colors"
              />
              <p className="mt-1 text-[11px] text-slate-500">FMCSA Docket Number (without MC prefix)</p>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5 flex items-center gap-1.5">
                <Hash className="w-3.5 h-3.5 text-slate-400" />
                USDOT Number
              </label>
              <input
                id="broker-dot-number-input"
                type="text"
                placeholder="e.g. 221458"
                value={dotNumber}
                onChange={(e) => setDotNumber(e.target.value)}
                className="w-full px-3.5 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 hover:border-slate-700 font-mono transition-colors"
              />
              <p className="mt-1 text-[11px] text-slate-500">U.S. Department of Transportation ID</p>
            </div>
          </div>
        </div>

        {/* Section 2: Contact Details */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-800 text-xs font-semibold text-sky-400 uppercase tracking-wider">
            <UserCheck className="w-4 h-4" />
            <span>Primary Dispatch & Carrier Rep</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Contact Person / Pod
              </label>
              <input
                id="broker-contact-name-input"
                type="text"
                placeholder="e.g. Jessica Vance (Midwest Pod)"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                className="w-full px-3.5 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 hover:border-slate-700 transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5 flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-slate-400" />
                Phone Number / Ext.
              </label>
              <input
                id="broker-contact-phone-input"
                type="tel"
                placeholder="e.g. (800) 323-7387"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                className="w-full px-3.5 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 hover:border-slate-700 transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5 flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-slate-400" />
                Dispatch / Load Email
              </label>
              <input
                id="broker-contact-email-input"
                type="email"
                placeholder="e.g. loads@broker.com"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                className={`w-full px-3.5 py-2 rounded-lg bg-slate-950 border text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 transition-colors ${
                  fieldErrors.contactEmail ? 'border-rose-500' : 'border-slate-800 hover:border-slate-700'
                }`}
              />
              {fieldErrors.contactEmail && (
                <p className="mt-1 text-xs text-rose-400">{fieldErrors.contactEmail}</p>
              )}
            </div>
          </div>
        </div>

        {/* Section 3: Credit Rating & Payment Terms */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-800 text-xs font-semibold text-sky-400 uppercase tracking-wider">
            <ShieldCheck className="w-4 h-4" />
            <span>Credit Assessment & Invoicing Terms</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Credit Status */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Credit Rating / Factoring Status
              </label>
              <select
                id="broker-credit-status-select"
                value={creditStatus}
                onChange={(e) => setCreditStatus(e.target.value as CreditStatus)}
                className="w-full px-3.5 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500 hover:border-slate-700 transition-colors"
              >
                {CREDIT_STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label} ({opt.riskLevel})
                  </option>
                ))}
              </select>

              {selectedCreditOption && (
                <div
                  className={`mt-2 p-2.5 rounded-lg border text-xs leading-relaxed ${
                    selectedCreditOption.value === 'approved'
                      ? 'bg-emerald-950/30 border-emerald-800/40 text-emerald-300'
                      : selectedCreditOption.value === 'caution'
                      ? 'bg-amber-950/30 border-amber-800/40 text-amber-300'
                      : selectedCreditOption.value === 'factoring_only'
                      ? 'bg-sky-950/30 border-sky-800/40 text-sky-300'
                      : 'bg-rose-950/30 border-rose-800/40 text-rose-300'
                  }`}
                >
                  <p className="font-semibold">{selectedCreditOption.label}:</p>
                  <p className="text-slate-300 mt-0.5">{selectedCreditOption.description}</p>
                </div>
              )}
            </div>

            {/* Payment Terms */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  Payment Terms (Net Days)
                </span>
                <span className="text-sky-400 font-semibold">{paymentTermsDays} Days</span>
              </label>
              <input
                id="broker-payment-terms-input"
                type="number"
                min="0"
                max="120"
                value={paymentTermsDays}
                onChange={(e) => setPaymentTermsDays(e.target.value)}
                className={`w-full px-3.5 py-2 rounded-lg bg-slate-950 border text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500 font-mono transition-colors ${
                  fieldErrors.paymentTermsDays ? 'border-rose-500' : 'border-slate-800 hover:border-slate-700'
                }`}
              />
              {fieldErrors.paymentTermsDays && (
                <p className="mt-1 text-xs text-rose-400">{fieldErrors.paymentTermsDays}</p>
              )}

              {/* Quick Presets */}
              <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                <span className="text-[11px] text-slate-400 mr-1">Presets:</span>
                {[
                  { label: 'QuickPay 1d', days: '1' },
                  { label: '15 Days', days: '15' },
                  { label: '21 Days', days: '21' },
                  { label: 'Net 30', days: '30' },
                  { label: '45 Days', days: '45' },
                ].map((preset) => (
                  <button
                    key={preset.days}
                    type="button"
                    onClick={() => setPaymentTermsDays(preset.days)}
                    className={`px-2 py-0.5 rounded text-[11px] font-medium border transition-colors ${
                      paymentTermsDays === preset.days
                        ? 'bg-sky-950 text-sky-300 border-sky-700'
                        : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200 hover:border-slate-700'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Operational Status */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Partnership Status
            </label>
            <div className="grid grid-cols-2 gap-3">
              {BROKER_STATUS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setStatus(opt.value)}
                  className={`px-3 py-2 rounded-lg border text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                    status === opt.value
                      ? opt.value === 'active'
                        ? 'bg-emerald-950/60 border-emerald-600 text-emerald-300 ring-1 ring-emerald-500/50'
                        : 'bg-slate-800 border-slate-600 text-slate-300 ring-1 ring-slate-500/50'
                      : 'bg-slate-950/80 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      opt.value === 'active' ? 'bg-emerald-400' : 'bg-slate-500'
                    }`}
                  />
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Section 4: Notes & Instructions */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-800 text-xs font-semibold text-sky-400 uppercase tracking-wider">
            <FileText className="w-4 h-4" />
            <span>Dispatch Notes & Carrier Instructions</span>
          </div>
          <div>
            <textarea
              id="broker-notes-input"
              rows={3}
              placeholder="e.g. Check-in call cadence, detention approval policy, factoring invoice submission instructions, load board preferences..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-800 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 hover:border-slate-700 transition-colors resize-y"
            />
          </div>
        </div>

        {/* Modal Actions */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
          <button
            id="cancel-broker-btn"
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            id="save-broker-submit-btn"
            type="submit"
            disabled={isSubmitting}
            className="px-5 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-sm font-semibold shadow-md shadow-sky-900/30 flex items-center gap-2 transition-colors cursor-pointer"
          >
            {isSubmitting ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Saving...</span>
              </>
            ) : (
              <span>{isEdit ? 'Update Broker' : 'Create Broker'}</span>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
};
