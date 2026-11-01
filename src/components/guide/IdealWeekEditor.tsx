// Editing Season's ideal week. Rows of label / hours / optional goal / optional
// when, under the 168-hour bar. Nothing is pre-filled or suggested: every label and
// number is typed. A change is committed on Enter or when a field loses focus,
// never per keystroke.

import { useId, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { formatHours, parseDuration, type IdealWeek } from '@/lib/guide/idealWeek'
import { IdealWeekBar, IdealWeekLeft, type IdealWeekGoal } from './IdealWeekSection'
import './guide.css'

type Block = IdealWeek['blocks'][number]

const enterBlurs = (e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') e.currentTarget.blur() }

function BlockFields({ initial, goals, onCommit, onRemove, fresh }: {
  initial: Block | null
  goals: IdealWeekGoal[]
  /** Return true when the row was accepted (a new row then clears). */
  onCommit: (b: Omit<Block, 'id'>) => boolean
  onRemove?: () => void
  fresh?: boolean
}) {
  const [label, setLabel] = useState(initial?.label ?? '')
  const [hours, setHours] = useState(initial ? formatHours(initial.hours) : '')
  const [goalId, setGoalId] = useState(initial?.goalId ?? '')
  const [when, setWhen] = useState(initial?.when ?? '')
  const [bad, setBad] = useState(false)
  const [seen, setSeen] = useState(initial)
  if (initial !== seen) {
    setSeen(initial)
    setLabel(initial?.label ?? ''); setHours(initial ? formatHours(initial.hours) : '')
    setGoalId(initial?.goalId ?? ''); setWhen(initial?.when ?? ''); setBad(false)
  }
  const name = initial?.label || 'new block'

  const commit = (over: Partial<{ label: string; goalId: string; when: string }> = {}) => {
    const l = (over.label ?? label).trim()
    const h = parseDuration(hours)
    if (hours.trim() && h === null) { setBad(true); return }
    setBad(false)
    if (!l || h === null) {
      if (!fresh && initial) { setLabel(initial.label); setHours(formatHours(initial.hours)) }
      return
    }
    const g = over.goalId ?? goalId, w = (over.when ?? when).trim()
    const accepted = onCommit({ label: l, hours: h, ...(g ? { goalId: g } : {}), ...(w ? { when: w } : {}) })
    if (accepted && fresh) { setLabel(''); setHours(''); setGoalId(''); setWhen('') }
  }
  // Leaving one field of a half-typed new row must not wipe the others.
  return (
    <li className="guide-iw-edit-row" data-fresh={fresh || undefined}>
      <input type="text" className="guide-iw-in guide-iw-in-label" aria-label={`Label for ${name}`} placeholder="Label"
        value={label} onChange={e => setLabel(e.target.value)} onBlur={() => commit()} onKeyDown={enterBlurs} />
      <input type="text" inputMode="decimal" className="guide-iw-in guide-iw-in-hours" aria-label={`Hours for ${name}`} placeholder="Hours per week"
        aria-invalid={bad || undefined} value={hours} onChange={e => setHours(e.target.value)} onBlur={() => commit()} onKeyDown={enterBlurs} />
      <select className="guide-iw-in guide-iw-in-goal" aria-label={`Goal for ${name}`} value={goalId}
        onChange={e => { setGoalId(e.target.value); commit({ goalId: e.target.value }) }}>
        <option value="">Not a goal</option>
        {goals.map(g => <option key={g.id} value={g.id}>{g.title}</option>)}
        {goalId && !goals.some(g => g.id === goalId) && <option value={goalId}>(goal no longer here)</option>}
      </select>
      <input type="text" className="guide-iw-in guide-iw-in-when" aria-label={`When for ${name}`} placeholder="When (optional)"
        value={when} onChange={e => setWhen(e.target.value)} onBlur={() => commit()} onKeyDown={enterBlurs} />
      {onRemove
        ? <button type="button" className="guide-areas-icon" aria-label={`Remove ${name}`} onClick={onRemove}><Trash2 size={15} aria-hidden="true" /></button>
        : <span className="guide-iw-spacer" aria-hidden="true" />}
      {bad && <span className="guide-iw-bad" role="alert">Try 3h 45m, 3.75, or 3 × 1h 15m</span>}
    </li>
  )
}

export interface IdealWeekEditorProps {
  value: IdealWeek
  goals: IdealWeekGoal[]
  onChange: (w: IdealWeek) => void
}

export function IdealWeekEditor({ value, goals, onChange }: IdealWeekEditorProps) {
  const uid = useId()
  const update = (id: string, b: Omit<Block, 'id'>) => {
    const old = value.blocks.find(x => x.id === id)
    if (old && old.label === b.label && old.hours === b.hours && old.goalId === b.goalId && old.when === b.when) return true
    onChange({ blocks: value.blocks.map(x => (x.id === id ? { id, ...b } : x)) })
    return true
  }
  const add = (b: Omit<Block, 'id'>) => {
    onChange({ blocks: [...value.blocks, { id: `${uid}-${value.blocks.length}-${Date.now().toString(36)}`, ...b }] })
    return true
  }
  return (
    <div className="guide-iw guide-iw-editor">
      <div className="guide-iw-top"><IdealWeekLeft value={value} /></div>
      <IdealWeekBar value={value} />
      <ul className="guide-iw-edit-list" aria-label="Ideal week blocks">
        {value.blocks.map(b => (
          <BlockFields key={b.id} initial={b} goals={goals}
            onCommit={nb => update(b.id, nb)} onRemove={() => onChange({ blocks: value.blocks.filter(x => x.id !== b.id) })} />
        ))}
        <BlockFields key="new" initial={null} goals={goals} fresh onCommit={add} />
      </ul>
    </div>
  )
}
