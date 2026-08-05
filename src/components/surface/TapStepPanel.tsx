import { useState } from 'react'
import { Link2Off, Trash2 } from 'lucide-react'
import type { Routine, RecurrencePattern } from '@/types/actionable'
import { WEEKDAY_KEYS } from '@/lib/routineUtils'
import { PanelHeader } from './sections/PanelHeader'
import { PanelNotes } from './sections/PanelNotes'
import { PanelAttachments } from './sections/PanelAttachments'
import { DosePills } from './sections/DosePills'

interface TapStepPanelProps {
  step: Routine
  parentName: string
  onClose: () => void
  onRename: (name: string) => void
  onDosesChange: (times: string[]) => void
  onNotesChange: (next: string) => void
  onPromote: () => void
  onScheduleChange?: (pattern: RecurrencePattern) => void
  /** Give this step its own time within the routine ('' clears it back to
   *  the routine's flow). Rendered only when provided. */
  onTimeChange?: (timeOfDay: string | null) => void
  /** Delete the step routine entirely (swap-out). Rendered only when provided. */
  onDelete?: () => void
}

export function TapStepPanel(props: TapStepPanelProps) {
  const { step, parentName } = props
  const times = (step.times_per_day ?? []).map(t => t.slice(0, 5))

  const rp = step.recurrence_pattern
  const initOverridden = !!(rp && (rp.type === 'weekly' || rp.type === 'specific_days') && rp.days?.length)
  const [overridden, setOverridden] = useState(initOverridden)
  const [days, setDays] = useState<string[]>(initOverridden ? rp!.days! : [])

  return (
    <article className="bg-bg-elevated rounded-2xl p-5 max-w-md w-full">
      <PanelHeader title={step.name} onTitleChange={props.onRename} onClose={props.onClose} />

      <p className="text-xs text-neutral-500 mb-4">
        Context and people are <span className="font-medium">inherited from {parentName}</span>.
      </p>

      {props.onTimeChange && (
        <section className="pb-4 mb-4 border-b border-neutral-200">
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="step-time" className="text-sm font-medium text-neutral-700">At</label>
            <input
              id="step-time"
              type="time"
              value={(step.time_of_day ?? '').slice(0, 5)}
              onChange={e => props.onTimeChange!(e.target.value || null)}
              className="rounded-lg border border-neutral-200 px-2 py-1 text-sm text-neutral-700"
            />
          </div>
          <p className="mt-1 text-xs text-neutral-400">
            {step.time_of_day
              ? 'This step has its own time — it shows on the timeline and inside the routine.'
              : `No set time — flows in ${parentName}'s order.`}
          </p>
        </section>
      )}

      <section className="pb-4 mb-4 border-b border-neutral-200">
        <h3 className="text-sm font-medium text-neutral-700 mb-2">Dose times</h3>
        <DosePills times={times} onChange={props.onDosesChange} />
      </section>

      {props.onScheduleChange && (
        <section className="pb-4 mb-4 border-b border-neutral-200">
          <h3 className="text-sm font-medium text-neutral-700 mb-2">Days</h3>
          <div className="flex gap-2 mb-3">
            <button
              type="button"
              aria-pressed={!overridden}
              onClick={() => {
                setOverridden(false)
                setDays([])
                props.onScheduleChange!({ type: 'daily' })
              }}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium ${!overridden ? 'bg-primary-600 text-white' : 'bg-neutral-100 text-neutral-700'}`}
            >
              Same as routine
            </button>
            <button
              type="button"
              aria-pressed={overridden}
              onClick={() => {
                setOverridden(true)
                // Do NOT persist: entering "Specific days" with no days chosen is
                // a transient local mode. Only persist once the user picks a day.
              }}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium ${overridden ? 'bg-primary-600 text-white' : 'bg-neutral-100 text-neutral-700'}`}
            >
              Specific days
            </button>
          </div>
          {overridden && (
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAY_KEYS.map(k => {
                const on = days.includes(k)
                const label = k.charAt(0).toUpperCase() + k.slice(1)
                return (
                  <button
                    key={k}
                    type="button"
                    aria-label={label}
                    aria-pressed={on}
                    onClick={() => {
                      const next = on ? days.filter(d => d !== k) : [...days, k]
                      setDays(next)
                      if (next.length > 0) {
                        props.onScheduleChange!({ type: 'weekly', days: next })
                      } else {
                        // Last day removed → revert to inherit (stay in overridden
                        // local mode so toggles remain visible mid-edit)
                        props.onScheduleChange!({ type: 'daily' })
                      }
                    }}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium ${on ? 'bg-primary-600 text-white' : 'bg-neutral-100 text-neutral-600'}`}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          )}
        </section>
      )}

      <PanelNotes key={step.id} label="Instructions" id="instructions" notes={step.description ?? undefined} onChange={props.onNotesChange} />

      {/* Photos & Files — exercise photos / form diagrams for this step */}
      <PanelAttachments entityType="routine" entityId={step.id} />

      <div className="mt-4 flex items-center gap-5">
        <button
          type="button"
          onClick={props.onPromote}
          className="inline-flex items-center gap-2 text-sm font-medium text-neutral-600 hover:text-red-600"
        >
          <Link2Off className="w-4 h-4" /> Remove from routine
        </button>
        {props.onDelete && (
          <button
            type="button"
            onClick={props.onDelete}
            className="inline-flex items-center gap-2 text-sm font-medium text-neutral-600 hover:text-red-600"
          >
            <Trash2 className="w-4 h-4" /> Delete step
          </button>
        )}
      </div>
    </article>
  )
}
