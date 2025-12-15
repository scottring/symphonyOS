import { useRef, useCallback } from 'react'

interface UseLongPressOptions {
  delay?: number
  onLongPress: () => void
  onClick?: () => void
}

interface UseLongPressResult {
  onMouseDown: (e: React.MouseEvent) => void
  onMouseUp: () => void
  onMouseLeave: () => void
  onTouchStart: (e: React.TouchEvent) => void
  onTouchMove: (e: React.TouchEvent) => void
  onTouchEnd: () => void
}

export function useLongPress({
  delay = 500,
  onLongPress,
  onClick,
}: UseLongPressOptions): UseLongPressResult {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  const startPosRef = useRef<{ x: number; y: number } | null>(null)
  const longPressTriggeredRef = useRef(false)

  const clear = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }, [])

  const trigger = useCallback(() => {
    longPressTriggeredRef.current = true
    // Haptic feedback on mobile
    if (navigator.vibrate) {
      navigator.vibrate(50)
    }
    onLongPress()
  }, [onLongPress])

  // Touch handlers (mobile)
  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      const touch = e.touches[0]
      startPosRef.current = { x: touch.clientX, y: touch.clientY }
      longPressTriggeredRef.current = false
      timeoutRef.current = setTimeout(trigger, delay)
    },
    [delay, trigger]
  )

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!startPosRef.current || !timeoutRef.current) return
      const touch = e.touches[0]
      const dx = Math.abs(touch.clientX - startPosRef.current.x)
      const dy = Math.abs(touch.clientY - startPosRef.current.y)
      // Cancel if moved more than 10px
      if (dx > 10 || dy > 10) {
        clear()
      }
    },
    [clear]
  )

  const onTouchEnd = useCallback(() => {
    clear()
    // If long press wasn't triggered, treat as regular click
    if (!longPressTriggeredRef.current && onClick) {
      onClick()
    }
    startPosRef.current = null
  }, [clear, onClick])

  // Mouse handlers (desktop) - only for long press, not regular clicks
  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Only left click
      if (e.button !== 0) return
      startPosRef.current = { x: e.clientX, y: e.clientY }
      longPressTriggeredRef.current = false
      timeoutRef.current = setTimeout(trigger, delay)
    },
    [delay, trigger]
  )

  const onMouseUp = useCallback(() => {
    clear()
    // If long press wasn't triggered, treat as regular click
    if (!longPressTriggeredRef.current && onClick) {
      onClick()
    }
    startPosRef.current = null
  }, [clear, onClick])

  const onMouseLeave = useCallback(() => {
    clear()
    startPosRef.current = null
  }, [clear])

  return {
    onMouseDown,
    onMouseUp,
    onMouseLeave,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
  }
}
