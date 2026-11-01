import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { LoadWithRelations } from '../../modules/loads/loadTypes.ts';
import { AccessorialClaim } from '../../modules/accessorials/accessorialTypes.ts';
import { Organization } from '../../types/domain.types.ts';
import {
  createStandardPdf,
  drawDocumentHeader,
  addDocumentFooters,
  drawCardBox,
  PDF_COLORS,
  PDF_PAGE,
  PDF_CARD,
  formatCurrency,
  formatMiles,
  formatInTimezone,
} from './pdfTheme.ts';

export interface CarrierInvoicePdfOptions {
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

export function generateCarrierInvoicePdf(options: CarrierInvoicePdfOptions): jsPDF {
  const {
    load,
    accessorials = [],
    organization,
    invoiceNumber = `INV-${load.load_number}`,
    invoiceDate = new Date().toISOString(),
    paymentTerms,
    operationalTimezone = 'America/Chicago',
    dispatcherTimezone = 'Asia/Kolkata',
  } = options;

  const doc = createStandardPdf();

  const orgName = organization?.name || load.client?.company_name || 'DispatcherDesk Fleet Operations';
  const mcDot = [
    organization?.mc_number ? `MC-${organization.mc_number}` : null,
    organization?.dot_number ? `DOT-${organization.dot_number}` : null,
  ].filter(Boolean).join(' | ');

  // Determine Payment Terms & Due Date
  const termsDays = load.broker?.payment_terms_days || 30;
  const termsLabel = paymentTerms || `${termsDays} Days Net`;
  
  const invDateObj = new Date(invoiceDate);
  const dueDateObj = options.dueDate
    ? new Date(options.dueDate)
    : new Date(invDateObj.getTime() + termsDays * 86400000);

  const formattedInvoiceDate = formatInTimezone(invoiceDate, operationalTimezone, { includeTime: false });
  const formattedDueDate = formatInTimezone(dueDateObj.toISOString(), operationalTimezone, { includeTime: false });

  // 1. Render Header
  let startY = drawDocumentHeader(doc, {
    docTypeTitle: 'Carrier Freight Invoice',
    docSubtitle: 'Commercial Freight Billing & Remittance Statement',
    docNumber: invoiceNumber,
    organizationName: orgName,
    mcDot: mcDot || undefined,
    operationalTimezone,
    dispatcherTimezone,
  });

  // 2. Invoice Meta & Bill To / Billed By Details
  const cardWidth = (PDF_PAGE.contentWidth - 14) / 2;
  const cardHeight = 96;

  // Left Card: Billed By (Carrier / Client)
  let leftCy = drawCardBox(doc, PDF_PAGE.marginLeft, startY, cardWidth, cardHeight, 'Billed By (Carrier / Dispatcher)', PDF_COLORS.indigo);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...PDF_COLORS.primaryDark);
  const carrierName = (load.client?.company_name || orgName).slice(0, 38);
  doc.text(carrierName, PDF_PAGE.marginLeft + PDF_CARD.contentPaddingX, leftCy);

  leftCy += PDF_CARD.lineSpacingComfortable;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...PDF_COLORS.slate600);
  doc.text(`Contact: ${(load.client?.contact_name || 'Billing Department').slice(0, 34)}`, PDF_PAGE.marginLeft + PDF_CARD.contentPaddingX, leftCy);
  leftCy += PDF_CARD.lineSpacingStandard;
  doc.text(`Phone: ${load.client?.contact_phone || '—'}`, PDF_PAGE.marginLeft + PDF_CARD.contentPaddingX, leftCy);
  leftCy += PDF_CARD.lineSpacingStandard;
  doc.text(`Remit Email: ${(load.client?.contact_email || 'billing@dispatchdesk.com').slice(0, 34)}`, PDF_PAGE.marginLeft + PDF_CARD.contentPaddingX, leftCy);
  leftCy += PDF_CARD.lineSpacingStandard;
  doc.text(`Carrier Authority: ${load.client?.client_type === 'owner_operator' ? 'Owner Operator' : 'Fleet Carrier'}`, PDF_PAGE.marginLeft + PDF_CARD.contentPaddingX, leftCy);

  // Right Card: Bill To (Broker / Payer)
  const rx = PDF_PAGE.marginLeft + cardWidth + 14;
  let rightCy = drawCardBox(doc, rx, startY, cardWidth, cardHeight, 'Bill To (Payer / Broker)', PDF_COLORS.slate800);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...PDF_COLORS.primaryDark);
  const brokerName = (load.broker?.company_name || 'Freight Brokerage Payer').slice(0, 38);
  doc.text(brokerName, rx + PDF_CARD.contentPaddingX, rightCy);

  rightCy += PDF_CARD.lineSpacingComfortable;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...PDF_COLORS.slate600);
  const brokerAuth = [
    load.broker?.mc_number ? `MC: ${load.broker.mc_number}` : null,
    load.broker?.dot_number ? `DOT: ${load.broker.dot_number}` : null,
  ].filter(Boolean).join(' • ');
  doc.text(brokerAuth || 'Broker Authority: On File', rx + PDF_CARD.contentPaddingX, rightCy);
  rightCy += PDF_CARD.lineSpacingStandard;
  const attentionContact = (load.broker?.contact_name ? `${load.broker.contact_name} (AP)` : 'Accounts Payable / Billing Desk').slice(0, 34);
  doc.text(`Attention: ${attentionContact}`, rx + PDF_CARD.contentPaddingX, rightCy);
  rightCy += PDF_CARD.lineSpacingStandard;
  const contactText = [
    load.broker?.contact_phone ? `Tel: ${load.broker.contact_phone}` : null,
    load.broker?.contact_email ? `Email: ${load.broker.contact_email}` : null,
  ].filter(Boolean).join(' | ') || 'Contact On File';
  doc.text(contactText.slice(0, 38), rx + PDF_CARD.contentPaddingX, rightCy);
  rightCy += PDF_CARD.lineSpacingStandard;
  doc.text(`Invoice Date: ${formattedInvoiceDate} | Due: ${formattedDueDate} (${termsLabel})`, rx + PDF_CARD.contentPaddingX, rightCy);

  startY += cardHeight + 10;

  // 3. Freight Service Reference Banner
  const refCardHeight = 48;
  let fy = drawCardBox(doc, PDF_PAGE.marginLeft, startY, PDF_PAGE.contentWidth, refCardHeight, 'Freight Transportation Reference', PDF_COLORS.slate700);
  const colWidth = (PDF_PAGE.contentWidth - 16) / 4;

  // Col 1: Load Number
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...PDF_COLORS.slate500);
  doc.text('LOAD NUMBER:', PDF_PAGE.marginLeft + PDF_CARD.contentPaddingX, fy);
  doc.setTextColor(...PDF_COLORS.primaryDark);
  doc.setFont('helvetica', 'bold');
  doc.text(load.load_number, PDF_PAGE.marginLeft + PDF_CARD.contentPaddingX, fy + 10);

  // Col 2: Route Lane
  const col2X = PDF_PAGE.marginLeft + PDF_CARD.contentPaddingX + colWidth;
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...PDF_COLORS.slate500);
  doc.text('ROUTE LANE:', col2X, fy);
  doc.setTextColor(...PDF_COLORS.primaryDark);
  doc.setFont('helvetica', 'bold');
  const laneText = `${load.origin_city}, ${load.origin_state} -> ${load.dest_city}, ${load.dest_state}`;
  const splitLane = doc.splitTextToSize(laneText, colWidth - 8);
  doc.text(splitLane[0], col2X, fy + 10);

  // Col 3: Delivery Date
  const col3X = PDF_PAGE.marginLeft + PDF_CARD.contentPaddingX + colWidth * 2;
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...PDF_COLORS.slate500);
  doc.text('COMPLETED DELIVERY:', col3X, fy);
  doc.setTextColor(...PDF_COLORS.primaryDark);
  doc.setFont('helvetica', 'bold');
  const delDate = formatInTimezone(load.delivery_datetime, operationalTimezone, { includeTime: false });
  doc.text(delDate !== '—' ? delDate : 'Delivered & Verified', col3X, fy + 10);

  // Col 4: Equipment & Miles
  const col4X = PDF_PAGE.marginLeft + PDF_CARD.contentPaddingX + colWidth * 3;
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...PDF_COLORS.slate500);
  doc.text('EQUIPMENT / MILES:', col4X, fy);
  doc.setTextColor(...PDF_COLORS.primaryDark);
  doc.setFont('helvetica', 'bold');
  const equipMiles = `${load.equipment_type.replace('_', ' ').toUpperCase()} • ${formatMiles(load.loaded_miles)}`;
  const splitEquip = doc.splitTextToSize(equipMiles, colWidth - 8);
  doc.text(splitEquip[0], col4X, fy + 10);

  startY += refCardHeight + 8;

  // 4. Itemized Invoicing Charges Table
  const baseRate = Number(load.rate || 0);

  // Relevant billable accessorials
  const billableAccessorials = accessorials.filter(
    (a) => a.load_id === load.id && (a.status === 'invoiced' || a.status === 'approved_on_rate_con' || a.status === 'submitted_to_broker')
  );

  const invoiceItems: (string | number)[][] = [
    [
      '1',
      `Linehaul Freight Transportation (Load #${load.load_number})`,
      `${load.origin_city}, ${load.origin_state} to ${load.dest_city}, ${load.dest_state} (${formatMiles(load.loaded_miles)})`,
      formatCurrency(baseRate),
    ],
  ];

  let itemNum = 2;
  let totalAccessorials = 0;

  billableAccessorials.forEach((acc) => {
    const accAmount = Number(acc.amount) || 0;
    totalAccessorials += accAmount;
    invoiceItems.push([
      String(itemNum++),
      `Accessorial: ${acc.type.replace('_', ' ').toUpperCase()}`,
      `${acc.description || 'Approved freight accessorial claim'}${acc.receipt_number ? ` (Receipt #${acc.receipt_number})` : ''}`,
      formatCurrency(accAmount),
    ]);
  });

  const totalInvoiceAmount = baseRate + totalAccessorials;

  autoTable(doc, {
    startY,
    head: [['#', 'Item Description', 'Details / Supporting Documentation', 'Amount (USD)']],
    body: invoiceItems,
    theme: 'grid',
    headStyles: {
      fillColor: PDF_COLORS.slate800,
      textColor: 255,
      fontStyle: 'bold',
      fontSize: 8,
      cellPadding: 5,
    },
    bodyStyles: {
      fontSize: 8,
      textColor: PDF_COLORS.primaryDark,
      cellPadding: 5,
    },
    columnStyles: {
      0: { cellWidth: 25, halign: 'center' },
      1: { cellWidth: 175, fontStyle: 'bold' },
      2: { cellWidth: 240 },
      3: { cellWidth: 100, halign: 'right', fontStyle: 'bold' },
    },
    alternateRowStyles: {
      fillColor: PDF_COLORS.slate50,
    },
    margin: { left: PDF_PAGE.marginLeft, right: PDF_PAGE.marginLeft },
  });

  startY = (doc as any).lastAutoTable.finalY + 12;

  // Check if remaining sections fit on current page; otherwise, add page
  const requiredBottomHeight = 140;
  if (startY + requiredBottomHeight > PDF_PAGE.marginBottom) {
    doc.addPage();
    startY = PDF_PAGE.marginTop + 14;
  }

  // 5. Total Balance & Factoring Notice (Two column layout)
  const leftWidth = 320;
  const rightWidth = PDF_PAGE.contentWidth - leftWidth - 14;
  const bottomCardHeight = 84;

  // Left: Factoring Notice / Remittance Instructions
  let ry = drawCardBox(doc, PDF_PAGE.marginLeft, startY, leftWidth, bottomCardHeight, 'Notice of Assignment & Remittance Instructions', PDF_COLORS.slate800);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...PDF_COLORS.slate700);

  const remitText =
    'NOTICE OF ASSIGNMENT: This invoice and the right to receive payment have been assigned to our authorized factoring provider. Please remit electronic ACH/wire payment directly according to the Notice of Assignment on file, or mail check referencing this invoice number.';
  const splitRemit = doc.splitTextToSize(remitText, leftWidth - 16);
  doc.text(splitRemit, PDF_PAGE.marginLeft + PDF_CARD.contentPaddingX, ry);
  const remitHeight = splitRemit.length * 8.5;
  ry += remitHeight + 8;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...PDF_COLORS.primaryDark);
  doc.text('Payment Queries: billing@dispatchdesk.com', PDF_PAGE.marginLeft + PDF_CARD.contentPaddingX, ry);

  // Right: Financial Summary Box
  const sX = PDF_PAGE.marginLeft + leftWidth + 14;
  let sy = drawCardBox(doc, sX, startY, rightWidth, bottomCardHeight, 'Invoice Summary', PDF_COLORS.indigo);
  const sInnerX = sX + PDF_CARD.contentPaddingX;
  const sRight = PDF_PAGE.marginRight - PDF_CARD.contentPaddingX;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...PDF_COLORS.slate600);
  doc.text('Linehaul Subtotal:', sInnerX, sy);
  doc.text(formatCurrency(baseRate), sRight, sy, { align: 'right' });

  sy += PDF_CARD.lineSpacingComfortable;
  doc.text('Accessorial Charges:', sInnerX, sy);
  doc.text(formatCurrency(totalAccessorials), sRight, sy, { align: 'right' });

  sy += 14;
  doc.setDrawColor(...PDF_COLORS.slate200);
  doc.line(sInnerX, sy - 3, sRight, sy - 3);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(...PDF_COLORS.primaryDark);
  doc.text('TOTAL DUE:', sInnerX, sy + 7);
  doc.setTextColor(...PDF_COLORS.indigo);
  doc.text(formatCurrency(totalInvoiceAmount), sRight, sy + 7, { align: 'right' });

  startY += bottomCardHeight + 10;

  // 6. Billing Authorization Sign-off
  drawCardBox(doc, PDF_PAGE.marginLeft, startY, PDF_PAGE.contentWidth, 42, 'Authorized Billing Desk Sign-off');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...PDF_COLORS.slate600);
  doc.text('Authorized By: ____________________________________', PDF_PAGE.marginLeft + PDF_CARD.contentPaddingX, startY + 29);
  doc.text(`Date Processed: ${formattedInvoiceDate}`, PDF_PAGE.marginLeft + 310, startY + 29);

  // 7. Add Multi-Page Footers
  addDocumentFooters(doc, {
    documentRef: `Invoice-${invoiceNumber}`,
    confidentialText: 'Official Commercial Freight Invoice',
  });

  return doc;
}
