# 🎨 magic-webp

Browser-based **animated WebP** processing via WebAssembly. Crop, resize, and transform animated WebP files directly in the browser using native libwebp compiled with Emscripten.

## ✨ Features

- 🎬 **Animated WebP support** — preserves all frames and timing
- ✂️ **Crop** — extract regions from animated WebP
- 📐 **Resize** — exact dimensions or fit within bounds
- 🚀 **Fast** — native libwebp via WASM
- 🌐 **Browser-only** — no server required
- 📦 **Zero dependencies** — pure WebAssembly
- 🔒 **Thread-safe** — concurrent operations are automatically queued

## 🚀 Quick Start

```typescript
import { MagicWebp } from 'magic-webp';

// Load animated WebP
const img = await MagicWebp.fromFile(file);

// Crop to 200x200 from top-left
const cropped = await img.crop(0, 0, 200, 200);

// Resize to exact dimensions
const resized = await img.resize(400, 300);

// Resize to fit within bounds (preserves aspect ratio)
const fitted = await img.resizeFit(500, 500);

// Get result as Blob
const blob = cropped.toBlob();

// Or chain operations
const result = await MagicWebp.fromUrl('animated.webp')
  .then(img => img.crop(10, 10, 300, 300))
  .then(img => img.resizeFit(200, 200))
  .then(img => img.toBlob());
```

## 📦 Installation

```bash
npm install magic-webp
# or
pnpm add magic-webp
```

## 🛠️ Development

### Prerequisites

- Node.js 18+
- pnpm
- Emscripten SDK (automatically installed)

### Build

```bash
# Install dependencies
pnpm install

# Build WASM module
pnpm run build:wasm

# Run demo
pnpm run demo

# Run tests
pnpm test
```

### Project Structure

```
magic-webp/
├── src-c/           # C source code
│   ├── magic_webp.c # Core image operations
│   └── animation.c  # Animated WebP processing
├── src-js/          # TypeScript wrapper
│   └── index.ts     # Main API
├── libwebp/         # libwebp submodule
├── pkg/             # Built WASM module
├── demo/            # Demo application
└── CMakeLists.txt   # Build configuration
```

## 🔧 How It Works

1. **libwebp** is compiled to WebAssembly using Emscripten
2. C functions process animated WebP frame-by-frame
3. TypeScript wrapper provides a clean API
4. All processing happens in the browser

## 📝 API Reference

### `MagicWebp`

#### Static Methods

- `fromFile(file: File): Promise<MagicWebp>`
- `fromBlob(blob: Blob): Promise<MagicWebp>`
- `fromUrl(url: string): Promise<MagicWebp>`

#### Instance Methods

- `crop(x: number, y: number, width: number, height: number): Promise<MagicWebp>`
- `resize(width: number, height: number): Promise<MagicWebp>`
- `resizeFit(maxWidth: number, maxHeight: number): Promise<MagicWebp>`
- `toBlob(): Blob`
- `toBytes(): Uint8Array`
- `toDataUrl(): Promise<string>`
- `toObjectUrl(): string`

**Note:** All transformation methods (`crop`, `resize`, `resizeFit`) are now asynchronous and return `Promise<MagicWebp>`. Operations are automatically queued to ensure thread-safety.

### Standalone Functions

```typescript
import { cropWebp, resizeWebp, resizeFitWebp } from 'magic-webp';

const blob = await cropWebp(file, { x: 0, y: 0, width: 200, height: 200 });
const blob2 = await resizeWebp(file, { width: 400, height: 300 });
const blob3 = await resizeFitWebp(file, { maxWidth: 500, maxHeight: 500 });
```

## 🎯 Use Cases

- Image editors in the browser
- Thumbnail generation
- Animated sticker processing
- WebP optimization tools
- Social media image tools

## 🔒 Thread Safety

All operations are automatically queued to prevent race conditions. You can safely call multiple operations concurrently:

```typescript
// These operations will be queued and executed sequentially
const [cropped, resized, fitted] = await Promise.all([
  img.crop(0, 0, 100, 100),
  img.resize(200, 200),
  img.resizeFit(150, 150)
]);

// Process multiple images concurrently - also safe!
const results = await Promise.all(
  images.map(img => img.resize(100, 100))
);
```

## 🧪 Testing

```bash
# Run all tests
pnpm test

# Watch mode
pnpm test:watch

# Coverage
pnpm test:coverage
```

## 📄 License

MIT

## 🙏 Credits

- [libwebp](https://github.com/webmproject/libwebp) — Google's WebP library
- [Emscripten](https://emscripten.org/) — C/C++ to WebAssembly compiler

## 🤝 Contributing

Contributions welcome! Please open an issue or PR.

---

Made with ❤️ using WebAssembly

