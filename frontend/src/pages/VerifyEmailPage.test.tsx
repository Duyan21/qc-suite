import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ToastProvider } from '@/lib/toast'
import { VerifyEmailPage } from './VerifyEmailPage'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ToastProvider>
        <Routes>
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/login" element={<div>Login screen</div>} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('VerifyEmailPage', () => {
  it('redirects to /login on a valid token', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ message: 'Email verified' }))
    renderAt('/verify-email?token=good-token')

    await waitFor(() => {
      expect(screen.getByText('Login screen')).toBeInTheDocument()
    })
  })

  it('redirects to /login on an invalid token', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ detail: 'Invalid or expired verification link' }, 400))
    renderAt('/verify-email?token=bad-token')

    expect(await screen.findByText('Liên kết xác thực không hợp lệ hoặc đã hết hạn')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByText('Login screen')).toBeInTheDocument()
    })
  })

  it('redirects to /login when there is no token at all', async () => {
    renderAt('/verify-email')

    expect(await screen.findByText('Liên kết xác thực không hợp lệ hoặc đã hết hạn')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByText('Login screen')).toBeInTheDocument()
    })
  })
})
