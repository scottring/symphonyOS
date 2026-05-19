import { ConceptIcon } from '@/lib/conceptIcons'

interface Props {
  hasBrief: boolean
  planDrafted: boolean
  prepCount: number
  missingGroceriesCount: number
  /** Called when user clicks "Restart tour" link in the overflow. */
  onRestartTour?: () => void
}

/** Editorial-calm breadcrumb showing the user's progress through the Sunday
 *  ritual. Each segment links to its anchor on the page. */
export function RitualStatus({ hasBrief, planDrafted, prepCount, missingGroceriesCount, onRestartTour }: Props) {
  const dot = <span className="mx-1.5 text-neutral-300">·</span>

  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center flex-wrap gap-y-1 text-[12px] uppercase tracking-[0.18em] text-neutral-500">

        {/* Brief segment */}
        <a
          href="#brief"
          className={hasBrief ? 'text-neutral-800' : undefined}
        >
          Brief {hasBrief
            ? <ConceptIcon name="done" size={12} className="text-primary-500" decorative />
            : <span>—</span>}
        </a>

        {dot}

        {/* Plan drafted segment */}
        <a
          href="#plan"
          className={planDrafted ? 'text-neutral-800' : undefined}
        >
          Plan drafted {planDrafted
            ? <ConceptIcon name="done" size={12} className="text-primary-500" decorative />
            : <span>—</span>}
        </a>

        {/* Prep segment — only when there's at least one batch */}
        {prepCount > 0 && (
          <>
            {dot}
            <a href="#prep" className="text-neutral-800">
              {prepCount} batch · distribute
            </a>
          </>
        )}

        {/* Groceries segment — only when items are missing */}
        {missingGroceriesCount > 0 && (
          <>
            {dot}
            <a href="#groceries" className="text-neutral-800">
              {missingGroceriesCount} to groceries
            </a>
          </>
        )}
      </div>

      {/* Restart tour link */}
      {onRestartTour && (
        <button
          onClick={onRestartTour}
          className="shrink-0 text-[11px] italic text-neutral-400 hover:text-primary-500 transition-colors"
        >
          Restart tour
        </button>
      )}
    </div>
  )
}
