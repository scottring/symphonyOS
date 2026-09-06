import { Repeat } from 'lucide-react'

/** Labeled on/off control for grid routine visibility. Replaces the bare eye
 *  icon nobody could decode (aria-checked speaks VISIBILITY, so hidden=true
 *  renders as "off"). Both grids call it with hideRoutinesSignal-synced state,
 *  so toggling on either surface follows everywhere. */
export function RoutinesToggle({ hidden, onToggle }: { hidden: boolean; onToggle: () => void }) {
  const on = !hidden
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label="Routines"
      onClick={onToggle}
      title={on ? 'Hide routines on the grid' : 'Show routines on the grid'}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
        on
          ? 'bg-primary-50 border-primary-200 text-primary-700'
          : 'bg-neutral-50 border-neutral-200 text-neutral-400'
      }`}
    >
      <Repeat className="w-3.5 h-3.5" />
      Routines
      <span className={`ml-0.5 w-6 h-3.5 rounded-full relative transition-colors ${on ? 'bg-primary-500' : 'bg-neutral-300'}`}>
        <span className={`absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white transition-all ${on ? 'right-0.5' : 'left-0.5'}`} />
      </span>
    </button>
  )
}
