/**
 * Web Worker for image processing
 * Runs in background thread to keep UI responsive
 */

import { MagicWebp } from "../src-js/index.js";

// Message types
interface LoadMessage {
  type: 'load';
  data: Uint8Array;
}

interface CropMessage {
  type: 'crop';
  x: number;
  y: number;
  width: number;
  height: number;
  quality?: number;
}

interface ResizeMessage {
  type: 'resize';
  width: number;
  height: number;
  mode?: 'cover' | 'contain' | 'fill' | 'inside' | 'outside';
  position?: string;
  quality?: number;
}

type WorkerMessage = LoadMessage | CropMessage | ResizeMessage;

// State
let original: MagicWebp | null = null;

// Message handler
self.onmessage = async (e: MessageEvent<WorkerMessage>) => {
  const msg = e.data;
  
  try {
    switch (msg.type) {
      case 'load': {
        console.log('[worker] Loading image, size:', msg.data.length);
        original = await MagicWebp.fromBlob(new Blob([msg.data], { type: 'image/webp' }));
        console.log('[worker] Image loaded:', original.width, '×', original.height);
        
        self.postMessage({
          type: 'loaded',
          width: original.width,
          height: original.height
        });
        break;
      }
      
      case 'crop': {
        if (!original) {
          throw new Error('No image loaded');
        }

        const quality = msg.quality !== undefined ? msg.quality : 90;
        console.log('[worker] Cropping:', msg.x, msg.y, msg.width, msg.height, 'quality:', quality);
        const result = await original.crop(msg.x, msg.y, msg.width, msg.height, quality);
        const blob = result.toBlob();
        const arrayBuffer = await blob.arrayBuffer();

        self.postMessage({
          type: 'result',
          operation: 'crop',
          data: new Uint8Array(arrayBuffer),
          width: result.width,
          height: result.height
        });
        break;
      }

      case 'resize': {
        if (!original) {
          throw new Error('No image loaded');
        }

        const quality = msg.quality !== undefined ? msg.quality : 90;
        console.log('[worker] Resizing:', msg.width, msg.height, 'mode:', msg.mode || 'cover', 'quality:', quality);
        const result = await original.resize(msg.width, msg.height, {
          mode: msg.mode,
          position: msg.position as any,
          quality: quality
        });
        const blob = result.toBlob();
        const arrayBuffer = await blob.arrayBuffer();

        self.postMessage({
          type: 'result',
          operation: `resize-${msg.mode || 'cover'}`,
          data: new Uint8Array(arrayBuffer),
          width: result.width,
          height: result.height
        });
        break;
      }
    }
  } catch (error) {
    console.error('[worker] Error:', error);
    self.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : String(error)
    });
  }
};

console.log('[worker] Worker initialized');

