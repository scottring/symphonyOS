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

  const { pool, carryOver, weekStartYmd, todayYmd, busy, projectNameFor } = args

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

    const now = Date.now()
    const body = {
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
    }

    void supabase.functions.invoke('tend-week', { body }).then(({ data, error }) => {
      if (sweepSeq.current !== seq) return // stale sweep
      setAiLoading(false)
      if (error) {
        setAiError(error instanceof Error ? error.message : 'Tending failed')
        return
      }
      const validIds = new Set(tasks.map((t) => t.id))
      // AI place proposals must land inside today..weekEnd (weekStart + 6 days) —
      // never in the past, never past the week it's tending. LOCAL date parts
      // only (never Date.parse/toISOString, which shift near midnight in
      // negative-UTC-offset timezones).
      const [wy, wm, wd] = weekStartYmd.split('-').map(Number)
      const weekEnd = new Date(wy, wm - 1, wd + 6)
      const maxYmd = localYmd(weekEnd)
      const ai = parseTendProposals(data, validIds, { dateWindow: { minYmd: todayYmd, maxYmd } })
      setProposals((current) => {
        const covered = new Set(current.flatMap((p) => touchedIds(p).map((id) => `${p.kind}:${id}`)))
        const fresh = ai.filter((p) => !touchedIds(p).some((id) => covered.has(`${p.kind}:${id}`)))
        return [...current, ...fresh]
      })
    })
  }, [pool, carryOver, weekStartYmd, todayYmd, busy, projectNameFor])

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
