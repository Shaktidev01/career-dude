use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, sqlx::Type, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[sqlx(type_name = "application_status", rename_all = "snake_case")]
pub enum ApplicationStatus {
    Saved,
    Applied,
    Interview,
    Offer,
    Rejected,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct JobEvaluationSummary {
    pub job_title: Option<String>,
    pub company: Option<String>,
    pub ai_score: Option<String>,
    pub archetype: Option<String>,
}

#[derive(Debug, FromRow, Serialize, Deserialize)]
pub struct Application {
    pub id: Uuid,
    pub user_id: Uuid,
    pub job_evaluation_id: Option<Uuid>,
    pub status: ApplicationStatus,
    pub notes: Option<String>,
    #[sqlx(skip)]
    pub job_evaluation: Option<JobEvaluationSummary>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct CreateApplication {
    pub job_evaluation_id: Option<Uuid>,
    pub status: ApplicationStatus,
    pub notes: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateApplicationStatus {
    pub status: ApplicationStatus,
    pub notes: Option<String>,
}
