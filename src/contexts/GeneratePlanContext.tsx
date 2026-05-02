import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

interface UndoToken {
  id: string
  expiresAt: string
  description?: string
}

interface ContextValue {
  lastUndoToken: UndoToken | null
  setLastUndoToken: (t: UndoToken | null) => void
  /** Monotonically increasing signal. Bumped by useGeneratePlan on a
   *  successful generate. Hooks that cache plan-derived state (useMealPlan,
   *  useWeeklyBrief) watch it as an effect dep and refetch on change. */
  refreshSignal: number
  bumpRefreshSignal: () => void
}

const GeneratePlanContext = createContext<ContextValue | null>(null)

export function GeneratePlanProvider({ children }: { children: ReactNode }) {
  const [lastUndoToken, setLastUndoTokenState] = useState<UndoToken | null>(null)
  const setLastUndoToken = useCallback((t: UndoToken | null) => setLastUndoTokenState(t), [])
  const [refreshSignal, setRefreshSignal] = useState(0)
  const bumpRefreshSignal = useCallback(() => setRefreshSignal(v => v + 1), [])
  return (
    <GeneratePlanContext.Provider value={{ lastUndoToken, setLastUndoToken, refreshSignal, bumpRefreshSignal }}>
      {children}
    </GeneratePlanContext.Provider>
  )
}

export function useGeneratePlanContext(): ContextValue {
  const ctx = useContext(GeneratePlanContext)
  if (!ctx) throw new Error('useGeneratePlanContext must be inside GeneratePlanProvider')
  return ctx
}
