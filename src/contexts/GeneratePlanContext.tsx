import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

interface UndoToken {
  id: string
  expiresAt: string
  description?: string
}

interface ContextValue {
  lastUndoToken: UndoToken | null
  setLastUndoToken: (t: UndoToken | null) => void
}

const GeneratePlanContext = createContext<ContextValue | null>(null)

export function GeneratePlanProvider({ children }: { children: ReactNode }) {
  const [lastUndoToken, setLastUndoTokenState] = useState<UndoToken | null>(null)
  const setLastUndoToken = useCallback((t: UndoToken | null) => setLastUndoTokenState(t), [])
  return (
    <GeneratePlanContext.Provider value={{ lastUndoToken, setLastUndoToken }}>
      {children}
    </GeneratePlanContext.Provider>
  )
}

export function useGeneratePlanContext(): ContextValue {
  const ctx = useContext(GeneratePlanContext)
  if (!ctx) throw new Error('useGeneratePlanContext must be inside GeneratePlanProvider')
  return ctx
}
