// The Week's guided session (spec 2026-11-01): where Scott is in it, the
// week's count, and the session's registration with the shell (its step
// header above the conversation, its own thread, the step on every turn).
//
// The count is the page's own (WeekViewV2's onThisWeek: the tasks it draws
// for this week, under its filters), handed to the frame, the steps and the
// guide, so no two places disagree.
//
// Planned (per person) once anything is applied at the choosing step: a
// Choose verb or a change card's Apply, whichever comes first.

import { createElement, useCallback, useEffect, useMemo, useRef } from 'react'
import { useGuidedProgress } from '@/hooks/useGuidedProgress'
import { useOpenOnStep } from '@/hooks/useOpenOnStep'
import { stepsFor, type GuideStep } from '@/lib/guide/steps'
import { isLastStep } from '@/lib/guide/progress'
import { weekToken } from '@/hooks/usePlanningSession'
import { useGuidedSessionRegistration, type GuidedSessionRegistration } from '@/contexts/GuidedSessionContext'
import { GuideHeader } from '@/components/guide/GuideHeader'
import type { WeekChoose } from '@/components/home/week/useChooseWeek'
import type { ChooseItemView, ChooseLineView } from '@/components/plan/choose/ChoosePlan'
import { reporter, reportItem, reportLine } from './reporting'

/** About fifteen tasks a week: stated, never enforced. */
export const WEEK_COUNT_OF = 'about 15'

/** "Read November": the one step titled by the month above. */
export function weekStepTitle(s: GuideStep, monthWord: string): string {
  return s.id === 'read-month' ? `Read ${monthWord}` : s.title
}

/** The same Choose, with every write that succeeds also reported to `applied`. */
export function reportingChoose(choose: WeekChoose, applied: () => void): WeekChoose {
  const wrap = reporter(applied)
  const item = (x: ChooseItemView) => reportItem(x, wrap)
  const line = (l: ChooseLineView) => reportLine(l, wrap)
  return {
    ...choose,
    lines: choose.lines.map(line),
    doneLines: choose.doneLines.map(line),
    loose: choose.loose.map(item),
    onAddLoose: wrap(choose.onAddLoose),
    placeItems: choose.placeItems.map((p) => ({ ...p, onPlace: wrap(p.onPlace) })),
  }
}

const CHOOSING = stepsFor('week').find((s) => s.choosing)!.id

export function useGuidedWeek({ weekStart, count, choose, onFinish, onClose, onPlanned }: {
  weekStart: Date
  /** The week's count: the tasks the page draws on it (deck.onThisWeek). */
  count: number
  choose: WeekChoose
  /** The week's closing writes; false keeps the session open. */
  onFinish: () => Promise<boolean>
  /** Leave the session (the page comes back as it is every day). */
  onClose: () => void
  /** The week was just marked planned (the page re-reads its planned mark). */
  onPlanned?: () => void
}) {
  const token = weekToken(weekStart)
  const { progress, loading, saveError, next, skip, jump, markPlanned, finish, setThreadId } = useGuidedProgress('week', token)
  useOpenOnStep('week', loading, jump)
  const steps = stepsFor('week')
  const monthWord = choose.monthWord

  const latest = useRef({ progress, onFinish, onClose, onPlanned })
  useEffect(() => { latest.current = { progress, onFinish, onClose, onPlanned } })

  // Once per session: the first write applied at the choosing step. A mark
  // that did not save lets the next applied write try again.
  const planning = useRef(false)
  const markPlannedOnce = useCallback(async () => {
    const p = latest.current.progress
    if (loading || p.current !== CHOOSING || p.plannedAt || planning.current) return
    planning.current = true
    if (await markPlanned()) latest.current.onPlanned?.()
    else planning.current = false
  }, [loading, markPlanned])

  const reported = useMemo(() => reportingChoose(choose, () => { void markPlannedOnce() }), [choose, markPlannedOnce])

  // Done planning the week: the closing writes, then the session's own
  // finish, then back to the week. A failed closing write keeps it open.
  const finishing = useRef(false)
  const done = useCallback(async () => {
    if (finishing.current) return
    finishing.current = true
    try {
      if (!(await latest.current.onFinish())) return
      await finish()
      latest.current.onClose()
    } finally { finishing.current = false }
  }, [finish])

  // The month's lines, for the agent, stable while their titles are.
  const linesKey = choose.lines.map((l) => `${l.key}\u0000${l.title}`).join('\u0001')
  const aboveLines = useMemo(() => linesKey ? linesKey.split('\u0001').map((x) => { const [id, title] = x.split('\u0000'); return { id, title } }) : [], [linesKey])

  const registration = useMemo<GuidedSessionRegistration | null>(() => {
    if (loading) return null
    const index = Math.max(0, steps.findIndex((s) => s.id === progress.current))
    const step = steps[index]
    const stepTitle = weekStepTitle(step, monthWord)
    const periodLabel = `Week of ${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
    return {
      level: 'week', periodLabel, token, stepId: step.id,
      header: createElement(GuideHeader, {
        level: 'week', step: { ...step, title: stepTitle }, index, total: steps.length,
        onNext: () => { void next() }, onSkip: () => { void skip() },
        isLast: isLastStep(progress, 'week'), finishLabel: 'Done planning the week', onFinish: () => { void done() },
      }),
      sessionContext: {
        horizon: 'weekly', periodLabel, stepId: step.id, stepTitle,
        aboveTitles: aboveLines.map((l) => l.title),
        guide: {
          level: 'week', stepId: step.id, stepTitle, writes: step.writes, aboveLines,
          // The week files tasks under no life area: none are sent, so the
          // guide neither sets area_id nor asks about an area (guidePromptBlock).
          areas: [],
          counts: { label: 'tasks on this week', n: count, of: WEEK_COUNT_OF },
        },
      },
      threadKey: `weekly:${token}`,
      onThread: (id) => { void setThreadId(id) },
      threadId: progress.threadId,
      onApplied: () => { void markPlannedOnce() },
    }
  }, [loading, steps, progress, monthWord, weekStart, count, token, next, skip, done, aboveLines, setThreadId, markPlannedOnce])
  useGuidedSessionRegistration(registration)

  return { progress, loading, saveError, count, monthWord, choose: reported, markPlannedOnce, jump, next, done, registration }
}
