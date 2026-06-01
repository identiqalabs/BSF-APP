import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  Modal,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { validateLicense, getStoredLicense } from "../services/licenseService";
import { setDeletePassword } from "../utils/password";

export default function SettingsScreen() {
  const navigation = useNavigation();
  const [isValidating, setIsValidating] = useState(false);
  const [showLicensePrompt, setShowLicensePrompt] = useState(false);
  const [licenseKeyInput, setLicenseKeyInput] = useState("");
  
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const handleStartPasswordChange = () => {
    setShowLicensePrompt(true);
    setLicenseKeyInput("");
  };

  const handleVerifyLicense = async () => {
    if (!licenseKeyInput.trim()) {
      Alert.alert("Error", "Please enter your license key.");
      return;
    }

    setIsValidating(true);
    try {
      const status = await validateLicense();
      if (status !== "valid") {
        Alert.alert("License Invalid", "Your current license is not valid. Status: " + status);
        return;
      }

      const stored = await getStoredLicense();
      if (!stored) {
        Alert.alert("Error", "No license found on this device.");
        return;
      }

      if (licenseKeyInput.trim() === stored.licenseKey) {
        setShowLicensePrompt(false);
        setShowPasswordChange(true);
      } else {
        Alert.alert("Error", "License key does not match the active license on this device.");
      }
    } catch (err) {
      Alert.alert("Error", "Failed to verify license.");
    } finally {
      setIsValidating(false);
    }
  };

  const handleUpdatePassword = async () => {
    if (!newPassword.trim()) {
      Alert.alert("Error", "Password cannot be empty.");
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert("Error", "Passwords do not match.");
      return;
    }

    try {
      await setDeletePassword(newPassword);
      Alert.alert("Success", "Delete password updated successfully.");
      setShowPasswordChange(false);
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      Alert.alert("Error", "Failed to update password.");
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Security</Text>
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Delete Button Password</Text>
            <Text style={styles.cardSublabel}>
              Change the password required to delete records. Requires license verification.
            </Text>

            {!showPasswordChange ? (
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={handleStartPasswordChange}
                disabled={isValidating}
              >
                <Text style={styles.actionBtnText}>Change Password</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.form}>
                <Text style={styles.formTitle}>Set New Password</Text>
                <TextInput
                  style={styles.input}
                  placeholder="New Password"
                  secureTextEntry
                  value={newPassword}
                  onChangeText={setNewPassword}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Confirm New Password"
                  secureTextEntry
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                />
                <View style={styles.formActions}>
                  <TouchableOpacity
                    style={[styles.formBtn, styles.cancelBtn]}
                    onPress={() => setShowPasswordChange(false)}
                  >
                    <Text style={styles.cancelBtnText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.formBtn, styles.saveBtn]}
                    onPress={handleUpdatePassword}
                  >
                    <Text style={styles.saveBtnText}>Save</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </View>
      </ScrollView>

      {/* License Verification Modal */}
      <Modal
        visible={showLicensePrompt}
        transparent
        animationType="fade"
        onRequestClose={() => setShowLicensePrompt(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Verify License</Text>
            <Text style={styles.modalSubtitle}>
              Please enter your active license key to continue.
            </Text>
            
            <TextInput
              style={styles.input}
              placeholder="License Key"
              autoCapitalize="none"
              autoCorrect={false}
              value={licenseKeyInput}
              onChangeText={setLicenseKeyInput}
            />

            {isValidating ? (
              <ActivityIndicator size="large" color="#2563EB" style={{ marginVertical: 10 }} />
            ) : (
              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.modalBtn, styles.modalCancelBtn]}
                  onPress={() => setShowLicensePrompt(false)}
                >
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalBtn, styles.modalVerifyBtn]}
                  onPress={handleVerifyLicense}
                >
                  <Text style={styles.modalVerifyText}>Verify</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F3F4F6",
  },
  header: {
    height: 64,
    backgroundColor: "white",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#111827",
  },
  backBtn: {
    padding: 8,
  },
  backBtnText: {
    color: "#2563EB",
    fontSize: 16,
    fontWeight: "600",
  },
  content: {
    padding: 20,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6B7280",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    backgroundColor: "white",
    borderRadius: 12,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  cardLabel: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
  },
  cardSublabel: {
    fontSize: 14,
    color: "#6B7280",
    marginTop: 4,
    marginBottom: 16,
  },
  actionBtn: {
    backgroundColor: "#2563EB",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  actionBtnText: {
    color: "white",
    fontWeight: "700",
    fontSize: 15,
  },
  form: {
    marginTop: 8,
    padding: 12,
    backgroundColor: "#F9FAFB",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  formTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 12,
  },
  input: {
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    fontSize: 16,
  },
  formActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
  },
  formBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    minWidth: 80,
    alignItems: "center",
  },
  cancelBtn: {
    backgroundColor: "#E5E7EB",
  },
  cancelBtnText: {
    color: "#4B5563",
    fontWeight: "600",
  },
  saveBtn: {
    backgroundColor: "#059669",
  },
  saveBtnText: {
    color: "white",
    fontWeight: "600",
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalCard: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: "white",
    borderRadius: 16,
    padding: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#111827",
    marginBottom: 8,
    textAlign: "center",
  },
  modalSubtitle: {
    fontSize: 14,
    color: "#6B7280",
    marginBottom: 20,
    textAlign: "center",
    lineHeight: 20,
  },
  modalActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
  modalBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  modalCancelBtn: {
    backgroundColor: "#F3F4F6",
  },
  modalCancelText: {
    color: "#4B5563",
    fontWeight: "600",
  },
  modalVerifyBtn: {
    backgroundColor: "#2563EB",
  },
  modalVerifyText: {
    color: "white",
    fontWeight: "600",
  },
});
