import { Redo2, Check, X, Phone, MapPin, FileText, Video, Link as LinkIcon } from 'lucide-react'
import { useDragScroll } from '@/hooks/useDragScroll'
import { getNextWeekend, getWeekendAfterNext, formatShortDate } from '@/lib/dateHelpers'
import type { WallV2TimelineEvent } from './types'

/**
 * Push reschedules a task from the wall. Most presets target a fuzzy time
 * bucket without a specific date; the two weekend presets mirror the main
 * page's SchedulePopover and schedule the task all-day on the upcoming (or
 * following) Saturday. Finer scheduling still lives on mobile / desktop.
 */
export type PushPreset =
  | 'this-week'
  | 'this-weekend'
  | 'next-week'
  | 'next-weekend'
  | 'next-month'
  | 'someday'

interface Props {
  event: WallV2TimelineEvent
  /** (id, kind) — id keeps its prefix; the shell strips it for the entity call. */
  onSkip: (id: string, kind: 'event' | 'routine') => void
  /** Now widened to accept tasks; the Shell internally routes task completes
   *  through the same handleToggleComplete the row's checkbox already uses. */
  onMarkDone: (id: string, kind: 'event' | 'routine' | 'task') => void
  /** Task variant only — emits a fuzzy push preset; the Shell maps it to a
   *  bucket mutation. Routines / events never fire this. */
  onPushTask: (id: string, preset: PushPreset) => void
  onClose: () => void
}

// Ordered by horizon so the 2×2-ish grid reads near→far top-to-bottom.
const PUSH_PRESETS: ReadonlyArray<{ preset: PushPreset; label: string }> = [
  { preset: 'this-week',    label: 'This week'    },
  { preset: 'this-weekend', label: 'This weekend' },
  { preset: 'next-week',    label: 'Next week'    },
  { preset: 'next-weekend', label: 'Next weekend' },
  { preset: 'next-month',   label: 'Next month'   },
  { preset: 'someday',      label: 'Someday'      },
]

// The two weekend presets land on a concrete Saturday; surface that date under
// the label so "next weekend" is unambiguous at tap time (which Saturday?).
// The fuzzy bucket presets have no specific date and show label only.
const PRESET_DATE: Partial<Record<PushPreset, () => Date>> = {
  'this-weekend': getNextWeekend,
  'next-weekend': getWeekendAfterNext,
}

// Destination-only Maps link — the wall is stationary, so we surface "where is
// this" rather than a turn-by-turn route. Rendered into an <a> (never
// window.open) so the OS hands the universal link to Maps cleanly.
function mapsUrlFor(location: string, placeId?: string): string {
  const base = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`
  return placeId ? `${base}&query_place_id=${encodeURIComponent(placeId)}` : base
}

// Shared styling for a tappable context row (phone / location / link / meeting).
const ctxRow =
  'flex items-center gap-3 w-full min-h-[60px] px-4 rounded-2xl bg-stone-100 dark:bg-stone-800 ' +
  'text-stone-800 dark:text-stone-100 active:scale-[0.98] transition-transform'

export function WallV2ItemActionSheet({ event, onSkip, onMarkDone, onPushTask, onClose }: Props) {
  const kind: 'routine' | 'event' | 'task' = event.kind ?? 'event'

  // The Pi delivers touch as mouse events, so the touch-action CSS below never
  // scrolls on the wall. Drive scroll by pointer-drag like the other surfaces.
  const ctxScrollRef = useDragScroll<HTMLDivElement>()

  const hasContext = Boolean(
    event.phoneNumber ||
    event.meetingUrl ||
    event.location ||
    event.notes ||
    (event.links && event.links.length > 0),
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-[min(92vw,560px)] max-h-[88vh] bg-white dark:bg-stone-900 rounded-3xl shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-4 text-center shrink-0">
          <div className="text-[1.4rem] font-display text-stone-800 dark:text-stone-100">{event.title}</div>
          {event.subtitle && <div className="text-stone-500 dark:text-stone-400 mt-1">{event.subtitle}</div>}
        </div>

        {/* Context — the rich detail that was planned earlier, surfaced now.
            Scrollable so long notes never push the actions off-screen. */}
        {hasContext && (
          <div
            ref={ctxScrollRef}
            className="px-6 flex-1 min-h-0 overflow-y-auto"
            style={{ touchAction: 'pan-y', WebkitOverflowScrolling: 'touch' }}
          >
            <div className="flex flex-col gap-2.5 pb-1">
              {event.phoneNumber && (
                <a href={`tel:${event.phoneNumber}`} className={ctxRow}>
                  <Phone className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span className="font-bold truncate">{event.phoneNumber}</span>
                  <span className="ml-auto text-sm text-stone-500 dark:text-stone-400 shrink-0">Tap to call</span>
                </a>
              )}

              {event.meetingUrl && (
                <a href={event.meetingUrl} target="_blank" rel="noopener noreferrer" className={ctxRow}>
                  <Video className="w-5 h-5 text-sky-600 dark:text-sky-400 shrink-0" />
                  <span className="font-bold truncate">Join meeting</span>
                </a>
              )}

              {event.location && (
                <a
                  href={mapsUrlFor(event.location, event.locationPlaceId)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={ctxRow}
                >
                  <MapPin className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0" />
                  <span className="font-bold truncate">{event.location}</span>
                  <span className="ml-auto text-sm text-stone-500 dark:text-stone-400 shrink-0">Directions</span>
                </a>
              )}

              {event.links?.map((link, i) => (
                <a
                  key={`${link.url}-${i}`}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={ctxRow}
                >
                  <LinkIcon className="w-5 h-5 text-violet-500 dark:text-violet-300 shrink-0" />
                  <span className="font-bold truncate">{link.title || link.url}</span>
                </a>
              ))}

              {event.notes && (
                <div className="rounded-2xl bg-stone-100 dark:bg-stone-800 px-4 py-3">
                  <div className="flex items-center gap-2 text-[0.72rem] font-bold uppercase tracking-[0.18em] text-stone-500 dark:text-stone-400 mb-1.5">
                    <FileText className="w-4 h-4" /> Notes
                  </div>
                  <div className="text-stone-700 dark:text-stone-200 whitespace-pre-wrap leading-snug">
                    {event.notes}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="px-6 pt-4 pb-6 flex flex-col gap-3 shrink-0">
          {kind === 'task' ? (
            <>
              {/* Complete — full-width emerald (matches routine "Mark done") */}
              <button
                type="button"
                onClick={() => { onMarkDone(event.id, 'task'); onClose() }}
                className="flex items-center justify-center gap-3 w-full min-h-[64px] rounded-2xl bg-emerald-500 text-white text-lg font-bold active:scale-[0.98] transition-transform"
              >
                <Check className="w-6 h-6" /> Mark complete
              </button>

              {/* Push presets — 2×2 grid of stone buttons */}
              <div className="grid grid-cols-2 gap-3">
                {PUSH_PRESETS.map(({ preset, label }) => {
                  const dateFn = PRESET_DATE[preset]
                  const sub = dateFn ? formatShortDate(dateFn()) : null
                  return (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => { onPushTask(event.id, preset); onClose() }}
                      className="flex flex-col items-center justify-center w-full min-h-[64px] rounded-2xl bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-200 text-lg font-bold leading-tight active:scale-[0.98] transition-transform"
                    >
                      <span>{label}</span>
                      {sub && (
                        <span className="text-sm font-semibold text-stone-400 dark:text-stone-500 mt-0.5">{sub}</span>
                      )}
                    </button>
                  )
                })}
              </div>
            </>
          ) : (
            <>
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
            </>
          )}

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
