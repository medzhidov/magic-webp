import { describe, it, expect } from "vitest";
import { MagicWebp } from "./index.js";
import { readFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));
const testPngPath = resolve(__dir, "../demo/assets/test.png");
const testJpgPath = resolve(__dir, "../demo/assets/test.jpg");
const testWebpPath = resolve(__dir, "../demo/assets/test-animated.webp");

describe("MagicWebp format validation", () => {
  it("should accept valid WebP files", async () => {
    const data = readFileSync(testWebpPath);
    const blob = new Blob([data], { type: "image/webp" });

    // Should not throw
    const img = await MagicWebp.fromBlob(blob);
    expect(img).toBeInstanceOf(MagicWebp);
    expect(img.width).toBeGreaterThan(0);
    expect(img.height).toBeGreaterThan(0);
  });

  it("should reject PNG files in fromBlob", async () => {
    const data = readFileSync(testPngPath);
    const blob = new Blob([data], { type: "image/png" });

    await expect(MagicWebp.fromBlob(blob)).rejects.toThrow(
      /Invalid WebP format.*convert/i
    );
  });

  it("should reject JPEG files in fromBlob", async () => {
    const data = readFileSync(testJpgPath);
    const blob = new Blob([data], { type: "image/jpeg" });

    await expect(MagicWebp.fromBlob(blob)).rejects.toThrow(
      /Invalid WebP format.*convert/i
    );
  });

  it("should reject PNG files in fromBytes", async () => {
    const data = readFileSync(testPngPath);
    const uint8Array = new Uint8Array(data);

    await expect(MagicWebp.fromBytes(uint8Array)).rejects.toThrow(
      /Invalid WebP format.*convert/i
    );
  });

  it("should reject JPEG files in fromBytes", async () => {
    const data = readFileSync(testJpgPath);
    const uint8Array = new Uint8Array(data);

    await expect(MagicWebp.fromBytes(uint8Array)).rejects.toThrow(
      /Invalid WebP format.*convert/i
    );
  });

  it("should reject invalid data (too short)", async () => {
    const invalidData = new Uint8Array([0, 1, 2, 3]);

    await expect(MagicWebp.fromBytes(invalidData)).rejects.toThrow(
      /Invalid WebP format/i
    );
  });

  it("should reject data with wrong RIFF header", async () => {
    const invalidData = new Uint8Array(20);
    invalidData.set([0x52, 0x49, 0x46, 0x46]); // "RIFF"
    invalidData.set([0x00, 0x00, 0x00, 0x00], 4); // size
    invalidData.set([0x4A, 0x50, 0x45, 0x47], 8); // "JPEG" instead of "WEBP"

    await expect(MagicWebp.fromBytes(invalidData)).rejects.toThrow(
      /Invalid WebP format/i
    );
  });

  it("should suggest using convert() for non-WebP formats", async () => {
    const data = readFileSync(testPngPath);
    const blob = new Blob([data], { type: "image/png" });

    try {
      await MagicWebp.fromBlob(blob);
      expect.fail("Should have thrown an error");
    } catch (e: any) {
      expect(e.message).toContain("convert()");
    }
  });

  it("should allow converting PNG to WebP and then loading", async () => {
    const data = readFileSync(testPngPath);
    const blob = new Blob([data], { type: "image/png" });

    // Convert PNG to WebP
    const converted = await MagicWebp.convert(blob, 75, false);
    expect(converted).toBeInstanceOf(MagicWebp);

    // Should be able to use the converted image
    const cropped = await converted.crop(0, 0, 100, 100);
    expect(cropped).toBeInstanceOf(MagicWebp);
  });

  it("should allow converting JPEG to WebP and then loading", async () => {
    const data = readFileSync(testJpgPath);
    const blob = new Blob([data], { type: "image/jpeg" });

    // Convert JPEG to WebP
    const converted = await MagicWebp.convert(blob, 75, false);
    expect(converted).toBeInstanceOf(MagicWebp);

    // Should be able to use the converted image
    const resized = await converted.resize(200, 200, { mode: "cover" });
    expect(resized).toBeInstanceOf(MagicWebp);
  });

  it("should validate WebP format by checking RIFF and WEBP signatures", async () => {
    // Use a real WebP file to test format validation
    const data = readFileSync(testWebpPath);
    const uint8Array = new Uint8Array(data);

    // Should pass format validation
    const img = await MagicWebp.fromBytes(uint8Array);
    expect(img).toBeInstanceOf(MagicWebp);
    expect(img.width).toBeGreaterThan(0);
    expect(img.height).toBeGreaterThan(0);
  });
});

