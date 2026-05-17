import { useState, useEffect, useCallback, useRef } from 'react'
import { rhythmModeForClock, type RhythmMode } from './rhythmMode'

const IDLE_TIMEOUT_MS = 5 * 60 * 1000

export interface UseWallRhythmReturn {
  mode: RhythmMode
  autoMode: RhythmMode
  overrideMode: RhythmMode | null
  setOverride: (mode: RhythmMode | null) => void
  resetIdleTimer: () => void
}

export function useWallRhythm(): UseWallRhythmReturn {
  const [autoMode, setAutoMode] = useState<RhythmMode>(() => rhythmModeForClock(new Date()))
  const [overrideMode, setOverrideMode] = useState<RhythmMode | null>(null)
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const id = setInterval(() => {
      setAutoMode(rhythmModeForClock(new Date()))
    }, 60_000)
    return () => clearInterval(id)
  }, [])

  const clearTimer = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current)
      idleTimerRef.current = null
    }
  }, [])

  const startTimer = useCallback(() => {
    clearTimer()
    idleTimerRef.current = setTimeout(() => {
      setOverrideMode(null)
      idleTimerRef.current = null
    }, IDLE_TIMEOUT_MS)
  }, [clearTimer])

  const setOverride = useCallback((mode: RhythmMode | null) => {
    setOverrideMode(mode)
    if (mode === null) {
      clearTimer()
    } else {
      startTimer()
    }
  }, [clearTimer, startTimer])

  const resetIdleTimer = useCallback(() => {
    if (overrideMode !== null) {
      startTimer()
    }
  }, [overrideMode, startTimer])

  useEffect(() => () => clearTimer(), [clearTimer])

  return {
    mode: overrideMode ?? autoMode,
    autoMode,
    overrideMode,
    setOverride,
    resetIdleTimer,
  }
}
