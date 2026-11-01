// Planning the season, step 7 (spec 2026-11-01): the wild cards. Four checks
// Scott turns on for the season (saved in the season's notes as `wildCards`).
// The lines each one needs are his to say in the conversation, which files
// them under a goal or a month. Nothing here writes a line or suggests one,
// and no line is tagged with a card: there is no such tag to read back.

import '@/components/guide/guide.css'

const WILD_CARDS = [
  { id: 'money', label: 'Money' },
  { id: 'childcare', label: 'Childcare and camps' },
  { id: 'travel', label: 'Travel' },
  { id: 'house', label: 'The house' },
] as const

export function WildCards({ value, onChange }: {
  /** The cards turned on (ids from WILD_CARDS). */
  value: readonly string[]
  onChange: (cards: string[]) => void
}) {
  const on = new Set(value)
  const toggle = (id: string) => {
    const next = new Set(on)
    if (next.has(id)) next.delete(id); else next.add(id)
    onChange(WILD_CARDS.map((c) => c.id).filter((c) => next.has(c)))
  }
  return <div className="gw-body guide-wild">
    <div role="group" aria-label="Wild cards" className="guide-energy-levels">
      {WILD_CARDS.map((c) => <label key={c.id} className="guide-areas-chip guide-wild-card" data-checked={on.has(c.id) || undefined}>
        <input type="checkbox" checked={on.has(c.id)} onChange={() => toggle(c.id)} />
        {c.label}
      </label>)}
    </div>
    <p className="choose-empty">Say what each one needs in the conversation. It files those lines under a goal or a month.</p>
  </div>
}
