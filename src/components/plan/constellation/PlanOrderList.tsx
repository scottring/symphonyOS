// src/components/plan/constellation/PlanOrderList.tsx
//
// The period's lines as a compact card (calm pass, mockup approved
// 2026-10-18): the list never runs off the page. The first 8 show, then
// "+N more", which opens in place, with "Show less" to fold it again — the
// Week's fold (foldDay) with room for 8. A line Symphony is pointing at stays
// in sight.
//
// The order is the priority, as on the Week (Task 13): an open line drops
// into the gap between two lines (dayReorder's gap maths). The desk drags
// natively; touch (the iPad, the wall, a phone) presses and holds 250ms, then
// drags (the Week's dnd-kit sensors), so a tap still opens and a swipe still
// scrolls. Every write is the caller's (`onReorder`); this draws and asks.

import { useRef, useState, type DragEvent, type HTMLAttributes, type ReactNode, type Ref } from 'react'
import {
  DndContext, DragOverlay, MouseSensor, TouchSensor, useDraggable, useSensor, useSensors,
  type DragEndEvent, type DragMoveEvent, type DragStartEvent,
} from '@dnd-kit/core'
import { createPortal } from 'react-dom'
import { foldDay } from '@/lib/week/foldDay'
import { gapAt, gapToListIndex } from '@/lib/week/dayReorder'
import { useMediaQuery } from '@/hooks/useMediaQuery'

/** Lines a compact list (and the card beside it) shows before "+N more". */
export const LIST_SHOWN = 8

// The Week's constraints (WeekCanvas): a held press on touch, a 5px move for
// a mouse or trackpad on a touch device.
const TOUCH_HOLD = { delay: 250, tolerance: 5 }
const MOUSE_MOVE = { distance: 5 }

/** What a row needs to order: spread onto PlanItemRow. */
export interface RowOrder {
  orderable: boolean
  onDragStart?: (e: DragEvent) => void
  onDragEnd?: () => void
  liProps: HTMLAttributes<HTMLLIElement> & { ref?: Ref<HTMLLIElement>; 'data-order-id'?: string }
}

/** The first `cap` of `items` (pinned ones kept in sight), or all once opened. */
export function useFold<T>(items: T[], pinned: (t: T) => boolean = () => false, cap = LIST_SHOWN) {
  const [open, setOpen] = useState(false)
  const fold = foldDay(items.map((it) => ({ event: false, pinned: pinned(it), it })), cap)
  const shown = open ? items : fold.shown.map((x) => x.it)
  const toggle = items.length > cap && (open || fold.hidden > 0)
    ? { label: open ? 'Show less' : `+${fold.hidden} more`, open, onClick: () => setOpen((o) => !o) }
    : null
  return { shown, toggle }
}

export function FoldToggle({ toggle, className = '' }: { toggle: ReturnType<typeof useFold>['toggle']; className?: string }) {
  if (!toggle) return null
  return <button type="button" className={`canvas-link plan-more ${className}`.trim()} aria-expanded={toggle.open} onClick={toggle.onClick}>{toggle.label}</button>
}

interface Lift { id: string; title: string }

/** A row that lifts on a held press (touch only; the desk drags natively). */
function Liftable({ liftId, lift, children }: { liftId: string; lift: Lift | null; children: (p: { ref: Ref<HTMLLIElement>; listeners?: HTMLAttributes<HTMLLIElement>; lifted: boolean }) => ReactNode }) {
  const { setNodeRef, listeners, isDragging } = useDraggable({ id: liftId, data: lift ?? undefined, disabled: !lift })
  return <>{children({ ref: setNodeRef, listeners: listeners as HTMLAttributes<HTMLLIElement> | undefined, lifted: isDragging })}</>
}

export interface PlanOrderListProps<T> {
  /** The list's accessible name ("October goals"). */
  label: string
  /** The lines, in their order. */
  items: T[]
  keyOf: (t: T) => string
  titleOf: (t: T) => string
  /** The id a line orders by; null when it does not order (done, moved on). */
  orderIdOf: (t: T) => string | null
  /** Kept in sight while folded (a line just saved, or a change card marks). */
  pinnedOf?: (t: T) => boolean
  renderRow: (t: T, order: RowOrder) => ReactNode
  /** Put `id` in the gap at `toIndex` of `orderedIds` (`reorderTasksToIndex`'s terms). */
  onReorder: (id: string, orderedIds: string[], toIndex: number) => void
  /** Rows drawn after the lines, inside the list and always shown (pending ones). */
  tail?: ReactNode
}

export function PlanOrderList<T>({ label, items, keyOf, titleOf, orderIdOf, pinnedOf, renderRow, onReorder, tail }: PlanOrderListProps<T>) {
  const coarse = useMediaQuery('(pointer: coarse)')
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: MOUSE_MOVE }),
    useSensor(TouchSensor, { activationConstraint: TOUCH_HOLD }),
  )
  const listRef = useRef<HTMLUListElement>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [gap, setGap] = useState<number | null>(null)
  const [lifted, setLifted] = useState<string | null>(null)
  const { shown, toggle } = useFold(items, pinnedOf)

  // ── the gap, read from the shown open lines ─────────────────────────────
  const orderRows = () => [...(listRef.current?.querySelectorAll<HTMLElement>('li[data-order-id]') ?? [])]
  const gapIn = (y: number) => gapAt(y, orderRows().map((r) => r.getBoundingClientRect()))
  const showGap = (y: number) => { const g = gapIn(y); if (g !== gap) setGap(g) }
  const endDrag = () => { setDragId(null); setGap(null); setLifted(null) }
  const dropAt = (id: string, y: number) => {
    const orderedIds = items.flatMap((t) => { const o = orderIdOf(t); return o ? [o] : [] })
    const to = gapToListIndex(gapIn(y), orderRows().map((r) => r.dataset.orderId!), orderedIds)
    endDrag()
    onReorder(id, orderedIds, to)
  }

  // ── the desk: the browser's own drag ────────────────────────────────────
  const listDrop = {
    onDragOver: (e: DragEvent) => {
      if (!dragId) return
      e.preventDefault(); e.dataTransfer.dropEffect = 'move'
      showGap(e.clientY)
    },
    onDragLeave: (e: DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setGap(null)
    },
    onDrop: (e: DragEvent) => {
      if (!dragId) return
      e.preventDefault(); e.stopPropagation()
      dropAt(dragId, e.clientY)
    },
  }

  // ── touch: press and hold, then drag ────────────────────────────────────
  const pointer = (e: DragMoveEvent | DragEndEvent) => {
    const ev = e.activatorEvent as (MouseEvent & TouchEvent) | null
    const at = ev && (typeof ev.clientY === 'number' ? ev : ev.touches?.[0] ?? ev.changedTouches?.[0])
    return at ? { x: at.clientX + e.delta.x, y: at.clientY + e.delta.y } : null
  }
  // Over the list, or close enough above or below it to mean its ends.
  const overList = (p: { x: number; y: number } | null) => {
    const r = listRef.current?.getBoundingClientRect()
    return !!p && !!r && p.x >= r.left && p.x <= r.right && p.y >= r.top - 24 && p.y <= r.bottom + 24
  }
  const liftOf = (e: { active: { data: { current?: unknown } } }) => (e.active.data.current ?? null) as Lift | null
  const onTouchStart = (e: DragStartEvent) => {
    const l = liftOf(e)
    if (l) { setDragId(l.id); setLifted(l.title) }
  }
  const onTouchMove = (e: DragMoveEvent) => {
    const p = pointer(e)
    if (p && overList(p)) showGap(p.y)
    else if (gap !== null) setGap(null)
  }
  const onTouchEnd = (e: DragEndEvent) => {
    const l = liftOf(e), p = pointer(e)
    if (l && p && overList(p)) dropAt(l.id, p.y)
    else endDrag()
  }

  // The shown open lines, numbered for the gap marker.
  const orderable = shown.filter((t) => orderIdOf(t) !== null)
  const row = (t: T) => {
    const id = orderIdOf(t)
    const index = id ? orderable.indexOf(t) : -1
    const gapCls = gap === null || index === -1 ? ''
      : gap === index ? ' is-gap-above'
        : gap === orderable.length && index === orderable.length - 1 ? ' is-gap-below' : ''
    const lift: Lift | null = coarse && id ? { id, title: titleOf(t) } : null
    return <Liftable key={keyOf(t)} liftId={keyOf(t)} lift={lift}>
      {({ ref, listeners, lifted: isLifted }) => renderRow(t, {
        orderable: !!id,
        onDragStart: id && !coarse ? (e: DragEvent) => {
          e.dataTransfer.setData('text/plain', titleOf(t))
          e.dataTransfer.effectAllowed = 'move'
          setDragId(id)
        } : undefined,
        onDragEnd: endDrag,
        liProps: {
          ...(lift ? { ref, ...listeners } : {}),
          'data-order-id': id ?? undefined,
          className: `${gapCls.trim()}${isLifted ? ' is-lifted' : ''}`.trim() || undefined,
        },
      })}
    </Liftable>
  }

  return <DndContext sensors={sensors} onDragStart={onTouchStart} onDragMove={onTouchMove} onDragEnd={onTouchEnd} onDragCancel={endDrag}>
    <ul ref={listRef} className={`plan-items plan-goal-list${dragId ? ' is-ordering' : ''}`} aria-label={label} {...listDrop}>
      {shown.map(row)}
      {tail}
    </ul>
    <FoldToggle toggle={toggle} />
    {typeof document !== 'undefined' && createPortal(
      <DragOverlay dropAnimation={null}>{lifted && <div className="wc-lift plan-lift">{lifted}</div>}</DragOverlay>,
      document.body,
    )}
  </DndContext>
}
