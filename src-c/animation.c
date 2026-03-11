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

typedef struct {
    uint8_t* data;
    uint32_t width;
    uint32_t height;
} RGBAImage;

extern void free_rgba_image(RGBAImage* img);
extern int crop_rgba(const uint8_t* src, uint32_t src_w, uint32_t src_h,
                     uint32_t x, uint32_t y, uint32_t crop_w, uint32_t crop_h,
                     RGBAImage* out);
extern int resize_rgba(const uint8_t* src, uint32_t src_w, uint32_t src_h,
                       uint32_t dst_w, uint32_t dst_h, RGBAImage* out);
extern int resize_fit_rgba(const uint8_t* src, uint32_t src_w, uint32_t src_h,
                           uint32_t max_w, uint32_t max_h, RGBAImage* out);
extern int resize_and_crop_rgba(const uint8_t* src, uint32_t src_w, uint32_t src_h,
                                uint32_t target_w, uint32_t target_h,
                                uint32_t crop_x, uint32_t crop_y,
                                RGBAImage* out);

// ────────────────────────────────────────────────────────────────────────────
// WebP animation processing
// ────────────────────────────────────────────────────────────────────────────

typedef int (*TransformFunc)(const uint8_t*, uint32_t, uint32_t, void*, RGBAImage*);

// Crop transform wrapper
typedef struct {
    uint32_t x, y, width, height;
} CropParams;

static int transform_crop(const uint8_t* rgba, uint32_t width, uint32_t height,
                          void* params, RGBAImage* out) {
    CropParams* p = (CropParams*)params;
    return crop_rgba(rgba, width, height, p->x, p->y, p->width, p->height, out);
}

// Resize transform wrapper
typedef struct {
    uint32_t width, height;
} ResizeParams;

static int transform_resize(const uint8_t* rgba, uint32_t width, uint32_t height,
                            void* params, RGBAImage* out) {
    ResizeParams* p = (ResizeParams*)params;
    return resize_rgba(rgba, width, height, p->width, p->height, out);
}

// Resize fit transform wrapper
typedef struct {
    uint32_t max_width, max_height;
} ResizeFitParams;

static int transform_resize_fit(const uint8_t* rgba, uint32_t width, uint32_t height,
                                void* params, RGBAImage* out) {
    ResizeFitParams* p = (ResizeFitParams*)params;
    return resize_fit_rgba(rgba, width, height, p->max_width, p->max_height, out);
}

// Resize and crop transform wrapper (for cover mode)
typedef struct {
    uint32_t target_width, target_height;
    uint32_t crop_x, crop_y;
} ResizeAndCropParams;

static int transform_resize_and_crop(const uint8_t* rgba, uint32_t width, uint32_t height,
                                     void* params, RGBAImage* out) {
    ResizeAndCropParams* p = (ResizeAndCropParams*)params;
    return resize_and_crop_rgba(rgba, width, height,
                                p->target_width, p->target_height,
                                p->crop_x, p->crop_y, out);
}

// Main animation processing function
static uint8_t* process_webp_animation(const uint8_t* webp_data, size_t webp_size,
                                       TransformFunc transform, void* transform_params,
                                       size_t* out_size) {
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
            // Decode frame
            WebPDecoderConfig config;
            if (!WebPInitDecoderConfig(&config)) {
                set_error("Failed to init decoder config");
                WebPDemuxReleaseIterator(&iter);
                WebPMuxDelete(mux);
                WebPDemuxDelete(demux);
                return NULL;
            }
            
            config.output.colorspace = MODE_RGBA;
            if (WebPDecode(iter.fragment.bytes, iter.fragment.size, &config) != VP8_STATUS_OK) {
                set_error("Failed to decode WebP frame");
                WebPFreeDecBuffer(&config.output);
                WebPDemuxReleaseIterator(&iter);
                WebPMuxDelete(mux);
                WebPDemuxDelete(demux);
                return NULL;
            }
            
            uint8_t* rgba = config.output.u.RGBA.rgba;
            uint32_t width = config.output.width;
            uint32_t height = config.output.height;
            
            // Transform frame
            RGBAImage transformed;
            if (!transform(rgba, width, height, transform_params, &transformed)) {
                WebPFreeDecBuffer(&config.output);
                WebPDemuxReleaseIterator(&iter);
                WebPMuxDelete(mux);
                WebPDemuxDelete(demux);
                return NULL;
            }

            // Set output dimensions from first frame
            if (output_width == 0) {
                output_width = transformed.width;
                output_height = transformed.height;
            } else if (output_width != transformed.width || output_height != transformed.height) {
                set_error("Transformed frames must have consistent dimensions");
                free_rgba_image(&transformed);
                WebPFreeDecBuffer(&config.output);
                WebPDemuxReleaseIterator(&iter);
                WebPMuxDelete(mux);
                WebPDemuxDelete(demux);
                return NULL;
            }

            // Encode transformed frame
            WebPConfig enc_config;
            if (!WebPConfigInit(&enc_config)) {
                set_error("Failed to init encoder config");
                free_rgba_image(&transformed);
                WebPFreeDecBuffer(&config.output);
                WebPDemuxReleaseIterator(&iter);
                WebPMuxDelete(mux);
                WebPDemuxDelete(demux);
                return NULL;
            }

            enc_config.lossless = 0;
            enc_config.quality = 90;

            WebPPicture pic;
            if (!WebPPictureInit(&pic)) {
                set_error("Failed to init picture");
                free_rgba_image(&transformed);
                WebPFreeDecBuffer(&config.output);
                WebPDemuxReleaseIterator(&iter);
                WebPMuxDelete(mux);
                WebPDemuxDelete(demux);
                return NULL;
            }

            pic.width = transformed.width;
            pic.height = transformed.height;
            pic.use_argb = 1;

            if (!WebPPictureImportRGBA(&pic, transformed.data, transformed.width * 4)) {
                set_error("Failed to import RGBA data");
                WebPPictureFree(&pic);
                free_rgba_image(&transformed);
                WebPFreeDecBuffer(&config.output);
                WebPDemuxReleaseIterator(&iter);
                WebPMuxDelete(mux);
                WebPDemuxDelete(demux);
                return NULL;
            }

            WebPMemoryWriter writer;
            WebPMemoryWriterInit(&writer);
            pic.writer = WebPMemoryWrite;
            pic.custom_ptr = &writer;

            if (!WebPEncode(&enc_config, &pic)) {
                set_error("Failed to encode frame");
                WebPMemoryWriterClear(&writer);
                WebPPictureFree(&pic);
                free_rgba_image(&transformed);
                WebPFreeDecBuffer(&config.output);
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
                free_rgba_image(&transformed);
                WebPFreeDecBuffer(&config.output);
                WebPDemuxReleaseIterator(&iter);
                WebPMuxDelete(mux);
                WebPDemuxDelete(demux);
                return NULL;
            }

            // Cleanup
            WebPMemoryWriterClear(&writer);
            WebPPictureFree(&pic);
            free_rgba_image(&transformed);
            WebPFreeDecBuffer(&config.output);

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
// Public API functions
// ────────────────────────────────────────────────────────────────────────────

EMSCRIPTEN_KEEPALIVE
uint8_t* magic_webp_crop(const uint8_t* webp_data, size_t webp_size,
                         uint32_t x, uint32_t y, uint32_t width, uint32_t height,
                         size_t* out_size) {
    CropParams params = {x, y, width, height};
    return process_webp_animation(webp_data, webp_size, transform_crop, &params, out_size);
}

EMSCRIPTEN_KEEPALIVE
uint8_t* magic_webp_resize(const uint8_t* webp_data, size_t webp_size,
                           uint32_t width, uint32_t height,
                           size_t* out_size) {
    ResizeParams params = {width, height};
    return process_webp_animation(webp_data, webp_size, transform_resize, &params, out_size);
}

EMSCRIPTEN_KEEPALIVE
uint8_t* magic_webp_resize_fit(const uint8_t* webp_data, size_t webp_size,
                               uint32_t max_width, uint32_t max_height,
                               size_t* out_size) {
    ResizeFitParams params = {max_width, max_height};
    return process_webp_animation(webp_data, webp_size, transform_resize_fit, &params, out_size);
}

EMSCRIPTEN_KEEPALIVE
uint8_t* magic_webp_resize_cover(const uint8_t* webp_data, size_t webp_size,
                                 uint32_t target_width, uint32_t target_height,
                                 uint32_t crop_x, uint32_t crop_y,
                                 size_t* out_size) {
    ResizeAndCropParams params = {target_width, target_height, crop_x, crop_y};
    return process_webp_animation(webp_data, webp_size, transform_resize_and_crop, &params, out_size);
}

