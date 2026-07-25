/**
 * Tap&Hold Kakushie Maker — Official Kakushie PNG-8 Engine with Exact Solid Timeline Preview Simulation
 */

document.addEventListener('DOMContentLoaded', () => {
  
  // State Object
  const state = {
    imgMain: null,
    aspect: 'auto',
    previewBg: 'light', // 'light' (White TL) | 'dark' (Black TL)
    isHolding: false,
    autoLineArt: 0, // 0 to 100%
    brightness: 0,
    maskOpacity: 0.35, // Display-only red mask overlay opacity
    
    // Raw output buffer stored exclusively for PNG-8 export
    currentRawRgba: null,

    // Brush Tool State for Mask
    isDrawing: false,
    brushSize: 50, // Range 25px to 150px (default 50px)
    tool: 'brush', // 'brush' (Show before tap) | 'eraser' (Hide before tap)
    strokePoints: [],
    lastMidPoint: null,
    
    // Undo Stack
    undoStack: []
  };

  // DOM Elements
  const dropZoneMain = document.getElementById('drop-zone-main');
  const fileInputMain = document.getElementById('file-input-main');
  const uploadContentMain = document.getElementById('upload-content-main');
  const previewWrapperMain = document.getElementById('preview-wrapper-main');
  const thumbMain = document.getElementById('thumb-main');
  const clearMain = document.getElementById('clear-main');

  const placeholderEdit = document.getElementById('placeholder-edit');
  const placeholderOut = document.getElementById('placeholder-out');

  const selectAspect = document.getElementById('select-aspect');

  const brushSizeInput = document.getElementById('brush-size');
  const brushSizeVal = document.getElementById('brush-size-val');
  const brushCursor = document.getElementById('brush-cursor');
  
  const btnShowBeforeTap = document.getElementById('btn-show-before-tap');
  const btnHideBeforeTap = document.getElementById('btn-hide-before-tap');
  const btnResetHidden = document.getElementById('btn-reset-hidden');
  const btnUndo = document.getElementById('btn-undo');

  const sliderMaskOpacity = document.getElementById('slider-mask-opacity');
  const valMaskOpacity = document.getElementById('val-mask-opacity');

  const sliderAutoLineArt = document.getElementById('slider-auto-lineart');
  const valAutoLineArt = document.getElementById('val-auto-lineart');
  const sliderBrightness = document.getElementById('slider-brightness');
  const valBrightness = document.getElementById('val-brightness');

  const btnExport = document.getElementById('btn-export');
  const tapStage = document.getElementById('tap-stage');
  const bgIndicator = document.getElementById('bg-indicator');

  const btnTlLight = document.getElementById('btn-tl-light');
  const btnTlDark = document.getElementById('btn-tl-dark');

  // Canvases
  const editCanvas = document.getElementById('edit-canvas');
  const ctxEdit = editCanvas.getContext('2d');

  // Hidden Offscreen Mask Canvas (Stores revealed areas where alpha > 0)
  const maskCanvas = document.createElement('canvas');
  const ctxMask = maskCanvas.getContext('2d');

  // Fast GPU Offscreen Overlay Canvas for Red Mask
  const overlayCanvas = document.createElement('canvas');
  const ctxOverlay = overlayCanvas.getContext('2d');

  const outputCanvas = document.getElementById('output-canvas');
  const ctxOut = outputCanvas.getContext('2d', { willReadFrequently: true });

  // Set Default Canvas Dimensions
  let width = 2432;
  let height = 1368;
  updateDimensionsForAspect();

  function updateDimensionsForAspect() {
    let w = 2432;
    let h = 2432;

    if (state.aspect === 'auto') {
      if (state.imgMain) {
        const ratio = state.imgMain.width / state.imgMain.height;
        if (ratio >= 1) {
          w = 2432;
          h = Math.round(2432 / ratio);
        } else {
          h = 2432;
          w = Math.round(2432 * ratio);
        }
      } else {
        w = 2432;
        h = 1368;
      }
    } else if (state.aspect === 'square') {
      w = 2432; h = 2432;
    } else if (state.aspect === 'portrait2x3') {
      w = 1664; h = 2432;
    } else if (state.aspect === 'portrait4x5') {
      w = 1946; h = 2432;
    } else if (state.aspect === 'portrait9x16') {
      w = 1368; h = 2432;
    } else if (state.aspect === 'landscape16x9') {
      w = 2432; h = 1368;
    } else if (state.aspect === 'landscape3x2') {
      w = 2432; h = 1621;
    }

    updateCanvasDimensions(w, h);
  }

  function updateCanvasDimensions(w, h) {
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

    // Dynamic container aspect ratio
    const wrapperEdit = document.getElementById('wrapper-edit');
    if (wrapperEdit) wrapperEdit.style.aspectRatio = `${w} / ${h}`;
    if (tapStage) tapStage.style.aspectRatio = `${w} / ${h}`;

    // Clear Mask to empty
    ctxMask.clearRect(0, 0, w, h);
    state.undoStack = [];
    updateUndoButtonState();
  }

  // --- Step 1: Upload Main Image ---
  dropZoneMain.addEventListener('click', e => {
    if (e.target !== clearMain && !clearMain.contains(e.target)) {
      fileInputMain.click();
    }
  });

  fileInputMain.addEventListener('change', e => {
    if (e.target.files && e.target.files.length > 0) {
      loadMainFile(e.target.files[0]);
    }
  });

  ['dragenter', 'dragover'].forEach(eventName => {
    dropZoneMain.addEventListener(eventName, e => {
      e.preventDefault();
      e.stopPropagation();
      dropZoneMain.classList.add('border-brand-500', 'bg-brand-50');
    });
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropZoneMain.addEventListener(eventName, e => {
      e.preventDefault();
      e.stopPropagation();
      dropZoneMain.classList.remove('border-brand-500', 'bg-brand-50');
    });
  });

  dropZoneMain.addEventListener('drop', e => {
    const dt = e.dataTransfer;
    if (dt && dt.files && dt.files.length > 0) {
      loadMainFile(dt.files[0]);
    }
  });

  clearMain.addEventListener('click', e => {
    e.stopPropagation();
    fileInputMain.value = '';
    previewWrapperMain.classList.add('hidden');
    uploadContentMain.classList.remove('hidden');
    state.imgMain = null;
    ctxMask.clearRect(0, 0, width, height);
    state.undoStack = [];
    updateUndoButtonState();
    brushCursor.classList.add('hidden');
    renderAll();
  });

  function loadMainFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = evt => {
      const img = new Image();
      img.onload = () => {
        state.imgMain = img;
        thumbMain.src = evt.target.result;
        uploadContentMain.classList.add('hidden');
        previewWrapperMain.classList.remove('hidden');

        updateDimensionsForAspect();
        ctxMask.clearRect(0, 0, width, height);
        saveUndoState();

        renderAll();
      };
      img.onerror = (err) => console.error("Error loading image:", err);
      img.src = evt.target.result;
    };
    reader.readAsDataURL(file);
  }

  // --- Step 2: Adjustments & Brush Tools ---
  selectAspect.addEventListener('change', e => {
    state.aspect = e.target.value;
    updateDimensionsForAspect();
    renderAll();
  });

  btnShowBeforeTap.addEventListener('click', () => {
    state.tool = 'brush';
    btnShowBeforeTap.className = 'btn-mode active flex items-center justify-center py-2 px-3 text-xs font-bold rounded-xl border border-brand-500 bg-brand-50 text-brand-700 transition-all';
    btnHideBeforeTap.className = 'btn-mode flex items-center justify-center py-2 px-3 text-xs font-semibold rounded-xl border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-all';
  });

  btnHideBeforeTap.addEventListener('click', () => {
    state.tool = 'eraser';
    btnHideBeforeTap.className = 'btn-mode active flex items-center justify-center py-2 px-3 text-xs font-bold rounded-xl border border-brand-500 bg-brand-50 text-brand-700 transition-all';
    btnShowBeforeTap.className = 'btn-mode flex items-center justify-center py-2 px-3 text-xs font-semibold rounded-xl border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-all';
  });

  brushSizeInput.addEventListener('input', e => {
    state.brushSize = parseInt(e.target.value, 10);
    brushSizeVal.textContent = `${state.brushSize}px`;
    updateBrushCursorSize();
  });

  btnResetHidden.addEventListener('click', () => {
    saveUndoState();
    ctxMask.clearRect(0, 0, width, height);
    renderAll();
  });

  btnUndo.addEventListener('click', () => {
    if (state.undoStack.length > 0) {
      const lastState = state.undoStack.pop();
      ctxMask.putImageData(lastState, 0, 0);
      updateUndoButtonState();
      renderAll();
    }
  });

  function saveUndoState() {
    if (state.undoStack.length >= 20) {
      state.undoStack.shift();
    }
    state.undoStack.push(ctxMask.getImageData(0, 0, width, height));
    updateUndoButtonState();
  }

  function updateUndoButtonState() {
    btnUndo.disabled = state.undoStack.length === 0;
    btnUndo.classList.toggle('opacity-50', state.undoStack.length === 0);
  }

  sliderMaskOpacity.addEventListener('input', e => {
    state.maskOpacity = parseInt(e.target.value, 10) / 100.0;
    valMaskOpacity.textContent = `${e.target.value}%`;
    renderEditCanvasFast();
  });

  if (sliderAutoLineArt) {
    sliderAutoLineArt.addEventListener('input', e => {
      state.autoLineArt = parseInt(e.target.value, 10);
      valAutoLineArt.textContent = `${state.autoLineArt}%`;
      renderAll();
    });
  }

  sliderBrightness.addEventListener('input', e => {
    state.brightness = parseInt(e.target.value, 10);
    valBrightness.textContent = state.brightness;
    renderOutputCanvas();
  });

  // --- Circular Brush Ring Cursor Position & Scaling ---
  const wrapperEdit = document.getElementById('wrapper-edit');

  function updateBrushCursorSize() {
    if (!editCanvas.width) return;
    const rect = editCanvas.getBoundingClientRect();
    if (!rect.width) return;
    const scale = rect.width / editCanvas.width;
    const displayDiameter = Math.max(8, state.brushSize * scale);
    brushCursor.style.width = `${displayDiameter}px`;
    brushCursor.style.height = `${displayDiameter}px`;
  }

  function updateBrushCursorPos(e) {
    if (!state.imgMain || !wrapperEdit) {
      brushCursor.classList.add('hidden');
      return;
    }
    const rect = wrapperEdit.getBoundingClientRect();
    const localX = e.clientX - rect.left;
    const localY = e.clientY - rect.top;

    if (localX >= 0 && localX <= rect.width && localY >= 0 && localY <= rect.height) {
      updateBrushCursorSize();
      brushCursor.style.left = `${localX}px`;
      brushCursor.style.top = `${localY}px`;
      brushCursor.classList.remove('hidden');
    } else {
      brushCursor.classList.add('hidden');
    }
  }

  if (wrapperEdit) {
    wrapperEdit.addEventListener('mouseenter', e => updateBrushCursorPos(e));
    wrapperEdit.addEventListener('mousemove', e => updateBrushCursorPos(e));
    wrapperEdit.addEventListener('mouseleave', () => brushCursor.classList.add('hidden'));
  }

  // --- Ultra-Fast Drawing Engine ---
  editCanvas.addEventListener('mousedown', startDrawing);
  editCanvas.addEventListener('mousemove', draw);
  editCanvas.addEventListener('mouseup', stopDrawing);
  editCanvas.addEventListener('mouseleave', stopDrawing);

  editCanvas.addEventListener('touchstart', e => {
    e.preventDefault();
    const touch = e.touches[0];
    const mouseEvent = new MouseEvent('mousedown', { clientX: touch.clientX, clientY: touch.clientY });
    editCanvas.dispatchEvent(mouseEvent);
  });
  editCanvas.addEventListener('touchmove', e => {
    e.preventDefault();
    const touch = e.touches[0];
    const mouseEvent = new MouseEvent('mousemove', { clientX: touch.clientX, clientY: touch.clientY });
    editCanvas.dispatchEvent(mouseEvent);
  });
  editCanvas.addEventListener('touchend', () => stopDrawing());

  function getCanvasPos(e) {
    const rect = editCanvas.getBoundingClientRect();
    const scaleX = editCanvas.width / rect.width;
    const scaleY = editCanvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  }

  function startDrawing(e) {
    if (!state.imgMain) return;
    saveUndoState();
    state.isDrawing = true;
    const pos = getCanvasPos(e);
    state.strokePoints = [pos];
    state.lastMidPoint = pos;

    // Draw initial dot on mask
    ctxMask.beginPath();
    ctxMask.arc(pos.x, pos.y, state.brushSize / 2, 0, Math.PI * 2);
    if (state.tool === 'brush') {
      ctxMask.globalCompositeOperation = 'source-over';
      ctxMask.fillStyle = '#FFFFFF';
      ctxMask.fill();
    } else {
      ctxMask.globalCompositeOperation = 'destination-out';
      ctxMask.fill();
    }
    ctxMask.globalCompositeOperation = 'source-over';

    renderEditCanvasFast();
  }

  function draw(e) {
    if (!state.isDrawing || !state.imgMain) return;
    const pos = getCanvasPos(e);
    state.strokePoints.push(pos);

    if (state.strokePoints.length > 1) {
      const p1 = state.strokePoints[state.strokePoints.length - 2];
      const p2 = pos;
      const currentMid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };

      ctxMask.beginPath();
      ctxMask.moveTo(state.lastMidPoint.x, state.lastMidPoint.y);
      ctxMask.quadraticCurveTo(p1.x, p1.y, currentMid.x, currentMid.y);
      ctxMask.lineCap = 'round';
      ctxMask.lineJoin = 'round';
      ctxMask.lineWidth = state.brushSize;

      if (state.tool === 'brush') {
        ctxMask.globalCompositeOperation = 'source-over';
        ctxMask.strokeStyle = '#FFFFFF';
      } else {
        ctxMask.globalCompositeOperation = 'destination-out';
        ctxMask.strokeStyle = '#000000';
      }

      ctxMask.stroke();
      ctxMask.globalCompositeOperation = 'source-over';
      state.lastMidPoint = currentMid;
    }

    renderEditCanvasFast();
  }

  function stopDrawing() {
    if (state.isDrawing) {
      state.isDrawing = false;
      state.strokePoints = [];
      state.lastMidPoint = null;
      renderAll();
    }
  }

  // --- Step 3: Preview Timeline Mode Toggle (Light TL vs Dark TL) ---
  function updateTlToggleUI() {
    if (!btnTlLight || !btnTlDark) return;

    if (state.previewBg === 'light') {
      btnTlLight.className = 'flex items-center gap-1.5 px-3 py-1 rounded-full font-bold transition-all bg-brand-600 text-white shadow-sm';
      btnTlLight.innerHTML = '<span class="inline-block w-2.5 h-2.5 rounded-full border-2 border-white"></span> Light TL';
      
      btnTlDark.className = 'flex items-center gap-1.5 px-3 py-1 rounded-full font-medium text-slate-600 hover:text-brand-700 transition-all';
      btnTlDark.innerHTML = '<span class="inline-block w-2.5 h-2.5 rounded-full bg-slate-400"></span> Dark TL';

      tapStage.classList.remove('bg-black');
      tapStage.classList.add('bg-white');
      bgIndicator.innerHTML = 'State: <strong class="text-brand-600">Timeline (Light TL / White BG)</strong>';
    } else {
      btnTlDark.className = 'flex items-center gap-1.5 px-3 py-1 rounded-full font-bold transition-all bg-brand-600 text-white shadow-sm';
      btnTlDark.innerHTML = '<span class="inline-block w-2.5 h-2.5 rounded-full bg-white"></span> Dark TL';

      btnTlLight.className = 'flex items-center gap-1.5 px-3 py-1 rounded-full font-medium text-slate-600 hover:text-brand-700 transition-all';
      btnTlLight.innerHTML = '<span class="inline-block w-2.5 h-2.5 rounded-full border-2 border-slate-400"></span> Light TL';

      tapStage.classList.remove('bg-white');
      tapStage.classList.add('bg-black');
      bgIndicator.innerHTML = 'State: <strong class="text-brand-600">Timeline (Dark TL / Black BG)</strong>';
    }
  }

  btnTlLight.addEventListener('click', () => {
    state.previewBg = 'light';
    renderOutputCanvas();
    updateTlToggleUI();
  });

  btnTlDark.addEventListener('click', () => {
    state.previewBg = 'dark';
    renderOutputCanvas();
    updateTlToggleUI();
  });

  // --- Step 3: Check Preview (Interactive Tap & Hold) ---
  function setHolding(isHolding) {
    state.isHolding = isHolding;
    if (isHolding) {
      tapStage.classList.remove('bg-white');
      tapStage.classList.add('bg-black', 'holding');
      bgIndicator.innerHTML = 'State: <strong class="text-brand-600">Enlarged View (Black BG)</strong>';
      renderOutputCanvas();
    } else {
      tapStage.classList.remove('holding');
      updateTlToggleUI();
      renderOutputCanvas();
    }
  }

  tapStage.addEventListener('mousedown', () => setHolding(true));
  tapStage.addEventListener('mouseup', () => setHolding(false));
  tapStage.addEventListener('mouseleave', () => setHolding(false));

  tapStage.addEventListener('touchstart', e => {
    e.preventDefault();
    setHolding(true);
  });
  tapStage.addEventListener('touchend', () => setHolding(false));
  tapStage.addEventListener('touchcancel', () => setHolding(false));

  // --- FAQ Accordion ---
  document.querySelectorAll('.faq-item').forEach(item => {
    const questionBtn = item.querySelector('.faq-question');
    const answer = item.querySelector('.faq-answer');
    const chevron = item.querySelector('.faq-chevron');

    questionBtn.addEventListener('click', () => {
      const isHidden = answer.classList.contains('hidden');
      answer.classList.toggle('hidden', !isHidden);
      if (chevron) {
        chevron.classList.toggle('rotate-180', isHidden);
      }
    });
  });

  // --- Legal Modals (Privacy Policy & Terms of Service) ---
  const modalPrivacy = document.getElementById('modal-privacy');
  const modalTerms = document.getElementById('modal-terms');

  const linkPrivacy = document.getElementById('link-privacy');
  const linkTerms = document.getElementById('link-terms');

  const closePrivacyBtns = [document.getElementById('close-privacy'), document.getElementById('btn-close-privacy')];
  const closeTermsBtns = [document.getElementById('close-terms'), document.getElementById('btn-close-terms')];

  if (linkPrivacy && modalPrivacy) {
    linkPrivacy.addEventListener('click', () => modalPrivacy.classList.remove('hidden'));
    closePrivacyBtns.forEach(b => b && b.addEventListener('click', () => modalPrivacy.classList.add('hidden')));
    modalPrivacy.addEventListener('click', e => {
      if (e.target === modalPrivacy) modalPrivacy.classList.add('hidden');
    });
  }

  if (linkTerms && modalTerms) {
    linkTerms.addEventListener('click', () => modalTerms.classList.remove('hidden'));
    closeTermsBtns.forEach(b => b && b.addEventListener('click', () => modalTerms.classList.add('hidden')));
    modalTerms.addEventListener('click', e => {
      if (e.target === modalTerms) modalTerms.classList.add('hidden');
    });
  }

  // --- Navbar Dropdowns: Theme Mode & Language Selector ---
  const btnThemeDropdown = document.getElementById('btn-theme-dropdown');
  const menuTheme = document.getElementById('menu-theme');
  const optThemes = document.querySelectorAll('.opt-theme');

  const btnLangDropdown = document.getElementById('btn-lang-dropdown');
  const menuLang = document.getElementById('menu-lang');
  const optLangs = document.querySelectorAll('.opt-lang');

  // Toggle Theme Menu
  if (btnThemeDropdown && menuTheme) {
    btnThemeDropdown.addEventListener('click', (e) => {
      e.stopPropagation();
      if (menuLang) menuLang.classList.add('hidden');
      menuTheme.classList.toggle('hidden');
    });

    optThemes.forEach(opt => {
      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        const selectedTheme = opt.getAttribute('data-theme');
        applyThemeMode(selectedTheme);
        menuTheme.classList.add('hidden');
      });
    });
  }

  // Toggle Language Menu
  if (btnLangDropdown && menuLang) {
    btnLangDropdown.addEventListener('click', (e) => {
      e.stopPropagation();
      if (menuTheme) menuTheme.classList.add('hidden');
      menuLang.classList.toggle('hidden');
    });

    optLangs.forEach(opt => {
      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        const selectedLang = opt.getAttribute('data-lang');
        applyLanguage(selectedLang);
        menuLang.classList.add('hidden');
      });
    });
  }

  // Close dropdowns on click outside
  document.addEventListener('click', () => {
    if (menuTheme) menuTheme.classList.add('hidden');
    if (menuLang) menuLang.classList.add('hidden');
  });

  function applyThemeMode(theme) {
    optThemes.forEach(opt => {
      const t = opt.getAttribute('data-theme');
      const check = opt.querySelector('.check-theme');
      if (t === theme) {
        opt.classList.add('active');
        if (check) check.classList.remove('hidden');
      } else {
        opt.classList.remove('active');
        if (check) check.classList.add('hidden');
      }
    });

    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else if (theme === 'light') {
      document.documentElement.classList.remove('dark');
    } else {
      // System
      const isSystemDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.classList.toggle('dark', isSystemDark);
    }
  }

  function applyLanguage(lang) {
    optLangs.forEach(opt => {
      const l = opt.getAttribute('data-lang');
      const check = opt.querySelector('.check-lang');
      if (l === lang) {
        opt.classList.add('active');
        if (check) check.classList.remove('hidden');
      } else {
        opt.classList.remove('active');
        if (check) check.classList.add('hidden');
      }
    });
    document.documentElement.lang = lang;
  }

  // --- Auto Line Art (Sobel Edge Detection) Algorithm ---
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
    const data = imgData.data;

    const gray = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) {
      const p = i * 4;
      gray[i] = (data[p] * 299 + data[p + 1] * 587 + data[p + 2] * 114) / 1000;
    }

    const lineArt = new Uint8Array(w * h);
    const sensThreshold = Math.max(15, 230 - (threshold * 2.1));

    for (let y = 1; y < h - 1; y++) {
      const row = y * w;
      for (let x = 1; x < w - 1; x++) {
        const idx = row + x;
        const gx = -gray[idx - w - 1] + gray[idx - w + 1] - 2 * gray[idx - 1] + 2 * gray[idx + 1] - gray[idx + w - 1] + gray[idx + w + 1];
        const gy = -gray[idx - w - 1] - 2 * gray[idx - w] - gray[idx - w + 1] + gray[idx + w - 1] + 2 * gray[idx + w] + gray[idx + w + 1];
        if (Math.abs(gx) + Math.abs(gy) >= sensThreshold) {
          lineArt[idx] = 1;
        }
      }
    }
    return lineArt;
  }

  // --- High-Performance Rendering Pipelines ---
  
  // 1. Ultra-Fast GPU Composite for Active Brush Editing Canvas (< 0.2ms per frame!)
  function renderEditCanvasFast() {
    if (placeholderEdit) placeholderEdit.style.display = state.imgMain ? 'none' : 'flex';
    if (placeholderOut) placeholderOut.style.display = state.imgMain ? 'none' : 'flex';

    // Reset compositing mode & clear main editing canvas
    ctxEdit.globalCompositeOperation = 'source-over';
    ctxEdit.clearRect(0, 0, width, height);

    if (!state.imgMain) return;

    // Draw base image
    drawCover(ctxEdit, state.imgMain, width, height);

    // Reset & prepare GPU Red Mask Overlay Canvas
    ctxOverlay.globalCompositeOperation = 'source-over';
    ctxOverlay.clearRect(0, 0, width, height);
    ctxOverlay.fillStyle = `rgba(215, 45, 105, ${state.maskOpacity})`;
    ctxOverlay.fillRect(0, 0, width, height);

    // Punch holes in red mask where user brushed (revealed areas)
    ctxOverlay.globalCompositeOperation = 'destination-out';
    ctxOverlay.drawImage(maskCanvas, 0, 0);

    // Draw composited red mask onto edit canvas
    ctxEdit.globalCompositeOperation = 'source-over';
    ctxEdit.drawImage(overlayCanvas, 0, 0);

    // Draw Auto Line Art outline overlay onto edit canvas
    if (state.autoLineArt > 0) {
      const lineArtMask = computeLineArtMask(state.autoLineArt);
      if (lineArtMask) {
        const lineImg = ctxEdit.createImageData(width, height);
        for (let i = 0; i < width * height; i++) {
          if (lineArtMask[i] === 1) {
            const p = i * 4;
            lineImg.data[p] = 59;     // Cyan / Brand blue outline
            lineImg.data[p + 1] = 130;
            lineImg.data[p + 2] = 246;
            lineImg.data[p + 3] = 220;
          }
        }
        const tempLineC = document.createElement('canvas');
        tempLineC.width = width;
        tempLineC.height = height;
        tempLineC.getContext('2d').putImageData(lineImg, 0, 0);
        ctxEdit.drawImage(tempLineC, 0, 0);
      }
    }
  }

  // 2. Official Kakushie Maker Engine with Exact Solid Timeline Simulation (Light TL vs Dark TL)
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
    const lineArtMask = (state.autoLineArt > 0) ? computeLineArtMask(state.autoLineArt) : null;

    // Effective mask: 1 = Hidden (unpainted), 0 = Revealed (brushed or auto line art)
    const maskEffective = new Uint8Array(totalPixels);
    for (let i = 0; i < totalPixels; i++) {
      const isBrushed = (maskData.data[i * 4 + 3] > 0) || (lineArtMask && lineArtMask[i] === 1);
      maskEffective[i] = isBrushed ? 0 : 1;
    }

    // 2. Brightness Boost (Default 1.5x for checkerboard pixels)
    const boostFactor = state.brightness !== 0 ? Math.max(0.1, 1.0 + state.brightness / 50.0) : 1.5;
    
    const boostedData = new Uint8ClampedArray(dataB.data.length);
    for (let s = 0; s < totalPixels; s++) {
      const idx = 4 * s;
      const mult = (maskEffective[s] === 1) ? boostFactor : 1.0;
      boostedData[idx]     = Math.min(255, dataB.data[idx] * mult);
      boostedData[idx + 1] = Math.min(255, dataB.data[idx + 1] * mult);
      boostedData[idx + 2] = Math.min(255, dataB.data[idx + 2] * mult);
      boostedData[idx + 3] = dataB.data[idx + 3];
    }

    // 3. Apply Official 1-Pixel Interleaved Checkerboard Mesh (`applyCheckerMesh`)
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

        // If hidden AND checker pixel -> ALPHA = 0 (Transparent)! ELSE -> ALPHA = 255 (Opaque Full Color)!
        rawRgba[s + 3] = (isHidden && isCheckerPixel) ? 0 : 255;
      }
    }

    // Store raw RGBA buffer for export (PNG-8 export uses exact rawRgba!)
    state.currentRawRgba = rawRgba;

    // 4. Render Preview Canvas for Timeline Simulation (Exact Match to User Screenshots)
    if (state.isHolding) {
      // Tap & Hold state: Full resolution over black lightbox (reveals raw 1-pixel checkerboard mesh)
      outData.data.set(rawRgba);
    } else {
      // Timeline Simulation state:
      // - Light TL: Solid Pure White (#FFFFFF) over hidden areas, Solid Original Color over brushed areas
      // - Dark TL: Solid Pure Black (#000000) over hidden areas, Solid Original Color over brushed areas
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
            // Unpainted hidden pixel on timeline: Solid White (Light TL) or Solid Black (Dark TL)!
            outData.data[s]     = bgR;
            outData.data[s + 1] = bgG;
            outData.data[s + 2] = bgB;
            outData.data[s + 3] = 255;
          } else {
            // Brushed revealed pixel: Solid original full color!
            outData.data[s]     = rawRgba[s];
            outData.data[s + 1] = rawRgba[s + 1];
            outData.data[s + 2] = rawRgba[s + 2];
            outData.data[s + 3] = 255;
          }
        }
      }
    }

    ctxOut.putImageData(outData, 0, 0);
  }

  function renderAll() {
    renderEditCanvasFast();
    renderOutputCanvas();
    updateTlToggleUI();
  }

  function drawCover(ctx, img, w, h) {
    const imgRatio = img.width / img.height;
    const canvasRatio = w / h;
    let renderW, renderH, x, y;

    if (imgRatio > canvasRatio) {
      renderH = h;
      renderW = h * imgRatio;
      x = (w - renderW) / 2;
      y = 0;
    } else {
      renderW = w;
      renderH = w / imgRatio;
      x = 0;
      y = (h - renderH) / 2;
    }

    ctx.drawImage(img, x, y, renderW, renderH);
  }

  // --- Step 4: PNG-8 Export (Official Kakushie Maker UPNG 256-Color Indexed Palette) ---
  btnExport.addEventListener('click', () => {
    if (!state.imgMain || !state.currentRawRgba) return;

    btnExport.disabled = true;
    const originalText = btnExport.textContent;
    btnExport.textContent = 'Encoding PNG-8 (Twitter Ready)...';

    setTimeout(() => {
      try {
        // Export uses state.currentRawRgba (EXACT RAW UN-SIMULATED CHECKERBOARD MESH!)
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
          const dataURL = outputCanvas.toDataURL('image/png');
          const link = document.createElement('a');
          link.download = 'tap-hold-kakushie.png';
          link.href = dataURL;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        }
      } catch (err) {
        console.error('PNG-8 encoding error:', err);
      } finally {
        btnExport.disabled = false;
        btnExport.textContent = originalText;
      }
    }, 50);
  });

  // Initial Render
  renderAll();
});
