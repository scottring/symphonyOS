import { useState } from 'react'
import { ChevronDown, ChevronRight, Check, SkipForward, Clock, MoreHorizontal, EyeOff, Pencil, Archive } from 'lucide-react'
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
  /** Pause the whole collection until tomorrow (auto-resumes). */
  onHideToday?: () => void
  /** Archive the whole collection to reference (reactivate on /routines). */
  onRemove?: () => void
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

export function RoutineCollectionRow({ item, onSelect, onSelectStep, onCompleteStep, onSkipStep, onCompleteStepAt, onHideToday, onRemove }: Props) {
  const [open, setOpen] = useState(false)
  const [mgmtOpen, setMgmtOpen] = useState(false)
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
      <div className="flex items-center min-w-0">
        <button onClick={() => setOpen(o => !o)} className="flex-1 flex items-center gap-2 px-3 py-1.5 text-left min-w-0">
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
        {/* Management menu: hide-for-today / edit / archive, mirroring task rows. */}
        <div className="relative shrink-0 pr-2">
          <button
            aria-label="Routine options"
            onClick={() => setMgmtOpen(o => !o)}
            className="p-1.5 rounded-full text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
          {mgmtOpen && (
            <>
              <div className="fixed inset-0 z-10" aria-hidden onClick={() => setMgmtOpen(false)} />
              <div
                role="menu"
                className="absolute right-0 top-full z-20 mt-1 w-44 rounded-xl border border-neutral-200 bg-white py-1 shadow-lg"
                onClick={(e) => e.stopPropagation()}
              >
                {onHideToday && (
                  <button
                    role="menuitem"
                    onClick={() => { onHideToday(); setMgmtOpen(false) }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm text-neutral-700 hover:bg-neutral-50"
                  >
                    <EyeOff className="w-4 h-4 text-neutral-400" /> Hide for today
                  </button>
                )}
                <button
                  role="menuitem"
                  onClick={() => { onSelect(); setMgmtOpen(false) }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm text-neutral-700 hover:bg-neutral-50"
                >
                  <Pencil className="w-4 h-4 text-neutral-400" /> Edit routine
                </button>
                {onRemove && (
                  <button
                    role="menuitem"
                    onClick={() => { onRemove(); setMgmtOpen(false) }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm text-neutral-700 hover:bg-neutral-50"
                  >
                    <Archive className="w-4 h-4 text-neutral-400" /> Remove from Today
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
      {open && (
        <div className="border-t border-neutral-100 px-3 py-2 space-y-2.5">
          {/* Bulk resolve: complete or skip every remaining dose in one tap. */}
          {!item.completed && (item.collectionSteps ?? []).some(g => g.doses.some(d => !d.completed && !d.skipped)) && (
            <div className="flex justify-end gap-3">
              {onSkipStep && (
                <button
                  onClick={() => {
                    for (const g of item.collectionSteps ?? []) {
                      for (const d of g.doses) {
                        if (!d.completed && !d.skipped) onSkipStep(d.id)
                      }
                    }
                  }}
                  className="text-xs text-neutral-400 hover:text-neutral-600"
                >
                  Skip all
                </button>
              )}
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
          {/* One row per exercise; its doses are tappable. A timed dose is a
              pill showing its time (filled = done); an untimed ("anytime")
              dose is the standard check circle instead, since it has no time
              to show and a text pill didn't read as tappable. */}
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
                    const untimed = !dose.time
                    const label = dose.completed
                      ? `Uncomplete ${group.name}${dose.time ? ` at ${fmt(dose.time)}` : ''}`
                      : dose.skipped
                      ? `Unskip ${group.name}${dose.time ? ` at ${fmt(dose.time)}` : ''}`
                      : pastDue
                      ? `Resolve missed ${group.name}${dose.time ? ` at ${fmt(dose.time)}` : ''}`
                      : `Complete ${group.name}${dose.time ? ` at ${fmt(dose.time)}` : ''}`
                    return (
                      <span key={dose.id} className="relative">
                        {untimed ? (
                          // Untimed dose: no time to show, so render the app's
                          // standard check circle (same shape/size/border
                          // language as TaskCheckbox) instead of a text pill —
                          // an "anytime" pill didn't read as tappable. Colors
                          // are the same ones the pill already used per state,
                          // just carried by a circle instead of pill text.
                          <button
                            onClick={() => handleDoseClick(dose)}
                            aria-label={label}
                            className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                              dose.completed
                                ? 'bg-primary-500 border-primary-500 text-white'
                                : dose.skipped
                                ? 'bg-neutral-100 border-neutral-300 text-neutral-400'
                                : pastDue
                                ? 'bg-amber-50 border-amber-300 text-amber-700 hover:border-amber-400'
                                : 'bg-bg-base border-neutral-300 hover:border-primary-400'
                            }`}
                          >
                            {dose.completed ? (
                              <Check className="w-3 h-3" strokeWidth={3} />
                            ) : dose.skipped ? (
                              <SkipForward className="w-2.5 h-2.5" />
                            ) : null}
                          </button>
                        ) : (
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
                        )}

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
