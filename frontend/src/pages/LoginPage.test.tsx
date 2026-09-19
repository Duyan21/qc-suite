import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ToastProvider } from '@/lib/toast'
import { LoginPage } from './LoginPage'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <ToastProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/dashboard" element={<div>Dashboard</div>} />
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

describe('LoginPage', () => {
  it('shows a resend-verification button when the account is unverified', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ detail: 'Email not verified' }, 403))
    const user = userEvent.setup()
    renderLogin()

    await user.type(screen.getByLabelText('Email'), 'an@example.com')
    await user.type(screen.getByLabelText('Mật khẩu'), 'password123')
    await user.click(screen.getByRole('button', { name: /Đăng nhập/ }))

    expect(await screen.findByRole('button', { name: /Gửi lại email xác thực/ })).toBeInTheDocument()
  })

  it('calls resend-verification and shows a success toast when the button is clicked', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ detail: 'Email not verified' }, 403))
      .mockResolvedValueOnce(jsonResponse({ message: 'sent' }))
    const user = userEvent.setup()
    renderLogin()

    await user.type(screen.getByLabelText('Email'), 'an@example.com')
    await user.type(screen.getByLabelText('Mật khẩu'), 'password123')
    await user.click(screen.getByRole('button', { name: /Đăng nhập/ }))

    const resendButton = await screen.findByRole('button', { name: /Gửi lại email xác thực/ })
    await user.click(resendButton)

    await waitFor(() => {
      expect(screen.getByText('Đã gửi lại email xác thực')).toBeInTheDocument()
    })
  })

  it('shows a plain error for a normal invalid-credentials failure', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ detail: 'Invalid email or password' }, 401))
    const user = userEvent.setup()
    renderLogin()

    await user.type(screen.getByLabelText('Email'), 'an@example.com')
    await user.type(screen.getByLabelText('Mật khẩu'), 'wrong')
    await user.click(screen.getByRole('button', { name: /Đăng nhập/ }))

    expect(await screen.findByText('Email hoặc mật khẩu không đúng')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Gửi lại email xác thực/ })).not.toBeInTheDocument()
  })
})
