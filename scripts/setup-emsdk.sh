#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EMSDK_DIR="$ROOT_DIR/emsdk"

echo "==> Setting up Emscripten SDK..."

if ! command -v git >/dev/null 2>&1; then
    echo "❌ git is required to install emsdk."
    exit 1
fi

if [ -d "$EMSDK_DIR/.git" ]; then
    echo "emsdk directory already exists at: $EMSDK_DIR"
    echo "Updating emsdk..."
    git -C "$EMSDK_DIR" pull --ff-only
else
    echo "Cloning emsdk..."
    git clone https://github.com/emscripten-core/emsdk.git "$EMSDK_DIR"
fi

pushd "$EMSDK_DIR" >/dev/null

echo "Installing latest emsdk..."
./emsdk install latest

echo "Activating emsdk..."
./emsdk activate latest

popd >/dev/null

echo
echo "==> Emscripten SDK installed successfully!"
echo
echo "To use emscripten in this shell, run:"
echo "  source \"$EMSDK_DIR/emsdk_env.sh\""
