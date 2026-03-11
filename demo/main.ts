/**
 * Demo page for magic-webp
 * Uses Web Worker for background processing to keep UI responsive
 */

// Create worker for background processing
const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });

console.log("[demo] Worker created");

// Auto-load default image on page load
window.addEventListener('DOMContentLoaded', async () => {
  try {
    const response = await fetch('./giphy.webp');
    const blob = await response.blob();
    const file = new File([blob], 'giphy.webp', { type: 'image/webp' });
    loadFile(file);
  } catch (e) {
    console.error('[demo] Failed to load default image:', e);
  }
});

// ── DOM refs ──────────────────────────────────────────────────────────────
const uploadArea = document.getElementById("uploadArea") as HTMLDivElement;
const fileInput = document.getElementById("fileInput") as HTMLInputElement;
const btnCropCenter = document.getElementById("btnCropCenter") as HTMLButtonElement;
const btnResize400 = document.getElementById("btnResize400") as HTMLButtonElement;
const btnResizeFit300 = document.getElementById("btnResizeFit300") as HTMLButtonElement;
const btnCrop = document.getElementById("btnCrop") as HTMLButtonElement;
const btnResize = document.getElementById("btnResize") as HTMLButtonElement;
const btnResizeFit = document.getElementById("btnResizeFit") as HTMLButtonElement;
const origImg = document.getElementById("origImg") as HTMLImageElement;
const resultImg = document.getElementById("resultImg") as HTMLImageElement;
const origInfo = document.getElementById("origInfo") as HTMLDivElement;
const resultInfo = document.getElementById("resultInfo") as HTMLDivElement;
const statusContainer = document.getElementById("statusContainer") as HTMLDivElement;
const dlLink = document.getElementById("dlLink") as HTMLAnchorElement;

// ── State ─────────────────────────────────────────────────────────────────
let originalData: Uint8Array | null = null;  // Оригинальные данные WebP
let originalWidth = 0;
let originalHeight = 0;
let prevObjectURL = "";
let isProcessing = false;

// ── Worker message handler ────────────────────────────────────────────────
worker.onmessage = (e) => {
  const msg = e.data;

  if (msg.type === 'loaded') {
    originalWidth = msg.width;
    originalHeight = msg.height;
    const currentSize = origInfo.textContent || '';
    origInfo.textContent = `${msg.width} × ${msg.height} px | ${currentSize}`;
    setStatus(`✓ Image loaded: ${msg.width}×${msg.height} px`, "ok");
    isProcessing = false;
    enableButtons(true);
  } else if (msg.type === 'result') {
    showResult(msg.data, msg.width, msg.height, msg.operation);
    isProcessing = false;
  } else if (msg.type === 'error') {
    setStatus(msg.message, "error");
    isProcessing = false;
    enableButtons(true);
  }
};

worker.onerror = (error) => {
  console.error('[demo] Worker error:', error);
  setStatus('Worker error: ' + error.message, 'error');
  isProcessing = false;
  enableButtons(true);
};

// ── Helpers ───────────────────────────────────────────────────────────────
function setStatus(msg: string, kind: "ok" | "error" | "" = "") {
  if (msg) {
    statusContainer.innerHTML = `<div class="status ${kind}">${msg}</div>`;
  } else {
    statusContainer.innerHTML = '';
  }
}

function kb(bytes: number) {
  return (bytes / 1024).toFixed(2) + " KB";
}

function enableButtons(enabled: boolean) {
  btnCropCenter.disabled = !enabled;
  btnResize400.disabled = !enabled;
  btnResizeFit300.disabled = !enabled;
  btnCrop.disabled = !enabled;
  btnResize.disabled = !enabled;
  btnResizeFit.disabled = !enabled;
}

function showResult(data: Uint8Array, width: number, height: number, operation: string) {
  const blob = new Blob([data], { type: 'image/webp' });

  // Revoke previous URL to avoid memory leaks
  if (prevObjectURL) URL.revokeObjectURL(prevObjectURL);
  prevObjectURL = URL.createObjectURL(blob);

  resultImg.src = prevObjectURL;
  resultImg.style.display = 'block';
  resultInfo.textContent = `${width} × ${height} px | Size: ${kb(blob.size)}`;

  dlLink.href = prevObjectURL;
  dlLink.download = `magic-webp-${operation}.webp`;
  dlLink.style.display = "inline-block";

  setStatus(`✓ ${operation} complete → ${width}×${height} px, ${kb(blob.size)}`, "ok");
}

// ── Drag & Drop ───────────────────────────────────────────────────────────
uploadArea.addEventListener('click', () => fileInput.click());

uploadArea.addEventListener('dragover', (e) => {
  e.preventDefault();
  uploadArea.classList.add('dragover');
});

uploadArea.addEventListener('dragleave', () => {
  uploadArea.classList.remove('dragover');
});

uploadArea.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadArea.classList.remove('dragover');
  const file = e.dataTransfer?.files[0];
  if (file && file.type === 'image/webp') {
    loadFile(file);
  } else {
    setStatus('Please drop a WebP file', 'error');
  }
});

fileInput.addEventListener('change', (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file) {
    loadFile(file);
  }
});

// ── File load ─────────────────────────────────────────────────────────────
async function loadFile(file: File) {
  if (isProcessing) {
    setStatus("Please wait, processing...", "error");
    return;
  }

  setStatus("Loading…");
  isProcessing = true;
  enableButtons(false);

  try {
    console.log("[demo] Loading file:", file.name);

    // Read file as ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();
    originalData = new Uint8Array(arrayBuffer);

    // Show original image
    origImg.src = URL.createObjectURL(file);
    origImg.style.display = 'block';
    origInfo.textContent = `Size: ${kb(file.size)}`;

    // Clear result
    resultImg.src = "";
    resultImg.style.display = 'none';
    resultInfo.textContent = "";
    dlLink.style.display = "none";

    // Send to worker for processing
    worker.postMessage({
      type: 'load',
      data: originalData
    });

  } catch (e) {
    console.error("[demo] Error loading file:", e);
    setStatus(String(e), "error");
    isProcessing = false;
  }
}

// ── Quick Actions ───────────────────────────────────────────────────────────
btnCropCenter.addEventListener("click", () => {
  if (!originalData || !originalWidth || !originalHeight) {
    setStatus("Load an image first.", "error");
    return;
  }
  if (isProcessing) {
    setStatus("Please wait, processing...", "error");
    return;
  }

  // Crop 200x200 from center
  const x = Math.max(0, Math.floor((originalWidth - 200) / 2));
  const y = Math.max(0, Math.floor((originalHeight - 200) / 2));

  setStatus("Cropping center 200×200…");
  isProcessing = true;

  worker.postMessage({
    type: 'crop',
    x, y, width: 200, height: 200
  });
});

btnResize400.addEventListener("click", () => {
  if (!originalData) {
    setStatus("Load an image first.", "error");
    return;
  }
  if (isProcessing) {
    setStatus("Please wait, processing...", "error");
    return;
  }

  setStatus("Resizing to 400×400 (cover mode)…");
  isProcessing = true;

  worker.postMessage({
    type: 'resize',
    width: 400,
    height: 400,
    mode: 'cover'
  });
});

btnResizeFit300.addEventListener("click", () => {
  if (!originalData) {
    setStatus("Load an image first.", "error");
    return;
  }
  if (isProcessing) {
    setStatus("Please wait, processing...", "error");
    return;
  }

  setStatus("Resizing to fit 300×300 (contain mode)…");
  isProcessing = true;

  worker.postMessage({
    type: 'resize',
    width: 300,
    height: 300,
    mode: 'contain'
  });
});

// ── Advanced Crop ──────────────────────────────────────────────────────────
btnCrop.addEventListener("click", () => {
  if (!originalData) {
    setStatus("Load an image first.", "error");
    return;
  }
  if (isProcessing) {
    setStatus("Please wait, processing...", "error");
    return;
  }

  const x = parseInt((document.getElementById("cropX") as HTMLInputElement).value);
  const y = parseInt((document.getElementById("cropY") as HTMLInputElement).value);
  const w = parseInt((document.getElementById("cropW") as HTMLInputElement).value);
  const h = parseInt((document.getElementById("cropH") as HTMLInputElement).value);

  setStatus("Cropping in background…");
  isProcessing = true;

  worker.postMessage({
    type: 'crop',
    x, y, width: w, height: h
  });
});

// ── Resize (cover mode) ───────────────────────────────────────────────────
btnResize.addEventListener("click", () => {
  if (!originalData) {
    setStatus("Load an image first.", "error");
    return;
  }
  if (isProcessing) {
    setStatus("Please wait, processing...", "error");
    return;
  }

  const w = parseInt((document.getElementById("resizeW") as HTMLInputElement).value);
  const h = parseInt((document.getElementById("resizeH") as HTMLInputElement).value);

  setStatus("Resizing (cover mode) in background…");
  isProcessing = true;

  worker.postMessage({
    type: 'resize',
    width: w,
    height: h,
    mode: 'cover'
  });
});

// ── Resize (contain mode) ─────────────────────────────────────────────────
btnResizeFit.addEventListener("click", () => {
  if (!originalData) {
    setStatus("Load an image first.", "error");
    return;
  }
  if (isProcessing) {
    setStatus("Please wait, processing...", "error");
    return;
  }

  const w = parseInt((document.getElementById("resizeW") as HTMLInputElement).value);
  const h = parseInt((document.getElementById("resizeH") as HTMLInputElement).value);

  setStatus("Resizing (contain mode) in background…");
  isProcessing = true;

  worker.postMessage({
    type: 'resize',
    width: w,
    height: h,
    mode: 'contain'
  });
});



