// src/components/plan/TaskTimingMenu.tsx
//
// A task's timing control — its saved "when", stated, with the ways to change
// it and to take a day or a week away — for any surface that holds one task.
//
// This was TodayView's `dayTimingControl`, lifted out so the detail pane can
// draw the same control rather than a fourth vocabulary: the pane named no
// date at all (S2-26), and removing a day meant finding "Clear schedule" at
// the bottom of the Schedule popover (S2-27). Connected planning, requirement
// 2: consistent visible timing controls across rows and details, with the
// consequence of a removal stated before and confirmed after, with Undo.
import type { Task } from '@/types/task'
import { PlanWeekMenu } from './PlanWeekMenu'
import { showToast } from '@/hooks/useToast'
import { formatWeekRange } from '@/lib/dateHelpers'
import { taskTiming, hasTiming, broaderCommitment, removeDayOutcome, removeAllOutcome } from '@/lib/planning/taskTiming'
import { timingRemoval } from '@/lib/planning/planActions'
import type { useDayChoices } from '@/hooks/useDayChoices'

type DayChoices = ReturnType<typeof useDayChoices>

interface Props {
  task: Task
  /** The one writer. Resolving `false` means nothing was written (a refused
   *  write, a cancelled domain gate): no confirmation, no Undo. */
  onUpdateTask: (id: string, updates: Partial<Task>) => unknown
  /** Any day inside the period whose weeks the menu offers. */
  periodStart: Date
  /** The week a row with no week of its own would land in. */
  fallbackWeekStart: Date
  /** Day tiles, when the host counts them. */
  dayChoices?: DayChoices
  size?: 'sm' | 'md'
}

export function TaskTimingMenu({ task, onUpdateTask, periodStart, fallbackWeekStart, dayChoices, size = 'sm' }: Props) {
  const t = taskTiming(task)
  const broader = broaderCommitment(task)
  const removeTiming = (scope: 'day' | 'all') => {
    const { updates, previous } = timingRemoval(task, scope)
    const kept = scope === 'day' ? removeDayOutcome(t, broader?.label ?? null) : removeAllOutcome(t, broader?.label ?? null)
    const what = scope === 'day'
      ? `Removed ${t.day!.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} from “${task.title}”.`
      : `Removed ${t.day ? 'the day and the week' : 'the week'} from “${task.title}”.`
    void Promise.resolve(onUpdateTask(task.id, updates)).then((ok) => {
      if (ok === false) return
      showToast(`${what} ${kept}`, 'success', 8000, {
        label: 'Undo', onClick: () => { void onUpdateTask(task.id, previous) },
      })
    })
  }
  const week = t.week ?? fallbackWeekStart
  return (
    <PlanWeekMenu
      size={size}
      title={task.title}
      periodStart={periodStart}
      periodLabel={broader?.label ?? undefined}
      timing={t}
      currentWeekStart={t.week}
      // The days of the week this row would land in — its own when it has
      // one, otherwise the fallback. A week the tiles were not counted for
      // offers none rather than a partial set.
      dayChoices={dayChoices?.forWeek(week)}
      dayChoicesLabel={`A day in ${formatWeekRange(week)}`}
      onPickWeek={(weekStart) => { void onUpdateTask(task.id, { bucket: 'week', weekStart, scheduledFor: undefined }) }}
      onClearWeek={hasTiming(t) ? () => removeTiming('all') : undefined}
      onRemoveDay={t.day ? () => removeTiming('day') : undefined}
      onPickDay={(date) => { void onUpdateTask(task.id, { bucket: 'timed', scheduledFor: date, isAllDay: true }) }}
    />
  )
}
