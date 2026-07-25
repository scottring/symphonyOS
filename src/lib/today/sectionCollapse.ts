import type { DaySection } from '@/lib/timeUtils'

/**
 * Which Today sections (and, from Stage 2, which groups) the user has folded
 * shut. Persisted so a collapse survives reload.
 *
 * Modelled on lib/hideRoutinesSignal.ts: native 'storage' events don't fire in
 * the tab that wrote the value, so we dispatch an in-tab custom event too.
 *
 * Per-device by design — a view preference, not user data. If cross-device
 * collapse is ever wanted, move it to a column then.
 */
const KEY = 'symphony-today-collapsed'
const EVENT = 'symphony-today-collapsed-changed'

/** Unscheduled holds the untimed-routine slab (21 rows on a normal Saturday),
 *  so it opens folded. Everything else opens as the user left it. */
const DEFAULT_COLLAPSED = ['section:unscheduled']

export function sectionKey(section: DaySection): string {
  return `section:${section}`
}

export function groupKey(wrapperId: string): string {
  return `group:${wrapperId}`
}

export function readCollapsed(): Set<string> {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw === null) return new Set(DEFAULT_COLLAPSED)
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return new Set(DEFAULT_COLLAPSED)
    return new Set(parsed.filter((v): v is string => typeof v === 'string'))
  } catch {
    return new Set(DEFAULT_COLLAPSED)
  }
}

export function writeCollapsed(next: Set<string>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify([...next]))
    window.dispatchEvent(new CustomEvent(EVENT, { detail: { value: next } }))
  } catch { /* localStorage unavailable — silent fail, same as hideRoutinesSignal */ }
}

export function toggleCollapsed(key: string): Set<string> {
  const next = readCollapsed()
  if (next.has(key)) next.delete(key)
  else next.add(key)
  writeCollapsed(next)
  return next
}

/** Sets (rather than flips) whether `key` is folded. The primitive the UI
 *  uses so it can drive collapse from what's currently rendered instead of
 *  guessing via toggle — see sectionCollapse's caller in TodayView for why
 *  blind toggling of two independent facts made a state unreachable. */
export function setCollapsed(key: string, collapsed: boolean): Set<string> {
  const next = readCollapsed()
  if (collapsed) next.add(key)
  else next.delete(key)
  writeCollapsed(next)
  return next
}

/** Subscribe to in-tab + cross-tab changes. Returns cleanup. */
export function onCollapsedChange(cb: (value: Set<string>) => void): () => void {
  const customHandler = (e: Event) => {
    const detail = (e as CustomEvent<{ value: Set<string> }>).detail
    cb(detail?.value ?? readCollapsed())
  }
  const storageHandler = (e: StorageEvent) => {
    if (e.key === KEY) cb(readCollapsed())
  }
  window.addEventListener(EVENT, customHandler)
  window.addEventListener('storage', storageHandler)
  return () => {
    window.removeEventListener(EVENT, customHandler)
    window.removeEventListener('storage', storageHandler)
  }
}
