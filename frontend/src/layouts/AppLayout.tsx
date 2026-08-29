import { useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { LogOut, Menu, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { NAV_SECTIONS } from '@/nav'
import { clearToken, getCurrentUser, type CurrentUser } from '@/lib/auth'
import { CurrentProjectProvider, useCurrentProject } from '@/lib/currentProject'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

function ProjectSwitcher() {
  const { projects, project, setProject, loading } = useCurrentProject()

  if (!loading && projects.length === 0) {
    return (
      <div className="px-4 pb-3 text-xs text-sidebar-foreground/50">Chưa có dự án</div>
    )
  }

  return (
    <div className="px-4 pb-3">
      <Select
        value={project ? String(project.id) : undefined}
        onValueChange={(value) => {
          const next = projects.find((p) => String(p.id) === value)
          if (next) setProject(next)
        }}
      >
        <SelectTrigger className="w-full" size="sm">
          <SelectValue placeholder="Chọn dự án" />
        </SelectTrigger>
        <SelectContent>
          {projects.map((p) => (
            <SelectItem key={p.id} value={String(p.id)}>
              {p.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

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
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  useEffect(() => {
    getCurrentUser()
      .then(setUser)
      .catch((err) => {
        // A 401 is already handled globally by api.ts (clears token, redirects to
        // /login). Anything else (network blip) just leaves the sidebar placeholder.
        console.error('Failed to load current user', err)
      })
  }, [])

  function handleLogout() {
    clearToken()
    navigate('/login', { replace: true })
  }

  const sidebarContent = (
    <>
      <div className="flex items-center gap-2.5 border-b border-sidebar-border px-4 py-3.5">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sm font-semibold text-sidebar-primary-foreground">
          Q
        </div>
        <div className="leading-tight">
          <div className="text-sm font-semibold">QMS</div>
          <div className="text-xs text-sidebar-foreground/50">v2.3.1</div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Đóng menu"
          onClick={() => setMobileNavOpen(false)}
          className="ml-auto text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground md:hidden"
        >
          <X className="size-4" />
        </Button>
      </div>

      <ProjectSwitcher />

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
                  onClick={() => setMobileNavOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm',
                      isActive
                        ? 'bg-sidebar-primary font-medium text-sidebar-primary-foreground'
                        : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                    )
                  }
                >
                  <item.icon className="size-4 shrink-0" />
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
    </>
  )

  return (
    <CurrentProjectProvider>
      <div className="flex h-svh flex-col overflow-hidden md:flex-row print:h-auto print:overflow-visible print:block">
        <header className="dark sticky top-0 z-30 flex shrink-0 items-center gap-2.5 border-b border-sidebar-border bg-sidebar px-4 py-3 text-sidebar-foreground md:hidden print:hidden">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Mở menu"
            onClick={() => setMobileNavOpen(true)}
            className="text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <Menu className="size-4" />
          </Button>
          <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-xs font-semibold text-sidebar-primary-foreground">
            Q
          </div>
          <div className="text-sm font-semibold">QMS</div>
        </header>

        {mobileNavOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/50 md:hidden"
            onClick={() => setMobileNavOpen(false)}
            aria-hidden="true"
          />
        )}

        <aside
          className={cn(
            'dark fixed inset-y-0 left-0 z-50 flex w-64 -translate-x-full flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-transform duration-200 md:static md:z-auto md:w-56 md:translate-x-0 print:hidden',
            mobileNavOpen && 'translate-x-0',
          )}
        >
          {sidebarContent}
        </aside>

        <main className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-6 print:overflow-visible print:p-0">
          <Outlet />
        </main>
      </div>
    </CurrentProjectProvider>
  )
}
