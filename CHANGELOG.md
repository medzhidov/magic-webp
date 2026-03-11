# Changelog

All notable changes to this project will be documented in this file.

## [1.0.1] - 2026-03-11

### Added
- `MagicWebpWorker` - Easy-to-use Web Worker API for non-blocking UI
- `MagicWebp.fromBytes()` - Load WebP from Uint8Array
- Quality control parameter (0-100) for all operations
- Comprehensive documentation with Worker usage examples
- GitHub Pages demo deployment
- Quality recommendations in README

### Changed
- **Default quality changed from 90 to 75** (balanced quality/size)
- Optimized resize operations using WebPPicture API (5-10x faster)
- Cover mode now uses single-pass resize+crop (2x faster)
- Unified Worker implementation (removed duplicate demo worker)
- Improved README with detailed examples and troubleshooting

### Fixed
- Worker message passing with proper request ID handling
- Correct dimension display in demo for processed images
- Export conflicts in TypeScript modules

### Performance
- 5-10x faster resize operations (SIMD optimizations)
- 2x faster cover mode (single-pass operation)
- Reduced memory usage (in-place operations)

## [0.2.0] - 2026-03-10

### Added
- Initial release with basic WebP processing
- Crop and resize operations
- Animated WebP support
- Multiple resize modes (cover, contain, fill, inside, outside)

## [0.1.0] - 2026-03-09

### Added
- Initial prototype

