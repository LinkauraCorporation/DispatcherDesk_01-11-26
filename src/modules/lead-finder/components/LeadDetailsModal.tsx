import React, { useState } from 'react';
import { X, Copy, Check, Building2, Phone, Mail, MapPin, Truck, ShieldCheck, User } from 'lucide-react';
import { FmcsaLead } from '../types/fmcsa';

interface LeadDetailsModalProps {
  lead: FmcsaLead | null;
  onClose: () => void;
}

export const LeadDetailsModal: React.FC<LeadDetailsModalProps> = ({ lead, onClose }) => {
  const [copiedField, setCopiedField] = useState<string | null>(null);

  if (!lead) return null;

  const copyToClipboard = (text: string, fieldName: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 1800);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl flex flex-col">
        {/* Header */}
        <div className="p-5 border-b border-neutral-800 flex items-start justify-between gap-4 sticky top-0 bg-neutral-900 z-10">
          <div>
            <div className="flex items-center gap-2 text-xs text-emerald-400 font-medium">
              <ShieldCheck className="w-4 h-4" />
              <span>FMCSA Verified Prospect Record</span>
            </div>
            <h3 className="text-lg font-bold text-white mt-1">
              {lead.company}
            </h3>
            {lead.dba && (
              <p className="text-xs text-neutral-400 mt-0.5">
                DBA: <span className="text-neutral-200">{lead.dba}</span>
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6">
          {/* Quick Contact & Identifiers Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* DOT */}
            <div className="p-3 bg-neutral-950/80 border border-neutral-800 rounded-lg flex flex-col justify-between">
              <span className="text-[11px] text-neutral-400">USDOT Number</span>
              <div className="flex items-center justify-between mt-1">
                <span className="text-sm font-bold font-mono text-white">{lead.dot || 'N/A'}</span>
                {lead.dot && (
                  <button
                    type="button"
                    onClick={() => copyToClipboard(lead.dot, 'dot')}
                    className="text-neutral-500 hover:text-neutral-300"
                    title="Copy USDOT"
                  >
                    {copiedField === 'dot' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                )}
              </div>
            </div>

            {/* MC */}
            <div className="p-3 bg-neutral-950/80 border border-neutral-800 rounded-lg flex flex-col justify-between">
              <span className="text-[11px] text-neutral-400">MC / Docket</span>
              <div className="flex items-center justify-between mt-1">
                <span className="text-sm font-bold font-mono text-white">{lead.mc || 'None'}</span>
                {lead.mc && (
                  <button
                    type="button"
                    onClick={() => copyToClipboard(lead.mc, 'mc')}
                    className="text-neutral-500 hover:text-neutral-300"
                    title="Copy MC"
                  >
                    {copiedField === 'mc' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                )}
              </div>
            </div>

            {/* Fleet Trucks */}
            <div className="p-3 bg-neutral-950/80 border border-neutral-800 rounded-lg flex flex-col justify-between">
              <span className="text-[11px] text-neutral-400">Truck Units</span>
              <div className="text-sm font-bold font-mono text-emerald-400 mt-1">
                {lead.trucks} <span className="text-xs text-neutral-400 font-sans font-normal">units</span>
              </div>
            </div>

            {/* Power Units */}
            <div className="p-3 bg-neutral-950/80 border border-neutral-800 rounded-lg flex flex-col justify-between">
              <span className="text-[11px] text-neutral-400">Power Units</span>
              <div className="text-sm font-bold font-mono text-white mt-1">
                {lead.powerUnits}
              </div>
            </div>
          </div>

          {/* Contact Details */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">
              Direct Contact Channels
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-3 bg-neutral-950 border border-neutral-800 rounded-lg flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded bg-neutral-800 flex items-center justify-center text-neutral-300">
                    <Phone className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-[11px] text-neutral-400 block">Phone</span>
                    <span className="text-xs font-mono font-medium text-white">{lead.phone || 'Unlisted'}</span>
                  </div>
                </div>
                {lead.phone && (
                  <button
                    type="button"
                    onClick={() => copyToClipboard(lead.phone, 'phone')}
                    className="p-1.5 text-neutral-400 hover:text-white rounded hover:bg-neutral-800"
                    title="Copy Phone"
                  >
                    {copiedField === 'phone' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                )}
              </div>

              <div className="p-3 bg-neutral-950 border border-neutral-800 rounded-lg flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded bg-neutral-800 flex items-center justify-center text-neutral-300">
                    <Mail className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-[11px] text-neutral-400 block">Email Address</span>
                    <span className="text-xs font-mono font-medium text-white truncate block max-w-[180px]">
                      {lead.email || 'Unlisted'}
                    </span>
                  </div>
                </div>
                {lead.email && (
                  <button
                    type="button"
                    onClick={() => copyToClipboard(lead.email, 'email')}
                    className="p-1.5 text-neutral-400 hover:text-white rounded hover:bg-neutral-800"
                    title="Copy Email"
                  >
                    {copiedField === 'email' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Physical Location & Officer */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">
              Location & Management
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-3 bg-neutral-950 border border-neutral-800 rounded-lg flex items-start gap-3">
                <div className="w-8 h-8 rounded bg-neutral-800 flex items-center justify-center text-neutral-300 shrink-0">
                  <MapPin className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[11px] text-neutral-400 block">Physical Location</span>
                  <span className="text-xs text-white font-medium">
                    {lead.city ? `${lead.city}, ` : ''}{lead.state} {lead.zip}
                  </span>
                </div>
              </div>

              <div className="p-3 bg-neutral-950 border border-neutral-800 rounded-lg flex items-start gap-3">
                <div className="w-8 h-8 rounded bg-neutral-800 flex items-center justify-center text-neutral-300 shrink-0">
                  <User className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[11px] text-neutral-400 block">Company Officer 1</span>
                  <span className="text-xs text-white font-medium">
                    {lead.officer || 'Unlisted Officer'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Authority & Operation Breakdown */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">
              FMCSA Regulatory Data
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
              <div className="p-2.5 bg-neutral-950 border border-neutral-800 rounded-lg">
                <span className="text-[11px] text-neutral-400 block truncate" title={`Record Date (${lead.recordDateType || 'ADD_DATE'})`}>
                  Record Date ({lead.recordDateType || 'ADD_DATE'})
                </span>
                <span className="font-mono font-semibold text-white mt-0.5 block">
                  {lead.recordDate || 'Unlisted'}
                </span>
              </div>

              <div className="p-2.5 bg-neutral-950 border border-neutral-800 rounded-lg">
                <span className="text-[11px] text-neutral-400 block">Carrier Operation</span>
                <span className="font-mono font-semibold text-emerald-400 mt-0.5 block">
                  {lead.carrierOperation || 'N/A'} (Raw)
                </span>
              </div>

              <div className="p-2.5 bg-neutral-950 border border-neutral-800 rounded-lg">
                <span className="text-[11px] text-neutral-400 block">Authority Status</span>
                <span className="font-medium text-white mt-0.5 block">
                  {lead.authorityStatus || 'Active'}
                </span>
              </div>

              <div className="p-2.5 bg-neutral-950 border border-neutral-800 rounded-lg">
                <span className="text-[11px] text-neutral-400 block">Interstate &gt; 100 Mi</span>
                <span className="font-mono text-neutral-200 mt-0.5 block">
                  {lead.interstateBeyond100 || 'N'}
                </span>
              </div>

              <div className="p-2.5 bg-neutral-950 border border-neutral-800 rounded-lg">
                <span className="text-[11px] text-neutral-400 block">Interstate &lt; 100 Mi</span>
                <span className="font-mono text-neutral-200 mt-0.5 block">
                  {lead.interstateWithin100 || 'N'}
                </span>
              </div>
            </div>
            <p className="text-[11px] text-neutral-500 mt-1.5">
              Source Notice: In FMCSA Census records, this represents the USDOT census registration date (ADD_DATE). MC operating authority grant dates are maintained in FMCSA L&amp;I.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-neutral-800 bg-neutral-950/70 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-white bg-neutral-800 hover:bg-neutral-700 rounded-lg transition-colors"
          >
            Close Details
          </button>
        </div>
      </div>
    </div>
  );
};
