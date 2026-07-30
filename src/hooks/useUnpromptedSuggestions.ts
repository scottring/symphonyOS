// The unprompted delivery tier: suggestions that may appear where the user did
// NOT ask about that entity (the wall rail, a Today band).
//
// Everything here is gated by mayInterrupt. Anchored delivery (ContextChips /
// useEntityContext) deliberately does NOT go through this hook and never marks
// seen_at — conflating "you looked at the entity" with "the assistant interrupted
// you" would poison the signal seen_at exists to capture.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { ProactiveSuggestion, ProactiveSuggestionRow } from '@/types/proactiveSuggestion'
import { rowToSuggestion } from '@/types/proactiveSuggestion'
import { computeUrgency, deriveUrgencyFacts, type UrgencyInput } from '@/lib/assistant/urgency'
import {
  mayInterrupt, SURFACES, type SurfaceId, type InterruptDecision,
} from '@/lib/assistant/interruptionPolicy'
import {
  actOnSuggestionDb, dismissSuggestionDb, snoozeSuggestionDb, markSuggestionSeenDb,
} from '@/lib/assistant/suggestionMutations'
import { computeCadenceOverdue, completedCadenceTokens } from '@/lib/assistant/cadenceDue'
import {
  readCadenceConfig, readDismissedNudgeToken, dismissNudgeForToken,
  NUDGE_DISMISS_EVENT,
} from '@/lib/cadence/config'

export interface UnpromptedItem {
  suggestion: ProactiveSuggestion
  urgency: number
  critical: boolean
  /** Synthetic items (cadence) have no DB row — snooze/seen go to localStorage. */
  synthetic?: boolean
}

export interface UnpromptedDecisionLog {
  id: string
  title: string
  urgency: number
  reason: string
}

export interface UnpromptedResult {
  items: UnpromptedItem[]
  /** Every considered suggestion with its verdict — rendered under ?why=1. */
  decisions: UnpromptedDecisionLog[]
  snooze: (id: string, scope: 'now' | 'today') => Promise<void>
  act: (id: string, detail?: string, outcome?: string) => Promise<void>
  dismiss: (id: string) => Promise<void>
}

/** Resolves the live time facts for a suggestion's entity. The caller supplies
 *  this because it already has tasks and events loaded; without it the hook
 *  falls back to the engine's stored hint. */
export type FactsResolver = (s: ProactiveSuggestion) => UrgencyInput | null

interface Options {
  resolveFacts?: FactsResolver
  /** Synthesize an overdue-planning-ritual item. Default true. */
  includeCadence?: boolean
}

const SNOOZE_NOW_HOURS = 4

/** How long an item must sit on screen, in a visible tab, before it counts as seen. */
export const SEEN_DWELL_MS = 3000

export function snoozeTarget(scope: 'now' | 'today', now: Date = new Date()): Date {
  if (scope === 'now') return new Date(now.getTime() + SNOOZE_NOW_HOURS * 3_600_000)
  const t = new Date(now)
  t.setDate(t.getDate() + 1)
  t.setHours(7, 0, 0, 0)
  return t
}

/** Stable id for the synthetic cadence item. */
function cadenceId(kind: string, token: string): string {
  return `cadence:${kind}:${token}`
}

export function useUnpromptedSuggestions(
  surface: SurfaceId,
  options: Options = {},
): UnpromptedResult {
  const { resolveFacts, includeCadence = true } = options
  const { user } = useAuth()
  const [rows, setRows] = useState<ProactiveSuggestion[]>([])
  const [budgetSpent, setBudgetSpent] = useState(0)
  const [cadenceTokens, setCadenceTokens] = useState<Set<string> | null>(null)
  const [nudgeDismissed, setNudgeDismissed] = useState<string | null>(readDismissedNudgeToken)
  const markedRef = useRef<Set<string>>(new Set())

  const fetchRows = useCallback(async () => {
    if (!user) { setRows([]); return }
    const { data, error } = await supabase
      .from('proactive_suggestions')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .order('urgency', { ascending: false })
      .limit(50)

    if (error || !data) { setRows([]); return }
    const list = (data as ProactiveSuggestionRow[]).map(rowToSuggestion)
    setRows(list)

    // Budget = distinct suggestions already seen today, across ALL surfaces.
    const startOfToday = new Date()
    startOfToday.setHours(0, 0, 0, 0)
    setBudgetSpent(list.filter(s => s.seenAt && new Date(s.seenAt) >= startOfToday).length)
  }, [user])

  useEffect(() => { void fetchRows() }, [fetchRows])

  // Planning-ritual completion, for the synthetic cadence item. A row exists as
  // soon as a wizard is OPENED, so completedCadenceTokens filters to substantive
  // sessions only.
  useEffect(() => {
    if (!user || !includeCadence) { setCadenceTokens(null); return }
    let cancelled = false
    void (async () => {
      const { data, error } = await supabase
        .from('planning_sessions')
        .select('horizon, period_token, notes')
        .eq('author_id', user.id)
      if (cancelled) return
      // Fail closed: if we can't tell whether a ritual happened, stay quiet.
      setCadenceTokens(error || !data ? null : completedCadenceTokens(data))
    })()
    return () => { cancelled = true }
  }, [user, includeCadence])

  // A session Finish writes the dismissal token; pick it up live.
  useEffect(() => {
    const sync = () => setNudgeDismissed(readDismissedNudgeToken())
    window.addEventListener(NUDGE_DISMISS_EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(NUDGE_DISMISS_EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  const profile = SURFACES[surface]

  const { items, decisions } = useMemo(() => {
    const now = new Date()
    const state = { budgetSpent }
    const allowed: UnpromptedItem[] = []
    const log: UnpromptedDecisionLog[] = []

    const consider = (s: ProactiveSuggestion, urgency: number, synthetic = false) => {
      let decision: InterruptDecision
      try {
        decision = mayInterrupt(s, urgency, profile, state, now)
      } catch {
        decision = { allow: false, reason: 'not_actionable' } // fail closed
      }
      log.push({ id: s.id, title: s.title, urgency, reason: decision.reason })
      if (decision.allow) {
        allowed.push({ suggestion: s, urgency, critical: decision.critical, synthetic })
      }
    }

    for (const s of rows) {
      // Live recompute — the stored column is only a hint, because the engine runs
      // every 6h and "event starts within 90 min" flips true between runs.
      const facts = resolveFacts?.(s) ?? null
      const urgency = facts
        ? computeUrgency(deriveUrgencyFacts(facts, now))
        : (s.urgency ?? 0)
      consider(s, urgency)
    }

    // Synthetic: an overdue planning ritual. Generated client-side because the
    // cadence config lives in localStorage — the server cannot know the user's
    // week start or whether weekly nudges are enabled at all.
    if (includeCadence && cadenceTokens) {
      const overdue = computeCadenceOverdue(readCadenceConfig(), now, cadenceTokens)
      if (overdue && nudgeDismissed !== overdue.token) {
        const iso = now.toISOString()
        const synthetic: ProactiveSuggestion = {
          id: cadenceId(overdue.kind, overdue.token),
          userId: user?.id ?? '',
          entityType: 'general',
          entityId: `cadence:${overdue.kind}`,
          suggestionType: 'plan_session',
          title: `Plan ${overdue.label}`,
          detail: overdue.weeksLate > 0
            ? `${overdue.weeksLate} week${overdue.weeksLate === 1 ? '' : 's'} since it was due`
            : 'Due now',
          confidence: 1,
          actionPayload: { planHorizon: overdue.kind, token: overdue.token },
          status: 'active',
          suggestionKey: `cadence:${overdue.kind}:${overdue.token}`,
          generatedAt: iso,
          createdAt: iso,
          updatedAt: iso,
        }
        consider(synthetic, computeUrgency({ cadenceWeeksLate: overdue.weeksLate }), true)
      }
    }

    allowed.sort((a, b) =>
      b.urgency - a.urgency || b.suggestion.confidence - a.suggestion.confidence)

    return { items: allowed.slice(0, profile.concurrent), decisions: log }
  }, [rows, profile, budgetSpent, resolveFacts, includeCadence, cadenceTokens, nudgeDismissed, user])

  // Mark seen once per suggestion — but only after it has been on screen, in a
  // VISIBLE tab, for SEEN_DWELL_MS.
  //
  // Writing seen_at on first render would make the column mean "rendered", not
  // "seen": opening Today for two seconds would burn three items' cooldowns and
  // they'd vanish for four hours unread. seen_at is the instrument that
  // distinguishes missed from ignored, so it has to earn its value.
  useEffect(() => {
    const pending = items.filter(i =>
      !i.synthetic && !i.suggestion.seenAt && !markedRef.current.has(i.suggestion.id))
    if (pending.length === 0) return

    let timer: ReturnType<typeof setTimeout> | null = null

    const arm = () => {
      if (timer !== null) return
      timer = setTimeout(() => {
        timer = null
        if (document.hidden) return
        for (const item of pending) {
          if (markedRef.current.has(item.suggestion.id)) continue
          markedRef.current.add(item.suggestion.id)
          void markSuggestionSeenDb(item.suggestion.id, item.urgency)
        }
      }, SEEN_DWELL_MS)
    }

    const disarm = () => {
      if (timer !== null) { clearTimeout(timer); timer = null }
    }

    const onVisibility = () => (document.hidden ? disarm() : arm())
    if (!document.hidden) arm()
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      disarm()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [items])

  const snooze = useCallback(async (id: string, scope: 'now' | 'today') => {
    // Synthetic cadence items reuse the existing per-period nudge dismissal,
    // which finishing the session also clears.
    if (id.startsWith('cadence:')) {
      const token = id.split(':').slice(2).join(':')
      dismissNudgeForToken(token)
      setNudgeDismissed(token)
      return
    }
    await snoozeSuggestionDb(id, snoozeTarget(scope))
    setRows(prev => prev.filter(s => s.id !== id))
  }, [])

  const act = useCallback(async (id: string, detail?: string, outcome?: string) => {
    if (id.startsWith('cadence:')) return // nothing to record; the session is the act
    if (!user) return
    const s = rows.find(r => r.id === id)
    if (!s) return
    await actOnSuggestionDb(user.id, s, detail, outcome)
    setRows(prev => prev.filter(r => r.id !== id))
  }, [user, rows])

  const dismiss = useCallback(async (id: string) => {
    if (id.startsWith('cadence:')) return
    await dismissSuggestionDb(id)
    setRows(prev => prev.filter(r => r.id !== id))
  }, [])

  return { items, decisions, snooze, act, dismiss }
}
