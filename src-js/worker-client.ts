/**
 * Client API for using magic-webp with Web Worker
 * Provides a clean, Promise-based interface that hides all Worker complexity
 */

import type { FitMode, Position } from './index.js';

export interface ResizeOptions {
  mode?: FitMode;
  position?: Position;
  quality?: number;
}

interface WorkerRequest {
  type: string;
  [key: string]: any;
}

interface WorkerResponse {
  id: number;
  type: string;
  data?: Uint8Array;
  width?: number;
  height?: number;
  error?: string;
  operation?: string;
}

/**
 * MagicWebpWorker - Easy-to-use Web Worker API
 * 
 * @example
 * ```typescript
 * // Initialize with worker URL
 * const webp = new MagicWebpWorker('/worker.js');
 * 
 * // Load and process image
 * await webp.load(file);
 * const blob = await webp.resize(400, 400, { mode: 'cover', quality: 90 });
 * 
 * // Clean up
 * webp.terminate();
 * ```
 */
export class MagicWebpWorker {
  private worker: Worker;
  private requestId = 0;
  private pendingRequests = new Map<number, {
    resolve: (value: any) => void;
    reject: (error: Error) => void;
  }>();
  
  private imageWidth?: number;
  private imageHeight?: number;
  private isLoaded = false;

  /**
   * Create a new MagicWebpWorker instance
   * @param workerUrl - URL to the worker.js file
   */
  constructor(workerUrl: string) {
    this.worker = new Worker(workerUrl, { type: 'module' });
    this.worker.onmessage = this.handleMessage.bind(this);
    this.worker.onerror = this.handleError.bind(this);
  }

  private handleMessage(e: MessageEvent<WorkerResponse>) {
    const { id, type, data, width, height, error, operation } = e.data;
    const pending = this.pendingRequests.get(id);

    if (!pending) {
      console.warn('[MagicWebpWorker] Received response for unknown request:', id);
      return;
    }

    this.pendingRequests.delete(id);

    if (type === 'error') {
      pending.reject(new Error(error || 'Unknown error'));
    } else if (type === 'loaded') {
      this.imageWidth = width;
      this.imageHeight = height;
      this.isLoaded = true;
      pending.resolve({ width, height });
    } else if (type === 'result') {
      // Update dimensions if provided (e.g., from convert operation)
      if (width !== undefined && height !== undefined) {
        this.imageWidth = width;
        this.imageHeight = height;
        // Mark as loaded if this was a convert operation
        if (operation === 'convert') {
          this.isLoaded = true;
        }
      }
      pending.resolve(new Blob([data!.buffer as ArrayBuffer], { type: 'image/webp' }));
    }
  }

  private handleError(error: ErrorEvent) {
    console.error('[MagicWebpWorker] Worker error:', error);
    for (const [id, pending] of this.pendingRequests) {
      pending.reject(new Error('Worker error: ' + error.message));
      this.pendingRequests.delete(id);
    }
  }

  private sendMessage(message: WorkerRequest): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = this.requestId++;
      this.pendingRequests.set(id, { resolve, reject });
      const fullMessage = { ...message, id };
      console.log('[MagicWebpWorker] Sending message:', fullMessage.type, 'id:', fullMessage.id);
      this.worker.postMessage(fullMessage);
    });
  }

  /**
   * Load a WebP image from File or Blob
   * @param blob - File or Blob containing WebP image
   * @returns Promise with image dimensions
   */
  async load(blob: Blob | File): Promise<{ width?: number; height?: number }> {
    const arrayBuffer = await blob.arrayBuffer();
    return this.sendMessage({
      type: 'load',
      data: new Uint8Array(arrayBuffer)
    } as any);
  }

  /**
   * Crop the loaded image
   * @param x - X coordinate of crop region
   * @param y - Y coordinate of crop region
   * @param width - Width of crop region
   * @param height - Height of crop region
   * @param quality - Output quality (0-100, default 75 - balanced)
   * @returns Promise with result Blob
   */
  async crop(x: number, y: number, width: number, height: number, quality: number = 75): Promise<Blob> {
    if (!this.isLoaded) {
      throw new Error('No image loaded. Call load() first.');
    }
    return this.sendMessage({
      type: 'crop',
      x, y, width, height, quality
    } as any);
  }

  /**
   * Resize the loaded image
   * @param width - Target width
   * @param height - Target height
   * @param options - Resize options (mode, position, quality)
   * @returns Promise with result Blob
   */
  async resize(width: number, height: number, options?: ResizeOptions): Promise<Blob> {
    if (!this.isLoaded) {
      throw new Error('No image loaded. Call load() first.');
    }
    return this.sendMessage({
      type: 'resize',
      width,
      height,
      mode: options?.mode,
      position: options?.position,
      quality: options?.quality
    } as any);
  }

  /**
   * Convert any image format (PNG, JPEG, GIF, etc.) to WebP
   * Supported formats: PNG, JPEG, GIF, TIFF, WebP
   *
   * @param blob - File or Blob containing the image data
   * @param quality - Output quality (0-100, default 75 - balanced)
   * @param lossless - Use lossless compression (default false)
   * @returns Promise with result Blob containing WebP image
   */
  async convert(blob: Blob | File, quality: number = 75, lossless: boolean = false): Promise<Blob> {
    const arrayBuffer = await blob.arrayBuffer();
    return this.sendMessage({
      type: 'convert',
      data: new Uint8Array(arrayBuffer),
      quality,
      lossless
    } as any);
  }

  /**
   * Get current image width
   */
  get width(): number | undefined {
    return this.imageWidth;
  }

  /**
   * Get current image height
   */
  get height(): number | undefined {
    return this.imageHeight;
  }

  /**
   * Terminate the worker and clean up resources
   */
  terminate(): void {
    this.worker.terminate();
    this.pendingRequests.clear();
    this.isLoaded = false;
  }
}

