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
// Image transformation helpers
// ────────────────────────────────────────────────────────────────────────────

typedef struct {
    uint8_t* data;
    uint32_t width;
    uint32_t height;
} RGBAImage;

void free_rgba_image(RGBAImage* img) {
    if (img && img->data) {
        free(img->data);
        img->data = NULL;
    }
}

// Crop RGBA image
int crop_rgba(const uint8_t* src, uint32_t src_w, uint32_t src_h,
              uint32_t x, uint32_t y, uint32_t crop_w, uint32_t crop_h,
              RGBAImage* out) {
    if (x + crop_w > src_w || y + crop_h > src_h) {
        set_error("Crop region extends beyond image boundaries");
        return 0;
    }
    
    out->width = crop_w;
    out->height = crop_h;
    out->data = (uint8_t*)malloc(crop_w * crop_h * 4);
    if (!out->data) {
        set_error("Memory allocation failed");
        return 0;
    }
    
    for (uint32_t row = 0; row < crop_h; row++) {
        const uint8_t* src_row = src + ((y + row) * src_w + x) * 4;
        uint8_t* dst_row = out->data + row * crop_w * 4;
        memcpy(dst_row, src_row, crop_w * 4);
    }
    
    return 1;
}

// Simple bilinear resize for RGBA
int resize_rgba(const uint8_t* src, uint32_t src_w, uint32_t src_h,
                uint32_t dst_w, uint32_t dst_h, RGBAImage* out) {
    if (dst_w == 0 || dst_h == 0) {
        set_error("Target dimensions must be greater than zero");
        return 0;
    }
    
    out->width = dst_w;
    out->height = dst_h;
    out->data = (uint8_t*)malloc(dst_w * dst_h * 4);
    if (!out->data) {
        set_error("Memory allocation failed");
        return 0;
    }
    
    float x_ratio = (float)src_w / dst_w;
    float y_ratio = (float)src_h / dst_h;
    
    for (uint32_t y = 0; y < dst_h; y++) {
        for (uint32_t x = 0; x < dst_w; x++) {
            uint32_t src_x = (uint32_t)(x * x_ratio);
            uint32_t src_y = (uint32_t)(y * y_ratio);
            
            if (src_x >= src_w) src_x = src_w - 1;
            if (src_y >= src_h) src_y = src_h - 1;
            
            const uint8_t* src_pixel = src + (src_y * src_w + src_x) * 4;
            uint8_t* dst_pixel = out->data + (y * dst_w + x) * 4;
            
            memcpy(dst_pixel, src_pixel, 4);
        }
    }
    
    return 1;
}

// Resize to fit within max dimensions (aspect ratio preserved)
int resize_fit_rgba(const uint8_t* src, uint32_t src_w, uint32_t src_h,
                    uint32_t max_w, uint32_t max_h, RGBAImage* out) {
    if (max_w == 0 || max_h == 0) {
        set_error("Max dimensions must be greater than zero");
        return 0;
    }
    
    float scale_w = (float)max_w / src_w;
    float scale_h = (float)max_h / src_h;
    float scale = (scale_w < scale_h) ? scale_w : scale_h;
    
    uint32_t new_w = (uint32_t)(src_w * scale);
    uint32_t new_h = (uint32_t)(src_h * scale);
    
    if (new_w == 0) new_w = 1;
    if (new_h == 0) new_h = 1;
    
    return resize_rgba(src, src_w, src_h, new_w, new_h, out);
}

