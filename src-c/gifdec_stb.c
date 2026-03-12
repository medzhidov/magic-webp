// GIF decoder using stb_image
// This provides a simple GIF decoder without external dependencies

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define STB_IMAGE_IMPLEMENTATION
#define STBI_ONLY_GIF
#define STBI_NO_STDIO
#include "stb_image.h"

#include "webp/encode.h"
#include "webp/mux.h"
#include "webp/types.h"

// Forward declaration
struct Metadata;

// Structure to hold GIF animation data
typedef struct {
    uint8_t** frames;      // Array of frame data (RGBA)
    int* delays;           // Array of delays in milliseconds
    int frame_count;       // Number of frames
    int width;             // Image width
    int height;            // Image height
} GIFAnimation;

// Free GIF animation data
static void FreeGIFAnimation(GIFAnimation* anim) {
    if (anim == NULL) return;

    if (anim->frames != NULL) {
        // Only free the first frame pointer, as all frames are in a single buffer
        if (anim->frames[0] != NULL) {
            stbi_image_free(anim->frames[0]);
        }
        free(anim->frames);
    }

    if (anim->delays != NULL) {
        free(anim->delays);
    }

    memset(anim, 0, sizeof(GIFAnimation));
}

// Read GIF using stb_image and convert to WebPPicture
// For animated GIFs, only the first frame is returned
// Use ReadGIF_STB_Animated for full animation support
int ReadGIF_STB(const uint8_t* const data, size_t data_size,
                WebPPicture* const pic, int keep_alpha,
                struct Metadata* const metadata) {
    int width, height, channels;
    uint8_t* rgba_data = NULL;
    int ok = 0;
    
    (void)metadata;  // Metadata not supported for GIF via stb_image
    
    if (data == NULL || data_size == 0 || pic == NULL) {
        return 0;
    }
    
    // Decode GIF to RGBA
    rgba_data = stbi_load_from_memory(data, (int)data_size, &width, &height, &channels, 4);
    
    if (rgba_data == NULL) {
        fprintf(stderr, "Failed to decode GIF: %s\n", stbi_failure_reason());
        return 0;
    }
    
    // Setup WebPPicture
    pic->width = width;
    pic->height = height;
    pic->use_argb = 1;
    
    if (!WebPPictureAlloc(pic)) {
        fprintf(stderr, "Failed to allocate WebPPicture\n");
        goto End;
    }
    
    // Convert RGBA to ARGB (WebP format)
    {
        const uint8_t* src = rgba_data;
        uint32_t* dst = pic->argb;
        int x, y;
        
        for (y = 0; y < height; ++y) {
            for (x = 0; x < width; ++x) {
                const uint8_t r = src[0];
                const uint8_t g = src[1];
                const uint8_t b = src[2];
                const uint8_t a = keep_alpha ? src[3] : 0xff;
                
                dst[x] = (a << 24) | (r << 16) | (g << 8) | b;
                src += 4;
            }
            dst += pic->argb_stride;
        }
    }
    
    ok = 1;

End:
    if (rgba_data != NULL) {
        stbi_image_free(rgba_data);
    }

    return ok;
}

// Read animated GIF and encode to WebP animation
uint8_t* ReadGIF_STB_Animated(const uint8_t* const data, size_t data_size,
                               int quality, int lossless, size_t* out_size) {
    GIFAnimation anim = {0};
    WebPAnimEncoder* enc = NULL;
    WebPAnimEncoderOptions enc_options;
    WebPConfig config;
    WebPData webp_data = {0};
    uint8_t* output = NULL;
    int timestamp_ms = 0;

    if (data == NULL || data_size == 0 || out_size == NULL) {
        return NULL;
    }

    *out_size = 0;

    // Load all GIF frames
    // stbi_load_gif_from_memory returns all frames in a single buffer
    // where frames are stored sequentially: frame0, frame1, frame2, ...
    int* delays_ptr = NULL;
    int comp = 0;
    uint8_t* all_frames = stbi_load_gif_from_memory(
        data, (int)data_size, &delays_ptr,
        &anim.width, &anim.height, &anim.frame_count, &comp, 4);

    if (all_frames == NULL || anim.frame_count == 0) {
        fprintf(stderr, "Failed to decode GIF: %s\n", stbi_failure_reason());
        return NULL;
    }

    // Allocate frames array
    anim.frames = (uint8_t**)calloc(anim.frame_count, sizeof(uint8_t*));
    anim.delays = delays_ptr;

    if (anim.frames == NULL) {
        fprintf(stderr, "Failed to allocate frames array\n");
        stbi_image_free(all_frames);
        free(delays_ptr);
        return NULL;
    }

    // Split the single buffer into separate frame pointers
    // Each frame is width * height * 4 bytes (RGBA)
    const size_t frame_size = anim.width * anim.height * 4;
    for (int i = 0; i < anim.frame_count; ++i) {
        anim.frames[i] = all_frames + (i * frame_size);
    }

    // For single frame GIF, just encode as static image
    if (anim.frame_count == 1) {
        WebPPicture pic;
        WebPMemoryWriter writer;

        if (!WebPConfigInit(&config) || !WebPPictureInit(&pic)) {
            FreeGIFAnimation(&anim);
            return NULL;
        }

        config.quality = quality;
        config.lossless = lossless;

        pic.width = anim.width;
        pic.height = anim.height;
        pic.use_argb = 1;

        if (!WebPPictureAlloc(&pic)) {
            FreeGIFAnimation(&anim);
            return NULL;
        }

        // Convert RGBA to ARGB
        const uint8_t* src = anim.frames[0];
        uint32_t* dst = pic.argb;

        for (int y = 0; y < anim.height; ++y) {
            for (int x = 0; x < anim.width; ++x) {
                const uint8_t r = src[0];
                const uint8_t g = src[1];
                const uint8_t b = src[2];
                const uint8_t a = src[3];

                dst[x] = (a << 24) | (r << 16) | (g << 8) | b;
                src += 4;
            }
            dst += pic.argb_stride;
        }

        WebPMemoryWriterInit(&writer);
        pic.writer = WebPMemoryWrite;
        pic.custom_ptr = &writer;

        int ok = WebPEncode(&config, &pic);
        WebPPictureFree(&pic);

        if (ok) {
            *out_size = writer.size;
            output = writer.mem;
        } else {
            WebPMemoryWriterClear(&writer);
        }

        FreeGIFAnimation(&anim);
        return output;
    }

    // Multi-frame animation
    if (!WebPAnimEncoderOptionsInit(&enc_options) || !WebPConfigInit(&config)) {
        FreeGIFAnimation(&anim);
        return NULL;
    }

    config.quality = quality;
    config.lossless = lossless;

    enc = WebPAnimEncoderNew(anim.width, anim.height, &enc_options);
    if (enc == NULL) {
        fprintf(stderr, "Failed to create WebP animation encoder\n");
        FreeGIFAnimation(&anim);
        return NULL;
    }

    // Encode each frame
    for (int i = 0; i < anim.frame_count; ++i) {
        WebPPicture frame_pic;

        if (!WebPPictureInit(&frame_pic)) {
            WebPAnimEncoderDelete(enc);
            FreeGIFAnimation(&anim);
            return NULL;
        }

        frame_pic.width = anim.width;
        frame_pic.height = anim.height;
        frame_pic.use_argb = 1;

        if (!WebPPictureAlloc(&frame_pic)) {
            WebPAnimEncoderDelete(enc);
            FreeGIFAnimation(&anim);
            return NULL;
        }

        // Convert RGBA to ARGB
        const uint8_t* src = anim.frames[i];
        uint32_t* dst = frame_pic.argb;

        for (int y = 0; y < anim.height; ++y) {
            for (int x = 0; x < anim.width; ++x) {
                const uint8_t r = src[0];
                const uint8_t g = src[1];
                const uint8_t b = src[2];
                const uint8_t a = src[3];

                dst[x] = (a << 24) | (r << 16) | (g << 8) | b;
                src += 4;
            }
            dst += frame_pic.argb_stride;
        }

        // Add frame to animation
        if (!WebPAnimEncoderAdd(enc, &frame_pic, timestamp_ms, &config)) {
            fprintf(stderr, "Failed to add frame %d\n", i);
            WebPPictureFree(&frame_pic);
            WebPAnimEncoderDelete(enc);
            FreeGIFAnimation(&anim);
            return NULL;
        }

        WebPPictureFree(&frame_pic);

        // Update timestamp
        // stb_image already converts delays to milliseconds (1/1000ths of a second)
        timestamp_ms += anim.delays[i];
    }

    // Finalize animation
    if (!WebPAnimEncoderAdd(enc, NULL, timestamp_ms, NULL)) {
        fprintf(stderr, "Failed to finalize animation\n");
        WebPAnimEncoderDelete(enc);
        FreeGIFAnimation(&anim);
        return NULL;
    }

    // Get encoded data
    if (!WebPAnimEncoderAssemble(enc, &webp_data)) {
        fprintf(stderr, "Failed to assemble animation\n");
        WebPAnimEncoderDelete(enc);
        FreeGIFAnimation(&anim);
        return NULL;
    }

    // Copy output
    output = (uint8_t*)malloc(webp_data.size);
    if (output != NULL) {
        memcpy(output, webp_data.bytes, webp_data.size);
        *out_size = webp_data.size;
    }

    // Cleanup
    WebPDataClear(&webp_data);
    WebPAnimEncoderDelete(enc);
    FreeGIFAnimation(&anim);

    return output;
}

