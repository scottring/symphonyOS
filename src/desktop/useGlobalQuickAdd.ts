// ⌃⌥Space from any app (Mac shell, desktop/src-tauri/src/lib.rs): the shell
// brings Symphony forward and asks for the ⌘K unibox — the real one, with
// dates, repeats, areas and search. Closing it hands focus back to the app you
// were in, once a capture's write has landed and its confirmation has had a
// moment on screen. Going somewhere from it (a search result, Ask Symphony,
// plan from paper) keeps Symphony up. The shell's payload is false when
// Symphony was already the window in front: then nothing is handed back.
import { useCallback, useEffect, useRef } from 'react'
import { desktopEmit, onDesktopEvent } from '@/lib/desktop'

/** How long a capture's confirmation stays on screen before focus goes back. */
export const HAND_BACK_DELAY_MS = 1200

export function useGlobalQuickAdd(open: boolean, setOpen: (open: boolean) => void) {
  const handBackRef = useRef(false)
  const pendingAddRef = useRef<Promise<unknown> | null>(null)

  useEffect(() => onDesktopEvent<boolean>('shell:quick-add-global', (handBack) => {
    handBackRef.current = handBack !== false
    pendingAddRef.current = null
    setOpen(true)
  }), [setOpen])

  // Closed any other way (a link that changed the page, ⌘K again): no
  // hand-back left armed for the next, ordinary ⌘K.
  useEffect(() => { if (!open) handBackRef.current = false }, [open])

  const stayInSymphony = useCallback(() => { handBackRef.current = false }, [])

  const closeQuickAdd = useCallback(() => {
    setOpen(false)
    if (!handBackRef.current) return
    handBackRef.current = false
    const pending = pendingAddRef.current
    pendingAddRef.current = null
    if (!pending) { desktopEmit('shell:hide-app'); return }
    void pending.catch(() => {}).then(() => {
      setTimeout(() => desktopEmit('shell:hide-app'), HAND_BACK_DELAY_MS)
    })
  }, [setOpen])

  /** Wraps an add handler so a hand-back waits for its write. */
  const tracked = useCallback(<A extends unknown[]>(fn: (...args: A) => unknown) => (...args: A) => {
    const result = Promise.resolve(fn(...args))
    pendingAddRef.current = result
    return result
  }, [])

  return { closeQuickAdd, stayInSymphony, tracked }
}
