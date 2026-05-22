import { useCallback } from 'react'
import { ChevronUp, ChevronDown, Plus, Check } from 'lucide-react'
import type { Task } from '@/types/task'
import type { GoalAction } from '@/types/goal'
import { selectWeeklyCandidates } from './weeklyPlanning'

interface Props {
  tasks: Task[]
  selectedIds: string[]
  onToggle: (task: Task) => void
  onReorder: (ids: string[]) => void
  goalActions?: GoalAction[]
  addedGoalActionIds?: string[]
  onAddGoalAction?: (action: GoalAction) => void
}

interface CandidateGroupProps {
  label: string
  items: Task[]
  selectedIds: string[]
  onToggle: (task: Task) => void
}

function CandidateGroup({ label, items, selectedIds, onToggle }: CandidateGroupProps) {
  return (
    <div>
      <h3 className="text-xs uppercase tracking-wider text-neutral-400 mb-2">{label}</h3>
      {items.length === 0 ? (
        <p className="text-sm text-neutral-400 pl-1">—</p>
      ) : (
        <ul className="space-y-1">
          {items.map(task => (
            <li key={task.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                id={`candidate-${task.id}`}
                checked={selectedIds.includes(task.id)}
                onChange={() => onToggle(task)}
                className="h-4 w-4 rounded border-neutral-300 text-primary-500 cursor-pointer"
              />
              <label
                htmlFor={`candidate-${task.id}`}
                className="text-sm text-neutral-700 cursor-pointer leading-snug"
              >
                {task.title}
              </label>
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
}: Props) {
  const candidates = selectWeeklyCandidates(tasks)

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

  const selectedTasks = selectedIds
    .map(id => tasks.find(t => t.id === id))
    .filter(Boolean) as Task[]

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
          />
        ))}

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

        {selectedTasks.length === 0 ? (
          <p className="text-sm text-neutral-400">
            Check tasks on the left to add them to your week.
          </p>
        ) : (
          <ol className="space-y-2">
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
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  )
}
