import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AppLayout } from '@/layouts/AppLayout'
import { LoginPage } from '@/pages/LoginPage'
import { RequirementsPage } from '@/pages/RequirementsPage'
import { TestCasesPage } from '@/pages/TestCasesPage'
import { DefectsPage } from '@/pages/DefectsPage'
import { TraceabilityPage } from '@/pages/TraceabilityPage'
import { SearchPage } from '@/pages/SearchPage'
import { AgentPage } from '@/pages/AgentPage'
import { ReportPage } from '@/pages/ReportPage'
import { AdminPage } from '@/pages/AdminPage'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<AppLayout />}>
          <Route index element={<Navigate to="/requirements" replace />} />
          <Route path="/requirements" element={<RequirementsPage />} />
          <Route path="/testcases" element={<TestCasesPage />} />
          <Route path="/defects" element={<DefectsPage />} />
          <Route path="/traceability" element={<TraceabilityPage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/agent" element={<AgentPage />} />
          <Route path="/report" element={<ReportPage />} />
          <Route path="/admin" element={<AdminPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
