// src/components/plan/constellation/PlanOrderList.tsx
//
// The period's lines as a compact card (calm pass, mockup approved
// 2026-10-18): the list never runs off the page — 8, then "+N more"
// (useFold). A line Symphony is pointing at stays in sight.
//
// The order is the priority, as on the Week (Task 13): an open line drops
// into the gap between two lines (dayReorder's gap maths). The desk drags
// natively; touch (the iPad, the wall, a phone) presses and holds 250ms, then
// drags (the Week's dnd-kit sensors), so a tap still opens and a swipe still
// scrolls. Every write is the caller's (`onReorder`); this draws and asks.

import { Fragment, useRef, useState, type DragEvent, type HTMLAttributes, type ReactNode, type Ref } from 'react'
import {
  DndContext, DragOverlay, MouseSensor, TouchSensor, useDraggable, useSensor, useSensors,
  type DragEndEvent, type DragMoveEvent, type DragStartEvent,
} from '@dnd-kit/core'
import { createPortal } from 'react-dom'
import { gapAt, gapToListIndex } from '@/lib/week/dayReorder'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { useFold, type FoldToggleState } from './useFold'

// The Week's constraints (WeekCanvas): a held press on touch, a 5px move for
// a mouse or trackpad on a touch device.
const TOUCH_HOLD = { delay: 250, tolerance: 5 }
const MOUSE_MOVE = { distance: 5 }

/** What a row needs to order: spread onto PlanItemRow. */
export interface RowOrder {
  orderable: boolean
  onDragStart?: (e: DragEvent) => void
  onDragEnd?: () => void
  liProps: HTMLAttributes<HTMLLIElement> & { ref?: Ref<HTMLLIElement>; 'data-order-id'?: string; 'data-group'?: string }
}

/** "+N more" / "Show less", when the list folds. */
export function FoldToggle({ toggle, className = '' }: { toggle: FoldToggleState | null; className?: string }) {
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
  /** A group's plain name (a life area), drawn above its first line; null draws none. Needs `groupOf`; items must already be in group order. */
  headingOf?: (t: T) => string | null
  /** The group a line belongs to (a life area's id, '' for none). With it, a line only orders within its own group. */
  groupOf?: (t: T) => string
}

export function PlanOrderList<T>({ label, items, keyOf, titleOf, orderIdOf, pinnedOf, renderRow, onReorder, tail, headingOf, groupOf }: PlanOrderListProps<T>) {
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
  // Grouped, a line orders only among its own group's lines: the gap and the
  // drop ignore the other groups, and a pointer outside its group is no drop.
  const groupOfId = (id: string | null) => {
    if (!groupOf || !id) return null
    const t = items.find((x) => orderIdOf(x) === id)
    return t ? groupOf(t) : null
  }
  const orderRows = (id: string | null = dragId) => {
    const g = groupOfId(id)
    return [...(listRef.current?.querySelectorAll<HTMLElement>('li[data-order-id]') ?? [])]
      .filter((r) => g === null || r.dataset.group === g)
  }
  const inOwnGroup = (id: string | null, y: number) => {
    if (!groupOf) return true
    const rects = orderRows(id).map((r) => r.getBoundingClientRect())
    return rects.length > 0 && y >= Math.min(...rects.map((r) => r.top)) && y <= Math.max(...rects.map((r) => r.bottom))
  }
  const gapIn = (y: number, id: string | null = dragId) => gapAt(y, orderRows(id).map((r) => r.getBoundingClientRect()))
  const showGap = (y: number) => {
    const g = inOwnGroup(dragId, y) ? gapIn(y) : null
    if (g !== gap) setGap(g)
  }
  const endDrag = () => { setDragId(null); setGap(null); setLifted(null) }
  const dropAt = (id: string, y: number) => {
    if (!inOwnGroup(id, y)) { endDrag(); return }
    const g = groupOfId(id)
    const orderedIds = items.flatMap((t) => { const o = orderIdOf(t); return o && (g === null || groupOf!(t) === g) ? [o] : [] })
    const to = gapToListIndex(gapIn(y, id), orderRows(id).map((r) => r.dataset.orderId!), orderedIds)
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
  const dragGroup = groupOfId(dragId)
  const orderable = shown.filter((t) => orderIdOf(t) !== null && (dragGroup === null || groupOf!(t) === dragGroup))
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
          ...(groupOf ? { 'data-group': groupOf(t) } : {}),
          className: `${gapCls.trim()}${isLifted ? ' is-lifted' : ''}`.trim() || undefined,
        },
      })}
    </Liftable>
  }

  return <DndContext sensors={sensors} onDragStart={onTouchStart} onDragMove={onTouchMove} onDragEnd={onTouchEnd} onDragCancel={endDrag}>
    <ul ref={listRef} className={`plan-items plan-goal-list${dragId ? ' is-ordering' : ''}`} aria-label={label} {...listDrop}>
      {headingOf && groupOf
        ? shown.map((t, i) => {
          const h = headingOf(t)
          return <Fragment key={keyOf(t)}>
            {h !== null && (i === 0 || groupOf(shown[i - 1]) !== groupOf(t)) && <li className="plan-area-head" role="presentation">{h}</li>}
            {row(t)}
          </Fragment>
        })
        : shown.map(row)}
      {tail}
    </ul>
    <FoldToggle toggle={toggle} />
    {typeof document !== 'undefined' && createPortal(
      <DragOverlay dropAnimation={null}>{lifted && <div className="wc-lift plan-lift">{lifted}</div>}</DragOverlay>,
      document.body,
    )}
  </DndContext>
}
