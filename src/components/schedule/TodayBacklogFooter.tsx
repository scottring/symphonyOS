import { useMemo, type ReactNode } from 'react'
import { Archive, ChevronDown, ChevronRight, CornerUpLeft } from 'lucide-react'
import type { AttentionItem } from '@/lib/today/attention'

interface TodayBacklogFooterProps {
  /** Incomplete carried-over tasks (falls back to total while all complete). */
  carriedCount: number
  attentionItems: AttentionItem[]
  carriedExpanded: boolean
  onToggleCarried: () => void
  onReview: () => void
  /** The expanded carried-over list, rendered under the line. */
  children?: ReactNode
}

/**
 * One line closing Today: "8 carried over · 24 need attention · oldest 248
 * days · Review". Merges what used to be two rows framing the list — the
 * carried-over strip at the top and the attention line at the bottom — into a
 * single muted footer, because backlog belongs under the day, not above it.
 *
 * The floor guarantee, inherited from AttentionLine (and before it,
 * SlippedPointer): work leaves Today on its own — dates expire, backlog never
 * appears here at all — so the pointer back to it must be impossible to lose.
 * Whenever either set is non-empty this renders, it has no dismiss control,
 * and it is one row at three items and one row at three hundred. That is the
 * invariant the whole redesign rests on: anything that is not a commitment
 * gets a fixed budget that does not grow with the backlog.
 *
 * The attention count is drainable by construction — it counts only what is
 * genuinely late, so it reaches zero and its segment disappears. A badge over
 * the whole backlog would read 96 forever and become wallpaper.
 *
 * "Review" belongs to the attention set (it navigates to the horizon rung
 * that already draws those units); the carried-over segment expands its own
 * list inline via `children` instead, because those tasks have no other home.
 */
export function TodayBacklogFooter({
  carriedCount, attentionItems, carriedExpanded, onToggleCarried, onReview, children,
}: TodayBacklogFooterProps) {
  const oldestDays = useMemo(
    () => attentionItems.reduce((max, i) => (i.ageDays > max ? i.ageDays : max), 0),
    [attentionItems],
  )

  if (carriedCount === 0 && attentionItems.length === 0) return null

  return (
    // mb-[7.5rem] (mobile only): this is the last block on the mobile Today
    // page, so without real clearance it lands directly under the fixed
    // QuickCapture FAB (bottom-right) once the page is scrolled all the way
    // down — obscuring "Review", the one thing here a user can act on. The
    // value was verified in the browser to clear the FAB's ~5rem band with
    // margin to spare. Desktop has no FAB, hence md:mb-0. It sits on this
    // wrapper, not the line, so an expanded carried-over list keeps the
    // clearance beneath it.
    <div className="mb-[7.5rem] md:mb-0">
      <div className="w-full flex items-center gap-2 px-3 md:px-0 py-2 mt-1 text-[13px] text-neutral-500">
        {carriedCount > 0 && (
          <button
            type="button"
            onClick={onToggleCarried}
            aria-expanded={carriedExpanded}
            className="flex items-center gap-1.5 text-left hover:text-neutral-700 transition-colors"
          >
            <CornerUpLeft className="w-3.5 h-3.5 text-amber-500/80 shrink-0" />
            <span className="font-medium text-amber-700/90">{carriedCount} carried over</span>
            {carriedExpanded
              ? <ChevronDown className="w-3.5 h-3.5 text-neutral-300 shrink-0" />
              : <ChevronRight className="w-3.5 h-3.5 text-neutral-300 shrink-0" />}
          </button>
        )}

        {carriedCount > 0 && attentionItems.length > 0 && (
          <span className="text-neutral-300">·</span>
        )}

        {attentionItems.length > 0 && (
          <>
            <Archive className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
            <span className="font-medium text-neutral-600 shrink-0">
              {attentionItems.length} {attentionItems.length === 1 ? 'needs' : 'need'} attention
            </span>
            <span className="text-neutral-400 shrink-0">· oldest {oldestDays} days</span>
            <button
              type="button"
              onClick={onReview}
              className="ml-auto text-primary-600 hover:text-primary-700 shrink-0 transition-colors"
            >
              Review
            </button>
          </>
        )}
      </div>

      {carriedExpanded && children && <div className="mt-1">{children}</div>}
    </div>
  )
}
