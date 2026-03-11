/**
 * Universal Web Worker for magic-webp
 * Handles image processing in a separate thread to keep UI responsive
 */

import { MagicWebp } from './index.js';
import { debug, error } from './logger.js';

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

  debug('[worker] Received message:', msg.type, 'id:', msg.id);

  processingQueue = processingQueue.then(async () => {
    try {
      switch (msg.type) {
        case 'load': {
          debug('[worker] Loading image, size:', msg.data.length);
          currentImage = await MagicWebp.fromBytes(msg.data);

          debug('[worker] Image loaded:', currentImage.width, '×', currentImage.height, 'sending id:', msg.id);
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
          debug('[worker] Cropping:', msg.x, msg.y, msg.width, msg.height, 'quality:', quality);

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
          debug('[worker] Resizing:', msg.width, msg.height, 'mode:', msg.mode || 'cover', 'quality:', quality);

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
    } catch (err: any) {
      error('[worker] Error:', err);
      self.postMessage({
        type: 'error',
        id: msg.id,
        error: err.message || String(err)
      });
    }
  });
};

debug('[worker] magic-webp worker ready');

