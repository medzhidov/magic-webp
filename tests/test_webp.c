#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>

// Forward declarations from src-c
extern uint8_t* magic_webp_crop(const uint8_t* webp_data, size_t webp_size,
                                uint32_t x, uint32_t y, uint32_t width, uint32_t height,
                                size_t* out_size);
extern uint8_t* magic_webp_resize(const uint8_t* webp_data, size_t webp_size,
                                  uint32_t width, uint32_t height,
                                  size_t* out_size);
extern uint8_t* magic_webp_resize_fit(const uint8_t* webp_data, size_t webp_size,
                                      uint32_t max_width, uint32_t max_height,
                                      size_t* out_size);
extern void magic_webp_free(void* ptr);
extern const char* magic_webp_get_error(void);

// Helper functions
static uint8_t* read_file(const char* filename, size_t* size) {
    FILE* f = fopen(filename, "rb");
    if (!f) {
        fprintf(stderr, "Failed to open %s\n", filename);
        return NULL;
    }
    
    fseek(f, 0, SEEK_END);
    *size = ftell(f);
    fseek(f, 0, SEEK_SET);
    
    uint8_t* data = (uint8_t*)malloc(*size);
    if (!data) {
        fclose(f);
        return NULL;
    }
    
    fread(data, 1, *size, f);
    fclose(f);
    return data;
}

static int write_file(const char* filename, const uint8_t* data, size_t size) {
    FILE* f = fopen(filename, "wb");
    if (!f) {
        fprintf(stderr, "Failed to create %s\n", filename);
        return 0;
    }
    
    fwrite(data, 1, size, f);
    fclose(f);
    return 1;
}

static void test_crop(const uint8_t* input, size_t input_size, const char* test_name,
                      uint32_t x, uint32_t y, uint32_t width, uint32_t height) {
    printf("Testing %s...\n", test_name);
    
    size_t out_size = 0;
    uint8_t* result = magic_webp_crop(input, input_size, x, y, width, height, &out_size);
    
    if (!result) {
        fprintf(stderr, "  FAILED: %s\n", magic_webp_get_error());
        return;
    }
    
    char filename[256];
    snprintf(filename, sizeof(filename), "test-output/%s.webp", test_name);
    
    if (write_file(filename, result, out_size)) {
        printf("  OK: %s (%.2f KB)\n", filename, out_size / 1024.0);
    } else {
        printf("  FAILED: Could not write file\n");
    }
    
    magic_webp_free(result);
}

static void test_resize(const uint8_t* input, size_t input_size, const char* test_name,
                        uint32_t width, uint32_t height) {
    printf("Testing %s...\n", test_name);
    
    size_t out_size = 0;
    uint8_t* result = magic_webp_resize(input, input_size, width, height, &out_size);
    
    if (!result) {
        fprintf(stderr, "  FAILED: %s\n", magic_webp_get_error());
        return;
    }
    
    char filename[256];
    snprintf(filename, sizeof(filename), "test-output/%s.webp", test_name);
    
    if (write_file(filename, result, out_size)) {
        printf("  OK: %s (%.2f KB)\n", filename, out_size / 1024.0);
    } else {
        printf("  FAILED: Could not write file\n");
    }
    
    magic_webp_free(result);
}

static void test_resize_fit(const uint8_t* input, size_t input_size, const char* test_name,
                            uint32_t max_width, uint32_t max_height) {
    printf("Testing %s...\n", test_name);
    
    size_t out_size = 0;
    uint8_t* result = magic_webp_resize_fit(input, input_size, max_width, max_height, &out_size);
    
    if (!result) {
        fprintf(stderr, "  FAILED: %s\n", magic_webp_get_error());
        return;
    }
    
    char filename[256];
    snprintf(filename, sizeof(filename), "test-output/%s.webp", test_name);
    
    if (write_file(filename, result, out_size)) {
        printf("  OK: %s (%.2f KB)\n", filename, out_size / 1024.0);
    } else {
        printf("  FAILED: Could not write file\n");
    }
    
    magic_webp_free(result);
}

static void test_chain(const uint8_t* input, size_t input_size) {
    printf("Testing chain_crop_center_then_fit_128...\n");

    // First crop center 100x100
    size_t crop_size = 0;
    uint8_t* cropped = magic_webp_crop(input, input_size, 50, 50, 100, 100, &crop_size);
    
    if (!cropped) {
        fprintf(stderr, "  FAILED at crop: %s\n", magic_webp_get_error());
        return;
    }
    
    // Then resize fit to 128x128
    size_t fit_size = 0;
    uint8_t* fitted = magic_webp_resize_fit(cropped, crop_size, 128, 128, &fit_size);
    magic_webp_free(cropped);
    
    if (!fitted) {
        fprintf(stderr, "  FAILED at resize_fit: %s\n", magic_webp_get_error());
        return;
    }
    
    if (write_file("test-output/chain_crop_center_then_fit_128.webp", fitted, fit_size)) {
        printf("  OK: test-output/chain_crop_center_then_fit_128.webp (%.2f KB)\n", fit_size / 1024.0);
    }
    
    magic_webp_free(fitted);
}

int main(int argc, char** argv) {
    const char* input_file = "demo/giphy.webp";

    if (argc > 1) {
        input_file = argv[1];
    }

    printf("Loading %s...\n", input_file);

    size_t input_size = 0;
    uint8_t* input = read_file(input_file, &input_size);

    if (!input) {
        fprintf(stderr, "Failed to load input file\n");
        return 1;
    }

    printf("Loaded %.2f KB\n", input_size / 1024.0);

    // Get image dimensions by trying a small crop
    size_t test_size = 0;
    uint8_t* test = magic_webp_crop(input, input_size, 0, 0, 1, 1, &test_size);
    if (test) {
        magic_webp_free(test);
        printf("Image appears valid\n\n");
    } else {
        printf("Warning: Could not validate image: %s\n\n", magic_webp_get_error());
    }

    // Create output directory if needed
    #ifdef _WIN32
    system("if not exist test-output mkdir test-output");
    #else
    system("mkdir -p test-output");
    #endif

    printf("=== Crop Tests ===\n");
    // Safe crop tests that work with any reasonable size
    test_crop(input, input_size, "crop_top_left_half", 0, 0, 100, 100);
    test_crop(input, input_size, "crop_center", 50, 50, 100, 100);
    test_crop(input, input_size, "crop_horizontal_strip", 0, 50, 200, 50);

    printf("\n=== Resize Tests ===\n");
    test_resize(input, input_size, "resize_half", 200, 200);
    test_resize(input, input_size, "resize_128x128_exact", 128, 128);
    test_resize(input, input_size, "resize_2x_upscale", 800, 800);
    test_resize(input, input_size, "resize_800x200_banner", 800, 200);
    test_resize(input, input_size, "resize_square_distorted", 300, 300);

    printf("\n=== Resize Fit Tests ===\n");
    test_resize_fit(input, input_size, "resize_fit_thumbnail_64x64", 64, 64);
    test_resize_fit(input, input_size, "resize_fit_300x300", 300, 300);
    test_resize_fit(input, input_size, "resize_fit_512x512", 512, 512);
    test_resize_fit(input, input_size, "resize_fit_256x64", 256, 64);

    printf("\n=== Chain Tests ===\n");
    test_chain(input, input_size);

    free(input);

    printf("\n=== All Tests Complete ===\n");
    printf("Check test-output/ directory for results\n");

    return 0;
}

