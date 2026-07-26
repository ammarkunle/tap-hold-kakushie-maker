# 🛡️ Official Kakushie Master Engine Algorithm Backup & Guide

This document contains the verified master algorithm for the **Tap and Hold Kakushie Image Maker** (`https://tap-and-hold-kakushie-maker.vercel.app/`).

---

## 📌 Algorithm Pipeline Overview

### 1. Canvas Dimension Even-Alignment Guard
To prevent 1-pixel checkerboard row-offset misalignments across different display scaling factors and mobile browsers, `width` and `height` are strictly converted to even integers:
```javascript
function updateCanvasDimensions(w, h) {
  w = (w % 2 !== 0) ? w + 1 : w;
  h = (h % 2 !== 0) ? h + 1 : h;
  // ...
}
```

### 2. Auto Line Art (Sobel Edge Detection + 1px Dilation)
Luminance is calculated using **Rec. 709 HDTV constants** (`0.2126 * R + 0.7152 * G + 0.0722 * B`). Horizontal (`gx`) and vertical (`gy`) gradients are computed with `Math.hypot(gx, gy)` and thresholded before applying a 1-pixel dilation pass for crisp outlines.

### 3. Brightness Boost & 1-Pixel Interleaved Checkerboard Mesh (`applyCheckerMesh`)
- Hidden unpainted pixels (`maskEffective[n] === 1`) have their RGB values multiplied by the **Brightness Boost factor** (`1.0` to `2.0`, default `1.5`).
- The 1-pixel checkerboard mesh assigns **Alpha = 0 (Transparent)** when `(x + y) & 1 === 1` and **Alpha = 255 (Opaque)** otherwise.
- Line art edges are darkened by 50% (`bColor * 0.5`) with $A=255$ so subject outlines stand out crisp and dark on the white timeline.

### 4. PNG-8 UPNG Export & Offscreen Transparency Fallback
- Primary Export: `UPNG.encode([rgbaBuffer], width, height, 256)` generates indexed 256-color PNG-8 with single-entry palette transparency.
- Fallback Export: If `UPNG` is absent, an offscreen canvas is populated with `state.currentRawRgba` to guarantee 1-pixel checkerboard transparency instead of exporting the solid timeline simulation preview.

---

## 📁 Backup Locations

1. **Project Repository Backup**:
   - [`kakushie_engine_backup.js`](file:///c:/Users/ammar/.gemini/antigravity/scratch/tap-to-hold-kakushie-maker/kakushie_engine_backup.js)
   - [`ALGORITHM_BACKUP.md`](file:///c:/Users/ammar/.gemini/antigravity/scratch/tap-to-hold-kakushie-maker/ALGORITHM_BACKUP.md)

2. **Brain Scratch Backup**:
   - [`kakushie_engine_backup.js`](file:///C:/Users/ammar/.gemini/antigravity/brain/88ef1761-b52b-4efd-8153-6550badf201d/scratch/kakushie_engine_backup.js)
