use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, FromRow, Serialize, Deserialize)]
pub struct JobEvaluation {
    pub id: Uuid,
    pub user_id: Uuid,
    pub job_url: Option<String>,
    pub job_title: Option<String>,
    pub company: Option<String>,
    pub raw_description: Option<String>,
    pub ai_score: Option<String>,
    pub missing_skills: Option<serde_json::Value>,
    pub evaluation_report: Option<String>,
    pub archetype: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct CreateJobEvaluation {
    pub job_url: Option<String>,
    pub job_title: Option<String>,
    pub company: Option<String>,
    pub raw_description: Option<String>,
}
