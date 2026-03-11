/**
 * Universal Web Worker for magic-webp
 * Handles image processing in a separate thread to keep UI responsive
 */

import { MagicWebp } from './index.js';

// Message types
interface LoadMessage {
  type: 'load';
  id: number;
  data: Uint8Array;
}

interface CropMessage {
  type: 'crop';
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  quality?: number;
}

interface ResizeMessage {
  type: 'resize';
  id: number;
  width: number;
  height: number;
  mode?: 'cover' | 'contain' | 'fill' | 'inside' | 'outside';
  position?: string;
  quality?: number;
}

type WorkerMessage = LoadMessage | CropMessage | ResizeMessage;

// State
let currentImage: MagicWebp | null = null;
let processingQueue = Promise.resolve();

// Process messages sequentially
self.onmessage = (e: MessageEvent<WorkerMessage>) => {
  const msg = e.data;
  
  processingQueue = processingQueue.then(async () => {
    try {
      switch (msg.type) {
        case 'load': {
          console.log('[worker] Loading image:', msg.data.length, 'bytes');
          currentImage = await MagicWebp.fromBytes(msg.data);
          
          self.postMessage({
            type: 'loaded',
            id: msg.id,
            width: currentImage.width,
            height: currentImage.height
          });
          break;
        }
        
        case 'crop': {
          if (!currentImage) {
            throw new Error('No image loaded. Call load() first.');
          }
          
          const quality = msg.quality !== undefined ? msg.quality : 90;
          console.log('[worker] Cropping:', msg.x, msg.y, msg.width, msg.height, 'quality:', quality);
          
          const result = await currentImage.crop(msg.x, msg.y, msg.width, msg.height, quality);
          const output = result.toBytes();
          
          self.postMessage({
            type: 'result',
            id: msg.id,
            operation: 'crop',
            data: output,
            width: result.width,
            height: result.height
          });
          break;
        }
        
        case 'resize': {
          if (!currentImage) {
            throw new Error('No image loaded. Call load() first.');
          }
          
          const quality = msg.quality !== undefined ? msg.quality : 90;
          console.log('[worker] Resizing:', msg.width, msg.height, 'mode:', msg.mode || 'cover', 'quality:', quality);
          
          const result = await currentImage.resize(msg.width, msg.height, {
            mode: msg.mode,
            position: msg.position as any,
            quality: quality
          });
          const output = result.toBytes();
          
          self.postMessage({
            type: 'result',
            id: msg.id,
            operation: `resize-${msg.mode || 'cover'}`,
            data: output,
            width: result.width,
            height: result.height
          });
          break;
        }
        
        default:
          throw new Error(`Unknown message type: ${(msg as any).type}`);
      }
    } catch (error: any) {
      console.error('[worker] Error:', error);
      self.postMessage({
        type: 'error',
        id: msg.id,
        error: error.message || String(error)
      });
    }
  });
};

console.log('[worker] magic-webp worker ready');

