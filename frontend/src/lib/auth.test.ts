import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearToken, getToken, login, register, requestPasswordReset, resendVerification, resetPassword, verifyEmail } from './auth'

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
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ access_token: 'jwt-123', token_type: 'bearer' }))
    await login('an@example.com', 'password123')
    expect(getToken()).toBe('jwt-123')
  })

  it('throws a recognizable error when the account is not verified', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ detail: 'Email not verified' }, 403))
    await expect(login('an@example.com', 'password123')).rejects.toThrow('EMAIL_NOT_VERIFIED')
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
})

describe('verifyEmail', () => {
  it('resolves on a valid token', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ message: 'Email verified' }))
    await expect(verifyEmail('good-token')).resolves.toBeUndefined()
  })

  it('throws on an invalid token', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ detail: 'Invalid or expired verification link' }, 400))
    await expect(verifyEmail('bad-token')).rejects.toThrow()
  })
})

describe('resendVerification', () => {
  it('resolves without throwing', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ message: 'sent' }))
    await expect(resendVerification('an@example.com')).resolves.toBeUndefined()
  })
})

describe('requestPasswordReset', () => {
  it('resolves without throwing on success', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ message: 'sent' }))
    await expect(requestPasswordReset('an@example.com')).resolves.toBeUndefined()
  })
})

describe('resetPassword', () => {
  it('resolves on a valid token', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ message: 'Password reset successful' }))
    await expect(resetPassword('good-token', 'newpassword123')).resolves.toBeUndefined()
  })

  it('throws on an invalid/expired token', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ detail: 'Invalid or expired token' }, 400))
    await expect(resetPassword('bad-token', 'newpassword123')).rejects.toThrow()
  })
})
