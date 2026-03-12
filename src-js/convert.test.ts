import { describe, it, expect } from "vitest";
import { MagicWebp } from "./index.js";
import { readFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));
const testPngPath = resolve(__dir, "../demo/assets/test.png");
const testJpgPath = resolve(__dir, "../demo/assets/test.jpg");
const testGifPath = resolve(__dir, "../demo/assets/test.gif");

describe("MagicWebp.convert", () => {
  it("should convert PNG to WebP (lossy)", async () => {
    const data = readFileSync(testPngPath);
    const blob = new Blob([data], { type: "image/png" });

    const result = await MagicWebp.convert(blob, 75, false);

    expect(result).toBeInstanceOf(MagicWebp);
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);

    const webpBlob = result.toBlob();
    expect(webpBlob.type).toBe("image/webp");
  });

  it("should convert PNG to WebP (lossless)", async () => {
    const data = readFileSync(testPngPath);
    const blob = new Blob([data], { type: "image/png" });

    const result = await MagicWebp.convert(blob, 100, true);

    expect(result).toBeInstanceOf(MagicWebp);
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
  });

  it("should convert JPEG to WebP", async () => {
    const data = readFileSync(testJpgPath);
    const blob = new Blob([data], { type: "image/jpeg" });

    const result = await MagicWebp.convert(blob, 80, false);

    expect(result).toBeInstanceOf(MagicWebp);
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
  });

  it("should convert GIF to WebP", async () => {
    const data = readFileSync(testGifPath);
    const blob = new Blob([data], { type: "image/gif" });

    const result = await MagicWebp.convert(blob, 75, false);

    expect(result).toBeInstanceOf(MagicWebp);
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
  });

  it("should convert from Uint8Array", async () => {
    const data = readFileSync(testPngPath);
    const uint8Array = new Uint8Array(data);

    const result = await MagicWebp.convert(uint8Array, 75, false);

    expect(result).toBeInstanceOf(MagicWebp);
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
  });

  it("should use default quality (75) and lossless (false)", async () => {
    const data = readFileSync(testPngPath);
    const blob = new Blob([data], { type: "image/png" });

    const result = await MagicWebp.convert(blob);

    expect(result).toBeInstanceOf(MagicWebp);
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
  });

  it("should handle different quality levels", async () => {
    const data = readFileSync(testJpgPath);
    const blob = new Blob([data], { type: "image/jpeg" });

    const lowQuality = await MagicWebp.convert(blob, 50, false);
    const highQuality = await MagicWebp.convert(blob, 95, false);

    expect(lowQuality.toBytes().length).toBeLessThan(highQuality.toBytes().length);
  });

  it("should allow chaining operations after conversion", async () => {
    const data = readFileSync(testPngPath);
    const blob = new Blob([data], { type: "image/png" });

    const converted = await MagicWebp.convert(blob, 75, false);
    const resized = await converted.resize(100, 100, { mode: "cover" });

    expect(resized.width).toBe(100);
    expect(resized.height).toBe(100);
  });

  it("should handle concurrent conversions", async () => {
    const pngData = readFileSync(testPngPath);
    const jpgData = readFileSync(testJpgPath);
    const gifData = readFileSync(testGifPath);

    const pngBlob = new Blob([pngData], { type: "image/png" });
    const jpgBlob = new Blob([jpgData], { type: "image/jpeg" });
    const gifBlob = new Blob([gifData], { type: "image/gif" });

    const [png, jpg, gif] = await Promise.all([
      MagicWebp.convert(pngBlob, 75, false),
      MagicWebp.convert(jpgBlob, 75, false),
      MagicWebp.convert(gifBlob, 75, false),
    ]);

    expect(png.width).toBeGreaterThan(0);
    expect(jpg.width).toBeGreaterThan(0);
    expect(gif.width).toBeGreaterThan(0);
  });

  it("should throw error for unsupported format", async () => {
    const invalidData = new Uint8Array([0, 1, 2, 3, 4, 5]);
    const blob = new Blob([invalidData], { type: "application/octet-stream" });

    await expect(MagicWebp.convert(blob, 75, false)).rejects.toThrow();
  });
});

