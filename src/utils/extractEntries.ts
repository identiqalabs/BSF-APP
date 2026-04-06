import TextRecognition from "@react-native-ml-kit/text-recognition";
import { Alert } from "react-native";

export interface ExtractedEntry {
  date: string;
  visitorName: string;
  remarks: string;
}

interface TextLine {
  text: string;
  textLower: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ColumnBoundary {
  type: "date" | "name" | "remarks" | "sno";
  startX: number;
  endX: number;
}

// Exact priority order for coordinate helpers
const getX = (item: any) => item.frame?.left ?? item.frame?.x ?? item.boundingBox?.left ?? item.cornerPoints?.[0]?.x ?? 0;
const getY = (item: any) => item.frame?.top ?? item.frame?.y ?? item.boundingBox?.top ?? item.cornerPoints?.[0]?.y ?? 0;
const getW = (item: any) => item.frame?.width ?? (item.boundingBox ? (item.boundingBox.right - item.boundingBox.left) : (item.cornerPoints && item.cornerPoints.length >= 2 ? Math.abs(item.cornerPoints[1].x - item.cornerPoints[0].x) : 100));
const getH = (item: any) => item.frame?.height ?? (item.boundingBox ? (item.boundingBox.bottom - item.boundingBox.top) : 30);

/**
 * Recognizes text from an image and parses it into entries.
 */
export async function extractEntriesFromImage(imageUri: string): Promise<{ entries: ExtractedEntry[], debugInfo: string }> {
  let debugLog = `--- Processing: ${imageUri.split('/').pop()} ---\n`;
  try {
    const result = await TextRecognition.recognize(imageUri);
    if (!result.text || result.blocks.length === 0) {
      return { entries: [], debugInfo: debugLog + "Error: No text detected by ML Kit.\n" };
    }

    // Step 1: Collect all lines with coordinates
    const allLines: TextLine[] = [];
    result.blocks.forEach(block => {
      block.lines.forEach(line => {
        const text = line.text.trim();
        allLines.push({
          text,
          textLower: text.toLowerCase(),
          x: getX(line),
          y: getY(line),
          width: getW(line),
          height: getH(line)
        });
      });
    });

    if (allLines.length === 0) return { entries: [], debugInfo: debugLog + "Error: No lines found.\n" };

    // Step 2: Compute image dimensions
    const imageWidth = Math.max(...allLines.map(l => l.x + l.width));
    const imageHeight = Math.max(...allLines.map(l => l.y + l.height));
    const isLandscape = imageWidth > imageHeight;
    debugLog += `Dimensions: ${Math.round(imageWidth)}x${Math.round(imageHeight)} (${isLandscape ? 'Landscape' : 'Portrait'})\n`;

    // Step 3: Compute median line height and row threshold
    const heights = allLines.map(l => l.height).filter(h => h > 5 && h < 300).sort((a, b) => a - b);
    const medianH = heights[Math.floor(heights.length / 2)] || 40;
    const rowThreshold = medianH * 2.5;
    debugLog += `Median height: ${Math.round(medianH)}px, Row threshold: ${Math.round(rowThreshold)}px\n`;

    // Step 4: Detect column headers (leftmost match)
    const keywords = {
      sno: ["s.no", "sr.", "sno", "sl.no", "क्र"],
      date: ["date", "दिनांक"],
      name: ["name & address", "name and address", "name &", "visitor", "नाम"],
      remarks: ["remarks", "expression of thoughts", "टिप्पणी"]
    };

    const detectedHeaders: { type: ColumnBoundary["type"], x: number, y: number, text: string }[] = [];
    Object.entries(keywords).forEach(([type, kws]) => {
      const matches = allLines.filter(l => kws.some(kw => l.textLower.includes(kw)));
      if (matches.length > 0) {
        // Take leftmost match
        const leftmost = matches.sort((a, b) => a.x - b.x)[0];
        detectedHeaders.push({ type: type as ColumnBoundary["type"], x: leftmost.x, y: leftmost.y, text: leftmost.text });
      }
    });

    debugLog += "\nDETECTED HEADERS:\n";
    detectedHeaders.forEach(h => {
      debugLog += `- ${h.type.toUpperCase()} at x:${Math.round(h.x)} ("${h.text}")\n`;
    });

    // Step 5 & 6: Build boundaries using midpoints with fallback
    let boundaries: ColumnBoundary[] = [];
    if (detectedHeaders.length >= 2) {
      const sorted = detectedHeaders.sort((a, b) => a.x - b.x);
      boundaries = sorted.map((h, i) => {
        const prev = sorted[i - 1];
        const next = sorted[i + 1];
        return {
          type: h.type,
          startX: prev ? Math.round((prev.x + h.x) / 2) : 0,
          endX: next ? Math.round((h.x + next.x) / 2) - 1 : imageWidth
        };
      });
      debugLog += "\nDYNAMIC MIDPOINT BOUNDARIES:\n";
    } else {
      debugLog += "\nFALLBACK PERCENTAGE BOUNDARIES:\n";
      boundaries = [
        { type: 'sno', startX: 0, endX: imageWidth * 0.08 },
        { type: 'date', startX: imageWidth * 0.08, endX: imageWidth * 0.28 },
        { type: 'name', startX: imageWidth * 0.28, endX: imageWidth * 0.65 },
        { type: 'remarks', startX: imageWidth * 0.65, endX: imageWidth }
      ];
      Alert.alert("Low Confidence", "Could not detect headers clearly. Splitting by image layout.");
    }
    boundaries.forEach(b => {
      debugLog += `- ${b.type.toUpperCase()}: ${Math.round(b.startX)} to ${Math.round(b.endX)}\n`;
    });

    // Step 7: Assignment helper
    const assignCol = (x: number) => boundaries.find(b => x >= b.startX && x <= b.endX)?.type ?? null;

    // Step 8: Filter out header rows and UI noise
    const headerYValues = detectedHeaders.map(h => h.y);
    const dataLines = allLines.filter(l => {
      const isHeaderRow = headerYValues.some(hy => Math.abs(l.y - hy) < medianH * 1.5);
      const isUIText = ['no entries', 'add them manually', 'could be parsed', 'entries found', 'show debug', 'close'].some(s => l.textLower.includes(s));
      return !isHeaderRow && !isUIText;
    });

    debugLog += "\nSAMPLE DATA LINES (FIRST 20):\n";
    dataLines.slice(0, 20).forEach((l, i) => {
      debugLog += `[${i}] x:${Math.round(l.x)} col:${assignCol(l.x)} text:"${l.text}"\n`;
    });

    // Step 9: Group data lines into rows by y coordinate
    const rows: TextLine[][] = [];
    if (dataLines.length > 0) {
      dataLines.sort((a, b) => a.y - b.y);
      let currentRow: TextLine[] = [dataLines[0]];
      for (let i = 1; i < dataLines.length; i++) {
        if (dataLines[i].y - dataLines[i-1].y <= rowThreshold) {
          currentRow.push(dataLines[i]);
        } else {
          rows.push(currentRow);
          currentRow = [dataLines[i]];
        }
      }
      rows.push(currentRow);
    }

    // Step 10: Build entries from rows
    const entries: ExtractedEntry[] = [];
    const dateRegex = /\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\b/;

    debugLog += "\nROW PARSING TRACE:\n";
    rows.forEach((rowLines) => {
      let dateText = '', nameText = '', remarksText = '';
      const avgY = Math.round(rowLines.reduce((sum, l) => sum + l.y, 0) / rowLines.length);
      
      for (const line of rowLines) {
        const col = assignCol(line.x);
        if (col === 'date') dateText += ' ' + line.text;
        else if (col === 'name') nameText += ' ' + line.text;
        else if (col === 'remarks') remarksText += ' ' + line.text;
      }
      
      dateText = dateText.trim();
      nameText = nameText.trim();
      remarksText = remarksText.trim();
      
      const dateMatch = dateText.match(dateRegex);
      debugLog += `Row Y≈${avgY}: date="${dateText}" name="${nameText}" remarks="${remarksText}" → dateMatch=${!!dateMatch}\n`;

      if (dateMatch) {
        entries.push({ date: dateMatch[1], visitorName: nameText, remarks: remarksText });
      } else if (entries.length > 0 && (nameText || remarksText)) {
        const last = entries[entries.length - 1];
        if (nameText) last.visitorName = [last.visitorName, nameText].filter(Boolean).join(' ');
        if (remarksText) last.remarks = [last.remarks, remarksText].filter(Boolean).join(' ');
      }
    });

    // Step 11: Final return
    debugLog += `\nParsed ${entries.length} entries.\n`;
    return {
      entries: entries.filter(e => e.visitorName || e.remarks),
      debugInfo: debugLog
    };

  } catch (error) {
    console.error("Text recognition rewrite failed:", error);
    return { 
      entries: [], 
      debugInfo: debugLog + "CRITICAL ERROR: " + JSON.stringify(error) + "\n" 
    };
  }
}
