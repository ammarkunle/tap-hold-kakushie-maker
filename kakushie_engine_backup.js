/**
 * OFFICIAL KAKUSHIE MASTER ENGINE BACKUP (SAFE COPY)
 * Source of Truth: https://tap-and-hold-kakushie-maker.vercel.app/
 * Reference Baseline: kakushie-maker.netlify.app & UPNG 256 Indexed Palette
 *
 * This file serves as an isolated reference and restoration backup for the core
 * Tap and Hold (Kakushie) image generation algorithm.
 */

// 1. Dimension Even Alignment Guard
function updateCanvasDimensions(w, h) {
  w = (w % 2 !== 0) ? w + 1 : w;
  h = (h % 2 !== 0) ? h + 1 : h;
  width = w;
  height = h;
  editCanvas.width = w;
  editCanvas.height = h;
  maskCanvas.width = w;
  maskCanvas.height = h;
  overlayCanvas.width = w;
  overlayCanvas.height = h;
  outputCanvas.width = w;
  outputCanvas.height = h;
  renderAll();
}

// 2. Sobel Edge Detection for Auto Line Art (Rec 709 Luminance + Sobel Gradients + 1px Dilation)
function computeLineArtMask(threshold) {
  if (threshold <= 0 || !state.imgMain) return null;
  const w = width;
  const h = height;

  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = w;
  tempCanvas.height = h;
  const tempCtx = tempCanvas.getContext('2d');
  drawCover(tempCtx, state.imgMain, w, h);

  const imgData = tempCtx.getImageData(0, 0, w, h);
  const bColor = imgData.data;

  // Rec. 709 HDTV Luminance: 0.2126*R + 0.7152*G + 0.0722*B
  function getLuminance(x, y) {
    const cx = x < 0 ? 0 : x >= w ? w - 1 : x;
    const cy = y < 0 ? 0 : y >= h ? h - 1 : y;
    const idx = 4 * (cy * w + cx);
    return 0.2126 * bColor[idx] + 0.7152 * bColor[idx + 1] + 0.0722 * bColor[idx + 2];
  }

  const sensThreshold = Math.max(15, Math.round(230 - (threshold * 2.1)));
  const rawEdges = new Uint8Array(w * h);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p00 = getLuminance(x - 1, y - 1);
      const p10 = getLuminance(x, y - 1);
      const p20 = getLuminance(x + 1, y - 1);
      const p01 = getLuminance(x - 1, y);
      const p21 = getLuminance(x + 1, y);
      const p02 = getLuminance(x - 1, y + 1);
      const p12 = getLuminance(x, y + 1);
      const p22 = getLuminance(x + 1, y + 1);

      const gx = p20 + 2 * p21 + p22 - (p00 + 2 * p01 + p02);
      const gy = p02 + 2 * p12 + p22 - (p00 + 2 * p10 + p20);
      const mag = Math.hypot(gx, gy);

      rawEdges[y * w + x] = mag >= sensThreshold ? 1 : 0;
    }
  }

  // Dilate by 1px radius for crisp, visible line art
  const dilated = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let found = 0;
      for (let dy = -1; dy <= 1 && !found; dy++) {
        const ny = y + dy;
        if (ny >= 0 && ny < h) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            if (nx >= 0 && nx < w && rawEdges[ny * w + nx] === 1) {
              found = 1;
              break;
            }
          }
        }
      }
      dilated[y * w + x] = found;
    }
  }

  return dilated;
}

// 3. Kakushie Master Output Canvas Renderer
function renderOutputCanvas() {
  ctxOut.clearRect(0, 0, width, height);

  if (!state.imgMain) return;

  // 1. Draw base image on temp canvas
  const tempCanvasB = document.createElement('canvas');
  tempCanvasB.width = width;
  tempCanvasB.height = height;
  const ctxB = tempCanvasB.getContext('2d');
  drawCover(ctxB, state.imgMain, width, height);

  const maskData = ctxMask.getImageData(0, 0, width, height);
  const dataB = ctxB.getImageData(0, 0, width, height);
  const outData = ctxOut.createImageData(width, height);

  const totalPixels = width * height;
  
  // Auto Line Art Mask calculation
  const edgeMask = (state.autoLineArt > 0) ? computeLineArtMask(state.autoLineArt) : null;

  // 2. Compute effective mask: 1 = Hidden (mesh applied), 0 = Revealed (brushed or edge)
  const maskEffective = new Uint8Array(totalPixels);
  for (let i = 0; i < totalPixels; i++) {
    const isBrushed = maskData.data[i * 4 + 3] > 0;
    const isEdge = edgeMask && edgeMask[i] === 1;
    maskEffective[i] = (isBrushed || isEdge) ? 0 : 1;
  }

  // 3. Brightness Boost (Multiplier applied to hidden checkerboard pixels)
  const boostFactor = typeof state.brightness === 'number' ? state.brightness : 1.5;
  
  const boostedData = new Uint8ClampedArray(dataB.data.length);
  for (let s = 0; s < totalPixels; s++) {
    const idx = 4 * s;
    const mult = (maskEffective[s] === 1) ? boostFactor : 1.0;
    boostedData[idx]     = Math.min(255, Math.round(dataB.data[idx] * mult));
    boostedData[idx + 1] = Math.min(255, Math.round(dataB.data[idx + 1] * mult));
    boostedData[idx + 2] = Math.min(255, Math.round(dataB.data[idx + 2] * mult));
    boostedData[idx + 3] = dataB.data[idx + 3];
  }

  // 4. Apply 1-Pixel Interleaved Checkerboard Mesh (`applyCheckerMesh`)
  const rawRgba = new Uint8ClampedArray(dataB.data.length);
  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;
    for (let x = 0; x < width; x++) {
      const n = rowOffset + x;
      const s = 4 * n;

      rawRgba[s]     = boostedData[s];
      rawRgba[s + 1] = boostedData[s + 1];
      rawRgba[s + 2] = boostedData[s + 2];

      const isCheckerPixel = ((x + y) & 1) === 1; // 1-pixel interleaving
      const isHidden = maskEffective[n] === 1;

      // If hidden AND checker pixel -> ALPHA = 0! Else -> ALPHA = 255!
      rawRgba[s + 3] = (isHidden && isCheckerPixel) ? 0 : 255;
    }
  }

  // 5. Darken Line Art edges to 50% brightness so outlines pop crisp & dark on timeline white background
  if (edgeMask) {
    for (let n = 0; n < totalPixels; n++) {
      if (edgeMask[n] !== 1) continue;
      const t = 4 * n;
      rawRgba[t]     = Math.round(dataB.data[t] * 0.5);
      rawRgba[t + 1] = Math.round(dataB.data[t + 1] * 0.5);
      rawRgba[t + 2] = Math.round(dataB.data[t + 2] * 0.5);
      rawRgba[t + 3] = 255;
    }
  }

  // Store raw RGBA buffer for export
  state.currentRawRgba = rawRgba;

  // 6. Render Preview Canvas for Timeline Simulation
  if (state.isHolding) {
    outData.data.set(rawRgba);
  } else {
    const isLightTl = state.previewBg === 'light';
    const bgR = isLightTl ? 255 : 0;
    const bgG = isLightTl ? 255 : 0;
    const bgB = isLightTl ? 255 : 0;

    for (let y = 0; y < height; y++) {
      const rowOffset = y * width;
      for (let x = 0; x < width; x++) {
        const n = rowOffset + x;
        const s = 4 * n;

        const isHidden = maskEffective[n] === 1;

        if (isHidden) {
          outData.data[s]     = bgR;
          outData.data[s + 1] = bgG;
          outData.data[s + 2] = bgB;
          outData.data[s + 3] = 255;
        } else {
          outData.data[s]     = rawRgba[s];
          outData.data[s + 1] = rawRgba[s + 1];
          outData.data[s + 2] = rawRgba[s + 2];
          outData.data[s + 3] = rawRgba[s + 3];
        }
      }
    }
  }

  ctxOut.putImageData(outData, 0, 0);
}

// 4. PNG-8 UPNG Export Handler with Offscreen Raw Canvas Fallback
function exportKakushieImage() {
  if (!state.imgMain || !state.currentRawRgba) return;

  btnExport.disabled = true;
  const originalText = btnExport.textContent;
  btnExport.textContent = 'Encoding PNG-8 (Twitter Ready)...';

  setTimeout(() => {
    try {
      const rgbaBuffer = Uint8Array.from(state.currentRawRgba).buffer;

      if (typeof UPNG !== 'undefined') {
        const pngBuffer = UPNG.encode([rgbaBuffer], width, height, 256);
        const blob = new Blob([pngBuffer], { type: 'image/png' });
        const link = document.createElement('a');
        link.download = 'tap-hold-kakushie-png8.png';
        link.href = URL.createObjectURL(blob);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } else {
        // Offscreen export canvas guarantees raw 1-pixel checkerboard transparency fallback
        const rawCanvas = document.createElement('canvas');
        rawCanvas.width = width;
        rawCanvas.height = height;
        const rawCtx = rawCanvas.getContext('2d');
        const rawImgData = rawCtx.createImageData(width, height);
        rawImgData.data.set(state.currentRawRgba);
        rawCtx.putImageData(rawImgData, 0, 0);

        const dataURL = rawCanvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.download = 'tap-hold-kakushie.png';
        link.href = dataURL;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }

      setTimeout(() => {
        openDownloadFeedbackModal();
      }, 400);
    } catch (err) {
      console.error('PNG-8 encoding error:', err);
    } finally {
      btnExport.disabled = false;
      btnExport.textContent = originalText;
    }
  }, 50);
}
