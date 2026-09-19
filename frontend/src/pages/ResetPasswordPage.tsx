import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { AuthLayout } from '@/layouts/AuthLayout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/lib/toast'
import { resetPassword } from '@/lib/auth'

export function ResetPasswordPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const toast = useToast()
  const token = searchParams.get('token')

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const ranRef = useRef(false)

  useEffect(() => {
    if (ranRef.current) return
    ranRef.current = true

    if (!token) {
      toast.error('Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn')
      navigate('/login', { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (password !== confirmPassword) {
      setError('Mật khẩu xác nhận không khớp')
      return
    }
    if (!token) return
    setLoading(true)
    try {
      await resetPassword(token, password)
      toast.success('Đặt lại mật khẩu thành công')
      navigate('/login', { replace: true })
    } catch {
      toast.error('Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn')
      navigate('/login', { replace: true })
    } finally {
      setLoading(false)
    }
  }

  if (!token) {
    return null
  }

  return (
    <AuthLayout>
      <h1 className="text-lg font-semibold">Đặt lại mật khẩu</h1>
      <p className="text-sm text-muted-foreground">Nhập mật khẩu mới cho tài khoản của bạn.</p>

      <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
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

      <Link
        to="/login"
        className="mt-4 flex items-center justify-center gap-1 text-sm text-indigo-600 hover:underline"
      >
        Quay lại đăng nhập
      </Link>
    </AuthLayout>
  )
}
