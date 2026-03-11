import { MagicWebp } from "../src-js/index.js";

// ── DOM refs ──────────────────────────────────────────────────────────────
const fileInput   = document.getElementById("fileInput")   as HTMLInputElement;
const btnCrop     = document.getElementById("btnCrop")     as HTMLButtonElement;
const btnResize   = document.getElementById("btnResize")   as HTMLButtonElement;
const btnResizeFit= document.getElementById("btnResizeFit")as HTMLButtonElement;
const origImg     = document.getElementById("origImg")     as HTMLImageElement;
const resultImg   = document.getElementById("resultImg")   as HTMLImageElement;
const origInfo    = document.getElementById("origInfo")    as HTMLSpanElement;
const resultInfo  = document.getElementById("resultInfo")  as HTMLSpanElement;
const status      = document.getElementById("status")      as HTMLParagraphElement;
const dlLink      = document.getElementById("dlLink")      as HTMLAnchorElement;
const qualitySlider = document.getElementById("quality")   as HTMLInputElement;
const qualityVal  = document.getElementById("qualityVal")  as HTMLSpanElement;

// ── State ─────────────────────────────────────────────────────────────────
let current: MagicWebp | null = null;
let prevObjectURL = "";

// ── Helpers ───────────────────────────────────────────────────────────────
function setStatus(msg: string, kind: "ok" | "error" | "" = "") {
  status.textContent = msg;
  status.className = kind;
}

function kb(bytes: number) {
  return (bytes / 1024).toFixed(1) + " KB";
}

async function showResult(result: MagicWebp, label: string) {
  current = result;
  const quality = parseFloat(qualitySlider.value);
  const blob = await result.toBlob(quality);

  // Revoke previous URL to avoid memory leaks
  if (prevObjectURL) URL.revokeObjectURL(prevObjectURL);
  prevObjectURL = URL.createObjectURL(blob);

  resultImg.src = prevObjectURL;
  resultInfo.textContent = `${result.width} × ${result.height} px — ${kb(blob.size)}`;

  dlLink.href = prevObjectURL;
  dlLink.style.display = "inline";

  setStatus(`✓ ${label} complete → ${result.width}×${result.height} px, ${kb(blob.size)}`, "ok");
}

// ── File load ─────────────────────────────────────────────────────────────
fileInput.addEventListener("change", async () => {
  const file = fileInput.files?.[0];
  if (!file) return;

  setStatus("Loading…");
  try {
    current = await MagicWebp.fromFile(file);
    origImg.src = URL.createObjectURL(file);
    origInfo.textContent = `${current.width} × ${current.height} px — ${kb(file.size)}`;
    resultImg.src = "";
    resultInfo.textContent = "—";
    dlLink.style.display = "none";
    setStatus(`Image loaded: ${current.width}×${current.height} px`, "ok");
  } catch (e) {
    setStatus(String(e), "error");
  }
});

// ── Crop ──────────────────────────────────────────────────────────────────
btnCrop.addEventListener("click", async () => {
  if (!current) { setStatus("Load an image first.", "error"); return; }
  const x = parseInt((document.getElementById("cropX") as HTMLInputElement).value);
  const y = parseInt((document.getElementById("cropY") as HTMLInputElement).value);
  const w = parseInt((document.getElementById("cropW") as HTMLInputElement).value);
  const h = parseInt((document.getElementById("cropH") as HTMLInputElement).value);
  setStatus("Cropping…");
  try {
    const result = current.crop(x, y, w, h);
    await showResult(result, "Crop");
  } catch (e) {
    setStatus(String(e), "error");
  }
});

// ── Resize exact ──────────────────────────────────────────────────────────
btnResize.addEventListener("click", async () => {
  if (!current) { setStatus("Load an image first.", "error"); return; }
  const w = parseInt((document.getElementById("resizeW") as HTMLInputElement).value);
  const h = parseInt((document.getElementById("resizeH") as HTMLInputElement).value);
  setStatus("Resizing…");
  try {
    const result = current.resize(w, h);
    await showResult(result, "Resize");
  } catch (e) {
    setStatus(String(e), "error");
  }
});

// ── Resize fit ────────────────────────────────────────────────────────────
btnResizeFit.addEventListener("click", async () => {
  if (!current) { setStatus("Load an image first.", "error"); return; }
  const w = parseInt((document.getElementById("resizeW") as HTMLInputElement).value);
  const h = parseInt((document.getElementById("resizeH") as HTMLInputElement).value);
  setStatus("Resizing (fit)…");
  try {
    const result = current.resizeFit(w, h);
    await showResult(result, "Resize fit");
  } catch (e) {
    setStatus(String(e), "error");
  }
});

// ── Quality slider ────────────────────────────────────────────────────────
qualitySlider.addEventListener("input", () => {
  qualityVal.textContent = qualitySlider.value;
});

qualitySlider.addEventListener("change", async () => {
  if (current) await showResult(current, "Re-encode");
});

