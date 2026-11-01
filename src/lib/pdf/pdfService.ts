import {
  generateRateConfirmationPdf,
  RateConfirmationPdfOptions,
} from './rateConfirmationPdf.ts';
import {
  generateCarrierInvoicePdf,
  CarrierInvoicePdfOptions,
} from './carrierInvoicePdf.ts';
import {
  generateDriverSettlementPdf,
  DriverSettlementPdfOptions,
} from './driverSettlementPdf.ts';
import {
  generateShiftHandoverPdf,
  ShiftHandoverPdfOptions,
} from './shiftHandoverPdf.ts';

export class PdfService {
  /**
   * Generates and downloads a professional Rate Confirmation PDF
   */
  async downloadRateConfirmation(options: RateConfirmationPdfOptions): Promise<void> {
    try {
      const doc = generateRateConfirmationPdf(options);
      const safeLoadNum = (options.load.load_number || 'UNKNOWN').replace(/[^a-zA-Z0-9-_]/g, '_');
      doc.save(`RateConfirmation_${safeLoadNum}.pdf`);
    } catch (err) {
      console.error('[PdfService] Error generating Rate Confirmation PDF:', err);
      throw new Error(`Failed to generate Rate Confirmation PDF: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  /**
   * Generates and downloads a professional Carrier Invoice PDF
   */
  async downloadCarrierInvoice(options: CarrierInvoicePdfOptions): Promise<void> {
    try {
      const doc = generateCarrierInvoicePdf(options);
      const invoiceNumber = options.invoiceNumber || `INV-${options.load.load_number}`;
      const safeInvNum = invoiceNumber.replace(/[^a-zA-Z0-9-_]/g, '_');
      doc.save(`CarrierInvoice_${safeInvNum}.pdf`);
    } catch (err) {
      console.error('[PdfService] Error generating Carrier Invoice PDF:', err);
      throw new Error(`Failed to generate Carrier Invoice PDF: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  /**
   * Generates and downloads a professional Driver Settlement PDF
   */
  async downloadDriverSettlement(options: DriverSettlementPdfOptions): Promise<void> {
    try {
      const doc = generateDriverSettlementPdf(options);
      const settlementNumber = options.settlementNumber || `SET-${options.load.load_number}`;
      const safeSetNum = settlementNumber.replace(/[^a-zA-Z0-9-_]/g, '_');
      doc.save(`DriverSettlement_${safeSetNum}.pdf`);
    } catch (err) {
      console.error('[PdfService] Error generating Driver Settlement PDF:', err);
      throw new Error(`Failed to generate Driver Settlement PDF: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  /**
   * Generates and downloads an Operational Shift Handover PDF Report
   */
  async downloadShiftHandover(options: ShiftHandoverPdfOptions): Promise<void> {
    try {
      const doc = generateShiftHandoverPdf(options);
      const safeDate = new Date().toISOString().split('T')[0];
      doc.save(`ShiftHandover_Report_${safeDate}.pdf`);
    } catch (err) {
      console.error('[PdfService] Error generating Shift Handover PDF:', err);
      throw new Error(`Failed to generate Shift Handover PDF: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }
}

export const pdfService = new PdfService();
