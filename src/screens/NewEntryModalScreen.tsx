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
  FlatList,
  Modal,
  SafeAreaView,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/RootNavigator";
import { useInactivity } from "../context/InactivityContext";
import { isoNow } from "../utils/format";
import { formatDateTime } from "../utils/format";
import type { VisitorEntry } from "../types/VisitorEntry";
import { saveEntry, getAllEntries } from "../utils/database";
import DrawingCanvas, { type DrawingCanvasHandle } from "../components/DrawingCanvas";
import RemarksCanvas from "../components/RemarksCanvas";
import { optimizeDrawingToEntryFile, optimizePhotoToEntryFile } from "../utils/imageStorage";
import { clearCacheDir } from "../utils/clearCacheDir";

type Props = NativeStackScreenProps<RootStackParamList, "NewEntryModal">;

function makeId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// Removed persistPhoto and FileSystem-based storage as everything is now Base64 in AsyncStorage

export default function NewEntryModalScreen({ navigation }: Props) {
  const { setLocked } = useInactivity();
  const { width } = useWindowDimensions();
  const isTablet = width > 768;
  const entryId = useMemo(() => makeId(), []);
  const isWeb = Platform.OS === "web";

  const AutoHeightImage = ({ source, containerStyle }: { source: { uri: string }, containerStyle?: any }) => {
    const [aspectRatio, setAspectRatio] = useState<number | null>(null);
    return (
      <View style={[containerStyle, { height: undefined, minHeight: 0 }]}>
        <Image
          source={source}
          style={{
            width: "100%",
            aspectRatio: aspectRatio || 1,
            backgroundColor: "white",
            opacity: aspectRatio ? 1 : 0
          }}
          resizeMode="contain"
          onLoad={(e) => {
            const { width, height } = e.nativeEvent.source;
            if (width && height) setAspectRatio(width / height);
          }}
        />
      </View>
    );
  };

  const remarksCanvasRef = useRef<any>(null);

  const [remarksMode, setRemarksMode] = useState<"pen" | "eraser">("pen");

  const [remarksClearTrigger, setRemarksClearTrigger] = useState(0);

  const [dateTimeISO] = useState<string>(isoNow());

  const [dignitaryName, setDignitaryName] = useState("");
  const [uploadedRemarksUri, setUploadedRemarksUri] = useState<string | null>(null);

  const uploadedRemarksUriRef = useRef<string | null>(null);
  const setRemarksUri = (val: string | null) => {
    uploadedRemarksUriRef.current = val;
    setUploadedRemarksUri(val);
  };

  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [facing, setFacing] = useState<"front" | "back">("front");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  const [previewEntry, setPreviewEntry] = useState<VisitorEntry | null>(null);
  const [isViewingAllRecords, setIsViewingAllRecords] = useState(false);
  const [allEntries, setAllEntries] = useState<VisitorEntry[]>([]);
  const [isRemarksModalVisible, setRemarksModalVisible] = useState(false);

  // ── Inline edit-preview state ─────────────────────────────────────────────
  const [isEditingPreview, setIsEditingPreview] = useState(false);
  const [editDignitaryName, setEditDignitaryName] = useState("");
  const [editPhotoUri, setEditPhotoUri] = useState<string | null>(null);
  const [editRemarksUri, setEditRemarksUri] = useState<string | null>(null);
  const [isEditRemarksModalVisible, setIsEditRemarksModalVisible] = useState(false);
  const [editRemarksMode, setEditRemarksMode] = useState<"pen" | "eraser">("pen");
  const editRemarksCanvasRef = useRef<any>(null);

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
      const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
      const optimizedUri = await optimizePhotoToEntryFile(dataUrl);
      setPhotoUri(optimizedUri);
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

  const pickImage = async (onPicked: (uri: string) => void) => {
    const options = [
      { text: "Camera", onPress: () => captureFromCamera(onPicked) },
      { text: "Gallery", onPress: () => selectFromGallery(onPicked) },
      { text: "Cancel", style: "cancel" as const },
    ];
    Alert.alert("Upload Image", "Choose a source", options);
  };

  // Helper to upload photo and persist only optimized file URI.
  const uploadPhoto = async () => {
    await pickImage(async (uri) => {
      if (uri) {
        try {
          const optimizedUri = await optimizePhotoToEntryFile(uri);
          setPhotoUri(optimizedUri);
        } catch (err: any) {
          setPhotoUri(uri);
        }
      }
    });
  };

  const captureFromCamera = async (onPicked: (uri: string) => void) => {
    try {
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        quality: 1,
      });
      if (!result.canceled && result.assets?.[0]?.uri) {
        onPicked(result.assets[0].uri);
      }
    } catch (err: any) {
      Alert.alert("Camera failed", err.message || "Could not open camera");
    }
  };

  const selectFromGallery = async (onPicked: (uri: string) => void) => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 1,
      });
      if (!result.canceled && result.assets?.[0]?.uri) {
        onPicked(result.assets[0].uri);
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
      // Capture and then persist an optimized JPEG URI.
      const photo = await cam.takePictureAsync({
        quality: 1,
        skipProcessing: false,
      });
      if (!photo?.uri) {
        throw new Error("Camera captured photo but failed to get URI.");
      }
      const optimizedUri = await optimizePhotoToEntryFile(photo.uri);
      setPhotoUri(optimizedUri);
      setIsCameraOpen(false);
      console.log("Photo captured and manipulated successfully.");
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
    console.log("Starting entry submission (optimized file URI mode)...");

    try {
      const storedPhotoUri = photoUri ?? "";

      console.log("remarksCanvasRef status:", !!remarksCanvasRef.current);

      let remarksUri = uploadedRemarksUriRef.current;
      if (!remarksUri && remarksCanvasRef.current?.getImage) {
        const remarksBase64 = await remarksCanvasRef.current.getImage() as string;
        if (remarksBase64) {
          remarksUri = await optimizeDrawingToEntryFile(remarksBase64, "remarks");
        }
      }

      if (!dignitaryName.trim()) {
        Alert.alert("Name Required", "Please enter the Dignitary Name & Designation.");
        setIsSubmitting(false);
        return;
      }
      if (!remarksUri) {
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
        remarksUri: remarksUri ?? ""
      };

      setPreviewEntry(entry);
    } catch (error: any) {
      console.error('Submit crashed:', JSON.stringify(error), error);
      Alert.alert('Error', 'Failed to create entry: ' + (error.message || JSON.stringify(error)));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleFinalSave() {
    if (isSubmitting || !previewEntry) return;
    setIsSubmitting(true);
    try {
      await saveEntry(previewEntry);
      await clearCacheDir();

      // Fetch all entries for the view-only dashboard
      const loaded = await getAllEntries();
      loaded.sort((a, b) => (a.dateTimeISO < b.dateTimeISO ? 1 : -1));
      setAllEntries(loaded);
      setIsViewingAllRecords(true);
    } catch (err: any) {
      Alert.alert("Save Error", "Could not save entry: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleExitToHome() {
    setLocked(true);
    navigation.goBack();
  }

  function enterEditMode() {
    if (!previewEntry) return;
    setEditDignitaryName(previewEntry.dignitaryName || "");
    setEditPhotoUri(previewEntry.photoUri || null);
    setEditRemarksUri(previewEntry.remarksUri || null);
    setIsEditingPreview(true);
  }

  function handleEdit() {
    enterEditMode();
  }

  async function handleEditSave() {
    if (!previewEntry || isSubmitting) return;
    setIsSubmitting(true);
    try {
      if (!editRemarksUri) {
        Alert.alert("Thoughts Required", "Please add thoughts to continue.");
        return;
      }
      setPreviewEntry({
        ...previewEntry,
        dignitaryName: editDignitaryName,
        photoUri: editPhotoUri || "",
        remarksUri: editRemarksUri,
      });
      setIsEditingPreview(false);
    } finally {
      setIsSubmitting(false);
    }
  }

  const editUploadPhoto = async () => {
    await pickImage(async (uri) => {
      if (uri) {
        try {
          const optimizedUri = await optimizePhotoToEntryFile(uri);
          setEditPhotoUri(optimizedUri);
        } catch {
          setEditPhotoUri(uri);
        }
      }
    });
  };

  const handleRemarksClose = () => {
    Alert.alert("Save changes?", "Do you want to save your writing?", [
      {
        text: "No", onPress: () => {
          setRemarksModalVisible(false);
          setRemarksMode("pen");
        }, style: "destructive"
      },
      { text: "Yes", onPress: handleRemarksDone },
    ]);
  };

  const handleRemarksDone = async () => {
    if (remarksCanvasRef.current?.getImage) {
      setIsSubmitting(true);
      try {
        const b64 = await remarksCanvasRef.current.getImage();
        if (b64) {
          const uri = await optimizeDrawingToEntryFile(b64, "remarks");
          setRemarksUri(uri);
        }
      } finally {
        setIsSubmitting(false);
      }
    }
    setRemarksModalVisible(false);
    setRemarksMode("pen");
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
          onPress={() => {
            navigation.goBack();
          }}
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
        <ScrollView contentContainerStyle={styles.mainContentScroll} style={styles.mainContent}>
          <View style={styles.columns}>
            <View style={styles.leftCol}>
              <Text style={styles.sectionTitle}>तस्वीर ले / Capture Photo</Text>

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
                  label="Click"
                  onPress={takePhoto}
                  disabled={!isCameraOpen}
                  variant="green"
                />
                <TouchableActionButton
                  label="Retake"
                  onPress={handleRetake}
                  disabled={!photoUri}
                  variant="red"
                />
                <TouchableActionButton
                  label="Upload"
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
                <View>
                  <Text style={styles.sectionLabel}>दिनांक और समय / Date & Time</Text>
                  <TextInput value={displayDateTime} editable={false} style={[styles.input, styles.readOnly]} />
                </View>

                <View>
                  <Text style={styles.sectionLabel}>गणमान्य व्यक्ति का नाम एवं पदनाम / Dignitary Name & Designation <Text style={{ color: "red" }}>*</Text></Text>
                  <TextInput
                    value={dignitaryName}
                    onChangeText={setDignitaryName}
                    placeholder="Enter details..."
                    style={styles.input}
                  />
                </View>

                <View style={{ height: 8 }} />

                <Text style={styles.sectionTitleRight}>विचार / Thoughts</Text>
                {uploadedRemarksUri ? (
                  <View>
                    <View style={[styles.remarksPreviewBox, { marginBottom: 10 }]}>
                      <Image
                        source={{ uri: uploadedRemarksUri }}
                        style={styles.logRemarksThumb}
                        resizeMode="contain"
                      />
                    </View>
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
                onRequestClose={handleRemarksClose}
              >
                <View style={styles.fullPageContainer}>
                  <View style={styles.fullPageHeader}>
                    <Text style={styles.fullPageTitle}>विचार / Thoughts</Text>
                    <TouchableOpacity onPress={handleRemarksClose} style={styles.fullPageBackBtn}>
                      <Text style={styles.fullPageBackBtnText}>Back</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.fullPageCanvasWrap}>
                    <CanvasToolRow
                      mode={remarksMode}
                      onPen={() => setRemarksMode("pen")}
                      onEraser={() => setRemarksMode("eraser")}
                      onClear={() => {
                        setRemarksUri(null);
                        setRemarksClearTrigger((v) => v + 1);
                        remarksCanvasRef.current?.clearCanvas?.();
                      }}
                      onUpload={() => pickImage(async (uri) => {
                        try {
                          const optimized = await optimizeDrawingToEntryFile(uri, "remarks");
                          setRemarksUri(optimized);
                          remarksCanvasRef.current?.loadImage(optimized);
                        } catch (err) {
                          console.error("Failed to read remarks image:", err);
                          setRemarksUri(uri);
                          remarksCanvasRef.current?.loadImage(uri);
                        }
                      })}
                    />
                    <View style={{ flex: 1 }}>
                      <RemarksCanvas
                        ref={remarksCanvasRef}
                        mode={remarksMode}
                        onDrawingStateChange={setIsDrawing}
                        containerStyle={{ flex: 1, maxHeight: 'none', height: '100%', borderWidth: 0 }}
                        initialImageBase64={uploadedRemarksUri}
                      />
                    </View>
                  </View>
                  <View style={styles.fullPageFooter}>
                    <TouchableOpacity
                      disabled={isSubmitting}
                      style={[styles.fullSubmitBtn, isSubmitting && styles.submitBtnDisabled]}
                      onPress={async () => {
                        // Step 1: Save the remarks canvas first
                        if (remarksCanvasRef.current?.getImage) {
                          try {
                            const b64 = await remarksCanvasRef.current.getImage();
                            if (b64) {
                              const uri = await optimizeDrawingToEntryFile(b64, "remarks");
                              setRemarksUri(uri);
                            }
                          } catch (err) {
                            console.error('Failed to get remarks image:', err);
                          }
                        }
                        // Step 2: Close the modal
                        setRemarksModalVisible(false);
                        setRemarksMode("pen");
                        // Step 3: Submit with a small delay to allow state to update
                        setTimeout(() => handleSubmit(), 100);
                      }}
                    >
                      {isSubmitting ? (
                        <ActivityIndicator color="white" />
                      ) : (
                        <Text style={styles.fullSubmitBtnText}>Submit</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              </Modal>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {previewEntry && (
        <View style={StyleSheet.absoluteFill}>
          <ScrollView
            style={styles.previewScroll}
            contentContainerStyle={styles.previewContent}
            scrollEnabled={!isDrawing}
          >
            <View style={styles.previewCard}>
              <Text style={styles.previewTopTitle}>
                {isEditingPreview ? "प्रविष्टि संपादन / Edit Entry" : "प्रविष्टि पूर्वावलोकन / Entry Preview"}
              </Text>

              {/* Date & Time — always read-only */}
              <View style={styles.previewSection}>
                <Text style={styles.previewLabel}>दिनांक और समय / Date & Time</Text>
                <Text style={styles.previewValue}>{formatDateTime(previewEntry.dateTimeISO)}</Text>
              </View>

              {/* Dignitary Name */}
              <View style={styles.previewSection}>
                <Text style={styles.previewLabel}>गणमान्य व्यक्ति का नाम एवं पदनाम / Dignitary Name & Designation</Text>
                {isEditingPreview ? (
                  <TextInput
                    value={editDignitaryName}
                    onChangeText={setEditDignitaryName}
                    placeholder="Enter details..."
                    style={[styles.input, { marginTop: 6 }]}
                  />
                ) : (
                  <Text style={styles.previewValue}>{previewEntry.dignitaryName}</Text>
                )}
              </View>

              {/* Photo */}
              <View style={styles.previewSection}>
                <Text style={styles.previewLabel}>Photo</Text>
                {(isEditingPreview ? editPhotoUri : previewEntry.photoUri) ? (
                  <View style={styles.previewPhotoSmall}>
                    <Image
                      source={{ uri: (isEditingPreview ? editPhotoUri : previewEntry.photoUri) as string }}
                      style={{ width: '100%', height: '100%', borderRadius: 10 }}
                      resizeMode="contain"
                    />
                  </View>
                ) : (
                  <Text style={styles.previewNoPhoto}>No photo captured</Text>
                )}
                {isEditingPreview && (
                  <View style={styles.previewPhotoEditBtns}>
                    <TouchableOpacity style={[styles.previewEditFieldBtn, { flex: 1 }]} onPress={editUploadPhoto}>
                      <Text style={styles.previewEditFieldBtnText}>📷 Change Photo</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.previewEditFieldBtn, { flex: 1 }]}
                      onPress={() => captureFromCamera(async (uri) => {
                        try {
                          const optimizedUri = await optimizePhotoToEntryFile(uri);
                          setEditPhotoUri(optimizedUri);
                        } catch {
                          setEditPhotoUri(uri);
                        }
                      })}
                    >
                      <Text style={styles.previewEditFieldBtnText}>🔄 Retake</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              <View style={{ height: 4 }} />

              {/* Thoughts */}
              <View style={styles.previewSection}>
                <Text style={styles.previewLabel}>विचार / Thoughts</Text>
                {isEditingPreview ? (
                  <>
                    {editRemarksUri ? (
                      <View>
                        <View style={[styles.remarksPreviewBox, { marginBottom: 10 }]}>
                          <Image source={{ uri: editRemarksUri }} style={styles.logRemarksThumb} resizeMode="contain" />
                        </View>
                        <TouchableOpacity style={styles.editButton} onPress={() => setIsEditRemarksModalVisible(true)}>
                          <Text style={styles.editButtonText}>✏️ Edit Thoughts</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <TouchableOpacity style={styles.addButton} onPress={() => setIsEditRemarksModalVisible(true)}>
                        <Text style={styles.addButtonText}>Add+ Thoughts</Text>
                      </TouchableOpacity>
                    )}
                  </>
                ) : (
                  <AutoHeightImage source={{ uri: previewEntry.remarksUri }} containerStyle={styles.previewImageContainer} />
                )}
              </View>

              {/* Actions */}
              <View style={styles.previewActions}>
                {isEditingPreview ? (
                  <>
                    <TouchableOpacity
                      style={[styles.previewBtn, styles.editPreviewBtn]}
                      onPress={() => setIsEditingPreview(false)}
                      disabled={isSubmitting}
                    >
                      <Text style={styles.editPreviewBtnText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.previewBtn, styles.donePreviewBtn]}
                      onPress={handleEditSave}
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? (
                        <ActivityIndicator color="white" />
                      ) : (
                        <Text style={styles.donePreviewBtnText}>Save</Text>
                      )}
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <TouchableOpacity
                      style={[styles.previewBtn, styles.editPreviewBtn]}
                      onPress={handleEdit}
                      disabled={isSubmitting}
                    >
                      <Text style={styles.editPreviewBtnText}>Edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.previewBtn, styles.donePreviewBtn]}
                      onPress={handleFinalSave}
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? (
                        <ActivityIndicator color="white" />
                      ) : (
                        <Text style={styles.donePreviewBtnText}>Done</Text>
                      )}
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </View>
          </ScrollView>

          {/* Edit Thoughts Modal */}
          <Modal
            visible={isEditRemarksModalVisible}
            animationType="slide"
            onRequestClose={() => setIsEditRemarksModalVisible(false)}
          >
            <View style={styles.fullPageContainer}>
              <View style={styles.fullPageHeader}>
                <Text style={styles.fullPageTitle}>विचार / Thoughts</Text>
                <TouchableOpacity onPress={() => setIsEditRemarksModalVisible(false)} style={styles.fullPageBackBtn}>
                  <Text style={styles.fullPageBackBtnText}>Back</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.fullPageCanvasWrap}>
                <CanvasToolRow
                  mode={editRemarksMode}
                  onPen={() => setEditRemarksMode("pen")}
                  onEraser={() => setEditRemarksMode("eraser")}
                  onClear={() => {
                    setEditRemarksUri(null);
                    editRemarksCanvasRef.current?.clearCanvas?.();
                  }}
                  onUpload={() => pickImage(async (uri) => {
                    try {
                      const optimized = await optimizeDrawingToEntryFile(uri, "remarks");
                      setEditRemarksUri(optimized);
                      editRemarksCanvasRef.current?.loadImage(optimized);
                    } catch {
                      setEditRemarksUri(uri);
                      editRemarksCanvasRef.current?.loadImage(uri);
                    }
                  })}
                />
                <View style={{ flex: 1 }}>
                  <RemarksCanvas
                    ref={editRemarksCanvasRef}
                    mode={editRemarksMode}
                    onDrawingStateChange={setIsDrawing}
                    containerStyle={{ flex: 1, maxHeight: 'none', height: '100%', borderWidth: 0 }}
                    initialImageBase64={editRemarksUri}
                  />
                </View>
              </View>
              <View style={styles.fullPageFooter}>
                <TouchableOpacity
                  style={[styles.fullSubmitBtn, isSubmitting && styles.submitBtnDisabled]}
                  disabled={isSubmitting}
                  onPress={async () => {
                    if (editRemarksCanvasRef.current?.getImage) {
                      setIsSubmitting(true);
                      try {
                        const b64 = await editRemarksCanvasRef.current.getImage();
                        if (b64) {
                          const uri = await optimizeDrawingToEntryFile(b64, "remarks");
                          setEditRemarksUri(uri);
                        }
                      } finally {
                        setIsSubmitting(false);
                      }
                    }
                    setIsEditRemarksModalVisible(false);
                    setEditRemarksMode("pen");
                  }}
                >
                  {isSubmitting ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <Text style={styles.donePreviewBtnText}>Done</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </Modal>

        </View>
      )}

      {isViewingAllRecords && (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: "white" }]}>
          <SafeAreaView style={{ flex: 1 }}>
            <View style={styles.logHeader}>
              <View style={styles.logBrand}>
                <Image source={require("../../assets/mainlogo.png")} style={styles.logLogo} resizeMode="contain" />
                <View>
                  <Text style={styles.logTitle}>ASHWINI BSF OFFICERS' INSTITUTE</Text>
                  <Text style={styles.logSubtitle}>Visitor Record Log</Text>
                </View>
              </View>
              <TouchableOpacity style={styles.logHomeBtn} onPress={handleExitToHome}>
                <Text style={styles.logHomeBtnText}>Home</Text>
              </TouchableOpacity>
            </View>

            <FlatList
              data={allEntries}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.logList}
              ListHeaderComponent={
                <View style={styles.logTableHeader}>
                  <View style={styles.logColPhoto}>
                    <Text style={styles.logTh}>तस्वीर / Photo</Text>
                  </View>
                  <View style={styles.logColName}>
                    <Text style={styles.logTh}>नाम / Name</Text>
                  </View>
                  <View style={styles.logColRemarks}>
                    <Text style={styles.logTh}>विचार / Thoughts</Text>
                  </View>
                  <View style={styles.logColDate}>
                    <Text style={styles.logTh}>दिनांक और समय / Date & Time</Text>
                  </View>
                </View>
              }
              renderItem={({ item }) => (
                <View style={styles.logTableRow}>
                  <View style={styles.logColPhoto}>
                    <Image source={{ uri: item.photoUri }} style={styles.logPhotoThumb} resizeMode="cover" />
                  </View>

                  <View style={styles.logColName}>
                    <View style={styles.logNameCellContent}>
                      {!!item.dignitaryName && (
                        <Text style={styles.logDignitaryNameText} numberOfLines={2}>
                          {item.dignitaryName}
                        </Text>
                      )}
                    </View>
                  </View>

                  <View style={styles.logColRemarks}>
                    <Image source={{ uri: item.remarksUri }} style={styles.logRemarksThumb} resizeMode="contain" />
                  </View>

                  <View style={styles.logColDate}>
                    <Text style={styles.logDateText}>{formatDateTime(item.dateTimeISO)}</Text>
                  </View>
                </View>
              )}
              ListEmptyComponent={
                <View style={styles.logEmpty}>
                  <Text style={styles.logEmptyText}>No records found.</Text>
                </View>
              }
            />
          </SafeAreaView>
        </View>
      )}
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
        <Text style={styles.toolBtnText}>Pen</Text>
      </Pressable>
      <Pressable
        onPress={onEraser}
        style={[styles.toolBtn, mode === "eraser" && styles.toolBtnActive, styles.toolBtnEraser]}
      >
        <Text style={styles.toolBtnText}>Eraser</Text>
      </Pressable>
      <Pressable onPress={onClear} style={[styles.toolBtn, styles.toolBtnClear]}>
        <Text style={styles.toolBtnTextClear}>Clear</Text>
      </Pressable>
      {onUpload && (
        <Pressable onPress={onUpload} style={[styles.toolBtn, styles.toolBtnUpload]}>
          <Text style={styles.toolBtnTextUpload}>Upload</Text>
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

  mainContent: { flex: 1, backgroundColor: "white" },
  mainContentScroll: { padding: 14, flexGrow: 1 },
  columns: { flexDirection: "row", gap: 20, alignItems: "flex-start" },
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
  actionBtnBase: { borderRadius: 12, paddingVertical: 14, paddingHorizontal: 16, alignItems: "center" },
  actionBtnText: { color: "white", fontWeight: "900", fontSize: 18 },
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
    width: "100%",
    height: 350,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F9FAFB",
  },
  drawingPreviewBox: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 16,
    padding: 0,
    width: "100%",
    backgroundColor: "#F9FAFB",
    overflow: "hidden",
    alignItems: "center",
  },
  remarksPreviewBox: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 16,
    padding: 0,
    width: "100%",
    minHeight: 180,
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
  toolBtnTextUpload: { fontWeight: "900", fontSize: 18, color: "#FFFFFF" },

  fullPageContainer: { flex: 1, backgroundColor: "white" },
  fullPageHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    backgroundColor: "white",
  },
  fullPageBackBtn: {
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  fullPageBackBtnText: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#4B5563",
  },
  fullPageTitle: { fontSize: 18, fontWeight: "900", color: "#111827" },
  fullPageCanvasWrap: { flex: 1, padding: 16 },
  doneBtn: { backgroundColor: "#2563EB", paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12 },
  doneBtnText: { color: "white", fontWeight: "900" },
  addButton: {
    backgroundColor: "#9c9ea1ff",
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
    backgroundColor: "#D1D5DB",
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
  fullPageFooter: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    backgroundColor: "white",
  },
  fullSubmitBtn: {
    backgroundColor: "#16A34A",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  fullSubmitBtnText: {
    color: "white",
    fontWeight: "900",
    fontSize: 16,
  },
  previewScroll: {
    flex: 1,
    backgroundColor: "white",
  },
  previewContent: {
    padding: 20,
    backgroundColor: "white",
  },
  previewCard: {
    backgroundColor: "white",
    borderRadius: 20,
    padding: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  previewTopTitle: {
    fontSize: 22,
    fontWeight: "900",
    color: "#111827",
    marginBottom: 24,
    textAlign: "center"
  },
  previewSection: {
    marginBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
    paddingBottom: 16,
  },
  previewLabel: {
    fontSize: 14,
    fontWeight: "900",
    color: "#6B7280",
    marginBottom: 6,
    textTransform: "uppercase",
  },
  previewValue: {
    fontSize: 18,
    fontWeight: "800",
    color: "#111827",
  },
  previewImageContainer: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    overflow: "hidden",
    marginTop: 8,
    backgroundColor: "#F9FAFB",
  },
  previewActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 10,
  },
  previewBtn: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  editPreviewBtn: {
    backgroundColor: "#F3F4F6",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  editPreviewBtnText: {
    color: "#111827",
    fontWeight: "900",
    fontSize: 15,
  },
  donePreviewBtn: {
    backgroundColor: "#2563EB",
  },
  donePreviewBtnText: {
    color: "white",
    fontWeight: "900",
    fontSize: 15,
  },
  logHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    backgroundColor: "white",
  },
  logBrand: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  logLogo: {
    width: 40,
    height: 40,
  },
  logTitle: {
    fontSize: 14,
    fontWeight: "900",
    color: "#111827",
  },
  logSubtitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#6B7280",
  },
  logHomeBtn: {
    backgroundColor: "#1F2937",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  logHomeBtnText: {
    color: "white",
    fontWeight: "900",
    fontSize: 14,
  },
  logList: {
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  logTableHeader: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F3F4F6",
    height: 50,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    marginBottom: 6,
  },
  logTh: {
    fontWeight: "900",
    color: "#374151",
    fontSize: 14,
    textAlign: "center",
  },
  logColPhoto: { flex: 0.8, alignItems: "center", justifyContent: "center" },
  logColName: { flex: 2.2, alignItems: "center", justifyContent: "center" },
  logColRemarks: { flex: 3.0, alignItems: "center", justifyContent: "center" },
  logColDate: { flex: 1.6, alignItems: "center", justifyContent: "center" },

  logTableRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "white",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingVertical: 12,
    marginBottom: 10,
  },
  logPhotoThumb: { width: 80, height: 80, borderRadius: 14, borderWidth: 1, borderColor: "#E5E7EB" },
  logNameCellContent: { flexDirection: "row", alignItems: "center", gap: 10, justifyContent: "center", flex: 1, paddingHorizontal: 10 },
  logDignitaryNameText: { fontSize: 13, color: "#111827", fontWeight: "700", flex: 1, textAlign: "center" },
  logNameThumb: { width: 220, height: 110, borderRadius: 12, borderWidth: 1, borderColor: "#E5E7EB", backgroundColor: "#F9FAFB" },
  logRemarksThumb: { width: 350, height: 110, borderRadius: 12, borderWidth: 1, borderColor: "#E5E7EB", backgroundColor: "#F9FAFB" },
  logDateText: { fontWeight: "900", color: "#374151", fontSize: 13, textAlign: "center" },
  logEmpty: {
    alignItems: "center",
    marginTop: 40,
  },
  logEmptyText: {
    color: "#9CA3AF",
    fontWeight: "900",
  },
  previewNoPhoto: {
    color: "#9CA3AF",
    fontWeight: "900",
    fontSize: 13,
    marginTop: 6,
  },
  previewEditFieldBtn: {
    backgroundColor: "#F3F4F6",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: "center" as const,
    marginTop: 8,
  },
  previewEditFieldBtnText: {
    color: "#111827",
    fontWeight: "900" as const,
    fontSize: 17,
  },
  previewPhotoSmall: {
    width: "100%",
    height: 200,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#F9FAFB",
    overflow: "hidden",
    marginTop: 6,
  },
  previewPhotoEditBtns: {
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
  },
  editCurrentRefBox: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    backgroundColor: "#F9FAFB",
    padding: 6,
    marginBottom: 6,
    marginTop: 6,
  },
  editCurrentRefLabel: {
    fontSize: 10,
    fontWeight: "700" as const,
    color: "#6B7280",
    textTransform: "uppercase" as const,
    marginBottom: 4,
  },
  editCurrentRefImage: {
    width: "100%" as any,
    height: 60,
    borderRadius: 6,
    backgroundColor: "white",
  },
  editRedrawHint: {
    fontSize: 11,
    fontWeight: "700" as const,
    color: "#6B7280",
    marginBottom: 4,
    fontStyle: "italic" as const,
  },
});

