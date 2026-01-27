//! Configuration module - App settings persistence

use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

/// Application configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    /// AI provider type: "llama-cpp", "gemini", or "openai"
    pub ai_provider: String,

    /// Gemini settings
    pub gemini_api_key: Option<String>,
    pub gemini_model: Option<String>,
    pub gemini_base_url: Option<String>,

    /// OpenAI-compatible settings
    pub openai_base_url: Option<String>,
    pub openai_api_key: Option<String>,
    pub openai_model: Option<String>,

    /// Sync settings
    pub sync_port: u16,
    pub auto_start_sync: bool,

    /// App settings
    pub auto_update: bool,
    pub local_only: bool,
    pub onboarding_completed: Option<bool>,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            ai_provider: "gemini".to_string(),
            gemini_api_key: None,
            gemini_model: Some("gemini-2.5-flash-preview-05-20".to_string()),
            gemini_base_url: None,
            openai_base_url: None,
            openai_api_key: None,
            openai_model: Some("gemini-3-flash-preview".to_string()),
            sync_port: 23789,
            auto_start_sync: false,
            auto_update: true,
            local_only: false,
            onboarding_completed: None,
        }
    }
}

/// Get the config file path
fn get_config_path() -> Result<PathBuf> {
    let config_dir = dirs::config_dir()
        .ok_or_else(|| anyhow::anyhow!("Could not find config directory"))?
        .join("hawkeye");

    fs::create_dir_all(&config_dir)?;
    Ok(config_dir.join("config.json"))
}

/// Load configuration from file
pub fn load_config() -> Result<AppConfig> {
    let path = get_config_path()?;

    if path.exists() {
        let content = fs::read_to_string(&path)?;
        let config: AppConfig = serde_json::from_str(&content)?;
        Ok(config)
    } else {
        // Return default config
        Ok(AppConfig::default())
    }
}

/// Save configuration to file
pub fn save_config(config: &AppConfig) -> Result<()> {
    let path = get_config_path()?;
    let content = serde_json::to_string_pretty(config)?;
    fs::write(&path, content)?;
    Ok(())
}
