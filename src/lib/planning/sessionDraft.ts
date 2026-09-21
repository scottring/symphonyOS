// src/lib/planning/sessionDraft.ts
//
// "Close · keep my draft": a per-viewer convenience, so browser storage is
// right here — the draft is never the plan. Every access is guarded.

import type { SessionDraft } from './session'

const key = (userId: string | null, periodStart: string) => `symphony.planSession.${userId ?? 'anon'}.month.${periodStart}`

export function readDraft(userId: string | null, periodStart: string): SessionDraft | null {
  try {
    const raw = localStorage.getItem(key(userId, periodStart))
    return raw ? (JSON.parse(raw) as SessionDraft) : null
  } catch { return null }
}
export function writeDraft(userId: string | null, d: SessionDraft): void {
  try { localStorage.setItem(key(userId, d.periodStart), JSON.stringify(d)) } catch { /* private mode */ }
}
export function clearDraft(userId: string | null, periodStart: string): void {
  try { localStorage.removeItem(key(userId, periodStart)) } catch { /* private mode */ }
}
