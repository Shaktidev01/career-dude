# Career Dude — Project Context

## Stack
- **Backend**: Rust / Axum / SQLx / Supabase Postgres (direct port 5432)
- **Frontend**: Next.js 14 / NextAuth JWT / shadcn/ui / Tailwind CSS
- **AI**: Gemini 2.5 Flash (evaluations, screening, outreach) + Gemini 2.5 Pro (interview prep, career match)
- **Job APIs**: Adzuna + Jooble (live search) + Greenhouse/Lever/Ashby (portal scan)

## Project Layout
```
backend/src/
  api/handlers.rs     — all API handlers
  api/mod.rs          — route registration
  utils/ai_engine.rs  — Gemini AI calls + headless_chrome URL fetch
  models/             — DB types

frontend/app/
  dashboard/          — stats + quick actions
  evaluator/          — Career Ops A-G job evaluation
  pipeline/           — table-view application tracker
  scanner/            — live search (Adzuna/Jooble) + company portals (Greenhouse/Lever/Ashby)
  job-finder/         — 19 portal directory with saved searches
  career-match/       — CV vs archetype scoring with localStorage history
  employer/           — CV screener, JD generator, interview questions, batch scoring
  tracker/            — Kanban board (legacy, see pipeline for table view)
  resume-builder/     — ATS-optimized resume generator
  interview-prep/     — STAR+R interview prep
  outreach/           — networking outreach generator
  research/           — company research
  settings/           — profile, CV, salary, work preferences
  onboarding/         — multi-step onboarding with country/currency/work-type
```

## Key API Routes
- `POST /api/v1/evaluations` — job evaluation (URL or text)
- `GET  /api/v1/pipeline` — flat list of all applications
- `PATCH /api/v1/pipeline/:id/status` — update status
- `GET  /api/v1/jobs/search` — Adzuna + Jooble live search
- `GET  /api/v1/jobs/portals` — Greenhouse/Lever/Ashby portal search
- `POST /api/v1/career-match` — CV vs archetypes analysis
- `POST /api/v1/employer/*` — employer mode endpoints

## Dev Commands
```bash
# Backend
cd backend && cargo run

# Frontend
cd frontend && npm run dev

# claude-mem worker (persistent memory)
npx claude-mem start

# gstack skills
# /review, /cso, /investigate, /office-hours, /plan-eng-review etc.
```

## Workflow with Installed Plugins

### Before any feature work
Run `/plan-eng-review` for architecture review of the plan.
Run `/office-hours` for product/UX challenges.

### Before committing code
Run `/review` (gstack code audit) + `code-review` plugin active.
Run `/cso` for any auth/API/security changes (security-guidance plugin also active).

### Frontend changes
`frontend-design` plugin active — flags accessibility, responsive, component quality issues.
Run `/design-review` for visual + UX audit.

### Production deployments
Run `/careful` before risky changes (DB migrations, auth changes).
Run `/health` after deploy.
Run `/retro` after each sprint.

## Environment Variables (backend .env)
```
DATABASE_URL=postgresql://...
GEMINI_API_KEY=...
JWT_SECRET=...
NEXTAUTH_SECRET=...
ADZUNA_APP_ID=     # free: adzuna.com/developer
ADZUNA_APP_KEY=    # free: adzuna.com/developer
JOOBLE_API_KEY=    # free: jooble.org/api/about
```

## DB Migrations (run on Supabase SQL editor)
- `001_initial.sql` — base schema
- `002_profile_location.sql` — country, location, work_types, work_modes, salary fields

## headless_chrome
`extract_job_from_url` in ai_engine.rs:
1. Try reqwest (fast, most sites)
2. If < 200 chars → fallback to headless Chrome (JS-rendered sites)
3. Requires Chrome installed on host machine
