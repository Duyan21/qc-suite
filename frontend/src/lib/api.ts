const TOKEN_KEY = 'qms_token'
const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  headers?: Record<string, string>
}

async function extractErrorMessage(response: Response): Promise<string> {
  let body: unknown
  try {
    body = await response.json()
  } catch {
    return `Request failed with status ${response.status}`
  }

  const detail = (body as { detail?: unknown } | null)?.detail
  if (typeof detail === 'string') {
    return detail
  }
  if (Array.isArray(detail)) {
    return detail
      .map((item) =>
        typeof item === 'object' && item !== null && 'msg' in item
          ? String((item as { msg: unknown }).msg)
          : String(item),
      )
      .join('; ')
  }
  return `Request failed with status ${response.status}`
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...options.headers,
  }
  const sentAuth = 'Authorization' in headers

  const response = await fetch(`${BASE_URL}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  })

  if (!response.ok) {
    const message = await extractErrorMessage(response)
    if (response.status === 401 && sentAuth) {
      clearToken()
      window.location.href = '/login'
    }
    throw new Error(message)
  }

  if (response.status === 204) {
    return undefined as T
  }
  return (await response.json()) as T
}

export async function authFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const token = getToken()
  return apiFetch<T>(path, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${token ?? ''}`,
    },
  })
}

export async function authFetchMultipart<T>(path: string, formData: FormData): Promise<T> {
  const token = getToken()
  const response = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token ?? ''}` },
    body: formData,
  })

  if (!response.ok) {
    const message = await extractErrorMessage(response)
    if (response.status === 401) {
      clearToken()
      window.location.href = '/login'
    }
    throw new Error(message)
  }
  return (await response.json()) as T
}
