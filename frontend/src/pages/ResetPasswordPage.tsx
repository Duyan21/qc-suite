import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { AuthLayout } from '@/layouts/AuthLayout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { resetPassword } from '@/lib/auth'

export function ResetPasswordPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [token, setToken] = useState(searchParams.get('token') ?? '')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (password !== confirmPassword) {
      setError('Mật khẩu xác nhận không khớp')
      return
    }
    setLoading(true)
    try {
      await resetPassword(token, password)
      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Đặt lại mật khẩu thất bại')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout>
      <h1 className="text-lg font-semibold">Đặt lại mật khẩu</h1>

      {done ? (
        <>
          <p className="mt-4 text-sm text-muted-foreground">
            Mật khẩu của bạn đã được đặt lại thành công.
          </p>
          <Button
            size="lg"
            className="mt-4 w-full bg-indigo-600 text-white hover:bg-indigo-700"
            onClick={() => navigate('/login', { replace: true })}
          >
            Đăng nhập
          </Button>
        </>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Nhập reset token đã nhận được và mật khẩu mới.
          </p>

          <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="token">Reset token</Label>
              <Input
                id="token"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Mật khẩu mới</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="confirm-password">Xác nhận mật khẩu mới</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button
              type="submit"
              disabled={loading}
              size="lg"
              className="w-full bg-indigo-600 text-white hover:bg-indigo-700"
            >
              {loading ? 'Đang đặt lại…' : 'Đặt lại mật khẩu'}
            </Button>
          </form>
        </>
      )}

      <Link
        to="/login"
        className="mt-4 flex items-center justify-center gap-1 text-sm text-indigo-600 hover:underline"
      >
        Quay lại đăng nhập
      </Link>
    </AuthLayout>
  )
}
