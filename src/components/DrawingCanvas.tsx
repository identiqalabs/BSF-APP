import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";

type Mode = "pen" | "eraser";

export type DrawingCanvasHandle = {
  /**
   * Exports the current drawing as a base64 PNG string (no `data:image/...` prefix).
   * Also calls `onSave` with the same value.
   */
  save: () => Promise<string | null>;
  clear: () => void;
  setScrollOffset: (offset: number) => void;
};

type Props = {
  mode: Mode;
  clearTrigger: number; // bump to force-clear from parent
  onSave: (base64Png: string | null) => void;
  onBegin?: () => void;
  onEnd?: () => void;
  onDrawingStateChange?: (isDrawing: boolean) => void;
  height?: number;
  internalHeight?: number;
  scrollOffset?: number;
};

const PEN_COLOR = "#111827";
const PEN_WIDTH = 3; // web uses same width

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

const WebDrawingCanvas = forwardRef<
  DrawingCanvasHandle,
  {
    mode: Mode;
    clearTrigger: number;
    onSave: (base64Png: string | null) => void;
    onBegin?: () => void;
    onEnd?: () => void;
    onDrawingStateChange?: (isDrawing: boolean) => void;
    height: number;
    internalHeight?: number;
    scrollOffset?: number;
  }
>(function WebDrawingCanvas({ mode, clearTrigger, onSave, onBegin, onEnd, onDrawingStateChange, height, internalHeight, scrollOffset = 0 }, ref) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const drawingRef = useRef(false);
  const lastRef = useRef<{ x: number; y: number } | null>(null);
  const internalOffsetRef = useRef(scrollOffset);

  useEffect(() => {
    internalOffsetRef.current = scrollOffset;
  }, [scrollOffset]);

  const compositeOp = useMemo(() => {
    return mode === "eraser" ? "destination-out" : "source-over";
  }, [mode]);

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
    const w = Math.floor(rect.width * nextDpr);
    const h = Math.floor(rect.height * nextDpr);
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    const ctx = ensureCtx();
    if (!ctx) return;
    ctx.setTransform(nextDpr, 0, 0, nextDpr, 0, 0);

    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, rect.width, rect.height);
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    resizeToFit();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => resizeToFit());
    ro.observe(canvas);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const ctx = ensureCtx();
    if (!ctx) return;
    ctx.globalCompositeOperation = compositeOp as any;
    ctx.lineWidth = PEN_WIDTH;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = mode === "eraser" ? "rgba(0,0,0,1)" : PEN_COLOR;
  }, [mode, compositeOp]);

  function doClear() {
    const canvas = canvasRef.current;
    const ctx = ensureCtx();
    if (!canvas || !ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, rect.width, rect.height);
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, rect.width, rect.height);
    lastRef.current = null;
    drawingRef.current = false;
  }

  useEffect(() => {
    doClear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearTrigger]);

  function begin(clientX: number, clientY: number) {
    const canvas = canvasRef.current;
    const ctx = ensureCtx();
    if (!canvas || !ctx) return;
    const rect = canvas.getBoundingClientRect();
    const { x, y } = getRelativePos(clientX, clientY, rect);
    drawingRef.current = true;
    lastRef.current = { x, y };
    ctx.beginPath();
    ctx.moveTo(x, y);
    onBegin?.();
    onDrawingStateChange?.(true);
  }

  function move(clientX: number, clientY: number) {
    if (!drawingRef.current) return;
    const canvas = canvasRef.current;
    const ctx = ensureCtx();
    if (!canvas || !ctx) return;
    const rect = canvas.getBoundingClientRect();
    const { x, y } = getRelativePos(clientX, clientY, rect);
    const last = lastRef.current;
    if (!last) {
      lastRef.current = { x, y };
      ctx.beginPath();
      ctx.moveTo(x, y);
      return;
    }

    ctx.globalCompositeOperation = compositeOp as any;
    ctx.lineWidth = PEN_WIDTH;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = mode === "eraser" ? "rgba(0,0,0,1)" : PEN_COLOR;

    // Do NOT call beginPath() inside move, continue the existing path stroke natively
    ctx.lineTo(x, y);
    ctx.stroke();
    lastRef.current = { x, y };
  }

  function end() {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    lastRef.current = null;
    onEnd?.();
    onDrawingStateChange?.(false);
  }

  async function saveImpl(): Promise<string | null> {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const dataUrl = canvas.toDataURL("image/png");
    const base64 = stripDataPrefix(dataUrl);
    onSave(base64);
    return base64;
  }

  useImperativeHandle(ref, () => ({
    save: saveImpl,
    clear: () => doClear(),
    setScrollOffset: (offset: number) => {
      internalOffsetRef.current = offset;
    },
  }));

  return (
    <View style={[styles.webWrap, { height, overflow: internalHeight ? "scroll" : "hidden" } as any]}>
      <canvas
        ref={canvasRef}
        style={[styles.webCanvas, internalHeight ? { height: internalHeight } : null] as any}
        onMouseDown={(e) => begin(e.clientX, e.clientY)}
        onMouseMove={(e) => move(e.clientX, e.clientY)}
        onMouseUp={() => end()}
        onMouseLeave={() => end()}
        onTouchStart={(e) => {
          if (e.nativeEvent.touches.length > 1) return;
          const t = e.nativeEvent.touches[0];
          if (!t) return;
          begin(t.clientX, t.clientY);
        }}
        onTouchMove={(e) => {
          if (e.nativeEvent.touches.length > 1) return;
          const t = e.nativeEvent.touches[0];
          if (!t) return;
          move(t.clientX, t.clientY);
        }}
        onTouchEnd={() => end()}
      />
    </View>
  );
});

const NativeDrawingCanvas = forwardRef<
  DrawingCanvasHandle,
  {
    mode: Mode;
    clearTrigger: number;
    onSave: (base64Png: string | null) => void;
    onBegin?: () => void;
    onEnd?: () => void;
    onDrawingStateChange?: (isDrawing: boolean) => void;
    height: number;
    internalHeight?: number;
    scrollOffset?: number;
  }
>(function NativeDrawingCanvas({ mode, clearTrigger, onSave, onBegin, onEnd, onDrawingStateChange, height, internalHeight, scrollOffset = 0 }, ref) {
  const SignatureCanvas = (Platform.OS !== "web"
    ? // eslint-disable-next-line @typescript-eslint/no-var-requires
      require("react-native-signature-canvas").default
    : null) as typeof import("react-native-signature-canvas").default | null;

  const sigRef = useRef<any>(null);
  // Use ref (not state) so onOK/onEmpty can resolve immediately.
  const pendingResolveRef = useRef<((value: string | null) => void) | null>(null);

  function setModeOnCanvas(nextMode: Mode) {
    if (!sigRef.current) return;
    if (nextMode === "pen") sigRef.current.draw?.();
    else sigRef.current.erase?.();
  }

  useEffect(() => {
    setModeOnCanvas(mode);
  }, [mode]);

  useEffect(() => {
    sigRef.current?.clearSignature?.();
  }, [clearTrigger]);

  useEffect(() => {
    if (sigRef.current && typeof sigRef.current.injectJavaScript === 'function') {
      sigRef.current.injectJavaScript(`window.scrollOffset = ${scrollOffset};`);
    }
  }, [scrollOffset]);

  const webStyle = useMemo(() => {
    if (internalHeight) {
      return `
        body, html { 
          margin: 0 !important;
          padding: 0 !important;
          overflow: hidden !important; 
          height: 100% !important;
        }
        .m-signature-pad { 
          box-shadow: none !important; 
          border: none !important; 
          height: 100% !important;
          width: 100% !important;
        }
        .m-signature-pad--body {
          height: 100% !important;
          width: 100% !important;
        }
        #scroll-container {
          width: 100%;
          height: 100%;
          overflow-y: scroll;
          -webkit-overflow-scrolling: touch;
          touch-action: pan-y;
        }
        #scroll-container::-webkit-scrollbar { width: 16px; }
        #scroll-container::-webkit-scrollbar-track { background: #555; border-radius: 4px; }
        #scroll-container::-webkit-scrollbar-thumb { background: #aaa; border-radius: 4px; min-height: 40px; }
        canvas {
          display: block !important;
          touch-action: none !important;
        }
        .m-signature-pad--footer { display: none !important; margin: 0 !important; }
        .m-signature-pad--description { display: none !important; }
      `;
    }

    return `
      body, html { 
        touch-action: none !important; 
        -webkit-overflow-scrolling: touch !important; 
        overflow: hidden !important; 
        height: 100% !important;
        margin: 0 !important;
        padding: 0 !important;
      }
      .m-signature-pad { 
        box-shadow: none !important; 
        border: none !important; 
        height: 100% !important;
        width: 100% !important;
      }
      .m-signature-pad--body {
        height: 100% !important;
        width: 100% !important;
      }
      .m-signature-pad--footer { display: none !important; margin: 0 !important; }
      .m-signature-pad--description { display: none !important; }
    `;
  }, [internalHeight]);

  async function saveImpl(): Promise<string | null> {
    return new Promise<string | null>((resolve) => {
      pendingResolveRef.current = resolve;
      try {
        sigRef.current?.readSignature?.();
      } catch {
        pendingResolveRef.current = null;
        resolve(null);
      }
    }).then((base64: string | null) => {
      onSave(base64);
      return base64;
    });
  }

  useImperativeHandle(ref, () => ({
    save: saveImpl,
    clear: () => {
      sigRef.current?.clearSignature?.();
      onSave(null);
    },
    setScrollOffset: (offset: number) => {
      // No-op for internal scroll approach
    },
  }));

  const SigCanvasComp = SignatureCanvas as any;

  return (
    <View style={[styles.nativeWrap, { height }]}>
      <SigCanvasComp
        ref={sigRef}
        onOK={(dataUrl: string) => {
          const base64 =
            typeof dataUrl === "string"
              ? dataUrl.startsWith("data:")
                ? stripDataPrefix(dataUrl)
                : dataUrl
              : null;
          pendingResolveRef.current?.(base64);
          pendingResolveRef.current = null;
        }}
        onEmpty={() => {
          pendingResolveRef.current?.(null);
          pendingResolveRef.current = null;
        }}
        onError={() => {
          pendingResolveRef.current?.(null);
          pendingResolveRef.current = null;
        }}
        onBegin={() => {
          onBegin?.();
          onDrawingStateChange?.(true);
        }}
        onEnd={() => {
          onEnd?.();
          onDrawingStateChange?.(false);
        }}
        autoClear={false}
        penColor={PEN_COLOR}
        backgroundColor="rgba(255,255,255,1)"
        clearText=""
        confirmText=""
        descriptionText=""
        webStyle={webStyle}
        dataURL=""
        webviewProps={{
          cacheEnabled: true,
          androidLayerType: "hardware",
          androidHardwareAccelerationDisabled: false,
          mixedContentMode: "never",
          scrollEnabled: false,
          nestedScrollEnabled: true,
          injectedJavaScript: `
            const _canvas = document.querySelector('canvas');
            if (_canvas) {
              ${internalHeight ? `
              _canvas.style.height = "${internalHeight}px";
              _canvas.height = ${internalHeight} * (window.devicePixelRatio || 1);
              
              if (!document.getElementById('scroll-container')) {
                const wrapper = document.createElement('div');
                wrapper.id = 'scroll-container';
                _canvas.parentNode.insertBefore(wrapper, _canvas);
                wrapper.appendChild(_canvas);

                _canvas.addEventListener('touchstart', (e) => {
                  const touch = e.touches[0];
                  const rect = _canvas.getBoundingClientRect();
                  const isOnScrollbar = touch.clientX > rect.right - 20;
                  if (isOnScrollbar) return; // let scrollbar handle it
                  e.preventDefault();
                }, { passive: false });

                _canvas.addEventListener('touchmove', (e) => {
                  if (e.touches.length > 1) return;
                  const touch = e.touches[0];
                  const rect = _canvas.getBoundingClientRect();
                  const isOnScrollbar = touch.clientX > rect.right - 20;
                  if (isOnScrollbar) return; // let scrollbar handle it
                  e.preventDefault();
                }, { passive: false });
              }
              ` : `
              _canvas.addEventListener('touchstart', (e) => {
                e.preventDefault();
              }, { passive: false });

              _canvas.addEventListener('touchmove', (e) => {
                e.preventDefault();
              }, { passive: false });
              `}
            }
            true;
          `
        }}
        style={styles.nativeCanvas}
      />
    </View>
  );
});

const DrawingCanvas = forwardRef<DrawingCanvasHandle, Props>(function DrawingCanvas(
  { mode, clearTrigger, onSave, onBegin, onEnd, onDrawingStateChange, height = 140, internalHeight, scrollOffset = 0 },
  ref
) {
  if (Platform.OS === "web") {
    return (
      <WebDrawingCanvas
        ref={ref}
        mode={mode}
        clearTrigger={clearTrigger}
        onSave={onSave}
        onBegin={onBegin}
        onEnd={onEnd}
        onDrawingStateChange={onDrawingStateChange}
        height={height}
        internalHeight={internalHeight}
        scrollOffset={scrollOffset}
      />
    );
  }

  return (
    <NativeDrawingCanvas
      mode={mode}
      clearTrigger={clearTrigger}
      onSave={onSave}
      onBegin={onBegin}
      onEnd={onEnd}
      onDrawingStateChange={onDrawingStateChange}
      height={height}
      internalHeight={internalHeight}
      scrollOffset={scrollOffset}
      ref={ref}
    />
  );
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
  nativeCanvas: { width: "100%", height: "100%" },
});

