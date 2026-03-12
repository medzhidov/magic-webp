/**
 * Tests for concurrent operations and thread-safety
 */
import { describe, it, expect } from "vitest";
import { MagicWebp } from "./index.js";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const testImagePath = resolve(__dir, "..", "demo", "assets", "test-animated.webp");

describe("MagicWebp concurrent operations", () => {
  it("should handle sequential operations correctly", async () => {
    const data = readFileSync(testImagePath);
    const blob = new Blob([data], { type: "image/webp" });

    const img = await MagicWebp.fromBlob(blob);

    // Sequential operations
    const cropped = await img.crop(0, 0, 100, 100);
    expect(cropped.width).toBe(100);
    expect(cropped.height).toBe(100);

    const resized = await img.resize(200, 200, { mode: 'cover' });
    expect(resized.width).toBe(200);
    expect(resized.height).toBe(200);
  });

  it("should handle concurrent operations safely (Promise.all)", async () => {
    const data = readFileSync(testImagePath);
    const blob = new Blob([data], { type: "image/webp" });

    const img = await MagicWebp.fromBlob(blob);

    // Concurrent operations - should be queued internally
    const [cropped, cover, contain] = await Promise.all([
      img.crop(10, 10, 100, 100),
      img.resize(200, 200, { mode: 'cover' }),
      img.resize(150, 150, { mode: 'contain' })
    ]);

    // All operations should complete successfully
    expect(cropped.width).toBe(100);
    expect(cropped.height).toBe(100);

    expect(cover.width).toBe(200);
    expect(cover.height).toBe(200);

    expect(contain.width).toBeLessThanOrEqual(150);
    expect(contain.height).toBeLessThanOrEqual(150);
  });

  it("should handle multiple images processed concurrently", async () => {
    const data = readFileSync(testImagePath);
    const blob1 = new Blob([data], { type: "image/webp" });
    const blob2 = new Blob([data], { type: "image/webp" });
    const blob3 = new Blob([data], { type: "image/webp" });

    // Load multiple images
    const [img1, img2, img3] = await Promise.all([
      MagicWebp.fromBlob(blob1),
      MagicWebp.fromBlob(blob2),
      MagicWebp.fromBlob(blob3)
    ]);

    // Process them concurrently
    const [result1, result2, result3] = await Promise.all([
      img1.crop(0, 0, 50, 50),
      img2.resize(100, 100, { mode: 'cover' }),
      img3.resize(80, 80, { mode: 'contain' })
    ]);

    // All should complete successfully
    expect(result1.width).toBe(50);
    expect(result2.width).toBe(100);
    expect(result3.width).toBeLessThanOrEqual(80);
  });

  it("should handle chained operations", async () => {
    const data = readFileSync(testImagePath);
    const blob = new Blob([data], { type: "image/webp" });

    const img = await MagicWebp.fromBlob(blob);

    // Chain operations
    const result = await img
      .crop(10, 10, 200, 200)
      .then(cropped => cropped.resize(100, 100, { mode: 'cover' }))
      .then(resized => resized.resize(80, 80, { mode: 'contain' }));

    expect(result.width).toBeLessThanOrEqual(80);
    expect(result.height).toBeLessThanOrEqual(80);
  });

  it("should handle errors in concurrent operations", async () => {
    const data = readFileSync(testImagePath);
    const blob = new Blob([data], { type: "image/webp" });
    
    const img = await MagicWebp.fromBlob(blob);
    
    // One operation will fail (invalid crop), others should succeed
    const results = await Promise.allSettled([
      img.crop(0, 0, 100, 100),  // Valid
      img.crop(10000, 10000, 100, 100),  // Invalid - out of bounds
      img.resize(200, 200)  // Valid
    ]);
    
    expect(results[0].status).toBe("fulfilled");
    expect(results[1].status).toBe("rejected");
    expect(results[2].status).toBe("fulfilled");
  });

  it("should handle rapid-fire operations", async () => {
    const data = readFileSync(testImagePath);
    const blob = new Blob([data], { type: "image/webp" });

    const img = await MagicWebp.fromBlob(blob);

    // Fire off many operations at once
    const operations = Array.from({ length: 10 }, (_, i) =>
      img.resize(50 + i * 10, 50 + i * 10, { mode: 'cover' })
    );

    const results = await Promise.all(operations);

    // All should complete
    expect(results).toHaveLength(10);
    results.forEach((result, i) => {
      expect(result.width).toBe(50 + i * 10);
      expect(result.height).toBe(50 + i * 10);
    });
  });
});

describe("MagicWebp resize modes", () => {
  it("should resize with cover mode (fill and crop)", async () => {
    const data = readFileSync(testImagePath);
    const blob = new Blob([data], { type: "image/webp" });
    const img = await MagicWebp.fromBlob(blob);

    const result = await img.resize(200, 200, { mode: 'cover' });

    expect(result.width).toBe(200);
    expect(result.height).toBe(200);
  });

  it("should resize with contain mode (fit inside)", async () => {
    const data = readFileSync(testImagePath);
    const blob = new Blob([data], { type: "image/webp" });
    const img = await MagicWebp.fromBlob(blob);

    const result = await img.resize(200, 200, { mode: 'contain' });

    expect(result.width).toBeLessThanOrEqual(200);
    expect(result.height).toBeLessThanOrEqual(200);
  });

  it("should resize with fill mode (stretch)", async () => {
    const data = readFileSync(testImagePath);
    const blob = new Blob([data], { type: "image/webp" });
    const img = await MagicWebp.fromBlob(blob);

    const result = await img.resize(200, 300, { mode: 'fill' });

    expect(result.width).toBe(200);
    expect(result.height).toBe(300);
  });

  it("should resize with inside mode (never enlarge)", async () => {
    const data = readFileSync(testImagePath);
    const blob = new Blob([data], { type: "image/webp" });
    const img = await MagicWebp.fromBlob(blob);

    // First make it small
    const small = await img.resize(50, 50, { mode: 'cover' });

    // Try to enlarge with inside mode - should keep original size
    const result = await small.resize(200, 200, { mode: 'inside' });

    expect(result.width).toBe(50);
    expect(result.height).toBe(50);
  });

  it("should use default mode (cover) when not specified", async () => {
    const data = readFileSync(testImagePath);
    const blob = new Blob([data], { type: "image/webp" });
    const img = await MagicWebp.fromBlob(blob);

    const result = await img.resize(200, 200);

    expect(result.width).toBe(200);
    expect(result.height).toBe(200);
  });
});

