import { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react'
import type { ReactNode } from 'react'
import { ALL_LAYERS, DOMAINS, UNSORTED, type DomainId, type Layer } from '@/lib/domains'

interface DomainContextType {
  /** The checked layers. Never empty. */
  layers: ReadonlySet<Layer>
  setLayers: (next: ReadonlySet<Layer>) => void
  toggle: (layer: Layer) => void
  only: (layer: Layer) => void
  all: () => void
  /** Exactly one real domain checked (Unsorted may ride along) → that domain. */
  soleDomain: DomainId | null
}

const DomainContext = createContext<DomainContextType | undefined>(undefined)

export const LAYERS_KEY = 'symphony-layers'

/** Layers persist forever, like a calendar checkbox. Anything unreadable, empty,
 *  or unknown falls back to everything — the only default that hides nothing. */
export function resolveInitialLayers(stored: string | null): ReadonlySet<Layer> {
  if (!stored) return ALL_LAYERS
  try {
    const parsed: unknown = JSON.parse(stored)
    if (!Array.isArray(parsed)) return ALL_LAYERS
    const valid = parsed.filter((x): x is Layer => ALL_LAYERS.has(x as Layer))
    return valid.length > 0 ? new Set(valid) : ALL_LAYERS
  } catch {
    return ALL_LAYERS
  }
}

export function soleDomainOf(layers: ReadonlySet<Layer>): DomainId | null {
  const real = DOMAINS.map((d) => d.id).filter((id) => layers.has(id))
  return real.length === 1 ? real[0] : null
}

export function DomainProvider({ children }: { children: ReactNode }) {
  const [layers, setLayersState] = useState<ReadonlySet<Layer>>(() => {
    try { return resolveInitialLayers(localStorage.getItem(LAYERS_KEY)) } catch { return ALL_LAYERS }
  })

  useEffect(() => {
    try { localStorage.setItem(LAYERS_KEY, JSON.stringify([...layers])) } catch { /* ignore */ }
  }, [layers])

  const setLayers = useCallback((next: ReadonlySet<Layer>) => {
    if (next.size > 0) setLayersState(new Set(next))
  }, [])
  const toggle = useCallback((layer: Layer) => {
    setLayersState((prev) => {
      const next = new Set(prev)
      if (next.has(layer)) { if (next.size === 1) return prev; next.delete(layer) } else next.add(layer)
      return next
    })
  }, [])
  const only = useCallback((layer: Layer) => setLayersState(new Set([layer])), [])
  const all = useCallback(() => setLayersState(ALL_LAYERS), [])

  const value = useMemo<DomainContextType>(() => {
    const soleDomain = soleDomainOf(layers)
    return { layers, setLayers, toggle, only, all, soleDomain }
  }, [layers, setLayers, toggle, only, all])

  return <DomainContext.Provider value={value}>{children}</DomainContext.Provider>
}

export function useDomain() {
  const context = useContext(DomainContext)
  if (!context) throw new Error('useDomain must be used within DomainProvider')
  return context
}

export { UNSORTED }
