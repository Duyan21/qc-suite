# Edit / Delete Requirement — Design

Date: 2026-08-09
Status: Approved for planning

## Purpose

Wire Edit and Delete flows for `Requirement` into the frontend, following the same
overall shape as `2026-08-09-edit-delete-testcase-design.md`, but adapted for the fact
that `Requirement` is append-only versioned (per `CLAUDE.md`'s "Requirement Versioning"
decision) — unlike `TestCase`, which updates in place:
- `PUT /requirements/{id}` (already exists) → an "Edit" flow on `RequirementDetailPage`.
  Gets one added guard (see Backend).
- `DELETE /requirements/{id}` (new) → a "Delete" flow on `RequirementDetailPage` and on
  `RequirementsPage`'s table rows.
- `GET /requirements` → default (no `status` param) now excludes `Deprecated`, matching
  the test-case precedent.

## Backend

Confirmed by reading `backend/routers/requirements.py` and `backend/schemas/requirements.py`:

- `PUT /requirements/{id}` (`update_requirement`) already exists and already versions
  correctly: sets `old.is_current = False`, inserts a **new row** (`version + 1`,
  `is_current=True`, `previous_version_id=old.id`, same `req_id`/`project_id`). It returns
  the new row, which has a **different `id`** than the one requested — the frontend must
  navigate to the new id after a successful edit (see "Wiring into pages").
  - **Added guard**: `400` if `old.is_current` is `False`. Today nothing stops calling
    `PUT` on a historical version — doing so would insert a `version` number that already
    exists on a later row (`UNIQUE (req_id, version)`), raising an unhandled integrity
    error. No existing test calls `PUT` on a stale id, so this guard doesn't change
    current behavior, only closes a latent bug now that Edit becomes reachable from the
    UI.
- `DELETE /requirements/{id}` (new): same versioning shape as `update_requirement`, not a
  row deletion or in-place status flip. Body: none. Logic: `404` if the id doesn't exist;
  `400` if `old.is_current` is `False`; otherwise `old.is_current = False`, insert a new
  row (`version = old.version + 1`, `title`/`description` carried over unchanged from
  `old`, `status = "Deprecated"`, `is_current = True`, `previous_version_id = old.id`,
  same `req_id`/`project_id`, `change_note = None`, `changed_by = current_user.email`).
  Returns `RequirementResponse` with default `200` status (matching `PUT`'s response
  style — no resource is created from the client's perspective, an existing requirement
  changed state). Requires `current_user` the same way `PUT` does (for `changed_by`).
- `GET /requirements` (`list_requirements`) — same targeted change as the test-case
  precedent: add an `else` branch so when `status_filter` is `None`, filter
  `Requirement.status != "Deprecated"` (in addition to the existing `is_current == True`
  filter). An explicit `?status=Deprecated` still works exactly as before.
  - **Ripple effect**: `RequirementCombobox` (`frontend/src/components/RequirementCombobox.tsx`,
    used by `NewTestCaseDialog`/`EditTestCaseDialog` to pick/re-link a requirement) calls
    `listRequirements` with no `status` param, so it stops offering Deprecated
    requirements as link targets. Treated as correct/desired, same reasoning as the
    test-case precedent's ripple into `RequirementDetailPage`.
  - `GET /requirements/{id}` (single, by id) and `GET /requirements/{req_id}/history` are
    untouched — both always return rows regardless of status, required for the History
    dialog and for viewing a Deprecated requirement's own detail page directly.

## Scope decisions (from brainstorming)

Recorded so implementation doesn't re-litigate them:

1. **Delete is a new, dedicated `DELETE` endpoint that follows the versioning pattern**,
   not a reuse of `PUT` and not an in-place status flip (unlike `TestCase`, which has no
   version concept to preserve). This keeps a clean REST verb and keeps the frontend
   delete flow from having to resend `title`/`description` just to satisfy `PUT`'s
   payload shape.
2. **Edit exposes an optional `change_note` field** (`RequirementUpdate` already accepts
   it) — unlike `TestCase`'s Edit dialog, which has no equivalent. Since `change_note` is
   already surfaced per-row in the History dialog, letting the user explain "why" on edit
   makes that history meaningful. Optional, not required; omitted/blank submits `null`
   (same as Delete, which never sets one).
3. **Edit and Delete are both restricted to the current version** (`requirement.is_current`).
   Both buttons render disabled (with a tooltip) when viewing a historical version —
   mirrors the existing "New Test Case" button's guard. Enforced defensively on the
   backend too (400), not just hidden client-side, per the latent-bug note above.
4. **Delete lives in two places**: `RequirementDetailPage`'s action row (replacing the
   currently-disabled `Edit` button's sibling slot) *and* a per-row action on
   `RequirementsPage`'s table — matching the test-case precedent's decision 5.
5. **Post-edit behavior — navigate, don't merge in place**: because `PUT` returns a
   row with a **new `id`**, `RequirementDetailPage`'s `onUpdated` callback calls
   `navigate('/requirements/' + updated.id, { replace: true })` instead of merging into
   local state. This is the key divergence from the test-case Edit flow (which merges
   in place because `TestCase`'s `PUT` reuses the same `id`).
6. **Post-delete behavior**: from `RequirementDetailPage`, navigate to `/requirements`
   (matches the test-case precedent: the item is gone from the page the user is looking
   at because they've left it). From `RequirementsPage`'s row action: splice the row out
   of the current page's local list state immediately (no refetch), matching the
   test-case precedent exactly.
7. **Delete confirmation**: always a confirm `Dialog` before calling `DELETE` — no
   one-click delete. Confirm dialog does not mention the versioning mechanics under the
   hood (that it's actually a new version with status Deprecated) — kept simple by
   product decision, matching the test-case precedent's decision 3.
8. **`DeleteRequirementDialog` is one reusable component** used from both entry points
   (detail page and list row), not duplicated — matching the test-case precedent.
9. **Error feedback**: matches the test-case precedent's deviation from the create-flow
   convention — failures show only as an error toast (`toast.error(message)`), fired from
   inside `EditRequirementDialog`/`DeleteRequirementDialog` at the point of failure, not
   as inline dialog text. Dialog stays open with field values/state intact on failure so
   the user can retry.
10. **`RequirementsPage`'s status-filter dropdown is unchanged** — still offers
    `Draft`/`Active`/`Deprecated` as explicit choices; picking `Deprecated` explicitly
    still shows exactly those items. What changes is only the default/"All" selection.

## `EditRequirementDialog.tsx` (`frontend/src/components/`)

Props: `{ open: boolean; onOpenChange: (v: boolean) => void; requirement: Requirement; onUpdated: (updated: Requirement) => void }`.

- Same `FormData`-on-submit shape as `NewRequirementDialog`. Fields: `title` (`Input`,
  required, `defaultValue={requirement.title}`), `description` (`Textarea`, required,
  `defaultValue={requirement.description}`), `status` (`Select`, `Draft`/`Active`/
  `Deprecated`, `defaultValue={requirement.status}` — unlike `TestCase`'s Edit dialog,
  `Deprecated` stays a normal selectable option here since `RequirementUpdate` always
  required `status` and Requirement's `Deprecated` isn't reserved to a dedicated
  mechanism the way `TestCase`'s is; a user can still explicitly set `Active`/`Draft` →
  `Deprecated` via Edit if they want a note attached, separately from the no-note Delete
  button).
- New field vs. Create: `change_note` (`Textarea`, optional, no `defaultValue` — always
  starts blank since it describes *this* edit, not a carried-over value). Submitted as
  `undefined` when blank (trimmed empty → omitted from payload, same pattern as
  `preconditions`/`steps` in `EditTestCaseDialog`).
- On submit: `updateRequirement(requirement.id, payload)` → returns a **new** `Requirement`
  (different `id`) → `onOpenChange(false)`, `onUpdated(updated)`. Page-level `onUpdated`
  handles navigation + success toast (see "Wiring into pages"). On failure →
  `toast.error(message)` fired from inside this dialog, dialog stays open with entered
  values intact.
- Submit button: `disabled={submitting}`, label `submitting ? 'Đang lưu...' : 'Lưu'`. No
  combobox/requirement-link guard needed here (unlike `EditTestCaseDialog`) — there's no
  analogous "must pick something" field.

## `DeleteRequirementDialog.tsx` (`frontend/src/components/`)

Props: `{ open: boolean; onOpenChange: (v: boolean) => void; requirement: { id: number; req_id: string } | null; onDeleted: (updated: Requirement) => void }`.

- Small confirm `Dialog`, not a form. Body: `Bạn có chắc chắn muốn xóa requirement {req_id}?`
- Footer: `Hủy` (`variant="outline"`) / `Xóa` (`variant="destructive"`).
- On confirm: `setSubmitting(true)`; `deleteRequirement(requirement.id)`; on success →
  `onOpenChange(false)`, `onDeleted(updated)` (the new Deprecated version row — page
  decides what to do with it, see "Wiring into pages"); on failure → `toast.error(message)`
  fired from inside this dialog, dialog stays open so the user can retry.
- Delete button: `disabled={submitting}`, label `submitting ? 'Đang xóa...' : 'Xóa'`.

## Wiring into pages

- **`RequirementDetailPage.tsx`**: the existing disabled `Edit` button becomes real —
  `disabled={!requirement.is_current}`, `title` tooltip only shown when disabled
  (`"Chỉ có thể sửa phiên bản hiện tại"`), opens `EditRequirementDialog`. `onUpdated`:
  `navigate('/requirements/' + updated.id, { replace: true })`, then
  `toast.success('Đã cập nhật requirement ' + updated.req_id + '.')`. New `Delete` button
  (`variant="destructive" size="sm"`, same row, same `is_current` guard) opens
  `DeleteRequirementDialog`; `onDeleted`: `navigate('/requirements')`,
  `toast.success('Đã xóa requirement ' + requirement.req_id + '.')`.
- **`RequirementsPage.tsx`**: table gets a trailing icon-button column (`Trash2` from
  `lucide-react`, `variant="ghost" size="icon-sm"`, `title="Xóa"`) per row. One
  `DeleteRequirementDialog` instance keyed off `deletingRequirement: { id, req_id } | null`
  state (set by the row button's `onClick`), not one dialog per row. `onDeleted(updated)`:
  `setData((d) => d ? { ...d, items: d.items.filter((r) => r.id !== updated.previous_version_id), total: d.total - 1 } : d)`
  — no refetch, `toast.success('Đã xóa requirement ' + updated.req_id + '.')`.

## `lib/requirements.ts` additions

- `updateRequirement(id: number, payload: { title: string; description: string; status: RequirementStatus; change_note?: string }): Promise<Requirement>` →
  `authFetch('/requirements/${id}', { method: 'PUT', body: payload })`.
- `deleteRequirement(id: number): Promise<Requirement>` →
  `authFetch('/requirements/${id}', { method: 'DELETE' })`.
- No `api.ts` change needed — `RequestOptions.method` already includes `'PUT' | 'DELETE'`
  (widened during the edit/delete test-case pass).

## Error handling & validation

- Required-field validation leans on native HTML (`required`), same as the create
  dialogs.
- Request-level failures (network error, 400 from editing/deleting a stale/non-current
  version, 404 if a requirement was already deleted elsewhere) surface as an **error
  toast**, fired from inside `EditRequirementDialog`/`DeleteRequirementDialog` at the
  point of failure — not as inline dialog text. Dialog stays open with current field
  values/state intact on failure, so the user can retry without re-entering data.
- Every Edit/Delete action gives toast feedback on both outcomes: success toast fires
  from the page-level `onUpdated`/`onDeleted` callback, error toast fires from inside the
  dialog itself.
- 401 handling already global (`api.ts`), untouched.

## Verification plan

No frontend test framework exists in this codebase (deliberate, per `CLAUDE.md`).
Verification for this pass:
- `tsc --noEmit` across all new/changed files.
- Live `curl` against the running backend to confirm: `DELETE /requirements/{id}` creates
  a new Deprecated version as documented; the new `400` guard on `PUT`/`DELETE` fires for
  a non-current id; `GET /requirements` with no `status` param excludes Deprecated while
  `?status=Deprecated` still returns it.
- Targeted pytest additions to `backend/tests/test_requirements.py`:
  - `DELETE` creates a new version with `status=Deprecated`, `is_current=True`, old row's
    `is_current` flips to `False`, `previous_version_id` set correctly.
  - `DELETE` on a non-existent id → 404.
  - `PUT` and `DELETE` on a non-current id → 400 (regression guard for the latent bug).
  - `GET /requirements` with no `status` param excludes a Deprecated requirement;
    `?status=Deprecated` still returns it.
  - Then a full backend test suite run (`pytest`) to confirm no regression.
- Careful code-path reading for the FormData pre-fill/defaultValue wiring, the
  navigate-after-edit redirect to the new id, the row-splice logic on
  `RequirementsPage`, and the navigate-then-toast sequence on `RequirementDetailPage`.
- No browser automation tool is available in this session — dialog open/close, the
  actual row disappearing after delete, and the full edit/delete click-through cannot be
  visually verified by the agent. The implementation report will state plainly which
  claims are code-reviewed vs. actually observed running; an interactive/visual pass is
  left to whoever is driving the session.

## Gap Analysis (for future follow-up, not this pass)

| Capability | This pass |
|---|---|
| Trash bin / restore for deleted (Deprecated) requirements | Mentioned as a possible future feature (same as the test-case precedent), not designed here |
| "Link an existing TC to a requirement" action | Still out of scope — no backend support at all, unrelated to this pass |
| Editing/Deleting a linked-defect's requirement reference on requirement delete | Not addressed — deleting a requirement does not touch `defects.requirement_id` or `test_cases.requirement_id`, both stay pointed at the (now-Deprecated, non-current) row, same as how requirement version updates already leave old test-case links pointing at old versions per `CLAUDE.md` |
