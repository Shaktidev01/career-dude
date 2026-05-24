pub mod handlers;
pub use handlers::*;

use axum::{
    async_trait,
    extract::FromRequestParts,
    http::{request::Parts, StatusCode, header},
    response::{IntoResponse, Response},
    Json,
};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation, Algorithm};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::models::user::User;

#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    pub sub: Uuid,
    pub email: String,
    pub exp: usize,
    pub iat: usize,
}

#[derive(Debug, Clone)]
pub struct CurrentUser {
    pub id: Uuid,
    pub email: String,
}

#[async_trait]
impl<S> FromRequestParts<S> for CurrentUser
where
    S: Send + Sync,
{
    type Rejection = Response;

    async fn from_request_parts(parts: &mut Parts, _state: &S) -> Result<Self, Self::Rejection> {
        let auth_err = || {
            (StatusCode::UNAUTHORIZED, Json(serde_json::json!({"error": "Unauthorized"}))).into_response()
        };

        let auth_header = parts
            .headers
            .get(header::AUTHORIZATION)
            .and_then(|value| value.to_str().ok())
            .ok_or_else(auth_err)?;

        if !auth_header.starts_with("Bearer ") {
            return Err(auth_err());
        }
        let token = &auth_header[7..];

        let mut validation = Validation::new(Algorithm::HS256);
        validation.validate_exp = true;
        let token_data = decode::<Claims>(
            token,
            get_decoding_key(),
            &validation,
        )
        .map_err(|_| auth_err())?;

        Ok(CurrentUser {
            id: token_data.claims.sub,
            email: token_data.claims.email,
        })
    }
}

pub fn create_jwt(user: &User) -> anyhow::Result<String> {
    let secret = std::env::var("JWT_SECRET")?;
    let expiration = chrono::Utc::now()
        .checked_add_signed(chrono::TimeDelta::hours(24))
        .expect("valid timestamp")
        .timestamp() as usize;
    let iat = chrono::Utc::now().timestamp() as usize;

    let claims = Claims {
        sub: user.id,
        email: user.email.clone(),
        exp: expiration,
        iat,
    };

    let token = encode(&Header::default(), &claims, &EncodingKey::from_secret(secret.as_bytes()))?;
    Ok(token)
}

fn get_decoding_key() -> &'static DecodingKey {
    use std::sync::OnceLock;
    static KEY: OnceLock<DecodingKey> = OnceLock::new();
    KEY.get_or_init(|| {
        let secret = std::env::var("JWT_SECRET")
            .expect("JWT_SECRET must be set — validated at startup");
        DecodingKey::from_secret(secret.as_bytes())
    })
}
