import React, { useState } from 'react';
import {
  AccessorialWithLoad,
  AccessorialStatus,
  ACCESSORIAL_TYPE_CONFIG,
  ACCESSORIAL_STATUS_CONFIG,
} from './accessorialTypes.ts';
import { calculateDetention } from './accessorialService.ts';
import {
  generateBrokerDetentionEmail,
  generateDriverWhatsAppReminder,
  generateLayoverTonuEmail,
  generateLumperClaimEmail,
} from './accessorialComms.ts';
import { useTimezone } from '../../contexts/TimezoneContext.tsx';
import { formatDualTime, formatInTimezone } from '../../lib/timezones.ts';
import { formatCurrency } from '../../lib/calculations.ts';
import { Modal } from '../../components/common/Modal.tsx';
import { ContextualCopilotModal } from '../ai/ContextualCopilotModal.tsx';
import {
  Timer,
  Clock,
  DollarSign,
  Send,
  MessageSquare,
  FileCheck,
  Building2,
  Truck,
  Edit2,
  Trash2,
  CheckCircle2,
  Copy,
  Check,
  AlertTriangle,
  Receipt,
  XCircle,
  Sparkles,
  Bell,
} from 'lucide-react';

export interface AccessorialListProps {
  claims: AccessorialWithLoad[];
  isLoading: boolean;
  canEdit: boolean;
  canDelete: boolean;
  onEdit: (claim: AccessorialWithLoad) => void;
  onDelete: (claim: AccessorialWithLoad) => void;
  onStatusChange: (claim: AccessorialWithLoad, newStatus: AccessorialStatus) => void;
  onOpenLoadDetail?: (loadId: string) => void;
  onCreateTask?: (claim: AccessorialWithLoad, taskType: 'detention_reminder' | 'broker_followup') => void;
}

export const AccessorialList: React.FC<AccessorialListProps> = ({
  claims,
  isLoading,
  canEdit,
  canDelete,
  onEdit,
  onDelete,
  onStatusChange,
  onOpenLoadDetail,
  onCreateTask,
}) => {
  const { operationalTimezone, dispatcherTimezone } = useTimezone();

  // Comms Modal State
  const [commsModalClaim, setCommsModalClaim] = useState<AccessorialWithLoad | null>(null);
  const [activeCommsTab, setActiveCommsTab] = useState<'broker' | 'whatsapp'>('broker');
  const [copiedText, setCopiedText] = useState<string | null>(null);

  // Copilot Modal State
  const [copilotClaim, setCopilotClaim] = useState<AccessorialWithLoad | null>(null);

  const handleCopy = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(type);
    setTimeout(() => setCopiedText(null), 2500);
  };

  if (isLoading) {
    return (
      <div className="p-12 text-center text-slate-400">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-xs">Loading accessorial and detention records...</p>
      </div>
    );
  }

  if (claims.length === 0) {
    return (
      <div className="p-12 text-center bg-slate-900/40 rounded-xl border border-slate-800 text-slate-400">
        <Receipt className="w-10 h-10 mx-auto text-slate-600 mb-3" />
        <h4 className="text-sm font-semibold text-slate-300">No Accessorial Claims Found</h4>
        <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
          Log detention time, lumper fees, layovers, or TONU claims to track broker reimbursements and protect carrier revenue.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {claims.map((claim) => {
          const typeCfg = ACCESSORIAL_TYPE_CONFIG[claim.type];
          const statusCfg = ACCESSORIAL_STATUS_CONFIG[claim.status];
          const isDetention = claim.type === 'detention';
          const det = claim.detention_details;

          // Compute live detention info if detention
          let detCalc = null;
          if (isDetention && det) {
            detCalc = calculateDetention({
              arrivalTime: det.arrival_time,
              departureTime: det.departure_time,
              freeTimeHours: det.free_time_hours,
              hourlyRate: det.hourly_rate,
            });
          }

          const isActiveDetention = detCalc?.isActiveDetention;
          const isWithinFreeTime = detCalc?.isWithinFreeTime;

          return (
            <div
              key={claim.id}
              id={`claim-card-${claim.id}`}
              className={`p-4 rounded-xl border transition-all ${
                isActiveDetention
                  ? 'bg-amber-500/5 border-amber-500/40 shadow-sm shadow-amber-500/10'
                  : 'bg-slate-900/80 border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                {/* Left: Type, Load & Facility info */}
                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Accessorial Type Chip */}
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md border ${typeCfg.badgeColor}`}>
                      {typeCfg.label}
                    </span>

                    {/* Status Pill */}
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${statusCfg.color}`}>
                      {statusCfg.label}
                    </span>

                    {/* Active Detention Alert */}
                    {isActiveDetention && detCalc && (
                      <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse">
                        <Timer className="w-3 h-3" />
                        Accruing Detention: +{detCalc.billableHours.toFixed(2)} hrs billable
                      </span>
                    )}

                    {isDetention && isWithinFreeTime && detCalc && !det?.departure_time && (
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                        Within Free Time ({Math.round(detCalc.timeRemainingInFreeTimeMs / 60000)}m left)
                      </span>
                    )}
                  </div>

                  {/* Load & Facility Route */}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-300">
                    <button
                      type="button"
                      onClick={() => claim.load && onOpenLoadDetail?.(claim.load.id)}
                      className="font-mono font-bold text-indigo-400 hover:text-indigo-300 hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <Truck className="w-3.5 h-3.5" />
                      {claim.load?.load_number || 'Load Pending'}
                    </button>

                    <span className="text-slate-600">•</span>
                    <span className="text-slate-200 font-medium">
                      {claim.load?.origin_city}, {claim.load?.origin_state} ➔ {claim.load?.dest_city},{' '}
                      {claim.load?.dest_state}
                    </span>

                    {claim.load?.client && (
                      <>
                        <span className="text-slate-600">•</span>
                        <span className="text-slate-400 text-[11px] truncate">{claim.load.client.company_name}</span>
                      </>
                    )}

                    {claim.broker_name && (
                      <>
                        <span className="text-slate-600">•</span>
                        <span className="text-slate-400 text-[11px] flex items-center gap-1">
                          <Building2 className="w-3 h-3 text-slate-500" />
                          {claim.broker_name}
                        </span>
                      </>
                    )}
                  </div>

                  {/* Description & Detention Details */}
                  <p className="text-xs text-slate-400 line-clamp-2">{claim.description}</p>

                  {/* Detention Arrival/Departure timestamps */}
                  {isDetention && det && (
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-400 font-mono pt-1">
                      <span>
                        <strong className="text-slate-300 font-sans">Arrival:</strong>{' '}
                        {formatInTimezone(det.arrival_time, operationalTimezone, {
                          includeTime: true,
                          includeDate: true,
                        })}
                      </span>
                      <span>
                        <strong className="text-slate-300 font-sans">Departure:</strong>{' '}
                        {det.departure_time
                          ? formatInTimezone(det.departure_time, operationalTimezone, {
                              includeTime: true,
                              includeDate: true,
                            })
                          : 'In Progress (At Dock)'}
                      </span>
                      <span>
                        <strong className="text-slate-300 font-sans">Rate:</strong> ${det.hourly_rate}/hr (after{' '}
                        {det.free_time_hours}h)
                      </span>
                    </div>
                  )}

                  {/* Lumper receipt reference */}
                  {claim.type === 'lumper' && (claim.receipt_number || claim.receipt_doc_name) && (
                    <div className="flex items-center gap-2 text-[11px] text-blue-400 pt-0.5">
                      <Receipt className="w-3.5 h-3.5" />
                      <span>
                        Receipt: {claim.receipt_number || 'On File'} {claim.receipt_doc_name && `(${claim.receipt_doc_name})`}
                      </span>
                    </div>
                  )}
                </div>

                {/* Right: Amount & Action Buttons */}
                <div className="flex items-center justify-between lg:justify-end gap-3 pt-3 lg:pt-0 border-t lg:border-t-0 border-slate-800 shrink-0">
                  {/* Amount Display */}
                  <div className="text-right">
                    <span className="block text-[10px] uppercase font-semibold text-slate-400">Claim Amount</span>
                    <span className="text-base font-bold font-mono text-emerald-400">
                      {formatCurrency(claim.amount)}
                    </span>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {/* Detention Reminder Button for Active or Detention Claims */}
                    {canEdit && onCreateTask && isDetention && det?.arrival_time && (
                      <button
                        type="button"
                        onClick={() => onCreateTask(claim, 'detention_reminder')}
                        title="Set Deterministic Detention Free-Time Reminder"
                        className="p-1.5 text-amber-300 hover:text-white bg-amber-950/80 hover:bg-amber-900 rounded-lg transition-colors cursor-pointer flex items-center gap-1 text-xs font-semibold px-2.5 border border-amber-800/60 shadow-xs"
                      >
                        <Bell className="w-3.5 h-3.5 text-amber-400" />
                        <span className="hidden sm:inline">Detention Reminder</span>
                      </button>
                    )}

                    {/* Claim Follow-up Task Button */}
                    {canEdit && onCreateTask && (
                      <button
                        type="button"
                        onClick={() => onCreateTask(claim, 'broker_followup')}
                        title="Create Broker Claim Follow-up Task"
                        className="p-1.5 text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors cursor-pointer flex items-center gap-1 text-xs font-semibold px-2 border border-slate-700"
                      >
                        <Clock className="w-3.5 h-3.5 text-sky-400" />
                        <span className="hidden sm:inline">Follow-up</span>
                      </button>
                    )}

                    {/* Quick AI Escalation Generator Button */}
                    <button
                      type="button"
                      onClick={() => setCopilotClaim(claim)}
                      title="AI Draft Broker Escalation"
                      className="p-1.5 text-violet-300 hover:text-white bg-violet-950/80 hover:bg-violet-900 rounded-lg transition-colors cursor-pointer flex items-center gap-1 text-xs font-semibold px-2.5 border border-violet-800/60"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-violet-400" />
                      <span className="hidden sm:inline">AI Draft</span>
                    </button>

                    {/* Quick Comms Generator Button */}
                    <button
                      type="button"
                      onClick={() => setCommsModalClaim(claim)}
                      title="Generate Broker Email & WhatsApp Text"
                      className="p-1.5 text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors cursor-pointer flex items-center gap-1 text-xs font-semibold px-2.5 border border-slate-700"
                    >
                      <Send className="w-3.5 h-3.5 text-indigo-400" />
                      <span className="hidden sm:inline">Comms</span>
                    </button>

                    {/* Status Quick Cycle if CanEdit */}
                    {canEdit && (
                      <div className="relative group">
                        <select
                          value={claim.status}
                          onChange={(e) => onStatusChange(claim, e.target.value as AccessorialStatus)}
                          className="text-[11px] font-semibold bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-slate-300 focus:outline-none focus:border-indigo-500 cursor-pointer"
                        >
                          {(Object.keys(ACCESSORIAL_STATUS_CONFIG) as AccessorialStatus[]).map((st) => (
                            <option key={st} value={st}>
                              {ACCESSORIAL_STATUS_CONFIG[st].label}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* Edit Button */}
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => onEdit(claim)}
                        title="Edit Claim"
                        className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                    )}

                    {/* Delete Button (Admins only) */}
                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => onDelete(claim)}
                        title="Delete Claim"
                        className="p-1.5 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* QUICK COMMUNICATIONS GENERATOR MODAL */}
      {commsModalClaim && (
        <Modal
          id="accessorial-quick-comms-modal"
          isOpen={Boolean(commsModalClaim)}
          onClose={() => setCommsModalClaim(null)}
          title={`Quick Comms: ${ACCESSORIAL_TYPE_CONFIG[commsModalClaim.type].label} (Load #${
            commsModalClaim.load?.load_number || 'N/A'
          })`}
          maxWidth="2xl"
        >
          {(() => {
            const isDet = commsModalClaim.type === 'detention';
            const detCalc =
              isDet && commsModalClaim.detention_details
                ? calculateDetention({
                    arrivalTime: commsModalClaim.detention_details.arrival_time,
                    departureTime: commsModalClaim.detention_details.departure_time,
                    freeTimeHours: commsModalClaim.detention_details.free_time_hours,
                    hourlyRate: commsModalClaim.detention_details.hourly_rate,
                  })
                : {
                    totalDurationMs: 0,
                    totalDurationHours: 0,
                    freeTimeHours: 2.0,
                    freeTimeMs: 7200000,
                    detentionStartTimeIso: new Date().toISOString(),
                    rawDetentionHours: 0,
                    billableHours: 0,
                    hourlyRate: 75,
                    totalAmount: commsModalClaim.amount,
                    isWithinFreeTime: false,
                    isActiveDetention: false,
                    timeRemainingInFreeTimeMs: 0,
                    formattedDuration: '0h',
                    formattedBillableTime: '0h',
                  };

            const ctx = {
              operationalTimezone,
              dispatcherTimezone,
            };

            let brokerEmail = { subject: '', body: '' };
            let whatsappText = '';

            if (isDet) {
              brokerEmail = generateBrokerDetentionEmail(commsModalClaim, detCalc, ctx);
              whatsappText = generateDriverWhatsAppReminder(commsModalClaim, detCalc, ctx);
            } else if (commsModalClaim.type === 'tonu' || commsModalClaim.type === 'layover') {
              brokerEmail = generateLayoverTonuEmail(commsModalClaim, ctx);
              whatsappText = `🚨 *DISPATCH NOTICE:* Load #${commsModalClaim.load?.load_number} has been logged for ${ACCESSORIAL_TYPE_CONFIG[commsModalClaim.type].label} ($${commsModalClaim.amount}). Please standby for updated instructions.`;
            } else if (commsModalClaim.type === 'lumper') {
              brokerEmail = generateLumperClaimEmail(commsModalClaim, ctx);
              whatsappText = `🧾 *LUMPER CONFIRMATION:* Lumper payment of $${commsModalClaim.amount} has been logged for Load #${commsModalClaim.load?.load_number}. Thank you for sending the signed receipt!`;
            } else {
              brokerEmail = {
                subject: `[ACCESSORIAL CLAIM] Load #${commsModalClaim.load?.load_number} - ${ACCESSORIAL_TYPE_CONFIG[commsModalClaim.type].label}`,
                body: `ATTENTION BROKER TEAM,\n\nPlease issue a revised Rate Confirmation for Load #${commsModalClaim.load?.load_number} including $${commsModalClaim.amount.toFixed(2)} for ${commsModalClaim.description}.\n\nThank you,\nDispatch Operations`,
              };
              whatsappText = `Dispatch update for Load #${commsModalClaim.load?.load_number}: ${commsModalClaim.description}`;
            }

            return (
              <div className="space-y-4">
                {/* Tabs */}
                <div className="flex border-b border-slate-800">
                  <button
                    type="button"
                    onClick={() => setActiveCommsTab('broker')}
                    className={`px-4 py-2 text-xs font-bold border-b-2 transition-colors cursor-pointer flex items-center gap-2 ${
                      activeCommsTab === 'broker'
                        ? 'border-indigo-500 text-indigo-400'
                        : 'border-transparent text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Building2 className="w-3.5 h-3.5" />
                    Broker Claim Email
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveCommsTab('whatsapp')}
                    className={`px-4 py-2 text-xs font-bold border-b-2 transition-colors cursor-pointer flex items-center gap-2 ${
                      activeCommsTab === 'whatsapp'
                        ? 'border-emerald-500 text-emerald-400'
                        : 'border-transparent text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    Driver WhatsApp Message
                  </button>
                </div>

                {/* Tab 1: Broker Email */}
                {activeCommsTab === 'broker' && (
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-slate-400">Subject Line:</span>
                        <button
                          type="button"
                          onClick={() => handleCopy(brokerEmail.subject, 'subject')}
                          className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 cursor-pointer font-medium"
                        >
                          {copiedText === 'subject' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                          {copiedText === 'subject' ? 'Copied Subject' : 'Copy Subject'}
                        </button>
                      </div>
                      <div className="p-2.5 bg-slate-900 rounded-lg border border-slate-800 text-xs font-mono text-slate-200 select-all">
                        {brokerEmail.subject}
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-slate-400">Email Body:</span>
                        <button
                          type="button"
                          onClick={() => handleCopy(brokerEmail.body, 'body')}
                          className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 cursor-pointer font-medium"
                        >
                          {copiedText === 'body' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                          {copiedText === 'body' ? 'Copied Body' : 'Copy Body Text'}
                        </button>
                      </div>
                      <textarea
                        readOnly
                        value={brokerEmail.body}
                        rows={10}
                        className="w-full p-3 bg-slate-900 border border-slate-800 rounded-lg text-xs font-mono text-slate-300 focus:outline-none select-all leading-relaxed"
                      />
                    </div>
                  </div>
                )}

                {/* Tab 2: WhatsApp Message */}
                {activeCommsTab === 'whatsapp' && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-slate-400">
                        Ready-to-Paste WhatsApp Driver Text:
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopy(whatsappText, 'whatsapp')}
                        className="text-[11px] text-emerald-400 hover:text-emerald-300 flex items-center gap-1 cursor-pointer font-medium"
                      >
                        {copiedText === 'whatsapp' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        {copiedText === 'whatsapp' ? 'Copied WhatsApp Text' : 'Copy WhatsApp Text'}
                      </button>
                    </div>
                    <textarea
                      readOnly
                      value={whatsappText}
                      rows={10}
                      className="w-full p-3 bg-slate-900 border border-slate-800 rounded-lg text-xs font-mono text-slate-300 focus:outline-none select-all leading-relaxed"
                    />
                  </div>
                )}

                <div className="flex justify-end pt-3 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setCommsModalClaim(null)}
                    className="px-4 py-2 text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </div>
            );
          })()}
        </Modal>
      )}

      {/* Contextual AI Copilot Modal for Accessorial Claim */}
      {copilotClaim && (
        <ContextualCopilotModal
          isOpen={Boolean(copilotClaim)}
          onClose={() => setCopilotClaim(null)}
          load={copilotClaim.load}
          loadId={copilotClaim.load_id}
          claimId={copilotClaim.id}
          initialAction="detention_escalation"
          titleContext={`Broker Escalation: ${ACCESSORIAL_TYPE_CONFIG[copilotClaim.type].label} (Load #${
            copilotClaim.load?.load_number || 'N/A'
          })`}
        />
      )}
    </>
  );
};
