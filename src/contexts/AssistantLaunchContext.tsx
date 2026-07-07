// src/contexts/AssistantLaunchContext.tsx
//
// Global "open the assistant" channel. Any component (unibox, Add-to-today,
// plan cards…) can call openAssistant({ message, autoSend }) and the active
// assistant host — Shell's Today rail on desktop-Today, ShellLayout's rail
// everywhere else — opens itself and (optionally) sends the seed message.
//
// The seed lives in a ref and is consumed exactly once; `nonce` is the state
// signal hosts subscribe to. Outside the provider, useAssistantLauncher is a
// no-op so components stay testable in isolation.

import { createContext, useContext, useState, useRef, useCallback, useMemo, type ReactNode } from 'react'

export interface AssistantSeed {
  /** First message of the conversation. */
  message: string
  /** Send it immediately (default true). */
  autoSend?: boolean
}

interface AssistantLaunchValue {
  openAssistant: (seed?: AssistantSeed) => void
  /** Increments on every openAssistant call; 0 = never launched. */
  nonce: number
  /** Returns the pending seed once, then null. */
  consumeSeed: () => AssistantSeed | null
}

const AssistantLaunchContext = createContext<AssistantLaunchValue | null>(null)

export function AssistantLaunchProvider({ children }: { children: ReactNode }) {
  const [nonce, setNonce] = useState(0)
  const seedRef = useRef<AssistantSeed | null>(null)

  const openAssistant = useCallback((seed?: AssistantSeed) => {
    seedRef.current = seed ?? null
    setNonce((n) => n + 1)
  }, [])

  const consumeSeed = useCallback(() => {
    const seed = seedRef.current
    seedRef.current = null
    return seed
  }, [])

  const value = useMemo(
    () => ({ openAssistant, nonce, consumeSeed }),
    [openAssistant, nonce, consumeSeed],
  )

  return (
    <AssistantLaunchContext.Provider value={value}>
      {children}
    </AssistantLaunchContext.Provider>
  )
}

const NOOP_LAUNCHER = { openAssistant: () => {} }

/** For components that want to open the assistant. Safe outside the provider. */
export function useAssistantLauncher(): { openAssistant: (seed?: AssistantSeed) => void } {
  const ctx = useContext(AssistantLaunchContext)
  return ctx ?? NOOP_LAUNCHER
}

const NOOP_REQUESTS = { nonce: 0, consumeSeed: () => null as AssistantSeed | null }

/** For assistant hosts (rails) that react to launches. Safe outside the provider. */
export function useAssistantLaunchRequests(): { nonce: number; consumeSeed: () => AssistantSeed | null } {
  const ctx = useContext(AssistantLaunchContext)
  return ctx ?? NOOP_REQUESTS
}
