import React, { useState } from "react";
import { Alert, ActivityIndicator, Image, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, Modal } from "react-native";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import * as ImagePicker from "expo-image-picker";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/RootNavigator";
import { saveEntry } from "../utils/database";
import type { VisitorEntry } from "../types/VisitorEntry";

type Props = NativeStackScreenProps<RootStackParamList, "LegacyEntry">;

function makeId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export default function LegacyEntryScreen({ navigation }: Props) {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showPicker, setShowPicker] = useState(false);
  const [dignitaryName, setDignitaryName] = useState("");
  const [position, setPosition] = useState("");
  const [uploadedRemarksBase64, setUploadedRemarksBase64] = useState<string | null>(null);
  const [uploadedPhotoBase64, setUploadedPhotoBase64] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const pickImage = async (onPicked: (b64: string) => void) => {
    const options = [
      {
        text: "Camera", onPress: async () => {
          const result = await ImagePicker.launchCameraAsync({ allowsEditing: true, quality: 0.5, base64: true });
          if (!result.canceled && result.assets?.[0]?.base64) onPicked(result.assets[0].base64);
        }
      },
      {
        text: "Gallery", onPress: async () => {
          const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, quality: 0.5, base64: true });
          if (!result.canceled && result.assets?.[0]?.base64) onPicked(result.assets[0].base64);
        }
      },
      { text: "Cancel", style: "cancel" as const },
    ];
    Alert.alert("Upload Image", "Choose a source", options);
  };

  const uploadRemarks = async () => {
    await pickImage((b64) => {
      if (b64) setUploadedRemarksBase64(b64);
    });
  };

  const handleSubmit = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const entry: VisitorEntry = {
        id: makeId(),
        dateTimeISO: selectedDate.toISOString().split('T')[0],
        dignitaryName: `${dignitaryName} / ${position}`,
        personToMeet: "",
        phoneNumber: "",
        photoUri: uploadedPhotoBase64 ? `data:image/jpeg;base64,${uploadedPhotoBase64}` : "",
        nameUri: "",
        remarksUri: uploadedRemarksBase64 ? `data:image/png;base64,${uploadedRemarksBase64}` : "",
      };
      await saveEntry(entry);
      navigation.goBack();
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to save entry");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.topBar}>
        <Text style={styles.modalTitle}>Legacy Entry</Text>
        <Pressable onPress={() => navigation.goBack()} style={styles.closeBtn} accessibilityRole="button">
          <Text style={styles.closeBtnText}>×</Text>
        </Pressable>
      </View>
      <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 40 }}>
        <Text style={styles.label}>Date</Text>
        {Platform.OS === "web" ? (
          <input
            type="date"
            value={selectedDate.toISOString().split("T")[0]}
            onChange={(e: any) => setSelectedDate(new Date(e.target.value))}
            style={{ padding: 8, borderRadius: 6, borderColor: "#E5E7EB", borderWidth: 1 }}
          />
        ) : (
          <Pressable onPress={() => setShowPicker(true)} style={styles.dateInput}>
            <Text>{selectedDate.toLocaleDateString()}</Text>
          </Pressable>
        )}
        {showPicker && (
          <DateTimePicker
            value={selectedDate}
            mode="date"
            display={Platform.OS === "ios" ? "spinner" : "default"}
            onChange={(e: DateTimePickerEvent, date?: Date) => {
              setShowPicker(false);
              if (e.type === "set" && date) setSelectedDate(date);
            }}
          />
        )}
        <Text style={styles.label}>Dignitary Name</Text>
        <TextInput value={dignitaryName} onChangeText={setDignitaryName} placeholder="Name" style={styles.input} />
        <Text style={styles.label}>Designation</Text>
        <TextInput value={position} onChangeText={setPosition} placeholder="Position" style={styles.input} />
        <Text style={styles.label}>Photo</Text>
        {uploadedPhotoBase64 ? (
          <Image source={{ uri: `data:image/jpeg;base64,${uploadedPhotoBase64}` }} style={styles.remarksPreview} resizeMode="contain" />
        ) : null}
        <TouchableOpacity onPress={() => pickImage((b64) => { if (b64) setUploadedPhotoBase64(b64); })} style={styles.uploadBtn}>
          <Text style={styles.uploadBtnText}>{uploadedPhotoBase64 ? 'Change Photo' : 'Upload Photo'}</Text>
        </TouchableOpacity>
        <Text style={styles.label}>Remarks Image</Text>
        {uploadedRemarksBase64 ? (
          <Image source={{ uri: `data:image/png;base64,${uploadedRemarksBase64}` }} style={styles.remarksPreview} />
        ) : null}
        <TouchableOpacity onPress={uploadRemarks} style={styles.uploadBtn}>
          <Text style={styles.uploadBtnText}>Upload Remarks</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleSubmit} disabled={isSubmitting} style={[styles.submitBtn, isSubmitting && styles.submitBtnDisabled]}>
          {isSubmitting ? <ActivityIndicator color="white" /> : <Text style={styles.submitBtnText}>Submit</Text>}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "white" },
  topBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 14, borderBottomWidth: 1, borderBottomColor: "#E5E7EB" },
  modalTitle: { fontSize: 18, fontWeight: "900", color: "#111827" },
  closeBtn: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: "#F3F4F6" },
  closeBtnText: { fontSize: 24, fontWeight: "900", color: "#111827" },
  content: { padding: 14 },
  label: { fontSize: 14, fontWeight: "900", color: "#374151", marginTop: 12 },
  input: { borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 12, paddingVertical: 12, paddingHorizontal: 12, marginTop: 6 },
  dateInput: { borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 12, padding: 12, marginTop: 6 },
  uploadBtn: { backgroundColor: "#2563EB", paddingVertical: 12, borderRadius: 12, alignItems: "center", marginTop: 12 },
  uploadBtnText: { color: "white", fontWeight: "900" },
  remarksPreview: { width: "100%", height: 200, marginTop: 12, borderRadius: 8 },
  submitBtn: { backgroundColor: "#16A34A", paddingVertical: 12, borderRadius: 12, alignItems: "center", marginTop: 20 },
  submitBtnText: { color: "white", fontWeight: "900" },
  submitBtnDisabled: { opacity: 0.5 },
});
