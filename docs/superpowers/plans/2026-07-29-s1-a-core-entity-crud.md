# S1-A Core Entity CRUD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the backend CRUD APIs for Requirement (versioned), TestCase, Defect, and Test Execution (TestRun / TestRunResult), per sprint task S1-A.

**Architecture:** FastAPI routers (one file per entity, following the existing `routers/auth.py` pattern), backed directly by the existing SQLAlchemy models in `models/all_models.py`. All routes require the existing JWT dependency. A small shared `code_generator` service produces sequential entity codes; a `embedding_service` stub exists so `POST/PUT /test-cases` has a call site ready for S2-A.

**Tech Stack:** FastAPI, SQLAlchemy 2.0, Pydantic v2, pytest + `TestClient`, existing PostgreSQL dev DB (tests run in a rolled-back transaction per `tests/conftest.py`).

## Global Constraints

- All new endpoints require the existing JWT dependency (`services.auth_service.get_current_user`) — 401 without a valid token.
- One router file + one schema file per entity (existing convention: see `routers/auth.py` / `schemas/auth.py`).
- Every list endpoint is paginated: query params `page` (default 1) and `limit` (default 50, max 200), response envelope `{items, total, page, limit}`.
- Enum fields, exactly these values:
  - Requirement.status / TestCase.status: `Draft | Active | Deprecated`
  - TestCase.priority: `High | Medium | Low`
  - Defect.severity: `Critical | High | Medium | Low`
  - Defect.status: `Open | Fixed | Closed | Wont-Fix`
  - TestRunResult.result: `Pass | Fail | Skip | Blocked`
- `test_runs.release_id` is required; there is **no** `release_version` column (dropped by the already-merged fix `43bf447`). `POST /test-runs` accepts only `release_id`; `release_version` is resolved via a join to `Release.version_name` wherever it's returned.
- Auto-generated codes are sequential and zero-padded to 3 digits: `REQ-001`, `TC-001`, `DEF-001`.
- Spec: `docs/superpowers/specs/2026-07-29-s1-a-core-entity-crud-design.md`.

---

### Task 1: Shared test auth fixtures + code generator service

**Files:**
- Modify: `backend/tests/conftest.py`
- Create: `backend/services/code_generator.py`
- Test: `backend/tests/test_code_generator.py`

**Interfaces:**
- Consumes: `models.all_models.User`, `models.base.get_db`, `services.auth_service.create_access_token` (all existing).
- Produces:
  - pytest fixture `test_user(db_session) -> User` — inserts one User row.
  - pytest fixture `auth_headers(test_user) -> dict[str, str]` — `{"Authorization": "Bearer <token>"}`, usable by every later test file.
  - `services.code_generator.next_code(db: Session, model: type, code_column: str, prefix: str, padding: int = 3) -> str`

- [ ] **Step 1: Write the failing test for `next_code`**

Create `backend/tests/test_code_generator.py`:

```python
from models.all_models import Requirement
from services.code_generator import next_code


def test_next_code_starts_at_001_when_empty(db_session):
    code = next_code(db_session, Requirement, "req_id", "REQ")
    assert code == "REQ-001"


def test_next_code_increments_from_existing(db_session):
    db_session.add(
        Requirement(
            req_id="REQ-001",
            version=1,
            title="Existing",
            description="d",
            status="Active",
            is_current=True,
        )
    )
    db_session.commit()

    code = next_code(db_session, Requirement, "req_id", "REQ")
    assert code == "REQ-002"


def test_next_code_ignores_other_prefixes(db_session):
    db_session.add(
        Requirement(
            req_id="REQ-001",
            version=1,
            title="Existing",
            description="d",
            status="Active",
            is_current=True,
        )
    )
    db_session.commit()

    code = next_code(db_session, Requirement, "req_id", "OTHER")
    assert code == "OTHER-001"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && venv/Scripts/python.exe -m pytest tests/test_code_generator.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'services.code_generator'`

- [ ] **Step 3: Implement `next_code`**

Create `backend/services/code_generator.py`:

```python
import re

from sqlalchemy.orm import Session


def next_code(db: Session, model: type, code_column: str, prefix: str, padding: int = 3) -> str:
    column = getattr(model, code_column)
    like_pattern = f"{prefix}-%"
    rows = db.query(column).filter(column.like(like_pattern)).all()

    pattern = re.compile(rf"^{re.escape(prefix)}-(\d+)$")
    max_num = 0
    for (code,) in rows:
        match = pattern.match(code)
        if match:
            max_num = max(max_num, int(match.group(1)))

    return f"{prefix}-{max_num + 1:0{padding}d}"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && venv/Scripts/python.exe -m pytest tests/test_code_generator.py -v`
Expected: PASS (3 passed)

- [ ] **Step 5: Add shared auth fixtures to conftest.py**

Modify `backend/tests/conftest.py` — add these imports at the top (after existing imports) and these two fixtures at the end of the file:

```python
from models.all_models import User
from services.auth_service import create_access_token
```

```python
@pytest.fixture()
def test_user(db_session):
    user = User(
        email="qc.engineer@example.com",
        hashed_password="not-used-in-tests",
        full_name="QC Engineer",
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture()
def auth_headers(test_user):
    token = create_access_token(test_user.id)
    return {"Authorization": f"Bearer {token}"}
```

The full file after this step:

```python
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import sessionmaker

from main import app
from models.base import engine, get_db
from models.all_models import User
from services.auth_service import create_access_token


@pytest.fixture()
def db_session():
    """Each test runs inside a transaction that's rolled back afterward —
    hits the real dev DB (per project convention: no chunking/mocking of
    infra) but never leaves data behind."""
    connection = engine.connect()
    transaction = connection.begin()
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=connection)
    session = TestingSessionLocal()

    yield session

    session.close()
    transaction.rollback()
    connection.close()


@pytest.fixture()
def client(db_session):
    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture()
def test_user(db_session):
    user = User(
        email="qc.engineer@example.com",
        hashed_password="not-used-in-tests",
        full_name="QC Engineer",
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture()
def auth_headers(test_user):
    token = create_access_token(test_user.id)
    return {"Authorization": f"Bearer {token}"}
```

- [ ] **Step 6: Run full test suite to verify nothing broke**

Run: `cd backend && venv/Scripts/python.exe -m pytest -v`
Expected: all tests pass (existing tests + 3 new `test_code_generator` tests)

- [ ] **Step 7: Commit**

```bash
git add backend/tests/conftest.py backend/services/code_generator.py backend/tests/test_code_generator.py
git commit -m "test: add shared auth fixtures and code generator service"
```

---

### Task 2: Embedding service stub

**Files:**
- Create: `backend/services/embedding_service.py`
- Test: `backend/tests/test_embedding_service.py`

**Interfaces:**
- Consumes: `models.all_models.TestCase` (existing).
- Produces: `services.embedding_service.trigger_embedding(test_case: TestCase) -> None` — no-op today, call site for S2-A to replace later.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_embedding_service.py`:

```python
from models.all_models import TestCase
from services.embedding_service import trigger_embedding


def test_trigger_embedding_is_a_noop():
    tc = TestCase(
        code="TC-999",
        title="Placeholder",
        expected_result="n/a",
        priority="Low",
        status="Draft",
    )
    assert trigger_embedding(tc) is None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && venv/Scripts/python.exe -m pytest tests/test_embedding_service.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'services.embedding_service'`

- [ ] **Step 3: Implement the stub**

Create `backend/services/embedding_service.py`:

```python
from models.all_models import TestCase


def trigger_embedding(test_case: TestCase) -> None:
    """Placeholder call site for S2-A's real embedding pipeline.

    S2-A will replace this body with an embed() call plus an async update
    of test_case.embedding; until then it intentionally does nothing.
    """
    return None
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && venv/Scripts/python.exe -m pytest tests/test_embedding_service.py -v`
Expected: PASS (1 passed)

- [ ] **Step 5: Commit**

```bash
git add backend/services/embedding_service.py backend/tests/test_embedding_service.py
git commit -m "feat: add embedding trigger stub for test cases"
```

---

### Task 3: Requirements API

**Files:**
- Create: `backend/schemas/common.py`
- Create: `backend/schemas/requirements.py`
- Create: `backend/routers/requirements.py`
- Modify: `backend/main.py`
- Test: `backend/tests/test_requirements.py`

**Interfaces:**
- Consumes: `services.code_generator.next_code`, `services.auth_service.get_current_user`, `models.all_models.Requirement`, fixtures `client`/`auth_headers` from Task 1.
- Produces:
  - `schemas.common.RequirementSummary` (id, req_id, version, title, status) — reused by TestCase/Defect detail responses in later tasks.
  - `schemas.requirements.{RequirementCreate, RequirementUpdate, RequirementResponse, RequirementListResponse}`
  - Router mounted at `/requirements` in `main.py`.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_requirements.py`:

```python
def _create_requirement(client, auth_headers, **overrides):
    body = {
        "title": "User can log in",
        "description": "As a user, I want to log in with email and password",
        "status": "Draft",
    }
    body.update(overrides)
    return client.post("/requirements", json=body, headers=auth_headers)


def test_create_requirement_generates_req_id_and_version_1(client, auth_headers):
    response = _create_requirement(client, auth_headers)
    assert response.status_code == 201
    data = response.json()
    assert data["req_id"] == "REQ-001"
    assert data["version"] == 1
    assert data["is_current"] is True


def test_list_requirements_returns_only_current_versions(client, auth_headers):
    _create_requirement(client, auth_headers)
    response = client.get("/requirements", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert data["items"][0]["is_current"] is True


def test_list_requirements_filters_by_status(client, auth_headers):
    _create_requirement(client, auth_headers, status="Draft")
    _create_requirement(client, auth_headers, status="Active")
    response = client.get("/requirements?status=Active", headers=auth_headers)
    data = response.json()
    assert data["total"] == 1
    assert data["items"][0]["status"] == "Active"


def test_list_requirements_search_matches_title(client, auth_headers):
    _create_requirement(client, auth_headers, title="OTP login flow")
    _create_requirement(client, auth_headers, title="Password reset")
    response = client.get("/requirements?search=OTP", headers=auth_headers)
    data = response.json()
    assert data["total"] == 1
    assert "OTP" in data["items"][0]["title"]


def test_get_requirement_detail_by_id(client, auth_headers):
    created = _create_requirement(client, auth_headers).json()
    response = client.get(f"/requirements/{created['id']}", headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["id"] == created["id"]


def test_get_requirement_detail_missing_returns_404(client, auth_headers):
    response = client.get("/requirements/999999", headers=auth_headers)
    assert response.status_code == 404


def test_update_requirement_creates_new_version_and_history_has_three(client, auth_headers):
    v1 = _create_requirement(client, auth_headers).json()

    update_body = {
        "title": "User can log in (v2)",
        "description": "Adds OTP step",
        "status": "Active",
        "change_note": "Added OTP",
    }
    v2_response = client.put(f"/requirements/{v1['id']}", json=update_body, headers=auth_headers)
    assert v2_response.status_code == 200
    v2 = v2_response.json()
    assert v2["version"] == 2
    assert v2["is_current"] is True
    assert v2["previous_version_id"] == v1["id"]
    assert v2["req_id"] == v1["req_id"]

    update_body_2 = {**update_body, "title": "User can log in (v3)", "change_note": "Fix wording"}
    v3_response = client.put(f"/requirements/{v2['id']}", json=update_body_2, headers=auth_headers)
    v3 = v3_response.json()
    assert v3["version"] == 3

    history_response = client.get(f"/requirements/{v1['req_id']}/history", headers=auth_headers)
    assert history_response.status_code == 200
    history = history_response.json()
    assert len(history) == 3
    assert [item["version"] for item in history] == [1, 2, 3]
    assert history[0]["is_current"] is False
    assert history[1]["is_current"] is False
    assert history[2]["is_current"] is True


def test_requirements_require_auth(client):
    response = client.get("/requirements")
    assert response.status_code == 401
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && venv/Scripts/python.exe -m pytest tests/test_requirements.py -v`
Expected: FAIL with 404s (no `/requirements` route registered yet) since `main.py` has no such router.

- [ ] **Step 3: Create the common summary schema**

Create `backend/schemas/common.py`:

```python
from pydantic import BaseModel


class RequirementSummary(BaseModel):
    id: int
    req_id: str
    version: int
    title: str
    status: str

    class Config:
        from_attributes = True
```

- [ ] **Step 4: Create the Requirement schemas**

Create `backend/schemas/requirements.py`:

```python
from datetime import datetime
from typing import Literal

from pydantic import BaseModel

RequirementStatus = Literal["Draft", "Active", "Deprecated"]


class RequirementCreate(BaseModel):
    title: str
    description: str
    status: RequirementStatus = "Draft"


class RequirementUpdate(BaseModel):
    title: str
    description: str
    status: RequirementStatus
    change_note: str | None = None


class RequirementResponse(BaseModel):
    id: int
    req_id: str
    version: int
    title: str
    description: str
    status: str
    is_current: bool
    change_note: str | None
    changed_by: str | None
    previous_version_id: int | None
    created_at: datetime

    class Config:
        from_attributes = True


class RequirementListResponse(BaseModel):
    items: list[RequirementResponse]
    total: int
    page: int
    limit: int
```

- [ ] **Step 5: Create the Requirements router**

Create `backend/routers/requirements.py`:

```python
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from models.all_models import Requirement, User
from models.base import get_db
from schemas.requirements import (
    RequirementCreate,
    RequirementListResponse,
    RequirementResponse,
    RequirementUpdate,
)
from services.auth_service import get_current_user
from services.code_generator import next_code

router = APIRouter(
    prefix="/requirements",
    tags=["requirements"],
    dependencies=[Depends(get_current_user)],
)


@router.get("", response_model=RequirementListResponse)
def list_requirements(
    status: str | None = None,
    search: str | None = None,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    query = db.query(Requirement).filter(Requirement.is_current == True)
    if status is not None:
        query = query.filter(Requirement.status == status)
    if search is not None:
        query = query.filter(Requirement.title.ilike(f"%{search}%"))

    total = query.count()
    items = (
        query.order_by(Requirement.id)
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )
    return RequirementListResponse(items=items, total=total, page=page, limit=limit)


@router.get("/{id}", response_model=RequirementResponse)
def get_requirement(id: int, db: Session = Depends(get_db)):
    req = db.get(Requirement, id)
    if req is None:
        raise HTTPException(status_code=404, detail="Requirement not found")
    return req


@router.post("", response_model=RequirementResponse, status_code=status.HTTP_201_CREATED)
def create_requirement(payload: RequirementCreate, db: Session = Depends(get_db)):
    req_id = next_code(db, Requirement, "req_id", "REQ")
    req = Requirement(
        req_id=req_id,
        version=1,
        title=payload.title,
        description=payload.description,
        status=payload.status,
        is_current=True,
    )
    db.add(req)
    db.commit()
    db.refresh(req)
    return req


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

    old.is_current = False

    new = Requirement(
        req_id=old.req_id,
        version=old.version + 1,
        title=payload.title,
        description=payload.description,
        status=payload.status,
        is_current=True,
        change_note=payload.change_note,
        changed_by=current_user.email,
        previous_version_id=old.id,
    )
    db.add(new)
    db.commit()
    db.refresh(new)
    return new


@router.get("/{req_id}/history", response_model=list[RequirementResponse])
def get_requirement_history(req_id: str, db: Session = Depends(get_db)):
    versions = (
        db.query(Requirement)
        .filter(Requirement.req_id == req_id)
        .order_by(Requirement.version)
        .all()
    )
    if not versions:
        raise HTTPException(status_code=404, detail="Requirement not found")
    return versions
```

- [ ] **Step 6: Register the router in main.py**

Modify `backend/main.py`:

```python
from fastapi import FastAPI

from routers.auth import router as auth_router
from routers.requirements import router as requirements_router

app = FastAPI(title="QC Suite API")

app.include_router(auth_router)
app.include_router(requirements_router)


@app.get("/health")
def health():
    return {"status": "ok"}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd backend && venv/Scripts/python.exe -m pytest tests/test_requirements.py -v`
Expected: PASS (9 passed)

- [ ] **Step 8: Run full suite**

Run: `cd backend && venv/Scripts/python.exe -m pytest -v`
Expected: all pass

- [ ] **Step 9: Commit**

```bash
git add backend/schemas/common.py backend/schemas/requirements.py backend/routers/requirements.py backend/main.py backend/tests/test_requirements.py
git commit -m "feat: add versioned Requirement CRUD API"
```

---

### Task 4: TestRuns API

**Files:**
- Create: `backend/schemas/test_runs.py`
- Create: `backend/routers/test_runs.py`
- Modify: `backend/main.py`
- Test: `backend/tests/test_test_runs.py`

**Interfaces:**
- Consumes: `models.all_models.{Release, TestRun}`, `services.auth_service.get_current_user`.
- Produces:
  - `schemas.test_runs.{TestRunCreate, TestRunResponse}`
  - Router mounted at `/test-runs` in `main.py`.
  - `TestRunResponse` shape (used by Task 5's execution history): `{id, release_id, release_version, executed_at, executed_by, note}`.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_test_runs.py`:

```python
from models.all_models import Project, Release


def _create_release(db_session):
    project = Project(name="Home Lending", description="d")
    db_session.add(project)
    db_session.commit()
    db_session.refresh(project)

    release = Release(project_id=project.id, version_name="v2.0.0", note="first release")
    db_session.add(release)
    db_session.commit()
    db_session.refresh(release)
    return release


def test_create_test_run(client, auth_headers, db_session):
    release = _create_release(db_session)
    response = client.post(
        "/test-runs",
        json={"release_id": release.id, "executed_by": "An", "note": "smoke run"},
        headers=auth_headers,
    )
    assert response.status_code == 201
    data = response.json()
    assert data["release_id"] == release.id
    assert data["release_version"] == "v2.0.0"


def test_create_test_run_rejects_unknown_release(client, auth_headers):
    response = client.post(
        "/test-runs",
        json={"release_id": 999999, "executed_by": "An"},
        headers=auth_headers,
    )
    assert response.status_code == 400


def test_list_test_runs_by_release(client, auth_headers, db_session):
    release = _create_release(db_session)
    client.post("/test-runs", json={"release_id": release.id, "executed_by": "An"}, headers=auth_headers)
    client.post("/test-runs", json={"release_id": release.id, "executed_by": "Huyen"}, headers=auth_headers)

    response = client.get(f"/test-runs?release_id={release.id}", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2
    assert all(run["release_version"] == "v2.0.0" for run in data)


def test_test_runs_require_auth(client, db_session):
    release = _create_release(db_session)
    response = client.get(f"/test-runs?release_id={release.id}")
    assert response.status_code == 401
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && venv/Scripts/python.exe -m pytest tests/test_test_runs.py -v`
Expected: FAIL (404, no `/test-runs` route yet)

- [ ] **Step 3: Create the TestRun schemas**

Create `backend/schemas/test_runs.py`:

```python
from datetime import datetime

from pydantic import BaseModel


class TestRunCreate(BaseModel):
    release_id: int
    executed_by: str | None = None
    note: str | None = None


class TestRunResponse(BaseModel):
    id: int
    release_id: int
    release_version: str
    executed_at: datetime
    executed_by: str | None
    note: str | None
```

- [ ] **Step 4: Create the TestRuns router**

Create `backend/routers/test_runs.py`:

```python
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from models.all_models import Release, TestRun
from models.base import get_db
from schemas.test_runs import TestRunCreate, TestRunResponse
from services.auth_service import get_current_user

router = APIRouter(
    prefix="/test-runs",
    tags=["test-runs"],
    dependencies=[Depends(get_current_user)],
)


def _to_response(run: TestRun, release_version: str) -> TestRunResponse:
    return TestRunResponse(
        id=run.id,
        release_id=run.release_id,
        release_version=release_version,
        executed_at=run.executed_at,
        executed_by=run.executed_by,
        note=run.note,
    )


@router.post("", response_model=TestRunResponse, status_code=status.HTTP_201_CREATED)
def create_test_run(payload: TestRunCreate, db: Session = Depends(get_db)):
    release = db.get(Release, payload.release_id)
    if release is None:
        raise HTTPException(status_code=400, detail="release_id not found")

    run = TestRun(
        release_id=payload.release_id,
        executed_by=payload.executed_by,
        note=payload.note,
    )
    db.add(run)
    db.commit()
    db.refresh(run)
    return _to_response(run, release.version_name)


@router.get("", response_model=list[TestRunResponse])
def list_test_runs(release_id: int = Query(...), db: Session = Depends(get_db)):
    release = db.get(Release, release_id)
    if release is None:
        raise HTTPException(status_code=404, detail="Release not found")

    runs = (
        db.query(TestRun)
        .filter(TestRun.release_id == release_id)
        .order_by(TestRun.executed_at.desc())
        .all()
    )
    return [_to_response(r, release.version_name) for r in runs]
```

- [ ] **Step 5: Register the router in main.py**

Modify `backend/main.py`:

```python
from fastapi import FastAPI

from routers.auth import router as auth_router
from routers.requirements import router as requirements_router
from routers.test_runs import router as test_runs_router

app = FastAPI(title="QC Suite API")

app.include_router(auth_router)
app.include_router(requirements_router)
app.include_router(test_runs_router)


@app.get("/health")
def health():
    return {"status": "ok"}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd backend && venv/Scripts/python.exe -m pytest tests/test_test_runs.py -v`
Expected: PASS (4 passed)

- [ ] **Step 7: Run full suite**

Run: `cd backend && venv/Scripts/python.exe -m pytest -v`
Expected: all pass

- [ ] **Step 8: Commit**

```bash
git add backend/schemas/test_runs.py backend/routers/test_runs.py backend/main.py backend/tests/test_test_runs.py
git commit -m "feat: add TestRun API for release-scoped test execution"
```

---

### Task 5: TestCases API (CRUD + execution)

**Files:**
- Modify: `backend/schemas/common.py`
- Create: `backend/schemas/test_cases.py`
- Create: `backend/routers/test_cases.py`
- Modify: `backend/main.py`
- Test: `backend/tests/test_test_cases.py`

**Interfaces:**
- Consumes: `schemas.common.RequirementSummary` (Task 3), `services.code_generator.next_code` (Task 1), `services.embedding_service.trigger_embedding` (Task 2), `models.all_models.{Requirement, TestCase, TestRun, TestRunResult, Release}`.
- Produces:
  - `schemas.common.TestCaseSummary` (id, code, title, status) — reused by Defect detail response in Task 6.
  - `schemas.test_cases.{TestCaseCreate, TestCaseUpdate, TestCaseResponse, TestCaseDetailResponse, TestCaseListResponse, ExecuteTestCaseRequest, ExecutionResultResponse, TestCaseExecutionHistoryItem}`
  - Router mounted at `/test-cases` in `main.py`, including `/test-cases/{id}/execute` and `/test-cases/{id}/results`.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_test_cases.py`:

```python
from models.all_models import Project, Release, Requirement


def _create_requirement_row(db_session, **overrides):
    defaults = dict(
        req_id="REQ-001",
        version=1,
        title="User can log in",
        description="d",
        status="Active",
        is_current=True,
    )
    defaults.update(overrides)
    req = Requirement(**defaults)
    db_session.add(req)
    db_session.commit()
    db_session.refresh(req)
    return req


def _create_release_row(db_session):
    project = Project(name="Home Lending", description="d")
    db_session.add(project)
    db_session.commit()
    db_session.refresh(project)
    release = Release(project_id=project.id, version_name="v2.0.0")
    db_session.add(release)
    db_session.commit()
    db_session.refresh(release)
    return release


def _create_test_case(client, auth_headers, requirement_id, **overrides):
    body = {
        "title": "Login with valid credentials",
        "preconditions": "User exists",
        "steps": "1. Open login page\n2. Enter credentials\n3. Submit",
        "expected_result": "User is redirected to dashboard",
        "priority": "High",
        "requirement_id": requirement_id,
    }
    body.update(overrides)
    return client.post("/test-cases", json=body, headers=auth_headers)


def test_create_test_case_generates_code(client, auth_headers, db_session):
    req = _create_requirement_row(db_session)
    response = _create_test_case(client, auth_headers, req.id)
    assert response.status_code == 201
    data = response.json()
    assert data["code"] == "TC-001"
    assert data["status"] == "Draft"


def test_create_test_case_rejects_unknown_requirement(client, auth_headers):
    response = _create_test_case(client, auth_headers, 999999)
    assert response.status_code == 400


def test_list_test_cases_filters_by_requirement_priority(client, auth_headers, db_session):
    req = _create_requirement_row(db_session)
    other_req = _create_requirement_row(db_session, req_id="REQ-002")
    _create_test_case(client, auth_headers, req.id, priority="High")
    _create_test_case(client, auth_headers, other_req.id, priority="Low")

    response = client.get(f"/test-cases?requirement_id={req.id}", headers=auth_headers)
    data = response.json()
    assert data["total"] == 1
    assert data["items"][0]["requirement_id"] == req.id

    response = client.get("/test-cases?priority=Low", headers=auth_headers)
    data = response.json()
    assert data["total"] == 1
    assert data["items"][0]["priority"] == "Low"


def test_get_test_case_detail_includes_requirement_summary(client, auth_headers, db_session):
    req = _create_requirement_row(db_session)
    created = _create_test_case(client, auth_headers, req.id).json()

    response = client.get(f"/test-cases/{created['id']}", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["requirement"]["req_id"] == req.req_id


def test_update_test_case_changes_fields(client, auth_headers, db_session):
    req = _create_requirement_row(db_session)
    created = _create_test_case(client, auth_headers, req.id).json()

    update_body = {
        "title": "Login with valid credentials (updated)",
        "preconditions": "User exists",
        "steps": "1. Open login page\n2. Enter credentials\n3. Submit",
        "expected_result": "User is redirected to dashboard",
        "priority": "Medium",
        "status": "Active",
        "requirement_id": req.id,
    }
    response = client.put(f"/test-cases/{created['id']}", json=update_body, headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["priority"] == "Medium"
    assert data["status"] == "Active"


def test_delete_test_case_soft_deletes(client, auth_headers, db_session):
    req = _create_requirement_row(db_session)
    created = _create_test_case(client, auth_headers, req.id).json()

    response = client.delete(f"/test-cases/{created['id']}", headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["status"] == "Deprecated"

    still_there = client.get(f"/test-cases/{created['id']}", headers=auth_headers)
    assert still_there.status_code == 200


def test_execute_test_case_creates_then_updates_result(client, auth_headers, db_session):
    req = _create_requirement_row(db_session)
    release = _create_release_row(db_session)
    tc = _create_test_case(client, auth_headers, req.id).json()
    run = client.post(
        "/test-runs", json={"release_id": release.id, "executed_by": "An"}, headers=auth_headers
    ).json()

    first = client.post(
        f"/test-cases/{tc['id']}/execute",
        json={"run_id": run["id"], "result": "Fail", "note": "first try"},
        headers=auth_headers,
    )
    assert first.status_code == 200
    assert first.json()["result"] == "Fail"

    second = client.post(
        f"/test-cases/{tc['id']}/execute",
        json={"run_id": run["id"], "result": "Pass", "note": "fixed"},
        headers=auth_headers,
    )
    assert second.status_code == 200
    second_data = second.json()
    assert second_data["result"] == "Pass"
    assert second_data["id"] == first.json()["id"]

    history = client.get(f"/test-cases/{tc['id']}/results", headers=auth_headers)
    assert history.status_code == 200
    history_data = history.json()
    assert len(history_data) == 1
    assert history_data[0]["result"] == "Pass"
    assert history_data[0]["release_version"] == "v2.0.0"


def test_test_cases_require_auth(client):
    response = client.get("/test-cases")
    assert response.status_code == 401
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && venv/Scripts/python.exe -m pytest tests/test_test_cases.py -v`
Expected: FAIL (404, no `/test-cases` route yet)

- [ ] **Step 3: Add TestCaseSummary to the common schemas**

Modify `backend/schemas/common.py` to add a second class at the end of the file:

```python
class TestCaseSummary(BaseModel):
    id: int
    code: str
    title: str
    status: str

    class Config:
        from_attributes = True
```

Full file after this step:

```python
from pydantic import BaseModel


class RequirementSummary(BaseModel):
    id: int
    req_id: str
    version: int
    title: str
    status: str

    class Config:
        from_attributes = True


class TestCaseSummary(BaseModel):
    id: int
    code: str
    title: str
    status: str

    class Config:
        from_attributes = True
```

- [ ] **Step 4: Create the TestCase schemas**

Create `backend/schemas/test_cases.py`:

```python
from datetime import datetime
from typing import Literal

from pydantic import BaseModel

from schemas.common import RequirementSummary

TestCasePriority = Literal["High", "Medium", "Low"]
TestCaseStatus = Literal["Draft", "Active", "Deprecated"]
ExecutionResult = Literal["Pass", "Fail", "Skip", "Blocked"]


class TestCaseCreate(BaseModel):
    title: str
    preconditions: str | None = None
    steps: str | None = None
    expected_result: str
    priority: TestCasePriority
    requirement_id: int


class TestCaseUpdate(BaseModel):
    title: str
    preconditions: str | None = None
    steps: str | None = None
    expected_result: str
    priority: TestCasePriority
    status: TestCaseStatus
    requirement_id: int


class TestCaseResponse(BaseModel):
    id: int
    code: str
    title: str
    preconditions: str | None
    steps: str | None
    expected_result: str
    priority: str | None
    status: str
    requirement_id: int | None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class TestCaseDetailResponse(TestCaseResponse):
    requirement: RequirementSummary | None = None


class TestCaseListResponse(BaseModel):
    items: list[TestCaseResponse]
    total: int
    page: int
    limit: int


class ExecuteTestCaseRequest(BaseModel):
    run_id: int
    result: ExecutionResult
    note: str | None = None


class ExecutionResultResponse(BaseModel):
    id: int
    run_id: int
    testcase_id: int
    result: str
    note: str | None

    class Config:
        from_attributes = True


class TestCaseExecutionHistoryItem(BaseModel):
    release_version: str
    result: str
    executed_at: datetime
    note: str | None
```

- [ ] **Step 5: Create the TestCases router**

Create `backend/routers/test_cases.py`:

```python
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from models.all_models import Release, Requirement, TestCase, TestRun, TestRunResult
from models.base import get_db
from schemas.common import RequirementSummary
from schemas.test_cases import (
    ExecuteTestCaseRequest,
    ExecutionResultResponse,
    TestCaseCreate,
    TestCaseDetailResponse,
    TestCaseExecutionHistoryItem,
    TestCaseListResponse,
    TestCaseResponse,
    TestCaseUpdate,
)
from services.auth_service import get_current_user
from services.code_generator import next_code
from services.embedding_service import trigger_embedding

router = APIRouter(
    prefix="/test-cases",
    tags=["test-cases"],
    dependencies=[Depends(get_current_user)],
)


@router.get("", response_model=TestCaseListResponse)
def list_test_cases(
    requirement_id: int | None = None,
    priority: str | None = None,
    status: str | None = None,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    query = db.query(TestCase)
    if requirement_id is not None:
        query = query.filter(TestCase.requirement_id == requirement_id)
    if priority is not None:
        query = query.filter(TestCase.priority == priority)
    if status is not None:
        query = query.filter(TestCase.status == status)

    total = query.count()
    items = (
        query.order_by(TestCase.id)
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )
    return TestCaseListResponse(items=items, total=total, page=page, limit=limit)


@router.post("", response_model=TestCaseResponse, status_code=status.HTTP_201_CREATED)
def create_test_case(payload: TestCaseCreate, db: Session = Depends(get_db)):
    requirement = db.get(Requirement, payload.requirement_id)
    if requirement is None:
        raise HTTPException(status_code=400, detail="requirement_id not found")

    code = next_code(db, TestCase, "code", "TC")
    tc = TestCase(
        code=code,
        title=payload.title,
        preconditions=payload.preconditions,
        steps=payload.steps,
        expected_result=payload.expected_result,
        priority=payload.priority,
        requirement_id=payload.requirement_id,
    )
    db.add(tc)
    db.commit()
    db.refresh(tc)
    trigger_embedding(tc)
    return tc


@router.get("/{id}", response_model=TestCaseDetailResponse)
def get_test_case(id: int, db: Session = Depends(get_db)):
    tc = db.get(TestCase, id)
    if tc is None:
        raise HTTPException(status_code=404, detail="TestCase not found")

    requirement = db.get(Requirement, tc.requirement_id) if tc.requirement_id else None
    response = TestCaseDetailResponse.model_validate(tc)
    response.requirement = (
        RequirementSummary.model_validate(requirement) if requirement else None
    )
    return response


@router.put("/{id}", response_model=TestCaseResponse)
def update_test_case(id: int, payload: TestCaseUpdate, db: Session = Depends(get_db)):
    tc = db.get(TestCase, id)
    if tc is None:
        raise HTTPException(status_code=404, detail="TestCase not found")
    requirement = db.get(Requirement, payload.requirement_id)
    if requirement is None:
        raise HTTPException(status_code=400, detail="requirement_id not found")

    content_changed = (
        tc.title != payload.title
        or tc.steps != payload.steps
        or tc.expected_result != payload.expected_result
    )

    tc.title = payload.title
    tc.preconditions = payload.preconditions
    tc.steps = payload.steps
    tc.expected_result = payload.expected_result
    tc.priority = payload.priority
    tc.status = payload.status
    tc.requirement_id = payload.requirement_id
    db.commit()
    db.refresh(tc)

    if content_changed:
        trigger_embedding(tc)

    return tc


@router.delete("/{id}", response_model=TestCaseResponse)
def delete_test_case(id: int, db: Session = Depends(get_db)):
    tc = db.get(TestCase, id)
    if tc is None:
        raise HTTPException(status_code=404, detail="TestCase not found")
    tc.status = "Deprecated"
    db.commit()
    db.refresh(tc)
    return tc


@router.post("/{id}/execute", response_model=ExecutionResultResponse)
def execute_test_case(id: int, payload: ExecuteTestCaseRequest, db: Session = Depends(get_db)):
    tc = db.get(TestCase, id)
    if tc is None:
        raise HTTPException(status_code=404, detail="TestCase not found")
    run = db.get(TestRun, payload.run_id)
    if run is None:
        raise HTTPException(status_code=400, detail="run_id not found")

    existing = (
        db.query(TestRunResult)
        .filter(
            TestRunResult.run_id == payload.run_id,
            TestRunResult.testcase_id == id,
        )
        .first()
    )
    if existing is not None:
        existing.result = payload.result
        existing.note = payload.note
        db.commit()
        db.refresh(existing)
        return existing

    result_row = TestRunResult(
        run_id=payload.run_id,
        testcase_id=id,
        result=payload.result,
        note=payload.note,
    )
    db.add(result_row)
    db.commit()
    db.refresh(result_row)
    return result_row


@router.get("/{id}/results", response_model=list[TestCaseExecutionHistoryItem])
def get_test_case_results(id: int, db: Session = Depends(get_db)):
    tc = db.get(TestCase, id)
    if tc is None:
        raise HTTPException(status_code=404, detail="TestCase not found")

    rows = (
        db.query(TestRunResult, TestRun)
        .join(TestRun, TestRunResult.run_id == TestRun.id)
        .filter(TestRunResult.testcase_id == id)
        .order_by(TestRun.executed_at.desc())
        .all()
    )
    history = []
    for result_row, run in rows:
        release = db.get(Release, run.release_id)
        history.append(
            TestCaseExecutionHistoryItem(
                release_version=release.version_name,
                result=result_row.result,
                executed_at=run.executed_at,
                note=result_row.note,
            )
        )
    return history
```

- [ ] **Step 6: Register the router in main.py**

Modify `backend/main.py`:

```python
from fastapi import FastAPI

from routers.auth import router as auth_router
from routers.requirements import router as requirements_router
from routers.test_runs import router as test_runs_router
from routers.test_cases import router as test_cases_router

app = FastAPI(title="QC Suite API")

app.include_router(auth_router)
app.include_router(requirements_router)
app.include_router(test_runs_router)
app.include_router(test_cases_router)


@app.get("/health")
def health():
    return {"status": "ok"}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd backend && venv/Scripts/python.exe -m pytest tests/test_test_cases.py -v`
Expected: PASS (8 passed)

- [ ] **Step 8: Run full suite**

Run: `cd backend && venv/Scripts/python.exe -m pytest -v`
Expected: all pass

- [ ] **Step 9: Commit**

```bash
git add backend/schemas/common.py backend/schemas/test_cases.py backend/routers/test_cases.py backend/main.py backend/tests/test_test_cases.py
git commit -m "feat: add TestCase CRUD API with execution tracking"
```

---

### Task 6: Defects API

**Files:**
- Create: `backend/schemas/defects.py`
- Create: `backend/routers/defects.py`
- Modify: `backend/main.py`
- Test: `backend/tests/test_defects.py`

**Interfaces:**
- Consumes: `schemas.common.{RequirementSummary, TestCaseSummary}` (Tasks 3 & 5), `services.code_generator.next_code` (Task 1), `models.all_models.{Defect, Requirement, TestCase}`.
- Produces:
  - `schemas.defects.{DefectCreate, DefectUpdate, DefectResponse, DefectDetailResponse, DefectListResponse}`
  - Router mounted at `/defects` in `main.py`.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_defects.py`:

```python
from models.all_models import Requirement, TestCase


def _create_requirement_row(db_session, **overrides):
    defaults = dict(
        req_id="REQ-001",
        version=1,
        title="User can log in",
        description="d",
        status="Active",
        is_current=True,
    )
    defaults.update(overrides)
    req = Requirement(**defaults)
    db_session.add(req)
    db_session.commit()
    db_session.refresh(req)
    return req


def _create_test_case_row(db_session, requirement_id, **overrides):
    defaults = dict(
        code="TC-001",
        title="Login with valid credentials",
        expected_result="User is redirected",
        priority="High",
        status="Draft",
        requirement_id=requirement_id,
    )
    defaults.update(overrides)
    tc = TestCase(**defaults)
    db_session.add(tc)
    db_session.commit()
    db_session.refresh(tc)
    return tc


def test_create_defect_generates_code(client, auth_headers):
    response = client.post(
        "/defects",
        json={"title": "Login fails with OTP", "severity": "High", "status": "Open"},
        headers=auth_headers,
    )
    assert response.status_code == 201
    assert response.json()["code"] == "DEF-001"


def test_create_defect_accepts_only_testcase_id(client, auth_headers, db_session):
    req = _create_requirement_row(db_session)
    tc = _create_test_case_row(db_session, req.id)
    response = client.post(
        "/defects",
        json={"title": "Bug", "severity": "Low", "status": "Open", "testcase_id": tc.id},
        headers=auth_headers,
    )
    assert response.status_code == 201
    data = response.json()
    assert data["testcase_id"] == tc.id
    assert data["requirement_id"] is None


def test_create_defect_accepts_only_requirement_id(client, auth_headers, db_session):
    req = _create_requirement_row(db_session)
    response = client.post(
        "/defects",
        json={"title": "Bug", "severity": "Low", "status": "Open", "requirement_id": req.id},
        headers=auth_headers,
    )
    assert response.status_code == 201
    data = response.json()
    assert data["requirement_id"] == req.id
    assert data["testcase_id"] is None


def test_create_defect_rejects_unknown_fk(client, auth_headers):
    response = client.post(
        "/defects",
        json={"title": "Bug", "severity": "Low", "status": "Open", "testcase_id": 999999},
        headers=auth_headers,
    )
    assert response.status_code == 400


def test_list_defects_filters_by_severity_and_status(client, auth_headers):
    client.post("/defects", json={"title": "A", "severity": "Critical", "status": "Open"}, headers=auth_headers)
    client.post("/defects", json={"title": "B", "severity": "Low", "status": "Closed"}, headers=auth_headers)

    response = client.get("/defects?severity=Critical", headers=auth_headers)
    data = response.json()
    assert data["total"] == 1
    assert data["items"][0]["severity"] == "Critical"

    response = client.get("/defects?status=Closed", headers=auth_headers)
    data = response.json()
    assert data["total"] == 1
    assert data["items"][0]["status"] == "Closed"


def test_get_defect_detail_includes_linked_summaries(client, auth_headers, db_session):
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
        },
        headers=auth_headers,
    ).json()

    response = client.get(f"/defects/{created['id']}", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["test_case"]["code"] == tc.code
    assert data["requirement"]["req_id"] == req.req_id


def test_update_defect_changes_severity_status_fixed_in_version(client, auth_headers):
    created = client.post(
        "/defects",
        json={"title": "Bug", "severity": "Low", "status": "Open"},
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

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && venv/Scripts/python.exe -m pytest tests/test_defects.py -v`
Expected: FAIL (404, no `/defects` route yet)

- [ ] **Step 3: Create the Defect schemas**

Create `backend/schemas/defects.py`:

```python
from datetime import datetime
from typing import Literal

from pydantic import BaseModel

from schemas.common import RequirementSummary, TestCaseSummary

DefectSeverity = Literal["Critical", "High", "Medium", "Low"]
DefectStatus = Literal["Open", "Fixed", "Closed", "Wont-Fix"]


class DefectCreate(BaseModel):
    title: str
    description: str | None = None
    severity: DefectSeverity
    status: DefectStatus = "Open"
    testcase_id: int | None = None
    requirement_id: int | None = None


class DefectUpdate(BaseModel):
    severity: DefectSeverity
    status: DefectStatus
    fixed_in_version: str | None = None


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
    created_at: datetime

    class Config:
        from_attributes = True


class DefectDetailResponse(DefectResponse):
    test_case: TestCaseSummary | None = None
    requirement: RequirementSummary | None = None


class DefectListResponse(BaseModel):
    items: list[DefectResponse]
    total: int
    page: int
    limit: int
```

- [ ] **Step 4: Create the Defects router**

Create `backend/routers/defects.py`:

```python
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from models.all_models import Defect, Requirement, TestCase
from models.base import get_db
from schemas.common import RequirementSummary, TestCaseSummary
from schemas.defects import (
    DefectCreate,
    DefectDetailResponse,
    DefectListResponse,
    DefectResponse,
    DefectUpdate,
)
from services.auth_service import get_current_user
from services.code_generator import next_code

router = APIRouter(
    prefix="/defects",
    tags=["defects"],
    dependencies=[Depends(get_current_user)],
)


@router.get("", response_model=DefectListResponse)
def list_defects(
    severity: str | None = None,
    status: str | None = None,
    requirement_id: int | None = None,
    testcase_id: int | None = None,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    query = db.query(Defect)
    if severity is not None:
        query = query.filter(Defect.severity == severity)
    if status is not None:
        query = query.filter(Defect.status == status)
    if requirement_id is not None:
        query = query.filter(Defect.requirement_id == requirement_id)
    if testcase_id is not None:
        query = query.filter(Defect.testcase_id == testcase_id)

    total = query.count()
    items = (
        query.order_by(Defect.id)
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )
    return DefectListResponse(items=items, total=total, page=page, limit=limit)


@router.post("", response_model=DefectResponse, status_code=status.HTTP_201_CREATED)
def create_defect(payload: DefectCreate, db: Session = Depends(get_db)):
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
    )
    db.add(defect)
    db.commit()
    db.refresh(defect)
    return defect


@router.get("/{id}", response_model=DefectDetailResponse)
def get_defect(id: int, db: Session = Depends(get_db)):
    defect = db.get(Defect, id)
    if defect is None:
        raise HTTPException(status_code=404, detail="Defect not found")

    test_case = db.get(TestCase, defect.testcase_id) if defect.testcase_id else None
    requirement = db.get(Requirement, defect.requirement_id) if defect.requirement_id else None

    response = DefectDetailResponse.model_validate(defect)
    response.test_case = TestCaseSummary.model_validate(test_case) if test_case else None
    response.requirement = (
        RequirementSummary.model_validate(requirement) if requirement else None
    )
    return response


@router.put("/{id}", response_model=DefectResponse)
def update_defect(id: int, payload: DefectUpdate, db: Session = Depends(get_db)):
    defect = db.get(Defect, id)
    if defect is None:
        raise HTTPException(status_code=404, detail="Defect not found")

    defect.severity = payload.severity
    defect.status = payload.status
    defect.fixed_in_version = payload.fixed_in_version
    db.commit()
    db.refresh(defect)
    return defect
```

- [ ] **Step 5: Register the router in main.py**

Modify `backend/main.py`:

```python
from fastapi import FastAPI

from routers.auth import router as auth_router
from routers.requirements import router as requirements_router
from routers.test_runs import router as test_runs_router
from routers.test_cases import router as test_cases_router
from routers.defects import router as defects_router

app = FastAPI(title="QC Suite API")

app.include_router(auth_router)
app.include_router(requirements_router)
app.include_router(test_runs_router)
app.include_router(test_cases_router)
app.include_router(defects_router)


@app.get("/health")
def health():
    return {"status": "ok"}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd backend && venv/Scripts/python.exe -m pytest tests/test_defects.py -v`
Expected: PASS (8 passed)

- [ ] **Step 7: Run full suite**

Run: `cd backend && venv/Scripts/python.exe -m pytest -v`
Expected: all pass

- [ ] **Step 8: Manual DoD verification pass**

Start the server and manually verify with curl/Postman per the DoD (matches the `S0-08` precedent — no automated suite covers HTTP status wording exhaustively):

Run: `cd backend && venv/Scripts/python.exe -m uvicorn main:app --reload --port 8000`

Manually confirm:
- `POST /auth/register` + `POST /auth/login` to obtain a real JWT
- Full Requirement create → update ×2 → `/history` shows 3 versions
- TestCase soft-delete leaves the row queryable with `status=Deprecated`
- Defect accepts either FK alone
- `POST /test-cases/{id}/execute` called twice with the same `run_id` results in exactly one `test_run_results` row

- [ ] **Step 9: Commit**

```bash
git add backend/schemas/defects.py backend/routers/defects.py backend/main.py backend/tests/test_defects.py
git commit -m "feat: add Defect CRUD API"
```
