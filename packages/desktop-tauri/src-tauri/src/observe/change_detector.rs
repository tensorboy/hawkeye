//! Perceptual hash change detection for the observe loop

/// Compute a simple average-hash (aHash) from raw RGBA PNG bytes.
/// Returns a 64-bit perceptual hash.
pub fn compute_phash(rgba_data: &[u8], width: u32, height: u32) -> u64 {
    // Downsample to 8x8 grayscale
    let mut gray_8x8 = [0u32; 64];
    let block_w = width / 8;
    let block_h = height / 8;

    if block_w == 0 || block_h == 0 {
        return 0;
    }

    for by in 0..8u32 {
        for bx in 0..8u32 {
            let mut sum = 0u64;
            let mut count = 0u32;
            for y in (by * block_h)..((by + 1) * block_h).min(height) {
                for x in (bx * block_w)..((bx + 1) * block_w).min(width) {
                    let idx = ((y * width + x) * 4) as usize;
                    if idx + 2 < rgba_data.len() {
                        let r = rgba_data[idx] as u64;
                        let g = rgba_data[idx + 1] as u64;
                        let b = rgba_data[idx + 2] as u64;
                        sum += (r * 299 + g * 587 + b * 114) / 1000;
                        count += 1;
                    }
                }
            }
            gray_8x8[(by * 8 + bx) as usize] = if count > 0 {
                (sum / count as u64) as u32
            } else {
                0
            };
        }
    }

    // Compute average
    let avg: u32 = gray_8x8.iter().sum::<u32>() / 64;

    // Build hash: 1 if pixel > average, 0 otherwise
    let mut hash: u64 = 0;
    for (i, &val) in gray_8x8.iter().enumerate() {
        if val > avg {
            hash |= 1 << i;
        }
    }

    hash
}

/// Hamming distance between two perceptual hashes
pub fn hamming_distance(h1: u64, h2: u64) -> u32 {
    (h1 ^ h2).count_ones()
}

/// Change ratio between two hashes (0.0 = identical, 1.0 = completely different)
pub fn change_ratio(h1: u64, h2: u64) -> f64 {
    hamming_distance(h1, h2) as f64 / 64.0
}
