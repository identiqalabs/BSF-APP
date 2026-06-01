import React, { useRef, forwardRef, useImperativeHandle, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import * as FileSystem from "expo-file-system/legacy";

export interface RemarksCanvasProps {
  onDrawingStateChange?: (isDrawing: boolean) => void;
  mode?: 'pen' | 'eraser';
  containerStyle?: any;
  initialImageBase64?: string | null;
}

const CANVAS_HTML = `
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
  #scroll-area {
    position: absolute;
    top: 0;
    left: 0;
    right: 30px;
    bottom: 0;
    overflow-y: auto;
    overflow-x: hidden;
  }
  canvas {
    display: block;
    width: 100%;
    height: 2000px;
    touch-action: none;
    cursor: crosshair;
  }
  #scrollbar-track {
    position: absolute;
    top: 0;
    right: 0;
    width: 30px;
    height: 100%;
    background: #cccccc;
  }
  #scrollbar-thumb {
    position: absolute;
    right: 0;
    width: 30px;
    background: #555555;
    border-radius: 4px;
    min-height: 50px;
    cursor: pointer;
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
  <div id="scroll-area">
    <canvas id="canvas"></canvas>
  </div>
  <div id="scrollbar-track">
    <div id="scrollbar-thumb"></div>
  </div>
</div>
<script>
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');
  const scrollArea = document.getElementById('scroll-area');
  const thumb = document.getElementById('scrollbar-thumb');
  const track = document.getElementById('scrollbar-track');
  const eraserCursor = document.getElementById('eraser-cursor');
  let currentMode = 'pen';

  // Set canvas actual pixel dimensions with DPR scaling for crisp lines
  window.dpr = window.devicePixelRatio || 1;
  window.canvas = document.getElementById('canvas');
  window.ctx = window.canvas.getContext('2d');

  window.setCanvasScale = () => {
    window.ctx.setTransform(window.dpr, 0, 0, window.dpr, 0, 0);
    window.ctx.strokeStyle = '#000000';
    window.ctx.lineWidth = 3;
    window.ctx.lineCap = 'round';
    window.ctx.lineJoin = 'round';
  };

  window.canvas.width = (window.innerWidth - 30) * window.dpr;
  window.canvas.height = 2000 * window.dpr;
  window.setCanvasScale();

  let isDrawing = false;
  let lastX = 0;
  let lastY = 0;

  // Update scrollbar thumb position and size
  function updateScrollbar() {
    const trackHeight = track.offsetHeight;
    const contentHeight = scrollArea.scrollHeight;
    const viewHeight = scrollArea.offsetHeight;
    const thumbHeight = Math.max(50, (viewHeight / contentHeight) * trackHeight);
    const scrollRatio = scrollArea.scrollTop / (contentHeight - viewHeight);
    const thumbTop = scrollRatio * (trackHeight - thumbHeight);
    thumb.style.height = thumbHeight + 'px';
    thumb.style.top = thumbTop + 'px';
  }

  // Scrollbar drag
  let isDraggingThumb = false;
  let thumbDragStartY = 0;
  let thumbDragStartScrollTop = 0;

  thumb.addEventListener('touchstart', (e) => {
    isDraggingThumb = true;
    thumbDragStartY = e.touches[0].clientY;
    thumbDragStartScrollTop = scrollArea.scrollTop;
    e.stopPropagation();
    e.preventDefault();
    window.ReactNativeWebView?.postMessage(JSON.stringify({ type: 'drawingStart' }));
  }, { passive: false });

  document.addEventListener('touchmove', (e) => {
    if (!isDraggingThumb) return;
    e.stopPropagation();
    e.preventDefault();
    const deltaY = e.touches[0].clientY - thumbDragStartY;
    const trackHeight = track.offsetHeight;
    const thumbHeight = thumb.offsetHeight;
    const scrollableTrack = trackHeight - thumbHeight;
    const scrollableContent = scrollArea.scrollHeight - scrollArea.offsetHeight;
    const scrollDelta = (deltaY / scrollableTrack) * scrollableContent;
    scrollArea.scrollTop = Math.max(0, Math.min(scrollableContent, thumbDragStartScrollTop + scrollDelta));
    updateScrollbar();
  }, { passive: false });

  const stopDrag = (e) => {
    if (isDraggingThumb) {
      isDraggingThumb = false;
      e.stopPropagation();
      window.ReactNativeWebView?.postMessage(JSON.stringify({ type: 'drawingEnd' }));
    }
  };
  document.addEventListener('touchend', stopDrag, { passive: false });
  document.addEventListener('touchcancel', stopDrag, { passive: false });

  scrollArea.addEventListener('scroll', updateScrollbar);

  // Drawing touch handlers on canvas
  canvas.addEventListener('touchstart', (e) => {
    if (isDraggingThumb) return;
    if (e.touches.length > 1) return;
    e.preventDefault();
    e.stopPropagation();
    isDrawing = true;
    const touch = e.touches[0];
    const rect = canvas.getBoundingClientRect();
    lastX = touch.clientX - rect.left;
    lastY = touch.clientY - rect.top;

    if (window.isEraserMode) {
      eraserCursor.style.display = 'block';
      eraserCursor.style.left = (touch.clientX - 15) + 'px';
      eraserCursor.style.top = (touch.clientY - 15) + 'px';
    }

    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    window.ReactNativeWebView?.postMessage(JSON.stringify({ type: 'drawingStart' }));
  }, { passive: false });

  canvas.addEventListener('touchmove', (e) => {
    if (isDraggingThumb || !isDrawing || e.touches.length > 1) return;
    e.preventDefault();
    e.stopPropagation();
    const touch = e.touches[0];
    const rect = canvas.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;
    
    if (window.isEraserMode) {
      eraserCursor.style.display = 'block';
      eraserCursor.style.left = (touch.clientX - 15) + 'px';
      eraserCursor.style.top = (touch.clientY - 15) + 'px';
    } else {
      eraserCursor.style.display = 'none';
    }

    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
    lastX = x;
    lastY = y;
  }, { passive: false });

  canvas.addEventListener('touchend', (e) => {
    isDrawing = false;
    eraserCursor.style.display = 'none';
    ctx.beginPath();
    window.ReactNativeWebView?.postMessage(JSON.stringify({ type: 'drawingEnd' }));
  }, { passive: false });

  // Helper to trim white/empty space from the canvas
  function trimCanvas(orig) {
    const w = orig.width, h = orig.height;
    const pix = ctx.getImageData(0, 0, w, h).data;
    let minX = w, maxX = 0, minY = h, maxY = 0;
    let hasPixels = false;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const index = (y * w + x) * 4;
        if (pix[index + 3] > 0) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
          hasPixels = true;
        }
      }
    }

    if (!hasPixels) return orig.toDataURL('image/jpeg', 0.95);
    
    const tmp = document.createElement('canvas');
    // We trim both top and bottom to remove empty vertical space.
    // We keep the full width to maintain horizontal alignment.
    const exportWidth = w;
    const exportHeight = maxY - minY + 1;
    
    tmp.width = exportWidth;
    tmp.height = exportHeight;
    const tCtx = tmp.getContext('2d');
    tCtx.fillStyle = '#ffffff';
    tCtx.fillRect(0, 0, exportWidth, exportHeight);
    
    // Draw only the inhabited vertical range
    tCtx.drawImage(orig, 0, minY, w, exportHeight, 0, 0, w, exportHeight);
    
    return tmp.toDataURL('image/jpeg', 0.95);
  }

  window.getCanvasImage = () => {
    return trimCanvas(window.canvas);
  };

  window.clearCanvas = () => {
    window.ctx.clearRect(0, 0, window.canvas.width, window.canvas.height);
  };

  window.setDrawingMode = (mode) => {
    currentMode = mode;
    if (mode === 'eraser') {
      window.ctx.globalCompositeOperation = 'destination-out';
      window.ctx.lineWidth = 30;
      window.isEraserMode = true;
    } else {
      window.ctx.globalCompositeOperation = 'source-over';
      window.ctx.lineWidth = 3;
      window.isEraserMode = false;
      eraserCursor.style.display = 'none';
    }
  };

  // New function to load an existing image onto the canvas
  window.loadImage = (base64) => {
    const img = new Image();
    img.onload = () => {
      const logicalCanvasWidth = window.canvas.width / window.dpr;
      const logicalImgWidth = img.width / window.dpr;
      const logicalImgHeight = img.height / window.dpr;

      // Drawings are resized by the storage system.
      // To restore original size and position, we stretch the optimized image 
      // back to the full logical width of the canvas.
      const drawWidth = logicalCanvasWidth;
      const drawHeight = logicalImgHeight * (logicalCanvasWidth / logicalImgWidth);
      const drawX = 0;
      const drawY = 0;

      window.ctx.clearRect(0, 0, window.canvas.width, window.canvas.height);
      window.setCanvasScale();
      window.ctx.imageSmoothingEnabled = true;
      window.ctx.imageSmoothingQuality = 'high';
      window.ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);
      scrollArea.scrollTop = 0;
      updateScrollbar();
    };
    img.src = (base64.startsWith('file://') || base64.startsWith('data:')) ? base64 : ('data:image/png;base64,' + base64);
  };

  updateScrollbar();
  window.addEventListener('resize', () => {
    const rectView = window.canvas.getBoundingClientRect();
    window.canvas.width = rectView.width * window.dpr;
    window.setCanvasScale();
    updateScrollbar();
  });
</script>
</body>
</html>
`

const RemarksCanvas = forwardRef<any, RemarksCanvasProps>((props, ref) => {
  const webViewRef = useRef<WebView>(null);
  let imageResolve = useRef<((data: string) => void) | null>(null);
  const isWebViewReadyRef = useRef(false);
  const pendingImageRef = useRef<string | null>(null);

  const toRenderableCanvasSrc = async (imageUriOrBase64: string): Promise<string> => {
    if (!imageUriOrBase64) return "";
    if (imageUriOrBase64.startsWith("data:image")) return imageUriOrBase64;
    if (imageUriOrBase64.startsWith("file://")) {
      try {
        const b64 = await FileSystem.readAsStringAsync(imageUriOrBase64, {
          encoding: FileSystem.EncodingType.Base64,
        });
        const lower = imageUriOrBase64.toLowerCase();
        const mime = lower.endsWith(".png")
          ? "image/png"
          : lower.endsWith(".webp")
          ? "image/webp"
          : "image/jpeg";
        return `data:${mime};base64,${b64}`;
      } catch {
        return imageUriOrBase64;
      }
    }
    return imageUriOrBase64;
  };

  const injectLoadImage = async (imageUriOrBase64: string) => {
    if (!imageUriOrBase64) return;
    const resolvedSrc = await toRenderableCanvasSrc(imageUriOrBase64);
    const encoded = JSON.stringify(resolvedSrc);
    const js = `
      (function(){
        const src = ${encoded};
        const img = new Image();
        img.onload = function(){
          const logicalCanvasWidth = window.canvas.width / window.dpr;
          const logicalImgWidth = img.width / window.dpr;
          const logicalImgHeight = img.height / window.dpr;
          
          // Drawings are resized by the storage system.
          // To restore original size and position, we stretch the optimized image 
          // back to the full logical width of the canvas.
          const drawWidth = logicalCanvasWidth;
          const drawHeight = logicalImgHeight * (logicalCanvasWidth / logicalImgWidth);
          const drawX = 0;
          const drawY = 0;
          
          window.ctx.clearRect(0,0,window.canvas.width,window.canvas.height);
          window.setCanvasScale();
          window.ctx.imageSmoothingEnabled = true;
          window.ctx.imageSmoothingQuality = 'high';
          window.ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);
          scrollArea.scrollTop = 0;
          updateScrollbar();
        };
        img.src = (src.startsWith('file://') || src.startsWith('data:')) ? src : ('data:image/png;base64,' + src);
      })();
      true;
    `;
    if (!isWebViewReadyRef.current || !webViewRef.current) {
      pendingImageRef.current = imageUriOrBase64;
      return;
    }
    webViewRef.current.injectJavaScript(js);
  };

  // Expose methods to parent via ref
  useImperativeHandle(ref, () => ({
    getImage: () => {
      return new Promise((resolve) => {
        imageResolve.current = resolve;
        webViewRef.current?.injectJavaScript(`
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'imageData',
            data: window.getCanvasImage()
          }));
          true;
        `);
      });
    },
    clearCanvas: () => {
      webViewRef.current?.injectJavaScript(`window.clearCanvas(); true;`);
    },
    loadImage: (base64: string) => {
      void injectLoadImage(base64);
    }
  }));

  // Set drawing mode when prop changes
  useEffect(() => {
    if (props.mode) {
      webViewRef.current?.injectJavaScript(`window.setDrawingMode('${props.mode}'); true;`);
    }
  }, [props.mode]);

  useEffect(() => {
    if (!props.initialImageBase64) return;
    const t = setTimeout(() => {
      void injectLoadImage(props.initialImageBase64!);
    }, 250);
    return () => clearTimeout(t);
  }, [props.initialImageBase64]);

  const handleMessage = (event: any) => {
    const message = JSON.parse(event.nativeEvent.data);
    if (message.type === 'imageData' && imageResolve.current) {
      const base64 = message.data.replace(/^data:image\/(png|jpeg|jpg);base64,/, "");
      imageResolve.current(base64);
      imageResolve.current = null;
    } else if (message.type === 'drawingStart') {
      props.onDrawingStateChange?.(true);
    } else if (message.type === 'drawingEnd') {
      props.onDrawingStateChange?.(false);
    }
  };

  return (
    <View style={[styles.container, props.containerStyle]}>
      <WebView
        ref={webViewRef}
        source={{ html: CANVAS_HTML }}
        scrollEnabled={false}
        showsVerticalScrollIndicator={false}
        onLoadEnd={() => {
          isWebViewReadyRef.current = true;
          if (pendingImageRef.current) {
            const pending = pendingImageRef.current;
            pendingImageRef.current = null;
            void injectLoadImage(pending);
          } else if (props.initialImageBase64) {
            void injectLoadImage(props.initialImageBase64);
          }
        }}
        onMessage={handleMessage}
        style={styles.webview}
        javaScriptEnabled={true}
        domStorageEnabled={true}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    height: 250,
    maxHeight: 250,
    borderWidth: 1,
    borderColor: '#444',
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 16,
  },
  webview: {
    flex: 1,
    backgroundColor: '#ffffff',
  }
});

export default RemarksCanvas;
