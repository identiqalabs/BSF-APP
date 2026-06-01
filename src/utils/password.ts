import AsyncStorage from "@react-native-async-storage/async-storage";

const DELETE_PASSWORD_KEY = "delete_password";
const DEFAULT_PASSWORD = "BSF@2026";

export async function getDeletePassword(): Promise<string> {
  try {
    const saved = await AsyncStorage.getItem(DELETE_PASSWORD_KEY);
    return saved ?? DEFAULT_PASSWORD;
  } catch {
    return DEFAULT_PASSWORD;
  }
}

export async function setDeletePassword(newPassword: string): Promise<void> {
  await AsyncStorage.setItem(DELETE_PASSWORD_KEY, newPassword);
}
