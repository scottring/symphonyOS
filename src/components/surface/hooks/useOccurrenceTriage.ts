// src/components/surface/hooks/useOccurrenceTriage.ts
//
// The triage contract's writers for ONE routine occurrence — the one on
// `date` — for the routine's detail panel. The panel is drawn by the shell,
// outside Today's ScheduleActionsProvider, so it writes through the same
// instance writers that provider's onMoveRoutineToDay / onPushRoutine /
// onSkipRoutine use (useActionableInstances: a one-day override, a skipped
// instance, a done instance) and reports through the shell's activity strip:
// saved with Undo once stored, "Didn't save" with Retry otherwise. The
// routine's rule, its other occurrences and its settings are never touched.

import { useCallback, useEffect, useState } from 'react'
import type { Routine } from '@/types/actionable'
import type { TriageWhen } from '@/lib/triage/contract'
import { dayForWhen } from '@/lib/triage/applyWhen'
import { dayLabel } from '@/lib/triage/periods'
import { useActionableInstances } from '@/hooks/useActionableInstances'
import { useCanvasActivity } from '@/contexts/CanvasActivityContext'
import { onInstancesChanged } from '@/lib/instancesChangedSignal'

type Opts = { ids: string[]; undo?: () => Promise<boolean | void>; retry?: () => void }

export interface OccurrenceTriage {
  /** This occurrence is done (its instance on `date`). Null while unknown. */
  completed: boolean | null
  onPickWhen: (when: TriageWhen, day?: Date) => void
  onPickDate: (at: Date, isAllDay: boolean) => void
  onComplete: () => void
}

export function useOccurrenceTriage(routine: Pick<Routine, 'id' | 'name' | 'time_of_day'>, date: Date): OccurrenceTriage {
  const { reschedule, undoReschedule, markDone, undoDone, getInstance } = useActionableInstances()
  const { run } = useCanvasActivity()
  const { id, name } = routine
  const key = date.toDateString()

  // Done or not, for Complete / Reopen — re-read whenever an instance changes.
  const [status, setStatus] = useState<{ key: string; done: boolean } | null>(null)
  useEffect(() => {
    let live = true
    const read = async () => {
      const instance = await getInstance('routine', id, new Date(date.getFullYear(), date.getMonth(), date.getDate()))
      if (live) setStatus({ key: `${id}:${key}`, done: instance?.status === 'completed' })
    }
    void read()
    const stop = onInstancesChanged(() => { void read() })
    return () => { live = false; stop() }
    // `date` is read through `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, key, getInstance])
  const completed = status?.key === `${id}:${key}` ? status.done : null

  /** One occurrence to `at`; `dayOnly` keeps the routine's own time (or none). */
  const move = useCallback(function attempt(at: Date, dayOnly: boolean) {
    const opts: Opts = { ids: [id], retry: () => attempt(at, dayOnly) }
    const when = dayOnly ? dayLabel(at) : `${dayLabel(at)}, ${at.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
    void run(`Move "${name}" this time to ${when}`, async () => {
      const previous = await reschedule('routine', id, date, at, dayOnly ? { dayOnly: true } : undefined)
      if (previous) opts.undo = async () => { await undoReschedule(previous) }
      return !!previous
    }, opts)
  }, [id, name, date, run, reschedule, undoReschedule])

  /** To another DAY, keeping the routine's time (onMoveRoutineToDay's rule). */
  const toDay = useCallback((day: Date) => {
    const [h, m] = (routine.time_of_day ?? '').split(':').map(Number)
    const timed = Number.isFinite(h) && Number.isFinite(m)
    move(new Date(day.getFullYear(), day.getMonth(), day.getDate(), timed ? h : 0, timed ? m : 0), !timed)
  }, [routine.time_of_day, move])

  const onPickWhen = useCallback((when: TriageWhen, day?: Date) => {
    if (when === 'tonight' && !day) { const at = dayForWhen('tonight'); if (at) move(at, false); return }
    const target = day ?? dayForWhen(when)
    if (target) toDay(target)
  }, [move, toDay])

  const onPickDate = useCallback((at: Date, isAllDay: boolean) => {
    if (isAllDay) toDay(at)
    else move(at, false)
  }, [toDay, move])

  const onComplete = useCallback(function attempt() {
    const done = !completed
    void run(done ? `Done: "${name}" · ${dayLabel(date)}` : `Reopen "${name}" · ${dayLabel(date)}`,
      () => (done ? markDone('routine', id, date) : undoDone('routine', id, date)),
      { ids: [id], undo: () => (done ? undoDone('routine', id, date) : markDone('routine', id, date)), retry: attempt })
  }, [completed, id, name, date, run, markDone, undoDone])

  return { completed, onPickWhen, onPickDate, onComplete }
}
