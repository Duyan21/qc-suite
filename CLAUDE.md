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

### Tables (9 total)
| Table | Purpose |
|-------|---------|
| users | Auth only |
| projects | Admin grouping |
| releases | Release versions for Release Report; also carries `status` (New/InProgress/Completed, derived from member results), `target_date`, `owner_user_id` |
| requirements | Versioned (req_id, version, is_current, previous_version_id) |
| test_cases | Has embedding VECTOR(768), FK → requirements.id |
| defects | FK to test_cases and requirements (both optional), plus `release_id` and `assignee_user_id` (both optional) |
| release_test_cases | Membership: "this test case is part of this release", with cached `current_result` (NotRun/Pass/Fail) mirroring the latest execution |
| release_test_case_executions | One row per execution *attempt* (result Pass/Fail, note, executed_by, executed_at) — history is kept, never overwritten |
| execution_evidence_images | Screenshot evidence per execution; `file_path` is relative to the uploads dir |

### Key Constraints
- requirements: UNIQUE (req_id, version)
- release_test_cases: UNIQUE (release_id, testcase_id)

## Alembic
Database migration tool — tracks schema changes as versioned files.
Team members sync DB schema by running `alembic upgrade head`.

## Common Commands
```bash
# One command from repo root: db container + backend + frontend together
# (root package.json, via `concurrently` — see qc-suite/package.json)
npm run dev

# Same, run individually
npm run dev:backend   # uvicorn --reload on :8000, uses backend/venv
npm run dev:frontend  # vite dev on :5173

# DB shell
docker exec -it qcsuite_db psql -U qcsuite -d qcsuite_db
\dt              # list tables
\d table_name    # describe table
\q               # quit

# Backend — one-off tasks not covered by `npm run dev:backend`
cd backend
venv\Scripts\activate
alembic upgrade head
alembic revision --autogenerate -m "description"
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
`/login`, `/register`, `/forgot-password` (standalone, no sidebar) + 10 routes under
`AppLayout`: `/dashboard`, `/requirements`, `/testcases`, `/defects`, `/traceability`,
`/search`, `/agent`, `/report`, `/testruns`, `/admin` (see `frontend/src/nav.tsx` for the
authoritative list/order). Bare `/` redirects to `/dashboard`. `/requirements/:id` and
`/testruns/:id` are non-nav routes wired directly in `App.tsx` (not `nav.tsx`) —
detail-page targets linked from elsewhere (the Traceability matrix's `req_id` cells; the
Test Runs list's release rows), not sidebar items.

Wired-to-real-backend: Auth (Sprint 0/1), Traceability (Sprint 1 — `GET /traceability`,
plus the project switcher, see below), Test Runs (`/testruns` list + `/testruns/:id`
release detail — release CRUD, add/remove test cases, record executions with screenshot
evidence, execution history; see `frontend/src/lib/releases.ts` and `backend/routers/
releases.py`), and Release Report (`/report` — pass rate, execution status, burn-down
chart, and defect breakdown by severity/status for a selected release; see
`frontend/src/pages/ReleaseReportPage.tsx`). Built with real UI but still mock data, not
yet backend-integrated: Admin.
Bare placeholder pages (Card + title only): Dashboard, Requirements, Test Cases, Defects,
Semantic Search, Impact Agent, and the `/requirements/:id` detail stub (deliberately bare
— real content lands whenever `RequirementsPage` itself gets built for real, not before).

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
  correctly) with a `localStorage` shim, no browser required. Separately: no
  browser-automation tool (Playwright/Puppeteer/etc.) has been available in any Claude
  Code session working on this repo so far either — assume none until proven otherwise.
  Interactive/visual behavior (dropdown clicks, scroll/sticky-positioning, a downloaded
  file's actual contents) cannot be verified by an agent; confirm what's mechanically
  possible (`tsc --noEmit`, live `curl` against the running backend, careful code-path
  reading) and say plainly in any report which claims are code-reviewed vs. actually
  observed running — then hand the interactive pass to whoever's driving the session.

### Project-scoping pattern (established by the Traceability wiring)
Every backend list endpoint (`/traceability`, `/requirements`, `/releases`, ...) is scoped
by `project_id` — there is no per-page project state, it's global:
- `frontend/src/lib/projects.ts` — `listProjects()`, thin wrapper over `GET /projects`
- `frontend/src/lib/currentProject.tsx` — `CurrentProjectProvider` + `useCurrentProject()`
  React context: fetches the project list once, restores the last-selected project id from
  `localStorage['qms_project_id']` if still valid else defaults to the first project,
  exposes `{ projects, project, setProject, loading }`
- Mounted once in `AppLayout.tsx` (wrapping the whole `<Outlet/>` subtree, alongside a
  `ProjectSwitcher` dropdown in the sidebar) — any page under `AppLayout` can call
  `useCurrentProject()` directly rather than managing its own project state or fetch
- A page consuming `project?.id` in a data-fetching `useEffect` must guard against
  in-flight-response races on rapid project switching (see `TraceabilityPage.tsx`'s
  `requestIdRef`-based guard) — a naive `useEffect(() => { load(project.id) }, [project])`
  can let a slow response for the *previous* project overwrite the current one's state
- Context/derived-data memoization matters here: `CurrentProjectProvider`'s value object
  and any expensive per-page derived data (e.g. `TraceabilityPage`'s `deriveColumns`/
  `computeStats`) should be wrapped in `useMemo`/`useCallback` — `AppLayout` re-renders for
  unrelated reasons (mobile nav toggle, `getCurrentUser()` resolving), and an unmemoized
  context value forces every consumer, including a large rendered matrix, to rebuild

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