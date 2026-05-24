pub mod handlers;

use axum::{
    routing::post,
    Router,
};
use sqlx::PgPool;
use crate::payments::handlers::*;

pub fn router() -> Router<PgPool> {
    Router::new()
        .route("/webhooks/zoho", post(handle_zoho_webhook))
}
