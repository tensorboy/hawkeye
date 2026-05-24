//! Bearer-token middleware + token persistence.
//!
//! On first daemon startup we generate 32 random bytes and persist them as
//! a hex string at `~/.config/hawkeye/api-token`. Every subsequent
//! invocation reads the same token, so the GUI and any external scripts
//! get a stable shared secret. The token is also printed once to stdout so
//! the launching user can paste it into their tooling.

use std::path::PathBuf;

use anyhow::{Context, Result};
use axum::{
    body::Body,
    extract::Request,
    http::{header, StatusCode},
    middleware::Next,
    response::Response,
};
use rand::RngCore;

/// Load the existing token or generate + persist a new one.
pub fn load_or_create_token() -> Result<String> {
    let path = token_path()?;

    if path.exists() {
        let s = std::fs::read_to_string(&path)
            .with_context(|| format!("read token at {}", path.display()))?;
        let trimmed = s.trim();
        if trimmed.len() >= 32 {
            return Ok(trimmed.to_string());
        }
        // Corrupt/empty file — fall through and regenerate.
    }

    let mut buf = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut buf);
    let token = hex::encode(buf);

    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .with_context(|| format!("create config dir {}", parent.display()))?;
    }
    std::fs::write(&path, &token).with_context(|| format!("write token to {}", path.display()))?;

    // Tighten permissions on POSIX so other users on the box can't read it.
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perm = std::fs::metadata(&path)?.permissions();
        perm.set_mode(0o600);
        std::fs::set_permissions(&path, perm)?;
    }

    Ok(token)
}

fn token_path() -> Result<PathBuf> {
    let dir = dirs::config_dir()
        .ok_or_else(|| anyhow::anyhow!("no config dir"))?
        .join("hawkeye");
    Ok(dir.join("api-token"))
}

/// Axum middleware that rejects any request whose Authorization header
/// doesn't carry `Bearer <expected>`. The `/v1/health` route is excluded
/// at the router level — it doesn't pass through this layer.
pub async fn bearer_auth(
    req: Request<Body>,
    next: Next,
) -> Result<Response, StatusCode> {
    let expected = req
        .extensions()
        .get::<ApiToken>()
        .ok_or(StatusCode::INTERNAL_SERVER_ERROR)?
        .0
        .clone();

    let header_ok = req
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|h| h.to_str().ok())
        .and_then(|h| h.strip_prefix("Bearer "))
        .map(|t| constant_time_eq(t.as_bytes(), expected.as_bytes()))
        .unwrap_or(false);

    if !header_ok {
        return Err(StatusCode::UNAUTHORIZED);
    }
    Ok(next.run(req).await)
}

#[derive(Clone)]
pub struct ApiToken(pub String);

/// Constant-time comparison to avoid timing-leak token recovery.
fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff: u8 = 0;
    for (x, y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}
