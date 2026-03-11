/* tslint:disable */
/* eslint-disable */

/**
 * Emscripten Module interface for magic-webp WASM
 */
export interface EmscriptenModule {
  // Memory management
  _malloc(size: number): number;
  _free(ptr: number): void;

  // WebP operations
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

  // Emscripten runtime methods
  UTF8ToString(ptr: number): string;
  getValue(ptr: number, type: string): number;
  setValue(ptr: number, value: number, type: string): void;
  writeArrayToMemory(array: Uint8Array, buffer: number): void;

  // Memory heap
  HEAPU8: Uint8Array;
}

/**
 * Factory function to create the Emscripten module
 */
declare function createMagicWebpModule(): Promise<EmscriptenModule>;

export default createMagicWebpModule;
