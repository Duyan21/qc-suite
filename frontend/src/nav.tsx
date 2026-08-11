import type { ComponentType, ReactNode } from 'react'
import {
  LayoutGrid,
  ListChecks,
  FlaskConical,
  Bug,
  Waypoints,
  Search,
  Sparkles,
  PlayCircle,
  FileBarChart,
  Settings,
  type LucideProps,
} from 'lucide-react'
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
  icon: ComponentType<LucideProps>
  element: ReactNode
}

export interface NavSection {
  label: string
  items: NavItem[]
}

export const NAV_SECTIONS: NavSection[] = [
  {
    label: 'Overview',
    items: [{ path: '/dashboard', label: 'Dashboard', icon: LayoutGrid, element: <DashboardPage /> }],
  },
  {
    label: 'Quản lý',
    items: [
      { path: '/requirements', label: 'Requirements', icon: ListChecks, element: <RequirementsPage /> },
      { path: '/testcases', label: 'Test Cases', icon: FlaskConical, element: <TestCasesPage /> },
      { path: '/defects', label: 'Defects', icon: Bug, element: <DefectsPage /> },
      { path: '/traceability', label: 'Traceability', icon: Waypoints, element: <TraceabilityPage /> },
    ],
  },
  {
    label: 'AI Tools',
    items: [
      { path: '/search', label: 'Semantic Search', icon: Search, element: <SemanticSearchPage /> },
      { path: '/agent', label: 'Impact Agent', icon: Sparkles, element: <ImpactAgentPage /> },
    ],
  },
  {
    label: 'Release',
    items: [
      { path: '/testruns', label: 'Test Runs', icon: PlayCircle, element: <TestRunPage /> },
      { path: '/report', label: 'Release Report', icon: FileBarChart, element: <ReleaseReportPage /> },
    ],
  },
  {
    label: 'System',
    items: [{ path: '/admin', label: 'Admin', icon: Settings, element: <AdminPage /> }],
  },
]
