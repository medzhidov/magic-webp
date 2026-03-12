#include <emscripten.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include "webp/decode.h"
#include "webp/encode.h"
#include "webp/demux.h"
#include "webp/mux.h"

// Include imageio decoders
#include "../libwebp/imageio/image_dec.h"
#include "../libwebp/imageio/metadata.h"

// Include GIF decoder (stb_image based)
#include "gifdec_stb.h"

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

// ────────────────────────────────────────────────────────────────────────────
// Convert any image format (PNG, JPEG, GIF, etc.) to WebP
// ────────────────────────────────────────────────────────────────────────────

EMSCRIPTEN_KEEPALIVE
uint8_t* magic_webp_convert_to_webp(
    const uint8_t* data,
    size_t data_size,
    int quality,
    int lossless,
    size_t* out_size
) {
    if (!data || data_size == 0 || !out_size) {
        set_error("Invalid input parameters");
        return NULL;
    }

    *out_size = 0;

    // Check for GIF format (GIF87a or GIF89a)
    // Use special animated GIF decoder
    if (data_size >= 6 &&
        data[0] == 'G' && data[1] == 'I' && data[2] == 'F' &&
        data[3] == '8' && (data[4] == '7' || data[4] == '9') && data[5] == 'a') {
        // Use animated GIF decoder which handles both static and animated GIFs
        return ReadGIF_STB_Animated(data, data_size, quality, lossless, out_size);
    }

    // Detect other image formats
    WebPInputFileFormat format = WebPGuessImageType(data, data_size);

    if (format == WEBP_UNSUPPORTED_FORMAT) {
        set_error("Unsupported image format");
        return NULL;
    }

    // Get appropriate reader
    WebPImageReader reader = WebPGetImageReader(format);
    if (!reader) {
        set_error("No reader available for this format");
        return NULL;
    }

    // Initialize WebPPicture
    WebPPicture picture;
    if (!WebPPictureInit(&picture)) {
        set_error("Failed to initialize WebPPicture");
        return NULL;
    }

    // Initialize metadata (optional, can be NULL)
    Metadata metadata;
    MetadataInit(&metadata);

    // Read image into WebPPicture
    // keep_alpha = 1 to preserve transparency
    if (!reader(data, data_size, &picture, 1, &metadata)) {
        set_error("Failed to decode input image");
        WebPPictureFree(&picture);
        MetadataFree(&metadata);
        return NULL;
    }

    // Configure WebP encoder
    WebPConfig config;
    if (!WebPConfigInit(&config)) {
        set_error("Failed to initialize WebPConfig");
        WebPPictureFree(&picture);
        MetadataFree(&metadata);
        return NULL;
    }

    // Set encoding parameters
    config.lossless = lossless;
    config.quality = (float)quality;
    config.method = 4; // Balanced quality/speed (0=fast, 6=slow)

    if (!WebPValidateConfig(&config)) {
        set_error("Invalid WebP configuration");
        WebPPictureFree(&picture);
        MetadataFree(&metadata);
        return NULL;
    }

    // Setup memory writer
    WebPMemoryWriter writer;
    WebPMemoryWriterInit(&writer);
    picture.writer = WebPMemoryWrite;
    picture.custom_ptr = &writer;

    // Encode to WebP
    if (!WebPEncode(&config, &picture)) {
        set_error("WebP encoding failed");
        WebPMemoryWriterClear(&writer);
        WebPPictureFree(&picture);
        MetadataFree(&metadata);
        return NULL;
    }

    // Copy output data
    uint8_t* result = (uint8_t*)malloc(writer.size);
    if (!result) {
        set_error("Memory allocation failed");
        WebPMemoryWriterClear(&writer);
        WebPPictureFree(&picture);
        MetadataFree(&metadata);
        return NULL;
    }

    memcpy(result, writer.mem, writer.size);
    *out_size = writer.size;

    // Cleanup
    WebPMemoryWriterClear(&writer);
    WebPPictureFree(&picture);
    MetadataFree(&metadata);

    return result;
}

