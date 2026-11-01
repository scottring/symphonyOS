// The year's vision, read-only on the Year page (spec 2026-11-01): the two
// answers from the Vision step, in Scott's own words. Nothing renders until
// one is written; editing happens in the session ("Edit" opens it on that step).

import { Link } from 'react-router-dom'
import type { GuideNotes } from '@/hooks/usePlanningNotes'
import './guide.css'

/** Whether a vision has anything written (the page and the section agree). */
export function hasVision(value?: GuideNotes['vision']): boolean {
  return !!value?.tenYears?.trim() || !!value?.success?.trim()
}

export function YearVisionSection({ value, yearWord, editTo }: {
  value?: GuideNotes['vision']
  /** "2027" */
  yearWord: string
  /** The session on the Vision step; omitted where the year can no longer be planned. */
  editTo?: string
}) {
  if (!hasVision(value)) return null
  const tenYears = value?.tenYears?.trim() ?? ''
  const success = value?.success?.trim() ?? ''
  return (
    <section className="guide-yv" aria-label="Vision">
      <div className="guide-yv-top">
        <h3 className="guide-yv-title">Vision</h3>
        {editTo && <Link to={editTo} className="canvas-link">Edit</Link>}
      </div>
      {tenYears && <>
        <h4 className="guide-yv-h">An ordinary day ten years from now</h4>
        <p className="guide-yv-text">{tenYears}</p>
      </>}
      {success && <>
        <h4 className="guide-yv-h">What would make {yearWord} a success</h4>
        <p className="guide-yv-text">{success}</p>
      </>}
    </section>
  )
}
