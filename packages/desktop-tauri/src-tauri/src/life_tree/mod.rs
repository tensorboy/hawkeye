//! Life Tree — hierarchical model of user's life activities
//!
//! Structures life observations into: Root → Stages → Goals → Tasks → Experiments
//! Uses AI to classify activities and propose micro-experiments.

pub mod types;
pub mod tree;

pub use tree::LifeTree;
pub use types::*;
