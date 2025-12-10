import { useState, useCallback } from 'react'
import type { ToastMessage, ToastType } from '@/components/toast'

export function useToast() {
  const [toast, setToast] = useState<ToastMessage | null>(null)

  const showToast = useCallback((message: string, type: ToastType = 'info', duration?: number) => {
    setToast({
      id: Math.random().toString(36).substring(7),
      message,
      type,
      duration,
    })
  }, [])

  const dismissToast = useCallback(() => {
    setToast(null)
  }, [])

  return {
    toast,
    showToast,
    dismissToast,
  }
}
