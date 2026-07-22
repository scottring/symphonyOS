import type { DayKey } from './rhythmModel'

export const ARC_START = 6 * 60   // 6:00
export const ARC_END = 21.5 * 60  // 21:30

export type DragPayload =
  | { kind: 'step'; id: string }
  | { kind: 'routine'; id: string; fromDay?: DayKey }
  | { kind: 'collection'; id: string }
  | { kind: 'group'; ids: string[] }

const PAYLOAD_KEY = 'text/rhythm-payload'
const kindKey = (kind: DragPayload['kind']) => `text/rhythm-kind-${kind}`

export function setDragPayload(e: React.DragEvent, payload: DragPayload): void {
  e.dataTransfer.setData(PAYLOAD_KEY, JSON.stringify(payload))
  // Gate key: dataTransfer values are unreadable during dragover, but the
  // TYPES are — targets use these to decide whether to accept the drag.
  e.dataTransfer.setData(kindKey(payload.kind), '1')
  e.dataTransfer.effectAllowed = 'move'
}

export function readDragPayload(e: React.DragEvent): DragPayload | null {
  const raw = e.dataTransfer.getData(PAYLOAD_KEY)
  if (!raw) return null
  try { return JSON.parse(raw) as DragPayload } catch { return null }
}

export function acceptsDrag(e: React.DragEvent, kinds: DragPayload['kind'][]): boolean {
  const types = Array.from(e.dataTransfer.types ?? [])
  return kinds.some(k => types.includes(kindKey(k)))
}

/** Map an x position on the day axis to 'HH:MM' (5-minute grid, clamped to the arc). */
export function timeFromAxisX(clientX: number, rect: { left: number; width: number }): string {
  if (rect.width <= 0) return '06:00'
  const frac = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1)
  const rounded = Math.round((ARC_START + frac * (ARC_END - ARC_START)) / 5) * 5
  return `${String(Math.floor(rounded / 60)).padStart(2, '0')}:${String(rounded % 60).padStart(2, '0')}`
}
