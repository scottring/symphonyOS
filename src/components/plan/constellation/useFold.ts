// src/components/plan/constellation/useFold.ts
//
// A compact list's fold (calm pass, mockup approved 2026-10-18): the first 8
// show, then "+N more", which opens in place, with "Show less" to fold it
// again — the Week's fold (foldDay) with room for 8. A pinned row (a line
// Symphony is pointing at) stays in sight and takes one of the places.

import { useState } from 'react'
import { foldDay } from '@/lib/week/foldDay'

/** Lines a compact list (and the card beside it) shows before "+N more". */
export const LIST_SHOWN = 8

export interface FoldToggleState { label: string; open: boolean; onClick: () => void }

/** The first `cap` of `items` (pinned ones kept in sight), or all once opened. */
export function useFold<T>(items: T[], pinned: (t: T) => boolean = () => false, cap = LIST_SHOWN) {
  const [open, setOpen] = useState(false)
  const fold = foldDay(items.map((it) => ({ event: false, pinned: pinned(it), it })), cap)
  const shown = open ? items : fold.shown.map((x) => x.it)
  const toggle: FoldToggleState | null = items.length > cap && (open || fold.hidden > 0)
    ? { label: open ? 'Show less' : `+${fold.hidden} more`, open, onClick: () => setOpen((o) => !o) }
    : null
  return { shown, toggle }
}
