import { NavLink, Outlet } from 'react-router-dom'
import { cn } from '@/lib/utils'

export const NAV_ITEMS = [
  { path: '/requirements', label: 'Requirements' },
  { path: '/testcases', label: 'Test Cases' },
  { path: '/defects', label: 'Defects' },
  { path: '/traceability', label: 'Traceability' },
  { path: '/search', label: 'Search' },
  { path: '/agent', label: 'Impact Agent' },
  { path: '/report', label: 'Release Report' },
  { path: '/admin', label: 'Admin' },
]

export function AppLayout() {
  return (
    <div className="flex min-h-svh">
      <aside className="w-56 shrink-0 border-r p-4">
        <nav className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                cn(
                  'rounded-md px-3 py-2 text-sm',
                  isActive
                    ? 'bg-accent text-accent-foreground font-medium'
                    : 'text-muted-foreground hover:bg-accent/50',
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="flex-1 p-6">
        <Outlet />
      </main>
    </div>
  )
}
