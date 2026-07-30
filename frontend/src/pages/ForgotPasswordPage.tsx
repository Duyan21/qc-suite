import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { AuthLayout } from '@/layouts/AuthLayout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { requestPasswordReset } from '@/lib/auth'

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await requestPasswordReset(email)
      setSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gửi link reset thất bại')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout>
      <h1 className="text-lg font-semibold">Quên mật khẩu</h1>
      <p className="text-sm text-muted-foreground">Nhập email để nhận link reset mật khẩu</p>

      {sent ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Nếu email tồn tại trong hệ thống, bạn sẽ nhận được link đặt lại mật khẩu trong ít phút.
        </p>
      ) : (
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

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button
            type="submit"
            disabled={loading}
            size="lg"
            className="w-full bg-indigo-600 text-white hover:bg-indigo-700"
          >
            {loading ? 'Đang gửi…' : 'Gửi link reset'}
          </Button>
        </form>
      )}

      <Link
        to="/login"
        className="mt-4 flex items-center justify-center gap-1 text-sm text-indigo-600 hover:underline"
      >
        <ArrowLeft className="size-4" />
        Quay lại đăng nhập
      </Link>
    </AuthLayout>
  )
}
