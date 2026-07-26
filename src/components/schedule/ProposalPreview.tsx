import { useState } from 'react'
import { Sparkles, Check, X, ArrowDownUp } from 'lucide-react'
import type { Proposal } from '@/lib/today/proposeOrder'

/**
 * The assistant's proposal, as a preview you accept — never an auto-apply
 * (spec move #8). Wholesale, partially, or discard, the same rule as the
 * duplicate sweep.
 *
 * Every suggestion shows the reason it was made. That is not decoration: this
 * proposer works from thin signal by design, so a suggestion the user cannot
 * evaluate is one they should not be asked to accept.
 */
export interface ProposalPreviewProps {
  proposal: Proposal
  /** Resolve a timeline id to its display title. */
  titleOf: (itemId: string) => string
  onClose: () => void
  onAcceptGroup: (key: string) => void
  onAcceptOrder: () => void
  onAcceptAll: () => void
}

export function ProposalPreview({
  proposal, titleOf, onClose, onAcceptGroup, onAcceptOrder, onAcceptAll,
}: ProposalPreviewProps) {
  const [takenGroups, setTakenGroups] = useState<Set<string>>(() => new Set())
  const [takenOrder, setTakenOrder] = useState(false)

  const groups = proposal.groups.filter((g) => !takenGroups.has(g.key))
  const showOrder = proposal.order !== null && !takenOrder
  const nothingLeft = groups.length === 0 && !showOrder

  const takeGroup = (key: string) => {
    onAcceptGroup(key)
    setTakenGroups((prev) => new Set(prev).add(key))
  }
  const takeOrder = () => { onAcceptOrder(); setTakenOrder(true) }
  const takeAll = () => {
    onAcceptAll()
    setTakenGroups(new Set(proposal.groups.map((g) => g.key)))
    setTakenOrder(true)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-neutral-900/30 p-4 md:p-10">
      <div className="card w-full max-w-xl rounded-2xl border border-neutral-200/70 bg-bg-elevated p-5 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-xl text-neutral-800">
              <Sparkles className="mr-2 inline h-5 w-5 text-neutral-400" />
              A suggested shape for today
            </h2>
            <p className="mt-1 text-[13px] text-neutral-500">
              Nothing changes until you take it. Take all of it, some of it, or none.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close suggestions"
            className="rounded-lg p-1.5 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {nothingLeft ? (
          <p className="py-8 text-center font-display text-lg text-neutral-600">
            Nothing left to take.
          </p>
        ) : (
          <>
            <ul className="space-y-3">
              {groups.map((g) => (
                <li key={g.key} className="rounded-xl border border-neutral-200/70 p-3">
                  <p className="text-[15px] font-medium text-neutral-800">Group “{g.name}”</p>
                  <p className="mt-0.5 text-[12px] text-neutral-500">{g.reason}</p>
                  <ul className="mt-2 mb-3 space-y-0.5">
                    {g.itemIds.map((id) => (
                      <li key={id} className="text-[13px] text-neutral-600">· {titleOf(id)}</li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    onClick={() => takeGroup(g.key)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-primary-50 px-2.5 py-1.5 text-[13px] text-primary-700 transition-colors hover:bg-primary-100"
                  >
                    <Check className="h-4 w-4" />
                    Make this group
                  </button>
                </li>
              ))}

              {showOrder && (
                <li className="rounded-xl border border-neutral-200/70 p-3">
                  <p className="text-[15px] font-medium text-neutral-800">Reorder the untimed list</p>
                  <p className="mt-0.5 text-[12px] text-neutral-500">{proposal.order!.reason}</p>
                  <ol className="mt-2 mb-3 space-y-0.5">
                    {proposal.order!.itemIds.map((id) => (
                      <li key={id} className="text-[13px] text-neutral-600">· {titleOf(id)}</li>
                    ))}
                  </ol>
                  <button
                    type="button"
                    onClick={takeOrder}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-primary-50 px-2.5 py-1.5 text-[13px] text-primary-700 transition-colors hover:bg-primary-100"
                  >
                    <ArrowDownUp className="h-4 w-4" />
                    Use this order
                  </button>
                </li>
              )}
            </ul>

            <div className="mt-4 flex items-center gap-2 border-t border-neutral-200/70 pt-3">
              <button
                type="button"
                onClick={takeAll}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-1.5 text-[13px] text-white transition-colors hover:bg-primary-700"
              >
                <Check className="h-4 w-4" />
                Take all of it
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg px-2.5 py-1.5 text-[13px] text-neutral-500 transition-colors hover:bg-neutral-100"
              >
                Discard
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/**
 * Stats-row entry point. Renders nothing when the proposer found no signal —
 * the absence of a suggestion is itself the honest answer, not a gap to fill.
 */
export function ProposalTrigger({
  count, onOpen,
}: { count: number; onOpen: () => void }) {
  if (count === 0) return null
  return (
    <button
      type="button"
      onClick={onOpen}
      title="See a suggested order and grouping for today"
      className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[15px] text-neutral-500 transition-all hover:bg-neutral-100 hover:text-neutral-800"
    >
      <Sparkles className="h-5 w-5" />
      <span>{count} suggestion{count === 1 ? '' : 's'}</span>
    </button>
  )
}
