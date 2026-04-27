//! Async client for the cua-driver daemon.
//!
//! Connects to `~/Library/Caches/cua-driver/cua-driver.sock`, sends a single
//! JSON request line, reads a single JSON response line, and closes the
//! socket. This mirrors the CLI's `cua-driver call …` pattern.

use anyhow::{anyhow, bail, Context, Result};
use serde_json::Value;
use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Stdio;
use std::time::Duration;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::UnixStream;
use tokio::process::Command;
use tokio::time::timeout;

use super::protocol::{
    CallResult, DaemonRequest, DaemonResponse, DaemonResult, ToolDescriptor,
};

/// Default socket path: `$HOME/Library/Caches/cua-driver/cua-driver.sock`.
pub fn default_socket_path() -> Option<PathBuf> {
    dirs::cache_dir().map(|p| p.join("cua-driver").join("cua-driver.sock"))
}

/// Default PID file path.
pub fn default_pid_path() -> Option<PathBuf> {
    dirs::cache_dir().map(|p| p.join("cua-driver").join("cua-driver.pid"))
}

/// Resolve the cua-driver binary location. We check, in order:
///   1. `$CUA_DRIVER_BIN` env override
///   2. `/usr/local/bin/cua-driver` (install.sh symlink)
///   3. `/Applications/CuaDriver.app/Contents/MacOS/cua-driver`
pub fn resolve_binary() -> Option<PathBuf> {
    if let Ok(env) = std::env::var("CUA_DRIVER_BIN") {
        let p = PathBuf::from(env);
        if p.exists() {
            return Some(p);
        }
    }
    let candidates = [
        "/usr/local/bin/cua-driver",
        "/Applications/CuaDriver.app/Contents/MacOS/cua-driver",
    ];
    candidates.iter().map(PathBuf::from).find(|p| p.exists())
}

/// Async client speaking the cua-driver daemon protocol.
#[derive(Debug, Clone)]
pub struct CuaDriverClient {
    socket_path: PathBuf,
    /// Per-request timeout (connect + send + receive).
    request_timeout: Duration,
}

impl CuaDriverClient {
    pub fn new(socket_path: PathBuf) -> Self {
        Self { socket_path, request_timeout: Duration::from_secs(30) }
    }

    /// Convenience: client at the default socket path.
    pub fn default_path() -> Result<Self> {
        let p = default_socket_path().ok_or_else(|| anyhow!("no $HOME cache dir"))?;
        Ok(Self::new(p))
    }

    pub fn with_timeout(mut self, t: Duration) -> Self {
        self.request_timeout = t;
        self
    }

    pub fn socket_path(&self) -> &PathBuf {
        &self.socket_path
    }

    /// Probe whether the daemon is reachable. Connects with a short timeout
    /// and immediately closes on success.
    pub async fn is_running(&self) -> bool {
        timeout(Duration::from_millis(500), UnixStream::connect(&self.socket_path))
            .await
            .map(|r| r.is_ok())
            .unwrap_or(false)
    }

    /// Send a request and return the raw daemon response.
    pub async fn send(&self, request: &DaemonRequest) -> Result<DaemonResponse> {
        timeout(self.request_timeout, self.send_inner(request))
            .await
            .map_err(|_| anyhow!("cua-driver request timed out after {:?}", self.request_timeout))?
    }

    async fn send_inner(&self, request: &DaemonRequest) -> Result<DaemonResponse> {
        let stream = UnixStream::connect(&self.socket_path)
            .await
            .with_context(|| format!("connect to cua-driver socket {}", self.socket_path.display()))?;

        let (read_half, mut write_half) = stream.into_split();

        let mut payload = serde_json::to_vec(request)?;
        payload.push(b'\n');
        write_half.write_all(&payload).await?;
        // Half-close write side so the daemon knows the request is complete
        // (it scans for `\n`, so this is belt-and-suspenders).
        write_half.flush().await?;
        // Drop the writer to half-shutdown — the daemon already has a full
        // line and will respond, so this is safe.
        drop(write_half);

        let mut reader = BufReader::new(read_half);
        let mut line = String::new();
        let n = reader
            .read_line(&mut line)
            .await
            .context("read cua-driver response line")?;
        if n == 0 {
            bail!("cua-driver closed connection without responding");
        }
        let resp: DaemonResponse = serde_json::from_str(line.trim_end_matches('\n'))
            .with_context(|| format!("parse cua-driver response: {}", line))?;
        Ok(resp)
    }

    /// Invoke a tool and unwrap to a `CallResult`. Returns `Err` if the
    /// daemon returned `ok=false` or if the result kind isn't `call`.
    pub async fn call(&self, tool: &str, args: HashMap<String, Value>) -> Result<CallResult> {
        let resp = self.send(&DaemonRequest::call(tool, args)).await?;
        if !resp.ok {
            let err = resp.error.unwrap_or_else(|| "(no error message)".into());
            bail!("cua-driver tool '{}' failed (exit={:?}): {}", tool, resp.exit_code, err);
        }
        match resp.result {
            Some(DaemonResult::Call(r)) => {
                if r.is_error {
                    bail!("cua-driver tool '{}' reported isError=true: {}", tool, r.text());
                }
                Ok(r)
            }
            other => bail!("cua-driver returned unexpected result kind: {:?}", other),
        }
    }

    /// `list` method — enumerate available tools.
    pub async fn list_tools(&self) -> Result<Vec<ToolDescriptor>> {
        let resp = self.send(&DaemonRequest::list()).await?;
        if !resp.ok {
            bail!(resp.error.unwrap_or_else(|| "list failed".into()));
        }
        match resp.result {
            Some(DaemonResult::List(t)) => Ok(t),
            other => bail!("expected List result, got {:?}", other),
        }
    }

    /// `describe` — schema for a single tool.
    pub async fn describe(&self, tool: &str) -> Result<ToolDescriptor> {
        let resp = self.send(&DaemonRequest::describe(tool)).await?;
        if !resp.ok {
            bail!(resp.error.unwrap_or_else(|| "describe failed".into()));
        }
        match resp.result {
            Some(DaemonResult::Describe(t)) => Ok(t),
            other => bail!("expected Describe result, got {:?}", other),
        }
    }
}

/// Daemon lifecycle helper. Spawns `cua-driver serve` in the background if
/// the socket isn't already accepting connections.
pub struct DaemonSupervisor {
    binary: Option<PathBuf>,
    client: CuaDriverClient,
}

impl DaemonSupervisor {
    pub fn new(client: CuaDriverClient) -> Self {
        Self { binary: resolve_binary(), client }
    }

    pub fn binary_path(&self) -> Option<&PathBuf> {
        self.binary.as_ref()
    }

    pub async fn ensure_running(&self) -> Result<()> {
        if self.client.is_running().await {
            return Ok(());
        }
        let binary = self
            .binary
            .as_ref()
            .ok_or_else(|| anyhow!(
                "cua-driver binary not found. Install via:\n  /bin/bash -c \"$(curl -fsSL https://raw.githubusercontent.com/trycua/cua/main/libs/cua-driver/scripts/install.sh)\"\nor set CUA_DRIVER_BIN env var."
            ))?;

        log::info!("[cua-driver] spawning daemon: {} serve", binary.display());

        // Detach: stdout/stderr to null, no stdin. The daemon writes a PID
        // file and listens for SIGINT/SIGTERM for shutdown.
        Command::new(binary)
            .arg("serve")
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .context("spawn cua-driver serve")?;

        // Poll the socket until it accepts a connection (max ~3s).
        for attempt in 0..30 {
            tokio::time::sleep(Duration::from_millis(100)).await;
            if self.client.is_running().await {
                log::info!("[cua-driver] daemon ready after {} ms", (attempt + 1) * 100);
                return Ok(());
            }
        }
        bail!("cua-driver daemon failed to start within 3s");
    }

    pub fn client(&self) -> &CuaDriverClient {
        &self.client
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_socket_under_cache_dir() {
        let p = default_socket_path().unwrap();
        assert!(p.ends_with("cua-driver/cua-driver.sock"));
    }
}
