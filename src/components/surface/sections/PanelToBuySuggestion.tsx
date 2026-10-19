// The "To buy" suggestion, in the task's details — not on Today's page.
//
// It used to be a strip under the row on Today ("Looks like a purchase — move
// it to the To buy list?"), which put a new decision beneath an ordinary task
// on the one surface that is for doing, not organizing (Scott, 2026-09-21).
// Here it is a quiet line you can answer while you have the task open, with
// the same two answers it always had. "Not now" is remembered per task, the
// same way the row's strip remembered it (lib/lists/toBuy).
import { useReducer } from 'react'
import { ShoppingBag } from 'lucide-react'
import { dismissToBuyNudge, isBuyish, isToBuyNudgeDismissed } from '@/lib/lists/toBuy'

interface Props {
  taskId: string
  title: string
  completed: boolean
  /** Household and contact names — "pick up Michael" is not a purchase. */
  knownPeople: string[]
  onSend: () => void
}

export function PanelToBuySuggestion({ taskId, title, completed, knownPeople, onSend }: Props) {
  const [, bump] = useReducer((x: number) => x + 1, 0)
  if (completed || !isBuyish(title, knownPeople) || isToBuyNudgeDismissed(taskId)) return null
  // Drawn as the pane's one suggestion card (detail pane standard,
  // 2026-10-19): a proposal to accept or dismiss, tinted apart from the facts
  // and actions so it can't be mistaken for either.
  return (
    <div className="panel-proposal flex items-start gap-3 rounded-xl bg-primary-50 px-3.5 py-3 text-[14px] text-neutral-800">
      <ShoppingBag className="mt-0.5 h-4 w-4 shrink-0 text-primary-600" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="m-0 leading-snug">Looks like a purchase. Move it to the To buy list?</p>
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={onSend}
            aria-label="Send to To buy list"
            className="h-8 rounded-lg border border-primary-600 bg-white px-3 text-[13px] font-medium text-primary-700 hover:bg-primary-100"
          >
            Move to To buy
          </button>
          <button
            type="button"
            onClick={() => { dismissToBuyNudge(taskId); bump() }}
            aria-label="Not now"
            className="h-8 rounded-lg px-2 text-[13px] text-neutral-600 hover:text-neutral-900"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  )
}
