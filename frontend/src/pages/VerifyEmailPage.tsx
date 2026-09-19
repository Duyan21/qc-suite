import { useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AuthLayout } from '@/layouts/AuthLayout'
import { useToast } from '@/lib/toast'
import { verifyEmail } from '@/lib/auth'

export function VerifyEmailPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const toast = useToast()
  const ranRef = useRef(false)

  useEffect(() => {
    if (ranRef.current) return
    ranRef.current = true

    const token = searchParams.get('token')
    if (!token) {
      toast.error('Liên kết xác thực không hợp lệ hoặc đã hết hạn')
      navigate('/login', { replace: true })
      return
    }

    verifyEmail(token)
      .then(() => {
        toast.success('Xác thực email thành công')
        navigate('/login', { replace: true })
      })
      .catch(() => {
        toast.error('Liên kết xác thực không hợp lệ hoặc đã hết hạn')
        navigate('/login', { replace: true })
      })
  }, [navigate, searchParams, toast])

  return (
    <AuthLayout>
      <h1 className="text-lg font-semibold">Đang xác thực email…</h1>
      <p className="mt-4 text-sm text-muted-foreground">Vui lòng đợi trong giây lát.</p>
    </AuthLayout>
  )
}
