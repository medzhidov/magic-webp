#include <emscripten.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include "webp/decode.h"
#include "webp/encode.h"
#include "webp/demux.h"
#include "webp/mux.h"

// Forward declarations from magic_webp.c
extern void set_error(const char* msg);

// ────────────────────────────────────────────────────────────────────────────
// WebP animation processing with WebPPicture API (optimized)
// ────────────────────────────────────────────────────────────────────────────

// Transform function that works directly with WebPPicture
typedef int (*PictureTransformFunc)(WebPPicture* pic, void* params);

// Crop transform using WebPPictureCrop
typedef struct {
    uint32_t x, y, width, height;
} CropParams;

static int transform_crop(WebPPicture* pic, void* params) {
    CropParams* p = (CropParams*)params;

    if (!WebPPictureCrop(pic, p->x, p->y, p->width, p->height)) {
        set_error("WebPPictureCrop failed");
        return 0;
    }
    return 1;
}

// Resize transform using WebPPictureRescale
typedef struct {
    uint32_t width, height;
} ResizeParams;

static int transform_resize(WebPPicture* pic, void* params) {
    ResizeParams* p = (ResizeParams*)params;

    if (!WebPPictureRescale(pic, p->width, p->height)) {
        set_error("WebPPictureRescale failed");
        return 0;
    }
    return 1;
}

// Resize fit transform (preserve aspect ratio)
typedef struct {
    uint32_t max_width, max_height;
} ResizeFitParams;

static int transform_resize_fit(WebPPicture* pic, void* params) {
    ResizeFitParams* p = (ResizeFitParams*)params;

    // Calculate fitted dimensions
    float scale_w = (float)p->max_width / pic->width;
    float scale_h = (float)p->max_height / pic->height;
    float scale = (scale_w < scale_h) ? scale_w : scale_h;

    uint32_t new_w = (uint32_t)(pic->width * scale);
    uint32_t new_h = (uint32_t)(pic->height * scale);

    if (new_w == 0) new_w = 1;
    if (new_h == 0) new_h = 1;

    if (!WebPPictureRescale(pic, new_w, new_h)) {
        set_error("WebPPictureRescale failed");
        return 0;
    }
    return 1;
}

// Resize and crop transform (for cover mode)
typedef struct {
    uint32_t target_width, target_height;
    uint32_t crop_x, crop_y;
} ResizeAndCropParams;

static int transform_resize_and_crop(WebPPicture* pic, void* params) {
    ResizeAndCropParams* p = (ResizeAndCropParams*)params;

    // Calculate scale to cover
    float scale_w = (float)p->target_width / pic->width;
    float scale_h = (float)p->target_height / pic->height;
    float scale = (scale_w > scale_h) ? scale_w : scale_h;

    uint32_t scaled_w = (uint32_t)(pic->width * scale);
    uint32_t scaled_h = (uint32_t)(pic->height * scale);

    if (scaled_w == 0) scaled_w = 1;
    if (scaled_h == 0) scaled_h = 1;

    // First resize
    if (!WebPPictureRescale(pic, scaled_w, scaled_h)) {
        set_error("WebPPictureRescale failed");
        return 0;
    }

    // Then crop
    if (!WebPPictureCrop(pic, p->crop_x, p->crop_y, p->target_width, p->target_height)) {
        set_error("WebPPictureCrop failed");
        return 0;
    }

    return 1;
}

// Main animation processing function (optimized with WebPPicture API)
static uint8_t* process_webp_animation(const uint8_t* webp_data, size_t webp_size,
                                       PictureTransformFunc transform, void* transform_params,
                                       float quality, size_t* out_size) {
    *out_size = 0;

    // Parse WebP data
    WebPData input_data = {webp_data, webp_size};
    WebPDemuxer* demux = WebPDemux(&input_data);
    if (!demux) {
        set_error("Failed to demux WebP data");
        return NULL;
    }

    uint32_t frame_count = WebPDemuxGetI(demux, WEBP_FF_FRAME_COUNT);
    uint32_t loop_count = WebPDemuxGetI(demux, WEBP_FF_LOOP_COUNT);

    if (frame_count == 0) {
        set_error("No frames found in WebP");
        WebPDemuxDelete(demux);
        return NULL;
    }

    // Create muxer for output
    WebPMux* mux = WebPMuxNew();
    if (!mux) {
        set_error("Failed to create WebP muxer");
        WebPDemuxDelete(demux);
        return NULL;
    }

    WebPMuxAnimParams anim_params = {0};
    anim_params.loop_count = loop_count;
    WebPMuxSetAnimationParams(mux, &anim_params);

    uint32_t output_width = 0, output_height = 0;

    // Process each frame
    WebPIterator iter;
    if (WebPDemuxGetFrame(demux, 1, &iter)) {
        do {
            // Decode frame directly to WebPPicture
            WebPPicture pic;
            if (!WebPPictureInit(&pic)) {
                set_error("Failed to init picture");
                WebPDemuxReleaseIterator(&iter);
                WebPMuxDelete(mux);
                WebPDemuxDelete(demux);
                return NULL;
            }

            // Decode frame to RGBA
            WebPDecoderConfig config;
            if (!WebPInitDecoderConfig(&config)) {
                set_error("Failed to init decoder config");
                WebPPictureFree(&pic);
                WebPDemuxReleaseIterator(&iter);
                WebPMuxDelete(mux);
                WebPDemuxDelete(demux);
                return NULL;
            }

            config.output.colorspace = MODE_RGBA;
            if (WebPDecode(iter.fragment.bytes, iter.fragment.size, &config) != VP8_STATUS_OK) {
                set_error("Failed to decode WebP frame");
                WebPFreeDecBuffer(&config.output);
                WebPPictureFree(&pic);
                WebPDemuxReleaseIterator(&iter);
                WebPMuxDelete(mux);
                WebPDemuxDelete(demux);
                return NULL;
            }

            // Import RGBA to WebPPicture
            pic.width = config.output.width;
            pic.height = config.output.height;
            pic.use_argb = 1;

            if (!WebPPictureImportRGBA(&pic, config.output.u.RGBA.rgba, config.output.width * 4)) {
                set_error("Failed to import RGBA data");
                WebPFreeDecBuffer(&config.output);
                WebPPictureFree(&pic);
                WebPDemuxReleaseIterator(&iter);
                WebPMuxDelete(mux);
                WebPDemuxDelete(demux);
                return NULL;
            }

            WebPFreeDecBuffer(&config.output);

            // Apply transformation directly to WebPPicture
            if (!transform(&pic, transform_params)) {
                WebPPictureFree(&pic);
                WebPDemuxReleaseIterator(&iter);
                WebPMuxDelete(mux);
                WebPDemuxDelete(demux);
                return NULL;
            }

            // Set output dimensions from first frame
            if (output_width == 0) {
                output_width = pic.width;
                output_height = pic.height;
            } else if (output_width != pic.width || output_height != pic.height) {
                set_error("Transformed frames must have consistent dimensions");
                WebPPictureFree(&pic);
                WebPDemuxReleaseIterator(&iter);
                WebPMuxDelete(mux);
                WebPDemuxDelete(demux);
                return NULL;
            }

            // Encode transformed frame
            WebPConfig enc_config;
            if (!WebPConfigInit(&enc_config)) {
                set_error("Failed to init encoder config");
                WebPPictureFree(&pic);
                WebPDemuxReleaseIterator(&iter);
                WebPMuxDelete(mux);
                WebPDemuxDelete(demux);
                return NULL;
            }

            enc_config.lossless = 0;
            enc_config.quality = quality;

            WebPMemoryWriter writer;
            WebPMemoryWriterInit(&writer);
            pic.writer = WebPMemoryWrite;
            pic.custom_ptr = &writer;

            if (!WebPEncode(&enc_config, &pic)) {
                set_error("Failed to encode frame");
                WebPMemoryWriterClear(&writer);
                WebPPictureFree(&pic);
                WebPDemuxReleaseIterator(&iter);
                WebPMuxDelete(mux);
                WebPDemuxDelete(demux);
                return NULL;
            }

            // Add frame to mux
            WebPMuxFrameInfo frame_info;
            memset(&frame_info, 0, sizeof(frame_info));
            frame_info.bitstream.bytes = writer.mem;
            frame_info.bitstream.size = writer.size;
            frame_info.duration = iter.duration;
            frame_info.id = WEBP_CHUNK_ANMF;
            frame_info.dispose_method = WEBP_MUX_DISPOSE_NONE;
            frame_info.blend_method = WEBP_MUX_BLEND;

            if (WebPMuxPushFrame(mux, &frame_info, 1) != WEBP_MUX_OK) {
                set_error("Failed to add frame to mux");
                WebPMemoryWriterClear(&writer);
                WebPPictureFree(&pic);
                WebPDemuxReleaseIterator(&iter);
                WebPMuxDelete(mux);
                WebPDemuxDelete(demux);
                return NULL;
            }

            // Cleanup
            WebPMemoryWriterClear(&writer);
            WebPPictureFree(&pic);

        } while (WebPDemuxNextFrame(&iter));
        WebPDemuxReleaseIterator(&iter);
    }

    WebPDemuxDelete(demux);

    // Assemble final WebP
    WebPData output_data;
    if (WebPMuxAssemble(mux, &output_data) != WEBP_MUX_OK) {
        set_error("Failed to assemble WebP");
        WebPMuxDelete(mux);
        return NULL;
    }

    WebPMuxDelete(mux);

    // Copy output data
    uint8_t* result = (uint8_t*)malloc(output_data.size);
    if (!result) {
        set_error("Memory allocation failed");
        WebPDataClear(&output_data);
        return NULL;
    }

    memcpy(result, output_data.bytes, output_data.size);
    *out_size = output_data.size;
    WebPDataClear(&output_data);

    return result;
}

// ────────────────────────────────────────────────────────────────────────────
// Public API functions (with quality parameter)
// ────────────────────────────────────────────────────────────────────────────

EMSCRIPTEN_KEEPALIVE
uint8_t* magic_webp_crop(const uint8_t* webp_data, size_t webp_size,
                         uint32_t x, uint32_t y, uint32_t width, uint32_t height,
                         float quality, size_t* out_size) {
    CropParams params = {x, y, width, height};
    return process_webp_animation(webp_data, webp_size, transform_crop, &params, quality, out_size);
}

EMSCRIPTEN_KEEPALIVE
uint8_t* magic_webp_resize(const uint8_t* webp_data, size_t webp_size,
                           uint32_t width, uint32_t height,
                           float quality, size_t* out_size) {
    ResizeParams params = {width, height};
    return process_webp_animation(webp_data, webp_size, transform_resize, &params, quality, out_size);
}

EMSCRIPTEN_KEEPALIVE
uint8_t* magic_webp_resize_fit(const uint8_t* webp_data, size_t webp_size,
                               uint32_t max_width, uint32_t max_height,
                               float quality, size_t* out_size) {
    ResizeFitParams params = {max_width, max_height};
    return process_webp_animation(webp_data, webp_size, transform_resize_fit, &params, quality, out_size);
}

EMSCRIPTEN_KEEPALIVE
uint8_t* magic_webp_resize_cover(const uint8_t* webp_data, size_t webp_size,
                                 uint32_t target_width, uint32_t target_height,
                                 uint32_t crop_x, uint32_t crop_y,
                                 float quality, size_t* out_size) {
    ResizeAndCropParams params = {target_width, target_height, crop_x, crop_y};
    return process_webp_animation(webp_data, webp_size, transform_resize_and_crop, &params, quality, out_size);
}

