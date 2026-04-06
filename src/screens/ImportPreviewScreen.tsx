import React, { useState, useMemo } from "react";
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  TouchableOpacity,
  ScrollView,
  Modal,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/RootNavigator";
import { saveEntry } from "../utils/database";
import type { VisitorEntry } from "../types/VisitorEntry";
import { isoNow } from "../utils/format";

type Props = NativeStackScreenProps<RootStackParamList, "ImportPreview">;

interface EditableEntry {
  id: string; // Internal temporary ID for the list
  date: string;
  visitorName: string;
  remarks: string;
  selected: boolean;
}

export default function ImportPreviewScreen({ navigation, route }: Props) {
  const { extractedEntries, debugInfo } = route.params;
  const [showDebug, setShowDebug] = useState(false);

  const [entries, setEntries] = useState<EditableEntry[]>(
    extractedEntries.map((e, idx) => ({
      id: Math.random().toString(36).substring(7),
      date: e.date,
      visitorName: e.visitorName,
      remarks: e.remarks,
      selected: true,
    }))
  );

  const selectedCount = useMemo(() => entries.filter((e) => e.selected).length, [entries]);
  const allSelected = selectedCount === entries.length;

  const toggleSelectAll = () => {
    setEntries(entries.map((e) => ({ ...e, selected: !allSelected })));
  };

  const toggleSelect = (id: string) => {
    setEntries(
      entries.map((e) => (e.id === id ? { ...e, selected: !e.selected } : e))
    );
  };

  const updateEntry = (id: string, field: keyof EditableEntry, value: string) => {
    setEntries(
      entries.map((e) => (e.id === id ? { ...e, [field]: value } : e))
    );
  };

  const deleteEntry = (id: string) => {
    setEntries(entries.filter((e) => e.id !== id));
  };

  const handleImport = async () => {
    const selected = entries.filter((e) => e.selected);
    if (selected.length === 0) {
      Alert.alert("No selection", "Please select at least one entry to import.");
      return;
    }

    try {
      for (const e of selected) {
        // Convert extracted data into VisitorEntry
        // Map dd/mm/yyyy to a valid ISO-like format if possible, or just use now if parsing fails
        // For simplicity, we'll store the original recognized date as the 'date' if it looks valid
        
        const entry: VisitorEntry = {
          id: `imp-${Date.now()}-${Math.random().toString(36).substring(7)}`,
          dateTimeISO: e.date, // This might need normalization but following the user's logic
          dignitaryName: "",
          personToMeet: e.visitorName, // Mapping visitor name to some field that fits
          phoneNumber: "",
          photoUri: "",
          nameUri: "",
          remarksUri: e.remarks,
          isImported: true,
        };
        await saveEntry(entry);
      }
      Alert.alert("Success", `${selected.length} entries imported successfully!`);
      navigation.navigate("Dashboard");
    } catch (error) {
      Alert.alert("Error", "Failed to import some entries.");
      console.error(error);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Review Imported Entries</Text>
        <Text style={styles.subtitle}>{selectedCount} entries selected</Text>
      </View>

      <View style={styles.controls}>
        <TouchableOpacity onPress={toggleSelectAll} style={styles.secondaryBtn}>
          <Text style={styles.secondaryBtnText}>{allSelected ? "Deselect All" : "Select All"}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setShowDebug(true)} style={[styles.secondaryBtn, { marginLeft: 10, backgroundColor: "#374151" }]}>
          <Text style={styles.secondaryBtnText}>Show Debug Info</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={entries}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <View style={[styles.card, !item.selected && styles.cardInactive]}>
            <View style={styles.cardHeader}>
              <Pressable
                onPress={() => toggleSelect(item.id)}
                style={[styles.checkbox, item.selected && styles.checkboxActive]}
              >
                {item.selected && <View style={styles.checkboxTick} />}
              </Pressable>
              
              <TouchableOpacity onPress={() => deleteEntry(item.id)} style={styles.deleteBtn}>
                <Text style={styles.deleteBtnText}>Delete</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Date</Text>
              <TextInput
                style={styles.input}
                value={item.date}
                onChangeText={(v) => updateEntry(item.id, "date", v)}
                placeholder="DD/MM/YYYY"
                placeholderTextColor="#6B7280"
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Visitor Name & Address</Text>
              <TextInput
                style={styles.input}
                value={item.visitorName}
                onChangeText={(v) => updateEntry(item.id, "visitorName", v)}
                placeholder="Name..."
                placeholderTextColor="#6B7280"
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Remarks</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={item.remarks}
                onChangeText={(v) => updateEntry(item.id, "remarks", v)}
                placeholder="Remarks..."
                placeholderTextColor="#6B7280"
                multiline
              />
            </View>
          </View>
        )}
      />

      <View style={styles.footer}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.cancelBtn}>
          <Text style={styles.cancelBtnText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleImport} style={styles.importBtn}>
          <Text style={styles.importBtnText}>Import Selected</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={showDebug} animationType="slide" transparent={false}>
        <View style={styles.debugModal}>
          <View style={styles.header}>
            <Text style={styles.title}>Extraction Debug Trace</Text>
            <TouchableOpacity onPress={() => setShowDebug(false)} style={styles.closeModalBtn}>
              <Text style={styles.closeModalBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.debugScroll}>
            <Text style={styles.debugText}>{debugInfo}</Text>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0B1220",
  },
  header: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#1F2937",
  },
  title: {
    fontSize: 24,
    fontWeight: "900",
    color: "#F3F4F6",
  },
  subtitle: {
    fontSize: 16,
    color: "#9CA3AF",
    marginTop: 4,
    fontWeight: "700",
  },
  controls: {
    flexDirection: "row",
    padding: 10,
    backgroundColor: "#111827",
  },
  listContent: {
    padding: 14,
    gap: 16,
  },
  card: {
    backgroundColor: "#111827",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#374151",
  },
  cardInactive: {
    opacity: 0.6,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#3B82F6",
    justifyContent: "center",
    alignItems: "center",
  },
  checkboxActive: {
    backgroundColor: "#3B82F6",
  },
  checkboxTick: {
    width: 12,
    height: 12,
    borderRadius: 2,
    backgroundColor: "white",
  },
  deleteBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: "#991B1B",
    borderRadius: 8,
  },
  deleteBtnText: {
    color: "#FCA5A5",
    fontSize: 12,
    fontWeight: "900",
  },
  field: {
    marginBottom: 10,
  },
  label: {
    color: "#9CA3AF",
    fontSize: 12,
    fontWeight: "800",
    marginBottom: 4,
  },
  input: {
    backgroundColor: "#1F2937",
    borderRadius: 10,
    padding: 12,
    color: "#F3F4F6",
    fontSize: 14,
    fontWeight: "700",
    borderWidth: 1,
    borderColor: "#374151",
  },
  textArea: {
    minHeight: 60,
    textAlignVertical: "top",
  },
  footer: {
    flexDirection: "row",
    padding: 20,
    backgroundColor: "#0B1220",
    borderTopWidth: 1,
    borderTopColor: "#1F2937",
    gap: 12,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#1F2937",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#374151",
  },
  cancelBtnText: {
    color: "#F3F4F6",
    fontWeight: "900",
  },
  importBtn: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#3B82F6",
    alignItems: "center",
  },
  importBtnText: {
    color: "white",
    fontWeight: "900",
  },
  secondaryBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: "#1F2937",
    borderWidth: 1,
    borderColor: "#374151",
  },
  secondaryBtnText: {
    color: "#D1D5DB",
    fontWeight: "800",
    fontSize: 13,
  },
  debugModal: {
    flex: 1,
    backgroundColor: "#0B1220",
  },
  debugScroll: {
    padding: 20,
  },
  debugText: {
    color: "#10B981",
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
    fontSize: 12,
  },
  closeModalBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: "#EF4444",
    borderRadius: 8,
  },
  closeModalBtnText: {
    color: "white",
    fontWeight: "900",
  },
});
