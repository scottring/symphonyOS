import type { TimelineItem } from '@/types/timeline'

export interface BlockColor {
  bg: string
  text: string
  ring: string
  /** Optional border/edge treatment. Tasks read as bordered cards on the
   *  week grid (mockup 2026-09-01); filled blocks leave this empty. */
  border?: string
}

const PURPLE: BlockColor = {
  bg: 'bg-[hsl(271_60%_92%)]',
  text: 'text-[hsl(271_50%_30%)]',
  ring: '',
}

const CREAM: BlockColor = {
  bg: 'bg-[hsl(38_60%_92%)]',
  text: 'text-[hsl(35_50%_35%)]',
  ring: '',
}

// Routines read as QUIET rhythm bands (This Week redesign, 2026-09-01):
// muted cream, muted text — repetition recedes so one-off commitments pop.
const YELLOW: BlockColor = {
  bg: 'bg-[hsl(45_65%_92%/0.75)]',
  text: 'text-[hsl(38_25%_42%)]',
  ring: '',
}

const PEACH: BlockColor = {
  bg: 'bg-[hsl(28_55%_90%)]',
  text: 'text-[hsl(14_45%_35%)]',
  ring: '',
}

const GREEN: BlockColor = {
  bg: 'bg-[hsl(142_30%_96%)]',
  text: 'text-[hsl(142_50%_25%)]',
  ring: '',
  border: 'border border-[hsl(142_30%_80%)]',
}

/**
 * Map a TimelineItem to its visual block color for the Week grid.
 * Falls back to plain-task green for unknown shapes.
 */
export function colorFor(item: TimelineItem): BlockColor {
  const base = pickBase(item)
  const ring = item.isOverdue ? 'ring-1 ring-rose-300' : ''
  return { ...base, ring }
}

function pickBase(item: TimelineItem): BlockColor {
  // Meal items take precedence over event type — id prefix is the canonical signal.
  if (typeof item.id === 'string' && item.id.startsWith('meal:')) return PEACH
  if (item.type === 'routine') return YELLOW
  if (item.type === 'event') return PURPLE
  if (item.type === 'task') {
    switch (item.category) {
      case 'errand':
      case 'chore':
        return CREAM
      case 'activity':
      case 'event':
        return PURPLE
      default:
        return GREEN
    }
  }
  return GREEN
}
