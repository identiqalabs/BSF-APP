import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { VisitorEntry } from '../types/VisitorEntry';

const SAF = FileSystem.StorageAccessFramework;
const BACKUP_URI_KEY = 'backup_folder_uri';
const FOLDER_URI_PREFIX = 'saf_folder_uri_';

async function getBackupFolderUri(): Promise<string | null> {
  try {
    const stored = await AsyncStorage.getItem(BACKUP_URI_KEY);
    if (stored) return stored;

    const result = await SAF.requestDirectoryPermissionsAsync();
    if (!result.granted) return null;

    // Clear all cached folder URIs since root changed
    const keys = await AsyncStorage.getAllKeys();
    const folderKeys = keys.filter(k => k.startsWith(FOLDER_URI_PREFIX));
    if (folderKeys.length > 0) await AsyncStorage.multiRemove(folderKeys);

    await AsyncStorage.setItem(BACKUP_URI_KEY, result.directoryUri);
    return result.directoryUri;
  } catch (err) {
    console.error('getBackupFolderUri error:', err);
    return null;
  }
}

async function ensureSAFFolder(parentUri: string, folderName: string): Promise<string> {
  const cacheKey = `${FOLDER_URI_PREFIX}${folderName}_${parentUri.slice(-20)}`;
  try {
    const cachedUri = await AsyncStorage.getItem(cacheKey);
    if (cachedUri) {
      try {
        await SAF.readDirectoryAsync(cachedUri);
        return cachedUri;
      } catch {
        await AsyncStorage.removeItem(cacheKey);
      }
    }
    const newUri = await SAF.makeDirectoryAsync(parentUri, folderName);
    await AsyncStorage.setItem(cacheKey, newUri);
    return newUri;
  } catch (err) {
    try {
      const children = await SAF.readDirectoryAsync(parentUri);
      const encodedName = encodeURIComponent(folderName);
      const encodedName2 = folderName.replace(/ /g, '%20');
      for (const uri of children) {
        if (uri.endsWith(encodedName) || uri.endsWith(encodedName2) || uri.endsWith(folderName) || 
            uri.includes(`%2F${encodedName}`) || uri.includes(`/${folderName}`)) {
          try {
            await SAF.readDirectoryAsync(uri);
            await AsyncStorage.setItem(cacheKey, uri);
            return uri;
          } catch { continue; }
        }
      }
      throw new Error(`Could not find folder: ${folderName}`);
    } catch (listErr) {
      throw new Error(`ensureSAFFolder failed for ${folderName}: ${listErr}`);
    }
  }
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9_\-]/g, '_').substring(0, 50);
}

async function toBase64DataUrl(uri: string | undefined | null, mimeType: string): Promise<string | null> {
  if (!uri) return null;
  try {
    if (uri.startsWith('data:image')) return uri;
    if (uri.startsWith('file://')) {
      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
      return `data:${mimeType};base64,${base64}`;
    }
    if (uri.length > 100) return `data:${mimeType};base64,${uri}`;
    return null;
  } catch (err) {
    console.error(`toBase64DataUrl failed for ${mimeType}:`, err);
    return null;
  }
}

function buildEntryHtml(entry: VisitorEntry, formattedDate: string): string {
  const photoHtml = entry.photoUri?.startsWith('data:image')
    ? `<img src="${entry.photoUri}" class="asset-img"/>`
    : `<div style="width:100%;height:150px;background:#f3f4f6;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#9ca3af;font-size:13px;font-weight:bold;">No Photo Captured</div>`;

  const remarksHtml = entry.remarksUri?.startsWith('data:image')
    ? `<img src="${entry.remarksUri}" class="asset-img" style="background:white;"/>`
    : `<div style="height:100px;background:#f9fafb;border-radius:8px;border:1px dashed #e5e7eb;"></div>`;

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8"/>
      <style>
        @page { size: A4 portrait; margin: 10mm; }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body { width: 100%; height: 100%; }
        body { font-family: 'Helvetica', 'Arial', sans-serif; color: #111827; background: white; line-height: 1.4; }
        .page {
          height: calc(297mm - 20mm);
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .header { text-align: center; border-bottom: 2px solid #111827; padding-bottom: 10px; margin-bottom: 15px; flex: 0 0 auto; }
        .header h1 { font-size: 20px; font-weight: 900; color: #111827; text-transform: uppercase; letter-spacing: 1px; }
        .header p { font-size: 11px; color: #4b5563; margin-top: 5px; font-weight: 700; }
        
        .content { display: grid; grid-template-columns: 0.420fr 0.580fr; gap: 20px; flex: 1 1 auto; align-items: start; }
        .left-column { display: flex; flex-direction: column; gap: 20px; }
        .right-column { display: flex; flex-direction: column; }
        
        .section { display: flex; flex-direction: column; margin-bottom: 5px; }
        .photo-section { }
        .name-section { }
        .thoughts-section { }
        
        .section-label { font-size: 11px; font-weight: 900; color: #4b5563; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px; border-left: 3px solid #111827; padding-left: 10px; }
        .section-content { border: 1px solid #e5e7eb; border-radius: 15px; padding: 12px; background: #ffffff; overflow: hidden; }
        
        .dignitary-name { font-size: 15px; font-weight: 900; color: #111827; line-height: 1.4; }
        .asset-box { width: 100%; display: block; }
        
        img.asset-img { width: 100%; height: auto; display: block; border-radius: 8px; }
        
        .footer { text-align: center; margin-top: 15px; padding-top: 10px; border-top: 1px solid #e5e7eb; font-size: 9px; color: #9ca3af; font-weight: 600; flex: 0 0 auto; }
      </style>
    </head>
    <body>
      <div class="page">
        <div class="header">
          <h1>Visitor Register</h1>
          <p>Visit Date & Time: ${formattedDate}</p>
        </div>
        
        <div class="content">
          <div class="left-column">
            <div class="section photo-section">
              <div class="section-label">Visitor Photo / तस्वीर</div>
              <div class="section-content">
                <div class="asset-box">${photoHtml}</div>
              </div>
            </div>
            
            <div class="section name-section">
              <div class="section-label">गणमान्य व्यक्ति का नाम एवं पदनाम / Dignitary Name & Designation</div>
              <div class="section-content">
                <div class="dignitary-name">${entry.dignitaryName || 'Visitor'}</div>
              </div>
            </div>
          </div>
          
          <div class="right-column">
            <div class="section thoughts-section">
              <div class="section-label">Thoughts / विचार</div>
              <div class="section-content">
                <div class="asset-box">${remarksHtml}</div>
              </div>
            </div>
          </div>
        </div>
        
        <div class="footer">
          Automatically generated by Visitor Register App • ${new Date().toLocaleDateString('en-IN')}
        </div>
      </div>
    </body>
    </html>
  `;
}

export async function backupEntry(entry: VisitorEntry): Promise<void> {
  try {
    const rootUri = await getBackupFolderUri();
    if (!rootUri) return;

    const entryDate = new Date(entry.dateTimeISO);
    const year = entryDate.getFullYear().toString();
    const formattedDate = entryDate.toLocaleString('en-IN', {
      day: '2-digit', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true
    });

    const fileDate = `${year}-${String(entryDate.getMonth()+1).padStart(2,'0')}-${String(entryDate.getDate()).padStart(2,'0')}_${String(entryDate.getHours()).padStart(2,'0')}-${String(entryDate.getMinutes()).padStart(2,'0')}`;
    const safeName = sanitizeFilename(entry.dignitaryName || 'Visitor');
    const fileName = `${fileDate}_${safeName}.pdf`;

    const visitorRegisterUri = await ensureSAFFolder(rootUri, 'VisitorRegister');
    const yearFolderUri = await ensureSAFFolder(visitorRegisterUri, year);

    // Convert images
    const [p, r] = await Promise.all([
      toBase64DataUrl(entry.photoUri, 'image/jpeg'),
      toBase64DataUrl(entry.remarksUri, 'image/png'),
    ]);

    const html = buildEntryHtml({ ...entry, photoUri: p || '', remarksUri: r || '' }, formattedDate);
    
    // Generate PDF directly as base64 string
    const { base64: pdfBase64 } = await Print.printToFileAsync({ html, base64: true });
    if (!pdfBase64) throw new Error('Failed to generate PDF Base64');

    // Create and write file using SAF
    const destUri = await SAF.createFileAsync(yearFolderUri, fileName, 'application/pdf');
    await SAF.writeAsStringAsync(destUri, pdfBase64, { encoding: FileSystem.EncodingType.Base64 });

    console.log(`PDF successfully saved to: ${fileName}`);
  } catch (err) {
    console.error('PDF backup process failed:', err);
  }
}
