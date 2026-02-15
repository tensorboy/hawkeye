//! Adaptive refresh rate — dynamically adjusts observe interval based on activity
//!
//! Activity score (0-100) controls refresh speed:
//! - >90: 1s (very active)
//! - 70-90: 2s (active)
//! - 50-70: 3s (normal)
//! - 20-50: 5s (low)
//! - <20: 10s (idle)

use serde::Serialize;
use std::time::Instant;

/// Activity event types that affect the refresh rate
#[derive(Debug, Clone, Copy, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ActivityEventType {
    ScreenChange,
    UserInteraction,
    WindowSwitch,
    ClipboardChange,
    AiRequest,
    PlanExecution,
}

/// Activity level derived from the score
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ActivityLevel {
    Idle,
    Low,
    Normal,
    High,
    VeryHigh,
}

/// Adaptive refresh status
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdaptiveRefreshStatus {
    pub enabled: bool,
    pub activity_score: u32,
    pub activity_level: ActivityLevel,
    pub current_interval_ms: u64,
    pub recent_event_count: usize,
}

/// Adaptive refresh rate controller
#[derive(Debug)]
pub struct AdaptiveRefresh {
    enabled: bool,
    activity_score: f64,
    last_decay_time: Instant,
    recent_events: Vec<Instant>,
    /// Decay rate per second (0-1)
    decay_rate: f64,
    /// Base gain per activity event
    gain_rate: f64,
    min_interval_ms: u64,
    max_interval_ms: u64,
}

impl Default for AdaptiveRefresh {
    fn default() -> Self {
        Self {
            enabled: true,
            activity_score: 50.0,
            last_decay_time: Instant::now(),
            recent_events: Vec::new(),
            decay_rate: 0.1,
            gain_rate: 20.0,
            min_interval_ms: 1000,
            max_interval_ms: 10000,
        }
    }
}

impl AdaptiveRefresh {
    /// Record an activity event, increasing the activity score
    pub fn record_activity(&mut self, event_type: ActivityEventType) {
        if !self.enabled {
            return;
        }

        // Apply pending decay first
        self.apply_decay();

        let weight = Self::event_weight(event_type);
        let gain = self.gain_rate * weight;
        self.activity_score = (self.activity_score + gain).min(100.0);

        // Track event time for recent count
        let now = Instant::now();
        self.recent_events.push(now);
        // Keep only last 60s of events
        self.recent_events.retain(|t| now.duration_since(*t).as_secs() < 60);
    }

    /// Get the current recommended interval in milliseconds
    pub fn current_interval_ms(&mut self) -> u64 {
        if !self.enabled {
            return 3000; // default
        }
        self.apply_decay();
        self.score_to_interval(self.activity_score)
    }

    /// Get the current activity level
    pub fn activity_level(&self) -> ActivityLevel {
        if self.activity_score > 90.0 {
            ActivityLevel::VeryHigh
        } else if self.activity_score > 70.0 {
            ActivityLevel::High
        } else if self.activity_score > 50.0 {
            ActivityLevel::Normal
        } else if self.activity_score > 20.0 {
            ActivityLevel::Low
        } else {
            ActivityLevel::Idle
        }
    }

    /// Get full status
    pub fn status(&mut self) -> AdaptiveRefreshStatus {
        self.apply_decay();
        let now = Instant::now();
        let recent_count = self.recent_events.iter()
            .filter(|t| now.duration_since(**t).as_secs() < 60)
            .count();

        AdaptiveRefreshStatus {
            enabled: self.enabled,
            activity_score: self.activity_score.round() as u32,
            activity_level: self.activity_level(),
            current_interval_ms: self.score_to_interval(self.activity_score),
            recent_event_count: recent_count,
        }
    }

    /// Enable or disable adaptive refresh
    pub fn set_enabled(&mut self, enabled: bool) {
        self.enabled = enabled;
        if enabled {
            self.last_decay_time = Instant::now();
        }
    }

    /// Reset to default state
    pub fn reset(&mut self) {
        self.activity_score = 50.0;
        self.recent_events.clear();
        self.last_decay_time = Instant::now();
    }

    // --- Private ---

    /// Apply exponential decay based on elapsed time
    fn apply_decay(&mut self) {
        let now = Instant::now();
        let elapsed_secs = now.duration_since(self.last_decay_time).as_secs_f64();
        self.last_decay_time = now;

        // Cap elapsed time to 60s to prevent score dropping to 0 after system sleep.
        // After 60s of decay at 0.1 rate, score decays to ~0.18% which is effectively idle.
        let elapsed_capped = elapsed_secs.min(60.0);

        // Exponential decay: score *= (1 - decay_rate) ^ elapsed
        let decay_factor = (1.0 - self.decay_rate).powf(elapsed_capped);
        self.activity_score = (self.activity_score * decay_factor).max(0.0);
    }

    /// Map activity score to refresh interval
    fn score_to_interval(&self, score: f64) -> u64 {
        if score > 90.0 {
            self.min_interval_ms
        } else if score > 70.0 {
            2000
        } else if score > 50.0 {
            3000
        } else if score > 20.0 {
            5000
        } else {
            self.max_interval_ms
        }
    }

    /// Get weight multiplier for event types
    fn event_weight(event_type: ActivityEventType) -> f64 {
        match event_type {
            ActivityEventType::UserInteraction => 1.5,
            ActivityEventType::AiRequest => 1.2,
            ActivityEventType::PlanExecution => 1.0,
            ActivityEventType::WindowSwitch => 0.8,
            ActivityEventType::ClipboardChange => 0.7,
            ActivityEventType::ScreenChange => 0.5,
        }
    }
}
