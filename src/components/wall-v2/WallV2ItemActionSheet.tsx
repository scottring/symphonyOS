import { Redo2, Check, X } from 'lucide-react'
import type { WallV2TimelineEvent } from './types'

interface Props {
  event: WallV2TimelineEvent
  /** (id, kind) — id keeps its prefix; the shell strips it for the entity call. */
  onSkip: (id: string, kind: 'event' | 'routine') => void
  onMarkDone: (id: string, kind: 'event' | 'routine') => void
  onClose: () => void
}

export function WallV2ItemActionSheet({ event, onSkip, onMarkDone, onClose }: Props) {
  const kind = event.kind === 'routine' ? 'routine' : 'event'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-[min(92vw,560px)] bg-white dark:bg-stone-900 rounded-3xl p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-center mb-5">
          <div className="text-[1.4rem] font-display text-stone-800 dark:text-stone-100">{event.title}</div>
          {event.subtitle && <div className="text-stone-500 dark:text-stone-400 mt-1">{event.subtitle}</div>}
        </div>

        <div className="flex flex-col gap-3">
          {kind === 'routine' && (
            <button
              type="button"
              onClick={() => { onMarkDone(event.id, 'routine'); onClose() }}
              className="flex items-center justify-center gap-3 w-full min-h-[64px] rounded-2xl bg-emerald-500 text-white text-lg font-bold active:scale-[0.98] transition-transform"
            >
              <Check className="w-6 h-6" /> Mark done
            </button>
          )}

          <button
            type="button"
            onClick={() => { onSkip(event.id, kind); onClose() }}
            className="flex items-center justify-center gap-3 w-full min-h-[64px] rounded-2xl bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-200 text-lg font-bold active:scale-[0.98] transition-transform"
          >
            <Redo2 className="w-6 h-6" /> Skip today
          </button>

          <button
            type="button"
            onClick={onClose}
            className="flex items-center justify-center gap-2 w-full min-h-[56px] rounded-2xl text-stone-500 dark:text-stone-400 text-base"
          >
            <X className="w-5 h-5" /> Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
