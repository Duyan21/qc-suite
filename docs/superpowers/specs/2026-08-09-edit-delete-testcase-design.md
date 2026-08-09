# Edit / Delete Test Case — Design

Date: 2026-08-09
Status: Approved for planning

## Purpose

Wire two already-existing backend `test_cases` endpoints into the frontend, following the
same "no backend changes" approach as the create-flow (see
`2026-08-08-create-requirement-testcase-design.md`):
- `PUT /test-cases/{id}` → an "Edit" flow on `TestCaseDetailPage`.
- `DELETE /test-cases/{id}` → a "Delete" flow on `TestCaseDetailPage` and on
  `TestCasesPage`'s table rows.

## Backend

**No backend changes.** Confirmed by reading `backend/routers/test_cases.py` and
`backend/schemas/test_cases.py`:

- `PUT /test-cases/{id}` (`TestCaseUpdate`: `title`, `preconditions?`, `steps?`,
  `expected_result`, `priority`, `status`, `requirement_id`) → `TestCaseResponse`. Updates
  the row **in place** (no versioning — unlike `Requirement`, `TestCase` has no
  `version`/`is_current`/`change_note` columns). 400s if `requirement_id` doesn't exist.
  Re-triggers `trigger_embedding` when `title`/`steps`/`expected_result` changed (existing
  behavior, untouched).
- `DELETE /test-cases/{id}` (`TestCaseResponse`) → sets `status = "Deprecated"` on the row.
  Does not actually remove the row (soft-delete in name only; the UI still calls this
  action "Delete" per product decision below).

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
6. **Post-delete behavior differs by entry point**:
   - From `TestCaseDetailPage`: navigate to `/testcases` (the item is gone from the page
     the user is looking at because they've left it).
   - From `TestCasesPage`'s row action: splice the row out of the current page's local
     list state immediately (no refetch) — the row visibly disappears without the page
     reloading.
   - Neither path changes `TestCasesPage`'s status-filter semantics. `Status: All`
     continues to include `Deprecated` items exactly as it does today (whether they got
     that status via this Delete button or via the Edit dialog's status field) — a fresh
     load/refetch of the list will show a deleted item again, with its `Deprecated`
     badge. Only the immediate, in-session UI action after clicking Delete removes it from
     view. This was an explicit product decision: "Deprecated is a status of the test
     case, but that test case is not deleted" — no new hide-by-default filtering logic is
     added anywhere.
7. **Post-edit behavior**: `TestCaseDetailPage` merges the returned `TestCaseResponse`
   into local state in place (same `id`, no navigation needed — unlike the versioned
   design that was aborted).
8. **Consistency directive**: `EditTestCaseDialog` mirrors `NewTestCaseDialog` (same
   `FormData`-on-submit shape, same fields) plus one addition — a `status` `Select`
   (`TestCaseUpdate` requires it; Create never asked for it) — with every field
   `defaultValue`-populated from the test case being edited. `DeleteTestCaseDialog` is one
   reusable component used from both entry points (detail page and list row), not
   duplicated.
9. **Error feedback — deliberate deviation from the create-flow convention**: the
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
- New field vs. Create: `status` (`Select`: Draft/Active/Deprecated,
  `defaultValue={testCase.status}`).
- Requirement: always `RequirementCombobox` (unlocked), initial local state
  `selectedRequirement = testCase.requirement`, mirrored into
  `<input type="hidden" name="requirement_id">`. Submit disabled until a requirement is
  selected, same guard as Create.
- On submit: `updateTestCase(testCase.id, payload)` → same `id` comes back (in-place
  update) → `onOpenChange(false)`, `onUpdated(tc)` (page fires the success toast, see
  "Wiring into pages" below — same split as the create-flow dialogs); on failure →
  `toast.error(message)` fired from inside this dialog itself (it's the one that knows the
  request failed), dialog stays open with the entered values intact so the user can retry.
- Submit button: `disabled={submitting || !requirement}`, label
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
