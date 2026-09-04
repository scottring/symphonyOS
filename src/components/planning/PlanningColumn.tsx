import { useMemo, useCallback, useState, type ReactNode } from 'react'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import type { Task } from '@/types/task'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import type { EventNote } from '@/hooks/useEventNotes'
import type { Routine } from '@/types/actionable'
import type { FamilyMember } from '@/types/family'
import { PlanningTimeSlot } from './PlanningTimeSlot'
import { PlanningTaskCard } from './PlanningTaskCard'
import { PlanningEventBlock, PLACED_EVENT_DRAG_PREFIX } from './PlanningEventBlock'
import { PlanningRoutineBlock, PLACED_ROUTINE_DRAG_PREFIX } from './PlanningRoutineBlock'
import { layoutLanes, type Lane } from './overlapLanes'
import { resolveRoutineTime } from '@/lib/today/routineTime'
import type { ActionableInstance } from '@/types/actionable'
import { ALL_DAY_LANE_HEIGHT, allDayLaneCapacity, allDayLaneHeight } from '@/lib/planning/allDayLane'
import { TaskKindBadge } from '@/components/task/TaskKindBadge'

// Max side-by-side lanes before overlapping items collapse into a "+N" chip.
const MAX_LANES = 4

// "8:00 AM" style label from minutes-since-day-start.
function minutesToLabel(minutesFromStart: number, dayStartHour: number): string {
  const total = dayStartHour * 60 + minutesFromStart
  const hour24 = Math.floor(total / 60)
  const minute = total % 60
  const period = hour24 >= 12 ? 'PM' : 'AM'
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12
  return minute === 0 ? `${hour12} ${period}` : `${hour12}:${String(minute).padStart(2, '0')} ${period}`
}

// Side-by-side lane → absolute-position style. Lanes let time-overlapping items
// sit next to each other instead of stacking. Defaults to one full-width lane.
function laneStyle(lane: Lane | undefined, top: number, height: number, raised: boolean) {
  const totalColumns = lane?.totalColumns ?? 1
  const column = lane?.column ?? 0
  const widthPercent = 100 / totalColumns
  const leftPercent = column * widthPercent
  return {
    top: `${top}px`,
    height: `${height}px`,
    left: `calc(4px + ${leftPercent}%)`,
    width: `calc(${widthPercent}% - 8px)`,
    zIndex: raised ? 30 : 10,
  }
}

interface TimeLabel {
  hour: number
  minute: number
  label: string
}

interface PlanningColumnProps {
  date: Date
  tasks: Task[]
  events: CalendarEvent[]
  routines: Routine[]
  /** Per-routine instance for THIS date, keyed by routine id. Carries the
   *  one-day time override a drop writes; without it the grid renders every
   *  dropped routine back at its recurrence-rule time. */
  routineInstances?: Map<string, ActionableInstance>
  /** Incomplete, isAllDay tasks scheduled on this exact day — rendered as
   *  fixed-height chips in the all-day lane, never in the hour grid below. */
  allDayTasks?: Task[]
  /** Whether this event's calendar accepts writes. Day-grain columns only
   *  offer a drag when it returns true — Google 403s writes to a reader-role
   *  share. Omitted = nothing is draggable, which is the safe default for
   *  callers that don't know the calendar roles. */
  canMoveEvent?: (event: CalendarEvent) => boolean
  /** All-day lane height, uniform across the grid (the busiest day sets it).
   *  Defaults to the one-row height for callers that don't compute it. */
  laneHeight?: number
  familyMembers: FamilyMember[]
  eventNotesMap?: Map<string, EventNote>
  timeLabels: TimeLabel[]
  slotHeight: number
  dayStartHour: number
  /** Week→Today seam: when present, the day header renders a small "→ day"
   *  button that jumps to this date on the Today rung. */
  onOpenDay?: (date: Date) => void
  /** Click-to-create (week-grid-click spec): fires when an empty hour slot is
   *  clicked, with the slot's date/time and the clicked DOM node (used to
   *  anchor the quick-create popover). Undefined = slots are not clickable. */
  onSlotClick?: (dateKey: string, hour: number, minute: number, anchorEl: HTMLElement) => void
  /** Day grain: the week rung places into a DAY, so no hour axis is drawn and
   *  the column itself is the unit. See PlanningSession's placementGrain. */
  dayGrain?: boolean
  /** Side-by-side lane cap before overlapping items collapse into a "+N"
   *  chip. Wide columns (few days on the grid) can afford more. */
  maxLanes?: number
  /** Slot ids to tint as suggested drop targets during a task drag. */
  suggestedSlots?: Set<string> | null
  onCompleteTask?: (id: string) => void
  onNotThisWeek?: (id: string) => void
}

export function PlanningColumn({
  date,
  tasks,
  events,
  routines,
  routineInstances,
  allDayTasks = [],
  canMoveEvent,
  laneHeight = ALL_DAY_LANE_HEIGHT,
  familyMembers,
  eventNotesMap,
  timeLabels,
  slotHeight,
  dayStartHour,
  onOpenDay,
  onSlotClick,
  dayGrain = false,
  maxLanes = MAX_LANES,
  suggestedSlots,
  onCompleteTask,
  onNotThisWeek,
}: PlanningColumnProps) {
  // Helper to find family member by ID
  const getMember = useCallback((id: string | null | undefined) => {
    if (!id) return undefined
    return familyMembers.find(m => m.id === id)
  }, [familyMembers])

  // Click-to-front: overlapping placed cards (esp. full-width routines/events)
  // otherwise hide each other. Clicking one raises it above the rest.
  const [raisedId, setRaisedId] = useState<string | null>(null)
  const dateKey = formatDateKey(date)
  const isToday = useMemo(() => {
    const today = new Date()
    return (
      date.getFullYear() === today.getFullYear() &&
      date.getMonth() === today.getMonth() &&
      date.getDate() === today.getDate()
    )
  }, [date])

  // Calculate positions for placed tasks. Overlap lanes are computed once across
  // ALL placed item types below, so we only compute position + time range here.
  const placedTasks = useMemo(() => {
    return tasks.map((task) => {
      if (!task.scheduledFor) return null

      const taskDate = new Date(task.scheduledFor)
      const hour = taskDate.getHours()
      const minute = taskDate.getMinutes()

      const minutesFromStart = (hour - dayStartHour) * 60 + minute
      const top = (minutesFromStart / 30) * slotHeight

      const duration = task.estimatedDuration || 30
      const height = (duration / 30) * slotHeight

      return {
        task,
        top,
        height,
        startMinutes: minutesFromStart,
        endMinutes: minutesFromStart + duration,
      }
    }).filter(Boolean) as {
      task: Task
      top: number
      height: number
      startMinutes: number
      endMinutes: number
    }[]
  }, [tasks, slotHeight, dayStartHour])

  // Calculate positions for events
  const placedEvents = useMemo(() => {
    return events.map((event) => {
      const startTimeStr = event.start_time || event.startTime
      const endTimeStr = event.end_time || event.endTime

      if (!startTimeStr) return null

      const startDate = new Date(startTimeStr)
      const endDate = endTimeStr ? new Date(endTimeStr) : null

      const startHour = startDate.getHours()
      const startMinute = startDate.getMinutes()

      // Calculate top position
      const minutesFromStart = (startHour - dayStartHour) * 60 + startMinute
      const top = (minutesFromStart / 30) * slotHeight

      // Calculate height based on duration
      let durationMinutes = 30 // Default 30 min
      if (endDate) {
        durationMinutes = (endDate.getTime() - startDate.getTime()) / 60000
      }
      const height = (durationMinutes / 30) * slotHeight

      return {
        event,
        top,
        height: Math.max(height, slotHeight), // Minimum 1 slot
        startMinutes: minutesFromStart,
        endMinutes: minutesFromStart + Math.max(durationMinutes, 30),
      }
    }).filter(Boolean) as { event: CalendarEvent; top: number; height: number; startMinutes: number; endMinutes: number }[]
  }, [events, slotHeight, dayStartHour])

  // Calculate positions for routines.
  //
  // Position comes from resolveRoutineTime, NOT from time_of_day: a drop writes
  // a one-day override to the instance rather than rewriting the recurrence
  // rule, so reading time_of_day alone renders every dropped routine back at
  // its old slot — or, for the untimed routines the drawer offers, nowhere.
  const placedRoutines = useMemo(() => {
    return routines
      .map((routine) => {
        const start = resolveRoutineTime(routine, routineInstances?.get(routine.id), date)
        if (!start) return null // untimed today — belongs in the drawer, not the grid

        const minutesFromStart =
          (start.getHours() - dayStartHour) * 60 + start.getMinutes()
        const top = (minutesFromStart / 30) * slotHeight

        return {
          routine,
          top,
          height: slotHeight, // Routines are 30 min by default
          startMinutes: minutesFromStart,
          endMinutes: minutesFromStart + 30,
        }
      })
      .filter(Boolean) as { routine: Routine; top: number; height: number; startMinutes: number; endMinutes: number }[]
  }, [routines, routineInstances, date, slotHeight, dayStartHour])

  // Single overlap pass across ALL placed items (tasks + events + routines) so
  // anything sharing a time gets its own side-by-side lane regardless of type.
  // Lanes are capped (MAX_LANES); excess items collapse into a "+N" chip so the
  // visible cards never shred into unreadable slivers.
  const layout = useMemo(() => {
    return layoutLanes([
      ...placedTasks.map((p) => ({ id: p.task.id, startMinutes: p.startMinutes, endMinutes: p.endMinutes })),
      ...placedEvents.map((p) => ({ id: p.event.id, startMinutes: p.startMinutes, endMinutes: p.endMinutes })),
      ...placedRoutines.map((p) => ({ id: p.routine.id, startMinutes: p.startMinutes, endMinutes: p.endMinutes })),
    ], maxLanes)
  }, [placedTasks, placedEvents, placedRoutines, maxLanes])

  // Look up a hidden item's label + time so the "+N" popover can list them —
  // plus the drag id its full-size block would use, so a popover row is
  // draggable through the SAME drop branches (bare task id / event- /
  // placed-routine- prefixes; null = not draggable, e.g. a reader-role event).
  const itemInfo = useMemo(() => {
    const m = new Map<string, { title: string; time: string; dragId: string | null }>()
    for (const { task, startMinutes } of placedTasks) {
      m.set(task.id, { title: task.title, time: minutesToLabel(startMinutes, dayStartHour), dragId: task.id })
    }
    for (const { event, startMinutes } of placedEvents) {
      m.set(event.id, {
        title: event.title,
        time: minutesToLabel(startMinutes, dayStartHour),
        dragId: (canMoveEvent ? canMoveEvent(event) : true) ? `${PLACED_EVENT_DRAG_PREFIX}${event.id}` : null,
      })
    }
    for (const { routine, startMinutes } of placedRoutines) {
      m.set(routine.id, { title: routine.name, time: minutesToLabel(startMinutes, dayStartHour), dragId: `${PLACED_ROUTINE_DRAG_PREFIX}${routine.id}` })
    }
    return m
  }, [placedTasks, placedEvents, placedRoutines, dayStartHour, canMoveEvent])

  // Which "+N" chip's reveal popover is open.
  const [openChipId, setOpenChipId] = useState<string | null>(null)

  return (
    <div
      data-testid={`day-column-${dateKey}`}
      className={`flex-1 border-r border-neutral-200 ${
        dayGrain ? 'min-w-0' : 'min-w-[200px]'
      } ${isToday ? 'bg-primary-50/30' : ''}`}
    >
      {/* Day header */}
      <div
        className={`h-12 px-3 flex items-center justify-between gap-2 border-b border-neutral-200 sticky top-0 z-10 ${
          isToday ? 'bg-primary-50' : 'bg-neutral-50'
        }`}
      >
        <div className="flex flex-col justify-center min-w-0">
          <span className="text-sm font-medium text-neutral-700">
            {date.toLocaleDateString('en-US', { weekday: 'short' })}
          </span>
          <span
            className={`text-xs ${
              isToday ? 'text-primary-600 font-semibold' : 'text-neutral-500'
            }`}
          >
            {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
        </div>
        {onOpenDay && (
          <button
            type="button"
            onClick={() => onOpenDay(date)}
            aria-label={`Open ${date.toLocaleDateString('en-US', { weekday: 'short' })} on Today`}
            title="Open this day on Today"
            className="shrink-0 text-[11px] font-medium text-neutral-400 hover:text-primary-700 transition-colors"
          >
            → day
          </button>
        )}
      </div>

      {/* Day grain: the week rung places into a DAY, so the column IS the drop
          target and there is no hour axis to draw. Everything written here is
          all-day by construction (PlanningSession stamps isAllDay in this
          mode), so the lane grows to hold the day instead of sitting above a
          6 AM–10 PM grid whose clicked hour was, in the old code's own words,
          "deliberately discarded". Timed calendar events still show, as chips
          in time order — they're facts about the day, not placements. */}
      {dayGrain ? (
        <div
          className={`flex min-h-[220px] flex-col p-2 ${onSlotClick ? 'cursor-pointer' : ''}`}
          // Click-to-create survives the loss of the hour grid — the DAY is the
          // click target now, which is the same decision the drop makes. Hour
          // and minute are passed as 0: PlanningSession's day grain floors to
          // midnight regardless, and there is no longer a clicked hour to
          // "deliberately discard".
          onClick={onSlotClick ? (e) => {
            if (e.target !== e.currentTarget) return
            onSlotClick(dateKey, 0, 0, e.currentTarget)
          } : undefined}
        >
          {/* Sized to hold every item: a "+N" collapse here would hide a
              placement the user just made, which reads as data loss. */}
          <AllDayLaneCell
            dateKey={dateKey}
            tasks={allDayTasks}
            onChipClick={(taskId) => setRaisedId(taskId)}
            laneHeight={allDayLaneHeight(allDayTasks.length)}
            fluid
          >
          {/* A task that still carries a clock time (written before this rung
              stopped drawing hours, or dated from Today) must NOT vanish just
              because there is no hour row to place it on — it renders as a chip
              in time order. Dropping it here re-writes it all-day.
              It renders through the SAME AllDayChip as the lane's own tasks:
              these were once a plain button, which made every timed task on the
              week grid immovable — no drag to another day, and no drag back to
              the shelf. A task's mobility must not depend on whether it happens
              to carry an hour. */}
          {placedTasks.map(({ task }) => (
            <AllDayChip key={task.id} task={task} onClick={() => setRaisedId(task.id)} />
          ))}
          {placedEvents.map(({ event }) => (
            <EventDayChip
              key={event.id}
              event={event}
              movable={canMoveEvent ? canMoveEvent(event) : false}
            />
          ))}
          {placedRoutines.map(({ routine }) => (
            <div
              key={routine.id}
              className="truncate rounded bg-neutral-50 px-1.5 py-1 text-[10.5px] text-neutral-500"
              title={routine.name}
            >
              {routine.name}
            </div>
          ))}
          </AllDayLaneCell>
        </div>
      ) : (
      <>
      {/* All-day lane — same height in every column (the grid's busiest day
          sets it), so the hour rows below stay aligned across days. */}
      <AllDayLaneCell
        dateKey={dateKey}
        tasks={allDayTasks}
        onChipClick={(taskId) => setRaisedId(taskId)}
        laneHeight={laneHeight}
      />

      {/* Time slots (drop targets) */}
      <div className="relative">
        {/* Background slots - these are the drop targets */}
        {timeLabels.map(({ hour, minute }) => (
          <PlanningTimeSlot
            key={`${dateKey}-${hour}-${minute}`}
            dateKey={dateKey}
            hour={hour}
            minute={minute}
            height={slotHeight}
            onSlotClick={onSlotClick ? (e) => onSlotClick(dateKey, hour, minute, e.currentTarget) : undefined}
            suggested={suggestedSlots?.has(`slot-${dateKey}-${hour}-${minute}`) ?? false}
          />
        ))}

        {/* Placed tasks — laned by the unified overlap pass (skip overflow) */}
        {placedTasks.filter(({ task }) => layout.lanes.has(task.id)).map(({ task, top, height }) => (
          <div
            key={task.id}
            data-testid={`placed-${task.id}`}
            onClick={() => setRaisedId(task.id)}
            className="absolute"
            style={laneStyle(layout.lanes.get(task.id), top, height, raisedId === task.id)}
          >
            <PlanningTaskCard
              task={task}
              isPlaced
              assignee={getMember(task.assignedTo)}
              onComplete={onCompleteTask}
              onNotThisWeek={onNotThisWeek}
            />
          </div>
        ))}

        {/* Placed events */}
        {placedEvents.filter(({ event }) => layout.lanes.has(event.id)).map(({ event, top, height }) => {
          const eventId = event.google_event_id || event.id
          const eventNote = eventNotesMap?.get(eventId)
          const eventAssignee = eventNote?.assignedTo ? getMember(eventNote.assignedTo) : undefined
          return (
            <div
              key={event.id}
              data-testid={`placed-${event.id}`}
              onClick={() => setRaisedId(event.id)}
              className="absolute cursor-pointer"
              style={laneStyle(layout.lanes.get(event.id), top, height, raisedId === event.id)}
            >
              <PlanningEventBlock
                event={event}
                height={height}
                assignee={eventAssignee}
                movable={canMoveEvent ? canMoveEvent(event) : true}
              />
            </div>
          )
        })}

        {/* Placed routines */}
        {placedRoutines.filter(({ routine }) => layout.lanes.has(routine.id)).map(({ routine, top, height }) => (
          <div
            key={routine.id}
            data-testid={`placed-${routine.id}`}
            onClick={() => setRaisedId(routine.id)}
            className="absolute cursor-pointer"
            style={laneStyle(layout.lanes.get(routine.id), top, height, raisedId === routine.id)}
          >
            <PlanningRoutineBlock routine={routine} assignee={getMember(routine.assigned_to)} />
          </div>
        ))}

        {/* "+N" overflow chips — collapse items beyond the lane cap. Click to
            reveal the hidden items (title + time) in a popover. */}
        {layout.chips.map((chip) => {
          const top = (chip.startMinutes / 30) * slotHeight
          const open = openChipId === chip.id
          return (
            <div
              key={chip.id}
              className="absolute"
              style={laneStyle({ column: chip.column, totalColumns: chip.totalColumns }, top, slotHeight, open)}
            >
              <button
                type="button"
                onClick={() => setOpenChipId(open ? null : chip.id)}
                aria-label={`${chip.itemIds.length} more overlapping items`}
                className="h-full w-full rounded-lg bg-neutral-200 text-neutral-700 text-xs font-semibold hover:bg-neutral-300 transition-colors flex items-center justify-center"
              >
                +{chip.itemIds.length}
              </button>
              {open && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setOpenChipId(null)} />
                  <div className="absolute right-0 top-full mt-1 z-50 w-56 max-h-64 overflow-y-auto rounded-xl bg-white shadow-lg border border-neutral-200 p-1.5">
                    <div className="px-2 py-1 text-[10px] uppercase tracking-wider font-semibold text-neutral-400">
                      {chip.itemIds.length} more at this time
                    </div>
                    {chip.itemIds.map((id) => {
                      const info = itemInfo.get(id)
                      return (
                        <OverflowRow
                          key={id}
                          dragId={info?.dragId ?? null}
                          title={info?.title ?? 'Untitled'}
                          time={info?.time ?? ''}
                        />
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>
      </>
      )}
    </div>
  )
}

// One row inside the "+N" reveal popover. Draggable with the SAME id its
// full-size block would use, so PlanningSession's existing drop branches
// (task / event- / placed-routine-) place it with zero new handling — an item
// hidden behind the cap is still rearrangeable. dragId null = display-only
// (e.g. an event on a calendar Google won't let us write).
function OverflowRow({ dragId, title, time }: { dragId: string | null; title: string; time: string }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: dragId ?? `overflow-static-${title}`,
    disabled: !dragId,
  })
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...(dragId ? listeners : {})}
      className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded-md hover:bg-neutral-50 ${
        dragId ? 'cursor-grab active:cursor-grabbing touch-none' : ''
      } ${isDragging ? 'opacity-40' : ''}`}
    >
      <span className="text-sm text-neutral-800 truncate">{title}</span>
      <span className="text-[10px] text-neutral-400 shrink-0">{time}</span>
    </div>
  )
}

interface AllDayLaneCellProps {
  dateKey: string
  tasks: Task[]
  onChipClick: (taskId: string) => void
  /** Uniform across the grid — the busiest day sets it (see allDayLaneHeight). */
  laneHeight: number
  /** Day grain: the lane IS the column — it fills the full height so the whole
   *  column is the drop target, and nothing collapses into a "+N" (hiding a
   *  placement the user just made reads as data loss). A 28px strip at the top
   *  of a 220px column is technically a drop target and practically unhittable,
   *  which is how the week rung briefly stopped accepting drags at all. */
  fluid?: boolean
  /** Rendered inside the droppable, below the chips — in day grain the day's
   *  timed items live here so they sit within the drop area, not beside it. */
  children?: ReactNode
}

// The all-day lane cell for one column. Its own component so the droppable
// hook stays unconditional (every column always registers a lane, even with
// zero tasks) — keeping hook usage clean rather than conditionally calling
// useDroppable inside PlanningColumn's body.
function AllDayLaneCell({ dateKey, tasks, onChipClick, laneHeight, fluid = false, children }: AllDayLaneCellProps) {
  const { isOver, setNodeRef } = useDroppable({ id: `allday-${dateKey}` })
  const capacity = allDayLaneCapacity(laneHeight)
  // One cell short of capacity when there's a surplus, so the "+N" has a slot of
  // its own rather than displacing a chip and undercounting. In fluid (day
  // grain) mode nothing collapses: the column IS the day's list, and hiding a
  // placement behind a "+N" is the failure mode that reads as data loss.
  const overflowing = !fluid && tasks.length > capacity
  const visible = overflowing ? tasks.slice(0, capacity - 1) : tasks
  const overflow = tasks.length - visible.length

  return (
    <div
      ref={setNodeRef}
      data-testid="allday-lane"
      style={fluid ? undefined : { height: laneHeight }}
      className={`px-1.5 py-1 grid content-start gap-1 transition-colors ${
        fluid
          ? 'grid-cols-1 flex-1 min-h-[200px] rounded-md ring-1 ring-transparent'
          : 'grid-cols-1 border-b border-neutral-200 overflow-hidden'
      } ${isOver ? (fluid ? 'bg-primary-100 ring-primary-300' : 'bg-primary-100') : fluid ? 'bg-transparent' : 'bg-neutral-50/60'}`}
    >
      {visible.map((task) => (
        <AllDayChip key={task.id} task={task} onClick={() => onChipClick(task.id)} />
      ))}
      {overflow > 0 && (
        <span className="min-h-8 grid place-items-center text-[10px] font-semibold text-neutral-500 bg-neutral-200 rounded-md px-1.5">
          +{overflow}
        </span>
      )}
      {children}
    </div>
  )
}

interface AllDayChipProps {
  task: Task
  onClick: () => void
}

// A calendar event in a day-grain column. Draggable ONLY when Symphony can
// actually write to its calendar: Google 403s writes to a `reader`-role share
// (Scott's work calendar was exactly that — see gcal read-only history), and a
// grip that always fails is worse than no grip. A view-only event keeps the
// old flat look and says why on hover.
//
// `event-<id>` drag id, matching PlanningEventBlock, so the existing
// PLACED_EVENT branch in handleDragEnd picks it up.
function EventDayChip({ event, movable }: { event: CalendarEvent; movable: boolean }) {
  // Hooks can't be conditional; dnd-kit's own `disabled` is the supported way
  // to render a non-draggable instance.
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `${PLACED_EVENT_DRAG_PREFIX}${event.id}`,
    disabled: !movable,
  })

  if (isDragging) {
    return <div ref={setNodeRef} className="h-5 w-full rounded bg-neutral-100 border border-dashed border-neutral-300 opacity-50" />
  }

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 100 }
    : undefined

  return (
    <div
      ref={movable ? setNodeRef : undefined}
      data-testid="event-day-chip"
      style={style}
      {...(movable ? attributes : {})}
      {...(movable ? listeners : {})}
      title={movable ? event.title : `${event.title} — this calendar is shared with you view-only, so it can't be moved here`}
      className={`truncate rounded bg-neutral-100 px-1.5 py-1 text-[10.5px] text-neutral-600 ${
        movable ? 'cursor-grab active:cursor-grabbing touch-none' : ''
      }`}
    >
      {event.title}
    </div>
  )
}

// Compact, truncating, draggable chip for a lane task. Bare `task.id` as the
// draggable id — the existing slot/drawer/allday drop branches in
// PlanningSession.handleDragEnd all key off the bare task id already, so lane
// chips work with those branches with no new drop-handling code.
function AllDayChip({ task, onClick }: AllDayChipProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id })

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 100 }
    : undefined

  if (isDragging) {
    return <div ref={setNodeRef} className="min-h-8 w-full rounded-md bg-primary-100 border border-dashed border-primary-300 opacity-50" />
  }

  return (
    <button
      ref={setNodeRef}
      type="button"
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      title={task.title}
      className="group/chip flex min-h-8 w-full min-w-0 items-start gap-1 rounded-md border border-primary-200 bg-primary-50 px-1.5 py-1 text-left text-[10.5px] font-medium leading-tight text-primary-800 cursor-grab active:cursor-grabbing touch-none hover:border-primary-300 hover:bg-primary-100/70 transition-colors"
    >
      <TaskKindBadge
        title={task.title}
        category={task.category}
        note={task.notes}
        id={task.id}
        className="mt-0.5"
      />
      <span className="min-w-0 overflow-hidden break-words [display:-webkit-box] [-webkit-line-clamp:2] [-webkit-box-orient:vertical]">
        {task.title}
      </span>
    </button>
  )
}

// Helper to format date as YYYY-MM-DD for keys
function formatDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
