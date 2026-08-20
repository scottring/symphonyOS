import { createContext, useContext, type ReactNode } from 'react'
import { usePinnedItems } from '@/hooks/usePinnedItems'

type PinsContextValue = ReturnType<typeof usePinnedItems>

const PinsContext = createContext<PinsContextValue | null>(null)

/**
 * ONE `usePinnedItems()` instance for the whole shell.
 *
 * `usePinnedItems` owns local state seeded by a fetch on mount, so two callers
 * are two independent copies: pinning a list from /lists would write the row
 * and update that component's array while the sidebar — reading its own
 * instance — kept rendering the old set until a full reload. The To buy line
 * hit exactly this shape with `useLists()` and had to move onto the shared
 * ListsContext; pins get the same treatment before the bug can happen twice.
 *
 * Mounted in ShellLayout, above both the chrome (which draws the pinned
 * section) and the routed app (which offers the pin control).
 */
export function PinsProvider({ children }: { children: ReactNode }) {
  const value = usePinnedItems()
  return <PinsContext.Provider value={value}>{children}</PinsContext.Provider>
}

/** Throws outside the provider — the shell always mounts it. */
export function usePinsContext(): PinsContextValue {
  const ctx = useContext(PinsContext)
  if (!ctx) throw new Error('usePinsContext must be used within PinsProvider')
  return ctx
}

/**
 * Null-tolerant read, for surfaces that can render provider-less (tests, and
 * any app mounted outside the shell). Same escape hatch ListsContext needed.
 */
export function usePinsContextOrNull(): PinsContextValue | null {
  return useContext(PinsContext)
}
