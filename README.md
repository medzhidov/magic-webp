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

// Resize with different modes
const cover = await img.resize(400, 400, { mode: 'cover' });     // Fill & crop
const contain = await img.resize(400, 400, { mode: 'contain' }); // Fit inside
const fill = await img.resize(400, 400, { mode: 'fill' });       // Stretch

// Cover with position
const banner = await img.resize(1200, 400, {
  mode: 'cover',
  position: 'top'  // Crop from top
});

// Get result as Blob
const blob = cover.toBlob();

// Chain operations
const result = await MagicWebp.fromUrl('animated.webp')
  .then(img => img.crop(10, 10, 300, 300))
  .then(img => img.resize(200, 200, { mode: 'contain' }))
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

**Transformations:**
- `crop(x: number, y: number, width: number, height: number): Promise<MagicWebp>`
- `resize(width: number, height: number, options?: ResizeOptions): Promise<MagicWebp>`

**Output:**
- `toBlob(): Blob`
- `toBytes(): Uint8Array`
- `toDataUrl(): Promise<string>`
- `toObjectUrl(): string`

**Resize Options:**
```typescript
interface ResizeOptions {
  mode?: 'cover' | 'contain' | 'fill' | 'inside' | 'outside';  // default: 'cover'
  position?: 'center' | 'top' | 'bottom' | 'left' | 'right' |  // default: 'center'
             'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
}
```

**Resize Modes (inspired by CSS object-fit):**
- `cover` - Fill dimensions, crop excess (default)
- `contain` - Fit inside dimensions, preserve aspect ratio
- `fill` - Stretch to exact dimensions (may distort)
- `inside` - Like contain, but never enlarge
- `outside` - Like cover, but never reduce

**Note:** All transformation methods are asynchronous and return `Promise<MagicWebp>`. Operations are automatically queued to ensure thread-safety.

### Standalone Functions

```typescript
import { crop, resize } from 'magic-webp';

// Crop
const blob1 = await crop(file, 0, 0, 200, 200);

// Resize with modes
const blob2 = await resize(file, 400, 400, { mode: 'cover' });
const blob3 = await resize(file, 400, 400, { mode: 'contain' });
```

### Real-World Examples

```typescript
// Avatar - square 200x200, centered
const avatar = await img.resize(200, 200, { mode: 'cover' });

// Avatar - square 200x200, face at top
const avatar = await img.resize(200, 200, {
  mode: 'cover',
  position: 'top'
});

// Product preview - fit in 300x300
const preview = await img.resize(300, 300, { mode: 'contain' });

// Banner - 1200x400, top of image
const banner = await img.resize(1200, 400, {
  mode: 'cover',
  position: 'top'
});

// Thumbnail - never enlarge small images
const thumb = await img.resize(150, 150, { mode: 'inside' });

// Crop specific area then resize
const detail = await img
  .crop(100, 100, 400, 400)
  .then(cropped => cropped.resize(200, 200, { mode: 'contain' }));
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
const [cropped, cover, contain] = await Promise.all([
  img.crop(0, 0, 100, 100),
  img.resize(200, 200, { mode: 'cover' }),
  img.resize(150, 150, { mode: 'contain' })
]);

// Process multiple images concurrently - also safe!
const results = await Promise.all(
  images.map(img => img.resize(100, 100, { mode: 'cover' }))
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

