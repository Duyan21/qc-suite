import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { ForgotPasswordPage } from './ForgotPasswordPage'

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

function renderPage() {
  render(
    <MemoryRouter>
      <ForgotPasswordPage />
    </MemoryRouter>,
  )
}

describe('ForgotPasswordPage', () => {
  it('shows the reset token and a link to reset the password on success', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ reset_token: 'demo-token-123', expires_in: '15 minutes' }),
    )
    renderPage()

    await userEvent.type(screen.getByLabelText('Email'), 'an@example.com')
    await userEvent.click(screen.getByRole('button', { name: 'Gửi link reset' }))

    expect(await screen.findByText('demo-token-123')).toBeInTheDocument()
    const link = screen.getByRole('link', { name: 'Đặt lại mật khẩu ngay' })
    expect(link).toHaveAttribute('href', '/reset-password?token=demo-token-123')
  })

  it('shows the same success screen even for an email the backend does not recognize', async () => {
    // /auth/forgot-password always returns 200 with the same shape, by
    // design, so the UI has no way to distinguish this case — nor should it.
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ reset_token: 'dummy-token-456', expires_in: '15 minutes' }),
    )
    renderPage()

    await userEvent.type(screen.getByLabelText('Email'), 'unknown@example.com')
    await userEvent.click(screen.getByRole('button', { name: 'Gửi link reset' }))

    expect(await screen.findByText('dummy-token-456')).toBeInTheDocument()
  })

  it('shows an error message when the request fails', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('boom', { status: 500 }))
    renderPage()

    await userEvent.type(screen.getByLabelText('Email'), 'an@example.com')
    await userEvent.click(screen.getByRole('button', { name: 'Gửi link reset' }))

    expect(await screen.findByText('Đã có lỗi xảy ra, vui lòng thử lại.')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Đặt lại mật khẩu ngay' })).not.toBeInTheDocument()
  })
})
