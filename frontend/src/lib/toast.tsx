import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { XIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

type ToastKind = 'success' | 'error'

type ToastOptions = {
  href?: string
  linkLabel?: string
}

type ToastItem = {
  id: number
  kind: ToastKind
  message: string
  href?: string
  linkLabel?: string
}

type ToastContextValue = {
  success: (message: string, options?: ToastOptions) => void
  error: (message: string, options?: ToastOptions) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const TOAST_DURATION_MS = 8000

const KIND_CLASS: Record<ToastKind, string> = {
  success: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400',
  error: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400',
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const idRef = useRef(0)
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
    const timer = timersRef.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timersRef.current.delete(id)
    }
  }, [])

  const push = useCallback(
    (kind: ToastKind, message: string, options?: ToastOptions) => {
      const id = ++idRef.current
      setToasts((prev) => [
        ...prev,
        { id, kind, message, href: options?.href, linkLabel: options?.linkLabel },
      ])
      const timer = setTimeout(() => dismiss(id), TOAST_DURATION_MS)
      timersRef.current.set(id, timer)
    },
    [dismiss],
  )

  const success = useCallback(
    (message: string, options?: ToastOptions) => push('success', message, options),
    [push],
  )
  const error = useCallback(
    (message: string, options?: ToastOptions) => push('error', message, options),
    [push],
  )

  return (
    <ToastContext.Provider value={{ success, error }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              'flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm shadow-md ring-1 ring-foreground/10',
              KIND_CLASS[t.kind],
            )}
          >
            <div className="flex-1">
              <p>{t.message}</p>
              {t.href && (
                <Link
                  to={t.href}
                  className="mt-1 inline-block underline underline-offset-4"
                  onClick={() => dismiss(t.id)}
                >
                  {t.linkLabel ?? 'Xem chi tiết →'}
                </Link>
              )}
            </div>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Đóng"
              className="shrink-0 cursor-pointer opacity-70 hover:opacity-100"
            >
              <XIcon className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (ctx === null) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return ctx
}
