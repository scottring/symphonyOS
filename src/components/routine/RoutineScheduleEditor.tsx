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

import { CalendarCheck } from 'lucide-react'
import type { MonthDayOfWeek, MonthWeek, RecurrencePattern, RecurrenceType, RecurrenceUnit } from '@/types/actionable'
import { TIME_INPUT_LARGE_CLASS } from '@/lib/inputStyles'
import { isEverydayRoutine } from '@/lib/routineUtils'
import { hasMonthlyPosition, MONTH_WEEKS, MONTH_DAYS_OF_WEEK, monthWeekWord, monthDayWord } from '@/lib/cadence/monthlyPosition'
import { scheduleReadback } from '@/lib/routineReadback'

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
  // Not a day — a window. Sits beside Weekly because that is where someone
  // goes looking after ticking Sat and Sun and being asked twice.
  { value: 'weekend', label: 'Weekend (once)' },
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
    if (hasMonthlyPosition(prev)) {
      next.week_of_month = prev.week_of_month
      next.day_of_week = prev.day_of_week
    } else {
      next.day_of_month = prev.day_of_month ?? 1
    }
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
  const byPosition = hasMonthlyPosition(p)
  const weekOfMonth: MonthWeek = byPosition ? p.week_of_month : 1
  const dayOfWeek: MonthDayOfWeek = byPosition ? p.day_of_week : 'weekend'
  const sinceLastInterval = type === 'since_last' ? (p.interval ?? 1) : 1
  const sinceLastUnit: RecurrenceUnit = type === 'since_last' ? (p.unit ?? 'weeks') : 'weeks'

  const emit = (next: RecurrencePattern, nextTime: string = timeOfDay) => {
    onChange({ recurrencePattern: next, timeOfDay: nextTime })
  }

  // Monthly is by date OR by position — never both, so the saved rule can't
  // carry a stale day_of_month that a reader might still believe.
  const setMonthlyByDate = (day: number) => {
    const next: RecurrencePattern = { ...p, day_of_month: day }
    delete next.week_of_month
    delete next.day_of_week
    emit(next)
  }
  const setMonthlyByPosition = (week: MonthWeek, dow: MonthDayOfWeek) => {
    const next: RecurrencePattern = { ...p, week_of_month: week, day_of_week: dow }
    delete next.day_of_month
    emit(next)
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

      {/* Daily is the one to compare against Weekend and a flexible Weekly:
          those settle once per window, this asks again every day. */}
      {type === 'daily' && (
        <p className="text-sm text-neutral-600">
          Every day. Each day has its own to tick off — doing it today doesn't settle tomorrow.
        </p>
      )}

      {/* Weekend: no days to pick — that is the whole point. Say what it will
          do, because "Weekend" alone reads like a Sat+Sun shortcut. */}
      {type === 'weekend' && (
        <p className="text-sm text-neutral-600">
          Once over the weekend, either day. Ticking it on one day settles it for the rest —
          and a federal holiday on the Friday or Monday counts as part of the weekend.
        </p>
      )}

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
          {/* No day is a valid choice, not an error: the routine saves as a
              flexible weekly one (the Rhythm page's "Flexible day"), placed on
              a day each week. The old red "Select at least one day" said the
              opposite of what saving then did (S3-11). */}
          {selectedDays.length === 0 && (
            <p className="text-sm text-neutral-600 mt-2">
              No day chosen, so it's a flexible day — once a week, on whichever day you give it.
            </p>
          )}
          {/* Saturday and Sunday ticked: two commitments, each its own tick —
              not the Weekend rule's once (Scott, 2026-10-03: weekend chores on
              both days were "mind-numbing"). */}
          {selectedDays.length === 2 && selectedDays.includes('sat') && selectedDays.includes('sun') && (
            <p className="text-sm text-neutral-600 mt-2">
              Both Saturday and Sunday — each day needs its own tick. For once, sometime over the weekend, choose Weekend (once).
            </p>
          )}
          {/* Seven days every week IS Daily — say so rather than leave two
              controls that look like different answers. Not at "every 2 weeks",
              where the two genuinely differ. */}
          {selectedDays.length === 7 && weeklyInterval === 1 && (
            <p className="text-sm text-neutral-600 mt-2">
              Every day of the week — the same as Daily.
            </p>
          )}
          {/* Mon–Fri counts as daily (isEverydayRoutine), so "Hide daily" on
              Today sweeps it too. Nothing else here would tell you that. */}
          {selectedDays.length < 7 && isEverydayRoutine(p) && (
            <p className="text-sm text-neutral-600 mt-2">
              Every weekday, so it counts as daily — “Hide daily” on Today hides it too.
            </p>
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

      {/* monthly: a date ("the 15th") or a position ("the first weekend") */}
      {type === 'monthly' && (
        <div>
          <label className={label}>On</label>
          <div className="flex flex-wrap gap-2 mb-3" role="group" aria-label="Monthly by">
            {([
              { by: 'date', l: 'A date' },
              { by: 'position', l: 'A weekend or weekday' },
            ] as const).map(({ by, l }) => {
              const active = by === 'position' ? byPosition : !byPosition
              return (
                <button
                  key={by}
                  type="button"
                  aria-pressed={active}
                  onClick={() => (by === 'position' ? setMonthlyByPosition(weekOfMonth, dayOfWeek) : setMonthlyByDate(dayOfMonth))}
                  className={`${typeBtn} rounded-lg font-medium transition-colors ${
                    active ? 'bg-amber-100 text-amber-700' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                  }`}
                >
                  {l}
                </button>
              )
            })}
          </div>
          {byPosition ? (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-neutral-600">The</span>
                <select
                  aria-label="Which one in the month"
                  value={String(weekOfMonth)}
                  onChange={(e) => setMonthlyByPosition(Number(e.target.value) as MonthWeek, dayOfWeek)}
                  className="px-3 py-2 rounded-lg border border-neutral-200 bg-white text-neutral-800 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                >
                  {MONTH_WEEKS.map((w) => (
                    <option key={w} value={String(w)}>{monthWeekWord(w)}</option>
                  ))}
                </select>
                <select
                  aria-label="Weekend or day of the week"
                  value={dayOfWeek}
                  onChange={(e) => setMonthlyByPosition(weekOfMonth, e.target.value as MonthDayOfWeek)}
                  className="px-3 py-2 rounded-lg border border-neutral-200 bg-white text-neutral-800 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                >
                  {MONTH_DAYS_OF_WEEK.map((d) => (
                    <option key={d} value={d}>{monthDayWord(d)}</option>
                  ))}
                </select>
                <span className="text-sm text-neutral-600">of the month</span>
              </div>
              {dayOfWeek === 'weekend' && (
                <p className="text-xs text-neutral-500 mt-2">
                  That month&rsquo;s {monthWeekWord(weekOfMonth)} Saturday and the Sunday after — once, either day.
                  Ticking it on one day settles it for the other.
                </p>
              )}
            </>
          ) : (
            <>
              <select
                aria-label="Day of the month"
                value={dayOfMonth}
                onChange={(e) => setMonthlyByDate(Number(e.target.value))}
                className="w-full px-4 py-3 rounded-xl border border-neutral-200 bg-white text-neutral-800 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
              >
                {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                  <option key={day} value={day}>
                    {day}{day === 1 || day === 21 || day === 31 ? 'st' : day === 2 || day === 22 ? 'nd' : day === 3 || day === 23 ? 'rd' : 'th'} of the month
                  </option>
                ))}
              </select>
              <p className="text-xs text-neutral-500 mt-2">
                For months with fewer days, the routine occurs on the last day.
              </p>
            </>
          )}
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

      {/* The rule read back, with the next day it actually comes up — so a
          rule that says something other than what was meant is visible
          before it is saved (Wash comforters sat on Quarterly unnoticed). */}
      <p
        data-testid="schedule-readback"
        aria-live="polite"
        className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-neutral-700"
      >
        <CalendarCheck className="w-4 h-4 mt-0.5 shrink-0 text-amber-600" aria-hidden />
        <span>{scheduleReadback(p, timeOfDay || null)}</span>
      </p>
    </div>
  )
}
