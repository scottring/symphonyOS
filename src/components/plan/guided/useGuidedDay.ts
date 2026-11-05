// The Day's guided session (spec 2026-11-01): where Scott is in it and the
// session's registration with the shell (its step header above the
// conversation, its own thread, the step on every turn). The Week's
// (useGuidedWeek) one level down.
//
// Planned (per person) once anything is applied at the pick step: a pick or
// a Done that saves, a placement saved on the page itself, or a change
// card's Apply, whichever comes first.

import { createElement, useCallback, useEffect, useMemo, useRef } from 'react'
import { useGuidedProgress } from '@/hooks/useGuidedProgress'
import { useOpenOnStep } from '@/hooks/useOpenOnStep'
import { stepIn, stepsFor } from '@/lib/guide/steps'
import { DAY_COUNT_OF, dayStepTitle, dayWords } from '@/lib/guide/dayTarget'
import { dayToken } from '@/hooks/usePlanningSession'
import { useGuidedSessionRegistration, type GuidedSessionRegistration } from '@/contexts/GuidedSessionContext'
import { GuideHeader } from '@/components/guide/GuideHeader'

const CHOOSING = stepsFor('day').find((s) => s.choosing)!.id

export function useGuidedDay({ target, isTomorrow, count, onFinish, onClose, onPlanned }: {
  /** The day being planned. */
  target: Date
  isTomorrow: boolean
  /** The day's count, as the page shows it (dayCount); null while the page
   *  shows the day looked back on. */
  count: number | null
  /** The day's closing writes; false keeps the session open. */
  onFinish: () => Promise<boolean>
  /** Leave the session (the page comes back as it is every day). */
  onClose: () => void
  /** The day was just marked planned (the page re-reads its planned mark). */
  onPlanned?: () => void
}) {
  const token = dayToken(target)
  const { progress, loading, saveError, next, jump, markPlanned, finish, setThreadId } = useGuidedProgress('day', token)
  useOpenOnStep('day', loading, jump)
  const steps = stepsFor('day')
  const dayWord = isTomorrow ? 'tomorrow' : 'today'

  const latest = useRef({ progress, onFinish, onClose, onPlanned })
  useEffect(() => { latest.current = { progress, onFinish, onClose, onPlanned } })

  // Once per session: the first write applied at the pick step. A mark that
  // did not save lets the next applied write try again.
  const planning = useRef(false)
  const markPlannedOnce = useCallback(async () => {
    const p = latest.current.progress
    if (loading || p.current !== CHOOSING || p.plannedAt || planning.current) return
    planning.current = true
    if (await markPlanned()) latest.current.onPlanned?.()
    else planning.current = false
  }, [loading, markPlanned])

  // Done planning the day: the closing writes, then the session's own
  // finish, then back to the page. A failed closing write keeps it open.
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

  const registration = useMemo<GuidedSessionRegistration | null>(() => {
    if (loading) return null
    const index = Math.max(0, steps.findIndex((s) => s.id === progress.current))
    const step = steps[index]
    const stepTitle = dayStepTitle(step, isTomorrow)
    const periodLabel = target.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
    return {
      level: 'day', periodLabel, token, stepId: step.id,
      header: createElement(GuideHeader, {
        level: 'day', step: stepIn(step, dayWords(isTomorrow)), index, total: steps.length,
      }),
      sessionContext: {
        horizon: 'daily', periodLabel, stepId: step.id, stepTitle,
        guide: {
          level: 'day', stepId: step.id, stepTitle, writes: step.writes, aboveLines: [],
          // The day files tasks under no life area: none are sent, so the
          // guide neither sets area_id nor asks about an area (guidePromptBlock).
          areas: [],
          counts: count === null ? undefined : { label: `tasks on ${dayWord}`, n: count, of: DAY_COUNT_OF },
        },
      },
      threadKey: `daily:${token}`,
      onThread: (id) => { void setThreadId(id) },
      threadId: progress.threadId,
      onApplied: () => { void markPlannedOnce() },
    }
  }, [loading, steps, progress, isTomorrow, target, token, dayWord, count, setThreadId, markPlannedOnce])
  useGuidedSessionRegistration(registration)

  return { progress, loading, saveError, markPlannedOnce, jump, next, done, registration }
}
