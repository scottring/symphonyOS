// What a period remembers of its planning, in one quiet line:
// "Planned Sun · energy: medium · looked back". Nothing to say, nothing drawn.

import type { GuideNotes } from '@/hooks/usePlanningNotes'
import './guide.css'

function plannedDay(plannedAt?: string): string | null {
  if (!plannedAt) return null
  const d = new Date(plannedAt)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-US', { weekday: 'short' })
}

export function PeriodSummaryLine({ plannedAt, energy, reviewed, onOpen }: {
  plannedAt?: string
  energy?: GuideNotes['energy']
  reviewed?: boolean
  onOpen?: (part: 'review' | 'energy') => void
}) {
  const day = plannedDay(plannedAt)
  const parts: { key: string; text: string; open?: 'review' | 'energy' }[] = []
  if (day) parts.push({ key: 'planned', text: `Planned ${day}` })
  if (energy) parts.push({ key: 'energy', text: `energy: ${energy.level}`, open: 'energy' })
  if (reviewed) parts.push({ key: 'review', text: 'looked back', open: 'review' })
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
