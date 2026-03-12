<div align="center">

# 🎨 magic-webp

**Convert PNG/JPEG/GIF to WebP and process images in the browser using WebAssembly**

[![npm version](https://img.shields.io/npm/v/magic-webp.svg)](https://www.npmjs.com/package/magic-webp)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)](https://www.typescriptlang.org/)
[![WebAssembly](https://img.shields.io/badge/WebAssembly-libwebp-654FF0)](https://developers.google.com/speed/webp)

Convert images to WebP and process them (crop, resize) directly in the browser with native performance.
Built on top of Google's libwebp compiled to WebAssembly.

**[🎮 Live Demo](https://medzhidov.github.io/magic-webp/)** • [Features](#-features) • [Installation](#-installation) • [Quick Start](#-quick-start) • [API](#-api)

</div>

---

## ✨ Features

- 🔄 **Convert to WebP** — PNG, JPEG, GIF → WebP (60-80% smaller files)
- 🎬 **Animated GIF Support** — Converts animated GIFs to animated WebP
- ✂️ **Crop** — Extract regions (preserves animation frames)
- 📐 **Resize** — Multiple modes: cover, contain, fill, inside, outside
- 🎚️ **Quality Control** — Lossy (0-100) or lossless compression
- 🚀 **Fast** — Native libwebp with SIMD optimizations (5-10x faster)
- 🌐 **Browser-first** — No server required, runs entirely client-side
- 🔒 **Thread-safe** — Automatic operation queuing for concurrent calls
- 📦 **Zero dependencies** — Pure WebAssembly, no external libraries

## 📦 Installation

```bash
npm install magic-webp
# or
pnpm add magic-webp
# or
yarn add magic-webp
```

## 🚀 Quick Start

### Convert Images to WebP

```typescript
import { MagicWebp } from 'magic-webp';

// Convert PNG/JPEG/GIF to WebP
const file = document.querySelector('input[type="file"]').files[0];
const webp = await MagicWebp.convert(file, 75, false);  // quality: 75, lossless: false

// Get the result
const blob = webp.toBlob();
const url = URL.createObjectURL(blob);

// Download or display
document.querySelector('img').src = url;
```

### Process WebP Images

```typescript
import { MagicWebp } from 'magic-webp';

// Load WebP image
const webp = await MagicWebp.fromBlob(file);

// Resize
const resized = await webp.resize(400, 400, { mode: 'cover', quality: 75 });

// Crop
const cropped = await webp.crop(0, 0, 200, 200, 75);

// Get result
const blob = resized.toBlob();
```

### Using Web Worker (Recommended for Production)

```typescript
import { MagicWebpWorker } from 'magic-webp';

const worker = new MagicWebpWorker('/worker.js');

// Convert in background
const blob = await worker.convert(file, 75, false);

// Or load and process
await worker.load(webpFile);
const resized = await worker.resize(400, 400, { mode: 'cover' });

worker.terminate();
```

> **✨ Benefits:** Non-blocking UI, better performance, automatic request queuing

### ⚠️ Important: Web Worker Requirements

**1. Same-Origin Policy**
- Worker file **must be served from the same domain** as your app
- ❌ Won't work: `new MagicWebpWorker('https://cdn.example.com/worker.js')`
- ✅ Works: `new MagicWebpWorker('/worker.js')` (same domain)

**2. Module Type**
- Worker must be loaded as ES module (`type: 'module'`)
- Already handled by `MagicWebpWorker` constructor

**3. CORS Headers (if serving from different path)**
- If worker is on subdomain, ensure proper CORS headers:
  ```
  Access-Control-Allow-Origin: *
  ```

**4. File Serving**
- Worker file must be accessible via HTTP/HTTPS
- ❌ Won't work with `file://` protocol (local files)
- ✅ Use local dev server: `npx serve` or `python -m http.server`

**5. Build Tools**
- **Vite**: Worker is automatically bundled
  ```typescript
  const webp = new MagicWebpWorker(
    new URL('./worker.ts', import.meta.url).href
  );
  ```
- **Webpack**: Use `worker-loader` or native Worker support
- **Create React App**: Place worker in `public/` folder

### 6. Vite Configuration (Important!)

If using Vite, you need to configure it to properly handle WASM files:

**Step 1: Update `vite.config.ts`**

```typescript
export default defineConfig({
  // ... other config

  optimizeDeps: {
    exclude: ['magic-webp'], // Don't pre-bundle magic-webp
  },

  assetsInclude: ['**/*.wasm'], // Treat .wasm as assets

  build: {
    rollupOptions: {
      output: {
        assetFileNames: (chunkInfo) => {
          // Keep WASM files unhashed so Emscripten can find them
          if (chunkInfo.names?.includes('magic_webp.wasm')) {
            return 'assets/[name].[ext]';
          }
          return 'assets/[name]-[hash].[ext]';
        },
      },
    },
  },
});
```

**Step 2: Copy WASM to public folder (for development)**

```bash
cp node_modules/magic-webp/pkg/magic_webp.wasm public/
```

**Why?** Vite needs to serve WASM files with correct MIME type (`application/wasm`). Without this config, you'll get errors like:
- ❌ `Failed to execute 'compile' on 'WebAssembly': Incorrect response MIME type`
- ❌ `expected magic word 00 61 73 6d, found 3c 21 44 4f`

**Alternative: Main Thread API (No Vite config needed)**

If you don't want to configure Vite, use the main thread API instead:

```typescript
import { MagicWebp } from 'magic-webp';

const img = await MagicWebp.fromBlob(file);
const resized = await img.resize(400, 400, { mode: 'cover' });
const blob = resized.toBlob();
```

⚠️ Note: Main thread API blocks UI during processing, but requires no build configuration.

**Common Issues:**
```typescript
// ❌ WRONG: Cross-origin
const webp = new MagicWebpWorker('https://cdn.com/worker.js');
// Error: Failed to construct 'Worker': Script at '...' cannot be accessed from origin '...'

// ✅ CORRECT: Same origin
const webp = new MagicWebpWorker('/worker.js');

// ✅ CORRECT: Relative path
const webp = new MagicWebpWorker('./worker.js');

// ✅ CORRECT: Vite/Webpack (bundled)
const webp = new MagicWebpWorker(
  new URL('./worker.ts', import.meta.url).href
);
```

### Alternative: Main Thread (Simpler, but blocks UI)

```typescript
import { MagicWebp } from 'magic-webp';

const file = document.querySelector('input[type="file"]').files[0];
const img = await MagicWebp.fromBlob(file);
const resized = await img.resize(400, 400, { mode: 'cover', quality: 75 });  // 75 = balanced
const blob = resized.toBlob();
```

> **⚠️ Note:** Main thread usage blocks the UI during processing. Use `MagicWebpWorker` for production apps.

## 📖 API

### Convert Images

```typescript
import { MagicWebp } from 'magic-webp';

// Convert PNG/JPEG/GIF to WebP
const webp = await MagicWebp.convert(
  blob,           // File or Blob
  75,             // quality: 0-100 (default: 75)
  false           // lossless: true/false (default: false)
);

// Animated GIF → Animated WebP (preserves all frames!)
const animatedWebp = await MagicWebp.convert(gifBlob, 75, false);
```

### Load WebP Images

```typescript
import { MagicWebp } from 'magic-webp';

// From File/Blob (WebP only)
const webp = await MagicWebp.fromBlob(blob);

// From URL
const webp = await MagicWebp.fromUrl('https://example.com/image.webp');

// From Uint8Array
const webp = await MagicWebp.fromBytes(uint8Array);
```

### Process Images

```typescript
// Crop
const cropped = await webp.crop(x, y, width, height, quality);

// Resize
const resized = await webp.resize(width, height, { mode, position, quality });

// Get result
const blob = webp.toBlob();
const bytes = webp.toBytes();
```

### Using Web Worker

```typescript
import { MagicWebpWorker } from 'magic-webp';

const worker = new MagicWebpWorker('/worker.js');

// Convert
const blob = await worker.convert(file, 75, false);

// Load and process
await worker.load(webpFile);
const resized = await worker.resize(400, 400, { mode: 'cover' });

worker.terminate();
```

### Transformations

All transformation methods are **async** and return `Promise<MagicWebp>`.

#### Crop

```typescript
// Crop 200x200 region starting at (50, 50)
const cropped = await img.crop(50, 50, 200, 200, quality);
```

#### Resize

```typescript
// Cover - fills dimensions, crops excess (default)
const cover = await img.resize(400, 400, { mode: 'cover' });

// Contain - fits inside dimensions, preserves aspect ratio
const contain = await img.resize(400, 400, { mode: 'contain' });

// Fill - stretches to exact dimensions (may distort)
const fill = await img.resize(400, 400, { mode: 'fill' });

// Inside - like contain, but never enlarges
const inside = await img.resize(400, 400, { mode: 'inside' });

// Outside - like cover, but never reduces
const outside = await img.resize(400, 400, { mode: 'outside' });

// With position (for cover/outside modes)
const banner = await img.resize(1200, 400, {
  mode: 'cover',
  position: 'top',  // 'center', 'top', 'bottom', 'left', 'right', etc.
  quality: 75       // 0-100, default 75 (balanced - recommended)
});
```

### Output

```typescript
// As Blob
const blob = img.toBlob();

// As Uint8Array
const bytes = img.toBytes();

// As Data URL
const dataUrl = await img.toDataUrl();

// As Object URL
const objectUrl = img.toObjectUrl();
```

### Resize Options

```typescript
interface ResizeOptions {
  mode?: 'cover' | 'contain' | 'fill' | 'inside' | 'outside';  // default: 'cover'
  position?: 'center' | 'top' | 'bottom' | 'left' | 'right' |  // default: 'center'
             'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  quality?: number;  // 0-100, default: 75 (balanced)
}
```

**💡 Quality Recommendations:**

| Quality | File Size | Visual Quality | Use Case | Recommended For |
|---------|-----------|----------------|----------|-----------------|
| **60-70** | Smallest | Visible artifacts | Thumbnails, previews | Low priority images |
| **75-85** | Medium | Good balance | **Most web images** | ✅ **Default (75)** |
| **90-95** | Large | Excellent | Important photos | Hero images, portfolios |
| **100** | Largest | Perfect (lossless) | Archival, editing | When quality is critical |

### Quality Recommendations

- **60-70**: High compression, visible artifacts (good for thumbnails)
- **75-85**: Balanced quality/size (recommended for most cases)
- **90-95**: High quality, minimal artifacts (for important images)
- **100**: Lossless, largest file size (perfect quality preservation)

### Supported Formats

**Conversion (to WebP):**
- ✅ PNG → WebP (static)
- ✅ JPEG → WebP (static)
- ✅ GIF → WebP (animated, preserves all frames!)
- ✅ WebP → WebP (re-encode with different quality)

**Processing (WebP only):**
- ✅ Static WebP (crop, resize)
- ✅ Animated WebP (crop, resize - all frames processed)

**Output:**
- ✅ WebP (lossy or lossless)
- ✅ Animated WebP (preserves timing, loop count)

**Note:** All operations (crop, resize) work on both static and animated WebP. For animated images, each frame is processed individually while preserving animation metadata.

## 💡 Examples

### Convert and Optimize

```typescript
import { MagicWebp } from 'magic-webp';

// Simple conversion (PNG/JPEG → WebP)
const webp = await MagicWebp.convert(pngFile, 75, false);
const blob = webp.toBlob();  // 60-80% smaller!

// Lossless conversion (perfect quality)
const lossless = await MagicWebp.convert(pngFile, 100, true);

// Animated GIF → Animated WebP
const animatedWebp = await MagicWebp.convert(gifFile, 75, false);
// Preserves all frames and timing!

// Convert and resize in one go
const webp = await MagicWebp.convert(jpegFile, 80, false);
const thumbnail = await webp.resize(200, 200, { mode: 'cover' });
```

### Process WebP Images

```typescript
import { MagicWebpWorker } from 'magic-webp';

const worker = new MagicWebpWorker('/worker.js');
await worker.load(webpFile);

// Avatar - square 200x200, centered
const avatar = await worker.resize(200, 200, { mode: 'cover', quality: 85 });

// Product preview - fit inside 300x300
const preview = await worker.resize(300, 300, { mode: 'contain', quality: 75 });

// Banner - 1200x400, crop from top
const banner = await worker.resize(1200, 400, {
  mode: 'cover',
  position: 'top',
  quality: 90
});

// Crop specific region
const cropped = await worker.crop(50, 50, 200, 200, 75);

worker.terminate();
```

### Batch Processing

```typescript
import { MagicWebp } from 'magic-webp';

// Convert multiple images
const files = Array.from(fileInput.files);
const converted = await Promise.all(
  files.map(file => MagicWebp.convert(file, 75, false))
);

// Get all blobs
const blobs = converted.map(webp => webp.toBlob());
```



## 🔧 Advanced Usage

### Memory Management

```typescript
// Worker automatically manages memory, but you should terminate when done
const webp = new MagicWebpWorker('/worker.js');

// ... use worker ...

// Clean up when component unmounts or app closes
webp.terminate();
```

### Debug Mode

By default, magic-webp runs silently in production (no console logs). Enable debug mode for development:

```typescript
import { setDebugMode } from 'magic-webp';

// Enable debug logging (disabled by default)
setDebugMode(true);

// Now you'll see detailed logs:
// [magic-webp] Loading Emscripten WASM module...
// [magic-webp] WASM module ready
// [magic-webp] Processing 45678 bytes
// [magic-webp] Cropping: 0,0 200x200, quality: 75
// etc.

// Disable debug mode
setDebugMode(false);
```

**💡 Tip:** Enable debug mode only during development. In production, logs are automatically disabled for better performance and cleaner console.

### Error Handling

```typescript
const webp = new MagicWebpWorker('/worker.js');

try {
  await webp.load(file);
  const blob = await webp.resize(400, 400, { mode: 'cover' });
} catch (error) {
  console.error('Processing failed:', error);
  // Handle error (show message to user, retry, etc.)
}
```

### Multiple Workers (Parallel Processing)

```typescript
// Create multiple workers for parallel processing
const workers = [
  new MagicWebpWorker('/worker.js'),
  new MagicWebpWorker('/worker.js'),
  new MagicWebpWorker('/worker.js')
];

// Process multiple images in parallel
const results = await Promise.all(
  files.map((file, i) => {
    const worker = workers[i % workers.length];
    return worker.load(file).then(() =>
      worker.resize(400, 400, { mode: 'cover' })
    );
  })
);

// Clean up
workers.forEach(w => w.terminate());
```

### Browser Compatibility

- ✅ Chrome 80+
- ✅ Firefox 79+
- ✅ Safari 14+
- ✅ Edge 80+
- ❌ IE 11 (no WebAssembly support)

**Check before using:**
```typescript
if (typeof WebAssembly === 'undefined') {
  console.error('WebAssembly not supported');
  // Fallback to server-side processing
}

if (typeof Worker === 'undefined') {
  console.warn('Web Workers not supported, using main thread');
  // Use MagicWebp instead of MagicWebpWorker
}
```

## 🛠️ Development

### Prerequisites

- Node.js 18+
- pnpm (recommended) or npm
- Emscripten SDK (automatically installed)

### Setup

```bash
# Clone repository
git clone https://github.com/medzhidov/magic-webp.git
cd magic-webp

# Install dependencies
pnpm install

# Build WASM module
pnpm build:wasm

# Run demo
pnpm demo:watch
```

### Project Structure

```
magic-webp/
├── src-c/           # C source code
│   ├── animation.c  # WebP animation processing
│   └── magic_webp.c # Core functions
├── src-js/          # TypeScript API
│   ├── index.ts     # Main API
│   └── *.test.ts    # Tests
├── demo/            # Demo application
│   ├── index.html
│   ├── main.ts
│   └── worker.ts    # Web Worker for processing
├── tests/           # Native C tests
├── libwebp/         # Google's libwebp (submodule)
└── pkg/             # Built WASM output
```

### Build Commands

```bash
# Build WASM module
pnpm build:wasm

# Run TypeScript tests
pnpm test

# Run native C tests
pnpm test:native

# Run demo (dev server)
pnpm demo:watch

# Build demo for production
pnpm demo:build
```

### How It Works

1. **C Code** (`src-c/`) - Uses libwebp's WebPPicture API for high-quality image processing
2. **Animation Support** - Processes each frame individually, preserving timing and metadata
3. **Emscripten** - Compiles C code to WebAssembly with SIMD optimizations
4. **TypeScript API** (`src-js/`) - Provides clean, type-safe interface
5. **Operation Queue** - Ensures thread-safety by serializing WASM calls
6. **Web Worker** (demo) - Keeps UI responsive during processing

### Performance

- **5-10x faster** than pure JavaScript implementations
- **SIMD optimizations** (SSE2, NEON) for resize operations
- **Optimized cover mode** - single pass resize+crop (2x faster)
- **Minimal memory** - in-place operations where possible

## 📋 Quick Reference

### Resize Modes

| Mode | Behavior | Use Case |
|------|----------|----------|
| `cover` | Fills dimensions, crops excess | Avatars, thumbnails |
| `contain` | Fits inside, preserves aspect | Product images, previews |
| `fill` | Stretches to exact size | Backgrounds (may distort) |
| `inside` | Like contain, never enlarges | Thumbnails of small images |
| `outside` | Like cover, never reduces | Cropping large images |

### Position Options (for cover/outside)

| Position | Description |
|----------|-------------|
| `center` | Center of image (default) |
| `top` | Top center |
| `bottom` | Bottom center |
| `left` | Left center |
| `right` | Right center |
| `top-left` | Top left corner |
| `top-right` | Top right corner |
| `bottom-left` | Bottom left corner |
| `bottom-right` | Bottom right corner |

### Quality Guidelines

| Quality | File Size | Visual Quality | Use Case |
|---------|-----------|----------------|----------|
| 60-70 | Smallest | Visible artifacts | Thumbnails, previews |
| 75-85 | Medium | Good balance | Most web images |
| 90-95 | Large | Excellent | Important images, photos |
| 100 | Largest | Perfect (lossless) | Archival, editing |

## 📄 License

MIT © [Ilia Medzhidov](https://github.com/medzhidov)

## 🙏 Acknowledgments

- [libwebp](https://developers.google.com/speed/webp) - Google's WebP library
- [Emscripten](https://emscripten.org/) - C/C++ to WebAssembly compiler

---

<div align="center">

**Made with ❤️ for the web**

</div>
