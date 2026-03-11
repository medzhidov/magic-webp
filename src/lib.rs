use image::{DynamicImage, ImageBuffer, RgbaImage, imageops::FilterType};
use wasm_bindgen::prelude::*;

#[cfg(not(target_arch = "wasm32"))]
use webp_animation::{Decoder as WebpDecoder, Encoder as WebpEncoder, Frame as WebpFrame};

/// Sets up better panic messages in the browser console (dev builds).
#[wasm_bindgen(start)]
pub fn init_panic_hook() {
    console_error_panic_hook::set_once();
}

// ────────────────────────────────────────────────────────────────────────────
// Internal error type — implements Display so tests can inspect messages.
// The WASM exports convert this to JsError at the boundary.
// ────────────────────────────────────────────────────────────────────────────

#[derive(Debug)]
pub struct ImageError(pub String);

impl ImageError {
    fn new(msg: impl Into<String>) -> Self { Self(msg.into()) }
}

impl std::fmt::Display for ImageError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl std::error::Error for ImageError {}

// ────────────────────────────────────────────────────────────────────────────
// ProcessResult — returned from every operation.
// JS reads .data(), .width(), .height() directly.
// ────────────────────────────────────────────────────────────────────────────

#[derive(Debug)]
#[wasm_bindgen]
pub struct ProcessResult {
    data: Vec<u8>,
    width: u32,
    height: u32,
}

#[wasm_bindgen]
impl ProcessResult {
    /// Raw RGBA pixel bytes (length = width * height * 4).
    pub fn data(&self) -> Vec<u8> { self.data.clone() }
    pub fn width(&self) -> u32 { self.width }
    pub fn height(&self) -> u32 { self.height }
}

// ────────────────────────────────────────────────────────────────────────────
// Internal helpers (pure Rust, no WASM types — fully testable on native)
// ────────────────────────────────────────────────────────────────────────────

fn from_raw(data: &[u8], width: u32, height: u32) -> Result<DynamicImage, ImageError> {
    let buf: RgbaImage = ImageBuffer::from_raw(width, height, data.to_vec())
        .ok_or_else(|| ImageError::new("Invalid image data: buffer size does not match dimensions"))?;
    Ok(DynamicImage::ImageRgba8(buf))
}

fn into_result(img: DynamicImage) -> ProcessResult {
    let rgba = img.to_rgba8();
    let (width, height) = rgba.dimensions();
    ProcessResult { data: rgba.into_raw(), width, height }
}

// ────────────────────────────────────────────────────────────────────────────
// Core implementations — used by tests directly and by WASM exports below.
// ────────────────────────────────────────────────────────────────────────────

pub fn crop_impl(
    data: &[u8], img_width: u32, img_height: u32,
    x: u32, y: u32, crop_w: u32, crop_h: u32,
) -> Result<ProcessResult, ImageError> {
    if x + crop_w > img_width || y + crop_h > img_height {
        return Err(ImageError::new("Crop region extends beyond image boundaries"));
    }
    let img = from_raw(data, img_width, img_height)?;
    Ok(into_result(img.crop_imm(x, y, crop_w, crop_h)))
}

pub fn resize_impl(
    data: &[u8], img_width: u32, img_height: u32,
    new_width: u32, new_height: u32,
) -> Result<ProcessResult, ImageError> {
    if new_width == 0 || new_height == 0 {
        return Err(ImageError::new("Target dimensions must be greater than zero"));
    }
    let img = from_raw(data, img_width, img_height)?;
    Ok(into_result(img.resize_exact(new_width, new_height, FilterType::Lanczos3)))
}

pub fn resize_fit_impl(
    data: &[u8], img_width: u32, img_height: u32,
    max_width: u32, max_height: u32,
) -> Result<ProcessResult, ImageError> {
    if max_width == 0 || max_height == 0 {
        return Err(ImageError::new("Max dimensions must be greater than zero"));
    }
    let img = from_raw(data, img_width, img_height)?;
    Ok(into_result(img.resize(max_width, max_height, FilterType::Lanczos3)))
}

#[cfg(not(target_arch = "wasm32"))]
fn decode_webp_frames(data: &[u8]) -> Result<Vec<WebpFrame>, ImageError> {
    let decoder = WebpDecoder::new(data)
        .map_err(|e| ImageError::new(format!("Failed to decode WebP: {e}")))?;
    let frames: Vec<_> = decoder.into_iter().collect();
    if frames.is_empty() {
        return Err(ImageError::new("Decoded WebP contained no frames"));
    }
    Ok(frames)
}

#[cfg(not(target_arch = "wasm32"))]
fn final_animation_timestamp(frames: &[WebpFrame]) -> Result<i32, ImageError> {
    let last = frames
        .last()
        .ok_or_else(|| ImageError::new("Cannot finalize an animation with no frames"))?
        .timestamp();

    if frames.len() == 1 {
        return Ok(last.max(1));
    }

    let previous = frames[frames.len() - 2].timestamp();
    let delta = (last - previous).max(1);
    last.checked_add(delta)
        .ok_or_else(|| ImageError::new("Final animation timestamp overflowed"))
}

#[cfg(not(target_arch = "wasm32"))]
fn transform_webp_bytes(
    data: &[u8],
    transform: impl Fn(&[u8], u32, u32) -> Result<ProcessResult, ImageError>,
) -> Result<Vec<u8>, ImageError> {
    let frames = decode_webp_frames(data)?;
    let final_timestamp = final_animation_timestamp(&frames)?;

    let mut encoder: Option<WebpEncoder> = None;
    let mut output_dimensions: Option<(u32, u32)> = None;

    for frame in &frames {
        let (width, height) = frame.dimensions();
        let result = transform(frame.data(), width, height)?;
        let dimensions = (result.width, result.height);

        match output_dimensions {
            Some(expected) if expected != dimensions => {
                return Err(ImageError::new(
                    "Transformed animation frames must keep consistent dimensions",
                ));
            }
            Some(_) => {}
            None => {
                output_dimensions = Some(dimensions);
                encoder = Some(
                    WebpEncoder::new(dimensions).map_err(|e| {
                        ImageError::new(format!("Failed to initialize WebP encoder: {e}"))
                    })?,
                );
            }
        }

        encoder
            .as_mut()
            .ok_or_else(|| ImageError::new("WebP encoder was not initialized"))?
            .add_frame(&result.data, frame.timestamp())
            .map_err(|e| ImageError::new(format!("Failed to encode WebP frame: {e}")))?;
    }

    encoder
        .ok_or_else(|| ImageError::new("WebP encoder was not initialized"))?
        .finalize(final_timestamp)
        .map(|data| data.to_vec())
        .map_err(|e| ImageError::new(format!("Failed to finalize WebP animation: {e}")))
}

#[cfg(not(target_arch = "wasm32"))]
pub fn crop_webp_bytes_impl(
    data: &[u8],
    x: u32,
    y: u32,
    crop_w: u32,
    crop_h: u32,
) -> Result<Vec<u8>, ImageError> {
    transform_webp_bytes(data, |frame, width, height| {
        crop_impl(frame, width, height, x, y, crop_w, crop_h)
    })
}

#[cfg(not(target_arch = "wasm32"))]
pub fn resize_webp_bytes_impl(
    data: &[u8],
    new_width: u32,
    new_height: u32,
) -> Result<Vec<u8>, ImageError> {
    transform_webp_bytes(data, |frame, width, height| {
        resize_impl(frame, width, height, new_width, new_height)
    })
}

#[cfg(not(target_arch = "wasm32"))]
pub fn resize_fit_webp_bytes_impl(
    data: &[u8],
    max_width: u32,
    max_height: u32,
) -> Result<Vec<u8>, ImageError> {
    transform_webp_bytes(data, |frame, width, height| {
        resize_fit_impl(frame, width, height, max_width, max_height)
    })
}

// ────────────────────────────────────────────────────────────────────────────
// WASM exports — thin wrappers that convert ImageError → JsError
// ────────────────────────────────────────────────────────────────────────────

#[wasm_bindgen]
pub fn crop(
    data: &[u8], img_width: u32, img_height: u32,
    x: u32, y: u32, crop_w: u32, crop_h: u32,
) -> Result<ProcessResult, JsError> {
    crop_impl(data, img_width, img_height, x, y, crop_w, crop_h)
        .map_err(|e| JsError::new(&e.0))
}

#[wasm_bindgen]
pub fn resize(
    data: &[u8], img_width: u32, img_height: u32,
    new_width: u32, new_height: u32,
) -> Result<ProcessResult, JsError> {
    resize_impl(data, img_width, img_height, new_width, new_height)
        .map_err(|e| JsError::new(&e.0))
}

#[wasm_bindgen]
pub fn resize_fit(
    data: &[u8], img_width: u32, img_height: u32,
    max_width: u32, max_height: u32,
) -> Result<ProcessResult, JsError> {
    resize_fit_impl(data, img_width, img_height, max_width, max_height)
        .map_err(|e| JsError::new(&e.0))
}

// ────────────────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    // ── Helpers ───────────────────────────────────────────────────────────────

    fn solid(width: u32, height: u32, color: [u8; 4]) -> Vec<u8> {
        let n = (width * height) as usize;
        let mut buf = vec![0u8; n * 4];
        for i in 0..n { buf[i * 4..i * 4 + 4].copy_from_slice(&color); }
        buf
    }

    /// 4×4 image with four solid-colour quadrants:
    /// TL=red, TR=green, BL=blue, BR=white
    fn quad4x4() -> Vec<u8> {
        const R: [u8; 4] = [255, 0, 0, 255];
        const G: [u8; 4] = [0, 255, 0, 255];
        const B: [u8; 4] = [0, 0, 255, 255];
        const W: [u8; 4] = [255, 255, 255, 255];
        let mut buf = vec![0u8; 4 * 4 * 4];
        for row in 0..4u32 {
            let colors: [[u8; 4]; 4] = if row < 2 { [R, R, G, G] } else { [B, B, W, W] };
            for col in 0..4usize {
                let off = (row as usize * 4 + col) * 4;
                buf[off..off + 4].copy_from_slice(&colors[col]);
            }
        }
        buf
    }

    fn px(buf: &[u8], width: u32, x: u32, y: u32) -> [u8; 4] {
        let off = ((y * width + x) * 4) as usize;
        [buf[off], buf[off + 1], buf[off + 2], buf[off + 3]]
    }

    fn err_msg(e: ImageError) -> String { e.to_string() }

    // ── ProcessResult ─────────────────────────────────────────────────────────

    #[test]
    fn process_result_accessors() {
        let r = ProcessResult { data: vec![1, 2, 3, 4], width: 1, height: 1 };
        assert_eq!(r.width(), 1);
        assert_eq!(r.height(), 1);
        assert_eq!(r.data(), vec![1, 2, 3, 4]);
    }

    #[test]
    fn process_result_data_returns_clone() {
        let r = ProcessResult { data: vec![10; 16], width: 2, height: 2 };
        assert_eq!(r.data(), r.data());
    }

    // ── from_raw (via crop_impl happy/error path) ─────────────────────────────

    #[test]
    fn from_raw_valid_buffer() {
        assert!(crop_impl(&solid(2, 2, [0; 4]), 2, 2, 0, 0, 2, 2).is_ok());
    }

    #[test]
    fn from_raw_buffer_too_small() {
        let result = crop_impl(&vec![0u8; 4], 2, 2, 0, 0, 1, 1);
        assert!(result.is_err());
        assert!(err_msg(result.unwrap_err()).contains("Invalid image data"));
    }

    #[test]
    fn from_raw_empty_buffer() {
        assert!(crop_impl(&[], 1, 1, 0, 0, 1, 1).is_err());
    }

    // ── crop_impl ─────────────────────────────────────────────────────────────

    #[test]
    fn crop_correct_dimensions() {
        let r = crop_impl(&solid(10, 8, [0; 4]), 10, 8, 2, 1, 5, 4).unwrap();
        assert_eq!((r.width(), r.height()), (5, 4));
        assert_eq!(r.data().len(), 5 * 4 * 4);
    }

    #[test]
    fn crop_at_origin_preserves_colour() {
        let buf = solid(4, 4, [7, 8, 9, 255]);
        let r = crop_impl(&buf, 4, 4, 0, 0, 2, 2).unwrap();
        assert_eq!((r.width(), r.height()), (2, 2));
        for chunk in r.data().chunks_exact(4) {
            assert_eq!(chunk, &[7, 8, 9, 255]);
        }
    }

    #[test]
    fn crop_full_image() {
        let buf = solid(3, 3, [100, 150, 200, 255]);
        let r = crop_impl(&buf, 3, 3, 0, 0, 3, 3).unwrap();
        assert_eq!(r.data(), buf);
    }

    #[test]
    fn crop_single_pixel() {
        let buf = solid(5, 5, [42, 43, 44, 255]);
        let r = crop_impl(&buf, 5, 5, 3, 2, 1, 1).unwrap();
        assert_eq!(r.data(), vec![42, 43, 44, 255]);
    }

    #[test]
    fn crop_top_right_quadrant_is_green() {
        let buf = quad4x4();
        let r = crop_impl(&buf, 4, 4, 2, 0, 2, 2).unwrap();
        for chunk in r.data().chunks_exact(4) {
            assert_eq!(chunk, &[0u8, 255, 0, 255], "expected green");
        }
    }

    #[test]
    fn crop_bottom_left_quadrant_is_blue() {
        let buf = quad4x4();
        let r = crop_impl(&buf, 4, 4, 0, 2, 2, 2).unwrap();
        for chunk in r.data().chunks_exact(4) {
            assert_eq!(chunk, &[0u8, 0, 255, 255], "expected blue");
        }
    }

    #[test]
    fn crop_bottom_right_quadrant_is_white() {
        let buf = quad4x4();
        let r = crop_impl(&buf, 4, 4, 2, 2, 2, 2).unwrap();
        for chunk in r.data().chunks_exact(4) {
            assert_eq!(chunk, &[255u8, 255, 255, 255], "expected white");
        }
    }

    #[test]
    fn crop_top_left_quadrant_is_red() {
        let buf = quad4x4();
        let d = crop_impl(&buf, 4, 4, 0, 0, 2, 2).unwrap().data();
        assert_eq!(px(&d, 2, 0, 0), [255, 0, 0, 255]);
        assert_eq!(px(&d, 2, 1, 1), [255, 0, 0, 255]);
    }

    #[test]
    fn crop_exact_boundary_is_valid() {
        let buf = solid(4, 4, [1, 2, 3, 4]);
        assert!(crop_impl(&buf, 4, 4, 2, 2, 2, 2).is_ok());
    }

    #[test]
    fn crop_out_of_bounds_x() {
        let result = crop_impl(&solid(4, 4, [0; 4]), 4, 4, 3, 0, 2, 2);
        assert!(result.is_err());
        assert!(err_msg(result.unwrap_err()).contains("beyond image boundaries"));
    }

    #[test]
    fn crop_out_of_bounds_y() {
        assert!(crop_impl(&solid(4, 4, [0; 4]), 4, 4, 0, 3, 2, 2).is_err());
    }

    #[test]
    fn crop_out_of_bounds_both() {
        assert!(crop_impl(&solid(4, 4, [0; 4]), 4, 4, 3, 3, 2, 2).is_err());
    }

    #[test]
    fn crop_x_at_width_is_invalid() {
        assert!(crop_impl(&solid(4, 4, [0; 4]), 4, 4, 4, 0, 1, 1).is_err());
    }

    #[test]
    fn crop_preserves_alpha_channel() {
        let buf = solid(4, 4, [128, 64, 32, 127]);
        let d = crop_impl(&buf, 4, 4, 1, 1, 2, 2).unwrap().data();
        assert_eq!(d[3], 127, "alpha must be preserved");
    }

    // ── resize_impl ───────────────────────────────────────────────────────────

    #[test]
    fn resize_correct_dimensions() {
        let r = resize_impl(&solid(8, 6, [0; 4]), 8, 6, 4, 3).unwrap();
        assert_eq!((r.width(), r.height()), (4, 3));
        assert_eq!(r.data().len(), 4 * 3 * 4);
    }

    #[test]
    fn resize_upscale() {
        let r = resize_impl(&solid(2, 2, [0; 4]), 2, 2, 8, 8).unwrap();
        assert_eq!((r.width(), r.height()), (8, 8));
    }

    #[test]
    fn resize_downscale() {
        let r = resize_impl(&solid(100, 100, [0; 4]), 100, 100, 10, 10).unwrap();
        assert_eq!((r.width(), r.height()), (10, 10));
    }

    #[test]
    fn resize_to_same_size() {
        let r = resize_impl(&solid(4, 4, [0; 4]), 4, 4, 4, 4).unwrap();
        assert_eq!((r.width(), r.height()), (4, 4));
    }

    #[test]
    fn resize_changes_aspect_ratio() {
        // resize_exact forces exact dims regardless of aspect ratio
        let r = resize_impl(&solid(8, 4, [0; 4]), 8, 4, 4, 4).unwrap();
        assert_eq!((r.width(), r.height()), (4, 4));
    }

    #[test]
    fn resize_to_1x1() {
        let r = resize_impl(&solid(50, 50, [0; 4]), 50, 50, 1, 1).unwrap();
        assert_eq!(r.data().len(), 4);
    }

    #[test]
    fn resize_data_length_matches_dimensions() {
        let r = resize_impl(&solid(12, 8, [0; 4]), 12, 8, 7, 5).unwrap();
        assert_eq!(r.data().len(), (r.width() * r.height() * 4) as usize);
    }

    #[test]
    fn resize_zero_width_is_error() {
        let result = resize_impl(&solid(4, 4, [0; 4]), 4, 4, 0, 4);
        assert!(result.is_err());
        assert!(err_msg(result.unwrap_err()).contains("greater than zero"));
    }

    #[test]
    fn resize_zero_height_is_error() {
        assert!(resize_impl(&solid(4, 4, [0; 4]), 4, 4, 4, 0).is_err());
    }

    #[test]
    fn resize_both_zero_is_error() {
        assert!(resize_impl(&solid(4, 4, [0; 4]), 4, 4, 0, 0).is_err());
    }

    #[test]
    fn resize_invalid_buffer_is_error() {
        assert!(resize_impl(&vec![0u8; 4], 10, 10, 5, 5).is_err());
    }

    // ── resize_fit_impl ───────────────────────────────────────────────────────

    #[test]
    fn resize_fit_landscape_constrained_by_width() {
        // 400×200 → max 100×100 → 100×50
        let r = resize_fit_impl(&solid(400, 200, [0; 4]), 400, 200, 100, 100).unwrap();
        assert_eq!((r.width(), r.height()), (100, 50));
    }

    #[test]
    fn resize_fit_portrait_constrained_by_height() {
        // 200×400 → max 100×100 → 50×100
        let r = resize_fit_impl(&solid(200, 400, [0; 4]), 200, 400, 100, 100).unwrap();
        assert_eq!((r.width(), r.height()), (50, 100));
    }

    #[test]
    fn resize_fit_square_into_square_bounds() {
        let r = resize_fit_impl(&solid(200, 200, [0; 4]), 200, 200, 100, 100).unwrap();
        assert_eq!((r.width(), r.height()), (100, 100));
    }

    #[test]
    fn resize_fit_upscales_to_fill_bounds() {
        // image::resize scales UP to the largest size that fits within bounds.
        // 40×30 (4:3) → max 100×100: width wins → 100×75
        let r = resize_fit_impl(&solid(40, 30, [0; 4]), 40, 30, 100, 100).unwrap();
        assert!(r.width() <= 100);
        assert!(r.height() <= 100);
        // aspect ratio 4:3 must be preserved (±0.1 tolerance for rounding)
        let ratio = r.width() as f32 / r.height() as f32;
        assert!((ratio - 4.0 / 3.0).abs() < 0.1, "ratio was {ratio}, expected ~1.33");
    }

    #[test]
    fn resize_fit_exact_bounds_match() {
        let r = resize_fit_impl(&solid(100, 100, [0; 4]), 100, 100, 100, 100).unwrap();
        assert_eq!((r.width(), r.height()), (100, 100));
    }

    #[test]
    fn resize_fit_aspect_ratio_preserved() {
        // 300×100 (3:1) → max 60×60 → 60×20
        let r = resize_fit_impl(&solid(300, 100, [0; 4]), 300, 100, 60, 60).unwrap();
        assert!(r.width() <= 60);
        assert!(r.height() <= 60);
        let ratio = r.width() as f32 / r.height() as f32;
        assert!((ratio - 3.0).abs() < 0.5, "aspect ratio was {ratio}, expected ~3.0");
    }

    #[test]
    fn resize_fit_asymmetric_bounds() {
        // 100×100 → max 200×50: height limits → ≤200w, ≤50h
        let r = resize_fit_impl(&solid(100, 100, [0; 4]), 100, 100, 200, 50).unwrap();
        assert!(r.width() <= 200);
        assert!(r.height() <= 50);
    }

    #[test]
    fn resize_fit_data_length_matches_dimensions() {
        let r = resize_fit_impl(&solid(80, 60, [0; 4]), 80, 60, 40, 40).unwrap();
        assert_eq!(r.data().len(), (r.width() * r.height() * 4) as usize);
    }

    #[test]
    fn resize_fit_zero_max_width_is_error() {
        let result = resize_fit_impl(&solid(4, 4, [0; 4]), 4, 4, 0, 100);
        assert!(result.is_err());
        assert!(err_msg(result.unwrap_err()).contains("greater than zero"));
    }

    #[test]
    fn resize_fit_zero_max_height_is_error() {
        assert!(resize_fit_impl(&solid(4, 4, [0; 4]), 4, 4, 100, 0).is_err());
    }

    #[test]
    fn resize_fit_invalid_buffer_is_error() {
        assert!(resize_fit_impl(&vec![0u8; 8], 10, 10, 5, 5).is_err());
    }
}

