import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AppLayout } from '@/layouts/AppLayout'
import { RequireAuth } from '@/layouts/RequireAuth'
import { LoginPage } from '@/pages/LoginPage'
import { RegisterPage } from '@/pages/RegisterPage'
import { ForgotPasswordPage } from '@/pages/ForgotPasswordPage'
import { NAV_SECTIONS } from '@/nav'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route
          element={
            <RequireAuth>
              <AppLayout />
            </RequireAuth>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          {NAV_SECTIONS.flatMap((section) =>
            section.items.map((item) => (
              <Route key={item.path} path={item.path} element={item.element} />
            )),
          )}
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
