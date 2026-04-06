import AsyncStorage from "@react-native-async-storage/async-storage";

const LAST_BACKUP_KEY = "visitor_register_last_backup_v1";

export async function loadLastBackup(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(LAST_BACKUP_KEY);
  } catch {
    return null;
  }
}

export async function setLastBackup(label: string): Promise<void> {
  await AsyncStorage.setItem(LAST_BACKUP_KEY, label);
}

