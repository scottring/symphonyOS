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
//
// Both belong to the account that saved the import (friends-and-family
// review, 2026-10-08: signing out of one account and into another in the
// same tab showed the first account's import and steered the second's
// guide). Every record carries its owner; a reader is answered only for
// the person signed in, and a record without an owner (written before this)
// is ignored.

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
const owned = (owner: unknown): owner is string => typeof owner === 'string' && owner.length > 0

interface OwnedImport { owner: string; saved: SavedImport }

function readImport(): OwnedImport | null {
  const stored = read<Partial<OwnedImport>>(KEY)
  return stored && owned(stored.owner) && stored.saved?.id ? { owner: stored.owner, saved: stored.saved } : null
}

let current: OwnedImport | null = readImport()
/** Announced in this page load (not restored after a reload): the panel takes
 *  focus once for it, as the review sheet closes. */
let fresh: { owner: string; id: string } | null = null
const listeners = new Set<() => void>()
const emit = () => { for (const l of listeners) l() }
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }

/** `owner` is the account that saved the import — the one signed in when the
 *  save began, even if the tab has changed accounts since. */
export function announcePaperImport(owner: string, saved: SavedImport): void {
  if (!owned(owner)) return
  current = { owner, saved }
  fresh = { owner, id: saved.id }
  write(KEY, current)
  emit()
}

export function clearPaperImport(): void {
  current = null
  fresh = null
  write(KEY, null)
  emit()
}

/** Was this import announced in this page load (vs restored from storage),
 *  for this person? */
export function takeFresh(owner: string | null | undefined, id: string): boolean {
  if (!fresh || fresh.owner !== owner || fresh.id !== id) return false
  fresh = null
  return true
}

/** The saved import the signed-in person should see, if any. */
export function usePaperImport(userId: string | null | undefined): SavedImport | null {
  const record = useSyncExternalStore(subscribe, () => current, () => null)
  return record && owned(userId) && record.owner === userId ? record.saved : null
}

export interface WeekFocus { monthStart: string; taskIds: string[]; at: number }
interface OwnedWeekFocus extends WeekFocus { owner: string }

export function setPaperWeekFocus(owner: string, focus: Omit<WeekFocus, 'at'>): void {
  if (!owned(owner)) return
  write(WEEK_KEY, { ...focus, owner, at: Date.now() })
}

/** The week page's pointer, if it is this person's, fresh, and for one of the
 *  months the week shows. The page reads it as it mounts, then clears it
 *  (clearPaperWeekFocus) so it is used once. */
export function peekPaperWeekFocus(userId: string | null | undefined, monthStarts: readonly string[], now: number = Date.now()): WeekFocus | null {
  const focus = read<OwnedWeekFocus>(WEEK_KEY)
  if (!focus || !owned(userId) || focus.owner !== userId) return null
  if (now - focus.at > WEEK_FOCUS_TTL_MS || !monthStarts.includes(focus.monthStart)) return null
  return { monthStart: focus.monthStart, taskIds: focus.taskIds, at: focus.at }
}

export function clearPaperWeekFocus(): void {
  write(WEEK_KEY, null)
}

/** Tests only. */
export function __resetPaperImportStore(): void {
  current = null
  fresh = null
  write(KEY, null)
  write(WEEK_KEY, null)
  emit()
}
