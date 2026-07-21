import type { Routine } from '@/types/actionable'

function caption(r: Routine): string {
  const p = r.recurrence_pattern
  if (p.type === 'monthly') return 'monthly'
  if (p.type === 'yearly') return 'yearly'
  if (p.type === 'specific_days') return `${p.dates?.length ?? 0} dates`
  if (p.type === 'since_last' && p.interval && p.unit) return `every ${p.interval} ${p.unit}`
  return 'sometimes'
}

export function SometimesShelf({ routines, matches, onOpenRoutine }: {
  routines: Routine[]
  matches: (r: Routine) => boolean
  onOpenRoutine: (r: Routine) => void
}) {
  if (routines.length === 0) return null
  return (
    <section className="mb-6 rounded-2xl border border-neutral-100 bg-white p-4">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-2">Sometimes</h2>
      <div className="flex flex-wrap gap-1.5">
        {routines.map(r => (
          <button
            key={r.id}
            onClick={() => onOpenRoutine(r)}
            className={`rounded-full bg-neutral-100/80 px-3 py-1 text-sm text-neutral-700 hover:bg-amber-100
                        transition-colors ${matches(r) ? '' : 'opacity-30'}`}
          >
            {r.name} <span className="text-neutral-400 text-xs">· {caption(r)}</span>
          </button>
        ))}
      </div>
    </section>
  )
}
