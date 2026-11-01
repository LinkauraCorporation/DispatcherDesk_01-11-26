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
  formatRPM,
  formatDualTime,
} from './pdfTheme.ts';

export interface RateConfirmationPdfOptions {
  load: LoadWithRelations;
  accessorials?: AccessorialClaim[];
  organization?: Organization | null;
  operationalTimezone?: string;
  dispatcherTimezone?: string;
}

export function generateRateConfirmationPdf(options: RateConfirmationPdfOptions): jsPDF {
  const {
    load,
    accessorials = [],
    organization,
    operationalTimezone = 'America/Chicago',
    dispatcherTimezone = 'Asia/Kolkata',
  } = options;

  const doc = createStandardPdf();

  const orgName = organization?.name || 'DispatcherDesk Logistics & Freight Management';
  const mcDot = [
    organization?.mc_number ? `MC-${organization.mc_number}` : null,
    organization?.dot_number ? `DOT-${organization.dot_number}` : null,
  ].filter(Boolean).join(' | ');

  // 1. Render Header
  let startY = drawDocumentHeader(doc, {
    docTypeTitle: 'Rate Confirmation',
    docSubtitle: 'Freight Dispatch Order & Carrier Confirmation',
    docNumber: `LOAD #${load.load_number}`,
    organizationName: orgName,
    mcDot: mcDot || undefined,
    operationalTimezone,
    dispatcherTimezone,
  });

  // 2. Carrier & Broker Entity Section (Two side-by-side cards)
  const cardWidth = (PDF_PAGE.contentWidth - 14) / 2;
  const cardHeight = 92;

  // Left Card: Carrier / Client
  let leftCy = drawCardBox(doc, PDF_PAGE.marginLeft, startY, cardWidth, cardHeight, 'Carrier / Client Partner', PDF_COLORS.indigo);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...PDF_COLORS.primaryDark);
  doc.text(load.client?.company_name || 'Fleet Equipment Dispatched', PDF_PAGE.marginLeft + PDF_CARD.contentPaddingX, leftCy);

  leftCy += PDF_CARD.lineSpacingComfortable;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...PDF_COLORS.slate600);
  doc.text(`Contact: ${load.client?.contact_name || 'Operations Desk'}`, PDF_PAGE.marginLeft + PDF_CARD.contentPaddingX, leftCy);
  leftCy += PDF_CARD.lineSpacingStandard;
  doc.text(`Phone: ${load.client?.contact_phone || '—'}`, PDF_PAGE.marginLeft + PDF_CARD.contentPaddingX, leftCy);
  leftCy += PDF_CARD.lineSpacingStandard;
  doc.text(`Email: ${load.client?.contact_email || '—'}`, PDF_PAGE.marginLeft + PDF_CARD.contentPaddingX, leftCy);
  leftCy += PDF_CARD.lineSpacingStandard;
  doc.text(`Equipment Type: ${load.equipment_type.replace('_', ' ').toUpperCase()}`, PDF_PAGE.marginLeft + PDF_CARD.contentPaddingX, leftCy);

  // Right Card: Broker / Shipper
  const rx = PDF_PAGE.marginLeft + cardWidth + 14;
  let rightCy = drawCardBox(doc, rx, startY, cardWidth, cardHeight, 'Broker / Freight Customer', PDF_COLORS.slate800);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...PDF_COLORS.primaryDark);
  doc.text(load.broker?.company_name || 'Direct Broker / Customer', rx + PDF_CARD.contentPaddingX, rightCy);

  rightCy += PDF_CARD.lineSpacingComfortable;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...PDF_COLORS.slate600);
  const brokerAuth = [
    load.broker?.mc_number ? `MC: ${load.broker.mc_number}` : null,
    load.broker?.dot_number ? `DOT: ${load.broker.dot_number}` : null,
  ].filter(Boolean).join(' • ');
  doc.text(brokerAuth || 'Authority: Broker On File', rx + PDF_CARD.contentPaddingX, rightCy);
  rightCy += PDF_CARD.lineSpacingStandard;
  doc.text(`Contact Person: ${load.broker?.contact_name || 'Brokerage Representative'}`, rx + PDF_CARD.contentPaddingX, rightCy);
  rightCy += PDF_CARD.lineSpacingStandard;
  doc.text(`Phone: ${load.broker?.contact_phone || '—'} | Email: ${load.broker?.contact_email || '—'}`, rx + PDF_CARD.contentPaddingX, rightCy);
  rightCy += PDF_CARD.lineSpacingStandard;
  doc.text(`Payment Terms: ${load.broker?.payment_terms_days ? `${load.broker.payment_terms_days} Days Net` : 'Standard Net 30'}`, rx + PDF_CARD.contentPaddingX, rightCy);

  startY += cardHeight + 10;

  // 3. Equipment, Driver & Load Specs Strip
  const specsCardHeight = 56;
  let ey = drawCardBox(doc, PDF_PAGE.marginLeft, startY, PDF_PAGE.contentWidth, specsCardHeight, 'Assigned Equipment & Cargo Specifications', PDF_COLORS.slate700);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);

  // Col 1: Equipment
  doc.setTextColor(...PDF_COLORS.slate500);
  doc.text('EQUIPMENT TYPE:', PDF_PAGE.marginLeft + PDF_CARD.contentPaddingX, ey);
  doc.setTextColor(...PDF_COLORS.primaryDark);
  doc.setFont('helvetica', 'bold');
  doc.text(load.equipment_type.replace('_', ' ').toUpperCase(), PDF_PAGE.marginLeft + PDF_CARD.contentPaddingX, ey + 10);

  // Col 2: Truck & VIN
  const col2X = PDF_PAGE.marginLeft + 130;
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...PDF_COLORS.slate500);
  doc.text('TRUCK / VIN:', col2X, ey);
  doc.setTextColor(...PDF_COLORS.primaryDark);
  doc.setFont('helvetica', 'bold');
  const truckLabel = load.truck?.truck_number ? `Trk #${load.truck.truck_number}` : 'Assigned Unit';
  const vinLabel = load.truck?.vin ? ` (${load.truck.vin.slice(-8)})` : '';
  doc.text(`${truckLabel}${vinLabel}`, col2X, ey + 10);

  // Col 3: Driver
  const col3X = PDF_PAGE.marginLeft + 265;
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...PDF_COLORS.slate500);
  doc.text('ASSIGNED DRIVER:', col3X, ey);
  doc.setTextColor(...PDF_COLORS.primaryDark);
  doc.setFont('helvetica', 'bold');
  const driverName = load.driver?.full_name || 'Company Driver';
  const driverPhone = load.driver?.phone ? ` • ${load.driver.phone}` : '';
  doc.text(`${driverName}${driverPhone}`, col3X, ey + 10);

  // Col 4: Commodity & Weight
  const col4X = PDF_PAGE.marginLeft + 415;
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...PDF_COLORS.slate500);
  doc.text('COMMODITY / WEIGHT:', col4X, ey);
  doc.setTextColor(...PDF_COLORS.primaryDark);
  doc.setFont('helvetica', 'bold');
  const commodity = load.commodity || 'General Freight';
  const weight = load.weight_lbs ? `${load.weight_lbs.toLocaleString()} lbs` : 'Standard Max';
  doc.text(`${commodity} (${weight})`, col4X, ey + 10);

  startY += specsCardHeight + 10;

  // 4. Pickup & Delivery Route Schedule Table
  const pickupTime = formatDualTime(load.pickup_datetime, operationalTimezone, dispatcherTimezone);
  const deliveryTime = formatDualTime(load.delivery_datetime, operationalTimezone, dispatcherTimezone);

  const stopsData = [
    [
      '1. PICKUP (ORIGIN)',
      `${load.origin_city}, ${load.origin_state} ${load.origin_zip || ''}`,
      `${pickupTime.primary}\n(${pickupTime.secondary})`,
      'Shipper Facility / Dock Appointment. Strict check-in required upon arrival.',
    ],
    [
      '2. DELIVERY (DEST)',
      `${load.dest_city}, ${load.dest_state} ${load.dest_zip || ''}`,
      `${deliveryTime.primary}\n(${deliveryTime.secondary})`,
      'Receiver Facility / Consignee. Signed clean Proof of Delivery (POD) required.',
    ],
  ];

  autoTable(doc, {
    startY,
    head: [['Stop Type', 'Facility Location', 'Scheduled Date / Time (Dual Timezone)', 'Operational Instructions']],
    body: stopsData,
    theme: 'grid',
    headStyles: {
      fillColor: PDF_COLORS.slate800,
      textColor: 255,
      fontStyle: 'bold',
      fontSize: 8,
      cellPadding: 5,
    },
    bodyStyles: {
      fontSize: 7.5,
      textColor: PDF_COLORS.primaryDark,
      cellPadding: 6,
    },
    columnStyles: {
      0: { cellWidth: 95, fontStyle: 'bold' },
      1: { cellWidth: 120 },
      2: { cellWidth: 135, fontStyle: 'bold' },
      3: { cellWidth: 190 },
    },
    alternateRowStyles: {
      fillColor: PDF_COLORS.slate50,
    },
    margin: { left: PDF_PAGE.marginLeft, right: PDF_PAGE.marginLeft },
  });

  startY = (doc as any).lastAutoTable.finalY + 12;

  // 5. Rate Breakdown & Mileage Table
  const loadedMiles = load.loaded_miles || 0;
  const deadheadMiles = load.deadhead_miles || 0;
  const totalMiles = loadedMiles + deadheadMiles;
  const baseRate = Number(load.rate || 0);
  const rpm = totalMiles > 0 ? baseRate / totalMiles : 0;

  // Filter approved or relevant accessorials for this load
  const approvedAccessorials = accessorials.filter(
    (a) => a.load_id === load.id && (a.status === 'approved_on_rate_con' || a.status === 'invoiced' || a.status === 'submitted_to_broker')
  );
  const accessorialTotal = approvedAccessorials.reduce((sum, a) => sum + (Number(a.amount) || 0), 0);
  const grandTotal = baseRate + accessorialTotal;

  const financialRows: (string | number)[][] = [
    ['Linehaul Base Freight Rate', 'Agreed Transportation Contract Rate', formatCurrency(baseRate)],
  ];

  approvedAccessorials.forEach((acc) => {
    financialRows.push([
      `Accessorial: ${acc.type.replace('_', ' ').toUpperCase()}`,
      `${acc.description || 'Approved Broker Accessorial'} [Status: ${acc.status.replace(/_/g, ' ').toUpperCase()}]`,
      formatCurrency(acc.amount),
    ]);
  });

  financialRows.push([
    'TOTAL AGREED CARRIER RATE',
    `Mileage: ${formatMiles(totalMiles)} (${loadedMiles} loaded + ${deadheadMiles} DH) • RPM: ${formatRPM(rpm)}`,
    formatCurrency(grandTotal),
  ]);

  autoTable(doc, {
    startY,
    head: [['Item Description', 'Details / Mileage Reference', 'Amount (USD)']],
    body: financialRows,
    theme: 'grid',
    headStyles: {
      fillColor: PDF_COLORS.indigo,
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
      0: { cellWidth: 150, fontStyle: 'bold' },
      1: { cellWidth: 280 },
      2: { cellWidth: 110, halign: 'right', fontStyle: 'bold' },
    },
    alternateRowStyles: {
      fillColor: PDF_COLORS.slate50,
    },
    margin: { left: PDF_PAGE.marginLeft, right: PDF_PAGE.marginLeft },
  });

  startY = (doc as any).lastAutoTable.finalY + 12;

  // 6. Special Instructions & Check-Call Protocol
  const instructionsCardHeight = 68;
  let py = drawCardBox(doc, PDF_PAGE.marginLeft, startY, PDF_PAGE.contentWidth, instructionsCardHeight, 'Operational Instructions & Dispatch Rules', PDF_COLORS.slate800);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...PDF_COLORS.slate700);

  const instructionsText = load.special_instructions
    ? `SPECIAL BROKER INSTRUCTIONS: ${load.special_instructions}`
    : 'STANDARD DISPATCH PROTOCOL: Daily check-calls required by 09:00 CST and upon arrival/departure at every facility.';

  const splitNotes = doc.splitTextToSize(instructionsText, PDF_PAGE.contentWidth - 16);
  doc.text(splitNotes.slice(0, 3), PDF_PAGE.marginLeft + PDF_CARD.contentPaddingX, py);
  py += 20;

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...PDF_COLORS.primaryDark);
  doc.text('DETENTION & PAPERWORK CLAUSE:', PDF_PAGE.marginLeft + PDF_CARD.contentPaddingX, py);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...PDF_COLORS.slate600);
  doc.text(
    'Detention begins after 2 hours free time with verified timestamped check-in. Signed POD must be submitted within 24 hours of delivery.',
    PDF_PAGE.marginLeft + PDF_CARD.contentPaddingX,
    py + 9
  );

  startY += instructionsCardHeight + 10;

  // 7. Signature & Confirmation Block
  const sigBoxWidth = (PDF_PAGE.contentWidth - 14) / 2;
  const sigBoxHeight = 52;

  // Left: Dispatcher Authorized
  drawCardBox(doc, PDF_PAGE.marginLeft, startY, sigBoxWidth, sigBoxHeight, 'Authorized Dispatch Representative');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...PDF_COLORS.slate600);
  doc.text('Signature: ____________________________________', PDF_PAGE.marginLeft + PDF_CARD.contentPaddingX, startY + 34);
  doc.text(`Date: ${new Date().toLocaleDateString()}`, PDF_PAGE.marginLeft + PDF_CARD.contentPaddingX, startY + 46);

  // Right: Carrier / Driver Acceptance
  drawCardBox(doc, PDF_PAGE.marginLeft + sigBoxWidth + 14, startY, sigBoxWidth, sigBoxHeight, 'Carrier / Driver Acceptance');
  doc.text('Signature: ____________________________________', PDF_PAGE.marginLeft + sigBoxWidth + 14 + PDF_CARD.contentPaddingX, startY + 34);
  doc.text('Date: ________________________', PDF_PAGE.marginLeft + sigBoxWidth + 14 + PDF_CARD.contentPaddingX, startY + 46);

  // 8. Add Multi-Page Footers
  addDocumentFooters(doc, {
    documentRef: `RateCon-${load.load_number}`,
    confidentialText: 'Carrier Freight Confirmation Agreement',
  });

  return doc;
}
