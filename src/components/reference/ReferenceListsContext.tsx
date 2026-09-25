import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

/** 'today' is the day's plan pin (DayPlanPanel); week/month are the period lists. */
export type ReferenceKind = 'today' | 'week' | 'month'
export const REFERENCE_KINDS: ReferenceKind[] = ['today', 'week', 'month']
export interface ReferencePin { kind: ReferenceKind; date: string }
interface ReferenceListsState {
  shelvesTarget: HTMLElement | null
  setShelvesTarget: (target: HTMLElement | null) => void
  /**
   * True while something off the planning routes intends to render period
   * Shelves — today, a goal's detail page (S2-18).
   *
   * `ReferenceLists` decides what the 'today' pin renders by PATHNAME, which
   * meant `/task/:id` always got `TodayPlanList`. A goal claims the slot so it
   * can show its own period instead; an ordinary task never claims it and
   * keeps today's chooser untouched. A claim, not a pathname test, so the slot
   * is only ever handed over when there is actually something to put in it.
   */
  periodShelvesClaimed: boolean
  claimPeriodShelves: () => () => void
  pins: ReferencePin[]
  pin: (kind: ReferenceKind, date?: Date) => void
  unpin: (kind: ReferenceKind) => void
}
const Context = createContext<ReferenceListsState | null>(null)
export const useReferenceLists = () => useContext(Context)

/** Only period identifiers are stored; task content never enters browser storage. */
export function ReferenceListsProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const [shelvesTarget, setShelvesTarget] = useState<HTMLElement | null>(null)
  // Counted rather than boolean: a remount can claim before the old claim
  // releases, and a plain flag would be cleared by the departing one.
  const [claims, setClaims] = useState(0)
  const claimPeriodShelves = useCallback(() => {
    setClaims((n) => n + 1)
    return () => setClaims((n) => Math.max(0, n - 1))
  }, [])
  const key = `symphony-reference-lists:${userId}`
  const [pins, setPins] = useState<ReferencePin[]>(() => {
    try {
      const saved: unknown = JSON.parse(sessionStorage.getItem(key) ?? '[]')
      if (!Array.isArray(saved)) return []
      return saved.filter((p): p is ReferencePin =>
        p && REFERENCE_KINDS.includes(p.kind) && typeof p.date === 'string' && Number.isFinite(Date.parse(p.date)))
        .filter((p, i, all) => all.findIndex(other => other.kind === p.kind) === i)
    } catch { return [] }
  })
  function save(next: ReferencePin[]) {
    setPins(next)
    try { sessionStorage.setItem(key, JSON.stringify(next)) } catch { /* In-memory pinning still works. */ }
  }
  return <Context.Provider value={{
    pins, shelvesTarget, setShelvesTarget,
    periodShelvesClaimed: claims > 0, claimPeriodShelves,
    pin: (kind, date = new Date()) => save([...pins.filter(p => p.kind !== kind), { kind, date: date.toISOString() }]),
    unpin: kind => save(pins.filter(p => p.kind !== kind)),
  }}>{children}</Context.Provider>
}
