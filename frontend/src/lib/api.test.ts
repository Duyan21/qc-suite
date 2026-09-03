import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiFetch, authFetch, clearToken, getToken, setToken } from './api'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('token storage', () => {
  it('round-trips through localStorage', () => {
    expect(getToken()).toBeNull()
    setToken('abc123')
    expect(getToken()).toBe('abc123')
    clearToken()
    expect(getToken()).toBeNull()
  })
})

// jsdom's real Location.href setter attempts navigation (logging "Not
// implemented") and its accessor isn't reconfigurable via vi.spyOn, so swap
// the whole `location` in for a plain, resettable object instead. Scoped to
// this file's isolated jsdom window — nothing to restore afterward.
Object.defineProperty(window, 'location', {
  value: { href: '' },
  writable: true,
  configurable: true,
})

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
  window.location.href = ''
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('apiFetch', () => {
  it('returns the parsed JSON body on success', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ id: 1, name: 'Home Lending' }))

    const result = await apiFetch<{ id: number; name: string }>('/projects/1')

    expect(result).toEqual({ id: 1, name: 'Home Lending' })
  })

  it('returns undefined for a 204 response without parsing a body', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 204 }))

    const result = await apiFetch<undefined>('/defects/1')

    expect(result).toBeUndefined()
  })

  it('throws the plain-string detail on a backend error', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ detail: 'Project not found' }, 404))

    await expect(apiFetch('/projects/999')).rejects.toThrow('Project not found')
  })

  it('joins pydantic array-of-msg details into one message', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(
        { detail: [{ msg: 'field required' }, { msg: 'must be positive' }] },
        422,
      ),
    )

    await expect(apiFetch('/requirements')).rejects.toThrow('field required; must be positive')
  })

  it('falls back to a status-code message when the error body is not JSON', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('not json', { status: 500 }))

    await expect(apiFetch('/anything')).rejects.toThrow('Request failed with status 500')
  })

  it('does not clear the token or redirect on a 401 without a prior Authorization header', async () => {
    setToken('should-survive')
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ detail: 'Invalid credentials' }, 401))

    await expect(apiFetch('/auth/login', { method: 'POST' })).rejects.toThrow('Invalid credentials')

    expect(getToken()).toBe('should-survive')
    expect(window.location.href).toBe('')
  })
})

describe('authFetch', () => {
  it('attaches the stored bearer token', async () => {
    setToken('my-jwt')
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ ok: true }))

    await authFetch('/requirements')

    const [, init] = vi.mocked(fetch).mock.calls[0]!
    expect((init!.headers as Record<string, string>).Authorization).toBe('Bearer my-jwt')
  })

  it('clears the token and redirects to /login on a 401', async () => {
    setToken('expired-jwt')
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ detail: 'Not authenticated' }, 401))

    await expect(authFetch('/requirements')).rejects.toThrow('Not authenticated')

    expect(getToken()).toBeNull()
    expect(window.location.href).toBe('/login')
  })
})
