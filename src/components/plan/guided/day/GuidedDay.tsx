// Today while a Day session runs: planning is a few tooltips on the same page
// (Scott, 2026-11-04). The plan chip in the header shows where the session
// is; each step is one tooltip (GuideCoach) pointing at the real thing on the
// day, which stays exactly as it is every day. Pick and Habits open the week
// beside the day (steps.ts `drives`; TodayView drives the fold). The step's
// header and the conversation are the shell's (useGuidedDay registers them;
// it never opens by itself).
//
// Morning: plans today and looks back on yesterday. From 4 pm: plans tomorrow
// and looks back on today (dayTarget). Mounted only while it runs.

import { useEffect, type ReactNode } from 'react'
import { dayCount, dayStepTitle } from '@/lib/guide/dayTarget'
import { stepsFor } from '@/lib/guide/steps'
import { GuideCoach, usePlanSessionLoading } from '@/components/guide/GuideCoach'
import { useGuidedDay } from '../useGuidedDay'
import type { DayPictureItem } from './DayRows'
import type { DayActions } from '@/lib/planning/dayActions'
import '@/components/guide/guide.css'

export function GuidedDay({ target, isTomorrow, canvas, dayItems, onStep, actions, listenPlacements, onFinish, onClose, onPlanned }: {
  /** The day being planned (dayTarget). */
  target: Date
  isTomorrow: boolean
  /** The day itself: the page as it is every day. */
  canvas: ReactNode
  /** The day being planned as the page shows it, under its filters: the
   *  count the guide is told. Null while the page shows the day looked back
   *  on (the look back step): no count then. */
  dayItems: readonly DayPictureItem[] | null
  /** The current step, once the session's place has loaded: the page shows
   *  the day that step is about, and opens what it asks for. */
  onStep?: (stepId: string) => void
  /** The page's writers, each taking the day it acts on. */
  actions: DayActions
  /** Placements saved on the page itself (a task dragged onto the day, + on
   *  the week beside it): on the pick step they mark the day planned. Returns
   *  the unsubscribe. */
  listenPlacements?: (listener: () => void) => () => void
  /** The page's closing write (the day stamped planned); false keeps the
   *  session open. */
  onFinish: () => Promise<boolean>
  onClose: () => void
  onPlanned?: () => void
}) {
  const count = dayItems ? dayCount(dayItems) : null
  const guided = useGuidedDay({ target, isTomorrow, count, actions, onFinish, onClose, onPlanned })
  const { markPlannedOnce } = guided
  usePlanSessionLoading('day', guided.loading)
  const stepNow = guided.loading ? null : guided.progress.current
  useEffect(() => { if (stepNow) onStep?.(stepNow) }, [stepNow, onStep])
  useEffect(() => listenPlacements?.(() => { void markPlannedOnce() }), [listenPlacements, markPlannedOnce])

  const dayWord = isTomorrow ? 'tomorrow' : 'today'
  const steps = stepsFor('day')
  const index = Math.max(0, steps.findIndex((s) => s.id === guided.progress.current))

  // Where the session is comes first: no flash of step one before a resume.
  // The day stays put while it loads.
  if (guided.loading) return <section className="guide-session" aria-label={`Planning ${dayWord}`} aria-busy="true">{canvas}</section>
  return (
    <section className="guide-session" aria-label={`Planning ${dayWord}`}>
      {canvas}
      <GuideCoach level="day" current={guided.progress.current} word={dayWord} titleFor={(s) => dayStepTitle(s, isTomorrow)}
        onNext={() => { void guided.next() }} onBack={() => { if (index > 0) void guided.jump(steps[index - 1].id) }}
        onStop={onClose} onFinish={() => { void guided.done() }} error={guided.saveError} />
    </section>
  )
}
