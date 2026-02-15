//! Model management — download, list, delete local AI models

pub mod manager;
pub mod registry;

pub use manager::ModelManager;
pub use registry::{ModelInfo, ModelType};
