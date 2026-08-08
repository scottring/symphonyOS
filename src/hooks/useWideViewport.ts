// src/hooks/useWideViewport.ts
//
// True when there is room to reflow the content column alongside BOTH the
// detail pane (480) and the assistant rail (420). Below this, 420 + 480 + a
// 256px sidebar leaves the content column too narrow to read, so the rail
// overlays it instead. Mirrors useMobile's matchMedia shape.

import { useState, useEffect } from 'react'

export const WIDE_BREAKPOINT = 1600 // px

export function useWideViewport(): boolean {
  const [isWide, setIsWide] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.innerWidth >= WIDE_BREAKPOINT
  })

  useEffect(() => {
    const mediaQuery = window.matchMedia(`(min-width: ${WIDE_BREAKPOINT}px)`)
    const handleChange = (e: MediaQueryListEvent) => setIsWide(e.matches)
    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  return isWide
}
