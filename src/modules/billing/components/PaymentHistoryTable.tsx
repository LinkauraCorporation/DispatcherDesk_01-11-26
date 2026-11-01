import React from 'react';
import { CreditCard, CheckCircle2, AlertCircle, Clock, ExternalLink, RefreshCcw } from 'lucide-react';
import { BillingPaymentTransaction } from '../../../types/domain.types.ts';

interface PaymentHistoryTableProps {
  transactions: BillingPaymentTransaction[];
  isLoading?: boolean;
  onRefresh?: () => void;
}

export const PaymentHistoryTable: React.FC<PaymentHistoryTableProps> = ({
  transactions,
  isLoading = false,
  onRefresh,
}) => {
  const formatCurrency = (amountCents: number, currency: string = 'USD') => {
    const dollars = amountCents / 100;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(dollars);
  };

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateString;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'captured':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/20">
            <CheckCircle2 className="w-3 h-3" /> Paid
          </span>
        );
      case 'authorized':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/15 text-blue-300 border border-blue-500/20">
            <Clock className="w-3 h-3" /> Authorized
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/15 text-rose-300 border border-rose-500/20">
            <AlertCircle className="w-3 h-3" /> Failed
          </span>
        );
      case 'refunded':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-500/15 text-purple-300 border border-purple-500/20">
            <RefreshCcw className="w-3 h-3" /> Refunded
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-700 text-slate-300">
            {status}
          </span>
        );
    }
  };

  return (
    <div
      id="billing-payment-history-card"
      className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl"
    >
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-indigo-400" /> Payment & Transaction History
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            Authoritative records of recurring subscription charges and provider payment references.
          </p>
        </div>
        {onRefresh && (
          <button
            id="btn-refresh-transactions"
            onClick={onRefresh}
            disabled={isLoading}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
            title="Refresh transactions"
          >
            <RefreshCcw className={`w-4 h-4 ${isLoading ? 'animate-spin text-indigo-400' : ''}`} />
          </button>
        )}
      </div>

      {transactions.length === 0 ? (
        <div className="text-center py-10 px-4 bg-slate-950/40 rounded-xl border border-dashed border-slate-800">
          <CreditCard className="w-8 h-8 text-slate-600 mx-auto mb-2" />
          <p className="text-sm font-semibold text-slate-300">No payment transactions recorded yet</p>
          <p className="text-xs text-slate-500 mt-1">
            Completed subscription charges and payment attempts will automatically appear here.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-800">
              <tr>
                <th className="py-3 px-3">Date</th>
                <th className="py-3 px-3">Payment ID / Ref</th>
                <th className="py-3 px-3">Amount</th>
                <th className="py-3 px-3">Status</th>
                <th className="py-3 px-3">Billing Period</th>
                <th className="py-3 px-3 text-right">Receipt / Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {transactions.map((tx) => (
                <tr key={tx.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="py-3.5 px-3 text-slate-300 whitespace-nowrap font-medium">
                    {formatDate(tx.created_at)}
                  </td>
                  <td className="py-3.5 px-3 text-slate-300 font-mono text-[11px] whitespace-nowrap">
                    <div>{tx.provider_payment_id || tx.id.substring(0, 16)}</div>
                    {tx.provider_order_id && (
                      <div className="text-[10px] text-slate-500">Order: {tx.provider_order_id}</div>
                    )}
                  </td>
                  <td className="py-3.5 px-3 font-semibold text-white whitespace-nowrap">
                    {formatCurrency(tx.amount_cents, tx.currency)}
                  </td>
                  <td className="py-3.5 px-3 whitespace-nowrap">
                    {getStatusBadge(tx.status)}
                    {tx.error_description && (
                      <div className="text-[10px] text-rose-400 mt-0.5 max-w-xs truncate" title={tx.error_description}>
                        {tx.error_description}
                      </div>
                    )}
                  </td>
                  <td className="py-3.5 px-3 text-slate-400 whitespace-nowrap">
                    {tx.billing_period_start && tx.billing_period_end ? (
                      <span>
                        {new Date(tx.billing_period_start).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })} – {new Date(tx.billing_period_end).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' })}
                      </span>
                    ) : (
                      <span className="text-slate-600">Standard cycle</span>
                    )}
                  </td>
                  <td className="py-3.5 px-3 text-right whitespace-nowrap">
                    {tx.provider_invoice_id ? (
                      <span className="font-mono text-[11px] text-slate-300">
                        {tx.provider_invoice_id}
                      </span>
                    ) : tx.provider_payment_id ? (
                      <span className="text-[11px] text-slate-400 font-mono">
                        {tx.provider.toUpperCase()} #{tx.provider_payment_id.slice(-6)}
                      </span>
                    ) : (
                      <span className="text-slate-500 text-[11px]">No receipt</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
