import { minutesOf, type DayKey, type RhythmCard } from './rhythmModel'

export const ARC_START = 6 * 60   // 6:00
export const ARC_END = 21.5 * 60  // 21:30

// The arc grid always stretches the full page width; cards land in the
// column band nearest their true start time so each card sits by its dot.
export const ARC_COLS = 16
export const CARD_SPAN = 4

/** Column start (1-based) per card: proportional to start time, pushed right
 *  on same-row collisions (cards alternate above/below), clamped to fit. */
export function arcColumns(cards: RhythmCard[], cols = ARC_COLS, span = CARD_SPAN): number[] {
  let lastAbove = -Infinity
  let lastBelow = -Infinity
  return cards.map((card, i) => {
    const above = i % 2 === 0
    const start = minutesOf(card.startTime) ?? ARC_START
    const frac = Math.min(Math.max((start - ARC_START) / (ARC_END - ARC_START), 0), 1)
    let col = 1 + Math.round(frac * (cols - span))
    const prev = above ? lastAbove : lastBelow
    col = Math.max(col, prev + span)
    col = Math.min(col, cols - span + 1)
    if (above) lastAbove = col
    else lastBelow = col
    return col
  })
}

export type DragPayload =
  | { kind: 'step'; id: string }
  | { kind: 'routine'; id: string; fromDay?: DayKey; resting?: boolean; fromMonth?: number }
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
