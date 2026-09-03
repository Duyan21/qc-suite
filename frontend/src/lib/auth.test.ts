import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearToken,
  getCurrentUser,
  getToken,
  login,
  register,
  requestPasswordReset,
  resetPassword,
} from './auth'

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
  clearToken()
})

describe('login', () => {
  it('stores the access token on success', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ access_token: 'jwt-123', token_type: 'bearer' }),
    )

    await login('an@example.com', 'password123')

    expect(getToken()).toBe('jwt-123')
  })

  it('translates a known backend error to Vietnamese', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ detail: 'Invalid email or password' }, 401))

    await expect(login('an@example.com', 'wrong')).rejects.toThrow('Email hoặc mật khẩu không đúng')
  })
})

describe('register', () => {
  it('resolves without throwing on success', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ id: 1, email: 'an@example.com' }, 201))

    await expect(register('An', 'an@example.com', 'password123')).resolves.toBeUndefined()
  })

  it('translates the duplicate-email error to Vietnamese', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ detail: 'Email already registered' }, 400))

    await expect(register('An', 'an@example.com', 'password123')).rejects.toThrow(
      'Email đã được sử dụng',
    )
  })
})

describe('requestPasswordReset', () => {
  it('returns the reset token and expiry from the backend', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ reset_token: 'abc123', expires_in: '15 minutes' }),
    )

    const result = await requestPasswordReset('an@example.com')

    expect(result).toEqual({ reset_token: 'abc123', expires_in: '15 minutes' })
  })

  it('falls back to a generic Vietnamese message for an unmapped error', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('boom', { status: 500 }))

    await expect(requestPasswordReset('an@example.com')).rejects.toThrow(
      'Đã có lỗi xảy ra, vui lòng thử lại.',
    )
  })
})

describe('resetPassword', () => {
  it('resolves without throwing on success', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ message: 'Password reset successful' }))

    await expect(resetPassword('valid-token', 'NewPassw0rd!')).resolves.toBeUndefined()
  })

  it('translates an invalid/expired token error to Vietnamese', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ detail: 'Invalid or expired token' }, 400))

    await expect(resetPassword('bad-token', 'NewPassw0rd!')).rejects.toThrow(
      'Link đặt lại mật khẩu không hợp lệ hoặc đã hết hạn',
    )
  })
})

describe('getCurrentUser', () => {
  it('attaches the stored bearer token when fetching the current user', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ access_token: 'jwt-123', token_type: 'bearer' }),
    )
    await login('an@example.com', 'password123')

    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({
        id: 1,
        email: 'an@example.com',
        full_name: 'An',
        is_active: true,
        is_superadmin: false,
        can_create_projects: false,
        status: 'Active',
      }),
    )
    await getCurrentUser()

    const [, init] = vi.mocked(fetch).mock.calls.at(-1)!
    expect((init!.headers as Record<string, string>).Authorization).toBe('Bearer jwt-123')
  })
})
