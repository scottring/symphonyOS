// Inline nudge under a buy-ish task row: offers to move the purchase onto the
// shared "To buy" list where the household can see it (and where it stops
// clogging the timeline). Suggest-and-confirm — nothing moves without the tap.
// Same visual pattern as ShareToFamilyNudge.
import { ShoppingBag } from 'lucide-react'

interface Props {
  onSend: () => void
  onDismiss: () => void
}

export function ToBuyNudge({ onSend, onDismiss }: Props) {
  return (
    <div className="mt-1 ml-12 flex items-center gap-2 rounded-lg border border-primary-100 bg-primary-50/70 px-3 py-1.5 text-[12px]">
      <ShoppingBag className="w-3.5 h-3.5 shrink-0 text-primary-600" aria-hidden />
      <span className="flex-1 text-neutral-600">
        Looks like a purchase — move it to the To buy list?
      </span>
      <button
        type="button"
        onClick={onSend}
        aria-label="Send to To buy list"
        className="font-medium text-primary-700 hover:text-primary-800"
      >
        Move
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
