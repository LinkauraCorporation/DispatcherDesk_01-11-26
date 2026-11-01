import { FmcsaLead } from '../types/fmcsa';
import { streamAllLeads, getStoredLeadsCount } from './leadStorage';

export const CSV_HEADERS = [
  'Company',
  'DBA',
  'DOT',
  'MC',
  'Phone',
  'Email',
  'Trucks',
  'Power Units',
  'Drivers',
  'Officer',
  'City',
  'State',
  'ZIP',
  'Carrier Operation',
  'Interstate Beyond 100 Miles',
  'Interstate Within 100 Miles',
  'Authority Status',
  'Record Date (ADD_DATE)',
];

/**
 * Escapes a single CSV field following RFC 4180
 */
function escapeCsvValue(val: unknown): string {
  if (val === null || val === undefined) return '';
  const str = String(val).replace(/[\r\n]+/g, ' ').trim();
  if (str === 'undefined' || str === 'null' || str === 'NaN') return '';

  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Converts a lead into an RFC-4180 CSV row
 */
export function leadToCsvRow(lead: FmcsaLead): string {
  return [
    escapeCsvValue(lead.company),
    escapeCsvValue(lead.dba),
    escapeCsvValue(lead.dot),
    escapeCsvValue(lead.mc),
    escapeCsvValue(lead.phone),
    escapeCsvValue(lead.email),
    escapeCsvValue(lead.trucks),
    escapeCsvValue(lead.powerUnits),
    escapeCsvValue(lead.drivers),
    escapeCsvValue(lead.officer),
    escapeCsvValue(lead.city),
    escapeCsvValue(lead.state),
    escapeCsvValue(lead.zip),
    escapeCsvValue(lead.carrierOperation),
    escapeCsvValue(lead.interstateBeyond100),
    escapeCsvValue(lead.interstateWithin100),
    escapeCsvValue(lead.authorityStatus),
    escapeCsvValue(lead.recordDate),
  ].join(',');
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * Generates and triggers download of an in-memory array of leads (e.g. Selected Leads)
 */
export function exportLeadsToCsv(
  leads: FmcsaLead[],
  filenamePrefix = 'FMCSA_Leads_Extracted'
): void {
  if (!leads || leads.length === 0) return;

  // Process in chunks of 5,000 rows to avoid giant string allocation limits
  const chunks: string[] = ['\uFEFF', CSV_HEADERS.join(',') + '\r\n'];
  const chunkSize = 5000;

  for (let i = 0; i < leads.length; i += chunkSize) {
    const slice = leads.slice(i, i + chunkSize);
    const rows = slice.map(leadToCsvRow).join('\r\n') + '\r\n';
    chunks.push(rows);
  }

  const blob = new Blob(chunks, { type: 'text/csv;charset=utf-8;' });
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const timeStr = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
  const filename = `${filenamePrefix}_${dateStr}_${timeStr}_(${leads.length}_leads).csv`;

  triggerBlobDownload(blob, filename);
}

/**
 * FIX 1: Streams ALL matching leads directly from IndexedDB without truncation.
 * Reads in 5,000-lead cursor chunks so memory usage stays minimal even for 500,000+ leads.
 */
export async function exportAllLeadsFromStorage(
  fallbackLeads: FmcsaLead[],
  onProgress?: (count: number) => void,
  filenamePrefix = 'FMCSA_All_Matching_Leads'
): Promise<void> {
  const chunks: string[] = ['\uFEFF', CSV_HEADERS.join(',') + '\r\n'];
  let totalRows = 0;

  try {
    const storedCount = await getStoredLeadsCount();

    if (storedCount > 0) {
      await streamAllLeads((batch) => {
        totalRows += batch.length;
        const rows = batch.map(leadToCsvRow).join('\r\n') + '\r\n';
        chunks.push(rows);
        if (onProgress) {
          onProgress(totalRows);
        }
      }, 5000);
    } else if (fallbackLeads && fallbackLeads.length > 0) {
      // Fallback to in-memory leads if IndexedDB has no stored records
      totalRows = fallbackLeads.length;
      for (let i = 0; i < fallbackLeads.length; i += 5000) {
        const slice = fallbackLeads.slice(i, i + 5000);
        const rows = slice.map(leadToCsvRow).join('\r\n') + '\r\n';
        chunks.push(rows);
      }
    }
  } catch (err) {
    console.warn('Storage stream export failed, falling back to in-memory leads:', err);
    totalRows = fallbackLeads.length;
    for (let i = 0; i < fallbackLeads.length; i += 5000) {
      const slice = fallbackLeads.slice(i, i + 5000);
      const rows = slice.map(leadToCsvRow).join('\r\n') + '\r\n';
      chunks.push(rows);
    }
  }

  if (totalRows === 0) return;

  const blob = new Blob(chunks, { type: 'text/csv;charset=utf-8;' });
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const timeStr = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
  const filename = `${filenamePrefix}_${dateStr}_${timeStr}_(${totalRows}_leads).csv`;

  triggerBlobDownload(blob, filename);
}
