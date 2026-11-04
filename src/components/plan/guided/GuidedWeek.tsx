// The Week page while a guided session runs: planning is a few tooltips on
// the same page (Scott, 2026-11-04). The plan chip in the header shows where
// the session is; each step is one tooltip (GuideCoach) pointing at the real
// thing on the week, and drives the week's own fold (the month beside it).
// The look back turns that sheet to last week with its choices. The step's
// header and the conversation are the shell's (useGuidedWeek registers them;
// it never opens by itself); this is the page's part.

import type { ReactNode } from 'react'
import { stepsFor } from '@/lib/guide/steps'
import type { GuideProgress } from '@/lib/guide/progress'
import { GuideCoach } from '@/components/guide/GuideCoach'
import type { SessionFold } from './GuidedPeriod'
import { weekStepTitle } from './useGuidedWeek'
import '@/components/guide/guide.css'

export function GuidedWeek({ canvas, look, monthWord, progress, saveError, onJump, onNext, onFinish, onLeave }: {
  /** The week itself, without its strip, drawn with the fold the current
   *  step asks for. */
  canvas: ReactNode | ((fold: SessionFold) => ReactNode)
  /** The look back, drawn in the sheet beside the week on its step. No other
   *  step draws a card: each has a permanent place on the week (2026-11-04). */
  look: ReactNode
  /** The month above ("November"), for "Read November". */
  monthWord: string
  progress: GuideProgress
  /** Where the session is could not be saved. */
  saveError?: string | null
  onJump: (id: string) => void
  onNext: () => void
  /** Done planning the week. */
  onFinish: () => void
  /** Stop planning keeps everything applied and where the session is. */
  onLeave: () => void
}) {
  const steps = stepsFor('week')
  const index = Math.max(0, steps.findIndex((s) => s.id === progress.current))
  const step = steps[index]
  const drives = step.drives
  const fold: SessionFold = {
    stepId: step.id,
    drive: drives ? { above: drives.above || drives.look || undefined } : {},
    look: drives?.look ? look : null,
    write: !!drives?.write,
  }
  return (
    <section className="guide-session" aria-label="Planning the week">
      {typeof canvas === 'function' ? canvas(fold) : canvas}
      <GuideCoach level="week" current={progress.current} word="the week" titleFor={(s) => weekStepTitle(s, monthWord)}
        onNext={onNext} onBack={() => { if (index > 0) onJump(steps[index - 1].id) }}
        onStop={onLeave} onFinish={onFinish} error={saveError} />
    </section>
  )
}
