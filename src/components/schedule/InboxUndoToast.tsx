import { useEffect } from 'react'
import { X } from 'lucide-react'

interface InboxUndoToastProps {
  message: string
  onUndo?: () => void
  onDismiss: () => void
  durationMs?: number
}

export function InboxUndoToast({ message, onUndo, onDismiss, durationMs = 10000 }: InboxUndoToastProps) {
  useEffect(() => {
    const id = setTimeout(onDismiss, durationMs)
    return () => clearTimeout(id)
  }, [onDismiss, durationMs])

  return (
    <div
      role="status"
      className="fixed bottom-6 left-6 z-50 flex items-center gap-3 bg-neutral-800 text-white text-sm rounded-xl px-4 py-2.5 shadow-lg animate-fade-in"
    >
      <span>{message}</span>
      {onUndo && (
        <button
          type="button"
          onClick={onUndo}
          className="px-2 py-0.5 rounded-md text-primary-200 hover:text-white hover:bg-white/10 transition-colors font-medium"
        >
          Undo
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
