import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, View, useWindowDimensions, Modal, TextInput, TouchableOpacity, Alert } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/RootNavigator";
import { getAllEntries, updateHostAction } from "../utils/database";
import type { VisitorEntry } from "../types/VisitorEntry";
import { formatDateTime } from "../utils/format";

type Props = NativeStackScreenProps<RootStackParamList, "EntryDetail">;

export default function EntryDetailScreen({ route }: Props) {
  const { width } = useWindowDimensions();
  const isTablet = width > 768;
  const { entryId } = route.params;
  const [entry, setEntry] = useState<VisitorEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [hostActionInput, setHostActionInput] = useState("");

  const fetchEntry = async () => {
    try {
      const all = await getAllEntries();
      const found = all.find((e) => e.id === entryId) ?? null;
      setEntry(found);
      if (found?.hostAction) {
        setHostActionInput(found.hostAction);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEntry();
  }, [entryId]);

  const handleSaveAction = async () => {
    if (!hostActionInput.trim()) {
      Alert.alert("Error", "Please enter an action taken.");
      return;
    }
    try {
      await updateHostAction(entryId, hostActionInput);
      await fetchEntry();
      setIsModalVisible(false);
      Alert.alert("Success", "Host action updated successfully!");
    } catch (err) {
      Alert.alert("Error", "Failed to save host action.");
    }
  };

  const dateLabel = useMemo(() => {
    if (!entry) return "";
    if (entry.isImported) return entry.dateTimeISO;
    return formatDateTime(entry.dateTimeISO);
  }, [entry]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!entry) {
    return (
      <View style={styles.center}>
        <Text style={styles.notFound}>Entry not found.</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={styles.screen} contentContainerStyle={[styles.content, isTablet && { paddingHorizontal: 40 }]}>
        <Text style={styles.title}>Entry Detail</Text>
        <Text style={styles.date}>{dateLabel}</Text>

        {!!entry.dignitaryName && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Dignitary Name & Position</Text>
            <Text style={{ fontSize: 16, color: "#374151", fontWeight: "700" }}>{entry.dignitaryName}</Text>
          </View>
        )}

        {entry.hostAction ? (
          <View style={[styles.section, { backgroundColor: "#ECFDF5", borderColor: "#10B981" }]}>
            <Text style={[styles.sectionTitle, { color: "#065F46" }]}>Host Action Taken:</Text>
            <Text style={{ fontSize: 17, color: "#065F46", fontWeight: "800" }}>{entry.hostAction}</Text>
          </View>
        ) : null}

        {entry.photoUri ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Photo</Text>
            <Image source={{ uri: entry.photoUri }} style={[styles.photo, isTablet && { height: 400 }]} resizeMode="contain" />
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{entry.isImported ? "Visitor Name & Address" : "Name (Handwritten)"}</Text>
          {entry.isImported ? (
            <Text style={styles.importedText}>{entry.personToMeet}</Text>
          ) : (
            <Image source={{ uri: entry.nameUri }} style={[styles.handwriting, isTablet && { height: 220 }]} resizeMode="contain" />
          )}
        </View>
  
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{entry.isImported ? "Remarks" : "Remarks (Handwritten)"}</Text>
          {entry.isImported ? (
            <Text style={styles.importedText}>{entry.remarksUri}</Text>
          ) : (
            <Image source={{ uri: entry.remarksUri }} style={[styles.handwriting, isTablet && { height: 220 }]} resizeMode="contain" />
          )}
        </View>

        <TouchableOpacity 
          style={styles.hostActionBtn}
          onPress={() => setIsModalVisible(true)}
        >
          <Text style={styles.hostActionBtnText}>{entry.hostAction ? "Update Host Action" : "Add Host Action"}</Text>
        </TouchableOpacity>
        
        <View style={{ height: 40 }} />
      </ScrollView>

      <Modal
        visible={isModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Host Action Taken</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="e.g. Meeting scheduled, Access granted..."
              value={hostActionInput}
              onChangeText={setHostActionInput}
              multiline
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={[styles.modalBtn, styles.saveBtn]} onPress={handleSaveAction}>
                <Text style={styles.modalBtnText}>Save Action</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, styles.cancelBtn]} onPress={() => setIsModalVisible(false)}>
                <Text style={[styles.modalBtnText, { color: "#374151" }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "white" },
  content: { padding: 14, gap: 12 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  notFound: { fontWeight: "900", color: "#6B7280" },

  title: { fontSize: 24, fontWeight: "900", color: "#111827" },
  date: { fontWeight: "800", color: "#374151", fontSize: 16 },

  section: { borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 16, padding: 16, gap: 10, backgroundColor: "#F9FAFB" },
  sectionTitle: { fontWeight: "900", color: "#111827", fontSize: 16 },
  photo: { width: "100%", height: 320, borderRadius: 12, borderWidth: 1, borderColor: "#E5E7EB", backgroundColor: "#F9FAFB" },
  handwriting: { width: "100%", height: 160, borderRadius: 12, borderWidth: 1, borderColor: "#E5E7EB", backgroundColor: "white" },
  importedText: { fontSize: 18, color: "#111827", fontWeight: "700" },

  hostActionBtn: {
    backgroundColor: "#0B1220",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 10,
  },
  hostActionBtnText: { color: "white", fontWeight: "900", fontSize: 16 },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20
  },
  modalContent: {
    width: "100%",
    maxWidth: 500,
    backgroundColor: "white",
    borderRadius: 20,
    padding: 24,
    gap: 16,
  },
  modalTitle: { fontSize: 20, fontWeight: "900", color: "#111827" },
  modalInput: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    backgroundColor: "#F9FAFB",
    minHeight: 120,
    textAlignVertical: "top",
    color: "#111827",
    fontWeight: "700"
  },
  modalButtons: { flexDirection: "row", gap: 12 },
  modalBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: "center" },
  saveBtn: { backgroundColor: "#0B1220" },
  cancelBtn: { backgroundColor: "#E5E7EB" },
  modalBtnText: { color: "white", fontWeight: "900", fontSize: 16 },
});

