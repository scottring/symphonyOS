import { useCallback, useMemo } from 'react'
import { ChevronUp, ChevronDown, Plus, Check, Repeat, Trash2, CheckCircle2, Copy } from 'lucide-react'
import type { Task } from '@/types/task'
import type { GoalAction } from '@/types/goal'
import type { Routine } from '@/types/actionable'
import { selectWeeklyCandidates } from './weeklyPlanning'

interface Props {
  tasks: Task[]
  selectedIds: string[]
  onToggle: (task: Task) => void
  onReorder: (ids: string[]) => void
  goalActions?: GoalAction[]
  addedGoalActionIds?: string[]
  onAddGoalAction?: (action: GoalAction) => void
  /** Non-daily, untimed routines to offer for this week's plan. */
  routines?: Routine[]
  /** Ids of routines selected into this week's plan. */
  selectedRoutineIds?: string[]
  /** Toggle a routine into/out of this week's plan. */
  onToggleRoutine?: (routine: Routine) => void
  /** Mark a candidate task complete (removes it from the list). */
  onCompleteTask?: (taskId: string) => void
  /** Delete a candidate task outright. */
  onDeleteTask?: (taskId: string) => void
}

/** Normalize a title for duplicate detection: trimmed + lower-cased. */
function normalizeTitle(title: string): string {
  return title.trim().toLowerCase()
}

interface CandidateGroupProps {
  label: string
  items: Task[]
  selectedIds: string[]
  onToggle: (task: Task) => void
  isDuplicate: (task: Task) => boolean
  onCompleteTask?: (taskId: string) => void
  onDeleteTask?: (taskId: string) => void
}

function CandidateGroup({ label, items, selectedIds, onToggle, isDuplicate, onCompleteTask, onDeleteTask }: CandidateGroupProps) {
  return (
    <div>
      <h3 className="text-xs uppercase tracking-wider text-neutral-400 mb-2">{label}</h3>
      {items.length === 0 ? (
        <p className="text-sm text-neutral-400 pl-1">—</p>
      ) : (
        <ul className="space-y-1">
          {items.map(task => (
            <li key={task.id} className="group flex items-center gap-2">
              <input
                type="checkbox"
                id={`candidate-${task.id}`}
                checked={selectedIds.includes(task.id)}
                onChange={() => onToggle(task)}
                className="h-4 w-4 rounded border-neutral-300 text-primary-500 cursor-pointer shrink-0"
              />
              <label
                htmlFor={`candidate-${task.id}`}
                className="flex-1 text-sm text-neutral-700 cursor-pointer leading-snug"
              >
                {task.title}
              </label>
              {isDuplicate(task) && (
                <span
                  className="shrink-0 inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium bg-amber-50 text-amber-700"
                  title="Another open task has the same title — possible duplicate"
                >
                  <Copy className="h-2.5 w-2.5" />
                  duplicate?
                </span>
              )}
              {onCompleteTask && (
                <button
                  type="button"
                  onClick={() => onCompleteTask(task.id)}
                  aria-label={`Complete ${task.title}`}
                  title="Mark complete"
                  className="shrink-0 p-0.5 text-neutral-300 hover:text-primary-600 transition-colors"
                >
                  <CheckCircle2 className="h-4 w-4" />
                </button>
              )}
              {onDeleteTask && (
                <button
                  type="button"
                  onClick={() => onDeleteTask(task.id)}
                  aria-label={`Delete ${task.title}`}
                  title="Delete task"
                  className="shrink-0 p-0.5 text-neutral-300 hover:text-red-600 transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function StepBuildTodos({
  tasks,
  selectedIds,
  onToggle,
  onReorder,
  goalActions = [],
  addedGoalActionIds = [],
  onAddGoalAction,
  routines = [],
  selectedRoutineIds = [],
  onToggleRoutine,
  onCompleteTask,
  onDeleteTask,
}: Props) {
  const candidates = selectWeeklyCandidates(tasks)

  // Titles that appear on more than one open task — used to flag likely
  // duplicates (e.g. a carryover task that also exists as a scheduled one).
  const duplicateTitles = useMemo(() => {
    const counts = new Map<string, number>()
    for (const t of tasks) {
      if (t.completed) continue
      const key = normalizeTitle(t.title)
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    return new Set([...counts.entries()].filter(([, n]) => n > 1).map(([k]) => k))
  }, [tasks])

  const isDuplicate = useCallback(
    (task: Task) => duplicateTitles.has(normalizeTitle(task.title)),
    [duplicateTitles],
  )

  const moveUp = useCallback(
    (index: number) => {
      if (index === 0) return
      const next = [...selectedIds]
      ;[next[index - 1], next[index]] = [next[index], next[index - 1]]
      onReorder(next)
    },
    [selectedIds, onReorder],
  )

  const moveDown = useCallback(
    (index: number) => {
      if (index === selectedIds.length - 1) return
      const next = [...selectedIds]
      ;[next[index], next[index + 1]] = [next[index + 1], next[index]]
      onReorder(next)
    },
    [selectedIds, onReorder],
  )

  const handleAddGoalAction = useCallback(
    (action: GoalAction) => {
      onAddGoalAction?.(action)
    },
    [onAddGoalAction],
  )

  // Exclude completed/deleted tasks so completing one from the priority list
  // (or anywhere) drops it out cleanly.
  const selectedTasks = selectedIds
    .map(id => tasks.find(t => t.id === id))
    .filter((t): t is Task => Boolean(t) && !t!.completed)

  const selectedRoutines = routines.filter(r => selectedRoutineIds.includes(r.id))

  const groups: [string, Task[]][] = [
    ['Inbox', candidates.inbox],
    ['Carry-over', candidates.carryover],
    ['This month', candidates.month],
    ['Someday', candidates.someday],
  ]

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-full">
      {/* LEFT — Candidates */}
      <div className="space-y-6 overflow-y-auto">
        <h2 className="font-display text-lg text-neutral-800">Candidates</h2>

        {groups.map(([label, items]) => (
          <CandidateGroup
            key={label}
            label={label}
            items={items}
            selectedIds={selectedIds}
            onToggle={onToggle}
            isDuplicate={isDuplicate}
            onCompleteTask={onCompleteTask}
            onDeleteTask={onDeleteTask}
          />
        ))}

        {routines.length > 0 && onToggleRoutine && (
          <div>
            <h3 className="text-xs uppercase tracking-wider text-neutral-400 mb-2">
              Routines this week
            </h3>
            <ul className="space-y-1">
              {routines.map(routine => (
                <li key={routine.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id={`candidate-routine-${routine.id}`}
                    checked={selectedRoutineIds.includes(routine.id)}
                    onChange={() => onToggleRoutine(routine)}
                    className="h-4 w-4 rounded border-neutral-300 text-primary-500 cursor-pointer"
                  />
                  <label
                    htmlFor={`candidate-routine-${routine.id}`}
                    className="text-sm text-neutral-700 cursor-pointer leading-snug"
                  >
                    {routine.name}
                  </label>
                </li>
              ))}
            </ul>
          </div>
        )}

        {goalActions.length > 0 && (
          <div>
            <h3 className="text-xs uppercase tracking-wider text-neutral-400 mb-2">
              Goal actions (this quarter)
            </h3>
            <ul className="space-y-2">
              {goalActions.map(action => {
                const isAdded = addedGoalActionIds.includes(action.id)
                return (
                  <li key={action.id} className="flex items-start gap-2">
                    <span className="flex-1 text-sm text-neutral-700 leading-snug pt-0.5">
                      {action.description}
                    </span>
                    <button
                      onClick={() => handleAddGoalAction(action)}
                      disabled={isAdded}
                      className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium shrink-0 transition-colors ${
                        isAdded
                          ? 'bg-neutral-100 text-neutral-400 cursor-not-allowed'
                          : 'bg-primary-50 text-primary-700 hover:bg-primary-100'
                      }`}
                    >
                      {isAdded ? (
                        <>
                          <Check className="h-3 w-3" />
                          Added
                        </>
                      ) : (
                        <>
                          <Plus className="h-3 w-3" />
                          Add as task
                        </>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </div>

      {/* RIGHT — Priority order */}
      <div className="space-y-4 overflow-y-auto">
        <h2 className="font-display text-lg text-neutral-800">This week — priority order</h2>

        {selectedTasks.length === 0 && selectedRoutines.length === 0 && (
          <p className="text-sm text-neutral-400">
            Check tasks or routines on the left to add them to your week.
          </p>
        )}

        {selectedTasks.length > 0 && (
          <ol data-testid="priority-order" className="space-y-2">
            {selectedTasks.map((task, index) => (
              <li
                key={task.id}
                className="flex items-center gap-2 bg-bg-elevated rounded-lg px-3 py-2 shadow-sm"
              >
                <span className="text-xs text-neutral-400 w-5 shrink-0 text-right">
                  {index + 1}
                </span>
                <span className="flex-1 text-sm text-neutral-700 leading-snug">{task.title}</span>
                <div className="flex flex-col shrink-0">
                  <button
                    onClick={() => moveUp(index)}
                    disabled={index === 0}
                    aria-label="Move up"
                    className="p-0.5 text-neutral-400 hover:text-neutral-700 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ChevronUp className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => moveDown(index)}
                    disabled={index === selectedTasks.length - 1}
                    aria-label="Move down"
                    className="p-0.5 text-neutral-400 hover:text-neutral-700 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </button>
                </div>
                {onCompleteTask && (
                  <button
                    type="button"
                    onClick={() => onCompleteTask(task.id)}
                    aria-label={`Complete ${task.title}`}
                    title="Mark complete"
                    className="shrink-0 p-0.5 text-neutral-300 hover:text-primary-600 transition-colors"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                  </button>
                )}
                {onDeleteTask && (
                  <button
                    type="button"
                    onClick={() => onDeleteTask(task.id)}
                    aria-label={`Delete ${task.title}`}
                    title="Delete task"
                    className="shrink-0 p-0.5 text-neutral-300 hover:text-red-600 transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </li>
            ))}
          </ol>
        )}

        {selectedRoutines.length > 0 && (
          <div>
            <h3 className="text-xs uppercase tracking-wider text-neutral-400 mb-2">Routines</h3>
            <ul data-testid="priority-routines" className="space-y-2">
              {selectedRoutines.map(routine => (
                <li
                  key={routine.id}
                  className="flex items-center gap-2 bg-bg-elevated rounded-lg px-3 py-2 shadow-sm"
                >
                  <Repeat className="h-3.5 w-3.5 text-neutral-400 shrink-0" />
                  <span className="flex-1 text-sm text-neutral-700 leading-snug">{routine.name}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
