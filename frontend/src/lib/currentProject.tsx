import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { listProjects, type Project } from './projects'

const STORAGE_KEY = 'qms_project_id'

type CurrentProjectContextValue = {
  projects: Project[]
  project: Project | null
  setProject: (p: Project) => void
  loading: boolean
}

const CurrentProjectContext = createContext<CurrentProjectContextValue | null>(null)

export function CurrentProjectProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<Project[]>([])
  const [project, setProjectState] = useState<Project | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    listProjects()
      .then((list) => {
        setProjects(list)
        const storedId = Number(localStorage.getItem(STORAGE_KEY))
        const restored = list.find((p) => p.id === storedId)
        setProjectState(restored ?? list[0] ?? null)
      })
      .catch((err) => {
        console.error('Failed to load projects', err)
      })
      .finally(() => setLoading(false))
  }, [])

  const setProject = useCallback((p: Project) => {
    setProjectState(p)
    localStorage.setItem(STORAGE_KEY, String(p.id))
  }, [])

  const value = useMemo(
    () => ({ projects, project, setProject, loading }),
    [projects, project, setProject, loading],
  )

  return (
    <CurrentProjectContext.Provider value={value}>
      {children}
    </CurrentProjectContext.Provider>
  )
}

export function useCurrentProject(): CurrentProjectContextValue {
  const ctx = useContext(CurrentProjectContext)
  if (ctx === null) {
    throw new Error('useCurrentProject must be used within a CurrentProjectProvider')
  }
  return ctx
}
