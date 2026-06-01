import * as FileSystem from "expo-file-system/legacy";

export async function clearCacheDir(): Promise<void> {
  const cacheDir = FileSystem.cacheDirectory;
  if (!cacheDir) return;

  try {
    const files = await FileSystem.readDirectoryAsync(cacheDir);
    for (const file of files) {
      const fileUri = `${cacheDir}${file}`;
      try {
        await FileSystem.deleteAsync(fileUri, { idempotent: true });
      } catch {
        // Best effort cleanup.
      }
    }
    console.log("Cache cleared");
  } catch {
    // Ignore cache read failures.
  }
}
