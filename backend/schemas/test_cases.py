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


class TestCaseListItem(TestCaseResponse):
    requirement: RequirementSummary | None = None


class TestCaseListResponse(BaseModel):
    items: list[TestCaseListItem]
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
