import type { WallDayData } from '@/hooks/useWallData'
import type { TimelineItem } from '@/types/timeline'
import type { DaySection } from '@/lib/timeUtils'
import type { TodayItem } from '../today/todayItem'

export type QuadrantId = 'upNext' | 'today' | 'pending' | 'familyQuestion'

export interface QuadrantLine {
  text: string
  /** Color is applied to the LINE only, never the quadrant container. */
  tag?: 'overdue' | 'urgent'
}

export interface DayGridTapTarget {
  quadrant: QuadrantId
  /** Set for Up Next when it points at a concrete item; null otherwise. */
  itemId?: string | null
}

export interface QuadrantContent {
  eyebrow: string
  headline: string
  lines: QuadrantLine[]
  footer?: string
  tap: DayGridTapTarget
}

export interface DayGridData {
  upNext: QuadrantContent
  today: QuadrantContent
  pending: QuadrantContent
  familyQuestion: QuadrantContent
}

export interface BuildDayGridInput {
  days: WallDayData[]
  now: Date
  todayItems: TodayItem[]
  overdueTasks: TimelineItem[]
  inboxCount: number
  familyPrompt: string | null
}

// The builder returns the FULL (bounded) list. The visual 3-line cap is
// applied by WallNowQuadrant; the tap-to-expand overlay shows all of these.
const MAX_DATA_LINES = 8
// The wall keeps its three-band face. Today's earlyMorning/night fold into the
// neighbours so this family-facing surface is visually unchanged by the Today
// split — but the items must still APPEAR. Revisit in a dedicated wall pass
// (see the kiosk-design skill).
const SECTION_ORDER: DaySection[] = ['allday', 'morning', 'afternoon', 'evening', 'unscheduled']
const FOLD_INTO: Partial<Record<DaySection, DaySection>> = {
  earlyMorning: 'morning',
  night: 'evening',
}

// Each source section is already time-sorted (groupByDaySection). Merging in
// start-time order keeps the combined bucket sorted too, so "next" still
// means chronologically next, not "next in whichever section came first".
function itemsFor(sections: Record<DaySection, TimelineItem[]>, s: DaySection): TimelineItem[] {
  const folded = (Object.keys(FOLD_INTO) as DaySection[]).filter((k) => FOLD_INTO[k] === s)
  const combined = [...(sections[s] ?? []), ...folded.flatMap((k) => sections[k] ?? [])]
  return combined.sort((a, b) => (a.startTime?.getTime() ?? 0) - (b.startTime?.getTime() ?? 0))
}

function nextFutureItem(days: WallDayData[], now: Date): TimelineItem | null {
  const sorted = [...days].sort((a, b) => a.date.getTime() - b.date.getTime())
  for (const day of sorted) {
    for (const section of SECTION_ORDER) {
      for (const item of itemsFor(day.items, section)) {
        if (item.startTime && item.startTime.getTime() > now.getTime()) return item
      }
    }
  }
  return null
}

function buildUpNext(input: BuildDayGridInput): QuadrantContent {
  const item = nextFutureItem(input.days, input.now)
  if (!item) {
    return {
      eyebrow: 'UP NEXT',
      headline: 'Nothing scheduled',
      lines: [],
      tap: { quadrant: 'upNext', itemId: null },
    }
  }
  return {
    eyebrow: 'UP NEXT',
    headline: item.title,
    lines: [],
    tap: { quadrant: 'upNext', itemId: item.id },
  }
}

function buildToday(input: BuildDayGridInput): QuadrantContent {
  const remaining = input.todayItems
    .filter(i => !i.completed && i.startTime !== null)
    .slice(0, MAX_DATA_LINES)
  return {
    eyebrow: 'TODAY',
    headline: remaining.length === 0 ? 'All clear today' : 'A quiet afternoon',
    lines: remaining.map(i => ({ text: i.title })),
    tap: { quadrant: 'today' },
  }
}

function buildPending(input: BuildDayGridInput): QuadrantContent {
  const lines: QuadrantLine[] = []
  for (const t of input.overdueTasks) {
    if (lines.length >= MAX_DATA_LINES) break
    lines.push({ text: t.title, tag: 'overdue' })
  }
  if (lines.length < MAX_DATA_LINES && input.inboxCount > 0) {
    lines.push({ text: `${input.inboxCount} inbox item${input.inboxCount === 1 ? '' : 's'}` })
  }
  const total = input.overdueTasks.length + (input.inboxCount > 0 ? 1 : 0)
  return {
    eyebrow: "WHILE IT'S QUIET",
    headline: lines.length === 0 ? 'All caught up' : `${total} thing${total === 1 ? '' : 's'} waiting`,
    lines,
    tap: { quadrant: 'pending' },
  }
}

function buildFamilyQuestion(input: BuildDayGridInput): QuadrantContent {
  return {
    eyebrow: "TONIGHT'S QUESTION",
    headline: input.familyPrompt ? `"${input.familyPrompt}"` : 'No question today',
    lines: [],
    tap: { quadrant: 'familyQuestion' },
  }
}

export function buildDayGrid(input: BuildDayGridInput): DayGridData {
  return {
    upNext: buildUpNext(input),
    today: buildToday(input),
    pending: buildPending(input),
    familyQuestion: buildFamilyQuestion(input),
  }
}
