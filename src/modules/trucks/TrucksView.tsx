import React, { useState, useEffect, useCallback } from 'react';
import { Truck, TruckStatus, Client } from '../../types/domain.types.ts';
import { TruckList } from './TruckList.tsx';
import { TruckModal } from './TruckModal.tsx';
import { TruckDetailModal, TruckWithClient } from './TruckDetailModal.tsx';
import { Modal } from '../../components/common/Modal.tsx';
import { useAuth } from '../../contexts/AuthContext.tsx';
import { truckService } from './truckService.ts';
import {
  Truck as TruckIcon,
  Plus,
  AlertTriangle,
  CheckCircle2,
  Trash2,
  Building2,
} from 'lucide-react';
import { NavModule } from '../../components/layout/Sidebar.tsx';

interface TrucksViewProps {
  onNavigate?: (module: NavModule) => void;
}

export const TrucksView: React.FC<TrucksViewProps> = ({ onNavigate }) => {
  const { activeOrganization, userRole } = useAuth();
  const orgId = activeOrganization?.id || 'demo-organization-default';

  const [trucks, setTrucks] = useState<TruckWithClient[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modals state
  const [isAddEditModalOpen, setIsAddEditModalOpen] = useState(false);
  const [truckToEdit, setTruckToEdit] = useState<Truck | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedTruck, setSelectedTruck] = useState<TruckWithClient | null>(null);
  const [truckToDelete, setTruckToDelete] = useState<TruckWithClient | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Status updating state
  const [togglingTruckId, setTogglingTruckId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const canEdit = userRole === 'owner_admin' || userRole === 'dispatcher';
  const canDelete = userRole === 'owner_admin';

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  const fetchTrucksAndClients = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [loadedTrucks, loadedClients] = await Promise.all([
        truckService.getTrucks(orgId),
        truckService.getClients(orgId),
      ]);

      setTrucks(loadedTrucks);
      setClients(loadedClients);
    } catch (err: unknown) {
      console.error('Error fetching trucks:', err);
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === 'object' && err !== null && 'message' in err
          ? String((err as { message: unknown }).message)
          : 'Failed to load trucks roster.';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    fetchTrucksAndClients();
  }, [fetchTrucksAndClients]);

  // Handlers
  const handleOpenAddModal = () => {
    if (clients.length === 0 && onNavigate) {
      onNavigate('clients');
      return;
    }
    setTruckToEdit(null);
    setIsAddEditModalOpen(true);
  };

  const handleOpenEditModal = (truck: TruckWithClient) => {
    setTruckToEdit(truck);
    setIsAddEditModalOpen(true);
  };

  const handleViewDetails = (truck: TruckWithClient) => {
    setSelectedTruck(truck);
    setIsDetailModalOpen(true);
  };

  const handleSaveSuccess = (savedTruck: Truck, isEdit: boolean) => {
    fetchTrucksAndClients();
    showToast(
      isEdit
        ? `Truck #${savedTruck.truck_number} updated successfully.`
        : `Truck #${savedTruck.truck_number} registered successfully.`
    );
    if (selectedTruck && selectedTruck.id === savedTruck.id) {
      setSelectedTruck({
        ...selectedTruck,
        ...savedTruck,
      });
    }
  };

  const handleChangeStatus = async (truck: TruckWithClient, newStatus: TruckStatus) => {
    if (!canEdit) return;

    setTogglingTruckId(truck.id);
    try {
      await truckService.updateTruckStatus(orgId, truck.id, newStatus);

      // Optimistic update
      setTrucks((prev) =>
        prev.map((t) => (t.id === truck.id ? { ...t, status: newStatus } : t))
      );

      if (selectedTruck && selectedTruck.id === truck.id) {
        setSelectedTruck({ ...selectedTruck, status: newStatus });
      }

      showToast(`Truck #${truck.truck_number} status changed to ${newStatus}.`);
    } catch (err: unknown) {
      console.error('Error updating truck status:', err);
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === 'object' && err !== null && 'message' in err
          ? String((err as { message: unknown }).message)
          : 'Failed to update truck status.';
      showToast(msg, 'error');
    } finally {
      setTogglingTruckId(null);
    }
  };

  const handleConfirmDelete = (truck: TruckWithClient) => {
    setTruckToDelete(truck);
    setIsDeleteModalOpen(true);
  };

  const executeDelete = async () => {
    if (!truckToDelete || !canDelete) return;

    setIsDeleting(true);
    try {
      await truckService.deleteTruck(orgId, truckToDelete.id);

      setTrucks((prev) => prev.filter((t) => t.id !== truckToDelete.id));
      if (selectedTruck?.id === truckToDelete.id) {
        setIsDetailModalOpen(false);
        setSelectedTruck(null);
      }
      setIsDeleteModalOpen(false);
      showToast(`Truck #${truckToDelete.truck_number} removed from roster.`);
      setTruckToDelete(null);
    } catch (err: unknown) {
      console.error('Error deleting truck:', err);
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === 'object' && err !== null && 'message' in err
          ? String((err as { message: unknown }).message)
          : 'Failed to delete truck unit.';
      showToast(msg, 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div id="trucks-module" className="space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          id="trucks-toast"
          className={`fixed bottom-5 right-5 z-50 p-4 rounded-xl border shadow-lg flex items-center gap-3 transition-all animate-in slide-in-from-bottom-2 ${
            toastMessage.type === 'success'
              ? 'bg-emerald-950/90 border-emerald-800 text-emerald-200'
              : 'bg-rose-950/90 border-rose-800 text-rose-200'
          }`}
        >
          {toastMessage.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
          )}
          <span className="text-xs font-medium">{toastMessage.text}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-100 tracking-tight">
              Truck & Equipment Roster
            </h1>
            <span className="text-xs px-2.5 py-0.5 rounded-md bg-indigo-950/60 text-indigo-300 border border-indigo-800/40 font-semibold">
              Power Units & Trailers
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Manage power units, trailer equipment types, carrier client ownership, staging locations, and dispatch availability.
          </p>
        </div>

        {canEdit && (
          <button
            id="add-truck-header-btn"
            onClick={handleOpenAddModal}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-sm transition-colors cursor-pointer self-start sm:self-auto"
          >
            {clients.length === 0 ? (
              <>
                <Building2 className="w-4 h-4" />
                <span>Add Client</span>
              </>
            ) : (
              <>
                <Plus className="w-4 h-4" />
                <span>Add Truck Unit</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* Main Truck List & Filter view */}
      <TruckList
        trucks={trucks}
        clients={clients}
        isLoading={isLoading}
        error={error}
        onRefresh={fetchTrucksAndClients}
        onViewDetails={handleViewDetails}
        onEditTruck={handleOpenEditModal}
        onChangeStatus={handleChangeStatus}
        onDeleteTruck={canDelete ? handleConfirmDelete : undefined}
        onAddTruck={handleOpenAddModal}
        canEdit={canEdit}
        canDelete={canDelete}
        togglingTruckId={togglingTruckId}
        onNavigateToClients={() => onNavigate?.('clients')}
      />

      {/* Add / Edit Truck Modal */}
      {activeOrganization && (
        <TruckModal
          isOpen={isAddEditModalOpen}
          onClose={() => setIsAddEditModalOpen(false)}
          onSuccess={handleSaveSuccess}
          truckToEdit={truckToEdit}
          organizationId={activeOrganization.id}
          clients={clients}
        />
      )}

      {/* Truck Detail Modal */}
      <TruckDetailModal
        truck={selectedTruck}
        isOpen={isDetailModalOpen}
        onClose={() => {
          setIsDetailModalOpen(false);
          setSelectedTruck(null);
        }}
        onEdit={(truck) => {
          setIsDetailModalOpen(false);
          handleOpenEditModal(truck);
        }}
        onChangeStatus={handleChangeStatus}
        onDelete={canDelete ? handleConfirmDelete : undefined}
        canEdit={canEdit}
        canDelete={canDelete}
        isUpdatingStatus={Boolean(togglingTruckId)}
      />

      {/* Delete Confirmation Modal */}
      <Modal
        id="truck-delete-confirmation-modal"
        isOpen={isDeleteModalOpen}
        onClose={() => !isDeleting && setIsDeleteModalOpen(false)}
        title="Delete Truck Unit"
        subtitle="Permanent unit removal from fleet roster"
        maxWidth="md"
      >
        <div className="space-y-4 text-xs text-slate-300">
          <div className="p-3 bg-rose-950/40 border border-rose-800/60 rounded-lg flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-rose-200">
                Are you sure you want to delete Truck #{truckToDelete?.truck_number}?
              </p>
              <p className="text-[11px] text-rose-300/80 mt-1">
                This action cannot be undone. Any historical load or document references will retain foreign key integrity based on database rules.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={() => setIsDeleteModalOpen(false)}
              disabled={isDeleting}
              className="px-4 py-2 text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              id="confirm-delete-truck-btn"
              type="button"
              onClick={executeDelete}
              disabled={isDeleting}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 rounded-lg transition-colors cursor-pointer disabled:opacity-50 shadow-sm"
            >
              {isDeleting ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                  <span>Deleting...</span>
                </>
              ) : (
                <>
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Truck Unit</span>
                </>
              )}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
