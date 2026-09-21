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
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13.5px] text-neutral-600">
      <ShoppingBag className="h-4 w-4 shrink-0 text-neutral-400" aria-hidden />
      <span className="min-w-0 flex-1 basis-40">Looks like a purchase. Move it to the To buy list?</span>
      <span className="flex items-center gap-2 pl-7 sm:pl-0">
        <button
          type="button"
          onClick={onSend}
          aria-label="Send to To buy list"
          className="rounded-md border border-neutral-200 px-2 py-0.5 font-medium text-neutral-800 hover:bg-neutral-50"
        >
          Move
        </button>
        <button
          type="button"
          onClick={() => { dismissToBuyNudge(taskId); bump() }}
          aria-label="Not now"
          className="px-1 text-neutral-500 hover:text-neutral-800"
        >
          Not now
        </button>
      </span>
    </div>
  )
}
