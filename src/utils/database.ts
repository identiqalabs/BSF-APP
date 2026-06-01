import * as SQLite from 'expo-sqlite';
import * as FileSystem from 'expo-file-system/legacy';
import type { VisitorEntry } from '../types/VisitorEntry';
import { backupEntry } from './backup';
import { optimizeDrawingToEntryFile, optimizePhotoToEntryFile } from './imageStorage';

// Open synchronous or async database
const DB_NAME = 'visitor_register.db';

const dbPromise = SQLite.openDatabaseAsync(DB_NAME);


export function isBase64(str: string): boolean {
  if (!str) return false;
  
  if (str.startsWith('data:image')) return true;
  
  if (str.startsWith('file://') || str.startsWith('http://') || str.startsWith('https://')) return false;
  
  // A heuristic for raw base64 logic. Usually from the canvases, they aren't standard URIs.
  if (str.length > 100) return true;
  
  return false;
}

async function processImageUri(imageStr?: string | null, prefix = 'img'): Promise<string> {
  if (!imageStr) return '';
  
  if (isBase64(imageStr)) {
     if (prefix === 'photo') return optimizePhotoToEntryFile(imageStr);
     return optimizeDrawingToEntryFile(imageStr, prefix === 'remarks' ? 'remarks' : 'name');
  } else if (imageStr.startsWith('file://')) {
     if (imageStr.includes('/entries/')) {
       return imageStr;
     }
     if (prefix === 'photo') return optimizePhotoToEntryFile(imageStr);
     return optimizeDrawingToEntryFile(imageStr, prefix === 'remarks' ? 'remarks' : 'name');
  }
  return imageStr;
}

async function migrateInlineBase64ToFiles(): Promise<void> {
  const db = await dbPromise;
  const rows = await db.getAllAsync<any>(
    `SELECT id, photo, signature, remarks FROM visitor_entries
     WHERE photo LIKE 'data:image%' OR signature LIKE 'data:image%' OR remarks LIKE 'data:image%'`
  );
  if (!rows.length) return;

  console.log(`[db-migration] Converting ${rows.length} inline base64 rows to file URIs...`);
  for (const row of rows) {
    const photo = await processImageUri(row.photo, 'photo');
    const signature = await processImageUri(row.signature, 'name');
    const remarks = await processImageUri(row.remarks, 'remarks');
    await db.runAsync(
      `UPDATE visitor_entries SET photo = ?, signature = ?, remarks = ? WHERE id = ?`,
      [photo, signature, remarks, row.id]
    );
  }
  console.log('[db-migration] Inline base64 migration complete.');
}

export async function initDatabase() {
  const db = await dbPromise;
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS visitor_entries (
      id TEXT PRIMARY KEY,
      date TEXT,
      visitor_name TEXT,
      dignitary_name TEXT,
      personToMeet TEXT,
      phoneNumber TEXT,
      remarks TEXT,
      photo TEXT,
      signature TEXT,
      is_imported INTEGER,
      host_action TEXT DEFAULT NULL,
      created_at TEXT
    );
  `);
  // Ensure is_imported and host_action columns exist for older databases
  try {
    const db = await dbPromise;
    await db.execAsync(`ALTER TABLE visitor_entries ADD COLUMN is_imported INTEGER DEFAULT 0;`);
  } catch (e) {
    // Ignore if column exists
  }
  try {
    const db = await dbPromise;
    await db.execAsync(`ALTER TABLE visitor_entries ADD COLUMN host_action TEXT DEFAULT NULL;`);
  } catch (e) {
    // Ignore if column exists
  }
  try {
    const db = await dbPromise;
    await db.execAsync(`ALTER TABLE visitor_entries ADD COLUMN dignitary_name TEXT DEFAULT NULL;`);
  } catch (e) {
    // Ignore if column exists
  }
  try {
    const db = await dbPromise;
    await db.execAsync(`ALTER TABLE visitor_entries ADD COLUMN visitor_name TEXT DEFAULT NULL;`);
  } catch (e) {
    // Ignore if column exists
  }
  await migrateInlineBase64ToFiles();
  console.log('Database initialized');
}

export async function saveEntry(entry: VisitorEntry): Promise<void> {
  const db = await dbPromise;

  const processedPhoto = await processImageUri(entry.photoUri, 'photo');
  const processedSignature = await processImageUri(entry.nameUri, 'name');
  const processedRemarks = await processImageUri(entry.remarksUri, 'remarks');

  await db.runAsync(
    `INSERT OR REPLACE INTO visitor_entries (
      id, date, visitor_name, dignitary_name, personToMeet, phoneNumber, remarks, photo, signature, is_imported, host_action, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      entry.id,
      entry.dateTimeISO,
      "", // visitor_name left empty as requested
      entry.dignitaryName,
      entry.personToMeet,
      entry.phoneNumber,
      processedRemarks,
      processedPhoto,
      processedSignature,
      entry.isImported ? 1 : 0,
      entry.hostAction ?? null,
      new Date().toISOString()
    ]
  );

  // Trigger backup in background — never await at top level to avoid blocking UI
  backupEntry(entry).catch(err => console.error('Background backup error:', err));
}

export async function getAllEntries(): Promise<VisitorEntry[]> {
  const db = await dbPromise;
  const result = await db.getAllAsync<any>(
    'SELECT * FROM visitor_entries ORDER BY date DESC, created_at DESC'
  );
  
  return result.map(row => ({
    id: row.id,
    dateTimeISO: row.date,
    photoUri: row.photo,
    nameUri: row.signature,
    remarksUri: row.remarks,
    dignitaryName: row.dignitary_name,
    personToMeet: row.personToMeet,
    phoneNumber: row.phoneNumber,
    isImported: row.is_imported === 1,
    hostAction: row.host_action,
  }));
}

export async function deleteEntry(id: string): Promise<void> {
  const db = await dbPromise;

  const result = await db.getAllAsync<any>('SELECT photo, signature, remarks FROM visitor_entries WHERE id = ?', [id]);
  if (result.length > 0) {
     const {photo, signature, remarks} = result[0];
     for (const uri of [photo, signature, remarks]) {
        if (uri && uri.startsWith('file://') && !isBase64(uri)) {
           try { await FileSystem.deleteAsync(uri, { idempotent: true }); } catch (e) {}
        }
     }
  }

  await db.runAsync('DELETE FROM visitor_entries WHERE id = ?', [id]);
}

export async function searchEntries(query: string): Promise<VisitorEntry[]> {
  if (!query || query.trim() === '') {
    return getAllEntries();
  }
  const db = await dbPromise;
  // User asked: search should match against visitor_name, dignitary_name, and remarks columns
  // We'll also likely want to search against date or personToMeet, but sticking strictly to the user's columns plus maybe personToMeet to not lose UI parity
  const likeQuery = `%${query}%`;
  const result = await db.getAllAsync<any>(
    `SELECT * FROM visitor_entries 
     WHERE visitor_name LIKE ? 
     OR dignitary_name LIKE ? 
     OR remarks LIKE ? 
     OR personToMeet LIKE ?
     ORDER BY date DESC`,
    [likeQuery, likeQuery, likeQuery, likeQuery]
  );
  
  return result.map(row => ({
    id: row.id,
    dateTimeISO: row.date,
    photoUri: row.photo,
    nameUri: row.signature,
    remarksUri: row.remarks,
    dignitaryName: row.dignitary_name,
    personToMeet: row.personToMeet,
    phoneNumber: row.phoneNumber,
    isImported: row.is_imported === 1,
  }));
}

export async function replaceEntries(entries: VisitorEntry[]): Promise<void> {
  const db = await dbPromise;

  const existingRows = await db.getAllAsync<any>('SELECT photo, signature, remarks FROM visitor_entries');
  for (const row of existingRows) {
     for (const uri of [row.photo, row.signature, row.remarks]) {
        if (uri && uri.startsWith('file://') && !isBase64(uri)) {
           try { await FileSystem.deleteAsync(uri, { idempotent: true }); } catch (e) {}
        }
     }
  }

  await db.execAsync('DELETE FROM visitor_entries');
  for (const entry of entries) {
    await saveEntry(entry);
  }
}

export async function importEntries(entries: VisitorEntry[]): Promise<void> {
  for (const entry of entries) {
    await saveEntry(entry);
  }
}

export const updateHostAction = async (id: string, hostAction: string): Promise<void> => {
  try {
    if (!id) throw new Error("Entry ID is required to update host action.");
    const db = await dbPromise;
    console.log('Updating host action for id:', id, 'action:', hostAction);
    console.log('DB instance exists:', !!db);
    
    await db.runAsync(
      `UPDATE visitor_entries SET host_action = ? WHERE id = ?`,
      [hostAction, id]
    );
    console.log('Host action updated successfully');
  } catch (error) {
    console.error('updateHostAction error details:', JSON.stringify(error), error);
    throw error;
  }
};

