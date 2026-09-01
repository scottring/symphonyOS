//
// The place-scope question for a shelf routine dropped on the grid: writing
// the RULE ("every Thursday at 5:00" — the routine's new home) vs a one-week
// placement. Deliberately distinct from dragging an already-placed routine
// block, which stays a one-day override and never rewrites the rule.
import { useState } from 'react'
import type { Routine } from '@/types/actionable'

export type PlaceScope = 'rule' | 'once'

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function timeLabel(d: Date): string {
  const period = d.getHours() >= 12 ? 'PM' : 'AM'
  const hour12 = d.getHours() % 12 === 0 ? 12 : d.getHours() % 12
  return `${hour12}:${String(d.getMinutes()).padStart(2, '0')} ${period}`
}

/** The rule the "every …" option would write, in words. Weekly routines gain
 *  the dropped weekday; daily (and everything else) only gain the time. */
export function ruleOptionLabel(routine: Routine, when: Date): string {
  const time = timeLabel(when)
  if (routine.recurrence_pattern.type === 'weekly') {
    return `Every ${WEEKDAYS[when.getDay()]} at ${time}`
  }
  if (routine.recurrence_pattern.type === 'daily') {
    return `Every day at ${time}`
  }
  return `Always at ${time}`
}

export function RoutinePlacePopover({ routine, when, onConfirm, onCancel, canOnce }: {
  routine: Routine
  when: Date
  onConfirm: (scope: PlaceScope) => void
  onCancel: () => void
  /** Whether the host wired a one-day override writer (onPushRoutine). */
  canOnce: boolean
}) {
  const [scope, setScope] = useState<PlaceScope>('rule')
  const weekday = WEEKDAYS[when.getDay()]

  return (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-neutral-900/10" onClick={onCancel}>
      <div
        role="dialog"
        aria-label={`Place ${routine.name}`}
        onClick={(e) => e.stopPropagation()}
        className="w-[320px] rounded-xl border border-neutral-200 bg-white p-4 shadow-xl"
      >
        <div className="text-sm font-semibold text-neutral-800 mb-3">Place "{routine.name}"</div>
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 text-[13px] text-neutral-800 cursor-pointer">
            <input
              type="radio"
              name="routine-place-scope"
              checked={scope === 'rule'}
              onChange={() => setScope('rule')}
              className="accent-primary-600"
            />
            <span className="font-medium">{ruleOptionLabel(routine, when)}</span>
          </label>
          {canOnce && (
            <label className="flex items-center gap-2 text-[13px] text-neutral-600 cursor-pointer">
              <input
                type="radio"
                name="routine-place-scope"
                checked={scope === 'once'}
                onChange={() => setScope('once')}
                className="accent-primary-600"
              />
              <span>Just this {weekday}</span>
            </label>
          )}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 text-[13px] text-neutral-500 hover:text-neutral-700 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(scope)}
            className="px-3.5 py-1.5 text-[13px] font-semibold text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors"
          >
            Place
          </button>
        </div>
      </div>
    </div>
  )
}
