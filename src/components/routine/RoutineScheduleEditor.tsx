// src/components/routine/RoutineScheduleEditor.tsx
//
// Shared, controlled recurrence + time-of-day editor for routines.
// Used by both the full-page RoutineForm (legacy mode) and the in-panel
// TapRoutinePanel so the recurrence controls (frequency, day-of-week,
// weekly interval, monthly day, "after completion" interval, time) live in
// exactly one place (DRY).
//
// Controlled: the parent owns the canonical `recurrence_pattern` + `time_of_day`
// and receives a fully-formed next pattern/time on every change. The editor
// keeps no source-of-truth state of its own — it derives all sub-fields from the
// incoming pattern, so it works equally for deferred-save (RoutineForm builds the
// pattern then saves on a button) and live-save (panel writes immediately).

import type { RecurrencePattern, RecurrenceType, RecurrenceUnit } from '@/types/actionable'
import { TIME_INPUT_LARGE_CLASS } from '@/lib/inputStyles'

const DAYS = [
  { key: 'sun', label: 'Sun' },
  { key: 'mon', label: 'Mon' },
  { key: 'tue', label: 'Tue' },
  { key: 'wed', label: 'Wed' },
  { key: 'thu', label: 'Thu' },
  { key: 'fri', label: 'Fri' },
  { key: 'sat', label: 'Sat' },
]

const RECURRENCE_TYPES: { value: RecurrenceType; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'since_last', label: 'After completion' },
]

export interface RoutineScheduleEditorProps {
  recurrencePattern: RecurrencePattern
  timeOfDay: string // '' or 'HH:MM' (native input value)
  onChange: (next: { recurrencePattern: RecurrencePattern; timeOfDay: string }) => void
  /** 'lg' (RoutineForm) | 'sm' (in-panel). Controls spacing + control sizing. */
  size?: 'lg' | 'sm'
}

/**
 * Build a clean RecurrencePattern for a given type, carrying over relevant
 * fields from the previous pattern so switching types and back doesn't lose
 * the user's day selection / interval.
 */
function patternForType(type: RecurrenceType, prev: RecurrencePattern): RecurrencePattern {
  const next: RecurrencePattern = { type }
  if (type === 'weekly') {
    next.days = prev.days ?? []
    if (prev.interval && prev.interval > 1) {
      next.interval = prev.interval
      next.start_date = prev.start_date || new Date().toISOString().slice(0, 10)
    }
  }
  if (type === 'monthly') {
    next.day_of_month = prev.day_of_month ?? 1
  }
  if (type === 'since_last') {
    next.interval = prev.interval ?? 1
    next.unit = prev.unit ?? 'weeks'
  }
  return next
}

export function RoutineScheduleEditor({
  recurrencePattern,
  timeOfDay,
  onChange,
  size = 'lg',
}: RoutineScheduleEditorProps) {
  const p = recurrencePattern
  const type = p.type
  const selectedDays = p.days ?? []
  const weeklyInterval = p.interval ?? 1
  const startDate = p.start_date ?? ''
  const dayOfMonth = p.day_of_month ?? 1
  const sinceLastInterval = type === 'since_last' ? (p.interval ?? 1) : 1
  const sinceLastUnit: RecurrenceUnit = type === 'since_last' ? (p.unit ?? 'weeks') : 'weeks'

  const emit = (next: RecurrencePattern, nextTime: string = timeOfDay) => {
    onChange({ recurrencePattern: next, timeOfDay: nextTime })
  }

  const setType = (t: RecurrenceType) => emit(patternForType(t, p))

  const toggleDay = (day: string) => {
    const days = selectedDays.includes(day)
      ? selectedDays.filter((d) => d !== day)
      : [...selectedDays, day]
    emit({ ...p, days })
  }

  const setWeeklyInterval = (n: number) => {
    const interval = Math.max(1, n || 1)
    const next: RecurrencePattern = { ...p, interval }
    if (interval > 1) {
      next.start_date = startDate || new Date().toISOString().slice(0, 10)
    } else {
      delete next.interval
      delete next.start_date
    }
    emit(next)
  }

  const small = size === 'sm'
  const sectionGap = small ? 'space-y-3' : 'space-y-6'
  const label = small
    ? 'block text-xs font-medium text-neutral-500 mb-1.5'
    : 'block text-sm font-medium text-neutral-700 mb-2'
  const typeBtn = small ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm'
  const dayBtn = small ? 'w-9 h-9 text-xs' : 'w-12 h-12 text-sm'

  return (
    <div className={sectionGap}>
      {/* Recurrence type */}
      <div>
        <label className={label}>Repeats</label>
        <div className="flex flex-wrap gap-2">
          {RECURRENCE_TYPES.map(({ value, label: l }) => (
            <button
              key={value}
              type="button"
              onClick={() => setType(value)}
              aria-pressed={type === value}
              className={`${typeBtn} rounded-lg font-medium transition-colors ${
                type === value
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
              }`}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* Weekly: days + interval */}
      {type === 'weekly' && (
        <div>
          <label className={label}>On days</label>
          <div className="flex gap-1.5 flex-wrap">
            {DAYS.map(({ key, label: l }) => (
              <button
                key={key}
                type="button"
                onClick={() => toggleDay(key)}
                aria-pressed={selectedDays.includes(key)}
                className={`${dayBtn} rounded-full font-medium transition-colors ${
                  selectedDays.includes(key)
                    ? 'bg-amber-500 text-white'
                    : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                }`}
              >
                {l}
              </button>
            ))}
          </div>
          {selectedDays.length === 0 && (
            <p className="text-sm text-red-500 mt-2">Select at least one day</p>
          )}

          <div className="mt-3 flex items-center gap-3">
            <label className="text-sm font-medium text-neutral-700">Every</label>
            <input
              type="number"
              min={1}
              max={52}
              value={weeklyInterval}
              onChange={(e) => setWeeklyInterval(Number(e.target.value))}
              className="w-20 px-3 py-2 rounded-lg border border-neutral-200 bg-white text-neutral-800 text-center focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
            />
            <span className="text-sm text-neutral-600">{weeklyInterval === 1 ? 'week' : 'weeks'}</span>
          </div>
          {weeklyInterval > 1 && (
            <div className="mt-3">
              <label className={label}>
                Anchor date <span className="text-neutral-400 font-normal">(a day this routine should occur)</span>
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => emit({ ...p, start_date: e.target.value })}
                className="px-3 py-2 rounded-lg border border-neutral-200 bg-white text-neutral-800 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
              />
              <p className="text-xs text-neutral-500 mt-1">
                Future occurrences are spaced from here.
              </p>
            </div>
          )}
        </div>
      )}

      {/* since_last: interval + unit */}
      {type === 'since_last' && (
        <div>
          <label className={label}>Repeat after each completion</label>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-neutral-600">Every</span>
            <input
              type="number"
              min={1}
              max={365}
              value={sinceLastInterval}
              onChange={(e) => emit({ ...p, interval: Math.max(1, Number(e.target.value) || 1), unit: sinceLastUnit })}
              className="w-20 px-3 py-2 rounded-lg border border-neutral-200 bg-white text-neutral-800 text-center focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
            />
            <select
              value={sinceLastUnit}
              onChange={(e) => emit({ ...p, interval: sinceLastInterval, unit: e.target.value as RecurrenceUnit })}
              className="px-3 py-2 rounded-lg border border-neutral-200 bg-white text-neutral-800 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
            >
              <option value="days">{sinceLastInterval === 1 ? 'day' : 'days'}</option>
              <option value="weeks">{sinceLastInterval === 1 ? 'week' : 'weeks'}</option>
              <option value="months">{sinceLastInterval === 1 ? 'month' : 'months'}</option>
            </select>
            <span className="text-sm text-neutral-500">after I check it off</span>
          </div>
        </div>
      )}

      {/* monthly: day of month */}
      {type === 'monthly' && (
        <div>
          <label className={label}>On day</label>
          <select
            value={dayOfMonth}
            onChange={(e) => emit({ ...p, day_of_month: Number(e.target.value) })}
            className="w-full px-4 py-3 rounded-xl border border-neutral-200 bg-white text-neutral-800 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
          >
            {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
              <option key={day} value={day}>
                {day}{day === 1 ? 'st' : day === 2 ? 'nd' : day === 3 ? 'rd' : 'th'} of the month
              </option>
            ))}
          </select>
          <p className="text-xs text-neutral-500 mt-2">
            For months with fewer days, the routine occurs on the last day.
          </p>
        </div>
      )}

      {/* time of day */}
      <div>
        <label className={label}>
          Time <span className="text-neutral-400 font-normal">(optional)</span>
        </label>
        <input
          type="time"
          step="300"
          value={timeOfDay}
          onChange={(e) => emit(p, e.target.value)}
          className={`w-full text-neutral-800 ${TIME_INPUT_LARGE_CLASS}`}
        />
        {timeOfDay && (
          <button
            type="button"
            onClick={() => emit(p, '')}
            className="mt-2 text-sm text-neutral-500 hover:text-neutral-700"
          >
            Clear time
          </button>
        )}
      </div>
    </div>
  )
}
