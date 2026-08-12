from datetime import datetime
from typing import Literal

from pydantic import BaseModel

TraceabilityStatus = Literal["covered", "failed", "skipped", "not_run"]


class TraceabilityTestCaseItem(BaseModel):
    id: int
    code: str
    title: str
    status: TraceabilityStatus
    run_id: int | None = None
    executed_at: datetime | None = None


class TraceabilityRequirementItem(BaseModel):
    id: int
    req_id: str
    version: int
    title: str
    module: str | None
    status: str
    is_uncovered: bool
    coverage_percent: float
    test_cases: list[TraceabilityTestCaseItem]


class TraceabilityResponse(BaseModel):
    items: list[TraceabilityRequirementItem]
