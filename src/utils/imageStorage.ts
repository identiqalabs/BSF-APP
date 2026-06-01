import * as FileSystem from "expo-file-system/legacy";
import * as ImageManipulator from "expo-image-manipulator";

const ENTRIES_DIR = `${FileSystem.documentDirectory}entries/`;
const MAX_IMAGE_WIDTH = 1200;
const MAX_DRAWING_WIDTH = 1600;
const IMAGE_QUALITY = 0.7;
const DRAWING_QUALITY = 0.95;

function makeFileName(prefix: string, ext: "jpg" | "png" = "jpg"): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}.${ext}`;
}

export async function ensureEntriesDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(ENTRIES_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(ENTRIES_DIR, { intermediates: true });
  }
}

function normalizeUri(uri: string): string {
  if (uri.startsWith("file://")) return uri;
  return `file://${uri}`;
}

async function safeDeleteTemp(uri: string): Promise<void> {
  if (!uri) return;
  const cacheDir = FileSystem.cacheDirectory ?? "";
  if (!cacheDir || !uri.includes(cacheDir)) return;
  try {
    console.log("Deleting temp:", uri);
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch {
    // Best effort cleanup.
  }
}

async function getFileSize(uri: string): Promise<number> {
  const info = await FileSystem.getInfoAsync(uri);
  return info.exists && typeof info.size === "number" ? info.size : 0;
}

function toKbLabel(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

type OptimizeOptions = {
  prefix: "photo" | "name" | "remarks";
  maxWidth: number;
  compress: number;
};

export async function optimizeImageToEntryFile(
  sourceUri: string,
  options: OptimizeOptions
): Promise<string> {
  if (!sourceUri) return "";
  await ensureEntriesDir();

  const fromUri = normalizeUri(sourceUri);
  const beforeSize = await getFileSize(fromUri);

  const manipulated = await ImageManipulator.manipulateAsync(
    fromUri,
    [{ resize: { width: options.maxWidth } }],
    { compress: options.compress, format: ImageManipulator.SaveFormat.JPEG }
  );

  const targetUri = `${ENTRIES_DIR}${makeFileName(options.prefix, "jpg")}`;
  await FileSystem.moveAsync({ from: manipulated.uri, to: targetUri });
  const afterSize = await getFileSize(targetUri);

  console.log(
    `[optimize] ${options.prefix} size: ${toKbLabel(beforeSize)} -> ${toKbLabel(afterSize)} (${targetUri})`
  );

  if (fromUri !== targetUri) {
    console.log("Deleting original:", fromUri);
    await safeDeleteTemp(fromUri);
  }
  if (manipulated?.uri && manipulated.uri !== targetUri) {
    console.log("Deleting manipulated:", manipulated.uri);
    await safeDeleteTemp(manipulated.uri);
  }
  return targetUri;
}

export async function saveBase64AsOptimizedEntryFile(
  base64OrDataUrl: string,
  prefix: "name" | "remarks"
): Promise<string> {
  if (!base64OrDataUrl) return "";
  await ensureEntriesDir();

  const base64 = base64OrDataUrl.includes(",")
    ? base64OrDataUrl.split(",")[1]
    : base64OrDataUrl;
  const tempUri = `${ENTRIES_DIR}${makeFileName(`${prefix}_raw`, "png")}`;
  await FileSystem.writeAsStringAsync(tempUri, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const optimizedUri = await optimizeImageToEntryFile(tempUri, {
    prefix,
    maxWidth: MAX_DRAWING_WIDTH,
    compress: DRAWING_QUALITY,
  });

  await safeDeleteTemp(tempUri);
  return optimizedUri;
}

export async function optimizePhotoToEntryFile(sourceUri: string): Promise<string> {
  if (sourceUri.startsWith("data:image")) {
    const base64 = sourceUri.split(",")[1] ?? "";
    const tempUri = `${ENTRIES_DIR}${makeFileName("photo_raw", "jpg")}`;
    await ensureEntriesDir();
    await FileSystem.writeAsStringAsync(tempUri, base64, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const optimizedUri = await optimizeImageToEntryFile(tempUri, {
      prefix: "photo",
      maxWidth: MAX_IMAGE_WIDTH,
      compress: IMAGE_QUALITY,
    });
    await safeDeleteTemp(tempUri);
    return optimizedUri;
  }
  return optimizeImageToEntryFile(sourceUri, {
    prefix: "photo",
    maxWidth: MAX_IMAGE_WIDTH,
    compress: IMAGE_QUALITY,
  });
}

export async function optimizeDrawingToEntryFile(
  source: string,
  prefix: "name" | "remarks"
): Promise<string> {
  if (!source) return "";
  if (source.startsWith("data:image") || !source.startsWith("file://")) {
    return saveBase64AsOptimizedEntryFile(source, prefix);
  }
  return optimizeImageToEntryFile(source, {
    prefix,
    maxWidth: MAX_DRAWING_WIDTH,
    compress: DRAWING_QUALITY,
  });
}

export async function cleanupTempFile(uri?: string | null): Promise<void> {
  if (!uri) return;
  await safeDeleteTemp(uri);
}
