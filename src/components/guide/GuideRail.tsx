// The steps of a guided session, down the left of the page (a row of chips on a
// phone). The current step opens to show its body; tapping any other step shows
// what it is for, with a way to go there. Presentational: progress comes in.

import { useState, type ReactNode } from 'react'
import { Check } from 'lucide-react'
import { stepsFor, type GuideLevel, type GuideStep } from '@/lib/guide/steps'
import type { GuideProgress } from '@/lib/guide/progress'
import './guide.css'

export function GuideRail({ level, progress, titleFor, bodies, onJump }: {
  level: GuideLevel
  progress: GuideProgress
  titleFor?: (s: GuideStep) => string
  bodies: Partial<Record<string, ReactNode>>
  onJump: (id: string) => void
}) {
  const steps = stepsFor(level)
  const [viewing, setViewing] = useState<string | null>(null)
  const viewed = viewing && viewing !== progress.current ? steps.find(s => s.id === viewing) : undefined

  const stateOf = (id: string) =>
    id === progress.current ? 'current'
      : progress.done.includes(id) ? 'done'
        : progress.skipped.includes(id) ? 'skipped'
          : 'todo'

  return (
    <div className="guide-rail" role="group" aria-label="Steps in this session">
      <ol className="guide-rail-list">
        {steps.map((s, i) => {
          const state = stateOf(s.id)
          const isViewed = viewed?.id === s.id
          return (
            <li
              key={s.id}
              className="guide-rail-item"
              data-state={state}
              data-viewing={isViewed || undefined}
              aria-current={state === 'current' ? 'step' : undefined}
            >
              <button
                type="button"
                className="guide-rail-step"
                onClick={() => setViewing(isViewed || state === 'current' ? null : s.id)}
              >
                <span className="guide-rail-mark" aria-hidden="true">
                  {state === 'done' ? <Check size={12} strokeWidth={2.5} /> : i + 1}
                </span>
                <span className="guide-rail-title">{titleFor ? titleFor(s) : s.title}</span>
                <span className="guide-rail-meta">
                  {state === 'skipped' ? 'Skipped' : `${s.minutes} min`}
                </span>
              </button>
              {isViewed && (
                <div className="guide-rail-peek">
                  <p>{s.why}</p>
                  <button type="button" className="guide-btn" onClick={() => { setViewing(null); onJump(s.id) }}>
                    Go to this step
                  </button>
                </div>
              )}
            </li>
          )
        })}
      </ol>
      <div className="guide-rail-body">{bodies[progress.current]}</div>
    </div>
  )
}
