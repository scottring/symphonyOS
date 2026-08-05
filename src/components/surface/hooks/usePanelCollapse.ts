import { useCallback, useSyncExternalStore } from 'react'

/**
 * Which panel sections the user has collapsed. One key holding a list of section
 * ids — a preference per section TYPE, not per entity: collapse Notes once and
 * Notes stays collapsed on every task until you reopen it, so the panel looks
 * the same every time it opens.
 */
export const PANEL_COLLAPSE_KEY = 'symphony.panel.collapsed'

const listeners = new Set<() => void>()

function read(): Set<string> {
  try {
    const raw = localStorage.getItem(PANEL_COLLAPSE_KEY)
    if (!raw) return new Set()
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed)
      ? new Set(parsed.filter((x): x is string => typeof x === 'string'))
      : new Set()
  } catch {
    // Corrupt or unavailable storage must not take the panel down with it.
    return new Set()
  }
}

function write(next: Set<string>): void {
  try {
    localStorage.setItem(PANEL_COLLAPSE_KEY, JSON.stringify([...next]))
  } catch {
    // Private mode / quota — the toggle still works for this session.
  }
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

// The snapshot must be a stable primitive: useSyncExternalStore compares with
// Object.is, and returning a fresh Set each call would re-render forever.
function makeSnapshot(id: string): () => 'collapsed' | 'open' {
  return () => (read().has(id) ? 'collapsed' : 'open')
}

const serverSnapshot = () => 'open' as const

/** `[collapsed, toggle]` for one section id. Every live instance stays in sync. */
export function usePanelCollapse(id: string): [boolean, () => void] {
  const snapshot = useSyncExternalStore(subscribe, makeSnapshot(id), serverSnapshot)

  const toggle = useCallback(() => {
    const next = read()
    if (next.has(id)) next.delete(id)
    else next.add(id)
    write(next)
  }, [id])

  return [snapshot === 'collapsed', toggle]
}
