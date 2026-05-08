import { useCallback, useState } from 'react'

export type SidebarGroupId = 'plan' | 'library' | 'spaces' | 'apps'

export interface SidebarGroupState {
  plan: boolean
  library: boolean
  spaces: boolean
  apps: boolean
}

const STORAGE_KEY = 'symphony-sidebar-groups'
const DEFAULT_STATE: SidebarGroupState = { plan: false, library: false, spaces: false, apps: false }

function readState(): SidebarGroupState {
  if (typeof window === 'undefined') return DEFAULT_STATE
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_STATE
    const parsed = JSON.parse(raw) as Partial<SidebarGroupState>
    return {
      plan: !!parsed.plan,
      library: !!parsed.library,
      spaces: !!parsed.spaces,
      apps: !!parsed.apps,
    }
  } catch {
    return DEFAULT_STATE
  }
}

function writeState(s: SidebarGroupState) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
  } catch {
    // ignore quota / disabled-storage errors
  }
}

export function useSidebarGroupState() {
  const [state, setState] = useState<SidebarGroupState>(() => readState())

  const toggle = useCallback((id: SidebarGroupId) => {
    setState((prev) => {
      const next = { ...prev, [id]: !prev[id] }
      writeState(next)
      return next
    })
  }, [])

  const setOpen = useCallback((id: SidebarGroupId) => {
    setState((prev) => {
      if (prev[id]) return prev
      const next = { ...prev, [id]: true }
      writeState(next)
      return next
    })
  }, [])

  return { state, toggle, setOpen }
}
