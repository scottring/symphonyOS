/**
 * A persistent live region for toast text. The visual toasts mount only when
 * they have something to say, and screen readers reliably announce only
 * changes inside a region that was already in the page — so "Moved to Friday"
 * or "Couldn't save" went unheard. This stays mounted and mirrors the text.
 * Errors use the assertive alert region; everything else is polite.
 */
export function ToastLiveRegion({ message, urgent = false }: { message?: string | null; urgent?: boolean }) {
  return (
    <div className="sr-only">
      <div role="status" aria-live="polite" aria-atomic="true">{!urgent && message ? message : ''}</div>
      <div role="alert" aria-atomic="true">{urgent && message ? message : ''}</div>
    </div>
  )
}
