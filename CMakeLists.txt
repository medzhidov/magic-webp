cmake_minimum_required(VERSION 3.15)
project(magic-webp C)

set(CMAKE_C_STANDARD 11)

# ────────────────────────────────────────────────────────────────────────────
# Build libwebp
# ────────────────────────────────────────────────────────────────────────────

set(WEBP_BUILD_ANIM_UTILS OFF CACHE BOOL "Build animation utilities")
set(WEBP_BUILD_CWEBP OFF CACHE BOOL "Build cwebp")
set(WEBP_BUILD_DWEBP OFF CACHE BOOL "Build dwebp")
set(WEBP_BUILD_GIF2WEBP OFF CACHE BOOL "Build gif2webp")
set(WEBP_BUILD_IMG2WEBP OFF CACHE BOOL "Build img2webp")
set(WEBP_BUILD_VWEBP OFF CACHE BOOL "Build vwebp")
set(WEBP_BUILD_WEBPINFO OFF CACHE BOOL "Build webpinfo")
set(WEBP_BUILD_WEBPMUX OFF CACHE BOOL "Build webpmux")
set(WEBP_BUILD_EXTRAS OFF CACHE BOOL "Build extras")

add_subdirectory(libwebp)

# ────────────────────────────────────────────────────────────────────────────
# Build magic-webp WASM module
# ────────────────────────────────────────────────────────────────────────────

add_executable(magic_webp
    src-c/magic_webp.c
    src-c/animation.c
)

target_include_directories(magic_webp PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/libwebp/src
)

target_link_libraries(magic_webp
    webp
    webpdemux
    libwebpmux
)

# ────────────────────────────────────────────────────────────────────────────
# Emscripten settings
# ────────────────────────────────────────────────────────────────────────────

set(EMSCRIPTEN_FLAGS
    -O3
    -sWASM=1
    -sEXPORT_ES6=1
    -sMODULARIZE=1
    -sEXPORT_NAME=createMagicWebpModule
    -sEXPORTED_FUNCTIONS=['_malloc','_free','_magic_webp_crop','_magic_webp_resize','_magic_webp_resize_fit','_magic_webp_resize_cover','_magic_webp_free','_magic_webp_get_error']
    -sEXPORTED_RUNTIME_METHODS=['ccall','cwrap','UTF8ToString','getValue','setValue','writeArrayToMemory']
    -sALLOW_MEMORY_GROWTH=1
    -sINITIAL_MEMORY=33554432
    -sMAXIMUM_MEMORY=2147483648
    -sSTACK_SIZE=5242880
    -sENVIRONMENT=web,worker
    -sNO_FILESYSTEM=1
    -sMODULARIZE=1
    -sIMPORTED_MEMORY=0
    --no-entry
)

string(REPLACE ";" " " EMSCRIPTEN_FLAGS_STR "${EMSCRIPTEN_FLAGS}")
set_target_properties(magic_webp PROPERTIES
    LINK_FLAGS "${EMSCRIPTEN_FLAGS_STR}"
    SUFFIX ".mjs"
    OUTPUT_NAME "magic_webp"
)

# ────────────────────────────────────────────────────────────────────────────
# Output to pkg directory
# ────────────────────────────────────────────────────────────────────────────

set_target_properties(magic_webp PROPERTIES
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}/pkg"
)

