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

# Output is already in lib/ (configured in CMakeLists.txt)
echo "📦 WASM module generated in lib/..."
cd ..

# Copy type declarations to lib/
cp src-js/magic_webp.d.mts lib/magic_webp.d.mts

echo "✅ WASM build complete! Output in lib/"

