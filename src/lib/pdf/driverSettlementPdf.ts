import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { LoadWithRelations } from '../../modules/loads/loadTypes.ts';
import { AccessorialClaim } from '../../modules/accessorials/accessorialTypes.ts';
import { Organization, Driver } from '../../types/domain.types.ts';
import {
  createStandardPdf,
  drawDocumentHeader,
  addDocumentFooters,
  drawCardBox,
  truncateText,
  PDF_COLORS,
  PDF_PAGE,
  PDF_CARD,
  formatCurrency,
  formatMiles,
  formatInTimezone,
} from './pdfTheme.ts';
import { estimateDriverPay } from '../calculations.ts';

export interface DriverSettlementPdfOptions {
  load: LoadWithRelations;
  driver?: Driver | LoadWithRelations['driver'] | null;
  accessorials?: AccessorialClaim[];
  organization?: Organization | null;
  settlementNumber?: string;
  periodStart?: string;
  periodEnd?: string;
  operationalTimezone?: string;
  dispatcherTimezone?: string;
}

export function generateDriverSettlementPdf(options: DriverSettlementPdfOptions): jsPDF {
  const {
    load,
    driver = load.driver,
    accessorials = [],
    organization,
    settlementNumber = `SET-${load.load_number}`,
    operationalTimezone = 'America/Chicago',
    dispatcherTimezone = 'Asia/Kolkata',
  } = options;

  const doc = createStandardPdf();

  const orgName = organization?.name || load.client?.company_name || 'DispatcherDesk Fleet Operations';
  const mcDot = [
    organization?.mc_number ? `MC-${organization.mc_number}` : null,
    organization?.dot_number ? `DOT-${organization.dot_number}` : null,
  ].filter(Boolean).join(' | ');

  // 1. Render Header (Cursor system initialization)
  let cursorY = drawDocumentHeader(doc, {
    docTypeTitle: 'Driver Settlement',
    docSubtitle: 'Driver Compensation & Trip Earnings Statement',
    docNumber: settlementNumber,
    organizationName: orgName,
    mcDot: mcDot || undefined,
    operationalTimezone,
    dispatcherTimezone,
  });

  // 2. Driver & Employer Information (Two side-by-side cards)
  const cardWidth = (PDF_PAGE.contentWidth - 14) / 2; // 263pt
  const cardHeight = 96;
  const innerTextWidth = cardWidth - 16; // 247pt

  // Left Card: Driver Profile
  let leftCy = drawCardBox(doc, PDF_PAGE.marginLeft, cursorY, cardWidth, cardHeight, 'Driver Profile & Pay Agreement', PDF_COLORS.indigo);
  
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...PDF_COLORS.primaryDark);
  const driverName = truncateText(doc, driver?.full_name || 'Assigned Driver', innerTextWidth);
  doc.text(driverName, PDF_PAGE.marginLeft + PDF_CARD.contentPaddingX, leftCy);

  leftCy += PDF_CARD.lineSpacingComfortable;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...PDF_COLORS.slate600);
  const contactText = `Phone: ${driver?.phone || '—'}  |  Email: ${driver?.email || '—'}`;
  doc.text(truncateText(doc, contactText, innerTextWidth), PDF_PAGE.marginLeft + PDF_CARD.contentPaddingX, leftCy);

  leftCy += PDF_CARD.lineSpacingStandard;
  doc.text(`Driver Status: ${(driver?.status || 'available').toUpperCase()}`, PDF_PAGE.marginLeft + PDF_CARD.contentPaddingX, leftCy);

  leftCy += PDF_CARD.lineSpacingStandard;
  // Pay Structure formatting
  const payType = driver?.pay_type || 'percentage_gross';
  const payRate = driver?.pay_rate || 25;
  let payRateLabel = `${payRate}% of Gross Revenue`;
  if (payType === 'per_mile') payRateLabel = `$${payRate.toFixed(2)} per Mile (Loaded + DH)`;
  if (payType === 'flat_rate') payRateLabel = `${formatCurrency(payRate)} Flat per Load`;

  const compText = `Compensation: ${payRateLabel}`;
  doc.text(truncateText(doc, compText, innerTextWidth), PDF_PAGE.marginLeft + PDF_CARD.contentPaddingX, leftCy);

  leftCy += PDF_CARD.lineSpacingStandard;
  const unitText = `Assigned Unit: Trk #${load.truck?.truck_number || 'Unit'} (${load.equipment_type.replace('_', ' ').toUpperCase()})`;
  doc.text(truncateText(doc, unitText, innerTextWidth), PDF_PAGE.marginLeft + PDF_CARD.contentPaddingX, leftCy);

  // Right Card: Employer / Carrier Fleet
  const rightX = PDF_PAGE.marginLeft + cardWidth + 14;
  let rightCy = drawCardBox(doc, rightX, cursorY, cardWidth, cardHeight, 'Carrier Fleet / Employer', PDF_COLORS.slate800);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...PDF_COLORS.primaryDark);
  const employerName = truncateText(doc, load.client?.company_name || orgName, innerTextWidth);
  doc.text(employerName, rightX + PDF_CARD.contentPaddingX, rightCy);

  rightCy += PDF_CARD.lineSpacingComfortable;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...PDF_COLORS.slate600);
  const dispatchContact = `Dispatch Contact: ${load.client?.contact_name || 'Fleet Manager'}`;
  doc.text(truncateText(doc, dispatchContact, innerTextWidth), rightX + PDF_CARD.contentPaddingX, rightCy);

  rightCy += PDF_CARD.lineSpacingStandard;
  const employerContact = `Phone: ${load.client?.contact_phone || '—'}  |  Email: ${load.client?.contact_email || '—'}`;
  doc.text(truncateText(doc, employerContact, innerTextWidth), rightX + PDF_CARD.contentPaddingX, rightCy);

  rightCy += PDF_CARD.lineSpacingStandard;
  doc.text(`Settlement Date: ${formatInTimezone(new Date().toISOString(), operationalTimezone, { includeTime: false })}`, rightX + PDF_CARD.contentPaddingX, rightCy);

  rightCy += PDF_CARD.lineSpacingStandard;
  const refText = `Settlement Ref: ${settlementNumber}`;
  doc.text(truncateText(doc, refText, innerTextWidth), rightX + PDF_CARD.contentPaddingX, rightCy);

  // Advance cursor past cards with clean margin
  cursorY += cardHeight + 12;

  // 3. Dispatched Trip Summary Table
  const loadedMiles = load.loaded_miles || 0;
  const deadheadMiles = load.deadhead_miles || 0;
  const totalMiles = loadedMiles + deadheadMiles;
  const grossRate = Number(load.rate || 0);

  const tripData = [
    [
      load.load_number,
      `${load.origin_city}, ${load.origin_state} -> ${load.dest_city}, ${load.dest_state}`,
      `${formatMiles(loadedMiles)} loaded + ${formatMiles(deadheadMiles)} DH (${formatMiles(totalMiles)} total)`,
      formatInTimezone(load.delivery_datetime, operationalTimezone, { includeTime: false }),
      formatCurrency(grossRate),
    ],
  ];

  autoTable(doc, {
    startY: cursorY,
    head: [['Load #', 'Trip Lane (Origin -> Destination)', 'Mileage Breakdown', 'Delivery Date', 'Gross Freight']],
    body: tripData,
    theme: 'grid',
    styles: {
      overflow: 'linebreak',
      font: 'helvetica',
      lineColor: PDF_COLORS.slate200,
      lineWidth: 0.5,
      cellPadding: { top: 5, right: 4, bottom: 5, left: 4 },
      valign: 'middle',
    },
    headStyles: {
      fillColor: PDF_COLORS.slate800,
      textColor: 255,
      fontStyle: 'bold',
      fontSize: 7.5,
      cellPadding: { top: 5, right: 4, bottom: 5, left: 4 },
      valign: 'middle',
    },
    bodyStyles: {
      fontSize: 7.5,
      textColor: PDF_COLORS.primaryDark,
      cellPadding: { top: 5, right: 4, bottom: 5, left: 4 },
      valign: 'middle',
    },
    columnStyles: {
      0: { cellWidth: 70, fontStyle: 'bold' },
      1: { cellWidth: 170 },
      2: { cellWidth: 135 },
      3: { cellWidth: 80 },
      4: { cellWidth: 85, halign: 'right', fontStyle: 'bold' },
    },
    alternateRowStyles: {
      fillColor: PDF_COLORS.slate50,
    },
    margin: { left: PDF_PAGE.marginLeft, right: PDF_PAGE.marginLeft },
  });

  cursorY = (doc as any).lastAutoTable.finalY + 12;

  // 4. Detailed Driver Earnings Breakdown
  // Calculate base compensation: use load.driver_pay if set, otherwise estimateDriverPay
  let calculatedBaseDriverPay = load.driver_pay;
  if (!calculatedBaseDriverPay || calculatedBaseDriverPay <= 0) {
    calculatedBaseDriverPay = estimateDriverPay(payType, payRate, grossRate, loadedMiles, deadheadMiles);
  }

  // Calculate driver accessorial reimbursements (e.g. lumper paid by driver, scale tickets)
  const driverReimbursements = accessorials.filter(
    (a) => a.load_id === load.id && (a.payment_method === 'driver_cash' || a.type === 'lumper' || a.type === 'scale_tickets')
  );
  const totalReimbursements = driverReimbursements.reduce((sum, a) => sum + (Number(a.amount) || 0), 0);

  // Deductions (if any)
  const fuelExpenseDeduction = 0;
  const otherDeductions = Number(load.other_expenses || 0) > 0 && load.other_expenses !== undefined ? 0 : 0;
  const totalDeductions = fuelExpenseDeduction + otherDeductions;

  const totalGrossEarnings = calculatedBaseDriverPay + totalReimbursements;
  const netSettlementPayout = totalGrossEarnings - totalDeductions;

  const earningsRows: (string | number)[][] = [
    [
      'Base Trip Compensation',
      `${payRateLabel} (Gross: ${formatCurrency(grossRate)}, Miles: ${formatMiles(totalMiles)})`,
      formatCurrency(calculatedBaseDriverPay),
    ],
  ];

  driverReimbursements.forEach((acc) => {
    earningsRows.push([
      `Reimbursement: ${acc.type.replace('_', ' ').toUpperCase()}`,
      `${acc.description || 'Driver out-of-pocket receipt'} (Receipt #${acc.receipt_number || 'On File'})`,
      formatCurrency(acc.amount),
    ]);
  });

  if (totalDeductions > 0) {
    earningsRows.push([
      'Approved Advances / Deductions',
      'Fuel Advance / Operating Settlement Deductions',
      `-${formatCurrency(totalDeductions)}`,
    ]);
  }

  earningsRows.push([
    'NET DRIVER SETTLEMENT PAYOUT',
    'Total Payable Net Compensation for Dispatched Trip',
    formatCurrency(netSettlementPayout),
  ]);

  autoTable(doc, {
    startY: cursorY,
    head: [['Earnings Item', 'Calculation Basis / Notes', 'Net Amount (USD)']],
    body: earningsRows,
    theme: 'grid',
    styles: {
      overflow: 'linebreak',
      font: 'helvetica',
      lineColor: PDF_COLORS.slate200,
      lineWidth: 0.5,
      cellPadding: { top: 5, right: 5, bottom: 5, left: 5 },
      valign: 'middle',
    },
    headStyles: {
      fillColor: PDF_COLORS.indigo,
      textColor: 255,
      fontStyle: 'bold',
      fontSize: 7.5,
      cellPadding: { top: 5, right: 5, bottom: 5, left: 5 },
      valign: 'middle',
    },
    bodyStyles: {
      fontSize: 7.5,
      textColor: PDF_COLORS.primaryDark,
      cellPadding: { top: 5, right: 5, bottom: 5, left: 5 },
      valign: 'middle',
    },
    columnStyles: {
      0: { cellWidth: 150, fontStyle: 'bold' },
      1: { cellWidth: 280 },
      2: { cellWidth: 110, halign: 'right', fontStyle: 'bold' },
    },
    alternateRowStyles: {
      fillColor: PDF_COLORS.slate50,
    },
    didParseCell: (data) => {
      // Highlight the total row
      if (data.row.index === earningsRows.length - 1) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = PDF_COLORS.indigoLight;
        data.cell.styles.textColor = PDF_COLORS.indigo;
      }
    },
    margin: { left: PDF_PAGE.marginLeft, right: PDF_PAGE.marginLeft },
  });

  cursorY = (doc as any).lastAutoTable.finalY + 12;

  // 5. Net Payout Summary Highlight Card & Multi-Page Safety Check
  // Check if Net Summary Card (46pt) + Signatures (52pt) fit on current page
  if (cursorY + 114 > PDF_PAGE.marginBottom) {
    doc.addPage();
    cursorY = PDF_PAGE.marginTop + 14;
  }

  drawCardBox(doc, PDF_PAGE.marginLeft, cursorY, PDF_PAGE.contentWidth, 46, 'Net Settlement Summary', PDF_COLORS.slate800);
  const summaryCy = cursorY + 20;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...PDF_COLORS.slate600);
  doc.text(`Base Pay: ${formatCurrency(calculatedBaseDriverPay)}`, PDF_PAGE.marginLeft + 12, summaryCy + 14);
  doc.text(`+ Reimbursements: ${formatCurrency(totalReimbursements)}`, PDF_PAGE.marginLeft + 140, summaryCy + 14);
  doc.text(`- Deductions: ${formatCurrency(totalDeductions)}`, PDF_PAGE.marginLeft + 275, summaryCy + 14);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(...PDF_COLORS.indigo);
  doc.text(`NET PAYOUT: ${formatCurrency(netSettlementPayout)}`, PDF_PAGE.marginRight - 12, summaryCy + 14, { align: 'right' });

  cursorY += 46 + 12;

  // 6. Driver Acknowledgement & Signatures
  const sigBoxWidth = (PDF_PAGE.contentWidth - 14) / 2;
  const sigBoxHeight = 52;

  // Left: Driver Sign-off
  drawCardBox(doc, PDF_PAGE.marginLeft, cursorY, sigBoxWidth, sigBoxHeight, 'Driver Acceptance');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...PDF_COLORS.slate600);
  doc.text('Driver Signature: _______________________________', PDF_PAGE.marginLeft + 8, cursorY + 33);
  doc.text('Date: ________________________', PDF_PAGE.marginLeft + 8, cursorY + 45);

  // Right: Carrier Approval
  const sigRightX = PDF_PAGE.marginLeft + sigBoxWidth + 14;
  drawCardBox(doc, sigRightX, cursorY, sigBoxWidth, sigBoxHeight, 'Authorized Dispatch / Payroll');
  doc.text('Authorized By: _________________________________', sigRightX + 8, cursorY + 33);
  doc.text(`Date: ${formatInTimezone(new Date().toISOString(), operationalTimezone, { includeTime: false })}`, sigRightX + 8, cursorY + 45);

  // 7. Add Multi-Page Footers
  addDocumentFooters(doc, {
    documentRef: `Settlement-${settlementNumber}`,
    confidentialText: 'Driver Compensation & Settlement Statement',
  });

  return doc;
}
