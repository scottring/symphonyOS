// src/hooks/useSessionProgress.ts
//
// Where a planning session stands, so "Leave for now" and coming back resume
// at the same step with unfinished input intact (Scott, 2026-10-12: a session
// remembers progress; pausing never loses decisions). Shared by Week, Month,
// Season and Year.
//
// Kept per signed-in person, horizon and period, in THIS browser only
// (localStorage). It is not synced across devices and makes no claim to be:
// what a session decides is written to the items themselves as it happens,
// and "planned" is planning_sessions (usePlanningSession). This holds only
// the place in the session — the step, a half-typed line, look-back verdicts
// not yet acted on.

import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import type { SessionHorizon } from '@/hooks/usePlanningSession'

export interface SessionProgress {
  /** The step on screen when the session was last touched. */
  step: string
  /** Unfinished typed input, by the page's own key ("write", a goal id…). */
  drafts: Record<string, string>
  /** Look-back verdicts by item id ("carried", "done", "left"…), so a
   *  resumed review shows what was already decided. */
  decisions: Record<string, string>
  updatedAt: string
}

const PREFIX = 'symphony.session.v1'

export function sessionProgressKey(userId: string, horizon: SessionHorizon, token: string): string {
  return `${PREFIX}.${userId}.${horizon}.${token}`
}

export function readSessionProgress(userId: string | null | undefined, horizon: SessionHorizon, token: string): SessionProgress | null {
  if (!userId || !token) return null
  try {
    const raw = localStorage.getItem(sessionProgressKey(userId, horizon, token))
    if (!raw) return null
    const v = JSON.parse(raw) as Partial<SessionProgress>
    if (typeof v.step !== 'string') return null
    return { step: v.step, drafts: v.drafts ?? {}, decisions: v.decisions ?? {}, updatedAt: v.updatedAt ?? '' }
  } catch { return null }
}

function write(userId: string, horizon: SessionHorizon, token: string, p: SessionProgress | null) {
  try {
    const key = sessionProgressKey(userId, horizon, token)
    if (p) localStorage.setItem(key, JSON.stringify(p)); else localStorage.removeItem(key)
  } catch { /* private window: the session still works, it just won't resume */ }
}

/**
 * The session's progress for one person, horizon and period. `progress` is
 * null when no session is open (never started, or finished). Changing the
 * period reads that period's own progress; nothing carries between periods
 * or people.
 */
export function useSessionProgress(horizon: SessionHorizon, token: string) {
  const { user } = useAuth()
  const userId = user?.id ?? null
  const [state, setState] = useState<{ id: string; progress: SessionProgress | null }>(() =>
    ({ id: `${userId}|${token}`, progress: readSessionProgress(userId, horizon, token) }))
  const id = `${userId}|${token}`
  // A different person or period: read its own progress (render-time sync, so
  // the old period's step never flashes on the new one).
  const progress = state.id === id ? state.progress : readSessionProgress(userId, horizon, token)
  useEffect(() => {
    if (state.id !== id) setState({ id, progress: readSessionProgress(userId, horizon, token) })
  }, [id, state.id, userId, horizon, token])

  const update = useCallback((fn: (p: SessionProgress | null) => SessionProgress | null) => {
    setState((s) => {
      const base = s.id === id ? s.progress : readSessionProgress(userId, horizon, token)
      const next = fn(base)
      if (userId && token) write(userId, horizon, token, next)
      return { id, progress: next }
    })
  }, [id, userId, horizon, token])

  const stamp = () => new Date().toISOString()
  /** Open (or resume) the session. Resuming keeps the saved step unless a
   *  specific step is asked for ("Review last week" goes straight there). */
  const open = useCallback((firstStep: string, opts?: { step?: string }) => update((p) => p
    ? { ...p, step: opts?.step ?? p.step, updatedAt: stamp() }
    : { step: opts?.step ?? firstStep, drafts: {}, decisions: {}, updatedAt: stamp() }), [update])
  const setStep = useCallback((step: string) => update((p) => p ? { ...p, step, updatedAt: stamp() } : p), [update])
  const setDraft = useCallback((key: string, text: string) => update((p) => {
    if (!p) return p
    const drafts = { ...p.drafts }
    if (text) drafts[key] = text; else delete drafts[key]
    return { ...p, drafts, updatedAt: stamp() }
  }), [update])
  const decide = useCallback((itemId: string, verdict: string | null) => update((p) => {
    if (!p) return p
    const decisions = { ...p.decisions }
    if (verdict) decisions[itemId] = verdict; else delete decisions[itemId]
    return { ...p, decisions, updatedAt: stamp() }
  }), [update])
  /** Finish: the session closes and its progress is forgotten. */
  const finish = useCallback(() => update(() => null), [update])

  return { progress, open, setStep, setDraft, decide, finish }
}
