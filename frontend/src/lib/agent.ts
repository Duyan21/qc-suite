import { authFetch } from './api'

export type AgentDiff = { before: string; after: string }

export type AgentTcUpdate = {
  testcase_id: number
  code: string
  title: string
  reason: string
  diff: AgentDiff
  source: string[]
}

export type AgentGapSource = { type: string; ref: string; match_percent: number }

export type AgentTcGap = {
  suggested_title: string
  suggested_scope: string
  source: AgentGapSource[]
}

export type AgentQuestion = {
  question: string
  why_it_matters: string
  source: string[]
}

export type AgentSummary = {
  linked_tc_count: number
  related_tc_count: number
  defect_count: number
}

export type AgentAnalysisResult = {
  req_id: string
  version: number
  summary: AgentSummary
  tc_updates: AgentTcUpdate[]
  tc_gaps: AgentTcGap[]
  questions: AgentQuestion[]
}

export async function analyseRequirementImpact(reqId: string): Promise<AgentAnalysisResult> {
  return authFetch<AgentAnalysisResult>('/agent/analyse', {
    method: 'POST',
    body: { req_id: reqId },
  })
}

// Matches docs/agent_contract.example.json from the S3-0 plan. Lets the output UI
// (Task 2) be built and manually verified before POST /agent/analyse exists.
export const MOCK_ANALYSIS_RESULT: AgentAnalysisResult = {
  req_id: 'REQ-015',
  version: 3,
  summary: { linked_tc_count: 2, related_tc_count: 3, defect_count: 1 },
  tc_updates: [
    {
      testcase_id: 102,
      code: 'TC-102',
      title: 'Login with OTP',
      reason: "Requirement now requires OTP to expire after 60s, but this TC's expected result assumes no expiry.",
      diff: {
        before: 'OTP remains valid until manually resent.',
        after: 'OTP expires 60 seconds after issuance.',
      },
      source: ['req_current.description', 'tc_linked:TC-102'],
    },
  ],
  tc_gaps: [
    {
      suggested_title: 'OTP expiry after 60 seconds',
      suggested_scope: 'Verify login fails when OTP is submitted after the 60s expiry window.',
      source: [{ type: 'tc_related', ref: 'TC-088', match_percent: 78.5 }],
    },
  ],
  questions: [
    {
      question: 'Does the 60s OTP expiry apply to the password-reset flow too, or only login?',
      why_it_matters: 'If it also applies to password-reset, TC-140 and TC-141 need the same update.',
      source: ['req_current.description'],
    },
  ],
}
