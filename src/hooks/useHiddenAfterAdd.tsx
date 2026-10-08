// src/hooks/useHiddenAfterAdd.tsx
//
// After a save, say so when the current view hides what was saved, with one
// way to see it (live, 2026-10-08: a new October line vanished under the
// people filter, and nothing said why). The page reports what it saved and
// where; the hook decides from the canonical filters (lib/filters/
// viewVisibility) and hands back the notice to draw beside the add row.
//
// "Show it" widens only the lens that hid it — people back to everyone, or the
// item's area checked. It never reassigns, re-tags or reshares the item.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useAssigneeFilter } from '@/hooks/useAssigneeFilter'
import { useDomainOptional } from '@/hooks/useDomain'
import { ALL_LAYERS } from '@/lib/domains'
import { hiddenBy, hiddenSentence, widenedView, type ItemFacts, type ViewFilters } from '@/lib/filters/viewVisibility'
import { HiddenItemNotice } from '@/components/common/ViewFilterNotice'

interface Saved { item: ItemFacts; savedTo: string }

export function useHiddenAfterAdd(
  members: readonly { id: string; name: string }[],
  /** A page that holds the people lens in props (Today) passes it here, so
   *  the notice reads exactly what that page draws. */
  peopleLens?: { people: readonly string[]; setPeople?: (ids: string[]) => void },
) {
  const domain = useDomainOptional()
  const [storedPeople, setStoredPeople] = useAssigneeFilter()
  const people = peopleLens?.people ?? storedPeople
  const setPeople = peopleLens?.setPeople ?? setStoredPeople
  const layers = domain?.layers ?? ALL_LAYERS

  // The view at the moment a save resolves — a report arrives after an await,
  // so the render that scheduled it may be stale.
  const viewRef = useRef<ViewFilters>({ layers, people })
  useEffect(() => { viewRef.current = { layers, people } }, [layers, people])

  const [saved, setSaved] = useState<Saved | null>(null)
  /** Call once the save has succeeded. `savedTo` names the place: "October". */
  const report = useCallback((item: ItemFacts, savedTo: string) => {
    setSaved(hiddenBy(item, viewRef.current) ? { item, savedTo } : null)
  }, [])

  const view: ViewFilters = { layers, people }
  const hidden = saved ? hiddenBy(saved.item, view) : null
  // Widened some other way (the top bar): the notice has nothing left to say.
  if (saved && !hidden) setSaved(null)

  const showIt = () => {
    if (!saved || !hidden) return
    const next = widenedView(saved.item, view, hidden)
    if (hidden.people) setPeople([...next.people])
    if (hidden.area) domain?.setLayers(next.layers)
    setSaved(null)
  }

  const notice = saved && hidden ? (
    <HiddenItemNotice
      message={`Saved to ${saved.savedTo}. ${hiddenSentence(saved.item, view, hidden, members)}`}
      onShow={showIt}
      onDismiss={() => setSaved(null)}
    />
  ) : null

  return { report, notice }
}
