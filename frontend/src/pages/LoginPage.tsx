import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { AuthLayout } from '@/layouts/AuthLayout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { login } from '@/lib/auth'

export function LoginPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await login(email, password)
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Đăng nhập thất bại')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout>
      <h1 className="text-lg font-semibold">Đăng nhập</h1>

      <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
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
          />
        </div>

        <div className="flex items-center justify-between">
          <Label className="font-normal">
            <Checkbox checked={remember} onCheckedChange={(v) => setRemember(v === true)} />
            Ghi nhớ đăng nhập
          </Label>
          <Link to="/forgot-password" className="text-sm text-indigo-600 hover:underline">
            Quên mật khẩu?
          </Link>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button
          type="submit"
          disabled={loading}
          size="lg"
          className="w-full bg-indigo-600 text-white hover:bg-indigo-700"
        >
          {loading ? 'Đang đăng nhập…' : 'Đăng nhập'}
          <ArrowRight className="size-4" />
        </Button>
      </form>

      <p className="mt-4 text-center text-sm text-muted-foreground">
        Chưa có tài khoản?{' '}
        <Link to="/register" className="text-indigo-600 hover:underline">
          Đăng ký
        </Link>
      </p>
    </AuthLayout>
  )
}
