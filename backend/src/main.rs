use axum::{routing::get, Router};
use std::net::SocketAddr;
use tower_http::{cors::CorsLayer, trace::TraceLayer, compression::CompressionLayer};
use tower_http::cors::AllowOrigin;
use axum::http::{HeaderValue, Method, header};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

mod api;
mod auth;
mod models;
mod payments;
mod utils;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();

    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "career_dude_backend=info,tower_http=info".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    // Validate required env vars at startup — fail loud rather than panic mid-request.
    for required in &["JWT_SECRET", "DATABASE_URL"] {
        if std::env::var(required).unwrap_or_default().is_empty() {
            anyhow::bail!("Required env var {} is not set. Set it in .env before starting.", required);
        }
    }
    // Warn about optional but important vars
    for optional in &["GEMINI_API_KEY", "ADZUNA_APP_ID", "ADZUNA_APP_KEY", "JOOBLE_API_KEY"] {
        if std::env::var(optional).unwrap_or_default().is_empty() {
            tracing::warn!("Optional env var {} is not set — related features will be disabled.", optional);
        }
    }

    let db_pool = utils::db::create_pool().await?;
    sqlx::migrate!("../migrations").run(&db_pool).await?;

    let app = Router::new()
        .route("/health", get(health_check))
        .nest("/api/v1/auth", auth::router())
        .nest("/api/v1", api::protected_router())
        .nest("/api/v1", api::public_router())
        .nest("/api/v1/payments", payments::router())
        .layer(build_cors())
        .layer(CompressionLayer::new())
        .layer(TraceLayer::new_for_http())
        .with_state(db_pool);

    let port = std::env::var("BACKEND_PORT")
        .unwrap_or_else(|_| "3001".to_string())
        .parse::<u16>()?;
    let addr = SocketAddr::from(([0, 0, 0, 0], port));

    tracing::info!("Career Dude backend listening on {}", addr);
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}

async fn health_check() -> &'static str {
    "ok"
}

/// Build a CORS layer that allows only the configured frontend origin.
/// Falls back to localhost:3000 in development.
/// Set FRONTEND_URL in production env (e.g. https://app.careerdude.com).
fn build_cors() -> CorsLayer {
    let frontend_url = std::env::var("FRONTEND_URL")
        .unwrap_or_else(|_| "http://localhost:3000".to_string());

    let origin: HeaderValue = frontend_url
        .parse()
        .expect("FRONTEND_URL is not a valid HTTP header value");

    // Note: allow_headers(Any) is incompatible with allow_credentials(true) per the Fetch spec.
    // Enumerate the headers we actually need instead of using a wildcard.
    CorsLayer::new()
        .allow_origin(AllowOrigin::exact(origin))
        .allow_methods([Method::GET, Method::POST, Method::PATCH, Method::DELETE, Method::OPTIONS])
        .allow_headers([
            header::AUTHORIZATION,
            header::CONTENT_TYPE,
            header::ACCEPT,
            header::HeaderName::from_static("x-requested-with"),
        ])
        .allow_credentials(true)
}
