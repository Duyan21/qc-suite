const TOKEN_KEY = 'qms_token'

// Mocked until the FastAPI /auth endpoints land — swap these for real fetch
// calls once the backend stabilizes (see CLAUDE.md working conventions).
const DEMO_USER = {
  name: 'Huyền Nguyễn',
  email: 'admin@homelending.com',
  password: 'password123',
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function login(email: string, password: string): Promise<void> {
  await delay(500)
  if (email !== DEMO_USER.email || password !== DEMO_USER.password) {
    throw new Error('Email hoặc mật khẩu không đúng')
  }
  localStorage.setItem(TOKEN_KEY, `mock-jwt.${btoa(email)}.${Date.now()}`)
}

export async function register(name: string, email: string, password: string): Promise<void> {
  await delay(500)
  if (!name || !email || !password) {
    throw new Error('Vui lòng điền đầy đủ thông tin')
  }
  if (email === DEMO_USER.email) {
    throw new Error('Email đã được sử dụng')
  }
}

export async function requestPasswordReset(email: string): Promise<void> {
  await delay(500)
  if (!email) {
    throw new Error('Vui lòng nhập email')
  }
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}
