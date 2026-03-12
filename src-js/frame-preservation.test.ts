import { describe, it, expect } from "vitest";
import { MagicWebp } from "./index.js";
import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));
const testGifPath = resolve(__dir, "../demo/assets/test.gif");

/**
 * Count frames in WebP by counting ANMF chunks
 */
function countWebPFrames(data: Uint8Array): number {
  // Check if it's a valid WebP
  const isRIFF = String.fromCharCode(...data.slice(0, 4)) === "RIFF";
  const isWEBP = String.fromCharCode(...data.slice(8, 12)) === "WEBP";

  if (!isRIFF || !isWEBP) {
    throw new Error("Not a valid WebP file!");
  }

  // Count ANMF chunks (animation frames)
  let frameCount = 0;
  for (let i = 12; i < data.length - 4; i++) {
    if (String.fromCharCode(...data.slice(i, i + 4)) === "ANMF") {
      frameCount++;
    }
  }

  // If no ANMF chunks, it's a static image (1 frame)
  if (frameCount === 0) {
    // Check for VP8 or VP8L chunk (static image)
    for (let i = 12; i < data.length - 4; i++) {
      const chunk = String.fromCharCode(...data.slice(i, i + 4));
      if (chunk === "VP8 " || chunk === "VP8L") {
        return 1;
      }
    }
  }

  return frameCount;
}

/**
 * Count frames in GIF by counting Image Descriptors (0x2C)
 */
function countGIFFrames(buffer: Buffer): number {
  let offset = 0;

  // Read header
  const header = buffer.slice(0, 6).toString("ascii");
  if (header !== "GIF87a" && header !== "GIF89a") {
    throw new Error("Not a valid GIF file");
  }
  offset = 6;

  // Read Logical Screen Descriptor
  const packed = buffer[offset + 4];
  const hasGlobalColorTable = (packed & 0x80) !== 0;
  const globalColorTableSize = hasGlobalColorTable ? 2 << (packed & 0x07) : 0;
  offset += 7;

  // Skip Global Color Table
  if (hasGlobalColorTable) {
    offset += globalColorTableSize * 3;
  }

  let frameCount = 0;

  // Count Image Descriptors (0x2C) - actual frames
  while (offset < buffer.length) {
    const separator = buffer[offset++];

    if (separator === 0x21) {
      // Extension
      offset++; // Skip label
      let blockSize = buffer[offset++];
      while (blockSize > 0 && offset < buffer.length) {
        offset += blockSize;
        blockSize = buffer[offset++];
      }
    } else if (separator === 0x2c) {
      // Image Descriptor (frame)
      frameCount++;
      offset += 8; // Skip descriptor

      const packed = buffer[offset++];
      const hasLocalColorTable = (packed & 0x80) !== 0;
      const localColorTableSize = hasLocalColorTable
        ? 2 << (packed & 0x07)
        : 0;

      if (hasLocalColorTable) {
        offset += localColorTableSize * 3;
      }

      offset++; // Skip LZW code size

      let blockSize = buffer[offset++];
      while (blockSize > 0 && offset < buffer.length) {
        offset += blockSize;
        blockSize = buffer[offset++];
      }
    } else if (separator === 0x3b) {
      // Trailer
      break;
    }
  }

  return frameCount;
}

describe("Frame preservation in GIF to WebP conversion", () => {
  it("should preserve all frames when converting GIF to WebP (lossy)", async () => {
    const gifData = readFileSync(testGifPath);
    const gifBlob = new Blob([gifData], { type: "image/gif" });

    // Count frames in original GIF
    const gifFrames = countGIFFrames(gifData);
    expect(gifFrames).toBeGreaterThan(0);

    // Convert to WebP
    const webp = await MagicWebp.convert(gifBlob, 75, false);
    expect(webp).toBeInstanceOf(MagicWebp);

    // Count frames in WebP
    const webpData = webp.toBytes();
    const webpFrames = countWebPFrames(webpData);

    // Should preserve all frames
    expect(webpFrames).toBe(gifFrames);
  });

  it("should preserve all frames when converting GIF to WebP (lossless)", async () => {
    const gifData = readFileSync(testGifPath);
    const gifBlob = new Blob([gifData], { type: "image/gif" });

    const gifFrames = countGIFFrames(gifData);

    // Convert to WebP (lossless)
    const webp = await MagicWebp.convert(gifBlob, 75, true);
    const webpData = webp.toBytes();
    const webpFrames = countWebPFrames(webpData);

    expect(webpFrames).toBe(gifFrames);
  });
});

