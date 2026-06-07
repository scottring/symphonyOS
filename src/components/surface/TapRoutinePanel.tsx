import { useState } from 'react'
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
import { RoutineScheduleEditor } from '@/components/routine/RoutineScheduleEditor'
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

interface TapRoutinePanelProps {
  routine: Routine
  familyMembers?: FamilyMember[]
  onClose: () => void
  onRename?: (name: string) => void
  onNotesChange: (next: string) => void
  onContextChange: (context: TaskContext | undefined) => void
  onVisibilityChange: (visibility: RoutineVisibility) => void
  onAssignChange?: (memberIds: string[]) => void
  /** Persist a recurrence/time-of-day change. time is '' (clear) or 'HH:MM'. */
  onScheduleChange?: (pattern: RecurrencePattern, timeOfDay: string) => void
}

export function TapRoutinePanel(props: TapRoutinePanelProps) {
  const { routine, familyMembers = [] } = props
  const { getStats } = useRoutineStats()
  const streak = getStats(routine.id)?.currentStreak ?? 0
  const assigneeIds = routine.assigned_to_all && routine.assigned_to_all.length > 0
    ? routine.assigned_to_all
    : (routine.assigned_to ? [routine.assigned_to] : [])
  const [editingSchedule, setEditingSchedule] = useState(false)

  return (
    <article className="bg-bg-elevated rounded-2xl p-5 max-w-md w-full">
      <PanelHeader
        title={routine.name}
        onTitleChange={(name) => props.onRename?.(name)}
        onClose={props.onClose}
      />
      <PanelMetaRow bucket={recurrenceSummary(routine)} />

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

        {/* Schedule (recurrence + time) — collapsed summary, expands to edit */}
        {props.onScheduleChange && (
          <div>
            {editingSchedule ? (
              <div className="rounded-xl border border-neutral-200 p-3">
                <RoutineScheduleEditor
                  size="sm"
                  recurrencePattern={routine.recurrence_pattern}
                  timeOfDay={(routine.time_of_day ?? '').slice(0, 5)}
                  onChange={({ recurrencePattern, timeOfDay }) =>
                    props.onScheduleChange?.(recurrencePattern, timeOfDay)
                  }
                />
                <button
                  onClick={() => setEditingSchedule(false)}
                  className="mt-3 text-xs font-medium text-neutral-500 hover:text-neutral-700"
                >
                  Done
                </button>
              </div>
            ) : (
              <button
                onClick={() => setEditingSchedule(true)}
                className="flex items-center justify-between w-full px-3 py-2 rounded-lg bg-neutral-100 text-sm text-neutral-700 hover:bg-neutral-200 transition-colors"
              >
                <span>{recurrenceSummary(routine)}</span>
                <span className="text-xs text-neutral-500">Edit schedule</span>
              </button>
            )}
          </div>
        )}
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
