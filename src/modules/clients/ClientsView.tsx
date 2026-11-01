import React, { useState, useEffect, useCallback } from 'react';
import { Client } from '../../types/domain.types.ts';
import { useAuth } from '../../contexts/AuthContext.tsx';
import { clientService } from './clientService.ts';
import { ClientList } from './ClientList.tsx';
import { ClientModal } from './ClientModal.tsx';
import { ClientDetailModal } from './ClientDetailModal.tsx';
import { Modal } from '../../components/common/Modal.tsx';
import { Plus, Users, AlertTriangle, CheckCircle2, Building2, Truck, DollarSign, Activity } from 'lucide-react';

export const ClientsView: React.FC = () => {
  const { activeOrganization, userRole } = useAuth();
  const orgId = activeOrganization?.id || 'demo-organization-default';

  const [clients, setClients] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Modals state
  const [isAddEditModalOpen, setIsAddEditModalOpen] = useState(false);
  const [clientToEdit, setClientToEdit] = useState<Client | null>(null);

  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedClientForDetail, setSelectedClientForDetail] = useState<Client | null>(null);

  // Status toggle state
  const [togglingClientId, setTogglingClientId] = useState<string | null>(null);

  // Delete confirmation modal state
  const [clientToDelete, setClientToDelete] = useState<Client | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const canEdit = userRole === 'owner_admin' || userRole === 'dispatcher';
  const canDelete = userRole === 'owner_admin';

  // Load clients strictly scoped to orgId
  const fetchClients = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const data = await clientService.getClients(orgId);
      setClients(data);
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Failed to load carrier clients.';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  // Clear feedback messages after 4 seconds
  useEffect(() => {
    if (feedbackMessage) {
      const timer = setTimeout(() => setFeedbackMessage(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [feedbackMessage]);

  // Handler: Add Client Click
  const handleOpenAddModal = () => {
    setClientToEdit(null);
    setIsAddEditModalOpen(true);
  };

  // Handler: Edit Client Click
  const handleOpenEditModal = (client: Client) => {
    setClientToEdit(client);
    setIsAddEditModalOpen(true);
  };

  // Handler: View Client Details Click
  const handleViewDetails = (client: Client) => {
    setSelectedClientForDetail(client);
    setIsDetailModalOpen(true);
  };

  // Handler: Successful Save/Update from ClientModal
  const handleClientSaved = (savedClient: Client, isEdit: boolean) => {
    if (isEdit) {
      setClients((prev) =>
        prev.map((c) => (c.id === savedClient.id ? savedClient : c))
      );
      if (selectedClientForDetail?.id === savedClient.id) {
        setSelectedClientForDetail(savedClient);
      }
      setFeedbackMessage({
        type: 'success',
        text: `Client "${savedClient.company_name}" successfully updated.`,
      });
    } else {
      setClients((prev) => [savedClient, ...prev]);
      setFeedbackMessage({
        type: 'success',
        text: `Carrier client "${savedClient.company_name}" registered successfully.`,
      });
    }
  };

  // Handler: Toggle Client Status (Active <-> Inactive)
  const handleToggleStatus = async (client: Client) => {
    if (!canEdit) return;

    const newStatus = client.status === 'active' ? 'inactive' : 'active';
    setTogglingClientId(client.id);

    try {
      const updated = await clientService.updateClientStatus(orgId, client.id, newStatus);
      setClients((prev) =>
        prev.map((c) => (c.id === updated.id ? updated : c))
      );
      if (selectedClientForDetail?.id === updated.id) {
        setSelectedClientForDetail(updated);
      }
      setFeedbackMessage({
        type: 'success',
        text: `Client "${client.company_name}" marked as ${newStatus}.`,
      });
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Failed to update client status.';
      setFeedbackMessage({
        type: 'error',
        text: msg,
      });
    } finally {
      setTogglingClientId(null);
    }
  };

  // Handler: Delete Client (owner_admin only)
  const handleDeleteClientConfirm = async () => {
    if (!clientToDelete || !canDelete) return;

    setIsDeleting(true);
    try {
      await clientService.deleteClient(orgId, clientToDelete.id);

      setClients((prev) => prev.filter((c) => c.id !== clientToDelete.id));
      if (selectedClientForDetail?.id === clientToDelete.id) {
        setIsDetailModalOpen(false);
        setSelectedClientForDetail(null);
      }
      setFeedbackMessage({
        type: 'success',
        text: `Client "${clientToDelete.company_name}" deleted.`,
      });
      setClientToDelete(null);
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Failed to delete client.';
      setFeedbackMessage({
        type: 'error',
        text: msg,
      });
    } finally {
      setIsDeleting(false);
    }
  };

  // Calculate high-level KPIs
  const totalClients = clients.length;
  const activeClients = clients.filter((c) => c.status === 'active').length;
  const fleetUnits = clients.filter((c) => c.client_type === 'fleet').length;
  const clientsWithRpm = clients.filter(
    (c) => c.minimum_rate_per_mile !== null && c.minimum_rate_per_mile !== undefined && c.minimum_rate_per_mile > 0
  );
  const avgTargetRpm =
    clientsWithRpm.length > 0
      ? clientsWithRpm.reduce((sum, c) => sum + (c.minimum_rate_per_mile || 0), 0) / clientsWithRpm.length
      : null;

  return (
    <div id="clients-view" className="space-y-6">
      {/* Header & Main Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-100 tracking-tight">
              Carrier Clients
            </h1>
            <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-lg bg-indigo-950/70 text-indigo-300 border border-indigo-800/60 font-semibold">
              Owner-Operators & Fleets
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Manage your dispatch company's carrier customers, rate targets, preferred equipment, and contact roster.
          </p>
        </div>

        {canEdit && (
          <button
            id="add-client-btn"
            onClick={handleOpenAddModal}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl shadow-xs transition-colors cursor-pointer self-start sm:self-auto shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Add Carrier Client</span>
          </button>
        )}
      </div>

      {/* 4-Card Operational KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Total Clients */}
        <div className="bg-slate-900 border border-slate-800/80 rounded-xl p-3.5 sm:p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Total Carriers</span>
            <div className="w-7 h-7 rounded-lg bg-indigo-950/60 border border-indigo-800/50 flex items-center justify-center text-indigo-400">
              <Building2 className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-xl sm:text-2xl font-bold text-slate-100 font-mono tabular-nums">
              {isLoading ? '—' : totalClients}
            </span>
            <span className="text-[11px] text-slate-500">accounts</span>
          </div>
        </div>

        {/* Active Clients */}
        <div className="bg-slate-900 border border-slate-800/80 rounded-xl p-3.5 sm:p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Active Dispatch</span>
            <div className="w-7 h-7 rounded-lg bg-emerald-950/60 border border-emerald-800/50 flex items-center justify-center text-emerald-400">
              <Activity className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-xl sm:text-2xl font-bold text-emerald-400 font-mono tabular-nums">
              {isLoading ? '—' : activeClients}
            </span>
            <span className="text-[11px] text-slate-500">
              {totalClients > 0 ? `${Math.round((activeClients / totalClients) * 100)}% roster` : 'available'}
            </span>
          </div>
        </div>

        {/* Fleet Accounts */}
        <div className="bg-slate-900 border border-slate-800/80 rounded-xl p-3.5 sm:p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Fleet Units</span>
            <div className="w-7 h-7 rounded-lg bg-cyan-950/60 border border-cyan-800/50 flex items-center justify-center text-cyan-400">
              <Truck className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-xl sm:text-2xl font-bold text-cyan-300 font-mono tabular-nums">
              {isLoading ? '—' : fleetUnits}
            </span>
            <span className="text-[11px] text-slate-500">
              {totalClients > 0 ? `${totalClients - fleetUnits} owner-ops` : 'fleets'}
            </span>
          </div>
        </div>

        {/* Avg Target RPM */}
        <div className="bg-slate-900 border border-slate-800/80 rounded-xl p-3.5 sm:p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Avg Target RPM</span>
            <div className="w-7 h-7 rounded-lg bg-emerald-950/60 border border-emerald-800/50 flex items-center justify-center text-emerald-400">
              <DollarSign className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-xl sm:text-2xl font-bold text-emerald-400 font-mono tabular-nums">
              {isLoading ? '—' : avgTargetRpm !== null ? `$${avgTargetRpm.toFixed(2)}` : '—'}
            </span>
            <span className="text-[11px] text-slate-500">/ mile baseline</span>
          </div>
        </div>
      </div>

      {/* Transient Feedback Banner */}
      {feedbackMessage && (
        <div
          id="clients-feedback-banner"
          className={`p-3.5 rounded-xl text-xs flex items-center justify-between transition-all shadow-xs ${
            feedbackMessage.type === 'success'
              ? 'bg-emerald-950/60 border border-emerald-800/70 text-emerald-200'
              : 'bg-rose-950/60 border border-rose-800/70 text-rose-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedbackMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span>{feedbackMessage.text}</span>
          </div>
          <button
            onClick={() => setFeedbackMessage(null)}
            className="text-slate-400 hover:text-slate-200 text-xs cursor-pointer ml-4 font-mono"
          >
            ✕
          </button>
        </div>
      )}

      {/* Main Client Table & Filters */}
      <ClientList
        clients={clients}
        isLoading={isLoading}
        error={error}
        onRefresh={fetchClients}
        onViewDetails={handleViewDetails}
        onEditClient={handleOpenEditModal}
        onToggleStatus={handleToggleStatus}
        onDeleteClient={canDelete ? (client) => setClientToDelete(client) : undefined}
        onAddClient={handleOpenAddModal}
        canEdit={canEdit}
        canDelete={canDelete}
        togglingClientId={togglingClientId}
      />

      {/* Add / Edit Client Modal */}
      {activeOrganization && (
        <ClientModal
          isOpen={isAddEditModalOpen}
          onClose={() => setIsAddEditModalOpen(false)}
          onSuccess={handleClientSaved}
          clientToEdit={clientToEdit}
          organizationId={activeOrganization.id}
        />
      )}

      {/* Client Detail Modal */}
      <ClientDetailModal
        client={selectedClientForDetail}
        isOpen={isDetailModalOpen}
        onClose={() => {
          setIsDetailModalOpen(false);
          setSelectedClientForDetail(null);
        }}
        onEdit={(client) => {
          setIsDetailModalOpen(false);
          handleOpenEditModal(client);
        }}
        onToggleStatus={handleToggleStatus}
        onDelete={canDelete ? (client) => setClientToDelete(client) : undefined}
        canEdit={canEdit}
        canDelete={canDelete}
        isUpdatingStatus={togglingClientId === selectedClientForDetail?.id}
      />

      {/* Delete Confirmation Modal */}
      {clientToDelete && (
        <Modal
          id="delete-client-modal"
          isOpen={Boolean(clientToDelete)}
          onClose={() => setClientToDelete(null)}
          title="Confirm Client Deletion"
          subtitle="This action permanently removes the carrier client from your dispatch organization."
          maxWidth="md"
        >
          <div className="space-y-4 text-xs text-slate-300">
            <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-800/80 text-rose-200 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <p className="leading-relaxed">
                Are you sure you want to delete <strong className="text-white">{clientToDelete.company_name}</strong>?
                Any historical associations with trucks or loads will have their client foreign key set to null.
              </p>
            </div>

            <div className="pt-3 border-t border-slate-800 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setClientToDelete(null)}
                disabled={isDeleting}
                className="px-4 py-2 text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                id="confirm-delete-client-btn"
                type="button"
                onClick={handleDeleteClientConfirm}
                disabled={isDeleting}
                className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 rounded-xl transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1.5 shadow-xs"
              >
                {isDeleting ? 'Deleting...' : 'Delete Carrier Client'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

