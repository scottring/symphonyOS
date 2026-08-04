import { createElement } from 'react'
import { ChevronRight, ChevronDown } from 'lucide-react'
import type { DaySection } from '@/lib/timeUtils'
import { daySectionMeta } from '@/lib/daySectionMeta'

export interface DaySectionHeaderProps {
  section: DaySection
  /** Items remaining after the Up Next hero is lifted out. */
  itemCount: number
  completedCount: number
  collapsed: boolean
  /** True when the section's only item was lifted into the hero. */
  emptyBecauseHero: boolean
  onToggle: () => void
  /**
   * Unscheduled-only. The untimed-routine slab's own unit count (done/total,
   * skip-excluded — see `countRoutineRowUnits`).
   *
   * Its PRESENCE renames the section to "Anytime" in both states — the slab
   * is what the section actually holds, so that is what it is called whether
   * you have it folded or open.
   *
   * Its VALUE is rendered only while collapsed, replacing the generic
   * "Unscheduled · N · M done" readout with "Anytime · M of N done", so the
   * folded row reads the same whether the slab holds 12 routines or 60: its
   * height never grows with the count, only the number inside it changes.
   * Expanded, the rows carry their own state and the summary is redundant.
   *
   * Ignored entirely for every other section.
   */
  anytimeSummary?: { done: number; total: number }
}

/**
 * One section header for Today. Extracted from TodayView so the day list stops
 * carrying its own chrome.
 *
 * Collapsing must never hide completion state — the count and "N done" stay on
 * the row, same honesty rule as the page cap.
 */
export function DaySectionHeader({
  section, itemCount, completedCount, collapsed, emptyBecauseHero, onToggle, anytimeSummary,
}: DaySectionHeaderProps) {
  const meta = daySectionMeta(section)
  const allDone = itemCount > 0 && completedCount === itemCount

  // The section's NAME, in BOTH states. It used to be tied to `collapsed`, so
  // one control renamed its own section as you used it: "Anytime · 4 of 12
  // done" folded, "Unscheduled · 12" open — and the aria-label flipped between
  // "Expand Anytime" and "Collapse Unscheduled", so a screen-reader user
  // toggling one button heard two different sections.
  const isAnytime = section === 'unscheduled' && !emptyBecauseHero && !!anytimeSummary

  // The SUMMARY is still collapsed-only, and that part was never the bug: the
  // folded row has to carry its own answer ("did I do my daily stuff") because
  // the rows holding it are hidden. Expanded, the rows are right there.
  const showAnytime = isAnytime && collapsed

  const label = isAnytime ? 'Anytime' : meta.label

  return (
    <button
      type="button"
      onClick={emptyBecauseHero ? undefined : onToggle}
      disabled={emptyBecauseHero}
      aria-expanded={!collapsed}
      aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${label}`}
      // mb-3 restores the desktop precedent: collapsing the two old headers into
      // one dropped their bottom margin, so every header sat flush against its
      // first row.
      className={`w-full flex items-center gap-2 text-[11px] uppercase tracking-wider font-semibold text-neutral-400 px-3 md:px-0 py-0.5 mb-3 text-left ${
        emptyBecauseHero ? 'cursor-default' : 'hover:text-neutral-600 transition-colors'
      }`}
    >
      {createElement(meta.Icon, {
        className: `w-4 h-4 shrink-0 ${collapsed ? 'text-amber-500/60' : 'text-amber-500'}`,
      })}
      <span>{label}</span>
      {meta.range && !showAnytime && (
        <span className="text-neutral-300 normal-case font-normal">{meta.range}</span>
      )}

      {emptyBecauseHero ? (
        <span className="text-primary-600/70 normal-case font-normal">· up next</span>
      ) : showAnytime ? (
        <span className="text-neutral-400 normal-case font-normal tabular-nums">
          · {anytimeSummary.done} of {anytimeSummary.total} done
        </span>
      ) : (
        <span className="text-neutral-400 normal-case font-normal tabular-nums">
          · {itemCount}
          {completedCount > 0 && (
            <span className="text-primary-600/70"> · {completedCount} done</span>
          )}
          {allDone && <span className="text-primary-600/70"> · complete</span>}
        </span>
      )}

      {!emptyBecauseHero && (
        collapsed
          ? <ChevronRight className="w-3.5 h-3.5 text-neutral-300" />
          : <ChevronDown className="w-3.5 h-3.5 text-neutral-300" />
      )}
    </button>
  )
}
