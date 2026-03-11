<div align="center">

# 🎨 magic-webp

**Fast WebP image processing in the browser using WebAssembly**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)](https://www.typescriptlang.org/)
[![WebAssembly](https://img.shields.io/badge/WebAssembly-libwebp-654FF0)](https://developers.google.com/speed/webp)

Process WebP images (static and animated) directly in the browser with native performance.
Built on top of Google's libwebp compiled to WebAssembly.

[Features](#-features) • [Installation](#-installation) • [Quick Start](#-quick-start) • [API](#-api) • [Development](#-development)

</div>

---

## ✨ Features

- 🖼️ **WebP Support** — Both static and animated WebP images
- ✂️ **Crop** — Extract regions (preserves animation frames)
- 📐 **Resize** — Multiple modes: cover, contain, fill, inside, outside
- 🎚️ **Quality Control** — Adjustable output quality (0-100, lossless)
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

```typescript
import { MagicWebp } from 'magic-webp';

// Load a WebP image (static or animated)
const file = document.querySelector('input[type="file"]').files[0];
const img = await MagicWebp.fromBlob(file);

// Resize to 400x400 (cover mode - fills dimensions, crops excess)
const resized = await img.resize(400, 400, { mode: 'cover', quality: 90 });

// Get result as Blob
const blob = resized.toBlob();

// Download or display
const url = URL.createObjectURL(blob);
```

## 📖 API

### Loading Images

```typescript
// From File/Blob
const img = await MagicWebp.fromBlob(blob);
const img = await MagicWebp.fromFile(file);

// From URL
const img = await MagicWebp.fromUrl('https://example.com/image.webp');

// From Uint8Array
const img = await MagicWebp.fromBytes(uint8Array);
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
  quality: 90       // 0-100, default 90
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
  quality?: number;  // 0-100, default: 90
}
```

### Quality Recommendations

- **60-70**: High compression, visible artifacts (good for thumbnails)
- **75-85**: Balanced quality/size (recommended for most cases)
- **90-95**: High quality, minimal artifacts (for important images)
- **100**: Lossless, largest file size (perfect quality preservation)

## 💡 Examples

### Avatar (square, centered)

```typescript
const avatar = await img.resize(200, 200, { mode: 'cover', quality: 90 });
```

### Product Preview (fit inside container)

```typescript
const preview = await img.resize(300, 300, { mode: 'contain', quality: 85 });
```

### Banner (crop from top)

```typescript
const banner = await img.resize(1200, 400, {
  mode: 'cover',
  position: 'top',
  quality: 90
});
```

### Thumbnail (never enlarge small images)

```typescript
const thumb = await img.resize(150, 150, { mode: 'inside', quality: 75 });
```

### Chaining Operations

```typescript
const result = await img
  .crop(100, 100, 400, 400)
  .then(cropped => cropped.resize(200, 200, { mode: 'contain' }));
```

### Concurrent Processing (thread-safe)

```typescript
// All operations are automatically queued
const [avatar, thumb, banner] = await Promise.all([
  img.resize(200, 200, { mode: 'cover' }),
  img.resize(150, 150, { mode: 'inside' }),
  img.resize(1200, 400, { mode: 'cover', position: 'top' })
]);
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

## 📄 License

MIT © [Ilia Medzhidov](https://github.com/medzhidov)

## 🙏 Acknowledgments

- [libwebp](https://developers.google.com/speed/webp) - Google's WebP library
- [Emscripten](https://emscripten.org/) - C/C++ to WebAssembly compiler

---

<div align="center">

**Made with ❤️ for the web**

</div>
