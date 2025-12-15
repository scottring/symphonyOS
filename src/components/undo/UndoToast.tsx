import { useEffect, useState } from 'react'
import { Undo2, X } from 'lucide-react'
import type { UndoAction } from '@/hooks/useUndo'

interface UndoToastProps {
  action: UndoAction | null
  onUndo: () => void
  onDismiss: () => void
}

export function UndoToast({ action, onUndo, onDismiss }: UndoToastProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [isLeaving, setIsLeaving] = useState(false)

  useEffect(() => {
    if (action) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- animation state management
      setIsLeaving(false)
      // Small delay for enter animation
      requestAnimationFrame(() => {
        setIsVisible(true)
      })
    } else {
      setIsLeaving(true)
      const timeout = setTimeout(() => {
        setIsVisible(false)
        setIsLeaving(false)
      }, 200)
      return () => clearTimeout(timeout)
    }
  }, [action])

  if (!isVisible && !action) return null

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
      <div
        className={`
          flex items-center gap-3 px-4 py-3 rounded-xl
          bg-neutral-800 text-white shadow-lg
          transition-all duration-200 ease-out
          ${isVisible && !isLeaving
            ? 'opacity-100 translate-y-0'
            : 'opacity-0 translate-y-2'
          }
        `}
      >
        <span className="text-sm font-medium">{action?.message}</span>
        
        <button
          onClick={onUndo}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg
                     bg-white/10 hover:bg-white/20 transition-colors
                     text-sm font-medium"
        >
          <Undo2 className="w-4 h-4" />
          Undo
        </button>

        <button
          onClick={onDismiss}
          className="p-1 rounded-lg hover:bg-white/10 transition-colors
                     text-neutral-400 hover:text-white"
          aria-label="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
