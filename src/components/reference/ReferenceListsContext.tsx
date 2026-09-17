import { createContext, useContext, useState, type ReactNode } from 'react'

export type ReferenceKind = 'week' | 'month'
export interface ReferencePin { kind: ReferenceKind; date: string }
interface ReferenceListsState {
  pins: ReferencePin[]
  pin: (kind: ReferenceKind, date?: Date) => void
  unpin: (kind: ReferenceKind) => void
}
const Context = createContext<ReferenceListsState | null>(null)
export const useReferenceLists = () => useContext(Context)

/** Only period identifiers are stored; task content never enters browser storage. */
export function ReferenceListsProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const key = `symphony-reference-lists:${userId}`
  const [pins, setPins] = useState<ReferencePin[]>(() => {
    try {
      const saved: unknown = JSON.parse(sessionStorage.getItem(key) ?? '[]')
      if (!Array.isArray(saved)) return []
      return saved.filter((p): p is ReferencePin =>
        p && (p.kind === 'week' || p.kind === 'month') && typeof p.date === 'string' && Number.isFinite(Date.parse(p.date)))
        .filter((p, i, all) => all.findIndex(other => other.kind === p.kind) === i)
    } catch { return [] }
  })
  function save(next: ReferencePin[]) {
    setPins(next)
    try { sessionStorage.setItem(key, JSON.stringify(next)) } catch { /* In-memory pinning still works. */ }
  }
  return <Context.Provider value={{
    pins,
    pin: (kind, date = new Date()) => save([...pins.filter(p => p.kind !== kind), { kind, date: date.toISOString() }]),
    unpin: kind => save(pins.filter(p => p.kind !== kind)),
  }}>{children}</Context.Provider>
}
