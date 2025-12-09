import { useState, useCallback, useRef, useEffect } from 'react'

export interface UndoAction {
  id: string
  message: string
  undo: () => void
  timestamp: number
}

interface UseUndoOptions {
  /** How long the toast stays visible (ms) */
  duration?: number
}

export function useUndo(options: UseUndoOptions = {}) {
  const { duration = 5000 } = options
  const [currentAction, setCurrentAction] = useState<UndoAction | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Clear timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  const clearAction = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    setCurrentAction(null)
  }, [])

  const pushAction = useCallback((message: string, undoFn: () => void) => {
    // Clear any existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }

    const action: UndoAction = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      message,
      undo: undoFn,
      timestamp: Date.now(),
    }

    setCurrentAction(action)

    // Auto-dismiss after duration
    timeoutRef.current = setTimeout(() => {
      setCurrentAction(null)
    }, duration)

    return action.id
  }, [duration])

  const executeUndo = useCallback(() => {
    if (currentAction) {
      currentAction.undo()
      clearAction()
    }
  }, [currentAction, clearAction])

  const dismiss = useCallback(() => {
    clearAction()
  }, [clearAction])

  return {
    currentAction,
    pushAction,
    executeUndo,
    dismiss,
  }
}
