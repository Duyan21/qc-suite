# Edit / Delete Requirement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire real Edit and Delete flows for `Requirement` into the frontend, backed by
one new backend endpoint (`DELETE /requirements/{id}`) and two small hardening/filtering
changes to existing endpoints.

**Architecture:** `Requirement` is append-only versioned — editing and "deleting" both
insert a new row (never update in place), matching the existing `PUT` endpoint's
established pattern. `DELETE /requirements/{id}` is new and reuses that exact versioning
shape, setting `status="Deprecated"` on the new row. The frontend gets two new dialog
components (`EditRequirementDialog`, `DeleteRequirementDialog`) wired into
`RequirementDetailPage` (both actions) and `RequirementsPage` (delete only, as a
per-row action), following the file/component shape already established by
`EditTestCaseDialog`/`DeleteTestCaseDialog`.

**Tech Stack:** FastAPI + SQLAlchemy + Pydantic (backend), React + TypeScript + shadcn/ui
(frontend), pytest (backend tests only — no frontend test framework, per project
convention).

## Global Constraints

- Never update `requirements` rows in place — always insert a new version row and flip
  the old row's `is_current` to `False` (per `CLAUDE.md`'s Requirement Versioning
  decision).
- `PUT /requirements/{id}` and the new `DELETE /requirements/{id}` must both reject
  (`400`) calls against a non-current (`is_current=False`) row.
- `GET /requirements` excludes `status="Deprecated"` when no `status` query param is
  given; an explicit `?status=Deprecated` still returns those rows unchanged.
- Frontend error feedback for Edit/Delete is toast-only (`toast.error(...)`), never
  inline dialog text — dialogs stay open with field values intact on failure.
- Success toasts fire from the page-level `onUpdated`/`onDeleted` callback, not from
  inside the dialog components.
- All UI-facing strings are Vietnamese, matching the rest of the Requirement/TestCase
  pages (`Sửa`, `Xóa`, `Hủy`, `Đang lưu...`, `Đang xóa...`, etc. — see task bodies for
  exact copy).
- Import alias `@/*` → `src/*`; use it in all new frontend files, not relative `../`
  imports.

---

## Task 1: Backend — reject `PUT /requirements/{id}` on a non-current version

**Files:**
- Modify: `backend/routers/requirements.py:81-109` (`update_requirement`)
- Test: `backend/tests/test_requirements.py`

**Interfaces:**
- Consumes: nothing new — uses the existing `Requirement` model (`is_current` column) and
  the existing `update_requirement` function signature.
- Produces: `update_requirement` now raises `HTTPException(400, ...)` when the target row
  is not the current version. This same guard shape is reused verbatim by Task 2's
  `delete_requirement`.

- [ ] **Step 1: Write the failing test**

Add to `backend/tests/test_requirements.py` (after `test_update_requirement_creates_new_version_and_history_has_three`):

```python
def test_update_requirement_rejects_non_current_version(client, auth_headers, project):
    v1 = _create_requirement(client, auth_headers, project.id).json()

    update_body = {
        "title": "User can log in (v2)",
        "description": "Adds OTP step",
        "status": "Active",
    }
    client.put(f"/requirements/{v1['id']}", json=update_body, headers=auth_headers)

    # v1 is no longer current — a second PUT against it must be rejected
    response = client.put(f"/requirements/{v1['id']}", json=update_body, headers=auth_headers)
    assert response.status_code == 400
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && venv\Scripts\activate && pytest tests/test_requirements.py::test_update_requirement_rejects_non_current_version -v`
Expected: FAIL — either a 500 from a UNIQUE constraint violation (inserting `version=2`
a second time) or, if SQLAlchemy/session state masks that, a 200 where 400 was expected.
Either way, the assertion `response.status_code == 400` fails.

- [ ] **Step 3: Write minimal implementation**

In `backend/routers/requirements.py`, inside `update_requirement`, right after the
existing `if old is None:` 404 check:

```python
@router.put("/{id}", response_model=RequirementResponse)
def update_requirement(
    id: int,
    payload: RequirementUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    old = db.get(Requirement, id)
    if old is None:
        raise HTTPException(status_code=404, detail="Requirement not found")
    if not old.is_current:
        raise HTTPException(status_code=400, detail="Requirement is not the current version")

    old.is_current = False
    # ... rest unchanged
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && venv\Scripts\activate && pytest tests/test_requirements.py -v`
Expected: PASS for the new test, and all pre-existing tests in this file still PASS
(the pre-existing `test_update_requirement_creates_new_version_and_history_has_three`
test calls `PUT` on `v1['id']` then `v2['id']` — both are current at the time they're
called, so the new guard doesn't affect it).

- [ ] **Step 5: Commit**

```bash
git add backend/routers/requirements.py backend/tests/test_requirements.py
git commit -m "fix: reject PUT /requirements/{id} on a non-current version"
```

---

## Task 2: Backend — add `DELETE /requirements/{id}`

**Files:**
- Modify: `backend/routers/requirements.py` (add new endpoint after `update_requirement`)
- Test: `backend/tests/test_requirements.py`

**Interfaces:**
- Consumes: `Requirement` model, `RequirementResponse` schema (both already imported in
  `requirements.py`), the `if not old.is_current: raise HTTPException(400, ...)` guard
  pattern from Task 1.
- Produces: `DELETE /requirements/{id}` → `RequirementResponse` (the newly-inserted
  `Deprecated` version row). Frontend Task 4 (`deleteRequirement`) calls this exact route
  and method.

- [ ] **Step 1: Write the failing tests**

Add to `backend/tests/test_requirements.py`:

```python
def test_delete_requirement_creates_deprecated_version(client, auth_headers, project):
    v1 = _create_requirement(client, auth_headers, project.id).json()

    response = client.delete(f"/requirements/{v1['id']}", headers=auth_headers)
    assert response.status_code == 200
    deleted = response.json()
    assert deleted["status"] == "Deprecated"
    assert deleted["version"] == 2
    assert deleted["is_current"] is True
    assert deleted["previous_version_id"] == v1["id"]
    assert deleted["req_id"] == v1["req_id"]
    assert deleted["title"] == v1["title"]
    assert deleted["description"] == v1["description"]
    assert deleted["change_note"] is None

    old = client.get(f"/requirements/{v1['id']}", headers=auth_headers).json()
    assert old["is_current"] is False


def test_delete_requirement_missing_returns_404(client, auth_headers):
    response = client.delete("/requirements/999999", headers=auth_headers)
    assert response.status_code == 404


def test_delete_requirement_rejects_non_current_version(client, auth_headers, project):
    v1 = _create_requirement(client, auth_headers, project.id).json()
    client.delete(f"/requirements/{v1['id']}", headers=auth_headers)

    response = client.delete(f"/requirements/{v1['id']}", headers=auth_headers)
    assert response.status_code == 400


def test_delete_requirement_requires_auth(client, project):
    # The auth dependency rejects before the id is looked up, so the specific
    # id value doesn't matter here — no need to create a real requirement first.
    response = client.delete("/requirements/1")
    assert response.status_code == 401
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && venv\Scripts\activate && pytest tests/test_requirements.py -k delete_requirement -v`
Expected: FAIL with `404 Not Found` / `405 Method Not Allowed` for all four — the route
doesn't exist yet.

- [ ] **Step 3: Write minimal implementation**

In `backend/routers/requirements.py`, add after `update_requirement` (before
`get_requirement_history`):

```python
@router.delete("/{id}", response_model=RequirementResponse)
def delete_requirement(
    id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    old = db.get(Requirement, id)
    if old is None:
        raise HTTPException(status_code=404, detail="Requirement not found")
    if not old.is_current:
        raise HTTPException(status_code=400, detail="Requirement is not the current version")

    old.is_current = False

    new = Requirement(
        req_id=old.req_id,
        version=old.version + 1,
        title=old.title,
        description=old.description,
        status="Deprecated",
        is_current=True,
        change_note=None,
        changed_by=current_user.email,
        previous_version_id=old.id,
        project_id=old.project_id,
    )
    db.add(new)
    db.commit()
    db.refresh(new)
    return new
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && venv\Scripts\activate && pytest tests/test_requirements.py -v`
Expected: PASS for all new tests, no regressions in the file.

- [ ] **Step 5: Commit**

```bash
git add backend/routers/requirements.py backend/tests/test_requirements.py
git commit -m "feat: add DELETE /requirements/{id}, versioned soft-delete"
```

---

## Task 3: Backend — `GET /requirements` excludes Deprecated by default

**Files:**
- Modify: `backend/routers/requirements.py:22-49` (`list_requirements`)
- Test: `backend/tests/test_requirements.py`

**Interfaces:**
- Consumes: existing `list_requirements` function and its `status_filter` query param.
- Produces: no new interface — behavior-only change. Frontend Task 4's
  `RequirementCombobox`/`RequirementsPage` callers rely on this filtering happening
  server-side (no frontend code change needed to pick it up, matching the test-case
  precedent).

- [ ] **Step 1: Write the failing test**

Add to `backend/tests/test_requirements.py`:

```python
def test_list_requirements_excludes_deprecated_by_default(client, auth_headers, project):
    _create_requirement(client, auth_headers, project.id, title="Active one", status="Active")
    deprecated_resp = _create_requirement(
        client, auth_headers, project.id, title="Deprecated one", status="Deprecated"
    )
    deprecated = deprecated_resp.json()

    response = client.get(f"/requirements?project_id={project.id}", headers=auth_headers)
    data = response.json()
    assert data["total"] == 1
    assert data["items"][0]["title"] == "Active one"

    explicit = client.get(
        f"/requirements?project_id={project.id}&status=Deprecated", headers=auth_headers
    )
    explicit_data = explicit.json()
    assert explicit_data["total"] == 1
    assert explicit_data["items"][0]["id"] == deprecated["id"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && venv\Scripts\activate && pytest tests/test_requirements.py::test_list_requirements_excludes_deprecated_by_default -v`
Expected: FAIL — `data["total"] == 2` (both rows returned) on the first assertion.

- [ ] **Step 3: Write minimal implementation**

In `backend/routers/requirements.py`, inside `list_requirements`:

```python
    query = db.query(Requirement).filter(
        Requirement.project_id == project_id, Requirement.is_current == True
    )
    if status_filter is not None:
        query = query.filter(Requirement.status == status_filter)
    else:
        query = query.filter(Requirement.status != "Deprecated")
    if search is not None:
        query = query.filter(Requirement.title.ilike(f"%{search}%"))
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && venv\Scripts\activate && pytest tests/test_requirements.py -v`
Expected: PASS for the new test. Check specifically that
`test_list_requirements_returns_only_current_versions` and
`test_list_requirements_filters_by_status` still pass (neither uses `Deprecated` as a
status, so both are unaffected).

- [ ] **Step 5: Run the full backend suite**

Run: `cd backend && venv\Scripts\activate && pytest`
Expected: PASS, no regressions anywhere (e.g. `test_traceability.py`, which may also
list requirements — confirm it doesn't depend on Deprecated requirements appearing in
`GET /requirements`'s default view).

- [ ] **Step 6: Commit**

```bash
git add backend/routers/requirements.py backend/tests/test_requirements.py
git commit -m "fix: exclude Deprecated requirements from default list view"
```

---

## Task 4: Frontend — `updateRequirement`/`deleteRequirement` in `lib/requirements.ts`

**Files:**
- Modify: `frontend/src/lib/requirements.ts` (append after `createRequirement`)

**Interfaces:**
- Consumes: `authFetch` from `./api` (already imported), `Requirement`/`RequirementStatus`
  types (already defined in this file).
- Produces: `updateRequirement(id: number, payload: { title: string; description: string; status: RequirementStatus; change_note?: string }): Promise<Requirement>`
  and `deleteRequirement(id: number): Promise<Requirement>` — both consumed by Task 5
  (`EditRequirementDialog`) and Task 6 (`DeleteRequirementDialog`) respectively.

- [ ] **Step 1: Add the two functions**

Append to `frontend/src/lib/requirements.ts`, after the existing `createRequirement`:

```ts
export async function updateRequirement(
  id: number,
  payload: {
    title: string
    description: string
    status: RequirementStatus
    change_note?: string
  },
): Promise<Requirement> {
  return authFetch<Requirement>(`/requirements/${id}`, { method: 'PUT', body: payload })
}

export async function deleteRequirement(id: number): Promise<Requirement> {
  return authFetch<Requirement>(`/requirements/${id}`, { method: 'DELETE' })
}
```

- [ ] **Step 2: Verify with the TypeScript compiler**

Run: `cd frontend && npx tsc --noEmit`
Expected: no new errors (this file has no consumers yet, so this just confirms the
additions themselves type-check).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/requirements.ts
git commit -m "feat: add updateRequirement/deleteRequirement to lib/requirements.ts"
```

---

## Task 5: Frontend — `EditRequirementDialog.tsx`

**Files:**
- Create: `frontend/src/components/EditRequirementDialog.tsx`

**Interfaces:**
- Consumes: `updateRequirement` (Task 4), `Requirement`/`RequirementStatus` types from
  `@/lib/requirements`, shadcn `Dialog`/`Button`/`Input`/`Label`/`Textarea`/`Select`
  primitives (all already used identically by `NewRequirementDialog.tsx` and
  `EditTestCaseDialog.tsx`), `useToast` from `@/lib/toast`.
- Produces: `EditRequirementDialog` component with props
  `{ open: boolean; onOpenChange: (v: boolean) => void; requirement: Requirement; onUpdated: (updated: Requirement) => void }`,
  consumed by Task 7 (`RequirementDetailPage.tsx`).

- [ ] **Step 1: Write the component**

Create `frontend/src/components/EditRequirementDialog.tsx`:

```tsx
import { useState, type FormEvent } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { updateRequirement, type Requirement, type RequirementStatus } from '@/lib/requirements'
import { useToast } from '@/lib/toast'

type EditRequirementDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  requirement: Requirement
  onUpdated: (updated: Requirement) => void
}

export function EditRequirementDialog({
  open,
  onOpenChange,
  requirement,
  onUpdated,
}: EditRequirementDialogProps) {
  const toast = useToast()
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const title = String(data.get('title') ?? '').trim()
    const description = String(data.get('description') ?? '').trim()
    const status = String(data.get('status') ?? requirement.status) as RequirementStatus
    const changeNote = String(data.get('change_note') ?? '').trim()

    setSubmitting(true)
    try {
      const updated = await updateRequirement(requirement.id, {
        title,
        description,
        status,
        change_note: changeNote || undefined,
      })
      onOpenChange(false)
      onUpdated(updated)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Đã có lỗi xảy ra')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Sửa Requirement</DialogTitle>
            <DialogDescription>Cập nhật thông tin requirement {requirement.req_id}.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-req-title">Tiêu đề</Label>
              <Input
                id="edit-req-title"
                name="title"
                required
                defaultValue={requirement.title}
                placeholder="Nhập tiêu đề requirement..."
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-req-description">Mô tả</Label>
              <Textarea
                id="edit-req-description"
                name="description"
                required
                rows={4}
                defaultValue={requirement.description}
                placeholder="Mô tả chi tiết requirement..."
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-req-status">Trạng thái</Label>
              <Select name="status" defaultValue={requirement.status}>
                <SelectTrigger id="edit-req-status" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Draft">Draft</SelectItem>
                  <SelectItem value="Active">Active</SelectItem>
                  <SelectItem value="Deprecated">Deprecated</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-req-change-note">Ghi chú thay đổi (tùy chọn)</Label>
              <Textarea
                id="edit-req-change-note"
                name="change_note"
                rows={2}
                placeholder="Lý do thay đổi..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Hủy
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Đang lưu...' : 'Lưu'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Verify with the TypeScript compiler**

Run: `cd frontend && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/EditRequirementDialog.tsx
git commit -m "feat: add EditRequirementDialog component"
```

---

## Task 6: Frontend — `DeleteRequirementDialog.tsx`

**Files:**
- Create: `frontend/src/components/DeleteRequirementDialog.tsx`

**Interfaces:**
- Consumes: `deleteRequirement` (Task 4), shadcn `Dialog`/`Button` primitives, `useToast`.
- Produces: `DeleteRequirementDialog` component with props
  `{ open: boolean; onOpenChange: (v: boolean) => void; requirement: { id: number; req_id: string } | null; onDeleted: (updated: Requirement) => void }`,
  consumed by Task 7 and Task 8.

- [ ] **Step 1: Write the component**

Create `frontend/src/components/DeleteRequirementDialog.tsx`:

```tsx
import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { deleteRequirement, type Requirement } from '@/lib/requirements'
import { useToast } from '@/lib/toast'

type DeleteRequirementDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  requirement: { id: number; req_id: string } | null
  onDeleted: (updated: Requirement) => void
}

export function DeleteRequirementDialog({
  open,
  onOpenChange,
  requirement,
  onDeleted,
}: DeleteRequirementDialogProps) {
  const toast = useToast()
  const [submitting, setSubmitting] = useState(false)

  async function handleConfirm() {
    if (!requirement) return
    setSubmitting(true)
    try {
      const updated = await deleteRequirement(requirement.id)
      onOpenChange(false)
      onDeleted(updated)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Đã có lỗi xảy ra')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Xóa requirement?</DialogTitle>
          <DialogDescription>
            Bạn có chắc chắn muốn xóa requirement {requirement?.req_id}?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={submitting} onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={submitting}
            onClick={handleConfirm}
          >
            {submitting ? 'Đang xóa...' : 'Xóa'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Verify with the TypeScript compiler**

Run: `cd frontend && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/DeleteRequirementDialog.tsx
git commit -m "feat: add DeleteRequirementDialog component"
```

---

## Task 7: Frontend — wire Edit and Delete into `RequirementDetailPage.tsx`

**Files:**
- Modify: `frontend/src/pages/RequirementDetailPage.tsx`

**Interfaces:**
- Consumes: `EditRequirementDialog` (Task 5), `DeleteRequirementDialog` (Task 6),
  `useNavigate` from `react-router-dom`.
- Produces: no new exports — this is a leaf wiring task.

- [ ] **Step 1: Add imports**

In `frontend/src/pages/RequirementDetailPage.tsx`, change the `react-router-dom` import
(currently `import { Link, useParams } from 'react-router-dom'`) to:

```tsx
import { Link, useNavigate, useParams } from 'react-router-dom'
```

Add two new imports after the existing `import { NewTestCaseDialog } from '@/components/NewTestCaseDialog'` line:

```tsx
import { EditRequirementDialog } from '@/components/EditRequirementDialog'
import { DeleteRequirementDialog } from '@/components/DeleteRequirementDialog'
```

- [ ] **Step 2: Add `navigate` call and dialog-open state**

Inside the `RequirementDetailPage` function body, add `const navigate = useNavigate()`
right after `const { id } = useParams()`. Add two new state variables next to the
existing `const [newTcOpen, setNewTcOpen] = useState(false)` line:

```tsx
const [editOpen, setEditOpen] = useState(false)
const [deleteOpen, setDeleteOpen] = useState(false)
```

- [ ] **Step 3: Replace the disabled Edit button and add a Delete button**

Replace this block (the disabled `Edit` button in the header action row):

```tsx
          <Button type="button" variant="outline" size="sm" disabled title="Chưa hỗ trợ">
            Edit
          </Button>
```

with:

```tsx
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!requirement.is_current}
            title={requirement.is_current ? undefined : 'Chỉ có thể sửa phiên bản hiện tại'}
            onClick={() => setEditOpen(true)}
          >
            Sửa
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={!requirement.is_current}
            title={requirement.is_current ? undefined : 'Chỉ có thể xóa phiên bản hiện tại'}
            onClick={() => setDeleteOpen(true)}
          >
            Xóa
          </Button>
```

- [ ] **Step 4: Add the two dialogs before the closing `</div>` of the component**

Right after the existing `<NewTestCaseDialog ... />` block (which is the last element
before the final closing `</div>`), add:

```tsx
      <EditRequirementDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        requirement={requirement}
        onUpdated={(updated) => {
          toast.success(`Đã cập nhật requirement ${updated.req_id}.`)
          navigate(`/requirements/${updated.id}`, { replace: true })
        }}
      />

      <DeleteRequirementDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        requirement={{ id: requirement.id, req_id: requirement.req_id }}
        onDeleted={(updated) => {
          toast.success(`Đã xóa requirement ${updated.req_id}.`)
          navigate('/requirements')
        }}
      />
```

- [ ] **Step 5: Verify with the TypeScript compiler**

Run: `cd frontend && npx tsc --noEmit`
Expected: no new errors. Pay attention to any complaint about unused imports or the
`navigate`/`toast` variables — both are now used.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/RequirementDetailPage.tsx
git commit -m "feat: wire Edit and Delete actions into RequirementDetailPage"
```

---

## Task 8: Frontend — wire Delete row action into `RequirementsPage.tsx`

**Files:**
- Modify: `frontend/src/pages/RequirementsPage.tsx`

**Interfaces:**
- Consumes: `DeleteRequirementDialog` (Task 6), `Trash2` icon from `lucide-react`.
- Produces: no new exports — leaf wiring task.

- [ ] **Step 1: Add imports**

Change the `lucide-react` import (currently `import { Plus } from 'lucide-react'`) to:

```tsx
import { Plus, Trash2 } from 'lucide-react'
```

Add a new import after `import { NewRequirementDialog } from '@/components/NewRequirementDialog'`:

```tsx
import { DeleteRequirementDialog } from '@/components/DeleteRequirementDialog'
```

- [ ] **Step 2: Add `deletingRequirement` state**

Add next to the existing `const [newOpen, setNewOpen] = useState(false)` line:

```tsx
const [deletingRequirement, setDeletingRequirement] = useState<{ id: number; req_id: string } | null>(null)
```

- [ ] **Step 3: Add a trailing actions column to the table header**

Change:

```tsx
                <TableHead>Linked TC</TableHead>
                <TableHead className="pr-4">Updated</TableHead>
              </TableRow>
```

to:

```tsx
                <TableHead>Linked TC</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead className="w-8 pr-4" />
              </TableRow>
```

(Note: `Updated` loses its `pr-4` class since that padding now belongs to the new
trailing empty header cell.)

- [ ] **Step 4: Add the delete icon-button cell to each row**

Change:

```tsx
                  <TableCell className="pr-4 text-muted-foreground">{formatDate(req.created_at)}</TableCell>
                </TableRow>
```

to:

```tsx
                  <TableCell className="text-muted-foreground">{formatDate(req.created_at)}</TableCell>
                  <TableCell className="pr-4">
                    {req.status !== 'Deprecated' && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        title="Xóa"
                        onClick={() => setDeletingRequirement({ id: req.id, req_id: req.req_id })}
                      >
                        <Trash2 />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
```

- [ ] **Step 5: Add the dialog instance before the component's closing `</div>`**

Right after the existing `<NewRequirementDialog ... />` block, add:

```tsx
      <DeleteRequirementDialog
        open={deletingRequirement !== null}
        onOpenChange={(open) => {
          if (!open) setDeletingRequirement(null)
        }}
        requirement={deletingRequirement}
        onDeleted={(updated) => {
          setData((d) =>
            d
              ? {
                  ...d,
                  items: d.items.filter((r) => r.id !== updated.id),
                  total: d.total - 1,
                }
              : d,
          )
          toast.success(`Đã xóa requirement ${updated.req_id}.`)
          setDeletingRequirement(null)
        }}
      />
```

- [ ] **Step 6: Verify with the TypeScript compiler**

Run: `cd frontend && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/RequirementsPage.tsx
git commit -m "feat: wire Delete action into RequirementsPage table rows"
```

---

## Task 9: Full verification pass

**Files:** none (verification only, no code changes expected)

**Interfaces:** N/A

- [ ] **Step 1: Full backend test suite**

Run: `cd backend && venv\Scripts\activate && pytest`
Expected: all tests PASS, including every new test added in Tasks 1–3.

- [ ] **Step 2: Full frontend type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors across the whole project.

- [ ] **Step 3: Live curl smoke test — DELETE and the PUT/DELETE non-current guard**

With the dev stack running (`npm run dev` from repo root), get a fresh token and a
current requirement id, then:

```bash
# Delete it — expect 200, status=Deprecated, version incremented, is_current=true
curl -s -X DELETE http://localhost:8000/requirements/<id> -H "Authorization: Bearer <token>"

# Try deleting the same (now non-current) id again — expect 400
curl -s -X DELETE http://localhost:8000/requirements/<id> -H "Authorization: Bearer <token>"

# Try PUT on the same non-current id — expect 400
curl -s -X PUT http://localhost:8000/requirements/<id> \
  -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{"title":"x","description":"y","status":"Active"}'
```

- [ ] **Step 4: Live curl smoke test — default list filtering**

```bash
# No status param — Deprecated items must be absent
curl -s "http://localhost:8000/requirements?project_id=<project_id>" -H "Authorization: Bearer <token>"

# Explicit status=Deprecated — must still return them
curl -s "http://localhost:8000/requirements?project_id=<project_id>&status=Deprecated" -H "Authorization: Bearer <token>"
```

- [ ] **Step 5: Report verification status**

Write a short summary distinguishing what was actually observed running (pytest output,
curl responses) from what was only code-reviewed (dialog open/close, the row
disappearing after delete in the browser, the post-edit URL redirect actually landing on
the new version's page) — no browser automation tool is available in this environment,
matching the same caveat recorded in the edit/delete test-case pass. Hand off the
interactive/visual click-through to whoever is driving the session.

- [ ] **Step 6: No commit for this task**

This is a verification-only task; nothing to stage or commit unless Step 1–4 surface a
bug that needs a follow-up fix (in which case, fix it, re-run the relevant step, and
commit the fix with a clear message describing what was wrong).
