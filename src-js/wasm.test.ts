// @vitest-environment node
/**
 * Integration tests against the real compiled WASM binary.
 *
 * We intentionally bypass magic_webp.js (which uses `import * from *.wasm`
 * — a bundler-only static import) and instead:
 *   1. import magic_webp_bg.js  — pure JS glue, no .wasm import
 *   2. read magic_webp_bg.wasm  — via Node.js fs
 *   3. WebAssembly.instantiate  — wire up imports / exports manually
 *
 * This lets us test the real WASM binary in vitest (Node env) without
 * needing vite-plugin-wasm or a headless browser.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// ── WASM glue (pure JS, safe to import in Node) ───────────────────────────
// magic_webp_bg.js has no .wasm import of its own — it only exports helpers
// and exports __wbg_set_wasm() which we call after instantiation.
import * as bgJs from "../pkg/magic_webp_bg.js";

// ── Types ──────────────────────────────────────────────────────────────────

interface WasmResult {
  data(): Uint8Array;
  width(): number;
  height(): number;
  free(): void;
}

interface WasmModule {
  crop(
    data: Uint8Array,
    imgW: number, imgH: number,
    x: number, y: number,
    cropW: number, cropH: number,
  ): WasmResult;
  resize(
    data: Uint8Array,
    imgW: number, imgH: number,
    newW: number, newH: number,
  ): WasmResult;
  resize_fit(
    data: Uint8Array,
    imgW: number, imgH: number,
    maxW: number, maxH: number,
  ): WasmResult;
}

// ── WASM bootstrap ─────────────────────────────────────────────────────────

let wasm: WasmModule = null!;

beforeAll(async () => {
  const __dir = dirname(fileURLToPath(import.meta.url));
  const wasmBytes = readFileSync(resolve(__dir, "..", "pkg", "magic_webp_bg.wasm"));

  // The WASM module imports its JS helpers under this namespace
  // (matches what wasm-bindgen embeds in the binary).
  const imports = { "./magic_webp_bg.js": bgJs as Record<string, WebAssembly.ImportValue> };
  const { instance } = await WebAssembly.instantiate(wasmBytes, imports);

  // Wire glue → WASM exports, then call wasm-bindgen init
  (bgJs as any).__wbg_set_wasm(instance.exports);
  (instance.exports as any).__wbindgen_start?.();

  wasm = bgJs as unknown as WasmModule;
});

// ── Pixel helpers ──────────────────────────────────────────────────────────

function solid(w: number, h: number, r: number, g: number, b: number, a = 255): Uint8Array {
  const buf = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) buf.set([r, g, b, a], i * 4);
  return buf;
}

function px(data: Uint8Array, w: number, x: number, y: number): number[] {
  const off = (y * w + x) * 4;
  return [data[off], data[off + 1], data[off + 2], data[off + 3]];
}

// ── crop ───────────────────────────────────────────────────────────────────

describe("wasm crop", () => {
  it("crop is a function", () => {
    expect(typeof wasm.crop).toBe("function");
  });

  it("returns correct dimensions", () => {
    const r = wasm.crop(solid(10, 8, 0, 0, 0), 10, 8, 2, 1, 5, 4);
    expect(r.width()).toBe(5);
    expect(r.height()).toBe(4);
    r.free();
  });

  it("data length equals width × height × 4", () => {
    const r = wasm.crop(solid(8, 6, 0, 0, 0), 8, 6, 1, 1, 4, 3);
    expect(r.data().length).toBe(4 * 3 * 4);
    r.free();
  });

  it("preserves pixel colour", () => {
    const r = wasm.crop(solid(4, 4, 255, 0, 128), 4, 4, 1, 1, 2, 2);
    const d = r.data();
    expect(px(d, 2, 0, 0)).toEqual([255, 0, 128, 255]);
    expect(px(d, 2, 1, 1)).toEqual([255, 0, 128, 255]);
    r.free();
  });

  it("throws when crop region is out of bounds", () => {
    expect(() => wasm.crop(solid(4, 4, 0, 0, 0), 4, 4, 3, 0, 2, 2)).toThrow();
  });
});



// ── resize ─────────────────────────────────────────────────────────────────

describe("wasm resize", () => {
  it("resize is a function", () => {
    expect(typeof wasm.resize).toBe("function");
  });

  it("downscale — correct dimensions", () => {
    const r = wasm.resize(solid(8, 6, 0, 0, 0), 8, 6, 4, 3);
    expect(r.width()).toBe(4);
    expect(r.height()).toBe(3);
    r.free();
  });

  it("upscale — correct dimensions", () => {
    const r = wasm.resize(solid(4, 4, 0, 0, 0), 4, 4, 16, 16);
    expect(r.width()).toBe(16);
    expect(r.height()).toBe(16);
    r.free();
  });

  it("data length matches dimensions", () => {
    const r = wasm.resize(solid(12, 8, 0, 0, 0), 12, 8, 7, 5);
    expect(r.data().length).toBe(r.width() * r.height() * 4);
    r.free();
  });

  it("throws on zero width", () => {
    expect(() => wasm.resize(solid(4, 4, 0, 0, 0), 4, 4, 0, 4)).toThrow();
  });

  it("throws on zero height", () => {
    expect(() => wasm.resize(solid(4, 4, 0, 0, 0), 4, 4, 4, 0)).toThrow();
  });
});

// ── resize_fit ─────────────────────────────────────────────────────────────

describe("wasm resize_fit", () => {
  it("resize_fit is a function", () => {
    expect(typeof wasm.resize_fit).toBe("function");
  });

  it("landscape: fits within square bounds, aspect preserved", () => {
    // 400×200 (2:1) → max 100×100 → expect 100×50
    const r = wasm.resize_fit(solid(400, 200, 0, 0, 0), 400, 200, 100, 100);
    expect(r.width()).toBeLessThanOrEqual(100);
    expect(r.height()).toBeLessThanOrEqual(100);
    expect(r.width() / r.height()).toBeCloseTo(2, 0);
    r.free();
  });

  it("portrait: fits within square bounds", () => {
    // 200×400 (1:2) → max 100×100 → expect 50×100
    const r = wasm.resize_fit(solid(200, 400, 0, 0, 0), 200, 400, 100, 100);
    expect(r.width()).toBeLessThanOrEqual(100);
    expect(r.height()).toBeLessThanOrEqual(100);
    r.free();
  });

  it("data length matches dimensions", () => {
    const r = wasm.resize_fit(solid(80, 60, 0, 0, 0), 80, 60, 40, 40);
    expect(r.data().length).toBe(r.width() * r.height() * 4);
    r.free();
  });

  it("throws on zero max-width", () => {
    expect(() => wasm.resize_fit(solid(4, 4, 0, 0, 0), 4, 4, 0, 100)).toThrow();
  });

  it("throws on zero max-height", () => {
    expect(() => wasm.resize_fit(solid(4, 4, 0, 0, 0), 4, 4, 100, 0)).toThrow();
  });
});

// ── ProcessResult memory management ───────────────────────────────────────

describe("wasm ProcessResult memory", () => {
  it("free() does not throw", () => {
    const r = wasm.crop(solid(4, 4, 0, 0, 0), 4, 4, 0, 0, 2, 2);
    expect(() => r.free()).not.toThrow();
  });

  it("data() returns a Uint8Array", () => {
    const r = wasm.resize(solid(4, 4, 10, 20, 30), 4, 4, 2, 2);
    expect(r.data()).toBeInstanceOf(Uint8Array);
    r.free();
  });
});
