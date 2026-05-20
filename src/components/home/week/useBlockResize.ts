import { useCallback, useRef, useState } from 'react'

interface UseBlockResizeArgs {
  startTime: Date
  endTime: Date
  pxPerMin: number
  onCommit: (updates: { scheduledFor: Date; endTime: Date }) => void
}

interface UseBlockResizeResult {
  handlers: {
    onPointerDownTop: (e: React.PointerEvent) => void
    onPointerDownBottom: (e: React.PointerEvent) => void
    onPointerMove: (e: React.PointerEvent) => void
    onPointerUp: (e: React.PointerEvent) => void
  }
  preview: { topDelta: number; bottomDelta: number } | null
}

const MIN_DURATION_MS = 15 * 60 * 1000
const SLOT_MIN = 15

export function useBlockResize({ startTime, endTime, pxPerMin, onCommit }: UseBlockResizeArgs): UseBlockResizeResult {
  const [preview, setPreview] = useState<{ topDelta: number; bottomDelta: number } | null>(null)
  const draggingRef = useRef<{ edge: 'top' | 'bottom'; startClientY: number } | null>(null)

  // Keep a ref to preview so onPointerUp can read the latest value without
  // needing it as a dependency (avoids stale closure on every preview update).
  const previewRef = useRef<{ topDelta: number; bottomDelta: number } | null>(null)
  previewRef.current = preview

  const onPointerDownTop = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
    draggingRef.current = { edge: 'top', startClientY: e.clientY }
    setPreview({ topDelta: 0, bottomDelta: 0 })
  }, [])

  const onPointerDownBottom = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
    draggingRef.current = { edge: 'bottom', startClientY: e.clientY }
    setPreview({ topDelta: 0, bottomDelta: 0 })
  }, [])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const drag = draggingRef.current
    if (!drag) return
    const deltaPx = e.clientY - drag.startClientY
    const deltaMins = snap(deltaPx / pxPerMin)
    if (drag.edge === 'top') {
      setPreview({ topDelta: deltaMins, bottomDelta: 0 })
    } else {
      setPreview({ topDelta: 0, bottomDelta: deltaMins })
    }
  }, [pxPerMin])

  const onPointerUp = useCallback((_e: React.PointerEvent) => {
    const drag = draggingRef.current
    draggingRef.current = null
    if (!drag) {
      setPreview(null)
      return
    }
    const p = previewRef.current ?? { topDelta: 0, bottomDelta: 0 }
    let newStart = startTime
    let newEnd = endTime
    if (drag.edge === 'top') {
      newStart = new Date(startTime.getTime() + p.topDelta * 60 * 1000)
    } else {
      newEnd = new Date(endTime.getTime() + p.bottomDelta * 60 * 1000)
    }
    // Enforce minimum duration
    if (newEnd.getTime() - newStart.getTime() < MIN_DURATION_MS) {
      if (drag.edge === 'top') {
        newStart = new Date(newEnd.getTime() - MIN_DURATION_MS)
      } else {
        newEnd = new Date(newStart.getTime() + MIN_DURATION_MS)
      }
    }
    setPreview(null)
    onCommit({ scheduledFor: newStart, endTime: newEnd })
  }, [startTime, endTime, onCommit])

  return {
    handlers: { onPointerDownTop, onPointerDownBottom, onPointerMove, onPointerUp },
    preview,
  }
}

function snap(mins: number): number {
  return Math.round(mins / SLOT_MIN) * SLOT_MIN
}
