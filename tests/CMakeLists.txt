cmake_minimum_required(VERSION 3.15)
project(magic-webp-tests C)

set(CMAKE_C_STANDARD 11)

# Find libwebp
find_path(WEBP_INCLUDE_DIR webp/decode.h
    PATHS ${CMAKE_SOURCE_DIR}/../libwebp/src
    NO_DEFAULT_PATH
)

find_library(WEBP_LIBRARY
    NAMES webp
    PATHS ${CMAKE_SOURCE_DIR}/../build/libwebp
    NO_DEFAULT_PATH
)

find_library(WEBPDEMUX_LIBRARY
    NAMES webpdemux
    PATHS ${CMAKE_SOURCE_DIR}/../build/libwebp
    NO_DEFAULT_PATH
)

find_library(WEBPMUX_LIBRARY
    NAMES webpmux libwebpmux
    PATHS ${CMAKE_SOURCE_DIR}/../build/libwebp
    NO_DEFAULT_PATH
)

find_library(SHARPYUV_LIBRARY
    NAMES sharpyuv
    PATHS ${CMAKE_SOURCE_DIR}/../build/libwebp
    NO_DEFAULT_PATH
)

if(NOT WEBP_INCLUDE_DIR OR NOT WEBP_LIBRARY)
    message(FATAL_ERROR "libwebp not found. Please run 'pnpm run build:wasm' first.")
endif()

# Test executable
add_executable(test_webp
    test_webp.c
    ../src-c/magic_webp.c
    ../src-c/animation.c
)

target_include_directories(test_webp PRIVATE
    ${WEBP_INCLUDE_DIR}
)

target_link_libraries(test_webp
    ${WEBPMUX_LIBRARY}
    ${WEBPDEMUX_LIBRARY}
    ${WEBP_LIBRARY}
    ${SHARPYUV_LIBRARY}
)

# On Windows, link math library if needed
if(UNIX)
    target_link_libraries(test_webp m pthread)
endif()

