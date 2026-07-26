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

  // --- 8-Language Translation Dictionary (Full Website i18n) ---
  const translations = {
    en: {
      brandTitle: 'Tap&Hold Kakushie Maker',
      navTool: 'Tool', navFeatures: 'Features', navHowItWorks: 'How It Works', navWhatIs: 'What Is', navFaq: 'FAQ',
      heroBadge1: 'Free online tool — no signup required',
      heroBadge2: '100% Private — Photos never leave your browser',
      heroTitle1: 'Free Tap and Hold Kakushie Image Maker.',
      heroTitle2: 'Hide images on X timeline.',
      heroDesc: 'Tap Hold turns your picture into a transparent PNG that looks faint and empty in the X / Twitter timeline, then snaps into full color when someone taps and holds to enlarge it.',
      btnStartCreating: 'Start Creating',
      btnHowItWorks: 'How It Works',
      heroFeature1: 'Works on x.com', heroFeature2: '32-bit PNG export', heroFeature3: 'Mobile-friendly editor',
      demoTimeline: 'Timeline Thumbnail', demoFaint: '(Faint / Blank)', demoBeforeTap: 'Before tap',
      demoRevealed: 'Revealed Image', demoFullColor: '(Full Color)', demoAfterTap: 'After tap & hold',
      secToolTitle: 'Create your tap to reveal image',
      secToolSubtitle: 'Follow the 4 simple steps below to craft your hidden image illusion.',
      step1Title: 'Choose an image',
      dropTitle: 'Drop your image here',
      dropDesc: 'or click to browse. Supports JPG, PNG, WebP up to 40MB.',
      step2Title: 'Adjust how it hides',
      step2Subtitle: 'At first the whole picture is hidden before tap. Paint over just the areas you want visible before tap on the canvas below.',
      cardCanvasTitle: 'Editing canvas',
      maskOpacityLabel: 'Mask opacity',
      placeholderEdit: 'Upload an image in Step 1 to start painting',
      btnShowBeforeTap: 'Show before tap',
      btnHideBeforeTap: 'Hide before tap',
      brushSizeLabel: 'Brush size',
      btnReset: 'Reset to "hidden"',
      btnUndo: 'Undo',
      cardOutputSizeTitle: 'Output size',
      outputSizeHint: 'Keeps the original aspect ratio, auto-adjusted to stay hidden on mobile.',
      cardAdjustmentsTitle: 'Image Adjustments',
      valBrightnessLabel: 'Brightness Boost',
      brightnessHint: 'Adjusts brightness of checkerboard pixels to reveal colors vividly.',
      valAutoLineArtLabel: 'Auto line art',
      autoLineArtHint: 'Automatically detects image outlines and reveals line art before tap.',
      step3Title: 'Check the preview',
      placeholderOut: 'Tap & hold stage to simulate background reveal',
      stageOverlayText: 'TAP & HOLD TO SEE THE MAGIC',
      stageInfoHint: 'Hold stage to test reveal',
      step4Title: 'Export',
      adviceLabel: 'Posting Advice:',
      adviceText: 'Post this image on x.com only from a desktop browser. Do not use the X mobile app — Posting from the mobile app converts the image to JPEG and destroys the trick.',
      btnExportText: 'Download Hidden PNG',
      secFeaturesTitle: 'Everything you need for a perfect tap and hold reveal',
      secFeaturesSubtitle: 'A focused set of controls that match how X actually renders images, so your hidden picture works the first time.',
      feature1Title: 'Upload any image', feature1Desc: 'Drop a JPG, PNG or WebP file. The tool automatically formats it to the ideal dimensions for X / Twitter timelines.',
      feature2Title: 'Paint what stays visible', feature2Desc: 'Use the brush tool to mark areas that appear in the timeline thumbnail. Everything else waits for the tap.',
      feature3Title: 'Live before / after preview', feature3Desc: 'Test the interactive transformation directly in your browser with real-time background switching.',
      feature4Title: 'Lossless PNG export', feature4Desc: 'Download a lightweight transparent PNG with full 32-bit alpha channel precision that X processes correctly.',
      feature5Title: 'Post on x.com', feature5Desc: 'Upload the exported file from a desktop web browser. Mobile apps convert images to JPEG and break the trick.',
      feature6Title: 'Private & fast', feature6Desc: 'All image processing happens locally inside your browser client. Nothing is ever uploaded to external servers.',
      secHowItWorksTitle: 'How the X tap and hold trick works',
      secHowItWorksSubtitle: 'Create a tap to reveal image in four simple steps. No account, no watermark.',
      stepCard1Badge: 'Step 1', stepCard1Title: 'Upload your image', stepCard1Desc: 'Drop any JPG or PNG into the tool. We resize it for optimal X / Twitter thumbnail dimensions.',
      stepCard2Badge: 'Step 2', stepCard2Title: 'Paint what to hide', stepCard2Desc: 'Select areas you want to keep secret until enlarged.',
      stepCard3Badge: 'Step 3', stepCard3Title: 'Preview the effect', stepCard3Desc: 'Tap and hold the stage to test the timeline look versus what appears when enlarged.',
      stepCard4Badge: 'Step 4', stepCard4Title: 'Post on X from desktop', stepCard4Desc: 'Download the transparent PNG file and upload it to x.com from a desktop browser.',
      secWhatIsTitle: 'What is a Tap and Hold / Tap to Reveal image?',
      secWhatIsDesc: 'A tap and hold image — also called tap to reveal, click to reveal, an X hidden image or a kakushie (カクシエ, 隠し絵) in Japanese — is a transparent PNG that looks almost blank or faint in the X / Twitter timeline and reveals its full appearance when a viewer taps and holds to enlarge it.',
      secWhatIsWhyTitle: 'Why does the trick work?',
      secWhatIsWhyP1: 'X generates a thumbnail for every uploaded image. For transparent PNGs, it flattens the picture onto a white background. This tool manipulates pixel alpha values so that when blended against white, the image equals a solid white background (or faint line art).',
      secWhatIsWhyP2: 'When someone taps to view the image in full screen, X renders the PNG on a black background. The transparent alpha pixels now read against black while the solid pixels show original colors, bringing the hidden picture to life!',
      secWhatIsHowTitle: 'How to make a tap to reveal image',
      secWhatIsHowStep1: 'Upload the picture you want to hide behind the tap.',
      secWhatIsHowStep2: 'Paint over areas on the editing canvas to choose what stays visible before tap.',
      secWhatIsHowStep3: 'Adjust faintness and brightness sliders.',
      secWhatIsHowStep4: 'Download the transparent PNG file.',
      secWhatIsHowStep5: 'Post it on x.com from a desktop browser and test on mobile.',
      secFaqTitle: 'Frequently asked questions', secFaqSubtitle: 'Quick answers about tap and hold / tap to reveal images on X.',
      faq1Q: 'What is a tap hold image maker?', faq1A: 'It is a free browser tool that creates transparent PNG images which look faint or blank in the X / Twitter timeline and reveal their full appearance when someone taps and holds to enlarge them.',
      faq2Q: 'Can I post the image from the X mobile app?', faq2A: 'No. The X mobile app re-encodes images as JPEG, which removes transparent pixels and breaks the effect. Always post from a desktop web browser at x.com.',
      faq3Q: 'Is my image uploaded to a server?', faq3A: 'No. All processing happens locally inside your browser client using HTML5 Canvas. Your image never leaves your computer.',
      faq4Q: 'How does the live preview work?', faq4A: 'The live stage allows you to press and hold your mouse button or touch screen to instantly toggle the background between White (timeline mode) and Black (lightbox enlarged mode).',
      footerDesc: 'Free online maker for X tap and hold, tap to reveal and click to reveal transparent PNG images.',
      footerHeaderProduct: 'Product', footerHeaderResources: 'Resources', footerHeaderLegal: 'Legal & Support',
      footerResourceWhatIs: 'What is tap hold', footerResourceGuide: 'Tap to reveal guide', footerResourceX: 'X tap and hold',
      footerPrivacy: 'Privacy Policy', footerTerms: 'Terms of Service', footerCoffee: '☕ Buy Me a Coffee',
      footerCopyright: '© 2026 Tap Hold & Kakushie Maker. All rights reserved.',
      footerClientSide: '🔒 100% Client-Side Browser Processing',
      modalPrivacyTitle: 'Privacy Policy',
      modalPrivacySec1Title: '1. Local Client-Side Processing',
      modalPrivacySec1Text: 'Tap&Hold Kakushie Maker processes all image uploads, canvas manipulations, and PNG exports 100% locally inside your web browser. Your images and personal files are never uploaded, transmitted, or stored on any external server.',
      modalPrivacySec2Title: '2. Data Collection',
      modalPrivacySec2Text: 'We do not collect personal identification information. Standard web analytics (such as page view counts) may be used strictly to optimize site performance and user experience.',
      modalPrivacySec3Title: '3. Advertising & Cookies',
      modalPrivacySec3Text: 'This web application may display third-party advertisements (such as Google AdSense). Third-party vendors may use cookies to serve ads based on prior visits to our site.',
      modalPrivacyCloseBtn: 'Got it',
      modalTermsTitle: 'Terms of Service',
      modalTermsSec1Title: '1. Acceptance of Terms',
      modalTermsSec1Text: 'By accessing and using Tap&Hold Kakushie Maker, you agree to comply with these terms of service and all applicable laws and regulations.',
      modalTermsSec2Title: '2. Permitted Use',
      modalTermsSec2Text: 'You are free to use this tool for personal and commercial image generation. You retain full ownership and copyright of all images you process using this web app.',
      modalTermsSec3Title: '3. Disclaimer of Liability',
      modalTermsSec3Text: 'This service is provided "as is" without warranties of any kind. We are not responsible for any platform policy changes by X (Twitter) or third-party social networks.',
      modalTermsCloseBtn: 'I Agree'
    },
    es: {
      brandTitle: 'Tap&Hold Kakushie Maker',
      navTool: 'Herramienta', navFeatures: 'Características', navHowItWorks: 'Cómo funciona', navWhatIs: 'Qué es', navFaq: 'Preguntas',
      heroBadge1: 'Herramienta en línea gratuita — sin registro',
      heroBadge2: '100% Privado — Fotos protegidas en tu navegador',
      heroTitle1: 'Creador de Imágenes Tap&Hold Kakushie.',
      heroTitle2: 'Oculta imágenes en la línea de tiempo de X.',
      heroDesc: 'Tap Hold convierte tu foto en un PNG transparente que se ve tenue en el cronograma de X/Twitter y se revela a todo color al mantener pulsado.',
      btnStartCreating: 'Empezar a Crear',
      btnHowItWorks: 'Cómo Funciona',
      heroFeature1: 'Funciona en x.com', heroFeature2: 'Exportación PNG de 32 bits', heroFeature3: 'Editor apto para móviles',
      demoTimeline: 'Miniatura de la línea de tiempo', demoFaint: '(Tenue / En blanco)', demoBeforeTap: 'Antes de pulsar',
      demoRevealed: 'Imagen revelada', demoFullColor: '(A todo color)', demoAfterTap: 'Después de pulsar y mantener',
      secToolTitle: 'Crea tu imagen para revelar al pulsar',
      secToolSubtitle: 'Sigue los 4 sencillos pasos a continuación para crear tu ilusión.',
      step1Title: 'Elige una imagen',
      dropTitle: 'Arrastra tu imagen aquí',
      dropDesc: 'o haz clic para explorar. Soporta JPG, PNG, WebP hasta 40MB.',
      step2Title: 'Ajusta cómo se oculta',
      step2Subtitle: 'Al principio la imagen está oculta. Pinta sobre las áreas que quieras que se vean antes de pulsar.',
      cardCanvasTitle: 'Lienzo de edición',
      maskOpacityLabel: 'Opacidad de máscara',
      placeholderEdit: 'Sube una imagen en el Paso 1 para empezar a pintar',
      btnShowBeforeTap: 'Mostrar antes de pulsar',
      btnHideBeforeTap: 'Ocultar antes de pulsar',
      brushSizeLabel: 'Tamaño del pincel',
      btnReset: 'Restablecer a oculto',
      btnUndo: 'Deshacer',
      cardOutputSizeTitle: 'Tamaño de salida',
      outputSizeHint: 'Mantiene la proporción original, ajustado para permanecer oculto en móviles.',
      cardAdjustmentsTitle: 'Ajustes de imagen',
      valBrightnessLabel: 'Realce de brillo',
      brightnessHint: 'Ajusta el brillo de los píxeles para revelar los colores vivamente.',
      valAutoLineArtLabel: 'Línea de arte auto',
      autoLineArtHint: 'Detecta automáticamente los contornos y revela el trazo antes de pulsar.',
      step3Title: 'Comprueba la vista previa',
      placeholderOut: 'Mantén pulsada la pantalla para simular la revelación',
      stageOverlayText: 'MANTÉN PULSADO PARA VER LA MAGIA',
      stageInfoHint: 'Mantén pulsado para probar',
      step4Title: 'Exportar',
      adviceLabel: 'Consejo de publicación:',
      adviceText: 'Publica esta imagen en x.com solo desde un navegador de escritorio. No uses la app móvil de X.',
      btnExportText: 'Descargar PNG Oculto',
      secFeaturesTitle: 'Todo lo que necesitas para una revelación perfecta al pulsar',
      secFeaturesSubtitle: 'Controles diseñados según el renderizado real de imágenes en X.',
      feature1Title: 'Sube cualquier imagen', feature1Desc: 'Arrastra un archivo JPG, PNG o WebP. La herramienta lo adapta al tamaño ideal para X / Twitter.',
      feature2Title: 'Pinta lo que permanece visible', feature2Desc: 'Usa el pincel para marcar las zonas visibles en la miniatura. El resto se revela al pulsar.',
      feature3Title: 'Vista previa interactiva antes/después', feature3Desc: 'Prueba la transformación directamente en tu navegador con cambio de fondo en tiempo real.',
      feature4Title: 'Exportación PNG sin pérdidas', feature4Desc: 'Descarga un PNG transparente ligero con precisión de canal alfa de 32 bits que X procesa correctamente.',
      feature5Title: 'Publica en x.com', feature5Desc: 'Sube el archivo exportado desde un navegador web de escritorio. Las aplicaciones móviles convierten las imágenes a JPEG.',
      feature6Title: 'Privado y rápido', feature6Desc: 'Todo el procesamiento ocurre localmente en tu navegador. Nunca se sube nada a servidores externos.',
      secHowItWorksTitle: 'Cómo funciona el truco de pulsar y mantener en X',
      secHowItWorksSubtitle: 'Crea tu imagen en cuatro sencillos pasos. Sin cuenta, sin marca de agua.',
      stepCard1Badge: 'Paso 1', stepCard1Title: 'Sube tu imagen', stepCard1Desc: 'Arrastra cualquier JPG o PNG. Lo redimensionamos para las miniaturas de X.',
      stepCard2Badge: 'Paso 2', stepCard2Title: 'Pinta lo que quieres ocultar', stepCard2Desc: 'Selecciona las áreas que deseas mantener en secreto hasta ampliar.',
      stepCard3Badge: 'Paso 3', stepCard3Title: 'Previsualiza el efecto', stepCard3Desc: 'Mantiene pulsado el escenario para probar cómo se ve en la línea de tiempo frente al modo ampliado.',
      stepCard4Badge: 'Paso 4', stepCard4Title: 'Publica en X desde la computadora', stepCard4Desc: 'Descarga el archivo PNG transparente y súbelo a x.com desde un navegador de escritorio.',
      secWhatIsTitle: '¿Qué es una imagen de pulsar y mantener / revelar al pulsar?',
      secWhatIsDesc: 'Una imagen tap & hold (también llamada kakushie o imagen oculta de X) es un PNG transparente que se ve tenue en la línea de tiempo y se revela al pulsar para ampliar.',
      secWhatIsWhyTitle: '¿Por qué funciona este truco?',
      secWhatIsWhyP1: 'X genera una miniatura sobre fondo blanco para imágenes transparentes. Esta herramienta ajusta el canal alfa para que parezca blanco o tenue en la línea de tiempo.',
      secWhatIsWhyP2: 'Al pulsar para ver a pantalla completa, X muestra la imagen sobre fondo negro, haciendo que los píxeles transparentes resalten los colores originales.',
      secWhatIsHowTitle: 'Cómo hacer una imagen para revelar al pulsar',
      secWhatIsHowStep1: '1. Sube la foto que deseas ocultar.',
      secWhatIsHowStep2: '2. Pinta las zonas en el lienzo para elegir qué se ve antes de pulsar.',
      secWhatIsHowStep3: '3. Ajusta los deslizadores de atenuación y brillo.',
      secWhatIsHowStep4: '4. Descarga el archivo PNG transparente.',
      secWhatIsHowStep5: '5. Publica en x.com desde un navegador de computadora y pruébalo en el móvil.',
      secFaqTitle: 'Preguntas frecuentes', secFaqSubtitle: 'Respuestas rápidas sobre las imágenes para revelar al pulsar en X.',
      faq1Q: '¿Qué es un creador de imágenes tap hold?', faq1A: 'Es una herramienta gratuita de navegador que crea imágenes PNG transparentes que se ven tenues en X y se revelan al pulsar.',
      faq2Q: '¿Puedo publicar la imagen desde la aplicación móvil de X?', faq2A: 'No. La app móvil de X convierte las imágenes a JPEG, eliminando la transparencia. Publica siempre desde un navegador de escritorio en x.com.',
      faq3Q: '¿Mi imagen se sube a un servidor?', faq3A: 'No. Todo el procesamiento ocurre localmente en tu navegador mediante HTML5 Canvas. Tu imagen nunca sale de tu equipo.',
      faq4Q: '¿Cómo funciona la vista previa en vivo?', faq4A: 'Permite mantener pulsado el botón del ratón o la pantalla táctil para cambiar el fondo entre blanco (línea de tiempo) y negro (modo ampliado).',
      footerDesc: 'Creador gratuito en línea de imágenes transparentes para pulsar y revelar en X.',
      footerHeaderProduct: 'Producto', footerHeaderResources: 'Recursos', footerHeaderLegal: 'Legal y Soporte',
      footerResourceWhatIs: 'Qué es tap hold', footerResourceGuide: 'Guía de revelación al pulsar', footerResourceX: 'Tap and hold en X',
      footerPrivacy: 'Política de Privacidad', footerTerms: 'Términos del Servicio', footerCoffee: '☕ Cómprame un café',
      footerCopyright: '© 2026 Tap Hold & Kakushie Maker. Todos los derechos reservados.',
      footerClientSide: '🔒 Procesamiento 100% en el navegador',
      modalPrivacyTitle: 'Política de Privacidad',
      modalPrivacySec1Title: '1. Procesamiento local en el cliente',
      modalPrivacySec1Text: 'Tap&Hold Kakushie Maker procesa todas las imágenes 100% localmente en tu navegador web. Tus archivos nunca se suben ni se almacenan en servidores externos.',
      modalPrivacySec2Title: '2. Recopilación de datos',
      modalPrivacySec2Text: 'No recopilamos información de identificación personal. La analítica web estándar se utiliza únicamente para optimizar el rendimiento del sitio.',
      modalPrivacySec3Title: '3. Publicidad y cookies',
      modalPrivacySec3Text: 'Esta aplicación web puede mostrar anuncios de terceros. Los proveedores externos pueden utilizar cookies para ofrecer anuncios.',
      modalPrivacyCloseBtn: 'Entendido',
      modalTermsTitle: 'Términos del Servicio',
      modalTermsSec1Title: '1. Aceptación de términos',
      modalTermsSec1Text: 'Al acceder y utilizar Tap&Hold Kakushie Maker, aceptas cumplir con estos términos de servicio.',
      modalTermsSec2Title: '2. Uso permitido',
      modalTermsSec2Text: 'Eres libre de usar esta herramienta para uso personal y comercial. Conservas la propiedad total de tus imágenes.',
      modalTermsSec3Title: '3. Exención de responsabilidad',
      modalTermsSec3Text: 'Este servicio se proporciona "tal cual" sin garantías. No nos hacemos responsables de los cambios de políticas en X.',
      modalTermsCloseBtn: 'Acepto'
    },
    fr: {
      brandTitle: 'Tap&Hold Kakushie Maker',
      navTool: 'Outil', navFeatures: 'Fonctionnalités', navHowItWorks: 'Comment ça marche', navWhatIs: 'Qu\'est-ce que c\'est', navFaq: 'FAQ',
      heroBadge1: 'Outil en ligne gratuit — sans inscription',
      heroBadge2: '100% Privé — Photos gardées dans votre navigateur',
      heroTitle1: 'Générateur d\'Images Tap&Hold Kakushie.',
      heroTitle2: 'Masquez des images sur le fil X.',
      heroDesc: 'Tap Hold transforme votre image en un PNG transparent qui apparaît estompé sur X/Twitter et se révèle en couleur au toucher.',
      btnStartCreating: 'Commencer',
      btnHowItWorks: 'Comment ça marche',
      heroFeature1: 'Fonctionne sur x.com', heroFeature2: 'Exportation PNG 32 bits', heroFeature3: 'Éditeur adapté aux mobiles',
      demoTimeline: 'Vignette du fil d\'actualité', demoFaint: '(Estompé / Vide)', demoBeforeTap: 'Avant le clic',
      demoRevealed: 'Image révélée', demoFullColor: '(Couleur complète)', demoAfterTap: 'Après maintien appuyé',
      secToolTitle: 'Créez votre image cachée',
      secToolSubtitle: 'Suivez les 4 étapes simples ci-dessous pour créer votre illusion.',
      step1Title: 'Choisissez une image',
      dropTitle: 'Déposez votre image ici',
      dropDesc: 'ou cliquez pour parcourir. JPG, PNG, WebP jusqu\'à 40MB.',
      step2Title: 'Ajustez le masquage',
      step2Subtitle: 'Toute l\'image est cachée au départ. Peignez les zones à afficher avant le toucher.',
      cardCanvasTitle: 'Canevas d\'édition',
      maskOpacityLabel: 'Opacité du masque',
      placeholderEdit: 'Chargez une image à l\'étape 1 pour commencer',
      btnShowBeforeTap: 'Afficher avant clic',
      btnHideBeforeTap: 'Masquer avant clic',
      brushSizeLabel: 'Taille du pinceau',
      btnReset: 'Réinitialiser',
      btnUndo: 'Annuler',
      cardOutputSizeTitle: 'Taille de sortie',
      outputSizeHint: 'Conserve le ratio d\'aspect d\'origine.',
      cardAdjustmentsTitle: 'Ajustements d\'image',
      valBrightnessLabel: 'Boost de luminosité',
      brightnessHint: 'Ajuste la luminosité pour faire ressortir les couleurs.',
      valAutoLineArtLabel: 'Dessin au trait auto',
      autoLineArtHint: 'Détecte automatiquement les contours de l\'image.',
      step3Title: 'Vérifiez l\'aperçu',
      placeholderOut: 'Maintenez appuyé pour simuler la révélation',
      stageOverlayText: 'MAINTENEZ POUR VOIR LA MAGIE',
      stageInfoHint: 'Maintenez appuyé pour tester',
      step4Title: 'Exporter',
      adviceLabel: 'Conseil de publication :',
      adviceText: 'Publiez cette image sur x.com uniquement depuis un navigateur ordinateur.',
      btnExportText: 'Télécharger le PNG Caché',
      secFeaturesTitle: 'Tout ce dont vous avez besoin pour une révélation parfaite',
      secFeaturesSubtitle: 'Des commandes adaptées au rendu réel des images sur X.',
      feature1Title: 'Importez n\'importe quelle image', feature1Desc: 'Déposez un fichier JPG, PNG ou WebP. L\'outil l\'adapte automatiquement pour le fil X / Twitter.',
      feature2Title: 'Peignez ce qui reste visible', feature2Desc: 'Utilisez le pinceau pour marquer les zones visibles sur la vignette. Le reste attend le clic.',
      feature3Title: 'Aperçu interactif avant / après', feature3Desc: 'Testez la transformation directement dans votre navigateur avec basculement de fond en temps réel.',
      feature4Title: 'Exportation PNG sans perte', feature4Desc: 'Téléchargez un PNG transparent léger avec canal alpha 32 bits traité correctement par X.',
      feature5Title: 'Publiez sur x.com', feature5Desc: 'Importez le fichier exporté depuis un navigateur d\'ordinateur. Les apps mobiles convertissent les images en JPEG.',
      feature6Title: 'Privé et rapide', feature6Desc: 'Tout le traitement d\'image se fait localement dans votre navigateur. Rien n\'est envoyé vers des serveurs.',
      secHowItWorksTitle: 'Comment fonctionne le truc du maintien appuyé sur X',
      secHowItWorksSubtitle: 'Créez votre image en quatre étapes simples. Sans compte, sans filigrane.',
      stepCard1Badge: 'Étape 1', stepCard1Title: 'Importez votre image', stepCard1Desc: 'Déposez n\'importe quel JPG ou PNG. Nous l\'ajustons pour les vignettes X.',
      stepCard2Badge: 'Étape 2', stepCard2Title: 'Peignez ce qu\'il faut masquer', stepCard2Desc: 'Sélectionnez les zones à garder secrètes jusqu\'à l\'agrandissement.',
      stepCard3Badge: 'Étape 3', stepCard3Title: 'Prévisualisez l\'effet', stepCard3Desc: 'Maintenez la zone d\'essai appuyée pour tester le rendu dans le fil par rapport au mode agrandi.',
      stepCard4Badge: 'Étape 4', stepCard4Title: 'Publiez sur X depuis votre ordinateur', stepCard4Desc: 'Téléchargez le fichier PNG transparent et publiez-le sur x.com depuis un navigateur d\'ordinateur.',
      secWhatIsTitle: 'Qu\'est-ce qu\'une image à toucher et maintenir / révéler ?',
      secWhatIsDesc: 'Une image tap & hold (ou kakushie sur X) est un PNG transparent qui apparaît estompé dans le fil d\'actualité et révèle toute son image lorsqu\'on maintient le doigt dessus.',
      secWhatIsWhyTitle: 'Pourquoi ce truc fonctionne-t-il ?',
      secWhatIsWhyP1: 'X génère une vignette sur fond blanc pour les PNG transparents. Cet outil ajuste les valeurs alpha pour qu\'elle semble blanche ou discrète dans le fil.',
      secWhatIsWhyP2: 'Lorsque quelqu\'un clique pour voir en grand, X affiche le PNG sur fond noir. Les pixels transparents révèlent alors les couleurs d\'origine !',
      secWhatIsHowTitle: 'Comment créer une image à révéler',
      secWhatIsHowStep1: '1. Téléchargez l\'image que vous souhaitez masquer.',
      secWhatIsHowStep2: '2. Peignez sur le canevas les zones visibles avant le clic.',
      secWhatIsHowStep3: '3. Ajustez les curseurs d\'estompement et de luminosité.',
      secWhatIsHowStep4: '4. Téléchargez le fichier PNG transparent.',
      secWhatIsHowStep5: '5. Publiez sur x.com depuis un navigateur PC et testez sur mobile.',
      secFaqTitle: 'Foire aux questions', secFaqSubtitle: 'Réponses rapides sur les images à révéler sur X.',
      faq1Q: 'Qu\'est-ce qu\'un générateur d\'images tap hold ?', faq1A: 'C\'est un outil gratuit en ligne qui crée des PNG transparents apparaissant estompés sur X et se révélant lors du maintien appuyé.',
      faq2Q: 'Puis-je publier l\'image depuis l\'application mobile X ?', faq2A: 'Non. L\'application mobile re-code les images en JPEG, ce qui détruit la transparence. Publiez toujours depuis un navigateur PC sur x.com.',
      faq3Q: 'Mon image est-elle envoyée sur un serveur ?', faq3A: 'Non. Tout le traitement se fait localement dans votre navigateur via HTML5 Canvas. Votre image ne quitte jamais votre ordinateur.',
      faq4Q: 'Comment fonctionne l\'aperçu en direct ?', faq4A: 'Permet de maintenir le clic ou l\'écran tactile pour basculer instantanément le fond entre blanc (fil) et noir (agrandi).',
      footerDesc: 'Générateur en ligne gratuit d\'images transparentes à révéler au toucher sur X.',
      footerHeaderProduct: 'Produit', footerHeaderResources: 'Ressources', footerHeaderLegal: 'Légal & Support',
      footerResourceWhatIs: 'Qu\'est-ce que tap hold', footerResourceGuide: 'Guide de révélation au clic', footerResourceX: 'Tap and hold sur X',
      footerPrivacy: 'Politique de Confidentialité', footerTerms: 'Conditions d\'Utilisation', footerCoffee: '☕ Offrez-moi un café',
      footerCopyright: '© 2026 Tap Hold & Kakushie Maker. Tous droits réservés.',
      footerClientSide: '🔒 Traitement 100% dans votre navigateur',
      modalPrivacyTitle: 'Politique de Confidentialité',
      modalPrivacySec1Title: '1. Traitement local',
      modalPrivacySec1Text: 'Tap&Hold Kakushie Maker traite toutes vos images 100% localement dans votre navigateur. Vos fichiers ne sont jamais envoyés sur des serveurs externes.',
      modalPrivacySec2Title: '2. Collecte de données',
      modalPrivacySec2Text: 'Nous ne collectons aucune donnée personnelle. L\'analyse web standard est utilisée uniquement pour optimiser le site.',
      modalPrivacySec3Title: '3. Publicité & Cookies',
      modalPrivacySec3Text: 'Cette application peut afficher des publicités d\'éditeurs tiers pouvant utiliser des cookies.',
      modalPrivacyCloseBtn: 'Compris',
      modalTermsTitle: 'Conditions d\'Utilisation',
      modalTermsSec1Title: '1. Acceptation des conditions',
      modalTermsSec1Text: 'En utilisant Tap&Hold Kakushie Maker, vous acceptez d\'être lié par ces conditions d\'utilisation.',
      modalTermsSec2Title: '2. Utilisation autorisée',
      modalTermsSec2Text: 'Vous êtes libre d\'utiliser cet outil pour des besoins personnels ou commerciaux. Vous conservez vos droits d\'auteur.',
      modalTermsSec3Title: '3. Limite de responsabilité',
      modalTermsSec3Text: 'Ce service est fourni "en l\'état". Nous ne sommes pas responsables des modifications de politiques sur la plateforme X.',
      modalTermsCloseBtn: 'J\'accepte'
    },
    pt: {
      brandTitle: 'Tap&Hold Kakushie Maker',
      navTool: 'Ferramenta', navFeatures: 'Recursos', navHowItWorks: 'Como funciona', navWhatIs: 'O que é', navFaq: 'FAQ',
      heroBadge1: 'Ferramenta online gratuita — sem cadastro',
      heroBadge2: '100% Privado — Fotos não saem do navegador',
      heroTitle1: 'Gerador de Imagens Tap&Hold Kakushie.',
      heroTitle2: 'Oculte imagens na timeline do X.',
      heroDesc: 'Transforma sua imagem em um PNG transparente que fica fraco na linha do tempo do X/Twitter e se revela em cores ao tocar e segurar.',
      btnStartCreating: 'Começar a Criar',
      btnHowItWorks: 'Como Funciona',
      heroFeature1: 'Funciona no x.com', heroFeature2: 'Exportação PNG de 32 bits', heroFeature3: 'Editor compatível com celular',
      demoTimeline: 'Miniatura da linha do tempo', demoFaint: '(Fraco / Em branco)', demoBeforeTap: 'Antes do toque',
      demoRevealed: 'Imagem revelada', demoFullColor: '(Cores completas)', demoAfterTap: 'Após tocar e segurar',
      secToolTitle: 'Crie sua imagem oculta',
      secToolSubtitle: 'Siga os 4 passos simples abaixo.',
      step1Title: 'Escolha uma imagem',
      dropTitle: 'Arraste sua imagem aqui',
      dropDesc: 'ou clique para navegar. JPG, PNG, WebP até 40MB.',
      step2Title: 'Ajuste como oculta',
      step2Subtitle: 'A imagem começa oculta. Pinte as áreas que deseja exibir antes do toque.',
      cardCanvasTitle: 'Tela de edição',
      maskOpacityLabel: 'Opacidade da máscara',
      placeholderEdit: 'Envie uma imagem na Etapa 1 para pintar',
      btnShowBeforeTap: 'Mostrar antes do toque',
      btnHideBeforeTap: 'Ocultar antes do toque',
      brushSizeLabel: 'Tamanho do pincel',
      btnReset: 'Redefinir para oculto',
      btnUndo: 'Desfazer',
      cardOutputSizeTitle: 'Tamanho de saída',
      outputSizeHint: 'Mantém a proporção original.',
      cardAdjustmentsTitle: 'Ajustes de imagem',
      valBrightnessLabel: 'Brilho extra',
      brightnessHint: 'Ajusta o brilho dos pixels.',
      valAutoLineArtLabel: 'Desenho de linhas auto',
      autoLineArtHint: 'Detecta contornos automaticamente.',
      step3Title: 'Verifique a prévia',
      placeholderOut: 'Toque e segure para simular',
      stageOverlayText: 'TOQUE E SEGURE PARA VER A MÁGICA',
      stageInfoHint: 'Segure para testar',
      step4Title: 'Exportar',
      adviceLabel: 'Dica de postagem:',
      adviceText: 'Poste esta imagem no x.com apenas de um navegador de computador.',
      btnExportText: 'Baixar PNG Oculto',
      secFeaturesTitle: 'Tudo o que você precisa para uma revelação perfeita',
      secFeaturesSubtitle: 'Controles ajustados ao modo como o X renderiza as imagens.',
      feature1Title: 'Envie qualquer imagem', feature1Desc: 'Arraste JPG, PNG ou WebP. A ferramenta ajusta automaticamente para a linha do tempo do X.',
      feature2Title: 'Pinte o que fica visível', feature2Desc: 'Use o pincel para marcar as áreas visíveis na miniatura. O resto aguarda o toque.',
      feature3Title: 'Prévia interativa antes / depois', feature3Desc: 'Teste a transformação direto no seu navegador com alternância de fundo em tempo real.',
      feature4Title: 'Exportação PNG sem perdas', feature4Desc: 'Baixe um PNG transparente leve com precisão de canal alfa de 32 bits aceito pelo X.',
      feature5Title: 'Poste no x.com', feature5Desc: 'Envie o arquivo exportado de um navegador de computador. Os aplicativos móveis convertem imagens para JPEG.',
      feature6Title: 'Privado e rápido', feature6Desc: 'Todo o processamento acontece localmente no seu navegador. Nada é enviado para servidores externos.',
      secHowItWorksTitle: 'Como funciona o truque de tocar e segurar no X',
      secHowItWorksSubtitle: 'Crie sua imagem em quatro passos simples. Sem conta, sem marca d\'água.',
      stepCard1Badge: 'Passo 1', stepCard1Title: 'Envie sua imagem', stepCard1Desc: 'Arraste qualquer JPG ou PNG. Ajustamos para as dimensões ideais do X.',
      stepCard2Badge: 'Passo 2', stepCard2Title: 'Pinte o que deseja ocultar', stepCard2Desc: 'Selecione as áreas que deseja manter segredo até ampliar.',
      stepCard3Badge: 'Passo 3', stepCard3Title: 'Visualize o efeito', stepCard3Desc: 'Toque e segure o palco para testar a aparência na linha do tempo versus quando ampliado.',
      stepCard4Badge: 'Passo 4', stepCard4Title: 'Poste no X pelo computador', stepCard4Desc: 'Baixe o arquivo PNG transparente e envie para o x.com em um navegador de computador.',
      secWhatIsTitle: 'O que é uma imagem de tocar e segurar / revelar ao toque?',
      secWhatIsDesc: 'Uma imagem tap & hold (também chamada kakushie ou imagem oculta do X) é um PNG transparente que fica fraco na linha do tempo e se revela ao ser ampliado.',
      secWhatIsWhyTitle: 'Por que esse truque funciona?',
      secWhatIsWhyP1: 'O X gera uma miniatura com fundo branco para PNGs transparentes. Esta ferramenta ajusta os valores de alfa para parecer branco ou tenue na linha do tempo.',
      secWhatIsWhyP2: 'Quando alguém clica para ver em tela cheia, o X exibe o PNG sobre fundo preto, fazendo com que as cores originais apareçam!',
      secWhatIsHowTitle: 'Como fazer uma imagem para revelar ao toque',
      secWhatIsHowStep1: '1. Envie a foto que você deseja ocultar.',
      secWhatIsHowStep2: '2. Pinte sobre a tela para escolher o que fica visível antes do toque.',
      secWhatIsHowStep3: '3. Ajuste os controles de atenuação e brilho.',
      secWhatIsHowStep4: '4. Baixe o arquivo PNG transparente.',
      secWhatIsHowStep5: '5. Poste no x.com pelo navegador do computador e teste no celular.',
      secFaqTitle: 'Perguntas frequentes', secFaqSubtitle: 'Respostas rápidas sobre imagens para revelar no X.',
      faq1Q: 'O que é um criador de imagens tap hold?', faq1A: 'É uma ferramenta online gratuita que cria imagens PNG transparentes que ficam fracas no X e se revelam ao toque.',
      faq2Q: 'Posso postar a imagem pelo aplicativo do celular?', faq2A: 'Não. O aplicativo móvel re-codifica imagens como JPEG, removendo a transparência. Poste sempre de um navegador de computador em x.com.',
      faq3Q: 'Minha imagem é enviada para algum servidor?', faq3A: 'Não. Todo o processamento é feito localmente no seu navegador via HTML5 Canvas. Sua imagem nunca sai do seu computador.',
      faq4Q: 'Como funciona a prévia ao vivo?', faq4A: 'Permite pressionar e segurar para alternar instantaneamente o fundo entre branco (linha do tempo) e preto (ampliado).',
      footerDesc: 'Gerador online gratuito de imagens transparentes para revelar ao toque no X.',
      footerHeaderProduct: 'Produto', footerHeaderResources: 'Recursos', footerHeaderLegal: 'Legal e Suporte',
      footerResourceWhatIs: 'O que é tap hold', footerResourceGuide: 'Guia de revelação ao toque', footerResourceX: 'Tap and hold no X',
      footerPrivacy: 'Política de Privacidade', footerTerms: 'Termos de Serviço', footerCoffee: '☕ Pague-me um café',
      footerCopyright: '© 2026 Tap Hold & Kakushie Maker. Todos os direitos reservados.',
      footerClientSide: '🔒 Processamento 100% no navegador',
      modalPrivacyTitle: 'Política de Privacidade',
      modalPrivacySec1Title: '1. Processamento local no cliente',
      modalPrivacySec1Text: 'O Tap&Hold Kakushie Maker processa todas as imagens 100% localmente no navegador. Seus arquivos nunca são enviados a servidores externos.',
      modalPrivacySec2Title: '2. Coleta de dados',
      modalPrivacySec2Text: 'Não coletamos dados pessoais. As métricas web são usadas apenas para otimização do site.',
      modalPrivacySec3Title: '3. Anúncios e cookies',
      modalPrivacySec3Text: 'Este site pode exibir anúncios de terceiros que utilizam cookies.',
      modalPrivacyCloseBtn: 'Entendi',
      modalTermsTitle: 'Termos de Serviço',
      modalTermsSec1Title: '1. Aceitação dos termos',
      modalTermsSec1Text: 'Ao acessar e usar o Tap&Hold Kakushie Maker, você concorda com estes termos.',
      modalTermsSec2Title: '2. Uso permitido',
      modalTermsSec2Text: 'Você é livre para usar a ferramenta para fins pessoais ou comerciais.',
      modalTermsSec3Title: '3. Isenção de responsabilidade',
      modalTermsSec3Text: 'O serviço é fornecido "como está". Não nos responsabilizamos por mudanças nas regras do X.',
      modalTermsCloseBtn: 'Concordo'
    },
    ja: {
      brandTitle: 'Tap&Hold かくし絵メーカー',
      navTool: 'ツール', navFeatures: '特徴', navHowItWorks: '使い方', navWhatIs: '概要', navFaq: 'よくある質問',
      heroBadge1: '完全無料ツール — 登録不要',
      heroBadge2: '100%プライベート — 画像はブラウザ内のみで処理',
      heroTitle1: 'Tap&Hold かくし絵メーカー',
      heroTitle2: 'Xのタイムラインで画像を隠す',
      heroDesc: 'Tap&Holdは画像を透明なPNGに変換し、X/Twitterのタイムライン上では薄く見え、タップして長押しするとフルカラーで浮き出ます。',
      btnStartCreating: '作成を開始する',
      btnHowItWorks: '仕組みを見る',
      heroFeature1: 'x.com で動作', heroFeature2: '32bit PNG 出力', heroFeature3: 'スマホ対応エディタ',
      demoTimeline: 'タイムラインサムネイル', demoFaint: '(薄い / 空白)', demoBeforeTap: 'タップ前',
      demoRevealed: '表示された画像', demoFullColor: '(フルカラー)', demoAfterTap: 'タップ＆長押し後',
      secToolTitle: 'タップで隠し絵を作成する',
      secToolSubtitle: '以下の4つのステップに従って隠し絵を作成してください。',
      step1Title: '画像を選択する',
      dropTitle: '画像をドロップしてください',
      dropDesc: 'またはクリックして選択。JPG, PNG, WebP（最大40MB）対応。',
      step2Title: '隠し方を調整する',
      step2Subtitle: '最初は全体が隠れています。タップ前に見せたい部分をブラシで塗ってください。',
      cardCanvasTitle: '編集キャンバス',
      maskOpacityLabel: 'マスク不透明度',
      placeholderEdit: 'ステップ1で画像をアップロードして描画を開始',
      btnShowBeforeTap: 'タップ前に表示',
      btnHideBeforeTap: 'タップ前に隠す',
      brushSizeLabel: 'ブラシサイズ',
      btnReset: 'すべて非表示リセット',
      btnUndo: '元に戻す',
      cardOutputSizeTitle: '出力サイズ',
      outputSizeHint: 'アスペクト比を維持し自動調整します。',
      cardAdjustmentsTitle: '画質・調整',
      valBrightnessLabel: '明るさ補正',
      brightnessHint: '背景透過ピクセルの明るさを調整します。',
      valAutoLineArtLabel: '自動線画（Line Art）',
      autoLineArtHint: '輪郭を自動検出してタップ前表示線画を生成します。',
      step3Title: 'プレビューを確認する',
      placeholderOut: 'ステージを長押しして表示変化を確認',
      stageOverlayText: '長押しして表示を確認',
      stageInfoHint: '長押しで表示テスト',
      step4Title: 'エクスポート',
      adviceLabel: '投稿上の注意:',
      adviceText: 'PC（デスクトップブラウザ）の x.com から投稿してください。スマホアプリから投稿すると画質が変換され失敗します。',
      btnExportText: '隠し絵PNGをダウンロード',
      secFeaturesTitle: 'タップで完璧に隠し絵を表示するための全機能',
      secFeaturesSubtitle: 'Xの画像描画仕様に合わせた最適なコントロール。',
      feature1Title: 'あらゆる画像をアップロード', feature1Desc: 'JPG、PNG、WebPに対応。X/Twitterのタイムラインに最適なサイズへ自動調整します。',
      feature2Title: '事前に表示する部分を塗る', feature2Desc: 'ブラシを使ってタイムライン上に残す部分を指定。それ以外は長押しで出現します。',
      feature3Title: 'リアルタイムビフォーアフター確認', feature3Desc: '白（TL）と黒（拡大時）の背景切り替えで効果を即座に確認できます。',
      feature4Title: '高品質 PNG エクスポート', feature4Desc: 'Xのサーバー処理を正しく通過する透明度情報を持った軽量PNGをダウンロード。',
      feature5Title: 'x.com（PC）から投稿', feature5Desc: 'PCのブラウザから投稿してください。スマホアプリから投稿するとJPEG圧縮で透過が消えて失敗します。',
      feature6Title: '高速＆完全プライベート', feature6Desc: '画像処理はすべてお使いのブラウザ内（HTML5 Canvas）で完結。外部サーバーへの送信は一切ありません。',
      secHowItWorksTitle: 'X タップ＆長押し隠し絵の仕組み',
      secHowItWorksSubtitle: '登録・ウォーターマーク（透かし）なし。4ステップで簡単作成。',
      stepCard1Badge: 'ステップ 1', stepCard1Title: '画像をアップロード', stepCard1Desc: 'JPGまたはPNGをドロップ。Xのサムネイル表示領域に最適化します。',
      stepCard2Badge: 'ステップ 2', stepCard2Title: '隠す部分を調整', stepCard2Desc: 'タップして拡大するまで隠しておきたい範囲を選択します。',
      stepCard3Badge: 'ステップ 3', stepCard3Title: '表示効果をプレビュー', stepCard3Desc: 'ステージを長押ししてTL表示と拡大時表示の変化を確認します。',
      stepCard4Badge: 'ステップ 4', stepCard4Title: 'PCからXに投稿', stepCard4Desc: '生成されたPNGを保存し、PCのウェブブラウザから x.com へ投稿してください。',
      secWhatIsTitle: 'Tap and Hold (タップ＆長押し / かくし絵) 画像とは？',
      secWhatIsDesc: 'Tap&Hold（かくし絵 / カクシエ）画像とは、X/Twitterのタイムライン上では白背景になじんで薄く見え、タップして拡大表示（黒背景）にすることでイラストの全貌が浮き出る透明PNG画像のことです。',
      secWhatIsWhyTitle: 'なぜ表示が変わるのか？（仕組みの解説）',
      secWhatIsWhyP1: 'Xはタイムライン上のサムネイル生成時、透明度を持つPNG画像の背景を「白」として合成処理します。本ツールはアルファ（透明度）値を精密計算し、白背景上では真っ白または薄い線画に見えるよう調整します。',
      secWhatIsWhyP2: '一方、タップして拡大ライトボックス表示にすると、Xは背景を「黒」でレンダリングします。透明ピクセルが黒背景と合わさることで、隠されていた本来のカラーイラストがクッキリ浮き上がります！',
      secWhatIsHowTitle: 'かくし絵画像の作り方手順',
      secWhatIsHowStep1: '1. 隠したい元のイラスト/写真をアップロード。',
      secWhatIsHowStep2: '2. キャンバス上でタップ前にうっすら見せておきたい部分をブラシで描画。',
      secWhatIsHowStep3: '3. 透明度補正や明るさ調整スライダーを微調整。',
      secWhatIsHowStep4: '4. 出力された透明PNGをダウンロード。',
      secWhatIsHowStep5: '5. PCのブラウザから x.com に投稿し、スマホでタップ動作をチェック！',
      secFaqTitle: 'よくある質問 (FAQ)', secFaqSubtitle: 'Xのタップ＆長押し隠し絵に関する疑問にお答えします。',
      faq1Q: 'Tap&Hold かくし絵メーカーとは何ですか？', faq1A: 'X/Twitterのタイムラインで薄く見え、タップ長押しでフルカラー表示される特殊な透明PNG画像を簡単に作成できる無料ブラウザツールです。',
      faq2Q: 'Xのスマホアプリから投稿しても大丈夫ですか？', faq2A: 'いいえ。スマホアプリから画像を投稿するとX側で自動的にJPEGへ変換され、透過データが失われて失敗します。必ずPCのWEBブラウザ(x.com)から投稿してください。',
      faq3Q: 'アップロードした画像はサーバーに送信されますか？', faq3A: 'いいえ。すべての画像処理はお使いのブラウザ内（HTML5 Canvas）で完結します。画像データが外部サーバーへ送信されることは一切ありません。',
      faq4Q: 'ライブプレビュー機能はどのように動きますか？', faq4A: 'ステージ上をマウスでクリック長押し（スマホではタッチ長押し）すると、背景色が「白（TL状態）」から「黒（全屏拡大状態）」に瞬時に切り替わり動作を確認できます。',
      footerDesc: 'X/Twitterのタップ＆長押し（かくし絵）透明PNG画像を作成できる無料オンラインツール。',
      footerHeaderProduct: 'プロダクト', footerHeaderResources: 'リソース', footerHeaderLegal: '利用規約・サポート',
      footerResourceWhatIs: 'タップ長押し（かくし絵）とは', footerResourceGuide: '隠し絵作成ガイド', footerResourceX: 'X かくし絵仕様',
      footerPrivacy: 'プライバシーポリシー', footerTerms: '利用規約', footerCoffee: '☕ 開発者を支援する (Coffee)',
      footerCopyright: '© 2026 Tap Hold & Kakushie Maker. All rights reserved.',
      footerClientSide: '🔒 100%ブラウザ内クライアント処理',
      modalPrivacyTitle: 'プライバシーポリシー',
      modalPrivacySec1Title: '1. ローカル処理について',
      modalPrivacySec1Text: '本ツールは画像の変換・合成処理を100%お客様のブラウザ内で行います。画像ファイルが外部サーバーへ送信・保存されることはありません。',
      modalPrivacySec2Title: '2. データ収集について',
      modalPrivacySec2Text: '個人を特定できる情報は収集いたしません。アクセス解析はサイトの利便性向上のためにのみ利用されます。',
      modalPrivacySec3Title: '3. 広告とクッキー',
      modalPrivacySec3Text: '当サイトでは第三者配信の広告サービスを利用する場合があります。',
      modalPrivacyCloseBtn: '閉じる',
      modalTermsTitle: '利用規約',
      modalTermsSec1Title: '1. 規約の同意',
      modalTermsSec1Text: '本サービスを利用することにより、本規約に同意したものとみなされます。',
      modalTermsSec2Title: '2. 許諾範囲',
      modalTermsSec2Text: '個人利用・商用利用を問わず自由にご利用いただけます。作成した画像の著作権は作成者に帰属します。',
      modalTermsSec3Title: '3. 免責事項',
      modalTermsSec3Text: '本サービスは現状有姿で提供されます。X（旧Twitter）の仕様変更等による影響について責任を負いません。',
      modalTermsCloseBtn: '同意する'
    },
    zh: {
      brandTitle: 'Tap&Hold 隐形图生成器',
      navTool: '工具', navFeatures: '功能特色', navHowItWorks: '使用方法', navWhatIs: '关于', navFaq: '常见问题',
      heroBadge1: '免费在线工具 — 无需注册',
      heroBadge2: '100% 隐私保护 — 图片不会离开您的浏览器',
      heroTitle1: 'Tap&Hold 隐形图生成器',
      heroTitle2: '在 X 时间线上隐藏图片',
      heroDesc: '将您的图片转换为透明 PNG，在 X/Twitter 时间线上显得淡隐，长按时即刻显现全彩效果。',
      btnStartCreating: '开始制作',
      btnHowItWorks: '工作原理',
      heroFeature1: '适用 x.com', heroFeature2: '32位 PNG 导出', heroFeature3: '移动端友好编辑器',
      demoTimeline: '时间线缩略图', demoFaint: '(淡隐 / 空白)', demoBeforeTap: '长按前',
      demoRevealed: '显影后图', demoFullColor: '(全彩原图)', demoAfterTap: '长按放大后',
      secToolTitle: '创建您的长按显影图片',
      secToolSubtitle: '按照以下4个简单步骤制作隐影效果。',
      step1Title: '选择一张图片',
      dropTitle: '拖放图片到此处',
      dropDesc: '或点击浏览。支持 JPG、PNG、WebP，最大40MB。',
      step2Title: '调整隐藏区域',
      step2Subtitle: '初始状态全部隐藏。使用画笔涂抹要在长按前显示的部分。',
      cardCanvasTitle: '编辑画布',
      maskOpacityLabel: '蒙版透明度',
      placeholderEdit: '请先在步骤1中上传图片',
      btnShowBeforeTap: '长按前显示',
      btnHideBeforeTap: '长按前隐藏',
      brushSizeLabel: '画笔大小',
      btnReset: '重置为隐藏',
      btnUndo: '撤销',
      cardOutputSizeTitle: '输出尺寸',
      outputSizeHint: '保持原始宽高比，自动调整。',
      cardAdjustmentsTitle: '图像调整',
      valBrightnessLabel: '亮度增强',
      brightnessHint: '调整像素亮度使色彩更鲜艳。',
      valAutoLineArtLabel: '自动线稿',
      autoLineArtHint: '自动检测图像轮廓生成线稿。',
      step3Title: '查看预览效果',
      placeholderOut: '长按预览区域模拟显影效果',
      stageOverlayText: '长按查看显影效果',
      stageInfoHint: '长按测试显影',
      step4Title: '导出下载',
      adviceLabel: '发布提示：',
      adviceText: '请仅在电脑端网页 x.com 上发布此图片。切勿使用手机 App。',
      btnExportText: '下载隐藏 PNG',
      secFeaturesTitle: '制作完美长按显影效果所需的一切功能',
      secFeaturesSubtitle: '精准匹配 X 平台图片渲染机制的精细化控制。',
      feature1Title: '支持各种图片格式', feature1Desc: '拖入 JPG、PNG 或 WebP 文件，工具会自动调整为 X/Twitter 时间线的最佳尺寸。',
      feature2Title: '绘制预显露区域', feature2Desc: '使用画笔标出要先呈现在缩略图中的部位，其余部分长按后揭晓。',
      feature3Title: '实时前后对比预览', feature3Desc: '在浏览器中以白底/黑底实时切换测试动态隐影效果。',
      feature4Title: '无损 PNG 导出', feature4Desc: '下载精细透明通道的高效 PNG 文件，完美兼容 X 平台。',
      feature5Title: '在 x.com 电脑端发布', feature5Desc: '请务必从电脑端网页浏览器上传。手机 App 会强行将图片转为 JPEG 导致效果失效。',
      feature6Title: '快速且完全私密', feature6Desc: '所有图片处理完全在本地浏览器中运行，绝对不会将图片上传至任何外部服务器。',
      secHowItWorksTitle: 'X 平台长按显影原理解析',
      secHowItWorksSubtitle: '只需4步即可生成长按显隐图。无需注册账号，绝无水印。',
      stepCard1Badge: '步骤 1', stepCard1Title: '上传原图', stepCard1Desc: '拖放任意 JPG 或 PNG 图，自动调整为适合 X 时间线的大小。',
      stepCard2Badge: '步骤 2', stepCard2Title: '绘制隐藏区域', stepCard2Desc: '涂抹选择要在长按放大前隐藏的图案区域。',
      stepCard3Badge: '步骤 3', stepCard3Title: '预览展示效果', stepCard3Desc: '长按预览舞台，比对时间线状态与点击放大后的视觉对比。',
      stepCard4Badge: '步骤 4', stepCard4Title: '在 X 电脑网页端发布', stepCard4Desc: '下载生成好的透明 PNG，打开电脑端 x.com 完成发帖。',
      secWhatIsTitle: '什么是长按显影 / Tap to Reveal 图片？',
      secWhatIsDesc: '长按显形图（在日本常称为 Kakushie / カクシエ / 隐形画）是一种利用透明 PNG 特性的特殊图片，在 X 时间线上呈白底淡色甚至空白，而在用户点击放大进入黑底全屏模式时，瞬间展现全彩图案。',
      secWhatIsWhyTitle: '原理解析：为什么背景会变化？',
      secWhatIsWhyP1: 'X 在时间线中展示透明 PNG 时，会自动将背景填充为纯白色。本工具通过精准计算像素透明度 (Alpha)，使图像在白色背景叠加下与白底同色或仅留极淡轮廓。',
      secWhatIsWhyP2: '而当用户点击图片进入全屏模式时，X 会将背景切换为纯黑色。原本半透明的像素在黑色背景下被激活，原本隐没的鲜艳色彩瞬间精彩呈现！',
      secWhatIsHowTitle: '如何制作一张长按显影图片',
      secWhatIsHowStep1: '1. 上传想要隐影的原图。',
      secWhatIsHowStep2: '2. 在编辑画布上涂抹，保留长按前想要微露的部位。',
      secWhatIsHowStep3: '3. 调整淡化程度和亮度增强滑块。',
      secWhatIsHowStep4: '4. 点击导出下载透明 PNG 文件。',
      secWhatIsHowStep5: '5. 从电脑浏览器登录 x.com 发布，并在手机端长按测试魔法！',
      secFaqTitle: '常见问题解答', secFaqSubtitle: '关于 X 平台长按显形图的常见疑问解答。',
      faq1Q: '什么是 Tap&Hold 隐形图生成器？', faq1A: '这是一款免费在线浏览器工具，能将图片制作成在 X/Twitter 时间线上隐形/淡化、长按放大时瞬间呈现原图全彩效果的特殊透明 PNG。',
      faq2Q: '可以用手机 X 客户端 App 发帖吗？', faq2A: '不可以。手机 App 在发图时会自动将其转码压缩为 JPEG 格式，这会彻底破坏透明通道导致隐影失效。请务必使用电脑端浏览器登录 x.com 发帖。',
      faq3Q: '我的图片会被上传到服务器吗？', faq3A: '绝对不会。所有图像合成与 PNG 编码均使用您本地浏览器的 HTML5 Canvas 技术处理，您的照片绝不会离开您的设备。',
      faq4Q: '实时效果预览是如何工作的？', faq4A: '按住舞台区域（或手机触摸长按）时，背景会即时从白色（时间线视图）切换为黑色（全屏放大视图），方便您直观检验显影效果。',
      footerDesc: '免费在线 X/Twitter 长按显形透明 PNG 隐图生成器。',
      footerHeaderProduct: '产品', footerHeaderResources: '资源', footerHeaderLegal: '法律与支持',
      footerResourceWhatIs: '什么是长按显影', footerResourceGuide: '长按显影制作指南', footerResourceX: 'X 平台隐形图',
      footerPrivacy: '隐私政策', footerTerms: '服务条款', footerCoffee: '☕ 请作者喝杯咖啡',
      footerCopyright: '© 2026 Tap Hold & Kakushie Maker. 保留所有权利.',
      footerClientSide: '🔒 100% 浏览器本地安全处理',
      modalPrivacyTitle: '隐私政策',
      modalPrivacySec1Title: '1. 本地客户端处理',
      modalPrivacySec1Text: 'Tap&Hold Kakushie Maker 100% 在您的浏览器本地处理所有图片，绝对不会将您的照片传输或存储在任何外部服务器上。',
      modalPrivacySec2Title: '2. 数据收集',
      modalPrivacySec2Text: '我们不收集任何个人身份信息。标准网页统计仅用于优化网站性能。',
      modalPrivacySec3Title: '3. 广告与 Cookies',
      modalPrivacySec3Text: '本网站可能展示第三方广告服务。',
      modalPrivacyCloseBtn: '知道了',
      modalTermsTitle: '服务条款',
      modalTermsSec1Title: '1. 接受条款',
      modalTermsSec1Text: '访问和使用本工具即表示您同意遵守本服务条款。',
      modalTermsSec2Title: '2. 允许用途',
      modalTermsSec2Text: '您可以自由将本工具用于个人或商业图像制作。您保留处理后图片的完整版权。',
      modalTermsSec3Title: '3. 免责声明',
      modalTermsSec3Text: '本服务按“原样”提供。我们对 X 平台政策或渲染规则的变化概不负责。',
      modalTermsCloseBtn: '同意'
    },
    ko: {
      brandTitle: 'Tap&Hold 카쿠시에 생성기',
      navTool: '툴', navFeatures: '특징', navHowItWorks: '사용법', navWhatIs: '소개', navFaq: '자주 묻는 질문',
      heroBadge1: '무료 온라인 툴 — 가입 필요 없음',
      heroBadge2: '100% 프라이버시 — 사진이 브라우저 밖으로 나가지 않습니다',
      heroTitle1: 'Tap&Hold 카쿠시에 이미지 생성기',
      heroTitle2: 'X 타임라인에서 이미지를 감추기',
      heroDesc: '이미지를 투명 PNG로 변환하여 X/Twitter 타임라인에서는 희미하게 보이고 탭하여 누르고 있으면 원본 색상이 나타납니다.',
      btnStartCreating: '만들기 시작',
      btnHowItWorks: '작동 방식',
      heroFeature1: 'x.com 지원', heroFeature2: '32비트 PNG 내보내기', heroFeature3: '모바일 지원 에디터',
      demoTimeline: '타임라인 썸네일', demoFaint: '(희미함 / 빈칸)', demoBeforeTap: '탭 전',
      demoRevealed: '공개된 이미지', demoFullColor: '(풀 컬러)', demoAfterTap: '탭 & 누른 후',
      secToolTitle: '탭 반응 숨김 이미지 만들기',
      secToolSubtitle: '아래 4개 단계로 손쉽게 만드세요.',
      step1Title: '이미지 선택',
      dropTitle: '이미지를 여기에 드래그하세요',
      dropDesc: '또는 클릭하여 선택. JPG, PNG, WebP 최대 40MB 지원.',
      step2Title: '숨김 영역 조절',
      step2Subtitle: '처음에는 전체가 숨겨집니다. 탭 전에 보이고 싶은 영역을 브러시로 칠하세요.',
      cardCanvasTitle: '편집 캔버스',
      maskOpacityLabel: '마스크 불투명도',
      placeholderEdit: '1단계에서 이미지를 업로드하세요',
      btnShowBeforeTap: '탭 전 표시',
      btnHideBeforeTap: '탭 전 숨김',
      brushSizeLabel: '브러시 크기',
      btnReset: '초기화',
      btnUndo: '되돌리기',
      cardOutputSizeTitle: '출력 크기',
      outputSizeHint: '원본 비율 유지.',
      cardAdjustmentsTitle: '이미지 보정',
      valBrightnessLabel: '밝기 보정',
      brightnessHint: '픽셀 밝기를 조절합니다.',
      valAutoLineArtLabel: '자동 선화 추출',
      autoLineArtHint: '윤곽선을 자동으로 추출합니다.',
      step3Title: '미리보기 확인',
      placeholderOut: '화면을 꾹 눌러 미리보기를 테스트하세요',
      stageOverlayText: '꾹 눌러서 마법을 확인하세요',
      stageInfoHint: '꾹 눌러 테스트',
      step4Title: '내보내기',
      adviceLabel: '게시 권장사항:',
      adviceText: '반드시 데스크톱 웹 브라우저(x.com)에서 업로드하세요.',
      btnExportText: '숨김 PNG 다운로드',
      secFeaturesTitle: '완벽한 탭 감추기 공개를 위한 모든 기능',
      secFeaturesSubtitle: 'X의 실제 이미지 렌더링 방식에 맞춘 컨트롤.',
      feature1Title: '모든 이미지 업로드', feature1Desc: 'JPG, PNG, WebP 파일을 업로드하세요. X 타임라인 최적 크기로 자동 조정됩니다.',
      feature2Title: '미리 보여줄 영역 그리기', feature2Desc: '브러시 툴로 썸네일에 나타날 영역을 지정하세요. 나머지는 탭할 때 표시됩니다.',
      feature3Title: '실시간 전/후 미리보기', feature3Desc: '브라우저에서 실시간 배경 전환으로 미리 테스트해보세요.',
      feature4Title: '무손실 PNG 내보내기', feature4Desc: 'X에서 정상 처리되는 32비트 알파 채널 투명 PNG를 다운로드하세요.',
      feature5Title: 'x.com 데스크톱에서 게시', feature5Desc: '데스크톱 웹 브라우저에서 업로드하세요. 모바일 앱은 JPEG로 변환되어 효과가 깨집니다.',
      feature6Title: '빠르고 안전한 프라이버시', feature6Desc: '모든 이미지 처리는 브라우저 내부에서만 이루어집니다. 외부 서버로 전송되지 않습니다.',
      secHowItWorksTitle: 'X 탭 & 누르기 트릭 작동 방식',
      secHowItWorksSubtitle: '계정 생성이나 워터마크 없이 4단계로 만드세요.',
      stepCard1Badge: '1단계', stepCard1Title: '이미지 업로드', stepCard1Desc: 'JPG 또는 PNG를 드래그하세요. X 썸네일에 맞게 자동 조율됩니다.',
      stepCard2Badge: '2단계', stepCard2Title: '숨길 영역 칠하기', stepCard2Desc: '탭하여 확대할 때까지 숨겨둘 부분을 선택하세요.',
      stepCard3Badge: '3단계', stepCard3Title: '효과 미리보기', stepCard3Desc: '스테이지를 꾹 눌러 타임라인 상태와 확대 상태를 테스트하세요.',
      stepCard4Badge: '4단계', stepCard4Title: 'PC에서 X에 게시', stepCard4Desc: '투명 PNG를 다운로드한 후 PC 웹 브라우저에서 x.com에 업로드하세요.',
      secWhatIsTitle: 'Tap and Hold / 탭 반응 숨김 이미지란?',
      secWhatIsDesc: 'Tap and Hold 이미지(일본어: Kakushie, カクシエ)는 X 타임라인(흰색 배경)에서는 희미하게 보이지만, 클릭하여 확대(검은색 배경)하면 숨겨진 전체 그림이 선명하게 나타나는 투명 PNG 이미지입니다.',
      secWhatIsWhyTitle: '이 트릭이 작동하는 원리는?',
      secWhatIsWhyP1: 'X는 타임라인 썸네일에서 투명 PNG의 배경을 흰색으로 처리합니다. 이 툴은 알파(투명도) 값을 조정하여 흰색 배경에서 흐릿하거나 빈 화면처럼 보이게 만듭니다.',
      secWhatIsWhyP2: '사용자가 탭하여 전체 화면으로 확대하면 X는 배경을 검은색으로 변경합니다. 이 때 투명했던 알파 피셀이 검은 배경과 대비를 이루며 숨겨진 원본 색상이 선명히 드러납니다!',
      secWhatIsHowTitle: '탭 반응 숨김 이미지 만드는 방법',
      secWhatIsHowStep1: '1. 숨기고 싶은 원본 이미지를 업로드합니다.',
      secWhatIsHowStep2: '2. 캔버스에서 탭 전에 보여줄 영역을 칠합니다.',
      secWhatIsHowStep3: '3. 희미함 및 밝기 조절 슬라이더를 맞춥니다.',
      secWhatIsHowStep4: '4. 투명 PNG 파일을 다운로드합니다.',
      secWhatIsHowStep5: '5. PC 브라우저에서 x.com에 업로드한 후 모바일에서 탭 테스트를 해보세요.',
      secFaqTitle: '자주 묻는 질문', secFaqSubtitle: 'X 탭 감추기 이미지에 대한 궁금증을 해결하세요.',
      faq1Q: 'Tap&Hold 카쿠시에 생성기란 무엇인가요?', faq1A: 'X 타임라인에서는 희미하게 보이고, 탭하여 누르고 있으면 원래 색상이 공개되는 투명 PNG를 생성해주는 무료 온라인 툴입니다.',
      faq2Q: '모바일 X 앱에서 이미지를 게시해도 되나요?', faq2A: '아니요. 모바일 X 앱은 이미지를 JPEG로 재인코딩하여 투명도가 사라지고 효과가 깨집니다. 반드시 데스크톱 웹 브라우저(x.com)에서 업로드하세요.',
      faq3Q: '내 이미지가 서버에 업로드되나요?', faq3A: '아니요. 모든 처리는 HTML5 Canvas를 통해 브라우저 내부에서만 수행됩니다. 사진은 컴퓨터 바깥으로 나가지 않습니다.',
      faq4Q: '실시간 미리보기는 어떻게 작동하나요?', faq4A: '미리보기 영역을 마우스로 클릭하여 꾹 누르면 배경이 흰색(타임라인)에서 검은색(확대)으로 즉시 전환되어 테스트할 수 있습니다.',
      footerDesc: 'X 탭 반응 투명 PNG 숨김 이미지 무료 온라인 생성기.',
      footerHeaderProduct: '프로덕트', footerHeaderResources: '리소스', footerHeaderLegal: '법적 공지 및 지원',
      footerResourceWhatIs: '탭 홀드란 무엇인가', footerResourceGuide: '탭 공개 가이드', footerResourceX: 'X 탭 앤 홀드',
      footerPrivacy: '개인정보 처리방침', footerTerms: '이용약관', footerCoffee: '☕ 커피 한 잔 후원하기',
      footerCopyright: '© 2026 Tap Hold & Kakushie Maker. All rights reserved.',
      footerClientSide: '🔒 100% 브라우저 클라이언트 로컬 처리',
      modalPrivacyTitle: '개인정보 처리방침',
      modalPrivacySec1Title: '1. 클라이언트 로컬 처리',
      modalPrivacySec1Text: 'Tap&Hold Kakushie Maker는 모든 이미지 처리를 100% 브라우저 내부에서만 수행합니다. 사용자의 파일은 외부 서버로 전송되지 않습니다.',
      modalPrivacySec2Title: '2. 데이터 수집',
      modalPrivacySec2Text: '개인 식별 정보를 수집하지 않습니다. 웹 분석 정보는 사이트 최적화 용도로만 사용됩니다.',
      modalPrivacySec3Title: '3. 광고 및 쿠키',
      modalPrivacySec3Text: '본 사이트는 제3자 광고를 게재할 수 있습니다.',
      modalPrivacyCloseBtn: '확인',
      modalTermsTitle: '이용약관',
      modalTermsSec1Title: '1. 약관 동의',
      modalTermsSec1Text: '본 서비스를 이용함으로써 이용약관에 동의하게 됩니다.',
      modalTermsSec2Title: '2. 사용 허용',
      modalTermsSec2Text: '개인적 및 상업적 용도로 자유롭게 사용하실 수 있습니다.',
      modalTermsSec3Title: '3. 면책 조항',
      modalTermsSec3Text: '본 서비스는 있는 그대로 제공됩니다. X 플랫폼의 정책 변경에 대해 책임을 지지 않습니다.',
      modalTermsCloseBtn: '동의함'
    },
    ar: {
      brandTitle: 'صانع Tap&Hold المخفي',
      navTool: 'الأداة', navFeatures: 'المميزات', navHowItWorks: 'كيف يعمل', navWhatIs: 'ما هو', navFaq: 'الأسئلة الشائعة',
      heroBadge1: 'أداة مجانية عبر الإنترنت — لا تتطلب التسجيل',
      heroBadge2: '100% خاص — الصور لا تغادر متصفحك أبداً',
      heroTitle1: 'صانع صور Tap&Hold المخفية',
      heroTitle2: 'إخفاء الصور في جدول X',
      heroDesc: 'تحول صورتك إلى PNG شفاف يظهر باهتاً في جدول X/Twitter ويظهر بألوانه الكاملة عند الضغط والمطولة.',
      btnStartCreating: 'ابدأ الإنشاء',
      btnHowItWorks: 'كيف يعمل',
      heroFeature1: 'يعمل على x.com', heroFeature2: 'تصدير PNG بـ 32 بت', heroFeature3: 'محرر متوافق مع الهواتف',
      demoTimeline: 'مصغرة الجدول الزمني', demoFaint: '(باهت / فارغ)', demoBeforeTap: 'قبل الضغط',
      demoRevealed: 'الصورة المعروضة', demoFullColor: '(ألوان كاملة)', demoAfterTap: 'بعد الضغط المطول',
      secToolTitle: 'أنشئ صورتك المخفية',
      secToolSubtitle: 'اتبع الخطوات الأربع البسيطة أدناه.',
      step1Title: 'اختر صورة',
      dropTitle: 'أسقط صورتك هنا',
      dropDesc: 'و انقر للتصفح. يدعم JPG, PNG, WebP حتى 40MB.',
      step2Title: 'ضبط طريقة الإخفاء',
      step2Subtitle: 'في البداية تكون الصورة مخفية. ارسم الفرشاة على المناطق التي تريد إظهارها قبل الضغط.',
      cardCanvasTitle: 'لوحة التحرير',
      maskOpacityLabel: 'شفافية القناع',
      placeholderEdit: 'قم بتحميل صورة في الخطوة 1 للبدء',
      btnShowBeforeTap: 'إظهار قبل الضغط',
      btnHideBeforeTap: 'إخفاء قبل الضغط',
      brushSizeLabel: 'حجم الفرشاة',
      btnReset: 'إعادة ضبط إلى مخفي',
      btnUndo: 'تراجع',
      cardOutputSizeTitle: 'حجم المخرجات',
      outputSizeHint: 'يحافظ على النسبة الأصلية.',
      cardAdjustmentsTitle: 'تعديلات الصورة',
      valBrightnessLabel: 'تعزيز السطوع',
      brightnessHint: 'تعديل سطوع البكسلات.',
      valAutoLineArtLabel: 'خطوط الرسم التلقائية',
      autoLineArtHint: 'يكتشف الحدود تلقائياً.',
      step3Title: 'معاينة النتيجة',
      placeholderOut: 'اضغط مع الاستمرار لمعاينة النتيجة',
      stageOverlayText: 'اضغط واستمر لرؤية السحر',
      stageInfoHint: 'استمر في الضغط للاختبار',
      step4Title: 'تصدير',
      adviceLabel: 'نصيحة النشر:',
      adviceText: 'انشر هذه الصورة على x.com فقط من متصفح الكمبيوتر.',
      btnExportText: 'تحميل صورة PNG المخفية',
      secFeaturesTitle: 'كل ما تحتاجه لإظهار الصورة المخفية بشكل مثالي',
      secFeaturesSubtitle: 'مجموعة أدوات دقيقة تتوافق مع كيفية عرض X للصور.',
      feature1Title: 'تحميل أي صورة', feature1Desc: 'أسقط ملف JPG أو PNG أو WebP. تقوم الأداة بتنسيقه تلقائياً لأبعاد X المناسبة.',
      feature2Title: 'ارسم ما يظل مرئياً', feature2Desc: 'استخدم الفرشاة تحديد المناطق التي تظهر في المصغرة.',
      feature3Title: 'معاينة مباشرة قبل وبعد', feature3Desc: 'اختبر التحول في متصفحك مباشرة مع تبديل الخلفية في الوقت الفعلي.',
      feature4Title: 'تصدير PNG بدون فقدان للجودة', feature4Desc: 'قم بتنزيل صورة PNG شفافة بحجم خفيف ودقة 32 بت.',
      feature5Title: 'النشر على x.com', feature5Desc: 'قم بتحميل الملف المصدّر من متصفح الكمبيوتر. تطبيقات الهواتف تحول الصور إلى JPEG.',
      feature6Title: 'خاص وسريع', feature6Desc: 'يتم كل معالجة الصور محلياً داخل متصفحك. لا يتم تحميل أي شيء إلى خوادم خارجية.',
      secHowItWorksTitle: 'كيف تعمل خدعة الضغط المطول في X',
      secHowItWorksSubtitle: 'أنشئ صورتك المخفية في 4 خطوات بسيطة. بدون حساب، بدون علامة مائية.',
      stepCard1Badge: 'الخطوة 1', stepCard1Title: 'تحميل صورتك', stepCard1Desc: 'أسقط أي صورة JPG أو PNG. نسقها لأبعاد X المناسبة.',
      stepCard2Badge: 'الخطوة 2', stepCard2Title: 'رسم ما تريد إخفاءه', stepCard2Desc: 'حدد المناطق التي تريد إبقاءها سرية حتى التكبير.',
      stepCard3Badge: 'الخطوة 3', stepCard3Title: 'معاينة التأثير', stepCard3Desc: 'اضغط مع الاستمرار لمعاينة شكل الجدول الزمني مقابل العرض المكبر.',
      stepCard4Badge: 'الخطوة 4', stepCard4Title: 'النشر على X من الكمبيوتر', stepCard4Desc: 'قم بتنزيل ملف PNG الشفاف ورفعه على x.com من متصفح الكمبيوتر.',
      secWhatIsTitle: 'ما هي صورة Tap and Hold / الضغط والتعرية؟',
      secWhatIsDesc: 'صورة Tap and Hold (تسمى أيضاً kakushie أو الصورة المخفية في X) هي صورة PNG شفافة تظهر باهتة في الجدول الزمني وتكشف عن مظهرها الكامل عند الضغط عليها لتكبيرها.',
      secWhatIsWhyTitle: 'لماذا تعمل هذه الخدعة؟',
      secWhatIsWhyP1: 'ينشئ X مصغرة بخلفية بيضاء للصور الشفافة. تضبط هذه الأداة قيم الشفافية لتظهر باهتة.',
      secWhatIsWhyP2: 'عند الضغط للتكبير، يعرض X الصورة على خلفية سوداء. فتظهر الألوان الأصلية وتتضح الصورة المخفية!',
      secWhatIsHowTitle: 'كيفية إنشاء صورة مخفية',
      secWhatIsHowStep1: '1. تحميل الصورة التي تريد إخفاءها.',
      secWhatIsHowStep2: '2. رسم المناطق على اللوحة لاختيار ما يظهر قبل الضغط.',
      secWhatIsHowStep3: '3. ضبط شريط التعتيم والسطوع.',
      secWhatIsHowStep4: '4. تنزيل ملف PNG الشفاف.',
      secWhatIsHowStep5: '5. انشر الصورة على x.com من متصفح الكمبيوتر واختبرها.',
      secFaqTitle: 'الأسئلة الشائعة', secFaqSubtitle: 'إجابات سريعة حول صور الضغط والتعرية على X.',
      faq1Q: 'ما هو صانع صور Tap Hold؟', faq1A: 'هي أداة مجانية في المتصفح تُنشئ صور PNG شفافة تظهر باهتة في جدول X وتظهر كاملة عند الضغط المطول.',
      faq2Q: 'هل يمكنني نشر الصورة من تطبيق الهواتف لـ X؟', faq2A: 'لا. يقوم تطبيق الهواتف بإعادة ترميز الصورة إلى JPEG مما يلغي الشفافية. ينبغي دائماً النشر من متصفح الكمبيوتر على x.com.',
      faq3Q: 'هل يتم تحميل صورني إلى خادم؟', faq3A: 'لا. تتم كل المعالجة محلياً في متصفحك عبر HTML5 Canvas. لا تغادر صورتك جهازك أبداً.',
      faq4Q: 'كيف تعمل المعاينة المباشرة؟', faq4A: 'تتيح لك اللوحة الضغط مع الاستمرار بالماوس أو الشاشة باللمس لتبديل الخلفية فوراً بين الأبيض (الجدول) والأسود (المكبر).',
      footerDesc: 'صانع مجاني عبر الإنترنت لصور PNG الشفافة القابلة للكشف عند الضغط على X.',
      footerHeaderProduct: 'المنتج', footerHeaderResources: 'الموارد', footerHeaderLegal: 'القانونية والدعم',
      footerResourceWhatIs: 'ما هو Tap Hold', footerResourceGuide: 'دليل الضغط والكشف', footerResourceX: 'خدعة X Tap and hold',
      footerPrivacy: 'سياسة الخصوصية', footerTerms: 'شروط الخدمة', footerCoffee: '☕ اشترِ لي قهوة',
      footerCopyright: '© 2026 Tap Hold & Kakushie Maker. جميع الحقوق محفوظة.',
      footerClientSide: '🔒 معالجة 100% داخل المتصفح المحلي',
      modalPrivacyTitle: 'سياسة الخصوصية',
      modalPrivacySec1Title: '1. المعالجة المحلية',
      modalPrivacySec1Text: 'تعالج هذه الأداة جميع الصور محلياً داخل متصفحك. لا يتم تحميل ملفاتك أو تخزينها على خوادم خارجية.',
      modalPrivacySec2Title: '2. جمع البيانات',
      modalPrivacySec2Text: 'لا نجمع أي معلومات شخصية.',
      modalPrivacySec3Title: '3. الإعلانات والملفات',
      modalPrivacySec3Text: 'قد يعرض هذا التطبيق إعلانات من أطراف خارجية.',
      modalPrivacyCloseBtn: 'فهمت',
      modalTermsTitle: 'شروط الخدمة',
      modalTermsSec1Title: '1. قبول الشروط',
      modalTermsSec1Text: 'باستخدام هذه الأداة، فإنك توافق على الالتزام بشروط الخدمة هذه.',
      modalTermsSec2Title: '2. الاستخدام المسموح',
      modalTermsSec2Text: 'يحق لك استخدام هذه الأداة للأغراض الشخصية والتجارية.',
      modalTermsSec3Title: '3. إخلاء المسؤولية',
      modalTermsSec3Text: 'يتم تقديم الخدمة "كما هي". لسنا مسؤولين عن أي تغييرات في سياسات منصة X.',
      modalTermsCloseBtn: 'أوافق'
    }
  };

  function detectSystemLanguage() {
    try {
      const savedLang = localStorage.getItem('preferred_lang');
      if (savedLang && translations[savedLang]) {
        return savedLang;
      }
    } catch (e) {
      console.warn('localStorage access failed:', e);
    }

    const candidateLangs = [];
    if (navigator.language) candidateLangs.push(navigator.language);
    if (Array.isArray(navigator.languages)) candidateLangs.push(...navigator.languages);

    const supportedLangs = ['en', 'es', 'fr', 'pt', 'ja', 'zh', 'ko', 'ar'];

    for (const langStr of candidateLangs) {
      if (!langStr) continue;
      const code = langStr.toLowerCase().split('-')[0];
      if (supportedLangs.includes(code)) {
        return code;
      }
    }

    return 'en';
  }

  function applyThemeMode(theme) {
    try {
      localStorage.setItem('preferred_theme', theme);
    } catch (e) {}

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

  function detectSystemTheme() {
    try {
      const savedTheme = localStorage.getItem('preferred_theme');
      if (savedTheme) return savedTheme;
    } catch (e) {}
    return 'system';
  }

  function applyLanguage(lang) {
    const t = translations[lang] || translations.en;
    
    try {
      localStorage.setItem('preferred_lang', lang);
    } catch (e) {}

    optLangs.forEach(opt => {
      const l = opt.getAttribute('data-lang');
      const check = opt.querySelector('.check-lang');
      if (l === lang) {
        opt.classList.add('active', 'text-brand-600', 'font-bold');
        if (check) check.classList.remove('hidden');
      } else {
        opt.classList.remove('active', 'text-brand-600', 'font-bold');
        if (check) check.classList.add('hidden');
      }
    });

    document.documentElement.lang = lang;
    document.documentElement.dir = (lang === 'ar') ? 'rtl' : 'ltr';

    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (t[key] !== undefined) {
        if (el.getAttribute('data-i18n-html') === 'true') {
          el.innerHTML = t[key];
        } else {
          el.textContent = t[key];
        }
      }
    });
  }

  // --- Initial System Setup on Load ---
  const initialSystemLang = detectSystemLanguage();
  applyLanguage(initialSystemLang);

  const initialSystemTheme = detectSystemTheme();
  applyThemeMode(initialSystemTheme);

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
