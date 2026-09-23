import { useEffect } from 'react'
import { X } from 'lucide-react'

interface InboxUndoToastProps {
  message: string
  onUndo?: () => void
  onDismiss: () => void
  durationMs?: number
  /** Button text; "Retry" after a failed undo. */
  actionLabel?: string
  /** Stays until dismissed — a failure must not vanish on a timer. */
  persistent?: boolean
  /** Disables the action while it runs, so a slow undo can't be sent twice. */
  busy?: boolean
  /** Unconfirmed moves: try the move again (shown beside Undo). */
  onRetry?: () => void
}

export function InboxUndoToast({ message, onUndo, onDismiss, durationMs = 10000, actionLabel = 'Undo', persistent = false, busy = false, onRetry }: InboxUndoToastProps) {
  useEffect(() => {
    if (persistent || busy) return
    const id = setTimeout(onDismiss, durationMs)
    return () => clearTimeout(id)
  }, [onDismiss, durationMs, persistent, busy])

  return (
    <div
      role="status"
      className="phone-lift phone-lift-wide fixed bottom-6 left-6 z-50 flex items-center gap-3 bg-neutral-800 text-white text-sm rounded-xl px-4 py-2.5 shadow-lg animate-fade-in"
    >
      <span>{message}</span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          disabled={busy}
          className="disabled:opacity-50 px-2 py-0.5 rounded-md text-primary-200 hover:text-white hover:bg-white/10 transition-colors font-medium"
        >
          Retry
        </button>
      )}
      {onUndo && (
        <button
          type="button"
          onClick={onUndo}
          disabled={busy}
          className="disabled:opacity-50 px-2 py-0.5 rounded-md text-primary-200 hover:text-white hover:bg-white/10 transition-colors font-medium"
        >
          {busy ? 'Undoing…' : actionLabel}
        </button>
      )}
      <button
        type="button"
        aria-label="Dismiss"
        onClick={onDismiss}
        className="ml-1 p-0.5 rounded text-neutral-400 hover:text-white transition-colors"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}
