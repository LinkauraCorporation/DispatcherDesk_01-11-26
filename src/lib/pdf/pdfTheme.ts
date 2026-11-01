import jsPDF from 'jspdf';
import { formatInTimezone, formatDualTime } from '../timezones.ts';
import { formatCurrency, formatMiles, formatRPM } from '../calculations.ts';

export interface PdfThemeColors {
  primaryDark: [number, number, number];
  slate800: [number, number, number];
  slate700: [number, number, number];
  slate600: [number, number, number];
  slate500: [number, number, number];
  slate400: [number, number, number];
  slate200: [number, number, number];
  slate100: [number, number, number];
  slate50: [number, number, number];
  indigo: [number, number, number];
  indigoLight: [number, number, number];
  emerald: [number, number, number];
  emeraldLight: [number, number, number];
  amber: [number, number, number];
  amberLight: [number, number, number];
  rose: [number, number, number];
  roseLight: [number, number, number];
}

export const PDF_COLORS: PdfThemeColors = {
  primaryDark: [15, 23, 42],    // #0f172a Slate 900
  slate800: [30, 41, 59],       // #1e293b Slate 800
  slate700: [51, 65, 85],       // #334155 Slate 700
  slate600: [71, 85, 105],      // #475569 Slate 600
  slate500: [100, 116, 139],    // #64748b Slate 500
  slate400: [148, 163, 184],    // #94a3b8 Slate 400
  slate200: [226, 232, 240],    // #e2e8f0 Slate 200
  slate100: [241, 245, 249],    // #f1f5f9 Slate 100
  slate50: [248, 250, 252],     // #f8fafc Slate 50
  indigo: [79, 70, 229],        // #4f46e5 Indigo 600
  indigoLight: [238, 242, 255], // #eef2ff Indigo 50
  emerald: [16, 185, 129],      // #10b981 Emerald 500
  emeraldLight: [236, 253, 245],// #ecfdf5 Emerald 50
  amber: [217, 119, 6],         // #d97706 Amber 600
  amberLight: [254, 243, 199],  // #fef3c7 Amber 50
  rose: [225, 29, 72],          // #e11d48 Rose 600
  roseLight: [255, 241, 242],   // #fff1f2 Rose 50
};

export const PDF_PAGE = {
  width: 612,     // US Letter width in points (8.5 inches * 72)
  height: 792,    // US Letter height in points (11 inches * 72)
  marginLeft: 36, // 0.5 inch margin
  marginRight: 576,
  marginTop: 36,
  marginBottom: 756,
  contentWidth: 540, // 612 - 72
};

/**
 * Creates a standard jsPDF instance initialized with US Letter portrait geometry
 */
export function createStandardPdf(): jsPDF {
  const JsPdfConstructor = (jsPDF as any).jsPDF || jsPDF;
  return new JsPdfConstructor({
    orientation: 'portrait',
    unit: 'pt',
    format: 'letter',
    compress: true,
  });
}

/**
 * Helper to truncate text to fit within a given point width in jsPDF
 */
export function truncateText(doc: jsPDF, text: string, maxWidth: number): string {
  if (!text) return '';
  if (doc.getTextWidth(text) <= maxWidth) return text;
  let truncated = text;
  while (truncated.length > 0 && doc.getTextWidth(truncated + '…') > maxWidth) {
    truncated = truncated.slice(0, -1);
  }
  return truncated.length > 0 ? truncated + '…' : '';
}

/**
 * Draws a standardized header bar with DispatcherDesk logo badge and document metadata
 */
export function drawDocumentHeader(
  doc: jsPDF,
  options: {
    docTypeTitle: string;
    docSubtitle?: string;
    docNumber?: string;
    organizationName?: string;
    mcDot?: string;
    generatedAt?: string;
    operationalTimezone?: string;
    dispatcherTimezone?: string;
  }
): number {
  const {
    docTypeTitle,
    docSubtitle,
    docNumber,
    organizationName = 'DispatcherDesk Fleet Operations',
    mcDot,
    generatedAt = new Date().toISOString(),
    operationalTimezone = 'America/Chicago',
    dispatcherTimezone = 'Asia/Kolkata',
  } = options;

  let y = PDF_PAGE.marginTop;

  // Background Accent Brand Top Bar (Row 0: Y = 36, height = 3.5)
  doc.setFillColor(...PDF_COLORS.indigo);
  doc.rect(PDF_PAGE.marginLeft, y, PDF_PAGE.contentWidth, 3.5, 'F');
  y += 12; // y becomes 48

  // Compute right column widths to prevent left-side text from colliding
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11.5);
  const titleWidth = doc.getTextWidth(docTypeTitle.toUpperCase());

  doc.setFontSize(10);
  const numberWidth = docNumber ? doc.getTextWidth(docNumber) : 0;

  const dualTime = formatDualTime(generatedAt, operationalTimezone, dispatcherTimezone);
  const timestampText = `Generated: ${dualTime.primary} (${dualTime.secondary})`;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  const timeWidth = doc.getTextWidth(timestampText);

  const rightBlockWidth = Math.max(titleWidth, numberWidth, timeWidth) + 14;
  const maxLeftWidth = PDF_PAGE.contentWidth - rightBlockWidth - 10;

  // --- ROW 1: (Y = 48 + 9 = 57) ---
  // Left: DispatchDesk Brand Tag (Width 84, Height 15)
  doc.setFillColor(...PDF_COLORS.slate800);
  doc.roundedRect(PDF_PAGE.marginLeft, y - 2, 84, 15, 2, 2, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text('DISPATCHERDESK', PDF_PAGE.marginLeft + 5, y + 8.5);

  // Left: Organization Name (bounded safely between tag and right block)
  doc.setTextColor(...PDF_COLORS.primaryDark);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11.5);
  const maxOrgNameWidth = maxLeftWidth - 90;
  const safeOrgName = truncateText(doc, organizationName, Math.max(maxOrgNameWidth, 120));
  doc.text(safeOrgName, PDF_PAGE.marginLeft + 90, y + 9);

  // Right: Document Type Title (e.g. DRIVER SETTLEMENT)
  doc.setTextColor(...PDF_COLORS.indigo);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11.5);
  doc.text(docTypeTitle.toUpperCase(), PDF_PAGE.marginRight, y + 9, { align: 'right' });

  // --- ROW 2: (Y = 48 + 23 = 71) ---
  // Left: Authority / Subtitle info
  doc.setTextColor(...PDF_COLORS.slate600);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  const orgSubtext = [
    mcDot ? `Authority: ${mcDot}` : null,
    docSubtitle || null,
  ].filter(Boolean).join(' • ');

  if (orgSubtext) {
    const safeSubtext = truncateText(doc, orgSubtext, maxLeftWidth);
    doc.text(safeSubtext, PDF_PAGE.marginLeft, y + 23);
  }

  // Right: Document Number / Reference (e.g. SET-APX-78421) - Distinct vertical line below title!
  if (docNumber) {
    doc.setTextColor(...PDF_COLORS.primaryDark);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    const safeDocNumber = truncateText(doc, docNumber, rightBlockWidth);
    doc.text(safeDocNumber, PDF_PAGE.marginRight, y + 23, { align: 'right' });
  }

  // --- ROW 3: (Y = 48 + 35 = 83) ---
  // Right: Dual Timestamp
  doc.setTextColor(...PDF_COLORS.slate500);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text(timestampText, PDF_PAGE.marginRight, y + 35, { align: 'right' });

  // --- Separator Line (Y = 48 + 44 = 92) ---
  y += 44;
  doc.setDrawColor(...PDF_COLORS.slate200);
  doc.setLineWidth(0.75);
  doc.line(PDF_PAGE.marginLeft, y, PDF_PAGE.marginRight, y);

  // Content starts cleanly at y + 12 (Y = 104)
  return y + 12;
}

/**
 * Draws standard page numbering and footer across all pages
 */
export function addDocumentFooters(
  doc: jsPDF,
  options: {
    documentRef?: string;
    confidentialText?: string;
  } = {}
) {
  const pageCount = doc.getNumberOfPages();
  const {
    documentRef = 'DispatcherDesk Operational Document',
    confidentialText = 'Confidential — For Authorized Freight Operations & Billing Only',
  } = options;

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    const y = PDF_PAGE.marginBottom + 12;

    // Divider Line
    doc.setDrawColor(...PDF_COLORS.slate200);
    doc.setLineWidth(0.5);
    doc.line(PDF_PAGE.marginLeft, y - 6, PDF_PAGE.marginRight, y - 6);

    // Left: Document Ref & Confidential notice
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...PDF_COLORS.slate500);
    doc.text(`${documentRef} • ${confidentialText}`, PDF_PAGE.marginLeft, y + 4);

    // Right: Page X of Y
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...PDF_COLORS.slate600);
    doc.text(`Page ${i} of ${pageCount}`, PDF_PAGE.marginRight, y + 4, { align: 'right' });
  }
}

/**
 * Shared layout metrics for PDF card boxes, section containers, and field rows
 */
export const PDF_CARD = {
  headerHeight: 16,            // Height of the header strip (y to y + 16)
  headerTitleOffset: 11,       // Text baseline for header title inside strip
  headerFontSize: 8,           // Font size for header title
  contentStartYOffset: 26,     // Universal baseline for first line of content under a titled card (y + 26: gives 10pt clearance below header)
  contentPaddingX: 8,          // Standard left/right horizontal padding for text inside cards
  cardPaddingTop: 12,          // Universal baseline for untitled cards
  lineSpacingTight: 9.5,       // Standard tight line advance (for 6.5-7pt text)
  lineSpacingStandard: 11,     // Standard line advance (for 7.5-8pt text)
  lineSpacingComfortable: 13,  // Line advance for 9pt bold text or prominent headings
  sectionHeadingGap: 8,        // Standard gap between standalone text headings and content/tables below
};

/**
 * Draws a clean card / container box with optional header title.
 * Returns the exact standard Y-coordinate (baseline) for the first line of content inside the card,
 * providing consistent, balanced breathing room below the header strip across all documents.
 */
export function drawCardBox(
  doc: jsPDF,
  x: number,
  y: number,
  width: number,
  height: number,
  title?: string,
  accentColor: [number, number, number] = PDF_COLORS.slate800
): number {
  // Card background & border
  doc.setFillColor(...PDF_COLORS.slate50);
  doc.setDrawColor(...PDF_COLORS.slate200);
  doc.setLineWidth(0.75);
  doc.roundedRect(x, y, width, height, 4, 4, 'FD');

  if (title) {
    // Header strip
    doc.setFillColor(...accentColor);
    doc.roundedRect(x, y, width, PDF_CARD.headerHeight, 4, 4, 'F');
    // Square off bottom corners of header strip
    doc.rect(x, y + 10, width, PDF_CARD.headerHeight - 10, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(PDF_CARD.headerFontSize);
    doc.text(title.toUpperCase(), x + PDF_CARD.contentPaddingX, y + PDF_CARD.headerTitleOffset);
  }

  // Returns the universal, standard content start Y (giving 10pt clearance below header strip)
  return y + (title ? PDF_CARD.contentStartYOffset : PDF_CARD.cardPaddingTop);
}

export { formatCurrency, formatMiles, formatRPM, formatInTimezone, formatDualTime };
