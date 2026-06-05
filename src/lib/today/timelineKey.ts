export type TimelineRef = { type: 'task' | 'event' | 'routine'; id: string }

export function timelineKey(ref: TimelineRef): string {
  return `${ref.type}-${ref.id}`
}

export function parseTimelineKey(key: string): TimelineRef | null {
  const i = key.indexOf('-')
  if (i === -1) return null
  const type = key.slice(0, i)
  if (type !== 'task' && type !== 'event' && type !== 'routine') return null
  return { type, id: key.slice(i + 1) }
}

export interface PartitionedSelection {
  taskIds: string[]
  eventIds: string[]
  routineIds: string[]
}

export function partitionSelection(keys: Iterable<string>): PartitionedSelection {
  const out: PartitionedSelection = { taskIds: [], eventIds: [], routineIds: [] }
  for (const key of keys) {
    const ref = parseTimelineKey(key)
    if (!ref) continue
    if (ref.type === 'task') out.taskIds.push(ref.id)
    else if (ref.type === 'event') out.eventIds.push(ref.id)
    else out.routineIds.push(ref.id)
  }
  return out
}
