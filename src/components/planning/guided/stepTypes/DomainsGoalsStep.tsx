// src/components/planning/guided/stepTypes/DomainsGoalsStep.tsx
//
// The flattened year model: life domains (goal areas) with plain goal
// statements under each. No actions, no milestones, no linkage — a goal is a
// sentence you'll look at each season.
import { useState, useCallback } from 'react'
import { Plus, Target } from 'lucide-react'
import { useGuided } from '../GuidedContext'

function AddInline({ placeholder, onAdd, ariaLabel }: { placeholder: string; onAdd: (title: string) => void; ariaLabel?: string }) {
  const [draft, setDraft] = useState('')
  const submit = useCallback(() => {
    const v = draft.trim()
    if (!v) return
    setDraft('')
    onAdd(v)
  }, [draft, onAdd])
  return (
    <div className="flex items-center gap-2 px-2 py-1 rounded-lg border border-neutral-200 bg-white focus-within:border-primary-400 transition-colors">
      <button type="button" onClick={submit} aria-label={ariaLabel || placeholder}
        className="shrink-0 w-5 h-5 rounded-full bg-primary-600 text-white grid place-items-center hover:bg-primary-700 transition-colors">
        <Plus className="w-3 h-3" />
      </button>
      <input type="text" value={draft} placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
        className="flex-1 min-w-0 text-sm bg-transparent placeholder:text-neutral-400 focus:outline-none"
      />
    </div>
  )
}

export function DomainsGoalsStep() {
  const { host } = useGuided()
  const active = host.goals.filter((g) => g.status === 'active')
  const areaIds = new Set(host.goalAreas.map((a) => a.id))
  const uncategorized = active.filter((g) => !areaIds.has(g.areaId))

  return (
    <div className="space-y-5">
      {host.goalAreas.map((area) => (
        <section key={area.id}>
          <h3 className="text-[11px] uppercase tracking-wider text-neutral-400 mb-2">{area.name}</h3>
          <ul className="space-y-1 mb-2">
            {active.filter((g) => g.areaId === area.id).map((g) => (
              <li key={g.id} className="flex items-center gap-2 rounded-lg bg-neutral-50/70 px-3 py-1.5 text-sm text-neutral-700">
                <Target className="w-3.5 h-3.5 text-neutral-300 shrink-0" /> {g.name}
              </li>
            ))}
          </ul>
          <AddInline placeholder={`A goal for ${area.name}…`} ariaLabel="Add goal" onAdd={(t) => void host.addGoal(area.id, t)} />
        </section>
      ))}
      {uncategorized.length > 0 && (
        <section>
          <h3 className="text-[11px] uppercase tracking-wider text-neutral-400 mb-2">Uncategorized</h3>
          <ul className="space-y-1">
            {uncategorized.map((g) => (
              <li key={g.id} className="flex items-center gap-2 rounded-lg bg-neutral-50/70 px-3 py-1.5 text-sm text-neutral-700">
                <Target className="w-3.5 h-3.5 text-neutral-300 shrink-0" /> {g.name}
              </li>
            ))}
          </ul>
        </section>
      )}
      <section>
        <h3 className="text-[11px] uppercase tracking-wider text-neutral-400 mb-2">Add an area of life</h3>
        <AddInline placeholder="New life area — health, fun, home…" ariaLabel="Add life area" onAdd={(t) => void host.addArea(t)} />
      </section>
    </div>
  )
}
