import { useCallback, useEffect, useState } from 'react'

/**
 * The household assignee lens — persisted, defaulting to EVERYONE.
 *
 * Lifted out of HomeView so the Today pin (which lives in the shell, beside
 * whatever page is open) narrows its rows and counts exactly as Today does.
 * Two readers of one key would drift the moment either changed it, so changes
 * are announced in-tab and picked up across tabs via the storage event.
 *
 * The key is rotated to -v2 (see HomeView's history): the household's day is
 * the default view; narrowing to one person is a lens you reach for.
 */
export const ASSIGNEE_FILTER_KEY = 'symphony-assignee-filter-v2'
const CHANGED = 'symphony-assignee-filter-changed'

function read(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(ASSIGNEE_FILTER_KEY)
    if (raw !== null) {
      const parsed: unknown = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed.filter((x): x is string => typeof x === 'string')
    }
  } catch { /* ignore */ }
  return []
}

export function useAssigneeFilter(): [string[], (next: string[]) => void] {
  const [selected, setSelected] = useState<string[]>(read)
  useEffect(() => {
    const sync = () => setSelected(read())
    const onStorage = (e: StorageEvent) => { if (e.key === ASSIGNEE_FILTER_KEY) sync() }
    window.addEventListener(CHANGED, sync)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener(CHANGED, sync)
      window.removeEventListener('storage', onStorage)
    }
  }, [])
  const set = useCallback((next: string[]) => {
    setSelected(next)
    try { window.localStorage.setItem(ASSIGNEE_FILTER_KEY, JSON.stringify(next)) } catch { /* ignore */ }
    window.dispatchEvent(new Event(CHANGED))
  }, [])
  return [selected, set]
}
