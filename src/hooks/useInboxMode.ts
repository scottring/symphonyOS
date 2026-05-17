import { useState, useCallback } from 'react'

export type InboxMode = 'dense' | 'focus'

const STORAGE_KEY = 'symphony-inbox-mode'

function readStored(): InboxMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return v === 'focus' ? 'focus' : 'dense'
  } catch {
    return 'dense'
  }
}

export function useInboxMode(): [InboxMode, (m: InboxMode) => void] {
  const [mode, setModeState] = useState<InboxMode>(readStored)

  const setMode = useCallback((m: InboxMode) => {
    setModeState(m)
    try { localStorage.setItem(STORAGE_KEY, m) } catch { /* ignore */ }
  }, [])

  return [mode, setMode]
}
