export type GoNoGoStatus = 'Go' | 'Caution' | 'No-Go'

export interface GoNoGoInput {
  passRate: number // 0-100
  notRunCount: number
  openCriticalCount: number
  openHighCount: number
}

// Thresholds per the rule described in the thesis (mục 2.1.4): the decision
// isn't based on pass rate alone — any open Critical defect, or any NotRun
// test case still in scope, blocks a clean "Go" even at a high pass rate.
const PASS_RATE_GO_THRESHOLD = 95
const PASS_RATE_NOGO_THRESHOLD = 80

export function computeGoNoGo({
  passRate,
  notRunCount,
  openCriticalCount,
  openHighCount,
}: GoNoGoInput): GoNoGoStatus {
  if (openCriticalCount > 0 || passRate < PASS_RATE_NOGO_THRESHOLD) return 'No-Go'
  if (openHighCount > 0 || notRunCount > 0 || passRate < PASS_RATE_GO_THRESHOLD) return 'Caution'
  return 'Go'
}
