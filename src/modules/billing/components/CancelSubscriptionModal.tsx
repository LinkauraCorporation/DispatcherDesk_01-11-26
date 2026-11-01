import React, { useState } from 'react';
import { AlertTriangle, X, ShieldAlert, Check } from 'lucide-react';

interface CancelSubscriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmCancel: () => Promise<void>;
  currentPlanName: string;
  amtUsage: number;
}

export const CancelSubscriptionModal: React.FC<CancelSubscriptionModalProps> = ({
  isOpen,
  onClose,
  onConfirmCancel,
  currentPlanName,
  amtUsage,
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    try {
      setIsSubmitting(true);
      setErrorMessage(null);
      await onConfirmCancel();
      onClose();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to process cancellation. Please contact support.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      id="modal-cancel-subscription"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in"
    >
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative overflow-hidden">
        {/* Close Button */}
        <button
          id="btn-close-cancel-modal"
          onClick={onClose}
          disabled={isSubmitting}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Icon & Header */}
        <div className="flex items-start gap-4 mb-5">
          <div className="p-3 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20 shrink-0">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">Cancel {currentPlanName} Subscription?</h3>
            <p className="text-xs text-slate-400 mt-1">
              Please review the operational impact on your dispatch operations before continuing.
            </p>
          </div>
        </div>

        {/* Consequences Box */}
        <div className="bg-slate-950/60 rounded-xl p-4 border border-slate-800 mb-5 space-y-3 text-xs text-slate-300">
          <div className="font-semibold text-slate-200 uppercase tracking-wider text-[11px]">
            Operational Impact of Cancellation:
          </div>
          <div className="flex items-start gap-2.5">
            <div className="p-0.5 rounded-full bg-rose-500/20 text-rose-400 shrink-0 mt-0.5">
              <AlertTriangle className="w-3.5 h-3.5" />
            </div>
            <span>
              Your plan will transition to <strong>Canceled</strong> status immediately with your payment provider.
            </span>
          </div>
          <div className="flex items-start gap-2.5">
            <div className="p-0.5 rounded-full bg-rose-500/20 text-rose-400 shrink-0 mt-0.5">
              <AlertTriangle className="w-3.5 h-3.5" />
            </div>
            <span>
              You currently have <strong>{amtUsage} Active Managed Truck{amtUsage === 1 ? '' : 's'}</strong>. Once canceled, new truck activations will be blocked until re-subscription.
            </span>
          </div>
          <div className="flex items-start gap-2.5">
            <div className="p-0.5 rounded-full bg-indigo-500/20 text-indigo-400 shrink-0 mt-0.5">
              <Check className="w-3.5 h-3.5" />
            </div>
            <span>
              Historical freight records, invoices, check calls, and document vaults will remain safely archived and readable.
            </span>
          </div>
        </div>

        {errorMessage && (
          <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
            {errorMessage}
          </div>
        )}

        {/* Modal Actions */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
          <button
            id="btn-keep-subscription"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 transition-colors"
          >
            Keep My Subscription
          </button>
          <button
            id="btn-confirm-cancellation"
            onClick={handleConfirm}
            disabled={isSubmitting}
            className="px-4 py-2.5 rounded-xl text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 transition-colors shadow-lg shadow-rose-600/20 disabled:opacity-50"
          >
            {isSubmitting ? 'Canceling...' : 'Confirm Cancellation'}
          </button>
        </div>
      </div>
    </div>
  );
};
