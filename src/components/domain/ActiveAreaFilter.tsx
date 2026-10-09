import { useDomain } from '@/hooks/useDomain'
import { ALL_LAYERS, LAYER_LABELS } from '@/lib/domains'

/** A saved area choice must never make a partial plan look like missing data. */
export function ActiveAreaFilter() {
  const { layers, all } = useDomain()
  const restricted = [...ALL_LAYERS].some((layer) => !layers.has(layer))
  const labels = [...ALL_LAYERS].filter((layer) => layers.has(layer)).map((layer) => LAYER_LABELS[layer])

  return (
    <div role="status" aria-live="polite" aria-atomic="true">
      {restricted && (
        <div className="mx-4 my-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl border border-primary-200 bg-bg-elevated px-4 py-3 text-sm text-neutral-800">
          <div className="min-w-0 flex-1 basis-48">
            <p className="font-medium">Showing {labels.join(', ')} only</p>
            <p className="mt-0.5 text-xs text-neutral-600">Items from other areas are hidden by this filter.</p>
          </div>
          <button type="button" onClick={all} className="min-h-11 shrink-0 rounded-lg px-3 py-2 font-medium text-primary-700 underline underline-offset-4 hover:bg-primary-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600">
            Show all areas
          </button>
        </div>
      )}
    </div>
  )
}
