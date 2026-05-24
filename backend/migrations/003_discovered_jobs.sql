-- Migration 003: Smart Job Discovery
-- Adds discovered_jobs table and last_discovery_scan_at to users

-- Scan cooldown tracking on the user
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_discovery_scan_at TIMESTAMPTZ;

-- Discovered jobs feed
CREATE TABLE IF NOT EXISTS discovered_jobs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Dedup: hash is primary (stable across rescans), url is secondary
    job_hash        TEXT NOT NULL,   -- sha256(lower(title||company||source))
    apply_url       TEXT,            -- secondary dedup

    -- Job data
    title           TEXT,
    company         TEXT,
    location        TEXT,
    salary_min      NUMERIC,
    salary_max      NUMERIC,
    description     TEXT,
    source          TEXT,            -- Adzuna / Jooble / Greenhouse / Lever / Ashby

    -- Scoring
    keyword_score   INTEGER NOT NULL DEFAULT 0,  -- 0..100 keyword match
    gemini_score    INTEGER,                     -- null until deep-scored

    -- State
    discovered_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    seen_by_user    BOOLEAN NOT NULL DEFAULT false,
    dismissed       BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT uq_user_job_hash UNIQUE (user_id, job_hash)
);

-- Fast lookup: unseen jobs for a user, newest first
CREATE INDEX IF NOT EXISTS idx_discovered_unseen
    ON discovered_jobs (user_id, discovered_at DESC)
    WHERE seen_by_user = false AND dismissed = false;

-- Fast lookup: best matches for a user
CREATE INDEX IF NOT EXISTS idx_discovered_score
    ON discovered_jobs (user_id, keyword_score DESC, discovered_at DESC)
    WHERE dismissed = false;

-- Secondary URL dedup check
CREATE INDEX IF NOT EXISTS idx_discovered_url
    ON discovered_jobs (user_id, apply_url)
    WHERE apply_url IS NOT NULL;
