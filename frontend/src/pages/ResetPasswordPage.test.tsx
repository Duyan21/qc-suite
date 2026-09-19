import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ToastProvider } from '@/lib/toast'
import { ResetPasswordPage } from './ResetPasswordPage'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ToastProvider>
        <Routes>
          <Route path="/reset-password" element={<ResetPasswordPage />} />
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

describe('ResetPasswordPage', () => {
  it('redirects to /login immediately when there is no token', async () => {
    renderAt('/reset-password')
    expect(await screen.findByText('Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByText('Login screen')).toBeInTheDocument()
    })
  })

  it('shows an inline error and does not redirect on mismatched passwords', async () => {
    const user = userEvent.setup()
    renderAt('/reset-password?token=good-token')

    await user.type(screen.getByLabelText('Mật khẩu mới'), 'password123')
    await user.type(screen.getByLabelText('Xác nhận mật khẩu mới'), 'different123')
    await user.click(screen.getByRole('button', { name: /Đặt lại mật khẩu/ }))

    expect(await screen.findByText('Mật khẩu xác nhận không khớp')).toBeInTheDocument()
    expect(screen.queryByText('Login screen')).not.toBeInTheDocument()
  })

  it('redirects to /login on success', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ message: 'Password reset successful' }))
    const user = userEvent.setup()
    renderAt('/reset-password?token=good-token')

    await user.type(screen.getByLabelText('Mật khẩu mới'), 'password123')
    await user.type(screen.getByLabelText('Xác nhận mật khẩu mới'), 'password123')
    await user.click(screen.getByRole('button', { name: /Đặt lại mật khẩu/ }))

    await waitFor(() => {
      expect(screen.getByText('Login screen')).toBeInTheDocument()
    })
  })

  it('redirects to /login on an invalid/expired token', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ detail: 'Invalid or expired token' }, 400))
    const user = userEvent.setup()
    renderAt('/reset-password?token=bad-token')

    await user.type(screen.getByLabelText('Mật khẩu mới'), 'password123')
    await user.type(screen.getByLabelText('Xác nhận mật khẩu mới'), 'password123')
    await user.click(screen.getByRole('button', { name: /Đặt lại mật khẩu/ }))

    expect(await screen.findByText('Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByText('Login screen')).toBeInTheDocument()
    })
  })
})
