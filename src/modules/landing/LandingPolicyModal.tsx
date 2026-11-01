import React from 'react';
import { Modal } from '../../components/common/Modal.tsx';
import { ShieldCheck, FileText, Info } from 'lucide-react';

export type PolicyType = 'terms' | 'privacy' | 'refund' | 'delivery' | 'about';

interface LandingPolicyModalProps {
  policyType: PolicyType | null;
  onClose: () => void;
}

export const LandingPolicyModal: React.FC<LandingPolicyModalProps> = ({ policyType, onClose }) => {
  if (!policyType) return null;

  const getPolicyDetails = () => {
    switch (policyType) {
      case 'terms':
        return {
          title: 'Terms & Conditions',
          subtitle: 'LinkAura Corporation',
          content: (
            <div className="space-y-4 text-xs text-slate-300 leading-relaxed">
              <p className="font-semibold text-slate-200">
                1. Acceptance of Terms
              </p>
              <p>
                By accessing or using DispatcherDesk, a software-as-a-service platform owned and operated by LinkAura Corporation, you agree to be bound by these Terms and Conditions. DispatcherDesk provides cloud-based operational and dispatch management software for trucking dispatch companies, agencies, and multi-dispatcher teams.
              </p>
              <p className="font-semibold text-slate-200">
                2. Subscription & Service Usage
              </p>
              <p>
                Subscriptions are provisioned on an active managed truck basis. You agree to maintain accurate records of carrier clients and authorized dispatchers operating within your organization workspace.
              </p>
              <p className="font-semibold text-slate-200">
                3. Operational Liability & Data Ownership
              </p>
              <p>
                You retain full ownership of all carrier client records, driver documents, rate confirmations, and billing data uploaded to your DispatcherDesk workspace. DispatcherDesk provides operational tooling and does not act as a licensed freight broker or motor carrier.
              </p>
            </div>
          ),
        };
      case 'privacy':
        return {
          title: 'Privacy Policy',
          subtitle: 'LinkAura Corporation',
          content: (
            <div className="space-y-4 text-xs text-slate-300 leading-relaxed">
              <p className="font-semibold text-slate-200">
                1. Information We Collect
              </p>
              <p>
                LinkAura Corporation collects business contact information, user account credentials, organization workspace identifiers, and operational telemetry required to deliver and maintain DispatcherDesk services.
              </p>
              <p className="font-semibold text-slate-200">
                2. Data Segregation & Protection
              </p>
              <p>
                Carrier client records, rate confirmations, driver CDL credentials, and fleet documents uploaded by your dispatch operation are strictly segregated per multi-tenant workspace. We employ encryption in transit and rest.
              </p>
              <p className="font-semibold text-slate-200">
                3. No Third-Party Resale
              </p>
              <p>
                We do not sell, rent, or monetize your operational freight data, broker rate terms, or client rosters to third-party data brokers or freight market aggregators.
              </p>
            </div>
          ),
        };
      case 'refund':
        return {
          title: 'Cancellation & Refund Policy',
          subtitle: 'LinkAura Corporation',
          content: (
            <div className="space-y-4 text-xs text-slate-300 leading-relaxed">
              <p className="font-semibold text-slate-200">
                1. Subscription Cancellation
              </p>
              <p>
                You may cancel your DispatcherDesk subscription at any time through your workspace account settings or by contacting billing support. Upon cancellation, your access remains active through the conclusion of your paid billing cycle.
              </p>
              <p className="font-semibold text-slate-200">
                2. Refund Eligibility
              </p>
              <p>
                Because DispatcherDesk provides digital cloud-based SaaS access with immediate infrastructure allocation, recurring monthly charges are non-refundable once the billing period has commenced, except as required by applicable jurisdiction or service-level agreements.
              </p>
              <p className="font-semibold text-slate-200">
                3. Dispute Resolution
              </p>
              <p>
                For billing inquiries, fleet tier adjustments, or account adjustments, please contact LinkAura Corporation billing support directly.
              </p>
            </div>
          ),
        };
      case 'delivery':
        return {
          title: 'Digital Services Delivery & Fulfillment Policy',
          subtitle: 'LinkAura Corporation',
          content: (
            <div className="space-y-4 text-xs text-slate-300 leading-relaxed">
              <p className="font-semibold text-slate-200">
                1. Electronic Service Delivery
              </p>
              <p>
                DispatcherDesk is delivered entirely as an electronic cloud-hosted software-as-a-service (SaaS) web application. No physical goods, boxed media, or hardware are shipped.
              </p>
              <p className="font-semibold text-slate-200">
                2. Immediate Account Provisioning
              </p>
              <p>
                Upon account creation and workspace establishment, access credentials and multi-tenant organizational workspaces are provisioned electronically and made accessible immediately via standard web browsers.
              </p>
              <p className="font-semibold text-slate-200">
                3. Shipping & Physical Delivery Notice
              </p>
              <p>
                As this platform is 100% digital software, traditional postal shipping times, freight delivery, and customs handling are not applicable.
              </p>
            </div>
          ),
        };
      case 'about':
      default:
        return {
          title: 'About DispatcherDesk',
          subtitle: 'A Product of LinkAura Corporation',
          content: (
            <div className="space-y-4 text-xs text-slate-300 leading-relaxed">
              <p>
                DispatcherDesk is the purpose-built operating system engineered specifically for trucking dispatch companies, independent dispatch agencies, and multi-dispatcher teams.
              </p>
              <p>
                Freight dispatching requires coordinating dozens of moving variables: carrier authorities, equipment types, CDL drivers, broker rate confirmations, dock appointment windows, detention tracking, and billing settlements. DispatcherDesk unifies these critical operations into one central workspace.
              </p>
              <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                <div className="flex items-center gap-2 text-indigo-400 font-semibold mb-1">
                  <Info className="w-4 h-4" />
                  <span>Legal Business Entity</span>
                </div>
                <p className="text-slate-300">
                  LinkAura Corporation<br />
                  Product: DispatcherDesk Cloud SaaS
                </p>
              </div>
            </div>
          ),
        };
    }
  };

  const details = getPolicyDetails();

  return (
    <Modal
      id="landing-policy-modal"
      isOpen={!!policyType}
      onClose={onClose}
      title={details.title}
      subtitle={details.subtitle}
      maxWidth="lg"
    >
      <div className="space-y-4">
        {details.content}

        <div className="pt-4 border-t border-slate-800 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-4 py-2 text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors cursor-pointer min-h-[40px] sm:min-h-0 flex items-center justify-center"
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
};
