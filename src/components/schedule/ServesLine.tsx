// src/components/schedule/ServesLine.tsx
//
// The muted "↳ Step toward “goal”" / "↳ From “line”" under a Today row — the
// Week list's line (WeekListV2 `pv2-wl-parent`), at rest. Pressing it opens
// the parent's details; it never opens the row it sits in.
import { CornerDownRight } from 'lucide-react'
import { parentLinkText, type ParentLink } from '@/lib/planning/parentLink'

export function ServesLine({ parent, onOpen }: { parent: ParentLink; onOpen: (id: string) => void }) {
  return (
    <button
      type="button"
      className="pv2-wl-parent today-serves"
      onClick={(e) => { e.stopPropagation(); onOpen(parent.id) }}
      aria-label={`${parent.isGoal ? 'Step toward' : 'From'} ${parent.title} — open its details`}
    >
      <CornerDownRight className="h-3 w-3 shrink-0" aria-hidden="true" />
      <span className="truncate">{parentLinkText(parent)}</span>
    </button>
  )
}
