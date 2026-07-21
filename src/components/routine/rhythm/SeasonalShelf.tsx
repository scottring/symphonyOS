import { useState } from 'react'
import { Leaf, ChevronRight } from 'lucide-react'
import type { Routine } from '@/types/actionable'

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

export function SeasonalShelf({ routines, onWakeAll, onOpenRoutine }: {
  routines: Routine[]
  onWakeAll: () => void
  onOpenRoutine: (r: Routine) => void
}) {
  const [expanded, setExpanded] = useState(false)
  if (routines.length === 0) return null

  const dates = routines.map(r => r.paused_until).filter((d): d is string => !!d).sort()
  const title = dates.length > 0 ? `Waiting for ${MONTHS[new Date(dates[0]).getUTCMonth()]}` : 'Resting'
  const preview = routines.slice(0, 4).map(r => r.name).join(', ')

  return (
    <section className="mb-6 rounded-2xl border border-amber-200/70 bg-gradient-to-br from-amber-50 to-orange-50/60 p-4">
      <div className="flex items-center justify-between gap-3">
        <button onClick={() => setExpanded(v => !v)} className="flex items-center gap-2 text-left min-w-0">
          <Leaf className="w-4 h-4 text-amber-700 flex-shrink-0" />
          <span className="text-xs font-semibold uppercase tracking-wider text-amber-800">{title}</span>
          <ChevronRight className={`w-4 h-4 text-amber-600 transition-transform ${expanded ? 'rotate-90' : ''}`} />
        </button>
        <button
          onClick={onWakeAll}
          className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 transition-colors"
        >
          Wake all
        </button>
      </div>
      <p className="mt-1.5 text-sm text-neutral-600">
        {routines.length} routine{routines.length === 1 ? '' : 's'} {routines.length === 1 ? 'is' : 'are'} resting — {preview}
        {routines.length > 4 ? '…' : ''}
      </p>
      {expanded && (
        <ul className="mt-3 flex flex-col gap-1">
          {routines.map(r => (
            <li key={r.id}>
              <button
                onClick={() => onOpenRoutine(r)}
                className="w-full text-left rounded-lg bg-white/70 px-3 py-1.5 text-sm text-neutral-600 hover:bg-white transition-colors"
              >
                {r.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
