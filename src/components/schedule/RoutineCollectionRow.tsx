import { useState } from 'react'
import { ChevronDown, ChevronRight, Check, SkipForward, Clock } from 'lucide-react'
import type { TimelineItem, CollectionDose } from '@/types/timeline'

interface Props {
  item: TimelineItem // type === 'routine-collection'
  onSelect: () => void
  onSelectStep: (stepTimelineId: string) => void
  onCompleteStep: (stepEntityId: string, completed: boolean) => void
  /** Skip a missed dose — resolves it so the block rolls to the next slot. */
  onSkipStep?: (stepEntityId: string) => void
  /** Complete a dose recording when it was actually done ("did the 7am at 8:15"). */
  onCompleteStepAt?: (stepEntityId: string, completedAt: Date) => void
}

function fmt(t: string | null): string {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hr = h % 12 === 0 ? 12 : h % 12
  return `${hr}:${String(m).padStart(2, '0')} ${ampm}`
}

/** Compact pill label, e.g. "7a", "10a", "1:30p". */
function fmtShort(t: string | null): string {
  if (!t) return 'anytime'
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'p' : 'a'
  const hr = h % 12 === 0 ? 12 : h % 12
  return m === 0 ? `${hr}${ampm}` : `${hr}:${String(m).padStart(2, '0')}${ampm}`
}

export function RoutineCollectionRow({ item, onSelectStep, onCompleteStep, onSkipStep, onCompleteStepAt }: Props) {
  const [open, setOpen] = useState(false)
  // Missed-dose menu: which dose has its Done-now / Done-at / Skip popover open.
  const [menuDoseId, setMenuDoseId] = useState<string | null>(null)
  const [menuTime, setMenuTime] = useState('')
  const p = item.collectionProgress ?? { done: 0, total: 0 }
  const nextUp = item.collectionNextUp

  /** A dose whose slot time has passed and is still unresolved. */
  const isPastDue = (dose: CollectionDose): boolean => {
    if (!dose.time || dose.completed || dose.skipped) return false
    const [h, m] = dose.time.split(':').map(Number)
    const doseDate = item.startTime ? new Date(item.startTime) : new Date()
    doseDate.setHours(h, m, 0, 0)
    return doseDate.getTime() < Date.now()
  }

  /** Build a Date on the viewed day at the given HH:MM. */
  const dateAtTime = (time: string): Date => {
    const [h, m] = time.split(':').map(Number)
    const d = item.startTime ? new Date(item.startTime) : new Date()
    d.setHours(h, m, 0, 0)
    return d
  }

  const handleDoseClick = (dose: CollectionDose) => {
    // Completed or skipped → tap undoes (back to pending).
    if (dose.completed || dose.skipped) {
      onCompleteStep(dose.id, false)
      return
    }
    // Missed dose → offer Done now / Done at… / Skip instead of blind-completing.
    if (isPastDue(dose) && (onSkipStep || onCompleteStepAt)) {
      setMenuTime(dose.time ?? '')
      setMenuDoseId((prev) => (prev === dose.id ? null : dose.id))
      return
    }
    onCompleteStep(dose.id, true)
  }
  return (
    <div className={`${open ? 'rounded-xl' : 'rounded-full'} border border-neutral-200 bg-white`}>
      {/* Collapsed: a single slim line — name · progress · next step — so the
          routine reads as a pill on the timeline instead of a two-line card. */}
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center gap-2 px-3 py-1.5 text-left min-w-0">
        {open ? <ChevronDown className="w-4 h-4 text-neutral-400 shrink-0" /> : <ChevronRight className="w-4 h-4 text-neutral-400 shrink-0" />}
        <span className="text-sm font-medium text-neutral-800 truncate shrink-0 max-w-[50%]">{item.title}</span>
        <span className="text-xs text-neutral-400 tabular-nums shrink-0">{p.done}/{p.total}</span>
        {item.completed
          ? <span className="text-xs text-neutral-400 truncate">· done</span>
          : nextUp && (
              <span className="text-xs text-neutral-500 truncate min-w-0">
                · {fmt(nextUp.time)} {nextUp.stepName}
              </span>
            )}
      </button>
      {open && (
        <div className="border-t border-neutral-100 px-3 py-2 space-y-2.5">
          {/* Mark-all-done: complete every remaining dose across all steps in one tap. */}
          {!item.completed && (item.collectionSteps ?? []).some(g => g.doses.some(d => !d.completed && !d.skipped)) && (
            <div className="flex justify-end">
              <button
                onClick={() => {
                  for (const g of item.collectionSteps ?? []) {
                    for (const d of g.doses) {
                      // Leave explicitly-skipped doses alone; complete the rest.
                      if (!d.completed && !d.skipped) onCompleteStep(d.id, true)
                    }
                  }
                }}
                className="text-xs text-primary-600 hover:text-primary-700"
              >
                Mark all done
              </button>
            </div>
          )}
          {/* One row per exercise; its doses are tappable pills (filled = done). */}
          {(item.collectionSteps ?? []).map(group => {
            const stepDone = group.progress.done === group.progress.total && group.progress.total > 0
            return (
              <div key={group.stepId}>
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`text-sm truncate cursor-pointer ${stepDone ? 'text-neutral-400' : 'text-neutral-700'}`}
                    onClick={() => onSelectStep(`routine-${group.stepId}`)}
                  >
                    {group.name}
                  </span>
                  <span className="text-xs text-neutral-400 flex-none">{group.progress.done}/{group.progress.total}</span>
                </div>
                <div className="flex flex-wrap gap-1 mt-1">
                  {group.doses.map(dose => {
                    const pastDue = isPastDue(dose)
                    const label = dose.completed
                      ? `Uncomplete ${group.name}${dose.time ? ` at ${fmt(dose.time)}` : ''}`
                      : dose.skipped
                      ? `Unskip ${group.name}${dose.time ? ` at ${fmt(dose.time)}` : ''}`
                      : pastDue
                      ? `Resolve missed ${group.name}${dose.time ? ` at ${fmt(dose.time)}` : ''}`
                      : `Complete ${group.name}${dose.time ? ` at ${fmt(dose.time)}` : ''}`
                    return (
                      <span key={dose.id} className="relative">
                        <button
                          onClick={() => handleDoseClick(dose)}
                          aria-label={label}
                          className={`px-2 py-0.5 rounded-full text-xs border transition-colors ${
                            dose.completed
                              ? 'bg-primary-600 border-primary-600 text-white'
                              : dose.skipped
                              ? 'bg-neutral-100 border-neutral-200 text-neutral-400 line-through'
                              : pastDue
                              ? 'bg-amber-50 border-amber-300 text-amber-700 hover:border-amber-400'
                              : 'bg-white border-neutral-300 text-neutral-600 hover:border-primary-300'
                          }`}
                        >
                          {fmtShort(dose.time)}
                        </button>

                        {menuDoseId === dose.id && (
                          <>
                            {/* Click-away backdrop */}
                            <span
                              className="fixed inset-0 z-10"
                              aria-hidden
                              onClick={() => setMenuDoseId(null)}
                            />
                            <span
                              role="menu"
                              aria-label={`Missed ${group.name} options`}
                              className="absolute z-20 top-full left-0 mt-1 w-48 rounded-xl border border-neutral-200 bg-white shadow-lg p-1.5 flex flex-col gap-0.5"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                onClick={() => { onCompleteStep(dose.id, true); setMenuDoseId(null) }}
                                className="flex items-center gap-2 w-full text-left px-2.5 py-1.5 rounded-lg text-[13px] text-neutral-700 hover:bg-neutral-50"
                              >
                                <Check className="w-3.5 h-3.5 text-primary-600" /> Done now
                              </button>
                              {onCompleteStepAt && (
                                <span className="flex items-center gap-1.5 px-2.5 py-1">
                                  <Clock className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                                  <input
                                    type="time"
                                    value={menuTime}
                                    onChange={(e) => setMenuTime(e.target.value)}
                                    aria-label="Time you did it"
                                    className="flex-1 min-w-0 text-[12px] rounded-md border border-neutral-200 px-1.5 py-0.5 text-neutral-700"
                                  />
                                  <button
                                    disabled={!menuTime}
                                    onClick={() => { onCompleteStepAt(dose.id, dateAtTime(menuTime)); setMenuDoseId(null) }}
                                    className="text-[12px] font-medium text-primary-600 hover:text-primary-700 disabled:opacity-40"
                                  >
                                    Did then
                                  </button>
                                </span>
                              )}
                              {onSkipStep && (
                                <button
                                  onClick={() => { onSkipStep(dose.id); setMenuDoseId(null) }}
                                  className="flex items-center gap-2 w-full text-left px-2.5 py-1.5 rounded-lg text-[13px] text-neutral-500 hover:bg-neutral-50"
                                >
                                  <SkipForward className="w-3.5 h-3.5 text-neutral-400" /> Skip this one
                                </button>
                              )}
                            </span>
                          </>
                        )}
                      </span>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
