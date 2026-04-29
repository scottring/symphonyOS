import { useState } from 'react'
import type { StandingHabit } from '@/types/meal-planner'

interface Props {
  habit: StandingHabit
  onChange: (patch: { name?: string; slot?: StandingHabit['slot']; gramsHint?: number | null; paused?: boolean }) => void
  onDelete: () => void
}

/** One row in the standing-habits list. Click name → inline rename.
 *  Slot is a select; grams is a numeric input. Kebab → pause/delete. */
export function HabitRow({ habit, onChange, onDelete }: Props) {
  const [name, setName] = useState(habit.name)
  const [grams, setGrams] = useState(habit.gramsHint != null ? String(habit.gramsHint) : '')
  const [menuOpen, setMenuOpen] = useState(false)

  const commitName = () => {
    if (name === habit.name) return
    if (!name.trim()) { setName(habit.name); return }
    onChange({ name: name.trim() })
  }

  const commitGrams = () => {
    const trimmed = grams.trim()
    const next = trimmed ? parseInt(trimmed, 10) : null
    if (Number.isNaN(next)) return
    if ((next ?? null) === (habit.gramsHint ?? null)) return
    onChange({ gramsHint: next })
  }

  return (
    <div className={`relative grid grid-cols-[20px_1fr_120px_140px_24px] items-center gap-3 px-4 py-3 border-t first:border-t-0 border-neutral-100 ${habit.paused ? 'opacity-50' : ''}`}>
      <span className="text-neutral-300 cursor-grab" aria-label="Drag handle">⋮⋮</span>

      <input
        value={name}
        onChange={e => setName(e.target.value)}
        onBlur={commitName}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
        className="bg-transparent text-[14px] text-neutral-800 focus:outline-none focus:bg-bg-base focus:px-2 focus:py-1 focus:rounded-md transition-all"
      />

      <div className="flex items-baseline gap-1">
        <input
          value={grams}
          onChange={e => setGrams(e.target.value.replace(/[^0-9]/g, ''))}
          onBlur={commitGrams}
          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
          placeholder="—"
          className="w-14 bg-transparent text-[13px] text-primary-600 focus:outline-none focus:bg-bg-base focus:px-1 focus:rounded-md text-right"
        />
        <span className="text-[12px] text-primary-500">g</span>
      </div>

      <select
        value={habit.slot}
        onChange={e => onChange({ slot: e.target.value as StandingHabit['slot'] })}
        className="px-2 py-1 rounded-md bg-bg-base border border-neutral-200 text-[13px] focus:outline-none focus:border-primary-500"
      >
        <option value="breakfast">Breakfast</option>
        <option value="lunch">Lunch</option>
        <option value="snack">Snack</option>
        <option value="dinner">Dinner</option>
      </select>

      <div className="relative">
        <button onClick={() => setMenuOpen(o => !o)}
                aria-label="More"
                className="text-neutral-400 hover:text-neutral-700 text-[16px] leading-none">⋮</button>
        {menuOpen && (
          <div className="absolute right-0 top-full mt-1 z-10 min-w-[140px] rounded-xl border border-neutral-200 bg-bg-elevated shadow-card py-1">
            <button onClick={() => { onChange({ paused: !habit.paused }); setMenuOpen(false) }}
                    className="w-full text-left px-3 py-1.5 text-[13px] hover:bg-primary-50">
              {habit.paused ? 'Resume' : 'Pause this week'}
            </button>
            <button onClick={() => { onDelete(); setMenuOpen(false) }}
                    className="w-full text-left px-3 py-1.5 text-[13px] hover:bg-accent-50 text-accent-500">
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
