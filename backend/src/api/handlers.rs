use axum::{
    extract::{State, Path},
    Json,
};
use axum_extra::extract::Multipart;
use serde_json::json;
use sqlx::{PgPool, Row};

use crate::models::error::{AppError, ApiResult};
use crate::models::job_evaluation::{CreateJobEvaluation, JobEvaluation};
use crate::models::application::{CreateApplication, Application, UpdateApplicationStatus, JobEvaluationSummary};
use crate::models::generated_asset::{CreateGeneratedAsset, GeneratedAsset, AssetType};
use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct GenerateAssetRequest {
    pub linked_job_id: uuid::Uuid,
    pub asset_type: AssetType,
}

#[derive(Debug, Deserialize)]
pub struct UpdateProfileRequest {
    pub name: Option<String>,
    pub master_profile_cv: Option<String>,
    pub target_roles: Option<serde_json::Value>,
    pub min_salary: Option<i32>,
    pub max_salary: Option<i32>,
    pub salary_currency: Option<String>,
    pub country: Option<String>,
    pub location: Option<String>,
    pub work_types: Option<serde_json::Value>,
    pub work_modes: Option<serde_json::Value>,
    pub dealbreakers: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
pub struct GenerateInterviewPrepRequest {
    pub job_evaluation_id: uuid::Uuid,
}

#[derive(Debug, Deserialize)]
pub struct CreateResearchRequest {
    pub company: String,
    pub role: String,
    pub job_description: Option<String>,
    pub job_evaluation_id: Option<uuid::Uuid>,
}

#[derive(Debug, Deserialize)]
pub struct GenerateOutreachRequest {
    pub job_evaluation_id: uuid::Uuid,
    pub recruiter_name: Option<String>,
    pub recruiter_role: Option<String>,
}

use crate::auth::CurrentUser;
use crate::utils::ai_engine::{AiEngine, EvaluatorRequest, JobInput};

#[derive(Debug, serde::Deserialize)]
pub struct CompareJobsRequest {
    pub jobs: Vec<JobInput>,
}

#[derive(Debug, serde::Deserialize)]
pub struct CareerMatchRequest {
    pub archetypes: Option<Vec<String>>,
}

// --- Job Evaluator ---
pub async fn create_evaluation(
    State(pool): State<PgPool>,
    current_user: CurrentUser,
    Json(payload): Json<CreateJobEvaluation>,
) -> ApiResult<JobEvaluation> {
    
    // Phase 1: read-only checks — no transaction so we don't hold a connection during AI call.
    let credits: i32 = sqlx::query_scalar("SELECT ai_credits_balance FROM users WHERE id = $1")
        .bind(current_user.id)
        .fetch_one(&pool)
        .await?;

    if credits < 1 {
        return Err(AppError::Validation("Insufficient AI credits".into()));
    }

    // Fetch user's full profile (CV + preferences)
    let profile_row = sqlx::query(
        "SELECT master_profile_cv, min_salary, max_salary, salary_currency, country, location, work_types, work_modes, dealbreakers, target_roles FROM users WHERE id = $1"
    )
    .bind(current_user.id)
    .fetch_one(&pool)
    .await?;

    let user_cv = profile_row.try_get::<Option<String>, _>("master_profile_cv")
        .unwrap_or(None)
        .unwrap_or_else(|| "No CV provided yet. Evaluate the job on its own merits.".to_string());

    // Build preferences context string for AI
    let mut prefs: Vec<String> = Vec::new();
    if let Ok(Some(country)) = profile_row.try_get::<Option<String>, _>("country") {
        if let Ok(Some(location)) = profile_row.try_get::<Option<String>, _>("location") {
            prefs.push(format!("Location: {} ({})", location, country));
        } else {
            prefs.push(format!("Country: {}", country));
        }
    }
    let currency = profile_row.try_get::<Option<String>, _>("salary_currency").unwrap_or(None).unwrap_or_else(|| "USD".to_string());
    if let Ok(Some(min)) = profile_row.try_get::<Option<i32>, _>("min_salary") {
        if let Ok(Some(max)) = profile_row.try_get::<Option<i32>, _>("max_salary") {
            prefs.push(format!("Salary expectation: {}{} – {}{}", currency, min, currency, max));
        } else {
            prefs.push(format!("Minimum salary: {}{}", currency, min));
        }
    }
    if let Ok(Some(wt)) = profile_row.try_get::<Option<serde_json::Value>, _>("work_types") {
        if let Some(arr) = wt.as_array() {
            let types: Vec<&str> = arr.iter().filter_map(|v| v.as_str()).collect();
            if !types.is_empty() { prefs.push(format!("Employment type: {}", types.join(", "))); }
        }
    }
    if let Ok(Some(wm)) = profile_row.try_get::<Option<serde_json::Value>, _>("work_modes") {
        if let Some(arr) = wm.as_array() {
            let modes: Vec<&str> = arr.iter().filter_map(|v| v.as_str()).collect();
            if !modes.is_empty() { prefs.push(format!("Work mode preference: {}", modes.join(", "))); }
        }
    }
    if let Ok(Some(db)) = profile_row.try_get::<Option<serde_json::Value>, _>("dealbreakers") {
        if let Some(arr) = db.as_array() {
            let items: Vec<&str> = arr.iter().filter_map(|v| v.as_str()).collect();
            if !items.is_empty() { prefs.push(format!("DEALBREAKERS (flag if present): {}", items.join(", "))); }
        }
    }
    if let Ok(Some(tr)) = profile_row.try_get::<Option<serde_json::Value>, _>("target_roles") {
        if let Some(arr) = tr.as_array() {
            let roles: Vec<&str> = arr.iter().filter_map(|v| v.as_str()).collect();
            if !roles.is_empty() { prefs.push(format!("Target archetypes: {}", roles.join(", "))); }
        }
    }
    let user_preferences = prefs.join("\n");

    let ai_engine = AiEngine::new().map_err(|e| AppError::Internal(e.into()))?;

    // Use pasted description, or fetch from URL if description is empty
    let job_description = match payload.raw_description.as_deref() {
        Some(d) if !d.trim().is_empty() => d.to_string(),
        _ => {
            match payload.job_url.as_deref() {
                Some(url) if !url.trim().is_empty() => {
                    // SSRF mitigation: only allow http/https with public-facing host.
                    // Block localhost, 127.x, 10.x, 172.16-31.x, 192.168.x ranges.
                    let parsed = url::Url::parse(url)
                        .map_err(|_| AppError::Validation("Invalid URL.".into()))?;
                    if !matches!(parsed.scheme(), "http" | "https") {
                        return Err(AppError::Validation("URL must be http or https.".into()));
                    }
                    if let Some(host) = parsed.host_str() {
                        let blocked = host == "localhost"
                            || host.starts_with("127.")
                            || host.starts_with("10.")
                            || host.starts_with("192.168.")
                            || host.starts_with("169.254.")  // link-local — AWS/GCP/Azure IMDS
                            || host == "0.0.0.0"
                            || host == "::1"
                            || host.starts_with("fd")        // IPv6 ULA (fd00::/8)
                            || host.starts_with("fe80")      // IPv6 link-local
                            || (host.starts_with("172.") && {
                                // 172.16.0.0/12
                                let octet: u8 = host.split('.').nth(1).unwrap_or("0").parse().unwrap_or(0);
                                (16..=31).contains(&octet)
                            });
                        if blocked {
                            return Err(AppError::Validation("URL host not allowed.".into()));
                        }
                    }
                    ai_engine.extract_job_from_url(url).await
                        .map_err(|e| AppError::Validation(e.to_string()))?
                }
                _ => return Err(AppError::Validation(
                    "Provide either a job description or a job URL.".into()
                )),
            }
        }
    };

    let req = EvaluatorRequest {
        job_description,
        user_cv,
        user_preferences,
    };
    // Phase 2: AI call — happens outside any transaction.
    let ai_result = ai_engine.evaluate_job(&req).await.map_err(|e| AppError::Internal(e.into()))?;

    // Phase 3: short atomic transaction — deduct credit + insert result.
    let mut tx = pool.begin().await?;
    sqlx::query("UPDATE users SET ai_credits_balance = ai_credits_balance - 1 WHERE id = $1 AND ai_credits_balance > 0")
        .bind(current_user.id)
        .execute(&mut *tx)
        .await?;

    let eval_id = uuid::Uuid::new_v4();
    let evaluation = sqlx::query_as::<_, JobEvaluation>(
        r#"
        INSERT INTO job_evaluations (id, user_id, job_url, job_title, company, raw_description, ai_score, missing_skills, evaluation_report, archetype)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
        "#
    )
    .bind(eval_id)
    .bind(current_user.id)
    .bind(&payload.job_url)
    .bind(&payload.job_title)
    .bind(&payload.company)
    .bind(&payload.raw_description)
    .bind(&ai_result.score)
    .bind(serde_json::to_value(&ai_result.missing_skills).unwrap_or_default())
    .bind(&ai_result.full_report())
    .bind(&ai_result.archetype)
    .fetch_one(&mut *tx)
    .await?;

    tx.commit().await?;

    Ok(Json(evaluation))
}

pub async fn list_evaluations(
    State(pool): State<PgPool>,
    current_user: CurrentUser,
) -> ApiResult<Vec<JobEvaluation>> {
    let evals = sqlx::query_as::<_, JobEvaluation>("SELECT * FROM job_evaluations WHERE user_id = $1 ORDER BY created_at DESC")
        .bind(current_user.id)
        .fetch_all(&pool)
        .await?;
    Ok(Json(evals))
}

// --- Application Tracker ---
pub async fn create_application(
    State(pool): State<PgPool>,
    current_user: CurrentUser,
    Json(payload): Json<CreateApplication>,
) -> ApiResult<Application> {
    let app_id = uuid::Uuid::new_v4();
    let app = sqlx::query_as::<_, Application>(
        r#"
        INSERT INTO applications (id, user_id, job_evaluation_id, status, notes)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
        "#
    )
    .bind(app_id)
    .bind(current_user.id)
    .bind(payload.job_evaluation_id)
    .bind(&payload.status)
    .bind(&payload.notes)
    .fetch_one(&pool)
    .await?;

    Ok(Json(app))
}

pub async fn list_applications(
    State(pool): State<PgPool>,
    current_user: CurrentUser,
) -> ApiResult<Vec<Application>> {
    let mut apps: Vec<Application> = Vec::new();
    let rows = sqlx::query(
        r#"
        SELECT 
            a.id, a.user_id, a.job_evaluation_id, a.status, a.notes, a.created_at, a.updated_at,
            j.job_title, j.company, j.ai_score, j.archetype
        FROM applications a
        LEFT JOIN job_evaluations j ON a.job_evaluation_id = j.id
        WHERE a.user_id = $1
        ORDER BY a.updated_at DESC
        "#
    )
    .bind(current_user.id)
    .fetch_all(&pool)
    .await?;

    for row in rows {
        apps.push(Application {
            id: row.try_get("id")?,
            user_id: row.try_get("user_id")?,
            job_evaluation_id: row.try_get("job_evaluation_id")?,
            status: row.try_get("status")?,
            notes: row.try_get("notes")?,
            created_at: row.try_get("created_at")?,
            updated_at: row.try_get("updated_at")?,
            job_evaluation: Some(JobEvaluationSummary {
                job_title: row.try_get("job_title").ok().flatten(),
                company: row.try_get("company").ok().flatten(),
                ai_score: row.try_get("ai_score").ok().flatten(),
                archetype: row.try_get("archetype").ok().flatten(),
            }),
        });
    }

    Ok(Json(apps))
}

pub async fn update_application_status(
    State(pool): State<PgPool>,
    current_user: CurrentUser,
    Path(id): Path<uuid::Uuid>,
    Json(payload): Json<UpdateApplicationStatus>,
) -> ApiResult<Application> {
    let app = sqlx::query_as::<_, Application>(
        r#"
        UPDATE applications 
        SET status = $1, notes = COALESCE($2, notes), updated_at = NOW()
        WHERE id = $3 AND user_id = $4
        RETURNING *
        "#
    )
    .bind(&payload.status)
    .bind(&payload.notes)
    .bind(id)
    .bind(current_user.id)
    .fetch_one(&pool)
    .await
    .map_err(|e| match e {
        sqlx::Error::RowNotFound => AppError::NotFound,
        _ => AppError::Sqlx(e),
    })?;

    Ok(Json(app))
}

// --- Resume Generator ---
pub async fn create_asset(
    State(pool): State<PgPool>,
    current_user: CurrentUser,
    Json(payload): Json<CreateGeneratedAsset>,
) -> ApiResult<GeneratedAsset> {
    let asset_id = uuid::Uuid::new_v4();
    
    let asset = sqlx::query_as::<_, GeneratedAsset>(
        r#"
        INSERT INTO generated_assets (id, user_id, asset_type, content, linked_job_id)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
        "#
    )
    .bind(asset_id)
    .bind(current_user.id)
    .bind(&payload.asset_type)
    .bind(&payload.content)
    .bind(payload.linked_job_id)
    .fetch_one(&pool)
    .await?;

    Ok(Json(asset))
}

pub async fn generate_asset(
    State(pool): State<PgPool>,
    current_user: CurrentUser,
    Json(payload): Json<GenerateAssetRequest>,
) -> ApiResult<GeneratedAsset> {
    // 1. Fetch Job Evaluation
    let job = sqlx::query_as::<_, JobEvaluation>("SELECT * FROM job_evaluations WHERE id = $1 AND user_id = $2")
        .bind(payload.linked_job_id)
        .bind(current_user.id)
        .fetch_optional(&pool)
        .await?
        .ok_or(AppError::NotFound)?;
        
    let job_description = job.raw_description.unwrap_or_default();
    
    // 2. Fetch User's Master CV
    let cv_row: Option<String> = sqlx::query_scalar("SELECT master_profile_cv FROM users WHERE id = $1")
        .bind(current_user.id)
        .fetch_one(&pool)
        .await?;
        
    let user_cv = cv_row.unwrap_or_else(|| "Default CV content".to_string());
    
    // 3. Check credits (read-only — no transaction yet)
    let credits: i32 = sqlx::query_scalar("SELECT ai_credits_balance FROM users WHERE id = $1")
        .bind(current_user.id)
        .fetch_one(&pool)
        .await?;

    if credits < 1 {
        return Err(AppError::Validation("Insufficient AI credits".into()));
    }

    // 4. Generate with AI (outside any transaction — may take 5-30s)
    let ai_engine = AiEngine::new().map_err(|e| AppError::Internal(e.into()))?;
    let content = ai_engine.generate_resume(&job_description, &user_cv).await.map_err(|e| AppError::Internal(e.into()))?;

    // 5. Short atomic transaction: deduct credit + insert asset
    let mut tx = pool.begin().await?;
    sqlx::query("UPDATE users SET ai_credits_balance = ai_credits_balance - 1 WHERE id = $1 AND ai_credits_balance > 0")
        .bind(current_user.id)
        .execute(&mut *tx)
        .await?;

    let asset_id = uuid::Uuid::new_v4();
    let asset = sqlx::query_as::<_, GeneratedAsset>(
        r#"
        INSERT INTO generated_assets (id, user_id, asset_type, content, linked_job_id)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
        "#
    )
    .bind(asset_id)
    .bind(current_user.id)
    .bind(&payload.asset_type)
    .bind(&content)
    .bind(payload.linked_job_id)
    .fetch_one(&mut *tx)
    .await?;

    tx.commit().await?;

    Ok(Json(asset))
}

pub async fn list_assets(
    State(pool): State<PgPool>,
    current_user: CurrentUser,
) -> ApiResult<Vec<GeneratedAsset>> {
    let assets = sqlx::query_as::<_, GeneratedAsset>("SELECT * FROM generated_assets WHERE user_id = $1 ORDER BY created_at DESC")
        .bind(current_user.id)
        .fetch_all(&pool)
        .await?;
    Ok(Json(assets))
}

// --- Dashboard ---
pub async fn dashboard_summary(
    State(pool): State<PgPool>,
    current_user: CurrentUser,
) -> ApiResult<serde_json::Value> {
    let total_applications: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM applications WHERE user_id = $1"
    ).bind(current_user.id).fetch_one(&pool).await?;

    let active_interviews: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM applications WHERE user_id = $1 AND status = 'interview'"
    ).bind(current_user.id).fetch_one(&pool).await?;

    let avg_score: Option<String> = sqlx::query_scalar(
        "SELECT ai_score FROM job_evaluations WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1"
    ).bind(current_user.id).fetch_optional(&pool).await?;

    let resumes_generated: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM generated_assets WHERE user_id = $1"
    ).bind(current_user.id).fetch_one(&pool).await?;

    let recent_evaluations = sqlx::query_as::<_, JobEvaluation>(
        "SELECT * FROM job_evaluations WHERE user_id = $1 ORDER BY created_at DESC LIMIT 5"
    ).bind(current_user.id).fetch_all(&pool).await?;

    let credits: i32 = sqlx::query_scalar(
        "SELECT ai_credits_balance FROM users WHERE id = $1"
    ).bind(current_user.id).fetch_one(&pool).await?;

    let offers: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM applications WHERE user_id = $1 AND status = 'offer'"
    ).bind(current_user.id).fetch_one(&pool).await?;

    Ok(Json(json!({
        "total_applications": total_applications,
        "active_interviews": active_interviews,
        "avg_score": avg_score.unwrap_or_else(|| "-".to_string()),
        "resumes_generated": resumes_generated,
        "offers": offers,
        "ai_credits": credits,
        "recent_evaluations": recent_evaluations,
    })))
}
// --- Scanner (stub — requires browser automation layer) ---
pub async fn scanner_status(
    State(pool): State<PgPool>,
    current_user: CurrentUser,
) -> ApiResult<serde_json::Value> {
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM portal_scans WHERE user_id = $1")
        .bind(current_user.id)
        .fetch_one(&pool)
        .await?;
    Ok(Json(json!({ "total_scans": count, "status": "Scanner automation requires browser integration. Coming soon." })))
}

pub async fn trigger_scan(
    _state: State<PgPool>,
    _u: CurrentUser,
) -> ApiResult<serde_json::Value> {
    Ok(Json(json!({ "status": "queued", "message": "Portal scanner automation coming soon. For now, paste job descriptions manually into the evaluator." })))
}

pub async fn trigger_batch(
    _state: State<PgPool>,
    _u: CurrentUser,
) -> ApiResult<serde_json::Value> {
    Ok(Json(json!({ "status": "queued", "message": "Batch processing coming soon." })))
}

// --- Pipeline View ---
pub async fn pipeline_view(
    State(pool): State<PgPool>,
    current_user: CurrentUser,
) -> ApiResult<serde_json::Value> {
    let rows = sqlx::query(
        r#"
        SELECT
            a.id, a.status, a.notes, a.created_at, a.updated_at,
            j.job_title, j.company, j.ai_score, j.archetype, j.job_url
        FROM applications a
        LEFT JOIN job_evaluations j ON a.job_evaluation_id = j.id
        WHERE a.user_id = $1
        ORDER BY a.updated_at DESC
        "#
    )
    .bind(current_user.id)
    .fetch_all(&pool)
    .await?;

    let items: Vec<serde_json::Value> = rows.iter().map(|row| {
        json!({
            "id": row.try_get::<uuid::Uuid, _>("id").unwrap_or_default(),
            "status": row.try_get::<String, _>("status").unwrap_or_default(),
            "notes": row.try_get::<Option<String>, _>("notes").unwrap_or(None),
            "job_title": row.try_get::<Option<String>, _>("job_title").unwrap_or(None),
            "company": row.try_get::<Option<String>, _>("company").unwrap_or(None),
            "ai_score": row.try_get::<Option<String>, _>("ai_score").unwrap_or(None),
            "archetype": row.try_get::<Option<String>, _>("archetype").unwrap_or(None),
            "job_url": row.try_get::<Option<String>, _>("job_url").unwrap_or(None),
            "created_at": row.try_get::<chrono::DateTime<chrono::Utc>, _>("created_at").ok(),
            "updated_at": row.try_get::<chrono::DateTime<chrono::Utc>, _>("updated_at").ok(),
        })
    }).collect();

    let count = items.len();
    Ok(Json(json!({
        "items": items,
        "total": count,
    })))
}

// --- Interview Prep ---
pub async fn get_interview_prep(
    State(pool): State<PgPool>,
    current_user: CurrentUser,
) -> ApiResult<Vec<GeneratedAsset>> {
    let assets = sqlx::query_as::<_, GeneratedAsset>(
        "SELECT * FROM generated_assets WHERE user_id = $1 AND asset_type = 'prep_sheet' ORDER BY created_at DESC"
    )
    .bind(current_user.id)
    .fetch_all(&pool)
    .await?;
    Ok(Json(assets))
}

pub async fn generate_interview_prep(
    State(pool): State<PgPool>,
    current_user: CurrentUser,
    Json(payload): Json<GenerateInterviewPrepRequest>,
) -> ApiResult<GeneratedAsset> {
    // Fetch job evaluation
    let job = sqlx::query_as::<_, JobEvaluation>(
        "SELECT * FROM job_evaluations WHERE id = $1 AND user_id = $2"
    )
    .bind(payload.job_evaluation_id)
    .bind(current_user.id)
    .fetch_optional(&pool)
    .await?
    .ok_or(AppError::NotFound)?;

    let job_description = job.raw_description.clone().unwrap_or_default();
    if job_description.trim().is_empty() {
        return Err(AppError::Validation("Job has no description stored. Re-evaluate with the full JD text.".into()));
    }

    // Fetch user CV
    let mut tx = pool.begin().await?;
    let credits: i32 = sqlx::query_scalar("SELECT ai_credits_balance FROM users WHERE id = $1")
        .bind(current_user.id)
        .fetch_one(&mut *tx)
        .await?;
    if credits < 1 {
        return Err(AppError::Validation("Insufficient AI credits".into()));
    }
    sqlx::query("UPDATE users SET ai_credits_balance = ai_credits_balance - 1 WHERE id = $1")
        .bind(current_user.id)
        .execute(&mut *tx)
        .await?;

    let user_cv: Option<String> = sqlx::query_scalar("SELECT master_profile_cv FROM users WHERE id = $1")
        .bind(current_user.id)
        .fetch_one(&mut *tx)
        .await?;
    let cv = user_cv.unwrap_or_else(|| "No CV provided.".to_string());

    let company = job.company.clone().unwrap_or_else(|| "the company".to_string());

    let ai_engine = AiEngine::new().map_err(|e| AppError::Internal(e.into()))?;
    let content = ai_engine.generate_interview_prep(&job_description, &cv, &company)
        .await
        .map_err(|e| AppError::Internal(e.into()))?;

    let asset_id = uuid::Uuid::new_v4();
    let asset = sqlx::query_as::<_, GeneratedAsset>(
        r#"
        INSERT INTO generated_assets (id, user_id, asset_type, content, linked_job_id)
        VALUES ($1, $2, 'prep_sheet', $3, $4)
        RETURNING *
        "#
    )
    .bind(asset_id)
    .bind(current_user.id)
    .bind(&content)
    .bind(Some(payload.job_evaluation_id))
    .fetch_one(&mut *tx)
    .await?;

    tx.commit().await?;
    Ok(Json(asset))
}

// --- Company Research ---
pub async fn get_research(
    State(pool): State<PgPool>,
    current_user: CurrentUser,
) -> ApiResult<serde_json::Value> {
    // Research is stateless for now — return recent evaluations for quick access
    let evals = sqlx::query(
        "SELECT id, company, job_title, archetype, ai_score, created_at FROM job_evaluations WHERE user_id = $1 AND company IS NOT NULL ORDER BY created_at DESC LIMIT 20"
    )
    .bind(current_user.id)
    .fetch_all(&pool)
    .await?;

    let list: Vec<serde_json::Value> = evals.iter().map(|r| json!({
        "id": r.try_get::<uuid::Uuid, _>("id").unwrap_or_default(),
        "company": r.try_get::<Option<String>, _>("company").unwrap_or(None),
        "job_title": r.try_get::<Option<String>, _>("job_title").unwrap_or(None),
        "archetype": r.try_get::<Option<String>, _>("archetype").unwrap_or(None),
        "ai_score": r.try_get::<Option<String>, _>("ai_score").unwrap_or(None),
    })).collect();

    Ok(Json(json!({ "evaluated_companies": list })))
}

pub async fn create_research(
    State(pool): State<PgPool>,
    current_user: CurrentUser,
    Json(payload): Json<CreateResearchRequest>,
) -> ApiResult<serde_json::Value> {
    // Optionally fetch JD from linked evaluation
    let job_description = if let Some(eval_id) = payload.job_evaluation_id {
        let jd: Option<String> = sqlx::query_scalar(
            "SELECT raw_description FROM job_evaluations WHERE id = $1 AND user_id = $2"
        )
        .bind(eval_id)
        .bind(current_user.id)
        .fetch_optional(&pool)
        .await?
        .flatten();
        jd.or(payload.job_description).unwrap_or_default()
    } else {
        payload.job_description.unwrap_or_default()
    };

    let ai_engine = AiEngine::new().map_err(|e| AppError::Internal(e.into()))?;
    let content = ai_engine.research_company(&payload.company, &payload.role, &job_description)
        .await
        .map_err(|e| AppError::Internal(e.into()))?;

    Ok(Json(json!({
        "company": payload.company,
        "role": payload.role,
        "content": content,
    })))
}

// --- LinkedIn Outreach ---
pub async fn get_outreach(
    State(pool): State<PgPool>,
    current_user: CurrentUser,
) -> ApiResult<serde_json::Value> {
    // Return recent evaluations for outreach context
    let evals = sqlx::query(
        "SELECT id, company, job_title, ai_score FROM job_evaluations WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20"
    )
    .bind(current_user.id)
    .fetch_all(&pool)
    .await?;

    let list: Vec<serde_json::Value> = evals.iter().map(|r| json!({
        "id": r.try_get::<uuid::Uuid, _>("id").unwrap_or_default(),
        "company": r.try_get::<Option<String>, _>("company").unwrap_or(None),
        "job_title": r.try_get::<Option<String>, _>("job_title").unwrap_or(None),
        "ai_score": r.try_get::<Option<String>, _>("ai_score").unwrap_or(None),
    })).collect();

    Ok(Json(json!({ "evaluations": list })))
}

pub async fn generate_outreach(
    State(pool): State<PgPool>,
    current_user: CurrentUser,
    Json(payload): Json<GenerateOutreachRequest>,
) -> ApiResult<serde_json::Value> {
    let job = sqlx::query_as::<_, JobEvaluation>(
        "SELECT * FROM job_evaluations WHERE id = $1 AND user_id = $2"
    )
    .bind(payload.job_evaluation_id)
    .bind(current_user.id)
    .fetch_optional(&pool)
    .await?
    .ok_or(AppError::NotFound)?;

    let jd = job.raw_description.clone().unwrap_or_default();
    let company = job.company.clone().unwrap_or_else(|| "the company".to_string());
    let role = job.job_title.clone().unwrap_or_else(|| "this role".to_string());

    let user_cv: Option<String> = sqlx::query_scalar("SELECT master_profile_cv FROM users WHERE id = $1")
        .bind(current_user.id)
        .fetch_one(&pool)
        .await?;
    let cv = user_cv.unwrap_or_else(|| "No CV provided.".to_string());

    let ai_engine = AiEngine::new().map_err(|e| AppError::Internal(e.into()))?;
    let content = ai_engine.generate_outreach(
        &jd,
        &cv,
        &company,
        &role,
        payload.recruiter_name.as_deref(),
    )
    .await
    .map_err(|e| AppError::Internal(e.into()))?;

    Ok(Json(json!({
        "company": company,
        "role": role,
        "content": content,
    })))
}

// --- Analytics ---
pub async fn get_analytics(
    State(pool): State<PgPool>,
    current_user: CurrentUser,
) -> ApiResult<serde_json::Value> {
    // Score distribution
    let score_rows = sqlx::query(
        "SELECT ai_score, COUNT(*) as cnt FROM job_evaluations WHERE user_id = $1 AND ai_score IS NOT NULL GROUP BY ai_score ORDER BY ai_score"
    )
    .bind(current_user.id)
    .fetch_all(&pool)
    .await?;

    let score_dist: Vec<serde_json::Value> = score_rows.iter().map(|r| json!({
        "score": r.try_get::<Option<String>, _>("ai_score").unwrap_or(None),
        "count": r.try_get::<i64, _>("cnt").unwrap_or(0),
    })).collect();

    // Application funnel
    let funnel_rows = sqlx::query(
        "SELECT status::text, COUNT(*) as cnt FROM applications WHERE user_id = $1 GROUP BY status"
    )
    .bind(current_user.id)
    .fetch_all(&pool)
    .await?;

    let funnel: serde_json::Value = {
        let mut map = serde_json::Map::new();
        for row in &funnel_rows {
            let status = row.try_get::<String, _>("status").unwrap_or_default();
            let cnt = row.try_get::<i64, _>("cnt").unwrap_or(0);
            map.insert(status, json!(cnt));
        }
        json!(map)
    };

    // Archetype breakdown
    let archetype_rows = sqlx::query(
        "SELECT archetype, COUNT(*) as cnt FROM job_evaluations WHERE user_id = $1 AND archetype IS NOT NULL GROUP BY archetype ORDER BY cnt DESC LIMIT 5"
    )
    .bind(current_user.id)
    .fetch_all(&pool)
    .await?;

    let archetypes: Vec<serde_json::Value> = archetype_rows.iter().map(|r| json!({
        "archetype": r.try_get::<Option<String>, _>("archetype").unwrap_or(None),
        "count": r.try_get::<i64, _>("cnt").unwrap_or(0),
    })).collect();

    // Total evaluations
    let total_evals: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM job_evaluations WHERE user_id = $1")
        .bind(current_user.id)
        .fetch_one(&pool)
        .await?;

    // Applications over time (last 30 days by week)
    let weekly_rows = sqlx::query(
        r#"
        SELECT date_trunc('week', created_at) as week, COUNT(*) as cnt
        FROM applications
        WHERE user_id = $1 AND created_at > NOW() - INTERVAL '30 days'
        GROUP BY week ORDER BY week
        "#
    )
    .bind(current_user.id)
    .fetch_all(&pool)
    .await?;

    let weekly: Vec<serde_json::Value> = weekly_rows.iter().map(|r| json!({
        "week": r.try_get::<Option<chrono::DateTime<chrono::Utc>>, _>("week").unwrap_or(None),
        "count": r.try_get::<i64, _>("cnt").unwrap_or(0),
    })).collect();

    Ok(Json(json!({
        "score_distribution": score_dist,
        "application_funnel": funnel,
        "top_archetypes": archetypes,
        "total_evaluations": total_evals,
        "weekly_applications": weekly,
    })))
}

// --- Follow-ups ---
pub async fn list_followups(
    State(pool): State<PgPool>,
    current_user: CurrentUser,
) -> ApiResult<serde_json::Value> {
    let rows = sqlx::query(
        r#"
        SELECT
            f.id, f.action_type, f.due_date, f.completed, f.created_at,
            a.status as app_status,
            j.job_title, j.company
        FROM followups f
        LEFT JOIN applications a ON f.application_id = a.id
        LEFT JOIN job_evaluations j ON a.job_evaluation_id = j.id
        WHERE f.user_id = $1
        ORDER BY f.due_date ASC NULLS LAST
        "#
    )
    .bind(current_user.id)
    .fetch_all(&pool)
    .await?;

    let followups: Vec<serde_json::Value> = rows.iter().map(|r| json!({
        "id": r.try_get::<uuid::Uuid, _>("id").unwrap_or_default(),
        "action_type": r.try_get::<String, _>("action_type").unwrap_or_default(),
        "due_date": r.try_get::<Option<chrono::DateTime<chrono::Utc>>, _>("due_date").unwrap_or(None),
        "completed": r.try_get::<bool, _>("completed").unwrap_or(false),
        "app_status": r.try_get::<Option<String>, _>("app_status").unwrap_or(None),
        "job_title": r.try_get::<Option<String>, _>("job_title").unwrap_or(None),
        "company": r.try_get::<Option<String>, _>("company").unwrap_or(None),
    })).collect();

    Ok(Json(json!({ "followups": followups })))
}

// --- Training & Portfolio (stubs with helpful messages) ---
pub async fn list_training(
    _state: State<PgPool>,
    _u: CurrentUser,
) -> ApiResult<serde_json::Value> {
    Ok(Json(json!({
        "courses": [],
        "message": "Course evaluation feature coming soon. Will use Career Ops training mode to assess skill gaps from your evaluations."
    })))
}

pub async fn evaluate_training(
    _state: State<PgPool>,
    _u: CurrentUser,
) -> ApiResult<serde_json::Value> {
    Ok(Json(json!({ "status": "coming_soon" })))
}

pub async fn list_portfolio(
    _state: State<PgPool>,
    _u: CurrentUser,
) -> ApiResult<serde_json::Value> {
    Ok(Json(json!({
        "projects": [],
        "message": "Portfolio evaluation coming soon. Will use Career Ops project mode to assess project relevance to target roles."
    })))
}

pub async fn evaluate_project(
    _state: State<PgPool>,
    _u: CurrentUser,
) -> ApiResult<serde_json::Value> {
    Ok(Json(json!({ "status": "coming_soon" })))
}

pub async fn apply_automation(
    _state: State<PgPool>,
    _u: CurrentUser,
) -> ApiResult<serde_json::Value> {
    Ok(Json(json!({
        "status": "not_available",
        "message": "Automated application submission is not supported. Career Dude evaluates and prepares — you decide when to apply."
    })))
}

// --- Parallel Job Comparison ---
pub async fn compare_jobs(
    State(pool): State<PgPool>,
    current_user: CurrentUser,
    Json(payload): Json<CompareJobsRequest>,
) -> ApiResult<serde_json::Value> {
    if payload.jobs.is_empty() {
        return Err(AppError::Validation("No jobs provided".into()));
    }
    if payload.jobs.len() > 5 {
        return Err(AppError::Validation("Maximum 5 jobs per comparison".into()));
    }
    for job in &payload.jobs {
        if job.description.trim().is_empty() {
            return Err(AppError::Validation("All jobs must have a description".into()));
        }
    }

    // Deduct 1 credit per job
    let credits_needed = payload.jobs.len() as i32;
    let mut tx = pool.begin().await?;
    let credits: i32 = sqlx::query_scalar("SELECT ai_credits_balance FROM users WHERE id = $1")
        .bind(current_user.id)
        .fetch_one(&mut *tx)
        .await?;
    if credits < credits_needed {
        return Err(AppError::Validation(format!(
            "Need {} credits for {} jobs, you have {}",
            credits_needed, payload.jobs.len(), credits
        )));
    }
    sqlx::query("UPDATE users SET ai_credits_balance = ai_credits_balance - $1 WHERE id = $2")
        .bind(credits_needed)
        .bind(current_user.id)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;

    let user_cv: Option<String> = sqlx::query_scalar("SELECT master_profile_cv FROM users WHERE id = $1")
        .bind(current_user.id)
        .fetch_one(&pool)
        .await?;
    let cv = user_cv.unwrap_or_else(|| "No CV provided.".to_string());

    let ai_engine = AiEngine::new().map_err(|e| AppError::Internal(e.into()))?;
    let results = ai_engine.compare_jobs(&payload.jobs, &cv)
        .await
        .map_err(|e| AppError::Internal(e.into()))?;

    let ranked: Vec<serde_json::Value> = results.iter().enumerate().map(|(i, r)| {
        let mut item = r.data.clone();
        if let Some(obj) = item.as_object_mut() {
            obj.insert("rank".to_string(), json!(i + 1));
            obj.insert("title".to_string(), json!(r.title));
            obj.insert("company".to_string(), json!(r.company));
        }
        item
    }).collect();

    Ok(Json(json!({
        "ranked": ranked,
        "count": ranked.len(),
        "credits_used": credits_needed,
    })))
}

// --- Career Matching ---
pub async fn career_match_handler(
    State(pool): State<PgPool>,
    current_user: CurrentUser,
    Json(payload): Json<CareerMatchRequest>,
) -> ApiResult<serde_json::Value> {
    let user_cv: Option<String> = sqlx::query_scalar("SELECT master_profile_cv FROM users WHERE id = $1")
        .bind(current_user.id)
        .fetch_one(&pool)
        .await?;
    let cv = user_cv.unwrap_or_default();

    if cv.trim().is_empty() {
        return Err(AppError::Validation("Please add your CV in Settings before running career matching.".into()));
    }

    // Use provided archetypes OR fetch from user's target_roles
    let archetypes = if let Some(arcs) = payload.archetypes.filter(|a| !a.is_empty()) {
        arcs
    } else {
        let target_roles: Option<serde_json::Value> = sqlx::query_scalar(
            "SELECT target_roles FROM users WHERE id = $1"
        )
        .bind(current_user.id)
        .fetch_one(&pool)
        .await?;

        match target_roles {
            Some(serde_json::Value::Array(arr)) => {
                arr.iter()
                    .filter_map(|v| v.as_str().map(|s| s.to_string()))
                    .collect()
            }
            _ => vec![
                "Full Stack Engineer".to_string(),
                "Backend Engineer".to_string(),
                "AI Platform / LLMOps".to_string(),
            ],
        }
    };

    let ai_engine = AiEngine::new().map_err(|e| AppError::Internal(e.into()))?;
    let content = ai_engine.career_match(&cv, &archetypes)
        .await
        .map_err(|e| AppError::Internal(e.into()))?;

    Ok(Json(json!({
        "archetypes_analyzed": archetypes,
        "content": content,
    })))
}

pub async fn get_profile(
    State(pool): State<PgPool>,
    current_user: CurrentUser,
) -> ApiResult<serde_json::Value> {
    let row = sqlx::query(
        "SELECT name, email, master_profile_cv, target_roles, min_salary, max_salary, salary_currency, country, location, work_types, work_modes, dealbreakers, subscription_tier, ai_credits_balance FROM users WHERE id = $1"
    )
    .bind(current_user.id)
    .fetch_one(&pool)
    .await?;

    Ok(Json(json!({
        "name": row.try_get::<Option<String>, _>("name").unwrap_or(None),
        "email": row.try_get::<String, _>("email").unwrap_or_default(),
        "master_profile_cv": row.try_get::<Option<String>, _>("master_profile_cv").unwrap_or(None),
        "target_roles": row.try_get::<Option<serde_json::Value>, _>("target_roles").unwrap_or(None),
        "min_salary": row.try_get::<Option<i32>, _>("min_salary").unwrap_or(None),
        "max_salary": row.try_get::<Option<i32>, _>("max_salary").unwrap_or(None),
        "salary_currency": row.try_get::<Option<String>, _>("salary_currency").unwrap_or(None),
        "country": row.try_get::<Option<String>, _>("country").unwrap_or(None),
        "location": row.try_get::<Option<String>, _>("location").unwrap_or(None),
        "work_types": row.try_get::<Option<serde_json::Value>, _>("work_types").unwrap_or(None),
        "work_modes": row.try_get::<Option<serde_json::Value>, _>("work_modes").unwrap_or(None),
        "dealbreakers": row.try_get::<Option<serde_json::Value>, _>("dealbreakers").unwrap_or(None),
        "subscription_tier": row.try_get::<String, _>("subscription_tier").unwrap_or_default(),
        "ai_credits_balance": row.try_get::<i32, _>("ai_credits_balance").unwrap_or(0),
    })))
}

pub async fn update_profile(
    State(pool): State<PgPool>,
    current_user: CurrentUser,
    Json(payload): Json<UpdateProfileRequest>,
) -> ApiResult<serde_json::Value> {
    sqlx::query(
        r#"
        UPDATE users SET
            master_profile_cv = COALESCE($1, master_profile_cv),
            target_roles = COALESCE($2, target_roles),
            min_salary = COALESCE($3, min_salary),
            dealbreakers = COALESCE($4, dealbreakers),
            name = COALESCE($5, name),
            max_salary = COALESCE($6, max_salary),
            salary_currency = COALESCE($7, salary_currency),
            country = COALESCE($8, country),
            location = COALESCE($9, location),
            work_types = COALESCE($10, work_types),
            work_modes = COALESCE($11, work_modes),
            updated_at = NOW()
        WHERE id = $12
        "#
    )
    .bind(&payload.master_profile_cv)
    .bind(&payload.target_roles)
    .bind(payload.min_salary)
    .bind(&payload.dealbreakers)
    .bind(&payload.name)
    .bind(payload.max_salary)
    .bind(&payload.salary_currency)
    .bind(&payload.country)
    .bind(&payload.location)
    .bind(&payload.work_types)
    .bind(&payload.work_modes)
    .bind(current_user.id)
    .execute(&pool)
    .await?;

    Ok(Json(json!({ "status": "updated" })))
}

/// PDF→Markdown conversion — requires auth to prevent Gemini quota abuse (used during onboarding).
pub async fn convert_pdf_public(
    _current_user: CurrentUser,
    mut multipart: Multipart,
) -> ApiResult<serde_json::Value> {
    let mut pdf_bytes: Option<Vec<u8>> = None;

    while let Some(field) = multipart.next_field().await.map_err(|e| {
        AppError::Validation(format!("Failed to read upload: {}", e))
    })? {
        let name = field.name().unwrap_or("").to_string();
        if name == "file" {
            let content_type = field.content_type().unwrap_or("").to_string();
            if !content_type.contains("pdf") {
                return Err(AppError::Validation("Only PDF files are accepted".into()));
            }
            let data = field.bytes().await.map_err(|e| {
                AppError::Validation(format!("Failed to read file: {}", e))
            })?;
            if data.len() > 10 * 1024 * 1024 {
                return Err(AppError::Validation("File too large. Max 10MB.".into()));
            }
            pdf_bytes = Some(data.to_vec());
        }
    }

    let pdf_data = pdf_bytes.ok_or_else(|| AppError::Validation("No PDF file uploaded".into()))?;

    let ai_engine = AiEngine::new().map_err(|e| AppError::Internal(e.into()))?;
    let markdown = ai_engine.pdf_to_markdown(&pdf_data).await.map_err(|e| AppError::Internal(e.into()))?;

    Ok(Json(json!({
        "status": "converted",
        "markdown": markdown,
        "chars": markdown.len()
    })))
}

pub async fn upload_cv_pdf(
    State(pool): State<PgPool>,
    current_user: CurrentUser,
    mut multipart: Multipart,
) -> ApiResult<serde_json::Value> {
    let mut pdf_bytes: Option<Vec<u8>> = None;

    while let Some(field) = multipart.next_field().await.map_err(|e| {
        AppError::Validation(format!("Failed to read upload: {}", e))
    })? {
        let name = field.name().unwrap_or("").to_string();
        if name == "file" {
            let content_type = field.content_type().unwrap_or("").to_string();
            if !content_type.contains("pdf") {
                return Err(AppError::Validation("Only PDF files are accepted".into()));
            }
            let data = field.bytes().await.map_err(|e| {
                AppError::Validation(format!("Failed to read file: {}", e))
            })?;
            if data.len() > 10 * 1024 * 1024 {
                return Err(AppError::Validation("File too large. Max 10MB.".into()));
            }
            pdf_bytes = Some(data.to_vec());
        }
    }

    let pdf_data = pdf_bytes.ok_or_else(|| AppError::Validation("No PDF file uploaded".into()))?;

    // Hybrid conversion: pdf-extract → Gemini Flash formatting
    let ai_engine = AiEngine::new().map_err(|e| AppError::Internal(e.into()))?;
    let markdown = ai_engine.pdf_to_markdown(&pdf_data).await.map_err(|e| AppError::Internal(e.into()))?;

    // Save to user's master_profile_cv
    sqlx::query("UPDATE users SET master_profile_cv = $1, updated_at = NOW() WHERE id = $2")
        .bind(&markdown)
        .bind(current_user.id)
        .execute(&pool)
        .await?;

    Ok(Json(json!({
        "status": "converted",
        "markdown": markdown,
        "chars": markdown.len()
    })))
}

// ─── Pipeline status update ────────────────────────────────────────────────

#[derive(Debug, serde::Deserialize)]
pub struct UpdatePipelineStatusPayload {
    pub status: String,
    pub notes: Option<String>,
}

pub async fn update_pipeline_status(
    State(pool): State<PgPool>,
    current_user: CurrentUser,
    Path(id): Path<uuid::Uuid>,
    Json(payload): Json<UpdatePipelineStatusPayload>,
) -> ApiResult<serde_json::Value> {
    let valid = ["saved", "applied", "interview", "offer", "rejected"];
    if !valid.contains(&payload.status.as_str()) {
        return Err(AppError::Validation(format!("Invalid status: {}", payload.status)));
    }
    sqlx::query(
        "UPDATE applications SET status = $1::application_status, notes = COALESCE($2, notes), updated_at = NOW() WHERE id = $3 AND user_id = $4"
    )
    .bind(&payload.status)
    .bind(&payload.notes)
    .bind(id)
    .bind(current_user.id)
    .execute(&pool)
    .await?;

    Ok(Json(json!({ "status": "updated" })))
}

// ─── Job Search (Adzuna + Jooble) ─────────────────────────────────────────

pub async fn search_jobs(
    State(pool): State<PgPool>,
    current_user: CurrentUser,
    axum::extract::Query(params): axum::extract::Query<std::collections::HashMap<String, String>>,
) -> ApiResult<serde_json::Value> {
    // Rate limit: 1 external search per 30 seconds per user (protects Adzuna/Jooble quotas).
    let last_search: Option<chrono::DateTime<chrono::Utc>> = sqlx::query_scalar(
        "SELECT last_search_at FROM users WHERE id = $1"
    )
    .bind(current_user.id)
    .fetch_optional(&pool)
    .await
    .unwrap_or(None)
    .flatten();

    if let Some(last) = last_search {
        let elapsed = chrono::Utc::now().signed_duration_since(last);
        let cooldown = chrono::TimeDelta::seconds(30);
        if elapsed < cooldown {
            let remaining = (cooldown - elapsed).num_seconds().max(0);
            return Err(AppError::TooManyRequests(format!(
                "Search rate limit: 1 search per 30 seconds. Retry in {} seconds.",
                remaining
            )));
        }
    }

    // Update last_search_at before hitting external APIs
    let _ = sqlx::query("UPDATE users SET last_search_at = NOW() WHERE id = $1")
        .bind(current_user.id)
        .execute(&pool)
        .await;

    let query = params.get("q").cloned().unwrap_or_default();
    let location = params.get("location").cloned().unwrap_or_default();
    let country = params.get("country").cloned().unwrap_or_else(|| "gb".to_string());
    let page = params.get("page").and_then(|p| p.parse::<u32>().ok()).unwrap_or(1);

    let adzuna_app_id = std::env::var("ADZUNA_APP_ID").unwrap_or_default();
    let adzuna_app_key = std::env::var("ADZUNA_APP_KEY").unwrap_or_default();
    let jooble_api_key = std::env::var("JOOBLE_API_KEY").unwrap_or_default();

    let client = reqwest::Client::new();
    let mut all_jobs: Vec<serde_json::Value> = Vec::new();
    let mut sources_used: Vec<String> = Vec::new();

    // ── Adzuna ──────────────────────────────────────────────────────────────
    if !adzuna_app_id.is_empty() && !adzuna_app_key.is_empty() {
        let cc = country.to_lowercase();
        let adzuna_country = match cc.as_str() {
            "in" => "in", "us" => "us", "au" => "au", "ca" => "ca",
            "de" => "de", "fr" => "fr", "nl" => "nl", "sg" => "sg", _ => "gb",
        };
        let adzuna_url = format!(
            "https://api.adzuna.com/v1/api/jobs/{}/search/{}?app_id={}&app_key={}&results_per_page=20&what={}&where={}&content-type=application/json",
            adzuna_country, page, adzuna_app_id, adzuna_app_key,
            urlencoding::encode(&query), urlencoding::encode(&location)
        );
        if let Ok(res) = client.get(&adzuna_url).timeout(std::time::Duration::from_secs(10)).send().await {
            if let Ok(data) = res.json::<serde_json::Value>().await {
                if let Some(results) = data["results"].as_array() {
                    for job in results {
                        all_jobs.push(json!({
                            "source": "Adzuna",
                            "id": job["id"],
                            "title": job["title"],
                            "company": job["company"]["display_name"],
                            "location": job["location"]["display_name"],
                            "salary_min": job["salary_min"],
                            "salary_max": job["salary_max"],
                            "description": job["description"],
                            "url": job["redirect_url"],
                            "created": job["created"],
                            "contract_type": job["contract_type"],
                        }));
                    }
                    sources_used.push("Adzuna".to_string());
                }
            }
        }
    }

    // ── Jooble ──────────────────────────────────────────────────────────────
    if !jooble_api_key.is_empty() {
        let jooble_url = format!("https://jooble.org/api/{}", jooble_api_key);
        let jooble_body = json!({ "keywords": query, "location": location, "page": page, "resultonpage": 20 });
        if let Ok(res) = client.post(&jooble_url).json(&jooble_body).timeout(std::time::Duration::from_secs(10)).send().await {
            if let Ok(data) = res.json::<serde_json::Value>().await {
                if let Some(jobs) = data["jobs"].as_array() {
                    for job in jobs {
                        all_jobs.push(json!({
                            "source": "Jooble",
                            "id": job["id"],
                            "title": job["title"],
                            "company": job["company"],
                            "location": job["location"],
                            "salary_min": null,
                            "salary_max": null,
                            "salary_display": job["salary"],
                            "description": job["snippet"],
                            "url": job["link"],
                            "created": job["updated"],
                            "contract_type": job["type"],
                        }));
                    }
                    sources_used.push("Jooble".to_string());
                }
            }
        }
    }

    let has_api_keys = !adzuna_app_id.is_empty() || !jooble_api_key.is_empty();
    Ok(Json(json!({
        "jobs": all_jobs,
        "total": all_jobs.len(),
        "sources": sources_used,
        "page": page,
        "query": query,
        "location": location,
        "has_api_keys": has_api_keys,
    })))
}

// ─── ATS Portal Search (Greenhouse / Lever / Ashby) ────────────────────────

/// Well-known companies and their ATS slug + provider
static PORTAL_COMPANIES: &[(&str, &str, &str)] = &[
    // (display_name, ats_slug, provider: "greenhouse"|"lever"|"ashby")
    ("Stripe",              "stripe",               "greenhouse"),
    ("Notion",              "notion",               "greenhouse"),
    ("Linear",              "linear",               "greenhouse"),
    ("Figma",               "figma",                "greenhouse"),
    ("Vercel",              "vercel",               "greenhouse"),
    ("Supabase",            "supabase",             "greenhouse"),
    ("Databricks",          "databricks",           "greenhouse"),
    ("Anthropic",           "anthropic",            "greenhouse"),
    ("OpenAI",              "openai",               "greenhouse"),
    ("Hugging Face",        "huggingface",          "greenhouse"),
    ("Scale AI",            "scaleai",              "greenhouse"),
    ("Cohere",              "cohere",               "greenhouse"),
    ("Mistral AI",          "mistral",              "greenhouse"),
    ("Weights & Biases",    "wandb",                "greenhouse"),
    ("Modal",               "modal",                "greenhouse"),
    ("Temporal",            "temporal",             "greenhouse"),
    ("PlanetScale",         "planetscale",          "greenhouse"),
    ("Hashicorp",           "hashicorp",            "greenhouse"),
    ("Cloudflare",          "cloudflare",           "greenhouse"),
    ("Twilio",              "twilio",               "greenhouse"),
    ("Segment",             "segment",              "greenhouse"),
    ("Brex",                "brex",                 "lever"),
    ("Rippling",            "rippling",             "lever"),
    ("Retool",              "retool",               "lever"),
    ("Plaid",               "plaid",                "lever"),
    ("Carta",               "carta",                "lever"),
    ("Mercury",             "mercury",              "lever"),
    ("Loom",                "loom",                 "lever"),
    ("Benchling",           "benchling",            "lever"),
    ("Airtable",            "airtable",             "lever"),
    ("Lattice",             "lattice",              "lever"),
    ("Amplitude",           "amplitude",            "lever"),
    ("Intercom",            "intercom",             "lever"),
    ("Figma",               "figma",                "lever"),
    ("Podium",              "podium",               "lever"),
    ("LaunchDarkly",        "launchdarkly",         "lever"),
    ("Replit",              "replit",               "lever"),
    ("Ramp",                "ramp",                 "lever"),
    ("Checkr",              "checkr",               "lever"),
    ("Faire",               "faire",                "lever"),
    ("Sourcegraph",         "sourcegraph",          "greenhouse"),
    ("Turso",               "turso",                "ashby"),
    ("Resend",              "resend",               "ashby"),
    ("Cal.com",             "calcom",               "ashby"),
    ("Raycast",             "raycast",              "ashby"),
    ("Zed Industries",      "zed",                  "ashby"),
    ("Deno",                "deno",                 "ashby"),
    ("Oxide Computer",      "oxide",                "ashby"),
    ("Prisma",              "prisma",               "ashby"),
    ("Infisical",           "infisical",            "ashby"),
    ("Neon",                "neon",                 "ashby"),
];

pub async fn search_ats_portals(
    _current_user: CurrentUser,
    axum::extract::Query(params): axum::extract::Query<std::collections::HashMap<String, String>>,
) -> ApiResult<serde_json::Value> {
    let query = params.get("q").cloned().unwrap_or_default().to_lowercase();
    let company_filter = params.get("company").cloned().unwrap_or_default().to_lowercase();

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(8))
        .user_agent("Mozilla/5.0 Career-Dude Job Scanner")
        .build()
        .unwrap_or_default();

    let mut matching_jobs: Vec<serde_json::Value> = Vec::new();

    // Select companies: if company_filter set, filter to that company; else search all
    let companies: Vec<_> = PORTAL_COMPANIES.iter()
        .filter(|(name, slug, _)| {
            if company_filter.is_empty() { true }
            else { name.to_lowercase().contains(&company_filter) || slug.contains(&company_filter) }
        })
        .collect();

    // Limit to 15 companies per search to avoid timeout
    let companies_to_check = &companies[..companies.len().min(15)];

    let mut fetch_futures = Vec::new();
    for (name, slug, provider) in companies_to_check {
        let client = client.clone();
        let name = name.to_string();
        let slug = slug.to_string();
        let provider = provider.to_string();
        let query = query.clone();
        fetch_futures.push(tokio::spawn(async move {
            fetch_ats_jobs(&client, &name, &slug, &provider, &query).await
        }));
    }

    for handle in fetch_futures {
        if let Ok(Ok(jobs)) = handle.await {
            matching_jobs.extend(jobs);
        }
    }

    // Sort: exact query matches first
    if !query.is_empty() {
        matching_jobs.sort_by(|a, b| {
            let a_score = score_job_relevance(a, &query);
            let b_score = score_job_relevance(b, &query);
            b_score.partial_cmp(&a_score).unwrap_or(std::cmp::Ordering::Equal)
        });
    }

    let total = matching_jobs.len();
    Ok(Json(json!({
        "jobs": matching_jobs,
        "total": total,
        "source": "ats-portals",
    })))
}

fn score_job_relevance(job: &serde_json::Value, query: &str) -> f32 {
    let title = job["title"].as_str().unwrap_or("").to_lowercase();
    let mut score: f32 = 0.0;
    for word in query.split_whitespace() {
        if title.contains(word) { score += 2.0; }
    }
    if title.contains(query) { score += 5.0; }
    score
}

async fn fetch_ats_jobs(
    client: &reqwest::Client,
    company: &str,
    slug: &str,
    provider: &str,
    query: &str,
) -> anyhow::Result<Vec<serde_json::Value>> {
    match provider {
        "greenhouse" => fetch_greenhouse(client, company, slug, query).await,
        "lever"      => fetch_lever(client, company, slug, query).await,
        "ashby"      => fetch_ashby(client, company, slug, query).await,
        _            => Ok(vec![]),
    }
}

async fn fetch_greenhouse(
    client: &reqwest::Client,
    company: &str,
    slug: &str,
    query: &str,
) -> anyhow::Result<Vec<serde_json::Value>> {
    let url = format!("https://boards-api.greenhouse.io/v1/boards/{}/jobs?content=false", slug);
    let res = client.get(&url).send().await?;
    if !res.status().is_success() { return Ok(vec![]); }
    let data: serde_json::Value = res.json().await?;
    let jobs = data["jobs"].as_array().cloned().unwrap_or_default();
    let q = query.to_lowercase();
    Ok(jobs.into_iter()
        .filter(|j| {
            if q.is_empty() { return true; }
            let title = j["title"].as_str().unwrap_or("").to_lowercase();
            title.contains(&q) || q.split_whitespace().any(|w| title.contains(w))
        })
        .map(|j| {
            let job_url = j["absolute_url"].as_str().unwrap_or("").to_string();
            json!({
                "source": "Greenhouse",
                "id": j["id"],
                "title": j["title"],
                "company": company,
                "location": j["location"]["name"],
                "url": job_url,
                "updated_at": j["updated_at"],
                "salary_min": null,
                "salary_max": null,
                "description": "",
                "contract_type": "",
            })
        })
        .take(5)
        .collect())
}

async fn fetch_lever(
    client: &reqwest::Client,
    company: &str,
    slug: &str,
    query: &str,
) -> anyhow::Result<Vec<serde_json::Value>> {
    let url = format!("https://api.lever.co/v0/postings/{}?mode=json&limit=50", slug);
    let res = client.get(&url).send().await?;
    if !res.status().is_success() { return Ok(vec![]); }
    let jobs: Vec<serde_json::Value> = res.json().await.unwrap_or_default();
    let q = query.to_lowercase();
    Ok(jobs.into_iter()
        .filter(|j| {
            if q.is_empty() { return true; }
            let title = j["text"].as_str().unwrap_or("").to_lowercase();
            title.contains(&q) || q.split_whitespace().any(|w| title.contains(w))
        })
        .map(|j| {
            let job_url = j["hostedUrl"].as_str().unwrap_or("").to_string();
            let location = j["categories"]["location"].as_str()
                .or_else(|| j["workplaceType"].as_str())
                .unwrap_or("").to_string();
            let commitment = j["categories"]["commitment"].as_str().unwrap_or("").to_string();
            json!({
                "source": "Lever",
                "id": j["id"],
                "title": j["text"],
                "company": company,
                "location": location,
                "url": job_url,
                "updated_at": null,
                "salary_min": null,
                "salary_max": null,
                "description": j["descriptionPlain"].as_str().unwrap_or("").chars().take(400).collect::<String>(),
                "contract_type": commitment,
            })
        })
        .take(5)
        .collect())
}

async fn fetch_ashby(
    client: &reqwest::Client,
    company: &str,
    slug: &str,
    query: &str,
) -> anyhow::Result<Vec<serde_json::Value>> {
    // Ashby has a public JSON endpoint
    let url = format!("https://api.ashbyhq.com/posting-api/job-board/{}", slug);
    let res = client.get(&url).send().await?;
    if !res.status().is_success() { return Ok(vec![]); }
    let data: serde_json::Value = res.json().await?;
    let jobs = data["jobs"].as_array().cloned().unwrap_or_default();
    let q = query.to_lowercase();
    Ok(jobs.into_iter()
        .filter(|j| {
            if q.is_empty() { return true; }
            let title = j["title"].as_str().unwrap_or("").to_lowercase();
            title.contains(&q) || q.split_whitespace().any(|w| title.contains(w))
        })
        .map(|j| {
            let job_url = j["jobUrl"].as_str().unwrap_or("").to_string();
            let location = j["location"].as_str().unwrap_or("").to_string();
            json!({
                "source": "Ashby",
                "id": j["id"],
                "title": j["title"],
                "company": company,
                "location": location,
                "url": job_url,
                "updated_at": null,
                "salary_min": j["compensation"]["minValue"].as_f64().map(|v| v as i64),
                "salary_max": j["compensation"]["maxValue"].as_f64().map(|v| v as i64),
                "description": j["descriptionHtml"].as_str().unwrap_or("").chars().take(400).collect::<String>(),
                "contract_type": j["employmentType"].as_str().unwrap_or(""),
            })
        })
        .take(5)
        .collect())
}

// ─── Employer Mode Handlers ────────────────────────────────────────────────

#[derive(Debug, serde::Deserialize)]
pub struct EmployerScreenCvRequest {
    pub job_description: String,
    pub candidate_cv: String,
    pub candidate_name: Option<String>,
}

#[derive(Debug, serde::Deserialize)]
pub struct EmployerGenerateJdRequest {
    pub role_title: String,
    pub company: Option<String>,
    pub requirements: Option<String>,
    pub seniority: Option<String>,
    pub work_mode: Option<String>,
    pub salary_range: Option<String>,
}

#[derive(Debug, serde::Deserialize)]
pub struct EmployerInterviewQuestionsRequest {
    pub job_description: String,
    pub seniority: Option<String>,
    pub focus_areas: Option<Vec<String>>,
}

#[derive(Debug, serde::Deserialize, serde::Serialize, Clone)]
pub struct CandidateInput {
    pub name: String,
    pub cv: String,
}

#[derive(Debug, serde::Deserialize)]
pub struct EmployerScoreCandidatesRequest {
    pub job_description: String,
    pub candidates: Vec<CandidateInput>,
}

pub async fn employer_screen_cv(
    State(pool): State<PgPool>,
    current_user: CurrentUser,
    Json(payload): Json<EmployerScreenCvRequest>,
) -> ApiResult<serde_json::Value> {
    // Check credits before the AI call (read-only, no transaction).
    let credits: i32 = sqlx::query_scalar("SELECT ai_credits_balance FROM users WHERE id = $1")
        .bind(current_user.id).fetch_one(&pool).await?;
    if credits < 1 { return Err(AppError::Validation("Insufficient AI credits".into())); }

    let ai_engine = AiEngine::new().map_err(|e| AppError::Internal(e.into()))?;
    let name = payload.candidate_name.as_deref().unwrap_or("Candidate");
    let report = ai_engine.employer_screen_cv(&payload.job_description, &payload.candidate_cv, name)
        .await.map_err(|e| AppError::Internal(e.into()))?;

    // Deduct credit only after successful AI response.
    let mut tx = pool.begin().await?;
    sqlx::query("UPDATE users SET ai_credits_balance = ai_credits_balance - 1 WHERE id = $1 AND ai_credits_balance > 0")
        .bind(current_user.id).execute(&mut *tx).await?;
    tx.commit().await?;

    Ok(Json(json!({ "candidate": name, "report": report })))
}

pub async fn employer_generate_jd(
    State(pool): State<PgPool>,
    current_user: CurrentUser,
    Json(payload): Json<EmployerGenerateJdRequest>,
) -> ApiResult<serde_json::Value> {
    let credits: i32 = sqlx::query_scalar("SELECT ai_credits_balance FROM users WHERE id = $1")
        .bind(current_user.id).fetch_one(&pool).await?;
    if credits < 1 { return Err(AppError::Validation("Insufficient AI credits".into())); }
    sqlx::query("UPDATE users SET ai_credits_balance = ai_credits_balance - 1 WHERE id = $1")
        .bind(current_user.id).execute(&pool).await?;

    let ai_engine = AiEngine::new().map_err(|e| AppError::Internal(e.into()))?;
    let jd = ai_engine.employer_generate_jd(
        &payload.role_title,
        payload.company.as_deref().unwrap_or(""),
        payload.requirements.as_deref().unwrap_or(""),
        payload.seniority.as_deref().unwrap_or("Mid-level"),
        payload.work_mode.as_deref().unwrap_or(""),
        payload.salary_range.as_deref().unwrap_or(""),
    ).await.map_err(|e| AppError::Internal(e.into()))?;
    Ok(Json(json!({ "job_description": jd })))
}

pub async fn employer_interview_questions(
    State(pool): State<PgPool>,
    current_user: CurrentUser,
    Json(payload): Json<EmployerInterviewQuestionsRequest>,
) -> ApiResult<serde_json::Value> {
    let credits: i32 = sqlx::query_scalar("SELECT ai_credits_balance FROM users WHERE id = $1")
        .bind(current_user.id).fetch_one(&pool).await?;
    if credits < 1 { return Err(AppError::Validation("Insufficient AI credits".into())); }
    sqlx::query("UPDATE users SET ai_credits_balance = ai_credits_balance - 1 WHERE id = $1")
        .bind(current_user.id).execute(&pool).await?;

    let ai_engine = AiEngine::new().map_err(|e| AppError::Internal(e.into()))?;
    let focus = payload.focus_areas.as_deref().unwrap_or(&[]).join(", ");
    let questions = ai_engine.employer_interview_questions(
        &payload.job_description,
        payload.seniority.as_deref().unwrap_or("Mid-level"),
        &focus,
    ).await.map_err(|e| AppError::Internal(e.into()))?;
    Ok(Json(json!({ "questions": questions })))
}

pub async fn employer_score_candidates(
    State(pool): State<PgPool>,
    current_user: CurrentUser,
    Json(payload): Json<EmployerScoreCandidatesRequest>,
) -> ApiResult<serde_json::Value> {
    let n = payload.candidates.len() as i32;
    if n == 0 || n > 10 { return Err(AppError::Validation("Provide 1–10 candidates".into())); }
    let credits: i32 = sqlx::query_scalar("SELECT ai_credits_balance FROM users WHERE id = $1")
        .bind(current_user.id).fetch_one(&pool).await?;
    if credits < n { return Err(AppError::Validation(format!("Need {} credits for {} candidates", n, n))); }
    sqlx::query("UPDATE users SET ai_credits_balance = ai_credits_balance - $1 WHERE id = $2")
        .bind(n).bind(current_user.id).execute(&pool).await?;

    let engine = std::sync::Arc::new(AiEngine::new().map_err(|e| AppError::Internal(e.into()))?);
    let jd = payload.job_description.clone();
    let mut handles = Vec::new();
    for candidate in payload.candidates.clone() {
        let eng = engine.clone();
        let jd2 = jd.clone();
        handles.push(tokio::spawn(async move {
            let result = eng.employer_screen_cv(&jd2, &candidate.cv, &candidate.name).await;
            (candidate.name, result)
        }));
    }

    let mut scored: Vec<serde_json::Value> = Vec::new();
    for handle in handles {
        if let Ok((name, Ok(report))) = handle.await {
            scored.push(json!({ "candidate": name, "report": report }));
        }
    }
    Ok(Json(json!({ "candidates": scored, "count": scored.len(), "credits_used": n })))
}

// ─── Smart Job Discovery ───────────────────────────────────────────────────

#[derive(Debug, serde::Deserialize)]
pub struct MarkSeenRequest {
    pub job_ids: Vec<uuid::Uuid>,
}

#[derive(Debug, serde::Deserialize)]
pub struct DiscoveredJobsQuery {
    pub unseen_only: Option<bool>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

/// Compute a stable dedup hash for a job: hash of lower(title + company + source)
fn job_dedup_hash(title: &str, company: &str, source: &str) -> String {
    // Use raw key string (not DefaultHasher — its output is NOT stable across Rust versions).
    // The DB UNIQUE constraint on job_hash handles dedup; the key just needs to be deterministic.
    // Truncate to 200 chars so the unique index stays compact.
    let key = format!("{}||{}||{}",
        title.to_lowercase().trim(),
        company.to_lowercase().trim(),
        source.to_lowercase().trim()
    );
    key.chars().take(200).collect()
}

/// Strip HTML tags from external job descriptions before storing.
/// Security: Adzuna/Jooble/ATS descriptions may contain arbitrary HTML.
/// Strip tags so stored text is safe even if ever rendered in a future detail view.
fn strip_html_tags(input: &str) -> String {
    // Lazy static is idiomatic but regex::Regex::new is cheap enough for one-off calls here.
    // Replace <...> tags with space, collapse multiple spaces, trim.
    let re = regex::Regex::new(r"<[^>]*>").unwrap();
    let stripped = re.replace_all(input, " ");
    // Collapse runs of whitespace
    let ws = regex::Regex::new(r"\s{2,}").unwrap();
    ws.replace_all(stripped.as_ref(), " ").trim().to_string()
}

/// Score a job 0..100 against user preferences.
///
/// Scoring:
/// ┌─────────────────────────────┬────────┐
/// │ Signal                      │ Weight │
/// ├─────────────────────────────┼────────┤
/// │ Title matches target_role   │  50pts │
/// │ Salary in user's range      │  25pts │
/// │ Location / remote match     │  15pts │
/// │ Source is known good ATS    │  10pts │
/// └─────────────────────────────┴────────┘
fn score_discovery_job(
    title: &str,
    location: &str,
    salary_min: Option<f64>,
    _salary_max: Option<f64>,
    source: &str,
    target_roles: &[String],
    user_salary_min: Option<i32>,
    user_salary_max: Option<i32>,
    user_location: &str,
) -> i32 {
    let title_lower = title.to_lowercase();
    let location_lower = location.to_lowercase();
    let user_loc_lower = user_location.to_lowercase();

    // Title match: 50pts
    let title_score = if target_roles.is_empty() {
        25 // no preferences → neutral
    } else {
        let matched = target_roles.iter().any(|role| {
            let r = role.to_lowercase();
            title_lower.contains(&r) || r.contains(&title_lower)
                || r.split_whitespace().any(|w| title_lower.contains(w))
        });
        if matched { 50 } else { 0 }
    };

    // Salary match: 25pts
    let salary_score = match (salary_min, user_salary_min, user_salary_max) {
        (Some(job_sal), Some(u_min), Some(u_max)) => {
            let mid = (u_min + u_max) as f64 / 2.0;
            if job_sal >= u_min as f64 { 25 }
            else if job_sal >= mid * 0.8 { 15 }
            else { 0 }
        }
        (Some(job_sal), Some(u_min), None) => {
            if job_sal >= u_min as f64 { 25 } else { 10 }
        }
        _ => 12, // unknown salary → half credit
    };

    // Location: 15pts
    let loc_score = if location_lower.contains("remote") || title_lower.contains("remote") {
        15 // remote matches everyone
    } else if user_loc_lower.is_empty() {
        8
    } else if location_lower.contains(&user_loc_lower) || user_loc_lower.contains(&location_lower) {
        15
    } else {
        3
    };

    // Source bonus: 10pts for known curated ATS
    let source_score = match source {
        "Greenhouse" | "Lever" | "Ashby" => 10,
        "Adzuna" | "Jooble" => 8,
        _ => 5,
    };

    (title_score + salary_score + loc_score + source_score).min(100)
}

/// POST /api/v1/jobs/discover — trigger on-demand discovery scan
pub async fn trigger_discovery_scan(
    State(pool): State<PgPool>,
    current_user: CurrentUser,
) -> ApiResult<serde_json::Value> {
    // 1. Cooldown check: enforce 1-hour minimum between scans
    let last_scan: Option<chrono::DateTime<chrono::Utc>> = sqlx::query_scalar(
        "SELECT last_discovery_scan_at FROM users WHERE id = $1"
    )
    .bind(current_user.id)
    .fetch_optional(&pool)
    .await?
    .flatten();

    if let Some(last) = last_scan {
        let elapsed = chrono::Utc::now().signed_duration_since(last);
        if elapsed.num_seconds() < 3600 {
            let remaining = 3600 - elapsed.num_seconds();
            return Err(AppError::TooManyRequests(format!(
                "Scan cooldown active. Next scan available in {} minutes.",
                remaining / 60 + 1
            )));
        }
    }

    // 2. Load user profile: target_roles, location, salary, country
    let profile = sqlx::query(
        "SELECT target_roles, country, location, min_salary, max_salary FROM users WHERE id = $1"
    )
    .bind(current_user.id)
    .fetch_one(&pool)
    .await?;

    let target_roles: Vec<String> = profile
        .try_get::<Option<serde_json::Value>, _>("target_roles")
        .unwrap_or(None)
        .and_then(|v| serde_json::from_value::<Vec<String>>(v).ok())
        .unwrap_or_default();

    let user_location = profile.try_get::<Option<String>, _>("location")
        .unwrap_or(None)
        .unwrap_or_default();
    let country = profile.try_get::<Option<String>, _>("country")
        .unwrap_or(None)
        .unwrap_or_else(|| "gb".to_string());
    let user_salary_min = profile.try_get::<Option<i32>, _>("min_salary").unwrap_or(None);
    let user_salary_max = profile.try_get::<Option<i32>, _>("max_salary").unwrap_or(None);

    // Build search query from first target role, or fallback
    let search_query = target_roles.first()
        .cloned()
        .unwrap_or_else(|| "software engineer".to_string());

    // 3. Fetch jobs from all sources in parallel
    let adzuna_app_id = std::env::var("ADZUNA_APP_ID").unwrap_or_default();
    let adzuna_app_key = std::env::var("ADZUNA_APP_KEY").unwrap_or_default();
    let jooble_api_key = std::env::var("JOOBLE_API_KEY").unwrap_or_default();

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .user_agent("Career-Dude Discovery Scanner/1.0")
        .build()
        .unwrap_or_default();

    let mut all_jobs: Vec<serde_json::Value> = Vec::new();

    // Adzuna fetch
    if !adzuna_app_id.is_empty() && !adzuna_app_key.is_empty() {
        let cc = country.to_lowercase();
        let adzuna_country = match cc.as_str() {
            "in" => "in", "us" => "us", "au" => "au", "ca" => "ca",
            "de" => "de", "fr" => "fr", _ => "gb",
        };
        let url = format!(
            "https://api.adzuna.com/v1/api/jobs/{}/search/1?app_id={}&app_key={}&results_per_page=20&what={}&content-type=application/json",
            adzuna_country, adzuna_app_id, adzuna_app_key,
            urlencoding::encode(&search_query)
        );
        if let Ok(res) = client.get(&url).send().await {
            if let Ok(data) = res.json::<serde_json::Value>().await {
                if let Some(results) = data["results"].as_array() {
                    for job in results {
                        all_jobs.push(json!({
                            "source": "Adzuna",
                            "title": job["title"].as_str().unwrap_or("").to_string(),
                            "company": job["company"]["display_name"].as_str().unwrap_or("").to_string(),
                            "location": job["location"]["display_name"].as_str().unwrap_or("").to_string(),
                            "salary_min": job["salary_min"].as_f64(),
                            "description": strip_html_tags(job["description"].as_str().unwrap_or("")).chars().take(500).collect::<String>(),
                            "url": job["redirect_url"].as_str().unwrap_or(""),
                        }));
                    }
                }
            }
        }
    }

    // Jooble fetch
    if !jooble_api_key.is_empty() {
        let url = format!("https://jooble.org/api/{}", jooble_api_key);
        let body = json!({ "keywords": search_query, "location": user_location, "resultonpage": 20 });
        if let Ok(res) = client.post(&url).json(&body).send().await {
            if let Ok(data) = res.json::<serde_json::Value>().await {
                if let Some(jobs) = data["jobs"].as_array() {
                    for job in jobs {
                        all_jobs.push(json!({
                            "source": "Jooble",
                            "title": job["title"].as_str().unwrap_or("").to_string(),
                            "company": job["company"].as_str().unwrap_or("").to_string(),
                            "location": job["location"].as_str().unwrap_or("").to_string(),
                            "salary_min": null,
                            "description": strip_html_tags(job["snippet"].as_str().unwrap_or("")).chars().take(500).collect::<String>(),
                            "url": job["link"].as_str().unwrap_or(""),
                        }));
                    }
                }
            }
        }
    }

    // ATS portal fetch (cap to 20 companies, use query filter)
    {
        let query_lower = search_query.to_lowercase();
        let portal_client = client.clone();
        let companies_to_check = &PORTAL_COMPANIES[..PORTAL_COMPANIES.len().min(20)];
        let mut portal_futures = Vec::new();
        for (name, slug, provider) in companies_to_check {
            let c = portal_client.clone();
            let n = name.to_string();
            let s = slug.to_string();
            let p = provider.to_string();
            let q = query_lower.clone();
            portal_futures.push(tokio::spawn(async move {
                fetch_ats_jobs(&c, &n, &s, &p, &q).await
            }));
        }
        for handle in portal_futures {
            if let Ok(Ok(jobs)) = handle.await {
                for job in jobs {
                    all_jobs.push(json!({
                        "source": job["source"].as_str().unwrap_or("ATS"),
                        "title": job["title"].as_str().unwrap_or(""),
                        "company": job["company"].as_str().unwrap_or(""),
                        "location": job["location"].as_str().unwrap_or(""),
                        "salary_min": null,
                        "description": strip_html_tags(job.get("snippet").and_then(|s| s.as_str()).unwrap_or("")).chars().take(500).collect::<String>(),
                        "url": job["url"].as_str().unwrap_or(""),
                    }));
                }
            }
        }
    }

    // 3b. Scrapling sidecar (optional enrichment — RemoteOK, WWR, HN, Arbeitnow, etc.)
    let scraping_url = std::env::var("SCRAPING_SERVICE_URL").unwrap_or_default();
    let scraping_key = std::env::var("SCRAPING_SERVICE_KEY").unwrap_or_default();
    if !scraping_url.is_empty() {
        let sidecar_url = format!("{}/jobs/scrape", scraping_url.trim_end_matches('/'));
        let mut req = client.post(&sidecar_url)
            .json(&json!({
                "query": search_query,
                "location": user_location,
                "max_per_source": 20
            }));
        if !scraping_key.is_empty() {
            req = req.header("X-API-Key", &scraping_key);
        }
        if let Ok(res) = req.send().await {
            if let Ok(data) = res.json::<serde_json::Value>().await {
                if let Some(jobs) = data["jobs"].as_array() {
                    for job in jobs {
                        all_jobs.push(json!({
                            "source": job["source"].as_str().unwrap_or("Scrapling"),
                            "title": job["title"].as_str().unwrap_or(""),
                            "company": job["company"].as_str().unwrap_or(""),
                            "location": job["location"].as_str().unwrap_or(""),
                            "salary_min": job["salary_min"].as_f64(),
                            "description": strip_html_tags(job["description"].as_str().unwrap_or("")).chars().take(500).collect::<String>(),
                            "url": job["url"].as_str().unwrap_or(""),
                        }));
                    }
                    tracing::info!("Scrapling sidecar: {} jobs added", jobs.len());
                }
            }
        } else {
            tracing::warn!("Scrapling sidecar unreachable at {} — skipping", sidecar_url);
        }
    }

    // 4. Score + dedup-insert each job
    let mut new_count: i64 = 0;

    for job in &all_jobs {
        let title   = job["title"].as_str().unwrap_or("");
        let company = job["company"].as_str().unwrap_or("");
        let source  = job["source"].as_str().unwrap_or("");
        let location = job["location"].as_str().unwrap_or("");
        let salary_min = job["salary_min"].as_f64();
        let url     = job["url"].as_str().unwrap_or("");
        let desc    = job["description"].as_str().unwrap_or("");

        if title.is_empty() || company.is_empty() { continue; }

        let hash = job_dedup_hash(title, company, source);
        let score = score_discovery_job(
            title, location, salary_min, None, source,
            &target_roles, user_salary_min, user_salary_max, &user_location,
        );

        // Skip if URL already exists (secondary dedup)
        if !url.is_empty() {
            let url_exists: bool = sqlx::query_scalar(
                "SELECT EXISTS(SELECT 1 FROM discovered_jobs WHERE user_id = $1 AND apply_url = $2)"
            )
            .bind(current_user.id)
            .bind(url)
            .fetch_one(&pool)
            .await
            .unwrap_or(false);
            if url_exists { continue; }
        }

        let result = sqlx::query(
            r#"INSERT INTO discovered_jobs
               (user_id, job_hash, apply_url, title, company, location, description, source, keyword_score)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
               ON CONFLICT (user_id, job_hash) DO NOTHING"#
        )
        .bind(current_user.id)
        .bind(&hash)
        .bind(if url.is_empty() { None } else { Some(url) })
        .bind(title)
        .bind(company)
        .bind(location)
        .bind(desc)
        .bind(source)
        .bind(score)
        .execute(&pool)
        .await;

        if let Ok(r) = result {
            if r.rows_affected() > 0 {
                new_count += 1;
            }
        }
    }

    // 5. Update last scan timestamp
    sqlx::query("UPDATE users SET last_discovery_scan_at = now() WHERE id = $1")
        .bind(current_user.id)
        .execute(&pool)
        .await?;

    let total_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM discovered_jobs WHERE user_id = $1 AND dismissed = false"
    )
    .bind(current_user.id)
    .fetch_one(&pool)
    .await
    .unwrap_or(0);

    let unseen_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM discovered_jobs WHERE user_id = $1 AND seen_by_user = false AND dismissed = false"
    )
    .bind(current_user.id)
    .fetch_one(&pool)
    .await
    .unwrap_or(0);

    let has_api_keys = !adzuna_app_id.is_empty() || !adzuna_app_key.is_empty() || !jooble_api_key.is_empty();
    Ok(Json(json!({
        "new_count": new_count,
        "total_count": total_count,
        "unseen_count": unseen_count,
        "last_scanned_at": chrono::Utc::now(),
        "cooldown_until": chrono::Utc::now() + chrono::TimeDelta::hours(1),
        "has_api_keys": has_api_keys,
    })))
}

/// GET /api/v1/jobs/discovered — paginated discovery feed
pub async fn get_discovered_jobs(
    State(pool): State<PgPool>,
    current_user: CurrentUser,
    axum::extract::Query(params): axum::extract::Query<std::collections::HashMap<String, String>>,
) -> ApiResult<serde_json::Value> {
    let unseen_only = params.get("unseen_only").map(|v| v == "true").unwrap_or(false);
    let limit: i64 = params.get("limit").and_then(|v| v.parse().ok()).unwrap_or(20).min(50);
    let offset: i64 = params.get("offset").and_then(|v| v.parse().ok()).unwrap_or(0);

    let rows = if unseen_only {
        sqlx::query(
            "SELECT id, title, company, location, source, apply_url, keyword_score, gemini_score, discovered_at, seen_by_user
             FROM discovered_jobs
             WHERE user_id = $1 AND seen_by_user = false AND dismissed = false
             ORDER BY keyword_score DESC, discovered_at DESC
             LIMIT $2 OFFSET $3"
        )
        .bind(current_user.id).bind(limit).bind(offset)
        .fetch_all(&pool).await?
    } else {
        sqlx::query(
            "SELECT id, title, company, location, source, apply_url, keyword_score, gemini_score, discovered_at, seen_by_user
             FROM discovered_jobs
             WHERE user_id = $1 AND dismissed = false
             ORDER BY keyword_score DESC, discovered_at DESC
             LIMIT $2 OFFSET $3"
        )
        .bind(current_user.id).bind(limit).bind(offset)
        .fetch_all(&pool).await?
    };

    let jobs: Vec<serde_json::Value> = rows.iter().map(|r| json!({
        "id": r.try_get::<uuid::Uuid, _>("id").unwrap_or_default(),
        "title": r.try_get::<Option<String>, _>("title").unwrap_or(None),
        "company": r.try_get::<Option<String>, _>("company").unwrap_or(None),
        "location": r.try_get::<Option<String>, _>("location").unwrap_or(None),
        "source": r.try_get::<Option<String>, _>("source").unwrap_or(None),
        "url": r.try_get::<Option<String>, _>("apply_url").unwrap_or(None),
        "keyword_score": r.try_get::<i32, _>("keyword_score").unwrap_or(0),
        "gemini_score": r.try_get::<Option<i32>, _>("gemini_score").unwrap_or(None),
        "discovered_at": r.try_get::<chrono::DateTime<chrono::Utc>, _>("discovered_at").ok(),
        "seen": r.try_get::<bool, _>("seen_by_user").unwrap_or(false),
    })).collect();

    let total: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM discovered_jobs WHERE user_id = $1 AND dismissed = false"
    )
    .bind(current_user.id).fetch_one(&pool).await.unwrap_or(0);

    let unseen: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM discovered_jobs WHERE user_id = $1 AND seen_by_user = false AND dismissed = false"
    )
    .bind(current_user.id).fetch_one(&pool).await.unwrap_or(0);

    let last_scan: Option<chrono::DateTime<chrono::Utc>> = sqlx::query_scalar(
        "SELECT last_discovery_scan_at FROM users WHERE id = $1"
    )
    .bind(current_user.id).fetch_one(&pool).await.unwrap_or(None);

    Ok(Json(json!({
        "jobs": jobs,
        "total": total,
        "unseen": unseen,
        "last_scanned_at": last_scan,
    })))
}

/// PATCH /api/v1/jobs/discovered/seen — mark jobs as seen
pub async fn mark_discovered_seen(
    State(pool): State<PgPool>,
    current_user: CurrentUser,
    Json(payload): Json<MarkSeenRequest>,
) -> ApiResult<serde_json::Value> {
    if payload.job_ids.is_empty() {
        return Ok(Json(json!({ "updated": 0 })));
    }
    let result = sqlx::query(
        "UPDATE discovered_jobs SET seen_by_user = true WHERE user_id = $1 AND id = ANY($2)"
    )
    .bind(current_user.id)
    .bind(&payload.job_ids)
    .execute(&pool)
    .await?;

    Ok(Json(json!({ "updated": result.rows_affected() })))
}

/// PATCH /api/v1/jobs/discovered/:id/dismiss
pub async fn dismiss_discovered_job(
    State(pool): State<PgPool>,
    current_user: CurrentUser,
    Path(id): Path<uuid::Uuid>,
) -> ApiResult<serde_json::Value> {
    sqlx::query(
        "UPDATE discovered_jobs SET dismissed = true WHERE user_id = $1 AND id = $2"
    )
    .bind(current_user.id)
    .bind(id)
    .execute(&pool)
    .await?;
    Ok(Json(json!({ "ok": true })))
}
