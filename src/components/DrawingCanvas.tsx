import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";

type Mode = "pen" | "eraser";

export type DrawingCanvasHandle = {
  /**
   * Exports the current drawing as a base64 PNG string (no `data:image/...` prefix).
   * Also calls `onSave` with the same value.
   */
  save: () => Promise<string | null>;
  clear: () => void;
  setScrollOffset: (offset: number) => void;
  setEraser: (enabled: boolean) => void;
};

type Props = {
  mode: Mode;
  clearTrigger: number; // bump to force-clear from parent
  onSave: (base64Png: string | null) => void;
  onBegin?: () => void;
  onEnd?: () => void;
  onDrawingStateChange?: (isDrawing: boolean) => void;
  height?: number | string;
  internalHeight?: number;
  scrollOffset?: number;
  containerStyle?: any;
};

const PEN_COLOR = "#111827";
const PEN_WIDTH = 3;

function stripDataPrefix(dataUrl: string): string {
  const idx = dataUrl.indexOf(",");
  if (idx >= 0) return dataUrl.slice(idx + 1);
  return dataUrl;
}

function getRelativePos(
  clientX: number,
  clientY: number,
  rect: DOMRect
): { x: number; y: number } {
  return { x: clientX - rect.left, y: clientY - rect.top };
}

// HTML logic for the DrawingCanvas (Name/Designation) - similar to RemarksCanvas but no scroll
const INTERNAL_CANVAS_HTML = `
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 100%; height: 100%; overflow: hidden; background: #ffffff; }
  #wrapper {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
  }
  canvas {
    display: block;
    width: 100%;
    height: 100%;
    touch-action: none;
    cursor: crosshair;
  }
  #eraser-cursor {
    position: absolute;
    width: 30px;
    height: 30px;
    border: 1px solid #000;
    background: rgba(255, 255, 255, 0.5);
    pointer-events: none;
    display: none;
    z-index: 1000;
    box-sizing: border-box;
  }
</style>
</head>
<body>
<div id="wrapper">
  <div id="eraser-cursor"></div>
  <canvas id="canvas"></canvas>
</div>
<script>
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');
  const eraserCursor = document.getElementById('eraser-cursor');
  let isErasingMode = false;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    // Keep internal drawing state if possible, but for simplicity we just resize
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    
    ctx.strokeStyle = '${PEN_COLOR}';
    ctx.lineWidth = ${PEN_WIDTH};
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }

  window.addEventListener('load', resize);
  window.addEventListener('resize', resize);

  let isDrawing = false;
  let lastX = 0;
  let lastY = 0;

  function getPos(e) {
    const touch = e.touches[0];
    const rect = canvas.getBoundingClientRect();
    return {
      x: touch.clientX - rect.left,
      y: touch.clientY - rect.top
    };
  }

  canvas.addEventListener('touchstart', (e) => {
    if (e.touches.length > 1) return;
    e.preventDefault();
    isDrawing = true;
    const pos = getPos(e);
    lastX = pos.x;
    lastY = pos.y;

    if (isErasingMode) {
      eraserCursor.style.display = 'block';
      eraserCursor.style.left = (e.touches[0].clientX - 15) + 'px';
      eraserCursor.style.top = (e.touches[0].clientY - 15) + 'px';
      ctx.clearRect(lastX - 15, lastY - 15, 30, 30);
    }

    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    window.ReactNativeWebView?.postMessage(JSON.stringify({ type: 'drawingStart' }));
  }, { passive: false });

  canvas.addEventListener('touchmove', (e) => {
    if (!isDrawing || e.touches.length > 1) return;
    e.preventDefault();
    const pos = getPos(e);
    
    if (isErasingMode) {
      eraserCursor.style.display = 'block';
      eraserCursor.style.left = (e.touches[0].clientX - 15) + 'px';
      eraserCursor.style.top = (e.touches[0].clientY - 15) + 'px';
      ctx.clearRect(pos.x - 15, pos.y - 15, 30, 30);
    } else {
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
    }
    
    lastX = pos.x;
    lastY = pos.y;
  }, { passive: false });

  canvas.addEventListener('touchend', () => {
    isDrawing = false;
    eraserCursor.style.display = 'none';
    ctx.beginPath();
    window.ReactNativeWebView?.postMessage(JSON.stringify({ type: 'drawingEnd' }));
  }, { passive: false });

  function trimCanvas(orig) {
    const w = orig.width, h = orig.height;
    const fullPix = ctx.getImageData(0, 0, w, h).data;
    let minX = w, maxX = 0, minY = h, maxY = 0;
    let hasPixels = false;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const index = (y * w + x) * 4;
        if (fullPix[index + 3] > 0) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
          hasPixels = true;
        }
      }
    }

    if (!hasPixels) return null;

    const tmp = document.createElement('canvas');
    const width = maxX - minX + 1;
    const height = maxY - minY + 1;
    tmp.width = width;
    tmp.height = height;
    const tCtx = tmp.getContext('2d');
    tCtx.drawImage(orig, minX, minY, width, height, 0, 0, width, height);
    return tmp.toDataURL('image/png');
  }

  window.getCanvasImage = () => {
    return trimCanvas(canvas);
  };

  window.clearCanvas = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  window.setEraserMode = (enabled) => {
    isErasingMode = enabled;
  };
</script>
</body>
</html>
`;

const WebDrawingCanvas = forwardRef<DrawingCanvasHandle, Props>(function WebDrawingCanvas(props, ref) {
  // We'll keep the Web implementation as is for compatibility if someone uses it on web,
  // but it's not the primary focus here.
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const drawingRef = useRef(false);
  const lastRef = useRef<{ x: number; y: number } | null>(null);

  const compositeOp = useMemo(() => {
    return props.mode === "eraser" ? "destination-out" : "source-over";
  }, [props.mode]);

  function ensureCtx() {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    let ctx = ctxRef.current;
    if (!ctx) {
      ctx = canvas.getContext("2d");
      ctxRef.current = ctx;
    }
    return ctx;
  }

  function resizeToFit() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const nextDpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * nextDpr;
    canvas.height = rect.height * nextDpr;
    const ctx = ensureCtx();
    if (!ctx) return;
    ctx.setTransform(nextDpr, 0, 0, nextDpr, 0, 0);
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, rect.width, rect.height);
  }

  useEffect(() => {
    resizeToFit();
  }, []);

  useEffect(() => {
    const ctx = ensureCtx();
    if (!ctx) return;
    ctx.globalCompositeOperation = compositeOp as any;
    ctx.lineWidth = props.mode === "eraser" ? 30 : PEN_WIDTH;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = props.mode === "eraser" ? "rgba(0,0,0,1)" : PEN_COLOR;
  }, [props.mode, compositeOp]);

  useImperativeHandle(ref, () => ({
    save: async () => {
      if (!canvasRef.current) return null;
      const b64 = canvasRef.current.toDataURL("image/png");
      return stripDataPrefix(b64);
    },
    clear: () => {
      const ctx = ensureCtx();
      if (ctx && canvasRef.current) {
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }
    },
    setScrollOffset: () => {},
    setEraser: () => {},
  }));

  const [cursorPos, setCursorPos] = useState<{ x: number, y: number } | null>(null);

  // Minimal web mouse handlers...
  return (
    <View style={[styles.webWrap, { height: props.height }, props.containerStyle]}>
        <canvas 
            ref={canvasRef} 
            style={styles.webCanvas}
            onMouseDown={(e) => {
                if (props.mode === 'eraser') setCursorPos({ x: e.clientX, y: e.clientY });
            }}
        />
        {props.mode === 'eraser' && cursorPos && (
            <div style={{ position: 'fixed', left: cursorPos.x - 15, top: cursorPos.y - 15, width: 30, height: 30, border: '1px solid #000', background: 'rgba(255,255,255,0.5)', pointerEvents: 'none', zIndex: 9999 }} />
        )}
    </View>
  );
});

const NativeDrawingCanvas = forwardRef<DrawingCanvasHandle, Props>(function NativeDrawingCanvas(props, ref) {
  const webViewRef = useRef<WebView>(null);
  const resolveRef = useRef<((val: string | null) => void) | null>(null);

  useEffect(() => {
    webViewRef.current?.injectJavaScript(`window.setEraserMode(${props.mode === 'eraser'}); true;`);
  }, [props.mode]);

  useEffect(() => {
    webViewRef.current?.injectJavaScript(`window.clearCanvas(); true;`);
  }, [props.clearTrigger]);

  useImperativeHandle(ref, () => ({
    save: () => {
      return new Promise((resolve) => {
        resolveRef.current = resolve;
        webViewRef.current?.injectJavaScript(`
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'imageData',
            data: window.getCanvasImage()
          }));
          true;
        `);
      });
    },
    clear: () => {
      webViewRef.current?.injectJavaScript(`window.clearCanvas(); true;`);
    },
    setScrollOffset: () => {},
    setEraser: (enabled: boolean) => {
      webViewRef.current?.injectJavaScript(`window.setEraserMode(${enabled}); true;`);
    },
  }));

  const handleMessage = (event: any) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === 'imageData') {
        const base64 = msg.data ? msg.data.replace(/^data:image\/(png|jpeg);base64,/, "") : null;
        props.onSave(base64);
        resolveRef.current?.(base64);
        resolveRef.current = null;
      } else if (msg.type === 'drawingStart') {
        props.onBegin?.();
        props.onDrawingStateChange?.(true);
      } else if (msg.type === 'drawingEnd') {
        props.onEnd?.();
        props.onDrawingStateChange?.(false);
      }
    } catch (e) {}
  };

  return (
    <View style={[styles.nativeWrap, { height: props.height }, props.containerStyle]}>
      <WebView
        ref={webViewRef}
        source={{ html: INTERNAL_CANVAS_HTML }}
        scrollEnabled={false}
        onMessage={handleMessage}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        style={{ flex: 1, backgroundColor: 'white' }}
      />
    </View>
  );
});

const DrawingCanvas = forwardRef<DrawingCanvasHandle, Props>(function DrawingCanvas(props, ref) {
  if (Platform.OS === "web") {
    return <WebDrawingCanvas {...props} ref={ref} />;
  }
  return <NativeDrawingCanvas {...props} ref={ref} />;
});

export default DrawingCanvas;

const styles = StyleSheet.create({
  webWrap: {
    width: "100%",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: "#FFFFFF",
  },
  webCanvas: {
    width: "100%",
    height: "100%",
    display: "block",
    touchAction: "none",
    backgroundColor: "#FFFFFF",
  } as any,
  nativeWrap: {
    width: "100%",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: "white",
  },
});
