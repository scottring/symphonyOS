import { useEffect, useState } from 'react'
import { X, Calendar, Check } from 'lucide-react'

export type ToastType = 'success' | 'info' | 'warning'

export interface ToastMessage {
  id: string
  message: string
  type: ToastType
  duration?: number // ms, default 3000
}

interface ToastProps {
  toast: ToastMessage | null
  onDismiss: () => void
}

export function Toast({ toast, onDismiss }: ToastProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [isLeaving, setIsLeaving] = useState(false)

  useEffect(() => {
    if (toast) {
      setIsLeaving(false)
      // Small delay for enter animation
      requestAnimationFrame(() => {
        setIsVisible(true)
      })

      // Auto-dismiss after duration
      const duration = toast.duration ?? 3000
      const timeout = setTimeout(() => {
        setIsLeaving(true)
        setTimeout(() => {
          setIsVisible(false)
          setIsLeaving(false)
          onDismiss()
        }, 200)
      }, duration)

      return () => clearTimeout(timeout)
    } else {
      setIsLeaving(true)
      const timeout = setTimeout(() => {
        setIsVisible(false)
        setIsLeaving(false)
      }, 200)
      return () => clearTimeout(timeout)
    }
  }, [toast, onDismiss])

  if (!isVisible && !toast) return null

  const getIcon = () => {
    switch (toast?.type) {
      case 'success':
        return <Check className="w-4 h-4 text-green-400" />
      case 'info':
        return <Calendar className="w-4 h-4 text-blue-400" />
      case 'warning':
        return <Calendar className="w-4 h-4 text-amber-400" />
      default:
        return null
    }
  }

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
        {getIcon()}
        <span className="text-sm font-medium">{toast?.message}</span>

        <button
          onClick={() => {
            setIsLeaving(true)
            setTimeout(onDismiss, 200)
          }}
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
