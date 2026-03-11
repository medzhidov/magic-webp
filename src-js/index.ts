/**
 * magic-webp — TypeScript wrapper around Emscripten WASM for animated WebP processing.
 *
 * Data flow:
 *   File/Blob/URL → raw WebP bytes
 *   → WASM (crop / resize / resize_fit on animated WebP)
 *   → processed WebP bytes → Blob
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

// ── Emscripten WASM types ─────────────────────────────────────────────────

interface EmscriptenModule {
  _malloc(size: number): number;
  _free(ptr: number): void;
  _magic_webp_crop(
    dataPtr: number,
    dataSize: number,
    x: number,
    y: number,
    width: number,
    height: number,
    outSizePtr: number
  ): number;
  _magic_webp_resize(
    dataPtr: number,
    dataSize: number,
    width: number,
    height: number,
    outSizePtr: number
  ): number;
  _magic_webp_resize_fit(
    dataPtr: number,
    dataSize: number,
    maxWidth: number,
    maxHeight: number,
    outSizePtr: number
  ): number;
  _magic_webp_free(ptr: number): void;
  _magic_webp_get_error(): number;
  UTF8ToString(ptr: number): string;
  getValue(ptr: number, type: string): number;
  setValue(ptr: number, value: number, type: string): void;
  writeArrayToMemory(array: Uint8Array, buffer: number): void;
}

// ── WASM module (lazy-loaded once) ────────────────────────────────────────

let wasmReady = false;
let wasmModule: EmscriptenModule | null = null;

async function ensureWasm(): Promise<void> {
  if (wasmReady) return;

  console.log("[magic-webp] Loading Emscripten WASM module...");

  // Import the Emscripten module factory
  const createModule = (await import("../pkg/magic_webp.mjs")).default;
  wasmModule = await createModule() as any;

  console.log("[magic-webp] Module loaded, checking properties...");
  console.log("[magic-webp] Module keys:", Object.keys(wasmModule).slice(0, 20));
  console.log("[magic-webp] Has HEAPU8:", !!wasmModule.HEAPU8);
  console.log("[magic-webp] HEAPU8 type:", typeof wasmModule.HEAPU8);
  console.log("[magic-webp] Has _malloc:", !!wasmModule._malloc);
  console.log("[magic-webp] Has _magic_webp_crop:", !!wasmModule._magic_webp_crop);

  wasmReady = true;
  console.log("[magic-webp] WASM module ready");
}

// ── Operation Queue (for thread-safety) ───────────────────────────────────

/**
 * Promise-based operation queue to ensure thread-safety.
 * WASM module uses global state (error messages, memory allocation),
 * so we must serialize all operations to prevent race conditions.
 */
let operationQueue = Promise.resolve();

/**
 * Enqueue an operation to run sequentially.
 * This ensures that only one WASM operation runs at a time.
 */
function enqueueOperation<T>(operation: () => T | Promise<T>): Promise<T> {
  const promise = operationQueue.then(operation, operation);
  operationQueue = promise.then(() => {}, () => {});
  return promise;
}

// ── Helper functions ──────────────────────────────────────────────────────

function getLastError(): string {
  if (!wasmModule) return "WASM module not initialized";
  const errorPtr = wasmModule._magic_webp_get_error();
  return wasmModule.UTF8ToString(errorPtr);
}

async function getWebPDimensions(webpData: Uint8Array): Promise<{ width: number; height: number }> {
  // Create a blob and use createImageBitmap to get dimensions
  const blob = new Blob([webpData], { type: 'image/webp' });
  const bitmap = await createImageBitmap(blob);
  const dimensions = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return dimensions;
}

/**
 * Internal function to process WebP data through WASM.
 * This function is NOT thread-safe and should only be called through enqueueOperation.
 */
function processWebPInternal(
  webpData: Uint8Array,
  operation: (dataPtr: number, dataSize: number, outSizePtr: number) => number
): Uint8Array {
  if (!wasmModule) throw new Error("WASM module not initialized");

  console.log(`[magic-webp] Processing ${webpData.length} bytes`);

  // Allocate input buffer
  const dataPtr = wasmModule._malloc(webpData.length);
  if (!dataPtr) throw new Error("Failed to allocate memory for input");

  console.log(`[magic-webp] Allocated input at ${dataPtr}`);

  // Copy input data to WASM heap using Emscripten API
  wasmModule.writeArrayToMemory(webpData, dataPtr);

  console.log(`[magic-webp] Copied input data`);

  // Allocate output size pointer (4 bytes for size_t)
  const outSizePtr = wasmModule._malloc(4);
  if (!outSizePtr) {
    wasmModule._free(dataPtr);
    throw new Error("Failed to allocate memory for output size");
  }

  console.log(`[magic-webp] Allocated output size ptr at ${outSizePtr}`);

  try {
    // Call the operation
    const resultPtr = operation(dataPtr, webpData.length, outSizePtr);

    console.log(`[magic-webp] Operation returned ptr: ${resultPtr}`);

    if (!resultPtr) {
      const error = getLastError();
      throw new Error(`WebP processing failed: ${error}`);
    }

    // Read output size using getValue
    const outSize = wasmModule.getValue(outSizePtr, 'i32');

    console.log(`[magic-webp] Output size: ${outSize} bytes`);

    if (!outSize || outSize <= 0) {
      throw new Error(`Invalid output size: ${outSize}`);
    }

    // Read result data
    const result = new Uint8Array(outSize);
    for (let i = 0; i < outSize; i++) {
      result[i] = wasmModule.getValue(resultPtr + i, 'i8');
    }

    console.log(`[magic-webp] Copied result`);

    // Free result
    wasmModule._magic_webp_free(resultPtr);

    return result;
  } finally {
    wasmModule._free(dataPtr);
    wasmModule._free(outSizePtr);
  }
}

/**
 * Thread-safe wrapper for WebP processing.
 * Enqueues the operation to prevent concurrent WASM access.
 */
function processWebP(
  webpData: Uint8Array,
  operation: (dataPtr: number, dataSize: number, outSizePtr: number) => number
): Uint8Array {
  // Note: We can't use enqueueOperation here because this function is synchronous
  // and called from synchronous methods. The queue is applied at the MagicWebp method level.
  return processWebPInternal(webpData, operation);
}

// ── MagicWebp class ───────────────────────────────────────────────────────

export class MagicWebp {
  private _data: Uint8Array;
  private _width: number | null = null;
  private _height: number | null = null;

  private constructor(data: Uint8Array, width?: number, height?: number) {
    this._data = data;
    if (width !== undefined && height !== undefined) {
      this._width = width;
      this._height = height;
    }
  }

  get width(): number | null {
    return this._width;
  }

  get height(): number | null {
    return this._height;
  }

  // ── Static constructors ────────────────────────────────────────────────

  static async fromFile(file: File): Promise<MagicWebp> {
    return MagicWebp.fromBlob(file);
  }

  static async fromBlob(blob: Blob): Promise<MagicWebp> {
    await ensureWasm();
    const arrayBuffer = await blob.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);

    // Get dimensions
    const { width, height } = await getWebPDimensions(data);

    return new MagicWebp(data, width, height);
  }

  static async fromUrl(url: string): Promise<MagicWebp> {
    const response = await fetch(url);
    const blob = await response.blob();
    return MagicWebp.fromBlob(blob);
  }

  // ── Operations (chainable, each returns a Promise<MagicWebp>) ────────

  /**
   * Crop the WebP image to the specified region.
   * Operations are queued to ensure thread-safety.
   */
  async crop(x: number, y: number, width: number, height: number): Promise<MagicWebp> {
    return enqueueOperation(() => {
      console.log(`[magic-webp] Cropping: ${x},${y} ${width}x${height}`);
      const result = processWebPInternal(this._data, (dataPtr, dataSize, outSizePtr) => {
        return wasmModule!._magic_webp_crop(
          dataPtr,
          dataSize,
          x,
          y,
          width,
          height,
          outSizePtr
        );
      });
      console.log(`[magic-webp] Crop result: ${result.length} bytes`);
      // Result dimensions are the crop dimensions
      return new MagicWebp(result, width, height);
    });
  }

  /**
   * Resize the WebP image to exact dimensions.
   * Operations are queued to ensure thread-safety.
   */
  async resize(width: number, height: number): Promise<MagicWebp> {
    return enqueueOperation(() => {
      const result = processWebPInternal(this._data, (dataPtr, dataSize, outSizePtr) => {
        return wasmModule!._magic_webp_resize(
          dataPtr,
          dataSize,
          width,
          height,
          outSizePtr
        );
      });
      // Result dimensions are the target dimensions
      return new MagicWebp(result, width, height);
    });
  }

  /**
   * Resize the WebP image to fit within max dimensions (preserves aspect ratio).
   * Operations are queued to ensure thread-safety.
   */
  async resizeFit(maxWidth: number, maxHeight: number): Promise<MagicWebp> {
    return enqueueOperation(() => {
      const result = processWebPInternal(this._data, (dataPtr, dataSize, outSizePtr) => {
        return wasmModule!._magic_webp_resize_fit(
          dataPtr,
          dataSize,
          maxWidth,
          maxHeight,
          outSizePtr
        );
      });

      // Calculate fitted dimensions (preserve aspect ratio)
      if (this._width && this._height) {
        const scale = Math.min(maxWidth / this._width, maxHeight / this._height);
        const newWidth = Math.round(this._width * scale);
        const newHeight = Math.round(this._height * scale);
        return new MagicWebp(result, newWidth, newHeight);
      }

      // If we don't know original dimensions, return without dimensions
      return new MagicWebp(result);
    });
  }

  // ── Output ─────────────────────────────────────────────────────────────

  /** Get raw WebP bytes. */
  toBytes(): Uint8Array {
    return this._data.slice();
  }

  /** WebP Blob. */
  toBlob(): Blob {
    return new Blob([this._data], { type: "image/webp" });
  }

  /** Data URL (base64-encoded WebP). */
  async toDataUrl(): Promise<string> {
    const blob = this.toBlob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  /** Object URL (revokable). */
  toObjectUrl(): string {
    return URL.createObjectURL(this.toBlob());
  }
}

// ── Standalone functions ──────────────────────────────────────────────────

export async function cropWebp(
  input: File | Blob | string,
  options: CropOptions
): Promise<Blob> {
  const img = typeof input === "string"
    ? await MagicWebp.fromUrl(input)
    : await MagicWebp.fromBlob(input);
  const result = await img.crop(options.x, options.y, options.width, options.height);
  return result.toBlob();
}

export async function resizeWebp(
  input: File | Blob | string,
  options: ResizeOptions
): Promise<Blob> {
  const img = typeof input === "string"
    ? await MagicWebp.fromUrl(input)
    : await MagicWebp.fromBlob(input);
  const result = await img.resize(options.width, options.height);
  return result.toBlob();
}

export async function resizeFitWebp(
  input: File | Blob | string,
  options: ResizeFitOptions
): Promise<Blob> {
  const img = typeof input === "string"
    ? await MagicWebp.fromUrl(input)
    : await MagicWebp.fromBlob(input);
  const result = await img.resizeFit(options.maxWidth, options.maxHeight);
  return result.toBlob();
}

