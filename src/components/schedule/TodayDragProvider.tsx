import {
  createContext, useCallback, useContext, useMemo, useRef, useState,
  type ReactNode,
} from 'react'
import {
  DndContext, DragOverlay, pointerWithin,
  MouseSensor, TouchSensor, useSensor, useSensors,
  MeasuringStrategy,
  type DragStartEvent, type DragEndEvent, type DragOverEvent,
} from '@dnd-kit/core'
import type { DropIntent } from '@/lib/today/todayDrop'
import { ROW_PREFIX } from '@/lib/today/todayDrop'

export interface TodayDragState {
  activeId: string | null
  /**
   * True while any drag is in flight. Empty bands materialise on this — you
   * cannot drop something at 6 AM if the Early morning band isn't on screen.
   */
  dragging: boolean
  /** Wrapper raw ids force-open by a mid-drag hover. Cleared when the drag ends. */
  hoverExpanded: Set<string>
}

const EMPTY: TodayDragState = { activeId: null, dragging: false, hoverExpanded: new Set() }

const TodayDragContext = createContext<TodayDragState>(EMPTY)

export function useTodayDragState(): TodayDragState {
  return useContext(TodayDragContext)
}

/** How long a dragged card must hover a collapsed group before it opens. */
const HOVER_EXPAND_MS = 500

/**
 * Today's dnd-kit layer. It knows nothing about Today's rules: it reports the
 * (active, over) pair to `resolve` and applies whatever intents come back. Every
 * decision lives in `lib/today/todayDrop.ts`, where it is testable without a DOM.
 */
export function TodayDragProvider({
  resolve,
  onIntents,
  renderOverlay,
  children,
  __testHandlers,
}: {
  resolve: (activeId: string, overId: string) => DropIntent[]
  onIntents: (intents: DropIntent[]) => void
  renderOverlay: (activeId: string) => ReactNode
  children: ReactNode
  /**
   * Test seam: dnd-kit's pointer simulation is unreliable in jsdom, so tests
   * drive the handlers directly rather than faking a gesture. Production never
   * passes this.
   */
  __testHandlers?: (h: {
    onDragStart: (e: DragStartEvent) => void
    onDragOver: (e: DragOverEvent) => void
    onDragEnd: (e: DragEndEvent) => void
  }) => void
}) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const [hoverExpanded, setHoverExpanded] = useState<Set<string>>(() => new Set())
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hoverTarget = useRef<string | null>(null)

  // Same constraints as PlanningSession: 5px for the mouse, a 250ms press for
  // touch. Today is the mobile-primary surface — loosen these and a tap meant
  // to open a row's detail panel becomes a drag instead.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
  )

  const clearHover = useCallback(() => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current)
    hoverTimer.current = null
    hoverTarget.current = null
  }, [])

  const onDragStart = useCallback((e: DragStartEvent) => {
    setActiveId(String(e.active.id))
  }, [])

  // Hovering a collapsed group opens it so its members stay reachable mid-drag.
  const onDragOver = useCallback((e: DragOverEvent) => {
    const over = e.over ? String(e.over.id) : null
    if (!over || !over.startsWith(ROW_PREFIX)) { clearHover(); return }
    const rowId = over.slice(ROW_PREFIX.length)
    if (hoverTarget.current === rowId) return
    clearHover()
    hoverTarget.current = rowId
    hoverTimer.current = setTimeout(() => {
      setHoverExpanded((prev) => new Set(prev).add(rowId.replace('task-', '')))
    }, HOVER_EXPAND_MS)
  }, [clearHover])

  const reset = useCallback(() => {
    clearHover()
    setActiveId(null)
    setHoverExpanded(new Set())
  }, [clearHover])

  const onDragEnd = useCallback((e: DragEndEvent) => {
    reset()
    if (!e.over) return
    const intents = resolve(String(e.active.id), String(e.over.id))
    if (intents.length > 0) onIntents(intents)
  }, [resolve, onIntents, reset])

  __testHandlers?.({ onDragStart, onDragOver, onDragEnd })

  const state = useMemo<TodayDragState>(
    () => ({ activeId, dragging: activeId !== null, hoverExpanded }),
    [activeId, hoverExpanded],
  )

  return (
    <TodayDragContext.Provider value={state}>
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={reset}
      >
        {children}
        <DragOverlay dropAnimation={null}>
          {activeId ? renderOverlay(activeId) : null}
        </DragOverlay>
      </DndContext>
    </TodayDragContext.Provider>
  )
}
