/**
 * magic-webp — TypeScript wrapper around the WASM image processing core.
 *
 * Data flow:
 *   File/Blob/URL → ImageBitmap → Canvas → RGBA pixels
 *   → WASM (crop / resize) → RGBA pixels
 *   → Canvas → canvas.toBlob('image/webp') → Blob / DataURL / ObjectURL
 */

// ── Types ─────────────────────────────────────────────────────────────────

export interface CropOptions {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ResizeOptions {
  width: number;
  height: number;
}

export interface ResizeFitOptions {
  maxWidth: number;
  maxHeight: number;
}

// ── WASM types ────────────────────────────────────────────────────────────

/** Mirrors the ProcessResult struct exposed by wasm-bindgen. */
export interface WasmResult {
  data(): Uint8Array;
  width(): number;
  height(): number;
}

/** The subset of the compiled WASM module that MagicWebp needs. */
export interface WasmOps {
  crop(
    data: Uint8Array,
    imgW: number, imgH: number,
    x: number, y: number,
    cropW: number, cropH: number
  ): WasmResult;
  resize(
    data: Uint8Array,
    imgW: number, imgH: number,
    newW: number, newH: number
  ): WasmResult;
  resize_fit(
    data: Uint8Array,
    imgW: number, imgH: number,
    maxW: number, maxH: number
  ): WasmResult;
}

// ── WASM module (lazy-loaded once) ────────────────────────────────────────

let wasmReady = false;
let wasmModule: WasmOps | null = null;

/**
 * For unit tests only — inject a mock WasmOps implementation so the
 * real .wasm file is never loaded during tests.
 */
export function _setWasmModule(mock: WasmOps): void {
  wasmModule = mock;
  wasmReady = true;
}

async function ensureWasm(): Promise<void> {
  if (wasmReady) return;
  // bundler target: the module self-initialises on import (no default() call needed).
  // vite-plugin-wasm + top-level-await handle the .wasm streaming internally.
  wasmModule = await import("../pkg/magic_webp.js") as unknown as WasmOps;
  wasmReady = true;
}

// ── Pixel helpers ─────────────────────────────────────────────────────────

function imageBitmapToRgba(
  bitmap: ImageBitmap
): { data: Uint8ClampedArray; width: number; height: number } {
  const { width, height } = bitmap;
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0);
  const imageData = ctx.getImageData(0, 0, width, height);
  return { data: imageData.data, width, height };
}

function rgbaToBlob(
  data: Uint8Array,
  width: number,
  height: number,
  quality = 0.92
): Promise<Blob> {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d")!;
  const imageData = new ImageData(new Uint8ClampedArray(data), width, height);
  ctx.putImageData(imageData, 0, 0);
  return canvas.convertToBlob({ type: "image/webp", quality });
}

// ── MagicWebp class ───────────────────────────────────────────────────────

export class MagicWebp {
  private _data: Uint8Array;
  private _width: number;
  private _height: number;

  private constructor(data: Uint8Array, width: number, height: number) {
    this._data = data;
    this._width = width;
    this._height = height;
  }

  get width(): number {
    return this._width;
  }

  get height(): number {
    return this._height;
  }

  // ── Static constructors ────────────────────────────────────────────────

  static async fromFile(file: File): Promise<MagicWebp> {
    return MagicWebp.fromBlob(file);
  }

  static async fromBlob(blob: Blob): Promise<MagicWebp> {
    await ensureWasm();
    const bitmap = await createImageBitmap(blob);
    const { data, width, height } = imageBitmapToRgba(bitmap);
    bitmap.close();
    return new MagicWebp(new Uint8Array(data.buffer), width, height);
  }

  static async fromUrl(url: string): Promise<MagicWebp> {
    const response = await fetch(url);
    const blob = await response.blob();
    return MagicWebp.fromBlob(blob);
  }

  // ── Operations (chainable, each returns a new MagicWebp) ──────────────

  crop(x: number, y: number, width: number, height: number): MagicWebp {
    const result = wasmModule.crop(
      this._data,
      this._width,
      this._height,
      x,
      y,
      width,
      height
    );
    return new MagicWebp(
      new Uint8Array(result.data()),
      result.width(),
      result.height()
    );
  }

  resize(width: number, height: number): MagicWebp {
    const result = wasmModule.resize(
      this._data,
      this._width,
      this._height,
      width,
      height
    );
    return new MagicWebp(
      new Uint8Array(result.data()),
      result.width(),
      result.height()
    );
  }

  resizeFit(maxWidth: number, maxHeight: number): MagicWebp {
    const result = wasmModule.resize_fit(
      this._data,
      this._width,
      this._height,
      maxWidth,
      maxHeight
    );
    return new MagicWebp(
      new Uint8Array(result.data()),
      result.width(),
      result.height()
    );
  }

  // ── Output ─────────────────────────────────────────────────────────────

  /** Raw RGBA pixels of the current state. */
  toImageData(): ImageData {
    return new ImageData(
      new Uint8ClampedArray(this._data.buffer),
      this._width,
      this._height
    );
  }

  /** WebP Blob. quality 0–1 (default 0.92). */
  toBlob(quality = 0.92): Promise<Blob> {
    return rgbaToBlob(this._data, this._width, this._height, quality);
  }

  /** WebP as a data: URL string. */
  async toDataURL(quality = 0.92): Promise<string> {
    const blob = await this.toBlob(quality);
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  /** WebP as a blob: URL (remember to call URL.revokeObjectURL when done). */
  async toObjectURL(quality = 0.92): Promise<string> {
    const blob = await this.toBlob(quality);
    return URL.createObjectURL(blob);
  }
}

