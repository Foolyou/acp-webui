mod acp;
mod auth;
mod config;
mod error;
mod models;
mod routes;
mod storage;

use axum::{extract::connect_info::IntoMakeServiceWithConnectInfo, Router};
use config::Config;
use routes::AppState;
use tokio::net::TcpListener;
use tower_http::{cors::CorsLayer, trace::TraceLayer};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "acp_webui=debug,tower_http=debug,axum=debug".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    let config = Config::parse_args()?;
    if config.disable_auth && !config.bind_addr()?.ip().is_loopback() {
        anyhow::bail!("--disable-auth is only allowed when binding to a loopback address");
    }
    config.ensure_work_dir()?;
    let storage = storage::Storage::connect(&config.database_url).await?;
    storage.migrate().await?;
    let expired = storage
        .expire_pending_permission_requests_on_startup()
        .await?;
    if expired > 0 {
        tracing::warn!(expired, "expired stale pending permission requests");
    }
    let repaired = storage
        .repair_restored_running_sessions_on_startup()
        .await?;
    if repaired > 0 {
        tracing::warn!(repaired, "reset restored sessions stuck in running state");
    }

    let (events_tx, _) = tokio::sync::broadcast::channel(256);
    let codex = acp::CodexRuntime::start(config.clone(), storage.clone(), events_tx.clone()).await;
    let auth = auth::AuthService::from_config(&config)?;

    let state = AppState {
        storage,
        codex,
        events_tx,
        auth: auth.clone(),
    };

    let app = Router::new()
        .merge(routes::api_router(state))
        .merge(routes::frontend_router(config.frontend_dist.as_ref()))
        .layer(CorsLayer::permissive())
        .layer(TraceLayer::new_for_http());

    let addr = config.bind_addr()?;
    let listener = TcpListener::bind(addr).await?;
    tracing::info!("ACP Web UI listening on http://{}", listener.local_addr()?);
    if let Some(token) = auth.pairing_token_for_startup_log() {
        tracing::info!(%token, "Pairing token generated for this daemon session");
    } else {
        tracing::info!("Pairing token loaded from configuration");
    }

    let service: IntoMakeServiceWithConnectInfo<_, std::net::SocketAddr> =
        app.into_make_service_with_connect_info();
    axum::serve(listener, service).await?;
    Ok(())
}
