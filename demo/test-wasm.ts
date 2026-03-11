import { MagicWebp } from "../src-js/index.js";

const output = document.getElementById("output")!;
const log = (...args: any[]) => {
  console.log(...args);
  output.textContent += args.join(" ") + "\n";
};

// Catch all errors
window.addEventListener("error", (e) => {
  log("❌ GLOBAL ERROR:", e.message);
  console.error(e);
});

window.addEventListener("unhandledrejection", (e) => {
  log("❌ UNHANDLED REJECTION:", e.reason);
  console.error(e);
});

async function runTests() {
  log("Starting tests...");
  await new Promise(resolve => setTimeout(resolve, 100)); // Give WASM time to load
  try {
    log("✓ MagicWebp imported");

    // Create a 4×4 red square PNG
    const canvas = document.createElement("canvas");
    canvas.width = 4;
    canvas.height = 4;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "red";
    ctx.fillRect(0, 0, 4, 4);

    const blob = await new Promise<Blob>((resolve) =>
      canvas.toBlob((b) => resolve(b!), "image/png")
    );
    log("✓ Created 4×4 test image");

    // Load into MagicWebp
    const img = await MagicWebp.fromBlob(blob);
    log(`✓ MagicWebp.fromBlob() → ${img.width}×${img.height}`);

    if (img.width !== 4 || img.height !== 4) {
      throw new Error(`Expected 4×4, got ${img.width}×${img.height}`);
    }

    // Test crop
    const cropped = img.crop(1, 1, 2, 2);
    log(`✓ crop(1,1,2,2) → ${cropped.width}×${cropped.height}`);
    if (cropped.width !== 2 || cropped.height !== 2) {
      throw new Error(
        `Crop failed: expected 2×2, got ${cropped.width}×${cropped.height}`
      );
    }

    // Test resize
    const resized = img.resize(8, 8);
    log(`✓ resize(8,8) → ${resized.width}×${resized.height}`);
    if (resized.width !== 8 || resized.height !== 8) {
      throw new Error(
        `Resize failed: expected 8×8, got ${resized.width}×${resized.height}`
      );
    }

    // Test resizeFit
    const fitted = img.resizeFit(2, 2);
    log(`✓ resizeFit(2,2) → ${fitted.width}×${fitted.height}`);
    if (fitted.width > 2 || fitted.height > 2) {
      throw new Error(
        `ResizeFit failed: ${fitted.width}×${fitted.height} exceeds 2×2`
      );
    }

    // Test WebP output
    const webpBlob = await img.toBlob(0.9);
    log(`✓ toBlob() → ${webpBlob.size} bytes, type: ${webpBlob.type}`);
    if (webpBlob.type !== "image/webp") {
      throw new Error(`Expected image/webp, got ${webpBlob.type}`);
    }

    log("\n🎉 ALL TESTS PASSED");
    output.className = "pass";
  } catch (err: any) {
    log("\n❌ TEST FAILED:", err.message);
    console.error(err);
    output.className = "fail";
  }
}

runTests();

