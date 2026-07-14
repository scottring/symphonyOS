import { useEffect, useState } from 'react'
import { X, Check } from 'lucide-react'

export interface ConfirmationToastAction {
  label: string
  onClick: () => void
}

export interface ConfirmationToastMessage {
  id: string
  message: string
  hint?: string
  actions: ConfirmationToastAction[]
}

interface ConfirmationToastProps {
  toast: ConfirmationToastMessage | null
  onDismiss: () => void
}

export function ConfirmationToast({ toast, onDismiss }: ConfirmationToastProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [isLeaving, setIsLeaving] = useState(false)

  useEffect(() => {
    if (toast) {
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
  }, [toast])

  const handleAction = (action: ConfirmationToastAction) => {
    action.onClick()
    setIsLeaving(true)
    setTimeout(onDismiss, 200)
  }

  const handleDismiss = () => {
    setIsLeaving(true)
    setTimeout(onDismiss, 200)
  }

  if (!isVisible && !toast) return null

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[300]">
      <div
        className={`
          flex flex-col gap-3 px-4 py-4 rounded-xl
          bg-neutral-800 text-white shadow-xl
          transition-all duration-200 ease-out
          min-w-[320px] max-w-[min(480px,calc(100vw-2rem))]
          ${isVisible && !isLeaving
            ? 'opacity-100 translate-y-0'
            : 'opacity-0 translate-y-2'
          }
        `}
      >
        {/* Header with icon and message */}
        <div className="flex items-start gap-3">
          <Check className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
          <span className="text-sm font-medium flex-1">{toast?.message}</span>
          <button
            onClick={handleDismiss}
            className="p-1 rounded-lg hover:bg-white/10 transition-colors
                       text-neutral-400 hover:text-white flex-shrink-0"
            aria-label="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Optional shortcut actions — hint + quiet buttons so it's clear
            nothing here is required */}
        {toast && toast.actions.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 pl-8">
            {toast.hint && (
              <span className="text-xs text-neutral-400 flex-shrink-0">{toast.hint}</span>
            )}
            {toast.actions.map((action, index) => (
              <button
                key={index}
                onClick={() => handleAction(action)}
                className="px-3 py-1.5 rounded-lg text-sm font-medium
                           bg-white/10 text-white hover:bg-white/20
                           transition-all duration-150"
              >
                {action.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
