import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { RegisterPage } from './RegisterPage'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('RegisterPage', () => {
  it('shows a check-your-email confirmation instead of redirecting after success', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ id: 1, email: 'an@example.com' }, 201))
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>,
    )

    await user.type(screen.getByLabelText('Họ và tên'), 'An Nguyen')
    await user.type(screen.getByLabelText('Email'), 'an@example.com')
    await user.type(screen.getByLabelText('Mật khẩu'), 'password123')
    await user.type(screen.getByLabelText('Xác nhận mật khẩu'), 'password123')
    await user.click(screen.getByRole('button', { name: /Tạo tài khoản/ }))

    await waitFor(() => {
      expect(screen.getByText(/kiểm tra email/i)).toBeInTheDocument()
    })
  })
})
