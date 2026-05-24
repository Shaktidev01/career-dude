use axum::{
    extract::{State, Json},
    http::StatusCode,
};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use std::env;

#[derive(Debug, Deserialize)]
pub struct ZohoWebhookPayload {
    pub event_type: String,
    pub data: ZohoWebhookData,
}

#[derive(Debug, Deserialize)]
pub struct ZohoWebhookData {
    pub subscription_id: String,
    pub customer_email: String,
    pub plan_code: String,
    pub status: String,
}

pub async fn handle_zoho_webhook(
    State(pool): State<PgPool>,
    Json(payload): Json<ZohoWebhookPayload>,
) -> Result<StatusCode, StatusCode> {
    tracing::info!("Received Zoho webhook: {}", payload.event_type);

    let user_id: uuid::Uuid = sqlx::query_scalar("SELECT id FROM users WHERE email = $1")
        .bind(&payload.data.customer_email)
        .fetch_optional(&pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)?;

    match payload.event_type.as_str() {
        "subscription_created" | "subscription_renewed" => {
            let credits_to_add = if payload.data.plan_code == "PRO_MONTHLY" { 150 } else { 0 };
            
            sqlx::query(
                "UPDATE users SET subscription_tier = 'pro', ai_credits_balance = ai_credits_balance + $1 WHERE id = $2"
            )
            .bind(credits_to_add)
            .bind(user_id)
            .execute(&pool)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        }
        "subscription_cancelled" => {
            sqlx::query(
                "UPDATE users SET subscription_tier = 'free' WHERE id = $1"
            )
            .bind(user_id)
            .execute(&pool)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        }
        _ => {}
    }

    Ok(StatusCode::OK)
}
