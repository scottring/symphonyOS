// How energy is today (or this week): high, medium or low, with an optional word
// or two. A note beside the period; nothing else changes because of it.

import { useId, useState } from 'react'
import type { GuideNotes } from '@/hooks/usePlanningNotes'
import './guide.css'

type Energy = NonNullable<GuideNotes['energy']>
const LEVELS: { level: Energy['level']; label: string }[] = [
  { level: 'high', label: 'High' },
  { level: 'medium', label: 'Medium' },
  { level: 'low', label: 'Low' },
]

export function EnergyNote({ value, onChange }: {
  value?: GuideNotes['energy']
  onChange: (v: Energy) => void
}) {
  const name = useId()
  const [words, setWords] = useState(value?.words ?? '')
  // Follow the saved note: another period, or the note loading after mount.
  const [seen, setSeen] = useState(value?.words ?? '')
  if ((value?.words ?? '') !== seen) {
    setSeen(value?.words ?? '')
    setWords(value?.words ?? '')
  }
  const pick = (level: Energy['level']) => {
    const w = words.trim()
    onChange(w ? { level, words: w } : { level })
  }
  const saveWords = () => {
    if (!value) return
    const w = words.trim()
    if (w === (value.words ?? '')) return
    onChange(w ? { level: value.level, words: w } : { level: value.level })
  }
  return (
    <div className="guide-energy">
      <div role="radiogroup" aria-label="Energy" className="guide-energy-levels">
        {LEVELS.map(l => (
          <label key={l.level} className="guide-energy-level" data-checked={value?.level === l.level || undefined}>
            <input
              type="radio"
              name={name}
              checked={value?.level === l.level}
              onChange={() => pick(l.level)}
            />
            {l.label}
          </label>
        ))}
      </div>
      <input
        type="text"
        className="guide-energy-words"
        aria-label="In a few words (optional)"
        disabled={!value}
        placeholder="In a few words, if you like"
        value={words}
        onChange={e => setWords(e.target.value)}
        onBlur={saveWords}
      />
    </div>
  )
}
