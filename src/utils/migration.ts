import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { saveEntry } from './database';

async function getAsDataUrl(uri: string, isJpeg: boolean = false): Promise<string> {
  if (!uri) return '';
  if (uri.startsWith('data:')) return uri;

  try {
    if (uri.startsWith('file://')) {
      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
      const mime = isJpeg ? 'image/jpeg' : 'image/png';
      return `data:${mime};base64,${base64}`;
    }
  } catch (err) {
    console.error('Error reading file to base64', uri, err);
  }
  return uri;
}

export async function migrateFromAsyncStorage() {
  try {
    const migratedFlag = await AsyncStorage.getItem('sqlite_migrated');
    if (migratedFlag === 'true') {
      return; // Already migrated
    }

    // Checking the current active key according to entriesStorage.ts
    // The user's prompt mentioned 'visitor_entries', we'll check both just to be safe.
    let raw = await AsyncStorage.getItem('visitor_register_entries_v2');
    if (!raw) {
      raw = await AsyncStorage.getItem('visitor_entries');
    }

    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        console.log(`Migrating ${parsed.length} entries to SQLite...`);
        for (const item of parsed) {
          if (!item || typeof item !== 'object') continue;

          const photoDataUrl = await getAsDataUrl(item.photoUri, true);
          const nameDataUrl = await getAsDataUrl(item.nameUri, false);
          const remarksDataUrl = await getAsDataUrl(item.remarksUri, false);

          const entry = {
            id: String(item.id ?? ''),
            dateTimeISO: String(item.dateTimeISO ?? ''),
            photoUri: photoDataUrl,
            nameUri: nameDataUrl,
            remarksUri: remarksDataUrl,
            dignitaryName: String(item.dignitaryName ?? ''),
            personToMeet: String(item.personToMeet ?? ''),
            phoneNumber: String(item.phoneNumber ?? '')
          };

          if (entry.id) {
            await saveEntry(entry);
          }
        }
      }
    }

    await AsyncStorage.setItem('sqlite_migrated', 'true');
    console.log('Migration to SQLite complete.');
  } catch (err) {
    console.error('Migration Error:', err);
  }
}
