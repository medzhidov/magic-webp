/// Integration tests — load demo/giphy.webp, run real operations on encoded
/// animated WebP bytes, and save animated WebP output for visual inspection.
use magic_webp::{crop_webp_bytes_impl, resize_fit_webp_bytes_impl, resize_webp_bytes_impl};
use std::fs;
use webp_animation::Decoder;

const SRC: &str = "demo/giphy.webp";
const OUT: &str = "test-output";

// ── Helpers ───────────────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
struct AnimationInfo {
    frame_count: usize,
    width: u32,
    height: u32,
    timestamps: Vec<i32>,
}

fn load(path: &str) -> Vec<u8> {
    let data = fs::read(path).unwrap_or_else(|e| panic!("Cannot read '{path}': {e}"));
    let info = inspect(&data);
    println!(
        "Loaded '{path}' — {} frames, {}×{} px",
        info.frame_count, info.width, info.height
    );
    data
}

fn inspect(data: &[u8]) -> AnimationInfo {
    let decoder = Decoder::new(data)
        .unwrap_or_else(|e| panic!("Cannot decode WebP animation: {e}"));
    let frames: Vec<_> = decoder.into_iter().collect();
    assert!(!frames.is_empty(), "Decoded animation must contain at least one frame");

    let (width, height) = frames[0].dimensions();
    assert!(
        frames.iter().all(|frame| frame.dimensions() == (width, height)),
        "all decoded frames must share canvas dimensions"
    );

    AnimationInfo {
        frame_count: frames.len(),
        width,
        height,
        timestamps: frames.iter().map(|frame| frame.timestamp()).collect(),
    }
}

fn save(data: &[u8], name: &str) {
    fs::create_dir_all(OUT).unwrap();
    let path = format!("{OUT}/{name}.webp");
    fs::write(&path, data).unwrap_or_else(|e| panic!("Cannot write '{path}': {e}"));
    let info = inspect(data);
    let kb = fs::metadata(&path).map(|m| m.len() as f32 / 1024.0).unwrap_or(0.0);
    println!(
        "  → saved  {path}  ({} frames, {}×{} px, {kb:.1} KB)",
        info.frame_count, info.width, info.height
    );
}

fn assert_animation_preserved(source: &AnimationInfo, result: &AnimationInfo) {
    assert_eq!(result.frame_count, source.frame_count, "frame count changed");
    assert_eq!(result.timestamps, source.timestamps, "frame timestamps changed");
}

// ── crop ─────────────────────────────────────────────────────────────────────

#[test]
fn crop_top_left_region() {
    let data = load(SRC);
    let src = inspect(&data);
    let out = crop_webp_bytes_impl(&data, 0, 0, src.width / 2, src.height / 2).unwrap();
    let result = inspect(&out);
    save(&out, "crop_top_left_half");
    assert_eq!((result.width, result.height), (src.width / 2, src.height / 2));
    assert_animation_preserved(&src, &result);
}

#[test]
fn crop_center() {
    let data = load(SRC);
    let src = inspect(&data);
    let (cw, ch) = (src.width / 2, src.height / 2);
    let (x, y) = ((src.width - cw) / 2, (src.height - ch) / 2);
    let out = crop_webp_bytes_impl(&data, x, y, cw, ch).unwrap();
    let result = inspect(&out);
    save(&out, "crop_center");
    assert_eq!((result.width, result.height), (cw, ch));
    assert_animation_preserved(&src, &result);
}

#[test]
fn crop_bottom_right_region() {
    let data = load(SRC);
    let src = inspect(&data);
    let (cw, ch) = (src.width / 2, src.height / 2);
    let out = crop_webp_bytes_impl(&data, cw, ch, cw, ch).unwrap();
    let result = inspect(&out);
    save(&out, "crop_bottom_right_half");
    assert_eq!((result.width, result.height), (cw, ch));
    assert_animation_preserved(&src, &result);
}

#[test]
fn crop_thin_horizontal_strip() {
    let data = load(SRC);
    let src = inspect(&data);
    let strip_h = (src.height / 8).max(1);
    let out = crop_webp_bytes_impl(
        &data,
        0,
        src.height / 2 - strip_h / 2,
        src.width,
        strip_h,
    )
    .unwrap();
    let result = inspect(&out);
    save(&out, "crop_horizontal_strip");
    assert_eq!(result.width, src.width);
    assert_animation_preserved(&src, &result);
}

#[test]
fn crop_single_pixel_center() {
    let data = load(SRC);
    let src = inspect(&data);
    let out = crop_webp_bytes_impl(&data, src.width / 2, src.height / 2, 1, 1).unwrap();
    let result = inspect(&out);
    assert_eq!((result.width, result.height), (1, 1));
    assert!(result.frame_count > 1, "single-pixel crop must remain animated");
}

// ── resize_impl ───────────────────────────────────────────────────────────────

#[test]
fn resize_downscale_half() {
    let data = load(SRC);
    let src = inspect(&data);
    let out = resize_webp_bytes_impl(&data, src.width / 2, src.height / 2).unwrap();
    let result = inspect(&out);
    save(&out, "resize_half");
    assert_eq!((result.width, result.height), (src.width / 2, src.height / 2));
    assert_animation_preserved(&src, &result);
}

#[test]
fn resize_to_fixed_thumbnail() {
    let data = load(SRC);
    let src = inspect(&data);
    let out = resize_webp_bytes_impl(&data, 128, 128).unwrap();
    let result = inspect(&out);
    save(&out, "resize_128x128_exact");
    assert_eq!((result.width, result.height), (128, 128));
    assert_animation_preserved(&src, &result);
}

#[test]
fn resize_to_wide_banner() {
    let data = load(SRC);
    let src = inspect(&data);
    let out = resize_webp_bytes_impl(&data, 800, 200).unwrap();
    let result = inspect(&out);
    save(&out, "resize_800x200_banner");
    assert_eq!((result.width, result.height), (800, 200));
    assert_animation_preserved(&src, &result);
}

#[test]
fn resize_upscale_2x() {
    let data = load(SRC);
    let src = inspect(&data);
    let out = resize_webp_bytes_impl(&data, src.width * 2, src.height * 2).unwrap();
    let result = inspect(&out);
    save(&out, "resize_2x_upscale");
    assert_eq!((result.width, result.height), (src.width * 2, src.height * 2));
    assert_animation_preserved(&src, &result);
}

#[test]
fn resize_to_square_distorted() {
    // Intentionally distort aspect ratio to confirm resize_exact behaviour
    let data = load(SRC);
    let src = inspect(&data);
    let side = src.width.min(src.height);
    let out = resize_webp_bytes_impl(&data, side, side).unwrap();
    let result = inspect(&out);
    save(&out, "resize_square_distorted");
    assert_eq!((result.width, result.height), (side, side));
    assert_animation_preserved(&src, &result);
}

// ── resize_fit_impl ───────────────────────────────────────────────────────────

#[test]
fn resize_fit_into_512x512() {
    let data = load(SRC);
    let src = inspect(&data);
    let out = resize_fit_webp_bytes_impl(&data, 512, 512).unwrap();
    let result = inspect(&out);
    save(&out, "resize_fit_512x512");
    assert!(result.width <= 512 && result.height <= 512);
    assert_animation_preserved(&src, &result);
}

#[test]
fn resize_fit_into_256x64_wide() {
    // Very wide box — height becomes the limiting dimension
    let data = load(SRC);
    let src = inspect(&data);
    let out = resize_fit_webp_bytes_impl(&data, 256, 64).unwrap();
    let result = inspect(&out);
    save(&out, "resize_fit_256x64");
    assert!(result.width <= 256 && result.height <= 64);
    assert_animation_preserved(&src, &result);
}

#[test]
fn resize_fit_thumbnail_64x64() {
    let data = load(SRC);
    let src = inspect(&data);
    let out = resize_fit_webp_bytes_impl(&data, 64, 64).unwrap();
    let result = inspect(&out);
    save(&out, "resize_fit_thumbnail_64x64");
    assert!(result.width <= 64 && result.height <= 64);
    assert_animation_preserved(&src, &result);
}

#[test]
fn resize_fit_preserves_aspect_ratio() {
    let data = load(SRC);
    let src = inspect(&data);
    let original_ratio = src.width as f32 / src.height as f32;
    let out = resize_fit_webp_bytes_impl(&data, 300, 300).unwrap();
    let result = inspect(&out);
    save(&out, "resize_fit_300x300");
    let result_ratio = result.width as f32 / result.height as f32;
    assert!(
        (result_ratio - original_ratio).abs() < 0.05,
        "ratio changed: {original_ratio:.3} → {result_ratio:.3}"
    );
    assert_animation_preserved(&src, &result);
}

// ── chained operations ────────────────────────────────────────────────────────

#[test]
fn crop_then_resize_fit() {
    let data = load(SRC);
    let src = inspect(&data);
    // 1. crop centre half
    let (cw, ch) = (src.width / 2, src.height / 2);
    let cropped = crop_webp_bytes_impl(&data, (src.width - cw) / 2, (src.height - ch) / 2, cw, ch)
        .unwrap();
    // 2. fit into thumbnail
    let thumb = resize_fit_webp_bytes_impl(&cropped, 128, 128).unwrap();
    let result = inspect(&thumb);
    save(&thumb, "chain_crop_center_then_fit_128");
    assert!(result.width <= 128 && result.height <= 128);
    assert_animation_preserved(&src, &result);
}

