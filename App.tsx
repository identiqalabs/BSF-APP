import * as ScreenOrientation from "expo-screen-orientation";
import React, { useEffect, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { View, Text, StyleSheet, TouchableOpacity, StatusBar, TextInput, ActivityIndicator } from "react-native";

import RootNavigator from "./src/navigation/RootNavigator";
import { InactivityProvider } from "./src/context/InactivityContext";

import { initDatabase } from "./src/utils/database";
import { migrateFromAsyncStorage } from "./src/utils/migration";
import { activateLicense, validateLicense, getStoredLicense } from "./src/services/licenseService";

function AppContent({
  licenseStatus,
  isBannerDismissed,
  daysLeft,
  setIsBannerDismissed,
}: {
  licenseStatus: 'valid' | 'expiring_soon' | 'expired';
  isBannerDismissed: boolean;
  daysLeft: number;
  setIsBannerDismissed: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const insets = useSafeAreaInsets();
  return (
    <>
      <StatusBar translucent={false} barStyle="dark-content" backgroundColor="white" />
      <View style={styles.rootContainer}>
        {licenseStatus === 'expiring_soon' && !isBannerDismissed && (
          <View style={{ backgroundColor: 'white', paddingTop: insets.top }}>
            <View style={styles.banner}>
              <Text style={styles.bannerText}>Warning: License expires in {daysLeft} days. Please renew.</Text>
              <TouchableOpacity onPress={() => setIsBannerDismissed(true)}>
                <Text style={styles.bannerDismissText}>Dismiss</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        <RootNavigator />
        <View style={styles.footerContainer}>
          <Text style={styles.footerText}>Powered by Identiqa Labs</Text>
        </View>
      </View>
    </>
  );
}

function ActivationScreen({
  licenseKey,
  setLicenseKey,
  onActivate,
  isLoading,
  errorMessage,
}: {
  licenseKey: string;
  setLicenseKey: React.Dispatch<React.SetStateAction<string>>;
  onActivate: () => void;
  isLoading: boolean;
  errorMessage: string | null;
}) {
  return (
    <View style={styles.centeredContainer}>
      <Text style={styles.activationTitle}>Activate License</Text>
      <Text style={styles.activationSubtitle}>
        Internet is required once for activation. This license will be bound to this device.
      </Text>
      <TextInput
        value={licenseKey}
        onChangeText={setLicenseKey}
        placeholder="Enter license key"
        autoCapitalize="none"
        autoCorrect={false}
        style={styles.licenseInput}
      />
      {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
      <TouchableOpacity
        style={[styles.activateButton, isLoading && styles.activateButtonDisabled]}
        onPress={onActivate}
        disabled={isLoading}
      >
        <Text style={styles.activateButtonText}>{isLoading ? "Activating..." : "Activate"}</Text>
      </TouchableOpacity>
    </View>
  );
}

function LicenseBlockedScreen({ message }: { message: string }) {
  return (
    <View style={styles.centeredContainer}>
      <Text style={styles.blockTitle}>License Blocked</Text>
      <Text style={styles.blockText}>{message}</Text>
    </View>
  );
}

export default function App() {
  const [isDbReady, setIsDbReady] = useState(false);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [licenseStatus, setLicenseStatus] = useState<'valid' | 'expiring_soon' | 'expired'>('valid');
  const [daysLeft, setDaysLeft] = useState(0);
  const [isBannerDismissed, setIsBannerDismissed] = useState(false);
  const [requiresActivation, setRequiresActivation] = useState(false);
  const [licenseKeyInput, setLicenseKeyInput] = useState("");
  const [activationError, setActivationError] = useState<string | null>(null);
  const [isActivating, setIsActivating] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [blockMessage, setBlockMessage] = useState("License Invalid or Used on Another Device");

  useEffect(() => {
    async function lockOrientation() {
      await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
    }
    
    async function setupDatabase() {
      try {
        await initDatabase();
        await migrateFromAsyncStorage();
      } catch (e) {
        console.error("DB Init Error: ", e);
      } finally {
        setIsDbReady(true);
      }
    }

    async function bootstrapLicense() {
      try {
        const status = await validateLicense();
        
        if (status === "needs_activation") {
          setRequiresActivation(true);
          return;
        }
        
        if (status === "invalid_device" || status === "tampered") {
          setIsBlocked(true);
          setBlockMessage("App not licensed for this device");
          return;
        }
        
        if (status === "expired") {
          setLicenseStatus("expired");
          setIsBlocked(true);
          setBlockMessage("License expired");
          return;
        }

        // status === "valid"
        const stored = await getStoredLicense();
        if (stored) {
          const now = Date.now();
          const expiryDate = new Date(stored.expiry);
          const calculatedDaysLeft = Math.ceil((expiryDate.getTime() - now) / (1000 * 60 * 60 * 24));
          
          setLicenseStatus(calculatedDaysLeft <= 30 ? "expiring_soon" : "valid");
          setDaysLeft(calculatedDaysLeft);
        }
        
        await setupDatabase();
      } catch (error) {
        setIsBlocked(true);
        setBlockMessage("License Invalid or Used on Another Device");
        if (__DEV__) {
          console.error("License bootstrap error:", error);
        }
      } finally {
        setIsBootstrapping(false);
      }
    }
    
    lockOrientation();
    bootstrapLicense();
  }, []);

  const handleActivate = async () => {
    try {
      setIsActivating(true);
      setActivationError(null);
      const activated = await activateLicense(licenseKeyInput);

      const now = new Date();
      const expiryDate = new Date(activated.expiry);
      const calculatedDaysLeft = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      if (calculatedDaysLeft <= 0) {
        setIsBlocked(true);
        setBlockMessage("License Invalid or Used on Another Device");
        return;
      }

      setLicenseStatus(calculatedDaysLeft <= 30 ? "expiring_soon" : "valid");
      setDaysLeft(calculatedDaysLeft);
      setRequiresActivation(false);
      await initDatabase();
      await migrateFromAsyncStorage();
      setIsDbReady(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Activation failed. Try again.";
      setActivationError(message);
    } finally {
      setIsActivating(false);
    }
  };

  if (isBootstrapping) {
    return (
      <View style={styles.centeredContainer}>
        <ActivityIndicator size="large" color="#2563EB" />
        <Text style={styles.loadingText}>Validating license...</Text>
      </View>
    );
  }

  if (isBlocked || licenseStatus === "expired") {
    return <LicenseBlockedScreen message={blockMessage} />;
  }

  if (requiresActivation) {
    return (
      <ActivationScreen
        licenseKey={licenseKeyInput}
        setLicenseKey={setLicenseKeyInput}
        onActivate={handleActivate}
        isLoading={isActivating}
        errorMessage={activationError}
      />
    );
  }

  if (!isDbReady) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <InactivityProvider>
          <AppContent
            licenseStatus={licenseStatus}
            isBannerDismissed={isBannerDismissed}
            daysLeft={daysLeft}
            setIsBannerDismissed={setIsBannerDismissed}
          />
        </InactivityProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  rootContainer: {
    flex: 1,
    backgroundColor: 'white',
  },
  banner: {
    backgroundColor: '#FEF3C7',
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#FDE68A',
  },
  bannerText: {
    color: '#92400E',
    fontSize: 14,
    fontWeight: '500',
  },
  bannerDismissText: {
    color: '#92400E',
    fontSize: 14,
    fontWeight: 'bold',
    marginLeft: 16,
  },
  footerContainer: {
    paddingVertical: 10,
    backgroundColor: '#F9FAFB',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 16, // Extra padding for landscape safe area
  },
  footerText: {
    fontSize: 12,
    color: '#4B5563',
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  centeredContainer: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    color: "#374151",
    fontSize: 16,
    fontWeight: "600",
  },
  activationTitle: {
    fontSize: 30,
    fontWeight: "bold",
    color: "#111827",
    marginBottom: 12,
  },
  activationSubtitle: {
    fontSize: 16,
    color: "#4B5563",
    textAlign: "center",
    maxWidth: 560,
    marginBottom: 20,
  },
  licenseInput: {
    width: "100%",
    maxWidth: 480,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    marginBottom: 12,
    backgroundColor: "#FFFFFF",
  },
  activateButton: {
    backgroundColor: "#2563EB",
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    minWidth: 160,
    alignItems: "center",
  },
  activateButtonDisabled: {
    opacity: 0.7,
  },
  activateButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  errorText: {
    color: "#DC2626",
    marginBottom: 10,
    fontSize: 14,
    fontWeight: "600",
  },
  blockTitle: {
    fontSize: 30,
    fontWeight: "bold",
    color: "#111827",
    marginBottom: 16,
  },
  blockText: {
    fontSize: 18,
    color: "#4B5563",
    textAlign: "center",
    maxWidth: 640,
    lineHeight: 28,
  },
});
