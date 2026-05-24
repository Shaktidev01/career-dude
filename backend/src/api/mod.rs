pub mod handlers;

use axum::{
    routing::{get, post},
    Router,
};
use sqlx::PgPool;

use crate::api::handlers::*;

/// Public routes — no auth required (kept for health check pass-through; no endpoints currently)
pub fn public_router() -> Router<PgPool> {
    Router::new()
}

pub fn protected_router() -> Router<PgPool> {
    Router::new()
        // PDF conversion moved from public to protected — requires auth to prevent Gemini quota abuse.
        .route("/convert-pdf", post(convert_pdf_public))
        .route("/dashboard", get(dashboard_summary))
        .route("/evaluations", get(list_evaluations).post(create_evaluation))
        .route("/applications", get(list_applications).post(create_application))
        .route("/applications/:id", axum::routing::patch(update_application_status))
        .route("/assets", get(list_assets).post(create_asset))
        .route("/assets/generate", post(generate_asset))
        .route("/scanner", get(scanner_status).post(trigger_scan))
        .route("/batch", post(trigger_batch))
        .route("/pipeline", get(pipeline_view))
        .route("/pipeline/:id/status", axum::routing::patch(update_pipeline_status))
        .route("/interview-prep", get(get_interview_prep).post(generate_interview_prep))
        .route("/research", get(get_research).post(create_research))
        .route("/outreach", get(get_outreach).post(generate_outreach))
        .route("/analytics", get(get_analytics))
        .route("/followups", get(list_followups))
        .route("/training", get(list_training).post(evaluate_training))
        .route("/portfolio", get(list_portfolio).post(evaluate_project))
        .route("/apply", post(apply_automation))
        .route("/compare", post(compare_jobs))
        .route("/career-match", post(career_match_handler))
        .route("/settings/profile", get(get_profile).post(update_profile))
        .route("/settings/upload-cv", post(upload_cv_pdf))
        // Job search (Adzuna + Jooble + ATS portals)
        .route("/jobs/search", get(search_jobs))
        .route("/jobs/portals", get(search_ats_portals))
        // Smart Job Discovery
        .route("/jobs/discover", post(trigger_discovery_scan))
        .route("/jobs/discovered", get(get_discovered_jobs))
        .route("/jobs/discovered/seen", axum::routing::patch(mark_discovered_seen))
        .route("/jobs/discovered/:id/dismiss", axum::routing::patch(dismiss_discovered_job))
        // Employer mode
        .route("/employer/screen-cv", post(employer_screen_cv))
        .route("/employer/generate-jd", post(employer_generate_jd))
        .route("/employer/interview-questions", post(employer_interview_questions))
        .route("/employer/score-candidates", post(employer_score_candidates))
}
