use axum::{
    extract::State,
    routing::{post, get},
    Router,
    Json,
};
use serde_json::json;
use sqlx::PgPool;

use crate::models::user::{CreateUser, LoginUser, User};
use crate::models::error::{AppError, ApiResult};
use crate::auth::{create_jwt, CurrentUser};
use argon2::{Argon2, PasswordHash, PasswordHasher, PasswordVerifier};
use argon2::password_hash::{rand_core::OsRng, SaltString};

pub fn router() -> Router<PgPool> {
    Router::new()
        .route("/register", post(register))
        .route("/login", post(login))
        .route("/me", get(me))
}

async fn register(
    State(pool): State<PgPool>,
    Json(payload): Json<CreateUser>,
) -> ApiResult<serde_json::Value> {
    let existing = sqlx::query_as::<_, User>("SELECT * FROM users WHERE email = $1")
        .bind(&payload.email)
        .fetch_optional(&pool)
        .await?;

    if existing.is_some() {
        return Err(AppError::Validation("Email already in use".into()));
    }

    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::default();
    let password_hash = argon2
        .hash_password(payload.password.as_bytes(), &salt)
        .map_err(|e| AppError::Internal(anyhow::anyhow!("Hash error: {}", e)))?
        .to_string();

    let user_id = uuid::Uuid::new_v4();
    let user = sqlx::query_as::<_, User>(
        r#"
        INSERT INTO users (id, email, name, password_hash, role, subscription_tier, ai_credits_balance)
        VALUES ($1, $2, $3, $4, 'user', 'free', 5)
        RETURNING *
        "#,
    )
    .bind(user_id)
    .bind(&payload.email)
    .bind(&payload.name)
    .bind(&password_hash)
    .fetch_one(&pool)
    .await?;

    let token = create_jwt(&user)?;
    Ok(Json(json!({
        "user": user,
        "token": token
    })))
}

async fn login(
    State(pool): State<PgPool>,
    Json(payload): Json<LoginUser>,
) -> ApiResult<serde_json::Value> {
    let user = sqlx::query_as::<_, User>("SELECT * FROM users WHERE email = $1")
        .bind(&payload.email)
        .fetch_optional(&pool)
        .await?
        .ok_or(AppError::Unauthorized)?;

    let stored_hash = sqlx::query_scalar::<_, String>("SELECT password_hash FROM users WHERE id = $1")
        .bind(user.id)
        .fetch_one(&pool)
        .await?;

    let parsed_hash = PasswordHash::new(&stored_hash)
        .map_err(|_| AppError::Internal(anyhow::anyhow!("Invalid password hash in DB")))?;

    let is_valid = Argon2::default()
        .verify_password(payload.password.as_bytes(), &parsed_hash)
        .is_ok();

    if !is_valid {
        return Err(AppError::Unauthorized);
    }

    let token = create_jwt(&user)?;
    Ok(Json(json!({
        "user": user,
        "token": token
    })))
}

async fn me(
    State(pool): State<PgPool>,
    current_user: CurrentUser,
) -> ApiResult<User> {
    let user = sqlx::query_as::<_, User>("SELECT * FROM users WHERE id = $1")
        .bind(current_user.id)
        .fetch_one(&pool)
        .await?;

    Ok(Json(user))
}
