# Edit / Delete Test Case Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the already-existing `PUT /test-cases/{id}` and `DELETE /test-cases/{id}`
backend endpoints into the frontend as an Edit dialog and a Delete confirm dialog, plus one
small backend change so Deprecated (deleted) test cases stop appearing in the default list
view.

**Architecture:** Two new dialog components (`EditTestCaseDialog`, `DeleteTestCaseDialog`)
mirroring the existing `NewTestCaseDialog` pattern (uncontrolled `FormData`-on-submit form,
one shared `RequirementCombobox`), wired into `TestCaseDetailPage` (both) and
`TestCasesPage` (Delete only, as a per-row action). One backend query change
(`list_test_cases`) makes the default/no-filter view exclude `Deprecated` items.

**Tech Stack:** FastAPI + SQLAlchemy (backend, Python), React + TypeScript + Vite +
shadcn/ui (radix-ui primitives) (frontend). No frontend test framework exists in this repo
(deliberate) — frontend verification is `tsc --noEmit` + careful code-path reading, not
unit tests. Backend verification is `pytest`, which the repo already uses.

## Global Constraints

- Design spec: `docs/superpowers/specs/2026-08-09-edit-delete-testcase-design.md` — read
  it if anything below is ambiguous; it has the full reasoning and every scope decision.
- No new backend endpoints or schema/model changes. The only backend change in this plan
  is one `else` branch in the existing `list_test_cases` query (Task 1).
- All new user-facing strings are Vietnamese, matching the rest of the app (see
  `NewTestCaseDialog.tsx` / `RequirementDetailPage.tsx` for tone/vocabulary — "Xóa", "Hủy",
  "Lưu", "Đang tải...", etc.).
- Toast feedback: **success** toasts fire from the page-level callback
  (`onUpdated`/`onDeleted`), **error** toasts fire from inside the dialog itself
  (`toast.error(...)`), replacing the inline `text-destructive` pattern the create-flow
  dialogs use. Every Edit/Delete action gets a toast either way — never both inline text
  and a toast for the same failure.
- `Deprecated` is never a selectable option in any status `Select` (Create has no status
  field at all; Edit's status `Select` only offers `Draft`/`Active`). The only way a test
  case becomes `Deprecated` is the Delete button.
- Button variant `destructive` already exists in `frontend/src/components/ui/button.tsx` —
  do not add new button styling.

---

## Task 1: Backend — exclude Deprecated test cases from the default list view

**Files:**
- Modify: `backend/routers/test_cases.py:52-53`
- Test: `backend/tests/test_test_cases.py`

**Interfaces:**
- Consumes: nothing new — `TestCase.status` column (`models/all_models.py`) already exists.
- Produces: `GET /test-cases` (no `status` query param) now excludes rows where
  `status == "Deprecated"`. `GET /test-cases?status=Deprecated` is unaffected (still an
  exact match, still returns only Deprecated rows). Every later task that calls
  `listTestCases(...)` without a `status` filter relies on this.

- [ ] **Step 1: Write the two failing/guard tests**

Open `backend/tests/test_test_cases.py` and add these two tests after
`test_delete_test_case_soft_deletes` (around line 196, right before
`test_execute_test_case_creates_then_updates_result`):

```python
def test_list_test_cases_excludes_deprecated_by_default(client, auth_headers, db_session):
    req = _create_requirement_row(db_session)
    active = _create_test_case(client, auth_headers, req.id, title="Active one").json()
    deprecated = _create_test_case(client, auth_headers, req.id, title="Deprecated one").json()
    client.delete(f"/test-cases/{deprecated['id']}", headers=auth_headers)

    response = client.get(f"/test-cases?requirement_id={req.id}", headers=auth_headers)
    data = response.json()
    ids = [item["id"] for item in data["items"]]
    assert active["id"] in ids
    assert deprecated["id"] not in ids
    assert data["total"] == 1


def test_list_test_cases_explicit_deprecated_filter_still_works(client, auth_headers, db_session):
    req = _create_requirement_row(db_session)
    deprecated = _create_test_case(client, auth_headers, req.id, title="Deprecated one").json()
    client.delete(f"/test-cases/{deprecated['id']}", headers=auth_headers)

    response = client.get(
        f"/test-cases?requirement_id={req.id}&status=Deprecated", headers=auth_headers
    )
    data = response.json()
    assert data["total"] == 1
    assert data["items"][0]["id"] == deprecated["id"]
```

- [ ] **Step 2: Run tests to verify the first one fails**

Run: `cd backend && venv\Scripts\activate && pytest tests/test_test_cases.py -k "excludes_deprecated_by_default or explicit_deprecated_filter" -v`

Expected: `test_list_test_cases_excludes_deprecated_by_default` **FAILS** (the deprecated
item is still in `ids`, `total` is 2 not 1). `test_list_test_cases_explicit_deprecated_filter_still_works`
**PASSES** already (explicit `status=Deprecated` filtering is existing, untouched behavior)
— that's expected and correct, it's a regression guard, not a new-behavior test.

- [ ] **Step 3: Implement the filter change**

In `backend/routers/test_cases.py`, find this block inside `list_test_cases` (currently
lines 50-53):

```python
    if status_filter is not None:
        query = query.filter(TestCase.status == status_filter)
```

Replace it with:

```python
    if status_filter is not None:
        query = query.filter(TestCase.status == status_filter)
    else:
        query = query.filter(TestCase.status != "Deprecated")
```

- [ ] **Step 4: Run tests to verify both pass**

Run: `cd backend && venv\Scripts\activate && pytest tests/test_test_cases.py -k "excludes_deprecated_by_default or explicit_deprecated_filter" -v`

Expected: both **PASS**.

- [ ] **Step 5: Run the full backend suite to check for regressions**

Run: `cd backend && venv\Scripts\activate && pytest -v`

Expected: all tests pass, including every other `test_test_cases.py`,
`test_traceability.py`, and `test_defects.py` test (traceability builds its own separate
query against `TestCase` directly and doesn't call `list_test_cases`, so it's unaffected —
confirm this by checking its output, not by assumption).

- [ ] **Step 6: Commit**

```bash
git add backend/routers/test_cases.py backend/tests/test_test_cases.py
git commit -m "$(cat <<'EOF'
feat: exclude Deprecated test cases from default list view

GET /test-cases with no status param now filters out Deprecated rows,
so soft-deleting a test case actually removes it from the default
view. Explicit ?status=Deprecated still works unchanged.
EOF
)"
```

---

## Task 2: Frontend — `lib/testCases.ts` update/delete functions

**Files:**
- Modify: `frontend/src/lib/api.ts:16-20`
- Modify: `frontend/src/lib/testCases.ts`

**Interfaces:**
- Consumes: `authFetch<T>(path, options)` from `api.ts`.
- Produces: `updateTestCase(id: number, payload: { title: string; preconditions?: string; steps?: string; expected_result: string; priority: TestCasePriority; status: TestCaseStatus; requirement_id: number }): Promise<TestCase>`
  and `deleteTestCase(id: number): Promise<TestCase>`, both exported from
  `frontend/src/lib/testCases.ts`. Tasks 3 and 4 import these directly.

- [ ] **Step 1: Widen the HTTP method type in `api.ts`**

In `frontend/src/lib/api.ts`, change:

```typescript
type RequestOptions = {
  method?: 'GET' | 'POST'
  body?: unknown
  headers?: Record<string, string>
}
```

to:

```typescript
type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  body?: unknown
  headers?: Record<string, string>
}
```

No other changes needed in this file — `apiFetch`/`authFetch` already forward
`options.method` verbatim to `fetch()`.

- [ ] **Step 2: Add `updateTestCase` and `deleteTestCase` to `testCases.ts`**

In `frontend/src/lib/testCases.ts`, add after the existing `createTestCase` function (end
of file):

```typescript
export async function updateTestCase(
  id: number,
  payload: {
    title: string
    preconditions?: string
    steps?: string
    expected_result: string
    priority: TestCasePriority
    status: TestCaseStatus
    requirement_id: number
  },
): Promise<TestCase> {
  return authFetch<TestCase>(`/test-cases/${id}`, { method: 'PUT', body: payload })
}

export async function deleteTestCase(id: number): Promise<TestCase> {
  return authFetch<TestCase>(`/test-cases/${id}`, { method: 'DELETE' })
}
```

- [ ] **Step 3: Type-check**

Run: `cd frontend && npx tsc --noEmit`

Expected: no errors. (There will likely be pre-existing unrelated errors if other tasks in
this plan haven't run yet only if those other files already reference `updateTestCase`/
`deleteTestCase` — they don't yet at this point in the plan, so this should be clean.)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/api.ts frontend/src/lib/testCases.ts
git commit -m "$(cat <<'EOF'
feat: add updateTestCase/deleteTestCase to lib/testCases.ts

Wires PUT and DELETE /test-cases/{id}, both already-existing backend
endpoints. Widens api.ts's RequestOptions.method union to include PUT
and DELETE (previously GET | POST only — no frontend code called
either method anywhere yet).
EOF
)"
```

---

## Task 3: `EditTestCaseDialog.tsx` component

**Files:**
- Create: `frontend/src/components/EditTestCaseDialog.tsx`

**Interfaces:**
- Consumes: `updateTestCase` (Task 2), `RequirementCombobox` (existing,
  `frontend/src/components/RequirementCombobox.tsx`), `useToast` (existing,
  `frontend/src/lib/toast.tsx`), `TestCaseDetail`/`TestCase`/`TestCasePriority`/
  `TestCaseStatus` types (existing, `frontend/src/lib/testCases.ts`), `RequirementSummary`
  type (existing, `frontend/src/lib/requirements.ts`).
- Produces: `EditTestCaseDialog` component with props
  `{ open: boolean; onOpenChange: (open: boolean) => void; projectId: number; testCase: TestCaseDetail; onUpdated: (testCase: TestCase, requirement: RequirementSummary) => void }`.
  Task 5 renders this directly.

- [ ] **Step 1: Create the component**

Create `frontend/src/components/EditTestCaseDialog.tsx`:

```typescript
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
import { RequirementCombobox } from '@/components/RequirementCombobox'
import type { RequirementSummary } from '@/lib/requirements'
import {
  updateTestCase,
  type TestCase,
  type TestCaseDetail,
  type TestCasePriority,
  type TestCaseStatus,
} from '@/lib/testCases'
import { useToast } from '@/lib/toast'

type EditTestCaseDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: number
  testCase: TestCaseDetail
  onUpdated: (testCase: TestCase, requirement: RequirementSummary) => void
}

const EDITABLE_STATUS_OPTIONS: TestCaseStatus[] = ['Draft', 'Active']

function initialStatus(status: string): TestCaseStatus | undefined {
  return status === 'Draft' || status === 'Active' ? status : undefined
}

export function EditTestCaseDialog({
  open,
  onOpenChange,
  projectId,
  testCase,
  onUpdated,
}: EditTestCaseDialogProps) {
  const toast = useToast()
  const [submitting, setSubmitting] = useState(false)
  const [selectedRequirement, setSelectedRequirement] = useState<RequirementSummary | null>(
    testCase.requirement,
  )
  const [status, setStatus] = useState<TestCaseStatus | undefined>(
    initialStatus(testCase.status),
  )

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedRequirement || !status) return
    const form = event.currentTarget
    const data = new FormData(form)
    const title = String(data.get('title') ?? '').trim()
    const expected_result = String(data.get('expected_result') ?? '').trim()
    const preconditions = String(data.get('preconditions') ?? '').trim()
    const steps = String(data.get('steps') ?? '').trim()
    const priority = String(data.get('priority') ?? 'Medium') as TestCasePriority

    setSubmitting(true)
    try {
      const updated = await updateTestCase(testCase.id, {
        title,
        expected_result,
        preconditions: preconditions || undefined,
        steps: steps || undefined,
        priority,
        status,
        requirement_id: selectedRequirement.id,
      })
      onOpenChange(false)
      onUpdated(updated, selectedRequirement)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Đã có lỗi xảy ra')
    } finally {
      setSubmitting(false)
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setSelectedRequirement(testCase.requirement)
      setStatus(initialStatus(testCase.status))
    }
    onOpenChange(nextOpen)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Sửa Test Case</DialogTitle>
            <DialogDescription>Cập nhật thông tin test case {testCase.code}.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-tc-title">Tiêu đề</Label>
              <Input
                id="edit-tc-title"
                name="title"
                required
                defaultValue={testCase.title}
                placeholder="Nhập tiêu đề test case..."
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Requirement</Label>
              <RequirementCombobox
                projectId={projectId}
                value={selectedRequirement}
                onChange={setSelectedRequirement}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-tc-preconditions">Điều kiện tiên quyết</Label>
              <Textarea
                id="edit-tc-preconditions"
                name="preconditions"
                rows={2}
                defaultValue={testCase.preconditions ?? ''}
                placeholder="Người dùng đã có tài khoản..."
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-tc-steps">Các bước</Label>
              <Textarea
                id="edit-tc-steps"
                name="steps"
                rows={3}
                defaultValue={testCase.steps ?? ''}
                placeholder={'1. Mở trang đăng nhập\n2. Nhập email/mật khẩu\n3. Nhấn Đăng nhập'}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-tc-expected">Kết quả mong đợi</Label>
              <Textarea
                id="edit-tc-expected"
                name="expected_result"
                required
                rows={3}
                defaultValue={testCase.expected_result}
                placeholder="Người dùng được chuyển tới trang Dashboard"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-tc-priority">Độ ưu tiên</Label>
              <Select name="priority" defaultValue={testCase.priority ?? 'Medium'}>
                <SelectTrigger id="edit-tc-priority" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="High">High</SelectItem>
                  <SelectItem value="Medium">Medium</SelectItem>
                  <SelectItem value="Low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-tc-status">Trạng thái</Label>
              <Select value={status} onValueChange={(value) => setStatus(value as TestCaseStatus)}>
                <SelectTrigger id="edit-tc-status" className="w-full">
                  <SelectValue placeholder="Chọn trạng thái..." />
                </SelectTrigger>
                <SelectContent>
                  {EDITABLE_STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              Hủy
            </Button>
            <Button type="submit" disabled={submitting || !selectedRequirement || !status}>
              {submitting ? 'Đang lưu...' : 'Lưu'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

Note the `status` field is **controlled** (`value`/`onValueChange` + local state), unlike
every other field in this form (which stay uncontrolled, read via `FormData` on submit —
same as `NewTestCaseDialog`). This is deliberate: the submit button's disabled guard needs
to know live whether a status has been chosen (relevant when reviving a Deprecated test
case, where no `defaultValue` is set), which `FormData` alone can't provide before submit.

- [ ] **Step 2: Type-check**

Run: `cd frontend && npx tsc --noEmit`

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/EditTestCaseDialog.tsx
git commit -m "feat: add EditTestCaseDialog component"
```

---

## Task 4: `DeleteTestCaseDialog.tsx` component

**Files:**
- Create: `frontend/src/components/DeleteTestCaseDialog.tsx`

**Interfaces:**
- Consumes: `deleteTestCase` (Task 2), `useToast` (existing).
- Produces: `DeleteTestCaseDialog` component with props
  `{ open: boolean; onOpenChange: (open: boolean) => void; testCase: { id: number; code: string } | null; onDeleted: (id: number) => void }`.
  Tasks 5 and 6 both render this same component.

- [ ] **Step 1: Create the component**

Create `frontend/src/components/DeleteTestCaseDialog.tsx`:

```typescript
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
import { deleteTestCase } from '@/lib/testCases'
import { useToast } from '@/lib/toast'

type DeleteTestCaseDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  testCase: { id: number; code: string } | null
  onDeleted: (id: number) => void
}

export function DeleteTestCaseDialog({
  open,
  onOpenChange,
  testCase,
  onDeleted,
}: DeleteTestCaseDialogProps) {
  const toast = useToast()
  const [submitting, setSubmitting] = useState(false)

  async function handleConfirm() {
    if (!testCase) return
    setSubmitting(true)
    try {
      await deleteTestCase(testCase.id)
      onOpenChange(false)
      onDeleted(testCase.id)
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
          <DialogTitle>Xóa test case?</DialogTitle>
          <DialogDescription>
            Bạn có chắc chắn muốn xóa test case {testCase?.code}?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
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

- [ ] **Step 2: Type-check**

Run: `cd frontend && npx tsc --noEmit`

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/DeleteTestCaseDialog.tsx
git commit -m "feat: add DeleteTestCaseDialog component"
```

---

## Task 5: Wire Edit/Delete into `TestCaseDetailPage.tsx`

**Files:**
- Modify: `frontend/src/pages/TestCaseDetailPage.tsx`

**Interfaces:**
- Consumes: `EditTestCaseDialog` (Task 3), `DeleteTestCaseDialog` (Task 4),
  `useCurrentProject` (existing, `frontend/src/lib/currentProject.tsx`), `useToast`
  (existing), `useNavigate` (react-router-dom, existing dependency).
- Produces: nothing new consumed by other tasks — this is a leaf wiring task.

- [ ] **Step 1: Update imports**

In `frontend/src/pages/TestCaseDetailPage.tsx`, replace the import block (current lines
1-15):

```typescript
import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { formatDate } from '@/lib/utils'
import {
  getTestCase,
  getTestCaseResults,
  TC_PRIORITY_BADGE_CLASS,
  TC_STATUS_BADGE_CLASS,
  EXECUTION_RESULT_BADGE_CLASS,
  type TestCaseDetail,
  type TestCaseExecutionHistoryItem,
} from '@/lib/testCases'
```

with:

```typescript
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { formatDate } from '@/lib/utils'
import { useCurrentProject } from '@/lib/currentProject'
import {
  getTestCase,
  getTestCaseResults,
  TC_PRIORITY_BADGE_CLASS,
  TC_STATUS_BADGE_CLASS,
  EXECUTION_RESULT_BADGE_CLASS,
  type TestCaseDetail,
  type TestCaseExecutionHistoryItem,
} from '@/lib/testCases'
import { EditTestCaseDialog } from '@/components/EditTestCaseDialog'
import { DeleteTestCaseDialog } from '@/components/DeleteTestCaseDialog'
import { useToast } from '@/lib/toast'
```

- [ ] **Step 2: Add state and hooks**

Replace the component's opening lines (current):

```typescript
export function TestCaseDetailPage() {
  const { id } = useParams()
  const [testCase, setTestCase] = useState<TestCaseDetail | null>(null)
```

with:

```typescript
export function TestCaseDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const { project } = useCurrentProject()
  const [testCase, setTestCase] = useState<TestCaseDetail | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
```

- [ ] **Step 3: Add the action row**

Replace the title block inside the `return`:

```typescript
      <div>
        <p className="text-sm text-muted-foreground">
          <Link to="/testcases" className="hover:underline">Test Cases</Link> {'>'} {testCase.code}
        </p>
        <h1 className="font-heading text-xl font-semibold">
          {testCase.code}: {testCase.title}
        </h1>
      </div>
```

with:

```typescript
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            <Link to="/testcases" className="hover:underline">Test Cases</Link> {'>'} {testCase.code}
          </p>
          <h1 className="font-heading text-xl font-semibold">
            {testCase.code}: {testCase.title}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!project}
            onClick={() => setEditOpen(true)}
          >
            Edit
          </Button>
          <Button type="button" variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
            Delete
          </Button>
        </div>
      </div>
```

`Edit` is disabled while `!project` — `useCurrentProject()` resolves asynchronously (fetches
the project list once at `AppLayout` mount), and `EditTestCaseDialog` can't render without a
`projectId` for its `RequirementCombobox`. Same guard style as `TestCasesPage`'s existing
"New Test Case" button (`disabled={!project}`). `Delete` needs no such guard — it doesn't
depend on `project` at all.

- [ ] **Step 4: Render the dialogs**

Right before the final closing `</div>` of the component's `return` (after the
`grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]` block, i.e. right after its closing
`</div>`), add:

```typescript
      {project && (
        <EditTestCaseDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          projectId={project.id}
          testCase={testCase}
          onUpdated={(updated, requirement) => {
            setTestCase((tc) => (tc ? { ...tc, ...updated, requirement } : tc))
            toast.success(`Đã cập nhật test case ${updated.code}.`)
          }}
        />
      )}
      <DeleteTestCaseDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        testCase={{ id: testCase.id, code: testCase.code }}
        onDeleted={() => {
          const code = testCase.code
          navigate('/testcases')
          toast.success(`Đã xóa test case ${code}.`)
        }}
      />
```

Note: `code` is captured into a local variable before `navigate(...)` because
`TestCaseDetailPage` unmounts on navigation — reading `testCase.code` after `navigate()` in
the same closure is fine in JS (closures capture by reference to the variable, and
`testCase` itself isn't reassigned before this line runs), but capturing it first makes the
ordering unambiguous to a reader and avoids ever depending on `testCase` still being
truthy after the state that produced this closure is gone.

- [ ] **Step 5: Type-check**

Run: `cd frontend && npx tsc --noEmit`

Expected: no errors.

- [ ] **Step 6: Manual verification against the running backend**

This page has no automated test coverage (no frontend test framework in this repo). With
`npm run dev` running (root `package.json`, starts db + backend + frontend together):
- Navigate to `/testcases`, open any test case's detail page.
- Confirm the new Edit/Delete buttons render in the action row.
- Confirm `tsc --noEmit` passing plus a code-path re-read (defaultValue wiring,
  `onUpdated`/`onDeleted` closures) is what's being claimed here — actual click-through
  (dialog opening, save reflecting instantly, delete navigating back) requires a human or a
  browser-automation tool neither of which is available to the agent in this session; state
  this plainly rather than claiming it was observed.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/TestCaseDetailPage.tsx
git commit -m "feat: wire Edit and Delete actions into TestCaseDetailPage"
```

---

## Task 6: Wire Delete into `TestCasesPage.tsx` (per-row action)

**Files:**
- Modify: `frontend/src/pages/TestCasesPage.tsx`

**Interfaces:**
- Consumes: `DeleteTestCaseDialog` (Task 4).
- Produces: nothing new consumed by other tasks — leaf wiring task.

- [ ] **Step 1: Update imports**

In `frontend/src/pages/TestCasesPage.tsx`, add `Trash2` to the existing `lucide-react`
import and add the dialog import. Current:

```typescript
import { Plus } from 'lucide-react'
```

becomes:

```typescript
import { Plus, Trash2 } from 'lucide-react'
```

and add, alongside the existing `NewTestCaseDialog` import:

```typescript
import { NewTestCaseDialog } from '@/components/NewTestCaseDialog'
import { DeleteTestCaseDialog } from '@/components/DeleteTestCaseDialog'
```

- [ ] **Step 2: Add state for the row being deleted**

In the component body, alongside the existing `const [newOpen, setNewOpen] = useState(false)`,
add:

```typescript
  const [deletingTestCase, setDeletingTestCase] = useState<{ id: number; code: string } | null>(null)
```

- [ ] **Step 3: Add the trailing column header**

In the table header, current:

```typescript
                <TableHead className="pr-4">Updated</TableHead>
```

becomes:

```typescript
                <TableHead>Updated</TableHead>
                <TableHead className="w-8 pr-4" />
```

- [ ] **Step 4: Add the row action cell**

In the row rendering, current last cell:

```typescript
                  <TableCell className="pr-4 text-muted-foreground">{formatDate(tc.updated_at)}</TableCell>
                </TableRow>
```

becomes:

```typescript
                  <TableCell className="text-muted-foreground">{formatDate(tc.updated_at)}</TableCell>
                  <TableCell className="pr-4">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      title="Xóa"
                      onClick={() => setDeletingTestCase({ id: tc.id, code: tc.code })}
                    >
                      <Trash2 />
                    </Button>
                  </TableCell>
                </TableRow>
```

- [ ] **Step 5: Render one shared dialog instance and splice on delete**

Right after the existing `{project && (<NewTestCaseDialog ... />)}` block, add:

```typescript
      <DeleteTestCaseDialog
        open={deletingTestCase !== null}
        onOpenChange={(open) => {
          if (!open) setDeletingTestCase(null)
        }}
        testCase={deletingTestCase}
        onDeleted={(deletedId) => {
          setData((d) =>
            d
              ? {
                  ...d,
                  items: d.items.filter((tc) => tc.id !== deletedId),
                  total: d.total - 1,
                }
              : d,
          )
          toast.success(`Đã xóa test case ${deletingTestCase?.code ?? ''}.`)
          setDeletingTestCase(null)
        }}
      />
```

- [ ] **Step 6: Type-check**

Run: `cd frontend && npx tsc --noEmit`

Expected: no errors.

- [ ] **Step 7: Manual verification against the running backend**

Same caveat as Task 5 Step 6 — no frontend test framework, no browser automation available
this session. Confirm via `tsc --noEmit` and a careful re-read of the row-splice closure
(does it correctly reference `deletedId`, not stale `tc` from the `.map()`?) rather than
claiming the row-disappearing behavior was visually observed.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/pages/TestCasesPage.tsx
git commit -m "feat: wire Delete action into TestCasesPage table rows"
```

---

## Plan Self-Review Notes

- **Spec coverage**: every scope decision (1-12) in
  `docs/superpowers/specs/2026-08-09-edit-delete-testcase-design.md` maps to a task above:
  decisions 1/7 → Task 5 (no versioning, in-place merge); 2 → Task 3 (requirement stays
  editable); 3/4/5/6 → Tasks 4/5/6 (Delete wording, confirm dialog, two entry points,
  splice-vs-navigate); 8 → Tasks 3/4 (dialog structure); 9/10/11 → Task 1 + Task 3 (backend
  filter, restricted status options, revival flow); 12 → Tasks 3/4 (toast-only errors).
- **Type consistency checked**: `EditTestCaseDialog`'s `onUpdated` signature
  (`(testCase: TestCase, requirement: RequirementSummary) => void`) matches exactly between
  its definition (Task 3) and its call site in `TestCaseDetailPage` (Task 5). `TestCase`/
  `TestCaseDetail`/`TestCasePriority`/`TestCaseStatus`/`RequirementSummary` are all existing
  types, not redefined anywhere in this plan.
- **No backend schema/model changes** anywhere in this plan — only the one query-logic
  `else` branch in Task 1, consistent with the spec's "no new endpoints" constraint.
