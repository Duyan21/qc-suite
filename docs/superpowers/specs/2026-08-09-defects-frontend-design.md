# Defects Frontend — Design

## Summary

Build the Defects page (list + stats + filters + search + create) and a Defect
detail page, wired to the real backend, following the same patterns established
by the Requirements and Test Cases pages. `backend/routers/defects.py` and
`backend/schemas/defects.py` already exist but are minimal (no project scoping,
no search, no linked-entity summaries) and need extending. The frontend
`DefectsPage.tsx` is currently a bare placeholder.

Scope, resolved during brainstorming:
- List with severity/status filters, search, and a stats row — in scope
- Create ("Log Defect") — in scope
- Edit (severity/status/fixed_in_version) — in scope
- Delete — **out of scope** (no backend endpoint exists; follow-up task)
- Defect detail page (`/defects/:id`) — in scope

## Mockup vs. backend mismatches (resolved)

The provided mockup doesn't match the current data model in three places.
Decisions, made explicitly rather than silently picked:

1. **Status values.** Mockup shows Open/In Progress/Resolved/Closed. Backend
   `DefectStatus` enum is `Open | Fixed | Closed | Wont-Fix`. → **Use the
   backend enum as-is** in filters and badges. No backend enum change.
2. **Assigned / Reporter columns.** Mockup's table has these; the `Defect`
   model has no such fields and no user-assignment feature exists anywhere in
   the app yet. → **Drop these columns** from the table.
3. **"Fixed" column.** Mockup shows a date. Backend only has
   `fixed_in_version` (a version string, e.g. `"v2.3.1"`), not a fixed-at
   timestamp. → **Show the `fixed_in_version` string** (or "—"). No new
   `fixed_at` column.

## Architecture decision: project-scoping defects

Every backend list endpoint is scoped by `project_id` (see CLAUDE.md's
project-scoping pattern). But `Defect.testcase_id` and `Defect.requirement_id`
are both optional (by design — a defect can stand alone, e.g. an
exploratory-testing bug with no linked test case or requirement), so there is
currently no way to derive which project a given defect belongs to.

**Decision:** add a direct `project_id` column to `defects`, mirroring how
`Release` and `Requirement` already carry a direct `project_id` FK rather than
deriving it. This keeps TC/REQ links optional while guaranteeing every defect
is still visible under some project.

Alternative considered and rejected: derive `project_id` via a join through
`testcase_id → requirement.project_id` (no migration needed) — rejected
because any defect created with neither link would be permanently invisible
under every project's Defects page, which contradicts the documented
"both optional" design.

## Backend changes

### Migration
Add `project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)`
to `Defect` in `backend/models/all_models.py` + corresponding Alembic
migration (`alembic revision --autogenerate -m "add project_id to defects"`).
No existing defect rows are expected in any real environment at this point in
the project; if any exist in a dev DB they must be backfilled to a valid
project id before the `NOT NULL` migration applies.

### `backend/schemas/defects.py`
- `DefectCreate` gains a required `project_id: int` field.
- New `DefectListItem(DefectResponse)` gains `test_case: TestCaseSummary | None`
  (for the list's "Linked TC" column — same pattern as `TestCaseListItem`
  embedding a `RequirementSummary`).
- `DefectListResponse.items: list[DefectListItem]` (was `list[DefectResponse]`).
- New `DefectStatsResponse`:
  ```python
  class DefectStatsResponse(BaseModel):
      total: int
      by_status: dict[str, int]
      by_severity: dict[str, int]
  ```

### `backend/routers/defects.py`
- `list_defects` gains:
  - `project_id: int` (required query param) — direct equality filter on the
    new column, no join needed.
  - `search: str | None` — `ilike` over `title` and `code`, same pattern as
    `test_cases.py`.
  - Batch-loads linked `TestCase` rows for the page's items (same pattern as
    `test_cases.py`'s requirement batch-load) to populate `DefectListItem.test_case`.
- New `GET /defects/stats?project_id=` → `DefectStatsResponse`. Computes counts
  over **all** defects in the project, ignoring the list's search/severity/status
  filters and pagination — the stats tiles reflect project totals, not the
  current filtered view. (Rejected: computing stats client-side from a
  fetch-all list — doesn't scale once defect counts grow past one page.)
- `create_defect` validates `project_id` refers to an existing `Project`
  (400 if not) and stores it directly instead of deriving it.
- `update_defect` (`DefectUpdate`) is unchanged — severity, status,
  fixed_in_version only, matching current scope (title/description/links are
  not editable post-creation).

## Frontend changes

### `frontend/src/lib/defects.ts` (extend existing file)
- `DefectStatus`, `DefectSeverity` union types.
- `DefectListItem` gains `project_id`, `test_case: TestCaseSummary | null`.
- `DefectDetail` type (for the detail page): all `Defect` fields +
  `test_case: TestCaseSummary | null` + `requirement: RequirementSummary | null`.
- `listDefects(params: { project_id, page?, limit?, severity?, status?, search? })`
- `getDefectStats(project_id): Promise<{ total, by_status, by_severity }>`
- `getDefect(id): Promise<DefectDetail>`
- `createDefect(payload: { project_id, title, description?, severity, status?, testcase_id?, requirement_id? })`
- `updateDefect(id, payload: { severity, status, fixed_in_version? })`
- `DEFECT_SEVERITY_BADGE_CLASS`, `DEFECT_STATUS_BADGE_CLASS` — following the
  `TC_PRIORITY_BADGE_CLASS` convention (Critical/High: red-ish, Medium: amber,
  Low: muted; Open: red, Fixed: emerald, Closed: muted, Wont-Fix: outline).

### New component `frontend/src/components/TestCaseCombobox.tsx`
Mirrors `RequirementCombobox.tsx` exactly: debounced search popover backed by
`listTestCases({project_id, search})`, returns a `TestCaseSummary`-shaped
value. Needed because the create-defect form requires a searchable TC picker
and no such component currently exists (only the requirement one does).

### New component `frontend/src/components/NewDefectDialog.tsx`
Mirrors `NewTestCaseDialog.tsx`. Fields: title (required), description
(textarea, optional), severity (`Select`, required), status (`Select`,
defaults "Open"), `RequirementCombobox` (optional "Link REQ"),
`TestCaseCombobox` (optional "Link TC"). Takes `projectId` as a prop from
`useCurrentProject()` — not a user-facing form field.

### New component `frontend/src/components/EditDefectDialog.tsx`
Mirrors `EditTestCaseDialog.tsx`. Only severity, status, and
`fixed_in_version` (optional text input) are editable, matching `DefectUpdate`.

### New page `frontend/src/pages/DefectDetailPage.tsx`
Mirrors `RequirementDetailPage.tsx`'s structure: header (code, title,
severity/status badges), description, metadata (found_in_version,
fixed_in_version, created_at), a linked Test Case card (link to
`/testcases/:id`, rendered only if present) and a linked Requirement card
(link to `/requirements/:id`, rendered only if present). An Edit button opens
`EditDefectDialog`.

### `frontend/src/pages/DefectsPage.tsx` (replace placeholder)
Data-fetching pattern mirrors `TestCasesPage.tsx`: debounced search (300ms),
`requestIdRef`-guarded fetches, page-reset-on-filter-change effect.

- **Header**: "Defects" + subtitle `"{total} defects · {by_status.Open ?? 0} Open · {by_severity.Critical ?? 0} Critical"` (from the stats endpoint) + "+ Log Defect" button (disabled without a selected project) opening `NewDefectDialog`.
- **Stats row**: 7 tiles — Open/Fixed/Closed/Wont-Fix, then Critical/High/Medium/Low — from `getDefectStats(project_id)`. Fetched independently of the filtered list and refetched after create/edit (via a bump counter), so it always reflects totals regardless of active filters.
- **Filters**: search input ("Tìm defect..."), severity `Select` (all/Critical/High/Medium/Low), status `Select` (all/Open/Fixed/Closed/Wont-Fix) — same Card-header row layout as `TestCasesPage`.
- **Table columns**: ID (code, link to `/defects/:id`), Title, Severity (badge), Status (badge), Linked TC (code linking to `/testcases/:id`, or "—"), Created (formatted date), Fixed (`fixed_in_version` or "—"), trailing Edit icon button opening `EditDefectDialog`.
- **Pagination**: identical prev/next footer to `TestCasesPage`.
- Loading/error/empty/"select a project" states: identical pattern to `TestCasesPage`.

### Routing
Add `<Route path="/defects/:id" element={<DefectDetailPage />} />` in
`App.tsx`, following the existing `/requirements/:id` pattern (wired directly
in `App.tsx`, not added to `nav.tsx`, since `/defects` is already a nav item).

## Error handling

- Mutations (create/edit) show inline dialog errors via the existing
  `err instanceof Error ? err.message : 'Đã có lỗi xảy ra'` convention.
- Successes use `useToast()` with a link to the detail page, matching
  `TestCasesPage`'s create-toast pattern.
- In-flight race protection on rapid project switching: the same
  `requestIdRef` guard used by `TestCasesPage`/`TraceabilityPage`, applied to
  both the list fetch and the stats fetch.

## Testing / verification plan

No frontend test framework exists in this repo (deliberate, per CLAUDE.md).
Verification:
- `tsc --noEmit` for type correctness.
- Exercise the new/changed backend endpoints with `curl` against the running
  dev server: create a defect → list with severity/status/search filters →
  stats → update → detail fetch — covering the full CRUD-minus-delete path.
- Report will explicitly separate what was code-reviewed vs. actually observed
  running. Interactive UI behavior (combobox popover clicks, dialog
  open/close, badge rendering) cannot be verified without a browser-automation
  tool, none of which has been available in any session on this repo so far —
  that pass is left to whoever drives the session interactively.
