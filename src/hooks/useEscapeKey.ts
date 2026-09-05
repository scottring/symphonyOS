import { useEffect } from 'react'

/**
 * Close a surface (detail panel, full-screen overlay, drawer) on Escape.
 *
 * One Escape closes one layer, innermost first. Every active surface sits on
 * a stack; a single window listener calls only the top. So a drawer opened
 * from the panel closes before the panel, and the Time-block overlay closes
 * before anything under it — regardless of mount order.
 *
 * `window` fires after every `document` listener, so a popover that consumes
 * the key first (useClickOutside, PanelNotes wide mode, a menu) can
 * `preventDefault()` and this stays quiet. The top surface marks its own
 * Escape handled for the same reason.
 *
 * While a field is focused, Escape leaves the field instead of closing: the
 * field's own handler (cancel an edit, dismiss a quick-create) has already
 * run by the time this sees the key, and the next Escape closes the surface.
 */
export function useEscapeKey(active: boolean, onEscape: () => void): void {
  useEffect(() => {
    if (!active) return
    stack.push(onEscape)
    if (stack.length === 1) window.addEventListener('keydown', onKey)
    return () => {
      const i = stack.lastIndexOf(onEscape)
      if (i !== -1) stack.splice(i, 1)
      if (stack.length === 0) window.removeEventListener('keydown', onKey)
    }
  }, [active, onEscape])
}

const stack: Array<() => void> = []

function onKey(e: KeyboardEvent): void {
  if (e.key !== 'Escape' || e.defaultPrevented) return
  const el = document.activeElement
  if (el instanceof HTMLElement && isTextField(el)) {
    el.blur()
    return
  }
  const top = stack[stack.length - 1]
  if (!top) return
  e.preventDefault()
  top()
}

function isTextField(el: HTMLElement): boolean {
  return (
    el.tagName === 'INPUT' ||
    el.tagName === 'TEXTAREA' ||
    el.isContentEditable ||
    el.getAttribute('contenteditable') === 'true'
  )
}
