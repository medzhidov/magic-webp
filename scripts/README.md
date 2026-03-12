# Scripts

Utility scripts for development and testing.

## Available Scripts

### `verify-conversion.cjs`

Verify image conversion results (GIF → WebP).

**Usage:**
```bash
node scripts/verify-conversion.cjs <input-file> <output-webp>
```

**Example:**
```bash
node scripts/verify-conversion.cjs demo/assets/test.gif test-output/output.webp
```

**Output:**
- Input file information (format, size, dimensions, frames)
- Output file information (format, size, dimensions, frames)
- Compression ratio
- Frame preservation percentage
- Success/warning status

### `setup-emsdk.ps1`

PowerShell script to set up Emscripten SDK for building WASM.

**Usage:**
```powershell
.\scripts\setup-emsdk.ps1
```

This script is automatically called by `build.ps1` if emsdk is not found.

## Testing

For automated testing, use the test suite instead:

```bash
# Run all tests
pnpm test

# Run specific test
pnpm test frame-preservation
pnpm test validation
pnpm test convert
```

The test suite includes:
- **frame-preservation.test.ts** - Verifies frame count preservation in GIF → WebP conversion
- **validation.test.ts** - Tests format validation (WebP vs non-WebP)
- **convert.test.ts** - Tests conversion from various formats
- **concurrent.test.ts** - Tests concurrent operations

## Native C Tests

To test the C code directly (without WASM):

```bash
pnpm test:native
```

This compiles and runs native C tests using the local C compiler.

