import { LoadWithRelations } from '../loads/loadTypes.ts';
import { AccessorialClaim } from '../accessorials/accessorialTypes.ts';
import { Organization } from '../../types/domain.types.ts';

export type BillingDocumentType = 'broker_invoice' | 'carrier_settlement';

export interface BillingLineItem {
  id: string;
  category: 'linehaul' | 'accessorial' | 'fee' | 'deduction' | 'fuel' | 'driver_pay';
  description: string;
  quantity?: number;
  rate?: number;
  amount: number;
  isBillable: boolean;
  isApproved?: boolean;
  statusNote?: string;
}

export interface LoadBillingSettlementSummary {
  loadId: string;
  loadNumber: string;
  primaryLinehaulRate: number;
  approvedAccessorialsTotal: number;
  pendingAccessorialsTotal: number;
  rejectedAccessorialsTotal: number;
  grossBilledTotal: number; // Primary Rate + Approved Accessorials
  dispatcherFeePercent: number;
  dispatcherFeeAmount: number;
  fuelExpense: number;
  driverPay: number;
  otherExpenses: number;
  totalDeductions: number; // dispatcherFee + fuel + driverPay + otherExpenses
  netCarrierSettlement: number; // grossBilledTotal - dispatcherFeeAmount - (other deductions if applicable)
  isDeliveredOrCompleted: boolean;
  billableAccessorials: AccessorialClaim[];
  excludedAccessorials: AccessorialClaim[];
  lineItems: BillingLineItem[];
}

export interface InvoiceSettlementModalProps {
  isOpen: boolean;
  onClose: () => void;
  load: LoadWithRelations | null;
  initialType?: BillingDocumentType;
  onStatusChange?: (loadId: string, newStatus: any) => Promise<void>;
}
