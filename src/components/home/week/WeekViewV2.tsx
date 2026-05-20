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
import { useMealPlan } from '@/hooks/useMealPlan'
import { useRecipes } from '@/hooks/useRecipes'
import { useGroceryStatus } from '@/hooks/useGroceryStatus'
import { useFamilyMembers } from '@/hooks/useFamilyMembers'
import { useSupabaseTasks } from '@/hooks/useSupabaseTasks'
import { sundayOfWeek } from '@/lib/weekHelpers'
import { taskToTimelineItem, eventToTimelineItem, routineToTimelineItem } from '@/types/timeline'
import { familyDinnerSummary, groceriesSummary, prepAheadSummary } from '@/lib/weekHighlights'
import { WeekSummaryRow } from './WeekSummaryRow'
import { UnscheduledChipStrip } from './UnscheduledChipStrip'
import { WeekGrid } from './WeekGrid'
import { WeekEventBlock } from './WeekEventBlock'
import { useWeekDragDrop } from './useWeekDragDrop'
import { useGridCreate } from './useGridCreate'
import { SlotQuickCreatePopover, type CreateType } from './SlotQuickCreatePopover'
import { ChevronLeft, ChevronRight } from 'lucide-react'

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
    onSelectItem,
    onUpdateTask,
    onUpdateEvent,
    onUpdateRoutine,
    dayCount = 7,
    pushAction,
  } = props

  // Summary data
  const { plan } = useMealPlan(sundayOfWeek(weekStart))
  const { recipes } = useRecipes()
  const { missingItems } = useGroceryStatus(plan, recipes)
  const { members } = useFamilyMembers()

  const familyDinner = useMemo(
    () => familyDinnerSummary(plan, members, weekStart),
    [plan, members, weekStart],
  )
  const groceries = useMemo(() => groceriesSummary(missingItems), [missingItems])
  const prepAhead = useMemo(
    () => prepAheadSummary(plan, recipes, new Date()),
    [plan, recipes],
  )

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

  // All-day tasks shown as draggable chips above the grid
  const unscheduledTasks = useMemo(
    () => tasks.filter((t) => t.scheduledFor && inWeek(t.scheduledFor) && t.isAllDay),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tasks, weekStart],
  )

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
  // events still render. Users toggle this from the Today view's stats row.
  const hideRoutines = useMemo(() => {
    try { return localStorage.getItem('symphony-hide-routines') === 'true' }
    catch { return false }
  }, [])

  // Convert to TimelineItems for grid rendering.
  // Routines are expanded into 7 day-instances (render-only; WeekEventBlock
  // sets disabled:true for isRoutine so they never become drag sources).
  // Keys for routine day-instances are suffixed with the day-index to avoid
  // duplicate-key warnings from routineToTimelineItem returning the same id
  // for every day.
  const allBlocks = useMemo(() => {
    const taskItems = scheduledTasks.map(taskToTimelineItem)
    const eventItems = weekEvents.map(eventToTimelineItem)
    const routineItems = hideRoutines ? [] : routines.flatMap((r) =>
      Array.from({ length: dayCount }, (_, i) => {
        const d = new Date(weekStart)
        d.setDate(d.getDate() + i)
        return { ...routineToTimelineItem(r, d), id: `routine-${r.id}-day${i}` }
      }),
    )
    return [...taskItems, ...eventItems, ...routineItems]
  }, [scheduledTasks, weekEvents, routines, weekStart, hideRoutines, dayCount])

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
      {/* Hover-target prev/next-week scrollers. 24px-wide visible chips
          that fade in on hover/focus. Step by dayCount so Workweek steps
          5 days and Week steps 7. */}
      <button
        type="button"
        aria-label="Previous week"
        onClick={() => {
          const next = new Date(weekStart)
          next.setDate(next.getDate() - dayCount)
          onWeekChange(next)
        }}
        className="absolute left-0 top-1/2 -translate-y-1/2 w-6 h-16 flex items-center justify-center
                   bg-white/90 border border-neutral-200 rounded-r-md shadow-sm
                   opacity-0 hover:opacity-100 focus-visible:opacity-100 transition-opacity
                   z-30"
      >
        <ChevronLeft className="w-4 h-4 text-neutral-600" />
      </button>
      <button
        type="button"
        aria-label="Next week"
        onClick={() => {
          const next = new Date(weekStart)
          next.setDate(next.getDate() + dayCount)
          onWeekChange(next)
        }}
        className="absolute right-0 top-1/2 -translate-y-1/2 w-6 h-16 flex items-center justify-center
                   bg-white/90 border border-neutral-200 rounded-l-md shadow-sm
                   opacity-0 hover:opacity-100 focus-visible:opacity-100 transition-opacity
                   z-30"
      >
        <ChevronRight className="w-4 h-4 text-neutral-600" />
      </button>
      <WeekSummaryRow
        familyDinner={familyDinner}
        groceries={groceries}
        prepAhead={prepAhead}
      />

      <DndContext
        sensors={sensors}
        onDragStart={drag.dndHandlers.onDragStart}
        onDragEnd={drag.dndHandlers.onDragEnd}
        onDragCancel={drag.dndHandlers.onDragCancel}
        onDragMove={handleDragMove}
      >
        <UnscheduledChipStrip tasks={unscheduledTasks} />

        <WeekGrid
          weekStart={weekStart}
          dayCount={dayCount}
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
          {allBlocks.map((item) => (
            <WeekEventBlock
              key={item.id}
              item={item}
              weekStart={weekStart}
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
                // Strip the dnd-kit drag prefix to recover the TimelineItem id.
                // Routines use 'block-routine:', everything else uses 'block:'.
                const itemId = drag.activeDragId.startsWith('block-routine:')
                  ? drag.activeDragId.slice('block-routine:'.length)
                  : drag.activeDragId.startsWith('block:')
                  ? drag.activeDragId.slice('block:'.length)
                  : drag.activeDragId
                const item = allBlocks.find((b) => b.id === itemId)
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
