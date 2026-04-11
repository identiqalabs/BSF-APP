import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, FlatList, Image, Platform, Pressable, StyleSheet, Text, TextInput, View, ActivityIndicator, TouchableOpacity, useWindowDimensions, Modal } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import * as FileSystem from "expo-file-system/legacy";
import * as DocumentPicker from "expo-document-picker";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

import { getAllEntries, importEntries, replaceEntries, updateHostAction } from "../utils/database";
import type { VisitorEntry } from "../types/VisitorEntry";
import { formatDateTime } from "../utils/format";
import { loadLastBackup, setLastBackup } from "../storage/lastBackup";
import * as ImagePicker from "expo-image-picker";
import { extractEntriesFromImage } from "../utils/extractEntries";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/RootNavigator";

type Props = NativeStackScreenProps<RootStackParamList, "Dashboard">;

function toIsoDate(d: Date | string | number): string {
  const dateObj = new Date(d);
  if (Number.isNaN(dateObj.getTime())) return "";
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, "0");
  const day = String(dateObj.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDDMMYYYY(d: Date): string {
  const dd = `${d.getDate()}`.padStart(2, "0");
  const mm = `${d.getMonth() + 1}`.padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function withinRange(entryISO: string, activeFrom: Date | null, activeTo: Date | null): boolean {
  const entryDateStr = toIsoDate(entryISO);
  if (!entryDateStr) return true;

  if (activeFrom) {
    if (entryDateStr < toIsoDate(activeFrom)) return false;
  }
  if (activeTo) {
    if (entryDateStr > toIsoDate(activeTo)) return false;
  }
  return true;
}

function DashboardContent({ navigation, isLegacyPopup, setViewingLegacy }: Props & { isLegacyPopup?: boolean, setViewingLegacy: (val: boolean) => void }) {
  const { width } = useWindowDimensions();
  const isTablet = width > 768;
  const [entries, setEntries] = useState<VisitorEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const [draftFrom, setDraftFrom] = useState<Date | null>(null);
  const [draftTo, setDraftTo] = useState<Date | null>(null);
  const [activeFrom, setActiveFrom] = useState<Date | null>(null);
  const [activeTo, setActiveTo] = useState<Date | null>(null);

  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showToPicker, setShowToPicker] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;

  const [exporting, setExporting] = useState(false);
  const [busyJson, setBusyJson] = useState(false);
  const [processingPhysical, setProcessingPhysical] = useState(false);
  const [lastBackupLabel, setLastBackupLabel] = useState<string>("--");
  const [isActionModalVisible, setIsActionModalVisible] = useState(false);
  const [actionInput, setActionInput] = useState("");
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const loaded = await getAllEntries();
      console.log(`Storage: Loaded ${loaded.length} total entries.`);
      loaded.sort((a, b) => (a.dateTimeISO < b.dateTimeISO ? 1 : -1));
      setEntries(loaded);
      const last = await loadLastBackup();
      setLastBackupLabel(last ?? "--");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, activeFrom, activeTo]);

  const filtered = useMemo(() => {
    let res = entries.filter((e) => {
      const isLegacy = !e.isImported && !e.nameUri;
      return isLegacyPopup ? isLegacy : !isLegacy;
    });

    if (activeFrom || activeTo) {
      res = res.filter((e) => {
        if (!withinRange(e.dateTimeISO, activeFrom, activeTo)) return false;
        return true;
      });
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      res = res.filter((e) => {
        return (e.dignitaryName?.toLowerCase().includes(q)) ||
          (e.personToMeet?.toLowerCase().includes(q));
      });
    }

    console.log(`Filter: Active, Results: ${res.length} (Total entries: ${entries.length})`);
    return res;
  }, [entries, activeFrom, activeTo, searchQuery, isLegacyPopup]);

  const displayData = useMemo(() => {
    // Standard behavior: show filtered even if empty.
    // Fallback behavior (per request): show all if filtered is empty, UNLESS we are explicitly searching.
    const filterIsActive = !!(activeFrom || activeTo);
    const searchIsActive = !!searchQuery.trim();

    if (searchIsActive) return filtered;
    if (filterIsActive && filtered.length > 0) return filtered;
    return filtered;
  }, [entries, filtered, activeFrom, activeTo, searchQuery]);

  const totalPages = Math.ceil(displayData.length / ITEMS_PER_PAGE);
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return displayData.slice(start, start + ITEMS_PER_PAGE);
  }, [displayData, currentPage]);

  async function handleExportPdf() {
    if (filtered.length === 0) {
      Alert.alert("No entries", "There are no visitor records to export as PDF.");
      return;
    }

    if (Platform.OS === "web") {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const jspdfMod = require("jspdf");
        const jsPDF = jspdfMod.jsPDF ?? jspdfMod.default ?? jspdfMod;

        const doc = new jsPDF({
          orientation: "portrait",
          unit: "pt",
          format: "a4",
        });

        const title = "Ashwini Officers' Mess - Visitor Register";
        doc.setFontSize(16);
        doc.text(title, 40, 30);

        let y = 50;

        for (let i = 0; i < filtered.length; i++) {
          const e = filtered[i];

          if (y + 100 > 800 || i === 0) {
            if (i > 0) {
              doc.addPage();
              y = 40;
            }
            doc.setFontSize(11);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(55, 65, 81);
            doc.text("तस्वीर / Photo", 40, y);
            doc.text("नाम / Name", 110, y);
            doc.text("विचार / Thoughts", 270, y);
            doc.text("दिनांक / Date", 460, y);

            doc.setDrawColor(229, 231, 235);
            doc.setLineWidth(1);
            doc.line(40, y + 5, 555, y + 5);
            y += 20;
          }


          // Row entry
          try {
            if (e.photoUri && e.photoUri.startsWith("data:")) {
              doc.setDrawColor(229, 231, 235);
              doc.rect(40, y + 5, 65, 65);
              doc.addImage(e.photoUri, "JPEG", 40, y + 5, 65, 65);

            }
          } catch { }

          try {
            if (e.nameUri) {
              let nameDataUrl = e.nameUri;
              if (e.nameUri.startsWith("file://")) {
                const nameBase64 = await FileSystem.readAsStringAsync(e.nameUri, { encoding: (FileSystem as any).EncodingType?.Base64 });
                nameDataUrl = `data:image/png;base64,${nameBase64}`;
              } else if (e.nameUri.startsWith("data:image")) {
                nameDataUrl = e.nameUri;
              }
              doc.addImage(nameDataUrl, "PNG", 110, y + 10, 150, 50);


            }
          } catch { }

          try {
            if (e.remarksUri) {
              let remarksDataUrl = e.remarksUri;
              if (e.remarksUri.startsWith("file://")) {
                const remarksBase64 = await FileSystem.readAsStringAsync(e.remarksUri, { encoding: (FileSystem as any).EncodingType?.Base64 });
                remarksDataUrl = `data:image/png;base64,${remarksBase64}`;
              } else if (e.remarksUri.startsWith("data:image")) {
                remarksDataUrl = e.remarksUri;
              }
              doc.addImage(remarksDataUrl, "PNG", 270, y + 5, 180, 90);


            }
          } catch { }

          doc.setFont("helvetica", "normal");
          doc.setFontSize(10);
          doc.setTextColor(55, 65, 81);

          const dt = formatDateTime(e.dateTimeISO);
          const dtParts = dt.split(", ");
          if (dtParts.length === 2) {
            doc.text(dtParts[0], 460, y + 30);
            doc.text(dtParts[1], 460, y + 44);
          } else {
            doc.text(dt, 460, y + 35);
          }

          y += 110;



          doc.setDrawColor(243, 244, 246);
          doc.setLineWidth(1);
          doc.line(40, y - 5, 555, y - 5);
        }

        doc.save(`visitor-register-${Date.now()}.pdf`);
      } catch (err) {
        console.error(err);
        Alert.alert("Export PDF failed", "Could not generate the PDF. Please try again.");
      }
    } else {
      // Mobile implementation (Android/iOS)
      setExporting(true);
      try {
        console.log("PDF Export: Starting HTML generation");

        const html = `
          <html>
            <head>
              <style>
                body { font-family: 'Helvetica', sans-serif; padding: 20px; color: #374151; }
                header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #2563EB; padding-bottom: 15px; }
                h1 { font-size: 20px; margin: 0; color: #111827; }
                h2 { font-size: 16px; margin: 5px 0 0 0; color: #4B5563; }
                table { width: 100%; border-collapse: collapse; margin-top: 10px; }
                th { background-color: #f9fafb; padding: 12px 8px; text-align: center; font-size: 13px; font-weight: bold; border-bottom: 2px solid #e5e7eb; }
                td { padding: 15px 8px; text-align: center; border-bottom: 1px solid #f3f4f6; vertical-align: middle; }
                .photo { width: 90px; height: 90px; object-fit: cover; border-radius: 8px; border: 1px solid #e5e7eb; }
                .signature-name { max-width: 150px; height: 60px; object-fit: contain; }
                .signature-remarks { max-width: 350px; height: 120px; object-fit: contain; }
                .date-cell { text-align: left; font-size: 12px; white-space: nowrap; }

              </style>
            </head>
            <body>
              <header>
                <h1>ASHWINI OFFICERS' MESS</h1>
                <h2>Visitor Register</h2>
              </header>
              <table>
                <thead>
                  <tr>
                    <th>तस्वीर / Photo</th>
                    <th style="width: 30%">नाम / Name</th>
                    <th style="width: 35%">विचार /Thoughts</th>
                    <th style="text-align: left">दिनांक / Date</th>
                  </tr>
                </thead>
                <tbody>
                  ${(await Promise.all(filtered.map(async e => {
          let photoHtml = '<div style="width:90px;height:90px;background:#f3f4f6;border-radius:8px;"></div>';
          if (e.photoUri) {
            let base64 = '';
            if (e.photoUri.startsWith('data:image')) {
              base64 = e.photoUri.split(',')[1];
            } else if (e.photoUri.startsWith("file://")) {
              base64 = await FileSystem.readAsStringAsync(e.photoUri, { encoding: (FileSystem as any).EncodingType?.Base64 });
            }
            photoHtml = `<img src="data:image/jpeg;base64,${base64}" class="photo" />`;
          }

          let nameImg = '-';
          if (e.nameUri) {
            let base64 = '';
            if (e.nameUri.startsWith('data:image')) {
              base64 = e.nameUri.split(',')[1];
            } else if (e.nameUri.startsWith("file://")) {
              base64 = await FileSystem.readAsStringAsync(e.nameUri, { encoding: (FileSystem as any).EncodingType?.Base64 });
            }
            nameImg = `<img src="data:image/png;base64,${base64}" class="signature-name" />`;
          }

          let remarksImg = '-';
          if (e.remarksUri) {
            let base64 = '';
            if (e.remarksUri.startsWith('data:image')) {
              base64 = e.remarksUri.split(',')[1];
            } else if (e.remarksUri.startsWith("file://")) {
              base64 = await FileSystem.readAsStringAsync(e.remarksUri, { encoding: (FileSystem as any).EncodingType?.Base64 });
            }
            remarksImg = `<img src="data:image/png;base64,${base64}" class="signature-remarks" />`;
          }

          return `
                    <tr>
                      <td>${photoHtml}</td>
                      <td>${nameImg}</td>
                      <td>${remarksImg}</td>
                      <td class="date-cell">${formatDateTime(e.dateTimeISO).replace(', ', '<br/>')}</td>
                    </tr>
                    `;
        }))).join('')}
                </tbody>
              </table>
            </body>
          </html>
        `;


        console.log("PDF Export: Executing printAsync");
        await Print.printAsync({ html });
        console.log("PDF Export: Print dialog opened successfully");
      } catch (err: any) {
        console.error(`PDF Export Failed:`, err);
        Alert.alert(
          "Export PDF failed",
          `Error: ${err.message || 'Unknown error'}`
        );
      } finally {
        setExporting(false);
      }
    }
  }

  async function handleBackupJson() {
    console.log("Backup JSON: Function triggered");
    if (busyJson) return;

    if (entries.length === 0) {
      Alert.alert("No data", "There are no visitor records to backup.");
      return;
    }

    setBusyJson(true);
    try {
      const snapshot = entries;
      const json = JSON.stringify(snapshot, null, 2);
      const fileName = `visitor-backup-${Date.now()}.json`;

      if (Platform.OS === "web") {
        Alert.alert("Web Export", "JSON backup is not supported on web yet.");
      } else {
        // Native (Android/iOS)
        const fileUri = `${FileSystem.documentDirectory}${fileName}`;
        console.log("Backup JSON: Writing to", fileUri);

        await FileSystem.writeAsStringAsync(fileUri, json, { encoding: "utf8" });

        if (Platform.OS === "android") {
          const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
          if (permissions.granted) {
            const destUri = await FileSystem.StorageAccessFramework.createFileAsync(permissions.directoryUri, fileName, "application/json");
            await FileSystem.writeAsStringAsync(destUri, json, { encoding: "utf8" });
            const label = formatDateTime(new Date().toISOString());
            await setLastBackup(label);
            setLastBackupLabel(label);
            Alert.alert("Success", "Backup saved to Downloads!");
          } else {
            Alert.alert("Error", "Storage permission denied.");
          }
        } else {
          // iOS fallback just share it since no direct download folder access without document picker or share sheet
          if (await Sharing.isAvailableAsync()) {
            await Sharing.shareAsync(fileUri);
            const label = formatDateTime(new Date().toISOString());
            await setLastBackup(label);
            setLastBackupLabel(label);
            Alert.alert("Success", "Backup generated and opened for sharing.");
          } else {
            Alert.alert("Error", "Sharing is not available on this mobile device.");
          }
        }
      }
    } catch (err: any) {
      console.error("Backup JSON Error:", err);
      Alert.alert(
        "Backup failed",
        `Could not generate or save JSON backup.\n\nError: ${err.message || "Unknown error"}`
      );
    } finally {
      setBusyJson(false);
    }
  }

  async function handleUploadPhysical() {
    if (processingPhysical) return;

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        quality: 0.8,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) return;

      // Check for PDFs through DocumentPicker if needed, but ImagePicker handles images.
      // The user request specified PDF check, but ImagePicker is filtered for images.
      // If we used DocumentPicker we'd check extensions.

      setProcessingPhysical(true);
      const allExtracted: any[] = [];
      let totalDebugInfo = "";

      for (let i = 0; i < result.assets.length; i++) {
        const asset = result.assets[i];
        // Processing page X of Y...
        console.log(`Processing page ${i + 1} of ${result.assets.length}...`);

        try {
          const { entries, debugInfo } = await extractEntriesFromImage(asset.uri);
          totalDebugInfo += debugInfo + "\n\n";

          if (entries.length === 0) {
            console.log(`No entries extracted from image ${i + 1}`);
          }
          allExtracted.push(...entries);
        } catch (err) {
          Alert.alert("Error", `Failed to process image ${i + 1}.`);
        }
      }

      if (allExtracted.length === 0 && !totalDebugInfo) {
        Alert.alert("Error", "No data could be read from any image.");
        return;
      }

      navigation.navigate("ImportPreview", {
        extractedEntries: allExtracted,
        debugInfo: totalDebugInfo
      });
    } catch (error) {
      Alert.alert("Error", "An error occurred while selecting or processing images.");
    } finally {
      setProcessingPhysical(false);
    }
  }

  async function handleRestoreJson() {
    if (busyJson) return;
    setBusyJson(true);
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: "application/json",
        copyToCacheDirectory: true,
      });
      if (res.canceled) return;
      if (!res.assets?.[0]?.uri) throw new Error("No file uri");
      const raw = await FileSystem.readAsStringAsync(res.assets[0].uri);
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) throw new Error("Invalid shape");

      const entriesToImport = parsed as VisitorEntry[];

      Alert.alert(
        "Confirm Restore",
        `This will merge ${entriesToImport.length} records into your current library. Existing entries with the same ID will be updated. Continue?`,
        [
          { text: "Cancel", style: "cancel", onPress: () => setBusyJson(false) },
          {
            text: "Merge Data",
            onPress: async () => {
              try {
                await importEntries(entriesToImport);
                await reload();
                Alert.alert("Success", `Successfully merged ${entriesToImport.length} records.`);
              } catch (err) {
                Alert.alert("Restore failed", "An error occurred while merging data.");
              } finally {
                setBusyJson(false);
              }
            }
          },
        ]
      );
    } catch {
      Alert.alert("Restore failed", "Please select a valid backup JSON file.");
      setBusyJson(false);
    }
  }

  function handleFilter() {
    setActiveFrom(draftFrom);
    setActiveTo(draftTo);
  }

  function handleReset() {
    setDraftFrom(null);
    setDraftTo(null);
    setActiveFrom(null);
    setActiveTo(null);
  }

  function openActionModal(entryId: string, currentAction?: string) {
    setSelectedEntryId(entryId);
    setActionInput(currentAction || "");
    setIsActionModalVisible(true);
  }

  async function handleSaveAction() {
    if (!selectedEntryId) return;
    if (!actionInput.trim()) {
      Alert.alert("Error", "Please enter an action taken.");
      return;
    }
    try {
      console.log('Saving host action for entry id:', selectedEntryId, 'action:', actionInput);
      await updateHostAction(selectedEntryId, actionInput);
      await reload();
      setIsActionModalVisible(false);
      Alert.alert("Success", "Host action status updated!");
    } catch {
      Alert.alert("Error", "Failed to save host action.");
    }
  }

  return (
    <View style={styles.screen}>
      <View style={styles.brandHeader}>
        <Image source={require("../../assets/bsflogo.png")} style={styles.logo} resizeMode="contain" />
        <View style={{ flex: 1 }}>
          <Text style={styles.brandTitle}>ASHWINI OFFICERS' MESS</Text>
          <Text style={[styles.brandSubtitle, { textAlign: "center", width: "100%" }]}>
            {isLegacyPopup ? "Legacy Records Dashboard" : "Visitor Book"}
          </Text>
        </View>

        {isLegacyPopup && (
          <TouchableOpacity
            onPress={() => setViewingLegacy(false)}
            style={[styles.createBtn, { backgroundColor: "#6B7280", marginRight: 10 }]}
          >
            <Text style={styles.createBtnText}>Close</Text>
          </TouchableOpacity>
        )}

        {!isLegacyPopup && (
          <TouchableOpacity
            onPress={() => navigation.navigate("NewEntryModal")}
            style={styles.createBtn}
          >
            <Text style={styles.createBtnText}>Create</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.filtersArea}>
        <View style={styles.searchRow}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search entries... (Name, Designation etc.)"
            placeholderTextColor="#9CA3AF"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        <View style={styles.filterRow}>
          <View style={styles.dateGroup}>
            <Text style={styles.dateLabel}>from</Text>
            {Platform.OS === "web" ? (
              <input
                type="date"
                style={{ ...StyleSheet.flatten(styles.dateInput), outline: "none", boxSizing: "border-box" } as any}
                value={draftFrom ? draftFrom.toISOString().split("T")[0] : ""}
                onChange={(e: any) => {
                  const val = e.target.value;
                  if (val) setDraftFrom(new Date(val));
                  else setDraftFrom(null);
                }}
              />
            ) : (
              <Pressable
                onPress={() => setShowFromPicker(true)}
                style={styles.dateInput}
              >
                <Text style={styles.dateInputText}>{draftFrom ? formatDDMMYYYY(draftFrom) : "dd/mm/yyyy"}</Text>
              </Pressable>
            )}
          </View>

          <View style={styles.dateGroup}>
            <Text style={styles.dateLabel}>to</Text>
            {Platform.OS === "web" ? (
              <input
                type="date"
                style={{ ...StyleSheet.flatten(styles.dateInput), outline: "none", boxSizing: "border-box" } as any}
                value={draftTo ? draftTo.toISOString().split("T")[0] : ""}
                onChange={(e: any) => {
                  const val = e.target.value;
                  if (val) setDraftTo(new Date(val));
                  else setDraftTo(null);
                }}
              />
            ) : (
              <Pressable onPress={() => setShowToPicker(true)} style={styles.dateInput}>
                <Text style={styles.dateInputText}>{draftTo ? formatDDMMYYYY(draftTo) : "dd/mm/yyyy"}</Text>
              </Pressable>
            )}
          </View>

          <TouchableOpacity onPress={handleFilter} style={styles.filterBtn}>
            <Text style={styles.btnText}>Filter</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleReset} style={styles.resetBtn}>
            <Text style={styles.resetBtnText}>Reset</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.actionsRow}>
          <TouchableOpacity
            onPress={handleExportPdf}
            disabled={filtered.length === 0}
            style={[styles.actionBtn, styles.redBtn]}
          >
            <Text style={styles.actionBtnText}>Export PDF</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleBackupJson}
            disabled={busyJson}
            style={[styles.actionBtn, styles.darkBtn, busyJson && { opacity: 0.5 }]}
          >
            <Text style={styles.actionBtnText}>{busyJson ? "Working..." : "Backup JSON"}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleRestoreJson}
            disabled={busyJson}
            style={[styles.actionBtn, styles.darkBtn]}
          >
            <Text style={styles.actionBtnText}>Restore JSON</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => isLegacyPopup ? navigation.navigate('LegacyEntry') : setViewingLegacy(true)}
            disabled={processingPhysical}
            style={[styles.actionBtn, { backgroundColor: "#0B1220" }, processingPhysical && { opacity: 0.5 }]}
          >
            {processingPhysical ? <ActivityIndicator color="white" /> : <Text style={styles.actionBtnText}>{isLegacyPopup ? "Upload Legacy Records" : "Legacy Records"}</Text>}
          </TouchableOpacity>
        </View>

        <Text style={styles.lastBackupLabel}>Last backup: {lastBackupLabel}</Text>
      </View>

      {loading && entries.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      ) : (
        <>
          <FlatList
            data={paginatedData}
            keyExtractor={(item) => item.id}
            style={{ width: "100%" }}
            ListHeaderComponent={
              <View style={styles.tableHeader}>
                <View style={styles.colPhoto}>
                  <Text style={styles.th}>तस्वीर / Photo</Text>
                </View>
                <View style={styles.colName}>
                  <Text style={styles.th}>नाम / Name</Text>
                </View>
                <View style={styles.colRemarks}>
                  <Text style={styles.th}>विचार / Thoughts</Text>
                </View>
                <View style={styles.colDate}>
                  <Text style={styles.th}>दिनांक / Date</Text>
                </View>


              </View>
            }
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text style={styles.emptyText}>No visitor records found.</Text>
              </View>
            }
            contentContainerStyle={styles.tableBody}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => {
                  const parent = navigation.getParent?.();
                  if (parent?.navigate) parent.navigate("EntryDetail", { entryId: item.id });
                  else navigation.navigate?.("EntryDetail", { entryId: item.id });
                }}
                style={styles.tableRow}
              >
                <View style={styles.colPhoto}>
                  <Image source={{ uri: item.photoUri }} style={styles.photoThumb} resizeMode="cover" />
                  {item.hostAction && (
                    <View style={styles.hostActionBadge} />
                  )}
                </View>
                <View style={styles.colName}>
                  {item.isImported ? (
                    <Text style={styles.importedText}>{item.personToMeet}</Text>
                  ) : (
                    <View style={styles.nameCellContent}>
                      {!!item.dignitaryName && (
                        <Text style={styles.dignitaryNameText} numberOfLines={2}>
                          {item.dignitaryName}
                        </Text>
                      )}
                      <Image
                        source={{ uri: item.nameUri }}
                        style={styles.nameThumb}
                        resizeMode="contain"
                      />
                    </View>
                  )}
                </View>
                <View style={styles.colRemarks}>
                  {item.isImported ? (
                    <Text style={styles.importedText} numberOfLines={2}>{item.remarksUri}</Text>
                  ) : (
                    <Image
                      source={{ uri: item.remarksUri }}
                      style={styles.remarksThumb}
                      resizeMode="contain"
                    />
                  )}
                </View>
                <View style={styles.colDate}>
                  <Text style={styles.dateText}>{item.isImported ? item.dateTimeISO : formatDateTime(item.dateTimeISO)}</Text>

                  <TouchableOpacity
                    onPress={(e) => {
                      e.stopPropagation();
                      openActionModal(item.id, item.hostAction);
                    }}
                    style={styles.addActionBtn}
                  >
                    <Text style={styles.addActionBtnText}>{item.hostAction ? "Edit" : "+ Action"}</Text>
                  </TouchableOpacity>
                </View>
              </Pressable>
            )}
          />

          {displayData.length > 0 && (
            <View style={styles.paginationRow}>
              <TouchableOpacity
                disabled={currentPage === 1}
                onPress={() => setCurrentPage(p => p - 1)}
                style={[styles.pageBtn, currentPage === 1 && styles.pageBtnDisabled]}
              >
                <Text style={styles.pageBtnText}>Previous</Text>
              </TouchableOpacity>

              <Text style={styles.pageIndicator}>
                Page {currentPage} of {Math.max(1, totalPages)}
              </Text>

              <TouchableOpacity
                disabled={currentPage === totalPages || totalPages === 0}
                onPress={() => setCurrentPage(p => p + 1)}
                style={[styles.pageBtn, (currentPage === totalPages || totalPages === 0) && styles.pageBtnDisabled]}
              >
                <Text style={styles.pageBtnText}>Next</Text>
              </TouchableOpacity>
            </View>
          )}
        </>
      )}

      {showFromPicker && (
        <DateTimePicker
          value={draftFrom ?? new Date()}
          mode="date"
          display={Platform.OS === "ios" ? "spinner" : "default"}
          onChange={(e: DateTimePickerEvent, date?: Date) => {
            setShowFromPicker(false);
            if (e.type === "set" && date) {
              setDraftFrom(date);
            }
          }}
        />
      )}

      {showToPicker && (
        <DateTimePicker
          value={draftTo ?? new Date()}
          mode="date"
          display={Platform.OS === "ios" ? "spinner" : "default"}
          onChange={(e: DateTimePickerEvent, date?: Date) => {
            setShowToPicker(false);
            if (e.type === "set" && date) {
              setDraftTo(date);
            }
          }}
        />
      )}

      <Modal
        visible={isActionModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsActionModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Update Host Action</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="e.g. Access granted, Meeting scheduled..."
              value={actionInput}
              onChangeText={setActionInput}
              multiline
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={[styles.modalBtn, styles.saveBtn]} onPress={handleSaveAction}>
                <Text style={styles.modalBtnText}>Save</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, styles.cancelBtn]} onPress={() => setIsActionModalVisible(false)}>
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
  brandHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingTop: 12, paddingBottom: 8, gap: 12 },
  logo: { width: 64, height: 64, borderRadius: 10, backgroundColor: "transparent" },
  brandTitle: { fontSize: 18, fontWeight: "900", color: "#111827" },
  brandSubtitle: { fontSize: 16, fontWeight: "800", color: "#374151", marginTop: 3, textAlign: "center" },

  filtersArea: { paddingHorizontal: 14, paddingBottom: 10 },
  searchRow: { marginBottom: 12 },
  searchInput: { backgroundColor: "#F9FAFB", borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16, fontSize: 15, fontWeight: "800", color: "#111827" },

  filterRow: { flexDirection: "row", alignItems: "flex-end", gap: 12, flexWrap: "wrap" as any },
  dateGroup: { gap: 6 },
  dateLabel: { fontSize: 13, fontWeight: "900", color: "#374151" },
  dateInput: { width: 140, borderRadius: 10, borderWidth: 1, borderColor: "#E5E7EB", paddingVertical: 12, paddingHorizontal: 12, backgroundColor: "white" },
  dateInputText: { fontWeight: "800", color: "#111827" },

  filterBtn: { backgroundColor: "#2563EB", borderRadius: 10, paddingVertical: 12, paddingHorizontal: 20, alignItems: "center" },
  resetBtn: { backgroundColor: "#E5E7EB", borderRadius: 10, paddingVertical: 12, paddingHorizontal: 20, alignItems: "center", borderWidth: 1, borderColor: "#D1D5DB" },
  btnText: { fontWeight: "900", color: "white", fontSize: 15 },
  resetBtnText: { fontWeight: "900", color: "#111827", fontSize: 15 },
  createBtn: { backgroundColor: "#2563EB", borderRadius: 10, paddingVertical: 14, paddingHorizontal: 24, alignItems: "center" },
  createBtnText: { color: "white", fontWeight: "900", fontSize: 16 },

  actionsRow: { flexDirection: "row", gap: 12, marginTop: 14, flexWrap: "wrap" as any },
  actionBtn: { flex: 1, minWidth: 180, borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  actionBtnText: { color: "white", fontWeight: "900", fontSize: 15 },
  greenBtn: { backgroundColor: "#16A34A" },
  redBtn: { backgroundColor: "#EF4444" },
  darkBtn: { backgroundColor: "#111827" },

  lastBackupLabel: { marginTop: 8, fontWeight: "800", color: "#111827" },

  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  tableBody: { paddingVertical: 8, paddingHorizontal: 14, gap: 10, width: "100%", alignSelf: "stretch" },
  empty: { paddingVertical: 60, alignItems: "center" },
  emptyText: { fontWeight: "900", color: "#6B7280" },

  tableHeader: { width: "100%", flexDirection: "row", alignItems: "center", backgroundColor: "#F3F4F6", height: 50, borderRadius: 14, borderWidth: 1, borderColor: "#E5E7EB", marginBottom: 6, paddingHorizontal: 0, alignSelf: "stretch" },
  th: { fontWeight: "900", color: "#374151", fontSize: 14 },

  colPhoto: { flex: 0.8, alignItems: "center", justifyContent: "center" },
  colName: { flex: 2.2, alignItems: "center", justifyContent: "center" },
  colRemarks: { flex: 3.0, alignItems: "center", justifyContent: "center" },
  colDate: { flex: 1.6, alignItems: "flex-start", justifyContent: "center" },

  tableRow: { width: "100%", flexDirection: "row", paddingHorizontal: 0, alignItems: "center", backgroundColor: "white", borderRadius: 16, borderWidth: 1, borderColor: "#E5E7EB", paddingVertical: 12, alignSelf: "stretch", justifyContent: "space-between" },
  photoThumb: { width: 80, height: 80, borderRadius: 14, borderWidth: 1, borderColor: "#E5E7EB" },
  nameThumb: { width: 220, height: 110, borderRadius: 12, borderWidth: 1, borderColor: "#E5E7EB", backgroundColor: "#F9FAFB" },
  remarksThumb: { width: 350, height: 110, borderRadius: 12, borderWidth: 1, borderColor: "#E5E7EB", backgroundColor: "#F9FAFB" },
  dateText: { fontWeight: "900", color: "#374151", fontSize: 14 },
  importedText: { fontSize: 12, fontWeight: "700", color: "#1F2937", textAlign: "center" },

  addActionBtn: {
    marginTop: 6,
    backgroundColor: "#0B1220",
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 6,
    alignItems: "center",
  },
  addActionBtnText: {
    color: "white",
    fontSize: 11,
    fontWeight: "900",
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20
  },
  modalContent: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: "white",
    borderRadius: 20,
    padding: 24,
    gap: 16,
  },
  modalTitle: { fontSize: 18, fontWeight: "900", color: "#111827" },
  modalInput: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    backgroundColor: "#F9FAFB",
    minHeight: 100,
    textAlignVertical: "top",
    color: "#111827",
    fontWeight: "700"
  },
  modalButtons: { flexDirection: "row", gap: 12 },
  modalBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: "center" },
  saveBtn: { backgroundColor: "#0B1220" },
  cancelBtn: { backgroundColor: "#E5E7EB" },
  modalBtnText: { color: "white", fontWeight: "900", fontSize: 15 },

  paginationRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 20,
    gap: 20,
    backgroundColor: "white",
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB"
  },
  pageBtn: {
    backgroundColor: "#0B1220",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    minWidth: 100,
    alignItems: "center"
  },
  pageBtnDisabled: {
    opacity: 0.4
  },
  pageBtnText: {
    color: "white",
    fontWeight: "900",
    fontSize: 14
  },
  pageIndicator: {
    fontSize: 15,
    fontWeight: "900",
    color: "#111827"
  },
  hostActionBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#10B981",
    borderWidth: 2,
    borderColor: "white"
  },
  nameCellContent: { flexDirection: "row", alignItems: "center", gap: 10, justifyContent: "flex-start", flex: 1, paddingHorizontal: 10 },
  dignitaryNameText: { fontSize: 13, color: "#111827", fontWeight: "700", flex: 0.6, textAlign: "left" },
});

export default function EntriesTabScreen({ navigation }: Props) {
  const [viewingLegacy, setViewingLegacy] = useState(false);

  return (
    <View style={{ flex: 1 }}>
      <DashboardContent
        navigation={navigation}
        isLegacyPopup={false}
        setViewingLegacy={setViewingLegacy}
      />
      <Modal visible={viewingLegacy} animationType="slide" onRequestClose={() => setViewingLegacy(false)}>
        <DashboardContent
          navigation={navigation}
          isLegacyPopup={true}
          setViewingLegacy={setViewingLegacy}
        />
      </Modal>
    </View>
  );
}

