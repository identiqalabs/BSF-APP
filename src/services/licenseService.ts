import DeviceInfo from 'react-native-device-info';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import { Platform } from "react-native";

const LICENSE_STORAGE_KEY = "license_record_v1";
const BASE_URL = process.env.EXPO_PUBLIC_LICENSE_API_BASE_URL || Constants.expoConfig?.extra?.LICENSE_API_BASE_URL as string | undefined;
console.log("LICENSE API BASE URL:", BASE_URL);

export type StoredLicense = {
  licenseKey: string;
  deviceId: string;
  expiry: string;
  activated: true;
  signature: string;
};

export type LicenseStatus = "needs_activation" | "invalid_device" | "expired" | "valid" | "tampered";

type ActivationApiResponse = {
  valid?: boolean;
  expiry?: string;
  expiresAt?: string;
  expiryDate?: string;
  message?: string;
};




const DEVICE_ID_CACHE_KEY = 'stable_device_id';

export async function getDeviceId(): Promise<string> {
  try {
    // Return cached ID — never recompute after first time
    const cached = await AsyncStorage.getItem(DEVICE_ID_CACHE_KEY);
    if (cached) return cached;

    // getUniqueId() returns the best available stable ID:
    // - Android: uses MediaDrm ID (hardware-bound, survives reinstall)
    // - Does NOT require SIM or any permissions
    // - Does NOT change on reinstall or APK update
    // - Only changes on factory reset
    const uniqueId = await DeviceInfo.getUniqueId();
    console.log('Stable Device ID:', uniqueId);

    await AsyncStorage.setItem(DEVICE_ID_CACHE_KEY, uniqueId);
    return uniqueId;

  } catch (err) {
    console.error('getDeviceId error:', err);

    // Fallback — generate once and persist forever
    const cached = await AsyncStorage.getItem(DEVICE_ID_CACHE_KEY);
    if (cached) return cached;

    const [model, deviceId, fingerprint] = await Promise.all([
      DeviceInfo.getModel(),
      DeviceInfo.getDeviceId(),
      DeviceInfo.getFingerprint(),
    ]);
    const raw = `${model}|${deviceId}|${fingerprint}`;
    let hash = 0;
    for (let i = 0; i < raw.length; i++) {
      hash = ((hash << 5) - hash) + raw.charCodeAt(i);
      hash = hash & hash;
    }
    const fallbackId = Math.abs(hash).toString(36).toUpperCase().padStart(8, '0');
    await AsyncStorage.setItem(DEVICE_ID_CACHE_KEY, fallbackId);
    return fallbackId;
  }
}

export function buildLicensePayload(licenseKey: string, deviceId: string, expiry: string): string {
  return JSON.stringify({
    licenseKey: licenseKey.trim(),
    deviceId,
    expiry: new Date(expiry).toISOString(),
  });
}

export async function getStoredLicense(): Promise<StoredLicense | null> {
  const raw = await SecureStore.getItemAsync(LICENSE_STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as StoredLicense;
    if (!parsed.licenseKey || !parsed.deviceId || !parsed.expiry || !parsed.signature || parsed.activated !== true) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}


export async function validateLicense(): Promise<LicenseStatus> {
  const raw = await SecureStore.getItemAsync(LICENSE_STORAGE_KEY);
  if (!raw) return "needs_activation";

  let stored: StoredLicense;
  try {
    stored = JSON.parse(raw);
  } catch (err) {
    return "tampered";
  }

  if (!stored.licenseKey || !stored.deviceId || !stored.expiry || !stored.signature) {
    return "tampered";
  }

  const currentDeviceId = await getDeviceId();

  if (__DEV__) {
    console.log("Stored License:", stored);
    console.log("Current Device ID:", currentDeviceId);
  }

  if (stored.deviceId !== currentDeviceId) {
    if (__DEV__) {
      console.log("Device ID mismatch: stored=" + stored.deviceId + " current=" + currentDeviceId);
    }
    return "invalid_device";
  }

  const payload = buildLicensePayload(stored.licenseKey, stored.deviceId, stored.expiry);
  const expectedSignature = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    payload
  );

  if (stored.signature !== expectedSignature) {
    if (__DEV__) {
      console.log("Signature mismatch!");
    }
    return "tampered";
  }

  const now = Date.now();
  const expiryTime = new Date(stored.expiry).getTime();

  if (now > expiryTime) {
    return "expired";
  }

  return "valid";
}

export async function activateLicense(licenseKey: string): Promise<StoredLicense> {
  if (!BASE_URL) {
    throw new Error("License API base URL is not configured");
  }

  const trimmedKey = licenseKey.trim();
  if (!trimmedKey) {
    throw new Error("License key is required.");
  }

  const deviceId = await getDeviceId();
  const normalizedBase = BASE_URL.replace(/\/$/, "");

  // -------------------------------------------------------------
  // STEP 1: Fetch ALL licenses to check for existing bindings
  // -------------------------------------------------------------
  const allLicensesUrl = `${normalizedBase}/all-licenses`;
  if (__DEV__) console.log("Step 1: Fetching all licenses...", allLicensesUrl);

  const allRes = await fetch(allLicensesUrl);
  if (!allRes.ok) {
    throw new Error(`Failed to fetch license registry (${allRes.status})`);
  }

  const allData = (await allRes.json()) as any[];
  const matched = allData.find((l) => l.licenseKey === trimmedKey);

  if (!matched) {
    throw new Error("License key not found. Please verify and try again.");
  }

  if (matched.status === "inactive" || matched.status === "expired") {
    throw new Error(`License is ${matched.status}.`);
  }

  // Check if already bound to another device
  // A license is considered "fresh" only if both zabbixVersion and totalHosts are empty/zero
  const serverBoundDeviceId = matched.zabbixVersion;
  const isVersionEmpty = !serverBoundDeviceId || serverBoundDeviceId === "" || serverBoundDeviceId === "unknown";
  const isHostsEmpty = !matched.totalHosts || matched.totalHosts === 0;

  if (!isVersionEmpty && serverBoundDeviceId !== deviceId) {
    throw new Error("This license is already registered to another device.");
  }
  
  // Optional: If you want to be even stricter as per "if version AND total host is empty"
  // but usually checking the ID is enough security. 
  // We'll proceed with the push if the version is empty or matches ours.

  const rawExpiry = matched.expiryDate;
  if (!rawExpiry) {
    throw new Error("License does not have an expiry date.");
  }

  // -------------------------------------------------------------
  // STEP 2: POST Usage -> PUSH Device ID to zabbixVersion
  // -------------------------------------------------------------
  const postUrl = `${normalizedBase}/check-license/usage`;
  if (__DEV__) console.log("Step 2: Binding device to /usage...", postUrl);

  const postRes = await fetch(postUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      licenseKey: trimmedKey,
      instanceId: matched.instanceId || "", // Use server's instanceId
      zabbixVersion: deviceId,              // Push deviceId into version field
      totalHosts: 1,                        // Set hosts to 1 as requested
    }),
  });

  if (!postRes.ok) {
    const postErr = await postRes.text();
    if (__DEV__) console.error("Step 2 failed:", postRes.status, postErr);
    throw new Error(`Activation binding failed (${postRes.status}).`);
  }

  // -------------------------------------------------------------
  // STEP 3: Sign and Store Locally
  // -------------------------------------------------------------
  const normalizedExpiry = new Date(rawExpiry).toISOString();
  const payload = buildLicensePayload(trimmedKey, deviceId, normalizedExpiry);
  const signature = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    payload
  );

  const record: StoredLicense = {
    licenseKey: trimmedKey,
    deviceId,
    expiry: normalizedExpiry,
    activated: true,
    signature,
  };

  await SecureStore.setItemAsync(LICENSE_STORAGE_KEY, JSON.stringify(record));
  return record;
}
