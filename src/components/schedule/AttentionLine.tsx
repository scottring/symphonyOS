import { useMemo } from 'react'
import { Archive } from 'lucide-react'
import type { AttentionItem } from '@/lib/today/attention'

interface AttentionLineProps {
  items: AttentionItem[]
  onReview: () => void
}

/**
 * One line closing Today: "3 need attention · oldest 38 days".
 *
 * The floor guarantee, inherited from SlippedPointer. Work now leaves Today on
 * its own — dates expire, and backlog never appears here at all — so the
 * pointer back to it must be impossible to lose: whenever the set is non-empty
 * this renders, it never expands inline, and it has no dismiss control.
 *
 * It is one row at three items and one row at three hundred. That is the
 * invariant the whole redesign rests on: anything that is not a commitment
 * gets a fixed budget that does not grow with the backlog.
 *
 * The count is drainable by construction — it counts only what is genuinely
 * late, so it reaches zero and the line disappears. A badge over the whole
 * backlog would read 96 forever and become wallpaper.
 */
export function AttentionLine({ items, onReview }: AttentionLineProps) {
  const oldestDays = useMemo(
    () => items.reduce((max, i) => (i.ageDays > max ? i.ageDays : max), 0),
    [items],
  )

  if (items.length === 0) return null

  return (
    <button
      type="button"
      onClick={onReview}
      // mb-[7.5rem] (mobile only): this is the last row on the mobile Today
      // page, so without real clearance it lands directly under the fixed
      // QuickCapture FAB (bottom-right) once the page is scrolled all the
      // way down — obscuring the "Review" label, the one thing on this line
      // a user can act on. Measured in Chrome: the FAB's own band is ~5rem
      // tall, so a plain rem-for-rem guess undershoots; this value was
      // verified in the browser to clear it with margin to spare. Desktop
      // has no FAB, hence md:mb-0.
      className="w-full flex items-center gap-2 px-3 md:px-0 py-2 mt-1 mb-[7.5rem] md:mb-0 text-left text-[13px] text-neutral-500 hover:text-neutral-700 transition-colors"
    >
      <Archive className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
      <span className="font-medium text-neutral-600 shrink-0">
        {items.length} {items.length === 1 ? 'needs' : 'need'} attention
      </span>
      <span className="text-neutral-400 shrink-0">· oldest {oldestDays} days</span>
      <span className="ml-auto text-primary-600 shrink-0">Review</span>
    </button>
  )
}
