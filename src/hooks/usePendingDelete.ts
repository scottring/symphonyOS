import { useCallback, useEffect, useRef, useState } from 'react'
import type { UndoAction } from '@/hooks/useUndo'

const NONE: string[] = []

interface Pending {
  ids: string[]
  action: UndoAction
  timer: ReturnType<typeof setTimeout>
}

/**
 * Delete-with-Undo for pages that hard-delete: rows hide at once and the real
 * delete runs only when the Undo window closes (timeout, Dismiss, a newer
 * delete taking its place, or leaving the page). Undo therefore brings back
 * the SAME rows, never re-inserted copies. Same contract as the Inbox's
 * pending delete; pair `action` with <UndoToast>.
 */
export function usePendingDelete(commit: (id: string) => void, duration = 10000) {
  const [pending, setPending] = useState<Pending | null>(null)
  const pendingRef = useRef<Pending | null>(null)
  const commitRef = useRef(commit)
  useEffect(() => { commitRef.current = commit })

  const settle = useCallback((next: Pending | null, runDelete: boolean) => {
    const prev = pendingRef.current
    if (prev) {
      clearTimeout(prev.timer)
      if (runDelete) prev.ids.forEach((id) => commitRef.current(id))
    }
    pendingRef.current = next
    setPending(next)
  }, [])

  const schedule = useCallback((ids: string[], message: string) => {
    if (ids.length === 0) return
    const action: UndoAction = { id: `${Date.now()}-${ids[0]}`, message, undo: () => {}, timestamp: Date.now() }
    const entry: Pending = { ids, action, timer: setTimeout(() => settle(null, true), duration) }
    // A newer delete displaces the old one, which must still happen.
    settle(entry, true)
  }, [duration, settle])

  const undo = useCallback(() => settle(null, false), [settle])
  const dismiss = useCallback(() => settle(null, true), [settle])

  // Leaving the page inside the window still deletes.
  useEffect(() => () => settle(null, true), [settle])

  return {
    pendingIds: pending?.ids ?? NONE,
    action: pending?.action ?? null,
    schedule,
    undo,
    dismiss,
  }
}
