import { Sunrise, Sun, Moon, Clock, Inbox, type LucideIcon } from 'lucide-react'
import type { DaySection } from '@/lib/timeUtils'
import { getDaySectionLabel } from '@/lib/timeUtils'

export interface DaySectionMeta {
  label: string
  /** Human time window, '' for sections without one. */
  range: string
  Icon: LucideIcon
}

const RANGE: Record<DaySection, string> = {
  morning: '6:00 AM – 12:00 PM',
  afternoon: '12:00 PM – 5:00 PM',
  evening: '5:00 PM – 10:00 PM',
  allday: '',
  unscheduled: '',
}

const ICON: Record<DaySection, LucideIcon> = {
  morning: Sunrise,
  afternoon: Sun,
  evening: Moon,
  allday: Clock,
  unscheduled: Inbox,
}

export function daySectionMeta(section: DaySection): DaySectionMeta {
  return { label: getDaySectionLabel(section), range: RANGE[section], Icon: ICON[section] }
}
