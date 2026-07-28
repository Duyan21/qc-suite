import type { ReactNode } from 'react'
import { DashboardPage } from '@/pages/DashboardPage'
import { RequirementsPage } from '@/pages/RequirementsPage'
import { TestCasesPage } from '@/pages/TestCasesPage'
import { DefectsPage } from '@/pages/DefectsPage'
import { TraceabilityPage } from '@/pages/TraceabilityPage'
import { SemanticSearchPage } from '@/pages/SemanticSearchPage'
import { ImpactAgentPage } from '@/pages/ImpactAgentPage'
import { TestRunPage } from '@/pages/TestRunPage'
import { ReleaseReportPage } from '@/pages/ReleaseReportPage'
import { AdminPage } from '@/pages/AdminPage'

export interface NavItem {
  path: string
  label: string
  element: ReactNode
}

export interface NavSection {
  label: string
  items: NavItem[]
}

export const NAV_SECTIONS: NavSection[] = [
  {
    label: 'Overview',
    items: [{ path: '/dashboard', label: 'Dashboard', element: <DashboardPage /> }],
  },
  {
    label: 'Quản lý',
    items: [
      { path: '/requirements', label: 'Requirements', element: <RequirementsPage /> },
      { path: '/testcases', label: 'Test Cases', element: <TestCasesPage /> },
      { path: '/defects', label: 'Defects', element: <DefectsPage /> },
      { path: '/traceability', label: 'Traceability', element: <TraceabilityPage /> },
    ],
  },
  {
    label: 'AI Tools',
    items: [
      { path: '/search', label: 'Semantic Search', element: <SemanticSearchPage /> },
      { path: '/agent', label: 'Impact Agent', element: <ImpactAgentPage /> },
    ],
  },
  {
    label: 'Release',
    items: [
      { path: '/testruns', label: 'Test Runs', element: <TestRunPage /> },
      { path: '/report', label: 'Release Report', element: <ReleaseReportPage /> },
    ],
  },
  {
    label: 'System',
    items: [{ path: '/admin', label: 'Admin', element: <AdminPage /> }],
  },
]
