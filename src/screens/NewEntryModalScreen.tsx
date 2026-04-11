import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  TouchableOpacity,
  useWindowDimensions,
  Modal,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/RootNavigator";
import { isoNow } from "../utils/format";
import { formatDateTime } from "../utils/format";
import type { VisitorEntry } from "../types/VisitorEntry";
import { saveEntry } from "../utils/database";
import DrawingCanvas, { type DrawingCanvasHandle } from "../components/DrawingCanvas";
import RemarksCanvas from "../components/RemarksCanvas";

type Props = NativeStackScreenProps<RootStackParamList, "NewEntryModal">;

function makeId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// Removed persistPhoto and FileSystem-based storage as everything is now Base64 in AsyncStorage

export default function NewEntryModalScreen({ navigation }: Props) {
  const { width } = useWindowDimensions();
  const isTablet = width > 768;
  const entryId = useMemo(() => makeId(), []);
  const isWeb = Platform.OS === "web";

  const AutoHeightImage = ({ source, containerStyle }: { source: { uri: string }, containerStyle?: any }) => {
    const [aspectRatio, setAspectRatio] = useState(1);
    return (
      <View style={containerStyle}>
        <Image
          source={source}
          style={{ width: "100%", aspectRatio, backgroundColor: "white" }}
          resizeMode="contain"
          onLoad={(e) => {
            const { width, height } = e.nativeEvent.source;
            if (width && height) setAspectRatio(width / height);
          }}
        />
      </View>
    );
  };

  const nameCanvasRef = useRef<DrawingCanvasHandle | null>(null);
  const remarksCanvasRef = useRef<any>(null);

  const [nameMode, setNameMode] = useState<"pen" | "eraser">("pen");
  const [remarksMode, setRemarksMode] = useState<"pen" | "eraser">("pen");

  const [nameClearTrigger, setNameClearTrigger] = useState(0);
  const [remarksClearTrigger, setRemarksClearTrigger] = useState(0);

  const [dateTimeISO] = useState<string>(isoNow());

  const [dignitaryName, setDignitaryName] = useState("");
  const [uploadedNameBase64, setUploadedNameBase64] = useState<string | null>(null);
  const [uploadedRemarksBase64, setUploadedRemarksBase64] = useState<string | null>(null);

  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [facing, setFacing] = useState<"front" | "back">("front");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  const [isRemarksModalVisible, setRemarksModalVisible] = useState(false);

  const CONTAINER_HEIGHT = 180;
  const CANVAS_HEIGHT = 1200;

  const displayDateTime = useMemo(() => formatDateTime(dateTimeISO), [dateTimeISO]);

  // Photo is optional; always allow submission (except when already submitting)
  const canSubmit = true;

  const cameraRef = useRef<CameraView | null>(null);

  // Web camera preview (getUserMedia)
  const webVideoRef = useRef<HTMLVideoElement | null>(null);
  const webStreamRef = useRef<MediaStream | null>(null);

  function getFacingMode(): "user" | "environment" {
    return facing === "front" ? "user" : "environment";
  }

  async function startWebCamera() {
    try {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        Alert.alert("Web camera not supported", "Your browser does not support camera capture.");
        setIsCameraOpen(false);
        return;
      }
      const facingMode = getFacingMode();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode },
        audio: false,
      });
      webStreamRef.current = stream;
      setIsCameraOpen(true);
    } catch {
      setIsCameraOpen(false);
      Alert.alert("Camera permission denied", "Please allow camera access in your browser.");
    }
  }

  useEffect(() => {
    if (isCameraOpen && isWeb && webVideoRef.current && webStreamRef.current) {
      const video = webVideoRef.current;
      video.muted = true;
      video.playsInline = true;
      video.autoplay = true;
      video.srcObject = webStreamRef.current;
      video.play().catch(() => {
        // Autoplay may be blocked, rely on user tap or subsequent actions
      });
    }
  }, [isCameraOpen, isWeb]);

  function stopWebCamera() {
    try {
      const stream = webStreamRef.current;
      if (stream) {
        for (const track of stream.getTracks()) track.stop();
      }
    } finally {
      webStreamRef.current = null;
    }
  }

  async function captureWebPhoto() {
    try {
      if (!webVideoRef.current) return;
      const video = webVideoRef.current;

      // Ensure we have dimensions before drawing.
      if (video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
        await new Promise<void>((resolve) => {
          const t = setTimeout(() => resolve(), 2500);
          const onLoaded = () => {
            clearTimeout(t);
            video.removeEventListener("loadedmetadata", onLoaded);
            resolve();
          };
          video.addEventListener("loadedmetadata", onLoaded);
        });
      }

      if (!video.videoWidth || !video.videoHeight) {
        Alert.alert("Camera not ready", "Please wait a moment for the live preview to load.");
        return;
      }

      const w = video.videoWidth;
      const h = video.videoHeight;
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, w, h);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
      setPhotoUri(dataUrl);
      setIsCameraOpen(false);
    } catch {
      Alert.alert("Capture failed", "Please try again.");
    }
  }

  async function saveCanvasWithTimeout(
    handle: DrawingCanvasHandle | null,
    timeoutMs = 8000
  ): Promise<string | null> {
    if (!handle?.save) return null;
    const savePromise = handle.save();
    const timeoutPromise = new Promise<string | null>((resolve) => {
      setTimeout(() => resolve(null), timeoutMs);
    });
    return Promise.race([savePromise, timeoutPromise]);
  }

  const pickImage = async (onPicked: (b64: string) => void) => {
    const options = [
      { text: "Camera", onPress: () => captureFromCamera(onPicked) },
      { text: "Gallery", onPress: () => selectFromGallery(onPicked) },
      { text: "Cancel", style: "cancel" as const },
    ];
    Alert.alert("Upload Image", "Choose a source", options);
  };

  // Helper to upload a photo and store it as a base64 data URL
  const uploadPhoto = async () => {
    await pickImage((b64) => {
      if (b64) setPhotoUri(`data:image/jpeg;base64,${b64}`);
    });
  };

  const captureFromCamera = async (onPicked: (b64: string) => void) => {
    try {
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        quality: 0.5,
        base64: true,
      });
      if (!result.canceled && result.assets?.[0]?.base64) {
        onPicked(result.assets[0].base64);
      }
    } catch (err: any) {
      Alert.alert("Camera failed", err.message || "Could not open camera");
    }
  };

  const selectFromGallery = async (onPicked: (b64: string) => void) => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.5,
        base64: true,
      });
      if (!result.canceled && result.assets?.[0]?.base64) {
        onPicked(result.assets[0].base64);
      }
    } catch (err: any) {
      Alert.alert("Gallery failed", err.message || "Could not open gallery");
    }
  };

  useEffect(() => {
    // With no explicit "Open Camera" button, request permission and open preview on mount.
    if (isWeb) {
      void startWebCamera();
    } else {
      void ensureCamera();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // When switching between front/back on web, restart stream.
    if (!isWeb) return;
    stopWebCamera();
    if (isCameraOpen) void startWebCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facing]);

  async function ensureCamera() {
    if (cameraPermission?.granted) {
      setIsCameraOpen(true);
      return;
    }
    const res = await requestCameraPermission();
    if (res.granted) setIsCameraOpen(true);
    else {
      setIsCameraOpen(false);
      Alert.alert("Camera permission needed", "Please enable camera permissions to capture a photo.");
    }
  }

  async function takePhoto() {
    if (isWeb) {
      await captureWebPhoto();
      return;
    }
    try {
      const cam = cameraRef.current;
      if (!cam) return;
      // Capture with Base64 enabled and quality compression (0.5) to keep AsyncStorage within limits
      const photo = await cam.takePictureAsync({
        quality: 0.5,
        base64: true,
        skipProcessing: false, // Ensure processing runs for compression
      });
      if (!photo?.base64) {
        throw new Error("Camera captured photo but failed to generate Base64 string.");
      }
      // Store as Data URL immediately
      setPhotoUri(`data:image/jpeg;base64,${photo.base64}`);
      setIsCameraOpen(false);
      console.log("Photo captured and converted to Base64 successfully.");
    } catch (err: any) {
      console.error("Take photo error:", err);
      Alert.alert("Take photo failed", `Error: ${err.message || String(err)}`);
    }
  }

  function handleRetake() {
    setPhotoUri(null);
    if (isWeb) {
      stopWebCamera();
      void startWebCamera();
    } else {
      setIsCameraOpen(true);
    }
  }

  async function handleSubmit() {
    if (isSubmitting) return;
    setIsSubmitting(true);
    console.log("Starting entry submission (Local Storage / Base64 Only)...");

    try {
      // photoUri is already a base64 Data URL from takePhoto
      const storedPhotoUri = photoUri ?? "";

      console.log("nameCanvasRef status:", !!nameCanvasRef.current);
      console.log("remarksCanvasRef status:", !!remarksCanvasRef.current);

      let nameBase64Png = uploadedNameBase64;
      if (!nameBase64Png && nameCanvasRef.current) {
        nameBase64Png = await saveCanvasWithTimeout(nameCanvasRef.current);
      }

      let remarksBase64Png = uploadedRemarksBase64;
      if (!remarksBase64Png && remarksCanvasRef.current?.getImage) {
        remarksBase64Png = await remarksCanvasRef.current.getImage() as string;
      }

      if (!nameBase64Png) {
        Alert.alert("Name Canvas Required", "Please write the visitor name using Pen or upload an image.");
        setIsSubmitting(false);
        return;
      }
      if (!remarksBase64Png) {
        Alert.alert("Remarks required", "Please write the remarks using Pen or upload an image.");
        setIsSubmitting(false);
        return;
      }

      console.log("Saving entry to SQLite...");
      const entry: VisitorEntry = {
        id: entryId,
        dateTimeISO: dateTimeISO,
        dignitaryName: dignitaryName,
        personToMeet: "",
        phoneNumber: "",
        photoUri: storedPhotoUri,
        nameUri: nameBase64Png ? `data:image/png;base64,${nameBase64Png}` : "",
        remarksUri: remarksBase64Png ? `data:image/png;base64,${remarksBase64Png}` : ""
      };

      await saveEntry(entry);
      console.log("Entry saved to SQLite successfully!");
      navigation.goBack();
    } catch (error: any) {
      console.error('Submit crashed:', JSON.stringify(error), error);
      Alert.alert('Error', 'Failed to create entry: ' + (error.message || JSON.stringify(error)));
    } finally {
      setIsSubmitting(false);
    }
  }

  const handleRemarksDone = async () => {
    if (remarksCanvasRef.current?.getImage) {
      setIsSubmitting(true);
      try {
        const b64 = await remarksCanvasRef.current.getImage();
        if (b64) setUploadedRemarksBase64(b64);
      } finally {
        setIsSubmitting(false);
      }
    }
    setRemarksModalVisible(false);
  };

  const handleOpenRemarks = () => {
    if (!dignitaryName.trim()) {
      Alert.alert("Name Required", "Please enter the Dignitary Name & Designation before adding thoughts.");
      return;
    }
    setRemarksModalVisible(true);
  };

  return (
    <View style={styles.screen}>
      <View style={styles.topBar}>
        <Text style={styles.modalTitle}>नई प्रविष्टि / New Entry</Text>
        <Pressable
          onPress={() => navigation.goBack()}
          style={styles.closeBtn}
          accessibilityRole="button"
        >
          <Text style={styles.closeBtnText}>×</Text>
        </Pressable>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.mainContent}>
          <View style={styles.columns}>
            <View style={styles.leftCol}>
              <Text style={styles.sectionTitle}>तस्वीर खींचे / Capture Photo</Text>

              <View style={styles.photoPreviewBox}>
                {photoUri ? (
                  <Image source={{ uri: photoUri }} style={styles.photoPreview} resizeMode="contain" />
                ) : isCameraOpen && isWeb ? (
                  <Pressable
                    onPress={takePhoto}
                    style={styles.cameraPreviewPressable}
                    accessibilityRole="button"
                  >
                    <View style={styles.webVideoWrap}>
                      <video ref={webVideoRef as any} style={styles.webVideo} playsInline />
                      <View style={styles.cameraTapOverlay}>
                        <Text style={styles.cameraTapText}>Tap preview to capture</Text>
                      </View>
                    </View>
                  </Pressable>
                ) : isCameraOpen ? (
                  <Pressable
                    onPress={takePhoto}
                    style={styles.cameraPreviewPressable}
                    accessibilityRole="button"
                  >
                    <CameraView
                      ref={cameraRef}
                      style={styles.cameraView}
                      facing={facing}
                      ratio="4:3"
                    />
                    <View style={styles.cameraTapOverlay}>
                      <Text style={styles.cameraTapText}>Tap preview to capture</Text>
                    </View>
                  </Pressable>
                ) : (
                  <Text style={styles.photoPlaceholder}>No photo captured</Text>
                )}
              </View>

              <View style={styles.photoControls}>
                <TouchableActionButton
                  label="तस्वीर लो / Take Photo"
                  onPress={takePhoto}
                  disabled={!isCameraOpen}
                  variant="green"
                />
                <TouchableActionButton
                  label="पुनः लेना / Retake"
                  onPress={handleRetake}
                  disabled={!photoUri}
                  variant="red"
                />
                <TouchableActionButton
                  label="अपलोड फोटो / Upload Photo"
                  onPress={uploadPhoto}
                  disabled={false}
                  variant="gray"
                />
              </View>

            </View>

            <View style={styles.rightCol}>
              <View
                style={styles.rightFormContainer}
              >
                <View style={styles.fieldRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sectionLabel}>Date &amp; Time</Text>
                    <TextInput value={displayDateTime} editable={false} style={[styles.input, styles.readOnly]} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sectionLabel}>Dignitary Name &amp; Designation <Text style={{color: "red"}}>*</Text></Text>
                    <TextInput
                      value={dignitaryName}
                      onChangeText={setDignitaryName}
                      placeholder="Enter details..."
                      style={styles.input}
                    />
                  </View>
                </View>

                <Text style={styles.sectionTitleRight}>गणमान्य व्यक्ति का नाम एवं पदनाम / Name and designation of the dignitary 🪷</Text>
                <CanvasToolRow
                  mode={nameMode}
                  onPen={() => {
                    setNameMode("pen");
                    nameCanvasRef.current?.setEraser(false);
                  }}
                  onEraser={() => {
                    setNameMode("eraser");
                    nameCanvasRef.current?.setEraser(true);
                  }}
                  onClear={() => {
                    setUploadedNameBase64(null);
                    setNameClearTrigger((v) => v + 1);
                    nameCanvasRef.current?.clear();
                  }}
                  onUpload={() => pickImage(setUploadedNameBase64)}
                />
                {uploadedNameBase64 ? (
                  <AutoHeightImage
                    source={{ uri: `data:image/png;base64,${uploadedNameBase64}` }}
                    containerStyle={[styles.photoPreviewBox, { marginBottom: 10, padding: 0, overflow: 'hidden' }]}
                  />
                ) : (
                  <View style={{ height: isTablet ? 80 : 60 }}>
                    <DrawingCanvas
                      ref={nameCanvasRef}
                      mode={nameMode}
                      clearTrigger={nameClearTrigger}
                      height="100%"
                      onDrawingStateChange={setIsDrawing}
                      onSave={(b64) => setUploadedNameBase64(b64)}
                    />
                  </View>
                )}

                <Text style={styles.sectionTitleRight}>विचार / Thoughts</Text>
                {uploadedRemarksBase64 ? (
                  <View>
                    <AutoHeightImage
                      source={{ uri: `data:image/png;base64,${uploadedRemarksBase64}` }}
                      containerStyle={[styles.remarksPreviewBox, { marginBottom: 10, padding: 0, overflow: 'hidden' }]}
                    />
                    <TouchableOpacity style={styles.editButton} onPress={handleOpenRemarks}>
                      <Text style={styles.editButtonText}>Edit</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.addButton}
                    onPress={handleOpenRemarks}
                  >
                    <Text style={styles.addButtonText}>Add+</Text>
                  </TouchableOpacity>
                )}
              </View>

              <Modal
                visible={isRemarksModalVisible}
                animationType="slide"
                onRequestClose={() => {
                  Alert.alert("Save changes?", "Do you want to save your writing?", [
                    { text: "No", onPress: () => setRemarksModalVisible(false), style: "destructive" },
                    { text: "Yes", onPress: handleRemarksDone },
                  ]);
                }}
              >
                <View style={styles.fullPageContainer}>
                  <View style={styles.fullPageHeader}>
                    <Text style={styles.fullPageTitle}>विचार / Thoughts</Text>
                    <TouchableOpacity
                      disabled={isSubmitting}
                      style={[styles.doneBtn, isSubmitting && styles.submitBtnDisabled]}
                      onPress={handleSubmit}
                    >
                      {isSubmitting ? <ActivityIndicator color="white" /> : <Text style={styles.doneBtnText}>जमा करें / Submit</Text>}
                    </TouchableOpacity>
                  </View>
                  <View style={styles.fullPageCanvasWrap}>
                    <CanvasToolRow
                      mode={remarksMode}
                      onPen={() => setRemarksMode("pen")}
                      onEraser={() => setRemarksMode("eraser")}
                      onClear={() => {
                        setUploadedRemarksBase64(null);
                        setRemarksClearTrigger((v) => v + 1);
                        remarksCanvasRef.current?.clearCanvas?.();
                      }}
                      onUpload={() => pickImage((b64) => {
                        setUploadedRemarksBase64(b64);
                        setRemarksModalVisible(false);
                      })}
                    />
                    <View style={{ flex: 1 }}>
                      <RemarksCanvas
                        ref={remarksCanvasRef}
                        mode={remarksMode}
                        onDrawingStateChange={setIsDrawing}
                        containerStyle={{ flex: 1, maxHeight: 'none', height: '100%', borderWidth: 0 }}
                        initialImageBase64={uploadedRemarksBase64}
                      />
                    </View>
                  </View>
                </View>
              </Modal>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

function TouchableActionButton({
  label,
  onPress,
  disabled,
  variant,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant: "blue" | "gray" | "red" | "green";
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.actionBtnBase,
        variant === "blue" && styles.actionBtnBlue,
        variant === "gray" && styles.actionBtnGray,
        variant === "red" && styles.actionBtnRed,
        variant === "green" && styles.actionBtnGreen,
        disabled && styles.actionBtnDisabled,
      ]}
    >
      <Text style={styles.actionBtnText}>{label}</Text>
    </Pressable>
  );
}

function CanvasToolRow({
  mode,
  onPen,
  onEraser,
  onClear,
  onUpload,
}: {
  mode: "pen" | "eraser";
  onPen: () => void;
  onEraser: () => void;
  onClear: () => void;
  onUpload?: () => void;
}) {
  return (
    <View style={styles.toolRow}>
      <Pressable
        onPress={onPen}
        style={[styles.toolBtn, mode === "pen" && styles.toolBtnActive, styles.toolBtnPen]}
      >
        <Text style={styles.toolBtnText}>पेन / Pen</Text>
      </Pressable>
      <Pressable
        onPress={onEraser}
        style={[styles.toolBtn, mode === "eraser" && styles.toolBtnActive, styles.toolBtnEraser]}
      >
        <Text style={styles.toolBtnText}>रबड़ / Eraser</Text>
      </Pressable>
      <Pressable onPress={onClear} style={[styles.toolBtn, styles.toolBtnClear]}>
        <Text style={styles.toolBtnTextClear}>साफ़ / Clear</Text>
      </Pressable>
      {onUpload && (
        <Pressable onPress={onUpload} style={[styles.toolBtn, styles.toolBtnUpload]}>
          <Text style={styles.toolBtnTextUpload}>अपलोड / Upload</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "white" },
  topBar: {
    paddingTop: 14,
    paddingBottom: 10,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  modalTitle: { fontSize: 18, fontWeight: "900", color: "#111827" },
  remarksPreview: { width: "100%", minHeight: 200, borderRadius: 12, borderWidth: 0, backgroundColor: "white" },
  sectionNoPadding: { borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 16, gap: 10, backgroundColor: "#F9FAFB", overflow: "hidden" },
  closeBtn: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: "#F3F4F6" },
  closeBtnText: { fontSize: 24, fontWeight: "900", color: "#111827" },

  mainContent: { flex: 1, padding: 14, backgroundColor: "white" },
  columns: { flex: 1, flexDirection: "row", gap: 20 },
  leftCol: { flex: 0.4 },
  rightCol: { flex: 0.6 },

  sectionTitle: { fontSize: 16, fontWeight: "900", color: "#111827", marginBottom: 10 },
  rightFormContainer: { flex: 1, gap: 8 },
  sectionTitleRight: { fontSize: 16, fontWeight: "900", color: "#111827", marginBottom: 4, marginTop: 8 },
  sectionLabel: { fontSize: 14, fontWeight: "900", color: "#374151", marginTop: 12, marginBottom: 8 },
  readOnly: { backgroundColor: "#F9FAFB", borderColor: "#E5E7EB" },

  input: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: "white",
    fontWeight: "800",
    color: "#111827",
  },

  photoControls: { gap: 10, marginTop: 12, marginBottom: 12 },
  actionBtnBase: { borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12, alignItems: "center" },
  actionBtnText: { color: "white", fontWeight: "900", fontSize: 13 },
  actionBtnBlue: { backgroundColor: "#2563EB" },
  actionBtnGray: { backgroundColor: "#6B7280" },
  actionBtnRed: { backgroundColor: "#EF4444" },
  actionBtnGreen: { backgroundColor: "#10B981" },
  actionBtnDisabled: { opacity: 0.55 },

  photoPreviewBox: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 16,
    padding: 12,
    flex: 1,
    minHeight: 200,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F9FAFB",
  },
  remarksPreviewBox: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 16,
    padding: 0,
    flex: 1,
    minHeight: 200,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F9FAFB",
    overflow: "hidden"
  },
  photoPlaceholder: { color: "#94A3B8", fontWeight: "900", textAlign: "center", fontSize: 14 },
  photoPreview: { width: "100%", height: "100%", borderRadius: 14 },
  cameraPreviewPressable: { width: "100%", height: "100%", borderRadius: 14, overflow: "hidden" },

  webVideoWrap: { width: "100%", height: "100%", position: "relative" },
  webVideo: { width: "100%", height: "100%", backgroundColor: "black", objectFit: "cover" as any },
  cameraView: { width: "100%", height: "100%" },
  cameraTapOverlay: {
    position: "absolute",
    inset: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.15)",
  },
  cameraTapText: { color: "white", fontWeight: "900" },

  submitBtn: { marginTop: 24, backgroundColor: "#2563EB", borderRadius: 16, paddingVertical: 8, alignItems: "center" },

  submitBtnDisabled: { opacity: 0.55 },
  submitBtnText: { color: "white", fontWeight: "900" },
  fieldRow: { flexDirection: "row", gap: 12 },

  toolRow: { flexDirection: "row", gap: 10, marginTop: 6, marginBottom: 6 },
  toolBtn: { flex: 1, borderRadius: 12, paddingVertical: 10, alignItems: "center", borderWidth: 1, borderColor: "#E5E7EB" },
  toolBtnActive: { borderColor: "#111827", backgroundColor: "#FFFFFF" },
  toolBtnPen: { backgroundColor: "#Dbeafe" },
  toolBtnEraser: { backgroundColor: "#fee2e2" },
  toolBtnClear: { backgroundColor: "#F3F4F6", borderColor: "#E5E7EB" },
  toolBtnUpload: { backgroundColor: "#10B981", borderColor: "#059669" },
  toolBtnText: { fontWeight: "900", fontSize: 14, color: "#111827" },
  toolBtnTextClear: { fontWeight: "900", fontSize: 14, color: "#111827" },
  toolBtnTextUpload: { fontWeight: "900", fontSize: 14, color: "#FFFFFF" },

  fullPageContainer: { flex: 1, backgroundColor: "white" },
  fullPageHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB"
  },
  fullPageTitle: { fontSize: 18, fontWeight: "900", color: "#111827" },
  fullPageCanvasWrap: { flex: 1, padding: 16 },
  doneBtn: { backgroundColor: "#2563EB", paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12 },
  doneBtnText: { color: "white", fontWeight: "900" },
  addButton: {
    backgroundColor: "#F3F4F6",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 16,
  },
  addButtonText: {
    color: "#111827",
    fontWeight: "900",
    fontSize: 15,
  },
  editButton: {
    backgroundColor: "#E5E7EB",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: "center",
    marginTop: 8,
  },
  editButtonText: {
    color: "#111827",
    fontWeight: "900",
    fontSize: 14,
  },
});

