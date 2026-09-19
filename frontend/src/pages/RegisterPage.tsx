import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { AuthLayout } from '@/layouts/AuthLayout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { register } from '@/lib/auth'

export function RegisterPage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
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
      await register(name, email, password)
      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tạo tài khoản thất bại')
    } finally {
      setLoading(false)
    }
  }

  if (done) {
    return (
      <AuthLayout>
        <h1 className="text-lg font-semibold">Tạo tài khoản thành công</h1>
        <p className="mt-4 text-sm text-muted-foreground">
          Vui lòng kiểm tra email để xác thực tài khoản trước khi đăng nhập. Link xác thực có
          hiệu lực trong 24 giờ.
        </p>
        <Button asChild size="lg" className="mt-4 w-full bg-indigo-600 text-white hover:bg-indigo-700">
          <Link to="/login">Quay lại đăng nhập</Link>
        </Button>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout>
      <h1 className="text-lg font-semibold">Tạo tài khoản</h1>
      <p className="text-sm text-muted-foreground">Vai trò mặc định: QC Engineer</p>

      <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">Họ và tên</Label>
          <Input
            id="name"
            placeholder="Nguyễn Văn A"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            placeholder="ban@homelending.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">Mật khẩu</Label>
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
          <Label htmlFor="confirm-password">Xác nhận mật khẩu</Label>
          <Input
            id="confirm-password"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button
          type="submit"
          disabled={loading}
          size="lg"
          className="w-full bg-indigo-600 text-white hover:bg-indigo-700"
        >
          {loading ? 'Đang tạo tài khoản…' : 'Tạo tài khoản'}
        </Button>
      </form>

      <p className="mt-4 text-center text-sm text-muted-foreground">
        Đã có tài khoản?{' '}
        <Link to="/login" className="text-indigo-600 hover:underline">
          Đăng nhập
        </Link>
      </p>
    </AuthLayout>
  )
}
