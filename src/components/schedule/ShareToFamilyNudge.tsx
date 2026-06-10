// src/components/schedule/ShareToFamilyNudge.tsx
//
// Inline nudge shown under a work/personal event in Today when it falls during
// family hours: offers to surface it on the shared family timeline.
import { Users } from 'lucide-react'

interface Props {
  /** "work" or "personal" — used in the prompt copy. */
  contextLabel: string
  onAdd: () => void
  onDismiss: () => void
}

export function ShareToFamilyNudge({ contextLabel, onAdd, onDismiss }: Props) {
  return (
    <div className="mt-1 ml-12 flex items-center gap-2 rounded-lg border border-primary-100 bg-primary-50/70 px-3 py-1.5 text-[12px]">
      <Users className="w-3.5 h-3.5 shrink-0 text-primary-600" aria-hidden />
      <span className="flex-1 text-neutral-600">
        This {contextLabel} event is during family time — add it to the shared family timeline?
      </span>
      <button
        type="button"
        onClick={onAdd}
        aria-label="Add to family timeline"
        className="font-medium text-primary-700 hover:text-primary-800"
      >
        Add
      </button>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Not now"
        className="text-neutral-400 hover:text-neutral-600"
      >
        Not now
      </button>
    </div>
  )
}
