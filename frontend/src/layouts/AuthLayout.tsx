import type { ReactNode } from 'react'
import { Card } from '@/components/ui/card'

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-zinc-950 px-4 py-12">
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-indigo-600 text-xl font-bold text-white">
          Q
        </div>
        <div className="text-lg font-semibold text-white">QMS</div>
        <div className="text-sm text-zinc-400">Quality Management System</div>
      </div>
      <Card className="w-full max-w-sm p-6 shadow-xl">{children}</Card>
    </div>
  )
}
