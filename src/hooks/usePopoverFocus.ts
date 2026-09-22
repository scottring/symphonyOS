import { useEffect, useRef, type RefObject } from 'react'

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

function items(popover: HTMLElement | null): HTMLElement[] {
  if (!popover) return []
  return Array.from(popover.querySelectorAll<HTMLElement>(FOCUSABLE))
}

/** The trigger ref may wrap the actual button (a positioning <div>). */
function focusTrigger(trigger: HTMLElement | null): void {
  if (!trigger) return
  const target = trigger.matches(FOCUSABLE) ? trigger : trigger.querySelector<HTMLElement>(FOCUSABLE)
  target?.focus({ preventScroll: true })
}

/**
 * Keyboard behaviour for a popover or menu — most of ours are portalled to
 * the end of <body>, so without this a keyboard user tabbing from the trigger
 * skipped the menu entirely.
 *
 * While `open`:
 * - focus moves to the first item;
 * - Escape closes it and is marked handled (preventDefault + stopPropagation),
 *   so the enclosing detail panel (useEscapeKey) stays open — one Escape, one layer;
 * - ArrowUp/ArrowDown/Home/End move between items (menus announce arrow keys);
 * - Tab off either end closes it and continues from the trigger, as if the
 *   menu sat right after the trigger in the page.
 * On close, focus returns to the trigger when it was inside the popover (or
 * lost to <body>), never stolen from something the user clicked.
 */
export function usePopoverFocus(
  open: boolean,
  triggerRef: RefObject<HTMLElement | null>,
  popoverRef: RefObject<HTMLElement | null>,
  onClose: () => void,
): void {
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose })

  useEffect(() => {
    if (!open) return
    const popover = popoverRef.current
    const trigger = triggerRef.current
    items(popover)[0]?.focus()

    const onKey = (e: KeyboardEvent) => {
      const pop = popoverRef.current
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onCloseRef.current()
        focusTrigger(triggerRef.current)
        return
      }
      if (!pop || !pop.contains(document.activeElement)) return
      const list = items(pop)
      if (list.length === 0) return
      const i = list.indexOf(document.activeElement as HTMLElement)
      const move = (to: number) => { e.preventDefault(); list[(to + list.length) % list.length].focus() }
      // Arrow keys stay out of the way of text fields inside a popover.
      const inField = (document.activeElement as HTMLElement).tagName === 'INPUT' || (document.activeElement as HTMLElement).tagName === 'TEXTAREA'
      if (e.key === 'ArrowDown' && !inField) move(i + 1)
      else if (e.key === 'ArrowUp' && !inField) move(i - 1)
      else if (e.key === 'Home' && !inField) move(0)
      else if (e.key === 'End' && !inField) move(list.length - 1)
      else if (e.key === 'Tab') {
        const leavingForward = !e.shiftKey && i === list.length - 1
        const leavingBack = e.shiftKey && i === 0
        if (leavingForward || leavingBack) {
          if (leavingBack) e.preventDefault()
          focusTrigger(triggerRef.current)
          onCloseRef.current()
        }
      }
    }
    // Capture phase: runs before bubbling document listeners (useClickOutside)
    // and the window-level useEscapeKey stack.
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      const active = document.activeElement
      const focusWasInside = !active || active === document.body || !!popover?.contains(active) || !active.isConnected
      if (focusWasInside) focusTrigger(trigger)
    }
  }, [open, triggerRef, popoverRef])
}
