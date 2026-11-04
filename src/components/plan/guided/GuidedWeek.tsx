// The Week page while a guided session runs: planning is a ribbon on the same
// page (Scott, 2026-11-04). The band lies across the top of the week with the
// week's count; each step drives the week's own fold (the month beside it),
// the look back turns that sheet to last week with its choices, and a step
// with its own editor shows it in the card under the band. The step's header
// and the conversation are the shell's (useGuidedWeek registers them); this
// is the page's part.

import type { ReactNode } from 'react'
import { stepsFor } from '@/lib/guide/steps'
import type { GuideProgress } from '@/lib/guide/progress'
import { GuideRibbon } from '@/components/guide/GuideRibbon'
import type { SessionFold } from './GuidedPeriod'
import { WEEK_COUNT_OF, weekStepTitle } from './useGuidedWeek'
import '@/components/guide/guide.css'

export function GuidedWeek({ canvas, bodies, count, monthWord, progress, saveError, onJump, onNext, onFinish, onLeave }: {
  /** The week itself, without its strip, drawn with the fold the current
   *  step asks for. */
  canvas: ReactNode | ((fold: SessionFold) => ReactNode)
  /** What each step shows, by step id: the look back's in the sheet beside
   *  the week, a step with its own editor's in the card under the band. */
  bodies: Partial<Record<string, ReactNode>>
  /** The week's count (useGuidedWeek), stated, never enforced. */
  count: number
  /** The month above ("November"), for "Read November". */
  monthWord: string
  progress: GuideProgress
  /** Where the session is could not be saved. */
  saveError?: string | null
  onJump: (id: string) => void
  onNext: () => void
  /** Done planning the week. */
  onFinish: () => void
  /** Leave keeps everything applied and where the session is. */
  onLeave: () => void
}) {
  const steps = stepsFor('week')
  const index = Math.max(0, steps.findIndex((s) => s.id === progress.current))
  const step = steps[index]
  const drives = step.drives
  const fold: SessionFold = {
    stepId: step.id,
    drive: drives ? { above: drives.above || drives.look || undefined } : {},
    look: drives?.look ? bodies[step.id] ?? null : null,
  }
  return (
    <section className="guide-session" aria-label="Planning the week">
      <GuideRibbon level="week" progress={progress} titleFor={(s) => weekStepTitle(s, monthWord)} bodies={bodies}
        onJump={onJump} onNext={onNext} onBack={() => { if (index > 0) onJump(steps[index - 1].id) }}
        onLeave={onLeave} onFinish={onFinish} finishLabel="Done planning the week"
        tab={{ label: 'Plan the week', onPull: onLeave }} status={`${count} of ${WEEK_COUNT_OF} on this week`} error={saveError}>
        {typeof canvas === 'function' ? canvas(fold) : canvas}
      </GuideRibbon>
    </section>
  )
}
