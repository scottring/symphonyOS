import { Sunrise, CloudSun, Sun, Sunset, MoonStar, Clock, Inbox, type LucideIcon } from 'lucide-react'
import type { DaySection } from '@/lib/timeUtils'
import { getDaySectionLabel, DAY_SECTION_BOUNDS } from '@/lib/timeUtils'

export interface DaySectionMeta {
  label: string
  /** Human time window, '' for sections without one. */
  range: string
  Icon: LucideIcon
}

/** Ranges come from the boundary table so a header can never claim a window
 *  the bucketing code doesn't implement. */
const RANGE: Record<DaySection, string> = {
  allday: '',
  unscheduled: '',
  earlyMorning: '',
  morning: '',
  afternoon: '',
  evening: '',
  night: '',
}
for (const bound of DAY_SECTION_BOUNDS) RANGE[bound.section] = bound.range

/** One glyph per band — adjacent sections must not share an icon, or the day
 *  reads as an undifferentiated run of headers. (morning and afternoon were
 *  both `Sun`.) */
const ICON: Record<DaySection, LucideIcon> = {
  allday: Clock,
  earlyMorning: Sunrise,
  morning: CloudSun,
  afternoon: Sun,
  evening: Sunset,
  night: MoonStar,
  unscheduled: Inbox,
}

export function daySectionMeta(section: DaySection): DaySectionMeta {
  return { label: getDaySectionLabel(section), range: RANGE[section], Icon: ICON[section] }
}
