import type { TimelineItem } from '@/types/timeline'

export interface RoomConfig {
  id: string
  name: string
  emoji: string
  color: string
  keywords: string[]
}

// Ordered by specificity — more-specific keywords checked first
const ROOMS: RoomConfig[] = [
  { id: 'kitchen',           name: 'Kitchen',           emoji: '🍳', color: '#F9C35C', keywords: ['kitchen', 'dishes', 'cook', 'dishwasher', 'counter', 'fridge', 'pantry', 'stove', 'oven'] },
  { id: 'front-porch',       name: 'Front Porch',       emoji: '🏡', color: '#6DC4A7', keywords: ['porch', 'front porch', 'front door'] },
  { id: 'front-yard',        name: 'Front Yard',        emoji: '🌿', color: '#6DC4A7', keywords: ['front yard', 'driveway', 'mailbox', 'lawn', 'mow'] },
  { id: 'master-bedroom',    name: 'Master Bedroom',    emoji: '🛏️', color: '#A78BFA', keywords: ['master', 'master bedroom', 'master bed'] },
  { id: 'upstairs-bathroom', name: 'Upstairs Bathroom', emoji: '🛁', color: '#F26E63', keywords: ['upstairs bath', 'bathroom', 'shower', 'toilet', 'tub'] },
  { id: 'kaleb-room',        name: "Kaleb's Room",      emoji: '🎮', color: '#60A5FA', keywords: ['kaleb room', "kaleb's room", 'kaleb bed'] },
  { id: 'ella-room',         name: "Ella's Room",       emoji: '🎨', color: '#F472B6', keywords: ['ella room', "ella's room", 'ella bed'] },
  { id: 'finished-basement', name: 'Finished Basement', emoji: '🎯', color: '#F9C35C', keywords: ['finished basement', 'playroom', 'tv room', 'play room'] },
  { id: 'basement-storage',  name: 'Basement Storage',  emoji: '📦', color: '#9CA3AF', keywords: ['storage', 'basement storage'] },
  { id: 'basement',          name: 'Basement',          emoji: '⬇️', color: '#9CA3AF', keywords: ['basement'] },
  { id: 'laundry',           name: 'Laundry',           emoji: '👕', color: '#60A5FA', keywords: ['laundry', 'washer', 'dryer', 'clothes', 'fold'] },
  { id: 'backyard-office',   name: 'Backyard Office',   emoji: '💻', color: '#A78BFA', keywords: ['office', 'backyard office'] },
  { id: 'office-bathroom',   name: 'Office Bathroom',   emoji: '🚿', color: '#F26E63', keywords: ['office bath', 'office bathroom'] },
]

const GENERAL_ROOM: RoomConfig = {
  id: 'general',
  name: 'General',
  emoji: '🏠',
  color: '#6DC4A7',
  keywords: [],
}

/**
 * Match a task title to a room. Longest keyword match wins to handle
 * specificity (e.g. "finished basement" beats "basement").
 */
export function assignRoom(title: string): RoomConfig {
  const lower = title.toLowerCase()
  let bestMatch: RoomConfig | null = null
  let bestLength = 0

  for (const room of ROOMS) {
    for (const kw of room.keywords) {
      if (lower.includes(kw) && kw.length > bestLength) {
        bestMatch = room
        bestLength = kw.length
      }
    }
  }

  return bestMatch ?? GENERAL_ROOM
}

export interface RoomGroup {
  room: RoomConfig
  tasks: TimelineItem[]
}

/**
 * Group tasks by room. Returns only rooms that have tasks,
 * sorted by task count descending.
 */
export function groupTasksByRoom(tasks: TimelineItem[]): RoomGroup[] {
  const map = new Map<string, { room: RoomConfig; tasks: TimelineItem[] }>()

  for (const task of tasks) {
    const room = assignRoom(task.title)
    const existing = map.get(room.id)
    if (existing) {
      existing.tasks.push(task)
    } else {
      map.set(room.id, { room, tasks: [task] })
    }
  }

  return Array.from(map.values()).sort((a, b) => b.tasks.length - a.tasks.length)
}
