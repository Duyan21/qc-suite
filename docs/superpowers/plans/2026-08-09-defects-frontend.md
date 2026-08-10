# Defects Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the placeholder `DefectsPage` with a real list (stats row, severity/status
filters, search, pagination), a "Log Defect" create flow, an Edit flow, and a detail page —
wired to the real backend, following the patterns already established by Requirements and
Test Cases.

**Architecture:** Backend gets a direct `project_id` column on `defects` (mirroring
`Release`/`Requirement`) so defects — which can optionally link to a TestCase and/or a
Requirement but don't have to link to either — can still be scoped per project. The list
endpoint gains project scoping, search, and an embedded `TestCaseSummary` per row; a new
`GET /defects/stats` endpoint feeds the stats row independent of the list's filters/paging.
Frontend mirrors `TestCasesPage`/`TestCaseDetailPage`'s exact component shape: one new
`TestCaseCombobox` (mirroring the existing `RequirementCombobox`), `NewDefectDialog` /
`EditDefectDialog` (mirroring `NewTestCaseDialog` / `EditTestCaseDialog`), and
`DefectDetailPage` (mirroring `TestCaseDetailPage`).

**Tech Stack:** FastAPI + SQLAlchemy + Alembic (backend, Python 3.11). React + TypeScript +
Vite + shadcn/ui (radix-ui primitives) (frontend). Backend verification is `pytest` (repo
already uses it, hits the real dev DB inside a rolled-back transaction per test — see
`backend/tests/conftest.py`). No frontend test framework exists in this repo (deliberate) —
frontend verification is `tsc --noEmit`, a `curl`-based exercise of the real running
backend, and one ad hoc Vite-SSR-loader script for `lib/defects.ts` specifically (per the
technique documented in `CLAUDE.md`), not unit tests.

## Global Constraints

- Design spec: `docs/superpowers/specs/2026-08-09-defects-frontend-design.md` — read it if
  anything below is ambiguous; it has the full reasoning and every scope decision
  (status values, dropped Assigned/Reporter columns, Fixed-column choice, project-scoping
  decision).
- Delete is **out of scope** — no `DELETE /defects/{id}` exists and none is added here.
- **Deviation from the approved design, resolved during planning:** the design's list-table
  section mentioned a per-row Edit icon button. On closer look at the codebase, neither
  `RequirementsPage` nor `TestCasesPage` puts Edit on the list row — both put it only on
  the entity's detail page (`RequirementDetailPage`/`TestCaseDetailPage`), reserving list-row
  icons for Delete only (which defects don't have). To stay consistent with that convention,
  **Edit is wired only from `DefectDetailPage`** (Task 7 dialog, Task 8 page), not from
  `DefectsPage`'s table rows. `DefectsPage`'s table therefore has no trailing action column
  at all. This doesn't reduce scope — Edit is still fully wired — it only changes where the
  button lives.
- All new user-facing strings are Vietnamese, matching the rest of the app (see
  `NewTestCaseDialog.tsx` / `TestCasesPage.tsx` for tone/vocabulary — "Đang tải...", "Thử
  lại", "Không tìm thấy...", "Vui lòng chọn một dự án.", "Lưu", "Hủy").
- Every new/changed list-style backend query follows the existing pagination contract:
  `{ items, total, page, limit }`.
- Route registration order matters: `GET /defects/stats` (Task 3) **must** be registered
  before `GET /defects/{id}` in `backend/routers/defects.py`, otherwise FastAPI matches
  `/defects/stats` against the `{id}` path param first and fails trying to parse `"stats"`
  as an int.
- Badge color convention (already established by `TC_PRIORITY_BADGE_CLASS` /
  `REQUIREMENT_STATUS_BADGE_CLASS`): red-ish for the most severe/urgent state, amber for
  medium, muted for low/inactive, emerald for a "good" terminal state.

---

## Task 1: Backend — `project_id` becomes a required column on `defects`

**Files:**
- Modify: `backend/models/all_models.py` (`Defect` class, currently lines 80-93)
- Create: `backend/migrations/versions/c9d3f7a1e825_add_project_id_to_defects.py`
- Modify: `backend/schemas/defects.py` (`DefectCreate`, `DefectResponse`)
- Modify: `backend/routers/defects.py` (`create_defect`)
- Modify: `backend/seed.py` (`seed_defects`, its call site)
- Test: `backend/tests/test_defects.py`

**Interfaces:**
- Consumes: `Project` model (`backend/models/all_models.py`), the `project` pytest fixture
  already defined in `backend/tests/conftest.py` (creates one `Project` row).
- Produces: `Defect.project_id` (int, NOT NULL, FK → `projects.id`). `DefectCreate.project_id:
  int` (required). `POST /defects` returns `400` if `project_id` doesn't reference a real
  project. Every later task's `Defect(...)` construction and every `DefectCreate` payload in
  this codebase must include `project_id` from here on.

- [ ] **Step 1: Add the column to the model**

In `backend/models/all_models.py`, find the `Defect` class:

```python
class Defect(Base):
    __tablename__ = "defects"

    id = Column(Integer, primary_key=True)
    code = Column(String(20), unique=True, nullable=False)
```

Replace with:

```python
class Defect(Base):
    __tablename__ = "defects"

    id = Column(Integer, primary_key=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    code = Column(String(20), unique=True, nullable=False)
```

- [ ] **Step 2: Write the migration**

Create `backend/migrations/versions/c9d3f7a1e825_add_project_id_to_defects.py`:

```python
"""add project_id to defects

Revision ID: c9d3f7a1e825
Revises: 22f5ee720c10
Create Date: 2026-08-09 00:00:00.000000

NOTE: this adds a NOT NULL `project_id` column with no server_default and
no backfill, so `alembic upgrade head` will fail if the local `defects`
table already has rows (e.g. from manual testing or a prior `python
seed.py` run). If that happens (dev-only, no production data exists yet),
run:

    TRUNCATE defects CASCADE;

then re-run `alembic upgrade head`, and re-run `python seed.py` afterward
if you need seed data back.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c9d3f7a1e825'
down_revision: Union[str, None] = '22f5ee720c10'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('defects', sa.Column('project_id', sa.Integer(), nullable=False))
    op.create_foreign_key(
        'defects_project_id_fkey', 'defects', 'projects', ['project_id'], ['id']
    )


def downgrade() -> None:
    op.drop_constraint('defects_project_id_fkey', 'defects', type_='foreignkey')
    op.drop_column('defects', 'project_id')
```

- [ ] **Step 3: Apply the migration**

Run: `cd backend && venv\Scripts\activate && alembic upgrade head`

Expected: `Running upgrade 22f5ee720c10 -> c9d3f7a1e825, add project_id to defects`. If it
fails with a not-null-violation, follow the `TRUNCATE defects CASCADE;` note in the
migration's docstring (dev DB only), then re-run.

- [ ] **Step 4: Confirm the existing suite now fails for the right reason**

Run: `pytest tests/test_defects.py -v`

Expected: every test that calls `POST /defects` now **FAILS** with a `500` (DB
`IntegrityError` — `null value in column "project_id"`), since `create_defect` doesn't set
it yet and `DefectCreate` doesn't accept it yet. This confirms the column change is actually
exercised before we make it work.

- [ ] **Step 5: Make `project_id` part of the create contract**

In `backend/schemas/defects.py`, update `DefectCreate` and `DefectResponse`:

```python
class DefectCreate(BaseModel):
    title: str
    description: str | None = None
    severity: DefectSeverity
    status: DefectStatus = "Open"
    testcase_id: int | None = None
    requirement_id: int | None = None
    project_id: int
```

```python
class DefectResponse(BaseModel):
    id: int
    code: str
    title: str
    description: str | None
    severity: str | None
    status: str
    testcase_id: int | None
    requirement_id: int | None
    found_in_version: str | None
    fixed_in_version: str | None
    project_id: int
    created_at: datetime

    class Config:
        from_attributes = True
```

- [ ] **Step 6: Validate and set `project_id` in the router**

In `backend/routers/defects.py`, update the imports and `create_defect`:

```python
from models.all_models import Defect, Project, Requirement, TestCase
```

```python
@router.post("", response_model=DefectResponse, status_code=status.HTTP_201_CREATED)
def create_defect(payload: DefectCreate, db: Session = Depends(get_db)):
    if db.get(Project, payload.project_id) is None:
        raise HTTPException(status_code=400, detail="project_id not found")
    if payload.testcase_id is not None and db.get(TestCase, payload.testcase_id) is None:
        raise HTTPException(status_code=400, detail="testcase_id not found")
    if payload.requirement_id is not None and db.get(Requirement, payload.requirement_id) is None:
        raise HTTPException(status_code=400, detail="requirement_id not found")

    code = next_code(db, Defect, "code", "DEF")
    defect = Defect(
        code=code,
        title=payload.title,
        description=payload.description,
        severity=payload.severity,
        status=payload.status,
        testcase_id=payload.testcase_id,
        requirement_id=payload.requirement_id,
        project_id=payload.project_id,
    )
    db.add(defect)
    db.commit()
    db.refresh(defect)
    return defect
```

- [ ] **Step 7: Update the seed script**

In `backend/seed.py`, update `seed_defects` to take `project` and set `project_id`:

```python
def seed_defects(db, project, test_cases, requirements, defect_data, releases):
    fixed_in = next(r for r in releases if r.version_name == "v1.1.0-UAT").version_name
    defects = {}
    for row in defect_data:
        description = (
            f"Steps to Reproduce: {row['steps_to_reproduce']}\n"
            f"Expected: {row['expected_result']}\n"
            f"Actual: {row['actual_result']}\n"
            f"Root Cause: {row['root_cause']}\n"
            f"Category: {row['category']} | Priority: {row['priority']} | "
            f"Environment: {row['environment']}"
        )
        defect = Defect(
            code=row["def_id"],
            title=row["summary"],
            description=description,
            severity=row["severity"],
            status=row["status"],
            testcase_id=test_cases[row["tc_id"]].id if row["tc_id"] else None,
            requirement_id=requirements[row["req_id"]].id if row["req_id"] else None,
            found_in_version=row["environment"],
            fixed_in_version=fixed_in if row["status"] in CLOSED_DEFECT_STATUSES else None,
            project_id=project.id,
        )
        db.add(defect)
        defects[row["def_id"]] = defect

    db.flush()
    return defects
```

And update its call site (currently `defects = seed_defects(db, test_cases, requirements, defect_data, releases)`):

```python
        defects = seed_defects(db, project, test_cases, requirements, defect_data, releases)
```

- [ ] **Step 8: Update existing tests + add new ones for `project_id`**

In `backend/tests/test_defects.py`, every `client.post("/defects", json={...})` call needs
`"project_id": project.id` added to its body, and every test that creates one needs the
`project` fixture added to its signature. Rewrite the file's test bodies (helpers
`_create_requirement_row`/`_create_test_case_row` are unchanged):

```python
def test_create_defect_generates_code(client, auth_headers, project):
    response = client.post(
        "/defects",
        json={"title": "Login fails with OTP", "severity": "High", "status": "Open", "project_id": project.id},
        headers=auth_headers,
    )
    assert response.status_code == 201
    assert re.fullmatch(r"DEF-\d+", response.json()["code"])


def test_create_defect_requires_project_id(client, auth_headers):
    response = client.post(
        "/defects",
        json={"title": "Bug", "severity": "Low", "status": "Open"},
        headers=auth_headers,
    )
    assert response.status_code == 422


def test_create_defect_rejects_unknown_project(client, auth_headers):
    response = client.post(
        "/defects",
        json={"title": "Bug", "severity": "Low", "status": "Open", "project_id": 999999},
        headers=auth_headers,
    )
    assert response.status_code == 400


def test_create_defect_accepts_only_testcase_id(client, auth_headers, db_session, project):
    req = _create_requirement_row(db_session)
    tc = _create_test_case_row(db_session, req.id)
    response = client.post(
        "/defects",
        json={"title": "Bug", "severity": "Low", "status": "Open", "testcase_id": tc.id, "project_id": project.id},
        headers=auth_headers,
    )
    assert response.status_code == 201
    data = response.json()
    assert data["testcase_id"] == tc.id
    assert data["requirement_id"] is None


def test_create_defect_accepts_only_requirement_id(client, auth_headers, db_session, project):
    req = _create_requirement_row(db_session)
    response = client.post(
        "/defects",
        json={"title": "Bug", "severity": "Low", "status": "Open", "requirement_id": req.id, "project_id": project.id},
        headers=auth_headers,
    )
    assert response.status_code == 201
    data = response.json()
    assert data["requirement_id"] == req.id
    assert data["testcase_id"] is None


def test_create_defect_rejects_unknown_fk(client, auth_headers, project):
    response = client.post(
        "/defects",
        json={"title": "Bug", "severity": "Low", "status": "Open", "testcase_id": 999999, "project_id": project.id},
        headers=auth_headers,
    )
    assert response.status_code == 400


def test_list_defects_filters_by_severity_and_status(client, auth_headers, db_session, project):
    # Scoped by testcase_id so the assertions aren't polluted by other
    # defects already committed in the shared dev DB (e.g. seed data).
    req = _create_requirement_row(db_session)
    tc = _create_test_case_row(db_session, req.id)

    d1 = client.post(
        "/defects",
        json={"title": "A", "severity": "Critical", "status": "Open", "testcase_id": tc.id, "project_id": project.id},
        headers=auth_headers,
    ).json()
    d2 = client.post(
        "/defects",
        json={"title": "B", "severity": "Low", "status": "Closed", "testcase_id": tc.id, "project_id": project.id},
        headers=auth_headers,
    ).json()

    response = client.get(f"/defects?testcase_id={tc.id}&severity=Critical", headers=auth_headers)
    data = response.json()
    assert data["total"] == 1
    assert data["items"][0]["id"] == d1["id"]

    response = client.get(f"/defects?testcase_id={tc.id}&status=Closed", headers=auth_headers)
    data = response.json()
    assert data["total"] == 1
    assert data["items"][0]["id"] == d2["id"]


def test_get_defect_detail_includes_linked_summaries(client, auth_headers, db_session, project):
    req = _create_requirement_row(db_session)
    tc = _create_test_case_row(db_session, req.id)
    created = client.post(
        "/defects",
        json={
            "title": "Bug",
            "severity": "High",
            "status": "Open",
            "testcase_id": tc.id,
            "requirement_id": req.id,
            "project_id": project.id,
        },
        headers=auth_headers,
    ).json()

    response = client.get(f"/defects/{created['id']}", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["test_case"]["code"] == tc.code
    assert data["requirement"]["req_id"] == req.req_id


def test_get_defect_detail_with_only_testcase_id_omits_requirement(client, auth_headers, db_session, project):
    req = _create_requirement_row(db_session)
    tc = _create_test_case_row(db_session, req.id)
    created = client.post(
        "/defects",
        json={"title": "Bug", "severity": "High", "status": "Open", "testcase_id": tc.id, "project_id": project.id},
        headers=auth_headers,
    ).json()

    response = client.get(f"/defects/{created['id']}", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["test_case"]["code"] == tc.code
    assert data["requirement"] is None


def test_get_defect_detail_with_only_requirement_id_omits_test_case(client, auth_headers, db_session, project):
    req = _create_requirement_row(db_session)
    created = client.post(
        "/defects",
        json={"title": "Bug", "severity": "High", "status": "Open", "requirement_id": req.id, "project_id": project.id},
        headers=auth_headers,
    ).json()

    response = client.get(f"/defects/{created['id']}", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["requirement"]["req_id"] == req.req_id
    assert data["test_case"] is None


def test_get_defect_detail_with_no_links_omits_both(client, auth_headers, project):
    created = client.post(
        "/defects",
        json={"title": "Bug", "severity": "High", "status": "Open", "project_id": project.id},
        headers=auth_headers,
    ).json()

    response = client.get(f"/defects/{created['id']}", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["test_case"] is None
    assert data["requirement"] is None


def test_update_defect_changes_severity_status_fixed_in_version(client, auth_headers, project):
    created = client.post(
        "/defects",
        json={"title": "Bug", "severity": "Low", "status": "Open", "project_id": project.id},
        headers=auth_headers,
    ).json()

    response = client.put(
        f"/defects/{created['id']}",
        json={"severity": "Critical", "status": "Fixed", "fixed_in_version": "v2.1.0"},
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["severity"] == "Critical"
    assert data["status"] == "Fixed"
    assert data["fixed_in_version"] == "v2.1.0"


def test_defects_require_auth(client):
    response = client.get("/defects")
    assert response.status_code == 401
```

- [ ] **Step 9: Run the defects test file to verify it's green**

Run: `pytest tests/test_defects.py -v`

Expected: all tests **PASS**, including the two new ones
(`test_create_defect_requires_project_id`, `test_create_defect_rejects_unknown_project`).

- [ ] **Step 10: Run the full backend suite to check for regressions**

Run: `pytest -v`

Expected: all tests pass. `backend/seed.py` is a standalone script, not covered by pytest —
do not run it as part of this step (it reseeds/truncates data); its correctness here is
verified by code review of Step 7 plus the fact that its `Defect(...)` call now supplies
every required field.

- [ ] **Step 11: Commit**

```bash
git add backend/models/all_models.py backend/migrations/versions/c9d3f7a1e825_add_project_id_to_defects.py backend/schemas/defects.py backend/routers/defects.py backend/seed.py backend/tests/test_defects.py
git commit -m "$(cat <<'EOF'
feat: require project_id on defects

Defects can optionally link to a TestCase and/or a Requirement, but
both can be absent, so there was no way to scope a defect to a
project. Adds a direct project_id FK (mirroring Release/Requirement)
instead of deriving it, so every defect stays visible under some
project regardless of its optional links.
EOF
)"
```

---

## Task 2: Backend — project-scoped, searchable defect list with linked TestCase summary

**Files:**
- Modify: `backend/schemas/defects.py` (`DefectListItem`, `DefectListResponse`)
- Modify: `backend/routers/defects.py` (`list_defects`)
- Test: `backend/tests/test_defects.py`

**Interfaces:**
- Consumes: `Defect.project_id` (Task 1), `TestCaseSummary` (`backend/schemas/common.py`,
  already imported in `schemas/defects.py`).
- Produces: `GET /defects?project_id=&search=` (both optional, combinable with the existing
  `severity`/`status`/`requirement_id`/`testcase_id` filters). `DefectListResponse.items`
  is now `list[DefectListItem]`, each with a `test_case: TestCaseSummary | None` field.
  `RequirementDetailPage.tsx`'s existing `listDefects({ requirement_id, limit: 1 })` call
  (frontend, unmodified until Task 4) keeps working unchanged since `project_id`/`search`
  are optional additions, not replacements.

- [ ] **Step 1: Write the failing tests**

Add to `backend/tests/test_defects.py`, after `test_list_defects_filters_by_severity_and_status`:

```python
def test_list_defects_scoped_by_project(client, auth_headers, db_session, project):
    other_project = Project(name="Other Project", description="d")
    db_session.add(other_project)
    db_session.commit()
    db_session.refresh(other_project)

    client.post(
        "/defects",
        json={"title": "In scope", "severity": "Low", "status": "Open", "project_id": project.id},
        headers=auth_headers,
    )
    client.post(
        "/defects",
        json={"title": "Out of scope", "severity": "Low", "status": "Open", "project_id": other_project.id},
        headers=auth_headers,
    )

    response = client.get(f"/defects?project_id={project.id}", headers=auth_headers)
    data = response.json()
    assert all(item["project_id"] == project.id for item in data["items"])
    assert any(item["title"] == "In scope" for item in data["items"])
    assert not any(item["title"] == "Out of scope" for item in data["items"])


def test_list_defects_rejects_unknown_project(client, auth_headers):
    response = client.get("/defects?project_id=999999", headers=auth_headers)
    assert response.status_code == 404


def test_list_defects_search_matches_title_or_code(client, auth_headers, db_session, project):
    req = _create_requirement_row(db_session)
    tc = _create_test_case_row(db_session, req.id)
    d1 = client.post(
        "/defects",
        json={"title": "Login fails with OTP", "severity": "Low", "status": "Open", "testcase_id": tc.id, "project_id": project.id},
        headers=auth_headers,
    ).json()
    client.post(
        "/defects",
        json={"title": "Report export missing column", "severity": "Low", "status": "Open", "testcase_id": tc.id, "project_id": project.id},
        headers=auth_headers,
    )

    response = client.get(f"/defects?testcase_id={tc.id}&search=OTP", headers=auth_headers)
    data = response.json()
    assert data["total"] == 1
    assert data["items"][0]["id"] == d1["id"]

    code_response = client.get(f"/defects?testcase_id={tc.id}&search={d1['code']}", headers=auth_headers)
    code_data = code_response.json()
    assert code_data["total"] == 1
    assert code_data["items"][0]["id"] == d1["id"]


def test_list_defects_includes_test_case_summary(client, auth_headers, db_session, project):
    req = _create_requirement_row(db_session)
    tc = _create_test_case_row(db_session, req.id)
    client.post(
        "/defects",
        json={"title": "Bug", "severity": "Low", "status": "Open", "testcase_id": tc.id, "project_id": project.id},
        headers=auth_headers,
    )

    response = client.get(f"/defects?testcase_id={tc.id}", headers=auth_headers)
    data = response.json()
    assert data["items"][0]["test_case"]["code"] == tc.code


def test_list_defects_omits_test_case_when_unlinked(client, auth_headers, project):
    client.post(
        "/defects",
        json={"title": "Standalone bug", "severity": "Low", "status": "Open", "project_id": project.id},
        headers=auth_headers,
    )

    response = client.get(f"/defects?project_id={project.id}&search=Standalone", headers=auth_headers)
    data = response.json()
    assert data["items"][0]["test_case"] is None
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_defects.py -k "scoped_by_project or rejects_unknown_project or search_matches or includes_test_case_summary or omits_test_case" -v`

Expected: `test_list_defects_scoped_by_project` and `test_list_defects_rejects_unknown_project`
FAIL (no `project_id` filtering exists yet — the "in scope"/"out of scope" assertion mixes
both, and `project_id=999999` returns `200` not `404`). `test_list_defects_search_matches_title_or_code`
FAILS (no `search` param exists, both defects come back, `total == 2`). The two `test_case`
tests FAIL with `KeyError: 'test_case'` (field doesn't exist in the response yet).

- [ ] **Step 3: Add `DefectListItem` to the schema**

In `backend/schemas/defects.py`, add after `DefectDetailResponse`:

```python
class DefectListItem(DefectResponse):
    test_case: TestCaseSummary | None = None
```

And change `DefectListResponse`:

```python
class DefectListResponse(BaseModel):
    items: list[DefectListItem]
    total: int
    page: int
    limit: int
```

- [ ] **Step 4: Implement scoping, search, and the TestCase batch-load in the router**

In `backend/routers/defects.py`, update the imports and `list_defects`. Add `or_` to the
sqlalchemy import and `DefectListItem` to the `from schemas.defects import (...)` block:

```python
from sqlalchemy import or_
```

```python
from schemas.defects import (
    DefectCreate,
    DefectDetailResponse,
    DefectListItem,
    DefectListResponse,
    DefectResponse,
    DefectUpdate,
)
```

```python
@router.get("", response_model=DefectListResponse)
def list_defects(
    project_id: int | None = None,
    severity: str | None = None,
    status_filter: str | None = Query(None, alias="status"),
    requirement_id: int | None = None,
    testcase_id: int | None = None,
    search: str | None = None,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    if project_id is not None and db.get(Project, project_id) is None:
        raise HTTPException(status_code=404, detail="project_id not found")

    query = db.query(Defect)
    if project_id is not None:
        query = query.filter(Defect.project_id == project_id)
    if severity is not None:
        query = query.filter(Defect.severity == severity)
    if status_filter is not None:
        query = query.filter(Defect.status == status_filter)
    if requirement_id is not None:
        query = query.filter(Defect.requirement_id == requirement_id)
    if testcase_id is not None:
        query = query.filter(Defect.testcase_id == testcase_id)
    if search is not None:
        query = query.filter(
            or_(Defect.title.ilike(f"%{search}%"), Defect.code.ilike(f"%{search}%"))
        )

    total = query.count()
    items = (
        query.order_by(Defect.id)
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )

    testcase_ids = {d.testcase_id for d in items if d.testcase_id is not None}
    test_cases_by_id = {}
    if testcase_ids:
        for tc in db.query(TestCase).filter(TestCase.id.in_(testcase_ids)).all():
            test_cases_by_id[tc.id] = tc

    list_items = []
    for d in items:
        list_item = DefectListItem.model_validate(d)
        tc = test_cases_by_id.get(d.testcase_id)
        list_item.test_case = TestCaseSummary.model_validate(tc) if tc else None
        list_items.append(list_item)

    return DefectListResponse(items=list_items, total=total, page=page, limit=limit)
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pytest tests/test_defects.py -k "scoped_by_project or rejects_unknown_project or search_matches or includes_test_case_summary or omits_test_case" -v`

Expected: all **PASS**.

- [ ] **Step 6: Run the full backend suite to check for regressions**

Run: `pytest -v`

Expected: all tests pass, including `test_traceability.py` (builds its own query, doesn't
call `list_defects`) and `RequirementDetailPage`'s consumer path isn't backend-tested but
its param shape (`requirement_id`, `limit`) is untouched here.

- [ ] **Step 7: Commit**

```bash
git add backend/schemas/defects.py backend/routers/defects.py backend/tests/test_defects.py
git commit -m "$(cat <<'EOF'
feat: project-scope and search the defects list, embed linked TestCase

GET /defects gains optional project_id and search (title/code ilike)
filters, and each item now carries its linked TestCase as a summary
(id/code/title/status) for the frontend list's "Linked TC" column,
mirroring how GET /test-cases already embeds its Requirement summary.
EOF
)"
```

---

## Task 3: Backend — `GET /defects/stats`

**Files:**
- Modify: `backend/schemas/defects.py` (`DefectStatsResponse`)
- Modify: `backend/routers/defects.py` (new route)
- Test: `backend/tests/test_defects.py`

**Interfaces:**
- Consumes: `Defect.project_id`, `Defect.status`, `Defect.severity` (existing columns).
- Produces: `GET /defects/stats?project_id=` → `{ total: int, by_status: {Open, Fixed,
  Closed, "Wont-Fix"}, by_severity: {Critical, High, Medium, Low} }`, all four keys always
  present in each dict (0 if no defects have that value), scoped by `project_id` and
  ignoring any list-style filters/pagination. `404` if `project_id` doesn't exist.

- [ ] **Step 1: Write the failing tests**

Add to `backend/tests/test_defects.py`:

```python
def test_defect_stats_counts_by_status_and_severity_scoped_by_project(client, auth_headers, db_session, project):
    other_project = Project(name="Other Project", description="d")
    db_session.add(other_project)
    db_session.commit()
    db_session.refresh(other_project)

    client.post(
        "/defects",
        json={"title": "A", "severity": "Critical", "status": "Open", "project_id": project.id},
        headers=auth_headers,
    )
    client.post(
        "/defects",
        json={"title": "B", "severity": "Critical", "status": "Fixed", "project_id": project.id},
        headers=auth_headers,
    )
    client.post(
        "/defects",
        json={"title": "C", "severity": "Low", "status": "Open", "project_id": project.id},
        headers=auth_headers,
    )
    client.post(
        "/defects",
        json={"title": "Other project's bug", "severity": "Critical", "status": "Open", "project_id": other_project.id},
        headers=auth_headers,
    )

    response = client.get(f"/defects/stats?project_id={project.id}", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 3
    assert data["by_status"] == {"Open": 2, "Fixed": 1, "Closed": 0, "Wont-Fix": 0}
    assert data["by_severity"] == {"Critical": 2, "High": 0, "Medium": 0, "Low": 1}


def test_defect_stats_rejects_unknown_project(client, auth_headers):
    response = client.get("/defects/stats?project_id=999999", headers=auth_headers)
    assert response.status_code == 404


def test_defect_stats_requires_project_id(client, auth_headers):
    response = client.get("/defects/stats", headers=auth_headers)
    assert response.status_code == 422
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_defects.py -k "defect_stats" -v`

Expected: all three **FAIL** with `404 Not Found` (no `/defects/stats` route exists yet, so
FastAPI's own 404 fires — not the app's own `HTTPException`).

- [ ] **Step 3: Add the response schema**

In `backend/schemas/defects.py`, add after `DefectListResponse`:

```python
class DefectStatsResponse(BaseModel):
    total: int
    by_status: dict[str, int]
    by_severity: dict[str, int]
```

- [ ] **Step 4: Add the route**

In `backend/routers/defects.py`, update the imports:

```python
from sqlalchemy import func, or_
```

Insert this route **between** `create_defect` and `get_defect` (i.e. right after the
`POST ""` handler, before `GET "/{id}"`, so `/defects/stats` isn't shadowed by the `{id}`
path param):

```python
@router.get("/stats", response_model=DefectStatsResponse)
def get_defect_stats(project_id: int, db: Session = Depends(get_db)):
    if db.get(Project, project_id) is None:
        raise HTTPException(status_code=404, detail="project_id not found")

    total = db.query(Defect).filter(Defect.project_id == project_id).count()

    status_counts = dict(
        db.query(Defect.status, func.count(Defect.id))
        .filter(Defect.project_id == project_id)
        .group_by(Defect.status)
        .all()
    )
    severity_counts = dict(
        db.query(Defect.severity, func.count(Defect.id))
        .filter(Defect.project_id == project_id)
        .group_by(Defect.severity)
        .all()
    )

    by_status = {s: status_counts.get(s, 0) for s in ("Open", "Fixed", "Closed", "Wont-Fix")}
    by_severity = {s: severity_counts.get(s, 0) for s in ("Critical", "High", "Medium", "Low")}

    return DefectStatsResponse(total=total, by_status=by_status, by_severity=by_severity)
```

And add `DefectStatsResponse` to the `from schemas.defects import (...)` block at the top
of the file.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pytest tests/test_defects.py -k "defect_stats" -v`

Expected: all three **PASS**.

- [ ] **Step 6: Run the full backend suite to check for regressions**

Run: `pytest -v`

Expected: all tests pass — in particular confirm `test_get_defect_detail_*` tests (which hit
`GET /defects/{id}`) still pass, proving the new `/stats` route didn't shadow or get
shadowed by the `{id}` route.

- [ ] **Step 7: Commit**

```bash
git add backend/schemas/defects.py backend/routers/defects.py backend/tests/test_defects.py
git commit -m "$(cat <<'EOF'
feat: add GET /defects/stats for the defects list's stats row

Returns total/by_status/by_severity counts scoped by project_id,
independent of the list endpoint's own filters and pagination, so the
frontend stats tiles always reflect the project's full defect set.
EOF
)"
```

---

## Task 4: Frontend — `lib/defects.ts` and `TestCaseSummary`

**Files:**
- Modify: `frontend/src/lib/testCases.ts` (add `TestCaseSummary` type)
- Modify: `frontend/src/lib/defects.ts` (full rewrite)

**Interfaces:**
- Consumes: `RequirementSummary` (`frontend/src/lib/requirements.ts`, existing),
  `authFetch` (`frontend/src/lib/api.ts`, existing).
- Produces: `TestCaseSummary` type (`{ id, code, title, status }`, mirrors backend's
  `schemas/common.py::TestCaseSummary`) — consumed by Task 5's `TestCaseCombobox`. From
  `lib/defects.ts`: `DefectSeverity`, `DefectStatus`, `Defect`, `DefectListItem`,
  `DefectDetail`, `DefectListResponse`, `DefectStats`, `DEFECT_SEVERITY_BADGE_CLASS`,
  `DEFECT_STATUS_BADGE_CLASS`, `listDefects(params)`, `getDefectStats(projectId)`,
  `getDefect(id)`, `createDefect(payload)`, `updateDefect(id, payload)` — consumed by
  Tasks 6-9.

- [ ] **Step 1: Add `TestCaseSummary` to `lib/testCases.ts`**

In `frontend/src/lib/testCases.ts`, add after the `TestCaseStatus`/`TestCasePriority` type
aliases (after line 7):

```ts
export type TestCaseSummary = {
  id: number
  code: string
  title: string
  status: string
}
```

- [ ] **Step 2: Rewrite `lib/defects.ts`**

Replace the entire contents of `frontend/src/lib/defects.ts` with:

```ts
import { authFetch } from './api'
import type { RequirementSummary } from './requirements'
import type { TestCaseSummary } from './testCases'

export type DefectSeverity = 'Critical' | 'High' | 'Medium' | 'Low'
export type DefectStatus = 'Open' | 'Fixed' | 'Closed' | 'Wont-Fix'

export type Defect = {
  id: number
  project_id: number
  code: string
  title: string
  description: string | null
  severity: string | null
  status: string
  testcase_id: number | null
  requirement_id: number | null
  found_in_version: string | null
  fixed_in_version: string | null
  created_at: string
}

export type DefectListItem = Defect & {
  test_case: TestCaseSummary | null
}

export type DefectDetail = Defect & {
  test_case: TestCaseSummary | null
  requirement: RequirementSummary | null
}

export type DefectListResponse = {
  items: DefectListItem[]
  total: number
  page: number
  limit: number
}

export type DefectStats = {
  total: number
  by_status: Record<string, number>
  by_severity: Record<string, number>
}

export type DefectListParams = {
  project_id?: number
  requirement_id?: number
  testcase_id?: number
  page?: number
  limit?: number
  severity?: DefectSeverity
  status?: DefectStatus
  search?: string
}

export const DEFECT_SEVERITY_BADGE_CLASS: Record<string, string> = {
  Critical: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400',
  High: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
  Medium: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
  Low: 'bg-muted text-muted-foreground',
}

export const DEFECT_STATUS_BADGE_CLASS: Record<string, string> = {
  Open: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400',
  Fixed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400',
  Closed: 'bg-muted text-muted-foreground',
  'Wont-Fix': 'border border-input text-muted-foreground',
}

export async function listDefects(params: DefectListParams = {}): Promise<DefectListResponse> {
  const query = new URLSearchParams()
  if (params.project_id !== undefined) query.set('project_id', String(params.project_id))
  if (params.requirement_id !== undefined) query.set('requirement_id', String(params.requirement_id))
  if (params.testcase_id !== undefined) query.set('testcase_id', String(params.testcase_id))
  if (params.page) query.set('page', String(params.page))
  if (params.limit) query.set('limit', String(params.limit))
  if (params.severity) query.set('severity', params.severity)
  if (params.status) query.set('status', params.status)
  if (params.search) query.set('search', params.search)
  return authFetch<DefectListResponse>(`/defects?${query.toString()}`)
}

export async function getDefectStats(projectId: number): Promise<DefectStats> {
  return authFetch<DefectStats>(`/defects/stats?project_id=${projectId}`)
}

export async function getDefect(id: number): Promise<DefectDetail> {
  return authFetch<DefectDetail>(`/defects/${id}`)
}

export async function createDefect(payload: {
  project_id: number
  title: string
  description?: string
  severity: DefectSeverity
  status?: DefectStatus
  testcase_id?: number
  requirement_id?: number
}): Promise<Defect> {
  return authFetch<Defect>('/defects', { method: 'POST', body: payload })
}

export async function updateDefect(
  id: number,
  payload: { severity: DefectSeverity; status: DefectStatus; fixed_in_version?: string },
): Promise<Defect> {
  return authFetch<Defect>(`/defects/${id}`, { method: 'PUT', body: payload })
}
```

Note: `RequirementDetailPage.tsx`'s existing call `listDefects({ requirement_id:
requirement.id, limit: 1 })` (`frontend/src/pages/RequirementDetailPage.tsx:87`) continues
to compile and behave identically — `DefectListParams` is a superset of the old params type.

- [ ] **Step 3: Type-check**

Run: `cd frontend && npx tsc --noEmit`

Expected: no errors.

- [ ] **Step 4: Exercise `lib/defects.ts` against the running backend**

This repo has no frontend test framework; per `CLAUDE.md`'s documented technique, verify the
fetch-wrapper module through Vite's real transform pipeline with a `localStorage` shim, no
browser required. First get a bearer token and a project id via `curl` (assumes
`npm run dev:backend` is already running on `:8000`):

```bash
curl -s -X POST http://localhost:8000/auth/register -H "Content-Type: application/json" \
  -d '{"email":"defects-verify@example.com","password":"testpass123","full_name":"Verify"}'
curl -s -X POST http://localhost:8000/auth/login -H "Content-Type: application/json" \
  -d '{"email":"defects-verify@example.com","password":"testpass123"}'
# copy the access_token from the response
curl -s -X POST http://localhost:8000/projects -H "Content-Type: application/json" \
  -H "Authorization: Bearer <TOKEN>" -d '{"name":"Verify Project","description":"d"}'
# copy the id from the response
```

Then, from `frontend/`, create a throwaway script (do not commit it) at
`scratch-verify-defects.mjs`:

```js
import { createServer } from 'vite'

const TOKEN = process.argv[2]
const PROJECT_ID = Number(process.argv[3])

globalThis.localStorage = {
  _store: new Map(),
  getItem(k) { return this._store.has(k) ? this._store.get(k) : null },
  setItem(k, v) { this._store.set(k, String(v)) },
  removeItem(k) { this._store.delete(k) },
}
globalThis.localStorage.setItem('qms_token', TOKEN)

const server = await createServer({ server: { middlewareMode: true } })
const defects = await server.ssrLoadModule('/src/lib/defects.ts')

const created = await defects.createDefect({
  project_id: PROJECT_ID,
  title: 'Verification bug',
  severity: 'High',
  status: 'Open',
})
console.log('created:', created)

const list = await defects.listDefects({ project_id: PROJECT_ID, search: 'Verification' })
console.log('list total:', list.total, 'first item severity:', list.items[0]?.severity)

const stats = await defects.getDefectStats(PROJECT_ID)
console.log('stats:', stats)

const detail = await defects.getDefect(created.id)
console.log('detail test_case/requirement:', detail.test_case, detail.requirement)

const updated = await defects.updateDefect(created.id, {
  severity: 'Critical',
  status: 'Fixed',
  fixed_in_version: 'v9.9.9',
})
console.log('updated:', updated)

await server.close()
```

Run: `node scratch-verify-defects.mjs <TOKEN> <PROJECT_ID>`

Expected: `created` has a `DEF-…` code and `status: 'Open'`; `list total` is `1` with
`severity: 'High'`; `stats.by_status.Open === 1` and `stats.total === 1`; `detail`'s
`test_case`/`requirement` are both `null` (no links were set); `updated.severity ===
'Critical'`, `updated.status === 'Fixed'`, `updated.fixed_in_version === 'v9.9.9'`. Delete
`scratch-verify-defects.mjs` after confirming (it's throwaway, not part of the plan's file
list).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/defects.ts frontend/src/lib/testCases.ts
git commit -m "$(cat <<'EOF'
feat: extend lib/defects.ts for project scoping, search, stats, CRUD

Adds TestCaseSummary (mirrors backend's schemas/common.py), and
listDefects/getDefectStats/getDefect/createDefect/updateDefect against
the endpoints added in the last three backend tasks.
EOF
)"
```

---

## Task 5: Frontend — `TestCaseCombobox`

**Files:**
- Create: `frontend/src/components/TestCaseCombobox.tsx`

**Interfaces:**
- Consumes: `listTestCases` (`frontend/src/lib/testCases.ts`, existing), `TestCaseSummary`
  (Task 4).
- Produces: `<TestCaseCombobox projectId value onChange />` — same shape as
  `RequirementCombobox`. Consumed by Task 6 (`NewDefectDialog`).

- [ ] **Step 1: Create the component**

Create `frontend/src/components/TestCaseCombobox.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { listTestCases } from '@/lib/testCases'
import type { TestCaseSummary } from '@/lib/testCases'

type TestCaseComboboxProps = {
  projectId: number
  value: TestCaseSummary | null
  onChange: (testCase: TestCaseSummary) => void
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])
  return debounced
}

export function TestCaseCombobox({ projectId, value, onChange }: TestCaseComboboxProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, 300)
  const [results, setResults] = useState<TestCaseSummary[]>([])
  const [loading, setLoading] = useState(false)
  const requestIdRef = useRef(0)

  useEffect(() => {
    if (!open) return
    const requestId = ++requestIdRef.current
    setLoading(true)
    listTestCases({ project_id: projectId, search: debouncedSearch || undefined, limit: 20 })
      .then((result) => {
        if (requestIdRef.current !== requestId) return
        setResults(
          result.items.map((tc) => ({ id: tc.id, code: tc.code, title: tc.title, status: tc.status })),
        )
      })
      .catch(() => {
        if (requestIdRef.current !== requestId) return
        setResults([])
      })
      .finally(() => {
        if (requestIdRef.current !== requestId) return
        setLoading(false)
      })
  }, [open, projectId, debouncedSearch])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" className="w-full justify-start overflow-hidden font-normal">
          <span className="truncate">{value ? `${value.code} — ${value.title}` : 'Chọn test case...'}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 max-w-[calc(100vw-2rem)] p-2" align="start">
        <Input
          placeholder="Tìm test case..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mb-2"
          autoFocus
        />
        {loading && <p className="px-1 py-1 text-sm text-muted-foreground">Đang tải...</p>}
        {!loading && results.length === 0 && (
          <p className="px-1 py-1 text-sm text-muted-foreground">Không tìm thấy test case nào.</p>
        )}
        {!loading && results.length > 0 && (
          <div className="flex max-h-60 flex-col gap-0.5 overflow-y-auto">
            {results.map((tc) => (
              <button
                key={tc.id}
                type="button"
                onClick={() => {
                  onChange(tc)
                  setOpen(false)
                }}
                className="cursor-pointer rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
              >
                <span className="font-medium">{tc.code}</span>{' '}
                <span className="text-muted-foreground">{tc.title}</span>
              </button>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `cd frontend && npx tsc --noEmit`

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/TestCaseCombobox.tsx
git commit -m "feat: add TestCaseCombobox component"
```

---

## Task 6: Frontend — `NewDefectDialog`

**Files:**
- Create: `frontend/src/components/NewDefectDialog.tsx`

**Interfaces:**
- Consumes: `createDefect` (Task 4), `RequirementCombobox` (existing), `TestCaseCombobox`
  (Task 5).
- Produces: `<NewDefectDialog open onOpenChange projectId onCreated />` — same shape as
  `NewTestCaseDialog`. Consumed by Task 9 (`DefectsPage`).

- [ ] **Step 1: Create the component**

Create `frontend/src/components/NewDefectDialog.tsx`:

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
import { RequirementCombobox } from '@/components/RequirementCombobox'
import { TestCaseCombobox } from '@/components/TestCaseCombobox'
import type { RequirementSummary } from '@/lib/requirements'
import type { TestCaseSummary } from '@/lib/testCases'
import { createDefect, type Defect, type DefectSeverity, type DefectStatus } from '@/lib/defects'

type NewDefectDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: number
  onCreated: (defect: Defect) => void
}

export function NewDefectDialog({ open, onOpenChange, projectId, onCreated }: NewDefectDialogProps) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedRequirement, setSelectedRequirement] = useState<RequirementSummary | null>(null)
  const [selectedTestCase, setSelectedTestCase] = useState<TestCaseSummary | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const title = String(data.get('title') ?? '').trim()
    const description = String(data.get('description') ?? '').trim()
    const severity = String(data.get('severity') ?? 'Medium') as DefectSeverity
    const status = String(data.get('status') ?? 'Open') as DefectStatus

    setSubmitting(true)
    setError(null)
    try {
      const defect = await createDefect({
        project_id: projectId,
        title,
        description: description || undefined,
        severity,
        status,
        testcase_id: selectedTestCase?.id,
        requirement_id: selectedRequirement?.id,
      })
      form.reset()
      setSelectedRequirement(null)
      setSelectedTestCase(null)
      onOpenChange(false)
      onCreated(defect)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Đã có lỗi xảy ra')
    } finally {
      setSubmitting(false)
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setError(null)
      setSelectedRequirement(null)
      setSelectedTestCase(null)
    }
    onOpenChange(nextOpen)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Log Defect</DialogTitle>
            <DialogDescription>Ghi nhận một defect mới.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-defect-title">Tiêu đề</Label>
              <Input
                id="new-defect-title"
                name="title"
                required
                placeholder="Nhập tiêu đề defect..."
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-defect-description">Mô tả</Label>
              <Textarea
                id="new-defect-description"
                name="description"
                rows={3}
                placeholder="Các bước tái hiện, kết quả thực tế..."
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-defect-severity">Mức độ nghiêm trọng</Label>
              <Select name="severity" defaultValue="Medium">
                <SelectTrigger id="new-defect-severity" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Critical">Critical</SelectItem>
                  <SelectItem value="High">High</SelectItem>
                  <SelectItem value="Medium">Medium</SelectItem>
                  <SelectItem value="Low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-defect-status">Trạng thái</Label>
              <Select name="status" defaultValue="Open">
                <SelectTrigger id="new-defect-status" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Open">Open</SelectItem>
                  <SelectItem value="Fixed">Fixed</SelectItem>
                  <SelectItem value="Closed">Closed</SelectItem>
                  <SelectItem value="Wont-Fix">Wont-Fix</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Link Test Case (tùy chọn)</Label>
              <TestCaseCombobox projectId={projectId} value={selectedTestCase} onChange={setSelectedTestCase} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Link Requirement (tùy chọn)</Label>
              <RequirementCombobox projectId={projectId} value={selectedRequirement} onChange={setSelectedRequirement} />
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              Hủy
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Đang tạo...' : 'Tạo'}
            </Button>
          </DialogFooter>
        </form>
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
git add frontend/src/components/NewDefectDialog.tsx
git commit -m "feat: add NewDefectDialog component"
```

---

## Task 7: Frontend — `EditDefectDialog`

**Files:**
- Create: `frontend/src/components/EditDefectDialog.tsx`

**Interfaces:**
- Consumes: `updateDefect` (Task 4), `useToast` (existing).
- Produces: `<EditDefectDialog open onOpenChange defect onUpdated />` — `defect` is a
  `DefectDetail` (Task 4) so the dialog can show read-only context (code, title, links).
  Consumed by Task 8 (`DefectDetailPage`).

- [ ] **Step 1: Create the component**

Create `frontend/src/components/EditDefectDialog.tsx`:

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { updateDefect, type Defect, type DefectDetail, type DefectSeverity, type DefectStatus } from '@/lib/defects'
import { useToast } from '@/lib/toast'

type EditDefectDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  defect: DefectDetail
  onUpdated: (defect: Defect) => void
}

export function EditDefectDialog({ open, onOpenChange, defect, onUpdated }: EditDefectDialogProps) {
  const toast = useToast()
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const severity = String(data.get('severity') ?? defect.severity ?? 'Medium') as DefectSeverity
    const status = String(data.get('status') ?? defect.status) as DefectStatus
    const fixedInVersion = String(data.get('fixed_in_version') ?? '').trim()

    setSubmitting(true)
    try {
      const updated = await updateDefect(defect.id, {
        severity,
        status,
        fixed_in_version: fixedInVersion || undefined,
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
            <DialogTitle>Sửa Defect</DialogTitle>
            <DialogDescription>Cập nhật thông tin defect {defect.code}.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-defect-severity">Mức độ nghiêm trọng</Label>
              <Select name="severity" defaultValue={defect.severity ?? 'Medium'}>
                <SelectTrigger id="edit-defect-severity" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Critical">Critical</SelectItem>
                  <SelectItem value="High">High</SelectItem>
                  <SelectItem value="Medium">Medium</SelectItem>
                  <SelectItem value="Low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-defect-status">Trạng thái</Label>
              <Select name="status" defaultValue={defect.status}>
                <SelectTrigger id="edit-defect-status" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Open">Open</SelectItem>
                  <SelectItem value="Fixed">Fixed</SelectItem>
                  <SelectItem value="Closed">Closed</SelectItem>
                  <SelectItem value="Wont-Fix">Wont-Fix</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-defect-fixed-in-version">Fixed in version</Label>
              <Input
                id="edit-defect-fixed-in-version"
                name="fixed_in_version"
                defaultValue={defect.fixed_in_version ?? ''}
                placeholder="v2.1.0"
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

- [ ] **Step 2: Type-check**

Run: `cd frontend && npx tsc --noEmit`

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/EditDefectDialog.tsx
git commit -m "feat: add EditDefectDialog component"
```

---

## Task 8: Frontend — `DefectDetailPage` and its route

**Files:**
- Create: `frontend/src/pages/DefectDetailPage.tsx`
- Modify: `frontend/src/App.tsx` (add route)

**Interfaces:**
- Consumes: `getDefect` (Task 4), `EditDefectDialog` (Task 7), `useCurrentProject`
  (existing).
- Produces: route `/defects/:id`. Consumed by Task 9's list-row links.

- [ ] **Step 1: Create the page**

Create `frontend/src/pages/DefectDetailPage.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Pencil } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatDate } from '@/lib/utils'
import { useCurrentProject } from '@/lib/currentProject'
import {
  getDefect,
  DEFECT_SEVERITY_BADGE_CLASS,
  DEFECT_STATUS_BADGE_CLASS,
  type DefectDetail,
} from '@/lib/defects'
import { EditDefectDialog } from '@/components/EditDefectDialog'
import { useToast } from '@/lib/toast'

export function DefectDetailPage() {
  const { id } = useParams()
  const toast = useToast()
  const { project } = useCurrentProject()
  const [defect, setDefect] = useState<DefectDetail | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [notFound, setNotFound] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestIdRef = useRef(0)

  useEffect(() => {
    if (!id) return
    const numericId = Number(id)
    const requestId = ++requestIdRef.current
    setLoading(true)
    setError(null)
    setNotFound(false)
    getDefect(numericId)
      .then((d) => {
        if (requestIdRef.current !== requestId) return
        setDefect(d)
      })
      .catch((err) => {
        if (requestIdRef.current !== requestId) return
        if (err instanceof Error && err.message.includes('not found')) {
          setNotFound(true)
        } else {
          setError(err instanceof Error ? err.message : 'Đã có lỗi xảy ra')
        }
      })
      .finally(() => {
        if (requestIdRef.current !== requestId) return
        setLoading(false)
      })
  }, [id])

  if (loading) {
    return <p className="px-4 text-sm text-muted-foreground">Đang tải...</p>
  }

  if (notFound) {
    return (
      <Card>
        <CardContent className="flex flex-col items-start gap-2 pt-4">
          <p className="text-sm text-muted-foreground">Không tìm thấy defect này.</p>
          <Link to="/defects" className="text-sm text-primary underline-offset-4 hover:underline">
            ← Quay lại danh sách Defects
          </Link>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return <p className="px-4 text-sm text-destructive">{error}</p>
  }

  if (!defect) return null

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            <Link to="/defects" className="hover:underline">Defects</Link> {'>'} {defect.code}
          </p>
          <h1 className="font-heading text-xl font-semibold">
            {defect.code}: {defect.title}
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
            <Pencil className="size-3.5" />
            Sửa
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <Badge className={DEFECT_SEVERITY_BADGE_CLASS[defect.severity ?? ''] ?? ''}>
              {defect.severity ?? '—'}
            </Badge>
            <Badge className={DEFECT_STATUS_BADGE_CLASS[defect.status] ?? ''}>{defect.status}</Badge>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <div>
              <h2 className="mb-1 text-sm font-medium">Mô tả</h2>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                {defect.description ?? '—'}
              </p>
            </div>
            <div>
              <h2 className="mb-2 text-sm font-medium">Liên kết</h2>
              <dl className="flex flex-col gap-3 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Test Case</dt>
                  <dd>
                    {defect.test_case ? (
                      <Link
                        to={`/testcases/${defect.test_case.id}`}
                        className="text-primary underline-offset-4 hover:underline"
                      >
                        {defect.test_case.code}
                      </Link>
                    ) : (
                      '—'
                    )}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Requirement</dt>
                  <dd>
                    {defect.requirement ? (
                      <Link
                        to={`/requirements/${defect.requirement.id}`}
                        className="text-primary underline-offset-4 hover:underline"
                      >
                        {defect.requirement.req_id}
                      </Link>
                    ) : (
                      '—'
                    )}
                  </dd>
                </div>
              </dl>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Thông tin</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="flex flex-col gap-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Code</dt>
                <dd>{defect.code}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Found in version</dt>
                <dd>{defect.found_in_version ?? '—'}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Fixed in version</dt>
                <dd>{defect.fixed_in_version ?? '—'}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Created</dt>
                <dd>{formatDate(defect.created_at)}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </div>

      {project && (
        <EditDefectDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          defect={defect}
          onUpdated={(updated) => {
            setDefect((d) => (d ? { ...d, ...updated } : d))
            toast.success(`Đã cập nhật defect ${updated.code}.`)
          }}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Wire the route**

In `frontend/src/App.tsx`, add the import and route:

```tsx
import { RequirementDetailPage } from '@/pages/RequirementDetailPage'
import { TestCaseDetailPage } from '@/pages/TestCaseDetailPage'
import { DefectDetailPage } from '@/pages/DefectDetailPage'
```

```tsx
            <Route path="/requirements/:id" element={<RequirementDetailPage />} />
            <Route path="/testcases/:id" element={<TestCaseDetailPage />} />
            <Route path="/defects/:id" element={<DefectDetailPage />} />
```

- [ ] **Step 3: Type-check**

Run: `cd frontend && npx tsc --noEmit`

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/DefectDetailPage.tsx frontend/src/App.tsx
git commit -m "feat: add DefectDetailPage and wire /defects/:id route"
```

---

## Task 9: Frontend — `DefectsPage` (list, stats, filters, search, create)

**Files:**
- Modify: `frontend/src/pages/DefectsPage.tsx` (full rewrite, replaces the placeholder)

**Interfaces:**
- Consumes: `listDefects`, `getDefectStats`, `DEFECT_SEVERITY_BADGE_CLASS`,
  `DEFECT_STATUS_BADGE_CLASS` (Task 4), `NewDefectDialog` (Task 6), `useCurrentProject`
  (existing), `useToast` (existing).
- Produces: the `/defects` route's real content (already wired in `nav.tsx`, unchanged).

- [ ] **Step 1: Replace the placeholder**

Replace the entire contents of `frontend/src/pages/DefectsPage.tsx` with:

```tsx
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { Card, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { useCurrentProject } from '@/lib/currentProject'
import { formatDate } from '@/lib/utils'
import {
  listDefects,
  getDefectStats,
  DEFECT_SEVERITY_BADGE_CLASS,
  DEFECT_STATUS_BADGE_CLASS,
  type DefectListItem,
  type DefectListResponse,
  type DefectStats,
  type DefectSeverity,
  type DefectStatus,
} from '@/lib/defects'
import { NewDefectDialog } from '@/components/NewDefectDialog'
import { useToast } from '@/lib/toast'

const PAGE_SIZE = 20
const SEVERITY_OPTIONS: DefectSeverity[] = ['Critical', 'High', 'Medium', 'Low']
const STATUS_OPTIONS: DefectStatus[] = ['Open', 'Fixed', 'Closed', 'Wont-Fix']

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])
  return debounced
}

export function DefectsPage() {
  const { project } = useCurrentProject()
  const toast = useToast()
  const [newOpen, setNewOpen] = useState(false)
  const [data, setData] = useState<DefectListResponse | null>(null)
  const [stats, setStats] = useState<DefectStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [severityFilter, setSeverityFilter] = useState<DefectSeverity | 'all'>('all')
  const [statusFilter, setStatusFilter] = useState<DefectStatus | 'all'>('all')
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, 300)
  const requestIdRef = useRef(0)
  const statsRequestIdRef = useRef(0)

  useEffect(() => {
    setPage(1)
  }, [project?.id, severityFilter, statusFilter, debouncedSearch])

  useEffect(() => {
    if (!project) {
      setData(null)
      return
    }
    load(project.id, page, severityFilter, statusFilter, debouncedSearch)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id, page, severityFilter, statusFilter, debouncedSearch])

  useEffect(() => {
    loadStats()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id])

  function load(
    projectId: number,
    page: number,
    severityFilter: DefectSeverity | 'all',
    statusFilter: DefectStatus | 'all',
    search: string,
  ) {
    const requestId = ++requestIdRef.current
    setLoading(true)
    setError(null)
    listDefects({
      project_id: projectId,
      page,
      limit: PAGE_SIZE,
      severity: severityFilter === 'all' ? undefined : severityFilter,
      status: statusFilter === 'all' ? undefined : statusFilter,
      search: search || undefined,
    })
      .then((result) => {
        if (requestIdRef.current !== requestId) return
        setData(result)
      })
      .catch((err) => {
        if (requestIdRef.current !== requestId) return
        setError(err instanceof Error ? err.message : 'Đã có lỗi xảy ra')
      })
      .finally(() => {
        if (requestIdRef.current !== requestId) return
        setLoading(false)
      })
  }

  function loadStats() {
    if (!project) {
      setStats(null)
      return
    }
    const requestId = ++statsRequestIdRef.current
    getDefectStats(project.id)
      .then((result) => {
        if (statsRequestIdRef.current !== requestId) return
        setStats(result)
      })
      .catch(() => {
        if (statsRequestIdRef.current !== requestId) return
        setStats(null)
      })
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-heading text-xl font-semibold">Defects</h1>
          <p className="text-sm text-muted-foreground">
            {stats
              ? `${stats.total} defects · ${stats.by_status.Open ?? 0} Open · ${stats.by_severity.Critical ?? 0} Critical`
              : ' '}
          </p>
        </div>
        <Button
          type="button"
          onClick={() => setNewOpen(true)}
          disabled={!project}
          className="w-full sm:w-auto"
        >
          <Plus />
          Log Defect
        </Button>
      </div>

      {stats && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
          {STATUS_OPTIONS.map((s) => (
            <Card key={s} className="items-center gap-1 py-3 text-center">
              <p className="text-2xl font-semibold">{stats.by_status[s] ?? 0}</p>
              <p className="text-xs text-muted-foreground">{s}</p>
            </Card>
          ))}
          {SEVERITY_OPTIONS.map((s) => (
            <Card key={s} className="items-center gap-1 py-3 text-center">
              <p className="text-2xl font-semibold">{stats.by_severity[s] ?? 0}</p>
              <p className="text-xs text-muted-foreground">{s}</p>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <Input
            placeholder="Tìm defect..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="sm:max-w-xs"
          />
          <Select
            value={severityFilter}
            onValueChange={(value) => setSeverityFilter(value as DefectSeverity | 'all')}
          >
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue placeholder="Severity: All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Severity: All</SelectItem>
              {SEVERITY_OPTIONS.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={statusFilter}
            onValueChange={(value) => setStatusFilter(value as DefectStatus | 'all')}
          >
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue placeholder="Status: All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Status: All</SelectItem>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>

        {!project && (
          <p className="px-4 text-sm text-muted-foreground">Vui lòng chọn một dự án.</p>
        )}
        {project && loading && (
          <p className="px-4 text-sm text-muted-foreground">Đang tải...</p>
        )}
        {project && error && (
          <div className="flex items-center gap-3 px-4">
            <p className="text-sm text-destructive">{error}</p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => load(project.id, page, severityFilter, statusFilter, debouncedSearch)}
            >
              Thử lại
            </Button>
          </div>
        )}
        {project && !loading && !error && data && data.items.length === 0 && (
          <p className="px-4 text-sm text-muted-foreground">Không tìm thấy defect nào.</p>
        )}
        {project && !loading && !error && data && data.items.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">ID</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Linked TC</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="pr-4">Fixed</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((d: DefectListItem) => (
                <TableRow key={d.id}>
                  <TableCell className="pl-4">
                    <Link to={`/defects/${d.id}`} className="text-primary underline-offset-4 hover:underline">
                      {d.code}
                    </Link>
                  </TableCell>
                  <TableCell>{d.title}</TableCell>
                  <TableCell>
                    <Badge className={DEFECT_SEVERITY_BADGE_CLASS[d.severity ?? ''] ?? ''}>
                      {d.severity ?? '—'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge className={DEFECT_STATUS_BADGE_CLASS[d.status] ?? ''}>{d.status}</Badge>
                  </TableCell>
                  <TableCell>
                    {d.test_case ? (
                      <Link
                        to={`/testcases/${d.test_case.id}`}
                        className="text-primary underline-offset-4 hover:underline"
                      >
                        {d.test_case.code}
                      </Link>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(d.created_at)}</TableCell>
                  <TableCell className="pr-4">{d.fixed_in_version ?? '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {project && !loading && !error && data && data.total > 0 && (
          <div className="flex items-center justify-between px-4 pt-2">
            <p className="text-sm text-muted-foreground">
              Trang {data.page} / {totalPages}
            </p>
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                ← Trước
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Sau →
              </Button>
            </div>
          </div>
        )}
      </Card>

      {project && (
        <NewDefectDialog
          open={newOpen}
          onOpenChange={setNewOpen}
          projectId={project.id}
          onCreated={(defect) => {
            load(project.id, page, severityFilter, statusFilter, debouncedSearch)
            loadStats()
            toast.success(`Đã tạo defect ${defect.code}.`, {
              href: `/defects/${defect.id}`,
              linkLabel: 'Xem defect →',
            })
          }}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `cd frontend && npx tsc --noEmit`

Expected: no errors.

- [ ] **Step 3: Manual smoke pass (interactive — hand off if no browser tool is available)**

With `npm run dev` running: open `/defects`, confirm the stats tiles, search box, and
severity/status selects render; use "Log Defect" to create one with only a title/severity
(no TC/REQ link) and confirm it appears in the list and the stats update; open its detail
page via the code link, use "Sửa" to change status to `Fixed` with a `fixed_in_version`,
confirm the detail page and (after navigating back) the list's "Fixed" column reflect it.
This step requires a browser — if no browser-automation tool is available in this session,
say so explicitly rather than claiming it was observed, per `CLAUDE.md`'s verification
convention, and leave it for whoever drives the session interactively.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/DefectsPage.tsx
git commit -m "feat: build DefectsPage list with stats, filters, search, create"
```
