import { useMemo, useState } from 'react'
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
import type { Routine, ActionableInstance } from '@/types/actionable'
import { useMealPlan } from '@/hooks/useMealPlan'
import { useRecipes } from '@/hooks/useRecipes'
import { useGroceryStatus } from '@/hooks/useGroceryStatus'
import { useFamilyMembers } from '@/hooks/useFamilyMembers'
import { sundayOfWeek } from '@/lib/weekHelpers'
import { taskToTimelineItem, eventToTimelineItem, routineToTimelineItem } from '@/types/timeline'
import { familyDinnerSummary, groceriesSummary, prepAheadSummary } from '@/lib/weekHighlights'
import { WeekSummaryRow } from './WeekSummaryRow'
import { UnscheduledChipStrip } from './UnscheduledChipStrip'
import { WeekGrid } from './WeekGrid'
import { WeekEventBlock } from './WeekEventBlock'
import { useWeekDragDrop } from './useWeekDragDrop'

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
  onUpdateEvent: (eventId: string, updates: Partial<CalendarEvent>) => Promise<void> | void
  onUpdateRoutine: (routineId: string, updates: Partial<Routine>) => Promise<void> | void
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

  // Week bounds: [weekStart, weekStart + 7 days)
  const weekEnd = useMemo(() => {
    const e = new Date(weekStart)
    e.setDate(e.getDate() + 7)
    return e
  }, [weekStart])

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

  // Convert to TimelineItems for grid rendering.
  // Routines are expanded into 7 day-instances (render-only; WeekEventBlock
  // sets disabled:true for isRoutine so they never become drag sources).
  // Keys for routine day-instances are suffixed with the day-index to avoid
  // duplicate-key warnings from routineToTimelineItem returning the same id
  // for every day.
  const allBlocks = useMemo(() => {
    const taskItems = scheduledTasks.map(taskToTimelineItem)
    const eventItems = weekEvents.map(eventToTimelineItem)
    const routineItems = routines.flatMap((r) =>
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date(weekStart)
        d.setDate(d.getDate() + i)
        return { ...routineToTimelineItem(r, d), id: `routine-${r.id}-day${i}` }
      }),
    )
    return [...taskItems, ...eventItems, ...routineItems]
  }, [scheduledTasks, weekEvents, routines, weekStart])

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

  return (
    <div data-week-bounds className="hidden lg:block">
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

        <WeekGrid weekStart={weekStart}>
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

        <DragOverlay>
          {drag.activeDragId ? <div className="opacity-80">·</div> : null}
        </DragOverlay>
      </DndContext>
    </div>
  )
}
