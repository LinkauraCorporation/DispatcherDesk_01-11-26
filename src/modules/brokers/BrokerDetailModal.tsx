import React, { useState, useEffect } from 'react';
import { Load } from '../../types/domain.types.ts';
import {
  BrokerWithPerformance,
  formatMcNumber,
  formatDotNumber,
  CREDIT_STATUS_OPTIONS,
} from './brokerTypes.ts';
import { Modal } from '../../components/common/Modal.tsx';
import { StatusBadge } from '../../components/common/StatusBadge.tsx';
import { brokerService } from './brokerService.ts';
import { useTimezone } from '../../contexts/TimezoneContext.tsx';
import { formatInTimezone } from '../../lib/timezones.ts';
import {
  Building2,
  Phone,
  Mail,
  FileText,
  Clock,
  ShieldCheck,
  Edit2,
  DollarSign,
  PackageCheck,
  TrendingUp,
  Truck,
  Calendar,
  Layers,
  FileSpreadsheet,
  AlertTriangle,
  ChevronRight,
  ExternalLink,
  MessageSquare,
} from 'lucide-react';

export interface BrokerDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  broker: BrokerWithPerformance | null;
  organizationId: string;
  onEdit: (broker: BrokerWithPerformance) => void;
  canEdit: boolean;
}

export const BrokerDetailModal: React.FC<BrokerDetailModalProps> = ({
  isOpen,
  onClose,
  broker,
  organizationId,
  onEdit,
  canEdit,
}) => {
  const { operationalTimezone } = useTimezone();
  const [activeTab, setActiveTab] = useState<'overview' | 'loads' | 'notes' | 'compliance'>('overview');
  const [brokerLoads, setBrokerLoads] = useState<Load[]>([]);
  const [isLoadingLoads, setIsLoadingLoads] = useState(false);

  useEffect(() => {
    if (isOpen && broker && organizationId) {
      setIsLoadingLoads(true);
      brokerService
        .getBrokerLoads(organizationId, broker.id)
        .then((loads) => {
          setBrokerLoads(loads);
        })
        .catch((err) => {
          console.error('Error fetching broker loads:', err);
        })
        .finally(() => {
          setIsLoadingLoads(false);
        });
    }
  }, [isOpen, broker, organizationId]);

  if (!broker) return null;

  const creditOpt = CREDIT_STATUS_OPTIONS.find((c) => c.value === broker.credit_status);
  const perf = broker.performance || {
    loads_count: brokerLoads.length,
    total_gross: brokerLoads.reduce((sum, l) => sum + (l.rate || 0), 0),
    avg_rpm: 0,
    active_loads_count: brokerLoads.filter((l) => l.pipeline_status === 'booked' || l.pipeline_status === 'in_transit').length,
    last_booked_at: null,
    payment_terms_avg_days: broker.payment_terms_days,
  };

  return (
    <Modal
      id={`broker-detail-modal-${broker.id}`}
      isOpen={isOpen}
      onClose={onClose}
      title={broker.company_name}
      subtitle="Broker CRM Profile, Credit Assessment & Dispatch Load History"
      maxWidth="3xl"
    >
      <div className="space-y-6">
        {/* Top Header Card */}
        <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-lg font-bold text-slate-100">{broker.company_name}</span>
                <StatusBadge status={broker.credit_status} type="credit" size="sm" />
                <StatusBadge status={broker.status || 'active'} type="status" size="sm" />
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-400 font-mono flex-wrap">
                {broker.mc_number && (
                  <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-sky-300">
                    {formatMcNumber(broker.mc_number)}
                  </span>
                )}
                {broker.dot_number && (
                  <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300">
                    {formatDotNumber(broker.dot_number)}
                  </span>
                )}
                <span className="flex items-center gap-1 text-slate-400 font-sans">
                  <Clock className="w-3.5 h-3.5 text-slate-500" />
                  {broker.payment_terms_days} Days Net
                </span>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="flex items-center gap-2">
              {canEdit && (
                <button
                  id="broker-detail-edit-btn"
                  onClick={() => onEdit(broker)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 border border-slate-700 transition-colors cursor-pointer"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  <span>Edit Profile</span>
                </button>
              )}
            </div>
          </div>

          {/* Contact Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-slate-800/80 text-xs">
            <div className="flex items-center gap-2 text-slate-300">
              <Building2 className="w-4 h-4 text-sky-400 shrink-0" />
              <div>
                <span className="text-slate-500 block text-[10px] uppercase font-semibold">Rep / Pod</span>
                <span className="font-medium text-slate-200">{broker.contact_name || 'Unassigned / General Desk'}</span>
              </div>
            </div>

            <div className="flex items-center gap-2 text-slate-300">
              <Phone className="w-4 h-4 text-emerald-400 shrink-0" />
              <div>
                <span className="text-slate-500 block text-[10px] uppercase font-semibold">Phone</span>
                {broker.contact_phone ? (
                  <a
                    href={`tel:${broker.contact_phone}`}
                    className="font-medium text-emerald-300 hover:underline"
                  >
                    {broker.contact_phone}
                  </a>
                ) : (
                  <span className="text-slate-500 font-medium">—</span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 text-slate-300">
              <Mail className="w-4 h-4 text-sky-400 shrink-0" />
              <div>
                <span className="text-slate-500 block text-[10px] uppercase font-semibold">Dispatch Email</span>
                {broker.contact_email ? (
                  <a
                    href={`mailto:${broker.contact_email}`}
                    className="font-medium text-sky-300 hover:underline truncate max-w-[180px] block"
                  >
                    {broker.contact_email}
                  </a>
                ) : (
                  <span className="text-slate-500 font-medium">—</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 4 Performance Metric Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 space-y-1">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Total Revenue</span>
              <DollarSign className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-lg font-bold text-slate-100 font-mono">
              ${perf.total_gross.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </div>
            <div className="text-[11px] text-slate-500">Gross revenue booked</div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 space-y-1">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Loads Dispatched</span>
              <PackageCheck className="w-4 h-4 text-sky-400" />
            </div>
            <div className="text-lg font-bold text-slate-100 font-mono">
              {perf.loads_count}
            </div>
            <div className="text-[11px] text-slate-500">
              {perf.active_loads_count > 0 ? `${perf.active_loads_count} active in-flight` : 'All completed'}
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 space-y-1">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Avg Rate / Mile</span>
              <TrendingUp className="w-4 h-4 text-purple-400" />
            </div>
            <div className="text-lg font-bold text-slate-100 font-mono">
              {perf.avg_rpm > 0 ? `$${perf.avg_rpm.toFixed(2)}/mi` : '—'}
            </div>
            <div className="text-[11px] text-slate-500">Average historical yield</div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 space-y-1">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Payment Terms</span>
              <Clock className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-lg font-bold text-slate-100 font-mono">
              {broker.payment_terms_days}d Net
            </div>
            <div className="text-[11px] text-slate-500">Invoice terms agreed</div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 border-b border-slate-800 pb-1">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'overview'
                ? 'bg-sky-950 text-sky-300 border border-sky-800/60'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Credit & Instructions</span>
          </button>

          <button
            onClick={() => setActiveTab('loads')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'loads'
                ? 'bg-sky-950 text-sky-300 border border-sky-800/60'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Load History ({brokerLoads.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('compliance')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'compliance'
                ? 'bg-sky-950 text-sky-300 border border-sky-800/60'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Carrier Compliance</span>
          </button>
        </div>

        {/* Tab 1: Overview & Credit */}
        {activeTab === 'overview' && (
          <div className="space-y-4">
            {/* Credit Assessment Banner */}
            <div
              className={`p-4 rounded-xl border space-y-2 ${
                broker.credit_status === 'approved'
                  ? 'bg-emerald-950/20 border-emerald-800/50'
                  : broker.credit_status === 'caution'
                  ? 'bg-amber-950/20 border-amber-800/50'
                  : broker.credit_status === 'factoring_only'
                  ? 'bg-sky-950/20 border-sky-800/50'
                  : 'bg-rose-950/20 border-rose-800/50'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldCheck
                    className={`w-5 h-5 ${
                      broker.credit_status === 'approved'
                        ? 'text-emerald-400'
                        : broker.credit_status === 'caution'
                        ? 'text-amber-400'
                        : broker.credit_status === 'factoring_only'
                        ? 'text-sky-400'
                        : 'text-rose-400'
                    }`}
                  />
                  <span className="text-sm font-semibold text-slate-100">
                    Credit Rating: {creditOpt?.label || broker.credit_status}
                  </span>
                </div>
                <span className="text-xs font-mono font-medium px-2 py-0.5 rounded bg-slate-950/70 border border-slate-800 text-slate-300">
                  Risk Level: {creditOpt?.riskLevel}
                </span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                {creditOpt?.description || 'Review factoring status and credit limit before dispatch.'}
              </p>
            </div>

            {/* Dispatch Notes & Instructions */}
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-300 uppercase tracking-wider">
                <FileText className="w-4 h-4 text-sky-400" />
                <span>Dispatcher Notes & Operational Policies</span>
              </div>
              {broker.notes ? (
                <p className="text-xs text-slate-300 whitespace-pre-wrap leading-relaxed">
                  {broker.notes}
                </p>
              ) : (
                <p className="text-xs text-slate-500 italic">
                  No operational instructions logged for this brokerage. Click Edit Profile to add check-in requirements or tracking policies.
                </p>
              )}
            </div>

            {/* Metadata Footer */}
            <div className="flex items-center justify-between text-[11px] text-slate-500 px-1 pt-2 border-t border-slate-800/60">
              <span>Created on: {new Date(broker.created_at).toLocaleDateString()}</span>
              <span>Last updated: {new Date(broker.updated_at).toLocaleDateString()}</span>
            </div>
          </div>
        )}

        {/* Tab 2: Load History */}
        {activeTab === 'loads' && (
          <div className="space-y-3">
            {isLoadingLoads ? (
              <div className="py-12 text-center text-xs text-slate-400">Loading historical dispatches...</div>
            ) : brokerLoads.length === 0 ? (
              <div className="p-8 text-center rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <Layers className="w-8 h-8 text-slate-600 mx-auto" />
                <div className="text-sm font-semibold text-slate-200">No Dispatches Booked Yet</div>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  When you book loads with {broker.company_name} from the Loads module, they will automatically appear here with real-time profitability analytics.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {brokerLoads.map((load) => (
                  <div
                    key={load.id}
                    className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-slate-700 transition-colors"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-bold text-sky-400">{load.load_number}</span>
                        <StatusBadge status={load.pipeline_status} type="pipeline" size="sm" />
                      </div>
                      <div className="text-xs text-slate-300 font-medium">
                        {load.origin_city}, {load.origin_state} <span className="text-slate-500">→</span> {load.dest_city}, {load.dest_state}
                      </div>
                      <div className="text-[11px] text-slate-500 flex items-center gap-3">
                        <span>Pickup: {load.pickup_datetime ? formatInTimezone(load.pickup_datetime, operationalTimezone, { includeDate: true, includeTime: false, includeTimezoneCode: false }) : 'TBD'}</span>
                        <span>•</span>
                        <span>{load.equipment_type?.replace(/_/g, ' ') || 'Dry Van'}</span>
                      </div>
                    </div>

                    <div className="text-right sm:border-l sm:border-slate-800 sm:pl-4">
                      <div className="text-sm font-bold text-emerald-400 font-mono">
                        ${load.rate?.toLocaleString() || '0.00'}
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono">
                        {load.loaded_miles ? `${load.loaded_miles} mi ($${((load.rate || 0) / load.loaded_miles).toFixed(2)}/mi)` : 'Miles TBD'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Carrier Compliance & Packet */}
        {activeTab === 'compliance' && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-sky-400 uppercase tracking-wider">
                <FileSpreadsheet className="w-4 h-4" />
                <span>Broker-Carrier Agreement & Compliance Packet</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Broker setup packet on file for <strong>{broker.company_name}</strong>. Carrier packets and certificates of insurance (COI) are automatically verified during load booking.
              </p>

              <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-xs">
                  <div className="flex items-center gap-2 text-slate-200">
                    <FileText className="w-4 h-4 text-emerald-400" />
                    <span>Broker-Carrier Agreement (BCA)</span>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-emerald-950/60 border border-emerald-800/60 text-emerald-300 text-[11px] font-semibold">
                    Executed & Active
                  </span>
                </div>

                <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-xs">
                  <div className="flex items-center gap-2 text-slate-200">
                    <ShieldCheck className="w-4 h-4 text-sky-400" />
                    <span>Certificate of Insurance (COI) on File</span>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-sky-950/60 border border-sky-800/60 text-sky-300 text-[11px] font-semibold">
                    $1,000,000 Auto / $100,000 Cargo
                  </span>
                </div>

                <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-xs">
                  <div className="flex items-center gap-2 text-slate-200">
                    <DollarSign className="w-4 h-4 text-amber-400" />
                    <span>Factoring Notice of Assignment (NOA)</span>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-amber-950/60 border border-amber-800/60 text-amber-300 text-[11px] font-semibold">
                    {broker.credit_status === 'factoring_only' ? 'Verified with RTS/Triumph' : 'Direct or Factored'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modal Close Button */}
        <div className="flex items-center justify-end pt-4 border-t border-slate-800">
          <button
            id="close-broker-detail-btn"
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
};
