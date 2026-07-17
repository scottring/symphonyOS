// src/components/planning/guided/stepTypes/DomainsGoalsStep.tsx
//
// The flattened year model: life domains (goal areas) with plain goal
// statements under each. No actions, no milestones, no linkage — a goal is a
// sentence you'll look at each season.
//
// Areas are the PARENT, goals the children. The two add affordances are styled
// distinctly (walkthrough #4): a prominent, dashed "new life area" at the
// bottom vs. a light, nested "add a goal" inside each area's indented column,
// so the hierarchy is legible instead of two identical inputs.
import { useState, useCallback } from 'react'
import { Plus, Target } from 'lucide-react'
import { useGuided } from '../GuidedContext'

function AddInline({
  placeholder, onAdd, ariaLabel, variant = 'goal',
}: { placeholder: string; onAdd: (title: string) => void; ariaLabel?: string; variant?: 'goal' | 'area' }) {
  const [draft, setDraft] = useState('')
  const submit = useCallback(() => {
    const v = draft.trim()
    if (!v) return
    setDraft('')
    onAdd(v)
  }, [draft, onAdd])
  const isArea = variant === 'area'
  return (
    <div className={`flex items-center gap-2 rounded-lg transition-colors ${
      isArea
        ? 'px-3 py-2 border border-dashed border-primary-300 bg-primary-50/30 focus-within:border-primary-500'
        : 'px-2 py-1 border border-neutral-200 bg-white focus-within:border-primary-400'
    }`}>
      <button type="button" onClick={submit} aria-label={ariaLabel || placeholder}
        className={`shrink-0 rounded-full text-white grid place-items-center transition-colors ${
          isArea ? 'w-6 h-6 bg-primary-600 hover:bg-primary-700' : 'w-5 h-5 bg-neutral-400 hover:bg-primary-600'
        }`}>
        <Plus className={isArea ? 'w-4 h-4' : 'w-3 h-3'} />
      </button>
      <input type="text" value={draft} placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
        className={`flex-1 min-w-0 bg-transparent placeholder:text-neutral-400 focus:outline-none text-sm ${isArea ? 'font-medium text-neutral-800' : ''}`}
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
    <div className="space-y-6">
      {host.goalAreas.map((area) => (
        <section key={area.id}>
          <h3 className="text-sm font-semibold text-neutral-700 mb-2">{area.name}</h3>
          {/* Goals live in an indented column under their area — the left rule
              makes containment visible. */}
          <div className="pl-3 border-l-2 border-neutral-100 space-y-1.5">
            <ul className="space-y-1">
              {active.filter((g) => g.areaId === area.id).map((g) => (
                <li key={g.id} className="flex items-start gap-2 rounded-lg bg-neutral-50/70 px-3 py-1.5 text-sm text-neutral-700">
                  <Target className="w-3.5 h-3.5 text-neutral-300 shrink-0 mt-0.5" />
                  <span className="leading-snug">{g.name}</span>
                </li>
              ))}
            </ul>
            <AddInline variant="goal" placeholder={`Add a goal to ${area.name}…`} ariaLabel="Add goal" onAdd={(t) => void host.addGoal(area.id, t)} />
          </div>
        </section>
      ))}
      {uncategorized.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-neutral-700 mb-2">Uncategorized</h3>
          <ul className="pl-3 border-l-2 border-neutral-100 space-y-1">
            {uncategorized.map((g) => (
              <li key={g.id} className="flex items-start gap-2 rounded-lg bg-neutral-50/70 px-3 py-1.5 text-sm text-neutral-700">
                <Target className="w-3.5 h-3.5 text-neutral-300 shrink-0 mt-0.5" />
                <span className="leading-snug">{g.name}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {/* Top-level, distinct: creating a new life area is a different act from
          adding a goal inside one. */}
      <section className="pt-3 border-t border-neutral-100">
        <p className="text-[11px] uppercase tracking-wider text-neutral-400 mb-2">Add an area of life</p>
        <AddInline variant="area" placeholder="New life area — health, fun, home…" ariaLabel="Add life area" onAdd={(t) => void host.addArea(t)} />
      </section>
    </div>
  )
}
