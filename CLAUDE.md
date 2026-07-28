# QC Suite — Claude Code Context

## Project Summary
Software Testing Management System with Requirement Traceability and Semantic Search.
Graduation thesis — UIT CDTN 25210052 (An) & 25210112 (Huyen).
Timeline: 15/07 → 23/09/2026.

## Tech Stack
- Backend: FastAPI (Python 3.11) — `backend/`
- Frontend: React + Vite + shadcn/ui — `frontend/`
- Database: PostgreSQL 16 + pgvector extension (Docker: ankane/pgvector)
- LLM: Gemini 3.5 Flash (google-generativeai SDK)
- Embedding: gemini-embedding-001 → 768-dim vector (Matryoshka truncation from 3072)
- Auth: JWT (python-jose) + bcrypt

## Key Architectural Decisions

### 1. Requirement Versioning (append-only pattern)
NEVER update existing rows. When a requirement changes:
- INSERT new row (version+1, is_current=True)
- UPDATE old row SET is_current=False

`test_cases.requirement_id` points to `requirements.id`
(a specific version PK), NOT `req_id`.
When a requirement updates, test cases remain linked to the old version.
The agent detects this by comparing is_current.

### 2. Modified RAG Architecture
Dual retrieval feeding into a single full-context LLM call.

- Exact FK lookup → directly linked test cases
- Semantic vector search → pgvector cosine similarity top-10

No chunking needed — Gemini 3.5 Flash has 1M token context window.
Full context (~76K tokens) fits in a single prompt (7.6% of window).
Single Gemini call → structured JSON output.

### 3. Agent Cache
Results stored in `agent_cache` table.
Cache key = md5(req_id + "_" + version).
Invalidated when requirement gets a new version.

## Database
- Host: localhost:5432
- Name: qcsuite_db / User: qcsuite / Password: qcsuite123
- Docker container: qcsuite_db

### Tables (8 total)
| Table | Purpose |
|-------|---------|
| users | Auth only |
| projects | Admin grouping |
| releases | Release versions for Release Report |
| requirements | Versioned (req_id, version, is_current, previous_version_id) |
| test_cases | Has embedding VECTOR(768), FK → requirements.id |
| defects | FK to test_cases and requirements (both optional) |
| test_runs | Execution sessions per release |
| test_run_results | Pass/Fail/Skip/Blocked per TC per run |

### Key Constraints
- requirements: UNIQUE (req_id, version)
- test_run_results: UNIQUE (run_id, testcase_id)

## Alembic
Database migration tool — tracks schema changes as versioned files.
Team members sync DB schema by running `alembic upgrade head`.

## Common Commands
```bash
# Start database
docker-compose up -d

# DB shell
docker exec -it qcsuite_db psql -U qcsuite -d qcsuite_db
\dt              # list tables
\d table_name    # describe table
\q               # quit

# Backend
cd backend
venv\Scripts\activate
alembic upgrade head
alembic revision --autogenerate -m "description"
uvicorn main:app --reload --port 8000

# Frontend
cd frontend && npm run dev
```

## File Structure

qc-suite/
├── backend/
│ ├── routers/ # one file per entity
│ ├── models/ # SQLAlchemy ORM models
│ ├── schemas/ # Pydantic: XxxCreate / XxxUpdate / XxxResponse
│ ├── services/ # business logic (embedding, agent, cache)
│ └── migrations/ # Alembic files
├── frontend/
│ └── src/
│ ├── components/ui/ # shadcn/ui components (Button, Card, Input, Label, Checkbox, ...)
│ ├── layouts/ # AppLayout (sidebar chrome), AuthLayout (auth card chrome), RequireAuth (route guard)
│ ├── pages/ # one file per route (RequirementsPage.tsx, LoginPage.tsx, ...)
│ ├── lib/ # utils.ts (cn() helper), auth.ts (mocked login/register/reset)
│ ├── nav.tsx # single source of truth: nav sections + routes
│ └── App.tsx # react-router-dom route tree (generated from nav.tsx)
└── docs/
└── erd.md

### Frontend Routes
`/login`, `/register`, `/forgot-password` (standalone, no sidebar) + 10 routes
under `AppLayout`, grouped into 5 sidebar sections defined in `nav.tsx`:

| Section | Routes |
|---|---|
| Overview | `/dashboard` |
| Quản lý | `/requirements`, `/testcases`, `/defects`, `/traceability` |
| AI Tools | `/search`, `/agent` |
| Release | `/testruns`, `/report` |
| System | `/admin` |

Bare `/` redirects to `/dashboard`. All currently placeholder pages (Sprint 0) —
real content/data fetching lands in later sprints. No `api/` dir yet; add one
when the first real endpoint integration starts.

`App.tsx` does not hand-list the `AppLayout` routes — it derives `<Route>`
elements by mapping over `nav.tsx`'s `NAV_SECTIONS` (each item carries `path` +
`label` + `element`), so the sidebar and router can't drift out of sync. Only
the auth routes and the `index` redirect are declared separately, since none
of those are nav items.

### Auth (mocked, Sprint 0)
`src/lib/auth.ts` fakes `login`/`register`/`requestPasswordReset` against a
single hardcoded demo user (`admin@homelending.com` / `password123`) and
stores a fake token under `localStorage["qms_token"]` — there's no backend
`/auth` endpoint yet. `RequireAuth` (`src/layouts/RequireAuth.tsx`) wraps the
`AppLayout` route and redirects to `/login` when that key is absent. Swap
`auth.ts`'s internals for real `fetch` calls once the FastAPI auth endpoints
land; `RequireAuth` and the calling pages shouldn't need to change.

Import alias `@/*` → `src/*` (wired in `tsconfig.json`, `tsconfig.app.json`, and
`vite.config.ts`). Use it instead of relative `../` imports. Note: `tsconfig.app.json`
must NOT get a `baseUrl` key — TypeScript 6.0 deprecates it and `tsc -b` fails the
build (TS5101); `paths` alone works fine under `moduleResolution: "bundler"`.

## Coding Conventions
- Python: snake_case, type hints required
- FastAPI: one router file per entity
- Pydantic: separate XxxCreate / XxxUpdate / XxxResponse
- Commits: conventional commits (feat / fix / chore / docs)
- Branches: feature/s{sprint}-{task} (e.g. feature/s1-a-crud)