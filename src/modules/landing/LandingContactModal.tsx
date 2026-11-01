import React, { useState } from 'react';
import { Modal } from '../../components/common/Modal.tsx';
import { MessageSquare, Send, CheckCircle2, Truck, Mail, Phone, Building } from 'lucide-react';

interface LandingContactModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTopic?: string;
}

export const LandingContactModal: React.FC<LandingContactModalProps> = ({
  isOpen,
  onClose,
  defaultTopic = 'General Inquiry',
}) => {
  const [name, setName] = useState('');
  const [agencyName, setAgencyName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [managedTrucks, setManagedTrucks] = useState('11-25 trucks');
  const [message, setMessage] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Simulate prompt and capture inquiry locally
    setIsSubmitted(true);
  };

  const handleReset = () => {
    setIsSubmitted(false);
    setName('');
    setAgencyName('');
    setEmail('');
    setPhone('');
    setMessage('');
    onClose();
  };

  return (
    <Modal
      id="landing-contact-modal"
      isOpen={isOpen}
      onClose={handleReset}
      title={defaultTopic === 'pricing' ? 'Request Fleet Pricing & Tier Specification' : 'Contact DispatcherDesk Operations'}
      subtitle="Connect with our freight operations team for onboarding and fleet pricing"
      maxWidth="md"
    >
      {isSubmitted ? (
        <div className="py-6 text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-emerald-950/80 border border-emerald-500/50 text-emerald-400 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-slate-100">
            Inquiry Received Successfully
          </h3>
          <p className="text-xs text-slate-300 max-w-sm mx-auto leading-relaxed">
            Thank you for contacting DispatcherDesk. An operational specialist will review your dispatch agency requirements and reach out at <span className="text-indigo-400 font-medium">{email}</span> within 1 business day.
          </p>
          <div className="pt-2">
            <button
              type="button"
              onClick={handleReset}
              className="px-5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 font-medium mb-1">Your Full Name *</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Marcus Vance"
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700/80 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1">Dispatch Agency / Company *</label>
              <input
                type="text"
                required
                value={agencyName}
                onChange={(e) => setAgencyName(e.target.value)}
                placeholder="e.g. Apex Freight Dispatchers"
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700/80 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 font-medium mb-1">Work Email *</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="dispatch@agency.com"
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700/80 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1">Phone Number</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1 (555) 000-0000"
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700/80 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1">Active Managed Trucks Range</label>
            <select
              value={managedTrucks}
              onChange={(e) => setManagedTrucks(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700/80 rounded-lg text-slate-100 focus:outline-none focus:border-indigo-500"
            >
              <option value="1-10 trucks">1 - 10 Active Trucks (Starter Fleet)</option>
              <option value="11-25 trucks">11 - 25 Active Trucks (Growth Agency)</option>
              <option value="26-50 trucks">26 - 50 Active Trucks (Agency Fleet)</option>
              <option value="50+ trucks">50+ Active Trucks (Enterprise / Custom Capacity)</option>
            </select>
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1">Operational Requirements / Notes</label>
            <textarea
              rows={3}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Tell us about your carrier clients, number of dispatchers, and workflows..."
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700/80 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <span className="text-[11px] text-slate-400 text-center sm:text-left">
              Operated by LinkAura Corporation
            </span>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 sm:flex-initial px-3.5 py-2.5 sm:py-2 rounded-lg text-slate-400 hover:text-white bg-slate-800 transition-colors min-h-[40px] sm:min-h-0 text-xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 sm:flex-initial px-4 py-2.5 sm:py-2 rounded-lg text-white font-semibold bg-indigo-600 hover:bg-indigo-500 flex items-center justify-center gap-1.5 shadow-sm shadow-indigo-600/30 transition-all cursor-pointer min-h-[40px] sm:min-h-0 text-xs"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Submit Request</span>
              </button>
            </div>
          </div>
        </form>
      )}
    </Modal>
  );
};
