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
    project_id: int


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
    project_id: int
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
