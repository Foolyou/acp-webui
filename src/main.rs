mod acp;
mod config;
mod error;
mod models;
mod routes;
mod storage;

use axum::Router;
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

    let config = Config::parse_args();
    let storage = storage::Storage::connect(&config.database_url).await?;
    storage.migrate().await?;

    let (events_tx, _) = tokio::sync::broadcast::channel(256);
    let codex = acp::CodexRuntime::start(config.clone(), events_tx.clone()).await;

    let state = AppState {
        storage,
        codex,
        events_tx,
    };

    let app = Router::new()
        .merge(routes::api_router())
        .fallback_service(routes::frontend_service(&config.frontend_dist))
        .layer(CorsLayer::permissive())
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    let addr = config.bind_addr()?;
    let listener = TcpListener::bind(addr).await?;
    tracing::info!("ACP Web UI listening on http://{}", listener.local_addr()?);

    axum::serve(listener, app).await?;
    Ok(())
}
