import React, { useState, useEffect, useMemo } from 'react';
import { LoadWithRelations } from '../loads/loadTypes.ts';
import { AccessorialClaim } from '../accessorials/accessorialTypes.ts';
import { accessorialService } from '../accessorials/accessorialService.ts';
import { Modal } from '../../components/common/Modal.tsx';
import { StatusBadge } from '../../components/common/StatusBadge.tsx';
import { useAuth } from '../../contexts/AuthContext.tsx';
import { useTimezone } from '../../contexts/TimezoneContext.tsx';
import { formatCurrency, formatMiles, formatRPM } from '../../lib/calculations.ts';
import { formatInTimezone } from '../../lib/timezones.ts';
import {
  BillingDocumentType,
  InvoiceSettlementModalProps,
  LoadBillingSettlementSummary,
} from './billingTypes.ts';
import {
  calculateBillingSettlement,
  exportBrokerInvoiceCsv,
  exportCarrierSettlementCsv,
} from './utils/billingExportUtils.ts';
import { invoicePdfGenerator } from './utils/invoicePdfGenerator.ts';
import {
  Receipt,
  FileText,
  DollarSign,
  Download,
  FileSpreadsheet,
  Printer,
  CheckCircle2,
  AlertTriangle,
  Clock,
  XCircle,
  Building2,
  ShieldCheck,
  Truck,
  UserCheck,
  Percent,
  Calendar,
  Layers,
  Sparkles,
  ArrowRight,
  ClipboardCopy,
  Info,
} from 'lucide-react';

export const InvoiceSettlementModal: React.FC<InvoiceSettlementModalProps> = ({
  isOpen,
  onClose,
  load,
  initialType = 'broker_invoice',
  onStatusChange,
}) => {
  const { activeOrganization, userRole } = useAuth();
  const { operationalTimezone, dispatcherTimezone } = useTimezone();

  const [activeTab, setActiveTab] = useState<BillingDocumentType>(initialType);
  const [accessorials, setAccessorials] = useState<AccessorialClaim[]>([]);
  const [isLoadingAccessorials, setIsLoadingAccessorials] = useState(false);

  // Billing configuration options
  const [dispatcherFeePercent, setDispatcherFeePercent] = useState<number>(8);
  const [invoiceNumber, setInvoiceNumber] = useState<string>('');
  const [settlementNumber, setSettlementNumber] = useState<string>('');
  const [paymentTerms, setPaymentTerms] = useState<string>('30 Days Net');
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  useEffect(() => {
    if (load) {
      setInvoiceNumber(`INV-${load.load_number}`);
      setSettlementNumber(`SET-${load.load_number}`);
      setActiveTab(initialType);
      
      const brokerTerms = load.broker?.payment_terms_days;
      if (brokerTerms) {
        setPaymentTerms(`${brokerTerms} Days Net`);
      } else {
        setPaymentTerms('30 Days Net');
      }
    }
  }, [load, initialType]);

  // Fetch accessorials for the load
  useEffect(() => {
    if (isOpen && load) {
      setIsLoadingAccessorials(true);
      accessorialService
        .getAccessorialsByLoadId(load.organization_id, load.id)
        .then((claims) => setAccessorials(claims))
        .catch((err) => console.error('Failed to load accessorial claims:', err))
        .finally(() => setIsLoadingAccessorials(false));
    }
  }, [isOpen, load]);

  // Deterministic financial calculation using the single source of truth engine
  const billingSummary: LoadBillingSettlementSummary | null = useMemo(() => {
    if (!load) return null;
    return calculateBillingSettlement(load, accessorials, dispatcherFeePercent);
  }, [load, accessorials, dispatcherFeePercent]);

  if (!load || !billingSummary) return null;

  const totalMiles = (load.loaded_miles || 0) + (load.deadhead_miles || 0);
  const isDeliveredOrInvoiced =
    load.pipeline_status === 'delivered' ||
    load.pipeline_status === 'invoiced' ||
    load.pipeline_status === 'paid';

  const handleDownloadPdf = async () => {
    setIsGeneratingPdf(true);
    try {
      if (activeTab === 'broker_invoice') {
        await invoicePdfGenerator.downloadBrokerInvoicePdf({
          load,
          accessorials: billingSummary.billableAccessorials,
          organization: activeOrganization,
          invoiceNumber,
          paymentTerms,
          operationalTimezone,
          dispatcherTimezone,
        });
      } else {
        await invoicePdfGenerator.downloadCarrierSettlementPdf({
          load,
          accessorials: billingSummary.billableAccessorials,
          organization: activeOrganization,
          settlementNumber,
          dispatcherFeePercent,
          operationalTimezone,
          dispatcherTimezone,
        });
      }
    } catch (err) {
      console.error('Failed to generate PDF:', err);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handleExportCsv = () => {
    if (activeTab === 'broker_invoice') {
      exportBrokerInvoiceCsv(load, billingSummary);
    } else {
      exportCarrierSettlementCsv(load, billingSummary);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleCopySummary = () => {
    if (!billingSummary) return;

    let text = '';
    if (activeTab === 'broker_invoice') {
      text = `=== COMMERCIAL INVOICE ===\nInvoice #: ${invoiceNumber}\nLoad #: ${load.load_number}\nBroker: ${load.broker?.company_name || 'Direct'}\nLane: ${load.origin_city}, ${load.origin_state} -> ${load.dest_city}, ${load.dest_state}\nPrimary Linehaul: ${formatCurrency(billingSummary.primaryLinehaulRate)}\nApproved Accessorials: ${formatCurrency(billingSummary.approvedAccessorialsTotal)}\nTOTAL GROSS INVOICE DUE: ${formatCurrency(billingSummary.grossBilledTotal)}\nTerms: ${paymentTerms}`;
    } else {
      text = `=== CARRIER SETTLEMENT ===\nSettlement #: ${settlementNumber}\nLoad #: ${load.load_number}\nCarrier: ${load.client?.company_name || 'Fleet'}\nTruck: #${load.truck?.truck_number || 'N/A'}\nGross Freight: ${formatCurrency(billingSummary.grossBilledTotal)}\nDispatcher Fee (${billingSummary.dispatcherFeePercent}%): -${formatCurrency(billingSummary.dispatcherFeeAmount)}\nFuel/Deductions: -${formatCurrency(billingSummary.fuelExpense + billingSummary.otherExpenses)}\nNET CARRIER PAYOUT: ${formatCurrency(billingSummary.netCarrierSettlement)}`;
    }

    navigator.clipboard.writeText(text);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 3000);
  };

  const handleMarkAsInvoiced = async () => {
    if (!onStatusChange || !load) return;
    setIsUpdatingStatus(true);
    try {
      await onStatusChange(load.id, 'invoiced');
    } catch (err) {
      console.error('Failed to mark load as invoiced:', err);
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  return (
    <Modal
      id="invoice-settlement-generator-modal"
      isOpen={isOpen}
      onClose={onClose}
      title={`Billing & Settlement Generator: ${load.load_number}`}
      subtitle={`${load.origin_city}, ${load.origin_state} → ${load.dest_city}, ${load.dest_state} • ${load.client?.company_name || 'Carrier'}`}
      maxWidth="3xl"
    >
      <div className="space-y-5 text-xs text-slate-200">
        {/* Document Type Switcher Tabs */}
        <div className="flex items-center justify-between gap-3 border-b border-slate-800 pb-3 flex-wrap">
          <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button
              id="tab-btn-broker-invoice"
              type="button"
              onClick={() => setActiveTab('broker_invoice')}
              className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'broker_invoice'
                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-800/60 shadow-xs'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <Receipt className="w-3.5 h-3.5" />
              <span>Broker Freight Invoice</span>
            </button>

            <button
              id="tab-btn-carrier-settlement"
              type="button"
              onClick={() => setActiveTab('carrier_settlement')}
              className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'carrier_settlement'
                  ? 'bg-indigo-950 text-indigo-300 border border-indigo-800/60 shadow-xs'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <DollarSign className="w-3.5 h-3.5" />
              <span>Carrier Settlement Statement</span>
            </button>
          </div>

          {/* Quick Action Export Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              id="btn-copy-billing-summary"
              type="button"
              onClick={handleCopySummary}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700 font-semibold transition-colors cursor-pointer text-xs"
              title="Copy Summary to Clipboard"
            >
              <ClipboardCopy className="w-3.5 h-3.5 text-slate-400" />
              <span>{copySuccess ? 'Copied!' : 'Copy Summary'}</span>
            </button>

            <button
              id="btn-export-billing-csv"
              type="button"
              onClick={handleExportCsv}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700 font-semibold transition-colors cursor-pointer text-xs"
              title="Export CSV"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
              <span>Export CSV</span>
            </button>

            <button
              id="btn-download-billing-pdf"
              type="button"
              onClick={handleDownloadPdf}
              disabled={isGeneratingPdf}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-white font-bold transition-all cursor-pointer text-xs shadow-xs disabled:opacity-50 ${
                activeTab === 'broker_invoice'
                  ? 'bg-emerald-600 hover:bg-emerald-500'
                  : 'bg-indigo-600 hover:bg-indigo-500'
              }`}
              title="Download Document PDF"
            >
              <Download className={`w-3.5 h-3.5 ${isGeneratingPdf ? 'animate-bounce' : ''}`} />
              <span>{isGeneratingPdf ? 'Generating...' : 'Download PDF'}</span>
            </button>
          </div>
        </div>

        {/* Operational Lifecycle Guard Banner */}
        {!isDeliveredOrInvoiced && (
          <div className="p-3.5 rounded-xl bg-amber-950/40 border border-amber-800/60 text-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <span className="font-bold text-amber-300 text-xs">
                  Load Lifecycle Notice: Active in {load.pipeline_status.toUpperCase()} Stage
                </span>
                <p className="text-[11px] text-amber-200/90 leading-relaxed">
                  Invoices and settlements are typically finalized once the delivery is verified with a signed Proof of Delivery (POD). You may still preview or export this draft.
                </p>
              </div>
            </div>

            {onStatusChange && (
              <button
                type="button"
                id="btn-mark-as-invoiced-guard"
                onClick={handleMarkAsInvoiced}
                disabled={isUpdatingStatus}
                className="px-3 py-1.5 rounded-lg bg-amber-900/80 hover:bg-amber-800 text-amber-100 border border-amber-700/60 font-semibold text-xs transition-colors cursor-pointer shrink-0 self-start sm:self-auto disabled:opacity-50"
              >
                {isUpdatingStatus ? 'Updating...' : 'Mark as Invoiced'}
              </button>
            )}
          </div>
        )}

        {/* Interactive Configuration Header */}
        <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <div>
            <label className="block text-slate-400 text-[10px] uppercase font-semibold mb-1">
              {activeTab === 'broker_invoice' ? 'Invoice Number' : 'Settlement Number'}
            </label>
            <input
              type="text"
              value={activeTab === 'broker_invoice' ? invoiceNumber : settlementNumber}
              onChange={(e) =>
                activeTab === 'broker_invoice'
                  ? setInvoiceNumber(e.target.value)
                  : setSettlementNumber(e.target.value)
              }
              className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 font-mono font-bold focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-slate-400 text-[10px] uppercase font-semibold mb-1">
              Payment Terms / Due Terms
            </label>
            <select
              value={paymentTerms}
              onChange={(e) => setPaymentTerms(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 font-semibold focus:outline-none focus:border-indigo-500 cursor-pointer"
            >
              <option value="30 Days Net">30 Days Net (Standard Broker)</option>
              <option value="15 Days Net">15 Days Net</option>
              <option value="7 Days Net">7 Days Net</option>
              <option value="QuickPay 2-Day (2% Fee)">QuickPay 2-Day (2% Fee)</option>
              <option value="Same Day Factoring">Same Day Factoring</option>
              <option value="Due on Receipt">Due on Receipt</option>
            </select>
          </div>

          <div>
            <label className="block text-slate-400 text-[10px] uppercase font-semibold mb-1">
              Dispatcher Fee %
            </label>
            <div className="relative">
              <input
                type="number"
                min="0"
                max="100"
                step="0.5"
                value={dispatcherFeePercent}
                onChange={(e) => setDispatcherFeePercent(Number(e.target.value) || 0)}
                className="w-full pl-2.5 pr-7 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 font-mono font-bold focus:outline-none focus:border-indigo-500"
              />
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold">%</span>
            </div>
          </div>

          <div>
            <label className="block text-slate-400 text-[10px] uppercase font-semibold mb-1">
              Lifecycle Status
            </label>
            <div className="flex items-center gap-2 pt-0.5">
              <StatusBadge status={load.pipeline_status} type="pipeline" size="sm" />
              {isDeliveredOrInvoiced ? (
                <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-1 font-semibold">
                  <CheckCircle2 className="w-3 h-3" /> Ready
                </span>
              ) : (
                <span className="text-[10px] font-mono text-amber-400 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Draft
                </span>
              )}
            </div>
          </div>
        </div>

        {/* MAIN PREVIEW CONTENT: BROKER INVOICE vs CARRIER SETTLEMENT */}
        {activeTab === 'broker_invoice' ? (
          /* =========================================================================
             1. BROKER INVOICE PREVIEW
             ========================================================================= */
          <div className="space-y-4">
            {/* Header Parties Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Remit To (Carrier / Client) */}
              <div className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800 space-y-1.5">
                <div className="flex items-center gap-1.5 text-emerald-400 font-bold uppercase tracking-wider text-[10px] pb-1 border-b border-slate-800">
                  <Building2 className="w-3 h-3" />
                  <span>Billed By (Carrier / Remit To)</span>
                </div>
                <p className="font-bold text-slate-100 text-sm">
                  {load.client?.company_name || activeOrganization?.name || 'Carrier Fleet'}
                </p>
                <div className="text-[11px] text-slate-400 space-y-0.5 font-sans">
                  <p>Contact: {load.client?.contact_name || 'Billing Department'}</p>
                  <p>Phone: {load.client?.contact_phone || '—'} • Email: {load.client?.contact_email || '—'}</p>
                  <p className="font-mono text-[10px] text-slate-500">
                    Authority: {load.client?.client_type === 'owner_operator' ? 'Owner-Operator' : 'Fleet Carrier'}
                  </p>
                </div>
              </div>

              {/* Bill To (Broker / Customer) */}
              <div className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800 space-y-1.5">
                <div className="flex items-center gap-1.5 text-sky-400 font-bold uppercase tracking-wider text-[10px] pb-1 border-b border-slate-800">
                  <ShieldCheck className="w-3 h-3" />
                  <span>Bill To (Broker / Payer)</span>
                </div>
                <p className="font-bold text-slate-100 text-sm">
                  {load.broker?.company_name || 'Freight Brokerage Payer'}
                </p>
                <div className="text-[11px] text-slate-400 space-y-0.5 font-sans">
                  <p>
                    Rep: {load.broker?.contact_name || 'Accounts Payable'}
                    {load.broker?.mc_number && ` • MC-${load.broker.mc_number}`}
                  </p>
                  <p>Email: {load.broker?.contact_email || '—'} • Phone: {load.broker?.contact_phone || '—'}</p>
                  <p className="font-mono text-[10px] text-slate-500">Terms: {paymentTerms}</p>
                </div>
              </div>
            </div>

            {/* Freight Lane Overview Bar */}
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-mono">
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-100">{load.origin_city}, {load.origin_state}</span>
                <ArrowRight className="w-3.5 h-3.5 text-emerald-400" />
                <span className="font-bold text-slate-100">{load.dest_city}, {load.dest_state}</span>
              </div>
              <div className="flex items-center gap-3 text-slate-400 text-[11px]">
                <span>{formatMiles(totalMiles)}</span>
                <span>•</span>
                <span className="capitalize">{load.equipment_type.replace('_', ' ')}</span>
                <span>•</span>
                <span>{load.commodity || 'General Freight'}</span>
              </div>
            </div>

            {/* Line Items Table */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xs">
              <div className="px-4 py-2.5 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
                <span className="font-bold text-slate-200 uppercase tracking-wider text-[10px]">
                  Commercial Billing Breakdown
                </span>
                <span className="text-[10px] font-mono text-slate-400">
                  Approved Line Items Only
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-950/60 text-slate-400 font-bold uppercase tracking-wider text-[10px] border-b border-slate-800/80">
                    <tr>
                      <th className="px-4 py-2.5">Item Description</th>
                      <th className="px-4 py-2.5">Category</th>
                      <th className="px-4 py-2.5 text-center">Status</th>
                      <th className="px-4 py-2.5 text-right font-mono">Amount (USD)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-sans">
                    {/* Primary Linehaul */}
                    <tr className="hover:bg-slate-800/40">
                      <td className="px-4 py-3 font-semibold text-slate-100">
                        Primary Freight Linehaul ({load.origin_city}, {load.origin_state} → {load.dest_city}, {load.dest_state})
                      </td>
                      <td className="px-4 py-3 text-slate-400 capitalize">Linehaul</td>
                      <td className="px-4 py-3 text-center">
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-950 text-emerald-300 border border-emerald-800/60 font-mono">
                          Agreed Rate
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-slate-100 text-sm">
                        {formatCurrency(billingSummary.primaryLinehaulRate)}
                      </td>
                    </tr>

                    {/* Approved Accessorials */}
                    {billingSummary.billableAccessorials.map((acc) => (
                      <tr key={acc.id} className="hover:bg-slate-800/40">
                        <td className="px-4 py-3 text-slate-200">
                          <span className="font-semibold capitalize text-emerald-300">
                            {acc.type.replace('_', ' ')}:
                          </span>{' '}
                          {acc.description || 'Approved accessorial surcharge'}
                        </td>
                        <td className="px-4 py-3 text-slate-400 capitalize">Accessorial</td>
                        <td className="px-4 py-3 text-center">
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-950 text-emerald-300 border border-emerald-800/60 font-mono">
                            Approved on Rate Con
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-emerald-400">
                          +{formatCurrency(acc.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Invoice Totals Footer */}
              <div className="bg-slate-950/90 p-4 border-t border-slate-800 space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
                  <span>Base Freight Linehaul:</span>
                  <span className="text-slate-200 font-semibold">{formatCurrency(billingSummary.primaryLinehaulRate)}</span>
                </div>

                {billingSummary.approvedAccessorialsTotal > 0 && (
                  <div className="flex items-center justify-between text-xs text-emerald-400 font-mono">
                    <span>Approved Accessorials Total:</span>
                    <span className="font-semibold">+{formatCurrency(billingSummary.approvedAccessorialsTotal)}</span>
                  </div>
                )}

                <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-sm sm:text-base font-mono font-bold text-slate-100">
                  <span className="uppercase text-xs font-bold text-slate-300 tracking-wider">
                    Total Invoice Amount Due:
                  </span>
                  <span className="text-emerald-400 font-extrabold text-lg">
                    {formatCurrency(billingSummary.grossBilledTotal)}
                  </span>
                </div>
              </div>
            </div>

            {/* EXCLUDED ACCESSORIALS (PENDING / REJECTED) AUDIT SECTION */}
            {billingSummary.excludedAccessorials.length > 0 && (
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800/80 space-y-2">
                <div className="flex items-center gap-1.5 text-slate-400 font-bold uppercase tracking-wider text-[10px] pb-1 border-b border-slate-800">
                  <Info className="w-3.5 h-3.5 text-amber-400" />
                  <span>Non-Billable / Excluded Accessorial Claims ({billingSummary.excludedAccessorials.length})</span>
                </div>
                <p className="text-[11px] text-slate-400">
                  The following claims are not approved on a revised rate confirmation and are excluded from the broker invoice:
                </p>
                <div className="space-y-1.5 pt-1">
                  {billingSummary.excludedAccessorials.map((acc) => (
                    <div
                      key={acc.id}
                      className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="flex items-center gap-2">
                        {acc.status === 'rejected' ? (
                          <XCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                        ) : (
                          <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        )}
                        <div>
                          <span className="font-semibold text-slate-300 capitalize">{acc.type.replace('_', ' ')}:</span>{' '}
                          <span className="text-slate-400">{acc.description || 'Pending review'}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[10px] font-mono px-2 py-0.5 rounded font-semibold border ${
                            acc.status === 'rejected'
                              ? 'bg-rose-950 text-rose-300 border-rose-800/50'
                              : 'bg-amber-950 text-amber-300 border-amber-800/50'
                          }`}
                        >
                          {acc.status === 'rejected' ? 'Rejected by Broker' : 'Pending Broker Rate Con'}
                        </span>
                        <span className="font-mono text-slate-500 line-through">
                          {formatCurrency(acc.amount)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          /* =========================================================================
             2. CARRIER SETTLEMENT STATEMENT PREVIEW
             ========================================================================= */
          <div className="space-y-4">
            {/* Header Parties Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Carrier / Client Profile */}
              <div className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800 space-y-1.5">
                <div className="flex items-center gap-1.5 text-indigo-400 font-bold uppercase tracking-wider text-[10px] pb-1 border-b border-slate-800">
                  <Truck className="w-3 h-3" />
                  <span>Carrier & Assigned Unit</span>
                </div>
                <p className="font-bold text-slate-100 text-sm">
                  {load.client?.company_name || 'Carrier Client'}
                </p>
                <div className="text-[11px] text-slate-400 space-y-0.5 font-sans">
                  <p>
                    Unit: {load.truck ? `Truck #${load.truck.truck_number}` : 'Unassigned'} • Equip:{' '}
                    {load.equipment_type.replace('_', ' ').toUpperCase()}
                  </p>
                  <p>Assigned Driver: {load.driver?.full_name || 'Unassigned'}</p>
                </div>
              </div>

              {/* Dispatch Fee & Commission Terms */}
              <div className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800 space-y-1.5">
                <div className="flex items-center gap-1.5 text-purple-400 font-bold uppercase tracking-wider text-[10px] pb-1 border-b border-slate-800">
                  <Percent className="w-3 h-3" />
                  <span>Dispatcher Service Agreement</span>
                </div>
                <p className="font-bold text-slate-100 text-sm">
                  {activeOrganization?.name || 'DispatcherDesk Dispatch Services'}
                </p>
                <div className="text-[11px] text-slate-400 space-y-0.5 font-sans">
                  <p>
                    Service Commission Rate:{' '}
                    <strong className="text-purple-300 font-mono">{dispatcherFeePercent}% of Gross</strong>
                  </p>
                  <p>Load Reference: #{load.load_number} • Statement ID: {settlementNumber}</p>
                </div>
              </div>
            </div>

            {/* Carrier Settlement Detailed Ledger Table */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xs">
              <div className="px-4 py-2.5 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
                <span className="font-bold text-slate-200 uppercase tracking-wider text-[10px]">
                  Settlement Ledger & Deductions Breakdown
                </span>
                <span className="text-[10px] font-mono text-slate-400">
                  Trip Earnings & Net Payout
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-950/60 text-slate-400 font-bold uppercase tracking-wider text-[10px] border-b border-slate-800/80">
                    <tr>
                      <th className="px-4 py-2.5">Ledger Description</th>
                      <th className="px-4 py-2.5">Type</th>
                      <th className="px-4 py-2.5">Rate / Basis</th>
                      <th className="px-4 py-2.5 text-right font-mono">Amount (USD)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-sans">
                    {/* Primary Linehaul */}
                    <tr className="hover:bg-slate-800/40">
                      <td className="px-4 py-3 font-semibold text-slate-100">
                        Primary Freight Linehaul ({load.origin_city}, {load.origin_state} → {load.dest_city}, {load.dest_state})
                      </td>
                      <td className="px-4 py-3 text-emerald-400 font-semibold">Gross Revenue</td>
                      <td className="px-4 py-3 font-mono text-slate-400">100% Linehaul</td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-slate-100">
                        {formatCurrency(billingSummary.primaryLinehaulRate)}
                      </td>
                    </tr>

                    {/* Approved Accessorials */}
                    {billingSummary.billableAccessorials.map((acc) => (
                      <tr key={acc.id} className="hover:bg-slate-800/40">
                        <td className="px-4 py-3 text-slate-200">
                          Approved {acc.type.replace('_', ' ')}: {acc.description || 'Accessorial Earning'}
                        </td>
                        <td className="px-4 py-3 text-emerald-400 font-semibold">Gross Revenue</td>
                        <td className="px-4 py-3 font-mono text-slate-400">Broker Approved</td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-emerald-400">
                          +{formatCurrency(acc.amount)}
                        </td>
                      </tr>
                    ))}

                    {/* Total Gross Freight Revenue Row */}
                    <tr className="bg-slate-950/60 font-semibold">
                      <td className="px-4 py-2.5 text-slate-200 uppercase text-[11px] font-bold">
                        Total Gross Trip Revenue
                      </td>
                      <td className="px-4 py-2.5 text-slate-300">Subtotal</td>
                      <td className="px-4 py-2.5 text-slate-400 font-mono">—</td>
                      <td className="px-4 py-2.5 text-right font-mono font-bold text-slate-100">
                        {formatCurrency(billingSummary.grossBilledTotal)}
                      </td>
                    </tr>

                    {/* Dispatcher Fee Deduction */}
                    <tr className="hover:bg-slate-800/40">
                      <td className="px-4 py-3 text-purple-300 font-medium">
                        Dispatcher Management & Booking Fee
                      </td>
                      <td className="px-4 py-3 text-purple-400 font-semibold">Fee Deduction</td>
                      <td className="px-4 py-3 font-mono text-purple-300 font-semibold">{dispatcherFeePercent}% of Gross</td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-purple-400">
                        -{formatCurrency(billingSummary.dispatcherFeeAmount)}
                      </td>
                    </tr>

                    {/* Fuel Expense Deduction (if tracked) */}
                    {billingSummary.fuelExpense > 0 && (
                      <tr className="hover:bg-slate-800/40">
                        <td className="px-4 py-3 text-slate-300">
                          Fuel Expense / Advance
                        </td>
                        <td className="px-4 py-3 text-amber-400 font-semibold">Trip Expense</td>
                        <td className="px-4 py-3 font-mono text-slate-400">Logged Trip Cost</td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-amber-400">
                          -{formatCurrency(billingSummary.fuelExpense)}
                        </td>
                      </tr>
                    )}

                    {/* Driver Pay Allocation (if tracked) */}
                    {billingSummary.driverPay > 0 && (
                      <tr className="hover:bg-slate-800/40">
                        <td className="px-4 py-3 text-slate-300">
                          Driver Compensation Pay ({load.driver?.full_name || 'Driver'})
                        </td>
                        <td className="px-4 py-3 text-sky-400 font-semibold">Labor Expense</td>
                        <td className="px-4 py-3 font-mono text-slate-400">Driver Agreement</td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-sky-400">
                          -{formatCurrency(billingSummary.driverPay)}
                        </td>
                      </tr>
                    )}

                    {/* Other Logged Expenses */}
                    {billingSummary.otherExpenses > 0 && (
                      <tr className="hover:bg-slate-800/40">
                        <td className="px-4 py-3 text-slate-300">
                          Other Operating Expenses / Tolls
                        </td>
                        <td className="px-4 py-3 text-slate-400 font-semibold">Trip Expense</td>
                        <td className="px-4 py-3 font-mono text-slate-400">Miscellaneous</td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-slate-300">
                          -{formatCurrency(billingSummary.otherExpenses)}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Settlement Totals Footer */}
              <div className="bg-slate-950/90 p-4 border-t border-slate-800 space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
                  <span>Gross Freight Earnings:</span>
                  <span className="text-slate-200 font-semibold">{formatCurrency(billingSummary.grossBilledTotal)}</span>
                </div>

                <div className="flex items-center justify-between text-xs text-purple-400 font-mono">
                  <span>Dispatcher Fee ({dispatcherFeePercent}%):</span>
                  <span className="font-semibold">-{formatCurrency(billingSummary.dispatcherFeeAmount)}</span>
                </div>

                <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-sm sm:text-base font-mono font-bold text-slate-100">
                  <span className="uppercase text-xs font-bold text-slate-300 tracking-wider">
                    Net Carrier Settlement Due:
                  </span>
                  <span className="text-indigo-400 font-extrabold text-lg">
                    {formatCurrency(billingSummary.netCarrierSettlement)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modal Footer Controls */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-800 flex-wrap gap-3">
          <div className="text-[11px] text-slate-400 font-mono">
            {activeTab === 'broker_invoice' ? (
              <span>Ready for broker direct billing, TriumphPay, or factoring assignment.</span>
            ) : (
              <span>Net settlement calculated deterministic via single source of truth engine.</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:text-slate-100 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Preview</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
};
