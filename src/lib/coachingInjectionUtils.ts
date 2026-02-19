import type { TimelineItem } from '@/types/timeline'
import type { BlockType } from '@/types/playbook'

/** Extract raw item ID from TimelineItem (strips "task-"/"event-"/"routine-" prefix) */
export function getItemSourceId(item: TimelineItem): string {
  const dashIndex = item.id.indexOf('-')
  return dashIndex >= 0 ? item.id.slice(dashIndex + 1) : item.id
}

/** Get the item type without the "playbook" variant */
export function getItemType(item: TimelineItem): 'task' | 'event' | 'routine' {
  if (item.type === 'playbook') return 'routine' // fallback
  return item.type as 'task' | 'event' | 'routine'
}

/** Format a Date into timeSlot string "HH:MM" */
export function formatTimeSlot(date: Date | null): string {
  if (!date) return '08:00'
  const h = date.getHours().toString().padStart(2, '0')
  const m = date.getMinutes().toString().padStart(2, '0')
  return `${h}:${m}`
}

/** Infer BlockType from item context */
export function inferBlockType(item: TimelineItem): BlockType {
  switch (item.context) {
    case 'family': return 'connection'
    case 'work': return 'solo'
    case 'personal': return 'routine'
    default: return 'routine'
  }
}
