import { Flame } from 'lucide-react'
import type { Routine, RoutineVisibility, RecurrencePattern } from '@/types/routine'
import type { TaskContext } from '@/types/task'
import type { FamilyMember } from '@/types/family'
import { PanelHeader } from './sections/PanelHeader'
import { PanelMetaRow } from './sections/PanelMetaRow'
import { PanelWhy } from './sections/PanelWhy'
import { PanelFooter } from './sections/PanelFooter'
import { ContextPicker } from '@/components/triage/ContextPicker'
import { MultiAssigneeDropdown } from '@/components/family'
import { useRoutineStats } from '@/hooks/useRoutineStats'

function recurrenceSummary(r: Routine): string {
  const p = r.recurrence_pattern
  const time = r.time_of_day ? ` · ${r.time_of_day.slice(0, 5)}` : ''
  if (p.type === 'weekly' && p.days?.length) return `Weekly · ${p.days.join(', ')}${time}`
  if (p.type === 'daily') return `Daily${time}`
  return `${p.type}${time}`
}

// Self-explanatory labels for the visibility toggle: "active" routines show on
// the Today timeline; "reference" ones are kept but hidden from it.
const VISIBILITY_OPTIONS: { value: RoutineVisibility; label: string }[] = [
  { value: 'active', label: 'On timeline' },
  { value: 'reference', label: 'Reference' },
]

const WEEKDAYS: { value: string; label: string }[] = [
  { value: 'mon', label: 'M' }, { value: 'tue', label: 'T' }, { value: 'wed', label: 'W' },
  { value: 'thu', label: 'T' }, { value: 'fri', label: 'F' }, { value: 'sat', label: 'S' }, { value: 'sun', label: 'S' },
]

interface TapRoutinePanelProps {
  routine: Routine
  familyMembers?: FamilyMember[]
  onClose: () => void
  onNotesChange: (next: string) => void
  onContextChange: (context: TaskContext | undefined) => void
  onVisibilityChange: (visibility: RoutineVisibility) => void
  onAssignChange?: (memberIds: string[]) => void
  /** Rename the routine. */
  onNameChange?: (name: string) => void
  /** Change the recurrence pattern and/or time of day. */
  onScheduleChange?: (pattern: RecurrencePattern, timeOfDay: string | null) => void
}

export function TapRoutinePanel(props: TapRoutinePanelProps) {
  const { routine, familyMembers = [] } = props
  const { getStats } = useRoutineStats()
  const streak = getStats(routine.id)?.currentStreak ?? 0
  const assigneeIds = routine.assigned_to_all && routine.assigned_to_all.length > 0
    ? routine.assigned_to_all
    : (routine.assigned_to ? [routine.assigned_to] : [])

  return (
    <article className="bg-bg-elevated rounded-2xl p-5 max-w-md w-full">
      <PanelHeader
        title={routine.name}
        onTitleChange={(next) => props.onNameChange?.(next)}
        onClose={props.onClose}
      />
      <PanelMetaRow bucket={recurrenceSummary(routine)} />

      {props.onScheduleChange && (
        <ScheduleEditor routine={routine} onScheduleChange={props.onScheduleChange} />
      )}

      <section className="pb-4 mb-4 border-b border-neutral-200 flex flex-col gap-3">
        {/* Who does it + context + streak */}
        <div className="flex flex-wrap items-center gap-2">
          {familyMembers.length > 0 && props.onAssignChange && (
            <MultiAssigneeDropdown
              members={familyMembers}
              selectedIds={assigneeIds}
              onSelect={props.onAssignChange}
              size="sm"
            />
          )}
          <ContextPicker value={routine.context ?? undefined} onChange={props.onContextChange} />
          {streak > 0 && (
            <span className="inline-flex items-center gap-1 text-sm font-medium text-amber-600 ml-auto">
              <Flame className="w-4 h-4" />
              {streak}-day streak
            </span>
          )}
        </div>

        {/* Show on timeline vs keep as reference */}
        <div>
          <div className="flex gap-1" role="group" aria-label="Show on timeline">
            {VISIBILITY_OPTIONS.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => props.onVisibilityChange(value)}
                aria-label={label}
                aria-pressed={routine.visibility === value}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  routine.visibility === value ? 'bg-neutral-800 text-white' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="text-xs text-neutral-500 mt-1.5">
            Reference keeps the routine but hides it from Today.
          </p>
        </div>
      </section>

      <PanelWhy
        key={routine.id}
        label="Notes"
        notes={routine.description ?? undefined}
        onChange={props.onNotesChange}
      />

      <PanelFooter
        createdAt={new Date(routine.created_at)}
        updatedAt={new Date(routine.updated_at)}
      />
    </article>
  )
}

/** Inline schedule editor: frequency (Daily/Weekly), weekday picker, and time.
 *  Saves immediately on each change. Daily/Weekly cover the common routines;
 *  other patterns (monthly, since-last, …) show their summary and can be
 *  converted to Daily/Weekly here. */
function ScheduleEditor({
  routine,
  onScheduleChange,
}: {
  routine: Routine
  onScheduleChange: (pattern: RecurrencePattern, timeOfDay: string | null) => void
}) {
  const pattern = routine.recurrence_pattern
  const timeValue = (routine.time_of_day ?? '').slice(0, 5) // HH:MM
  const isDaily = pattern.type === 'daily'
  const isWeekly = pattern.type === 'weekly'

  const setType = (type: 'daily' | 'weekly') => {
    if (type === 'weekly') {
      onScheduleChange({ type: 'weekly', days: pattern.days?.length ? pattern.days : ['mon'] }, routine.time_of_day)
    } else {
      onScheduleChange({ type: 'daily' }, routine.time_of_day)
    }
  }
  const toggleDay = (day: string) => {
    const days = new Set(pattern.days ?? [])
    if (days.has(day)) days.delete(day)
    else days.add(day)
    onScheduleChange({ type: 'weekly', days: [...days] }, routine.time_of_day)
  }

  const segBtn = (active: boolean) =>
    `px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
      active ? 'bg-neutral-800 text-white' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
    }`

  return (
    <section className="pb-4 mb-4 border-b border-neutral-200 flex flex-col gap-3">
      <p className="text-xs font-medium text-neutral-400 uppercase tracking-wider">Schedule</p>

      <div className="flex gap-1" role="group" aria-label="Frequency">
        <button onClick={() => setType('daily')} aria-pressed={isDaily} className={segBtn(isDaily)}>Daily</button>
        <button onClick={() => setType('weekly')} aria-pressed={isWeekly} className={segBtn(isWeekly)}>Weekly</button>
      </div>

      {isWeekly && (
        <div className="flex gap-1" role="group" aria-label="Days of week">
          {WEEKDAYS.map(({ value, label }) => {
            const on = pattern.days?.includes(value) ?? false
            return (
              <button
                key={value}
                onClick={() => toggleDay(value)}
                aria-pressed={on}
                aria-label={value}
                className={`w-8 h-8 rounded-full text-xs font-medium transition-colors ${
                  on ? 'bg-primary-500 text-white' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                }`}
              >
                {label}
              </button>
            )
          })}
        </div>
      )}

      {!isDaily && !isWeekly && (
        <p className="text-xs text-neutral-500">
          Currently {recurrenceSummary(routine)}. Pick Daily or Weekly to change it here.
        </p>
      )}

      <label className="flex items-center gap-2 text-sm">
        <span className="text-neutral-600">Time</span>
        <input
          type="time"
          value={timeValue}
          onChange={(e) => onScheduleChange(pattern, e.target.value || null)}
          className="px-2 py-1 rounded-md border border-neutral-200 text-sm text-neutral-800 focus:outline-none focus:border-primary-500"
        />
        {timeValue && (
          <button
            onClick={() => onScheduleChange(pattern, null)}
            className="text-xs text-neutral-400 hover:text-neutral-600"
          >
            clear
          </button>
        )}
      </label>
    </section>
  )
}
