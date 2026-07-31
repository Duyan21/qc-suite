from typing import Literal

from pydantic import BaseModel

TraceabilityStatus = Literal["covered", "failed", "partial"]


class TraceabilityTestCaseItem(BaseModel):
    id: int
    code: str
    title: str
    status: TraceabilityStatus


class TraceabilityRequirementItem(BaseModel):
    id: int
    req_id: str
    version: int
    title: str
    status: str
    is_uncovered: bool
    coverage_percent: float
    test_cases: list[TraceabilityTestCaseItem]


class TraceabilityResponse(BaseModel):
    items: list[TraceabilityRequirementItem]
