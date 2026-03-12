# Build script for magic-webp using Emscripten

Write-Host "Building magic-webp with Emscripten..." -ForegroundColor Cyan

# Activate emsdk
Write-Host "Activating emsdk..." -ForegroundColor Yellow
& .\emsdk\emsdk_env.ps1

# Create build directory
$buildDir = "build"
if (Test-Path $buildDir) {
    Write-Host "Cleaning build directory..." -ForegroundColor Yellow
    Remove-Item -Recurse -Force $buildDir
}
New-Item -ItemType Directory -Path $buildDir | Out-Null

# Create lib directory if it doesn't exist
if (-not (Test-Path "lib")) {
    New-Item -ItemType Directory -Path "lib" | Out-Null
}

# Run CMake with Emscripten
Write-Host "Running CMake..." -ForegroundColor Yellow
Set-Location $buildDir
emcmake cmake .. -DCMAKE_BUILD_TYPE=Release

# Build
Write-Host "Building..." -ForegroundColor Yellow
ninja

Set-Location ..

# Copy type declarations to lib/
Copy-Item "src-js/magic_webp.d.mts" "lib/magic_webp.d.mts"

Write-Host "Build complete! Output in lib/" -ForegroundColor Green

