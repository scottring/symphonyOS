import { useState } from 'react'
import { useStandingHabits } from '@/hooks/useStandingHabits'
import { MealsTabs } from '../MealsTabs'
import { HabitRow } from './HabitRow'
import { RestrictionsSection } from './RestrictionsSection'
import type { StandingHabit } from '@/types/meal-planner'

/** Surface 2 — Standing Habits configuration. Five-row list with name, grams
 *  hint, slot dropdown, and kebab menu. "+ Add habit" up top. */
export function StandingHabitsPage() {
  const { habits, loading, error, add, update, remove } = useStandingHabits()
  const [adding, setAdding] = useState(false)

  if (loading) {
    return (
      <div className="px-12 py-12 max-w-3xl mx-auto">
        <MealsTabs />
        <div className="text-[12px] uppercase tracking-widest text-neutral-400">Loading…</div>
      </div>
    )
  }
  if (error) {
    return (
      <div className="px-12 py-12 max-w-3xl mx-auto">
        <MealsTabs />
        <div className="text-accent-500">{error}</div>
      </div>
    )
  }

  return (
    <div className="px-12 py-12 max-w-3xl mx-auto">
      <MealsTabs />

      <div className="flex items-start justify-between mb-2">
        <div>
          <h1 className="font-display text-[2.4rem] leading-tight text-neutral-800">
            Standing <span className="italic text-primary-500">Habits.</span>
          </h1>
          <p className="font-display italic text-[1.05rem] text-neutral-500 mt-2 max-w-md">
            Your daily rituals that apply to every plan. Reorder with drag handle.
          </p>
        </div>
        <button onClick={() => setAdding(true)}
                className="px-4 py-2 rounded-full bg-primary-500 text-white text-[12px] font-medium hover:bg-primary-600">
          + Add habit
        </button>
      </div>

      <div className="mt-8 rounded-3xl border border-neutral-200 bg-bg-elevated shadow-card overflow-hidden">
        {habits.length === 0 && !adding && (
          <EmptyState onSeed={() => seedDefaults(add)} onAdd={() => setAdding(true)} />
        )}
        {habits.map(h => (
          <HabitRow
            key={h.id}
            habit={h}
            onChange={(patch) => update(h.id, patch)}
            onDelete={() => remove(h.id)}
          />
        ))}
        {adding && (
          <NewHabitRow
            onSave={async (input) => { await add(input); setAdding(false) }}
            onCancel={() => setAdding(false)}
          />
        )}
      </div>

      <p className="mt-4 text-[12px] italic text-neutral-500">
        These habits are included in every plan unless you override them.
      </p>

      <RestrictionsSection />
    </div>
  )
}

interface NewHabitInput {
  name: string
  slot: StandingHabit['slot']
  gramsHint?: number
}

function NewHabitRow({ onSave, onCancel }: { onSave: (input: NewHabitInput) => Promise<void>; onCancel: () => void }) {
  const [name, setName] = useState('')
  const [slot, setSlot] = useState<StandingHabit['slot']>('breakfast')
  const [grams, setGrams] = useState('')

  const submit = () => {
    if (!name.trim()) return onCancel()
    const gramsHint = grams ? parseInt(grams, 10) : undefined
    void onSave({ name: name.trim(), slot, gramsHint })
  }

  return (
    <div className="grid grid-cols-[20px_1fr_120px_140px_24px] items-center gap-3 px-4 py-3 border-t border-neutral-100 bg-primary-50/40">
      <span className="text-neutral-300 cursor-grab">⋮⋮</span>
      <input
        autoFocus value={name} onChange={e => setName(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onCancel() }}
        placeholder="e.g. Yogurt breakfast + cherry tomatoes"
        className="px-2 py-1.5 rounded-md border border-neutral-200 bg-bg-base text-[14px] focus:outline-none focus:border-primary-500"
      />
      <input
        value={grams} onChange={e => setGrams(e.target.value.replace(/[^0-9]/g, ''))}
        onKeyDown={e => { if (e.key === 'Enter') submit() }}
        placeholder="grams"
        className="px-2 py-1.5 rounded-md border border-neutral-200 bg-bg-base text-[13px] text-primary-600 focus:outline-none focus:border-primary-500"
      />
      <select value={slot} onChange={e => setSlot(e.target.value as StandingHabit['slot'])}
              className="px-2 py-1.5 rounded-md border border-neutral-200 bg-bg-base text-[13px] focus:outline-none focus:border-primary-500">
        <option value="breakfast">Breakfast</option>
        <option value="lunch">Lunch</option>
        <option value="snack">Snack</option>
        <option value="dinner">Dinner</option>
      </select>
      <button onClick={submit} className="text-primary-500 hover:text-primary-600 text-[14px]">✓</button>
    </div>
  )
}

function EmptyState({ onSeed, onAdd }: { onSeed: () => void; onAdd: () => void }) {
  return (
    <div className="px-6 py-10 text-center">
      <p className="font-display text-[1.1rem] text-neutral-700">No standing habits yet.</p>
      <p className="font-display italic text-[0.95rem] text-neutral-500 mt-1">
        Iris's defaults: yogurt breakfast, dal lunch, raw veg, snack, light dinner.
      </p>
      <div className="mt-4 flex items-center justify-center gap-3">
        <button onClick={onSeed}
                className="px-4 py-2 rounded-full bg-primary-500 text-white text-[12px] font-medium hover:bg-primary-600">
          Use Iris's defaults
        </button>
        <button onClick={onAdd}
                className="px-4 py-2 rounded-full border border-neutral-300 text-neutral-700 text-[12px] hover:bg-neutral-100">
          Start blank
        </button>
      </div>
    </div>
  )
}

async function seedDefaults(add: (i: NewHabitInput) => Promise<void>) {
  const defaults: NewHabitInput[] = [
    { name: 'Yogurt breakfast + cherry tomatoes', slot: 'breakfast', gramsHint: 80 },
    { name: 'Red lentil dal at lunch + spinach stirred in', slot: 'lunch', gramsHint: 70 },
    { name: 'Raw vegetables at lunch (doubled)', slot: 'lunch', gramsHint: 175 },
    { name: 'Afternoon snack (3-4pm)', slot: 'snack' },
    { name: 'Light dinner nights', slot: 'dinner' },
  ]
  for (const d of defaults) await add(d)
}
