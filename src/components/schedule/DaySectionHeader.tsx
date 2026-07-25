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
}

/**
 * One section header for Today. Extracted from TodayView so the day list stops
 * carrying its own chrome.
 *
 * Collapsing must never hide completion state — the count and "N done" stay on
 * the row, same honesty rule as the page cap.
 */
export function DaySectionHeader({
  section, itemCount, completedCount, collapsed, emptyBecauseHero, onToggle,
}: DaySectionHeaderProps) {
  const meta = daySectionMeta(section)
  const allDone = itemCount > 0 && completedCount === itemCount

  return (
    <button
      type="button"
      onClick={emptyBecauseHero ? undefined : onToggle}
      disabled={emptyBecauseHero}
      aria-expanded={!collapsed}
      aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${meta.label}`}
      className={`w-full flex items-center gap-2 text-[11px] uppercase tracking-wider font-semibold text-neutral-400 px-3 md:px-0 py-0.5 text-left ${
        emptyBecauseHero ? 'cursor-default' : 'hover:text-neutral-600 transition-colors'
      }`}
    >
      {createElement(meta.Icon, {
        className: `w-4 h-4 shrink-0 ${collapsed ? 'text-amber-500/60' : 'text-amber-500'}`,
      })}
      <span>{meta.label}</span>
      {meta.range && (
        <span className="text-neutral-300 normal-case font-normal">{meta.range}</span>
      )}

      {emptyBecauseHero ? (
        <span className="text-primary-600/70 normal-case font-normal">· up next</span>
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
