import type { PoolView } from '@/lib/planning/poolViews'

const VIEWS: { value: PoolView; label: string }[] = [
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
  { value: 'all', label: 'Everything' },
]

const ROUTINES_VIEW: { value: PoolView; label: string } = { value: 'routines', label: 'Routines' }

/** The official pool views, as a segmented control. Shared by the overlay
 *  drawer and /week's pool lane so the vocabulary stays identical.
 *
 *  `includeRoutines` adds the Routines tab, which ISOLATES routines the way
 *  'month' isolates the month bucket — it is a filter, not a separate mode.
 *  Unhomed routines also ride along in 'week' and 'all' (see routinesForView),
 *  because a routine with no time needs a slot exactly the way an unscheduled
 *  task does, and on its own tab it was never blocked out. */
export function PoolViewSwitcher({ view, onChange, includeRoutines = false }: {
  view: PoolView
  onChange: (v: PoolView) => void
  includeRoutines?: boolean
}) {
  const views = includeRoutines ? [...VIEWS, ROUTINES_VIEW] : VIEWS
  return (
    <div role="group" aria-label="Pool view" className="flex rounded-lg bg-neutral-100 p-0.5 gap-0.5">
      {views.map(({ value, label }) => (
        <button
          key={value}
          type="button"
          onClick={() => onChange(value)}
          aria-pressed={view === value}
          className={`flex-1 px-2 py-1 text-xs font-medium rounded-md transition-colors ${
            view === value ? 'bg-white shadow-sm text-neutral-800' : 'text-neutral-500 hover:text-neutral-700'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
