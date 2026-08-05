//
// The Tend sweep's state machine. start() surfaces deterministic prepass
// proposals SYNCHRONOUSLY (the sweep is useful even offline), then asks the
// tend-week edge fn for judgment calls and appends whatever validates.
// Application/dismissal both just remove() the card — the WeekPage owns the
// actual writes via applyProposal.

import { useCallback, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Task } from '@/types/task'
import { runPrepass } from '@/lib/tend/prepass'
import { parseTendProposals } from '@/lib/tend/validate'
import type { TendProposal } from '@/lib/tend/types'

export interface UseTendWeekArgs {
  pool: Task[]
  carryOver: Task[]
  weekStartYmd: string
  todayYmd: string
  busy: { title: string; start: string; end: string }[]
  projectNameFor: (task: Task) => string | undefined
  grain?: 'week' | 'month'
  monthEndYmd?: string
}

export interface TendState {
  status: 'idle' | 'reviewing'
  aiLoading: boolean
  aiError: string | null
  proposals: TendProposal[]
  start: () => void
  remove: (proposalId: string) => void
  done: () => void
}

// LOCAL date parts, never toISOString() — UTC would shift the date near
// midnight in negative-UTC-offset timezones.
function localYmd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * The days a placement may land on: the period BEING PLANNED, clamped forward
 * by today. Null when the period has already passed.
 *
 * The window used to be [today, periodEnd], which is only the same thing on the
 * current period. On a `?start=` week it went wrong both ways: on a future week
 * the span opened all the way back to today, so a placement could land on a day
 * that isn't on the grid the user is looking at; on a past week min > max, so
 * every placement was silently dropped after the model had already been asked
 * for them. YYYY-MM-DD compares correctly lexicographically.
 */
export function placeWindow(
  periodStartYmd: string,
  periodEndYmd: string,
  todayYmd: string,
): { minYmd: string; maxYmd: string } | null {
  const minYmd = todayYmd > periodStartYmd ? todayYmd : periodStartYmd
  if (minYmd > periodEndYmd) return null
  return { minYmd, maxYmd: periodEndYmd }
}

/** Task ids a proposal touches, keyed for overlap-dedup between prepass and AI. */
function touchedIds(p: TendProposal): string[] {
  switch (p.kind) {
    case 'merge': return [p.keepId, ...p.dropIds]
    case 'put_aside':
    case 'regrade': return [p.taskId]
    case 'place': return p.taskIds
  }
}

export function useTendWeek(args: UseTendWeekArgs): TendState {
  const [status, setStatus] = useState<'idle' | 'reviewing'>('idle')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [proposals, setProposals] = useState<TendProposal[]>([])
  // A sweep started then finished before the fn resolves must not resurrect cards.
  const sweepSeq = useRef(0)

  const { pool, carryOver, weekStartYmd, todayYmd, busy, projectNameFor, grain = 'week', monthEndYmd } = args

  const start = useCallback(() => {
    const seq = ++sweepSeq.current
    const prepass = runPrepass(pool, carryOver)
    setProposals(prepass)
    setStatus('reviewing')
    setAiError(null)
    setAiLoading(true)

    const byId = new Map<string, Task>()
    for (const t of [...pool, ...carryOver]) if (!t.completed) byId.set(t.id, t)
    const tasks = [...byId.values()]

    // Nothing open to tend — the sweep is still useful (prepass already ran,
    // synchronously, above) but there's no point invoking the edge fn over an
    // empty list. Settle immediately so the UI reads "Nothing to tend" rather
    // than sitting in a loading state that never resolves into a failure look.
    if (tasks.length === 0) {
      setAiLoading(false)
      return
    }

    // The period's last day, then the window placements may land in. Both are
    // computed HERE, before the call, so the prompt and the validator agree on
    // one window instead of each deriving its own from weekStart/today.
    // LOCAL date parts only (never Date.parse/toISOString, which shift near
    // midnight in negative-UTC-offset timezones).
    let periodEndYmd: string
    if (grain === 'month' && monthEndYmd) {
      periodEndYmd = monthEndYmd
    } else {
      const [wy, wm, wd] = weekStartYmd.split('-').map(Number)
      periodEndYmd = localYmd(new Date(wy, wm - 1, wd + 6))
    }
    const window = placeWindow(weekStartYmd, periodEndYmd, todayYmd)

    const now = Date.now()
    const body: Record<string, unknown> = {
      tasks: tasks.map((t) => ({
        id: t.id,
        title: t.title,
        notes: t.notes ? t.notes.slice(0, 300) : undefined,
        project: projectNameFor(t),
        ageDays: Math.max(0, Math.round((now - new Date(t.createdAt).getTime()) / 86400000)),
        overdue: carryOver.some((c) => c.id === t.id),
      })),
      weekStart: weekStartYmd,
      today: todayYmd,
      busy,
      grain,
      // A period that has already passed is reviewable (merge/put aside/
      // regrade all still apply) but not placeable — say so rather than letting
      // the model spend the call on placements the validator will discard.
      allowPlace: window !== null,
    }
    if (window) {
      body.placeStart = window.minYmd
      body.placeEnd = window.maxYmd
    }
    if (grain === 'month' && monthEndYmd) {
      body.monthEnd = monthEndYmd
    }

    void supabase.functions.invoke('tend-week', { body }).then(({ data, error }) => {
      if (sweepSeq.current !== seq) return // stale sweep
      setAiLoading(false)
      if (error) {
        setAiError(error instanceof Error ? error.message : 'Tending failed')
        return
      }
      const validIds = new Set(tasks.map((t) => t.id))
      // Regrade filtering depends on grain; the place window was already fixed
      // above and is re-checked here because the model's JSON is untrusted.
      const allowedRegrades: Set<'week' | 'month' | 'season' | 'someday'> =
        grain === 'month' && monthEndYmd
          ? new Set(['week', 'season', 'someday'])
          : new Set(['month', 'someday'])
      const ai = parseTendProposals(data, validIds, {
        dateWindow: window ?? undefined,
        allowPlace: window !== null,
        allowedRegrades,
      })
      setProposals((current) => {
        const covered = new Set(current.flatMap((p) => touchedIds(p).map((id) => `${p.kind}:${id}`)))
        const fresh = ai.filter((p) => !touchedIds(p).some((id) => covered.has(`${p.kind}:${id}`)))
        return [...current, ...fresh]
      })
    })
  }, [pool, carryOver, weekStartYmd, todayYmd, busy, projectNameFor, grain, monthEndYmd])

  const remove = useCallback((proposalId: string) => {
    setProposals((current) => current.filter((p) => p.id !== proposalId))
  }, [])

  const done = useCallback(() => {
    sweepSeq.current++
    setStatus('idle')
    setAiLoading(false)
    setAiError(null)
    setProposals([])
  }, [])

  return { status, aiLoading, aiError, proposals, start, remove, done }
}
