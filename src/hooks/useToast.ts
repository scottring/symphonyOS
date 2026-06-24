import { useSyncExternalStore } from 'react'
import type { ToastMessage, ToastType } from '@/components/toast'

// Module-level singleton toast store.
//
// Previously useToast() held local state, so a toast fired from a non-rendering
// hook (e.g. useSupabaseTasks, which never returns its `toast`) was set but never
// shown — task-write failures looked like successes. Backing every useToast()
// caller with one shared store means a single rendered <Toast> (ShellLayout)
// surfaces toasts fired from anywhere, including data hooks.
let currentToast: ToastMessage | null = null
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getSnapshot() {
  return currentToast
}

export function showToast(message: string, type: ToastType = 'info', duration?: number) {
  currentToast = {
    id: Math.random().toString(36).substring(7),
    message,
    type,
    duration,
  }
  emit()
}

export function dismissToast() {
  currentToast = null
  emit()
}

export function useToast() {
  // showToast / dismissToast are stable module-level references, so they can be
  // returned directly — no useCallback needed.
  const toast = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  return {
    toast,
    showToast,
    dismissToast,
  }
}
