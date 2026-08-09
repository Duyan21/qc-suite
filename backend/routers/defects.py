from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from models.all_models import Defect, Project, Requirement, TestCase
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
    status_filter: str | None = Query(None, alias="status"),
    requirement_id: int | None = None,
    testcase_id: int | None = None,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    query = db.query(Defect)
    if severity is not None:
        query = query.filter(Defect.severity == severity)
    if status_filter is not None:
        query = query.filter(Defect.status == status_filter)
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
