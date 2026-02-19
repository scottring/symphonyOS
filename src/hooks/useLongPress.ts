import { useRef, useCallback, useState } from 'react'

interface UseLongPressOptions {
  threshold?: number // ms, default 1500
  onLongPress: () => void
  onPress?: () => void // Normal click/tap
}

export function useLongPress({ threshold = 1500, onLongPress, onPress }: UseLongPressOptions) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isLongPress = useRef(false)
  const startPos = useRef<{ x: number; y: number } | null>(null)
  const [pressing, setPressing] = useState(false)

  const start = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation()
    isLongPress.current = false
    setPressing(true)

    // Record start position to detect movement (cancel long press if finger moves)
    if ('touches' in e) {
      startPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
    }

    timerRef.current = setTimeout(() => {
      isLongPress.current = true
      setPressing(false)
      onLongPress()
    }, threshold)
  }, [onLongPress, threshold])

  const move = useCallback((e: React.TouchEvent) => {
    if (!startPos.current || !timerRef.current) return
    const touch = e.touches[0]
    const dx = Math.abs(touch.clientX - startPos.current.x)
    const dy = Math.abs(touch.clientY - startPos.current.y)
    // Cancel if finger moved more than 10px
    if (dx > 10 || dy > 10) {
      clearTimeout(timerRef.current)
      timerRef.current = null
      setPressing(false)
    }
  }, [])

  const end = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation()
    setPressing(false)
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    // If it was a long press, prevent the normal click
    if (isLongPress.current) {
      e.preventDefault()
      return
    }
    // Otherwise, fire normal press
    onPress?.()
  }, [onPress])

  const cancel = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    setPressing(false)
  }, [])

  return {
    pressing,
    handlers: {
      onMouseDown: start,
      onMouseUp: end,
      onMouseLeave: cancel,
      onTouchStart: start,
      onTouchMove: move,
      onTouchEnd: end,
    },
  }
}
