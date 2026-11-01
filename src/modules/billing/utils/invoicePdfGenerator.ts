import { LoadWithRelations } from '../../loads/loadTypes.ts';
import { AccessorialClaim } from '../../accessorials/accessorialTypes.ts';
import { Organization } from '../../../types/domain.types.ts';
import { pdfService } from '../../../lib/pdf/pdfService.ts';
import { generateCarrierInvoicePdf, CarrierInvoicePdfOptions } from '../../../lib/pdf/carrierInvoicePdf.ts';
import { generateDriverSettlementPdf, DriverSettlementPdfOptions } from '../../../lib/pdf/driverSettlementPdf.ts';

export interface GenerateInvoicePdfParams {
  load: LoadWithRelations;
  accessorials?: AccessorialClaim[];
  organization?: Organization | null;
  invoiceNumber?: string;
  invoiceDate?: string;
  dueDate?: string;
  paymentTerms?: string;
  operationalTimezone?: string;
  dispatcherTimezone?: string;
}

export interface GenerateSettlementPdfParams {
  load: LoadWithRelations;
  accessorials?: AccessorialClaim[];
  organization?: Organization | null;
  settlementNumber?: string;
  dispatcherFeePercent?: number;
  operationalTimezone?: string;
  dispatcherTimezone?: string;
}

export const invoicePdfGenerator = {
  /**
   * Generates and downloads the official Carrier Freight Invoice PDF for brokers / factoring
   */
  async downloadBrokerInvoicePdf(params: GenerateInvoicePdfParams): Promise<void> {
    const options: CarrierInvoicePdfOptions = {
      load: params.load,
      accessorials: params.accessorials || [],
      organization: params.organization,
      invoiceNumber: params.invoiceNumber || `INV-${params.load.load_number}`,
      invoiceDate: params.invoiceDate || new Date().toISOString(),
      dueDate: params.dueDate,
      paymentTerms: params.paymentTerms,
      operationalTimezone: params.operationalTimezone || 'America/Chicago',
      dispatcherTimezone: params.dispatcherTimezone || 'Asia/Kolkata',
    };

    await pdfService.downloadCarrierInvoice(options);
  },

  /**
   * Generates and downloads the official Carrier / Driver Settlement Statement PDF
   */
  async downloadCarrierSettlementPdf(params: GenerateSettlementPdfParams): Promise<void> {
    const options: DriverSettlementPdfOptions = {
      load: params.load,
      driver: params.load.driver,
      accessorials: params.accessorials || [],
      organization: params.organization,
      settlementNumber: params.settlementNumber || `SET-${params.load.load_number}`,
      operationalTimezone: params.operationalTimezone || 'America/Chicago',
      dispatcherTimezone: params.dispatcherTimezone || 'Asia/Kolkata',
    };

    await pdfService.downloadDriverSettlement(options);
  },
};
