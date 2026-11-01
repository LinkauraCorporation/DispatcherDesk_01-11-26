import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { LoadWithRelations } from '../../modules/loads/loadTypes.ts';
import { AccessorialWithLoad } from '../../modules/accessorials/accessorialTypes.ts';
import { DispatcherTask, TaskStats, TASK_CATEGORY_CONFIG } from '../../modules/tasks/taskTypes.ts';
import { LoadActivityEvent } from '../../modules/activity/activityTypes.ts';
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
  formatDualTime,
} from './pdfTheme.ts';

export interface ShiftHandoverPdfOptions {
  organization?: Organization | null;
  shiftName?: string;
  snapshotTimestamp?: string;
  dispatcherName?: string;
  activeLoads: LoadWithRelations[];
  exceptions?: {
    type: string;
    load: LoadWithRelations;
    message: string;
    details?: string | null;
  }[];
  missingDocs?: {
    load: LoadWithRelations;
    missingDocs: string[];
  }[];
  accessorials?: AccessorialWithLoad[];
  upcomingAppointments?: {
    type: 'pickup' | 'delivery';
    datetime: string;
    load: LoadWithRelations;
    location: string;
  }[];
  recentActivities?: LoadActivityEvent[];
  openTasks?: DispatcherTask[];
  taskStats?: TaskStats | null;
  operationalTimezone?: string;
  dispatcherTimezone?: string;
}

export function generateShiftHandoverPdf(options: ShiftHandoverPdfOptions): jsPDF {
  const {
    organization,
    shiftName = 'US Day Shift -> India Night Shift',
    snapshotTimestamp = new Date().toISOString(),
    dispatcherName = 'DispatcherDesk Lead',
    activeLoads = [],
    exceptions = [],
    missingDocs = [],
    accessorials = [],
    upcomingAppointments = [],
    recentActivities = [],
    openTasks = [],
    taskStats,
    operationalTimezone = 'America/Chicago',
    dispatcherTimezone = 'Asia/Kolkata',
  } = options;

  const doc = createStandardPdf();

  const orgName = organization?.name || 'DispatcherDesk Fleet Operations';
  const dualSnapshot = formatDualTime(snapshotTimestamp, operationalTimezone, dispatcherTimezone);

  // 1. Render Header
  let startY = drawDocumentHeader(doc, {
    docTypeTitle: 'Shift Handover Briefing',
    docSubtitle: `Operational Transition: ${shiftName}`,
    docNumber: 'DAILY BRIEF',
    organizationName: orgName,
    generatedAt: snapshotTimestamp,
    operationalTimezone,
    dispatcherTimezone,
  });

  // 2. Executive KPI Strip
  const kpiWidth = (PDF_PAGE.contentWidth - 24) / 4;
  const kpiHeight = 44;

  const kpis = [
    { label: 'IN-FLIGHT LOADS', val: String(activeLoads.length), sub: 'Booked / In-Transit', color: PDF_COLORS.indigo },
    { label: 'EXCEPTIONS / ALERTS', val: String(exceptions.length), sub: exceptions.length === 0 ? 'All Normal' : 'Needs Action', color: exceptions.length > 0 ? PDF_COLORS.rose : PDF_COLORS.emerald },
    { label: 'PAPERWORK BLOCKERS', val: String(missingDocs.length), sub: 'Missing POD / BOL', color: missingDocs.length > 0 ? PDF_COLORS.amber : PDF_COLORS.emerald },
    { label: 'OPEN DESK TASKS', val: String(openTasks.length), sub: `${taskStats?.overdueCount || 0} Overdue`, color: (taskStats?.overdueCount || 0) > 0 ? PDF_COLORS.rose : PDF_COLORS.slate800 },
  ];

  kpis.forEach((kpi, idx) => {
    const kx = PDF_PAGE.marginLeft + idx * (kpiWidth + 8);
    drawCardBox(doc, kx, startY, kpiWidth, kpiHeight);
    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...kpi.color);
    doc.text(kpi.label, kx + 6, startY + 12);

    doc.setFontSize(13);
    doc.setTextColor(...PDF_COLORS.primaryDark);
    doc.text(kpi.val, kx + 6, startY + 28);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...PDF_COLORS.slate500);
    doc.text(kpi.sub, kx + 6, startY + 38);
  });

  startY += kpiHeight + 12;

  // 3. Section 1: In-Flight Active Freight Table
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...PDF_COLORS.primaryDark);
  doc.text(`1. ACTIVE IN-FLIGHT FREIGHT (${activeLoads.length} Loads)`, PDF_PAGE.marginLeft, startY);
  startY += 6;

  const loadRows = activeLoads.map((l) => {
    const truckDrv = `${l.truck?.truck_number ? `Trk #${l.truck.truck_number}` : 'Unassigned'} / ${l.driver?.full_name || 'No Driver'}`;
    const route = `${l.origin_city}, ${l.origin_state} -> ${l.dest_city}, ${l.dest_state}`;
    const puTime = l.pickup_datetime ? formatInTimezone(l.pickup_datetime, operationalTimezone, { includeDate: true, includeTime: true }) : 'TBD';
    const delTime = l.delivery_datetime ? formatInTimezone(l.delivery_datetime, operationalTimezone, { includeDate: true, includeTime: true }) : 'TBD';
    
    return [
      l.load_number,
      l.client?.company_name || 'Fleet',
      truckDrv,
      route,
      l.pipeline_status.toUpperCase(),
      `PU: ${puTime}\nDEL: ${delTime}`,
      formatCurrency(l.rate),
    ];
  });

  if (loadRows.length === 0) {
    loadRows.push(['—', 'No active in-flight loads currently dispatched.', '—', '—', '—', '—', '$0.00']);
  }

  autoTable(doc, {
    startY,
    head: [['Load #', 'Carrier Client', 'Truck / Driver', 'Route (Origin -> Dest)', 'Stage', 'Schedule (Ops TZ)', 'Gross Rate']],
    body: loadRows,
    theme: 'grid',
    headStyles: {
      fillColor: PDF_COLORS.slate800,
      textColor: 255,
      fontStyle: 'bold',
      fontSize: 7.5,
      cellPadding: 4,
    },
    bodyStyles: {
      fontSize: 7,
      textColor: PDF_COLORS.primaryDark,
      cellPadding: 4,
    },
    columnStyles: {
      0: { cellWidth: 55, fontStyle: 'bold' },
      1: { cellWidth: 70 },
      2: { cellWidth: 90 },
      3: { cellWidth: 120 },
      4: { cellWidth: 55, fontStyle: 'bold' },
      5: { cellWidth: 95 },
      6: { cellWidth: 55, halign: 'right', fontStyle: 'bold' },
    },
    alternateRowStyles: {
      fillColor: PDF_COLORS.slate50,
    },
    margin: { left: PDF_PAGE.marginLeft, right: PDF_PAGE.marginLeft },
  });

  startY = (doc as any).lastAutoTable.finalY + 12;

  // 4. Section 2: Critical Operational Exceptions & Delays
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...PDF_COLORS.primaryDark);
  doc.text(`2. OPERATIONAL EXCEPTIONS & CRITICAL ATTENTION (${exceptions.length})`, PDF_PAGE.marginLeft, startY);
  startY += 6;

  const exceptionRows = exceptions.map((exc) => [
    exc.load.load_number,
    exc.type.toUpperCase().replace('_', ' '),
    exc.message,
    exc.details || 'Dispatcher monitoring required.',
  ]);

  if (exceptionRows.length === 0) {
    exceptionRows.push(['—', 'NORMAL', 'All active loads on schedule. Zero breakdowns or critical delays.', 'Clean desk']);
  }

  autoTable(doc, {
    startY,
    head: [['Load #', 'Alert Type', 'Status & Exception Description', 'Action / Follow-up Notes']],
    body: exceptionRows,
    theme: 'grid',
    headStyles: {
      fillColor: exceptions.length > 0 ? PDF_COLORS.rose : PDF_COLORS.slate800,
      textColor: 255,
      fontStyle: 'bold',
      fontSize: 7.5,
      cellPadding: 4,
    },
    bodyStyles: {
      fontSize: 7,
      textColor: PDF_COLORS.primaryDark,
      cellPadding: 4,
    },
    columnStyles: {
      0: { cellWidth: 65, fontStyle: 'bold' },
      1: { cellWidth: 80, fontStyle: 'bold' },
      2: { cellWidth: 215 },
      3: { cellWidth: 180 },
    },
    alternateRowStyles: {
      fillColor: PDF_COLORS.slate50,
    },
    margin: { left: PDF_PAGE.marginLeft, right: PDF_PAGE.marginLeft },
  });

  startY = (doc as any).lastAutoTable.finalY + 12;

  // 5. Section 3: Paperwork Blockers & Missing Documents
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...PDF_COLORS.primaryDark);
  doc.text(`3. PAPERWORK & BILLING BLOCKERS (${missingDocs.length})`, PDF_PAGE.marginLeft, startY);
  startY += 6;

  const docRows = missingDocs.slice(0, 8).map((item) => [
    item.load.load_number,
    item.load.client?.company_name || 'Fleet',
    item.load.pipeline_status.toUpperCase(),
    item.missingDocs.map((d) => d.replace('_', ' ').toUpperCase()).join(', '),
    'Driver/Broker follow-up required before invoicing.',
  ]);

  if (docRows.length === 0) {
    docRows.push(['—', '—', 'CLEAN', 'All Rate Confirmations, BOLs, and signed PODs are up to date.', 'Ready to invoice']);
  }

  autoTable(doc, {
    startY,
    head: [['Load #', 'Carrier', 'Stage', 'Missing Required Documents', 'Dispatcher Action Required']],
    body: docRows,
    theme: 'grid',
    headStyles: {
      fillColor: PDF_COLORS.slate800,
      textColor: 255,
      fontStyle: 'bold',
      fontSize: 7.5,
      cellPadding: 4,
    },
    bodyStyles: {
      fontSize: 7,
      textColor: PDF_COLORS.primaryDark,
      cellPadding: 4,
    },
    columnStyles: {
      0: { cellWidth: 65, fontStyle: 'bold' },
      1: { cellWidth: 90 },
      2: { cellWidth: 65 },
      3: { cellWidth: 160, fontStyle: 'bold' },
      4: { cellWidth: 160 },
    },
    alternateRowStyles: {
      fillColor: PDF_COLORS.slate50,
    },
    margin: { left: PDF_PAGE.marginLeft, right: PDF_PAGE.marginLeft },
  });

  startY = (doc as any).lastAutoTable.finalY + 12;

  // 6. Section 4: Upcoming Scheduled Appointments (Next 24-48 Hours)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...PDF_COLORS.primaryDark);
  doc.text(`4. UPCOMING APPOINTMENTS (${upcomingAppointments.length} in next 48h)`, PDF_PAGE.marginLeft, startY);
  startY += 6;

  const apptRows = upcomingAppointments.slice(0, 8).map((apt) => {
    const dual = formatDualTime(apt.datetime, operationalTimezone, dispatcherTimezone);
    return [
      apt.type.toUpperCase(),
      apt.load.load_number,
      apt.location,
      `${dual.primary}\n(${dual.secondary})`,
      `${apt.load.driver?.full_name || 'Driver'} • ${apt.load.truck?.truck_number ? `Trk #${apt.load.truck.truck_number}` : ''}`,
    ];
  });

  if (apptRows.length === 0) {
    apptRows.push(['—', '—', 'No scheduled appointments in the upcoming 48-hour window.', '—', '—']);
  }

  autoTable(doc, {
    startY,
    head: [['Type', 'Load #', 'Facility Location', 'Scheduled Date / Time (Dual Timezone)', 'Assigned Driver / Unit']],
    body: apptRows,
    theme: 'grid',
    headStyles: {
      fillColor: PDF_COLORS.indigo,
      textColor: 255,
      fontStyle: 'bold',
      fontSize: 7.5,
      cellPadding: 4,
    },
    bodyStyles: {
      fontSize: 7,
      textColor: PDF_COLORS.primaryDark,
      cellPadding: 4,
    },
    columnStyles: {
      0: { cellWidth: 60, fontStyle: 'bold' },
      1: { cellWidth: 65, fontStyle: 'bold' },
      2: { cellWidth: 145 },
      3: { cellWidth: 140, fontStyle: 'bold' },
      4: { cellWidth: 130 },
    },
    alternateRowStyles: {
      fillColor: PDF_COLORS.slate50,
    },
    margin: { left: PDF_PAGE.marginLeft, right: PDF_PAGE.marginLeft },
  });

  startY = (doc as any).lastAutoTable.finalY + 12;

  // 7. Section 5: Open Tasks & Desk Follow-ups
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...PDF_COLORS.primaryDark);
  doc.text(`5. OPEN OPERATIONAL TASKS (${openTasks.length} Pending)`, PDF_PAGE.marginLeft, startY);
  startY += 6;

  const taskRows = openTasks.slice(0, 10).map((t) => {
    const categoryLabel = TASK_CATEGORY_CONFIG[t.category]?.shortLabel || t.category;
    const dueDual = formatDualTime(t.due_at, operationalTimezone, dispatcherTimezone);
    return [
      t.priority.toUpperCase(),
      categoryLabel,
      t.load_number ? `Load #${t.load_number}` : 'Desk General',
      t.title,
      t.assigned_to_name || 'Unassigned',
      `${dueDual.primary}`,
    ];
  });

  if (taskRows.length === 0) {
    taskRows.push(['NORMAL', 'DESK', '—', 'All operational reminders and tasks completed.', 'Team', 'Clean']);
  }

  autoTable(doc, {
    startY,
    head: [['Priority', 'Category', 'Ref / Load', 'Action Item Title', 'Assignee', 'Due (Ops TZ)']],
    body: taskRows,
    theme: 'grid',
    headStyles: {
      fillColor: PDF_COLORS.slate800,
      textColor: 255,
      fontStyle: 'bold',
      fontSize: 7.5,
      cellPadding: 4,
    },
    bodyStyles: {
      fontSize: 7,
      textColor: PDF_COLORS.primaryDark,
      cellPadding: 4,
    },
    columnStyles: {
      0: { cellWidth: 50, fontStyle: 'bold' },
      1: { cellWidth: 65 },
      2: { cellWidth: 70, fontStyle: 'bold' },
      3: { cellWidth: 165 },
      4: { cellWidth: 80 },
      5: { cellWidth: 110 },
    },
    alternateRowStyles: {
      fillColor: PDF_COLORS.slate50,
    },
    margin: { left: PDF_PAGE.marginLeft, right: PDF_PAGE.marginLeft },
  });

  startY = (doc as any).lastAutoTable.finalY + 12;

  // 8. Section 6: Recent Dispatcher Notes & Activity
  const notesOnly = recentActivities.filter(
    (a) => a.type === 'dispatcher_note' || a.type === 'broker_update' || a.type === 'driver_update'
  );

  if (notesOnly.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...PDF_COLORS.primaryDark);
    doc.text(`6. RECENT DISPATCHER COLLABORATION NOTES (${notesOnly.length})`, PDF_PAGE.marginLeft, startY);
    startY += 6;

    const noteRows = notesOnly.slice(0, 6).map((n) => [
      formatInTimezone(n.timestamp, operationalTimezone, { includeTime: true }),
      n.actorName,
      n.metadata?.loadNumber ? `Load #${n.metadata.loadNumber}` : n.loadId ? `Load ${n.loadId.slice(0, 8)}` : 'General',
      `${n.title}: ${n.description}`,
    ]);

    autoTable(doc, {
      startY,
      head: [['Timestamp', 'Dispatcher', 'Reference', 'Activity Log Note']],
      body: noteRows,
      theme: 'grid',
      headStyles: {
        fillColor: PDF_COLORS.slate700,
        textColor: 255,
        fontStyle: 'bold',
        fontSize: 7.5,
        cellPadding: 4,
      },
      bodyStyles: {
        fontSize: 7,
        textColor: PDF_COLORS.primaryDark,
        cellPadding: 4,
      },
      columnStyles: {
        0: { cellWidth: 95 },
        1: { cellWidth: 80, fontStyle: 'bold' },
        2: { cellWidth: 75, fontStyle: 'bold' },
        3: { cellWidth: 290 },
      },
      alternateRowStyles: {
        fillColor: PDF_COLORS.slate50,
      },
      margin: { left: PDF_PAGE.marginLeft, right: PDF_PAGE.marginLeft },
    });

    startY = (doc as any).lastAutoTable.finalY + 12;
  }

  // 9. Sign-off & Verification Card
  let signCy = drawCardBox(doc, PDF_PAGE.marginLeft, startY, PDF_PAGE.contentWidth, 42, 'Shift Handover Dispatcher Verification');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...PDF_COLORS.slate600);
  doc.text(`Outgoing Lead Dispatcher: ${dispatcherName}`, PDF_PAGE.marginLeft + PDF_CARD.contentPaddingX, signCy + 2);
  doc.text('Incoming Shift Receiver: ____________________________________', PDF_PAGE.marginLeft + 260, signCy + 2);

  // 10. Add Multi-Page Footers
  addDocumentFooters(doc, {
    documentRef: `Handover-${shiftName.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 20)}`,
    confidentialText: 'Operational Shift Handover Briefing Statement',
  });

  return doc;
}
