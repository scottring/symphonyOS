import { useState } from 'react'
import { PanelLeft } from 'lucide-react'
import { useMobile } from '@/hooks/useMobile'
import { useReferenceLists } from './ReferenceListsContext'
import { PlanningSheet } from './PlanningSheet'

/** Same launcher and placement at every horizon; desktop dock, phone sheet. */
export function ShelvesButton({ weekPage, periodShelves = false }: { weekPage?: Date; periodShelves?: boolean }) {
  const references = useReferenceLists()
  const mobile = useMobile()
  const [open, setOpen] = useState(false)
  const pinned = !!references?.pins.some(pin => pin.kind === 'today')
  if (!references) return null
  return <>
    <button type="button" className="daybook-choose" aria-label={(mobile ? open : pinned) ? 'Close shelves' : 'Shelves'} aria-expanded={mobile ? open : pinned}
      onClick={() => mobile ? setOpen(!open) : pinned ? references.unpin('today') : references.pin('today')}>
      <PanelLeft className="h-3.5 w-3.5" aria-hidden="true" /> Shelves
    </button>
    {mobile && <PlanningSheet open={open} onClose={() => setOpen(false)} weekPage={weekPage} periodShelves={periodShelves} />}
  </>
}
