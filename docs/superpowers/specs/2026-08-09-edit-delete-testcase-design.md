# Edit / Delete Test Case — Design

Date: 2026-08-09
Status: Approved for planning

## Purpose

Wire two already-existing backend `test_cases` endpoints into the frontend, following the
same approach as the create-flow (see `2026-08-08-create-requirement-testcase-design.md`),
plus one small targeted change to the existing list endpoint's default filtering:
- `PUT /test-cases/{id}` → an "Edit" flow on `TestCaseDetailPage`.
- `DELETE /test-cases/{id}` → a "Delete" flow on `TestCaseDetailPage` and on
  `TestCasesPage`'s table rows.
- `GET /test-cases` → default (no `status` param) now excludes `Deprecated`, so items set
  to `Deprecated` via the new Delete button actually disappear from the default view.

## Backend

Confirmed by reading `backend/routers/test_cases.py` and `backend/schemas/test_cases.py`:

- `PUT /test-cases/{id}` (`TestCaseUpdate`: `title`, `preconditions?`, `steps?`,
  `expected_result`, `priority`, `status`, `requirement_id`) → `TestCaseResponse`. Updates
  the row **in place** (no versioning — unlike `Requirement`, `TestCase` has no
  `version`/`is_current`/`change_note` columns). 400s if `requirement_id` doesn't exist.
  Re-triggers `trigger_embedding` when `title`/`steps`/`expected_result` changed (existing
  behavior, untouched). **No change needed.**
- `DELETE /test-cases/{id}` (`TestCaseResponse`) → sets `status = "Deprecated"` on the row.
  Does not actually remove the row (soft-delete in name only; the UI still calls this
  action "Delete" per product decision below). **No change needed.**
- `GET /test-cases` (`list_test_cases`) — **one small change**: today,
  `status_filter` (query param `status`) only ever adds a filter when explicitly given; when
  omitted, every status shows, including `Deprecated`. Add an `else` branch: when
  `status_filter` is `None`, filter `TestCase.status != "Deprecated"`. An explicit
  `?status=Deprecated` still works exactly as before (exact match, unaffected). This is a
  tweak to existing logic in an existing endpoint, not a new endpoint or schema — the only
  backend code change in this pass.
  - **Ripple effect, called out explicitly**: every caller that fetches test cases without
    a status filter is affected, not just `TestCasesPage`'s "All" option.
    `RequirementDetailPage`'s `reloadLinkedTestCases` (for a historical/non-current
    requirement version) also calls `listTestCases({ requirement_id, limit: 200 })` with no
    status param, so Deprecated test cases linked to an old requirement version will also
    stop appearing in that list. This is treated as correct/desired (consistent default
    everywhere) rather than a special case to work around.
  - `GET /test-cases/{id}` (single, by id) is untouched — always returns the row regardless
    of status, which is required for `EditTestCaseDialog` to load and revive a Deprecated
    test case (see below).

## Scope decisions (from brainstorming)

Recorded so implementation doesn't re-litigate them:

1. **Explicitly out of scope**: versioning `TestCase` edits (new row per edit, `v2` badge,
   change-note, a "Version history" tab). This was the original ask but was aborted —
   the backend has no version/is_current/change_note columns on `test_cases` and no
   history endpoint, and this pass adds no backend code. If versioning is wanted later,
   it needs its own brainstorm/spec (schema migration + rewritten `PUT` + new history
   endpoint), same shape as `Requirement`'s existing versioning.
2. **Requirement link stays editable** in the Edit dialog, matching what `TestCaseUpdate`
   already accepts — not locked to the test case's current requirement.
3. **Delete button wording**: labeled "Delete" (`Xóa`), not "Deprecate". The confirm
   dialog does **not** mention that this is actually just a status change to
   `Deprecated` under the hood — kept simple by product decision. A future trash-bin /
   restore feature may expose that nuance later; not this pass.
4. **Delete confirmation**: always a confirm `Dialog` before calling `DELETE` — no
   one-click delete.
5. **Delete lives in two places**: `TestCaseDetailPage`'s action row (next to the new Edit
   button) *and* a per-row action on `TestCasesPage`'s table — not just one.
6. **Post-delete behavior differs by entry point** (superseded in part by decision 10 below
   — kept here for the instant-feedback behavior, which still applies):
   - From `TestCaseDetailPage`: navigate to `/testcases` (the item is gone from the page
     the user is looking at because they've left it).
   - From `TestCasesPage`'s row action: splice the row out of the current page's local
     list state immediately (no refetch) — the row visibly disappears without the page
     reloading or waiting on the backend filter change to take effect on the next fetch.
   - `TestCasesPage`'s status-filter dropdown itself is unchanged — it still offers
     `Draft`/`Active`/`Deprecated` as explicit choices, and picking `Deprecated` explicitly
     still shows exactly those items (backend exact-match filtering, untouched). What
     changed (decision 10) is only what the **default/"All"** selection returns.
7. **Post-edit behavior**: `TestCaseDetailPage` merges the returned `TestCaseResponse`
   into local state in place (same `id`, no navigation needed — unlike the versioned
   design that was aborted).
8. **Consistency directive**: `EditTestCaseDialog` mirrors `NewTestCaseDialog` (same
   `FormData`-on-submit shape, same fields) plus one addition — a `status` `Select`
   (`TestCaseUpdate` requires it; Create never asked for it) — with every field
   `defaultValue`-populated from the test case being edited. `DeleteTestCaseDialog` is one
   reusable component used from both entry points (detail page and list row), not
   duplicated.
9. **Backend list-filter change (follow-up decision)**: `GET /test-cases` with no `status`
   param now excludes `Deprecated` (see "Backend" above). This is a change to existing
   query logic, deliberately scoped in after confirming the alternative (client-side
   filtering with pagination-count caveats, or a client-side dual-fetch-and-merge) was
   worse than a small, targeted backend adjustment. `TestCasesPage`'s "All" filter option
   needs no frontend code change to pick this up — it already passes `status: undefined`
   for "All" today, so the new backend default applies automatically.
10. **Status is not a free-form field — `Deprecated` is Delete-button-only**: neither the
    Create dialog (which has no status field at all, and stays that way — `TestCaseCreate`
    has no `status` param, backend always creates as `Draft`) nor `EditTestCaseDialog`'s
    `status` `Select` offer `Deprecated` as a choice. The only way a test case becomes
    `Deprecated` is clicking the Delete button. `EditTestCaseDialog`'s status options are
    `Draft`/`Active` only (see the dialog section below for how a currently-Deprecated test
    case is handled — the "switch back to Active or Draft" flow from decision 11).
11. **Reviving a Deprecated test case happens through Edit**: since `Deprecated` isn't a
    selectable target, `EditTestCaseDialog` must still let a user move a currently-Deprecated
    test case back to `Draft` or `Active`. Because `Deprecated` isn't one of the two
    `SelectItem`s, a test case whose current status is `Deprecated` gets **no** `defaultValue`
    on the status `Select` — the trigger shows a placeholder (`Chọn trạng thái...`) instead of
    a pre-filled value, forcing an explicit choice of `Draft` or `Active` before submitting
    (submit stays disabled until a status is chosen, same style of guard as the requirement
    combobox). For a test case whose current status is already `Draft`/`Active`, the `Select`
    behaves normally with that value pre-filled.
12. **Error feedback — deliberate deviation from the create-flow convention**: the
    create-flow dialogs (`NewRequirementDialog`/`NewTestCaseDialog`) show failures as inline
    `text-destructive` text inside the dialog and never toast them. For Edit/Delete, that's
    replaced: **failures show only as an error toast** (`toast.error(message)`), the same
    channel as success. No inline error text in `EditTestCaseDialog` or
    `DeleteTestCaseDialog`. The dialog still stays open with fields/state intact so the user
    can retry (only the error-display channel changes, not the retry behavior).

## `EditTestCaseDialog.tsx` (`frontend/src/components/`)

Props: `{ open: boolean; onOpenChange: (v: boolean) => void; projectId: number; testCase: TestCaseDetail; onUpdated: (tc: TestCase) => void }`.

- Same `FormData`-on-submit shape as `NewTestCaseDialog`. Fields: `title` (`Input`,
  required, `defaultValue={testCase.title}`), `expected_result` (`Textarea`, required,
  `defaultValue={testCase.expected_result}`), `preconditions` (`Textarea`, optional,
  `defaultValue={testCase.preconditions ?? ''}`), `steps` (`Textarea`, optional,
  `defaultValue={testCase.steps ?? ''}`), `priority` (`Select`, `defaultValue={testCase.priority ?? 'Medium'}`).
- New field vs. Create: `status` (`Select`, options **`Draft`/`Active` only** — no
  `Deprecated` item, per decision 10). `defaultValue` is `testCase.status` when it's
  `Draft` or `Active`; when `testCase.status === 'Deprecated'`, no `defaultValue` is passed
  at all, so the trigger shows its placeholder (`Chọn trạng thái...`) and the user must
  actively pick `Draft` or `Active` to revive it (decision 11). Track the chosen value in
  local state (`const [status, setStatus] = useState<TestCaseStatus | undefined>(testCase.status === 'Deprecated' ? undefined : testCase.status)`)
  so the submit guard can see whether a value has been chosen yet.
- Requirement: always `RequirementCombobox` (unlocked), initial local state
  `selectedRequirement = testCase.requirement`, mirrored into
  `<input type="hidden" name="requirement_id">`. Submit disabled until a requirement is
  selected, same guard as Create.
- On submit: `updateTestCase(testCase.id, payload)` → same `id` comes back (in-place
  update) → `onOpenChange(false)`, `onUpdated(tc)` (page fires the success toast, see
  "Wiring into pages" below — same split as the create-flow dialogs); on failure →
  `toast.error(message)` fired from inside this dialog itself (it's the one that knows the
  request failed), dialog stays open with the entered values intact so the user can retry.
- Submit button: `disabled={submitting || !requirement || !status}`, label
  `submitting ? 'Đang lưu...' : 'Lưu'`.

## `DeleteTestCaseDialog.tsx` (`frontend/src/components/`)

Props: `{ open: boolean; onOpenChange: (v: boolean) => void; testCase: { id: number; code: string } | null; onDeleted: (id: number) => void }`.

- Small confirm `Dialog`, not a form. Body: `Bạn có chắc chắn muốn xóa test case {code}?`
- Footer: `Hủy` (`variant="outline"`) / `Xóa` (`variant="destructive"`, already defined in
  `button.tsx` — no new styling).
- On confirm: `setSubmitting(true)`; `deleteTestCase(testCase.id)`; on success →
  `onOpenChange(false)`, `onDeleted(testCase.id)` (page fires the success toast); on
  failure → `toast.error(message)` fired from inside this dialog, dialog stays open so the
  user can retry.
- Delete button: `disabled={submitting}`, label `submitting ? 'Đang xóa...' : 'Xóa'`.

## Wiring into pages

- **`TestCaseDetailPage.tsx`**: new action row above the title (page currently has none —
  first precedent is `RequirementDetailPage`'s row). `Edit` (`variant="outline" size="sm"`)
  opens `EditTestCaseDialog`; `onUpdated`: `setTestCase((tc) => tc ? { ...tc, ...updated } : tc)`,
  `toast.success('Đã cập nhật test case ' + updated.code + '.')`. `Delete`
  (`variant="destructive" size="sm"`, same sizing as `Edit`) opens `DeleteTestCaseDialog`;
  `onDeleted`: `navigate('/testcases')`,
  `toast.success('Đã xóa test case ' + code + '.')`.
- **`TestCasesPage.tsx`**: table gets a trailing icon-button column (`Trash2` from
  `lucide-react`, `variant="ghost" size="icon-sm"`, `title="Xóa"`) per row. One
  `DeleteTestCaseDialog` instance keyed off `deletingTestCase: { id, code } | null` state
  (set by the row button's `onClick`), not one dialog per row. `onDeleted(id)`:
  `setData((d) => d ? { ...d, items: d.items.filter((tc) => tc.id !== id), total: d.total - 1 } : d)` —
  no refetch, `toast.success('Đã xóa test case ' + code + '.')`.

## `lib/testCases.ts` additions

- `updateTestCase(id: number, payload: { title: string; preconditions?: string; steps?: string; expected_result: string; priority: TestCasePriority; status: TestCaseStatus; requirement_id: number }): Promise<TestCase>` →
  `authFetch('/test-cases/${id}', { method: 'PUT', body: payload })`.
- `deleteTestCase(id: number): Promise<TestCase>` →
  `authFetch('/test-cases/${id}', { method: 'DELETE' })`.
- `api.ts`'s `RequestOptions.method` already includes `'PUT'`/`'DELETE'` — no change needed.

## Error handling & validation

- Required-field validation leans on native HTML (`required`), same as the create dialogs.
- Request-level failures (network error, 400 from a stale/deleted `requirement_id` on
  edit, 404 if a test case was already deleted elsewhere) surface as an **error toast**
  (`toast.error(err instanceof Error ? err.message : 'Đã có lỗi xảy ra')`), fired from
  inside `EditTestCaseDialog`/`DeleteTestCaseDialog` at the point of failure — not as
  inline dialog text. This is a deliberate deviation from the create-flow dialogs
  (`NewRequirementDialog`/`NewTestCaseDialog`), which keep their inline-text-only
  convention unchanged. The dialog stays open with its current field values/state intact
  on failure either way, so the user can retry without re-entering data.
- Every Edit/Delete action now gives toast feedback on both outcomes: success toast fires
  from the page-level `onUpdated`/`onDeleted` callback (see "Wiring into pages"), error
  toast fires from inside the dialog itself.
- 401 handling already global (`api.ts`), untouched.

## Verification plan

No frontend test framework exists in this codebase (deliberate, per `CLAUDE.md`).
Verification for this pass:
- `tsc --noEmit` across all new/changed files.
- Live `curl` against the running backend to confirm `PUT /test-cases/{id}` and
  `DELETE /test-cases/{id}` behave as documented above (already-existing endpoints, so
  this is confirmation, not new backend work) — including the 400 path for a bad
  `requirement_id` on edit.
- For the one actual backend change (`GET /test-cases` default status filtering): a
  targeted pytest case in `backend/tests/test_test_cases.py` covering (a) a Deprecated
  test case absent from a no-`status`-param list call, and (b) present when
  `?status=Deprecated` is passed explicitly. Then a full backend test suite run (`pytest`)
  to confirm no regression to the existing filter tests.
- Careful code-path reading for the FormData pre-fill/defaultValue wiring, the hidden-input
  mirroring (combobox → `requirement_id`), the row-splice logic on `TestCasesPage`, and the
  navigate-then-toast sequence on `TestCaseDetailPage`.
- No browser automation tool is available in this session — dialog open/close, the actual
  row disappearing after delete, and the full edit/delete click-through cannot be visually
  verified by the agent. The implementation report will state plainly which claims are
  code-reviewed vs. actually observed running; an interactive/visual pass is left to
  whoever is driving the session.

## Gap Analysis (for future follow-up, not this pass)

| Capability | This pass |
|---|---|
| Versioned Test Case edits (v2 badge, change-note, version-history tab) | Out of scope — requires backend schema/migration work, deliberately aborted this round |
| `POST /test-cases/{id}/execute` (recording Pass/Fail/Skip/Blocked) | Still unwired, no execution UI exists yet |
| Trash bin / restore for deleted (Deprecated) test cases | Mentioned as a possible future feature, not designed here |
| Editing/Deleting a Requirement itself | Still out of scope (`Edit` button on `RequirementDetailPage` remains disabled) |
