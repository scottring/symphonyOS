// Where the pointer is during a dnd-kit drag, in viewport y: where it started
// plus how far it has moved. The day column reads a drop's time from this
// (Scott, 2026-10-07: the time is where you let go), not from the top of the
// dragged row, which sits wherever you happened to grab it.
interface DragLike {
  activatorEvent: Event | null
  delta: { x: number; y: number }
}

export function dragPointerY(e: DragLike): number | null {
  const ev = e.activatorEvent as (MouseEvent & TouchEvent) | null
  if (!ev) return null
  const startY = typeof ev.clientY === 'number' ? ev.clientY : ev.touches?.[0]?.clientY ?? ev.changedTouches?.[0]?.clientY
  return typeof startY === 'number' ? startY + e.delta.y : null
}
