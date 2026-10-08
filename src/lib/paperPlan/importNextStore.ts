// src/lib/paperPlan/importNextStore.ts
//
// The one saved paper import the next-step panel speaks about, shared by
// every page that can host the panel (the review closes and the page it
// lands on may be a different mount). Kept for this tab in sessionStorage so
// a reload still shows it until "Continue planning" or "Done for now" —
// a convenience only: nothing here is the saved data itself.
//
// Also carries the week page's one-time pointer: after "Continue planning"
// from a month import, the week opens with that month beside it and the
// imported lines marked, then forgets.

import { useSyncExternalStore } from 'react'
import type { SavedImport } from './importNext'

const KEY = 'symphony.paper.next'
const WEEK_KEY = 'symphony.paper.weekFocus'
/** A pointer older than this is stale (the person went elsewhere first). */
const WEEK_FOCUS_TTL_MS = 30 * 60 * 1000

function read<T>(key: string): T | null {
  try { const raw = sessionStorage.getItem(key); return raw ? (JSON.parse(raw) as T) : null } catch { return null }
}
function write(key: string, value: unknown) {
  try { if (value) sessionStorage.setItem(key, JSON.stringify(value)); else sessionStorage.removeItem(key) } catch { /* this visit only */ }
}

let current: SavedImport | null = read<SavedImport>(KEY)
/** Announced in this page load (not restored after a reload): the panel takes
 *  focus once for it, as the review sheet closes. */
let freshId: string | null = null
const listeners = new Set<() => void>()
const emit = () => { for (const l of listeners) l() }
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }

export function announcePaperImport(saved: SavedImport): void {
  current = saved
  freshId = saved.id
  write(KEY, saved)
  emit()
}

export function clearPaperImport(): void {
  current = null
  freshId = null
  write(KEY, null)
  emit()
}

/** Was this import announced in this page load (vs restored from storage)? */
export function takeFresh(id: string): boolean {
  if (freshId !== id) return false
  freshId = null
  return true
}

export function usePaperImport(): SavedImport | null {
  return useSyncExternalStore(subscribe, () => current, () => null)
}

export interface WeekFocus { monthStart: string; taskIds: string[]; at: number }

export function setPaperWeekFocus(focus: Omit<WeekFocus, 'at'>): void {
  write(WEEK_KEY, { ...focus, at: Date.now() })
}

/** The week page's pointer, if it is fresh and for one of the months the week
 *  shows. The page reads it as it mounts, then clears it (clearPaperWeekFocus)
 *  so it is used once. */
export function peekPaperWeekFocus(monthStarts: readonly string[], now: number = Date.now()): WeekFocus | null {
  const focus = read<WeekFocus>(WEEK_KEY)
  if (!focus || now - focus.at > WEEK_FOCUS_TTL_MS || !monthStarts.includes(focus.monthStart)) return null
  return focus
}

export function clearPaperWeekFocus(): void {
  write(WEEK_KEY, null)
}

/** Tests only. */
export function __resetPaperImportStore(): void {
  current = null
  freshId = null
  write(KEY, null)
  write(WEEK_KEY, null)
  emit()
}
