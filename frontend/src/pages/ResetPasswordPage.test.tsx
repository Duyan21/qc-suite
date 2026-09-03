import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { ResetPasswordPage } from './ResetPasswordPage'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function renderPage(initialPath = '/reset-password') {
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <ResetPasswordPage />
    </MemoryRouter>,
  )
}

describe('ResetPasswordPage', () => {
  it('pre-fills the token from the ?token= query param', () => {
    renderPage('/reset-password?token=from-the-link')

    expect(screen.getByLabelText('Reset token')).toHaveValue('from-the-link')
  })

  it('rejects a confirm-password mismatch without calling the backend', async () => {
    renderPage()

    await userEvent.type(screen.getByLabelText('Reset token'), 'a-token')
    await userEvent.type(screen.getByLabelText('Mật khẩu mới'), 'NewPassw0rd!')
    await userEvent.type(screen.getByLabelText('Xác nhận mật khẩu mới'), 'DoesNotMatch1!')
    await userEvent.click(screen.getByRole('button', { name: 'Đặt lại mật khẩu' }))

    expect(screen.getByText('Mật khẩu xác nhận không khớp')).toBeInTheDocument()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('shows a success message and a way to log in after a valid reset', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ message: 'Password reset successful' }))
    renderPage('/reset-password?token=valid-token')

    await userEvent.type(screen.getByLabelText('Mật khẩu mới'), 'NewPassw0rd!')
    await userEvent.type(screen.getByLabelText('Xác nhận mật khẩu mới'), 'NewPassw0rd!')
    await userEvent.click(screen.getByRole('button', { name: 'Đặt lại mật khẩu' }))

    expect(await screen.findByText('Mật khẩu của bạn đã được đặt lại thành công.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Đăng nhập' })).toBeInTheDocument()

    const [, init] = vi.mocked(fetch).mock.calls[0]!
    expect(JSON.parse(init!.body as string)).toEqual({
      token: 'valid-token',
      new_password: 'NewPassw0rd!',
    })
  })

  it('shows a translated error for an invalid or expired token', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ detail: 'Invalid or expired token' }, 400))
    renderPage('/reset-password?token=expired-token')

    await userEvent.type(screen.getByLabelText('Mật khẩu mới'), 'NewPassw0rd!')
    await userEvent.type(screen.getByLabelText('Xác nhận mật khẩu mới'), 'NewPassw0rd!')
    await userEvent.click(screen.getByRole('button', { name: 'Đặt lại mật khẩu' }))

    expect(
      await screen.findByText('Link đặt lại mật khẩu không hợp lệ hoặc đã hết hạn'),
    ).toBeInTheDocument()
  })
})
