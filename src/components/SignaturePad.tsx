import React, { useRef, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import SignatureCanvas from "react-native-signature-canvas";

type Props = {
  signatureDataUrl: string | null;
  onSignatureChange: (dataUrl: string | null) => void;
};

function ensureDataUrl(maybeBase64OrDataUrl: string): string {
  if (maybeBase64OrDataUrl.startsWith("data:")) return maybeBase64OrDataUrl;
  return `data:image/png;base64,${maybeBase64OrDataUrl}`;
}

function extractBase64(dataUrl: string): string {
  // SignatureCanvas `dataURL` prop expects base64 (no data: prefix).
  const trimmed = dataUrl.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("data:")) {
    const parts = trimmed.split(",");
    return parts[parts.length - 1] ?? "";
  }
  return trimmed;
}

export default function SignaturePad({ signatureDataUrl, onSignatureChange }: Props) {
  const sigRef = useRef<SignatureCanvas | null>(null);
  const [mode, setMode] = useState<"pen" | "eraser">("pen");
  function setPenMode() {
    setMode("pen");
    // Library exposes draw() method; use any to avoid type coupling.
    (sigRef.current as any)?.draw?.();
  }

  function setEraserMode() {
    setMode("eraser");
    (sigRef.current as any)?.erase?.();
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.canvasWrap}>
        <View style={styles.modeRow}>
          <TouchableOpacity
            onPress={setPenMode}
            style={[styles.modeButton, mode === "pen" && styles.modeButtonActive]}
          >
            <Text style={[styles.modeButtonText, mode === "pen" && styles.modeButtonTextActive]}>Pen</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={setEraserMode}
            style={[styles.modeButton, mode === "eraser" && styles.modeButtonActive]}
          >
            <Text
              style={[styles.modeButtonText, mode === "eraser" && styles.modeButtonTextActive]}
            >
              Eraser
            </Text>
          </TouchableOpacity>
        </View>
        <SignatureCanvas
          ref={(r) => {
            sigRef.current = r;
          }}
          onOK={(sig) => {
            const dataUrl = ensureDataUrl(sig);
            onSignatureChange(dataUrl);
          }}
          onEmpty={() => {
            onSignatureChange(null);
          }}
          onClear={() => {
            onSignatureChange(null);
          }}
          onError={() => {
            onSignatureChange(null);
          }}
          autoClear={false}
          descriptionText=""
          clearText="Clear"
          confirmText="Confirm"
          penColor="#111827"
          backgroundColor="rgba(255,255,255,0)"
          webviewProps={{
            cacheEnabled: true,
            androidLayerType: "hardware",
            androidHardwareAccelerationDisabled: false,
            // Keep it stable inside Expo Go.
            mixedContentMode: "never",
          }}
          style={styles.signatureCanvas}
          dataURL={signatureDataUrl ? extractBase64(signatureDataUrl) : ""}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  canvasWrap: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: "white",
  },
  modeRow: {
    flexDirection: "row",
    gap: 10,
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    backgroundColor: "#F9FAFB",
  },
  modeButton: {
    flex: 1,
    backgroundColor: "#F3F4F6",
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  modeButtonActive: {
    backgroundColor: "#EEF2FF",
    borderColor: "#C7D2FE",
  },
  modeButtonText: { color: "#374151", fontWeight: "900" },
  modeButtonTextActive: { color: "#4F46E5" },
  signatureCanvas: { width: "100%", height: 180 },
});

