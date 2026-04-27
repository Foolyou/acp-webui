use std::{
    collections::{HashMap, HashSet},
    net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr},
    sync::Arc,
    time::{Duration, Instant},
};

use axum::http::header::COOKIE;
use axum::http::{HeaderMap, HeaderValue};
use serde::Serialize;
use tokio::sync::Mutex;
use uuid::Uuid;

use crate::{config::Config, error::AppError};

const SESSION_COOKIE: &str = "acp_webui_session";
const MAX_FAILED_ATTEMPTS: u32 = 5;
const PAIRING_BACKOFF: Duration = Duration::from_secs(30);

#[derive(Clone)]
pub struct AuthService {
    inner: Arc<AuthInner>,
}

struct AuthInner {
    token: String,
    generated_token: bool,
    disabled: bool,
    trusted_clients: Vec<TrustedClient>,
    sessions: Mutex<HashSet<String>>,
    failures: Mutex<HashMap<IpAddr, FailedPairing>>,
}

struct FailedPairing {
    count: u32,
    last_failed_at: Instant,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AuthAccess {
    Anonymous,
    PairedSession,
    TrustedIp,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthStatus {
    pub access: AuthAccess,
    pub pairing_required: bool,
    pub client_ip: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum TrustedClient {
    V4(Ipv4Addr, u8),
    V6(Ipv6Addr, u8),
}

impl AuthService {
    pub fn from_config(config: &Config) -> anyhow::Result<Self> {
        let generated_token = config.pairing_token.is_none();
        let token = config
            .pairing_token
            .clone()
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(generate_secret);

        let mut trusted_clients = vec![
            TrustedClient::V4(Ipv4Addr::LOCALHOST, 32),
            TrustedClient::V6(Ipv6Addr::LOCALHOST, 128),
        ];
        for raw in &config.trusted_clients {
            if raw.trim().is_empty() {
                continue;
            }
            trusted_clients.push(parse_trusted_client(raw)?);
        }

        Ok(Self {
            inner: Arc::new(AuthInner {
                token,
                generated_token,
                disabled: config.disable_auth,
                trusted_clients,
                sessions: Mutex::new(HashSet::new()),
                failures: Mutex::new(HashMap::new()),
            }),
        })
    }

    pub fn generated_token(&self) -> bool {
        self.inner.generated_token
    }

    pub fn pairing_token_for_startup_log(&self) -> Option<&str> {
        self.generated_token().then_some(self.inner.token.as_str())
    }

    pub async fn status(&self, headers: &HeaderMap, peer: Option<SocketAddr>) -> AuthStatus {
        let client_ip = peer.map(|addr| addr.ip());
        let access = if self.inner.disabled || self.is_trusted_client(client_ip) {
            AuthAccess::TrustedIp
        } else if self.session_from_headers(headers).await.is_some() {
            AuthAccess::PairedSession
        } else {
            AuthAccess::Anonymous
        };

        AuthStatus {
            pairing_required: access == AuthAccess::Anonymous,
            access,
            client_ip: client_ip.map(|ip| ip.to_string()),
        }
    }

    pub async fn require_access(
        &self,
        headers: &HeaderMap,
        peer: Option<SocketAddr>,
    ) -> Result<AuthStatus, AppError> {
        let status = self.status(headers, peer).await;
        if status.access == AuthAccess::Anonymous {
            return Err(AppError::Unauthorized("Pairing required".to_string()));
        }
        Ok(status)
    }

    pub async fn pair(
        &self,
        token: &str,
        peer: Option<SocketAddr>,
    ) -> Result<(AuthStatus, HeaderValue), AppError> {
        let client_ip = peer
            .map(|addr| addr.ip())
            .unwrap_or(IpAddr::V4(Ipv4Addr::UNSPECIFIED));
        self.check_backoff(client_ip).await?;

        if !constant_time_eq(token.trim().as_bytes(), self.inner.token.as_bytes()) {
            self.record_failure(client_ip).await;
            return Err(AppError::Unauthorized("Invalid pairing token".to_string()));
        }

        self.clear_failures(client_ip).await;
        let session_id = generate_secret();
        self.inner.sessions.lock().await.insert(session_id.clone());
        let status = AuthStatus {
            access: AuthAccess::PairedSession,
            pairing_required: false,
            client_ip: Some(client_ip.to_string()),
        };

        Ok((status, session_cookie(&session_id)))
    }

    fn is_trusted_client(&self, ip: Option<IpAddr>) -> bool {
        let Some(ip) = ip else {
            return false;
        };
        self.inner
            .trusted_clients
            .iter()
            .any(|client| client.matches(ip))
    }

    async fn session_from_headers(&self, headers: &HeaderMap) -> Option<()> {
        let session_id = cookie_value(headers, SESSION_COOKIE)?;
        self.inner
            .sessions
            .lock()
            .await
            .contains(session_id)
            .then_some(())
    }

    async fn check_backoff(&self, ip: IpAddr) -> Result<(), AppError> {
        let failures = self.inner.failures.lock().await;
        let Some(failure) = failures.get(&ip) else {
            return Ok(());
        };
        if failure.count >= MAX_FAILED_ATTEMPTS
            && failure.last_failed_at.elapsed() < PAIRING_BACKOFF
        {
            return Err(AppError::Unauthorized(
                "Pairing temporarily locked".to_string(),
            ));
        }
        Ok(())
    }

    async fn record_failure(&self, ip: IpAddr) {
        let mut failures = self.inner.failures.lock().await;
        let entry = failures.entry(ip).or_insert(FailedPairing {
            count: 0,
            last_failed_at: Instant::now(),
        });
        entry.count += 1;
        entry.last_failed_at = Instant::now();
    }

    async fn clear_failures(&self, ip: IpAddr) {
        self.inner.failures.lock().await.remove(&ip);
    }
}

impl TrustedClient {
    fn matches(self, ip: IpAddr) -> bool {
        match (self, ip) {
            (TrustedClient::V4(network, prefix), IpAddr::V4(ip)) => prefix_match(
                u32::from(network) as u128,
                u32::from(ip) as u128,
                prefix,
                32,
            ),
            (TrustedClient::V6(network, prefix), IpAddr::V6(ip)) => {
                prefix_match(u128::from(network), u128::from(ip), prefix, 128)
            }
            _ => false,
        }
    }
}

fn parse_trusted_client(raw: &str) -> anyhow::Result<TrustedClient> {
    let trimmed = raw.trim();
    let (addr, prefix) = match trimmed.split_once('/') {
        Some((addr, prefix)) => (addr, Some(prefix.parse::<u8>()?)),
        None => (trimmed, None),
    };
    let ip: IpAddr = addr.parse()?;
    match ip {
        IpAddr::V4(ip) => Ok(TrustedClient::V4(ip, prefix.unwrap_or(32).min(32))),
        IpAddr::V6(ip) => Ok(TrustedClient::V6(ip, prefix.unwrap_or(128).min(128))),
    }
}

fn prefix_match(network: u128, ip: u128, prefix: u8, bits: u8) -> bool {
    if prefix == 0 {
        return true;
    }
    let shift = bits - prefix;
    (network >> shift) == (ip >> shift)
}

fn cookie_value<'a>(headers: &'a HeaderMap, name: &str) -> Option<&'a str> {
    let cookie = headers.get(COOKIE)?.to_str().ok()?;
    cookie.split(';').find_map(|part| {
        let (key, value) = part.trim().split_once('=')?;
        (key == name).then_some(value)
    })
}

fn session_cookie(session_id: &str) -> HeaderValue {
    let cookie = format!("{SESSION_COOKIE}={session_id}; Path=/; HttpOnly; SameSite=Lax");
    HeaderValue::from_str(&cookie).expect("session cookie value is valid")
}

fn constant_time_eq(left: &[u8], right: &[u8]) -> bool {
    let mut diff = left.len() ^ right.len();
    let len = left.len().max(right.len());
    for index in 0..len {
        let a = left.get(index).copied().unwrap_or(0);
        let b = right.get(index).copied().unwrap_or(0);
        diff |= usize::from(a ^ b);
    }
    diff == 0
}

fn generate_secret() -> String {
    Uuid::new_v4().simple().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn trusted_client_matches_cidr() {
        let client = parse_trusted_client("100.64.0.0/10").unwrap();
        assert!(client.matches("100.64.12.34".parse().unwrap()));
        assert!(!client.matches("192.168.1.10".parse().unwrap()));
    }

    #[test]
    fn constant_time_compare_checks_lengths() {
        assert!(constant_time_eq(b"same", b"same"));
        assert!(!constant_time_eq(b"same", b"same-but-longer"));
        assert!(!constant_time_eq(b"same", b"diff"));
    }

    #[test]
    fn session_cookie_is_usable_over_local_http() {
        let cookie = session_cookie("session-id").to_str().unwrap().to_string();

        assert!(cookie.contains("HttpOnly"));
        assert!(cookie.contains("SameSite=Lax"));
        assert!(!cookie.contains("Secure"));
    }
}
