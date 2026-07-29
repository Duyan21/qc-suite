# S1-A — BE Core Entity CRUD — Design Spec

Sprint 1, task S1-A (backlog v2.0, updated 2026-07-29). Covers sub-tasks S1-01
(Requirement CRUD), S1-03 (TestCase CRUD), S1-05 (Defect CRUD), and S1-12 (Test
Execution API). Blocking task for S1-B and S1-F.

## Context

- Models already exist in `backend/models/all_models.py`: `Requirement`,
  `TestCase`, `Defect`, `TestRun`, `TestRunResult`.
- `TestRun.release_id` is required (`nullable=False`); there is **no**
  `release_version` column — it was dropped by the merged fix
  `fix/test-runs-release-id-required` (migration `7a1e4c2f9b03`). S1-12's DoD
  text mentions `release_version` in the `POST /test-runs` body; this spec
  treats that as stale wording superseded by the merged schema fix.
- Auth: `services/auth_service.get_current_user` (JWT dependency) already
  exists and is reused here — all endpoints in this spec are protected.
- Existing convention: one router file + one schema file per entity
  (see `routers/auth.py`, `schemas/auth.py`).

## File structure

```
backend/
├── routers/
│   ├── requirements.py
│   ├── test_cases.py
│   ├── defects.py
│   └── test_runs.py
├── schemas/
│   ├── requirements.py
│   ├── test_cases.py
│   ├── defects.py
│   └── test_runs.py
├── services/
│   ├── code_generator.py     # next sequential code: REQ-0NN / TC-0NN / DEF-0NN
│   └── embedding_service.py  # trigger_embedding() no-op stub for S2-A
```

All routers declare `dependencies=[Depends(get_current_user)]`.

## Shared conventions

- **Pagination**: all list endpoints accept `page` (default 1) and `limit`
  (default 50), return `{items: [...], total: int, page: int, limit: int}`.
- **Code generation**: `services/code_generator.py` exposes a helper that
  finds the max existing code for a given prefix/column and returns the next
  sequential one, zero-padded to 3 digits (e.g. `REQ-001`, `TC-001`,
  `DEF-001`). Used by `POST /requirements`, `POST /test-cases`, `POST /defects`.
- **Enums** (Pydantic `Literal` types):
  - Requirement / TestCase `status`: `Draft | Active | Deprecated`
  - TestCase `priority`: `High | Medium | Low`
  - Defect `severity`: `Critical | High | Medium | Low`
  - Defect `status`: `Open | Fixed | Closed | Wont-Fix`
  - TestRunResult `result`: `Pass | Fail | Skip | Blocked`
- **Errors**: 404 on missing PK/FK lookups, 400 on invalid enum/FK values, 401
  via the shared JWT dependency on missing/invalid token.

## Requirements API (`/requirements`)

| Endpoint | Behavior |
|---|---|
| `GET /requirements?status=&search=&page=&limit=` | Lists current versions only (`is_current=True`). `search` does `ILIKE` on title. |
| `GET /requirements/{id}` | Detail for row PK `id`, plus full version history (all rows sharing `req_id`, ascending). |
| `POST /requirements` | Body `{title, description, status}`. Auto-generates `req_id`, sets `version=1, is_current=True`. |
| `PUT /requirements/{id}` | `id` = PK of the version being edited. Body `{title, description, status, change_note}`. Inserts new row: same `req_id`, `version+1`, `is_current=True`, `previous_version_id={id}`, `changed_by=<current user email>`. Sets old row `is_current=False`. Old row content is never mutated. |
| `GET /requirements/{req_id}/history` | `req_id` = string business key (e.g. `REQ-015`). Returns all versions ascending. Distinguished from the PK route by path shape (`/requirements/{req_id}/history` vs `/requirements/{id}`). |

## TestCases API (`/test-cases`)

| Endpoint | Behavior |
|---|---|
| `GET /test-cases?requirement_id=&priority=&status=&page=&limit=` | Paginated list. |
| `POST /test-cases` | Body `{title, preconditions, steps, expected_result, priority, requirement_id}`. Auto-generates `code`. After commit, calls `trigger_embedding(test_case)` (no-op stub). |
| `PUT /test-cases/{id}` | Updates fields. If `title`/`steps`/`expected_result` changed, calls `trigger_embedding` again. |
| `DELETE /test-cases/{id}` | Soft delete: sets `status=Deprecated`. Row is never removed from DB. |
| `GET /test-cases/{id}` | Detail with nested requirement summary (`id, req_id, version, title, status`). |
| `POST /test-cases/{id}/execute` | Body `{run_id, result, note}`. Upserts `test_run_results` on `(run_id, testcase_id)` — updates existing row if present, inserts otherwise. |
| `GET /test-cases/{id}/results` | Execution history joining `test_run_results` → `test_runs` → `releases`, returning `release_version` (=`Release.version_name`), `result`, `executed_at`, `note`. |

## Defects API (`/defects`)

| Endpoint | Behavior |
|---|---|
| `GET /defects?severity=&status=&requirement_id=&testcase_id=&page=&limit=` | Paginated list. |
| `POST /defects` | Body `{title, description, severity, status, testcase_id?, requirement_id?}` (both FKs optional). Auto-generates `code`. |
| `PUT /defects/{id}` | Updates `severity, status, fixed_in_version`. |
| `GET /defects/{id}` | Detail with nested TC + REQ summaries (whichever linked FKs are set). |

## TestRuns API (`/test-runs`)

| Endpoint | Behavior |
|---|---|
| `POST /test-runs` | Body `{release_id, executed_by, note}` — no `release_version` field (column doesn't exist). |
| `GET /test-runs?release_id=X` | Lists runs for a release. Response includes `release_version` resolved via join to `Release.version_name`. |

## Testing

No automated test suite exists yet for routers (matches `S0-08` precedent).
Verification is manual per DoD:
- Requirement: create → update twice → confirm history shows exactly 3
  versions with correct `is_current` flags.
- TestCase: create → update title → confirm re-embed stub is called (log
  line, since it's a no-op); soft-delete → confirm row remains with
  `status=Deprecated`.
- Defect: create with only `testcase_id` set (no `requirement_id`) and vice
  versa → confirm both are accepted.
- TestRun/execute: create run → execute TC → execute same TC again with a
  different result → confirm `test_run_results` has exactly one row (UPDATE,
  not duplicate INSERT).
