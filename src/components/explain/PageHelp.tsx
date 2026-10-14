// src/components/explain/PageHelp.tsx
//
// "What is this page?" lives with the page, as a small "?" beside its title
// (Scott, 2026-10-14: in the conversation bar it "doesn't make sense"). The
// shell knows whether the page has a guide and how to play it; the page only
// decides where the button sits.

import { createContext, useContext } from 'react'
import { EXPLAIN_LABEL } from '@/lib/explain/pageGuides'

/** Plays the page's tour, or asks Symphony when the page has none on screen.
 *  Null where the page has no guide. */
export const PageHelpContext = createContext<(() => void) | null>(null)

export function usePageHelp(): (() => void) | null {
  return useContext(PageHelpContext)
}

/** The "?" beside a page title. `onHelp` is the page's own fallback where the
 *  shell offers none (phones, which have no docked bar). */
export function PageHelpButton({ onHelp, className = '' }: { onHelp?: () => void; className?: string }) {
  const fromShell = usePageHelp()
  const run = fromShell ?? onHelp
  if (!run) return null
  return (
    <button type="button" className={`page-help ${className}`.trim()} onClick={run}
      aria-label={EXPLAIN_LABEL} title={EXPLAIN_LABEL}>?</button>
  )
}
