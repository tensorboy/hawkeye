//! GUI ↔ daemon glue.
//!
//! On Tauri startup we probe `localhost:<syncPort>/v1/info`. If something
//! is already there → don't fight it; the embedded Tauri backend keeps
//! serving the GUI's invoke handlers and external scripts can use the
//! existing daemon. If nothing's there → spawn `hawkeye-cli daemon` as a
//! child process so external scripts have one to talk to.
//!
//! NOTE: Today the GUI still uses its own in-process AppState for `invoke`
//! handlers — it doesn't proxy through the daemon's HTTP. Both have to
//! coexist, which means there are technically two AppStates (GUI's and
//! daemon's). They share the same on-disk config + life-tree + gaze model
//! files, but in-memory state is duplicated until a follow-up rewires
//! invoke handlers to HTTP. See HAWKEYED.md roadmap.

use std::process::Stdio;
use std::time::Duration;

use serde::Serialize;
use tokio::process::{Child, Command};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DaemonInfo {
    pub url: String,
    pub port: u16,
    pub running: bool,
    /// `true` if we spawned the daemon ourselves, `false` if we just
    /// detected an existing one.
    pub spawned_by_gui: bool,
    pub token: Option<String>,
}

/// Probe the configured port and either reuse the existing daemon or
/// spawn a new one. Returns the child handle (kept alive for the GUI's
/// lifetime via tauri::State).
pub async fn ensure_daemon(port: u16) -> (DaemonInfo, Option<Child>) {
    let url = format!("http://127.0.0.1:{}", port);

    // Probe — fast, doesn't need auth.
    if probe_alive(&url).await {
        log::info!("[hawkeyed] detected existing daemon at {}", url);
        let token = super::auth::load_or_create_token().ok();
        return (
            DaemonInfo {
                url,
                port,
                running: true,
                spawned_by_gui: false,
                token,
            },
            None,
        );
    }

    // Spawn a sibling hawkeye-cli with the `daemon` subcommand.
    // We want the same install path as the running binary. For dev builds
    // that's the cargo target dir; for prod (.app bundle) it's next to the
    // Tauri executable.
    let cli_path = locate_cli_binary();
    match cli_path {
        Some(path) => match Command::new(&path)
            .arg("daemon")
            .arg("--port")
            .arg(port.to_string())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
        {
            Ok(child) => {
                log::info!("[hawkeyed] spawned daemon from {} on :{}", path, port);
                // Give it a moment to bind, then probe.
                for _ in 0..20 {
                    tokio::time::sleep(Duration::from_millis(150)).await;
                    if probe_alive(&url).await {
                        let token = super::auth::load_or_create_token().ok();
                        return (
                            DaemonInfo {
                                url,
                                port,
                                running: true,
                                spawned_by_gui: true,
                                token,
                            },
                            Some(child),
                        );
                    }
                }
                log::warn!("[hawkeyed] spawned child didn't come up on :{}", port);
                (
                    DaemonInfo { url, port, running: false, spawned_by_gui: true, token: None },
                    Some(child),
                )
            }
            Err(e) => {
                log::warn!("[hawkeyed] failed to spawn daemon: {}", e);
                (
                    DaemonInfo { url, port, running: false, spawned_by_gui: false, token: None },
                    None,
                )
            }
        },
        None => {
            log::warn!("[hawkeyed] hawkeye-cli binary not found — skipping daemon spawn");
            (
                DaemonInfo { url, port, running: false, spawned_by_gui: false, token: None },
                None,
            )
        }
    }
}

async fn probe_alive(url: &str) -> bool {
    let client = match reqwest::Client::builder()
        .timeout(Duration::from_millis(500))
        .build()
    {
        Ok(c) => c,
        Err(_) => return false,
    };
    matches!(
        client.get(format!("{}/v1/health", url)).send().await,
        Ok(r) if r.status().is_success()
    )
}

/// Try several known locations for the `hawkeye-cli` binary.
fn locate_cli_binary() -> Option<String> {
    let bin_name = if cfg!(windows) { "hawkeye-cli.exe" } else { "hawkeye-cli" };

    // 1. Next to the running executable (typical install layout).
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            let candidate = parent.join(bin_name);
            if candidate.exists() {
                return Some(candidate.to_string_lossy().into_owned());
            }
            // Bundled .app: Resources/ sibling
            let resources = parent.join(format!("../Resources/{}", bin_name));
            if resources.exists() {
                return Some(resources.to_string_lossy().into_owned());
            }
        }
    }

    // 2. Dev: target/debug or target/release sibling.
    for dir in ["target/debug", "target/release"] {
        let candidate = std::path::Path::new(dir).join(bin_name);
        if candidate.exists() {
            return Some(candidate.to_string_lossy().into_owned());
        }
    }

    // 3. Anywhere on PATH.
    which::which("hawkeye-cli").ok().map(|p| p.to_string_lossy().into_owned())
}
