#!/bin/bash
set -e

echo "🔨 Building magic-webp WASM module..."

# Check if emsdk is available
if ! command -v emcc &> /dev/null; then
    echo "❌ Emscripten not found. Please install emsdk first."
    exit 1
fi

# Create build directory
mkdir -p build
cd build

# Configure with CMake
echo "📋 Configuring CMake..."
emcmake cmake ..

# Build
echo "🔧 Building..."
emmake make

# Copy output to pkg
echo "📦 Copying output to pkg/..."
cd ..
mkdir -p pkg
cp build/magic_webp.js pkg/magic_webp.mjs
cp build/magic_webp.wasm pkg/

# Generate package.json for pkg
cat > pkg/package.json << 'EOF'
{
  "name": "magic-webp",
  "type": "module",
  "main": "./magic_webp.mjs",
  "types": "./magic_webp.d.ts",
  "exports": {
    ".": {
      "import": "./magic_webp.mjs",
      "types": "./magic_webp.d.ts"
    }
  }
}
EOF

# Build TypeScript
echo "📝 Building TypeScript..."
npx tsc

echo "✅ Build complete! Output in pkg/"

