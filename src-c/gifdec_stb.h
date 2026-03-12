// GIF decoder using stb_image
#ifndef GIFDEC_STB_H_
#define GIFDEC_STB_H_

#include <stddef.h>
#include <stdint.h>

struct WebPPicture;
struct Metadata;

#ifdef __cplusplus
extern "C" {
#endif

// Read GIF using stb_image and convert to WebPPicture
// Note: This only reads the first frame of animated GIFs
int ReadGIF_STB(const uint8_t* const data, size_t data_size,
                struct WebPPicture* const pic, int keep_alpha,
                struct Metadata* const metadata);

// Read animated GIF and encode to WebP animation
// Returns allocated buffer with WebP data, or NULL on error
// Caller must free the returned buffer with free()
uint8_t* ReadGIF_STB_Animated(const uint8_t* const data, size_t data_size,
                               int quality, int lossless, size_t* out_size);

#ifdef __cplusplus
}
#endif

#endif  // GIFDEC_STB_H_

