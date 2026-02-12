import { useState, useEffect, useCallback } from 'react'

const FOCUS_MODE_KEY = 'relish-focus-mode-open'

interface UseFocusModeResult {
  isOpen: boolean
  toggle: () => void
  open: () => void
  close: () => void
}

export function useFocusMode(): UseFocusModeResult {
  const [isOpen, setIsOpen] = useState(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem(FOCUS_MODE_KEY) === 'true'
  })

  // Persist state
  useEffect(() => {
    localStorage.setItem(FOCUS_MODE_KEY, String(isOpen))
  }, [isOpen])

  // Global keyboard shortcut: Cmd+. to toggle
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === '.') {
        e.preventDefault()
        setIsOpen((prev) => !prev)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const toggle = useCallback(() => setIsOpen((prev) => !prev), [])
  const open = useCallback(() => setIsOpen(true), [])
  const close = useCallback(() => setIsOpen(false), [])

  return {
    isOpen,
    toggle,
    open,
    close,
  }
}
