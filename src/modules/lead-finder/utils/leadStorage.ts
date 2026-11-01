import { FmcsaLead } from '../types/fmcsa';

const DB_NAME = 'FMCSA_LEADS_STORE';
const DB_VERSION = 1;
const STORE_NAME = 'leads';

let dbInstance: IDBDatabase | null = null;

/**
 * Opens or retrieves the singleton IndexedDB database connection
 */
export function openLeadDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (dbInstance) {
      resolve(dbInstance);
      return;
    }

    // Safety check for environments without IndexedDB
    const idb = typeof indexedDB !== 'undefined' ? indexedDB : (typeof self !== 'undefined' ? self.indexedDB : null);
    if (!idb) {
      reject(new Error('IndexedDB is not available in this environment'));
      return;
    }

    const request = idb.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('dot', 'dot', { unique: false });
        store.createIndex('state', 'state', { unique: false });
      }
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onerror = () => {
      reject(request.error || new Error('Failed to open IndexedDB'));
    };
  });
}

/**
 * Clears all records from the IndexedDB leads store
 */
export async function clearLeadDb(): Promise<void> {
  try {
    const db = await openLeadDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Could not clear IndexedDB store:', err);
  }
}

/**
 * Bulk writes an array of leads into IndexedDB in a single transaction
 */
export async function putLeadsBatch(leads: FmcsaLead[]): Promise<void> {
  if (!leads || leads.length === 0) return;
  try {
    const db = await openLeadDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      for (let i = 0; i < leads.length; i++) {
        store.put(leads[i]);
      }

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(new Error('Transaction aborted'));
    });
  } catch (err) {
    console.error('Error in putLeadsBatch:', err);
  }
}

/**
 * Gets the total number of stored leads in IndexedDB
 */
export async function getStoredLeadsCount(): Promise<number> {
  try {
    const db = await openLeadDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return 0;
  }
}

/**
 * Streams all leads in batches of `batchSize` via an open cursor.
 * Ensures that exporting 500,000 leads uses only a 5,000-lead memory window.
 */
export async function streamAllLeads(
  onBatch: (batch: FmcsaLead[]) => void,
  batchSize = 5000
): Promise<number> {
  const db = await openLeadDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.openCursor();

    let batch: FmcsaLead[] = [];
    let totalStreamed = 0;

    req.onsuccess = (e) => {
      const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        batch.push(cursor.value as FmcsaLead);
        totalStreamed++;

        if (batch.length >= batchSize) {
          onBatch(batch);
          batch = [];
        }

        cursor.continue();
      } else {
        // Final batch
        if (batch.length > 0) {
          onBatch(batch);
          batch = [];
        }
        resolve(totalStreamed);
      }
    };

    req.onerror = () => reject(req.error);
  });
}

/**
 * Retrieves specific leads by their IDs
 */
export async function getLeadsByIds(ids: string[]): Promise<FmcsaLead[]> {
  if (!ids || ids.length === 0) return [];
  const db = await openLeadDb();
  const idSet = new Set(ids);
  const results: FmcsaLead[] = [];

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.openCursor();

    req.onsuccess = (e) => {
      const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        const lead = cursor.value as FmcsaLead;
        if (idSet.has(lead.id)) {
          results.push(lead);
          if (results.length === ids.length) {
            resolve(results);
            return;
          }
        }
        cursor.continue();
      } else {
        resolve(results);
      }
    };

    req.onerror = () => reject(req.error);
  });
}
