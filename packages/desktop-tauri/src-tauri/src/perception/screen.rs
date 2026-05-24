//! Screen capture module

use anyhow::{anyhow, Result};
use base64::{engine::general_purpose::STANDARD, Engine};
use image::ImageEncoder;
use screenshots::Screen;

/// Capture the primary screen and return (base64_png, width, height)
pub async fn capture_screenshot() -> Result<(String, u32, u32)> {
    let screens = Screen::all().map_err(|e| anyhow!("Failed to get screens: {}", e))?;

    let screen = screens
        .into_iter()
        .next()
        .ok_or_else(|| anyhow!("No screen available"))?;

    let image = screen
        .capture()
        .map_err(|e| anyhow!("Failed to capture screen: {}", e))?;

    let width = image.width();
    let height = image.height();

    let mut png_data = Vec::new();
    let encoder = image::codecs::png::PngEncoder::new(&mut png_data);
    encoder
        .write_image(
            image.as_raw(),
            width,
            height,
            image::ExtendedColorType::Rgba8,
        )
        .map_err(|e| anyhow!("Failed to encode PNG: {}", e))?;

    let base64_data = STANDARD.encode(&png_data);

    Ok((base64_data, width, height))
}

/// Capture the primary screen, then crop a square region centered on `(cx, cy)`
/// with `half_size` pixels on each side. Returns the cropped PNG as base64.
///
/// `cx` / `cy` are in **screen pixel coordinates** (top-left origin), the same
/// space the gaze tracker reports. Half-size of 200 → 400×400 crop.
/// The crop is clamped to the screen bounds (so requests near the edge still
/// succeed, they just produce a smaller image).
pub async fn capture_region(cx: i32, cy: i32, half_size: u32) -> Result<(String, u32, u32)> {
    use image::{GenericImage, RgbaImage};

    let screens = Screen::all().map_err(|e| anyhow!("Failed to get screens: {}", e))?;
    let screen = screens
        .into_iter()
        .next()
        .ok_or_else(|| anyhow!("No screen available"))?;

    let raw = screen
        .capture()
        .map_err(|e| anyhow!("Failed to capture screen: {}", e))?;
    let screen_w = raw.width();
    let screen_h = raw.height();

    let mut full = RgbaImage::from_raw(screen_w, screen_h, raw.into_raw())
        .ok_or_else(|| anyhow!("Failed to build RgbaImage from raw capture"))?;

    let half = half_size as i32;
    let x = (cx - half).max(0) as u32;
    let y = (cy - half).max(0) as u32;
    let max_x = ((cx + half).max(0) as u32).min(screen_w);
    let max_y = ((cy + half).max(0) as u32).min(screen_h);
    let w = max_x.saturating_sub(x).max(1);
    let h = max_y.saturating_sub(y).max(1);

    let cropped = full.sub_image(x, y, w, h).to_image();

    let mut png_data = Vec::new();
    let encoder = image::codecs::png::PngEncoder::new(&mut png_data);
    encoder
        .write_image(cropped.as_raw(), w, h, image::ExtendedColorType::Rgba8)
        .map_err(|e| anyhow!("Failed to encode cropped PNG: {}", e))?;

    Ok((STANDARD.encode(&png_data), w, h))
}
