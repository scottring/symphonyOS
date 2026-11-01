// What the current step is for, in three plain lines: Why, You, Guide. "Explain
// more" opens the longer note inline. Step copy is fixed text, never model output.
//
// Compact (the phone page, GuidePhoneHeader): the title and the step buttons,
// with Why, You, Guide and the longer note behind "Explain".

import { useState } from 'react'
import type { GuideLevel, GuideStep } from '@/lib/guide/steps'
import './guide.css'

export interface GuideHeaderProps {
  level: GuideLevel
  step: GuideStep
  /** Zero-based position of the step. */
  index: number
  total: number
  onNext: () => void
  onSkip: () => void
  isLast: boolean
  /** "Done planning the week" */
  finishLabel: string
  onFinish: () => void
  /** On the phone page: Why, You and Guide fold behind "Explain". */
  compact?: boolean
}

export function GuideHeader({ level, step, index, total, onNext, onSkip, isLast, finishLabel, onFinish, compact = false }: GuideHeaderProps) {
  const [more, setMore] = useState(false)
  const lines = (
    <dl className="guide-header-lines">
      <div><dt>Why</dt><dd>{step.why}</dd></div>
      <div><dt>You</dt><dd>{step.you}</dd></div>
      <div><dt>Guide</dt><dd>{step.guide}</dd></div>
    </dl>
  )
  return (
    <header className={`guide-header${compact ? ' is-compact' : ''}`} data-level={level}>
      <div className="guide-header-who">Guide · step {index + 1} of {total}</div>
      <h3 className="guide-header-title">{step.title}</h3>
      {(!compact || more) && lines}
      {more && <p className="guide-header-more">{step.more}</p>}
      <div className="guide-header-actions">
        <button type="button" className="guide-btn" aria-expanded={more} onClick={() => setMore(m => !m)}>
          {more ? 'Show less' : compact ? 'Explain' : 'Explain more'}
        </button>
        {!isLast && <button type="button" className="guide-btn" onClick={onSkip}>Skip this step</button>}
        {isLast
          ? <button type="button" className="guide-btn guide-btn-primary" onClick={onFinish}>{finishLabel}</button>
          : <button type="button" className="guide-btn guide-btn-primary" onClick={onNext}>Next step</button>}
      </div>
    </header>
  )
}
