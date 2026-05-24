# Career Dude — Smart Job Discovery: Implementation Plan
**Created:** 2026-05-19
**Skill:** /plan-eng-review
**Status:** APPROVED — ready to build

---

## Problem Statement
Career Dude has live job search (pull) but no discovery (push). Mid-career job seekers want to open the dashboard and see "3 new jobs matching your profile" without manually running searches every day.

## Decisions Made

| # | Decision | Choice |
|---|---|---|
| D1 | Scheduler | On-demand "Scan Now" button (V2: background scheduler) |
| D2 | Scoring | Keyword score default + optional Gemini "Deep Score" |
| D3 | Dedup | sha256(title+company+source) hash as primary, URL as secondary |
| D4 | Cooldown | 1-hour rate limit per user on scan endpoint |

---

## Architecture Overview

```
User clicks "Scan for new jobs"
           │
           ▼
POST /api/v1/jobs/discover
           │
    ┌──────┴──────┐
    │ Cooldown    │ last_scanned_at < 1h ago → 429
    │ Check       │
    └──────┬──────┘
           │
    ┌──────┴──────────────────────────────────────┐
    │ Fetch user profile: target_roles, location, │
    │ salary, country from users table            │
    └──────┬──────────────────────────────────────┘
           │
    ┌──────┴──────────────────────────────────────┐
    │ Parallel scan:                              │
    │  • Adzuna (target_roles as query)           │
    │  • Jooble (target_roles as query)           │
    │  • ATS portals top 20 (score_relevance)     │
    └──────┬──────────────────────────────────────┘
           │
    ┌──────┴──────────────────────────────────────┐
    │ Score each job:                             │
    │  keyword_score(job, profile) → 0..100       │
    │  (title overlap + salary fit + location)    │
    └──────┬──────────────────────────────────────┘
           │
    ┌──────┴──────────────────────────────────────┐
    │ Upsert to discovered_jobs                   │
    │  ON CONFLICT (user_id, job_hash) DO NOTHING │
    │  New jobs only. Mark old ones not new.      │
    └──────┬──────────────────────────────────────┘
           │
           ▼
    Return { new_count, total_count, last_scanned_at }

GET /api/v1/jobs/discovered
    Returns paginated list sorted by score DESC, discovered_at DESC
    Filter: ?unseen_only=true

PATCH /api/v1/jobs/discovered/seen
    Body: { job_ids: [uuid, ...] }
    Marks jobs as seen_by_user = true

Optional deep score:
POST /api/v1/jobs/discovered/deep-score
    Sends top 20 unseen jobs + user CV to Gemini Flash
    Updates gemini_score column
    Costs 1 AI credit
```

---

## Database Migration: `003_discovered_jobs.sql`

```sql
-- Add scan cooldown to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_discovery_scan_at TIMESTAMPTZ;

-- Discovered jobs feed
CREATE TABLE IF NOT EXISTS discovered_jobs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Dedup keys (D3: both hash + URL)
    job_hash        TEXT NOT NULL,  -- sha256(lower(title||company||source))
    apply_url       TEXT,           -- secondary dedup: skip re-insert if URL matches
    
    -- Job data
    title           TEXT,
    company         TEXT,
    location        TEXT,
    salary_min      NUMERIC,
    salary_max      NUMERIC,
    description     TEXT,
    source          TEXT,           -- Adzuna / Jooble / Greenhouse / Lever / Ashby
    
    -- Scoring (D2: keyword default, Gemini optional)
    keyword_score   INTEGER DEFAULT 0,  -- 0..100, computed server-side
    gemini_score    INTEGER,            -- null until deep-scored
    
    -- State
    discovered_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    seen_by_user    BOOLEAN NOT NULL DEFAULT false,
    dismissed       BOOLEAN NOT NULL DEFAULT false,
    
    CONSTRAINT uq_user_job_hash UNIQUE (user_id, job_hash)
);

CREATE INDEX idx_discovered_jobs_user_unseen
    ON discovered_jobs (user_id, discovered_at DESC)
    WHERE seen_by_user = false AND dismissed = false;

CREATE INDEX idx_discovered_jobs_user_score
    ON discovered_jobs (user_id, keyword_score DESC, discovered_at DESC);

-- Optional partial index on URL for secondary dedup check
CREATE INDEX idx_discovered_jobs_url
    ON discovered_jobs (user_id, apply_url)
    WHERE apply_url IS NOT NULL;
```

---

## New API Handlers (backend/src/api/handlers.rs)

### `POST /api/v1/jobs/discover`
```
1. Check cooldown: SELECT last_discovery_scan_at FROM users WHERE id = $1
   If < 1 hour ago → return 429 with { cooldown_remaining_secs }
2. Load profile: target_roles (JSON array), country, location, min_salary, max_salary
3. Build query string: first target_role or "software engineer" as fallback
4. Parallel fetch (tokio::try_join! or futures::join_all):
   - search_jobs_internal(query, location, country) → Vec<JobCandidate>
   - search_ats_portals_internal(query) → Vec<JobCandidate>  [cap 20 companies]
5. For each job:
   - Compute job_hash = sha256(title.to_lowercase() + company.to_lowercase() + source)
   - keyword_score = score_discovery_job(&job, &target_roles, &location, &salary_range)
   - Upsert: INSERT INTO discovered_jobs ... ON CONFLICT (user_id, job_hash) DO NOTHING
   - Secondary URL dedup: skip if apply_url already in discovered_jobs for user
6. UPDATE users SET last_discovery_scan_at = now() WHERE id = $1
7. Return { new_count, total_count, last_scanned_at, cooldown_until }
```

### `GET /api/v1/jobs/discovered`
```
Params: ?unseen_only=true&limit=20&offset=0
SELECT * FROM discovered_jobs
  WHERE user_id = $1
    AND dismissed = false
    AND ($2 = false OR seen_by_user = false)
  ORDER BY keyword_score DESC, discovered_at DESC
  LIMIT $3 OFFSET $4
```

### `PATCH /api/v1/jobs/discovered/seen`
```
Body: { job_ids: [uuid] }
UPDATE discovered_jobs SET seen_by_user = true
  WHERE user_id = $1 AND id = ANY($2)
```

### `PATCH /api/v1/jobs/discovered/:id/dismiss`
```
UPDATE discovered_jobs SET dismissed = true
  WHERE user_id = $1 AND id = $2
```

### `POST /api/v1/jobs/discovered/deep-score` (optional, credits)
```
1. Deduct 1 AI credit (same pattern as create_evaluation)
2. Fetch top 20 unseen, unscored jobs for user
3. Build batch prompt: "CV: {cv_snippet}. Rate each job 0-100 for fit..."
4. Call Gemini Flash (not Pro — cost control)
5. UPDATE discovered_jobs SET gemini_score = ... for each job
```

---

## Score Function: `score_discovery_job`

```rust
/// Returns 0..100 relevance score for a job against user preferences.
/// 
/// Scoring breakdown:
/// ┌─────────────────────────────┬────────┐
/// │ Signal                      │ Weight │
/// ├─────────────────────────────┼────────┤
/// │ Title matches target_role   │  50pts │
/// │ Salary in user's range      │  25pts │  
/// │ Location / remote match     │  15pts │
/// │ Work type match (remote etc)│  10pts │
/// └─────────────────────────────┴────────┘
fn score_discovery_job(
    title: &str,
    company: &str,
    salary_min: Option<f64>,
    salary_max: Option<f64>,
    location: &str,
    target_roles: &[String],
    user_salary_min: Option<i32>,
    user_salary_max: Option<i32>,
    user_location: &str,
) -> i32 { ... }
```

---

## Route Registration (backend/src/api/mod.rs)

Add to `protected_router()`:
```rust
.route("/jobs/discover", post(trigger_discovery_scan))
.route("/jobs/discovered", get(get_discovered_jobs))
.route("/jobs/discovered/seen", axum::routing::patch(mark_jobs_seen))
.route("/jobs/discovered/:id/dismiss", axum::routing::patch(dismiss_discovered_job))
.route("/jobs/discovered/deep-score", post(deep_score_discovered_jobs))
```

---

## Frontend: Dashboard Discovery Widget

**File:** `frontend/app/dashboard/page.tsx`

New "Smart Discovery" card:
```
┌─────────────────────────────────────────────┐
│ Smart Job Discovery                          │
│                                              │
│  🔵 12 new jobs since last scan              │
│  ───────────────────────────────────────     │
│  Senior Engineer · Stripe · $180k–220k   87 │
│  Staff SWE · Linear · Remote             81 │
│  Backend Engineer · Vercel · $160k+      74 │
│                                              │
│  [View All Jobs]  [Scan Now ▶]               │
│  Last scanned: 2h ago                        │
└─────────────────────────────────────────────┘
```

State:
- `discoveredJobs`: fetched from `GET /jobs/discovered?unseen_only=true&limit=3`
- `lastScanned`: shown as relative time
- `cooldownUntil`: disables scan button with countdown
- On "Scan Now": `POST /jobs/discover` → refetch list
- On "View All": link to `/scanner?tab=discovery`

---

## Edge Cases Covered

| Case | Handling |
|---|---|
| No API keys configured | `has_api_keys: false` in response, show setup prompt |
| User has no target_roles set | Fallback query: "software engineer" |
| Adzuna timeout (>10s) | `timeout(Duration::from_secs(10))` — partial results OK |
| Gemini down during deep-score | Return 503, refund AI credit |
| Duplicate job across Adzuna+Greenhouse | URL secondary dedup catches it |
| User spams scan button | 429 with `cooldown_remaining_secs` |
| Job description contains XSS | Strip HTML before storing in description column |

---

## NOT in Scope (V2)

- ⏳ Background auto-scheduler (tokio background loop or pg_cron)
- ⏳ Email notifications for new matches
- ⏳ Gemini semantic scoring as default (when API credits are monetized)
- ⏳ Custom company watchlist ("always scan Stripe even if no keyword match")

---

## Test Checklist (before shipping)

- [ ] POST /jobs/discover → returns `new_count` correctly
- [ ] Second POST within 1h → returns 429 with `cooldown_remaining_secs`
- [ ] Duplicate job across two scans → appears once in discovered_jobs
- [ ] GET /jobs/discovered?unseen_only=true → only unseen jobs
- [ ] PATCH /jobs/discovered/seen → seen_by_user flips to true
- [ ] Score function: exact title match → score > 70
- [ ] Score function: no target_roles set → fallback, no panic
- [ ] Deep-score: insufficient credits → 402, no DB change
- [ ] Deep-score: Gemini timeout → 503, credits refunded

---

## GSTACK REVIEW REPORT

**Architecture rating:** 8/10
**Biggest risks:**
1. Adzuna rate limit burns fast with multiple users — monitor monthly quota
2. HTML/script injection from job descriptions must be stripped before DB insert
3. target_roles being empty is a common new-user state — handle gracefully

**Approved.** Proceed to Gate 3 (/design-shotgun for the discovery UI) or skip to build.
