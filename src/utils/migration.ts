import AsyncStorage from '@react-native-async-storage/async-storage';
import { saveEntry } from './database';

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

          const entry = {
            id: String(item.id ?? ''),
            dateTimeISO: String(item.dateTimeISO ?? ''),
            photoUri: String(item.photoUri ?? ''),
            nameUri: String(item.nameUri ?? ''),
            remarksUri: String(item.remarksUri ?? ''),
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
