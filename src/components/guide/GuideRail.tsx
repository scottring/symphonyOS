// The steps of a guided session, down the left of the page (a row of chips on a
// phone). The current step opens to show its body; tapping any other step shows
// what it is for, with a way to go there. Presentational: progress comes in.
// On a phone the chips scroll sideways, so the current one is brought into
// view whenever the step changes (and on arrival, when a session resumes).

import { useEffect, useRef, useState, type ReactNode } from 'react'
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
  const [at, setAt] = useState(progress.current)
  if (at !== progress.current) {
    setAt(progress.current)
    setViewing(null)
  }
  const viewed = viewing && viewing !== progress.current ? steps.find(s => s.id === viewing) : undefined

  // The chip row is the phone layout (guide.css, max-width 760px).
  const listRef = useRef<HTMLOListElement>(null)
  const current = progress.current
  useEffect(() => {
    if (typeof window.matchMedia !== 'function' || !window.matchMedia('(max-width: 760px)').matches) return
    listRef.current?.querySelector('[data-state="current"]')?.scrollIntoView?.({ inline: 'nearest', block: 'nearest' })
  }, [current])

  const stateOf = (id: string) =>
    id === progress.current ? 'current'
      : progress.done.includes(id) ? 'done'
        : progress.skipped.includes(id) ? 'skipped'
          : 'todo'

  return (
    <div className="guide-rail" role="group" aria-label="Steps in this session">
      <ol className="guide-rail-list" ref={listRef}>
        {steps.map((s, i) => {
          const state = stateOf(s.id)
          const isViewed = viewed?.id === s.id
          return (
            <li
              key={s.id}
              className="guide-rail-item"
              data-state={state}
              data-viewing={isViewed || undefined}
            >
              <button
                type="button"
                className="guide-rail-step"
                aria-current={state === 'current' ? 'step' : undefined}
                onClick={() => setViewing(isViewed || state === 'current' ? null : s.id)}
              >
                <span className="guide-rail-mark" aria-hidden="true">
                  {state === 'done' ? <Check size={12} strokeWidth={2.5} /> : i + 1}
                </span>
                <span className="guide-rail-title">{titleFor ? titleFor(s) : s.title}</span>
                {(state === 'done' || state === 'skipped') && <span className="guide-sr-only"> ({state})</span>}
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
