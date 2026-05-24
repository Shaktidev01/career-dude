-- Add per-user search rate limit timestamp.
-- Checked in search_jobs handler: max 1 external API call per 30 seconds per user.
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_search_at TIMESTAMPTZ;
