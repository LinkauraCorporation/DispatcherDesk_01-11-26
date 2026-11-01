import React, { useState } from 'react';
import { Modal } from '../../components/common/Modal.tsx';
import { useAuth } from '../../contexts/AuthContext.tsx';
import { Building, Globe2, AlertCircle } from 'lucide-react';
import { SUPPORTED_TIMEZONES } from '../../lib/timezones.ts';

interface OnboardingOrgModalProps {
  isOpen: boolean;
  onClose: () => void;
  isFirstOrg?: boolean;
  onSuccess?: (newOrgId: string, isFirstOrg: boolean) => void;
}

export const OnboardingOrgModal: React.FC<OnboardingOrgModalProps> = ({
  isOpen,
  onClose,
  isFirstOrg = false,
  onSuccess,
}) => {
  const { createOrganization, isConfigured } = useAuth();
  const [orgName, setOrgName] = useState('');
  const [primaryTimezone, setPrimaryTimezone] = useState('America/Chicago');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgName.trim()) return;

    setIsLoading(true);
    setErrorMessage(null);
    try {
      const orgId = await createOrganization(orgName.trim(), undefined, primaryTimezone);
      if (orgId) {
        if (onSuccess) {
          onSuccess(orgId, isFirstOrg);
        }
        onClose();
      } else {
        setErrorMessage('Failed to create organization. Please ensure database migration has run.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error creating organization';
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal
      id="onboarding-org-modal"
      isOpen={isOpen}
      onClose={onClose}
      title={isFirstOrg ? 'Create Your Dispatch Organization' : 'Create New Dispatch Company'}
      subtitle={
        isFirstOrg
          ? 'Establish your fleet operations workspace to begin guided setup'
          : 'Establish an isolated multi-tenant fleet organization'
      }
      maxWidth="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        {errorMessage && (
          <div className="p-3 bg-rose-950/40 border border-rose-800/50 rounded-lg text-rose-300 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        <div>
          <label className="block text-slate-300 font-medium mb-1">Company / Dispatch Firm Name *</label>
          <input
            type="text"
            required
            placeholder="e.g. Skyline Logistics Group / Apex Freight Dispatch"
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div>
          <label className="block text-slate-300 font-medium mb-1">Primary Operational Timezone *</label>
          <select
            value={primaryTimezone}
            onChange={(e) => setPrimaryTimezone(e.target.value)}
            className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:border-indigo-500"
          >
            {SUPPORTED_TIMEZONES.map((tz) => (
              <option key={tz.id} value={tz.id}>
                {tz.label} ({tz.code})
              </option>
            ))}
          </select>
          <p className="text-[11px] text-slate-400 mt-1">
            Used as the baseline clock for shipper/receiver appointment windows.
          </p>
        </div>

        <div className="pt-3 border-t border-slate-800 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-lg cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isLoading}
            className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg cursor-pointer disabled:opacity-50"
          >
            {isLoading ? 'Creating Tenant...' : 'Create Organization'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
