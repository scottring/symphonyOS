// What a period remembers of its planning, in one quiet line:
// "Planned Mon, Nov 2 · Last week’s review · Energy: medium". Nothing to say, nothing drawn.

import type { GuideNotes } from '@/hooks/usePlanningNotes'
import './guide.css'

function plannedDay(plannedAt?: string): string | null {
  if (!plannedAt) return null
  const d = new Date(plannedAt)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

export type SummaryLevel = 'day' | 'week' | 'month' | 'season' | 'year'

const REVIEW_LABEL: Record<SummaryLevel, string> = {
  day: 'Yesterday’s review', week: 'Last week’s review', month: 'Last month’s review',
  season: 'Last season’s review', year: 'Last year’s review',
}

export function PeriodSummaryLine({ plannedAt, energy, reviewed, level, onOpen }: {
  plannedAt?: string
  energy?: GuideNotes['energy']
  reviewed?: boolean
  level: SummaryLevel
  onOpen?: (part: 'review' | 'energy') => void
}) {
  const day = plannedDay(plannedAt)
  const parts: { key: string; text: string; open?: 'review' | 'energy' }[] = []
  if (day) parts.push({ key: 'planned', text: `Planned ${day}` })
  if (reviewed) parts.push({ key: 'review', text: REVIEW_LABEL[level], open: 'review' })
  if (energy) parts.push({ key: 'energy', text: `Energy: ${energy.level}`, open: 'energy' })
  if (parts.length === 0) return null

  return (
    <p className="guide-summary-line">
      {parts.map((p, i) => (
        <span key={p.key}>
          {i > 0 && ' · '}
          {p.open && onOpen
            ? <button type="button" className="guide-summary-part" onClick={() => onOpen(p.open!)}>{p.text}</button>
            : p.text}
        </span>
      ))}
    </p>
  )
}
