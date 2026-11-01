// The Week page while a guided session runs (spec 2026-11-01, "one page, two
// moments"): a one-line session bar with the week's count, the steps rail
// where the strip stands, and the same week beside it. The step's header and
// the conversation are the shell's (useGuidedWeek registers them); this is
// the page's part.

import type { ReactNode } from 'react'
import { stepsFor } from '@/lib/guide/steps'
import type { GuideProgress } from '@/lib/guide/progress'
import { GuideRail } from '@/components/guide/GuideRail'
import { SessionBar } from '@/components/guide/SessionBar'
import { GuidePhoneHeader } from '@/components/guide/GuidePhoneHeader'
import { WEEK_COUNT_OF, weekStepTitle } from './useGuidedWeek'
import '@/components/guide/guide.css'

export function GuidedWeek({ canvas, bodies, count, monthWord, progress, saveError, onJump, onLeave }: {
  /** The week itself, without its strip. */
  canvas: ReactNode
  /** What each step shows inside the rail, by step id. */
  bodies: Partial<Record<string, ReactNode>>
  /** The week's count (useGuidedWeek), stated, never enforced. */
  count: number
  /** The month above ("November"), for "Read November". */
  monthWord: string
  progress: GuideProgress
  /** Where the session is could not be saved. */
  saveError?: string | null
  onJump: (id: string) => void
  /** Leave keeps everything applied and where the session is. */
  onLeave: () => void
}) {
  const steps = stepsFor('week')
  const index = Math.max(0, steps.findIndex((s) => s.id === progress.current))
  return (
    <section className="guide-session" aria-label="Planning the week">
      <p className="guide-session-line">
        <SessionBar label="Planning the week" index={index} total={steps.length} onLeave={onLeave} />
        <span className="guide-session-count">{count} of {WEEK_COUNT_OF} on this week</span>
      </p>
      {saveError && <p className="guide-session-error" role="alert">{saveError}</p>}
      <GuidePhoneHeader />
      <div className="guide-session-layout">
        <GuideRail level="week" progress={progress} titleFor={(s) => weekStepTitle(s, monthWord)} bodies={bodies} onJump={onJump} />
        <div className="guide-session-page">{canvas}</div>
      </div>
    </section>
  )
}
