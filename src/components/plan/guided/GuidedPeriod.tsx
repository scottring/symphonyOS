// Month, Season or Year while a guided session runs: planning is a ribbon on
// the same page (Scott, 2026-11-04). The band lies across the top of the
// period's own page (GuideRibbon); each step drives the page's folds (the
// level above, this period's calendar, the write line) instead of showing a
// second layout. The look back turns the sheet above to the period before,
// with its choices; a step with its own editor shows it in the card under the
// band. The step's header and the conversation are the shell's: this
// registers them, as the Week (useGuidedWeek) and the Day (useGuidedDay) do.
//
// Planned (per person) once anything is applied at the level's choosing step
// (Month and Season: by area; Year: the brain dump), the steps that write on
// the sheet itself: a write saved on the page (`listenPageWrites`) or a change
// card's Apply, whichever comes first. Done planning runs the page's
// closing writes, then the session's own finish, then leaves. Leave writes
// nothing and keeps where the session is.
//
// The look back's notes as typed are held here, so they outlive their step's
// body (only the current step's body is drawn); Done hands them to the
// closing writes, which save what is still unsaved.

import { createElement, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useGuidedProgress } from '@/hooks/useGuidedProgress'
import { useOpenOnStep } from '@/hooks/useOpenOnStep'
import { usePlanningNotes, type NotesPatch, type PlanningNotes } from '@/hooks/usePlanningNotes'
import type { ReviewNotes } from '@/hooks/usePeriodReview'
import { HORIZON_OF, choosingStep, stepsFor } from '@/lib/guide/steps'
import { isLastStep } from '@/lib/guide/progress'
import { useGuidedSessionRegistration, type GuidedSessionRegistration } from '@/contexts/GuidedSessionContext'
import { GuideHeader } from '@/components/guide/GuideHeader'
import { GuideRibbon } from '@/components/guide/GuideRibbon'
import type { TaskContext } from '@/types/task'
import '@/components/guide/guide.css'

export type PeriodLevel = 'month' | 'season' | 'year'

/** What the session hands the page's step bodies. */
export interface PeriodSessionTools {
  /** The look back's notes as typed and not yet saved (null: nothing typed). */
  lookDraft: ReviewNotes | null
  setLookDraft: (notes: ReviewNotes | null) => void
  /** This person's notes for the period (the scenery, the energy…) and their save. */
  notes: PlanningNotes
  patch: (p: NotesPatch) => Promise<boolean>
}

/** What the current step asks of the page's folds (PaperFold's `drive`), and
 *  on the look back what the sheet above shows instead of the level above:
 *  the period before, with its choices. */
export interface SessionFold {
  stepId: string | null
  drive: { above?: boolean; calendar?: boolean }
  /** The look back's body, for the sheet above; null on every other step. */
  look: ReactNode | null
}

type Line = { id: string; title: string }
type Area = { id: string; name: string; context: TaskContext | null }
const NONE: readonly never[] = []

export function GuidedPeriod({ level, token, periodLabel, page, bodies, onFinish, onLeave, onPlanned, aboveLines = NONE, areas = NONE, listenPageWrites, plannedAt }: {
  level: PeriodLevel
  /** The period's planning token (monthToken, seasonToken, yearToken). */
  token: string
  /** "November", "Fall", "2027": "Planning November", "Done planning November". */
  periodLabel: string
  /** The period's page itself, without its strip, drawn with the folds the
   *  current step asks for. */
  page: ReactNode | ((fold: SessionFold) => ReactNode)
  /** What each step shows, by step id: the look back's in the sheet above,
   *  a step with its own editor's in the card under the band. */
  bodies: (tools: PeriodSessionTools) => Partial<Record<string, ReactNode>>
  /** The period's closing writes, with the look back's unsaved notes; false
   *  keeps the session open. */
  onFinish: (lookDraft: ReviewNotes | null) => Promise<boolean>
  /** Back to the page as it is every day (Leave, and after Done). */
  onLeave: () => void
  /** The period was just marked planned (the page re-reads its planned mark). */
  onPlanned?: () => void
  /** The level above's lines, for the guide (Month: the season's goals). */
  aboveLines?: readonly Line[]
  /** The viewer's life areas, for the guide. */
  areas?: readonly Area[]
  /** Hear of each placement-type write saved on the page itself; returns the
   *  way to stop listening. */
  listenPageWrites?: (listener: () => void) => () => void
  /** When the period was last marked planned. Planned before this session
   *  opened, the session line says so quietly: it is being planned again. */
  plannedAt?: Date
}) {
  const [openedAt] = useState(() => Date.now())
  const steps = stepsFor(level)
  const CHOOSING = choosingStep(level).id
  const { progress, loading, saveError, next, skip, jump, markPlanned, finish, setThreadId } = useGuidedProgress(level, token)
  useOpenOnStep(level, loading, jump)
  const { notes, patch } = usePlanningNotes(HORIZON_OF[level], token)
  const [lookDraft, setLookDraft] = useState<ReviewNotes | null>(null)

  const latest = useRef({ progress, onFinish, onLeave, onPlanned, lookDraft })
  useEffect(() => { latest.current = { progress, onFinish, onLeave, onPlanned, lookDraft } })

  // Once per session: the first write applied at the choosing step. A mark
  // that did not save lets the next applied write try again.
  const planning = useRef(false)
  const markPlannedOnce = useCallback(async () => {
    const p = latest.current.progress
    if (loading || p.current !== CHOOSING || p.plannedAt || planning.current) return
    planning.current = true
    if (await markPlanned()) latest.current.onPlanned?.()
    else planning.current = false
  }, [loading, markPlanned, CHOOSING])
  useEffect(() => listenPageWrites?.(() => { void markPlannedOnce() }), [listenPageWrites, markPlannedOnce])

  // Done planning: the closing writes, then the session's own finish, then
  // back to the page. A failed closing write keeps it open.
  const finishing = useRef(false)
  const done = useCallback(async () => {
    if (finishing.current) return
    finishing.current = true
    try {
      if (!(await latest.current.onFinish(latest.current.lookDraft))) return
      await finish()
      latest.current.onLeave()
    } finally { finishing.current = false }
  }, [finish])

  // The level above's lines and the areas, for the agent, stable while their
  // text is (the page hands new arrays every render).
  const aboveKey = aboveLines.map((l) => `${l.id}\u0000${l.title}`).join('\u0001')
  const areasKey = areas.map((a) => `${a.id}\u0000${a.name}\u0000${a.context ?? ''}`).join('\u0001')
  const above = useMemo(() => aboveKey ? aboveKey.split('\u0001').map((x) => { const [id, title] = x.split('\u0000'); return { id, title } }) : [], [aboveKey])
  const areaList = useMemo(() => areasKey ? areasKey.split('\u0001').map((x) => {
    const [id, name, context] = x.split('\u0000')
    return { id, name, context: (context || null) as TaskContext | null }
  }) : [], [areasKey])

  const finishLabel = `Done planning ${periodLabel}`
  const registration = useMemo<GuidedSessionRegistration | null>(() => {
    if (loading) return null
    const index = Math.max(0, steps.findIndex((s) => s.id === progress.current))
    const step = steps[index]
    return {
      level, periodLabel, token, stepId: step.id,
      header: createElement(GuideHeader, {
        level, step, index, total: steps.length,
        onNext: () => { void next() }, onSkip: () => { void skip() },
        isLast: isLastStep(progress, level), finishLabel, onFinish: () => { void done() },
      }),
      sessionContext: {
        horizon: HORIZON_OF[level], periodLabel, stepId: step.id, stepTitle: step.title,
        aboveTitles: above.map((l) => l.title),
        guide: { level, stepId: step.id, stepTitle: step.title, writes: step.writes, aboveLines: above, areas: areaList },
      },
      threadKey: `${HORIZON_OF[level]}:${token}`,
      onThread: (id) => { void setThreadId(id) },
      threadId: progress.threadId,
      onApplied: () => { void markPlannedOnce() },
    }
  }, [loading, steps, progress, level, periodLabel, token, finishLabel, next, skip, done, above, areaList, setThreadId, markPlannedOnce])
  useGuidedSessionRegistration(registration)

  const index = Math.max(0, steps.findIndex((s) => s.id === progress.current))
  const drawn = bodies({ lookDraft, setLookDraft, notes, patch })
  const step = loading ? null : steps[index]
  const drives = step?.drives
  const fold: SessionFold = {
    stepId: step?.id ?? null,
    drive: drives ? { above: drives.above || drives.look || undefined, calendar: drives.calendar } : {},
    look: drives?.look ? drawn[step!.id] ?? null : null,
  }
  const word = periodLabel[0].toUpperCase() + periodLabel.slice(1)
  const status = plannedAt && plannedAt.getTime() < openedAt
    ? `${word} was planned ${plannedAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}. You can still change it.`
    : null
  const pageNode = typeof page === 'function' ? page(fold) : page
  // Where the session is comes first: no flash of step one before a resume.
  // The page stays put while it loads.
  if (loading) return <section className="guide-session" aria-label={`Planning ${periodLabel}`} aria-busy="true">{pageNode}</section>
  return (
    <section className="guide-session" aria-label={`Planning ${periodLabel}`}>
      <GuideRibbon level={level} progress={progress} bodies={drawn}
        onJump={(id) => { void jump(id) }} onNext={() => { void next() }}
        onBack={() => { if (index > 0) void jump(steps[index - 1].id) }}
        onLeave={onLeave} onFinish={() => { void done() }} finishLabel={finishLabel}
        tab={{ label: `Plan ${periodLabel}`, onPull: onLeave }} status={status} error={saveError}>
        {pageNode}
      </GuideRibbon>
    </section>
  )
}
