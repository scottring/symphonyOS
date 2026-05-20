import { useState, useRef, useCallback } from 'react'

interface SlotRef {
  dayIso: string
  hour: number
  minute: number
}

interface AnchorRect {
  top: number
  left: number
  width: number
  height: number
}

export interface CreateState {
  /** The slot where the create gesture started. */
  startSlot: SlotRef
  /** The slot where the create gesture ended (same as start for a click). */
  endSlot: SlotRef
  /** Viewport-coords rect of the anchor slot (for popover positioning). */
  anchorRect: AnchorRect
}

interface UseGridCreateResult {
  /** Active create state — when non-null, render the SlotQuickCreatePopover. */
  state: CreateState | null
  /** Live snapshot of the in-progress drag (null when no drag active). For outline render. */
  liveGesture: { startSlot: SlotRef; endSlot: SlotRef; anchorRect: AnchorRect } | null
  /** Compute start/end Date objects from the saved slot info. */
  toTimes: (s: CreateState, defaultMinutes?: number) => { startTime: Date; endTime: Date }
  /** Pointerdown on a slot — starts the create gesture. */
  onSlotPointerDown: (e: React.PointerEvent, slot: SlotRef) => void
  /** Pointermove on the grid — extends the gesture's end slot. */
  onGridPointerMove: (slot: SlotRef | null) => void
  /** Pointerup — finalizes the gesture and opens the popover. */
  onSlotPointerUp: () => void
  /** Close the popover (called on cancel or successful create). */
  close: () => void
}

export function useGridCreate(): UseGridCreateResult {
  const [state, setState] = useState<CreateState | null>(null)
  const [liveGesture, setLiveGesture] = useState<{
    startSlot: SlotRef
    endSlot: SlotRef
    anchorRect: AnchorRect
  } | null>(null)
  const gestureRef = useRef<{
    startSlot: SlotRef
    endSlot: SlotRef
    anchorRect: AnchorRect
  } | null>(null)

  const onSlotPointerDown = useCallback((e: React.PointerEvent, slot: SlotRef) => {
    const rect = (e.currentTarget as Element).getBoundingClientRect()
    const next = {
      startSlot: slot,
      endSlot: slot,
      anchorRect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
    }
    gestureRef.current = next
    setLiveGesture(next)
  }, [])

  const onGridPointerMove = useCallback((slot: SlotRef | null) => {
    if (!gestureRef.current || !slot) return
    // Only update end slot if it's the same day (no cross-day drag-to-create for v1)
    if (slot.dayIso !== gestureRef.current.startSlot.dayIso) return
    gestureRef.current.endSlot = slot
    setLiveGesture({ ...gestureRef.current })
  }, [])

  const onSlotPointerUp = useCallback(() => {
    const g = gestureRef.current
    gestureRef.current = null
    setLiveGesture(null)
    if (!g) return
    setState({ startSlot: g.startSlot, endSlot: g.endSlot, anchorRect: g.anchorRect })
  }, [])

  const close = useCallback(() => setState(null), [])

  const toTimes = useCallback((s: CreateState, defaultMinutes = 30) => {
    const [y, m, d] = s.startSlot.dayIso.split('-').map(Number)
    const startTime = new Date(y, m - 1, d, s.startSlot.hour, s.startSlot.minute, 0, 0)

    // If the gesture stayed on a single slot, default to N-minute duration.
    const isClick =
      s.startSlot.hour === s.endSlot.hour && s.startSlot.minute === s.endSlot.minute

    let endTime: Date
    if (isClick) {
      endTime = new Date(startTime.getTime() + defaultMinutes * 60 * 1000)
    } else {
      const [ey, em, ed] = s.endSlot.dayIso.split('-').map(Number)
      // End at the END of the end-slot (i.e., +15 min after the end-slot's start).
      endTime = new Date(ey, em - 1, ed, s.endSlot.hour, s.endSlot.minute + 15, 0, 0)
    }
    return { startTime, endTime }
  }, [])

  return { state, liveGesture, toTimes, onSlotPointerDown, onGridPointerMove, onSlotPointerUp, close }
}
