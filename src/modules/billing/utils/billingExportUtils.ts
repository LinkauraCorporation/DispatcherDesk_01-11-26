import { LoadWithRelations } from '../../loads/loadTypes.ts';
import { AccessorialClaim } from '../../accessorials/accessorialTypes.ts';
import { calculateProfitability, formatCurrency } from '../../../lib/calculations.ts';
import { LoadBillingSettlementSummary, BillingLineItem } from '../billingTypes.ts';

/**
 * Deterministic calculation engine for Invoice & Settlement totals.
 * Uses calculateProfitability as the single source of truth for base metrics.
 * Ensures approved accessorials are strictly separated from pending/rejected claims.
 */
export function calculateBillingSettlement(
  load: LoadWithRelations,
  accessorials: AccessorialClaim[] = [],
  dispatcherFeePercent: number = 8
): LoadBillingSettlementSummary {
  const primaryLinehaulRate = Math.max(0, Number(load.rate) || 0);

  // Filter accessorial claims by approval status
  const billableAccessorials = accessorials.filter(
    (a) => a.status === 'approved_on_rate_con' || a.status === 'invoiced'
  );

  const excludedAccessorials = accessorials.filter(
    (a) => a.status !== 'approved_on_rate_con' && a.status !== 'invoiced'
  );

  const approvedAccessorialsTotal = Number(
    billableAccessorials.reduce((sum, item) => sum + (Number(item.amount) || 0), 0).toFixed(2)
  );

  const pendingAccessorialsTotal = Number(
    excludedAccessorials
      .filter((a) => a.status === 'submitted_to_broker' || a.status === 'draft')
      .reduce((sum, item) => sum + (Number(item.amount) || 0), 0)
      .toFixed(2)
  );

  const rejectedAccessorialsTotal = Number(
    excludedAccessorials
      .filter((a) => a.status === 'rejected')
      .reduce((sum, item) => sum + (Number(item.amount) || 0), 0)
      .toFixed(2)
  );

  // Gross billed total = Primary linehaul + approved accessorials
  const grossBilledTotal = Number((primaryLinehaulRate + approvedAccessorialsTotal).toFixed(2));

  // Dispatcher fee percentage calculation
  const feePercent = Math.max(0, Number(dispatcherFeePercent) || 0);
  const dispatcherFeeAmount = Number(((grossBilledTotal * feePercent) / 100).toFixed(2));

  // Base expenses from load record
  const fuelExpense = Math.max(0, Number(load.fuel_expense) || 0);
  const driverPay = Math.max(0, Number(load.driver_pay) || 0);
  const otherExpenses = Math.max(0, Number(load.other_expenses) || 0);

  const totalDeductions = Number(
    (dispatcherFeeAmount + fuelExpense + driverPay + otherExpenses).toFixed(2)
  );

  // Net carrier settlement = Gross Billed Total - Dispatcher Fee
  const netCarrierSettlement = Number((grossBilledTotal - dispatcherFeeAmount).toFixed(2));

  const isDeliveredOrCompleted =
    load.pipeline_status === 'delivered' ||
    load.pipeline_status === 'invoiced' ||
    load.pipeline_status === 'paid';

  // Build granular line-items for display and exports
  const lineItems: BillingLineItem[] = [];

  // Linehaul
  lineItems.push({
    id: `item-lh-${load.id}`,
    category: 'linehaul',
    description: `Primary Freight Transportation (${load.origin_city}, ${load.origin_state} → ${load.dest_city}, ${load.dest_state})`,
    amount: primaryLinehaulRate,
    isBillable: true,
    isApproved: true,
  });

  // Approved accessorials
  billableAccessorials.forEach((acc) => {
    lineItems.push({
      id: `item-acc-${acc.id}`,
      category: 'accessorial',
      description: `${acc.type.replace('_', ' ').toUpperCase()}: ${acc.description || 'Approved Claim'}`,
      amount: Number(acc.amount) || 0,
      isBillable: true,
      isApproved: true,
      statusNote: acc.status === 'invoiced' ? 'Invoiced' : 'Approved on Rate Con',
    });
  });

  // Excluded accessorials (non-billable)
  excludedAccessorials.forEach((acc) => {
    lineItems.push({
      id: `item-acc-excluded-${acc.id}`,
      category: 'accessorial',
      description: `${acc.type.replace('_', ' ').toUpperCase()} (EXCLUDED): ${acc.description || 'Pending/Disputed'}`,
      amount: Number(acc.amount) || 0,
      isBillable: false,
      isApproved: false,
      statusNote: acc.status === 'rejected' ? 'Disputed / Rejected' : 'Pending Broker Approval',
    });
  });

  return {
    loadId: load.id,
    loadNumber: load.load_number,
    primaryLinehaulRate,
    approvedAccessorialsTotal,
    pendingAccessorialsTotal,
    rejectedAccessorialsTotal,
    grossBilledTotal,
    dispatcherFeePercent: feePercent,
    dispatcherFeeAmount,
    fuelExpense,
    driverPay,
    otherExpenses,
    totalDeductions,
    netCarrierSettlement,
    isDeliveredOrCompleted,
    billableAccessorials,
    excludedAccessorials,
    lineItems,
  };
}

/**
 * Utility to download CSV file in browser
 */
export function downloadCsvFile(filename: string, csvContent: string): void {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Escapes CSV cell values to prevent breaking commas or quotes
 */
function escapeCsvCell(val: string | number | null | undefined): string {
  if (val === null || val === undefined) return '""';
  const str = String(val).replace(/"/g, '""');
  return `"${str}"`;
}

/**
 * Exports a single load Broker Invoice as CSV
 */
export function exportBrokerInvoiceCsv(
  load: LoadWithRelations,
  summary: LoadBillingSettlementSummary
): void {
  const headers = ['Line Item ID', 'Category', 'Description', 'Billable', 'Status', 'Amount (USD)'];
  const rows: string[][] = [];

  summary.lineItems.forEach((item) => {
    rows.push([
      item.id,
      item.category.toUpperCase(),
      item.description,
      item.isBillable ? 'YES' : 'NO',
      item.statusNote || (item.isApproved ? 'Approved' : 'Pending/Excluded'),
      item.amount.toFixed(2),
    ]);
  });

  // Summary footer rows
  rows.push(['', '', '', '', 'PRIMARY FREIGHT RATE', summary.primaryLinehaulRate.toFixed(2)]);
  rows.push(['', '', '', '', 'APPROVED ACCESSORIALS', summary.approvedAccessorialsTotal.toFixed(2)]);
  rows.push(['', '', '', '', 'TOTAL INVOICE GROSS DUE', summary.grossBilledTotal.toFixed(2)]);

  const metaRows = [
    ['DOCUMENT', 'COMMERCIAL FREIGHT BROKER INVOICE'],
    ['INVOICE NUMBER', `INV-${load.load_number}`],
    ['LOAD NUMBER', load.load_number],
    ['INVOICE DATE', new Date().toISOString().split('T')[0]],
    ['PAYER / BROKER', load.broker?.company_name || 'Direct Broker'],
    ['CARRIER / REMIT TO', load.client?.company_name || 'Fleet Carrier'],
    ['ORIGIN', `${load.origin_city}, ${load.origin_state}`],
    ['DESTINATION', `${load.dest_city}, ${load.dest_state}`],
    ['EQUIPMENT', load.equipment_type.replace('_', ' ').toUpperCase()],
    ['COMMODITY', load.commodity || 'General Freight'],
    [],
  ];

  const csvContent =
    metaRows.map((r) => r.map(escapeCsvCell).join(',')).join('\n') +
    '\n' +
    headers.map(escapeCsvCell).join(',') +
    '\n' +
    rows.map((r) => r.map(escapeCsvCell).join(',')).join('\n');

  downloadCsvFile(`Invoice_${load.load_number}.csv`, csvContent);
}

/**
 * Exports a single load Carrier Settlement Statement as CSV
 */
export function exportCarrierSettlementCsv(
  load: LoadWithRelations,
  summary: LoadBillingSettlementSummary
): void {
  const headers = ['Item Code', 'Description', 'Type', 'Rate/Percent', 'Amount (USD)'];
  const rows: string[][] = [];

  // Line items
  rows.push([
    'LINEHAUL',
    `Gross Freight (${load.origin_city}, ${load.origin_state} -> ${load.dest_city}, ${load.dest_state})`,
    'Earning',
    '100%',
    summary.primaryLinehaulRate.toFixed(2),
  ]);

  summary.billableAccessorials.forEach((acc) => {
    rows.push([
      `ACC-${acc.type.toUpperCase()}`,
      `Approved ${acc.type.replace('_', ' ')}: ${acc.description || ''}`,
      'Earning',
      '—',
      acc.amount.toFixed(2),
    ]);
  });

  rows.push([
    'GROSS-TOTAL',
    'Total Gross Freight Revenue',
    'Total Revenue',
    '—',
    summary.grossBilledTotal.toFixed(2),
  ]);

  rows.push([
    'DISP-FEE',
    `Dispatcher Management Fee (${summary.dispatcherFeePercent}%)`,
    'Deduction',
    `${summary.dispatcherFeePercent}%`,
    `-${summary.dispatcherFeeAmount.toFixed(2)}`,
  ]);

  if (summary.fuelExpense > 0) {
    rows.push([
      'FUEL',
      'Fuel Advance / Operating Expense',
      'Deduction',
      '—',
      `-${summary.fuelExpense.toFixed(2)}`,
    ]);
  }

  if (summary.driverPay > 0) {
    rows.push([
      'DRIVER-PAY',
      `Driver Pay Allocation (${load.driver?.full_name || 'Assigned Driver'})`,
      'Expense',
      '—',
      `-${summary.driverPay.toFixed(2)}`,
    ]);
  }

  if (summary.otherExpenses > 0) {
    rows.push([
      'OTHER-EXP',
      'Other Dispatched Expenses',
      'Deduction',
      '—',
      `-${summary.otherExpenses.toFixed(2)}`,
    ]);
  }

  rows.push([
    'NET-CARRIER',
    'Net Carrier Settlement Due',
    'Net Payable',
    '—',
    summary.netCarrierSettlement.toFixed(2),
  ]);

  const metaRows = [
    ['DOCUMENT', 'CARRIER SETTLEMENT STATEMENT'],
    ['SETTLEMENT NUMBER', `SET-${load.load_number}`],
    ['LOAD NUMBER', load.load_number],
    ['CARRIER / CLIENT', load.client?.company_name || 'Fleet Carrier'],
    ['TRUCK UNIT', load.truck ? `#${load.truck.truck_number}` : 'Unassigned'],
    ['DRIVER', load.driver?.full_name || 'Unassigned'],
    ['STATEMENT DATE', new Date().toISOString().split('T')[0]],
    ['DISPATCHER COMMISSION', `${summary.dispatcherFeePercent}%`],
    [],
  ];

  const csvContent =
    metaRows.map((r) => r.map(escapeCsvCell).join(',')).join('\n') +
    '\n' +
    headers.map(escapeCsvCell).join(',') +
    '\n' +
    rows.map((r) => r.map(escapeCsvCell).join(',')).join('\n');

  downloadCsvFile(`Settlement_${load.load_number}.csv`, csvContent);
}

/**
 * Bulk billing export for multiple loads (all loads or selected filtered loads)
 */
export function exportBulkLoadsBillingCsv(
  loads: LoadWithRelations[],
  accessorialsMap: Record<string, AccessorialClaim[]> = {},
  dispatcherFeePercent: number = 8
): void {
  const headers = [
    'Load #',
    'Pipeline Status',
    'Carrier / Fleet',
    'Broker / Customer',
    'Origin',
    'Destination',
    'Total Miles',
    'Equipment',
    'Base Linehaul Rate ($)',
    'Approved Accessorials ($)',
    'Gross Billed Total ($)',
    `Dispatcher Fee (${dispatcherFeePercent}%) ($)`,
    'Fuel Expense ($)',
    'Driver Pay ($)',
    'Other Expenses ($)',
    'Net Carrier Settlement ($)',
    'Billing Readiness',
  ];

  const rows = loads.map((load) => {
    const claims = accessorialsMap[load.id] || [];
    const summary = calculateBillingSettlement(load, claims, dispatcherFeePercent);
    const totalMiles = (load.loaded_miles || 0) + (load.deadhead_miles || 0);

    return [
      load.load_number,
      load.pipeline_status.toUpperCase(),
      load.client?.company_name || 'Unassigned',
      load.broker?.company_name || 'Direct Broker',
      `${load.origin_city}, ${load.origin_state}`,
      `${load.dest_city}, ${load.dest_state}`,
      totalMiles.toString(),
      load.equipment_type.replace('_', ' ').toUpperCase(),
      summary.primaryLinehaulRate.toFixed(2),
      summary.approvedAccessorialsTotal.toFixed(2),
      summary.grossBilledTotal.toFixed(2),
      summary.dispatcherFeeAmount.toFixed(2),
      summary.fuelExpense.toFixed(2),
      summary.driverPay.toFixed(2),
      summary.otherExpenses.toFixed(2),
      summary.netCarrierSettlement.toFixed(2),
      summary.isDeliveredOrCompleted ? 'READY_TO_BILL' : 'IN_TRANSIT_OR_PENDING',
    ].map(escapeCsvCell);
  });

  const headerRow = headers.map(escapeCsvCell).join(',');
  const csvContent = [headerRow, ...rows.map((r) => r.join(','))].join('\n');

  const safeDate = new Date().toISOString().split('T')[0];
  downloadCsvFile(`Dispatch_Billing_Summary_${safeDate}.csv`, csvContent);
}
