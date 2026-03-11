#include <emscripten.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include "webp/decode.h"
#include "webp/encode.h"
#include "webp/demux.h"
#include "webp/mux.h"

// ────────────────────────────────────────────────────────────────────────────
// Error handling
// ────────────────────────────────────────────────────────────────────────────

static char last_error[256] = {0};

EMSCRIPTEN_KEEPALIVE
const char* magic_webp_get_error() {
    return last_error;
}

void set_error(const char* msg) {
    strncpy(last_error, msg, sizeof(last_error) - 1);
    last_error[sizeof(last_error) - 1] = '\0';
}

// ────────────────────────────────────────────────────────────────────────────
// Memory management for output
// ────────────────────────────────────────────────────────────────────────────

EMSCRIPTEN_KEEPALIVE
void magic_webp_free(void* ptr) {
    if (ptr) free(ptr);
}

// ────────────────────────────────────────────────────────────────────────────
// Note: Image transformation is now handled in animation.c using WebPPicture API
// This provides better quality (bilinear/bicubic) and SIMD optimizations
// ────────────────────────────────────────────────────────────────────────────

