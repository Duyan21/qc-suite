from pydantic import BaseModel


class AgentAnalyseRequest(BaseModel):
    req_id: str
    proposed_description: str | None = None


class AgentSummary(BaseModel):
    linked_tc_count: int
    related_tc_count: int
    defect_count: int


class AgentDiff(BaseModel):
    before: str
    after: str


class AgentTcUpdate(BaseModel):
    testcase_id: int
    code: str
    title: str
    reason: str
    diff: AgentDiff
    source: list[str]


class AgentGapSource(BaseModel):
    type: str
    ref: str
    match_percent: float


class AgentTcGap(BaseModel):
    suggested_title: str
    suggested_scope: str
    source: list[AgentGapSource]


class AgentQuestion(BaseModel):
    question: str
    why_it_matters: str
    source: list[str]


class AgentAnalysisResponse(BaseModel):
    req_id: str
    version: int
    summary: AgentSummary
    tc_updates: list[AgentTcUpdate]
    tc_gaps: list[AgentTcGap]
    questions: list[AgentQuestion]
