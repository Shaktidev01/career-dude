use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, sqlx::Type, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[sqlx(type_name = "asset_type", rename_all = "snake_case")]
pub enum AssetType {
    Resume,
    CoverLetter,
    PrepSheet,
}

#[derive(Debug, FromRow, Serialize, Deserialize)]
pub struct GeneratedAsset {
    pub id: Uuid,
    pub user_id: Uuid,
    pub asset_type: AssetType,
    pub content: String,
    pub linked_job_id: Option<Uuid>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct CreateGeneratedAsset {
    pub asset_type: AssetType,
    pub content: String,
    pub linked_job_id: Option<Uuid>,
}
