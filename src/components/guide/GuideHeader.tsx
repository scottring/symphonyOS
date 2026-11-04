// What the current step is for, in three plain lines: Why, You, Guide. "Explain
// more" opens the longer note inline. Step copy is fixed text, never model output.
// It tops the session's conversation. The planning ribbon's band owns the
// session's navigation (Back, Next, Done planning, Leave): one Next, on the
// page, never a second one here (fix round 1, 2026-11-04).

import { useState } from 'react'
import type { GuideLevel, GuideStep } from '@/lib/guide/steps'
import './guide.css'

export interface GuideHeaderProps {
  level: GuideLevel
  step: GuideStep
  /** Zero-based position of the step. */
  index: number
  total: number
}

export function GuideHeader({ level, step, index, total }: GuideHeaderProps) {
  const [more, setMore] = useState(false)
  const lines = (
    <dl className="guide-header-lines">
      <div><dt>Why</dt><dd>{step.why}</dd></div>
      <div><dt>You</dt><dd>{step.you}</dd></div>
      <div><dt>Guide</dt><dd>{step.guide}</dd></div>
    </dl>
  )
  return (
    <header className="guide-header" data-level={level}>
      <div className="guide-header-who">Guide · step {index + 1} of {total}</div>
      <h3 className="guide-header-title">{step.title}</h3>
      {lines}
      {more && <p className="guide-header-more">{step.more}</p>}
      <div className="guide-header-actions">
        <button type="button" className="guide-btn" aria-expanded={more} onClick={() => setMore(m => !m)}>
          {more ? 'Show less' : 'Explain more'}
        </button>
      </div>
    </header>
  )
}
