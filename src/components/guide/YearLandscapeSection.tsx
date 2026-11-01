// The year's 12-month landscape, read-only on the Year page (spec 2026-11-01):
// a compact grid, one cell per month, a crowded month marked. Nothing renders
// until a month has an entry; editing happens in the session ("Edit").

import { Link } from 'react-router-dom'
import type { GuideNotes } from '@/hooks/usePlanningNotes'
import { CROWDED, entriesOf } from '@/lib/guide/landscape'
import './guide.css'

const MONTHS = Array.from({ length: 12 }, (_, i) => new Date(2000, i, 1).toLocaleDateString('en-US', { month: 'long' }))

export function YearLandscapeSection({ value, editTo }: {
  value?: GuideNotes['landscape']
  /** The session on the Landscape step; omitted where the year can no longer be planned. */
  editTo?: string
}) {
  const textOf = (m: number) => value?.find((x) => x.month === m)?.text ?? ''
  if (!MONTHS.some((_, i) => textOf(i + 1).trim())) return null
  return (
    <section className="guide-yv" aria-label="Landscape">
      <div className="guide-yv-top">
        <h3 className="guide-yv-title">Landscape</h3>
        {editTo && <Link to={editTo} className="canvas-link">Edit</Link>}
      </div>
      <ul className="guide-yl" aria-label="The 12 months">
        {MONTHS.map((name, i) => {
          const lines = textOf(i + 1).split('\n').map((l) => l.trim()).filter(Boolean)
          const crowded = entriesOf(textOf(i + 1)) >= CROWDED
          return <li key={name} className="guide-yl-month" aria-label={name} data-crowded={crowded || undefined}>
            <span className="guide-yl-head">
              <span className="guide-yl-name" aria-hidden="true">{name.slice(0, 3)}</span>
              {crowded && <span className="guide-yl-crowded">Crowded</span>}
            </span>
            {lines.length > 0 && <ul className="guide-yl-lines">{lines.map((l, j) => <li key={j}>{l}</li>)}</ul>}
          </li>
        })}
      </ul>
    </section>
  )
}
