import type { Task } from '@/types/task'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import type { Routine, ActionableInstance } from '@/types/actionable'
import type { TimelineItem } from '@/types/timeline'
import type { DaySection } from '@/lib/timeUtils'
import { taskToTimelineItem, eventToTimelineItem, routineToTimelineItem } from '@/types/timeline'
import { groupByDaySection } from '@/lib/timeUtils'
import { resolveEventContext } from './eventContext'
import { expandRoutineDoses, routineStatusKey } from './doseExpansion'
import { resolveRoutineTime } from './routineTime'
import { groupRoutineSteps, buildCollectionItem } from './routineCollections'

export interface GroupingInput {
  timedTasks: Task[]
  events: CalendarEvent[]
  routines: Routine[]
  viewedDate: Date
  routineStatusMap: Map<string, ActionableInstance>
  eventStatusMap: Map<string, ActionableInstance>
  match: (assignedTo: string | null | undefined, assignedToAll?: readonly string[] | null) => boolean
  eventNotesMap?: Map<string, { notes?: string; assignedTo?: string | null }>
  eventContextOverrides?: Map<string, 'work' | 'family' | 'personal'>
  getDomainForCalendar?: (calendarId?: string, calendarName?: string) => 'work' | 'family' | 'personal' | null
}

/** Ports TodaySchedule.grouped (~830-954) verbatim. */
export function buildGroupedSections(input: GroupingInput): Record<DaySection, TimelineItem[]> {
  const {
    timedTasks, events, routines, viewedDate,
    routineStatusMap, eventStatusMap, match,
    eventNotesMap, eventContextOverrides, getDomainForCalendar,
  } = input

  const taskItems = timedTasks.map(taskToTimelineItem)

  const eventItems = events
    .map((event) => {
      const item = eventToTimelineItem(event)
      const eventId = event.google_event_id || event.id
      const eventNote = eventNotesMap?.get(eventId)
      if (eventNote?.notes) item.notes = eventNote.notes
      if (eventNote?.assignedTo) item.assignedTo = eventNote.assignedTo
      // Resolve event context (override → calendar domain mapping → null) via
      // the shared helper, so this matches HomeView's event domain filter.
      const resolvedContext = resolveEventContext(event, eventContextOverrides, getDomainForCalendar)
      if (resolvedContext) item.context = resolvedContext
      // Check if event is completed via actionable_instances
      const instance = eventStatusMap.get(eventId)
      if (instance?.status === 'completed') item.completed = true
      // Override time if rescheduled (deferred_to on same day)
      if (instance?.deferred_to && instance.status === 'pending') {
        const deferredTime = new Date(instance.deferred_to)
        item.startTime = deferredTime
        // If deferred to a specific time, it's no longer all-day
        if (deferredTime.getHours() !== 0 || deferredTime.getMinutes() !== 0) {
          item.allDay = false
          item.endTime = null // Clear stale endTime from original event
        }
      }
      return item
    })
    .filter((item) => match(item.assignedTo))

  // Partition by collection vs standalone; expand standalone per-dose (unchanged behavior);
  // collections become one routine-collection item via buildCollectionItem.
  const matchedRoutines = routines.filter((routine) => match(routine.assigned_to, routine.assigned_to_all))
  const { collections, standalone } = groupRoutineSteps(matchedRoutines)

  const standaloneItems = standalone.flatMap((routine) =>
    expandRoutineDoses(routine).map((dose) => {
      const item = routineToTimelineItem(routine, viewedDate)
      item.id = dose.slotId
      if (dose.time) {
        const [h, m] = dose.time.split(':').map(Number)
        const start = new Date(viewedDate)
        start.setHours(h, m, 0, 0)
        item.startTime = start
      }
      const instance = routineStatusMap.get(routineStatusKey(routine.id, dose.slotIndex))
      if (instance?.status === 'completed') item.completed = true
      else if (instance?.status === 'skipped') item.skipped = true
      // Time override if rescheduled (only applies to non-dosed routines via bare
      // id). Resolution lives in resolveRoutineTime so this and the time-block
      // grid cannot disagree about where a dropped routine goes — they did, and
      // that is what made a drop on the grid silently revert.
      const resolved = resolveRoutineTime(
        { time_of_day: dose.time ?? routine.time_of_day },
        instance,
        viewedDate,
      )
      if (resolved) item.startTime = resolved
      return item
    }),
  )

  const collectionItems = collections.map((c) => buildCollectionItem(c, viewedDate, routineStatusMap))
  const routineItems = [...standaloneItems, ...collectionItems]

  const allItems = [...taskItems, ...eventItems, ...routineItems]
  const sections = groupByDaySection(allItems)

  // ── Group relocation ─────────────────────────────────────────────────────
  // A wrapper's children are task subtasks (parentTaskId) plus event/routine
  // members (the wrapper's group_members). Members keep their own times, so a
  // member can land in a different day-section than the wrapper; we pull it out
  // and emit it right after the wrapper. Order-independent across sections.
  // (1) Index every item by id and record its original section.
  const byId = new Map<string, TimelineItem>()
  const originalSection = new Map<string, DaySection>()
  for (const key of Object.keys(sections) as DaySection[]) {
    for (const item of sections[key]) {
      byId.set(item.id, item)
      originalSection.set(item.id, key)
    }
  }

  // (2) Mark event/routine members as subtasks of their wrapper.
  const relocatedIds = new Set<string>() // members pulled from their own time slot
  for (const item of byId.values()) {
    if (item.type !== 'task') continue
    const refs = item.originalTask?.groupMembers
    if (!refs?.length) continue
    const wrapperRawId = item.id.replace('task-', '')
    for (const ref of refs) {
      const member = byId.get(`${ref.type}-${ref.id}`)
      if (!member) continue // dangling ref — skip
      member.isSubtask = true
      member.parentTaskId = wrapperRawId
      relocatedIds.add(member.id)
    }
  }

  // (3) Index children (subtasks + members) by wrapper raw id.
  const childrenByParent = new Map<string, TimelineItem[]>()
  for (const item of byId.values()) {
    if (item.isSubtask && item.parentTaskId) {
      const arr = childrenByParent.get(item.parentTaskId) ?? []
      arr.push(item)
      childrenByParent.set(item.parentTaskId, arr)
    }
  }

  // (4) Rebuild each section: wrapper then its children; skip children and
  //     relocated members from their standalone slots.
  const placed = new Set<string>()
  for (const key of Object.keys(sections) as DaySection[]) {
    const result: TimelineItem[] = []
    for (const item of sections[key]) {
      if (item.isSubtask) continue            // emitted under its parent
      if (relocatedIds.has(item.id)) continue // member emitted under its wrapper
      result.push(item)
      const rawId = item.type === 'task' ? item.id.replace('task-', '') : null
      if (rawId) {
        for (const child of childrenByParent.get(rawId) ?? []) {
          if (!placed.has(child.id)) { result.push(child); placed.add(child.id) }
        }
      }
    }
    sections[key] = result
  }

  // (5) Orphan children (parent filtered out / not rendered): restore to their
  //     original section so they never vanish. A relocated member reverts to a
  //     normal standalone row.
  for (const arr of childrenByParent.values()) {
    for (const child of arr) {
      if (placed.has(child.id)) continue
      if (relocatedIds.has(child.id)) { child.isSubtask = false; child.parentTaskId = undefined }
      const sec = originalSection.get(child.id)
      if (sec) sections[sec].push(child)
    }
  }

  return sections
}
