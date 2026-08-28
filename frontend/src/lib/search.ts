import { authFetch } from './api'
import type { RequirementSummary } from './requirements'

export type SearchResultItem = {
  id: number
  code: string
  title: string
  priority: string | null
  status: string
  requirement_id: number | null
  requirement: RequirementSummary | null
  last_result: string | null
  score: number
}

export type SearchResponse = {
  items: SearchResultItem[]
}

export type SearchParams = {
  project_id: number
  query: string
  limit?: number
  threshold?: number
}

export const MATCH_SCORE_BADGE_CLASS = {
  high: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400',
  medium: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
  low: 'bg-muted text-muted-foreground',
}

export function matchScoreTier(score: number): keyof typeof MATCH_SCORE_BADGE_CLASS {
  if (score >= 0.85) return 'high'
  if (score >= 0.7) return 'medium'
  return 'low'
}

export async function searchTestCases(params: SearchParams): Promise<SearchResponse> {
  return authFetch<SearchResponse>('/search', {
    method: 'POST',
    body: {
      project_id: params.project_id,
      query: params.query,
      ...(params.limit !== undefined ? { limit: params.limit } : {}),
      ...(params.threshold !== undefined ? { threshold: params.threshold } : {}),
    },
  })
}
