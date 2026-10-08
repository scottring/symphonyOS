// src/components/common/ViewFilterNotice.tsx
//
// Two quiet pieces for the view filters (the top bar's people filter and the
// life-area layers), shared by every page that lists and adds:
//
//   HiddenItemNotice — after a save the view hides: "Saved to October. It’s
//     hidden because you’re showing only Alex’s items." with Show it and a
//     dismiss. It stays until acted on (not a toast that's gone in seconds).
//   ActiveViewLine — "Showing only Alex’s items · Show everyone", so a
//     narrowed list never passes for the whole household.
//
// Both only ever change the VIEW. Neither touches an item, its people, its
// area or its sharing (lib/filters/viewVisibility).

import { EyeOff, ListFilter, X } from 'lucide-react'
import { useAssigneeFilter } from '@/hooks/useAssigneeFilter'
import { useDomainOptional } from '@/hooks/useDomain'
import { ALL_LAYERS } from '@/lib/domains'
import { viewSummary } from '@/lib/filters/viewVisibility'

const LINK = 'font-medium text-primary-700 underline-offset-2 hover:underline focus-visible:underline'

export function HiddenItemNotice({ message, onShow, onDismiss, className }: {
  message: string
  onShow: () => void
  onDismiss: () => void
  className?: string
}) {
  return (
    <div role="status" aria-live="polite"
      className={`flex items-start gap-2 rounded-xl border border-primary-100 bg-primary-50 px-3 py-2 text-[13.5px] leading-snug text-neutral-700 ${className ?? ''}`}>
      <EyeOff className="mt-0.5 h-3.5 w-3.5 shrink-0 text-neutral-500" aria-hidden="true" />
      <p className="min-w-0 flex-1">
        {message}{' '}
        <button type="button" onClick={onShow} className={LINK}>Show it</button>
      </p>
      <button type="button" onClick={onDismiss} aria-label="Dismiss"
        className="-mr-1 -mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700">
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  )
}

/** "Showing only Alex’s items · Show everyone" — nothing when the view is whole. */
export function ActiveViewLine({ members, className }: {
  members: readonly { id: string; name: string }[]
  className?: string
}) {
  const domain = useDomainOptional()
  const [people, setPeople] = useAssigneeFilter()
  const layers = domain?.layers ?? ALL_LAYERS
  const summary = viewSummary({ layers, people }, members)
  if (!summary) return null
  return (
    <p className={`flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12.5px] text-neutral-500 ${className ?? ''}`}>
      <ListFilter className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{summary.text}</span>
      {summary.people && <><span aria-hidden="true">·</span><button type="button" onClick={() => setPeople([])} className={LINK}>Show everyone</button></>}
      {summary.area && domain && <><span aria-hidden="true">·</span><button type="button" onClick={() => domain.setLayers(ALL_LAYERS)} className={LINK}>Show all areas</button></>}
    </p>
  )
}
