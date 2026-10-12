// src/components/explain/GuideProvider.tsx
//
// "Show me this page": the shell's one guide. The conversation (typed or
// Talk) asks the page to show something (showSignal); this holds what is
// shown and where in a tour you are. GuideLayer draws it over the page; the
// docked conversation bar carries Back / Next / Close where there is one.

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { onShowRequest, type ShowSource } from '@/lib/explain/showSignal'
import type { ShowStep } from '@/lib/explain/steps'

export interface GuideState {
  step: ShowStep | null
  index: number
  count: number
  source: ShowSource | null
  next: () => void
  back: () => void
  close: () => void
  /** The docked bar shows the tour's controls; without one the note does. */
  barHosted: boolean
  setBarHosted: (hosted: boolean) => void
}

const GuideContext = createContext<GuideState | null>(null)

export function usePageGuide(): GuideState | null {
  return useContext(GuideContext)
}

export function PageGuideProvider({ children }: { children: ReactNode }) {
  const [shown, setShown] = useState<{ steps: ShowStep[]; index: number; source: ShowSource } | null>(null)
  const [barHosted, setBarHosted] = useState(false)
  const { pathname } = useLocation()

  useEffect(() => onShowRequest((steps, source) => setShown({ steps, index: 0, source })), [])
  // A different page has different things on it.
  useEffect(() => { setShown(null) }, [pathname])

  const close = useCallback(() => setShown(null), [])
  const next = useCallback(() => setShown((s) => !s ? s : s.index < s.steps.length - 1 ? { ...s, index: s.index + 1 } : null), [])
  const back = useCallback(() => setShown((s) => s && s.index > 0 ? { ...s, index: s.index - 1 } : s), [])

  const active = !!shown
  const tour = !!shown && shown.steps.length > 1
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return
      if ((e.target as HTMLElement | null)?.closest?.('input,textarea,select,[contenteditable="true"],[role="menu"],dialog[open]')) return
      if (e.key === 'Escape') { e.preventDefault(); close() }
      else if (tour && e.key === 'ArrowRight') next()
      else if (tour && e.key === 'ArrowLeft') back()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, tour, close, next, back])

  const value = useMemo<GuideState>(() => ({
    step: shown ? shown.steps[shown.index] : null,
    index: shown?.index ?? 0,
    count: shown?.steps.length ?? 0,
    source: shown?.source ?? null,
    next, back, close, barHosted, setBarHosted,
  }), [shown, next, back, close, barHosted])

  return <GuideContext.Provider value={value}>{children}</GuideContext.Provider>
}
