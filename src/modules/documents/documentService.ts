import { Document, Load, DocumentType, DocumentStatus } from '../../types/domain.types.ts';
import { Database } from '../../types/database.types.ts';
import { loadService } from '../loads/loadService.ts';
import { activityService } from '../activity/activityService.ts';
import { supabase, isSupabaseConfigured } from '../../lib/supabase.ts';
import {
  FreightDocument,
  CreateDocumentInput,
  UpdateDocumentInput,
  DocumentFilterCriteria,
  LoadDocumentSummary,
  DocumentStats,
  DocumentChecklistItem,
  DOCUMENT_TYPE_LABELS,
  DOCUMENT_TYPE_SHORT_LABELS,
  getRequiredDocumentsForLoadStatus,
} from './documentTypes.ts';

const DOCUMENTS_STORAGE_PREFIX = 'dispatchdesk_demo_documents_';
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const DEMO_ORGANIZATION_ID = 'demo-org-1';

function isUUID(str?: string | null): boolean {
  return Boolean(str && UUID_REGEX.test(str.trim()));
}

// Initial realistic seed documents for the demo organization
const SEED_DOCUMENTS: Omit<Document, 'organization_id'>[] = [
  {
    id: 'demo-doc-1',
    load_id: 'demo-load-1', // LD-2024-8841 (booked)
    doc_type: 'rate_confirmation',
    doc_status: 'verified',
    file_path: 'freight-documents/demo-org-1/demo-load-1/RateCon_Apex_8841.pdf',
    file_name: 'RateCon_Apex_8841.pdf',
    file_size_bytes: 342100, // ~334 KB
    mime_type: 'application/pdf',
    uploaded_by: 'Sarah Jenkins (Apex Broker)',
    notes: 'Signed rate confirmation received via Apex EDI. Fuel surcharge and detention terms agreed at $75/hr after 2 hrs.',
    created_at: new Date(Date.now() - 4 * 86400000).toISOString(),
    updated_at: new Date(Date.now() - 3 * 86400000).toISOString(),
  },
  {
    id: 'demo-doc-2',
    load_id: 'demo-load-2', // LD-2024-8842 (in_transit)
    doc_type: 'rate_confirmation',
    doc_status: 'verified',
    file_path: 'freight-documents/demo-org-1/demo-load-2/RateCon_BlueRidge_8842.pdf',
    file_name: 'RateCon_BlueRidge_8842.pdf',
    file_size_bytes: 419200,
    mime_type: 'application/pdf',
    uploaded_by: 'Brandon Cole',
    notes: 'Rate con signed for 44k lbs reefer produce. Continuous temperature monitoring active at 34°F.',
    created_at: new Date(Date.now() - 3 * 86400000).toISOString(),
    updated_at: new Date(Date.now() - 2 * 86400000).toISOString(),
  },
  {
    id: 'demo-doc-3',
    load_id: 'demo-load-2', // LD-2024-8842 (in_transit)
    doc_type: 'bol',
    doc_status: 'received',
    file_path: 'freight-documents/demo-org-1/demo-load-2/BOL_Shipper_Signed_8842.pdf',
    file_name: 'BOL_Shipper_Signed_8842.pdf',
    file_size_bytes: 885000,
    mime_type: 'application/pdf',
    uploaded_by: 'Driver Elena Rostova',
    notes: 'Shipper signed clean BOL at Salinas packing house. 22 pallets loaded, seal #774921.',
    created_at: new Date(Date.now() - 2 * 86400000).toISOString(),
    updated_at: new Date(Date.now() - 2 * 86400000).toISOString(),
  },
  {
    id: 'demo-doc-4',
    load_id: 'demo-load-3', // LD-2024-8843 (delivered)
    doc_type: 'rate_confirmation',
    doc_status: 'verified',
    file_path: 'freight-documents/demo-org-1/demo-load-3/RateCon_Horizon_8843.pdf',
    file_name: 'RateCon_Horizon_8843.pdf',
    file_size_bytes: 298400,
    mime_type: 'application/pdf',
    uploaded_by: 'Amanda Cross',
    notes: 'Horizon Express flatbed rate confirmation.',
    created_at: new Date(Date.now() - 5 * 86400000).toISOString(),
    updated_at: new Date(Date.now() - 4 * 86400000).toISOString(),
  },
  {
    id: 'demo-doc-5',
    load_id: 'demo-load-3', // LD-2024-8843 (delivered)
    doc_type: 'bol',
    doc_status: 'verified',
    file_path: 'freight-documents/demo-org-1/demo-load-3/BOL_Pickup_Signed_8843.pdf',
    file_name: 'BOL_Pickup_Signed_8843.pdf',
    file_size_bytes: 612000,
    mime_type: 'application/pdf',
    uploaded_by: 'Driver Marcus Vance',
    notes: 'Clean pickup BOL stamped by Gary Steel Mill.',
    created_at: new Date(Date.now() - 4 * 86400000).toISOString(),
    updated_at: new Date(Date.now() - 3 * 86400000).toISOString(),
  },
  {
    id: 'demo-doc-6',
    load_id: 'demo-load-3', // LD-2024-8843 (delivered)
    doc_type: 'pod',
    doc_status: 'pending',
    file_path: 'freight-documents/demo-org-1/demo-load-3/Signed_POD_Rec_8843.jpg',
    file_name: 'Signed_POD_Rec_8843.jpg',
    file_size_bytes: 1420000,
    mime_type: 'image/jpeg',
    uploaded_by: 'Driver Marcus Vance',
    notes: 'Receiver stamped delivery receipt. Awaiting dispatcher audit for unloader signature verification.',
    created_at: new Date(Date.now() - 1 * 86400000).toISOString(),
    updated_at: new Date(Date.now() - 1 * 86400000).toISOString(),
  },
  {
    id: 'demo-doc-7',
    load_id: 'demo-load-4', // LD-2024-8844 (invoiced)
    doc_type: 'rate_confirmation',
    doc_status: 'verified',
    file_path: 'freight-documents/demo-org-1/demo-load-4/RateCon_Keystone_8844.pdf',
    file_name: 'RateCon_Keystone_8844.pdf',
    file_size_bytes: 312000,
    mime_type: 'application/pdf',
    uploaded_by: 'David Morrison',
    notes: 'Rate con verified.',
    created_at: new Date(Date.now() - 7 * 86400000).toISOString(),
    updated_at: new Date(Date.now() - 6 * 86400000).toISOString(),
  },
  {
    id: 'demo-doc-8',
    load_id: 'demo-load-4', // LD-2024-8844 (invoiced)
    doc_type: 'bol',
    doc_status: 'verified',
    file_path: 'freight-documents/demo-org-1/demo-load-4/BOL_Signed_8844.pdf',
    file_name: 'BOL_Signed_8844.pdf',
    file_size_bytes: 540000,
    mime_type: 'application/pdf',
    uploaded_by: 'Driver David Chen',
    notes: 'Shipper signed.',
    created_at: new Date(Date.now() - 6 * 86400000).toISOString(),
    updated_at: new Date(Date.now() - 5 * 86400000).toISOString(),
  },
  {
    id: 'demo-doc-9',
    load_id: 'demo-load-4', // LD-2024-8844 (invoiced)
    doc_type: 'pod',
    doc_status: 'verified',
    file_path: 'freight-documents/demo-org-1/demo-load-4/POD_Delivery_8844.pdf',
    file_name: 'POD_Delivery_8844.pdf',
    file_size_bytes: 780000,
    mime_type: 'application/pdf',
    uploaded_by: 'Driver David Chen',
    notes: 'Signed and dated POD with receiver stamp.',
    created_at: new Date(Date.now() - 4 * 86400000).toISOString(),
    updated_at: new Date(Date.now() - 3 * 86400000).toISOString(),
  },
  {
    id: 'demo-doc-10',
    load_id: 'demo-load-4', // LD-2024-8844 (invoiced)
    doc_type: 'invoice',
    doc_status: 'verified',
    file_path: 'freight-documents/demo-org-1/demo-load-4/Invoice_DD_8844.pdf',
    file_name: 'Invoice_DD_8844.pdf',
    file_size_bytes: 245000,
    mime_type: 'application/pdf',
    uploaded_by: 'Admin / Billing Dept',
    notes: 'Factoring billing packet generated and submitted to OTR Capital.',
    created_at: new Date(Date.now() - 2 * 86400000).toISOString(),
    updated_at: new Date(Date.now() - 1 * 86400000).toISOString(),
  },
];

export interface IDocumentService {
  listDocuments(orgId: string, filters?: DocumentFilterCriteria): Promise<FreightDocument[]>;
  getDocument(orgId: string, id: string): Promise<FreightDocument | null>;
  createDocument(orgId: string, input: CreateDocumentInput, file?: File | Blob): Promise<FreightDocument>;
  updateDocument(orgId: string, id: string, input: UpdateDocumentInput): Promise<FreightDocument>;
  updateDocumentStatus(orgId: string, id: string, status: DocumentStatus, notes?: string): Promise<FreightDocument>;
  deleteDocument(orgId: string, id: string): Promise<void>;
  getDocumentsForLoad(orgId: string, loadId: string): Promise<FreightDocument[]>;
  getDocumentSummaryForLoad(orgId: string, load: Load): Promise<LoadDocumentSummary>;
  getMissingDocuments(orgId: string): Promise<{ load: Load; missingDocs: DocumentType[]; summary: LoadDocumentSummary }[]>;
  getDocumentStats(orgId: string): Promise<DocumentStats>;
  uploadStorageFile?(orgId: string, loadId: string, file: File | Blob, customFileName?: string): Promise<{ filePath: string; storagePath: string }>;
  getDownloadUrl?(orgId: string, filePath: string): Promise<string | null>;
  downloadStorageFile?(orgId: string, filePath: string): Promise<Blob | null>;
}

class DocumentService implements IDocumentService {
  private getStorageKey(orgId: string): string {
    return `${DOCUMENTS_STORAGE_PREFIX}${orgId}`;
  }

  private readRawDocs(orgId: string): Document[] {
    try {
      const data = localStorage.getItem(this.getStorageKey(orgId));
      if (!data) {
        if (isUUID(orgId) && orgId !== DEMO_ORGANIZATION_ID) {
          return [];
        }
        // Seed default documents for demo tenant
        const seeded: Document[] = SEED_DOCUMENTS.map((doc) => ({
          ...doc,
          organization_id: orgId,
        }));
        this.writeRawDocs(orgId, seeded);
        return seeded;
      }
      const parsed = JSON.parse(data);
      if (!Array.isArray(parsed)) return [];
      // Guarantee tenant isolation
      return parsed
        .filter((d: Document) => d && d.organization_id === orgId)
        .filter((d: Document) => !(isUUID(orgId) && orgId !== DEMO_ORGANIZATION_ID && typeof d.id === 'string' && d.id.startsWith('demo-doc-')));
    } catch {
      return [];
    }
  }

  private writeRawDocs(orgId: string, docs: Document[]): void {
    const tenantDocs = docs.filter((d) => d.organization_id === orgId);
    localStorage.setItem(this.getStorageKey(orgId), JSON.stringify(tenantDocs));
  }

  private async joinLoads(orgId: string, docs: Document[]): Promise<FreightDocument[]> {
    try {
      const loads = await loadService.getLoads(orgId);
      const loadMap = new Map<string, Load>();
      loads.forEach((l) => loadMap.set(l.id, l));

      return docs.map((doc) => {
        const load = doc.load_id ? loadMap.get(doc.load_id) || null : null;
        return {
          ...doc,
          load_number: load?.load_number || null,
          load,
        };
      });
    } catch {
      return docs.map((doc) => ({
        ...doc,
        load_number: null,
        load: null,
      }));
    }
  }

  private async getCurrentUserId(): Promise<string | null> {
    if (!isSupabaseConfigured) return null;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      return user?.id || null;
    } catch {
      return null;
    }
  }

  async listDocuments(orgId: string, filters?: DocumentFilterCriteria): Promise<FreightDocument[]> {
    let rawDocs: Document[] = [];

    if (isSupabaseConfigured && isUUID(orgId)) {
      let query = supabase
        .from('documents')
        .select('*')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false });

      if (filters?.doc_type && filters.doc_type !== 'all') {
        query = query.eq('doc_type', filters.doc_type as DocumentType);
      }
      if (filters?.doc_status && filters.doc_status !== 'all') {
        query = query.eq('doc_status', filters.doc_status as DocumentStatus);
      }
      if (filters?.load_id && isUUID(filters.load_id)) {
        query = query.eq('load_id', filters.load_id);
      }

      const { data, error } = await query;
      if (error) {
        console.error('[DocumentService] Supabase listDocuments error:', error);
        throw new Error(error.message || 'Failed to fetch documents from database.');
      }
      rawDocs = (data || []) as Document[];
    } else if (isSupabaseConfigured) {
      try {
        let query = supabase
          .from('documents')
          .select('*')
          .eq('organization_id', orgId)
          .order('created_at', { ascending: false });

        if (filters?.doc_type && filters.doc_type !== 'all') {
          query = query.eq('doc_type', filters.doc_type as DocumentType);
        }
        if (filters?.doc_status && filters.doc_status !== 'all') {
          query = query.eq('doc_status', filters.doc_status as DocumentStatus);
        }
        if (filters?.load_id) {
          query = query.eq('load_id', filters.load_id);
        }

        const { data, error } = await query;

        if (!error && data) {
          rawDocs = data as Document[];
        }
      } catch (err) {
        console.warn('Supabase listDocuments failed, falling back to local storage:', err);
      }
    }

    if (rawDocs.length === 0 && (!isUUID(orgId) || orgId === DEMO_ORGANIZATION_ID)) {
      rawDocs = this.readRawDocs(orgId);
    }

    let joined = await this.joinLoads(orgId, rawDocs);

    // Access control: dispatchers and staff can only see documents for loads assigned to them
    const effectiveRole =
      typeof localStorage !== 'undefined' ? localStorage.getItem('dispatchdesk_current_role') : null;
    if (effectiveRole === 'dispatcher' || effectiveRole === 'staff') {
      joined = joined.filter((d) => !d.load_id || Boolean(d.load));
    }

    if (!filters) {
      return joined.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }

    if (filters.search) {
      const q = filters.search.toLowerCase().trim();
      joined = joined.filter((d) => {
        const matchesLoad = d.load_number?.toLowerCase().includes(q) || false;
        const matchesFileName = d.file_name?.toLowerCase().includes(q) || false;
        const matchesNotes = d.notes?.toLowerCase().includes(q) || false;
        const matchesType = (DOCUMENT_TYPE_LABELS[d.doc_type] || '').toLowerCase().includes(q);
        const matchesOriginDest =
          (d.load?.origin_city.toLowerCase().includes(q) || false) ||
          (d.load?.dest_city.toLowerCase().includes(q) || false);

        return matchesLoad || matchesFileName || matchesNotes || matchesType || matchesOriginDest;
      });
    }

    if (filters.doc_type && filters.doc_type !== 'all') {
      joined = joined.filter((d) => d.doc_type === filters.doc_type);
    }

    if (filters.doc_status && filters.doc_status !== 'all') {
      joined = joined.filter((d) => d.doc_status === filters.doc_status);
    }

    if (filters.load_id) {
      joined = joined.filter((d) => d.load_id === filters.load_id);
    }

    if (filters.load_status && filters.load_status !== 'all') {
      joined = joined.filter((d) => d.load?.pipeline_status === filters.load_status);
    }

    if (filters.date_range && filters.date_range !== 'all') {
      const now = new Date();
      const todayStr = now.toISOString().split('T')[0];

      joined = joined.filter((d) => {
        const docDate = d.created_at.split('T')[0];
        if (filters.date_range === 'today') {
          return docDate === todayStr;
        }
        if (filters.date_range === 'this_week') {
          const docTime = new Date(d.created_at).getTime();
          const oneWeekAgo = now.getTime() - 7 * 86400000;
          return docTime >= oneWeekAgo;
        }
        if (filters.date_range === 'this_month') {
          const docTime = new Date(d.created_at).getTime();
          const oneMonthAgo = now.getTime() - 30 * 86400000;
          return docTime >= oneMonthAgo;
        }
        return true;
      });
    }

    return joined.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  async getDocument(orgId: string, id: string): Promise<FreightDocument | null> {
    if (isSupabaseConfigured && isUUID(orgId)) {
      if (orgId !== DEMO_ORGANIZATION_ID) {
        if (!isUUID(id)) return null;
        const { data, error } = await supabase
          .from('documents')
          .select('*')
          .eq('organization_id', orgId)
          .eq('id', id)
          .maybeSingle();

        if (error) {
          console.error('[DocumentService] Supabase getDocument error:', error);
          throw new Error(error.message || 'Failed to fetch document from database.');
        }

        if (data) {
          const [joined] = await this.joinLoads(orgId, [data as Document]);
          return this.isDocumentAuthorized(joined) ? joined : null;
        }
        return null;
      }

      if (isUUID(id)) {
        const { data, error } = await supabase
          .from('documents')
          .select('*')
          .eq('organization_id', orgId)
          .eq('id', id)
          .maybeSingle();

        if (error) {
          console.error('[DocumentService] Supabase getDocument error:', error);
          throw new Error(error.message || 'Failed to fetch document from database.');
        }

        if (data) {
          const [joined] = await this.joinLoads(orgId, [data as Document]);
          return this.isDocumentAuthorized(joined) ? joined : null;
        }
        return null;
      }
    }

    if (isSupabaseConfigured) {
      try {
        const { data, error } = await supabase
          .from('documents')
          .select('*')
          .eq('organization_id', orgId)
          .eq('id', id)
          .maybeSingle();

        if (!error && data) {
          const [joined] = await this.joinLoads(orgId, [data as Document]);
          return this.isDocumentAuthorized(joined) ? joined : null;
        }
      } catch (err) {
        console.warn('Supabase getDocument failed, falling back to local storage:', err);
      }
    }

    if (isUUID(orgId) && orgId !== DEMO_ORGANIZATION_ID) {
      return null;
    }

    const raw = this.readRawDocs(orgId);
    const doc = raw.find((d) => d.id === id && d.organization_id === orgId);
    if (!doc) return null;
    const [joined] = await this.joinLoads(orgId, [doc]);
    return this.isDocumentAuthorized(joined) ? joined : null;
  }

  private isDocumentAuthorized(doc?: FreightDocument | null): boolean {
    if (!doc) return false;
    const effectiveRole =
      typeof localStorage !== 'undefined' ? localStorage.getItem('dispatchdesk_current_role') : null;
    if (effectiveRole === 'dispatcher' || effectiveRole === 'staff') {
      if (doc.load_id && !doc.load) {
        return false;
      }
    }
    return true;
  }

  async createDocument(orgId: string, input: CreateDocumentInput, file?: File | Blob): Promise<FreightDocument> {
    const cleanFileName = input.file_name.trim();
    const storageLoadSegment = input.load_id || 'unlinked';
    const storagePath = `${orgId}/${storageLoadSegment}/${cleanFileName}`;
    let finalFilePath = `freight-documents/${storagePath}`;

    // 1. Upload to Supabase Storage if binary provided
    if (isSupabaseConfigured && file) {
      try {
        const { error: uploadError } = await supabase.storage
          .from('freight-documents')
          .upload(storagePath, file, {
            upsert: true,
            contentType: input.mime_type || file.type || 'application/octet-stream',
          });

        if (uploadError) {
          console.warn('Supabase storage upload notice:', uploadError.message);
        } else {
          finalFilePath = storagePath;
        }
      } catch (err) {
        console.warn('Supabase storage upload error:', err);
      }
    }

    // 2. Persist to Supabase Database
    if (isSupabaseConfigured && isUUID(orgId)) {
      let uploaderUserId: string | null = null;
      if (isUUID(input.uploaded_by)) {
        uploaderUserId = input.uploaded_by!;
      } else {
        uploaderUserId = await this.getCurrentUserId();
      }

      const insertPayload = {
        organization_id: orgId,
        load_id: isUUID(input.load_id) ? input.load_id : null,
        doc_type: input.doc_type,
        doc_status: input.doc_status || 'received',
        file_path: finalFilePath,
        file_name: cleanFileName,
        file_size_bytes: input.file_size_bytes || null,
        mime_type: input.mime_type || 'application/pdf',
        uploaded_by: uploaderUserId,
        notes: input.notes?.trim() || null,
      };

      const { data, error } = await supabase
        .from('documents')
        .insert(insertPayload)
        .select()
        .single();

      if (error) {
        console.error('[DocumentService] Supabase createDocument error:', error);
        throw new Error(error.message || 'Failed to create document in database.');
      }

      if (data) {
        const createdDoc = data as Document;

        // Auto-record document activity
        if (createdDoc.load_id) {
          activityService.recordDocumentEvent(
            orgId,
            createdDoc.load_id,
            createdDoc.doc_type,
            createdDoc.file_name || 'document',
            'uploaded',
            input.uploaded_by || 'Dispatcher',
            undefined,
            createdDoc.doc_status
          ).catch(() => {});
        }

        const [joined] = await this.joinLoads(orgId, [createdDoc]);
        return joined;
      }
      throw new Error('Unexpected empty response while creating document.');
    }

    if (isSupabaseConfigured) {
      try {
        let uploaderUserId: string | null = null;
        if (isUUID(input.uploaded_by)) {
          uploaderUserId = input.uploaded_by!;
        } else {
          uploaderUserId = await this.getCurrentUserId();
        }

        const insertPayload = {
          organization_id: orgId,
          load_id: isUUID(input.load_id) ? input.load_id : null,
          doc_type: input.doc_type,
          doc_status: input.doc_status || 'received',
          file_path: finalFilePath,
          file_name: cleanFileName,
          file_size_bytes: input.file_size_bytes || null,
          mime_type: input.mime_type || 'application/pdf',
          uploaded_by: uploaderUserId,
          notes: input.notes?.trim() || null,
        };

        const { data, error } = await supabase
          .from('documents')
          .insert(insertPayload)
          .select()
          .single();

        if (!error && data) {
          const createdDoc = data as Document;

          // Auto-record document activity
          if (createdDoc.load_id) {
            activityService.recordDocumentEvent(
              orgId,
              createdDoc.load_id,
              createdDoc.doc_type,
              createdDoc.file_name || 'document',
              'uploaded',
              input.uploaded_by || 'Dispatcher',
              undefined,
              createdDoc.doc_status
            ).catch(() => {});
          }

          const [joined] = await this.joinLoads(orgId, [createdDoc]);
          return joined;
        }
        if (error) throw error;
      } catch (err) {
        console.warn('Supabase createDocument failed, falling back to local storage:', err);
      }
    }

    // Local/demo fallback
    const raw = this.readRawDocs(orgId);
    const newDoc: Document = {
      id: `doc-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      organization_id: orgId,
      load_id: input.load_id,
      doc_type: input.doc_type,
      doc_status: input.doc_status || 'received',
      file_path: finalFilePath,
      file_name: cleanFileName,
      file_size_bytes: input.file_size_bytes || null,
      mime_type: input.mime_type || 'application/pdf',
      uploaded_by: input.uploaded_by || 'Dispatcher',
      notes: input.notes?.trim() || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    raw.unshift(newDoc);
    this.writeRawDocs(orgId, raw);

    if (newDoc.load_id) {
      activityService.recordDocumentEvent(
        orgId,
        newDoc.load_id,
        newDoc.doc_type,
        newDoc.file_name || 'document',
        'uploaded',
        newDoc.uploaded_by || 'Dispatcher',
        undefined,
        newDoc.doc_status
      ).catch(() => {});
    }

    const [joined] = await this.joinLoads(orgId, [newDoc]);
    return joined;
  }

  async updateDocument(orgId: string, id: string, input: UpdateDocumentInput): Promise<FreightDocument> {
    if (isSupabaseConfigured && isUUID(orgId) && isUUID(id)) {
      const updatePayload: Database['public']['Tables']['documents']['Update'] = {
        updated_at: new Date().toISOString(),
      };

      if (input.doc_type !== undefined) updatePayload.doc_type = input.doc_type;
      if (input.doc_status !== undefined) updatePayload.doc_status = input.doc_status;
      if (input.file_name !== undefined) updatePayload.file_name = input.file_name?.trim() || null;
      if (input.file_size_bytes !== undefined) updatePayload.file_size_bytes = input.file_size_bytes;
      if (input.mime_type !== undefined) updatePayload.mime_type = input.mime_type;
      if (input.notes !== undefined) updatePayload.notes = input.notes ? input.notes.trim() : null;
      if (input.file_path !== undefined) updatePayload.file_path = input.file_path;
      if (input.uploaded_by !== undefined) updatePayload.uploaded_by = input.uploaded_by;

      const { data, error } = await supabase
        .from('documents')
        .update(updatePayload)
        .eq('organization_id', orgId)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('[DocumentService] Supabase updateDocument error:', error);
        throw new Error(error.message || 'Failed to update document in database.');
      }

      if (data) {
        const updatedDoc = data as Document;
        const [joined] = await this.joinLoads(orgId, [updatedDoc]);
        return joined;
      }
      throw new Error('Document not found or update failed.');
    }

    if (isSupabaseConfigured) {
      try {
        const updatePayload: Database['public']['Tables']['documents']['Update'] = {
          updated_at: new Date().toISOString(),
        };

        if (input.doc_type !== undefined) updatePayload.doc_type = input.doc_type;
        if (input.doc_status !== undefined) updatePayload.doc_status = input.doc_status;
        if (input.file_name !== undefined) updatePayload.file_name = input.file_name?.trim() || null;
        if (input.file_size_bytes !== undefined) updatePayload.file_size_bytes = input.file_size_bytes;
        if (input.mime_type !== undefined) updatePayload.mime_type = input.mime_type;
        if (input.notes !== undefined) updatePayload.notes = input.notes ? input.notes.trim() : null;
        if (input.file_path !== undefined) updatePayload.file_path = input.file_path;
        if (input.uploaded_by !== undefined) updatePayload.uploaded_by = input.uploaded_by;

        const { data, error } = await supabase
          .from('documents')
          .update(updatePayload)
          .eq('organization_id', orgId)
          .eq('id', id)
          .select()
          .single();

        if (!error && data) {
          const updatedDoc = data as Document;
          const [joined] = await this.joinLoads(orgId, [updatedDoc]);
          return joined;
        }
        if (error) throw error;
      } catch (err) {
        console.warn('Supabase updateDocument failed, falling back to local storage:', err);
      }
    }

    const raw = this.readRawDocs(orgId);
    const index = raw.findIndex((d) => d.id === id && d.organization_id === orgId);
    if (index === -1) {
      throw new Error(`Document ${id} not found in active organization.`);
    }

    const updated: Document = {
      ...raw[index],
      doc_type: input.doc_type !== undefined ? input.doc_type : raw[index].doc_type,
      doc_status: input.doc_status !== undefined ? input.doc_status : raw[index].doc_status,
      file_name: input.file_name !== undefined ? (input.file_name ? input.file_name.trim() : null) : raw[index].file_name,
      file_size_bytes: input.file_size_bytes !== undefined ? input.file_size_bytes : raw[index].file_size_bytes,
      mime_type: input.mime_type !== undefined ? input.mime_type : raw[index].mime_type,
      notes: input.notes !== undefined ? (input.notes ? input.notes.trim() : null) : raw[index].notes,
      file_path: input.file_path !== undefined ? input.file_path : raw[index].file_path,
      uploaded_by: input.uploaded_by !== undefined ? input.uploaded_by : raw[index].uploaded_by,
      updated_at: new Date().toISOString(),
    };

    raw[index] = updated;
    this.writeRawDocs(orgId, raw);
    const [joined] = await this.joinLoads(orgId, [updated]);
    return joined;
  }

  async updateDocumentStatus(
    orgId: string,
    id: string,
    status: DocumentStatus,
    notes?: string
  ): Promise<FreightDocument> {
    if (isSupabaseConfigured && isUUID(orgId) && isUUID(id)) {
      const updatePayload: { doc_status: DocumentStatus; notes?: string | null; updated_at: string } = {
        doc_status: status,
        updated_at: new Date().toISOString(),
      };
      if (notes !== undefined) {
        updatePayload.notes = notes ? notes.trim() : null;
      }

      const { data, error } = await supabase
        .from('documents')
        .update(updatePayload)
        .eq('organization_id', orgId)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('[DocumentService] Supabase updateDocumentStatus error:', error);
        throw new Error(error.message || 'Failed to update document status in database.');
      }

      if (data) {
        const updatedDoc = data as Document;

        // Auto-record document status update activity
        if (updatedDoc.load_id) {
          const action = status === 'verified' ? 'verified' : status === 'missing' ? 'rejected' : 'status_updated';
          activityService.recordDocumentEvent(
            orgId,
            updatedDoc.load_id,
            updatedDoc.doc_type,
            updatedDoc.file_name || 'document',
            action,
            'Dispatcher',
            undefined,
            status
          ).catch(() => {});
        }

        const [joined] = await this.joinLoads(orgId, [updatedDoc]);
        return joined;
      }
      throw new Error('Document not found or status update failed.');
    }

    if (isSupabaseConfigured) {
      try {
        const updatePayload: { doc_status: DocumentStatus; notes?: string | null; updated_at: string } = {
          doc_status: status,
          updated_at: new Date().toISOString(),
        };
        if (notes !== undefined) {
          updatePayload.notes = notes ? notes.trim() : null;
        }

        const { data, error } = await supabase
          .from('documents')
          .update(updatePayload)
          .eq('organization_id', orgId)
          .eq('id', id)
          .select()
          .single();

        if (!error && data) {
          const updatedDoc = data as Document;

          // Auto-record document status update activity
          if (updatedDoc.load_id) {
            const action = status === 'verified' ? 'verified' : status === 'missing' ? 'rejected' : 'status_updated';
            activityService.recordDocumentEvent(
              orgId,
              updatedDoc.load_id,
              updatedDoc.doc_type,
              updatedDoc.file_name || 'document',
              action,
              'Dispatcher',
              undefined,
              status
            ).catch(() => {});
          }

          const [joined] = await this.joinLoads(orgId, [updatedDoc]);
          return joined;
        }
        if (error) throw error;
      } catch (err) {
        console.warn('Supabase updateDocumentStatus failed, falling back to local storage:', err);
      }
    }

    const raw = this.readRawDocs(orgId);
    const index = raw.findIndex((d) => d.id === id && d.organization_id === orgId);
    if (index === -1) {
      throw new Error(`Document ${id} not found in active organization.`);
    }

    const updated: Document = {
      ...raw[index],
      doc_status: status,
      notes: notes !== undefined ? (notes ? notes.trim() : null) : raw[index].notes,
      updated_at: new Date().toISOString(),
    };

    raw[index] = updated;
    this.writeRawDocs(orgId, raw);

    // Auto-record document status update activity
    if (updated.load_id) {
      const action = status === 'verified' ? 'verified' : status === 'missing' ? 'rejected' : 'status_updated';
      activityService.recordDocumentEvent(
        orgId,
        updated.load_id,
        updated.doc_type,
        updated.file_name || 'document',
        action,
        'Dispatcher',
        undefined,
        status
      ).catch(() => {});
    }

    const [joined] = await this.joinLoads(orgId, [updated]);
    return joined;
  }

  async deleteDocument(orgId: string, id: string): Promise<void> {
    if (isSupabaseConfigured && isUUID(orgId) && isUUID(id)) {
      // Fetch target doc to get file path and load ID
      const { data: targetDoc, error: fetchErr } = await supabase
        .from('documents')
        .select('*')
        .eq('organization_id', orgId)
        .eq('id', id)
        .maybeSingle();

      if (fetchErr) {
        console.error('[DocumentService] Supabase deleteDocument fetch error:', fetchErr);
        throw new Error(fetchErr.message || 'Failed to locate document for deletion.');
      }

      if (targetDoc) {
        // Remove from storage bucket if file_path exists
        if (targetDoc.file_path) {
          const cleanPath = targetDoc.file_path.replace(/^freight-documents\//, '');
          await supabase.storage.from('freight-documents').remove([cleanPath]);
        }

        // Delete from database
        const { error: delError } = await supabase
          .from('documents')
          .delete()
          .eq('organization_id', orgId)
          .eq('id', id);

        if (delError) {
          console.error('[DocumentService] Supabase deleteDocument error:', delError);
          throw new Error(delError.message || 'Failed to delete document from database.');
        }

        if (targetDoc.load_id) {
          activityService.recordDocumentEvent(
            orgId,
            targetDoc.load_id,
            targetDoc.doc_type,
            targetDoc.file_name || 'document',
            'deleted',
            'Dispatcher'
          ).catch(() => {});
        }
      }
      return;
    }

    if (isSupabaseConfigured) {
      try {
        // Fetch target doc to get file path and load ID
        const { data: targetDoc } = await supabase
          .from('documents')
          .select('*')
          .eq('organization_id', orgId)
          .eq('id', id)
          .maybeSingle();

        if (targetDoc) {
          // Remove from storage bucket if file_path exists
          if (targetDoc.file_path) {
            const cleanPath = targetDoc.file_path.replace(/^freight-documents\//, '');
            await supabase.storage.from('freight-documents').remove([cleanPath]);
          }

          // Delete from database
          const { error: delError } = await supabase
            .from('documents')
            .delete()
            .eq('organization_id', orgId)
            .eq('id', id);

          if (delError) throw delError;

          if (targetDoc.load_id) {
            activityService.recordDocumentEvent(
              orgId,
              targetDoc.load_id,
              targetDoc.doc_type,
              targetDoc.file_name || 'document',
              'deleted',
              'Dispatcher'
            ).catch(() => {});
          }
          return;
        }
      } catch (err) {
        console.warn('Supabase deleteDocument failed, falling back to local storage:', err);
      }
    }

    const raw = this.readRawDocs(orgId);
    const target = raw.find((d) => d.id === id && d.organization_id === orgId);
    const filtered = raw.filter((d) => !(d.id === id && d.organization_id === orgId));
    this.writeRawDocs(orgId, filtered);

    if (target && target.load_id) {
      activityService.recordDocumentEvent(
        orgId,
        target.load_id,
        target.doc_type,
        target.file_name || 'document',
        'deleted',
        'Dispatcher'
      ).catch(() => {});
    }
  }

  async getDocumentsForLoad(orgId: string, loadId: string): Promise<FreightDocument[]> {
    if (isSupabaseConfigured && isUUID(orgId) && isUUID(loadId)) {
      try {
        const { data, error } = await supabase
          .from('documents')
          .select('*')
          .eq('organization_id', orgId)
          .eq('load_id', loadId)
          .order('created_at', { ascending: false });

        if (error) {
          console.warn('[DocumentService] Supabase getDocumentsForLoad error, using local fallback:', error);
        } else if (data) {
          return this.joinLoads(orgId, data as Document[]);
        }
      } catch (fetchErr) {
        console.warn('[DocumentService] Supabase getDocumentsForLoad network error, using local fallback:', fetchErr);
      }
    }

    if (isSupabaseConfigured) {
      try {
        const { data, error } = await supabase
          .from('documents')
          .select('*')
          .eq('organization_id', orgId)
          .eq('load_id', loadId)
          .order('created_at', { ascending: false });

        if (!error && data) {
          return this.joinLoads(orgId, data as Document[]);
        }
      } catch (err) {
        console.warn('Supabase getDocumentsForLoad failed, falling back to local storage:', err);
      }
    }

    const raw = this.readRawDocs(orgId);
    const loadDocs = raw.filter((d) => d.load_id === loadId && d.organization_id === orgId);
    return this.joinLoads(orgId, loadDocs);
  }

  async uploadStorageFile(
    orgId: string,
    loadId: string,
    file: File | Blob,
    customFileName?: string
  ): Promise<{ filePath: string; storagePath: string }> {
    const rawName = customFileName || (file instanceof File ? file.name : 'document.pdf');
    const cleanFileName = rawName.trim().replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `${orgId}/${loadId || 'unlinked'}/${cleanFileName}`;
    const fullPath = `freight-documents/${storagePath}`;

    if (isSupabaseConfigured) {
      const mimeType = file.type || 'application/octet-stream';
      const { error } = await supabase.storage
        .from('freight-documents')
        .upload(storagePath, file, {
          upsert: true,
          contentType: mimeType,
        });

      if (error) {
        console.warn('Storage upload error:', error.message);
      }
    }

    return { filePath: fullPath, storagePath };
  }

  async getDownloadUrl(orgId: string, filePath: string): Promise<string | null> {
    if (!isSupabaseConfigured || !filePath) return null;

    try {
      const cleanPath = filePath.replace(/^freight-documents\//, '');
      const { data, error } = await supabase.storage
        .from('freight-documents')
        .createSignedUrl(cleanPath, 3600); // 1 hour expiration

      if (error || !data) {
        return null;
      }
      return data.signedUrl;
    } catch (err) {
      console.warn('Error creating signed download URL:', err);
      return null;
    }
  }

  async downloadStorageFile(orgId: string, filePath: string): Promise<Blob | null> {
    if (!isSupabaseConfigured || !filePath) return null;

    try {
      const cleanPath = filePath.replace(/^freight-documents\//, '');
      const { data, error } = await supabase.storage
        .from('freight-documents')
        .download(cleanPath);

      if (error || !data) {
        return null;
      }
      return data;
    } catch (err) {
      console.warn('Error downloading storage file:', err);
      return null;
    }
  }

  private computeDocumentSummary(
    load: Load,
    loadDocs: FreightDocument[]
  ): LoadDocumentSummary {
    const requiredTypes = getRequiredDocumentsForLoadStatus(load.pipeline_status);

    const allStandardTypes: DocumentType[] = ['rate_confirmation', 'bol', 'pod', 'invoice'];

    const checklist: DocumentChecklistItem[] = allStandardTypes.map((docType) => {
      const isReq = requiredTypes.includes(docType);
      const existing = loadDocs.find((d) => d.doc_type === docType) || null;

      let requirementReason = 'Not required yet';
      if (isReq) {
        if (docType === 'rate_confirmation') requirementReason = 'Mandatory for Booked & In Transit status';
        if (docType === 'bol') requirementReason = 'Mandatory for Delivered status';
        if (docType === 'pod') requirementReason = 'Mandatory for Delivered & Invoicing';
        if (docType === 'invoice') requirementReason = 'Mandatory for Invoiced & Paid settlement';
      }

      let status: DocumentStatus = 'missing';
      if (existing) {
        status = existing.doc_status;
      }

      return {
        doc_type: docType,
        label: DOCUMENT_TYPE_LABELS[docType],
        shortLabel: DOCUMENT_TYPE_SHORT_LABELS[docType],
        isRequired: isReq,
        requirementReason,
        status,
        document: existing,
      };
    });

    const receivedTypes = loadDocs
      .filter((d) => d.doc_status === 'received' || d.doc_status === 'verified')
      .map((d) => d.doc_type);

    const missingTypes = requiredTypes.filter((t) => !receivedTypes.includes(t));

    const totalRequired = requiredTypes.length;
    const totalCompleted = requiredTypes.filter((t) => receivedTypes.includes(t)).length;
    const isComplete = totalRequired > 0 ? missingTypes.length === 0 : true;

    // Load is ready to invoice if it has delivered + verified POD, BOL, Rate Con
    const hasRateCon = loadDocs.some((d) => d.doc_type === 'rate_confirmation' && (d.doc_status === 'received' || d.doc_status === 'verified'));
    const hasBOL = loadDocs.some((d) => d.doc_type === 'bol' && (d.doc_status === 'received' || d.doc_status === 'verified'));
    const hasPOD = loadDocs.some((d) => d.doc_type === 'pod' && (d.doc_status === 'received' || d.doc_status === 'verified'));
    const isReadyToInvoice = load.pipeline_status === 'delivered' && hasRateCon && hasBOL && hasPOD;

    return {
      loadId: load.id,
      loadNumber: load.load_number,
      pipelineStatus: load.pipeline_status,
      requiredTypes,
      receivedTypes,
      missingTypes,
      totalRequired,
      totalCompleted,
      isComplete,
      isReadyToInvoice,
      checklist,
    };
  }

  async getDocumentSummaryForLoad(orgId: string, load: Load): Promise<LoadDocumentSummary> {
    const loadDocs = await this.getDocumentsForLoad(orgId, load.id);
    return this.computeDocumentSummary(load, loadDocs);
  }

  async getMissingDocuments(
    orgId: string
  ): Promise<{ load: Load; missingDocs: DocumentType[]; summary: LoadDocumentSummary }[]> {
    const docs = await this.listDocuments(orgId);
    const loads = await loadService.getLoads(orgId);

    const docsByLoadId = new Map<string, FreightDocument[]>();
    for (const doc of docs) {
      if (doc.load_id) {
        const existing = docsByLoadId.get(doc.load_id);
        if (existing) {
          existing.push(doc);
        } else {
          docsByLoadId.set(doc.load_id, [doc]);
        }
      }
    }

    const results: { load: Load; missingDocs: DocumentType[]; summary: LoadDocumentSummary }[] = [];

    for (const load of loads) {
      const loadDocs = docsByLoadId.get(load.id) || [];
      const summary = this.computeDocumentSummary(load, loadDocs);
      if (summary.missingTypes.length > 0) {
        results.push({
          load,
          missingDocs: summary.missingTypes,
          summary,
        });
      }
    }

    return results;
  }

  async getDocumentStats(orgId: string): Promise<DocumentStats> {
    const docs = await this.listDocuments(orgId);
    const loads = await loadService.getLoads(orgId);

    let pendingVerificationCount = 0;
    let verifiedCount = 0;
    let receivedCount = 0;
    let missingRateConsCount = 0;
    let missingPODsCount = 0;
    let readyToInvoiceLoadsCount = 0;

    const docsByLoadId = new Map<string, FreightDocument[]>();

    for (const d of docs) {
      if (d.doc_status === 'pending') pendingVerificationCount++;
      if (d.doc_status === 'verified') verifiedCount++;
      if (d.doc_status === 'received') receivedCount++;

      if (d.load_id) {
        const existing = docsByLoadId.get(d.load_id);
        if (existing) {
          existing.push(d);
        } else {
          docsByLoadId.set(d.load_id, [d]);
        }
      }
    }

    for (const load of loads) {
      const loadDocs = docsByLoadId.get(load.id) || [];
      const summary = this.computeDocumentSummary(load, loadDocs);
      if (summary.missingTypes.includes('rate_confirmation')) {
        missingRateConsCount++;
      }
      if (summary.missingTypes.includes('pod')) {
        missingPODsCount++;
      }
      if (summary.isReadyToInvoice) {
        readyToInvoiceLoadsCount++;
      }
    }

    return {
      totalDocuments: docs.length,
      pendingVerificationCount,
      verifiedCount,
      receivedCount,
      missingRateConsCount,
      missingPODsCount,
      readyToInvoiceLoadsCount,
    };
  }
}

export const documentService = new DocumentService();

