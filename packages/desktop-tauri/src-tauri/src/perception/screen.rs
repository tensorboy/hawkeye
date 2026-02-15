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
