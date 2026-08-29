from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, model_validator

from schemas.common import RequirementSummary

ReleaseStatus = Literal["New", "InProgress", "Completed"]
ExecutionResult = Literal["Pass", "Fail"]
CurrentResult = Literal["NotRun", "Pass", "Fail"]


class ReleaseCreate(BaseModel):
    project_id: int
    version_name: str
    note: str | None = None
    target_date: date | None = None
    owner_user_id: int | None = None


class ReleaseResponse(BaseModel):
    id: int
    project_id: int
    version_name: str
    note: str | None
    status: ReleaseStatus
    target_date: date | None
    owner_user_id: int | None
    owner_name: str | None
    created_at: datetime
    total_test_cases: int
    pass_count: int
    fail_count: int
    not_run_count: int


class ReleaseStatusUpdate(BaseModel):
    status: ReleaseStatus


class AddTestCasesRequest(BaseModel):
    testcase_ids: list[int] | None = None
    requirement_ids: list[int] | None = None

    @model_validator(mode="after")
    def _at_least_one(self):
        if not self.testcase_ids and not self.requirement_ids:
            raise ValueError("Provide testcase_ids and/or requirement_ids")
        return self


class ReleaseTestCaseTestCase(BaseModel):
    id: int
    code: str
    title: str
    priority: str | None
    status: str
    requirement: RequirementSummary | None = None


class ReleaseTestCaseItem(BaseModel):
    id: int
    testcase: ReleaseTestCaseTestCase
    current_result: CurrentResult
    added_by_name: str | None
    added_at: datetime
    executed_by_name: str | None = None


class EvidenceImageItem(BaseModel):
    id: int
    url: str


class ExecutionHistoryItem(BaseModel):
    id: int
    result: ExecutionResult
    note: str | None
    executed_by_name: str | None
    executed_at: datetime
    images: list[EvidenceImageItem]


class BurndownPoint(BaseModel):
    date: date
    remaining: int
    expected: float | None
