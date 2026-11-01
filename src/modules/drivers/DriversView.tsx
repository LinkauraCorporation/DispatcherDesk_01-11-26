import React, { useState, useEffect, useCallback } from 'react';
import { DriverStatus, Client, Truck } from '../../types/domain.types.ts';
import { DriverWithRelations } from './driverTypes.ts';
import { driverService } from './driverService.ts';
import { DriverList } from './DriverList.tsx';
import { DriverModal } from './DriverModal.tsx';
import { DriverDetailModal } from './DriverDetailModal.tsx';
import { Modal } from '../../components/common/Modal.tsx';
import { useAuth } from '../../contexts/AuthContext.tsx';
import {
  UserCheck,
  Plus,
  Building2,
  Truck as TruckIcon,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Trash2,
  Users,
} from 'lucide-react';
import { NavModule } from '../../components/layout/Sidebar.tsx';

interface DriversViewProps {
  onNavigate?: (module: NavModule) => void;
}

export const DriversView: React.FC<DriversViewProps> = ({ onNavigate }) => {
  const { activeOrganization, userRole } = useAuth();

  // Effective org ID (support fallback demo-org-1 if no active org yet)
  const orgId = activeOrganization?.id || 'demo-organization-default';

  // Data states
  const [drivers, setDrivers] = useState<DriverWithRelations[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Modals state
  const [isAddEditModalOpen, setIsAddEditModalOpen] = useState(false);
  const [driverToEdit, setDriverToEdit] = useState<DriverWithRelations | null>(null);

  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedDriverForDetail, setSelectedDriverForDetail] = useState<DriverWithRelations | null>(null);

  // Status updating state
  const [updatingDriverId, setUpdatingDriverId] = useState<string | null>(null);

  // Delete confirmation modal state
  const [driverToDelete, setDriverToDelete] = useState<DriverWithRelations | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Role capabilities based on application model:
  // owner_admin: full driver management + delete
  // dispatcher: create, edit, change status
  // staff: read-only
  const canEdit = userRole === 'owner_admin' || userRole === 'dispatcher' || userRole === null;
  const canDelete = userRole === 'owner_admin' || userRole === null;

  // Auto-dismiss feedback messages after 4 seconds
  useEffect(() => {
    if (feedbackMessage) {
      const timer = setTimeout(() => {
        setFeedbackMessage(null);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [feedbackMessage]);

  // Load all required data via driverService
  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [driversData, clientsData, trucksData] = await Promise.all([
        driverService.getDrivers(orgId),
        driverService.getClients(orgId),
        driverService.getTrucks(orgId),
      ]);

      setDrivers(driversData);
      setClients(clientsData);
      setTrucks(trucksData);

      // If detail modal is open, refresh the selected driver object
      if (selectedDriverForDetail) {
        const refreshed = driversData.find((d) => d.id === selectedDriverForDetail.id);
        if (refreshed) {
          setSelectedDriverForDetail(refreshed);
        }
      }
    } catch (err: unknown) {
      console.error('Error fetching driver roster data:', err);
      const msg = err instanceof Error ? err.message : 'Failed to load drivers roster.';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [orgId, selectedDriverForDetail]);

  useEffect(() => {
    fetchData();
  }, [orgId]);

  // Save / Update Driver Handler
  const handleSaveDriver = async (payload: {
    client_id: string | null;
    assigned_truck_id: string | null;
    full_name: string;
    phone: string | null;
    email: string | null;
    pay_type: any;
    pay_rate: number;
    status: DriverStatus;
    notes: string | null;
  }) => {
    if (driverToEdit) {
      // Update
      const updated = await driverService.updateDriver(orgId, driverToEdit.id, payload);
      setDrivers((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
      if (selectedDriverForDetail?.id === updated.id) {
        setSelectedDriverForDetail(updated);
      }
      setIsAddEditModalOpen(false);
      setDriverToEdit(null);
      setFeedbackMessage({
        type: 'success',
        text: `Driver profile for "${updated.full_name}" was successfully updated.`,
      });
    } else {
      // Create
      const created = await driverService.createDriver(orgId, payload);
      setDrivers((prev) => [created, ...prev]);
      setIsAddEditModalOpen(false);
      setFeedbackMessage({
        type: 'success',
        text: `Driver "${created.full_name}" registered successfully.`,
      });
    }
    // Refresh to sync any truck reassignment changes
    await fetchData();
  };

  // Quick Status Change Handler
  const handleStatusChange = async (driver: DriverWithRelations, newStatus: DriverStatus) => {
    if (driver.status === newStatus) return;
    setUpdatingDriverId(driver.id);

    try {
      const updated = await driverService.updateDriverStatus(orgId, driver.id, newStatus);
      setDrivers((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));

      if (selectedDriverForDetail?.id === updated.id) {
        setSelectedDriverForDetail(updated);
      }

      setFeedbackMessage({
        type: 'success',
        text: `Status for ${driver.full_name} updated to "${newStatus.replace(/_/g, ' ')}".`,
      });
    } catch (err: unknown) {
      console.error('Error changing driver status:', err);
      const msg = err instanceof Error ? err.message : 'Failed to update driver status.';
      setFeedbackMessage({
        type: 'error',
        text: msg,
      });
    } finally {
      setUpdatingDriverId(null);
    }
  };

  // Delete Driver Execution
  const handleConfirmDelete = async () => {
    if (!driverToDelete) return;
    setIsDeleting(true);

    try {
      await driverService.deleteDriver(orgId, driverToDelete.id);
      setDrivers((prev) => prev.filter((d) => d.id !== driverToDelete.id));

      if (selectedDriverForDetail?.id === driverToDelete.id) {
        setIsDetailModalOpen(false);
        setSelectedDriverForDetail(null);
      }

      setFeedbackMessage({
        type: 'success',
        text: `Driver profile "${driverToDelete.full_name}" was deleted.`,
      });
      setDriverToDelete(null);
    } catch (err: unknown) {
      console.error('Error deleting driver:', err);
      const msg = err instanceof Error ? err.message : 'Failed to delete driver.';
      setFeedbackMessage({
        type: 'error',
        text: msg,
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div id="drivers-view" className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-100 tracking-tight">
              Driver Profiles & Contracts
            </h1>
            <span className="text-xs px-2.5 py-0.5 rounded-md bg-indigo-950/60 text-indigo-300 border border-indigo-800/40 font-semibold">
              Fleet Drivers & Owner-Operators
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Manage driver contact details, carrier affiliations, power unit assignments, and pay structure contracts (% gross, per mile, flat).
          </p>
        </div>

        {/* Global Action Button */}
        {canEdit && (
          <button
            id="header-add-driver-btn"
            onClick={() => {
              if (clients.length === 0 && onNavigate) {
                onNavigate('clients');
                return;
              }
              setDriverToEdit(null);
              setIsAddEditModalOpen(true);
            }}
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
                <span>Add Driver</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* Toast Feedback Notification */}
      {feedbackMessage && (
        <div
          id="driver-feedback-toast"
          className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 text-xs animate-in fade-in slide-in-from-top-2 duration-200 ${
            feedbackMessage.type === 'success'
              ? 'bg-emerald-950/60 border-emerald-800/70 text-emerald-200'
              : 'bg-rose-950/60 border-rose-800/70 text-rose-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedbackMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span className="font-medium">{feedbackMessage.text}</span>
          </div>
          <button
            onClick={() => setFeedbackMessage(null)}
            className="text-slate-400 hover:text-slate-200 text-xs px-1.5 py-0.5 rounded hover:bg-slate-800/50"
          >
            ✕
          </button>
        </div>
      )}

      {/* Main Driver List Component */}
      <DriverList
        drivers={drivers}
        clients={clients}
        trucks={trucks}
        isLoading={isLoading}
        error={error}
        onRefresh={fetchData}
        onViewDetails={(driver) => {
          setSelectedDriverForDetail(driver);
          setIsDetailModalOpen(true);
        }}
        onEditDriver={(driver) => {
          setDriverToEdit(driver);
          setIsAddEditModalOpen(true);
        }}
        onStatusChange={handleStatusChange}
        onDeleteDriver={(driver) => {
          setDriverToDelete(driver);
        }}
        onAddDriver={() => {
          if (clients.length === 0 && onNavigate) {
            onNavigate('clients');
            return;
          }
          setDriverToEdit(null);
          setIsAddEditModalOpen(true);
        }}
        canEdit={canEdit}
        canDelete={canDelete}
        updatingDriverId={updatingDriverId}
        onNavigateToClients={() => onNavigate?.('clients')}
      />

      {/* Add / Edit Driver Modal */}
      <DriverModal
        isOpen={isAddEditModalOpen}
        onClose={() => {
          setIsAddEditModalOpen(false);
          setDriverToEdit(null);
        }}
        onSuccess={() => {
          setIsAddEditModalOpen(false);
          setDriverToEdit(null);
        }}
        driverToEdit={driverToEdit}
        clients={clients}
        trucks={trucks}
        allDrivers={drivers}
        onSaveDriver={handleSaveDriver}
      />

      {/* Driver Details Modal */}
      <DriverDetailModal
        driver={selectedDriverForDetail}
        isOpen={isDetailModalOpen}
        onClose={() => {
          setIsDetailModalOpen(false);
          setSelectedDriverForDetail(null);
        }}
        onEdit={(driver) => {
          setIsDetailModalOpen(false);
          setDriverToEdit(driver);
          setIsAddEditModalOpen(true);
        }}
        onChangeStatus={handleStatusChange}
        onDelete={(driver) => {
          setDriverToDelete(driver);
        }}
        canEdit={canEdit}
        canDelete={canDelete}
        isUpdatingStatus={updatingDriverId === selectedDriverForDetail?.id}
      />

      {/* Delete Driver Confirmation Modal */}
      {driverToDelete && (
        <Modal
          id="delete-driver-modal"
          isOpen={Boolean(driverToDelete)}
          onClose={() => {
            if (!isDeleting) setDriverToDelete(null);
          }}
          title="Confirm Driver Profile Deletion"
          subtitle="This action removes the driver profile from your active dispatch roster."
          maxWidth="md"
        >
          <div className="space-y-4 text-xs text-slate-300">
            <div className="p-3.5 bg-rose-950/30 border border-rose-800/60 rounded-xl flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-rose-200">
                  Are you sure you want to delete {driverToDelete.full_name}?
                </p>
                <p className="text-slate-400 mt-1 leading-relaxed">
                  Deleting this driver profile will disassociate any currently assigned power unit.
                </p>
              </div>
            </div>

            <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg space-y-1 text-[11px]">
              <div>
                <span className="text-slate-500">Driver Name:</span>{' '}
                <span className="font-semibold text-slate-200">{driverToDelete.full_name}</span>
              </div>
              <div>
                <span className="text-slate-500">Carrier:</span>{' '}
                <span className="text-slate-300">
                  {driverToDelete.client ? driverToDelete.client.company_name : 'Unassigned'}
                </span>
              </div>
              <div>
                <span className="text-slate-500">Assigned Truck:</span>{' '}
                <span className="text-slate-300">
                  {driverToDelete.assigned_truck
                    ? `Unit #${driverToDelete.assigned_truck.truck_number}`
                    : 'None (Standby)'}
                </span>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setDriverToDelete(null)}
                disabled={isDeleting}
                className="px-3.5 py-2 text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                id="confirm-delete-driver-btn"
                type="button"
                onClick={handleConfirmDelete}
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
                    <Trash2 className="w-4 h-4" />
                    <span>Delete Driver</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
