import { useEffect, useRef, type RefObject } from 'react'

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Focus handling for a modal sheet or dialog.
 *
 * While `open`: focus moves inside (unless a child already took it, e.g. an
 * autofocused field), and Escape calls `onClose` — marked handled so the
 * detail panel underneath (useEscapeKey) stays open. From inside a text
 * field the first Escape only leaves the field. It listens in the bubble
 * phase, so a popover inside the dialog (usePopoverFocus, capture phase)
 * closes first. On close, focus returns to whatever opened it.
 */
export function useDialogFocus(
  open: boolean,
  containerRef: RefObject<HTMLElement | null>,
  onClose?: () => void,
): void {
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose })

  useEffect(() => {
    if (!open) return
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const container = containerRef.current
    if (container && !container.contains(document.activeElement)) {
      const first = container.querySelector<HTMLElement>(FOCUSABLE)
      if (first) first.focus({ preventScroll: true })
      else {
        if (!container.hasAttribute('tabindex')) container.setAttribute('tabindex', '-1')
        container.focus({ preventScroll: true })
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || !onCloseRef.current) return
      e.preventDefault()
      // Like useEscapeKey: the first Escape leaves a text field, so a stray
      // key doesn't throw away a half-edited review.
      const el = document.activeElement
      if (el instanceof HTMLElement && container?.contains(el)
        && ((el instanceof HTMLInputElement && !['checkbox', 'radio', 'button', 'submit'].includes(el.type))
          || el.tagName === 'TEXTAREA' || el.isContentEditable)) {
        el.blur()
        if (!container.hasAttribute('tabindex')) container.setAttribute('tabindex', '-1')
        container.focus({ preventScroll: true })
        return
      }
      onCloseRef.current()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      const active = document.activeElement
      const focusWasInside = !active || active === document.body || !active.isConnected || !!container?.contains(active)
      if (focusWasInside && opener?.isConnected && opener !== document.body) opener.focus({ preventScroll: true })
    }
  }, [open, containerRef])
}
