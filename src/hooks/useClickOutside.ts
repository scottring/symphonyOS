import { useEffect, type RefObject } from 'react'

/**
 * Dismiss a popover/menu when the user clicks outside it or presses Escape.
 * Only listens while `active` is true. The ref should wrap BOTH the trigger
 * and the menu, so clicking the trigger toggles (via its own onClick) instead
 * of being treated as an outside click. Uses `mousedown` so opening another
 * menu — a mousedown outside this one — dismisses this one first.
 */
export function useClickOutside(
  ref: RefObject<HTMLElement | null>,
  onDismiss: () => void,
  active: boolean,
): void {
  useEffect(() => {
    if (!active) return
    const handlePointer = (e: MouseEvent | TouchEvent) => {
      const el = ref.current
      if (el && !el.contains(e.target as Node)) onDismiss()
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss()
    }
    document.addEventListener('mousedown', handlePointer)
    document.addEventListener('touchstart', handlePointer)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handlePointer)
      document.removeEventListener('touchstart', handlePointer)
      document.removeEventListener('keydown', handleKey)
    }
  }, [ref, onDismiss, active])
}
