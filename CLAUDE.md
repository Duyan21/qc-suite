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
- On a fresh DB, `alembic upgrade head` fails with `type "vector" does not exist` unless
  the extension is enabled first — the migration doesn't do this itself:
  `docker exec -it qcsuite_db psql -U qcsuite -d qcsuite_db -c "CREATE EXTENSION IF NOT EXISTS vector;"`

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
│ ├── components/ui/ # shadcn/ui components (Button, Card, ...)
│ ├── layouts/ # AppLayout.tsx — sidebar nav + <Outlet/>
│ ├── pages/ # one file per route (RequirementsPage.tsx, ...)
│ ├── lib/ # utils.ts (cn() helper), api.ts (fetch wrapper), auth.ts (auth calls)
│ └── App.tsx # react-router-dom route tree
└── docs/
└── erd.md


### Frontend Routes
`/login`, `/register`, `/forgot-password` (standalone, no sidebar) + 8 routes under
`AppLayout`: `/requirements`, `/testcases`, `/defects`, `/traceability`, `/search`,
`/agent`, `/report`, `/admin`. Bare `/` redirects to `/requirements`. Auth is wired to the
real backend (Sprint 0/1) — everything else is still placeholder pages, real content/data
fetching for those lands in later sprints.

### API Integration Pattern (established by the auth wiring)
`frontend/src/lib/api.ts` is the shared fetch wrapper every backend integration should go
through — don't hand-roll `fetch()` calls in page components:
- `apiFetch<T>(path, options)` — unauthenticated calls (base URL from `VITE_API_URL`,
  JSON handling, normalizes both of the backend's error shapes — plain-string `detail`
  and pydantic's array-of-`{msg}` `detail` — into a single thrown `Error`)
- `authFetch<T>(path, options)` — same, plus attaches the stored bearer token
- A 401 on a request that actually sent the token auto-clears it and redirects to
  `/login` (keyed on whether *that request* carried `Authorization`, not on whether a
  token merely exists in storage — the two diverge on `/auth/login` itself, which can
  401 for wrong credentials with no token attached)
- `frontend/src/lib/auth.ts` shows the pattern for a feature module built on top: it maps
  backend English error strings to the UI's Vietnamese copy, since only this layer knows
  what's user-facing text vs. wire format
- No frontend test framework exists yet (deliberate). Verify integrations by exercising
  the real module against the real running backend — Vite's own SSR loader
  (`createServer({server:{middlewareMode:true}}).ssrLoadModule(path)`) runs the actual
  TypeScript source through Vite's transform pipeline (so `import.meta.env` etc. resolve
  correctly) with a `localStorage` shim, no browser required

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