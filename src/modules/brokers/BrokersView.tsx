import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext.tsx';
import { BrokerWithPerformance, CreateBrokerInput, UpdateBrokerInput } from './brokerTypes.ts';
import { brokerService } from './brokerService.ts';
import { BrokerList } from './BrokerList.tsx';
import { BrokerModal } from './BrokerModal.tsx';
import { BrokerDetailModal } from './BrokerDetailModal.tsx';
import { Modal } from '../../components/common/Modal.tsx';
import {
  Building2,
  ShieldCheck,
  CreditCard,
  Layers,
  AlertTriangle,
  CheckCircle2,
  Plus,
  Users,
} from 'lucide-react';

export const BrokersView: React.FC = () => {
  const { activeOrganization, userRole } = useAuth();

  // Primary state
  const [brokers, setBrokers] = useState<BrokerWithPerformance[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingBrokerId, setUpdatingBrokerId] = useState<string | null>(null);

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [brokerToEdit, setBrokerToEdit] = useState<BrokerWithPerformance | null>(null);
  const [selectedBrokerForDetail, setSelectedBrokerForDetail] = useState<BrokerWithPerformance | null>(null);
  const [brokerToDelete, setBrokerToDelete] = useState<BrokerWithPerformance | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Toast feedback state
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // RBAC
  const canEdit = userRole === 'owner_admin' || userRole === 'dispatcher';
  const canDelete = userRole === 'owner_admin';

  // Fetch Brokers
  const fetchBrokers = useCallback(async () => {
    if (!activeOrganization) {
      setBrokers([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const data = await brokerService.listBrokers(activeOrganization.id);
      setBrokers(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load broker directory.';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [activeOrganization]);

  useEffect(() => {
    fetchBrokers();
  }, [fetchBrokers]);

  // Handle Save (Create or Edit)
  const handleSaveBroker = async (input: CreateBrokerInput | UpdateBrokerInput) => {
    if (!activeOrganization) return;

    if (brokerToEdit) {
      const updated = await brokerService.updateBroker(activeOrganization.id, brokerToEdit.id, input);
      setBrokers((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
      if (selectedBrokerForDetail?.id === updated.id) {
        setSelectedBrokerForDetail(updated);
      }
      showToast(`Broker "${updated.company_name}" updated successfully.`);
    } else {
      const created = await brokerService.createBroker(activeOrganization.id, input as CreateBrokerInput);
      setBrokers((prev) => [created, ...prev]);
      showToast(`Broker "${created.company_name}" registered successfully.`);
    }
  };

  // Handle Toggle Active/Inactive
  const handleToggleStatus = async (broker: BrokerWithPerformance) => {
    if (!activeOrganization) return;
    setUpdatingBrokerId(broker.id);
    try {
      const updated = await brokerService.toggleBrokerStatus(activeOrganization.id, broker.id);
      setBrokers((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
      if (selectedBrokerForDetail?.id === updated.id) {
        setSelectedBrokerForDetail(updated);
      }
      showToast(`Broker status changed to ${updated.status}.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to toggle status.';
      showToast(msg, 'error');
    } finally {
      setUpdatingBrokerId(null);
    }
  };

  // Handle Delete Confirmation
  const handleConfirmDelete = async () => {
    if (!activeOrganization || !brokerToDelete) return;
    setIsDeleting(true);
    try {
      await brokerService.deleteBroker(activeOrganization.id, brokerToDelete.id);
      setBrokers((prev) => prev.filter((b) => b.id !== brokerToDelete.id));
      if (selectedBrokerForDetail?.id === brokerToDelete.id) {
        setSelectedBrokerForDetail(null);
      }
      showToast(`Broker "${brokerToDelete.company_name}" deleted.`);
      setBrokerToDelete(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete broker.';
      showToast(msg, 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  // Metrics computation
  const totalBrokersCount = brokers.length;
  const approvedCount = brokers.filter((b) => b.credit_status === 'approved').length;
  const factoringOnlyCount = brokers.filter((b) => b.credit_status === 'factoring_only').length;
  const activePartnersCount = brokers.filter((b) => (b.status || 'active') === 'active').length;

  return (
    <div id="brokers-view" className="space-y-6">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl border shadow-2xl text-xs font-medium animate-in slide-in-from-top duration-200 ${
            toast.type === 'success'
              ? 'bg-emerald-950 border-emerald-700 text-emerald-100'
              : 'bg-rose-950 border-rose-700 text-rose-100'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          )}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-100 tracking-tight">
              Brokers & Shippers
            </h1>
            <span className="text-xs px-2.5 py-0.5 rounded-md bg-sky-950/60 text-sky-300 border border-sky-800/40 font-semibold">
              Credit & Factoring CRM
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Manage freight brokers, verify creditworthiness, payment terms, and monitor historical load yield.
          </p>
        </div>

        {canEdit && (
          <button
            id="header-add-broker-btn"
            onClick={() => {
              setBrokerToEdit(null);
              setIsAddModalOpen(true);
            }}
            className="px-4 py-2.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs sm:text-sm font-semibold shadow-lg shadow-sky-900/30 flex items-center gap-2 transition-colors cursor-pointer self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>New Broker / Shipper</span>
          </button>
        )}
      </div>

      {/* 4 Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-1.5 shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Total Directory</span>
            <Building2 className="w-4 h-4 text-sky-400" />
          </div>
          <div className="text-2xl font-bold text-slate-100 font-mono">
            {totalBrokersCount}
          </div>
          <div className="text-[11px] text-slate-500">Registered brokerage partners</div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-1.5 shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Approved Credit</span>
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-emerald-400 font-mono">
            {approvedCount}
          </div>
          <div className="text-[11px] text-slate-500">Direct or factoring approved</div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-1.5 shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Factoring Only</span>
            <CreditCard className="w-4 h-4 text-sky-400" />
          </div>
          <div className="text-2xl font-bold text-sky-400 font-mono">
            {factoringOnlyCount}
          </div>
          <div className="text-[11px] text-slate-500">Factoring assignment required</div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-1.5 shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Active Dispatches</span>
            <Users className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl font-bold text-purple-400 font-mono">
            {activePartnersCount}
          </div>
          <div className="text-[11px] text-slate-500">Active status brokerages</div>
        </div>
      </div>

      {/* Main Broker List View */}
      <BrokerList
        brokers={brokers}
        isLoading={isLoading}
        error={error}
        onRefresh={fetchBrokers}
        onViewDetails={(broker) => setSelectedBrokerForDetail(broker)}
        onEditBroker={(broker) => {
          setBrokerToEdit(broker);
          setIsAddModalOpen(true);
        }}
        onToggleStatus={handleToggleStatus}
        onDeleteBroker={canDelete ? (broker) => setBrokerToDelete(broker) : undefined}
        onAddBroker={() => {
          setBrokerToEdit(null);
          setIsAddModalOpen(true);
        }}
        canEdit={canEdit}
        canDelete={canDelete}
        updatingBrokerId={updatingBrokerId}
      />

      {/* Add / Edit Modal */}
      <BrokerModal
        isOpen={isAddModalOpen}
        onClose={() => {
          setIsAddModalOpen(false);
          setBrokerToEdit(null);
        }}
        brokerToEdit={brokerToEdit}
        onSaveBroker={handleSaveBroker}
      />

      {/* Detail Modal */}
      <BrokerDetailModal
        isOpen={Boolean(selectedBrokerForDetail)}
        onClose={() => setSelectedBrokerForDetail(null)}
        broker={selectedBrokerForDetail}
        organizationId={activeOrganization?.id || ''}
        onEdit={(broker) => {
          setSelectedBrokerForDetail(null);
          setBrokerToEdit(broker);
          setIsAddModalOpen(true);
        }}
        canEdit={canEdit}
      />

      {/* Delete Confirmation Modal */}
      {brokerToDelete && (
        <Modal
          id="delete-broker-modal"
          isOpen={Boolean(brokerToDelete)}
          onClose={() => setBrokerToDelete(null)}
          title="Confirm Broker Deletion"
          subtitle={`Are you sure you want to remove ${brokerToDelete.company_name}?`}
          maxWidth="md"
        >
          <div className="p-6 space-y-4">
            <div className="flex items-start gap-3 p-3.5 rounded-lg bg-rose-950/50 border border-rose-800 text-xs text-rose-200 leading-relaxed">
              <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <strong>Warning:</strong> Deleting <strong>{brokerToDelete.company_name}</strong> will remove its credit records from your directory. Existing historical loads will preserve their recorded data.
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setBrokerToDelete(null)}
                disabled={isDeleting}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-semibold shadow-md shadow-rose-900/30 flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                {isDeleting ? 'Deleting...' : 'Delete Broker Record'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
