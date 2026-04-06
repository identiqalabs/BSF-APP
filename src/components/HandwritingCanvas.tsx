import React, { useMemo, useRef, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import SignatureCanvas from "react-native-signature-canvas";

function ensureDataUrl(maybeBase64: string): string {
  if (maybeBase64.startsWith("data:")) return maybeBase64;
  return `data:image/png;base64,${maybeBase64}`;
}

function extractBase64(dataUrl: string): string {
  const trimmed = dataUrl.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("data:")) {
    const parts = trimmed.split(",");
    return parts[parts.length - 1] ?? "";
  }
  return trimmed;
}

type Props = {
  valueDataUrl: string | null;
  onChange: (next: string | null) => void;
  placeholderText?: string;
  height?: number;
};

export default function HandwritingCanvas({
  valueDataUrl,
  onChange,
  placeholderText = "Draw here",
  height = 140,
}: Props) {
  const sigRef = useRef<SignatureCanvas | null>(null);
  const [mode, setMode] = useState<"pen" | "eraser">("pen");

  const webStyle = useMemo(() => {
    // Hide the built-in footer (Confirm/Clear). We provide our own Pen/Eraser/Clear buttons.
    return `
      .m-signature-pad--footer { display: none !important; margin: 0 !important; }
      .m-signature-pad--footer button { display: none !important; }
      .m-signature-pad--description { display: none !important; }
    `;
  }, []);

  function setPen() {
    setMode("pen");
    (sigRef.current as any)?.draw?.();
  }

  function setEraser() {
    setMode("eraser");
    (sigRef.current as any)?.erase?.();
  }

  function clear() {
    (sigRef.current as any)?.clearSignature?.();
    onChange(null);
  }

  function requestLatestSignature() {
    // Triggers SignatureCanvas to call onOK/onEmpty.
    (sigRef.current as any)?.readSignature?.();
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.modeRow}>
        <TouchableOpacity
          onPress={setPen}
          style={[styles.modeBtn, mode === "pen" && styles.modeBtnActive]}
        >
          <Text style={[styles.modeBtnText, mode === "pen" && styles.modeBtnTextActive]}>Pen</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={setEraser}
          style={[styles.modeBtn, mode === "eraser" && styles.modeBtnActive]}
        >
          <Text style={[styles.modeBtnText, mode === "eraser" && styles.modeBtnTextActive]}>Eraser</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={clear} style={[styles.modeBtn, styles.modeBtnDanger]}>
          <Text style={[styles.modeBtnText, styles.modeBtnTextDanger]}>Clear</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.canvasBox, { height }]}>
        {valueDataUrl ? null : (
          <View style={styles.placeholderOverlay} pointerEvents="none">
            <Text style={styles.placeholderText}>{placeholderText}</Text>
          </View>
        )}
        <SignatureCanvas
          ref={(r) => {
            sigRef.current = r;
          }}
          onEnd={() => {
            // Read after the user finishes a stroke.
            requestLatestSignature();
          }}
          onOK={(sig) => {
            onChange(ensureDataUrl(sig));
          }}
          onEmpty={() => {
            onChange(null);
          }}
          onClear={() => {
            onChange(null);
          }}
          onError={() => {
            onChange(null);
          }}
          autoClear={false}
          descriptionText=""
          clearText=""
          confirmText=""
          penColor="#111827"
          backgroundColor="rgba(255,255,255,0)"
          webStyle={webStyle}
          webviewProps={{
            cacheEnabled: true,
            androidLayerType: "hardware",
            androidHardwareAccelerationDisabled: false,
            mixedContentMode: "never",
          }}
          style={styles.signatureCanvas}
          dataURL={valueDataUrl ? extractBase64(valueDataUrl) : ""}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  modeRow: {
    flexDirection: "row",
    gap: 10,
  },
  modeBtn: {
    flex: 1,
    backgroundColor: "#F3F4F6",
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  modeBtnActive: {
    backgroundColor: "#EEF2FF",
    borderColor: "#C7D2FE",
  },
  modeBtnText: { color: "#374151", fontWeight: "900", fontSize: 12 },
  modeBtnTextActive: { color: "#4F46E5" },
  modeBtnDanger: {
    backgroundColor: "#FEE2E2",
    borderColor: "#FCA5A5",
  },
  modeBtnTextDanger: { color: "#B91C1C" },
  canvasBox: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: "white",
  },
  signatureCanvas: {
    width: "100%",
    height: "100%",
  },
  placeholderOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(249,250,251,0.55)",
  },
  placeholderText: { color: "#94A3B8", fontWeight: "800" },
});

