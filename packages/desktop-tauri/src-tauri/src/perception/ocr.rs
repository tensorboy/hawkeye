//! OCR module — macOS Vision API via Swift CLI helper

use anyhow::{anyhow, Result};
use base64::{engine::general_purpose::STANDARD, Engine};
use serde::Deserialize;
use std::io::Write;
use std::path::PathBuf;

/// RAII guard that removes a temp file on drop
struct TempFileGuard(PathBuf);

impl Drop for TempFileGuard {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.0);
    }
}

/// OCR result with combined text and timing
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrResult {
    pub text: String,
    pub regions: Vec<OcrRegion>,
    pub duration_ms: u64,
    pub backend: String,
}

/// Individual recognized text region
#[derive(Debug, Clone, serde::Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrRegion {
    pub text: String,
    pub confidence: f32,
    pub bbox: BoundingBox,
}

/// Bounding box from Vision API (normalized 0-1 coordinates)
#[derive(Debug, Clone, serde::Serialize, Deserialize)]
pub struct BoundingBox {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

/// Run OCR on a base64-encoded image using macOS Vision API
pub async fn run_ocr(image_base64: &str) -> Result<OcrResult> {
    let start = std::time::Instant::now();

    // Decode base64 to raw PNG bytes
    let image_data = STANDARD
        .decode(image_base64)
        .map_err(|e| anyhow!("Failed to decode base64: {}", e))?;

    #[cfg(target_os = "macos")]
    {
        run_vision_ocr(&image_data, start).await
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = image_data;
        Err(anyhow!("OCR not supported on this platform"))
    }
}

#[cfg(target_os = "macos")]
async fn run_vision_ocr(
    image_data: &[u8],
    start: std::time::Instant,
) -> Result<OcrResult> {
    // Write image to temp file
    let temp_dir = std::env::temp_dir();
    let temp_path = temp_dir.join(format!("hawkeye-ocr-{}.png", uuid::Uuid::new_v4()));

    {
        let mut file = std::fs::File::create(&temp_path)
            .map_err(|e| anyhow!("Failed to create temp file: {}", e))?;
        file.write_all(image_data)
            .map_err(|e| anyhow!("Failed to write temp file: {}", e))?;
    }

    // Guard ensures temp file is cleaned up even on early return or panic
    let _guard = TempFileGuard(temp_path.clone());

    // Find the OCR binary — check several locations
    let ocr_binary = find_ocr_binary()?;

    // Call Swift CLI
    let temp_path_str = temp_path.to_string_lossy().to_string();
    let output = tokio::process::Command::new(&ocr_binary)
        .arg(&temp_path_str)
        .output()
        .await
        .map_err(|e| anyhow!("Failed to run OCR binary '{}': {}", ocr_binary, e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(anyhow!("OCR process failed: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);

    // Parse JSON output from Swift CLI
    let regions: Vec<OcrRegion> = serde_json::from_str(&stdout)
        .map_err(|e| anyhow!("Failed to parse OCR output: {} (raw: {})", e, &stdout[..stdout.len().min(200)]))?;

    // Combine all text regions into a single string
    let text = regions
        .iter()
        .map(|r| r.text.as_str())
        .collect::<Vec<_>>()
        .join("\n");

    Ok(OcrResult {
        text,
        regions,
        duration_ms: start.elapsed().as_millis() as u64,
        backend: "macos-vision".to_string(),
    })
}

#[cfg(target_os = "macos")]
fn find_ocr_binary() -> Result<String> {
    use std::path::Path;

    // 1. Check compile-time env from build.rs
    if let Some(path) = option_env!("HAWKEYE_OCR_PATH") {
        if Path::new(path).exists() {
            return Ok(path.to_string());
        }
    }

    // 2. Check next to the running binary (for bundled app)
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            let bundled = exe_dir.join("hawkeye-ocr");
            if bundled.exists() {
                return Ok(bundled.to_string_lossy().to_string());
            }
            // Also check ../Resources/ for macOS .app bundle
            let resources = exe_dir.join("../Resources/hawkeye-ocr");
            if resources.exists() {
                return Ok(resources.to_string_lossy().to_string());
            }
        }
    }

    // 3. Check in the OUT_DIR pattern (dev builds)
    let target_dirs = [
        "target/debug/build",
        "target/release/build",
    ];
    for dir in &target_dirs {
        if let Ok(entries) = std::fs::read_dir(dir) {
            for entry in entries.flatten() {
                let candidate = entry.path().join("out/hawkeye-ocr");
                if candidate.exists() {
                    return Ok(candidate.to_string_lossy().to_string());
                }
            }
        }
    }

    Err(anyhow!(
        "hawkeye-ocr binary not found. Ensure Swift OCR helper was compiled during build."
    ))
}
