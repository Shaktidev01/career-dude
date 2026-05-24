use sqlx::PgPool;
use std::env;

pub async fn create_pool() -> anyhow::Result<PgPool> {
    let database_url = env::var("DATABASE_URL")
        .map_err(|e| anyhow::anyhow!("DATABASE_URL must be set: {}", e))?;
    let pool = sqlx::PgPool::connect(&database_url).await?;
    Ok(pool)
}
