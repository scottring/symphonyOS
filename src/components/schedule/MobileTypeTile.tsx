import { memo } from 'react'
import { Check, Repeat, Calendar } from 'lucide-react'
import type { TaskContext } from '@/types/task'
import type { TimelineItem } from '@/types/timeline'
import { DOMAIN_COLORS } from '@/lib/domainColors'

// Primary teal-forest from the design system (--color-primary-500 in
// src/index.css) — used as fallback when an item has no domain context yet.
// Legacy comma HSL syntax is used so jsdom in tests serializes it back from
// inline style; modern space-separated form is silently dropped by older
// jsdom versions.
const PRIMARY_DOT = 'hsl(168, 45%, 30%)'
const PRIMARY_BG = 'hsla(168, 45%, 30%, 0.08)'

interface MobileTypeTileProps {
  type: TimelineItem['type']
  context: TaskContext | null | undefined
}

/**
 * The tinted leading tile on every mobile schedule row.
 *
 * Two jobs in one calm shape: (1) it shows the item type via the inner glyph,
 * (2) it carries the domain color via the tile tint. When `context` is null,
 * the tile uses the design system's primary teal-forest so rows without a
 * domain still feel intentional.
 *
 * Presentational only — taps on the row's checkbox / complete affordance are
 * handled elsewhere. The completed/skipped dim is inherited from the parent
 * row's `opacity-60`; the tile must not re-apply opacity or it double-dims.
 */
export const MobileTypeTile = memo(function MobileTypeTile({
  type,
  context,
}: MobileTypeTileProps) {
  const dot = context ? DOMAIN_COLORS[context].dot : PRIMARY_DOT
  const bg = context ? DOMAIN_COLORS[context].bg : PRIMARY_BG

  const Glyph = type === 'routine' ? Repeat : type === 'event' ? Calendar : Check

  return (
    <div
      aria-hidden
      className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
      style={{ backgroundColor: bg, color: dot }}
    >
      <Glyph className="w-[18px] h-[18px]" strokeWidth={2} />
    </div>
  )
})
