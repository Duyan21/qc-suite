import { apiFetch, authFetch, setToken } from './api'

export { getToken, clearToken } from './api'

const ERROR_MESSAGES: Record<string, string> = {
  'Invalid email or password': 'Email hoặc mật khẩu không đúng',
  'Email already registered': 'Email đã được sử dụng',
}

function toVietnameseError(err: unknown): Error {
  const message = err instanceof Error ? err.message : ''
  return new Error(ERROR_MESSAGES[message] ?? 'Đã có lỗi xảy ra, vui lòng thử lại.')
}

type LoginResponse = {
  access_token: string
  token_type: string
}

export async function login(email: string, password: string): Promise<void> {
  try {
    const response = await apiFetch<LoginResponse>('/auth/login', {
      method: 'POST',
      body: { email, password },
    })
    setToken(response.access_token)
  } catch (err) {
    throw toVietnameseError(err)
  }
}

export async function register(name: string, email: string, password: string): Promise<void> {
  try {
    await apiFetch('/auth/register', {
      method: 'POST',
      body: { email, password, full_name: name },
    })
  } catch (err) {
    throw toVietnameseError(err)
  }
}

export async function requestPasswordReset(email: string): Promise<void> {
  try {
    await apiFetch('/auth/forgot-password', {
      method: 'POST',
      body: { email },
    })
  } catch (err) {
    if (err instanceof Error && err.message === 'User not found') {
      return
    }
    throw toVietnameseError(err)
  }
}

export type CurrentUser = {
  id: number
  email: string
  full_name: string | null
  is_active: boolean
  is_superadmin: boolean
  can_create_projects: boolean
  status: string
}

export async function getCurrentUser(): Promise<CurrentUser> {
  return authFetch<CurrentUser>('/auth/me')
}
