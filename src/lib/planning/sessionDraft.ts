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
export function writeDraft(userId: string | null, d: SessionDraft): void {
  try { localStorage.setItem(key(userId, d.level, d.periodStart), JSON.stringify(d)) } catch { /* private mode */ }
}
export function clearDraft(userId: string | null, level: SessionLevel, periodStart: string): void {
  try { localStorage.removeItem(key(userId, level, periodStart)) } catch { /* private mode */ }
}
