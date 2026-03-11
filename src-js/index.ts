/**
 * magic-webp — TypeScript wrapper around Emscripten WASM for animated WebP processing.
 *
 * Data flow:
 *   File/Blob/URL → raw WebP bytes
 *   → WASM (crop / resize / resize_fit on animated WebP)
 *   → processed WebP bytes → Blob
 */

// ── Types ─────────────────────────────────────────────────────────────────

/**
 * Resize fit modes (inspired by CSS object-fit)
 */
export type FitMode =
  | 'cover'    // Fill the dimensions, crop excess (default)
  | 'contain'  // Fit within dimensions, preserve aspect ratio
  | 'fill'     // Stretch to exact dimensions (may distort)
  | 'inside'   // Like contain, but never enlarge
  | 'outside'; // Like cover, but never reduce

/**
 * Position for cover/outside modes
 */
export type Position =
  | 'center'
  | 'top' | 'bottom' | 'left' | 'right'
  | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

/**
 * Options for resize operation
 */
export interface ResizeOptions {
  mode?: FitMode;
  position?: Position;
  quality?: number;  // 0-100, default 90
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
    quality: number,
    outSizePtr: number
  ): number;
  _magic_webp_resize(
    dataPtr: number,
    dataSize: number,
    width: number,
    height: number,
    quality: number,
    outSizePtr: number
  ): number;
  _magic_webp_resize_fit(
    dataPtr: number,
    dataSize: number,
    maxWidth: number,
    maxHeight: number,
    quality: number,
    outSizePtr: number
  ): number;
  _magic_webp_resize_cover(
    dataPtr: number,
    dataSize: number,
    targetWidth: number,
    targetHeight: number,
    cropX: number,
    cropY: number,
    quality: number,
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

  static async fromBytes(data: Uint8Array): Promise<MagicWebp> {
    await ensureWasm();

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
   *
   * @param quality - Output quality (0-100, default 75 - balanced)
   */
  async crop(x: number, y: number, width: number, height: number, quality: number = 75): Promise<MagicWebp> {
    return enqueueOperation(() => {
      console.log(`[magic-webp] Cropping: ${x},${y} ${width}x${height}, quality: ${quality}`);
      const result = processWebPInternal(this._data, (dataPtr, dataSize, outSizePtr) => {
        return wasmModule!._magic_webp_crop(
          dataPtr,
          dataSize,
          x,
          y,
          width,
          height,
          quality,
          outSizePtr
        );
      });
      console.log(`[magic-webp] Crop result: ${result.length} bytes`);
      // Result dimensions are the crop dimensions
      return new MagicWebp(result, width, height);
    });
  }

  /**
   * Resize the WebP image with various fit modes.
   *
   * @param width - Target width
   * @param height - Target height
   * @param options - Resize options
   * @param options.mode - Fit mode: 'cover' (default), 'contain', 'fill', 'inside', 'outside'
   * @param options.position - Position for 'cover'/'outside' modes (default: 'center')
   *
   * @example
   * // Cover - fill 300x300, crop excess (center)
   * await img.resize(300, 300, { mode: 'cover' })
   *
   * @example
   * // Cover - fill 300x300, crop excess (top)
   * await img.resize(300, 300, { mode: 'cover', position: 'top' })
   *
   * @example
   * // Contain - fit within 300x300
   * await img.resize(300, 300, { mode: 'contain' })
   *
   * @example
   * // Fill - stretch to 300x300 (may distort)
   * await img.resize(300, 300, { mode: 'fill' })
   */
  async resize(width: number, height: number, options?: ResizeOptions): Promise<MagicWebp> {
    const mode = options?.mode || 'cover';
    const position = options?.position || 'center';
    const quality = options?.quality !== undefined ? options.quality : 75;

    if (!this._width || !this._height) {
      throw new Error('Image dimensions unknown');
    }

    return enqueueOperation(async () => {
      switch (mode) {
        case 'fill':
          return this._resizeFill(width, height, quality);

        case 'contain':
          return this._resizeContain(width, height, quality);

        case 'inside':
          return this._resizeInside(width, height, quality);

        case 'outside':
          return this._resizeOutside(width, height, position, quality);

        case 'cover':
        default:
          return this._resizeCover(width, height, position, quality);
      }
    });
  }

  // ── Private resize implementations ────────────────────────────────────

  private _resizeFill(width: number, height: number, quality: number): MagicWebp {
    console.log(`[magic-webp] Resize fill: ${width}x${height}, quality: ${quality}`);
    const result = processWebPInternal(this._data, (dataPtr, dataSize, outSizePtr) => {
      return wasmModule!._magic_webp_resize(dataPtr, dataSize, width, height, quality, outSizePtr);
    });
    return new MagicWebp(result, width, height);
  }

  private _resizeContain(width: number, height: number, quality: number): MagicWebp {
    console.log(`[magic-webp] Resize contain: ${width}x${height}, quality: ${quality}`);
    const result = processWebPInternal(this._data, (dataPtr, dataSize, outSizePtr) => {
      return wasmModule!._magic_webp_resize_fit(dataPtr, dataSize, width, height, quality, outSizePtr);
    });

    // Calculate actual dimensions
    const scale = Math.min(width / this._width!, height / this._height!);
    const newWidth = Math.round(this._width! * scale);
    const newHeight = Math.round(this._height! * scale);
    return new MagicWebp(result, newWidth, newHeight);
  }

  private _resizeInside(width: number, height: number, quality: number): MagicWebp {
    // Don't enlarge - if image is smaller, keep original size
    if (this._width! <= width && this._height! <= height) {
      console.log(`[magic-webp] Resize inside: keeping original ${this._width}x${this._height}`);
      return new MagicWebp(this._data, this._width, this._height);
    }

    // Otherwise, same as contain
    return this._resizeContain(width, height, quality);
  }

  private _resizeOutside(width: number, height: number, position: Position, quality: number): MagicWebp {
    // Don't reduce - if image is larger, just crop
    if (this._width! >= width && this._height! >= height) {
      console.log(`[magic-webp] Resize outside: cropping ${this._width}x${this._height} to ${width}x${height}`);
      const { x, y } = this._calculateCropPosition(this._width!, this._height!, width, height, position);
      const result = processWebPInternal(this._data, (dataPtr, dataSize, outSizePtr) => {
        return wasmModule!._magic_webp_crop(dataPtr, dataSize, x, y, width, height, quality, outSizePtr);
      });
      return new MagicWebp(result, width, height);
    }

    // Otherwise, same as cover
    return this._resizeCover(width, height, position, quality);
  }

  private _resizeCover(width: number, height: number, position: Position, quality: number): MagicWebp {
    console.log(`[magic-webp] Resize cover: ${width}x${height}, position: ${position}, quality: ${quality}`);

    // Calculate scale to cover (scale by the larger ratio)
    const scaleX = width / this._width!;
    const scaleY = height / this._height!;
    const scale = Math.max(scaleX, scaleY);

    const scaledWidth = Math.round(this._width! * scale);
    const scaledHeight = Math.round(this._height! * scale);

    // Calculate crop position
    const { x, y } = this._calculateCropPosition(scaledWidth, scaledHeight, width, height, position);

    // Use optimized C function that does resize + crop in one pass
    const result = processWebPInternal(this._data, (dataPtr, dataSize, outSizePtr) => {
      return wasmModule!._magic_webp_resize_cover(
        dataPtr,
        dataSize,
        width,
        height,
        x,
        y,
        quality,
        outSizePtr
      );
    });

    return new MagicWebp(result, width, height);
  }

  private _calculateCropPosition(
    sourceWidth: number,
    sourceHeight: number,
    targetWidth: number,
    targetHeight: number,
    position: Position
  ): { x: number; y: number } {
    let x = 0;
    let y = 0;

    // Horizontal position
    if (position.includes('left')) {
      x = 0;
    } else if (position.includes('right')) {
      x = sourceWidth - targetWidth;
    } else {
      x = Math.round((sourceWidth - targetWidth) / 2);
    }

    // Vertical position
    if (position.includes('top')) {
      y = 0;
    } else if (position.includes('bottom')) {
      y = sourceHeight - targetHeight;
    } else {
      y = Math.round((sourceHeight - targetHeight) / 2);
    }

    return { x, y };
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

/**
 * Crop a WebP image
 */
export async function crop(
  input: File | Blob | string,
  x: number,
  y: number,
  width: number,
  height: number
): Promise<Blob> {
  const img = typeof input === "string"
    ? await MagicWebp.fromUrl(input)
    : await MagicWebp.fromBlob(input);
  const result = await img.crop(x, y, width, height);
  return result.toBlob();
}

/**
 * Resize a WebP image with fit modes
 */
export async function resize(
  input: File | Blob | string,
  width: number,
  height: number,
  options?: ResizeOptions
): Promise<Blob> {
  const img = typeof input === "string"
    ? await MagicWebp.fromUrl(input)
    : await MagicWebp.fromBlob(input);
  const result = await img.resize(width, height, options);
  return result.toBlob();
}

// ── Exports ───────────────────────────────────────────────────────────────

export { MagicWebpWorker } from './worker-client.js';
