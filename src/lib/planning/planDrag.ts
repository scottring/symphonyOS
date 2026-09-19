/**
 * Dragging a plan row OUT of the Today pin.
 *
 * The pin lives in the shell's reference dock, outside every page's dnd-kit
 * context, so its rows travel with native HTML drag-and-drop instead. The
 * payload names the occurrence (task, or routine + its date) — never its
 * content — and each drop target turns it into one of three placements:
 *
 *   day     choose that day, no time invented
 *   time    give it a time (a routine: this occurrence only)
 *   period  commit it to the week's or month's list, no day invented
 *
 * Every placement also has a click/keyboard path in the pin itself (Today,
 * Set time…, This week / This month), so dragging is never the only way.
 */
export const PLAN_MIME = 'application/x-symphony-plan'

export interface PlanDragPayload {
  kind: 'task' | 'routine'
  /** Task id, or routine (collection parent) id. */
  id: string
  /** YYYY-MM-DD of the occurrence — the routine instance's date. */
  date: string
  title: string
}

export type PlanTarget =
  | { type: 'day'; day: Date }
  | { type: 'time'; when: Date }
  | { type: 'period'; period: 'week' | 'month' }

export function writePlanDrag(dt: DataTransfer, payload: PlanDragPayload): void {
  dt.setData(PLAN_MIME, JSON.stringify(payload))
  // A plain-text fallback so dropping onto a text field does something sane.
  dt.setData('text/plain', payload.title)
  dt.effectAllowed = 'move'
}

/** Is a plan row being dragged? Readable during dragover (types only). */
export function isPlanDrag(dt: DataTransfer | null): boolean {
  return !!dt && Array.from(dt.types).includes(PLAN_MIME)
}

export function readPlanDrag(dt: DataTransfer | null): PlanDragPayload | null {
  if (!dt) return null
  try {
    const raw = dt.getData(PLAN_MIME)
    if (!raw) return null
    const p = JSON.parse(raw) as Partial<PlanDragPayload>
    if ((p.kind === 'task' || p.kind === 'routine') && typeof p.id === 'string' && typeof p.date === 'string') {
      return { kind: p.kind, id: p.id, date: p.date, title: typeof p.title === 'string' ? p.title : '' }
    }
  } catch { /* not ours */ }
  return null
}

/** Handlers for a native drop target. Spread onto the element. */
export function planDropHandlers(onDrop: (payload: PlanDragPayload) => void, setOver?: (over: boolean) => void) {
  return {
    onDragOver: (e: React.DragEvent) => {
      if (!isPlanDrag(e.dataTransfer)) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      setOver?.(true)
    },
    onDragLeave: (e: React.DragEvent) => {
      if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
      setOver?.(false)
    },
    onDrop: (e: React.DragEvent) => {
      const payload = readPlanDrag(e.dataTransfer)
      setOver?.(false)
      if (!payload) return
      e.preventDefault()
      e.stopPropagation()
      onDrop(payload)
    },
  }
}
