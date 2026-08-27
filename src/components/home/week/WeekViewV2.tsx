import { useMemo, useState, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragMoveEvent,
} from '@dnd-kit/core'
import type { Task } from '@/types/task'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import { useGoogleCalendar } from '@/hooks/useGoogleCalendar'
import type { Routine, ActionableInstance } from '@/types/actionable'
import { useSupabaseTasks } from '@/hooks/useSupabaseTasks'
import { taskToTimelineItem, eventToTimelineItem, routineToTimelineItem } from '@/types/timeline'
import { WeekGrid, dayKey } from './WeekGrid'
import { WeekAllDayChip } from './WeekAllDayChip'
import { WeekEventBlock } from './WeekEventBlock'
import { layoutWeekLanes, type PlacedItem } from './layoutLanes'
import { useWeekDragDrop } from './useWeekDragDrop'
import { useGridCreate } from './useGridCreate'
import { SlotQuickCreatePopover, type CreateType } from './SlotQuickCreatePopover'
import { Eye, EyeOff } from 'lucide-react'
import { readHideRoutines, writeHideRoutines, onHideRoutinesChange } from '@/lib/hideRoutinesSignal'
import { resolveRoutine } from '@/lib/routineUtils'
import type { AssigneeFilter } from '@/lib/today/types'
import type { PlanningDomain } from '@/lib/today/domainFilter'

const EDGE_PX = 40

interface WeekViewV2Props {
  tasks: Task[]
  events: CalendarEvent[]
  routines: Routine[]
  // dateInstances is reserved for future instance-completion overlays;
  // not yet consumed in rendering but kept in the API for Task 12 wiring.
  dateInstances: ActionableInstance[]
  weekStart: Date
  onWeekChange: (d: Date) => void
  selectedAssignee?: string | null
  /** Multi-select assignee filter (rung 5). Superset of `selectedAssignee`;
   *  when provided it drives resolveRoutine directly. */
  selectedAssignees?: AssigneeFilter
  /** The active domain lens (rung 4). Defaults to 'universal' (no-op). */
  currentDomain?: PlanningDomain
  onSelectItem: (id: string | null) => void
  onUpdateTask: (taskId: string, updates: Partial<Task>) => Promise<void> | void
  onUpdateEvent: (eventId: string, updates: { startTime: Date; endTime: Date }) => Promise<void> | void
  onUpdateRoutine: (routineId: string, updates: Partial<Routine>) => Promise<void> | void
  /** Number of day columns. 5 = workweek (Mon-Fri), 7 = full week. Default 7. */
  dayCount?: 5 | 7
  /** From HomeView's useUndo. Called after successful mutations to surface an undo toast. */
  pushAction?: (message: string, undo: () => void) => void
}

export function WeekViewV2(props: WeekViewV2Props) {
  const {
    tasks,
    events,
    routines,
    weekStart,
    onWeekChange,
    selectedAssignees,
    currentDomain = 'universal',
    onSelectItem,
    onUpdateTask,
    onUpdateEvent,
    onUpdateRoutine,
    dayCount = 7,
    pushAction,
  } = props

  // Create-gesture wiring
  const navigate = useNavigate()
  const { addTask, deleteTask } = useSupabaseTasks()
  const { createEvent, deleteEvent } = useGoogleCalendar()
  const gridCreate = useGridCreate()

  const handleCreate = useCallback(
    async (params: { type: CreateType; title: string; startTime: Date; endTime: Date }) => {
      if (params.type === 'task') {
        const newId = await addTask(params.title, undefined, undefined, params.startTime, { isAllDay: false })
        if (newId) {
          pushAction?.(`Created "${params.title}"`, () => {
            void deleteTask(newId)
          })
        }
      } else if (params.type === 'event') {
        const result = await createEvent({
          title: params.title,
          startTime: params.startTime,
          endTime: params.endTime,
        })
        if (result?.id) {
          pushAction?.(`Created "${params.title}"`, () => {
            void deleteEvent({ eventId: result.id })
          })
        }
      } else if (params.type === 'routine') {
        // Routines need a recurrence pattern that doesn't fit the popover.
        // Build an NL string from the slot's title/weekday/time and navigate
        // to /routines/new with it as initial input — parseRoutine handles
        // the structured conversion. e.g., "Yoga every tuesday at 9:00am"
        const weekday = params.startTime
          .toLocaleDateString('en-US', { weekday: 'long' })
          .toLowerCase()
        const timeStr = params.startTime
          .toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
          })
          .toLowerCase()
          .replace(/\s/g, '') // "9:00am" not "9:00 AM"
        const initialNl = `${params.title} every ${weekday} at ${timeStr}`
        navigate(`/routines/new?initial=${encodeURIComponent(initialNl)}`)
      }
      gridCreate.close()
    },
    [addTask, deleteTask, createEvent, deleteEvent, navigate, gridCreate, pushAction],
  )

  // Drag-drop wiring
  const drag = useWeekDragDrop({
    weekStart,
    onWeekChange,
    onUpdateTask,
    onUpdateEvent,
    onUpdateRoutine,
    tasks,
    events,
    routines,
    dayCount,
    pushAction,
  })

  // Sensor with activation constraint — disambiguates click vs drag.
  // Drag activates only after pointer moves 8px from origin; below that,
  // onClick/onPointerUp fire normally on the block.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  )

  // Edge-hover state for cross-week auto-advance
  const [edgeHover, setEdgeHover] = useState<'left' | 'right' | null>(null)

  const handleDragMove = (e: DragMoveEvent) => {
    // activatorEvent is the pointer-down that started the drag; adding delta.x
    // gives the current pointer x position relative to the page.
    const activator = e.activatorEvent as PointerEvent | undefined
    const rect = (activator?.target as Element | null)
      ?.closest('[data-week-bounds]')
      ?.getBoundingClientRect()
    if (!rect) return

    const currentX = (activator?.clientX ?? 0) + (e.delta?.x ?? 0)

    if (currentX > rect.right - EDGE_PX) {
      if (edgeHover !== 'right') {
        setEdgeHover('right')
        drag.notifyEdge('right')
      }
    } else if (currentX < rect.left + EDGE_PX) {
      if (edgeHover !== 'left') {
        setEdgeHover('left')
        drag.notifyEdge('left')
      }
    } else if (edgeHover !== null) {
      setEdgeHover(null)
      drag.notifyEdge(null)
    }
  }

  // Week bounds: [weekStart, weekStart + dayCount days)
  const weekEnd = useMemo(() => {
    const e = new Date(weekStart)
    e.setDate(e.getDate() + dayCount)
    return e
  }, [weekStart, dayCount])

  const inWeek = (d: Date) => d >= weekStart && d < weekEnd

  // Tasks that have a specific start time (go into the time grid)
  const scheduledTasks = useMemo(
    () => tasks.filter((t) => t.scheduledFor && inWeek(t.scheduledFor) && !t.isAllDay),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tasks, weekStart],
  )

  // All-day tasks, grouped by day so each renders in the grid's all-day row
  // under its actual day column. Completed tasks are excluded so finishing one
  // elsewhere (Today, detail panel) removes its chip here.
  const allDayByDay = useMemo(() => {
    const map = new Map<string, Task[]>()
    for (const t of tasks) {
      if (!t.scheduledFor || !t.isAllDay || t.completed) continue
      if (!inWeek(t.scheduledFor)) continue
      const key = dayKey(t.scheduledFor)
      const arr = map.get(key)
      if (arr) arr.push(t)
      else map.set(key, [t])
    }
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, weekStart])

  const weekEvents = useMemo(
    () =>
      events.filter((ev) => {
        const startStr =
          (ev as { start_time?: string }).start_time ??
          (ev as { startTime?: string }).startTime
        return startStr ? inWeek(new Date(startStr)) : false
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [events, weekStart],
  )

  // Respect the app-wide 'Hide daily activities' toggle (same localStorage key
  // TodayView uses). When true, routines are omitted from the grid; tasks and
  // events still render. Reactive via in-tab custom event + cross-tab storage event.
  const [hideRoutines, setHideRoutines] = useState<boolean>(() => readHideRoutines())

  useEffect(() => onHideRoutinesChange(setHideRoutines), [])

  // Convert to TimelineItems for grid rendering.
  // Routines are expanded into 7 day-instances (render-only; WeekEventBlock
  // sets disabled:true for isRoutine so they never become drag sources).
  // Keys for routine day-instances are suffixed with the day-index to avoid
  // duplicate-key warnings from routineToTimelineItem returning the same id
  // for every day.
  const allItems = useMemo(() => {
    const taskItems = scheduledTasks.map(taskToTimelineItem)
    const eventItems = weekEvents.map(eventToTimelineItem)
    // One rule for routine visibility, shared with Today and the wall. Rung 2
    // is evaluated per day below, so the pool here is resolved per date rather
    // than once for the week.
    const routineItems = routines.flatMap((r) =>
      Array.from({ length: dayCount }, (_, i) => {
        const d = new Date(weekStart)
        d.setDate(d.getDate() + i)
        if (!resolveRoutine(r, { date: d, member: selectedAssignees, prefs: { hideRoutines, domain: currentDomain } }).shows) {
          return null
        }
        return { ...routineToTimelineItem(r, d), id: `routine-${r.id}-day${i}` }
      }).filter((item): item is NonNullable<typeof item> => item !== null),
    )

    const blocks = [...taskItems, ...eventItems, ...routineItems]

    // Keep the actively-dragged task/event mounted even if cross-week auto-
    // advance moved its scheduledFor out of the visible range. Without this,
    // dnd-kit loses the draggable's data registration and the drop is a no-op.
    // WeekEventBlock calls useDraggable before its placement guard, so the
    // drag data stays registered even when computePlacement returns null.
    // WeekGrid's overflow-hidden clips the off-grid render; DragOverlay still
    // shows the floating chip the user sees.
    const activeId = drag.activeDragId
    if (activeId) {
      // Drag ids are 'block:<itemId>' for tasks/events, 'block-routine:<itemId>'
      // for routines. Routines are not draggable, so only handle task/event.
      if (activeId.startsWith('block:')) {
        const itemId = activeId.slice('block:'.length)
        if (!blocks.find((b) => b.id === itemId)) {
          if (itemId.startsWith('task-')) {
            const taskId = itemId.slice('task-'.length)
            const task = tasks.find((t) => t.id === taskId)
            if (task) blocks.push(taskToTimelineItem(task))
          } else if (itemId.startsWith('event-')) {
            const event = events.find((ev) => {
              const id = ev.google_event_id || ev.id
              return `event-${id}` === itemId
            })
            if (event) blocks.push(eventToTimelineItem(event))
          }
        }
      }
    }

    return blocks
  }, [scheduledTasks, weekEvents, routines, weekStart, hideRoutines, dayCount, drag.activeDragId, tasks, events, selectedAssignees, currentDomain])

  // Run the lane-placement pass over allItems. Items with a startTime outside
  // the visible week range are filtered out by layoutWeekLanes (dayIdx check).
  // However, the drag-mount fallback above may have pushed an out-of-week item
  // into allItems so dnd-kit's draggable registration stays live during cross-
  // week auto-advance. Those items are filtered by layoutWeekLanes and won't
  // appear in placedItems — WeekEventBlock would never mount, dnd-kit would
  // lose registration, and the drop would be a no-op.
  //
  // Fix: after the layout pass, check if the active drag item is absent from
  // placedItems. If so, inject a synthetic PlacedItem with dayIdx=0 / laneIdx=0
  // / laneCount=1. computePlacementFromLane inside WeekEventBlock checks
  // dayIdx === placedItem.dayIdx; since dayIdx from the real startTime != 0
  // (it's outside the week), it returns null — triggering the hidden-stub branch
  // (isDragging → 1×1 invisible div). This is exactly the mounting behaviour
  // the original allBlocks code relied on.
  const placedItems = useMemo<PlacedItem[]>(() => {
    const placed = layoutWeekLanes(allItems, weekStart, dayCount)

    const activeId = drag.activeDragId
    if (activeId && activeId.startsWith('block:')) {
      const itemId = activeId.slice('block:'.length)
      const alreadyPlaced = placed.some((p) => p.item.id === itemId)
      if (!alreadyPlaced) {
        const fallback = allItems.find((b) => b.id === itemId)
        if (fallback) {
          // dayIdx=0 is intentionally wrong so computePlacementFromLane returns
          // null, which triggers WeekEventBlock's hidden-stub mount path.
          placed.push({ item: fallback, dayIdx: 0, laneIdx: 0, laneCount: 1 })
        }
      }
    }

    return placed
  }, [allItems, weekStart, dayCount, drag.activeDragId])

  // WeekEventBlock.onSelect expects (id: string), but onSelectItem is
  // (id: string | null). Narrow here so TypeScript is satisfied; passing null
  // is only needed for deselection, which happens elsewhere.
  // Routine items get a synthetic '-dayN' suffix for React key uniqueness;
  // strip it before forwarding so the detail panel's id-resolution matches the
  // actual routine id stored in the DB.
  const handleSelectBlock = (id: string) => {
    if (id.startsWith('routine-')) {
      onSelectItem(id.replace(/-day\d+$/, ''))
      return
    }
    onSelectItem(id)
  }

  // Keyboard nav: '[' previous week, ']' next week. Skips when focus is in
  // an input/textarea/contentEditable so it doesn't hijack typing.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === '[') {
        const next = new Date(weekStart)
        next.setDate(next.getDate() - dayCount)
        onWeekChange(next)
      } else if (e.key === ']') {
        const next = new Date(weekStart)
        next.setDate(next.getDate() + dayCount)
        onWeekChange(next)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [weekStart, dayCount, onWeekChange])

  return (
    <div data-week-bounds className="hidden lg:block relative">
      <div className="flex items-center justify-end mb-2">
        <button
          type="button"
          onClick={() => writeHideRoutines(!hideRoutines)}
          title={hideRoutines ? 'Show daily activities' : 'Hide daily activities'}
          aria-label={hideRoutines ? 'Show daily' : 'Hide daily'}
          className="p-1.5 rounded-md hover:bg-neutral-100 text-neutral-500"
        >
          {hideRoutines ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>

      <DndContext
        sensors={sensors}
        onDragStart={drag.dndHandlers.onDragStart}
        onDragEnd={drag.dndHandlers.onDragEnd}
        onDragCancel={drag.dndHandlers.onDragCancel}
        onDragMove={handleDragMove}
      >
        <WeekGrid
          weekStart={weekStart}
          dayCount={dayCount}
          renderAllDay={(day) =>
            (allDayByDay.get(dayKey(day)) ?? []).map((t) => (
              <WeekAllDayChip key={t.id} task={t} onSelect={onSelectItem} />
            ))
          }
          onCreateGesture={
            drag.activeDragId
              ? undefined
              : {
                  onSlotPointerDown: gridCreate.onSlotPointerDown,
                  onSlotPointerMove: gridCreate.onGridPointerMove,
                  onSlotPointerUp: gridCreate.onSlotPointerUp,
                }
          }
          suppressCreate={!!drag.activeDragId}
        >
          {placedItems.map((p) => (
            <WeekEventBlock
              key={p.item.id}
              placedItem={p}
              weekStart={weekStart}
              dayCount={dayCount}
              onSelect={handleSelectBlock}
              onResizeCommit={(itemId, updates) => {
                // itemId from WeekEventBlock is the TimelineItem.id (prefixed).
                // Strip before persisting so the DB update targets the real uuid.
                if (itemId.startsWith('task-')) {
                  void onUpdateTask(itemId.slice('task-'.length), updates as Partial<Task>)
                }
                // Events resize: not wired. Routines: not resizable (disabled in WeekEventBlock).
              }}
            />
          ))}
        </WeekGrid>

        {gridCreate.state && (() => {
          const { startTime, endTime } = gridCreate.toTimes(gridCreate.state)
          return (
            <SlotQuickCreatePopover
              anchorRect={gridCreate.state.anchorRect}
              startTime={startTime}
              endTime={endTime}
              onCreate={handleCreate}
              onCancel={gridCreate.close}
            />
          )
        })()}

        {gridCreate.liveGesture && (() => {
          const lg = gridCreate.liveGesture
          // Compute outline rect from the live gesture. anchorRect is the start
          // slot's rect (15-min sub-slot). The height = number-of-15min-slots
          // between start and end, inclusive of the end slot itself.
          const startMinutes = lg.startSlot.hour * 60 + lg.startSlot.minute
          const endMinutes = lg.endSlot.hour * 60 + lg.endSlot.minute + 15
          const minutesSpan = Math.max(15, endMinutes - startMinutes)
          const heightPx = (minutesSpan / 15) * lg.anchorRect.height
          const style: React.CSSProperties = {
            position: 'fixed',
            top: lg.anchorRect.top,
            left: lg.anchorRect.left,
            width: lg.anchorRect.width,
            height: heightPx,
            pointerEvents: 'none',
            zIndex: 55,
          }
          return (
            <div
              style={style}
              className="border-2 border-dashed border-primary-500/60 bg-primary-500/5 rounded-md"
            />
          )
        })()}

        <DragOverlay dropAnimation={null}>
          {drag.activeDragId
            ? (() => {
                // All-day strip chips drag with a 'chip:<taskId>' id and aren't
                // in placedItems — render their own floating pill so the drag
                // has visible feedback (without this the chip looked unmovable).
                if (drag.activeDragId.startsWith('chip:')) {
                  const taskId = drag.activeDragId.slice('chip:'.length)
                  const task = tasks.find((t) => t.id === taskId)
                  if (!task) return null
                  return (
                    <div className="opacity-80 pointer-events-none">
                      <div className="px-3 py-1.5 rounded-full bg-bg-elevated border border-neutral-300 text-[12px] text-neutral-800 shadow-md whitespace-nowrap">
                        {task.title}
                      </div>
                    </div>
                  )
                }
                // Strip the dnd-kit drag prefix to recover the TimelineItem id.
                // Routines use 'block-routine:', everything else uses 'block:'.
                const itemId = drag.activeDragId.startsWith('block-routine:')
                  ? drag.activeDragId.slice('block-routine:'.length)
                  : drag.activeDragId.startsWith('block:')
                  ? drag.activeDragId.slice('block:'.length)
                  : drag.activeDragId
                const item = placedItems.find((p) => p.item.id === itemId)?.item
                if (!item) return null
                return (
                  <div className="opacity-60 pointer-events-none">
                    <div className="px-2 py-1 rounded-md bg-primary-50 border border-primary-200 text-[12px] text-primary-900 shadow-md whitespace-nowrap">
                      {item.title}
                    </div>
                  </div>
                )
              })()
            : null}
        </DragOverlay>
      </DndContext>
    </div>
  )
}
