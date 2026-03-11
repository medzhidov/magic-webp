# Setup Emscripten SDK for Windows
# This script downloads and installs emsdk in the project directory

$ErrorActionPreference = "Stop"

$EMSDK_DIR = Join-Path (Join-Path $PSScriptRoot "..") "emsdk"

Write-Host "==> Setting up Emscripten SDK..." -ForegroundColor Cyan

# Check if emsdk already exists
if (Test-Path $EMSDK_DIR) {
    Write-Host "emsdk directory already exists at: $EMSDK_DIR" -ForegroundColor Yellow
    Write-Host "Updating emsdk..." -ForegroundColor Cyan
    Push-Location $EMSDK_DIR
    git pull
    Pop-Location
} else {
    Write-Host "Cloning emsdk..." -ForegroundColor Cyan
    git clone https://github.com/emscripten-core/emsdk.git $EMSDK_DIR
}

Push-Location $EMSDK_DIR

Write-Host "Installing latest emsdk..." -ForegroundColor Cyan
.\emsdk.bat install latest

Write-Host "Activating emsdk..." -ForegroundColor Cyan
.\emsdk.bat activate latest

Write-Host ""
Write-Host "==> Emscripten SDK installed successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "To use emscripten in this session, run:" -ForegroundColor Yellow
Write-Host "  emsdk\emsdk_env.bat" -ForegroundColor White
Write-Host ""
Write-Host "Or add this to your PowerShell profile:" -ForegroundColor Yellow
Write-Host "  & `"$EMSDK_DIR\emsdk_env.ps1`"" -ForegroundColor White

Pop-Location

