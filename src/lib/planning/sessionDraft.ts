// src/lib/planning/sessionDraft.ts
//
// "Close · keep my draft": a per-viewer convenience, so browser storage is
// right here — the draft is never the plan. Every access is guarded.

import type { SessionDraft, SessionLevel } from './session'

const key = (userId: string | null, level: SessionLevel, periodStart: string) => `symphony.planSession.${userId ?? 'anon'}.${level}.${periodStart}`

export function readDraft(userId: string | null, level: SessionLevel, periodStart: string): SessionDraft | null {
  try {
    const raw = localStorage.getItem(key(userId, level, periodStart))
    return raw ? (JSON.parse(raw) as SessionDraft) : null
  } catch { return null }
}
/** Fired after a draft is written from OUTSIDE the session host — the paper
 *  import, which writes the same key the open session is editing. `storage`
 *  never fires in the tab that wrote, so without this the host would save its
 *  older in-memory copy back over the import. Detail names the draft. */
export const DRAFT_CHANGED_EVENT = 'symphony:plan-draft-changed'
export interface DraftChangedDetail { level: SessionLevel; periodStart: string }

export function writeDraft(userId: string | null, d: SessionDraft): void {
  try { localStorage.setItem(key(userId, d.level, d.periodStart), JSON.stringify(d)) } catch { /* private mode */ }
}

/** Write, and tell any session open on that draft in this tab to re-read it. */
export function writeDraftAndAnnounce(userId: string | null, d: SessionDraft): void {
  writeDraft(userId, d)
  const detail: DraftChangedDetail = { level: d.level, periodStart: d.periodStart }
  window.dispatchEvent(new CustomEvent(DRAFT_CHANGED_EVENT, { detail }))
}
export function clearDraft(userId: string | null, level: SessionLevel, periodStart: string): void {
  try { localStorage.removeItem(key(userId, level, periodStart)) } catch { /* private mode */ }
}
