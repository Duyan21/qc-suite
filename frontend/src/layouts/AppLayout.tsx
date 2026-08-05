import { useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { NAV_SECTIONS } from '@/nav'
import { clearToken, getCurrentUser, type CurrentUser } from '@/lib/auth'

function getInitials(user: CurrentUser | null): string {
  if (!user) return ''
  const name = user.full_name?.trim()
  if (name) {
    const parts = name.split(/\s+/)
    const first = parts[0]?.[0] ?? ''
    const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : ''
    return (first + last).toUpperCase()
  }
  return user.email[0]?.toUpperCase() ?? ''
}

export function AppLayout() {
  const navigate = useNavigate()
  const [user, setUser] = useState<CurrentUser | null>(null)

  useEffect(() => {
    getCurrentUser()
      .then(setUser)
      .catch(() => {
        // A 401 is already handled globally by api.ts (clears token, redirects to
        // /login). Anything else (network blip) just leaves the sidebar placeholder.
      })
  }, [])

  function handleLogout() {
    clearToken()
    navigate('/login', { replace: true })
  }

  return (
    <div className="flex min-h-svh">
      <aside className="dark flex w-56 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
        <div className="flex items-center gap-2.5 border-b border-sidebar-border px-4 py-3.5">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sm font-semibold text-sidebar-primary-foreground">
            Q
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold">QMS</div>
            <div className="text-xs text-sidebar-foreground/50">v2.3.1</div>
          </div>
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto px-2.5 py-4">
          {NAV_SECTIONS.map((section) => (
            <div key={section.label}>
              <div className="px-2.5 pb-2 text-[11px] font-medium tracking-wider text-sidebar-foreground/50 uppercase">
                {section.label}
              </div>
              <div className="flex flex-col gap-0.5">
                {section.items.map((item) => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    className={({ isActive }) =>
                      cn(
                        'rounded-md px-2.5 py-2 text-sm',
                        isActive
                          ? 'bg-sidebar-primary font-medium text-sidebar-primary-foreground'
                          : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                      )
                    }
                  >
                    {item.label}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="flex items-center gap-2.5 border-t border-sidebar-border px-4 py-3.5">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-xs font-medium">
            {getInitials(user)}
          </div>
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-sm font-medium">{user?.full_name ?? user?.email ?? ''}</div>
            <div className="truncate text-xs text-sidebar-foreground/50">{user?.email ?? ''}</div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Đăng xuất"
            title="Đăng xuất"
            onClick={handleLogout}
            className="shrink-0 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <LogOut className="size-4" />
          </Button>
        </div>
      </aside>
      <main className="flex-1 p-6">
        <Outlet />
      </main>
    </div>
  )
}
