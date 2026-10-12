// src/lib/explain/geometry.ts
//
// Where the guide draws: outlines around targets, the note beside them, and
// curved arrows between rectangles. Pure, in viewport pixels.

export interface Rect { x: number; y: number; w: number; h: number }
export interface Point { x: number; y: number }
export type Side = 'right' | 'below' | 'above' | 'left' | 'dock'

export const PHONE_WIDTH = 640
const GAP = 24
const MARGIN = 12

export const center = (r: Rect): Point => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 })
export const inflate = (r: Rect, d: number): Rect => ({ x: r.x - d, y: r.y - d, w: r.w + d * 2, h: r.h + d * 2 })

export function union(rs: Rect[]): Rect {
  const x1 = Math.min(...rs.map((r) => r.x)), y1 = Math.min(...rs.map((r) => r.y))
  const x2 = Math.max(...rs.map((r) => r.x + r.w)), y2 = Math.max(...rs.map((r) => r.y + r.h))
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }
}

/** The point on r's edge that faces `toward`, a few pixels out. */
export function edgePoint(r: Rect, toward: Point, out = 6): Point {
  const c = center(r)
  const dx = toward.x - c.x, dy = toward.y - c.y
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
  if (Math.abs(dx) * r.h > Math.abs(dy) * r.w) {
    return { x: dx > 0 ? r.x + r.w + out : r.x - out, y: clamp(toward.y, r.y + Math.min(10, r.h / 2), r.y + r.h - Math.min(10, r.h / 2)) }
  }
  return { x: clamp(toward.x, r.x + Math.min(14, r.w / 2), r.x + r.w - Math.min(14, r.w / 2)), y: dy > 0 ? r.y + r.h + out : r.y - out }
}

/** A gentle curve from a to b: its SVG path and its midpoint (for a label). */
export function curve(a: Point, b: Point): { d: string; mid: Point } {
  const dx = b.x - a.x, dy = b.y - a.y
  const len = Math.hypot(dx, dy) || 1
  const bend = Math.min(60, len * 0.25)
  const c = { x: (a.x + b.x) / 2 - (dy / len) * bend, y: (a.y + b.y) / 2 + (dx / len) * bend }
  const r = (n: number) => Math.round(n * 10) / 10
  return { d: `M${r(a.x)} ${r(a.y)} Q${r(c.x)} ${r(c.y)} ${r(b.x)} ${r(b.y)}`, mid: { x: (a.x + 2 * c.x + b.x) / 4, y: (a.y + 2 * c.y + b.y) / 4 } }
}

/** An arrow from one rectangle to another, edge to edge, or null when they touch. */
export function arrowBetween(from: Rect, to: Rect): { d: string; mid: Point } | null {
  const a = edgePoint(from, center(to))
  const b = edgePoint(to, a)
  return Math.hypot(b.x - a.x, b.y - a.y) > 18 ? curve(a, b) : null
}

/**
 * Where the note goes: beside the target on the preferred side if it fits,
 * else the first side that does, kept on screen and above `floor` (the
 * conversation bar's top). Phones dock it full width just above the floor.
 */
export function placeNote(target: Rect, note: { w: number; h: number }, view: { w: number; floor: number }, prefer: Side = 'right'): Rect & { side: Side } {
  if (view.w < PHONE_WIDTH) {
    const w = view.w - MARGIN * 2
    return { x: MARGIN, y: Math.max(MARGIN, view.floor - note.h - MARGIN), w, h: note.h, side: 'dock' }
  }
  const at = (side: Side): Point => side === 'right' ? { x: target.x + target.w + GAP, y: target.y }
    : side === 'left' ? { x: target.x - note.w - GAP, y: target.y }
    : side === 'below' ? { x: target.x, y: target.y + target.h + GAP }
    : side === 'above' ? { x: target.x, y: target.y - note.h - GAP }
    : { x: MARGIN, y: view.floor - note.h - MARGIN }
  const fits = (p: Point) => p.x >= MARGIN && p.x + note.w <= view.w - MARGIN && p.y >= MARGIN && p.y + note.h <= view.floor - MARGIN
  const order: Side[] = [prefer, 'right', 'below', 'above', 'left'].filter((s, i, all) => all.indexOf(s) === i) as Side[]
  const side = order.find((s) => fits(at(s))) ?? 'dock'
  const p = at(side)
  const x = Math.max(MARGIN, Math.min(view.w - note.w - MARGIN, p.x))
  const y = Math.max(MARGIN, Math.min(view.floor - note.h - MARGIN, p.y))
  return { x, y, w: note.w, h: note.h, side }
}
