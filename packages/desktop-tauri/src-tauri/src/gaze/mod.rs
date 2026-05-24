//! Gaze module — ANE-accelerated eye gaze prediction with online learning
//!
//! Provides a small MLP trained on calibration data, with optional ANE inference.
//! Falls back to CPU inference for real-time 30fps prediction.

pub mod ane_runner;
pub mod data_buffer;
pub mod inference;
